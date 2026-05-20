'use client'

import {
  ResponsiveContainer, BarChart, Bar,
  XAxis, YAxis, Tooltip, Cell, LabelList,
} from 'recharts'
import type { SumarioSubsetor } from '@/types/api'
import { fmtBRL, fmtMi } from '@/lib/fmt'
import { margemColor } from '@/lib/config'

const LABELS: Record<string, string> = {
  COMERCIAL:        'Comercial',
  CONVIDADOS:       'Convidados',
  'PRODUÇÃO':       'Produção',
  PLANEJAMENTO:     'Planejamento',
  NÃO_CLASSIFICADO: 'Não Classif.',
}

const SUBSETOR_COLORS: Record<string, string> = {
  COMERCIAL:    '#8C857B',
  CONVIDADOS:   '#4B4F54',
  'PRODUÇÃO':   '#874B52',
  PLANEJAMENTO: '#8F7E35',
}
const FALLBACK_COLOR = '#BA7517'

interface Props {
  data: SumarioSubsetor | null
}

export default function SumarioSubsetorCard({ data }: Props) {
  if (!data || data.subsetores.length === 0) {
    return (
      <div className="bg-white rounded-[10px] border border-[--border] px-6 py-5 shadow-[0_1px_3px_rgba(45,42,38,0.04)] min-w-0">
        <p className="text-xs text-zinc-500 mb-3">Distribuição de faturamento por subsetor no período</p>
        <div className="h-32 flex items-center justify-center text-sm text-zinc-400">
          Sem dados para o período selecionado.
        </div>
      </div>
    )
  }

  const classified = data.subsetores.filter(s => s.subsetor !== 'NÃO_CLASSIFICADO')
  const nc         = data.subsetores.find(s => s.subsetor === 'NÃO_CLASSIFICADO')

  const chartData = classified.map(s => ({
    name:     LABELS[s.subsetor] ?? s.subsetor,
    subsetor: s.subsetor,
    value:    s.faturamento,
    pct:      s.pct_faturamento,
  }))

  return (
    <div className="bg-white rounded-[10px] border border-[--border] px-6 py-5 shadow-[0_1px_3px_rgba(45,42,38,0.04)] min-w-0">
      <h2 className="text-base font-semibold text-[--text-primary] leading-snug mb-3">Composição por Subsetor</h2>
      <div className="flex items-baseline gap-2 mb-4">
        <p className="text-[13px] text-[--text-muted]">Distribuição de faturamento por subsetor no período</p>
        <span className="text-xs text-zinc-400">
          {data.total.n_vendas} vendas · {fmtMi(data.total.faturamento)}
        </span>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 min-w-0 overflow-hidden">
        {/* Gráfico horizontal */}
        <ResponsiveContainer width="100%" height={Math.max(120, classified.length * 44)}>
          <BarChart
            layout="vertical"
            data={chartData}
            margin={{ top: 0, right: 56, left: 0, bottom: 0 }}
          >
            <XAxis
              type="number"
              tickFormatter={v => fmtMi(v as number)}
              tick={{ fontSize: 10, fill: '#a1a1aa' }}
              tickLine={false} axisLine={false}
            />
            <YAxis
              type="category" dataKey="name"
              tick={{ fontSize: 12, fill: '#52525b' }}
              tickLine={false} axisLine={false} width={88}
            />
            <Tooltip formatter={(v) => [fmtBRL(v as number), 'Faturamento']} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={26}>
              {chartData.map((entry, i) => (
                <Cell key={i} fill={SUBSETOR_COLORS[entry.subsetor] ?? FALLBACK_COLOR} />
              ))}
              <LabelList
                dataKey="pct"
                position="right"
                formatter={(v: unknown) => `${(v as number).toFixed(1)}%`}
                style={{ fontSize: 11, fill: '#71717a' }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        {/* Tabela compacta */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100">
                <th className="py-2 px-3 text-left   text-xs font-medium text-zinc-400">Subsetor</th>
                <th className="py-2 px-3 text-right  text-xs font-medium text-zinc-400">Faturamento</th>
                <th className="py-2 px-3 text-right  text-xs font-medium text-zinc-400">Receita</th>
                <th className="py-2 px-3 text-right  text-xs font-medium text-zinc-400">Margem</th>
                <th className="py-2 px-3 text-right  text-xs font-medium text-zinc-400">% Fat.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {classified.map(s => (
                <tr key={s.subsetor} className="hover:bg-zinc-50">
                  <td className="py-2 px-3 font-medium text-zinc-800 flex items-center gap-2">
                    <span
                      className="inline-block w-2 h-2 rounded-full shrink-0"
                      style={{ background: SUBSETOR_COLORS[s.subsetor] ?? FALLBACK_COLOR }}
                    />
                    {LABELS[s.subsetor] ?? s.subsetor}
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums text-zinc-700">{fmtBRL(s.faturamento)}</td>
                  <td className="py-2 px-3 text-right tabular-nums text-zinc-700">{fmtBRL(s.receita)}</td>
                  <td className={`py-2 px-3 text-right tabular-nums font-medium ${margemColor(s.margem_pct)}`}>
                    {s.margem_pct.toFixed(1)}%
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums text-zinc-500">{s.pct_faturamento.toFixed(1)}%</td>
                </tr>
              ))}

              {/* Linha de total */}
              <tr className="border-t border-zinc-200 bg-zinc-50 font-semibold">
                <td className="py-2 px-3 text-zinc-800">Total</td>
                <td className="py-2 px-3 text-right tabular-nums text-zinc-800">{fmtBRL(data.total.faturamento)}</td>
                <td className="py-2 px-3 text-right tabular-nums text-zinc-800">{fmtBRL(data.total.receita)}</td>
                <td className={`py-2 px-3 text-right tabular-nums font-semibold ${margemColor(data.total.margem_pct)}`}>
                  {data.total.margem_pct.toFixed(1)}%
                </td>
                <td className="py-2 px-3 text-right tabular-nums text-zinc-500">100%</td>
              </tr>

              {/* Linha NÃO_CLASSIFICADO (opcional) */}
              {nc && (
                <tr className="bg-warning-bg border-t border-[--warning-bg]">
                  <td className="py-2 px-3 text-warning font-medium">
                    Não Classif.
                    <span className="hidden sm:inline text-xs font-normal text-warning ml-1">
                      — sem mapeamento
                    </span>
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums text-warning">{fmtBRL(nc.faturamento)}</td>
                  <td className="py-2 px-3 text-right tabular-nums text-warning">{fmtBRL(nc.receita)}</td>
                  <td className={`py-2 px-3 text-right tabular-nums font-medium ${margemColor(nc.margem_pct)}`}>
                    {nc.margem_pct.toFixed(1)}%
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums text-warning">{nc.pct_faturamento.toFixed(1)}%</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
