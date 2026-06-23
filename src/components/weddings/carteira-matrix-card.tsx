'use client'

import type { CarteiraWeddings } from '@/types/api'

interface Props {
  casamentos: CarteiraWeddings | null
}

function fmtCelula(v: number): string {
  return v > 0 ? String(v) : ''
}

export default function CarteiraMartrixCard({ casamentos }: Props) {
  const data = casamentos

  if (!data || data.linhas.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm px-5 py-4 min-w-0">
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
    <div className="bg-white rounded-xl shadow-sm px-5 py-4 min-w-0">
      <h2 className="text-base font-semibold text-[var(--text-primary)] leading-snug mb-4">Carteira: Vendas × Entregas</h2>
      <div className="mb-4">
        <p className="text-[13px] text-[var(--text-muted)]">Vendas por ano de venda × ano de entrega</p>
      </div>

      <div className="overflow-x-auto">
        <table className="text-xs border-collapse w-full">
          <thead>
            <tr>
              <th className="py-2 px-3 text-left text-zinc-400 font-medium whitespace-nowrap border-b border-zinc-100">
                Ano da Venda / Entrega
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
                        <span className={linha.ano_venda === ac ? 'font-semibold text-warning' : 'text-zinc-700'}>
                          {fmtCelula(v)}
                        </span>
                      ) : (
                        <span className="text-zinc-200">—</span>
                      )}
                    </td>
                  )
                })}
                <td className="py-2 px-3 text-right tabular-nums font-semibold text-zinc-800 border-b border-zinc-50 whitespace-nowrap">
                  {fmtCelula(linha.total) || '—'}
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
                      {v > 0 ? fmtCelula(v) : <span className="text-zinc-300">—</span>}
                    </td>
                  )
                })}
                <td className="py-2 px-3 text-right tabular-nums text-zinc-800 border-t border-zinc-200 whitespace-nowrap">
                  {fmtCelula(totalLinha.total) || '—'}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <p className="mt-3 text-2xs text-zinc-400">
        Linhas: ano da venda do Contrato · Colunas: ano da Entrega do casamento · Diagonal{' '}
        <span className="inline-block w-3 h-2 rounded-sm bg-warning/60 align-middle" /> = vendas e entregas no mesmo ano
      </p>
    </div>
  )
}
