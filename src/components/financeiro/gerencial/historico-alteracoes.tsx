'use client'

import { useEffect, useState, useTransition } from 'react'
import { ChevronRight, Undo2, Loader2, AlertTriangle } from 'lucide-react'
import ConfirmModal from '@/components/shared/confirm-modal'
import ScrollAutoHide from '@/components/shared/scroll-auto-hide'
import { fmtDataHoraSP, numBRL2, fmtDate } from '@/lib/fmt'
import {
  historicoLotes, historicoLoteDetalhe, desfazerLote, desfazerLinha,
  type HistoricoLote, type HistoricoEntrada,
} from '@/app/financeiro/fluxo-caixa/gerencial/actions'

// Painel "Histórico de alterações" da Base de Dados (v5.2.1/M3). Colapsável; lista as AÇÕES
// agrupadas por lote (quem/quando/N linhas/operação), expande para o antes→depois por linha, e
// oferece Desfazer por lote e por linha. Fricção proporcional: reversão EM MASSA (>1 linha) pede
// confirmação forte (ConfirmModal); unitária é direta. As permissões (própria × terceiro/massa)
// são impostas no banco (0200) — aqui o erro amigável (conflito/negação) é só exibido.

const OP_LABEL: Record<string, string> = { I: 'inclusão', U: 'edição', D: 'exclusão' }

function rotuloOperacoes(ops: ('I' | 'U' | 'D')[], isUndo: boolean): string {
  if (isUndo) return 'Reversão'
  if (ops.length === 1) return OP_LABEL[ops[0]][0].toUpperCase() + OP_LABEL[ops[0]].slice(1)
  return 'Alterações' // lote misto (ex.: importação: inclui + remove + atualiza)
}

function resumoLinha(e: HistoricoEntrada): string {
  const d = (e.dados_depois ?? e.dados_antes) as Record<string, unknown> | null
  if (!d) return `linha ${e.registro_id}`
  const pessoa = String(d.pessoa ?? '—')
  const valor = d.valor_final != null ? `R$ ${numBRL2(Number(d.valor_final))}` : ''
  return `${pessoa}${valor ? ` · ${valor}` : ''}`
}

const CAMPOS_DIFF: { k: string; rot: string }[] = [
  { k: 'tipo', rot: 'Tipo' }, { k: 'pessoa', rot: 'Pessoa' }, { k: 'valor_final', rot: 'Valor' },
  { k: 'descricao', rot: 'Descrição' }, { k: 'conta_previsao', rot: 'Conta' },
  { k: 'vencimento', rot: 'Vencimento' }, { k: 'destacado', rot: 'Destaque' },
]

/** Formata um campo do lançamento para o diff, na convenção do DS: valor→"R$ 1.234,56",
 *  vencimento→"dd/mm/aaaa", destaque→"Sim"/"Não"; demais como texto. */
function fmtCampo(k: string, v: unknown): string {
  if (v == null || v === '') return '—'
  if (k === 'valor_final') return `R$ ${numBRL2(Number(v))}`
  if (k === 'vencimento') return fmtDate(String(v))
  if (k === 'destacado') return (v === true || v === 'true') ? 'Sim' : 'Não'
  return String(v)
}

function diffCampos(e: HistoricoEntrada): { rot: string; de: string; para: string }[] {
  if (e.operacao !== 'U' || !e.dados_antes || !e.dados_depois) return []
  const a = e.dados_antes, b = e.dados_depois
  return CAMPOS_DIFF
    .filter(({ k }) => String(a[k] ?? '') !== String(b[k] ?? ''))
    .map(({ k, rot }) => ({ rot, de: fmtCampo(k, a[k]), para: fmtCampo(k, b[k]) }))
}

function LoteDetalhe({ lote, onDesfeito }: { lote: string; onDesfeito: () => void }) {
  const [entradas, setEntradas] = useState<HistoricoEntrada[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [desfazendo, startDesfazer] = useTransition()
  const [confirmDel, setConfirmDel] = useState<number | null>(null)

  useEffect(() => {
    let ativo = true
    void historicoLoteDetalhe(lote).then(res => {
      if (!ativo) return
      if (res.success) setEntradas(res.entradas)
      else setErro(res.error)
    })
    return () => { ativo = false }
  }, [lote])

  const desfazerUma = (id: number) => {
    if (confirmDel !== id) { setConfirmDel(id); return }
    setConfirmDel(null)
    startDesfazer(async () => {
      const res = await desfazerLinha(id)
      if (res.success) onDesfeito()
      else setErro(res.error)
    })
  }

  if (erro) return <p className="px-3 py-2 text-2xs text-danger">{erro}</p>
  if (!entradas) return <p className="px-3 py-2 text-2xs text-zinc-400">Carregando…</p>

  return (
    <div className="bg-zinc-50/60 border-t border-zinc-100">
      {entradas.map(e => {
        const diffs = diffCampos(e)
        return (
          <div key={e.id} className="flex items-start justify-between gap-3 px-3 py-2 border-b border-zinc-100 last:border-0">
            <div className="min-w-0">
              <p className="text-2xs text-zinc-600">
                <span className="font-medium">{OP_LABEL[e.operacao]}</span> · {resumoLinha(e)}
              </p>
              {diffs.length > 0 && (
                <ul className="mt-0.5 space-y-0.5">
                  {diffs.map(d => (
                    <li key={d.rot} className="text-3xs text-zinc-400">
                      {d.rot}: <span className="line-through">{d.de}</span> → <span className="text-zinc-600">{d.para}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <button
              onClick={() => desfazerUma(e.id)}
              disabled={desfazendo}
              title={confirmDel === e.id ? 'Clique de novo para confirmar' : 'Desfazer esta linha'}
              className={`shrink-0 flex items-center gap-1 text-3xs px-1.5 py-0.5 rounded border transition-colors ${
                confirmDel === e.id ? 'border-[var(--danger)] text-[var(--danger)] bg-[var(--danger-bg)]' : 'border-zinc-200 text-zinc-400 hover:text-[var(--brand)] hover:border-[var(--brand)]'
              }`}>
              {desfazendo ? <Loader2 size={11} className="animate-spin" /> : <Undo2 size={11} />} desfazer
            </button>
          </div>
        )
      })}
    </div>
  )
}

export default function HistoricoAlteracoes({ recarregarKey, onDesfeito }: {
  recarregarKey: number
  onDesfeito: () => void
}) {
  const [aberto, setAberto] = useState(false)
  const [lotes, setLotes] = useState<HistoricoLote[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [expandido, setExpandido] = useState<string | null>(null)
  const [confirmMassa, setConfirmMassa] = useState<HistoricoLote | null>(null)
  const [desfazendo, startDesfazer] = useTransition()

  // Carrega/recarrega quando aberto (ou quando o parent muda recarregarKey após uma mudança).
  useEffect(() => {
    if (!aberto) return
    let ativo = true
    void historicoLotes(50, 0).then(res => {
      if (!ativo) return
      if (res.success) { setLotes(res.lotes); setErro(null) }
      else setErro(res.error)
    })
    return () => { ativo = false }
  }, [aberto, recarregarKey])

  const desfazer = (lote: HistoricoLote) => {
    startDesfazer(async () => {
      const res = await desfazerLote(lote.lote_id)
      setConfirmMassa(null)
      if (res.success) onDesfeito()
      else setErro(res.error)
    })
  }

  const clicarDesfazer = (lote: HistoricoLote) => {
    if (lote.n_linhas > 1) setConfirmMassa(lote) // restauração em massa → confirmação forte
    else desfazer(lote)                           // unitária → direta
  }

  return (
    <div className="mt-4 bg-white rounded-xl shadow-sm px-5 py-4">
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => setAberto(v => !v)} aria-expanded={aberto}
          title={aberto ? 'Recolher' : 'Expandir'}
          className="flex items-center gap-1.5 -ml-1 px-1 py-0.5 rounded foco-neutro">
          <ChevronRight size={14} className={`text-[var(--text-muted)] transition-transform ${aberto ? 'rotate-90' : ''}`} />
          <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">Histórico de alterações</span>
        </button>
      </div>

      {aberto && (
        <div className="mt-3">
          {erro && <p className="mb-2 text-2xs text-danger">{erro}</p>}
          {lotes == null ? (
            <p className="text-2xs text-zinc-400 py-3 text-center">Carregando…</p>
          ) : lotes.length === 0 ? (
            <p className="text-2xs text-zinc-400 py-3 text-center">Nenhuma alteração registrada ainda.</p>
          ) : (
            <ScrollAutoHide className="max-h-[420px] pr-4" contentClassName="space-y-1.5">
              {lotes.map(l => {
                const aberto2 = expandido === l.lote_id
                return (
                  <div key={l.lote_id} className="border border-zinc-100 rounded-lg overflow-hidden">
                    <div className="flex items-center justify-between gap-2 px-3 py-2">
                      <button onClick={() => setExpandido(aberto2 ? null : l.lote_id)}
                        className="flex items-center gap-2 min-w-0 text-left foco-neutro rounded">
                        <ChevronRight size={13} className={`shrink-0 text-zinc-400 transition-transform ${aberto2 ? 'rotate-90' : ''}`} />
                        <span className="min-w-0">
                          <span className="text-xs font-medium text-zinc-700">
                            {rotuloOperacoes(l.operacoes, l.is_undo)}
                            {l.is_undo && <span className="ml-1 text-3xs text-zinc-400">(desfazer)</span>}
                          </span>
                          <span className="block text-3xs text-zinc-400 truncate">
                            {l.usuario_nome ?? 'Sistema'} · {fmtDataHoraSP(l.criado_em)} · {l.n_linhas} {l.n_linhas === 1 ? 'linha' : 'linhas'}
                          </span>
                        </span>
                      </button>
                      <button
                        onClick={() => clicarDesfazer(l)}
                        disabled={desfazendo}
                        title="Desfazer este lote"
                        className="shrink-0 flex items-center gap-1 text-2xs px-2 py-1 rounded border border-zinc-200 text-zinc-500 hover:text-[var(--brand)] hover:border-[var(--brand)] transition-colors disabled:opacity-50">
                        {desfazendo ? <Loader2 size={12} className="animate-spin" /> : <Undo2 size={12} />} Desfazer
                      </button>
                    </div>
                    {aberto2 && <LoteDetalhe lote={l.lote_id} onDesfeito={onDesfeito} />}
                  </div>
                )
              })}
            </ScrollAutoHide>
          )}
        </div>
      )}

      {confirmMassa && (
        <ConfirmModal
          titulo="Desfazer alteração em massa"
          confirmarLabel={desfazendo ? 'Desfazendo…' : `Desfazer (${confirmMassa.n_linhas} linhas)`}
          onConfirmar={() => desfazer(confirmMassa)}
          onFechar={() => setConfirmMassa(null)}
          mensagem={
            <div className="space-y-2">
              <p>
                Reverter <strong>{confirmMassa.n_linhas}</strong> linha(s) da ação{' '}
                <strong>{rotuloOperacoes(confirmMassa.operacoes, confirmMassa.is_undo).toLowerCase()}</strong>
                {confirmMassa.usuario_nome ? <> de <strong>{confirmMassa.usuario_nome}</strong></> : ''}?
              </p>
              <p className="flex items-start gap-1.5 rounded-lg border border-[var(--warning)] bg-[var(--warning-bg)] px-2.5 py-2 text-xs text-[var(--warning)]">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <span>A restauração aplica o inverso de cada linha. Linhas alteradas por outra pessoa depois desta ação NÃO são sobrescritas — o desfazer avisa e nada é forçado.</span>
              </p>
            </div>
          }
        />
      )}
    </div>
  )
}
