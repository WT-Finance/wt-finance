import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { getServerClient } from '@/lib/supabase/server'
import { requireAreaApi } from '@/lib/auth/sessao'
import { areasDoSetor } from '@/lib/auth/areas'
import { parseRpc, tendenciaMargemSchema } from '@/lib/schemas-rpc'

const schema = z.object({
  from:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  setor: z.enum(['todos', 'Lazer', 'Weddings', 'Corporativo']).optional().default('todos'),
})

export async function GET(request: NextRequest): Promise<Response> {
  const parsed = schema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }
  const { from, to, setor } = parsed.data

  // Guard v4.13: área(s) do setor pedido ('todos' → executiva|performance).
  const sessao = await requireAreaApi(areasDoSetor(setor))
  if (sessao instanceof Response) return sessao

  const client = await getServerClient()
  const res = await client.rpc('get_tendencia_margem', {
    p_from: from, p_to: to, p_setor: setor,
  })
  // F7 (v4.12.1): valida shape; erro de RPC ou drift de contrato → null (logado em parseRpc).
  const tendencia = parseRpc(tendenciaMargemSchema, res, 'get_tendencia_margem')
  if (tendencia === null) return Response.json({ error: 'get_tendencia_margem' }, { status: 500 })
  return Response.json(tendencia)
}
