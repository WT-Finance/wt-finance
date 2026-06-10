import { requireAreaApi } from '@/lib/auth/sessao'
import { getAdminClient } from '@/lib/supabase/admin'

type BoundRpc = (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>

export async function GET(): Promise<Response> {
  // Guard v4.13: área de uploads administrativos; o trabalho segue com o admin client (service role).
  const sessao = await requireAreaApi('admin/uploads')
  if (sessao instanceof Response) return sessao

  const supabase = getAdminClient()
  const bound = (supabase.rpc as unknown as BoundRpc).bind(supabase)

  const { data, error } = await bound('get_upload_status')

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json(data)
}
