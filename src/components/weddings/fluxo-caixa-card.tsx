'use client'

import { useMemo, useState } from 'react'
import { ResponsiveContainer, ComposedChart, Bar, Line, Cell, Tooltip, ReferenceLine } from 'recharts'
import type { AcumuladoWeddings } from '@/types/api'
import { fmtBRL, fmtMi } from '@/lib/fmt'
import { fatiarJanela } from '@/lib/weddings/janela-fluxo'
import {
  ChartGrid, ChartZeroLine, ChartXAxisMes, ChartYAxisBRL,
  ChartLegend, CustomTooltip,
  chartColors, chartSeries, chartMargins, fluxoColors, barRadius, barSizes, FUTURE_OPACITY,
  type ChartLegendItem,
} from '@/components/charts'

// Card ÚNICO do Fluxo de Caixa de Weddings (v5.4.2/M3).
//
// Os dois gráficos que antes eram cards separados (Fluxo de Caixa Mensal e
// Acumulado de Recebimentos e Pagamentos) viraram um card só, com o SLIDER DE
// JANELA entre eles funcionando como eixo de tempo compartilhado: os dois
// obedecem exatamente à mesma janela, sempre.
//
// O slider não refetcha nada — a RPC devolve uma janela larga (48 atrás + 36 à
// frente) uma vez e `fatiarJanela` recorta no cliente, então arrastar é
// instantâneo. Todo acumulado REINICIA na borda esquerda da janela, e a
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

const plural = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`

/** Rótulo da janela: "24 meses atrás + 18 à frente". */
function rotuloJanela(atras: number, frente: number): string {
  return `${plural(atras, 'mês atrás', 'meses atrás')} + ${frente} à frente`
}

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
 * São DOIS inputs em vez de um controle de duas alças: é o que o eixo pede
 * (cada lado é independente) e ganha teclado/leitor de tela de graça. O input da
 * esquerda usa `dir="rtl"` para que o zero fique junto do "hoje" e arrastar para
 * a esquerda estenda a janela para o passado — o gesto acompanha o eixo.
 */
function SliderJanela({ atras, frente, maxAtras, maxFrente, onAtras, onFrente }: SliderJanelaProps) {
  const comum =
    'w-full h-1.5 cursor-pointer appearance-none rounded-full bg-zinc-200 ' +
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]'

  return (
    <div className="flex items-center gap-3 px-2 py-3 my-1 border-y border-zinc-100">
      <span className="text-2xs text-[var(--text-muted)] tabular-nums w-14 text-right shrink-0">
        −{atras}m
      </span>
      <input
        type="range" dir="rtl"
        min={0} max={maxAtras} step={1} value={Math.min(atras, maxAtras)}
        onChange={e => onAtras(Number(e.target.value))}
        className={comum}
        style={{ accentColor: 'var(--brand)' }}
        aria-label="Meses para trás na janela dos gráficos"
        aria-valuetext={plural(atras, 'mês atrás', 'meses atrás')}
      />
      <span
        className="text-2xs font-semibold shrink-0 px-1.5 py-0.5 rounded"
        style={{ background: 'var(--brand-soft)', color: 'var(--brand-deep)' }}
      >
        HOJE
      </span>
      <input
        type="range"
        min={0} max={maxFrente} step={1} value={Math.min(frente, maxFrente)}
        onChange={e => onFrente(Number(e.target.value))}
        className={comum}
        style={{ accentColor: 'var(--brand)' }}
        aria-label="Meses para frente na janela dos gráficos"
        aria-valuetext={plural(frente, 'mês à frente', 'meses à frente')}
      />
      <span className="text-2xs text-[var(--text-muted)] tabular-nums w-14 shrink-0">
        +{frente}m
      </span>
    </div>
  )
}

interface Props {
  data: AcumuladoWeddings | null
  operacaoLabel?: string
}

export default function FluxoCaixaCard({ data, operacaoLabel }: Props) {
  const [atras,     setAtras]     = useState(JANELA_PADRAO_ATRAS)
  const [frente,    setFrente]    = useState(JANELA_PADRAO_FRENTE)
  const [invertida, setInvertida] = useState(false)

  // O fallback `?? []` fica DENTRO do useMemo: como literal na dependência ele
  // criaria um array novo a cada render e o memo nunca seguraria — o slider
  // arrastando é exatamente o caminho quente que precisa dele.
  const janela = useMemo(() => fatiarJanela(data?.meses ?? [], atras, frente), [data, atras, frente])

  const { pontos, totalSaidasJanela, mesHoje, maxAtras, maxFrente } = janela

  // Rótulo VERDADEIRO da janela: derivado do que foi efetivamente recortado, não
  // do estado pedido (que `fatiarJanela` pode ter clampado se a série encurtar
  // ao trocar o filtro de operação).
  const idxHoje = mesHoje ? pontos.findIndex(p => p.mes === mesHoje) : -1
  const atrasEfetivo  = idxHoje >= 0 ? idxHoje : Math.max(0, pontos.length - 1)
  const frenteEfetivo = idxHoje >= 0 ? pontos.length - 1 - idxHoje : 0

  const dadosMensais = useMemo(
    () => pontos.map(p => ({ ...p, saida_plot: invertida ? p.saida_mes : -p.saida_mes })),
    [pontos, invertida],
  )

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
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-baseline gap-2 flex-wrap">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">
            Fluxo de Caixa{operacaoLabel ? ` — ${operacaoLabel}` : ''}
          </h2>
          <span className="text-[13px] text-[var(--text-muted)] tabular-nums">
            {rotuloJanela(atrasEfetivo, frenteEfetivo)}
          </span>
        </div>
        <button
          onClick={() => setInvertida(v => !v)}
          className="text-xs text-zinc-500 border border-zinc-200 rounded px-2.5 py-1 hover:bg-zinc-50 active:bg-zinc-100 transition-colors shrink-0"
        >
          ⇅ Inverter saídas
        </button>
      </div>

      {/* ── Gráfico 1: movimento do MÊS ─────────────────────────────────────── */}
      <p className="text-xs text-[var(--text-subtle)] mb-1">Movimento do mês</p>
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={dadosMensais} margin={chartMargins.default} barCategoryGap="25%" barGap={0}>
          {ChartGrid()}
          {ChartXAxisMes('mes')}
          {ChartYAxisBRL({ width: 80, abs: true })}
          {ChartZeroLine()}
          <Tooltip
            content={props => (
              <CustomTooltip
                {...props}
                formatter={(value, name) => {
                  const v = value as number
                  if (name === 'entrada_mes')  return [fmtBRL(v), 'Entrada']
                  if (name === 'saida_plot')   return [fmtBRL(Math.abs(v)), 'Saída']
                  return [fmtBRL(v), 'Resultado']
                }}
              />
            )}
          />
          <Bar dataKey="entrada_mes" name="entrada_mes" radius={barRadius.top} maxBarSize={barSizes.column}>
            {dadosMensais.map((p, i) => (
              <Cell key={i} fill={COR_ENTRADA} fillOpacity={p.eh_futuro ? FUTURE_OPACITY : 1} />
            ))}
          </Bar>
          <Bar dataKey="saida_plot" name="saida_plot" radius={barRadius.top} maxBarSize={barSizes.column}>
            {dadosMensais.map((p, i) => (
              <Cell key={i} fill={COR_SAIDA} fillOpacity={p.eh_futuro ? FUTURE_OPACITY : 1} />
            ))}
          </Bar>
          <Line
            type="monotone" dataKey="resultado_mes" name="resultado_mes"
            stroke={COR_RESULTADO} strokeWidth={2}
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
      <p className="text-xs text-[var(--text-subtle)] mb-1">
        Acumulado na janela <span className="text-[var(--text-muted)]">— reinicia na borda esquerda</span>
      </p>
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
          <Bar dataKey="entrada_acum" name="entrada_acum" radius={barRadius.top}>
            {pontos.map((p, i) => (
              <Cell key={i} fill={COR_ENTRADA} fillOpacity={p.eh_futuro ? FUTURE_OPACITY : 1} />
            ))}
          </Bar>
          <Bar dataKey="saida_acum" name="saida_acum" radius={barRadius.top}>
            {pontos.map((p, i) => (
              <Cell key={i} fill={COR_SAIDA} fillOpacity={p.eh_futuro ? FUTURE_OPACITY : 1} />
            ))}
          </Bar>
        </ComposedChart>
      </ResponsiveContainer>
      <ChartLegend items={LEGENDA_ACUM} align="start" className="ml-18" />
    </div>
  )
}
