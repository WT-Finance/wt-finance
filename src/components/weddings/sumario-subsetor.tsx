'use client'

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
  data:          SumarioSubsetor | null
  periodoLabel?: string
}

export default function SumarioSubsetorCard({ data, periodoLabel }: Props) {
  if (!data || data.subsetores.length === 0) {
    return (
      <div className="bg-white rounded-[10px] border border-[--border] px-6 py-5 shadow-[0_1px_3px_rgba(45,42,38,0.04)]">
        <p className="text-xs text-[--text-subtle] mb-3">Distribuição de faturamento por subsetor no período</p>
        <div className="h-32 flex items-center justify-center text-sm text-[--text-subtle]">
          Sem dados para o período selecionado.
        </div>
      </div>
    )
  }

  const classified = data.subsetores.filter(s => s.subsetor !== 'NÃO_CLASSIFICADO')
  const nc         = data.subsetores.find(s => s.subsetor === 'NÃO_CLASSIFICADO')

  return (
    <div className="bg-white rounded-[10px] border border-[--border] px-6 py-5 shadow-[0_1px_3px_rgba(45,42,38,0.04)]">
      <div className="flex items-baseline gap-2 mb-3">
        <h2 className="text-base font-semibold text-[--text-primary] leading-snug">Composição por Subsetor</h2>
        {periodoLabel && <span className="text-xs text-[--text-muted]">{periodoLabel}</span>}
      </div>
      <div className="flex items-baseline gap-2 mb-4">
        <p className="text-[13px] text-[--text-muted]">Distribuição de faturamento por subsetor no período</p>
        <span className="text-xs text-[--text-subtle]">
          {data.total.n_vendas} vendas · {fmtMi(data.total.faturamento)}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-zinc-100">
              <th className="py-2 px-2 text-left  font-medium text-[--text-subtle] whitespace-nowrap">Subsetor</th>
              <th className="py-2 px-2 text-left  font-medium text-[--text-subtle] w-36">Distribuição</th>
              <th className="py-2 px-2 text-right font-medium text-[--text-subtle] whitespace-nowrap">Faturamento</th>
              <th className="py-2 px-2 text-right font-medium text-[--text-subtle] whitespace-nowrap">Receita</th>
              <th className="py-2 px-2 text-right font-medium text-[--text-subtle] whitespace-nowrap">Margem</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-50">
            {classified.map(s => (
              <tr key={s.subsetor} className="hover:bg-zinc-50">
                <td className="py-2 px-2 font-medium text-[--text-primary] whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block w-2 h-2 rounded-full shrink-0"
                      style={{ background: SUBSETOR_COLORS[s.subsetor] ?? FALLBACK_COLOR }}
                    />
                    {LABELS[s.subsetor] ?? s.subsetor}
                  </div>
                </td>
                <td className="py-2 px-2">
                  <div className="flex items-center gap-1.5">
                    <div className="flex-1 h-2 bg-zinc-100 rounded-full overflow-hidden min-w-0">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${s.pct_faturamento}%`,
                          background: SUBSETOR_COLORS[s.subsetor] ?? FALLBACK_COLOR,
                        }}
                      />
                    </div>
                    <span className="tabular-nums text-[--text-subtle] w-9 text-right shrink-0">
                      {s.pct_faturamento.toFixed(1)}%
                    </span>
                  </div>
                </td>
                <td className="py-2 px-2 text-right tabular-nums text-[--text-muted]">{fmtBRL(s.faturamento)}</td>
                <td className="py-2 px-2 text-right tabular-nums text-[--text-muted]">{fmtBRL(s.receita)}</td>
                <td className={`py-2 px-2 text-right tabular-nums font-medium ${margemColor(s.margem_pct)}`}>
                  {s.margem_pct.toFixed(1)}%
                </td>
              </tr>
            ))}

            {/* Linha de total */}
            <tr className="border-t border-zinc-200 bg-zinc-50 font-semibold">
              <td className="py-2 px-2 text-[--text-primary]">Total</td>
              <td className="py-2 px-2">
                <div className="flex items-center gap-1.5">
                  <div className="flex-1 h-2 bg-zinc-200 rounded-full" />
                  <span className="tabular-nums text-[--text-subtle] w-9 text-right shrink-0">100%</span>
                </div>
              </td>
              <td className="py-2 px-2 text-right tabular-nums text-[--text-primary]">{fmtBRL(data.total.faturamento)}</td>
              <td className="py-2 px-2 text-right tabular-nums text-[--text-primary]">{fmtBRL(data.total.receita)}</td>
              <td className={`py-2 px-2 text-right tabular-nums font-semibold ${margemColor(data.total.margem_pct)}`}>
                {data.total.margem_pct.toFixed(1)}%
              </td>
            </tr>

            {/* Linha NÃO_CLASSIFICADO (opcional) */}
            {nc && (
              <tr className="bg-warning-bg border-t border-[--warning-bg]">
                <td className="py-2 px-2 text-warning font-medium whitespace-nowrap">Não Classif.</td>
                <td className="py-2 px-2">
                  <div className="flex items-center gap-1.5">
                    <div className="flex-1 h-2 bg-zinc-100 rounded-full overflow-hidden min-w-0">
                      <div
                        className="h-full rounded-full bg-warning"
                        style={{ width: `${nc.pct_faturamento}%` }}
                      />
                    </div>
                    <span className="tabular-nums text-warning w-9 text-right shrink-0">
                      {nc.pct_faturamento.toFixed(1)}%
                    </span>
                  </div>
                </td>
                <td className="py-2 px-2 text-right tabular-nums text-warning">{fmtBRL(nc.faturamento)}</td>
                <td className="py-2 px-2 text-right tabular-nums text-warning">{fmtBRL(nc.receita)}</td>
                <td className={`py-2 px-2 text-right tabular-nums font-medium ${margemColor(nc.margem_pct)}`}>
                  {nc.margem_pct.toFixed(1)}%
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
