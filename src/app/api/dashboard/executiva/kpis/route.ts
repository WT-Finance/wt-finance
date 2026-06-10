import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { getServerClient } from '@/lib/supabase/server'
import { parseRpc, executivaKpisSchema } from '@/lib/schemas-rpc'

const schema = z.object({
  from:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'from deve ser YYYY-MM-DD'),
  to:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'to deve ser YYYY-MM-DD'),
  setor:  z.enum(['todos', 'Lazer', 'Weddings', 'Corporativo']).optional().default('todos'),
})

export async function GET(request: NextRequest): Promise<Response> {
  const parsed = schema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const { from, to, setor } = parsed.data
  const client = getServerClient()
  const res = await client.rpc('get_executiva_kpis', {
    p_from: from, p_to: to, p_setor: setor,
  })
  // F7 (v4.12.1): valida shape; erro de RPC ou drift de contrato → null (logado em parseRpc).
  const kpis = parseRpc(executivaKpisSchema, res, 'get_executiva_kpis')
  if (kpis === null) return Response.json({ error: 'get_executiva_kpis' }, { status: 500 })
  return Response.json(kpis)
}
