'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { getServerClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { requireAreaAction } from '@/lib/auth/sessao'
import { sanitizarNomeArquivo } from '@/lib/storage/nome-arquivo'
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
 * de fan-out ou SMTP indisponível/erro NÃO derrubam a movimentação (o e-mail é camada
 * ADICIONAL). Chamada SÓ APÓS a movimentação já ter sido persistida (RPC sem erro).
 * v5.3.4: a falha é LOGADA (o catch era mudo — uma falha aqui ficava invisível, inclusive
 * a da RPC de destinatários; foi o que atrasou o diagnóstico do e-mail intermitente).
 */
async function notificarMovimentacao(id: number, movimentacao: MovimentacaoEmail, justificativa?: string | null): Promise<void> {
  try {
    const ctx = await getEmailsEnvolvidos(id)
    if (!ctx) {
      console.error(`[solicitacoes] notificação #${id} (${movimentacao}): sem contexto de envolvidos (RPC falhou ou sem acesso) — e-mail não enviado.`)
      return
    }
    if (ctx.envolvidos_emails.length === 0) {
      console.error(`[solicitacoes] notificação #${id} (${movimentacao}): nenhum envolvido com e-mail — nada enviado.`)
      return
    }
    // 'criada' usa o criado_em; concluir/rejeitar/cancelar usam o decidido_em (quando agiu).
    const quando = movimentacao === 'criada' ? ctx.criado_em_fmt : ctx.decidido_em_fmt
    // Falha parcial é logada pela CAMADA (o rótulo lá inclui "Tipo #id") — não repetir aqui.
    await enviarNotificacaoSolicitacao({
      paras:           ctx.envolvidos_emails,
      movimentacao,
      titulo:          `${ctx.tipo_nome ?? 'Solicitação'} #${id}`,
      atribuidoRotulo: ctx.atribuido_rotulo ?? '—',
      autorRotulo:     ctx.autor_rotulo ?? '—',
      quando,
      justificativa,
    })
  } catch (err) {
    // E-mail é camada ADICIONAL: jamais quebra a movimentação — mas nunca em silêncio.
    console.error(`[solicitacoes] notificação #${id} (${movimentacao}) falhou:`, err)
  }
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

  // v5.4.3 — a chave do objeto usa o nome SANITIZADO. O Storage valida a chave com um
  // regex cujo `\w` é ASCII puro, então um acento no nome ("Nota Fiscal - Bruna e
  // João.pdf") derrubava o upload com `400 InvalidKey` — determinístico por nome, o que
  // fazia parecer intermitência (dois anexos sem acento subiam, o terceiro não). O nome
  // ORIGINAL continua indo em `nome_arquivo`, que é o que a UI exibe.
  // v5.9.0 — na ABERTURA o id ainda não existe, então o objeto nasce em tmp/ e é promovido
  // depois (M17). No anexo PÓS-criação o id já é conhecido: grava direto no destino final e
  // dispensa a promoção. Um id forjado aqui não vaza nada — `solic_anexar` recusa quem não
  // pode, esta action apaga o objeto, e o download só alcança anexo REGISTRADO (solic_anexo_path).
  const solIdRaw = Number(formData.get('solicitacao_id'))
  const solId = Number.isInteger(solIdRaw) && solIdRaw > 0 ? solIdRaw : null
  const path = `${solId ? `sol/${solId}` : 'tmp'}/${randomUUID()}/${sanitizarNomeArquivo(file.name)}`
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

/**
 * v5.9.0 — APROVA (etapa intermediária opcional). Só o atendente; a RPC enforça.
 * Não encerra nada: a solicitação segue viva, aguardando execução.
 */
export async function aprovarSolicitacao(id: number): Promise<{ ok: boolean; erro?: string }> {
  await requireAreaAction(null)
  const { error } = await rpcSessao('solic_aprovar', { p_id: id })
  if (error) return { ok: false, erro: traduzir(error.message) }
  await notificarMovimentacao(id, 'aprovada')
  revalidatePath('/solicitacoes'); return { ok: true }
}

/**
 * v5.9.0 — anexa arquivos a uma solicitação JÁ EXISTENTE e ainda em andamento.
 * Os dois lados anexam (o solicitante complementa; o atendente devolve o comprovante do
 * pagamento efetuado) — a RPC `solic_anexar` é quem enforça permissão, estado e campo.
 *
 * Diferente da criação, aqui o id da solicitação JÁ é conhecido no momento do upload —
 * então o objeto vai direto para `sol/<id>/<uuid>/<arq>` e não existe a dança
 * tmp/ → move → `solic_promover_anexos` (que, além do mais, é solicitante-only e não
 * serviria ao atendente).
 */
export async function anexarEmSolicitacao(id: number, anexos: AnexoMeta[]): Promise<{ ok: boolean; erro?: string }> {
  await requireAreaAction(null)
  if (!anexos.length) return { ok: false, erro: 'Nenhum arquivo para anexar.' }
  const { error } = await rpcSessao('solic_anexar', { p_id: id, p_anexos: anexos })
  if (error) {
    // Os binários já subiram; sem o metadado eles seriam órfãos invisíveis no bucket.
    try { await getAdminClient().storage.from(BUCKET).remove(anexos.map(a => a.storage_path)) } catch { /* best-effort */ }
    return { ok: false, erro: traduzir(error.message) }
  }
  revalidatePath('/solicitacoes'); return { ok: true }
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
    // v5.9.0: 'aberta' deixou de ser o único estado em que se pode agir — a mensagem
    // antiga ("não está mais aberta") passaria a mentir para quem age numa aprovada.
    TRANSICAO_ILEGAL: 'Esta solicitação já foi encerrada.',
    PERMISSAO_NEGADA: 'Você não tem permissão para esta ação.',
    JUSTIFICATIVA_OBRIGATORIA: 'A justificativa é obrigatória para rejeitar.',
    NAO_ENCONTRADA: 'Solicitação não encontrada.',
    AUTH_NECESSARIA: 'Sessão necessária.',
    // v5.9.0 — anexo pós-criação (solic_anexar).
    ANEXO_AUSENTE: 'Nenhum arquivo para anexar.',
    ANEXO_INVALIDO: 'Arquivo inválido.',
    CAMPO_ANEXO_OBRIGATORIO: 'Escolha em qual campo de anexo o arquivo entra.',
    CAMPO_INVALIDO: 'Este tipo de solicitação não tem esse campo de anexo.',
  }
  const prefixo = (msg.split(':')[0] ?? '').trim()
  if (m[prefixo]) return m[prefixo]

  // Rede de segurança da v5.9.0: a etapa "Aprovada" depende de uma migration DESTRUTIVA
  // (0259) que relaxa `solicitacao_status_check` e só um humano aplica, em TTY. Se este
  // código chegar a produção antes dela, o primeiro "Aprovar" volta como violação de CHECK
  // — e sem esta entrada o usuário veria o texto cru do Postgres. Não conserta a ordem
  // errada; só troca um erro ininteligível por um acionável.
  if (/violates check constraint|solicitacao_status_check/i.test(msg)) {
    return 'Aprovação indisponível: a atualização de banco desta função ainda não foi aplicada. Avise o administrador.'
  }
  return msg.replace(/^[A-Z_]+:\s*/, '')
}
