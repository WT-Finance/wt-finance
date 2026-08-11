'use client'

import { ResponsiveContainer, BarChart, Bar, Cell, LabelList, Tooltip } from 'recharts'
import {
  ChartGrid, ChartXAxisCategoria, ChartYAxisBRL, CustomTooltip,
  chartSeries, barRadius, barSizes,
} from '@/components/charts'
import { fmtBRL, fmtMi } from '@/lib/fmt'
import type { ItemMesComparativo } from '@/lib/metas/comparativo'

// Colunas "Previsto × Realizado" do mês em foco do Comparativo de Metas (v5.6.1).
// Previsto = papel de REFERÊNCIA (tom neutro do DS, `chartSeries.neutral` — o mesmo
// token usado para a barra "neutra" do Horizonte Previsto/Financeiro, e para a linha
// "Esperado" do Ritmo do período aqui em Metas); Realizado = série real, sólida, na
// cor de marca do setor selecionado (prop `cor`). Categoria ausente (previsto/realizado
// null) é OMITIDA — nunca renderizada como barra zero, que mentiria visualmente.

interface Props {
  item: ItemMesComparativo
  cor: string
}

/** Altura fixa do gráfico (delegação M3). */
const ALTURA = 260

interface Ponto {
  categoria: 'Previsto' | 'Realizado'
  valor: number
  cor: string
}

export default function ComparativoColunas({ item, cor }: Props) {
  const dados: Ponto[] = []
  if (item.previsto !== null) dados.push({ categoria: 'Previsto', valor: item.previsto, cor: chartSeries.neutral })
  if (item.realizado !== null) dados.push({ categoria: 'Realizado', valor: item.realizado, cor })

  if (dados.length === 0) {
    return (
      <div
        style={{ height: ALTURA }}
        className="flex items-center justify-center text-2xl text-text-subtle"
      >
        —
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={ALTURA}>
      <BarChart data={dados} margin={{ top: 24, right: 16, bottom: 0, left: 0 }}>
        {ChartGrid()}
        {ChartXAxisCategoria('categoria')}
        {ChartYAxisBRL()}
        <Tooltip
          content={(p) => (
            <CustomTooltip {...p} formatter={(v) => [fmtBRL(v), 'Valor']} />
          )}
          cursor={{ fill: 'rgba(0,0,0,0.04)' }}
        />
        <Bar dataKey="valor" radius={barRadius.top} barSize={barSizes.column} isAnimationActive={false}>
          {dados.map((d, i) => <Cell key={i} fill={d.cor} />)}
          <LabelList
            dataKey="valor"
            position="top"
            formatter={(v: unknown) => fmtMi(Number(v))}
            style={{ fontSize: 12, fontWeight: 600, fill: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
