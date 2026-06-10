import type { NextRequest } from 'next/server'
import { getServerClient } from '@/lib/supabase/server'
import { requireAreaApi } from '@/lib/auth/sessao'
import { areasDoSetor, type Area } from '@/lib/auth/areas'
import type { HistoricoMensalItem } from '@/types/api'

export async function GET(request: NextRequest): Promise<Response> {
  const { searchParams } = request.nextUrl
  const setor = searchParams.get('setor') ?? 'todos'

  // Guard v4.13: rota alimenta Metas e a Executiva, além da aba do setor.
  const sessao = await requireAreaApi([...new Set<Area>(['metas', 'executiva', ...areasDoSetor(setor)])])
  if (sessao instanceof Response) return sessao

  const client = await getServerClient()
  const { data, error } = await client.rpc('get_historico_mensal', { p_setor: setor })

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json(data as unknown as HistoricoMensalItem[])
}
