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
import { TONS_DO_ANO, coresPorAno } from '@/lib/marketing/cores'
import { escalaSerie } from '@/lib/marketing/escala'
import {
  MESES_ABREV, recorteParcial, rotuloAnoNoTotal, rotuloAnos, rotuloRecorte,
} from '@/lib/marketing/periodo'
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
// Cores por token e por POSIÇÃO entre os SELECIONADOS (`coresPorAno`, sobre `anos` — não só os que
// carregaram, como o card de proporção): o ano mais recente na cor principal (`--action-primary`),
// os anteriores em cinzas progressivamente mais claros. Assim a cor de um ano não muda se o resumo
// de outro falhou, e é a mesma nos dois gráficos. A legenda, o tooltip e o painel Total usam as
// mesmas cores por ano. Esta é uma tela de plataforma — sem `--brand`.
//
// Ano PARCIAL no painel Total: o rótulo "2026*" (derivado do recorte de cada ano, em
// `@/lib/marketing/periodo`) e o tooltip, que diz o recorte ("2026 · jan–out") — a mesma convenção
// do card de proporção. Sem nota escrita embaixo do painel: o asterisco + o tooltip bastam.
//
// ⚠️ ORDEM DAS BARRAS DENTRO DE CADA MÊS — a armadilha que NÃO dá erro. O Recharts 3 dá a posição de
// cada `<Bar>` pela ordem em que ele foi REGISTRADO no store do gráfico (um `push` quando o Bar
// monta), e NÃO pela ordem do JSX. A página navega no mesmo pathname (filtro de ano), então o
// gráfico continua montado: ao ligar uma pill de ano mais antigo, o `<Bar key=2025>` novo monta
// DEPOIS do 2026 que já existia e entra no fim do registro — e a barra mais antiga aparecia à
// DIREITA do mais recente (2026, 2025, 2024) sempre que a seleção crescia a partir do default.
// Recarregar a URL já com todos os anos desenhava certo, por isso o bug parecia intermitente. A
// cura é REMONTAR o gráfico quando o CONJUNTO de anos muda (`key` do BarChart = os anos): todos os
// Bars montam de novo, na ordem do JSX — do mais antigo ao mais recente. A legenda e o painel Total
// não têm o problema (a legenda é HTML na ordem de `serie.anos`; o Total é um único `<Bar>` com um
// `<Cell>` por ano, posicionado pelo índice do dado, e `totaisPorAno` é crescente).
//
// VALORES NEGATIVOS — a armadilha que não dá erro: o domínio default do Recharts ancora em zero e
// CORTA os negativos. O domínio e os ticks de CADA gráfico saem de `escalaSerie` (passo redondo), o
// zero é desenhado por `ChartZeroLine`, e o eixo mostra o sinal (`abs: false`) — a mesma grandeza
// não pode aparecer com dois sinais em telas vizinhas.
//
// Falha parcial: o gráfico desenha os anos que carregaram e AVISA dos ausentes (ele não soma anos
// — cada barra é de um ano só; quem soma, os cards, mostra o erro no lugar do número). O aviso
// nomeia os anos ausentes em TODOS os ramos (com dado, sem lançamento nos carregados, falha total).

const ALTURA = 260

interface Props {
  /** Rótulo do período ("2025 + 2026 (até out)"). */
  periodo: string
  /** Todos os anos SELECIONADOS (carregados ou não): a cor de cada ano sai da posição aqui. */
  anos: readonly number[]
  /** Os anos selecionados que carregaram, cada um no seu recorte. */
  fatias: readonly FatiaAno<LinhaMesCategoria>[]
  /** Anos selecionados cujo resumo falhou. */
  anosFalha: readonly number[]
}

export default function SerieMensal({ periodo, anos, fatias, anosFalha }: Props) {
  const serie = useMemo(() => serieMensalMultiAno(fatias), [fatias])
  const totais = useMemo(() => totaisPorAno(fatias), [fatias])
  const recortePorAno = useMemo(() => new Map(fatias.map(f => [f.ano, f.recorte])), [fatias])
  // Cor por ano pela posição entre os SELECIONADOS; `serie.anos` são só os que carregaram.
  const corPorAno = useMemo(() => coresPorAno(anos), [anos])
  const cores = useMemo(
    () => serie.anos.map(a => corPorAno.get(a) ?? TONS_DO_ANO[TONS_DO_ANO.length - 1]),
    [serie.anos, corPorAno],
  )

  // Um ponto por mês; uma chave por ano (`dataKey` = o ano). `null` = sem barra.
  const dadosMensais = useMemo(
    () => serie.pontos.map(p => ({
      label: MESES_ABREV[p.mes - 1],
      ...Object.fromEntries(serie.anos.map((ano, i) => [String(ano), p.valores[i]])),
    })),
    [serie],
  )
  // Painel Total: o rótulo do ano parcial leva `*`; o tooltip diz o recorte ("2026 · jan–out").
  const dadosTotal = useMemo(
    () => totais.map(t => {
      const recorte = recortePorAno.get(t.ano)
      return {
        label: recorte ? rotuloAnoNoTotal(t.ano, recorte) : String(t.ano),
        rotuloTooltip: recorte && recorteParcial(recorte) ? `${t.ano} · ${rotuloRecorte(recorte)}` : String(t.ano),
        valor: t.valor,
        cor: corPorAno.get(t.ano) ?? TONS_DO_ANO[TONS_DO_ANO.length - 1],
      }
    }),
    [totais, recortePorAno, corPorAno],
  )
  const tooltipTotalPorRotulo = useMemo(
    () => new Map(dadosTotal.map(d => [d.label, d.rotuloTooltip])),
    [dadosTotal],
  )

  const escalaMeses = useMemo(() => escalaSerie(serie.pontos.flatMap(p => p.valores)), [serie])
  const escalaTotal = useMemo(() => escalaSerie(totais.map(t => t.valor)), [totais])

  const titulo = 'Despesas mensais'

  // O aviso dos anos ausentes — o MESMO em todos os ramos que tenham ao menos um ano carregado.
  const avisoFalha = anosFalha.length > 0 ? (
    <ErroCarregamento
      mensagem={`Não foi possível carregar ${rotuloAnos(anosFalha)}; fora do gráfico.`}
      className="mt-2 justify-center"
    />
  ) : null

  // Falha total (nenhum ano carregou): UM aviso só, nomeando os anos.
  if (fatias.length === 0) {
    return (
      <Card>
        <CabecalhoCard titulo={titulo} />
        <ErroCarregamento
          mensagem={anosFalha.length > 0
            ? `Não foi possível carregar as despesas mensais de ${rotuloAnos(anosFalha)}.`
            : 'Não foi possível carregar as despesas mensais.'}
        />
      </Card>
    )
  }

  if (totalDoPeriodo(fatias).qtd === 0) {
    // Com ano que falhou, "sem lançamentos em <todos os anos>" seria falso: só vale para os carregados.
    const mensagemVazio = anosFalha.length > 0
      ? `Sem lançamentos pagos nos anos carregados (${rotuloAnos(serie.anos)}).`
      : `Sem lançamentos pagos em ${periodo}.`
    return (
      <Card>
        <CabecalhoCard titulo={titulo} />
        <EmptyState icon={ChartColumn} message={mensagemVazio} />
        {avisoFalha}
      </Card>
    )
  }

  const anosDoGrafico = rotuloAnos(serie.anos)
  // Chave do gráfico mensal: muda quando o CONJUNTO de anos muda → remonta os `<Bar>` na ordem do JSX
  // (ver o aviso sobre a ordem das barras no topo do arquivo).
  const chaveDosAnos = serie.anos.join('-')

  return (
    <Card>
      <CabecalhoCard titulo={titulo} />

      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="min-w-0 flex-1">
          {/* `height` fixo no pai — `min-height` faz o ResponsiveContainer medir 0 e o gráfico some. */}
          <div role="img" aria-label={`Despesas mensais de marketing, janeiro a dezembro, por ano: ${anosDoGrafico}`}>
            <ResponsiveContainer width="100%" height={ALTURA}>
              <BarChart key={chaveDosAnos} data={dadosMensais} margin={chartMargins.default} barGap={2} barCategoryGap="16%">
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
                {/* Do mais antigo ao mais recente — vale como ordem visual SÓ porque o BarChart
                    (`key={chaveDosAnos}`) remonta quando o conjunto de anos muda. */}
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
                    <CustomTooltip
                      {...p}
                      labelFormatter={l => tooltipTotalPorRotulo.get(String(l)) ?? String(l)}
                      formatter={(v) => [fmtBRL2(v), 'Total']}
                    />
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

      {avisoFalha}
    </Card>
  )
}
