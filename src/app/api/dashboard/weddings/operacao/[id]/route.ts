import { type NextRequest } from 'next/server'
import { getServerClient } from '@/lib/supabase/server'
import { requireAreaApi } from '@/lib/auth/sessao'
import type { DrilldownOperacao, RendimentoFloatOperacao } from '@/types/api'

/** Assinatura frouxa para RPC fora do `database.ts` congelado. */
type RpcFrouxa = (
  fn: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  // Guard v4.13: dados exclusivos da aba Weddings.
  const sessao = await requireAreaApi('performance/weddings')
  if (sessao instanceof Response) return sessao

  const { id } = await params
  const operacao = decodeURIComponent(id)

  if (!operacao) {
    return Response.json({ error: 'id obrigatório' }, { status: 400 })
  }

  const client = await getServerClient()

  // v5.5.0: o float vem na MESMA requisição do detalhe. Uma segunda chamada do
  // cliente traria um segundo estado de carregamento dentro de um drawer que já
  // está aberto, e o bloco apareceria depois do resto — piscando.
  // `.bind(client)`: `rpc` é método de protótipo e faz `this.rest.rpc(...)`;
  // destacá-lo numa variável perde o `this` e estoura em runtime (v5.3.5).
  const chamarRpc = (client.rpc as unknown as RpcFrouxa).bind(client)

  // `allSettled`, não `all`: a 2ª chamada é declaradamente best-effort, e com
  // `Promise.all` uma REJEIÇÃO dela (rede, timeout — não o `{ error }` que o
  // supabase-js normalmente devolve) derrubaria o drawer inteiro, contradizendo o
  // próprio desenho de degradação logo abaixo. Achado BAIXO do `revisor`.
  const [detalheR, floatR] = await Promise.allSettled([
    client.rpc('get_operacao_weddings', { p_operacao: operacao }),
    chamarRpc('get_rendimento_float', { p_operacao: operacao }),
  ])

  if (detalheR.status === 'rejected') {
    return Response.json({ error: String(detalheR.reason) }, { status: 500 })
  }
  const detalhe = detalheR.value
  const float = floatR.status === 'fulfilled'
    ? floatR.value
    : { data: null, error: { message: String(floatR.reason) } }

  if (detalhe.error) return Response.json({ error: detalhe.error.message }, { status: 500 })

  const result = detalhe.data as unknown as DrilldownOperacao
  if ('error' in (result as object)) {
    return Response.json(result, { status: 404 })
  }

  // DEGRADA, não derruba: `get_rendimento_float` falha alto quando não há nenhuma
  // taxa fechada (invariante 9 do briefing) — é o comportamento certo PARA A RPC,
  // que assim fica diagnosticável. Mas o drawer inteiro não pode morrer porque a
  // ingestão do CDI está atrasada: sem float, o bloco simplesmente não aparece e
  // todo o resto da operação continua legível.
  let rendimento_float: RendimentoFloatOperacao | null = null
  let taxa_vigente_mes: string | null = null
  if (!float.error && float.data) {
    const payload = float.data as {
      taxa_vigente_mes?: string | null
      operacoes?: RendimentoFloatOperacao[]
    }
    rendimento_float = payload.operacoes?.[0] ?? null
    taxa_vigente_mes = payload.taxa_vigente_mes ?? null
  }

  return Response.json({ ...result, rendimento_float, taxa_vigente_mes })
}
