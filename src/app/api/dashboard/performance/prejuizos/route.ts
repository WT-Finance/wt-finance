import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { getServerClient } from '@/lib/supabase/server'
import type { PrejuizosSummary, PrejuizosDetalhe } from '@/types/api'

const schema = z.object({
  from:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'from deve ser YYYY-MM-DD'),
  to:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'to deve ser YYYY-MM-DD'),
  setor:   z.enum(['todos', 'Lazer', 'Weddings', 'Corporativo']).optional().default('todos'),
  summary: z.enum(['true', 'false']).optional().default('false'),
})

export async function GET(request: NextRequest): Promise<Response> {
  const parsed = schema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const { from, to, setor, summary } = parsed.data
  const isSummary = summary === 'true'

  const client = getServerClient()
  const { data, error } = await client.rpc('get_prejuizos', {
    p_from: from, p_to: to, p_setor: setor, p_summary: isSummary,
  })
  if (error) return Response.json({ error: error.message }, { status: 500 })

  if (isSummary) {
    return Response.json(data as unknown as PrejuizosSummary)
  }
  return Response.json(data as unknown as PrejuizosDetalhe)
}
