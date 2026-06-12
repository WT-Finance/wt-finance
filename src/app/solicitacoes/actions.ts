'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { getServerClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { requireAreaAction } from '@/lib/auth/sessao'

// Escrita do módulo de Solicitações. Transições/criação via cliente de SESSÃO
// (o banco enforça quem pode — §2.2/§2.3). Storage (anexos) via service role (ADR-0113).
// Guard de superfície: requireAreaAction(null) = qualquer autenticado (a RPC refina).

type BoundRpc = (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>
const BUCKET = 'solicitacoes-anexos'
const MIME_OK = new Set([
  'application/pdf', 'image/png', 'image/jpeg', 'image/webp',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv',
])
const MAX_BYTES = 10 * 1024 * 1024

async function rpcSessao(fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }> {
  const sb = await getServerClient()
  return (sb.rpc as unknown as BoundRpc).bind(sb)(fn, args)
}

export interface AnexoMeta { campo_id: number | null; storage_path: string; nome_arquivo: string; mime: string; tamanho_bytes: number }

export async function criarSolicitacao(input: {
  tipo_id: number
  destinatario_user_id: string | null
  destinatario_role_id: number | null
  data_limite: string
  descricao: string
  respostas: Record<string, string>
  anexos: AnexoMeta[]
}): Promise<{ ok: true; id: number } | { ok: false; erro: string }> {
  await requireAreaAction(null)
  const { data, error } = await rpcSessao('criar_solicitacao', {
    p_tipo_id: input.tipo_id,
    p_destinatario_user_id: input.destinatario_user_id,
    p_destinatario_role_id: input.destinatario_role_id,
    p_data_limite: input.data_limite,
    p_descricao: input.descricao,
    p_respostas: input.respostas,
    p_anexos: input.anexos,
  })
  if (error) {
    // Limpa anexos órfãos (já subiram ao storage antes da RPC falhar).
    if (input.anexos.length) {
      try { await getAdminClient().storage.from(BUCKET).remove(input.anexos.map(a => a.storage_path)) } catch { /* best-effort */ }
    }
    return { ok: false, erro: traduzir(error.message) }
  }
  revalidatePath('/solicitacoes')
  return { ok: true, id: (data as { id: number }).id }
}

// Upload de um anexo (validação server-side + service role). Retorna metadados p/ criar.
export async function uploadAnexo(formData: FormData): Promise<{ ok: true; anexo: AnexoMeta } | { ok: false; erro: string }> {
  await requireAreaAction(null)
  const file = formData.get('file')
  const campoIdRaw = formData.get('campo_id')
  if (!(file instanceof File)) return { ok: false, erro: 'Arquivo ausente.' }
  if (!MIME_OK.has(file.type)) return { ok: false, erro: `Tipo não permitido: ${file.type || 'desconhecido'}. Aceitos: PDF, imagem, planilha.` }
  if (file.size > MAX_BYTES) return { ok: false, erro: 'Arquivo acima de 10 MB.' }

  const path = `tmp/${randomUUID()}/${file.name}`
  const buffer = Buffer.from(await file.arrayBuffer())
  const { error } = await getAdminClient().storage.from(BUCKET).upload(path, buffer, { contentType: file.type, upsert: false })
  if (error) return { ok: false, erro: `Falha no upload: ${error.message}` }
  return { ok: true, anexo: {
    campo_id: campoIdRaw ? Number(campoIdRaw) : null,
    storage_path: path, nome_arquivo: file.name, mime: file.type, tamanho_bytes: file.size,
  } }
}

// Signed URL de download (checa visibilidade na RPC; gera URL com service role).
export async function anexoUrl(anexoId: number): Promise<{ ok: true; url: string } | { ok: false; erro: string }> {
  await requireAreaAction(null)
  const { data, error } = await rpcSessao('solic_anexo_path', { p_anexo_id: anexoId })
  if (error) return { ok: false, erro: traduzir(error.message) }
  const path = (data as { storage_path: string }).storage_path
  const { data: signed, error: sErr } = await getAdminClient().storage.from(BUCKET).createSignedUrl(path, 60)
  if (sErr || !signed) return { ok: false, erro: 'Não foi possível gerar o link do anexo.' }
  return { ok: true, url: signed.signedUrl }
}

export async function concluirSolicitacao(id: number): Promise<{ ok: boolean; erro?: string }> {
  await requireAreaAction(null)
  const { error } = await rpcSessao('solic_concluir', { p_id: id })
  if (error) return { ok: false, erro: traduzir(error.message) }
  revalidatePath('/solicitacoes'); return { ok: true }
}

export async function rejeitarSolicitacao(id: number, justificativa: string): Promise<{ ok: boolean; erro?: string }> {
  await requireAreaAction(null)
  const { error } = await rpcSessao('solic_rejeitar', { p_id: id, p_justificativa: justificativa })
  if (error) return { ok: false, erro: traduzir(error.message) }
  revalidatePath('/solicitacoes'); return { ok: true }
}

export async function cancelarSolicitacao(id: number): Promise<{ ok: boolean; erro?: string }> {
  await requireAreaAction(null)
  const { error } = await rpcSessao('solic_cancelar', { p_id: id })
  if (error) return { ok: false, erro: traduzir(error.message) }
  revalidatePath('/solicitacoes'); return { ok: true }
}

// Mensagens do banco (PREFIXO:detalhe) → texto ao usuário.
function traduzir(msg: string): string {
  const m: Record<string, string> = {
    CAMPO_OBRIGATORIO: 'Preencha todos os campos obrigatórios.',
    VALOR_INVALIDO: 'Há um valor inválido em um dos campos.',
    DESTINATARIO_XOR: 'Escolha exatamente um destinatário (usuário OU permissão).',
    DESTINATARIO_INVALIDO: 'Destinatário inválido ou inativo.',
    DATA_LIMITE_OBRIGATORIA: 'Informe a data-limite.',
    TIPO_INVALIDO: 'Tipo de solicitação indisponível.',
    TRANSICAO_ILEGAL: 'Esta solicitação não está mais aberta.',
    PERMISSAO_NEGADA: 'Você não tem permissão para esta ação.',
    JUSTIFICATIVA_OBRIGATORIA: 'A justificativa é obrigatória para rejeitar.',
    NAO_ENCONTRADA: 'Solicitação não encontrada.',
    AUTH_NECESSARIA: 'Sessão necessária.',
  }
  const prefixo = (msg.split(':')[0] ?? '').trim()
  return m[prefixo] ?? msg.replace(/^[A-Z_]+:\s*/, '')
}
