'use client'

import { useState } from 'react'
import { AlertTriangle, Search } from 'lucide-react'
import { fmtDataBR, resumo, vencida, maisRecentePrimeiro, casaBuscaSolicitacao } from '@/lib/solicitacoes/format'
import { fmtDataHoraSP } from '@/lib/fmt'
import { PILL, PILL_NEUTRO, PILL_PRIMARIA, PILL_PRIMARIA_STYLE } from '@/components/shared/botoes'
import ScrollAutoHide from '@/components/shared/scroll-auto-hide'
import Badge from '@/components/ui/badge'
import { Input } from '@/components/ui/field'
import { emAndamento } from '@/lib/solicitacoes/schemas'
import type { Solicitacao } from '@/lib/solicitacoes/schemas'

// v4.18/M7 — Minhas solicitações (visão do originador): COLUNAS POR STATUS (Abertas /
// Concluídas / Rejeitadas) sob o filtro "Ativas"; "Canceladas" lista as que o próprio
// originador cancelou (saem da visão Ativas). A coluna Concluídas mostra quem concluiu
// e quando (insumo do relatório futuro).

type Filtro = 'ativas' | 'canceladas'
// v5.9.0 — coluna "Aprovadas" entre Abertas e Concluídas. Sem ela, uma solicitação
// aprovada não casaria com NENHUMA coluna e sumiria da vista do próprio solicitante
// (as colunas filtram por igualdade de status, não por complemento).
const COLUNAS = [
  { status: 'aberta'    as const, titulo: 'Abertas' },
  { status: 'aprovada'  as const, titulo: 'Aprovadas' },
  { status: 'concluida' as const, titulo: 'Concluídas' },
  { status: 'rejeitada' as const, titulo: 'Rejeitadas' },
]

// v5.7.2 — a ordem e a busca das listas vivem em `@/lib/solicitacoes/format`
// (`maisRecentePrimeiro`, `casaBuscaSolicitacao`): as DUAS visões desta página precisam
// ordenar e buscar igual, e duas cópias divergiriam no primeiro ajuste.

export default function MinhasSolicitacoes({ solicitacoes, onAbrir }: {
  solicitacoes: Solicitacao[]; onAbrir: (s: Solicitacao) => void
}) {
  const [filtro, setFiltro] = useState<Filtro>('ativas')
  const [busca, setBusca] = useState('')
  const temBusca = busca.trim() !== ''
  const canceladas = solicitacoes.filter(s => s.status === 'cancelada')
  const filtradas = solicitacoes.filter(s => casaBuscaSolicitacao(s, busca))
  const canceladasFiltradas = [...filtradas.filter(s => s.status === 'cancelada')].sort(maisRecentePrimeiro)

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {(['ativas', 'canceladas'] as Filtro[]).map(f => (
          <button key={f} type="button" onClick={() => setFiltro(f)}
            className={`${PILL} ${filtro === f ? PILL_PRIMARIA : PILL_NEUTRO}`}
            style={filtro === f ? PILL_PRIMARIA_STYLE : undefined}>
            {f === 'ativas' ? 'Ativas' : `Canceladas${canceladas.length ? ` (${canceladas.length})` : ''}`}
          </button>
        ))}
        <div className="relative ml-auto">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <Input
            variant="compacto"
            type="search"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Pesquisar…"
            aria-label="Buscar solicitações por número ou e-mail do solicitante"
            className="w-64 pl-8"
          />
        </div>
      </div>

      {filtro === 'ativas' ? (
        // flex-1 + grid-rows minmax(0,1fr) → as colunas preenchem a altura restante
        // (cada uma rola por dentro); no mobile empilham em altura natural. (v5.1.1)
        // v5.9.0 — passaram de 3 para 4 colunas (entrou "Aprovadas"): em ≥sm vão a 2×2 e
        // só em ≥lg abrem em 4, porque 4 colunas em ~640px espremem o resumo do card a
        // ponto de ficar ilegível. O grid-rows de altura fixa acompanha o ≥lg — em 2×2 as
        // duas fileiras precisam de altura natural, senão a segunda some.
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 sm:flex-1 sm:min-h-0 lg:grid-rows-[minmax(0,1fr)]">
          {COLUNAS.map(col => {
            const itens = [...filtradas.filter(s => s.status === col.status)].sort(maisRecentePrimeiro)
            return (
              <div key={col.status} className="flex flex-col min-h-0">
                {/* Header da coluna FIXO (fora do scroll); os cards rolam por dentro com a
                    barra flutuante do DS — padrão de painel em colunas (v5.1.1, DS). */}
                <div className="flex items-center justify-between mb-1 px-1">
                  <h3 className="text-sm font-semibold text-zinc-700">{col.titulo}</h3>
                  <span className="text-xs text-zinc-400">{itens.length}</span>
                </div>
                <ScrollAutoHide className="pl-1 pr-4 pt-2 pb-2" contentClassName="space-y-2">
                  {itens.length === 0 && (
                    <div className="rounded-lg border border-dashed border-zinc-200 px-3 py-6 text-center text-xs text-zinc-400">
                      {temBusca ? 'Nenhum resultado' : '—'}
                    </div>
                  )}
                  {itens.map(s => <CardMinha key={s.id} s={s} onAbrir={onAbrir} />)}
                </ScrollAutoHide>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="space-y-2 max-w-xl">
          {canceladasFiltradas.length === 0
            ? <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-10 text-center text-sm text-zinc-400">
                {temBusca ? 'Nenhuma solicitação cancelada encontrada para esta busca.' : 'Você não cancelou nenhuma solicitação.'}
              </p>
            : canceladasFiltradas.map(s => <CardMinha key={s.id} s={s} onAbrir={onAbrir} />)}
        </div>
      )}
    </div>
  )
}

function CardMinha({ s, onAbrir }: { s: Solicitacao; onAbrir: (s: Solicitacao) => void }) {
  const venc = vencida(s.data_limite, s.status)
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Abrir solicitação: ${s.tipo_nome ?? ''}`}
      onClick={() => onAbrir(s)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAbrir(s) } }}
      className="card-clicavel-neutra foco-neutro cursor-pointer rounded-lg border border-zinc-200 bg-white px-3 py-2.5 shadow-sm"
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-zinc-900 truncate">{s.tipo_nome}</p>
        <span className="shrink-0 text-2xs font-medium tabular-nums text-zinc-400">#{s.id}</span>
      </div>
      {/* Selo de proveniência (v5.4.0/Round4): só quando origem não é null/ausente
          (solicitação aberta via API externa) — comportamento idêntico ao atual quando
          não há origem. */}
      {s.origem && (
        <div className="mt-0.5">
          <Badge variant="neutro">via integração {s.origem.plataforma}</Badge>
        </div>
      )}
      <p className="text-xs text-zinc-500 line-clamp-2">{resumo(s.respostas)}</p>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="text-2xs text-zinc-400 truncate">{s.destinatario.rotulo}</span>
        {emAndamento(s.status) && (
          <span className={`inline-flex items-center gap-1 text-2xs shrink-0 ${venc ? 'font-medium text-danger' : 'text-zinc-400'}`}>{venc && <AlertTriangle size={11} />}{fmtDataBR(s.data_limite)}</span>
        )}
      </div>
      {/* Aprovadas (v5.9.0): QUEM autorizou e QUANDO. A data-limite continua visível
          acima, porque aprovada ainda está pendente de execução — e ainda pode vencer. */}
      {s.status === 'aprovada' && (
        <p className="mt-1 text-2xs font-medium text-warning-deep">
          Aprovada{s.aprovado_em ? ` em ${fmtDataHoraSP(s.aprovado_em)}` : ''}{s.aprovado_por_email ? ` por ${s.aprovado_por_email}` : ''}
        </p>
      )}
      {/* Concluídas: QUEM concluiu e QUANDO (fuso SP) — insumo do relatório futuro. */}
      {s.status === 'concluida' && (
        <p className="mt-1 text-2xs font-medium text-success">
          Concluída{s.decidido_em ? ` em ${fmtDataHoraSP(s.decidido_em)}` : ''}{s.decidido_por_email ? ` por ${s.decidido_por_email}` : ''}
        </p>
      )}
      {s.status === 'rejeitada' && (
        <p className="mt-1 text-2xs font-medium text-danger">
          Rejeitada{s.decidido_em ? ` em ${fmtDataHoraSP(s.decidido_em)}` : ''}{s.justificativa ? ` — ${s.justificativa}` : ''}
        </p>
      )}
      {s.status === 'cancelada' && (
        <p className="mt-1 text-2xs text-zinc-500">
          Cancelada por você{s.decidido_em ? ` em ${fmtDataHoraSP(s.decidido_em)}` : ''}
        </p>
      )}
    </div>
  )
}
