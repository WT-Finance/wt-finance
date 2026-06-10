import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { getServerClient } from '@/lib/supabase/server'
import { requireAreaApi } from '@/lib/auth/sessao'
import type { ProximosCasamentos } from '@/types/api'

const schema = z.object({
  horizonte: z.coerce.number().int().refine(v => [3, 6, 12, 18].includes(v)).default(6),
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
  const { data, error } = await client.rpc('get_proximos_casamentos', {
    p_horizonte_meses: parsed.data.horizonte,
  })
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data as unknown as ProximosCasamentos)
}
