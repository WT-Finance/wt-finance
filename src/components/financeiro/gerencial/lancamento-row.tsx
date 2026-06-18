'use client'

import { useState, useTransition, type ReactNode } from 'react'
import { Trash2, Loader2, Check, FileSpreadsheet, PencilLine, PaintBucket } from 'lucide-react'
import { updateLancamento, deleteLancamento } from '@/app/financeiro/fluxo-caixa/gerencial/actions'
import { ValorContabil } from '@/components/shared/valor-contabil'

export interface Lancamento {
  id:             number
  tipo:           string
  pessoa:         string
  valor_final:    number
  descricao:      string | null
  conta_previsao: string | null
  vencimento:     string
  origem:         string
  /** Destaque persistente (v4.22 patch): pinta o fundo da linha de amarelo. */
  destacado:      boolean
}

interface CellState { saving: boolean; saved: boolean; error: string | null }

function EditableCell({
  value, onSave, type = 'text', options, align = 'left', accounting = false, accountingClassName, before, badge = false,
}: {
  value: string | number | null
  onSave: (v: string) => Promise<void>
  type?: 'text' | 'number' | 'date' | 'select'
  options?: string[]
  /** Alinhamento da célula de exibição (Valor → 'right'). */
  align?: 'left' | 'right'
  /** Renderiza o display do valor em formato contábil (<ValorContabil>). */
  accounting?: boolean
  /** Classe de cor do número no display contábil (ex.: A pagar → vermelho). */
  accountingClassName?: string
  /** Conteúdo opcional prefixado à célula de exibição (ex.: ícone de origem). */
  before?: ReactNode
  /** Exibe o valor (select) como pill compacto numa linha só (ex.: Tipo). */
  badge?: boolean
}) {
  const [editing, setEditing]   = useState(false)
  const [localVal, setLocalVal] = useState(String(value ?? ''))
  const [state, setState]       = useState<CellState>({ saving: false, saved: false, error: null })

  const save = async () => {
    if (localVal === String(value ?? '')) { setEditing(false); return }
    setState({ saving: true, saved: false, error: null })
    await onSave(localVal)
    setState({ saving: false, saved: true, error: null })
    setEditing(false)
    setTimeout(() => setState(s => ({ ...s, saved: false })), 1200)
  }

  const tdAlign = align === 'right' ? 'text-right' : ''

  // ── type=select (Tipo, Conta) ──────────────────────────────────────────────
  if (type === 'select' && options) {
    const displaySelect = localVal || '—'
    return (
      <td className="py-1 px-2">
        {editing ? (
          <select
            autoFocus
            value={localVal}
            onChange={e => setLocalVal(e.target.value)}
            onBlur={save}
            className="w-full text-xs border border-[var(--brand)] rounded px-1 py-0.5 outline-none bg-white"
          >
            {options.map(o => <option key={o}>{o}</option>)}
          </select>
        ) : badge ? (
          // Pill compacto numa linha só (Tipo) — altura uniforme, sem quebra.
          <span onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1 cursor-pointer rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[11px] font-medium text-zinc-600 whitespace-nowrap transition-colors hover:border-brand hover:text-brand"
            title={displaySelect}>
            {displaySelect}
            {state.saved && <Check size={10} className="text-green-500" />}
            {state.saving && <Loader2 size={10} className="animate-spin" />}
          </span>
        ) : (
          <span onClick={() => setEditing(true)}
            className="cursor-pointer text-xs hover:text-[var(--brand)] transition-colors block truncate"
            title={displaySelect}>
            {displaySelect}
            {state.saved && <Check size={10} className="inline ml-1 text-green-500" />}
            {state.saving && <Loader2 size={10} className="inline ml-1 animate-spin" />}
          </span>
        )}
      </td>
    )
  }

  // ── Valor (contábil, alinhado à direita) ────────────────────────────────────
  if (accounting) {
    return (
      <td className={`py-1 px-2 ${tdAlign}`}>
        {editing ? (
          <input
            autoFocus
            type="number"
            step="0.01"
            value={localVal}
            onChange={e => setLocalVal(e.target.value)}
            onBlur={save}
            onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
            className="w-full text-xs border border-[var(--brand)] rounded px-1 py-0.5 outline-none min-w-0 text-right"
          />
        ) : (
          <span onClick={() => setEditing(true)}
            className="cursor-pointer text-xs hover:opacity-70 transition-opacity block">
            <ValorContabil valor={Number(value ?? 0)} className={accountingClassName} />
            {state.saved && <Check size={10} className="inline ml-1 text-green-500" />}
            {state.saving && <Loader2 size={10} className="inline ml-1 animate-spin" />}
          </span>
        )}
      </td>
    )
  }

  // ── texto/data ──────────────────────────────────────────────────────────────
  const displayValue = value ?? '—'

  return (
    <td className={`py-1 px-2 ${tdAlign}`}>
      {editing ? (
        <input
          autoFocus
          type={type}
          value={localVal}
          onChange={e => setLocalVal(e.target.value)}
          onBlur={save}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
          className="w-full text-xs border border-[var(--brand)] rounded px-1 py-0.5 outline-none min-w-0"
        />
      ) : (
        <span onClick={() => setEditing(true)}
          className="cursor-pointer text-xs hover:text-[var(--brand)] transition-colors flex items-center gap-1 min-w-0">
          {before}
          <span className="block truncate" title={String(displayValue)}>{displayValue}</span>
          {state.saved && <Check size={10} className="inline ml-1 shrink-0 text-green-500" />}
          {state.saving && <Loader2 size={10} className="inline ml-1 shrink-0 animate-spin" />}
        </span>
      )}
    </td>
  )
}

interface Props {
  lancamento:      Lancamento
  onDelete:        () => void
  /** Opções do select de Conta (contas reais + "Outras"). */
  contasOpcoes:    string[]
  selecionado?:    boolean
  onToggleSelecao?: () => void
}

export function LancamentoRow({ lancamento: l, onDelete, contasOpcoes, selecionado = false, onToggleSelecao }: Props) {
  const [isPending, startDelete] = useTransition()
  const [confirmDel, setConfirmDel] = useState(false)
  // Destaque persistente (otimista local + persistência no banco via updateLancamento).
  const [destacado, setDestacado] = useState(l.destacado)
  const [, startDestaque] = useTransition()

  const makeSaver = (campo: string) => async (valor: string) => {
    const valorParsed = campo === 'valor_final' ? Number(valor) : valor || null
    await updateLancamento(l.id, campo, valorParsed)
  }

  const handleDelete = () => {
    if (!confirmDel) { setConfirmDel(true); return }
    startDelete(async () => {
      await deleteLancamento(l.id)
      onDelete()
    })
  }

  const toggleDestaque = () => {
    const novo = !destacado
    setDestacado(novo)
    startDestaque(async () => { await updateLancamento(l.id, 'destacado', novo) })
  }

  const ehManual = l.origem === 'manual'

  // Ícone discreto de origem — agora ao lado das ações (origem · destaque · lixeira).
  const iconeOrigem = (
    <span className="shrink-0 text-zinc-400"
      title={ehManual ? 'Linha criada manualmente' : 'Linha vinda da importação da planilha'}>
      {ehManual ? <PencilLine size={12} /> : <FileSpreadsheet size={12} />}
    </span>
  )

  // Fallback: se o conta_previsao atual (linha legada) não estiver nas opções, inclui-o
  // para não sumir do select. Tratamos null/'' como sem-conta (não força "Outras").
  const contaAtual = l.conta_previsao ?? ''
  const opcoesConta = contaAtual && !contasOpcoes.includes(contaAtual)
    ? [contaAtual, ...contasOpcoes]
    : contasOpcoes

  // Cor do valor por tipo (item 3): A pagar → vermelho, A receber → verde.
  const corValor = l.tipo === 'A pagar' ? 'text-[var(--negative-deep)]' : 'text-[var(--positive-deep)]'

  // Fundo da linha: seleção (transitória) prevalece; senão o destaque amarelo (persistente).
  const bgLinha = selecionado ? 'bg-[var(--brand-soft)]/30' : destacado ? 'bg-amber-100' : 'hover:bg-zinc-50/50'

  return (
    <tr className={`border-b border-zinc-50 ${bgLinha}`}>
      <td className="py-1 px-2 text-center">
        <input type="checkbox" checked={selecionado} onChange={onToggleSelecao}
          className="accent-[var(--brand)] cursor-pointer" aria-label="Selecionar linha" />
      </td>
      <EditableCell value={l.tipo}           onSave={makeSaver('tipo')}           type="select" options={['A pagar', 'A receber']} badge />
      <EditableCell value={l.pessoa}         onSave={makeSaver('pessoa')} />
      <EditableCell value={l.valor_final}    onSave={makeSaver('valor_final')}    accounting align="right" accountingClassName={corValor} />
      <EditableCell value={l.descricao}      onSave={makeSaver('descricao')} />
      <EditableCell value={l.conta_previsao} onSave={makeSaver('conta_previsao')} type="select" options={opcoesConta} />
      <EditableCell value={l.vencimento}     onSave={makeSaver('vencimento')}     type="date" />
      <td className="py-1 px-2">
        <div className="flex items-center justify-end gap-1.5">
          {iconeOrigem}
          <button
            onClick={toggleDestaque}
            title={destacado ? 'Remover destaque' : 'Destacar linha'}
            aria-pressed={destacado}
            className={`p-1 rounded transition-colors ${destacado ? 'text-amber-500 bg-amber-50' : 'text-zinc-300 hover:text-amber-400'}`}
          >
            <PaintBucket size={12} />
          </button>
          <button
            onClick={handleDelete}
            disabled={isPending}
            title={confirmDel ? 'Clique novamente para confirmar' : 'Remover'}
            className={`p-1 rounded transition-colors ${confirmDel ? 'text-red-500 bg-red-50' : 'text-zinc-300 hover:text-red-400'}`}
          >
            {isPending ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
          </button>
        </div>
      </td>
    </tr>
  )
}
