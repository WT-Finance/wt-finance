'use client'

import { useMemo } from 'react'
import { Bar, BarChart, ResponsiveContainer, Tooltip } from 'recharts'
import {
  ChartGrid, ChartLegend, ChartXAxisCategoria, ChartYAxisBRL, ChartZeroLine, CustomTooltip,
  barRadius, chartMargins,
} from '@/components/charts'
import ErroCarregamento from '@/components/shared/erro-carregamento'
import { fmtBRL2 } from '@/lib/fmt'
import { coresPorAno, TONS_DO_ANO } from '@/lib/marketing/cores'
import { rotuloAnos } from '@/lib/marketing/periodo'
import { escalaEixo, valoresDaSerie, type SerieMultiAno } from '@/lib/financeiro-geral/composicao'

// Colunas mensais jan–dez, UMA BARRA POR ANO selecionado lado a lado (do mais antigo ao mais recente),
// compartilhado por Antecipações (volume) e Perdas e prejuízos (prejuízo bruto). Mesmas regras do gráfico
// "Despesas mensais" do Marketing, importadas sem mover nada:
//  • eixo X sempre jan–dez; mês que o ano ainda não alcançou é `null` (sem barra — ausência ≠ zero);
//  • cor por token e por POSIÇÃO entre os SELECIONADOS (`coresPorAno`), não só os que carregaram;
//  • domínio e ticks explícitos JUNTOS (`escalaEixo`): o default do Recharts ancora em zero e corta os
//    negativos (prejuízo é negativo, no sinal da DRE) — e domínio sem ticks perde a marca do zero;
//  • `key` do BarChart = conjunto de anos: o Recharts posiciona as barras pela ordem de REGISTRO no store,
//    não pela do JSX; sem remontar, ligar uma pill de ano mais antigo desenhava o ano antigo à direita;
//  • `height` fixo no pai do ResponsiveContainer (nunca min-height — o gráfico mediria 0).

const ALTURA = 260

interface Props {
  serie: SerieMultiAno
  /** TODOS os anos selecionados (carregados ou não): a cor de cada ano sai da posição aqui. */
  anosSelecionados: readonly number[]
  /** Frase para leitor de tela ("Prejuízo bruto por mês, janeiro a dezembro, por ano"). */
  descricao: string
  /** Texto do item no tooltip e na legenda ("Volume", "Prejuízo"). */
  nomeSerie: string
}

export default function GraficoMensal({ serie, anosSelecionados, descricao, nomeSerie }: Props) {
  const corPorAno = useMemo(() => coresPorAno(anosSelecionados), [anosSelecionados])
  const cores = useMemo(
    () => serie.anos.map(a => corPorAno.get(a.ano) ?? TONS_DO_ANO[TONS_DO_ANO.length - 1]),
    [serie.anos, corPorAno],
  )
  const dados = useMemo(
    () => serie.pontos.map(p => ({
      label: p.label,
      ...Object.fromEntries(serie.anos.map((a, i) => [String(a.ano), p.valores[i]])),
    })),
    [serie],
  )
  const escala = useMemo(() => escalaEixo(valoresDaSerie(serie)), [serie])
  const rotuloPorAno = useMemo(() => new Map(serie.anos.map(a => [String(a.ano), a.rotulo])), [serie.anos])

  const chave = serie.anos.map(a => a.ano).join('-')
  const anosDoGrafico = rotuloAnos(serie.anos.map(a => a.ano))

  return (
    <div>
      <div role="img" aria-label={`${descricao}: ${anosDoGrafico}`}>
        <ResponsiveContainer width="100%" height={ALTURA}>
          <BarChart key={chave} data={dados} margin={chartMargins.default} barGap={2} barCategoryGap="16%">
            {ChartGrid()}
            {ChartXAxisCategoria('label', { interval: 0 })}
            {ChartYAxisBRL({ abs: false, width: 76, domain: escala.domain, ticks: escala.ticks })}
            {ChartZeroLine()}
            <Tooltip
              content={p => (
                <CustomTooltip
                  {...p}
                  // Mês que o ano ainda não alcançou é `null`: sem linha no tooltip (senão "R$ 0,00").
                  payload={p.payload?.filter(e => e.value != null)}
                  showColorDot
                  formatter={(v, name) => [fmtBRL2(v), `${nomeSerie} ${rotuloPorAno.get(name) ?? name}`]}
                />
              )}
              cursor={{ fill: 'var(--surface-soft)' }}
            />
            {serie.anos.map((a, i) => (
              <Bar
                key={a.ano}
                dataKey={String(a.ano)}
                name={String(a.ano)}
                fill={cores[i]}
                radius={barRadius.top}
                maxBarSize={22}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ChartLegend items={serie.anos.map((a, i) => ({ label: a.rotulo, color: cores[i], type: 'rect' as const }))} />
      {serie.anosFalha.length > 0 && (
        <ErroCarregamento
          mensagem={`Não foi possível carregar ${rotuloAnos(serie.anosFalha)}; fora do gráfico.`}
          className="mt-2 justify-center"
        />
      )}
    </div>
  )
}
