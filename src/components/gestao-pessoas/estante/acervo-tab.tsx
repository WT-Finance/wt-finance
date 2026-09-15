'use client'

import { useMemo, useState } from 'react'
import { BookOpen, Search } from 'lucide-react'
import ScrollAutoHide from '@/components/shared/scroll-auto-hide'
import EmptyState from '@/components/shared/empty-state'
import { Input } from '@/components/ui/field'
import { PILL_FILTRO_SM, PILL_FILTRO_INATIVO, PILL_FILTRO_ATIVO_STYLE } from '@/components/shared/botoes'
import { fmtDate } from '@/lib/fmt'
import EstadoBadge from './estado-badge'
import type { LivroLista } from './tipos'

// Aba "Acervo": tabela densa com busca livre e filtro de estado. Receita de tabela densa da
// skill `tabela-densa`: border-separate + fundo/borda nas CÉLULAS + sticky no thead + sombra
// só quando rolado.
//
// `desde` é uma coluna `date` PURA (sem fuso — migration 0271/0272), não timestamptz: usa
// `fmtDate` (split de string), NUNCA `fmtDataSP` (que assume UTC e erraria o dia perto da
// meia-noite ao converter para o fuso de São Paulo — skill `ui-design-system` §5.2).

type FiltroEstado = 'todos' | 'disponivel' | 'emprestado'

const FILTROS: { key: FiltroEstado; label: string }[] = [
  { key: 'todos',       label: 'Todos' },
  { key: 'disponivel',  label: 'Disponível' },
  { key: 'emprestado',  label: 'Emprestado' },
]

interface Props {
  livros: LivroLista[]
  podeGerir: boolean
  meuId: string | null
  onAbrirFicha: (id: number) => void
  onPegar: (livro: LivroLista) => void
  onDevolver: (livro: LivroLista) => void
}

export default function AcervoTab({ livros, podeGerir, meuId, onAbrirFicha, onPegar, onDevolver }: Props) {
  const [busca, setBusca]   = useState('')
  const [fEstado, setFEstado] = useState<FiltroEstado>('todos')
  const [rolado, setRolado] = useState(false)

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return livros.filter(l => {
      if (fEstado === 'disponivel' && l.emprestado) return false
      if (fEstado === 'emprestado' && !l.emprestado) return false
      if (!q) return true
      return [l.titulo, l.autor, l.portador_nome].filter(Boolean).join(' ').toLowerCase().includes(q)
    })
  }, [livros, busca, fEstado])

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative min-w-[220px] flex-1 max-w-md">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <Input
            variant="compacto"
            className="pl-8"
            type="search"
            placeholder="Buscar por título, autor, com quem…"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            aria-label="Buscar livros"
          />
        </div>
        <div className="flex items-center gap-1.5">
          {FILTROS.map(({ key, label }) => {
            const ativo = fEstado === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => setFEstado(key)}
                className={[PILL_FILTRO_SM, ativo ? '' : PILL_FILTRO_INATIVO].join(' ')}
                style={ativo ? PILL_FILTRO_ATIVO_STYLE : undefined}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="rounded-xl bg-white shadow-sm">
        {filtrados.length === 0 ? (
          <EmptyState icon={BookOpen} message="Nenhum livro encontrado com estes filtros." />
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
                  <th className="py-2.5 px-3">Título</th>
                  <th className="py-2.5 px-3 w-[72px]">Ano</th>
                  <th className="py-2.5 px-3 w-[128px]">Estado</th>
                  <th className="py-2.5 px-3 w-[200px]">Com quem</th>
                  <th className="py-2.5 pl-3 pr-4 w-[96px] text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map(l => {
                  // Livro disponível: qualquer um pega. Emprestado a MIM: eu devolvo.
                  // Emprestado a OUTRA pessoa: só a gestão devolve — para os demais, nenhum
                  // botão (e não um botão que erra quando clicado). (Tarefa 9 centraliza
                  // esta regra em `acaoDaLinha`; por ora, inline nos dois lugares que usam.)
                  const acao = !l.emprestado
                    ? 'pegar'
                    : l.portador_id === meuId || podeGerir
                      ? 'devolver'
                      : null

                  return (
                    <tr
                      key={l.id}
                      onClick={() => onAbrirFicha(l.id)}
                      className="cursor-pointer transition-colors hover:bg-[var(--surface-soft)] [&>td]:border-b [&>td]:border-zinc-50"
                    >
                      <td className="py-2.5 px-3 min-w-0">
                        <p className="truncate font-medium text-zinc-800" title={l.titulo}>{l.titulo}</p>
                        {l.autor && <p className="truncate text-2xs text-[var(--text-subtle)]">{l.autor}</p>}
                      </td>
                      <td className="py-2.5 px-3 tabular-nums text-zinc-600">{l.ano ?? '—'}</td>
                      <td className="py-2.5 px-3"><EstadoBadge livro={l} /></td>
                      <td className="py-2.5 px-3 truncate text-zinc-600" title={l.portador_nome ?? ''}>
                        {l.emprestado && l.portador_nome
                          ? <>{l.portador_nome} <span className="text-[var(--text-subtle)]">· desde {l.desde ? fmtDate(l.desde) : '—'}</span></>
                          : '—'}
                      </td>
                      <td className="py-2.5 pl-3 pr-4 text-right">
                        {acao && (
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation()
                              if (acao === 'pegar') onPegar(l); else onDevolver(l)
                            }}
                            className={[PILL_FILTRO_SM, 'whitespace-nowrap'].join(' ')}
                            style={PILL_FILTRO_ATIVO_STYLE}
                          >
                            {acao === 'pegar' ? 'Pegar' : 'Devolver'}
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </ScrollAutoHide>
        )}
      </div>

      <p className="mt-2.5 text-2xs text-[var(--text-subtle)]">
        {filtrados.length} de {livros.length} livros · clique numa linha para abrir a ficha e o histórico
      </p>
    </div>
  )
}
