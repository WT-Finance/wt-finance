'use client'

import { ResponsiveContainer, BarChart, Bar, LabelList, Tooltip } from 'recharts'
import {
  ChartGrid, ChartXAxisBRL, ChartYAxisCategoria, CustomTooltip,
  chartMargins, barRadius, barSizes,
} from '@/components/charts'
import { fmtBRL, fmtMi } from '@/lib/fmt'
import type { ItemPeriodoComparativo } from '@/lib/metas/comparativo'

// Barras horizontais "Ano sobre Ano" do Comparativo de Metas (v5.6.1).
// Uma barra por período (mês único ou range contíguo, v5.6.4), todas na MESMA cor
// de marca (`cor`) — aqui a comparação é entre períodos do MESMO setor, não entre
// setores/papéis, então uma cor só (ao contrário das colunas Previsto×Realizado,
// que opõem dois papéis). Ordem recebida (ASC — de `resolverPeriodos`/
// `montarComparativo`) é renderizada como está: o Recharts posiciona o índice 0
// no topo em layout vertical.
//
// Ajustes 11/08 (print do Yan): o gráfico PREENCHE o card (altura 100% — o pai
// dá `flex-1 min-h-0` + minHeight), rótulos do eixo Y curtos ("mai/26", sem o
// sufixo " (parcial)" — que segue no título das colunas) com largura justa para
// as barras alinharem à esquerda, e grade VERTICAL pontilhada nos ticks do X.

interface Props {
  periodos: ItemPeriodoComparativo[]
  cor: string
}

/** Largura do eixo Y — justa para o MAIOR rótulo presente: 52px cobre "mai/26";
 *  ranges ("jan–abr/26", "nov/25–fev/26") crescem ~6.5px por caractere extra. */
function larguraEixoY(rotulos: string[]): number {
  const maior = rotulos.reduce((m, r) => Math.max(m, r.length), 0)
  return maior <= 6 ? 52 : Math.ceil(52 + (maior - 6) * 6.5)
}

/** Altura mínima por quantidade de períodos (o pai aplica como minHeight do wrapper). */
export function alturaMinimaBarras(qtdPeriodos: number): number {
  return Math.max(220, qtdPeriodos * 30 + 40)
}

export default function ComparativoBarras({ periodos, cor }: Props) {
  const dados = periodos.map(p => ({
    rotulo: p.rotulo.replace(' (parcial)', ''),
    realizado: p.realizado,
  }))

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart layout="vertical" data={dados} margin={chartMargins.horizontal}>
        {ChartGrid({ eixo: 'vertical' })}
        {ChartXAxisBRL()}
        {ChartYAxisCategoria('rotulo', { width: larguraEixoY(dados.map(d => d.rotulo)) })}
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
