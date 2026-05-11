import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { getServerClient } from '@/lib/supabase/server'
import type { PipelineWeddings } from '@/types/api'

const schema = z.object({
  horizonte_meses: z.coerce.number().int().min(1).max(36).default(18),
})

export async function GET(request: NextRequest): Promise<Response> {
  const parsed = schema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const { data, error } = await getServerClient().rpc('get_pipeline_weddings', {
    p_horizonte_meses: parsed.data.horizonte_meses,
  })
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data as unknown as PipelineWeddings)
}
