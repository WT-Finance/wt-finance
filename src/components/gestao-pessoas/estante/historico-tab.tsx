'use client'

import { useMemo, useState } from 'react'
import { History, Search } from 'lucide-react'
import ScrollAutoHide from '@/components/shared/scroll-auto-hide'
import EmptyState from '@/components/shared/empty-state'
import { Input, Select } from '@/components/ui/field'
import { fmtDate } from '@/lib/fmt'
import { TipoBadge } from './estado-badge'
import type { MovimentacaoEstante, TipoMovimentacaoEstante } from './tipos'

// Aba "Histórico": o razão completo da estante (todos os livros), mais recente primeiro.
// Tabela densa — receita da skill `tabela-densa` (border-separate + fundo/borda nas
// CÉLULAS + sticky no thead + sombra só quando rolado); molde: `movimentacoes-tab.tsx`
// do Inventário de Ativos.
//
// `data_movimentacao` é `date` PURA (sem fuso) — usa `fmtDate` (split), nunca `fmtDataSP`
// (skill `ui-design-system` §5.2). `livro_titulo` vem preenchido pela RPC do razão global
// (ver `tipos.ts`).

const TIPOS: { key: '' | TipoMovimentacaoEstante; label: string }[] = [
  { key: '',           label: 'Tipo: todos' },
  { key: 'emprestimo', label: 'Pegou' },
  { key: 'devolucao',  label: 'Devolveu' },
]

interface Props {
  movimentacoes: MovimentacaoEstante[]
  onAbrirFicha: (id: number) => void
}

export default function HistoricoTab({ movimentacoes, onAbrirFicha }: Props) {
  const [busca, setBusca]   = useState('')
  const [fTipo, setFTipo]   = useState<'' | TipoMovimentacaoEstante>('')
  const [rolado, setRolado] = useState(false)

  const ordenadas = useMemo(
    () => [...movimentacoes].sort((a, b) => (a.data_movimentacao === b.data_movimentacao
      ? (a.criado_em < b.criado_em ? 1 : -1)
      : (a.data_movimentacao < b.data_movimentacao ? 1 : -1))),
    [movimentacoes],
  )

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return ordenadas.filter(m => {
      if (fTipo && m.tipo !== fTipo) return false
      if (!q) return true
      return [m.livro_titulo, m.usuario_nome, m.obs].filter(Boolean).join(' ').toLowerCase().includes(q)
    })
  }, [ordenadas, busca, fTipo])

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative min-w-[220px] flex-1 max-w-md">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <Input
            variant="compacto"
            className="pl-8"
            type="search"
            placeholder="Buscar por livro ou pessoa…"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            aria-label="Buscar movimentações"
          />
        </div>
        <Select
          variant="compacto"
          className="w-auto"
          value={fTipo}
          onChange={e => setFTipo(e.target.value as '' | TipoMovimentacaoEstante)}
          aria-label="Filtrar por tipo"
        >
          {TIPOS.map(({ key, label }) => <option key={key} value={key}>{label}</option>)}
        </Select>
      </div>

      <div className="rounded-xl bg-white shadow-sm">
        {filtradas.length === 0 ? (
          <EmptyState icon={History} message="Nenhuma movimentação encontrada com estes filtros." />
        ) : (
          <ScrollAutoHide
            eixo="y"
            className="max-h-[62vh]"
            onScroll={e => setRolado(e.currentTarget.scrollTop > 0)}
          >
            <table className="w-full text-sm table-fixed border-separate border-spacing-0">
              <thead
                className={`sticky top-0 z-20 [&_th]:bg-zinc-50 [&_tr:first-child_th:first-child]:rounded-tl-xl [&_tr:first-child_th:last-child]:rounded-tr-xl [&_tr:last-child_th]:border-b [&_tr:last-child_th]:border-zinc-200 ${rolado ? '[&_tr:last-child_th]:shadow-[0_6px_8px_-6px_rgba(28,25,23,0.22)]' : ''}`}
              >
                <tr className="text-left text-xs font-medium text-zinc-400">
                  <th className="py-2.5 px-3 w-[112px]">Data</th>
                  <th className="py-2.5 px-3">Livro</th>
                  <th className="py-2.5 px-3 w-[180px]">Quem</th>
                  <th className="py-2.5 px-3 w-[110px]">O que</th>
                  <th className="py-2.5 pl-3 pr-4">Observação</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map(m => (
                  <tr
                    key={m.id}
                    onClick={() => onAbrirFicha(m.livro_id)}
                    className="cursor-pointer transition-colors hover:bg-[var(--surface-soft)] [&>td]:border-b [&>td]:border-zinc-50"
                  >
                    <td className="py-2.5 px-3 tabular-nums text-xs text-[var(--text-muted)]">
                      {fmtDate(m.data_movimentacao)}
                    </td>
                    <td className="py-2.5 px-3 truncate text-zinc-700" title={m.livro_titulo}>
                      {m.livro_titulo ?? '—'}
                    </td>
                    <td className="py-2.5 px-3 truncate text-zinc-600" title={m.usuario_nome ?? ''}>
                      {m.usuario_nome ?? 'Pessoa sem cadastro'}
                    </td>
                    <td className="py-2.5 px-3"><TipoBadge tipo={m.tipo} /></td>
                    <td className="py-2.5 pl-3 pr-4 truncate text-2xs text-[var(--text-subtle)]" title={m.obs ?? ''}>
                      {m.obs ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollAutoHide>
        )}
      </div>

      <p className="mt-2.5 text-2xs text-[var(--text-subtle)]">
        {filtradas.length} de {movimentacoes.length} movimentações · o razão é append-only:
        nada aqui se edita ou se apaga
      </p>
    </div>
  )
}
