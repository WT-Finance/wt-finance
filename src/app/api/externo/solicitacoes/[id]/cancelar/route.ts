// API externa de Solicitações (v5.4.0/M3b) — POST /api/externo/solicitacoes/[id]/cancelar
//
// Cancela uma solicitação criada por ESTA chave (a RPC valida que a solicitação
// pertence à chave — não é um cancelamento genérico por id). SEM estado "aprovada":
// só a transição para 'cancelada', mesma máquina de estados existente.
export const runtime = 'nodejs'

import {
  autenticarChamada, chamarRpcExterna, respostaErro, traduzirErroRpc, registrarChamada,
} from '@/lib/api-externa/http'
import { getEmailsEnvolvidos } from '@/lib/solicitacoes/rpc'
import { enviarNotificacaoSolicitacao } from '@/lib/email'

const ROTA = '/api/externo/solicitacoes/[id]/cancelar'

interface ResultadoCancelamento { ok: true; id: number; status: string }

/** Notificação best-effort — mesma limitação conhecida documentada em ../route.ts (notificarCriacao). */
async function notificarCancelamento(id: number): Promise<void> {
  try {
    const ctx = await getEmailsEnvolvidos(id)
    if (!ctx || ctx.envolvidos_emails.length === 0) return
    await enviarNotificacaoSolicitacao({
      paras:           ctx.envolvidos_emails,
      movimentacao:    'cancelada',
      titulo:          `${ctx.tipo_nome ?? 'Solicitação'} #${id}`,
      atribuidoRotulo: ctx.atribuido_rotulo ?? '—',
      autorRotulo:     ctx.autor_rotulo ?? '—',
      quando:          ctx.decidido_em_fmt,
    })
  } catch { /* e-mail é camada ADICIONAL: jamais quebra a resposta ao integrador */ }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await autenticarChamada(req)
  if (!auth.ok) {
    await registrarChamada(null, ROTA, auth.resposta.status, 'auth_negada')
    return auth.resposta
  }
  const { chave } = auth

  const { id: idRaw } = await params
  const id = Number(idRaw)
  if (!Number.isInteger(id) || id <= 0) {
    const resposta = respostaErro('NAO_ENCONTRADA', 'Solicitação não encontrada.', 404)
    await registrarChamada(chave.id, ROTA, 404, 'id_invalido')
    return resposta
  }

  const { data, error } = await chamarRpcExterna('cancelar_solicitacao_externa', {
    p_chave_id: chave.id,
    p_solicitacao_id: id,
  })

  if (error) {
    const resposta = traduzirErroRpc(error.message)
    await registrarChamada(chave.id, ROTA, resposta.status, error.message)
    return resposta
  }

  const resultado = data as ResultadoCancelamento
  await notificarCancelamento(resultado.id)

  const resposta = Response.json({ ok: true, id: resultado.id, status: resultado.status }, { status: 200 })
  await registrarChamada(chave.id, ROTA, 200)
  return resposta
}
