'use client'

import { useMemo, useState } from 'react'
import { ResponsiveContainer, ComposedChart, Area, Bar, Line, Cell, Tooltip, ReferenceLine } from 'recharts'
import type { AcumuladoWeddings } from '@/types/api'
import { fmtBRL, fmtMi } from '@/lib/fmt'
import { fatiarJanela } from '@/lib/weddings/janela-fluxo'
import { curvasFloat, type PontoFloat } from '@/lib/weddings/float-virtual'
import SliderHorizonte from '@/components/shared/slider-horizonte'
import {
  ChartGrid, ChartZeroLine, ChartXAxisMes, ChartYAxisBRL,
  ChartLegend, CustomTooltip,
  chartColors, chartSeries, chartMargins, fluxoColors, barRadius, barSizes, FUTURE_OPACITY,
  strokeWidths, dashArrays,
  type ChartLegendItem,
} from '@/components/charts'

// Card ÚNICO do Fluxo de Caixa de Weddings (v5.4.2/M3).
//
// Os dois gráficos que antes eram cards separados (Fluxo de Caixa Mensal e
// Acumulado de Recebimentos e Pagamentos) viraram um card só, com o SLIDER DE
// JANELA entre eles funcionando como eixo de tempo compartilhado: os dois
// obedecem exatamente à mesma janela, sempre.
//
// O slider não refetcha nada — a RPC devolve a janela larga (37 atrás + 36 à
// frente) uma vez e `fatiarJanela` recorta no cliente, então arrastar é
// instantâneo. O limite de 36 meses em cada direção é decisão do Yan; o 37º mês
// do passado é a margem técnica do rebase, não uma posição alcançável pelo
// slider. Todo acumulado REINICIA na borda esquerda da janela, e a
// referência de saídas é recalculada dentro dela (as duas coisas andam juntas:
// com o acumulado reiniciando, uma referência absoluta sairia de escala e
// achataria o gráfico). A matemática e seus 23 testes vivem em
// @/lib/weddings/janela-fluxo.
//
// Cores: identidade Welcome turquesa/mostarda (`--chart-fluxo-entrada/saida`),
// a exceção deliberada da visão principal de Weddings (ADR-0103) — não é
// esquecimento do padrão `--positive`/`--negative` do Financeiro.

const COR_ENTRADA   = 'var(--chart-fluxo-entrada)'
const COR_SAIDA     = 'var(--chart-fluxo-saida)'
const COR_RESULTADO = fluxoColors.resultado

const JANELA_PADRAO_ATRAS  = 24
const JANELA_PADRAO_FRENTE = 18

const LEGENDA_MENSAL: ChartLegendItem[] = [
  { label: 'Entrada (efetivada)', color: COR_ENTRADA, type: 'rect' },
  { label: 'Entrada (prevista)',  color: COR_ENTRADA, type: 'rect', opacity: FUTURE_OPACITY },
  { label: 'Saída (efetivada)',   color: COR_SAIDA,   type: 'rect' },
  { label: 'Saída (prevista)',    color: COR_SAIDA,   type: 'rect', opacity: FUTURE_OPACITY },
  { label: 'Resultado mensal',    color: COR_RESULTADO, type: 'line' },
  { label: 'Resultado negativo',  color: fluxoColors.resultadoNegativo, type: 'dot' },
]

const LEGENDA_ACUM: ChartLegendItem[] = [
  { label: 'Entradas acum. (efetivado)', color: COR_ENTRADA, type: 'rect' },
  { label: 'Entradas acum. (projetado)', color: COR_ENTRADA, type: 'rect', opacity: FUTURE_OPACITY },
  { label: 'Saídas acum. (efetivado)',   color: COR_SAIDA,   type: 'rect' },
  { label: 'Saídas acum. (projetado)',   color: COR_SAIDA,   type: 'rect', opacity: FUTURE_OPACITY },
  { label: 'Total previsto de saídas na janela', color: fluxoColors.resultadoNegativo, type: 'line', dashed: true },
]

// v5.5.0: sólido = real, tracejado = teórico — a convenção da skill `graficos`.
const COR_TEORICO = 'var(--teorico)'
const LEGENDA_FLOAT: ChartLegendItem[] = [
  { label: 'Saldo real (caixa da operação)',    color: COR_RESULTADO, type: 'line' },
  { label: 'Conta virtual a 100% do CDI',       color: COR_TEORICO, type: 'line', dashed: true },
  { label: 'Rendimento acumulado na janela',    color: COR_TEORICO, type: 'rect', opacity: 0.18 },
]

const plural = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`

/** Rótulo da janela: "30 meses passados + 18 meses futuros". */
function rotuloJanela(atras: number, frente: number): string {
  return `${plural(atras, 'mês passado', 'meses passados')} + ${plural(frente, 'mês futuro', 'meses futuros')}`
}

/** Riscos MAIORES da régua: um a cada 6 meses (semestres), como na referência. */
const MARCOS = [6, 12, 18, 24, 30, 36] as const

interface SliderJanelaProps {
  atras: number
  frente: number
  maxAtras: number
  maxFrente: number
  onAtras: (v: number) => void
  onFrente: (v: number) => void
}

/**
 * Slider de janela ancorado no "hoje": à esquerda quantos meses para trás, à
 * direita quantos para frente, passo de 1 mês.
 *
 * Segue a GEOMETRIA do slider de horizonte do Fluxo de Caixa (pedido do Yan) pelo
 * primitivo `SliderHorizonte`: régua de riscos com marcos semestrais e o valor em
 * texto ao lado. Sem rótulo "Horizonte de tempo:" e com o trilho em DOURADO
 * (`--brand`) — os dois ajustes pedidos depois de ver a tela; a direção já é dita
 * pela posição relativa ao "HOJE", então os extremos dizem só "24 meses".
 *
 * São DOIS inputs em vez de um controle de duas alças: cada lado é independente e
 * assim teclado/leitor de tela funcionam de graça. O lado do passado é `espelhado`
 * — zero junto do "hoje", arrastar para a esquerda estende a janela para trás, de
 * modo que o gesto acompanhe o eixo do tempo.
 */
function SliderJanela({ atras, frente, maxAtras, maxFrente, onAtras, onFrente }: SliderJanelaProps) {
  return (
    <div className="px-2 py-4 my-7 border-y border-zinc-100">
      <div className="flex items-start gap-3">
        <span className="text-2xs text-zinc-500 tabular-nums w-[72px] shrink-0 text-right pt-0.5">
          {plural(atras, 'mês', 'meses')}
        </span>
        <SliderHorizonte
          className="flex-1 min-w-[120px]"
          valor={atras} max={maxAtras} onChange={onAtras}
          maiores={MARCOS} espelhado corTrilho="var(--brand)"
          ariaLabel="Meses para trás na janela dos gráficos"
          ariaValueText={plural(atras, 'mês atrás', 'meses atrás')}
        />
        <span
          className="text-2xs font-semibold shrink-0 px-1.5 py-0.5 rounded mt-0.5"
          style={{ background: 'var(--brand-soft)', color: 'var(--brand-deep)' }}
        >
          HOJE
        </span>
        <SliderHorizonte
          className="flex-1 min-w-[120px]"
          valor={frente} max={maxFrente} onChange={onFrente}
          maiores={MARCOS} corTrilho="var(--brand)"
          ariaLabel="Meses para frente na janela dos gráficos"
          ariaValueText={plural(frente, 'mês à frente', 'meses à frente')}
        />
        <span className="text-2xs text-zinc-500 tabular-nums w-[72px] shrink-0 pt-0.5">
          {plural(frente, 'mês', 'meses')}
        </span>
      </div>
    </div>
  )
}

interface Props {
  data: AcumuladoWeddings | null
  operacaoLabel?: string
  /**
   * v5.5.0 — série mensal do CDI (fração decimal), da `get_taxas_cdi`.
   * Ausente ou vazia ⇒ o gráfico do float simplesmente não aparece.
   *
   * As TAXAS viajam, não a curva pronta: juro é composto, então a curva depende de
   * onde a série começou, e o slider rebaseia a borda a cada arrasto. Recortar uma
   * curva pronta daria o desenho errado em toda posição menos a default.
   *
   * É um ARRAY, não um Map: o valor atravessa a fronteira Server → Client, e array
   * de objetos simples é o formato que não depende de como o serializador do RSC
   * trata estruturas ricas. O Map é montado aqui.
   */
  taxasCdi?: { mes: string; taxa: number | null }[]
}

export default function FluxoCaixaCard({ data, operacaoLabel, taxasCdi }: Props) {
  const [atras,  setAtras]  = useState(JANELA_PADRAO_ATRAS)
  const [frente, setFrente] = useState(JANELA_PADRAO_FRENTE)

  // O fallback `?? []` fica DENTRO do useMemo: como literal na dependência ele
  // criaria um array novo a cada render e o memo nunca seguraria — o slider
  // arrastando é exatamente o caminho quente que precisa dele.
  const janela = useMemo(() => fatiarJanela(data?.meses ?? [], atras, frente), [data, atras, frente])

  const { pontos, totalSaidasJanela, mesHoje, maxAtras, maxFrente } = janela

  // v5.5.0: as duas curvas do float são RECOMPUTADAS a cada janela, a partir do
  // fluxo mensal que `fatiarJanela` já derivou — não há refetch ao arrastar o
  // slider (invariante 7). O memo depende de `pontos`, que já é memoizado.
  const taxaPorMes = useMemo(
    () => new Map((taxasCdi ?? []).map(t => [t.mes, t.taxa])),
    [taxasCdi],
  )
  // v5.5.1: `rendimentoDaJanela` deixou de ser chamado aqui — o total "na janela"
  // saiu do cabeçalho a pedido do Yan. O helper e seus testes seguem em
  // `lib/weddings/float-virtual`: a conta continua correta e volta a ser útil se o
  // número for reintroduzido; apagá-lo seria perder a definição junto com a exibição.
  const curvas = useMemo(() => curvasFloat(pontos, taxaPorMes), [pontos, taxaPorMes])

  // Rótulo VERDADEIRO da janela: derivado do que foi efetivamente recortado, não
  // do estado pedido (que `fatiarJanela` pode ter clampado se a série encurtar
  // ao trocar o filtro de operação).
  const idxHoje = mesHoje ? pontos.findIndex(p => p.mes === mesHoje) : -1
  const atrasEfetivo  = idxHoje >= 0 ? idxHoje : Math.max(0, pontos.length - 1)
  const frenteEfetivo = idxHoje >= 0 ? pontos.length - 1 - idxHoje : 0

  // v5.4.2 (ajuste do Yan): as saídas vão SEMPRE para cima do eixo, lado a lado com
  // as entradas — o botão "Inverter saídas" saiu. Consequência no eixo Y: a metade
  // negativa agora só abriga a LINHA de resultado, então o eixo deixou de poder
  // mostrar valor absoluto (`abs: false` abaixo). Com as saídas descendo, o sinal
  // vinha da direção da barra; agora só o rótulo pode dizer que é negativo.

  if (!pontos.length) {
    return (
      <div className="bg-white rounded-xl shadow-sm px-5 py-4">
        <p className="text-sm text-[var(--text-muted)] text-center py-8">
          {data ? 'Sem lançamentos no período.' : 'Dados não disponíveis.'}
        </p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm px-5 py-4">
      {/* Cabeçalho — sem os totais: eles vivem no card próprio acima (M2). */}
      <div className="mb-4">
        <div className="flex items-baseline gap-2 flex-wrap">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">
            Fluxo de Caixa{operacaoLabel ? ` — ${operacaoLabel}` : ''}
          </h2>
          <span className="text-[13px] text-[var(--text-muted)] tabular-nums">
            {rotuloJanela(atrasEfetivo, frenteEfetivo)}
          </span>
        </div>
      </div>

      {/* ── Gráfico 1: movimento do MÊS ─────────────────────────────────────── */}
      <h3 className="text-base font-semibold text-[var(--text-primary)] mb-2">Mensal</h3>
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={pontos} margin={chartMargins.default} barCategoryGap="25%" barGap={0}>
          {ChartGrid()}
          {ChartXAxisMes('mes')}
          {ChartYAxisBRL({ width: 80, abs: false })}
          {ChartZeroLine()}
          <Tooltip
            content={props => (
              <CustomTooltip
                {...props}
                formatter={(value, name) => {
                  const v = value as number
                  if (name === 'entrada_mes') return [fmtBRL(v), 'Entrada']
                  if (name === 'saida_mes')   return [fmtBRL(v), 'Saída']
                  return [fmtBRL(v), 'Resultado']
                }}
              />
            )}
          />
          <Bar dataKey="entrada_mes" name="entrada_mes" radius={barRadius.top} maxBarSize={barSizes.column} isAnimationActive={false}>
            {pontos.map((p, i) => (
              <Cell key={i} fill={COR_ENTRADA} fillOpacity={p.eh_futuro ? FUTURE_OPACITY : 1} />
            ))}
          </Bar>
          <Bar dataKey="saida_mes" name="saida_mes" radius={barRadius.top} maxBarSize={barSizes.column} isAnimationActive={false}>
            {pontos.map((p, i) => (
              <Cell key={i} fill={COR_SAIDA} fillOpacity={p.eh_futuro ? FUTURE_OPACITY : 1} />
            ))}
          </Bar>
          <Line
            type="monotone" dataKey="resultado_mes" name="resultado_mes"
            stroke={COR_RESULTADO} strokeWidth={2}
            isAnimationActive={false}
            dot={props => {
              const { cx, cy, payload } = props as { cx: number; cy: number; payload: { resultado_mes: number } }
              if (payload.resultado_mes < 0) {
                return <circle key={`d-${cx}-${cy}`} cx={cx} cy={cy} r={4} fill={fluxoColors.resultadoNegativo} stroke="none" />
              }
              return <g key={`d-${cx}-${cy}`} />
            }}
            activeDot={{ r: 3, fill: COR_RESULTADO }}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <ChartLegend items={LEGENDA_MENSAL} align="start" className="ml-18" />

      {/* ── O slider: eixo de tempo COMPARTILHADO pelos dois gráficos ───────── */}
      <SliderJanela
        atras={atras} frente={frente}
        maxAtras={maxAtras} maxFrente={maxFrente}
        onAtras={setAtras} onFrente={setFrente}
      />

      {/* ── Gráfico 2: ACUMULADO (reiniciado na borda da janela) ────────────── */}
      <h3 className="text-base font-semibold text-[var(--text-primary)] mb-2">Acumulado</h3>
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={pontos} margin={chartMargins.withRightLabel}>
          {ChartGrid()}
          {ChartXAxisMes('mes')}
          {ChartYAxisBRL({ width: 80, abs: false })}
          <Tooltip
            content={props => (
              <CustomTooltip
                {...props}
                formatter={(value, name) => [
                  fmtBRL(value as number),
                  name === 'entrada_acum' ? 'Entrada acum.' : 'Saída acum.',
                ]}
              />
            )}
          />
          {/* Referência RECALCULADA na janela — rótulo explícito, porque o número
              deixou de ser o total absoluto da série. */}
          <ReferenceLine
            y={totalSaidasJanela}
            stroke={fluxoColors.resultadoNegativo}
            strokeDasharray="5 4"
            strokeWidth={1.5}
            label={{
              value: `Total previsto de saídas na janela: ${fmtMi(totalSaidasJanela)}`,
              position: 'insideTopRight', fontSize: 10, fill: fluxoColors.resultadoNegativo,
            }}
          />
          {mesHoje && (
            <ReferenceLine
              x={mesHoje}
              stroke={chartSeries.neutral}
              strokeDasharray="4 3"
              label={{ value: 'Hoje', position: 'insideTopLeft', fontSize: 10, fill: chartColors.axisTick }}
            />
          )}
          <Bar dataKey="entrada_acum" name="entrada_acum" radius={barRadius.top} isAnimationActive={false}>
            {pontos.map((p, i) => (
              <Cell key={i} fill={COR_ENTRADA} fillOpacity={p.eh_futuro ? FUTURE_OPACITY : 1} />
            ))}
          </Bar>
          <Bar dataKey="saida_acum" name="saida_acum" radius={barRadius.top} isAnimationActive={false}>
            {pontos.map((p, i) => (
              <Cell key={i} fill={COR_SAIDA} fillOpacity={p.eh_futuro ? FUTURE_OPACITY : 1} />
            ))}
          </Bar>
        </ComposedChart>
      </ResponsiveContainer>
      <ChartLegend items={LEGENDA_ACUM} align="start" className="ml-18" />

      {/* ── Gráfico 3: RENDIMENTO POTENCIAL DO CAIXA LIVRE (v5.5.0/M5) ───────── */}
      {/* v5.5.1 (pedido do Yan): saíram o total "na janela" e o subtítulo; o título
          deixou de falar em "float". ⚠️ O subtítulo carregava a NOTA TEÓRICA e a
          ressalva de que o gap mede o rendimento gerado DENTRO da janela — e não a
          vida inteira da operação, que é o que a coluna da Lista mede. As duas
          informações deixaram de existir aqui: a nota teórica segue na coluna e no
          drawer, e a distinção janela × vida inteira passou a depender do nome
          diferente entre gráfico ("Caixa Livre") e coluna ("Rend. Teórico").
          Decisão de produto registrada como emenda ao ADR-0166. */}
      {curvas.length > 0 && (
        <>
          <h3 className="text-base font-semibold text-[var(--text-primary)] mt-6 mb-2">
            Rendimento Potencial do Caixa Livre
          </h3>
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={curvas} margin={chartMargins.withRightLabel}>
              {ChartGrid()}
              {ChartXAxisMes('mes')}
              {ChartYAxisBRL({ width: 80, abs: false })}
              {ChartZeroLine()}
              <Tooltip
                content={props => {
                  // A faixa é retirada do payload ANTES de formatar. O `dataKey`
                  // dela devolve um PAR [real, virtual] para pintar o intervalo, e
                  // qualquer formatador que receba esse array imprime "R$ NaN".
                  // `tooltipType="none"` na Area NÃO basta nesta versão do Recharts
                  // — testado na tela. O valor honesto do gap vem da linha
                  // invisível `rendimento_acum`, logo abaixo.
                  const payload = (props.payload ?? []).filter(e => e.name !== 'faixa_float')
                  return (
                    <CustomTooltip
                      {...props}
                      payload={payload}
                      formatter={(value, name) => {
                        const v = value as number
                        if (name === 'saldo_real')    return [fmtBRL(v), 'Saldo real']
                        if (name === 'saldo_virtual') return [fmtBRL(v), 'Conta virtual (CDI)']
                        return [fmtBRL(v), 'Rendimento acumulado']
                      }}
                    />
                  )
                }}
              />
              {mesHoje && (
                <ReferenceLine
                  x={mesHoje}
                  stroke={chartSeries.neutral}
                  strokeDasharray="4 3"
                  label={{ value: 'Hoje', position: 'insideTopLeft', fontSize: 10, fill: chartColors.axisTick }}
                />
              )}
              {/* O preenchimento é uma Area de FAIXA (`dataKey` devolvendo [min, max]):
                  é o que pinta o espaço ENTRE as duas curvas em vez de pintar até o
                  eixo. Ele inverte sozinho quando o saldo virtual fica abaixo do real
                  (operação devedora), sem precisar de ramo. */}
              <Area
                dataKey={(d: PontoFloat) => [d.saldo_real, d.saldo_virtual]}
                name="faixa_float"
                stroke="none"
                fill={COR_TEORICO}
                fillOpacity={0.18}
                isAnimationActive={false}
                activeDot={false}
                // `tooltipType="none"` é obrigatório, não decoração: o `dataKey`
                // desta Area devolve um PAR [real, virtual] para pintar a faixa, e
                // o formatador do tooltip recebia esse array e imprimia "R$ NaN".
                // Passou por tsc, lint, build e 744 testes — só apareceu ao passar
                // o mouse sobre o gráfico de verdade.
                tooltipType="none"
              />
              {/* O rendimento acumulado ENTRA no tooltip (o briefing pede os dois
                  saldos + o rendimento do mês), mas não desenha traço nenhum: a
                  informação já está na faixa. Linha invisível é o jeito de a série
                  existir para o tooltip sem poluir o desenho. */}
              <Line
                type="monotone" dataKey="rendimento_acum" name="rendimento_acum"
                stroke="transparent" strokeWidth={0}
                dot={false} activeDot={false} isAnimationActive={false}
                legendType="none"
              />
              {/* Sólido = real; tracejado = teórico/projeção (convenção da skill). */}
              {/* v5.5.1: preto, a MESMA cor da linha "Resultado mensal" do gráfico
                  Mensal (pedido do Yan) — os dois são a leitura do caixa REAL, e
                  usar cores diferentes para a mesma natureza de número dentro do
                  mesmo card fazia parecerem coisas distintas. */}
              <Line
                type="monotone" dataKey="saldo_real" name="saldo_real"
                stroke={COR_RESULTADO} strokeWidth={strokeWidths.line}
                dot={false} activeDot={{ r: 3 }} isAnimationActive={false}
              />
              <Line
                type="monotone" dataKey="saldo_virtual" name="saldo_virtual"
                stroke={COR_TEORICO} strokeWidth={strokeWidths.lineDashed}
                strokeDasharray={dashArrays.reference}
                dot={false} activeDot={{ r: 3 }} isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
          <ChartLegend items={LEGENDA_FLOAT} align="start" className="ml-18" />
        </>
      )}
    </div>
  )
}
