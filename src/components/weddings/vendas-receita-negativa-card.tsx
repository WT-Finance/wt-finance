'use client'

import { useState } from 'react'
import { TrendingDown } from 'lucide-react'
import type { VendasReceitaNegativa } from '@/types/api'
import { fmtBRL, fmtDate } from '@/lib/fmt'
import ListDrawer from '@/components/shared/list-drawer'
import EmptyState from '@/components/shared/empty-state'
import CardTabela, { CARD_TABELA_TH } from '@/components/shared/card-tabela'

const LIMITE = 5

interface Props {
  data: VendasReceitaNegativa | null
}

function Colunas() {
  return (
    <colgroup>
      <col className="w-24" />
      <col className="w-20" />
      <col className="w-28" />
      <col className="w-28" />
      <col />
    </colgroup>
  )
}

function Cabecalho() {
  return (
    <thead>
      <tr className="border-b border-zinc-100">
        <th className={`${CARD_TABELA_TH} text-left`}>Data da Venda</th>
        <th className={`${CARD_TABELA_TH} text-left`}>Venda Nº</th>
        <th className={`${CARD_TABELA_TH} text-right`}>Valor Total</th>
        <th className={`${CARD_TABELA_TH} text-right`}>Receita</th>
        <th className={`${CARD_TABELA_TH} text-left`}>Vendedor</th>
      </tr>
    </thead>
  )
}

function Linhas({ itens }: { itens: NonNullable<VendasReceitaNegativa>['vendas'] }) {
  return (
    <>
      {itens.map((item, i) => (
        <tr key={i} className="hover:bg-zinc-50">
          <td className="py-2 px-3 text-zinc-500 tabular-nums text-xs whitespace-nowrap">{fmtDate(item.data_venda)}</td>
          <td className="py-2 px-3 font-medium truncate">{item.venda_no}</td>
          <td className="py-2 px-3 text-right tabular-nums text-zinc-700 whitespace-nowrap">{fmtBRL(item.valor_total)}</td>
          <td className="py-2 px-3 text-right tabular-nums text-danger whitespace-nowrap">{fmtBRL(item.receita)}</td>
          <td className="py-2 px-3 text-zinc-500 truncate text-xs">{item.vendedor}</td>
        </tr>
      ))}
    </>
  )
}

export default function VendasReceitaNegativaCard({ data }: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false)

  const vendas = data?.vendas ?? []
  const visiveis = vendas.slice(0, LIMITE)
  const temMais = (data?.total ?? 0) > LIMITE

  if (!data || data.total === 0) {
    return (
      <CardTabela titulo="Vendas com Receita Negativa">
        <EmptyState icon={TrendingDown} message="Nenhuma operação com receita negativa registrada" />
      </CardTabela>
    )
  }

  const badge = (
    <span className="text-xs text-danger font-medium">
      {data.total} {data.total === 1 ? 'venda' : 'vendas'} com receita negativa
    </span>
  )

  return (
    <CardTabela titulo="Vendas com Receita Negativa" headerRight={badge} temMais={temMais} onVerMais={() => setDrawerOpen(true)}>
      <table className="w-full table-fixed text-sm">
        <Colunas />
        <Cabecalho />
        <tbody className="divide-y divide-zinc-50">
          <Linhas itens={visiveis} />
        </tbody>
      </table>

      {drawerOpen && (
        <ListDrawer
          titulo="Vendas com Receita Negativa"
          subtitulo="Vendas com receita bruta negativa"
          onClose={() => setDrawerOpen(false)}
        >
          <table className="w-full table-fixed text-sm">
            <Colunas />
            <Cabecalho />
            <tbody className="divide-y divide-zinc-50">
              <Linhas itens={vendas} />
            </tbody>
          </table>
        </ListDrawer>
      )}
    </CardTabela>
  )
}
