import type { NextRequest } from 'next/server'
import { getServerClient } from '@/lib/supabase/server'
import type { HistoricoMensalItem } from '@/types/api'

export async function GET(request: NextRequest): Promise<Response> {
  const { searchParams } = request.nextUrl
  const setor = searchParams.get('setor') ?? 'todos'

  const client = getServerClient()
  const { data, error } = await client.rpc('get_historico_mensal', { p_setor: setor })

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json(data as unknown as HistoricoMensalItem[])
}
