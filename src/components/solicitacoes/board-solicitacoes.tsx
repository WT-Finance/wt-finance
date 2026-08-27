'use client'

import { useState } from 'react'
import { Loader2, AlertTriangle, Search } from 'lucide-react'
import { PILL, PILL_NEUTRO, PILL_PRIMARIA, PILL_PRIMARIA_STYLE } from '@/components/shared/botoes'
import { FaixaMensagem } from '@/components/shared/faixa-mensagem'
import ScrollAutoHide from '@/components/shared/scroll-auto-hide'
import Badge from '@/components/ui/badge'
import { Input } from '@/components/ui/field'
import { concluirSolicitacao } from '@/app/solicitacoes/actions'
import { fmtDataBR, resumo, vencida, maisRecentePrimeiro, casaBuscaSolicitacao } from '@/lib/solicitacoes/format'
import { emAndamento } from '@/lib/solicitacoes/schemas'
import type { Solicitacao } from '@/lib/solicitacoes/schemas'

type Escopo = 'mim_e_role' | 'so_mim' | 'todas'
// v5.9.0 — três abas. O filtro antigo era binário ('abertas' e o COMPLEMENTO), o que
// com um estado novo mandaria 'aprovada' direto para as encerradas, sem erro nenhum.
// Cada aba passa a ter predicado PRÓPRIO e explícito — nada de negar o vizinho.
type FiltroStatus = 'abertas' | 'aprovadas' | 'encerradas'
const ABA: Record<FiltroStatus, { rotulo: string; casa: (s: Solicitacao) => boolean; vazio: string }> = {
  abertas:    { rotulo: 'Abertas',    casa: s => s.status === 'aberta',   vazio: 'Nenhuma solicitação aberta na sua caixa de entrada.' },
  aprovadas:  { rotulo: 'Aprovadas',  casa: s => s.status === 'aprovada', vazio: 'Nenhuma solicitação aprovada aguardando execução.' },
  encerradas: { rotulo: 'Encerradas', casa: s => !emAndamento(s.status),  vazio: 'Nenhuma solicitação encerrada.' },
}

// v5.7.2 — a ordem e a busca das listas vivem em `@/lib/solicitacoes/format`
// (`maisRecentePrimeiro`, `casaBuscaSolicitacao`): as DUAS visões desta página precisam
// ordenar e buscar igual, e duas cópias divergiriam no primeiro ajuste.

// Marcadores das ENCERRADAS na coluna "Concluídas" (v4.18/M6). O dado permanece com o
// status real (cancelada ≠ concluida) — só a apresentação distingue.
const ENCERRADA_INFO: Record<string, { rotulo: string; cor: string }> = {
  concluida: { rotulo: 'Concluída',                 cor: 'text-success' },
  rejeitada: { rotulo: 'Rejeitada',                 cor: 'text-danger' },
  cancelada: { rotulo: 'Cancelada pelo solicitante', cor: 'text-zinc-500' },
}

export default function BoardSolicitacoes({ solicitacoes, escopo, onAbrir }: {
  solicitacoes: Solicitacao[]; escopo: Escopo; onAbrir: (s: Solicitacao) => void
}) {
  const [concluindo, setConcluindo] = useState<number | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  // v4.18/M6 — filtro de STATUS (substitui os antigos filtros de visão). O usuário SEMPRE
  // vê mim + minha permissão; "Ver todas" (gestão, escopo=todas) fica na linha das abas.
  const [filtro, setFiltro] = useState<FiltroStatus>('abertas')
  const [busca, setBusca] = useState('')

  const supervisao = escopo === 'todas'   // modo "Ver todas" (gestão) ativo

  async function concluir(id: number, e: React.MouseEvent) {
    e.stopPropagation(); setMsg(null); setConcluindo(id)
    try {
      const r = await concluirSolicitacao(id)
      if (!r.ok) { setMsg(r.erro ?? 'Falha ao concluir.'); return }
    } catch {
      setMsg('Falha ao concluir.')
    } finally {
      setConcluindo(null)
    }
  }

  // Colunas por TIPO. "Encerradas" NÃO exclui canceladas — elas são um desfecho.
  const temBusca = busca.trim() !== ''
  const filtrada = solicitacoes
    .filter(ABA[filtro].casa)
    .filter(s => casaBuscaSolicitacao(s, busca))
  const tipos = Array.from(new Map(filtrada.map(s => [s.tipo_id, s.tipo_nome])).entries())
    .sort((a, b) => (a[1] ?? '').localeCompare(b[1] ?? ''))
  const vazio = temBusca ? 'Nenhuma solicitação encontrada para esta busca.' : ABA[filtro].vazio
  // Contagem da aba Aprovadas: sinaliza trabalho autorizado à espera de execução, que é
  // exatamente o que essa etapa existe para tornar visível.
  const nAprovadas = solicitacoes.filter(ABA.aprovadas.casa).length

  return (
    <div className="h-full flex flex-col min-h-0">
      {msg && <FaixaMensagem tipo="erro" texto={msg} onFechar={() => setMsg(null)} />}

      {supervisao && (
        <p className="mb-3 rounded-lg border px-3 py-1.5 text-xs"
          style={{ background: 'var(--gestao-soft)', borderColor: 'var(--gestao)', color: 'var(--gestao-fg)' }}>
          Modo supervisão — todas as solicitações do sistema. Use «Minha caixa» (acima) para voltar à sua visão.
        </p>
      )}

      {/* Filtro de STATUS: Abertas / Aprovadas / Encerradas + busca (nº ou e-mail). */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {(['abertas', 'aprovadas', 'encerradas'] as FiltroStatus[]).map(f => (
          <button key={f} type="button" onClick={() => setFiltro(f)}
            className={`${PILL} ${filtro === f ? PILL_PRIMARIA : PILL_NEUTRO}`}
            style={filtro === f ? PILL_PRIMARIA_STYLE : undefined}>
            {ABA[f].rotulo}{f === 'aprovadas' && nAprovadas > 0 ? ` (${nAprovadas})` : ''}
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

      {tipos.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-10 text-center text-sm text-zinc-400">{vazio}</p>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-2 flex-1 min-h-0">
          {tipos.map(([tipoId, tipoNome]) => {
            const itens = filtrada.filter(s => s.tipo_id === tipoId)
            const ordenados = [...itens].sort(maisRecentePrimeiro)
            return (
              <div key={tipoId} className="w-72 shrink-0 flex flex-col min-h-0">
                {/* Header da coluna FIXO (fora do scroll); os cards rolam por dentro com a
                    barra flutuante do DS — padrão de painel em colunas (v5.1.1, DS). */}
                <div className="flex items-center justify-between mb-1 px-1">
                  <h3 className="text-sm font-semibold text-zinc-700 truncate">{tipoNome}</h3>
                  <span className="text-xs text-zinc-400">{ordenados.length}</span>
                </div>
                <ScrollAutoHide className="pl-1 pr-4 pt-2 pb-2" contentClassName="space-y-2">
                  {ordenados.length === 0 && <div className="rounded-lg border border-dashed border-zinc-200 px-3 py-6 text-center text-xs text-zinc-400">—</div>}
                  {ordenados.map(s => (
                    <Card key={s.id} s={s} onAbrir={onAbrir} concluindo={concluindo === s.id} onConcluir={concluir} />
                  ))}
                </ScrollAutoHide>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Card({ s, onAbrir, concluindo, onConcluir }: {
  s: Solicitacao; onAbrir: (s: Solicitacao) => void; concluindo: boolean
  onConcluir: (id: number, e: React.MouseEvent) => void
}) {
  // v5.9.0 — o que libera a ação rápida é estar EM ANDAMENTO, não estar 'aberta':
  // `solic_concluir` aceita as duas origens, e uma aprovada é justamente a que está
  // pronta para ser concluída (o pagamento foi feito).
  const emAnd = emAndamento(s.status)
  const podeConcluir = s.sou_atendente || s.sou_solicitante
  const venc = vencida(s.data_limite, s.status)
  const enc = ENCERRADA_INFO[s.status]
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onAbrir(s)}
      onKeyDown={e => { if (e.target !== e.currentTarget) return; if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAbrir(s) } }}
      className="card-clicavel-neutra foco-neutro cursor-pointer rounded-lg border border-zinc-200 bg-white px-3 py-2.5 shadow-sm"
    >
      <div className="flex items-start gap-2">
        {emAnd ? (
          <button
            type="button" disabled={!podeConcluir || concluindo} aria-label="Concluir"
            onClick={e => { e.stopPropagation(); onConcluir(s.id, e) }}
            title={podeConcluir ? 'Concluir' : 'Sem permissão para concluir'}
            className={`foco-neutro relative before:absolute before:-inset-1 before:content-[''] mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${podeConcluir ? 'border-zinc-400 hover:border-success hover:bg-success-bg' : 'border-zinc-200'}`}>
            {concluindo && <Loader2 size={10} className="animate-spin" />}
          </button>
        ) : (
          <span className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-medium text-zinc-900 truncate">{s.solicitante_email}</p>
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
            {emAnd ? (
              <span className={`inline-flex items-center gap-1 text-2xs ${venc ? 'font-medium text-danger' : 'text-zinc-400'}`}>{venc && <AlertTriangle size={11} />}{fmtDataBR(s.data_limite)}</span>
            ) : (
              <span className={`text-2xs font-medium ${enc?.cor ?? 'text-zinc-400'}`}>{enc?.rotulo ?? 'Encerrada'}</span>
            )}
            <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-3xs text-zinc-500 truncate max-w-[45%]">{s.destinatario.tipo === 'usuario' ? 'você' : s.destinatario.rotulo}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
