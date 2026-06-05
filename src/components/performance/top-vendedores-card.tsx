'use client'

import { useState } from 'react'
import type { RankingVendedorItem } from '@/types/api'
import { fmtBRL } from '@/lib/fmt'
import ListDrawer from '@/components/shared/list-drawer'

const LIMITE = 5

interface Props {
  data:          RankingVendedorItem[]
  periodoLabel?: string
}

function Linhas({ itens }: { itens: RankingVendedorItem[] }) {
  return (
    <>
      {itens.map((v, i) => (
        <tr key={v.vendedor_id} className="hover:bg-zinc-50">
          <td className="py-2 px-3 text-xs text-[--text-subtle]">{i + 1}</td>
          <td className="py-2 px-3 text-[--text-primary] font-medium truncate max-w-45">{v.nome}</td>
          <td className="py-2 px-3 text-right tabular-nums text-[--text-secondary]">{fmtBRL(v.valor_total)}</td>
          <td className="py-2 px-3 text-right tabular-nums text-[--text-muted]">{fmtBRL(v.receitas)}</td>
        </tr>
      ))}
    </>
  )
}

function Cabecalho() {
  return (
    <thead>
      <tr className="border-b border-zinc-100">
        <th className="py-2 px-3 text-left  text-xs font-medium text-[--text-subtle] w-8 whitespace-nowrap">#</th>
        <th className="py-2 px-3 text-left  text-xs font-medium text-[--text-subtle] whitespace-nowrap">Vendedor</th>
        <th className="py-2 px-3 text-right text-xs font-medium text-[--text-subtle] whitespace-nowrap">Faturamento</th>
        <th className="py-2 px-3 text-right text-xs font-medium text-[--text-subtle] whitespace-nowrap">Receita</th>
      </tr>
    </thead>
  )
}

export default function TopVendedoresCard({ data, periodoLabel }: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false)

  const visiveis = data.slice(0, LIMITE)
  const temMais  = data.length > LIMITE

  return (
    <div className="bg-white rounded-xl shadow-sm px-5 py-4 min-w-0 overflow-hidden flex flex-col">
      <div className="flex items-baseline gap-2 mb-3">
        <h2 className="text-base font-semibold text-[--text-primary] leading-snug">Top Vendedores</h2>
        {periodoLabel && <span className="text-xs" style={{ color: 'var(--brand)' }}>{periodoLabel}</span>}
      </div>
      <p className="text-[13px] text-[--text-muted] mb-3">Faturamento e receita por vendedor no período selecionado</p>

      <div className="flex-1 min-h-0">
        <table className="w-full text-sm">
          <Cabecalho />
          <tbody className="divide-y divide-zinc-50">
            {data.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-4 text-center text-sm text-[--text-subtle]">
                  Sem vendedores no período selecionado.
                </td>
              </tr>
            ) : (
              <Linhas itens={visiveis} />
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 border-t border-zinc-100">
        {temMais ? (
          <button
            onClick={() => setDrawerOpen(true)}
            className="w-full text-xs text-[--text-subtle] hover:text-[--text-secondary] py-1.5 transition-colors"
          >
            Ver mais
          </button>
        ) : (
          <div className="py-1.5" />
        )}
      </div>

      {drawerOpen && (
        <ListDrawer titulo="Top Vendedores" subtitulo="Faturamento e receita por vendedor no período selecionado" onClose={() => setDrawerOpen(false)}>
          <table className="w-full text-sm">
            <Cabecalho />
            <tbody className="divide-y divide-zinc-50">
              <Linhas itens={data} />
            </tbody>
          </table>
        </ListDrawer>
      )}
    </div>
  )
}
