'use client'

import { useMemo, type ReactNode } from 'react'
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
import { TONS_DO_ANO, coresPorAno } from '@/lib/marketing/cores'
import { escalaSerie } from '@/lib/marketing/escala'
import { MESES_ABREV, rotuloAnos } from '@/lib/marketing/periodo'
import CabecalhoCard from './cabecalho-card'

// Gráfico "mensal por ano" COMPARTILHADO (v6.5.0): jan–dez, UMA BARRA POR ANO selecionado lado a lado
// (do mais antigo, à esquerda, ao mais recente, à direita), e ao lado direito o painel "Total por ano" —
// um mini-gráfico com uma barra por ano (o total do ano no seu recorte), numa escala PRÓPRIA: o total
// anual é ~12× o mensal e dividir o eixo com os meses amassaria os meses. Nasceu como o "Despesas
// mensais" de Marketing (`marketing/gastos/serie-mensal.tsx`, hoje um adaptador fino) e serve também ao
// Financeiro · Geral — um componente só, para as duas telas não divergirem. A entrada é GENÉRICA: quem
// chama entrega, por ano, 12 valores e o total; nada aqui conhece lançamento, recorte ou RPC.
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
// Ano PARCIAL no painel Total: o rótulo "2026*" e o tooltip, que diz o recorte ("2026 · jan–out") — a
// mesma convenção do card de proporção. Sem nota escrita embaixo do painel: o asterisco + o tooltip bastam.
//
// ⚠️ ORDEM DAS BARRAS DENTRO DE CADA MÊS — a armadilha que NÃO dá erro. O Recharts 3 dá a posição de
// cada `<Bar>` pela ordem em que ele foi REGISTRADO no store do gráfico (um `push` quando o Bar
// monta), e NÃO pela ordem do JSX. A página navega no mesmo pathname (filtro de ano), então o
// gráfico continua montado: ao ligar uma pill de ano mais antigo, o `<Bar key=2025>` novo monta
// DEPOIS do 2026 que já existia e entra no fim do registro — e a barra mais antiga aparecia à
// DIREITA do mais recente (2026, 2025, 2024) sempre que a seleção crescia a partir do default.
// Recarregar a URL já com todos os anos desenhava certo, por isso o bug parecia intermitente. A
// cura é REMONTAR o gráfico quando o CONJUNTO de anos muda (`key` do BarChart = os anos): todos os
// Bars montam de novo, na ordem do JSX — do mais antigo ao mais recente (por isso `series` é
// ordenada por ano aqui dentro, qualquer que seja a ordem de entrada). A legenda e o painel Total
// não têm o problema (a legenda é HTML na ordem de `series`; o Total é um único `<Bar>` com um
// `<Cell>` por ano, posicionado pelo índice do dado).
//
// VALORES NEGATIVOS — a armadilha que não dá erro: o domínio default do Recharts ancora em zero e
// CORTA os negativos. O domínio e os ticks de CADA gráfico saem de `escalaSerie` (passo redondo), o
// zero é desenhado por `ChartZeroLine`, e o eixo mostra o sinal (`abs: false`) — a mesma grandeza
// não pode aparecer com dois sinais em telas vizinhas. Serve igual a série toda positiva.
//
// EIXO INVERTIDO (`invertido`, v6.4.2, decisão do Yan): série NEGATIVA por natureza (despesa, prejuízo)
// usa `invertido: true`, como a grade de proporção da DRE — o valor, negativo, SOBE a partir do zero
// ("mais gasto" = "mais alto") e o rótulo do eixo continua negativo; um estorno que deixe o mês positivo
// desce. Série POSITIVA (volume antecipado) usa `invertido: false`: eixo normal.
//
// Falha parcial: o gráfico desenha os anos que carregaram e AVISA dos ausentes (`anosFalha` — ele não
// soma anos; cada barra é de um ano só). Falha total (nenhum ano em `series`): UM aviso só, no lugar do
// gráfico, com a mensagem de quem chama. Sem dado: `mensagemSemDados` (quem chama decide — "zero" não
// é "sem lançamentos", então o critério não cabe aqui) troca os gráficos por um estado vazio.

const ALTURA = 260

/** Um ano da série. */
export interface SerieDoAno {
  ano: number
  /** 12 valores, jan–dez. `null` = mês ainda não alcançado naquele ano (sem barra); zero é zero real. */
  valores: readonly (number | null)[]
  /** Total do ano no seu recorte (a barra do painel "Total por ano"). */
  total: number
  /** O recorte do ano é menor que jan–dez: o rótulo no painel Total leva `*` e o tooltip diz o recorte. */
  parcial?: boolean
  /** Texto do recorte do ano parcial ("jan–out"), para o tooltip do painel Total ("2026 · jan–out"). */
  rotuloRecorte?: string
  /** Nome do ano na legenda e no tooltip mensal (default: o próprio ano). */
  rotulo?: string
}

interface Props {
  titulo: string
  subtitulo?: ReactNode
  /** O "?" de ajuda colado ao fim do título (`GatilhoAjuda`). */
  ajuda?: ReactNode
  /** TODOS os anos SELECIONADOS (carregados ou não): a cor de cada ano sai da posição aqui. */
  anos: readonly number[]
  /** Os anos que carregaram (qualquer ordem; o componente ordena do mais antigo ao mais recente). */
  series: readonly SerieDoAno[]
  /** Anos selecionados cujo dado falhou: o gráfico os nomeia num aviso e os deixa de fora. */
  anosFalha: readonly number[]
  /** Série negativa por natureza: eixo invertido (o valor sobe a partir do zero), rótulo com sinal. */
  invertido: boolean
  /** Frase para leitor de tela do gráfico mensal; o componente acrescenta ": 2025 + 2026". */
  descricaoMensal: string
  /** Idem para o painel Total. */
  descricaoTotal: string
  /** Mensagem de falha total (`series` vazia): quem chama sabe nomear os anos e o que faltou. */
  mensagemFalhaTotal: string
  /** Presente = não há dado a desenhar nos anos carregados: mostra este estado vazio no lugar dos gráficos. */
  mensagemSemDados?: string
  /** Prefixo do item no tooltip mensal ("Volume 2026"). Sem ele, o item é só o ano. */
  nomeSerie?: string
}

export default function GraficoMensalPorAno({
  titulo, subtitulo, ajuda, anos, series, anosFalha, invertido, descricaoMensal, descricaoTotal,
  mensagemFalhaTotal, mensagemSemDados, nomeSerie,
}: Props) {
  // Do mais antigo ao mais recente: a ordem das barras (ver o aviso no topo do arquivo).
  const ordenadas = useMemo(() => [...series].sort((a, b) => a.ano - b.ano), [series])
  const anosCarregados = useMemo(() => ordenadas.map(s => s.ano), [ordenadas])
  // Cor por ano pela posição entre os SELECIONADOS; `anosCarregados` são só os que carregaram.
  const corPorAno = useMemo(() => coresPorAno(anos), [anos])
  const cores = useMemo(
    () => anosCarregados.map(a => corPorAno.get(a) ?? TONS_DO_ANO[TONS_DO_ANO.length - 1]),
    [anosCarregados, corPorAno],
  )
  const rotuloPorAno = useMemo(
    () => new Map(ordenadas.map(s => [String(s.ano), s.rotulo ?? String(s.ano)])),
    [ordenadas],
  )

  // Um ponto por mês; uma chave por ano (`dataKey` = o ano). `null` = sem barra.
  const dadosMensais = useMemo(
    () => MESES_ABREV.map((label, i) => ({
      label,
      ...Object.fromEntries(ordenadas.map(s => [String(s.ano), s.valores[i]])),
    })),
    [ordenadas],
  )
  // Painel Total: o rótulo do ano parcial leva `*`; o tooltip diz o recorte ("2026 · jan–out").
  const dadosTotal = useMemo(
    () => ordenadas.map(s => ({
      label: s.parcial ? `${s.ano}*` : String(s.ano),
      rotuloTooltip: s.parcial && s.rotuloRecorte ? `${s.ano} · ${s.rotuloRecorte}` : String(s.ano),
      valor: s.total,
      cor: corPorAno.get(s.ano) ?? TONS_DO_ANO[TONS_DO_ANO.length - 1],
    })),
    [ordenadas, corPorAno],
  )
  const tooltipTotalPorRotulo = useMemo(
    () => new Map(dadosTotal.map(d => [d.label, d.rotuloTooltip])),
    [dadosTotal],
  )

  // Série negativa por natureza (eixo invertido) → o eixo mínimo da série toda zero também é negativo.
  const sinal = invertido ? 'negativo' : 'positivo'
  const escalaMeses = useMemo(
    () => escalaSerie(ordenadas.flatMap(s => s.valores), sinal),
    [ordenadas, sinal],
  )
  const escalaTotal = useMemo(
    () => escalaSerie(ordenadas.map(s => s.total), sinal),
    [ordenadas, sinal],
  )

  // O aviso dos anos ausentes — o MESMO em todos os ramos que tenham ao menos um ano carregado.
  const avisoFalha = anosFalha.length > 0 ? (
    <ErroCarregamento
      mensagem={`Não foi possível carregar ${rotuloAnos(anosFalha)}; fora do gráfico.`}
      className="mt-2 justify-center"
    />
  ) : null

  // Falha total (nenhum ano carregou): UM aviso só.
  if (ordenadas.length === 0) {
    return (
      <Card>
        <CabecalhoCard titulo={titulo} subtitulo={subtitulo} ajuda={ajuda} />
        <ErroCarregamento mensagem={mensagemFalhaTotal} />
      </Card>
    )
  }

  if (mensagemSemDados !== undefined) {
    return (
      <Card>
        <CabecalhoCard titulo={titulo} subtitulo={subtitulo} ajuda={ajuda} />
        <EmptyState icon={ChartColumn} message={mensagemSemDados} />
        {avisoFalha}
      </Card>
    )
  }

  const anosDoGrafico = rotuloAnos(anosCarregados)
  // Chave do gráfico mensal: muda quando o CONJUNTO de anos muda → remonta os `<Bar>` na ordem do JSX
  // (ver o aviso sobre a ordem das barras no topo do arquivo).
  const chaveDosAnos = anosCarregados.join('-')

  return (
    <Card>
      <CabecalhoCard titulo={titulo} subtitulo={subtitulo} ajuda={ajuda} />

      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="min-w-0 flex-1">
          {/* `height` fixo no pai — `min-height` faz o ResponsiveContainer medir 0 e o gráfico some. */}
          <div role="img" aria-label={`${descricaoMensal}: ${anosDoGrafico}`}>
            <ResponsiveContainer width="100%" height={ALTURA}>
              <BarChart key={chaveDosAnos} data={dadosMensais} margin={chartMargins.default} barGap={2} barCategoryGap="16%">
                {ChartGrid()}
                {ChartXAxisCategoria('label', { interval: 0 })}
                {ChartYAxisBRL({ abs: false, invertido, width: 76, domain: escalaMeses.domain, ticks: escalaMeses.ticks })}
                {ChartZeroLine()}
                <Tooltip
                  content={p => (
                    <CustomTooltip
                      {...p}
                      // Mês que o ano ainda não alcançou é `null`: sem linha no tooltip (senão "R$ 0,00").
                      payload={p.payload?.filter(e => e.value != null)}
                      showColorDot
                      formatter={(v, name) => {
                        const item = rotuloPorAno.get(name) ?? name
                        return [fmtBRL2(v), nomeSerie ? `${nomeSerie} ${item}` : item]
                      }}
                    />
                  )}
                  cursor={{ fill: 'var(--surface-soft)' }}
                />
                {/* Do mais antigo ao mais recente — vale como ordem visual SÓ porque o BarChart
                    (`key={chaveDosAnos}`) remonta quando o conjunto de anos muda. */}
                {anosCarregados.map((ano, i) => (
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
          <ChartLegend items={ordenadas.map((s, i) => ({ label: s.rotulo ?? String(s.ano), color: cores[i], type: 'rect' as const }))} />
        </div>

        {/* Painel "Total": escala PRÓPRIA, uma barra por ano, mesmas cores. */}
        <div className="shrink-0 lg:w-64 lg:border-l lg:border-[var(--border)] lg:pl-6">
          <div role="img" aria-label={`${descricaoTotal}: ${anosDoGrafico}`}>
            <ResponsiveContainer width="100%" height={ALTURA}>
              <BarChart data={dadosTotal} margin={chartMargins.default} barCategoryGap="22%">
                {ChartGrid()}
                {ChartXAxisCategoria('label', { interval: 0 })}
                {ChartYAxisBRL({ abs: false, invertido, width: 76, domain: escalaTotal.domain, ticks: escalaTotal.ticks })}
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
