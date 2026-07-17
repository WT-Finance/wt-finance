'use client'

import {
  ResponsiveContainer, ComposedChart, Bar, Line, Cell, Tooltip,
} from 'recharts'
import {
  ChartGrid, ChartXAxisCategoria, ChartYAxisPct, ChartZeroLine, ChartLegend,
  chartColors, dashArrays, strokeWidths, barSizes,
} from '@/components/charts'
import { fmtMi, fmtBRL, fmtAxisPct } from '@/lib/fmt'
import type { RepasseMensalRow } from '@/lib/fluxo/rpc-fluxo'

// Repasse Mensal (v5.2.0/Onda 1) — repasse BRUTO (Entrada Clientes − Pagto Fornecedor)
// e a margem de repasse (%) mês a mês, com a margem do mesmo mês do ano anterior como
// referência tracejada (SÓLIDO = real, TRACEJADO = referência — convenção da plataforma).

const MESES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

interface Props {
  rows: RepasseMensalRow[]
}

interface ChartPoint {
  mesLabel: string
  ent:      number
  sal:      number
  pct:      number | null
  pct_ant:  number | null
}

interface TooltipProps {
  active?:  boolean
  payload?: Array<{ payload: ChartPoint }>
}

function RepasseTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div style={{
      background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 8,
      padding: '12px 16px', boxShadow: '0 4px 12px rgba(45,42,38,0.08)', minWidth: 190,
    }}>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>{d.mesLabel}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <TooltipRow label="Entrada Clientes" value={fmtBRL(d.ent)} />
        <TooltipRow label="Repasse (bruto)"  value={fmtBRL(d.sal)} />
        <TooltipRow label="Margem"           value={d.pct == null ? 'sem base comparável' : fmtAxisPct(d.pct, 1)} />
        {d.pct_ant != null && (
          <TooltipRow label="Margem (ano ant.)" value={fmtAxisPct(d.pct_ant, 1)} />
        )}
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

export default function RepasseMensal({ rows }: Props) {
  if (!rows.length) {
    return (
      <div className="rounded-xl shadow-sm bg-white p-5">
        <h3 className="text-base font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Repasse Mensal</h3>
        <div className="h-40 flex items-center justify-center text-sm text-zinc-400">Sem dados para o ano</div>
      </div>
    )
  }

  const saldoBruto = rows.reduce((s, r) => s + r.sal, 0)

  const chartData: ChartPoint[] = [...rows]
    .sort((a, b) => a.mes - b.mes)
    .map(r => ({
      mesLabel: MESES_ABREV[r.mes - 1] ?? String(r.mes),
      ent:      r.ent,
      sal:      r.sal,
      pct:      r.pct,
      pct_ant:  r.pct_ant,
    }))

  return (
    <div className="rounded-xl shadow-sm bg-white p-5">
      <div className="flex items-start justify-between gap-4 mb-1 flex-wrap">
        <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Repasse Mensal</h3>
        <div className="text-right">
          <p className="text-2xs" style={{ color: 'var(--text-muted)' }}>Saldo de repasse (bruto) no ano</p>
          <p
            className="text-lg font-bold tabular-nums"
            style={{ color: saldoBruto >= 0 ? 'var(--positive)' : 'var(--negative)' }}
          >
            {fmtMi(saldoBruto)}
          </p>
        </div>
      </div>
      <p className="text-2xs mb-3" style={{ color: 'var(--text-muted)' }}>
        Repasse bruto = Entrada Clientes − Pagto Fornecedor. Margem de repasse mensal, com a margem do
        mesmo mês do ano anterior como referência.
      </p>

      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          {ChartGrid()}
          {ChartXAxisCategoria('mesLabel', { interval: 0 })}
          {ChartYAxisPct()}
          {ChartZeroLine()}
          <Tooltip content={<RepasseTooltip />} />
          <Bar dataKey="pct" name="pct" barSize={barSizes.column} radius={[2, 2, 2, 2]}>
            {chartData.map((d, i) => (
              <Cell key={i} fill={(d.pct ?? 0) >= 0 ? 'var(--positive)' : 'var(--negative)'} />
            ))}
          </Bar>
          <Line
            dataKey="pct_ant"
            name="pct_ant"
            stroke={chartColors.axisTick}
            strokeDasharray={dashArrays.reference}
            strokeWidth={strokeWidths.lineDashed}
            dot={false}
            connectNulls
            type="monotone"
          />
        </ComposedChart>
      </ResponsiveContainer>

      <ChartLegend
        items={[
          { label: 'Margem de repasse (mês)',       color: 'var(--positive)',     type: 'rect' },
          { label: 'Margem de repasse (ano ant.)',  color: chartColors.axisTick,  type: 'line', dashed: true },
        ]}
      />
    </div>
  )
}
