'use client'

import { useMemo, useState } from 'react'
import { History, Search, Download, Clock3 } from 'lucide-react'
import ScrollAutoHide from '@/components/shared/scroll-auto-hide'
import EmptyState from '@/components/shared/empty-state'
import { Input, Select } from '@/components/ui/field'
import { PILL, PILL_NEUTRO } from '@/components/shared/botoes'
import { fmtDate, hojeSP } from '@/lib/fmt'
import { nomeArquivo } from '@/lib/patrimonio/csv'
import { TipoBadge } from './status-badge'
import {
  ROTULO_TIPO, ehRetroativa, ordenarCronologico, rotuloDestino, rotuloOrigem,
} from './derivar'
import { baixarCsv, csvDeMovimentacoes } from './exportar'
import type { AtivoLista, Movimentacao, TipoMovimentacao } from './tipos'

// Aba "Movimentações": o razão inteiro, do mais recente para o mais antigo. A ORIGEM de cada
// linha é derivada da cadeia do próprio ativo (invariante 2) — por isso a lista é montada
// agrupando por ativo antes de reordenar globalmente.

const TODOS_TIPOS: TipoMovimentacao[] = [
  'cadastro', 'transferencia', 'devolucao_estoque', 'envio_manutencao',
  'retorno_manutencao', 'emprestimo', 'baixa', 'reativacao',
]

// O razão já vem com o ativo embutido (`ativo_codigo`/`ativo_descricao`); o mapa da lista é
// só fallback. Assim uma linha continua legível mesmo que o ativo dela não esteja na lista
// carregada — o que acontece quando o razão passa do teto de linhas da consulta.
type MapaAtivos = Map<number, AtivoLista>
const codigoDe    = (m: Movimentacao, mapa: MapaAtivos) => m.ativo_codigo    ?? mapa.get(m.ativo_id)?.codigo    ?? '—'
const descricaoDe = (m: Movimentacao, mapa: MapaAtivos) => m.ativo_descricao ?? mapa.get(m.ativo_id)?.descricao ?? '—'

interface Props {
  ativos: AtivoLista[]
  movimentacoes: Movimentacao[]
  /** A RPC bateu o teto de linhas — a aba AVISA em vez de truncar em silêncio. */
  noTeto?: boolean
  onAbrirFicha: (id: number) => void
}

export default function MovimentacoesTab({ ativos, movimentacoes, noTeto, onAbrirFicha }: Props) {
  const [busca, setBusca]   = useState('')
  const [fTipo, setFTipo]   = useState('')
  const [rolado, setRolado] = useState(false)

  const porId = useMemo(() => new Map(ativos.map(a => [a.id, a])), [ativos])

  const linhas = useMemo(() => {
    const porAtivo = new Map<number, Movimentacao[]>()
    for (const m of movimentacoes) {
      const lista = porAtivo.get(m.ativo_id) ?? []
      lista.push(m)
      porAtivo.set(m.ativo_id, lista)
    }
    const todas = [...porAtivo.values()].flatMap(lista => {
      const ord = ordenarCronologico(lista)
      return ord.map((mov, i) => ({ mov, origem: rotuloOrigem(ord, i) }))
    })
    return todas.sort((a, b) => (a.mov.data_movimentacao === b.mov.data_movimentacao
      ? (a.mov.criado_em < b.mov.criado_em ? 1 : -1)
      : (a.mov.data_movimentacao < b.mov.data_movimentacao ? 1 : -1)))
  }, [movimentacoes])

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return linhas.filter(({ mov, origem }) => {
      if (fTipo && mov.tipo !== fTipo) return false
      if (!q) return true
      return [
        codigoDe(mov, porId), descricaoDe(mov, porId), ROTULO_TIPO[mov.tipo], origem,
        rotuloDestino(mov), mov.obs, mov.registrado_por_rotulo,
      ].filter(Boolean).join(' ').toLowerCase().includes(q)
    })
  }, [linhas, busca, fTipo, porId])

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative min-w-[220px] flex-1 max-w-md">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <Input
            variant="compacto"
            className="pl-8"
            type="search"
            placeholder="Buscar movimentações…"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            aria-label="Buscar movimentações"
          />
        </div>
        <Select variant="compacto" className="w-auto" value={fTipo} onChange={e => setFTipo(e.target.value)} aria-label="Filtrar por tipo">
          <option value="">Tipo: todos</option>
          {TODOS_TIPOS.map(t => <option key={t} value={t}>{ROTULO_TIPO[t]}</option>)}
        </Select>
        <div className="ml-auto">
          <button
            type="button"
            onClick={() => baixarCsv(
              nomeArquivo('inventario-movimentacoes', hojeSP()),
              csvDeMovimentacoes(filtradas.map(({ mov, origem }) => ({
                mov,
                origem,
                retroativa: ehRetroativa(mov),
                codigo: codigoDe(mov, porId),
                descricao: descricaoDe(mov, porId),
              }))),
            )}
            disabled={filtradas.length === 0}
            title="Exporta as linhas exibidas (com os filtros atuais) para abrir no Excel"
            className={`${PILL} ${PILL_NEUTRO}`}
          >
            <Download size={13} /> Exportar CSV
          </button>
        </div>
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
                  <th className="py-2.5 px-3 w-[96px]">Código</th>
                  <th className="py-2.5 px-3">Item</th>
                  <th className="py-2.5 px-3 w-[184px]">Tipo</th>
                  <th className="py-2.5 px-3">Origem → destino</th>
                  <th className="py-2.5 pl-3 pr-4 w-[150px]">Registrado por</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map(({ mov, origem }) => {
                  const descricao = descricaoDe(mov, porId)
                  return (
                    <tr
                      key={mov.id}
                      onClick={() => onAbrirFicha(mov.ativo_id)}
                      className="cursor-pointer transition-colors hover:bg-[var(--surface-soft)] [&>td]:border-b [&>td]:border-zinc-50"
                    >
                      <td className="py-2.5 px-3">
                        <span className="tabular-nums text-xs text-[var(--text-muted)]">
                          {fmtDate(mov.data_movimentacao)}
                        </span>
                        {ehRetroativa(mov) && (
                          <span
                            className="mt-0.5 flex items-center gap-1 text-3xs text-[var(--text-subtle)]"
                            title="Registrado depois do fato"
                          >
                            <Clock3 size={10} /> retroativo
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-xs font-medium tabular-nums text-zinc-600">
                        {codigoDe(mov, porId)}
                      </td>
                      <td className="py-2.5 px-3 truncate text-zinc-700" title={descricao}>
                        {descricao}
                      </td>
                      <td className="py-2.5 px-3"><TipoBadge tipo={mov.tipo} /></td>
                      <td className="py-2.5 px-3 min-w-0">
                        <p className="truncate text-zinc-700">
                          {origem && <span className="text-[var(--text-subtle)]">{origem} → </span>}
                          {rotuloDestino(mov)}
                        </p>
                        {mov.obs && <p className="truncate text-2xs text-[var(--text-subtle)]" title={mov.obs}>{mov.obs}</p>}
                      </td>
                      <td className="py-2.5 pl-3 pr-4 truncate text-xs text-[var(--text-muted)]">
                        {mov.registrado_por_rotulo}
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
        {filtradas.length} de {linhas.length} movimentações · o razão é append-only: nada aqui se
        edita ou se apaga
        {noTeto && ' · exibindo as mais recentes (o razão passou do teto de linhas da consulta)'}
      </p>
    </div>
  )
}
