'use client'

import { useState } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Loader2, AlertTriangle, Eye, ClipboardList } from 'lucide-react'
import { PILL, PILL_NEUTRO, PILL_PRIMARIA, PILL_PRIMARIA_STYLE, PILL_GESTAO, PILL_GESTAO_STYLE } from '@/components/admin/acessos/botoes'
import { FaixaMensagem } from '@/components/admin/acessos/faixa-mensagem'
import { concluirSolicitacao } from '@/app/solicitacoes/actions'
import { fmtDataBR, resumo, vencida } from '@/lib/solicitacoes/format'
import type { Solicitacao } from '@/lib/solicitacoes/schemas'

type Escopo = 'mim_e_role' | 'so_mim' | 'todas'
type FiltroStatus = 'abertas' | 'concluidas'

// Marcadores das ENCERRADAS na coluna "Concluídas" (v4.18/M6). O dado permanece com o
// status real (cancelada ≠ concluida) — só a apresentação distingue.
const ENCERRADA_INFO: Record<string, { rotulo: string; cor: string }> = {
  concluida: { rotulo: 'Concluída',                 cor: 'text-success' },
  rejeitada: { rotulo: 'Rejeitada',                 cor: 'text-danger' },
  cancelada: { rotulo: 'Cancelada pelo solicitante', cor: 'text-zinc-500' },
}

export default function BoardSolicitacoes({ solicitacoes, escopo, podeGestao, onAbrir }: {
  solicitacoes: Solicitacao[]; escopo: Escopo; podeGestao: boolean; onAbrir: (s: Solicitacao) => void
}) {
  const router = useRouter(); const pathname = usePathname(); const sp = useSearchParams()
  const [concluindo, setConcluindo] = useState<number | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  // v4.18/M6 — filtro de STATUS (substitui os antigos filtros de visão "mim e minha
  // permissão / só a mim"). O usuário SEMPRE vê mim + minha permissão (escopo mim_e_role);
  // "Ver todas" (gestão) é um modo separado. Default: Abertas.
  const [filtro, setFiltro] = useState<FiltroStatus>('abertas')

  const supervisao = escopo === 'todas'   // modo "Ver todas" (gestão) ativo
  function setEscopo(e: Escopo) {
    const p = new URLSearchParams(sp.toString()); p.set('escopo', e); p.set('view', 'caixa')
    router.push(`${pathname}?${p.toString()}`)
  }

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

  // Colunas por TIPO. NÃO exclui canceladas: elas entram em "Concluídas" (encerradas).
  const ehAberta = (s: Solicitacao) => s.status === 'aberta'
  const filtrada = solicitacoes.filter(filtro === 'abertas' ? ehAberta : s => !ehAberta(s))
  const tipos = Array.from(new Map(filtrada.map(s => [s.tipo_id, s.tipo_nome])).entries())
    .sort((a, b) => (a[1] ?? '').localeCompare(b[1] ?? ''))
  const vazio = filtro === 'abertas' ? 'Nenhuma solicitação aberta na sua caixa de entrada.' : 'Nenhuma solicitação encerrada.'

  return (
    <div>
      {msg && <FaixaMensagem tipo="erro" texto={msg} onFechar={() => setMsg(null)} />}

      {/* Barra: filtro de STATUS (esquerda) · controles de GESTÃO em âmbar, só admin (direita). */}
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex gap-2">
          {(['abertas', 'concluidas'] as FiltroStatus[]).map(f => (
            <button key={f} type="button" onClick={() => setFiltro(f)}
              className={`${PILL} ${filtro === f ? PILL_PRIMARIA : PILL_NEUTRO}`}
              style={filtro === f ? PILL_PRIMARIA_STYLE : undefined}>
              {f === 'abertas' ? 'Abertas' : 'Concluídas'}
            </button>
          ))}
        </div>
        {podeGestao && (
          <div className="flex gap-2">
            <button type="button" onClick={() => setEscopo(supervisao ? 'mim_e_role' : 'todas')}
              className={`${PILL} ${PILL_GESTAO}`} style={PILL_GESTAO_STYLE}
              title="Visão de supervisão: todas as solicitações do sistema">
              <Eye size={13} /> {supervisao ? 'Minha caixa' : 'Ver todas'}
            </button>
            <Link href="/admin/solicitacoes" className={`${PILL} ${PILL_GESTAO}`} style={PILL_GESTAO_STYLE}>
              <ClipboardList size={13} /> Gerenciar solicitações
            </Link>
          </div>
        )}
      </div>

      {supervisao && (
        <p className="mb-3 rounded-lg border px-3 py-1.5 text-xs"
          style={{ background: 'var(--gestao-soft)', borderColor: 'var(--gestao)', color: 'var(--gestao-fg)' }}>
          Modo supervisão — todas as solicitações do sistema. Use «Minha caixa» para voltar à sua visão.
        </p>
      )}

      {tipos.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-10 text-center text-sm text-zinc-400">{vazio}</p>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {tipos.map(([tipoId, tipoNome]) => {
            const itens = filtrada.filter(s => s.tipo_id === tipoId)
            const ordenados = filtro === 'abertas'
              ? [...itens].sort((a, b) => a.data_limite.localeCompare(b.data_limite))
              : itens
            return (
              <div key={tipoId} className="w-72 shrink-0">
                <div className="flex items-center justify-between mb-2 px-1">
                  <h3 className="text-sm font-semibold text-zinc-700 truncate">{tipoNome}</h3>
                  <span className="text-xs text-zinc-400">{ordenados.length}</span>
                </div>
                <div className="space-y-2">
                  {ordenados.length === 0 && <div className="rounded-lg border border-dashed border-zinc-200 px-3 py-6 text-center text-xs text-zinc-400">—</div>}
                  {ordenados.map(s => <Card key={s.id} s={s} onAbrir={onAbrir} concluindo={concluindo === s.id} onConcluir={concluir} />)}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Card({ s, onAbrir, concluindo, onConcluir }: { s: Solicitacao; onAbrir: (s: Solicitacao) => void; concluindo: boolean; onConcluir: (id: number, e: React.MouseEvent) => void }) {
  const aberta = s.status === 'aberta'
  const podeConcluir = s.sou_atendente || s.sou_solicitante
  const venc = vencida(s.data_limite, s.status)
  const enc = ENCERRADA_INFO[s.status]
  return (
    // card-clicavel-neutra: variante de plataforma do card-clicavel (ADR-0103 ext. v4.14.1).
    // role=button + tabIndex + onKeyDown p/ teclado; guard e.target !== e.currentTarget evita
    // que Enter no botão "Concluir" interno borbulhe e abra o drawer junto.
    <div
      role="button"
      tabIndex={0}
      onClick={() => onAbrir(s)}
      onKeyDown={e => { if (e.target !== e.currentTarget) return; if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAbrir(s) } }}
      className="card-clicavel-neutra foco-neutro cursor-pointer rounded-lg border border-zinc-200 bg-white px-3 py-2.5 shadow-sm"
    >
      <div className="flex items-start gap-2">
        {aberta ? (
          <button type="button" disabled={!podeConcluir || concluindo} onClick={e => onConcluir(s.id, e)} aria-label="Concluir"
            title={podeConcluir ? 'Concluir' : 'Sem permissão para concluir'}
            className={`foco-neutro relative before:absolute before:-inset-1 before:content-[''] mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${podeConcluir ? 'border-zinc-400 hover:border-emerald-500 hover:bg-emerald-50' : 'border-zinc-200'}`}>
            {concluindo && <Loader2 size={10} className="animate-spin" />}
          </button>
        ) : (
          // Encerrada: sem círculo de concluir (leitura). Espaçador alinha com as abertas.
          <span className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-zinc-900 truncate">{s.solicitante_email}</p>
          <p className="text-xs text-zinc-500 line-clamp-2">{resumo(s.respostas)}</p>
          <div className="mt-1.5 flex items-center justify-between gap-2">
            {aberta ? (
              <span className={`inline-flex items-center gap-1 text-[11px] ${venc ? 'font-medium text-red-600' : 'text-zinc-400'}`}>{venc && <AlertTriangle size={11} />}{fmtDataBR(s.data_limite)}</span>
            ) : (
              <span className={`text-[11px] font-medium ${enc?.cor ?? 'text-zinc-400'}`}>{enc?.rotulo ?? 'Encerrada'}</span>
            )}
            <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500 truncate max-w-[45%]">{s.destinatario.tipo === 'usuario' ? 'você' : s.destinatario.rotulo}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
