import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { getServerClient } from '@/lib/supabase/server'
import { requireAreaApi } from '@/lib/auth/sessao'
import type { SumarioSubsetor } from '@/types/api'

const schema = z.object({
  periodo_inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato esperado: YYYY-MM-DD'),
  periodo_fim:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato esperado: YYYY-MM-DD'),
})

export async function GET(request: NextRequest): Promise<Response> {
  // Guard v4.13: dados exclusivos da aba Weddings.
  const sessao = await requireAreaApi('performance/weddings')
  if (sessao instanceof Response) return sessao

  const parsed = schema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const { periodo_inicio, periodo_fim } = parsed.data
  const client = await getServerClient()
  const { data, error } = await client.rpc('get_sumario_subsetor', {
    p_from: periodo_inicio,
    p_to:   periodo_fim,
  })
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data as unknown as SumarioSubsetor)
}
