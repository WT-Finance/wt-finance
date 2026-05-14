'use client'

import { useCallback, useEffect, useState } from 'react'
import { X } from 'lucide-react'
import TendenciaMargemChart from '@/components/performance/tendencia-margem-chart'
import type { TendenciaMargem, SumarioSubsetor } from '@/types/api'
import { fmtBRL } from '@/lib/fmt'
import { margemColor } from '@/lib/config'

const LABELS: Record<string, string> = {
  COMERCIAL:    'Comercial',
  CONVIDADOS:   'Convidados',
  'PRODUÇÃO':   'Produção',
  PLANEJAMENTO: 'Planejamento',
}

interface Props {
  tendencia:    TendenciaMargem | null
  sumario:      SumarioSubsetor | null
  margemOk:     number
  margemAlerta: number
  onClose:      () => void
}

export default function MargemDrawer({ tendencia, sumario, margemOk, margemAlerta, onClose }: Props) {
  const [visible, setVisible] = useState(false)

  const handleClose = useCallback(() => {
    setVisible(false)
    setTimeout(onClose, 280)
  }, [onClose])

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 10)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [handleClose])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const subsetores = (sumario?.subsetores ?? []).filter(s => s.subsetor !== 'NÃO_CLASSIFICADO')

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(0,0,0,0.5)', opacity: visible ? 1 : 0, transition: 'opacity 280ms ease' }}
        onClick={handleClose}
      />

      <div
        className="fixed inset-y-0 right-0 z-50 flex flex-col w-full md:w-[60vw] max-w-2xl bg-white shadow-2xl"
        style={{
          transform:  visible ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 280ms cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        <div className="flex items-start justify-between px-6 py-4 border-b border-zinc-100 shrink-0">
          <div>
            <p className="text-lg font-semibold text-zinc-900">Margem % — Análise</p>
            <p className="text-sm text-zinc-400 mt-0.5">Tendência mensal e composição por subsetor</p>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          <TendenciaMargemChart
            data={tendencia}
            loading={false}
            margemOk={margemOk}
            margemAlerta={margemAlerta}
          />

          {subsetores.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide mb-3">
                Margem por Subsetor
              </p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-100">
                    <th className="py-2 text-left text-xs font-medium text-zinc-400">Subsetor</th>
                    <th className="py-2 text-right text-xs font-medium text-zinc-400">Faturamento</th>
                    <th className="py-2 text-right text-xs font-medium text-zinc-400">Receita Bruta</th>
                    <th className="py-2 text-right text-xs font-medium text-zinc-400">Margem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50">
                  {subsetores.map(s => (
                    <tr key={s.subsetor} className="hover:bg-zinc-50">
                      <td className="py-2 text-zinc-700">{LABELS[s.subsetor] ?? s.subsetor}</td>
                      <td className="py-2 text-right tabular-nums text-zinc-600">{fmtBRL(s.faturamento)}</td>
                      <td className="py-2 text-right tabular-nums text-zinc-600">{fmtBRL(s.receita)}</td>
                      <td className={`py-2 text-right tabular-nums font-medium ${margemColor(s.margem_pct)}`}>
                        {s.margem_pct.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t border-zinc-200 bg-zinc-50 font-semibold">
                    <td className="py-2 text-zinc-800">Total</td>
                    <td className="py-2 text-right tabular-nums text-zinc-800">{fmtBRL(sumario!.total.faturamento)}</td>
                    <td className="py-2 text-right tabular-nums text-zinc-800">{fmtBRL(sumario!.total.receita)}</td>
                    <td className={`py-2 text-right tabular-nums font-semibold ${margemColor(sumario!.total.margem_pct)}`}>
                      {sumario!.total.margem_pct.toFixed(1)}%
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
