'use client'

import {
  ResponsiveContainer, ComposedChart, Bar, Rectangle, Tooltip, ReferenceLine,
} from 'recharts'
import type { BarShapeProps } from 'recharts'
import {
  ChartGrid, ChartZeroLine, ChartXAxisCategoria, ChartYAxisBRL,
  ChartLegend, fluxoColors, chartSeries, chartColors,
} from '@/components/charts'
import { fmtBRL } from '@/lib/fmt'
import type { HorizonteData } from '@/lib/fluxo/rpc-fluxo'

// Horizonte Previsto (lançado) (v5.2.0/Onda 1, ajuste do checkpoint) — 16 categorias:
// 12 meses ROLANTES em layout de calendário (jan–dez: mês < mês-corrente mostra o mesmo
// mês do ANO SEGUINTE já rolado; mês-corrente é parcial; mês > corrente é o mês cheio do
// ano corrente), um SPACER (respiro visual) e os 2 anos consolidados SEM dupla contagem
// (ano+1 só os meses não exibidos nas colunas; ano+2 cheio). UMA série de barras (liq,
// já assinado por `fato_fluxo` — não renegar) colorida por SINAL: superávit (verde) /
// déficit (vermelho) — EXCETO os meses "rolados" do ano seguinte (ainda não é o horizonte
// do ano corrente, é o próximo ciclo de calendário já lançado), que ficam em CINZA NEUTRO
// (`chartSeries.neutral`) independente do sinal. As 2 barras anuais consolidadas sempre
// coloridas pelo sinal.

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

interface Props {
  data: HorizonteData
}

type Cor = 'sup' | 'def' | 'neutro' | null

interface ChartPoint {
  l:    string
  e:    number | null
  sVal: number | null
  liq:  number | null
  n:    number
  cor:  Cor
}

interface TooltipProps {
  active?:  boolean
  payload?: Array<{ payload: ChartPoint }>
}

function HorizonteTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  if (d.liq === null) return null // spacer — sem tooltip
  return (
    <div style={{
      background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 8,
      padding: '12px 16px', boxShadow: '0 4px 12px rgba(45,42,38,0.08)', minWidth: 190,
    }}>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>{d.l}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <TooltipRow label="Entradas"     value={fmtBRL(d.e ?? 0)} />
        <TooltipRow label="Saídas"       value={fmtBRL(Math.abs(d.sVal ?? 0))} />
        <TooltipRow label="Líquido"      value={fmtBRL(d.liq)} />
        <TooltipRow label="Lançamentos"  value={String(d.n)} />
      </div>
    </div>
  )
}

function TooltipRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
      <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  )
}

function corDe(p: ChartPoint): string {
  if (p.cor === 'neutro') return chartSeries.neutral
  if (p.cor === 'def')    return fluxoColors.saida
  return fluxoColors.entrada
}

// Barras mais largas e mais arredondadas que o padrão `column` (pedido do checkpoint —
// 16 categorias num card full-width comportam barras generosas, como na referência).
// Ponta LIVRE sempre arredondada, inclusive nos déficits que DESCEM: `[r,r,0,0]`
// arredonda a ponta oposta à linha do zero nos dois sentidos, porque o Recharts inverte
// o `ySign` na barra negativa (a "ponta de baixo" só arredonda com `[0,0,r,r]` na barra
// POSITIVA; na negativa `[0,0,r,r]` grudaria no EIXO). Mesma regra de `barRadius.top`.
const RAIO_LIVRE: [number, number, number, number] = [6, 6, 0, 0]

// Cada barra é COLORIDA por SINAL individualmente (superávit/déficit/rolado) — `shape` no
// lugar de `fill` fixo no `<Bar>`, já que a COR muda por categoria (o raio é constante:
// sempre a ponta livre). `Cell` não aceita `radius` na tipagem do recharts; `shape` +
// `Rectangle` é o caminho suportado. Definido no MÓDULO (não no render) — só depende do
// `payload` da própria barra, sem closure.
function BarraHorizonte(props: BarShapeProps) {
  const p = props.payload as ChartPoint
  return <Rectangle {...props} fill={corDe(p)} radius={RAIO_LIVRE} />
}

export default function HorizontePrevisto({ data }: Props) {
  if (!data.meses.length) {
    return (
      <div className="rounded-xl shadow-sm bg-white p-5">
        <h3 className="text-base font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Horizonte Previsto</h3>
        <div className="h-40 flex items-center justify-center text-sm text-zinc-400">Sem dados</div>
      </div>
    )
  }

  // Meses < mês-corrente já rolam para o ano seguinte (ex.: Jan/27..Jun/27 em jul/26) —
  // esses ficam em cinza neutro; o resto (mês-corrente..dez, ano corrente) é colorido
  // pelo sinal, igual às barras anuais.
  const pontosMes: ChartPoint[] = [...data.meses]
    .sort((a, b) => a.mes - b.mes)
    .map(m => ({
      l:    `${MESES[m.mes - 1]}/${String(m.ano).slice(-2)}${m.parcial ? '*' : ''}`,
      e:    m.e,
      sVal: m.s,
      liq:  m.liq,
      n:    m.n,
      cor:  m.ano > data.ano_corrente ? 'neutro' : (m.liq >= 0 ? 'sup' : 'def'),
    }))

  const spacer: ChartPoint = { l: '', e: null, sVal: null, liq: null, n: 0, cor: null }

  const pontosAno: ChartPoint[] = [...data.anos]
    .sort((a, b) => a.ano - b.ano)
    .map(a => ({
      l:    `${a.ano}${a.resto ? '*' : ''}`,
      e:    a.e,
      sVal: a.s,
      liq:  a.liq,
      n:    a.n,
      cor:  a.liq >= 0 ? 'sup' : 'def',
    }))

  const chartData: ChartPoint[] = [...pontosMes, spacer, ...pontosAno]

  // Escala ASSIMÉTRICA (pedido do checkpoint): mais espaço p/ BAIXO, onde os déficits dominam.
  // `teto` = maior |liq| arredondado p/ cima num múltiplo "redondo" (2×passo decimal) — com os
  // dados atuais dá 8 Mi. Base = −teto (−8 Mi); topo = metade (+4 Mi), mas nunca menor que o maior
  // superávit real (anti-clip, caso um mês positivo passe de teto/2). Ticks a cada teto/2: +4/0/−4/−8.
  const maxAbs = Math.max(...chartData.map(p => Math.abs(p.liq ?? 0)), 1)
  const passo  = Math.pow(10, Math.floor(Math.log10(maxAbs)))
  const teto   = Math.ceil(maxAbs / (2 * passo)) * (2 * passo)
  const maxPos = Math.max(...chartData.map(p => Math.max(p.liq ?? 0, 0)), 0)
  const topo   = Math.max(teto / 2, Math.ceil(maxPos / passo) * passo)
  const ticksY = [topo, 0, -teto / 2, -teto]

  return (
    <div className="rounded-xl shadow-sm bg-white p-5">
      <h3 className="text-base font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Horizonte Previsto</h3>

      <ResponsiveContainer width="100%" height={260}>
        {/* top: 20 (não 8) p/ o rótulo do tick do TOPO (+4 Mi) não ser cortado na borda —
            o tick fica na aresta superior do plot e o texto centrado precisa de folga. */}
        <ComposedChart data={chartData} margin={{ top: 20, right: 16, bottom: 0, left: 0 }}>
          {ChartGrid()}
          {ChartXAxisCategoria('l', { interval: 0, angle: -45, fontSize: 10, height: 36 })}
          {ChartYAxisBRL({ domain: [-teto, topo], ticks: ticksY })}
          {ChartZeroLine()}
          {/* Divisor tracejado entre Dez e os anos consolidados — ancorado no slot do spacer. */}
          <ReferenceLine x="" stroke={chartColors.axisTick} strokeDasharray="4 4" />
          <Tooltip content={<HorizonteTooltip />} />
          <Bar dataKey="liq" name="liq" barSize={30} shape={BarraHorizonte} />
        </ComposedChart>
      </ResponsiveContainer>

      <ChartLegend
        items={[
          { label: 'Superávit',              color: fluxoColors.entrada,   type: 'rect' },
          { label: 'Déficit',                color: fluxoColors.saida,     type: 'rect' },
          { label: 'Correspondente ao ano seguinte', color: chartSeries.neutral, type: 'rect' },
        ]}
      />
    </div>
  )
}
