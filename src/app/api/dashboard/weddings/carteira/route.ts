import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { getServerClient } from '@/lib/supabase/server'
import type { CarteiraWeddings } from '@/types/api'

const schema = z.object({
  metric: z.enum(['casamentos', 'faturamento', 'receita_bruta']).default('casamentos'),
})

export async function GET(request: NextRequest): Promise<Response> {
  const parsed = schema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const { data, error } = await getServerClient().rpc('get_carteira_weddings', {
    p_metric: parsed.data.metric,
  })
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data as unknown as CarteiraWeddings)
}
