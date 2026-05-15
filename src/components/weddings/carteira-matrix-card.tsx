'use client'

import { useState } from 'react'
import type { CarteiraWeddings } from '@/types/api'
import { fmtMi } from '@/lib/fmt'

type Metrica = 'casamentos' | 'faturamento' | 'receita_bruta'

interface Props {
  casamentos:    CarteiraWeddings | null
  faturamento:   CarteiraWeddings | null
  receita_bruta: CarteiraWeddings | null
}

function fmtCelula(v: number, metrica: Metrica): string {
  if (metrica === 'casamentos') return v > 0 ? String(v) : ''
  if (v === 0) return ''
  return fmtMi(v)
}

export default function CarteiraMartrixCard({ casamentos, faturamento, receita_bruta }: Props) {
  const [metrica, setMetrica] = useState<Metrica>('casamentos')

  const data = metrica === 'casamentos' ? casamentos
    : metrica === 'faturamento'         ? faturamento
    : receita_bruta

  const labels: Record<Metrica, string> = {
    casamentos:    'Casamentos',
    faturamento:   'Faturamento',
    receita_bruta: 'Receita Bruta',
  }

  if (!data || data.linhas.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-zinc-200 p-4 min-w-0">
        <h2 className="text-sm font-semibold text-zinc-700 mb-3">Carteira: Vendas × Entregas</h2>
        <p className="text-sm text-zinc-400 text-center py-6">Sem dados disponíveis.</p>
      </div>
    )
  }

  const anosCasamento = data.anos_casamento
  const bodyLinhas    = data.linhas.filter(l => l.ano_venda !== 'total')
  const totalLinha    = data.linhas.find(l => l.ano_venda === 'total')

  // Calcula max para intensidade de cor (exclui a linha total)
  const allVals = bodyLinhas.flatMap(l => Object.values(l.valores))
  const maxVal  = allVals.length > 0 ? Math.max(...allVals) : 1

  function cellBg(ano_venda: string, ano_casamento: string, value: number): string {
    if (value === 0) return ''
    const isDiag = ano_venda === ano_casamento
    const intensity = Math.round((value / maxVal) * 100)
    if (isDiag) return `rgba(202, 155, 6, ${0.12 + intensity * 0.0055})`
    return `rgba(59, 130, 246, ${0.06 + intensity * 0.0035})`
  }

  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-4 min-w-0">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-sm font-semibold text-zinc-700">Carteira: Vendas × Entregas</h2>
        <div className="flex rounded-lg border border-zinc-200 overflow-hidden text-xs">
          {(Object.keys(labels) as Metrica[]).map(m => (
            <button
              key={m}
              onClick={() => setMetrica(m)}
              className={`px-3 py-1.5 transition-colors ${
                metrica === m
                  ? 'bg-zinc-800 text-white'
                  : 'text-zinc-500 hover:bg-zinc-50'
              }`}
            >
              {labels[m]}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="text-xs border-collapse w-full">
          <thead>
            <tr>
              <th className="py-2 px-3 text-left text-zinc-400 font-medium whitespace-nowrap border-b border-zinc-100">
                Ano da Venda
              </th>
              {anosCasamento.map(ac => (
                <th key={ac} className="py-2 px-3 text-center text-zinc-400 font-medium whitespace-nowrap border-b border-zinc-100">
                  {ac === 'sem_data' ? 'Sem Data' : ac}
                </th>
              ))}
              <th className="py-2 px-3 text-right text-zinc-400 font-medium border-b border-zinc-100">
                Total
              </th>
            </tr>
          </thead>

          <tbody>
            {bodyLinhas.map(linha => (
              <tr key={linha.ano_venda} className="hover:bg-zinc-50/50">
                <td className="py-2 px-3 font-semibold text-zinc-700 border-b border-zinc-50 whitespace-nowrap">
                  {linha.ano_venda}
                </td>
                {anosCasamento.map(ac => {
                  const v = linha.valores[ac] ?? 0
                  return (
                    <td
                      key={ac}
                      className="py-2 px-3 text-center tabular-nums border-b border-zinc-50 whitespace-nowrap"
                      style={{ backgroundColor: cellBg(linha.ano_venda, ac, v) || undefined }}
                    >
                      {v > 0 ? (
                        <span className={linha.ano_venda === ac ? 'font-semibold text-amber-700' : 'text-zinc-700'}>
                          {fmtCelula(v, metrica)}
                        </span>
                      ) : (
                        <span className="text-zinc-200">—</span>
                      )}
                    </td>
                  )
                })}
                <td className="py-2 px-3 text-right tabular-nums font-semibold text-zinc-800 border-b border-zinc-50 whitespace-nowrap">
                  {fmtCelula(linha.total, metrica) || '—'}
                </td>
              </tr>
            ))}
          </tbody>

          {totalLinha && (
            <tfoot>
              <tr className="bg-zinc-50 font-semibold">
                <td className="py-2 px-3 text-zinc-600 border-t border-zinc-200">Total</td>
                {anosCasamento.map(ac => {
                  const v = totalLinha.valores[ac] ?? 0
                  return (
                    <td key={ac} className="py-2 px-3 text-center tabular-nums text-zinc-700 border-t border-zinc-200 whitespace-nowrap">
                      {v > 0 ? fmtCelula(v, metrica) : <span className="text-zinc-300">—</span>}
                    </td>
                  )
                })}
                <td className="py-2 px-3 text-right tabular-nums text-zinc-800 border-t border-zinc-200 whitespace-nowrap">
                  {fmtCelula(totalLinha.total, metrica) || '—'}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <p className="mt-3 text-[11px] text-zinc-400">
        Linhas: ano da venda do Contrato · Colunas: ano do casamento · Diagonal{' '}
        <span className="inline-block w-3 h-2 rounded-sm bg-amber-400/60 align-middle" /> = vendas e entregas no mesmo ano
      </p>
    </div>
  )
}
