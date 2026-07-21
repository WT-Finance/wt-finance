// API externa de Solicitações (v5.4.0/M3b) — GET /api/externo/tipos
//
// Lista os tipos de solicitação que a chave de API (header x-api-key) pode abrir:
// slug, nome, se exige referência de conclusão, destinos permitidos (roles) e a
// definição de campos (chave estável, rótulo, tipo, obrigatoriedade, opções). Sem
// vocabulário de integrador específico e sem anexos — a integração descobre o
// contrato inteiro por esta rota antes de montar o POST de criação.
export const runtime = 'nodejs'

import { autenticarChamada, chamarRpcExterna, traduzirErroRpc, registrarChamada } from '@/lib/api-externa/http'

const ROTA = '/api/externo/tipos'

export async function GET(req: Request): Promise<Response> {
  const auth = await autenticarChamada(req)
  if (!auth.ok) {
    await registrarChamada(null, ROTA, auth.resposta.status, 'auth_negada')
    return auth.resposta
  }
  const { chave } = auth

  const { data, error } = await chamarRpcExterna('solic_tipos_api', { p_chave_id: chave.id })
  if (error) {
    const resposta = traduzirErroRpc(error.message)
    await registrarChamada(chave.id, ROTA, resposta.status, error.message)
    return resposta
  }

  const resposta = Response.json({ ok: true, tipos: data ?? [] }, { status: 200 })
  await registrarChamada(chave.id, ROTA, 200)
  return resposta
}
