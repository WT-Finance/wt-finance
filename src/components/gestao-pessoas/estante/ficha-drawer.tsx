'use client'

import { History } from 'lucide-react'
import ListDrawer from '@/components/shared/list-drawer'
import Button from '@/components/ui/button'
import { PILL, PILL_NEUTRO, PILL_PRIMARIA, PILL_PRIMARIA_STYLE } from '@/components/shared/botoes'
import { fmtDate } from '@/lib/fmt'
import EstadoBadge from './estado-badge'
import type { Ficha } from '@/app/gestao-pessoas/estante/actions'
import type { LivroLista } from './tipos'

// Ficha do livro em DRAWER (molde: inventario/ficha-drawer.tsx, ADR-0092) — grade de dados
// do catálogo + razão daquele exemplar, mais recente primeiro (a RPC `estante_detalhe_livro`
// já devolve nesta ordem).
//
// O conteúdo vem de `carregarFicha(id)` AO ABRIR, não da lista já carregada (invariante 10 do
// briefing): entre o render da página e o clique, alguém pode ter pegado o livro, e defasagem
// numa tela cujo propósito é dizer "quem está com isto" é o pior lugar para estar desatualizado.
// `ficha === null && !falhou` ⇒ skeleton; `falhou` ⇒ "Não foi possível carregar a ficha." — a
// página segue viva (invariante 12).
//
// `data_movimentacao`/`desde` são `date` puros (sem fuso) — `fmtDate` (split), nunca
// `fmtDataSP` (skill `ui-design-system` §5.2).

const vazio = (v: string | null | undefined) => (v && v.trim() !== '' ? v : '—')

interface Props {
  livro: LivroLista
  ficha: Ficha | null
  falhou: boolean
  podeGerir: boolean
  meuId: string | null
  onFechar: () => void
  onEditar: () => void
  onRemover: () => void
  onPegar: () => void
  onDevolver: () => void
}

export default function FichaDrawer({
  livro, ficha, falhou, podeGerir, meuId, onFechar, onEditar, onRemover, onPegar, onDevolver,
}: Props) {
  const carregando = ficha === null && !falhou
  const atual = ficha?.livro ?? livro

  // Mesma regra de acaoDaLinha (inline até a Tarefa 9 centralizar em `acaoDaLinha`):
  // disponível ⇒ pegar; emprestado a mim ou eu sou gestão ⇒ devolver; emprestado a
  // outra pessoa e eu não sou gestão ⇒ nenhum botão.
  const acao = !atual.emprestado
    ? 'pegar'
    : atual.portador_id === meuId || podeGerir
      ? 'devolver'
      : null

  return (
    <ListDrawer titulo={livro.titulo} subtitulo={livro.autor ?? undefined} onClose={onFechar}>
      <div className="flex flex-wrap gap-2 mb-5">
        {acao && (
          <button type="button" onClick={acao === 'pegar' ? onPegar : onDevolver} className={`${PILL} ${PILL_PRIMARIA}`} style={PILL_PRIMARIA_STYLE}>
            {acao === 'pegar' ? 'Pegar livro' : 'Devolver livro'}
          </button>
        )}
        {podeGerir && (
          <>
            <button type="button" onClick={onEditar} className={`${PILL} ${PILL_NEUTRO}`}>
              Editar catálogo
            </button>
            <button type="button" onClick={onRemover} className={`${PILL} ${PILL_NEUTRO}`}>
              {atual.tem_historico ? 'Arquivar livro' : 'Excluir livro'}
            </button>
          </>
        )}
      </div>

      {carregando && (
        <div className="space-y-3 animate-pulse" aria-hidden="true">
          <div className="h-16 rounded-lg bg-zinc-100" />
          <div className="h-4 w-2/3 rounded bg-zinc-100" />
          <div className="h-4 w-1/2 rounded bg-zinc-100" />
          <div className="h-4 w-3/4 rounded bg-zinc-100" />
        </div>
      )}

      {falhou && (
        <p className="text-sm text-[var(--text-subtle)]">Não foi possível carregar a ficha.</p>
      )}

      {ficha && (
        <>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] px-4 py-3 mb-5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <EstadoBadge livro={atual} />
              {atual.emprestado && atual.portador_nome && (
                <span className="text-sm text-zinc-700">
                  com {atual.portador_nome} · desde {atual.desde ? fmtDate(atual.desde) : '—'}
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-5 gap-y-4 mb-6">
            <div className="min-w-0">
              <p className="text-2xs font-semibold uppercase tracking-[0.5px] text-[var(--text-subtle)]">Editora</p>
              <p className="mt-0.5 text-sm text-zinc-700 break-words">{vazio(atual.editora)}</p>
            </div>
            <div className="min-w-0">
              <p className="text-2xs font-semibold uppercase tracking-[0.5px] text-[var(--text-subtle)]">Ano</p>
              <p className="mt-0.5 text-sm text-zinc-700 tabular-nums">{atual.ano ?? '—'}</p>
            </div>
            <div className="min-w-0">
              <p className="text-2xs font-semibold uppercase tracking-[0.5px] text-[var(--text-subtle)]">ISBN</p>
              <p className="mt-0.5 text-sm text-zinc-700 tabular-nums break-words">{vazio(atual.isbn)}</p>
            </div>
            <div />
            {atual.obs && (
              <div className="col-span-2 min-w-0">
                <p className="text-2xs font-semibold uppercase tracking-[0.5px] text-[var(--text-subtle)]">Observações</p>
                <p className="mt-0.5 text-sm text-zinc-700 break-words">{atual.obs}</p>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 mb-3 pt-4 border-t border-zinc-100">
            <History size={14} className="text-[var(--text-subtle)]" />
            <h3 className="text-2xs font-semibold uppercase tracking-[0.5px] text-[var(--text-muted)]">
              Razão deste exemplar
            </h3>
            <span className="text-2xs text-[var(--text-subtle)]">({ficha.movimentacoes.length})</span>
          </div>

          {ficha.movimentacoes.length === 0 ? (
            <p className="text-sm text-[var(--text-subtle)]">Nenhuma movimentação registrada.</p>
          ) : (
            <ol className="relative ml-1.5 border-l border-zinc-200 pl-5 space-y-4">
              {ficha.movimentacoes.map(mov => (
                <li key={mov.id} className="relative">
                  <span
                    className="absolute -left-[26px] top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-zinc-300"
                    style={{ boxShadow: '0 0 0 1px var(--border)' }}
                  />
                  <p className="text-sm text-zinc-700">
                    <span className="font-medium">{mov.usuario_nome ?? 'Pessoa sem cadastro'}</span>{' '}
                    {mov.tipo === 'emprestimo' ? 'pegou' : 'devolveu'} · {fmtDate(mov.data_movimentacao)}
                  </p>
                  {mov.obs && <p className="mt-0.5 text-xs text-[var(--text-muted)]">{mov.obs}</p>}
                </li>
              ))}
            </ol>
          )}
        </>
      )}

      <div className="mt-6 pt-4 border-t border-zinc-100">
        <Button variant="contorno" size="sm" onClick={onFechar}>Fechar</Button>
      </div>
    </ListDrawer>
  )
}
