'use client'

import {
  ResponsiveContainer, ComposedChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts'
import { fmtMi } from '@/lib/fmt'

export interface FluxoMensalRow {
  mes:           string
  grupo_categoria: string
  tipo:          'realizado' | 'previsto'
  valor_total:   number
}

interface ChartPoint {
  label:    string
  entrada:  number
  saida:    number
  saldo:    number
  previsto: boolean
}

const MESES_ABREV = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

function fmtMesLabel(mes: string): string {
  const [y, m] = mes.split('-')
  return `${MESES_ABREV[parseInt(m) - 1]}/${y.slice(2)}`
}

function agregadoPorMes(rows: FluxoMensalRow[]): ChartPoint[] {
  const byMes = new Map<string, ChartPoint>()
  for (const r of rows) {
    if (!byMes.has(r.mes)) {
      byMes.set(r.mes, { label: fmtMesLabel(r.mes), entrada: 0, saida: 0, saldo: 0, previsto: r.tipo === 'previsto' })
    }
    const pt = byMes.get(r.mes)!
    if (r.valor_total > 0) pt.entrada += r.valor_total
    else                   pt.saida  += Math.abs(r.valor_total)
    if (r.tipo === 'previsto') pt.previsto = true
  }
  for (const pt of byMes.values()) {
    pt.saldo = pt.entrada - pt.saida
  }
  return Array.from(byMes.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => v)
}

interface TooltipProps {
  active?: boolean
  payload?: Array<{ name: string; value: number; fill: string }>
  label?: string
}

function FluxoTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-zinc-200 rounded-lg shadow-md p-3 text-xs min-w-[160px]">
      <p className="font-semibold text-zinc-700 mb-2">{label}</p>
      {payload.map(p => (
        <div key={p.name} className="flex justify-between gap-4 mb-1">
          <span style={{ color: p.fill }}>{p.name === 'entrada' ? 'Entradas' : 'Saídas'}</span>
          <span className="font-medium text-zinc-700">{fmtMi(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

interface Props {
  rows: FluxoMensalRow[]
}

const COR_ENTRADA = '#0091B3'
const COR_SAIDA   = '#D9A23F'

export default function FluxoMensalChart({ rows }: Props) {
  const data = agregadoPorMes(rows)

  if (!data.length) {
    return (
      <div className="h-56 flex items-center justify-center text-sm text-zinc-400">
        Sem dados para o período selecionado
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-3">
        <div className="flex items-center gap-1.5 text-xs text-zinc-500">
          <span className="w-3 h-3 rounded-sm inline-block" style={{ background: COR_ENTRADA }} />
          Entradas
        </div>
        <div className="flex items-center gap-1.5 text-xs text-zinc-500">
          <span className="w-3 h-3 rounded-sm inline-block" style={{ background: COR_SAIDA }} />
          Saídas
        </div>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={data} barGap={2} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={v => fmtMi(v as number)} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={72} />
          <Tooltip content={<FluxoTooltip />} />
          <ReferenceLine y={0} stroke="#e4e4e7" />
          <Bar dataKey="entrada" name="entrada" fill={COR_ENTRADA} radius={[3, 3, 0, 0]} maxBarSize={36} opacity={1} />
          <Bar dataKey="saida"   name="saida"   fill={COR_SAIDA}   radius={[3, 3, 0, 0]} maxBarSize={36} opacity={0.85} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
