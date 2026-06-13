'use client'

import { useState } from 'react'
import type { MixProduto } from '@/types/api'
import { fmtBRL } from '@/lib/fmt'
import { margemColor } from '@/lib/config'
import ListDrawer from '@/components/shared/list-drawer'
import CardTabela, { CARD_TABELA_TH } from '@/components/shared/card-tabela'

const LIMITE = 5

function Colunas() {
  return (
    <colgroup>
      <col className="w-8" />
      <col />
      <col className="w-28" />
      <col className="w-14" />
      <col className="w-16" />
    </colgroup>
  )
}

function Cabecalho() {
  return (
    <thead>
      <tr className="border-b border-zinc-100">
        <th className={`${CARD_TABELA_TH} text-left`}>#</th>
        <th className={`${CARD_TABELA_TH} text-left`}>Produto</th>
        <th className={`${CARD_TABELA_TH} text-right`}>Faturamento</th>
        <th className={`${CARD_TABELA_TH} text-right`}>%</th>
        <th className={`${CARD_TABELA_TH} text-right`}>Margem</th>
      </tr>
    </thead>
  )
}

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      {Array.from({ length: 5 }).map((_, i) => (
        <td key={i} className="py-2 px-3">
          <div className="h-3 rounded bg-zinc-100" style={{ width: i === 1 ? 120 : 40 }} />
        </td>
      ))}
    </tr>
  )
}

function LinhaProduto({ pos, nome, faturamento, pct, margem }: {
  pos: number | string; nome: string; faturamento: number; pct: number; margem: number | null
}) {
  return (
    <tr className="hover:bg-zinc-50">
      <td className="py-2 px-3 text-xs text-[var(--text-subtle)]">{pos}</td>
      <td className="py-2 px-3 text-[var(--text-primary)] font-medium truncate">{nome}</td>
      <td className="py-2 px-3 text-right tabular-nums text-[var(--text-secondary)]">{fmtBRL(faturamento)}</td>
      <td className="py-2 px-3 text-right tabular-nums text-[var(--text-muted)]">{pct.toFixed(1)}%</td>
      <td className={`py-2 px-3 text-right tabular-nums font-medium ${margemColor(margem)}`}>
        {margem != null ? `${margem.toFixed(1)}%` : '—'}
      </td>
    </tr>
  )
}

interface Props {
  data:          MixProduto | null
  loading:       boolean
  titulo?:       string
  periodoLabel?: string
}

export default function MixProdutoTable({ data, loading, titulo = 'Mix por Produto', periodoLabel }: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false)

  const produtos = data?.produtos ?? []
  const visiveis = produtos.slice(0, LIMITE)
  const temMais = produtos.length > LIMITE

  return (
    <CardTabela
      titulo={titulo}
      periodoLabel={periodoLabel}
      temMais={temMais}
      onVerMais={() => setDrawerOpen(true)}
    >
      <table className="w-full table-fixed text-sm">
        <Colunas />
        <Cabecalho />
        <tbody className="divide-y divide-zinc-50">
          {loading
            ? Array.from({ length: LIMITE }).map((_, i) => <SkeletonRow key={i} />)
            : !data
            ? (
              <tr>
                <td colSpan={5} className="py-4 text-center text-sm text-[var(--text-subtle)]">
                  Sem dados para o período selecionado.
                </td>
              </tr>
            )
            : (
              <>
                {visiveis.map((p, i) => (
                  <LinhaProduto key={p.produto_nome} pos={i + 1} nome={p.produto_nome}
                    faturamento={p.faturamento} pct={p.pct_faturamento} margem={p.margem_pct} />
                ))}
                {!temMais && data.outros.quantidade_produtos > 0 && (
                  <tr className="bg-zinc-50 text-[var(--text-muted)] italic">
                    <td className="py-2 px-3 text-xs text-[var(--text-subtle)]">+{data.outros.quantidade_produtos}</td>
                    <td className="py-2 px-3 text-sm truncate">Outros</td>
                    <td className="py-2 px-3 text-right tabular-nums not-italic">{fmtBRL(data.outros.faturamento)}</td>
                    <td className="py-2 px-3 text-right tabular-nums not-italic">{data.outros.pct_faturamento.toFixed(1)}%</td>
                    <td className={`py-2 px-3 text-right tabular-nums not-italic font-medium ${margemColor(data.outros.margem_pct)}`}>
                      {data.outros.margem_pct != null ? `${data.outros.margem_pct.toFixed(1)}%` : '—'}
                    </td>
                  </tr>
                )}
              </>
            )}
        </tbody>
      </table>

      {drawerOpen && data && (
        <ListDrawer titulo={titulo} subtitulo="Faturamento e margem por produto no período" onClose={() => setDrawerOpen(false)}>
          <table className="w-full table-fixed text-sm">
            <Colunas />
            <Cabecalho />
            <tbody className="divide-y divide-zinc-50">
              {produtos.map((p, i) => (
                <LinhaProduto key={p.produto_nome} pos={i + 1} nome={p.produto_nome}
                  faturamento={p.faturamento} pct={p.pct_faturamento} margem={p.margem_pct} />
              ))}
              {data.outros.quantidade_produtos > 0 && (
                <tr className="bg-zinc-50 text-[var(--text-muted)] italic">
                  <td className="py-2 px-3 text-xs text-[var(--text-subtle)]">+{data.outros.quantidade_produtos}</td>
                  <td className="py-2 px-3 text-sm truncate">Outros</td>
                  <td className="py-2 px-3 text-right tabular-nums not-italic">{fmtBRL(data.outros.faturamento)}</td>
                  <td className="py-2 px-3 text-right tabular-nums not-italic">{data.outros.pct_faturamento.toFixed(1)}%</td>
                  <td className={`py-2 px-3 text-right tabular-nums not-italic font-medium ${margemColor(data.outros.margem_pct)}`}>
                    {data.outros.margem_pct != null ? `${data.outros.margem_pct.toFixed(1)}%` : '—'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </ListDrawer>
      )}
    </CardTabela>
  )
}
