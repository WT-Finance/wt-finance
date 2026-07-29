'use client'

import { useEffect, useState, useTransition } from 'react'
import { ChevronRight, Undo2, Loader2, AlertTriangle } from 'lucide-react'
import ConfirmModal from '@/components/shared/confirm-modal'
import ScrollAutoHide from '@/components/shared/scroll-auto-hide'
import { fmtDataHoraSP, numBRL2, fmtDate } from '@/lib/fmt'
import type { HistoricoLote, HistoricoEntrada } from '@/lib/dre/schemas'
import {
  historicoLotes, historicoLoteDetalhe, desfazerLote, desfazerLinha,
} from '@/app/financeiro/fluxo-caixa/gerencial/actions'

// Painel "Histórico de alterações" (v5.2.1/M3, Gerencial). Colapsável; lista as AÇÕES
// agrupadas por lote (quem/quando/N linhas/operação), expande para o antes→depois por linha,
// e oferece Desfazer por lote e por linha. Fricção proporcional: reversão EM MASSA (>1 linha)
// pede confirmação forte (ConfirmModal); unitária é direta. As permissões (própria × terceiro/
// massa) são impostas no banco — aqui o erro amigável (conflito/negação) é só exibido.
//
// GENERALIZAÇÃO (v5.3.0/M2-front): `fetchers`/`camposDiff`/`titulo` são OPCIONAIS — omitidos,
// o painel se comporta EXATAMENTE como antes (Gerencial, via os defaults abaixo). A estrutura
// viva da DRE (v5.3.0/M5) é o segundo consumidor: injeta os fetchers das próprias actions
// (mesmo contrato de RPC/diário — 0206) e os campos do seu diff. Os TIPOS `HistoricoLote`/
// `HistoricoEntrada` vêm de `@/lib/dre/schemas` (shape idêntico ao das RPCs do Gerencial —
// mesma tabela `financeiro.diario_alteracoes`), fonte única para os dois consumidores.

export interface CampoDiff {
  campo: string
  rotulo: string
  /** Formata o valor bruto do campo para exibição no diff. Omitido = String(v) ou '—' se vazio. */
  fmt?: (v: unknown) => string
}

export interface HistoricoFetchers {
  lotes:         (limit: number, offset: number) => Promise<HistoricoLote[] | null>
  lote:          (loteId: string) => Promise<HistoricoEntrada[] | null>
  desfazerLote:  (loteId: string) => Promise<{ ok: boolean; erro?: string }>
  desfazerLinha: (id: number) => Promise<{ ok: boolean; erro?: string }>
}

export interface HistoricoAlteracoesProps {
  recarregarKey: number
  onDesfeito: () => void
  /** Fonte de dados. Default = as server actions do Gerencial (comportamento pré-v5.3.0). */
  fetchers?: HistoricoFetchers
  /** Campos comparados no diff de uma entrada 'U'. Default = os campos do lançamento manual. */
  camposDiff?: CampoDiff[]
  /** Rótulo do cabeçalho colapsável. Default = 'Histórico de alterações'. */
  titulo?: string
  /** Guarda ANTES de qualquer desfazer (lote ou linha): resolva `false` para cancelar sem
   *  erro. Uso (v5.3.0): a página da estrutura da DRE avisa quando o EDITOR ao lado tem
   *  pendências não salvas — o refresh pós-undo as descartaria em silêncio. Default: passa. */
  antesDeDesfazer?: () => Promise<boolean>
}

const ANTES_PASSA = () => Promise.resolve(true) // default módulo-level: identidade estável

const OP_LABEL: Record<string, string> = { I: 'inclusão', U: 'edição', D: 'exclusão' }

function rotuloOperacoes(ops: string[], isUndo: boolean): string {
  if (isUndo) return 'Reversão'
  if (ops.length === 1) return OP_LABEL[ops[0]][0].toUpperCase() + OP_LABEL[ops[0]].slice(1)
  return 'Alterações' // lote misto (ex.: importação: inclui + remove + atualiza)
}

/** Resumo de UMA linha do lote: tenta os campos comuns aos dois consumidores atuais
 *  (Gerencial: pessoa+valor_final; estrutura da DRE: rotulo/nome) — cai no id se nenhum existe. */
function resumoLinha(e: HistoricoEntrada): string {
  const d = (e.dados_depois ?? e.dados_antes) as Record<string, unknown> | null
  if (!d) return `linha ${e.registro_id}`
  const principal = String(d.pessoa ?? d.rotulo ?? d.nome ?? `#${e.registro_id}`)
  const valor = d.valor_final != null ? `R$ ${numBRL2(Number(d.valor_final))}` : ''
  return `${principal}${valor ? ` · ${valor}` : ''}`
}

function fmtValorDiff(v: unknown, fmt?: (v: unknown) => string): string {
  if (fmt) return fmt(v)
  return v == null || v === '' ? '—' : String(v)
}

function diffCampos(e: HistoricoEntrada, campos: CampoDiff[]): { rot: string; de: string; para: string }[] {
  if (e.operacao !== 'U' || !e.dados_antes || !e.dados_depois) return []
  const a = e.dados_antes, b = e.dados_depois
  return campos
    .filter(({ campo }) => String(a[campo] ?? '') !== String(b[campo] ?? ''))
    .map(({ campo, rotulo, fmt }) => ({ rot: rotulo, de: fmtValorDiff(a[campo], fmt), para: fmtValorDiff(b[campo], fmt) }))
}

/** Campos do diff PADRÃO (Gerencial) — inclusão/edição/exclusão de lançamento manual. */
const CAMPOS_DIFF_GERENCIAL: CampoDiff[] = [
  { campo: 'tipo', rotulo: 'Tipo' },
  { campo: 'pessoa', rotulo: 'Pessoa' },
  { campo: 'valor_final', rotulo: 'Valor', fmt: v => (v == null || v === '' ? '—' : `R$ ${numBRL2(Number(v))}`) },
  { campo: 'descricao', rotulo: 'Descrição' },
  { campo: 'conta_previsao', rotulo: 'Conta' },
  { campo: 'vencimento', rotulo: 'Vencimento', fmt: v => (v == null || v === '' ? '—' : fmtDate(String(v))) },
  { campo: 'destacado', rotulo: 'Destaque', fmt: v => ((v === true || v === 'true') ? 'Sim' : 'Não') },
]

/** Fetchers PADRÃO (Gerencial) — embrulham as server actions atuais no contrato genérico. */
const FETCHERS_GERENCIAL: HistoricoFetchers = {
  lotes: async (limit, offset) => {
    const res = await historicoLotes(limit, offset)
    return res.success ? res.lotes : null
  },
  lote: async (loteId) => {
    const res = await historicoLoteDetalhe(loteId)
    return res.success ? res.entradas : null
  },
  desfazerLote: async (loteId) => {
    const res = await desfazerLote(loteId)
    return res.success ? { ok: true } : { ok: false, erro: res.error }
  },
  desfazerLinha: async (id) => {
    const res = await desfazerLinha(id)
    return res.success ? { ok: true } : { ok: false, erro: res.error }
  },
}

function LoteDetalhe({ lote, fetchers, camposDiff, onDesfeito, antesDeDesfazer }: {
  lote: string
  fetchers: HistoricoFetchers
  camposDiff: CampoDiff[]
  onDesfeito: () => void
  antesDeDesfazer: () => Promise<boolean>
}) {
  const [entradas, setEntradas] = useState<HistoricoEntrada[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [desfazendo, startDesfazer] = useTransition()
  const [confirmDel, setConfirmDel] = useState<number | null>(null)

  useEffect(() => {
    let ativo = true
    void fetchers.lote(lote).then(res => {
      if (!ativo) return
      if (res) setEntradas(res)
      else setErro('Não foi possível carregar o detalhe deste lote.')
    })
    return () => { ativo = false }
  }, [lote, fetchers])

  const desfazerUma = (id: number) => {
    if (confirmDel !== id) { setConfirmDel(id); return }
    setConfirmDel(null)
    startDesfazer(async () => {
      if (!(await antesDeDesfazer())) return   // guarda externa (pendências do editor) — cancela sem erro
      const res = await fetchers.desfazerLinha(id)
      if (res.ok) onDesfeito()
      else setErro(res.erro ?? 'Erro ao desfazer.')
    })
  }

  if (erro) return <p className="px-3 py-2 text-2xs text-danger">{erro}</p>
  if (!entradas) return <p className="px-3 py-2 text-2xs text-zinc-400">Carregando…</p>

  return (
    <div className="bg-zinc-50/60 border-t border-zinc-100">
      {entradas.map(e => {
        const diffs = diffCampos(e, camposDiff)
        return (
          <div key={e.id} className="flex items-start justify-between gap-3 px-3 py-2 border-b border-zinc-100 last:border-0">
            <div className="min-w-0">
              <p className="text-2xs text-zinc-600">
                <span className="font-medium">{OP_LABEL[e.operacao] ?? e.operacao}</span> · {resumoLinha(e)}
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

export default function HistoricoAlteracoes({
  recarregarKey, onDesfeito,
  fetchers = FETCHERS_GERENCIAL,
  camposDiff = CAMPOS_DIFF_GERENCIAL,
  titulo = 'Histórico de alterações',
  antesDeDesfazer = ANTES_PASSA,
}: HistoricoAlteracoesProps) {
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
    void fetchers.lotes(50, 0).then(res => {
      if (!ativo) return
      if (res) { setLotes(res); setErro(null) }
      else setErro('Não foi possível carregar o histórico.')
    })
    return () => { ativo = false }
  }, [aberto, recarregarKey, fetchers])

  const desfazer = (lote: HistoricoLote) => {
    startDesfazer(async () => {
      if (!(await antesDeDesfazer())) { setConfirmMassa(null); return }  // guarda externa — cancela sem erro
      const res = await fetchers.desfazerLote(lote.lote_id)
      setConfirmMassa(null)
      if (res.ok) onDesfeito()
      else setErro(res.erro ?? 'Erro ao desfazer.')
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
          <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">{titulo}</span>
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
                    {aberto2 && <LoteDetalhe lote={l.lote_id} fetchers={fetchers} camposDiff={camposDiff} onDesfeito={onDesfeito} antesDeDesfazer={antesDeDesfazer} />}
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
