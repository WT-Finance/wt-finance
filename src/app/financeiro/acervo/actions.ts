'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { getServerClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { requireAreaAction } from '@/lib/auth/sessao'
import { acervoDocSchema, acervoListaSchema, type AcervoDocumento } from '@/lib/schemas-rpc'

// Acervo de Documentos (v4.34.0, migration 0165). Leitura liberada por QUALQUER uma
// das duas áreas ('financeiro/acervo' | 'financeiro/acervo/gestao' — gestão INCLUI a
// visão); upload SÓ pela área de gestão. Binário no Storage (bucket privado
// 'acervo-documentos', deny-by-default); metadados via RPC SECURITY DEFINER. Upload
// e signed URL via service role (mesmo padrão de src/app/solicitacoes/actions.ts,
// ADR-0113); metadados (RPC de leitura/escrita) via cliente de SESSÃO para que
// exigir_acesso veja o JWT do usuário real.

type BoundRpc = (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>
const BUCKET = 'acervo-documentos'
const MAX_BYTES = 25 * 1024 * 1024 // 25 MiB — mesmo limite do bucket (migration 0165)

// Faixa Unicode dos diacríticos combinantes (U+0300–U+036F), construída via
// String.fromCharCode para nunca depender de caracteres literais no código-fonte.
const DIACRITICOS = new RegExp(`[${String.fromCharCode(0x0300)}-${String.fromCharCode(0x036f)}]`, 'g')

async function rpcSessao(fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }> {
  const sb = await getServerClient()
  return (sb.rpc as unknown as BoundRpc).bind(sb)(fn, args)
}

// Mensagens do banco (PREFIXO:detalhe) → texto ao usuário.
function traduzir(msg: string): string {
  const m: Record<string, string> = {
    TITULO_OBRIGATORIO: 'Informe um título.',
    DESCRICAO_OBRIGATORIA: 'Informe uma descrição.',
    NAO_ENCONTRADO: 'Documento não encontrado.',
    PERMISSAO_NEGADA: 'Você não tem permissão para esta ação.',
    AUTH_NECESSARIA: 'Sessão necessária.',
  }
  const prefixo = (msg.split(':')[0] ?? '').trim()
  return m[prefixo] ?? msg.replace(/^[A-Z_]+:\s*/, '')
}

/**
 * Sanitiza o nome do arquivo para um path seguro no Storage: remove acentos
 * (via NFD + faixa Unicode dos diacríticos combinantes U+0300–U+036F), troca
 * qualquer caractere fora de [a-zA-Z0-9._-] por '_' e limita o comprimento.
 * Diferente de Solicitações (bucket restrito a poucos MIME, usa o nome cru) — aqui
 * o bucket aceita QUALQUER tipo de arquivo, então endurecemos o nome do OBJETO no
 * Storage (o nome ORIGINAL é preservado à parte, como metadado `nome_arquivo`).
 */
function sanitizarNomeArquivo(nome: string): string {
  const limpo = nome
    .normalize('NFD').replace(DIACRITICOS, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 100)
  return limpo || 'arquivo'
}

/** Lista a biblioteca (metadados; nunca storage_path/criado_por). */
export async function listarDocumentos(): Promise<{ ok: true; documentos: AcervoDocumento[] } | { ok: false; erro: string }> {
  await requireAreaAction(['financeiro/acervo', 'financeiro/acervo/gestao'])
  const { data, error } = await rpcSessao('acervo_listar', {})
  if (error) return { ok: false, erro: traduzir(error.message) }
  const parsed = acervoListaSchema.safeParse(data)
  if (!parsed.success) return { ok: false, erro: 'Não foi possível carregar o acervo (formato inesperado).' }
  return { ok: true, documentos: parsed.data }
}

/** Adiciona um documento novo: valida, sobe o binário (service role) e persiste os
 *  metadados via RPC de sessão. Falha na RPC após o upload → cleanup best-effort. */
export async function uploadDocumento(formData: FormData): Promise<{ ok: true; documento: AcervoDocumento } | { ok: false; erro: string }> {
  await requireAreaAction('financeiro/acervo/gestao')

  const file = formData.get('file')
  const titulo = String(formData.get('titulo') ?? '').trim()
  const descricao = String(formData.get('descricao') ?? '').trim()

  if (!(file instanceof File)) return { ok: false, erro: 'Arquivo ausente.' }
  if (file.size > MAX_BYTES) return { ok: false, erro: 'Arquivo acima de 25 MB.' }
  if (!titulo) return { ok: false, erro: 'Informe um título.' }
  if (!descricao) return { ok: false, erro: 'Informe uma descrição.' }

  const nomeSanitizado = sanitizarNomeArquivo(file.name)
  const path = `docs/${randomUUID()}/${nomeSanitizado}`
  const contentType = file.type || 'application/octet-stream'
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: erroUpload } = await getAdminClient().storage.from(BUCKET)
    .upload(path, buffer, { contentType, upsert: false })
  if (erroUpload) return { ok: false, erro: `Falha no upload: ${erroUpload.message}` }

  let data: unknown
  try {
    const resultado = await rpcSessao('acervo_criar', {
      p_titulo: titulo,
      p_descricao: descricao,
      p_nome_arquivo: file.name,
      p_mime: contentType,
      p_tamanho_bytes: file.size,
      p_storage_path: path,
    })
    if (resultado.error) {
      try { await getAdminClient().storage.from(BUCKET).remove([path]) } catch { /* best-effort */ }
      return { ok: false, erro: traduzir(resultado.error.message) }
    }
    data = resultado.data
  } catch {
    // A chamada da RPC LANÇOU (timeout/erro de rede do SDK) em vez de resolver com
    // { error } — sem isso, o binário ficaria órfão no bucket sem nenhum registro.
    try { await getAdminClient().storage.from(BUCKET).remove([path]) } catch { /* best-effort */ }
    return { ok: false, erro: 'Falha ao salvar o documento. Tente novamente.' }
  }

  const parsed = acervoDocSchema.safeParse(data)
  if (!parsed.success) {
    // A RPC JÁ persistiu o registro e o binário está no Storage — o documento é válido;
    // só o retorno veio em formato inesperado. NÃO remover nada aqui (apagar o binário
    // deixaria uma linha órfã no banco, pior). A recarga da página lista o documento.
    revalidatePath('/financeiro/acervo')
    return { ok: false, erro: 'Documento salvo, mas houve um erro ao confirmar — recarregue a página.' }
  }

  revalidatePath('/financeiro/acervo')
  return { ok: true, documento: parsed.data }
}

/** Signed URL de download (60s), com o nome ORIGINAL do arquivo no header de download. */
export async function documentoUrl(docId: number): Promise<{ ok: true; url: string } | { ok: false; erro: string }> {
  await requireAreaAction(['financeiro/acervo', 'financeiro/acervo/gestao'])
  const { data, error } = await rpcSessao('acervo_doc_path', { p_doc_id: docId })
  if (error) return { ok: false, erro: traduzir(error.message) }

  const resultado = data as { storage_path?: string; nome_arquivo?: string } | null
  const storagePath = resultado?.storage_path
  const nomeArquivo = resultado?.nome_arquivo
  if (!storagePath) return { ok: false, erro: 'Documento não encontrado.' }

  const { data: signed, error: erroSigned } = await getAdminClient().storage.from(BUCKET)
    .createSignedUrl(storagePath, 60, { download: nomeArquivo ?? true })
  if (erroSigned || !signed) return { ok: false, erro: 'Não foi possível gerar o link do documento.' }
  return { ok: true, url: signed.signedUrl }
}
