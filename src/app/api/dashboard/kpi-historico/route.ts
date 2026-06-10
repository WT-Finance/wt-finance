import type { NextRequest } from 'next/server'
import { getServerClient } from '@/lib/supabase/server'
import { requireAreaApi } from '@/lib/auth/sessao'
import { areasDoSetor } from '@/lib/auth/areas'
import type { HistoricoMensalItem } from '@/types/api'

const MESES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez']

function mesLabel(ano: number, mes: number): string {
  return `${MESES[mes - 1]}/${String(ano).slice(2)}`
}

export async function GET(request: NextRequest): Promise<Response> {
  const { searchParams } = request.nextUrl
  const metrica = searchParams.get('metrica') ?? 'faturamento'
  const setor   = searchParams.get('setor')   ?? 'todos'

  // Guard v4.13: Executiva ou a(s) área(s) do setor pedido.
  const sessao = await requireAreaApi(['executiva', ...areasDoSetor(setor)])
  if (sessao instanceof Response) return sessao

  const client = await getServerClient()
  const { data, error } = await client.rpc('get_historico_mensal', { p_setor: setor })
  if (error) return Response.json({ error: error.message }, { status: 500 })

  const items = data as unknown as HistoricoMensalItem[]

  const serie = items.map(m => ({
    ano:   m.ano,
    mes:   m.mes,
    label: mesLabel(m.ano, m.mes),
    valor: metrica === 'receita' ? m.receitas : m.valor_total,
  }))

  // Últimos 6 em ordem decrescente com variações calculadas
  const ultimos_6 = serie.slice(-6).reverse().map((entry, revIdx) => {
    const idx      = serie.length - 1 - revIdx
    const anterior = idx > 0 && serie[idx - 1].valor > 0 ? serie[idx - 1].valor : null
    const yoy      = idx >= 12 && serie[idx - 12].valor > 0 ? serie[idx - 12].valor : null
    return {
      ...entry,
      var_anterior_pct: anterior != null ? ((entry.valor - anterior) / anterior * 100) : null,
      var_yoy_pct:      yoy      != null ? ((entry.valor - yoy)      / yoy      * 100) : null,
    }
  })

  return Response.json({ metrica, setor, serie, ultimos_6 })
}
