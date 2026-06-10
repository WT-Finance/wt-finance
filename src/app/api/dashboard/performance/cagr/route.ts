import { getServerClient } from '@/lib/supabase/server'
import { requireAreaApi } from '@/lib/auth/sessao'
import type { CagrData } from '@/types/api'

export async function GET(): Promise<Response> {
  // Guard v4.13: agregado da empresa — Executiva ou Performance geral.
  const sessao = await requireAreaApi(['executiva', 'performance'])
  if (sessao instanceof Response) return sessao

  const client = await getServerClient()
  const { data, error } = await client.rpc('get_cagr')
  if (error) return Response.json({ error: error.message }, { status: 500 })
  const result = data as unknown as CagrData
  if (result.erro) return Response.json({ error: result.erro }, { status: 422 })
  return Response.json(result)
}
