import type { NextRequest } from 'next/server'
import { getServerClient } from '@/lib/supabase/server'
import { requireAreaApi } from '@/lib/auth/sessao'
import { areasDoSetor, type Area } from '@/lib/auth/areas'
import type { RankingVendedorItem } from '@/types/api'

export async function GET(request: NextRequest): Promise<Response> {
  const { searchParams } = request.nextUrl

  const now = new Date()
  const anoStr = searchParams.get('ano') ?? String(now.getFullYear())
  const mesStr = searchParams.get('mes') ?? String(now.getMonth() + 1)
  const setor = searchParams.get('setor') ?? 'todos'
  const limiteStr = searchParams.get('limite') ?? '10'

  const ano = parseInt(anoStr, 10)
  const mes = parseInt(mesStr, 10)
  const limite = parseInt(limiteStr, 10)

  if (isNaN(ano) || isNaN(mes) || mes < 1 || mes > 12) {
    return Response.json({ error: 'Parâmetros inválidos: ano e mes devem ser inteiros válidos.' }, { status: 400 })
  }

  if (isNaN(limite) || limite < 1 || limite > 100) {
    return Response.json({ error: 'Parâmetro inválido: limite deve ser um inteiro entre 1 e 100.' }, { status: 400 })
  }

  // Guard v4.13: rota alimenta Metas e a Executiva, além da aba do setor.
  const sessao = await requireAreaApi([...new Set<Area>(['metas', 'executiva', ...areasDoSetor(setor)])])
  if (sessao instanceof Response) return sessao

  const client = await getServerClient()
  const { data, error } = await client.rpc('get_ranking_vendedores', {
    p_ano: ano,
    p_mes: mes,
    p_setor: setor,
    p_limite: limite,
  })

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json(data as unknown as RankingVendedorItem[])
}
