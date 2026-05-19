'use client'

import {
  ResponsiveContainer, ComposedChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts'
import { fmtBRL, fmtMi } from '@/lib/fmt'
import type { AcumuladoWeddings } from '@/types/api'

const MESES_ABREV = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

function fmtMesLabel(mes: string): string {
  const [y, m] = mes.split('-')
  return `${MESES_ABREV[parseInt(m) - 1]}/${y.slice(2)}`
}

interface Props {
  data: AcumuladoWeddings | null
}

export default function AcumuladoRecebPagChart({ data }: Props) {
  if (!data || !data.meses.length) {
    return (
      <div className="bg-white rounded-xl border border-zinc-200 p-4">
        <p className="text-sm text-zinc-400 text-center py-8">
          {data ? 'Sem lançamentos no período.' : 'Dados não disponíveis.'}
        </p>
      </div>
    )
  }

  const mesHoje = data.meses.find(m => m.eh_futuro)?.mes ?? null

  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-4">
      <div className="flex items-baseline gap-2 mb-4">
        <h2 className="text-sm font-semibold text-zinc-700">
          Acumulado de Recebimentos e Pagamentos
        </h2>
        <span className="text-xs text-zinc-400">24 meses passados + 18 futuros</span>
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={data.meses} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" vertical={false} />
          <XAxis
            dataKey="mes"
            tickFormatter={fmtMesLabel}
            tick={{ fontSize: 10, fill: '#71717a' }}
            tickLine={false}
            interval={2}
          />
          <YAxis
            tickFormatter={v => fmtMi(v as number)}
            tick={{ fontSize: 11, fill: '#71717a' }}
            tickLine={false}
            axisLine={false}
            width={72}
          />
          <Tooltip
            formatter={(value, name) => [
              fmtBRL(value as number),
              name === 'entrada_acum' ? 'Entrada acum.' : 'Saída acum.',
            ]}
            labelFormatter={label => fmtMesLabel(label as string)}
          />
          <ReferenceLine
            y={data.total_saidas}
            stroke="#ef4444"
            strokeDasharray="6 4"
            strokeWidth={2}
            label={{ value: 'Total previsto de custos', position: 'insideTopRight', fontSize: 10, fill: '#ef4444' }}
          />
          {mesHoje && (
            <ReferenceLine
              x={mesHoje}
              stroke="#a1a1aa"
              strokeDasharray="4 3"
              label={{ value: 'Hoje', position: 'insideTopLeft', fontSize: 10, fill: '#71717a' }}
            />
          )}
          <Bar dataKey="entrada_acum" name="entrada_acum" radius={[2,2,0,0]}>
            {data.meses.map((entry, i) => (
              <Cell key={i} fill="#3b82f6" fillOpacity={entry.eh_futuro ? 0.35 : 1} />
            ))}
          </Bar>
          <Bar dataKey="saida_acum" name="saida_acum" radius={[2,2,0,0]}>
            {data.meses.map((entry, i) => (
              <Cell key={i} fill="#f59e0b" fillOpacity={entry.eh_futuro ? 0.35 : 1} />
            ))}
          </Bar>
        </ComposedChart>
      </ResponsiveContainer>

      {/* Legenda manual — mais simples e controlável que o <Legend> do Recharts */}
      <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 ml-[72px]">
        <LegendItem color="#3b82f6" opacity={1}    label="Entradas acum. (efetivado)" />
        <LegendItem color="#3b82f6" opacity={0.35} label="Entradas acum. (projetado)" />
        <LegendItem color="#f59e0b" opacity={1}    label="Saídas acum. (efetivado)"   />
        <LegendItem color="#f59e0b" opacity={0.35} label="Saídas acum. (projetado)"   />
        <div className="flex items-center gap-1.5 text-xs text-zinc-500">
          <svg width="20" height="10">
            <line x1="0" y1="5" x2="20" y2="5" stroke="#ef4444" strokeWidth="2" strokeDasharray="6 4" />
          </svg>
          Total previsto de custos
        </div>
      </div>
    </div>
  )
}

function LegendItem({ color, opacity, label }: { color: string; opacity: number; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-zinc-500">
      <span
        className="inline-block w-3 h-3 rounded-sm"
        style={{ background: color, opacity }}
      />
      {label}
    </div>
  )
}
