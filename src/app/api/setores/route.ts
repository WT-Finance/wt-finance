import { getServerClient } from '@/lib/supabase/server'
import type { SetorMacroInfo } from '@/types/api'

export async function GET(): Promise<Response> {
  const client = getServerClient()
  const { data, error } = await client.rpc('get_setores_macro')

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json(data as unknown as SetorMacroInfo[])
}
