'use client'

import {
  ResponsiveContainer, LineChart, Line, LabelList, Tooltip,
} from 'recharts'
import {
  ChartGrid, ChartXAxisCategoria, ChartYAxisPct, ChartZeroLine, ChartLegend,
  fluxoColors, dashArrays, strokeWidths,
} from '@/components/charts'
import { fmtMi, fmtBRL, fmtAxisPct } from '@/lib/fmt'
import type { RepasseMensalRow } from '@/lib/fluxo/rpc-fluxo'

// Margem do Repasse (v5.2.0/Onda 1, ajuste do checkpoint) — indicador (saldo de repasse
// bruto acumulado no ano) + linha da margem mês a mês, no MESMO box (referência: "Margem
// do repasse" do modelo da controladoria). Linha sólida = ano corrente (SÓLIDO = real);
// linha tracejada = ano anterior, como REFERÊNCIA (TRACEJADO = referência/comparação —
// convenção da plataforma). Mês com margem negativa ganha um dot vermelho (`--danger`)
// na linha do ano corrente.

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
        <TooltipRow label="Entrada Clientes"      value={fmtBRL(d.ent)} />
        <TooltipRow label="Repasse (bruto)"       value={fmtBRL(d.sal)} />
        <TooltipRow label="Margem"                value={d.pct == null ? 'sem base comparável' : fmtAxisPct(d.pct, 1)} />
        {d.pct_ant != null && (
          <TooltipRow label="Margem (ano ant.)"   value={fmtAxisPct(d.pct_ant, 1)} />
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

interface DotProps {
  cx?:      number
  cy?:      number
  payload?: ChartPoint
}

function PctDot({ cx, cy, payload }: DotProps) {
  if (cx === undefined || cy === undefined || !payload || payload.pct === null) return null
  const negativo = payload.pct < 0
  return <circle cx={cx} cy={cy} r={3.5} fill={negativo ? 'var(--danger)' : fluxoColors.resultado} stroke="none" />
}

function PctAntDot({ cx, cy, payload }: DotProps) {
  if (cx === undefined || cy === undefined || !payload || payload.pct_ant === null) return null
  return <circle cx={cx} cy={cy} r={2.5} fill="var(--text-muted)" stroke="none" />
}

/** Rótulo do valor no ponto da linha do ano corrente — 1 casa, sem "%" (ex.: "35,9"). */
function fmtLabelPct(value: unknown): string {
  if (typeof value !== 'number') return ''
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

function hojeSP(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
}

export default function RepasseMensal({ rows }: Props) {
  if (!rows.length) {
    return (
      <div className="rounded-xl shadow-sm bg-white p-5">
        <h3 className="text-base font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Margem do repasse</h3>
        <div className="h-40 flex items-center justify-center text-sm text-zinc-400">Sem dados para o ano</div>
      </div>
    )
  }

  const anoCorrente  = Number(hojeSP().slice(0, 4))
  const anoAnterior  = anoCorrente - 1

  const saldoBruto = rows.reduce((s, r) => s + r.sal, 0)

  const chartData: ChartPoint[] = [...rows]
    .sort((a, b) => a.mes - b.mes)
    .filter(r => r.pct !== null || r.pct_ant !== null)
    .map(r => ({
      mesLabel: MESES_ABREV[r.mes - 1] ?? String(r.mes),
      ent:      r.ent,
      sal:      r.sal,
      pct:      r.pct,
      pct_ant:  r.pct_ant,
    }))

  return (
    <div className="rounded-xl shadow-sm bg-white p-5">
      <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Margem do repasse</h3>
      <p className="text-2xs mb-3" style={{ color: 'var(--text-muted)' }}>
        saldo repasse ÷ entradas de clientes · mês a mês · tracejada = {anoAnterior}
      </p>

      <div className="flex gap-6 items-center">
        <div className="min-w-[160px] pr-6 border-r shrink-0" style={{ borderColor: 'var(--border)' }}>
          <p className="text-2xs" style={{ color: 'var(--text-muted)' }}>Saldo de repasse (bruto)</p>
          <p
            className="text-2xl font-bold tabular-nums mt-1"
            style={{ color: saldoBruto >= 0 ? 'var(--positive-deep)' : 'var(--negative-deep)' }}
          >
            {fmtMi(saldoBruto)}
          </p>
          <p className="text-3xs mt-1" style={{ color: 'var(--text-subtle)' }}>
            acumulado no ano · Entrada de Clientes − Pagamento ao Fornecedor
          </p>
        </div>

        <div className="flex-1 min-w-0">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData} margin={{ top: 16, right: 16, bottom: 0, left: 0 }}>
              {ChartGrid()}
              {ChartXAxisCategoria('mesLabel', { interval: 0 })}
              {ChartYAxisPct()}
              {ChartZeroLine()}
              <Tooltip content={<RepasseTooltip />} />
              <Line
                dataKey="pct_ant"
                name="pct_ant"
                stroke="var(--text-muted)"
                strokeDasharray={dashArrays.reference}
                strokeWidth={strokeWidths.lineDashed}
                dot={(props: DotProps) => <PctAntDot key={`a-${props.cx}-${props.cy}`} {...props} />}
                connectNulls={false}
                type="monotone"
              />
              <Line
                dataKey="pct"
                name="pct"
                stroke={fluxoColors.resultado}
                strokeWidth={2}
                dot={(props: DotProps) => <PctDot key={`p-${props.cx}-${props.cy}`} {...props} />}
                activeDot={{ r: 5 }}
                connectNulls={false}
                type="monotone"
              >
                <LabelList dataKey="pct" position="top" formatter={fmtLabelPct} style={{ fontSize: 10, fill: 'var(--text-muted)' }} />
              </Line>
            </LineChart>
          </ResponsiveContainer>

          <ChartLegend
            items={[
              { label: `${anoCorrente}`,      color: fluxoColors.resultado, type: 'line' },
              { label: `${anoAnterior}`,      color: 'var(--text-muted)',   type: 'line', dashed: true },
              { label: 'Mês negativo',        color: 'var(--danger)',       type: 'dot' },
            ]}
          />
        </div>
      </div>
    </div>
  )
}
