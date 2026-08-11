'use client'

import { ResponsiveContainer, BarChart, Bar, LabelList, Tooltip } from 'recharts'
import {
  ChartXAxisBRL, ChartYAxisCategoria, CustomTooltip,
  chartMargins, barRadius, barSizes,
} from '@/components/charts'
import { fmtBRL, fmtMi } from '@/lib/fmt'
import type { ItemMesComparativo } from '@/lib/metas/comparativo'

// Barras horizontais de "Realizado por mês" do Comparativo de Metas (v5.6.1).
// Uma barra por mês, todas na MESMA cor de marca (`cor`) — aqui a comparação é
// entre meses do MESMO setor, não entre setores/papéis, então uma cor só (ao
// contrário das colunas Previsto×Realizado, que opõem dois papéis). Ordem
// recebida (ASC — de `resolverMeses`/`montarComparativo`) é renderizada como
// está: o Recharts posiciona o índice 0 no topo em layout vertical, então ASC
// "de cima para baixo" não precisa de reverse.

interface Props {
  meses: ItemMesComparativo[]
  cor: string
}

/** Largura do eixo Y — acomoda o rótulo mais longo ("ago/24 (parcial)", ~16 chars). */
const LARGURA_EIXO_Y = 120

/** Altura dinâmica: 3 meses (YoY) e 12 (teto do personalizado) precisam respirar. */
function alturaGrafico(qtdMeses: number): number {
  return Math.max(160, qtdMeses * 36 + 40)
}

export default function ComparativoBarras({ meses, cor }: Props) {
  const dados = meses.map(m => ({ rotulo: m.rotulo, realizado: m.realizado }))

  return (
    <ResponsiveContainer width="100%" height={alturaGrafico(meses.length)}>
      <BarChart layout="vertical" data={dados} margin={chartMargins.horizontal}>
        {/* Sem ChartGrid: o factory só desenha linhas horizontais (vertical={false}),
            que neste layout viram separadores de linha sem função — o precedente vivo
            de barra horizontal (mix-setor-chart) também não usa grid. */}
        {ChartXAxisBRL()}
        {ChartYAxisCategoria('rotulo', { width: LARGURA_EIXO_Y })}
        <Tooltip
          content={(p) => (
            <CustomTooltip {...p} formatter={(v) => [fmtBRL(v), 'Realizado']} />
          )}
          cursor={{ fill: 'rgba(0,0,0,0.04)' }}
        />
        <Bar
          dataKey="realizado"
          fill={cor}
          radius={barRadius.right}
          maxBarSize={barSizes.horizontal}
          isAnimationActive={false}
        >
          <LabelList
            dataKey="realizado"
            position="right"
            formatter={(v: unknown) => (v == null ? '' : fmtMi(Number(v)))}
            style={{ fontSize: 11, fill: 'var(--chart-axis-tick)', fontVariantNumeric: 'tabular-nums' }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
