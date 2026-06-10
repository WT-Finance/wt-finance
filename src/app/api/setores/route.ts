import { getServerClient } from '@/lib/supabase/server'
import { requireAreaApi } from '@/lib/auth/sessao'
import type { SetorMacroInfo } from '@/types/api'

export async function GET(): Promise<Response> {
  // Guard v4.13: qualquer usuário logado e ativo.
  const sessao = await requireAreaApi(null)
  if (sessao instanceof Response) return sessao

  const client = await getServerClient()
  const { data, error } = await client.rpc('get_setores_macro')

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json(data as unknown as SetorMacroInfo[])
}
