'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { getServerClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { requireAreaAction } from '@/lib/auth/sessao'
import { getDetalhe, getEmailsEnvolvidos } from '@/lib/solicitacoes/rpc'
import { enviarNotificacaoSolicitacao, type MovimentacaoEmail } from '@/lib/email'
import type { Solicitacao } from '@/lib/solicitacoes/schemas'

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

/**
 * v4.25.0 — Notifica por e-mail os ENVOLVIDOS (autor + destinatário/membros da role)
 * após uma movimentação. FALLBACK-SAFE: NUNCA lança nem bloqueia a movimentação — RPC
 * de fan-out ou SMTP indisponível/erro são silenciosamente ignorados (o e-mail é camada
 * ADICIONAL). Chamada SÓ APÓS a movimentação já ter sido persistida (RPC sem erro).
 */
async function notificarMovimentacao(id: number, movimentacao: MovimentacaoEmail, justificativa?: string | null): Promise<void> {
  try {
    const ctx = await getEmailsEnvolvidos(id)
    if (!ctx || ctx.envolvidos_emails.length === 0) return
    await enviarNotificacaoSolicitacao({
      paras:           ctx.envolvidos_emails,
      movimentacao,
      titulo:          `${ctx.tipo_nome ?? 'Solicitação'} #${id}`,
      atribuidoTipo:   ctx.atribuido_tipo,
      atribuidoRotulo: ctx.atribuido_rotulo ?? '—',
      autorRotulo:     ctx.autor_email ?? '—',
      justificativa,
    })
  } catch { /* e-mail é camada ADICIONAL: jamais quebra a movimentação */ }
}

/** v4.20.0 — detalhe de uma solicitação p/ a página de auditoria de Movimentações (gestão-only):
 *  a linha clicável busca o objeto completo (rpc.ts é server-only) e abre o DrawerSolicitacao
 *  reaproveitável. Gate de superfície = área 'solicitacoes' (a página é gestão-only); o
 *  solic_detalhe ainda refina por pode_ver_solic (gestor vê qualquer; não-participante → null). */
export async function detalheSolicitacao(id: number): Promise<Solicitacao | null> {
  await requireAreaAction('solicitacoes')
  return getDetalhe(id)
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
  const id = (data as { id: number }).id

  // M17 (v4.17.0): promove os anexos de tmp/<uuid>/<arq> → sol/<id>/<uuid>/<arq>.
  // Move o objeto (service role) e atualiza o storage_path no banco para os movidos com
  // sucesso. Best-effort: anexo que falhar o move permanece em tmp/ (ainda funcional);
  // tmp/ passa a conter só órfãos. Não bloqueia o sucesso da criação.
  const tmpAnexos = input.anexos.filter(a => a.storage_path.startsWith('tmp/'))
  if (tmpAnexos.length) {
    const storage = getAdminClient().storage.from(BUCKET)
    const movidos: { de: string; para: string }[] = []
    for (const a of tmpAnexos) {
      const para = `sol/${id}/${a.storage_path.slice('tmp/'.length)}`
      try {
        const { error: mvErr } = await storage.move(a.storage_path, para)
        if (!mvErr) movidos.push({ de: a.storage_path, para })
      } catch { /* mantém em tmp/ */ }
    }
    if (movidos.length) {
      try { await rpcSessao('solic_promover_anexos', { p_solicitacao_id: id, p_de_para: movidos }) } catch { /* best-effort */ }
    }
  }

  await notificarMovimentacao(id, 'criada')
  revalidatePath('/solicitacoes')
  return { ok: true, id }
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
  await notificarMovimentacao(id, 'concluida')
  revalidatePath('/solicitacoes'); return { ok: true }
}

export async function rejeitarSolicitacao(id: number, justificativa: string): Promise<{ ok: boolean; erro?: string }> {
  await requireAreaAction(null)
  const { error } = await rpcSessao('solic_rejeitar', { p_id: id, p_justificativa: justificativa })
  if (error) return { ok: false, erro: traduzir(error.message) }
  await notificarMovimentacao(id, 'rejeitada', justificativa)
  revalidatePath('/solicitacoes'); return { ok: true }
}

export async function cancelarSolicitacao(id: number): Promise<{ ok: boolean; erro?: string }> {
  await requireAreaAction(null)
  const { error } = await rpcSessao('solic_cancelar', { p_id: id })
  if (error) return { ok: false, erro: traduzir(error.message) }
  await notificarMovimentacao(id, 'cancelada')
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
