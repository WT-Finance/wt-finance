'use client'

import { useMemo } from 'react'
import { ChartColumn } from 'lucide-react'
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import {
  ChartGrid, ChartLegend, ChartXAxisCategoria, ChartYAxisBRL, ChartZeroLine, CustomTooltip,
  barRadius, chartMargins,
} from '@/components/charts'
import EmptyState from '@/components/shared/empty-state'
import ErroCarregamento from '@/components/shared/erro-carregamento'
import { Card } from '@/components/ui/card'
import { fmtBRL2 } from '@/lib/fmt'
import {
  serieMensalMultiAno, totaisPorAno, totalDoPeriodo, type FatiaAno,
} from '@/lib/marketing/agregacao'
import { coresDosAnos } from '@/lib/marketing/cores'
import { escalaSerie } from '@/lib/marketing/escala'
import { MESES_ABREV, rotuloAnos } from '@/lib/marketing/periodo'
import type { LinhaMesCategoria } from '@/lib/marketing/tipos'
import CabecalhoCard from './cabecalho-card'

// Componente C — "Despesas mensais": jan–dez, UMA BARRA POR ANO selecionado lado a lado (do mais
// antigo, à esquerda, ao mais recente, à direita), e ao lado direito o painel "Total" — um
// mini-gráfico com uma barra por ano (o total do ano no seu recorte), numa escala PRÓPRIA: o
// total anual é ~12× o mensal e dividir o eixo com os meses amassaria os meses.
//
// Eixo X SEMPRE jan–dez, mesmo no ano corrente: o mês que ainda não chegou é `null` (sem barra —
// ausência ≠ zero), nunca zero.
//
// Cores por token e por POSIÇÃO entre os selecionados (`coresDosAnos`): o ano mais recente na cor
// principal (`--action-soft-border`), os anteriores em cinzas progressivamente mais claros. O painel
// Total usa as mesmas cores por ano. Esta é uma tela de plataforma — sem `--brand`.
//
// VALORES NEGATIVOS — a armadilha que não dá erro: o domínio default do Recharts ancora em zero e
// CORTA os negativos. O domínio e os ticks de CADA gráfico saem de `escalaSerie` (passo redondo), o
// zero é desenhado por `ChartZeroLine`, e o eixo mostra o sinal (`abs: false`) — a mesma grandeza
// não pode aparecer com dois sinais em telas vizinhas.
//
// Falha parcial: o gráfico desenha os anos que carregaram e AVISA dos ausentes (ele não soma anos
// — cada barra é de um ano só; quem soma, os cards, mostra o erro no lugar do número).

const ALTURA = 260

interface Props {
  /** Rótulo do período ("2025 + 2026 (até out)"). */
  periodo: string
  /** Os anos selecionados que carregaram, cada um no seu recorte. */
  fatias: readonly FatiaAno<LinhaMesCategoria>[]
  /** Anos selecionados cujo resumo falhou. */
  anosFalha: readonly number[]
}

export default function SerieMensal({ periodo, fatias, anosFalha }: Props) {
  const serie = useMemo(() => serieMensalMultiAno(fatias), [fatias])
  const totais = useMemo(() => totaisPorAno(fatias), [fatias])
  const cores = useMemo(() => coresDosAnos(serie.anos), [serie.anos])

  // Um ponto por mês; uma chave por ano (`dataKey` = o ano). `null` = sem barra.
  const dadosMensais = useMemo(
    () => serie.pontos.map(p => ({
      label: MESES_ABREV[p.mes - 1],
      ...Object.fromEntries(serie.anos.map((ano, i) => [String(ano), p.valores[i]])),
    })),
    [serie],
  )
  const dadosTotal = useMemo(
    () => totais.map((t, i) => ({ label: String(t.ano), valor: t.valor, cor: cores[i] })),
    [totais, cores],
  )

  const escalaMeses = useMemo(() => escalaSerie(serie.pontos.flatMap(p => p.valores)), [serie])
  const escalaTotal = useMemo(() => escalaSerie(totais.map(t => t.valor)), [totais])

  const titulo = 'Despesas mensais'
  const subtitulo = `${periodo} · uma barra por ano, lado a lado`

  if (fatias.length === 0) {
    return (
      <Card>
        <CabecalhoCard titulo={titulo} />
        <ErroCarregamento mensagem="Não foi possível carregar as despesas mensais." />
      </Card>
    )
  }

  if (totalDoPeriodo(fatias).qtd === 0) {
    return (
      <Card>
        <CabecalhoCard titulo={titulo} subtitulo={subtitulo} />
        <EmptyState icon={ChartColumn} message={`Sem lançamentos pagos em ${periodo}.`} />
      </Card>
    )
  }

  const anosDoGrafico = rotuloAnos(serie.anos)

  return (
    <Card>
      <CabecalhoCard titulo={titulo} subtitulo={subtitulo} />

      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="min-w-0 flex-1">
          {/* `height` fixo no pai — `min-height` faz o ResponsiveContainer medir 0 e o gráfico some. */}
          <div role="img" aria-label={`Despesas mensais de marketing, janeiro a dezembro, por ano: ${anosDoGrafico}`}>
            <ResponsiveContainer width="100%" height={ALTURA}>
              <BarChart data={dadosMensais} margin={chartMargins.default} barGap={2} barCategoryGap="16%">
                {ChartGrid()}
                {ChartXAxisCategoria('label', { interval: 0 })}
                {ChartYAxisBRL({ abs: false, width: 76, domain: escalaMeses.domain, ticks: escalaMeses.ticks })}
                {ChartZeroLine()}
                <Tooltip
                  content={p => (
                    <CustomTooltip
                      {...p}
                      // Mês que o ano ainda não alcançou é `null`: sem linha no tooltip (senão "R$ 0,00").
                      payload={p.payload?.filter(e => e.value != null)}
                      showColorDot
                      formatter={(v, name) => [fmtBRL2(v), name]}
                    />
                  )}
                  cursor={{ fill: 'var(--surface-soft)' }}
                />
                {/* A ordem dos <Bar> é a ordem visual: do mais antigo ao mais recente. */}
                {serie.anos.map((ano, i) => (
                  <Bar
                    key={ano}
                    dataKey={String(ano)}
                    name={String(ano)}
                    fill={cores[i]}
                    radius={barRadius.top}
                    maxBarSize={22}
                    isAnimationActive={false}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* A `Legend` nativa nem é montada — a `ChartLegend` fica fora do container, abaixo. */}
          <ChartLegend items={serie.anos.map((ano, i) => ({ label: String(ano), color: cores[i], type: 'rect' as const }))} />
        </div>

        {/* Painel "Total": escala PRÓPRIA, uma barra por ano, mesmas cores. */}
        <div className="shrink-0 lg:w-64 lg:border-l lg:border-[var(--border)] lg:pl-6">
          <div role="img" aria-label={`Total por ano de despesas de marketing: ${anosDoGrafico}`}>
            <ResponsiveContainer width="100%" height={ALTURA}>
              <BarChart data={dadosTotal} margin={chartMargins.default} barCategoryGap="22%">
                {ChartGrid()}
                {ChartXAxisCategoria('label', { interval: 0 })}
                {ChartYAxisBRL({ abs: false, width: 76, domain: escalaTotal.domain, ticks: escalaTotal.ticks })}
                {ChartZeroLine()}
                <Tooltip
                  content={p => (
                    <CustomTooltip {...p} formatter={(v) => [fmtBRL2(v), 'Total']} />
                  )}
                  cursor={{ fill: 'var(--surface-soft)' }}
                />
                <Bar
                  dataKey="valor"
                  name="Total"
                  radius={barRadius.top}
                  maxBarSize={40}
                  isAnimationActive={false}
                >
                  {dadosTotal.map(d => <Cell key={d.label} fill={d.cor} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-center text-xs text-[var(--text-muted)]">Total por ano</p>
        </div>
      </div>

      {anosFalha.length > 0 && (
        <ErroCarregamento
          mensagem={`Não foi possível carregar ${rotuloAnos(anosFalha)}; fora do gráfico.`}
          className="mt-2 justify-center"
        />
      )}
    </Card>
  )
}
