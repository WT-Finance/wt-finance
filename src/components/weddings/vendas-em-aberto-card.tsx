'use client'

import { useState } from 'react'
import { Inbox } from 'lucide-react'
import type { VendasEmAberto } from '@/types/api'
import { fmtBRL, fmtDate } from '@/lib/fmt'
import ListDrawer from '@/components/shared/list-drawer'
import EmptyState from '@/components/shared/empty-state'
import CardTabela, { CARD_TABELA_TH } from '@/components/shared/card-tabela'

const LIMITE = 5

interface Props {
  data: VendasEmAberto | null
}

function Colunas() {
  return (
    <colgroup>
      <col className="w-24" />
      <col className="w-20" />
      <col />
      <col className="w-28" />
      <col className="w-14" />
    </colgroup>
  )
}

function Cabecalho() {
  return (
    <thead>
      <tr className="border-b border-zinc-100">
        <th className={`${CARD_TABELA_TH} text-left`}>Data da Venda</th>
        <th className={`${CARD_TABELA_TH} text-left`}>Venda Nº</th>
        <th className={`${CARD_TABELA_TH} text-left`}>Vendedor</th>
        <th className={`${CARD_TABELA_TH} text-right`}>Valor Total</th>
        <th className={`${CARD_TABELA_TH} text-right`}>Tempo</th>
      </tr>
    </thead>
  )
}

function Linhas({ itens }: { itens: NonNullable<VendasEmAberto>['vendas'] }) {
  return (
    <>
      {itens.map((v, i) => {
        const velha = v.idade_dias > 30
        return (
          <tr key={i} className={velha ? 'bg-warning-bg hover:bg-warning-bg/80' : 'hover:bg-zinc-50'}>
            <td className="py-2 px-3 text-zinc-500 tabular-nums text-xs whitespace-nowrap">{fmtDate(v.data_venda)}</td>
            <td className="py-2 px-3 font-medium truncate">
              <span className={velha ? 'text-warning' : 'text-zinc-800'}>{v.venda_no}</span>
            </td>
            <td className="py-2 px-3 text-zinc-500 truncate text-xs">{v.vendedor}</td>
            <td className="py-2 px-3 text-right tabular-nums text-zinc-700 whitespace-nowrap">{fmtBRL(v.valor_total)}</td>
            <td className={`py-2 px-3 text-right tabular-nums text-xs whitespace-nowrap font-medium ${velha ? 'text-warning' : 'text-zinc-400'}`}>
              {v.idade_dias}d
              {velha && <span className="ml-1 text-amber-500" title="Mais de 30 dias em aberto">⚠</span>}
            </td>
          </tr>
        )
      })}
    </>
  )
}

export default function VendasEmAbertoCard({ data }: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false)

  const vendas = data?.vendas ?? []
  const visiveis = vendas.slice(0, LIMITE)
  const temMais = (data?.total ?? 0) > LIMITE

  if (!data || data.total === 0) {
    return (
      <CardTabela titulo="Vendas em Aberto">
        <EmptyState icon={Inbox} message="Nenhuma venda em aberto no momento" />
      </CardTabela>
    )
  }

  // Selo de contagem na cor da aba (var(--brand) via [data-theme]) — v4.10.1.
  const badge = (
    <span className="text-xs font-medium" style={{ color: 'var(--brand)' }}>
      {data.total} {data.total === 1 ? 'venda' : 'vendas'} em aberto
    </span>
  )

  return (
    <CardTabela titulo="Vendas em Aberto" headerRight={badge} temMais={temMais} onVerMais={() => setDrawerOpen(true)}>
      <table className="w-full table-fixed text-sm">
        <Colunas />
        <Cabecalho />
        <tbody className="divide-y divide-zinc-50">
          <Linhas itens={visiveis} />
        </tbody>
      </table>

      {drawerOpen && (
        <ListDrawer
          titulo="Vendas em Aberto"
          subtitulo={`${data.total} ${data.total === 1 ? 'venda' : 'vendas'} com situação Aberta no cadastro`}
          onClose={() => setDrawerOpen(false)}
        >
          <table className="w-full table-fixed text-sm">
            <Colunas />
            <Cabecalho />
            <tbody className="divide-y divide-zinc-50">
              <Linhas itens={vendas} />
            </tbody>
          </table>
          {data.total > vendas.length && (
            <p className="mt-3 text-xs text-[--text-muted]">
              Mostrando as {vendas.length} mais recentes de {data.total}.
            </p>
          )}
        </ListDrawer>
      )}
    </CardTabela>
  )
}
