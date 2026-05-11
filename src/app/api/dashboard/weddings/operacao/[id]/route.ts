import { type NextRequest } from 'next/server'
import { getServerClient } from '@/lib/supabase/server'
import type { DrilldownOperacao } from '@/types/api'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params
  const operacao = decodeURIComponent(id)

  if (!operacao) {
    return Response.json({ error: 'id obrigatório' }, { status: 400 })
  }

  const { data, error } = await getServerClient().rpc('get_operacao_weddings', {
    p_operacao: operacao,
  })
  if (error) return Response.json({ error: error.message }, { status: 500 })

  const result = data as unknown as DrilldownOperacao
  if ('error' in (result as object)) {
    return Response.json(result, { status: 404 })
  }
  return Response.json(result)
}
