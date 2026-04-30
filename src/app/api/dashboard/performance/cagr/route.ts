import { getServerClient } from '@/lib/supabase/server'
import type { CagrData } from '@/types/api'

export async function GET(): Promise<Response> {
  const client = getServerClient()
  const { data, error } = await client.rpc('get_cagr')
  if (error) return Response.json({ error: error.message }, { status: 500 })
  const result = data as unknown as CagrData
  if (result.erro) return Response.json({ error: result.erro }, { status: 422 })
  return Response.json(result)
}
