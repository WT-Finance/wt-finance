'use client'

import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { fmtDataBR, resumo, vencida } from '@/lib/solicitacoes/format'
import { fmtDataHoraSP } from '@/lib/fmt'
import { PILL, PILL_NEUTRO, PILL_PRIMARIA, PILL_PRIMARIA_STYLE } from '@/components/admin/acessos/botoes'
import type { Solicitacao } from '@/lib/solicitacoes/schemas'

// v4.18/M7 — Minhas solicitações (visão do originador): COLUNAS POR STATUS (Abertas /
// Concluídas / Rejeitadas) sob o filtro "Ativas"; "Canceladas" lista as que o próprio
// originador cancelou (saem da visão Ativas). A coluna Concluídas mostra quem concluiu
// e quando (insumo do relatório futuro).

type Filtro = 'ativas' | 'canceladas'
const COLUNAS = [
  { status: 'aberta'    as const, titulo: 'Abertas' },
  { status: 'concluida' as const, titulo: 'Concluídas' },
  { status: 'rejeitada' as const, titulo: 'Rejeitadas' },
]

export default function MinhasSolicitacoes({ solicitacoes, onAbrir }: {
  solicitacoes: Solicitacao[]; onAbrir: (s: Solicitacao) => void
}) {
  const [filtro, setFiltro] = useState<Filtro>('ativas')
  const canceladas = solicitacoes.filter(s => s.status === 'cancelada')

  return (
    <div>
      <div className="flex gap-2 mb-4">
        {(['ativas', 'canceladas'] as Filtro[]).map(f => (
          <button key={f} type="button" onClick={() => setFiltro(f)}
            className={`${PILL} ${filtro === f ? PILL_PRIMARIA : PILL_NEUTRO}`}
            style={filtro === f ? PILL_PRIMARIA_STYLE : undefined}>
            {f === 'ativas' ? 'Ativas' : `Canceladas${canceladas.length ? ` (${canceladas.length})` : ''}`}
          </button>
        ))}
      </div>

      {filtro === 'ativas' ? (
        <div className="grid gap-4 sm:grid-cols-3">
          {COLUNAS.map(col => {
            const itens = solicitacoes.filter(s => s.status === col.status)
            if (col.status === 'aberta') itens.sort((a, b) => a.data_limite.localeCompare(b.data_limite))
            return (
              <div key={col.status}>
                <div className="flex items-center justify-between mb-2 px-1">
                  <h3 className="text-sm font-semibold text-zinc-700">{col.titulo}</h3>
                  <span className="text-xs text-zinc-400">{itens.length}</span>
                </div>
                <div className="space-y-2">
                  {itens.length === 0 && <div className="rounded-lg border border-dashed border-zinc-200 px-3 py-6 text-center text-xs text-zinc-400">—</div>}
                  {itens.map(s => <CardMinha key={s.id} s={s} onAbrir={onAbrir} />)}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="space-y-2 max-w-xl">
          {canceladas.length === 0
            ? <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-10 text-center text-sm text-zinc-400">Você não cancelou nenhuma solicitação.</p>
            : canceladas.map(s => <CardMinha key={s.id} s={s} onAbrir={onAbrir} />)}
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
        <span className="shrink-0 text-[11px] font-medium tabular-nums text-zinc-400">#{s.id}</span>
      </div>
      <p className="text-xs text-zinc-500 line-clamp-2">{resumo(s.respostas)}</p>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="text-[11px] text-zinc-400 truncate">{s.destinatario.rotulo}</span>
        {s.status === 'aberta' && (
          <span className={`inline-flex items-center gap-1 text-[11px] shrink-0 ${venc ? 'font-medium text-danger' : 'text-zinc-400'}`}>{venc && <AlertTriangle size={11} />}{fmtDataBR(s.data_limite)}</span>
        )}
      </div>
      {/* Concluídas: QUEM concluiu e QUANDO (fuso SP) — insumo do relatório futuro. */}
      {s.status === 'concluida' && (
        <p className="mt-1 text-[11px] font-medium text-success">
          Concluída{s.decidido_em ? ` em ${fmtDataHoraSP(s.decidido_em)}` : ''}{s.decidido_por_email ? ` por ${s.decidido_por_email}` : ''}
        </p>
      )}
      {s.status === 'rejeitada' && (
        <p className="mt-1 text-[11px] font-medium text-danger">
          Rejeitada{s.decidido_em ? ` em ${fmtDataHoraSP(s.decidido_em)}` : ''}{s.justificativa ? ` — ${s.justificativa}` : ''}
        </p>
      )}
      {s.status === 'cancelada' && (
        <p className="mt-1 text-[11px] text-zinc-500">
          Cancelada por você{s.decidido_em ? ` em ${fmtDataHoraSP(s.decidido_em)}` : ''}
        </p>
      )}
    </div>
  )
}
