'use client'

import { useState } from 'react'
import type { RankingVendedorItem } from '@/types/api'
import { fmtBRL } from '@/lib/fmt'
import ListDrawer from '@/components/shared/list-drawer'
import CardTabela, { CARD_TABELA_TH } from '@/components/shared/card-tabela'

const LIMITE = 5

interface Props {
  data:          RankingVendedorItem[]
  periodoLabel?: string
}

function Colunas() {
  return (
    <colgroup>
      <col className="w-8" />
      <col />
      <col className="w-28" />
      <col className="w-24" />
    </colgroup>
  )
}

function Cabecalho() {
  return (
    <thead>
      <tr className="border-b border-zinc-100">
        <th className={`${CARD_TABELA_TH} text-left`}>#</th>
        <th className={`${CARD_TABELA_TH} text-left`}>Vendedor</th>
        <th className={`${CARD_TABELA_TH} text-right`}>Faturamento</th>
        <th className={`${CARD_TABELA_TH} text-right`}>Receita</th>
      </tr>
    </thead>
  )
}

function Linhas({ itens }: { itens: RankingVendedorItem[] }) {
  return (
    <>
      {itens.map((v, i) => (
        <tr key={v.vendedor_id} className="hover:bg-zinc-50">
          <td className="py-2 px-3 text-xs text-[var(--text-subtle)]">{i + 1}</td>
          <td className="py-2 px-3 text-[var(--text-primary)] font-medium truncate">{v.nome}</td>
          <td className="py-2 px-3 text-right tabular-nums text-[var(--text-secondary)]">{fmtBRL(v.valor_total)}</td>
          <td className="py-2 px-3 text-right tabular-nums text-[var(--text-muted)]">{fmtBRL(v.receitas)}</td>
        </tr>
      ))}
    </>
  )
}

export default function TopVendedoresCard({ data, periodoLabel }: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false)

  const visiveis = data.slice(0, LIMITE)
  const temMais  = data.length > LIMITE

  return (
    <CardTabela
      titulo="Top Vendedores"
      periodoLabel={periodoLabel}
      temMais={temMais}
      onVerMais={() => setDrawerOpen(true)}
    >
      <table className="w-full table-fixed text-sm">
        <Colunas />
        <Cabecalho />
        <tbody className="divide-y divide-zinc-50">
          {data.length === 0 ? (
            <tr>
              <td colSpan={4} className="py-4 text-center text-sm text-[var(--text-subtle)]">
                Sem vendedores no período selecionado.
              </td>
            </tr>
          ) : (
            <Linhas itens={visiveis} />
          )}
        </tbody>
      </table>

      {drawerOpen && (
        <ListDrawer titulo="Top Vendedores" subtitulo="Faturamento e receita por vendedor no período selecionado" onClose={() => setDrawerOpen(false)}>
          <table className="w-full table-fixed text-sm">
            <Colunas />
            <Cabecalho />
            <tbody className="divide-y divide-zinc-50">
              <Linhas itens={data} />
            </tbody>
          </table>
        </ListDrawer>
      )}
    </CardTabela>
  )
}
