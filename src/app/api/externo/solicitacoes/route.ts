// API externa de Solicitações (v5.4.0/M3b) — POST /api/externo/solicitacoes
//
// Cria uma Solicitação em nome da chave de API (header x-api-key). SEM anexos, SEM
// estados além dos já existentes (aberta/concluida/rejeitada/cancelada — a conclusão
// segue sendo feita pela UI/atendente), SEM vocabulário de integrador específico.
// Idempotente por (chave, chave_idempotencia): reenviar o mesmo par devolve o MESMO
// id (idempotente:true, HTTP 200) em vez de duplicar (HTTP 201 na 1ª vez).
export const runtime = 'nodejs'

import { z } from 'zod'
import {
  autenticarChamada, lerBodyLimitado, chamarRpcExterna, respostaErro, traduzirErroRpc, registrarChamada,
} from '@/lib/api-externa/http'
import { getEmailsEnvolvidos } from '@/lib/solicitacoes/rpc'
import { enviarNotificacaoSolicitacao } from '@/lib/email'

const ROTA = '/api/externo/solicitacoes'

// Valor de campo aceita string OU number (planilha/JSON de integrador pode mandar
// número cru) — sempre coagido a STRING antes de ir para o banco (a RPC valida o
// formato por tipo_campo: moeda/data/selecao). Mesmo espírito de @/lib/carga/coercao,
// mas aqui é achatamento de shape de payload HTTP, não parsing numérico — não há
// ambiguidade de separador de milhar/decimal a resolver.
const valorCampo = z.union([z.string(), z.number()]).transform(v => (typeof v === 'number' ? String(v) : v))

const bodySchema = z.object({
  tipo:               z.string().min(1, 'tipo é obrigatório'),
  chave_idempotencia: z.string().min(1, 'chave_idempotencia é obrigatória'),
  destinatario:       z.union([z.string(), z.number()]).transform(v => String(v)),
  titulo:             z.string().optional(),
  campos:             z.record(z.string(), valorCampo).optional(),
  data_limite:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'data_limite deve estar no formato AAAA-MM-DD'),
  referencia_origem:  z.string().optional(),
})

interface ResultadoCriacao {
  ok:          true
  id:          number
  status:      string
  destinatario: { id: number; nome: string }
  idempotente: boolean
}

/**
 * Notifica os envolvidos por e-mail (mesmo padrão de src/app/solicitacoes/actions.ts).
 * BEST-EFFORT: jamais afeta a resposta ao integrador.
 *
 * LIMITAÇÃO CONHECIDA (reportada no out-briefing): `solic_emails_envolvidos` exige
 * `app.pode_ver_solic()` (área 'solicitacoes' OU uid_jwt() batendo solicitante/
 * destinatário) — esta rota não tem sessão de usuário (autentica por chave de API,
 * não por JWT Supabase), então `getServerClient()` corre como `anon`/sem claims e a
 * RPC nega antes de devolver os e-mails. O catch abaixo absorve isso silenciosamente
 * (como o design pede), mas na prática a notificação por e-mail de uma solicitação
 * criada via API externa NÃO dispara hoje — precisaria de uma variante de
 * `solic_emails_envolvidos` tolerante a `service_role` (fora do escopo desta missão,
 * que não altera migrations).
 */
async function notificarCriacao(id: number): Promise<void> {
  try {
    const ctx = await getEmailsEnvolvidos(id)
    if (!ctx || ctx.envolvidos_emails.length === 0) return
    await enviarNotificacaoSolicitacao({
      paras:           ctx.envolvidos_emails,
      movimentacao:    'criada',
      titulo:          `${ctx.tipo_nome ?? 'Solicitação'} #${id}`,
      atribuidoRotulo: ctx.atribuido_rotulo ?? '—',
      autorRotulo:     ctx.autor_rotulo ?? '—',
      quando:          ctx.criado_em_fmt,
    })
  } catch { /* e-mail é camada ADICIONAL: jamais quebra a resposta ao integrador */ }
}

export async function POST(req: Request): Promise<Response> {
  const auth = await autenticarChamada(req)
  if (!auth.ok) {
    await registrarChamada(null, ROTA, auth.resposta.status, 'auth_negada')
    return auth.resposta
  }
  const { chave } = auth

  const lido = await lerBodyLimitado(req)
  if (!lido.ok) {
    await registrarChamada(chave.id, ROTA, lido.resposta.status, 'body_invalido')
    return lido.resposta
  }

  const parsed = bodySchema.safeParse(lido.body)
  if (!parsed.success) {
    const detalhe = parsed.error.issues[0]?.message ?? 'payload inválido'
    const resposta = respostaErro('PAYLOAD_INVALIDO', detalhe, 422)
    await registrarChamada(chave.id, ROTA, 422, detalhe)
    return resposta
  }
  const p = parsed.data

  const { data, error } = await chamarRpcExterna('criar_solicitacao_externa', {
    p_chave_id:           chave.id,
    p_tipo_slug:          p.tipo,
    p_destinatario:       p.destinatario,
    p_titulo:             p.titulo ?? null,
    p_campos:             p.campos ?? {},
    p_data_limite:        p.data_limite,
    p_chave_idempotencia: p.chave_idempotencia,
    p_referencia_origem:  p.referencia_origem ?? null,
  })

  if (error) {
    const resposta = traduzirErroRpc(error.message)
    await registrarChamada(chave.id, ROTA, resposta.status, error.message)
    return resposta
  }

  const resultado = data as ResultadoCriacao
  if (!resultado.idempotente) {
    await notificarCriacao(resultado.id)
  }

  const http = resultado.idempotente ? 200 : 201
  const resposta = Response.json({
    ok: true, id: resultado.id, status: resultado.status,
    destinatario: resultado.destinatario, idempotente: resultado.idempotente,
  }, { status: http })
  await registrarChamada(chave.id, ROTA, http)
  return resposta
}
