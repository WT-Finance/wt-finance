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
          {/* content CUSTOM (não formatter): o LabelList padrão QUEBRA o texto na
              largura da barra — numa coluna estreita "R$ 2,65 Mi" vira três linhas
              empilhadas e corta no teto do gráfico (visto na verificação visual). */}
          <LabelList
            dataKey="valor"
            content={(p) => {
              const { x, y, width, value } = p as {
                x?: number | string; y?: number | string; width?: number | string; value?: number | string
              }
              if (value == null || x == null || y == null || width == null) return <g />
              return (
                <text
                  x={Number(x) + Number(width) / 2}
                  y={Number(y) - 8}
                  textAnchor="middle"
                  style={{ fontSize: 12, fontWeight: 600, fill: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}
                >
                  {fmtMi(Number(value))}
                </text>
              )
            }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
