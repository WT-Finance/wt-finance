import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { getServerClient } from '@/lib/supabase/server'
import { requireAreaApi } from '@/lib/auth/sessao'
import { parseRpc, carteiraWeddingsSchema } from '@/lib/schemas-rpc'

const schema = z.object({
  metric: z.enum(['casamentos', 'faturamento', 'receita_bruta']).default('casamentos'),
})

export async function GET(request: NextRequest): Promise<Response> {
  // Guard v4.13: dados exclusivos da aba Weddings.
  const sessao = await requireAreaApi('performance/weddings')
  if (sessao instanceof Response) return sessao

  const parsed = schema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const client = await getServerClient()
  const res = await client.rpc('get_carteira_weddings', {
    p_metric: parsed.data.metric,
  })
  // F7 (v4.12.1): valida shape; erro de RPC ou drift de contrato → null (logado em parseRpc).
  const carteira = parseRpc(carteiraWeddingsSchema, res, 'get_carteira_weddings')
  if (carteira === null) return Response.json({ error: 'get_carteira_weddings' }, { status: 500 })
  return Response.json(carteira)
}
