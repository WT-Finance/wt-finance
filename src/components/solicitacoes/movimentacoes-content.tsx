'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Search, ArrowUp, ArrowDown, ArrowUpDown, Loader2 } from 'lucide-react'
import type { Movimentacao, Solicitacao } from '@/lib/solicitacoes/schemas'
import CardTabela, { CARD_TABELA_TH } from '@/components/shared/card-tabela'
import { FaixaMensagem } from '@/components/shared/faixa-mensagem'
import { PILL, PILL_GESTAO, PILL_GESTAO_STYLE } from '@/components/shared/botoes'
import { fmtDataHoraSP } from '@/lib/fmt'
import { acaoBadge } from '@/lib/solicitacoes/format'
import DrawerSolicitacao from './drawer-solicitacao'
import { detalheSolicitacao } from '@/app/solicitacoes/actions'

// v4.20.0 — auditoria de movimentações de solicitações (gestão-only). Lista única DERIVADA
// das colunas de app.solicitacao. Colunas: Usuário · Ação · Solicitação(#nº) · Quando.
// Busca única client-side (todas as colunas) + ordenação por coluna (Quando desc default).
// Linha clicável → detalheSolicitacao (server action) → DrawerSolicitacao (a justificativa
// de rejeição aparece no drawer). Tema neutro de plataforma; badges em tokens semânticos.

// Rótulo da ação em PARTICÍPIO (a RPC emite o substantivo). Busca e ordenação usam o
// particípio exibido, para "aberta"/"concluída" casarem com o que o usuário vê.
const PARTICIPIO: Record<string, string> = {
  Abertura: 'aberta', Conclusão: 'concluída', Rejeição: 'rejeitada', Cancelamento: 'cancelada',
}
const participio = (acao: string) => PARTICIPIO[acao] ?? acao.toLowerCase()

type Col = 'ator' | 'acao' | 'solicitacao' | 'quando'

/** Cabeçalho ordenável (módulo-nível — componente não pode ser criado em render). */
function Th({ col, label, sortCol, sortDir, onToggle }: {
  col: Col; label: string; sortCol: Col; sortDir: 'asc' | 'desc'; onToggle: (c: Col) => void
}) {
  const ativa = sortCol === col
  return (
    <th className={`${CARD_TABELA_TH} text-left`}>
      <button type="button" onClick={() => onToggle(col)}
        className="foco-neutro inline-flex items-center gap-1 hover:text-zinc-700"
        aria-label={`Ordenar por ${label}`}>
        {label}
        {ativa
          ? (sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)
          : <ArrowUpDown size={12} className="text-zinc-300" />}
      </button>
    </th>
  )
}

export default function MovimentacoesContent({ movimentacoes, erroCarga }: {
  movimentacoes: Movimentacao[]; erroCarga: string | null
}) {
  const [busca, setBusca] = useState('')
  const [sortCol, setSortCol] = useState<Col>('quando')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [aberta, setAberta] = useState<Solicitacao | null>(null)
  const [carregando, setCarregando] = useState<number | null>(null)  // solicitacao_id em fetch
  const [erro, setErro] = useState<string | null>(null)

  function toggleSort(col: Col) {
    if (col === sortCol) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortCol(col); setSortDir(col === 'quando' ? 'desc' : 'asc') }
  }

  async function abrir(id: number) {
    if (carregando !== null) return
    setErro(null); setCarregando(id)
    try {
      const sol = await detalheSolicitacao(id)
      if (sol) setAberta(sol)
      else setErro('Não foi possível abrir a solicitação.')
    } catch {
      setErro('Não foi possível abrir a solicitação.')
    } finally {
      setCarregando(null)
    }
  }

  // Busca em TODAS as colunas + ordenação. Array.sort é estável → empates preservam a ordem
  // da RPC (em desc, id desc), garantindo ordenação estável.
  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase()
    const texto = (m: Movimentacao) =>
      `${m.ator ?? ''} ${participio(m.acao)} #${m.solicitacao_id} ${m.solicitacao_id} ${fmtDataHoraSP(m.em)}`.toLowerCase()
    const filtradas = q ? movimentacoes.filter(m => texto(m).includes(q)) : movimentacoes
    const dir = sortDir === 'asc' ? 1 : -1
    return [...filtradas].sort((a, b) => {
      let r = 0
      if (sortCol === 'quando') r = a.em < b.em ? -1 : a.em > b.em ? 1 : 0
      else if (sortCol === 'solicitacao') r = a.solicitacao_id - b.solicitacao_id
      else if (sortCol === 'ator') r = (a.ator ?? '').localeCompare(b.ator ?? '', 'pt-BR')
      else r = participio(a.acao).localeCompare(participio(b.acao), 'pt-BR')
      return r * dir
    })
  }, [movimentacoes, busca, sortCol, sortDir])

  const headerRight = (
    <p className="text-sm text-zinc-500">
      {busca.trim() && visiveis.length !== movimentacoes.length
        ? `${visiveis.length} de ${movimentacoes.length}`
        : (movimentacoes.length === 1 ? '1 movimentação' : `${movimentacoes.length} movimentações`)}
    </p>
  )

  return (
    <>
      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
        <Link href="/solicitacoes" className={`${PILL} ${PILL_GESTAO} whitespace-nowrap`} style={PILL_GESTAO_STYLE}>
          <ArrowLeft size={13} /> Ver solicitações
        </Link>
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="search"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar (usuário, ação, número…)"
            aria-label="Buscar movimentações"
            className="foco-neutro w-64 max-w-full rounded-lg border border-zinc-200 bg-white py-1.5 pl-8 pr-3 text-sm text-zinc-700 outline-none transition placeholder:text-zinc-400"
          />
        </div>
      </div>

      {erroCarga && <FaixaMensagem tipo="erro" texto={erroCarga} />}
      {erro && <FaixaMensagem tipo="erro" texto={erro} onFechar={() => setErro(null)} />}

      <CardTabela titulo="Movimentações" headerRight={headerRight}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] table-fixed text-sm">
            <colgroup>
              <col />{/* Usuário */}
              <col className="w-36" />{/* Ação */}
              <col className="w-28" />{/* Solicitação */}
              <col className="w-48" />{/* Quando */}
            </colgroup>
            <thead>
              <tr className="border-b border-zinc-100">
                <Th col="ator" label="Usuário" sortCol={sortCol} sortDir={sortDir} onToggle={toggleSort} />
                <Th col="acao" label="Ação" sortCol={sortCol} sortDir={sortDir} onToggle={toggleSort} />
                <Th col="solicitacao" label="Solicitação" sortCol={sortCol} sortDir={sortDir} onToggle={toggleSort} />
                <Th col="quando" label="Quando" sortCol={sortCol} sortDir={sortDir} onToggle={toggleSort} />
              </tr>
            </thead>
            <tbody>
              {visiveis.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-sm text-zinc-400">
                    {busca.trim() ? 'Nenhuma movimentação corresponde à busca.' : 'Nenhuma movimentação registrada ainda.'}
                  </td>
                </tr>
              ) : (
                visiveis.map((m, i) => (
                  <tr
                    key={`${m.solicitacao_id}-${m.acao}-${i}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => abrir(m.solicitacao_id)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(m.solicitacao_id) } }}
                    title={`Abrir solicitação #${m.solicitacao_id}`}
                    className={`foco-neutro cursor-pointer border-b border-zinc-50 last:border-0 hover:bg-zinc-50 ${carregando === m.solicitacao_id ? 'opacity-60' : ''}`}
                  >
                    <td className="py-2.5 px-3 align-top">
                      <span className="block truncate text-zinc-700" title={m.ator ?? '—'}>{m.ator ?? '—'}</span>
                    </td>
                    <td className="py-2.5 px-3 align-top">
                      <span className={`inline-block rounded-full border px-2 py-0.5 text-2xs font-medium whitespace-nowrap ${acaoBadge(m.acao)}`}>
                        {participio(m.acao)}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 align-top">
                      <span className="block tabular-nums text-zinc-800">#{m.solicitacao_id}</span>
                    </td>
                    <td className="py-2.5 px-3 align-top">
                      <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500 tabular-nums">
                        {fmtDataHoraSP(m.em)}
                        {carregando === m.solicitacao_id && <Loader2 size={12} className="animate-spin" />}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardTabela>

      {aberta && <DrawerSolicitacao sol={aberta} onClose={() => setAberta(null)} />}
    </>
  )
}
