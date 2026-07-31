// API externa de Solicitações (v5.4.0/Round4) — GET /api/externo/solicitacoes/{id}
//
// Consulta o estado de UMA solicitação criada por ESTA chave. Existe porque, sem
// consulta, o integrador dependia inteiramente do callback: se ele não hospedasse
// um webhook (ou se o dele ficasse fora do ar além das 8 tentativas da outbox),
// nunca ficaria sabendo o desfecho — não havia caminho de recuperação. Com esta
// rota o contrato é autossuficiente: criar → consultar → cancelar.
export const runtime = 'nodejs'

import {
  autenticarChamada, chamarRpcExterna, respostaErro, traduzirErroRpc, registrarChamada,
} from '@/lib/api-externa/http'
import { comoListaConsulta } from '@/lib/api-externa/consulta'

const ROTA = '/api/externo/solicitacoes/[id]'

export async function GET(
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

  const { data, error } = await chamarRpcExterna('consultar_solicitacoes_externas', {
    p_chave_id: chave.id,
    p_solicitacao_id: id,
    p_referencia_origem: null,
  })

  if (error) {
    const resposta = traduzirErroRpc(error.message)
    await registrarChamada(chave.id, ROTA, resposta.status, error.message)
    return resposta
  }

  const lista = comoListaConsulta(data)
  if (!lista) {
    await registrarChamada(chave.id, ROTA, 500, 'shape inesperado no retorno de consultar_solicitacoes_externas')
    return respostaErro('ERRO_INTERNO', 'Falha inesperada. Tente novamente com backoff.', 500)
  }

  // Vazio aqui NÃO é "sem resultados": ou o id não existe, ou pertence a outra
  // chave (ou a um pedido aberto na tela, que não tem origem). Os três respondem
  // igual, de propósito — 404 não distingue "não existe" de "não é seu", senão a
  // resposta viraria um oráculo de existência de ids alheios.
  const solicitacao = lista[0]
  if (!solicitacao) {
    const resposta = respostaErro('NAO_ENCONTRADA', 'Solicitação não encontrada.', 404)
    await registrarChamada(chave.id, ROTA, 404)
    return resposta
  }

  const resposta = Response.json({ ok: true, solicitacao }, { status: 200 })
  await registrarChamada(chave.id, ROTA, 200)
  return resposta
}
