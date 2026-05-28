'use client'

import { useState, useTransition } from 'react'
import { Trash2, Loader2, Check } from 'lucide-react'
import { fmtBRL } from '@/lib/fmt'
import { updateLancamento, deleteLancamento } from '@/app/financeiro/fluxo-caixa/gerencial/actions'

export interface Lancamento {
  id:             number
  tipo:           string
  pessoa:         string
  valor_final:    number
  descricao:      string | null
  conta_previsao: string | null
  vencimento:     string
  origem:         string
}

interface CellState { saving: boolean; saved: boolean; error: string | null }

function EditableCell({
  value, onSave, type = 'text', options,
}: {
  value: string | number | null
  onSave: (v: string) => Promise<void>
  type?: 'text' | 'number' | 'date' | 'select'
  options?: string[]
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

  const displayValue = type === 'number'
    ? fmtBRL(Number(value ?? 0))
    : (value ?? '—')

  if (type === 'select' && options) {
    return (
      <td className="py-1 px-2">
        {editing ? (
          <select
            autoFocus
            value={localVal}
            onChange={e => setLocalVal(e.target.value)}
            onBlur={save}
            className="w-full text-xs border border-[var(--brand)] rounded px-1 py-0.5 outline-none"
          >
            {options.map(o => <option key={o}>{o}</option>)}
          </select>
        ) : (
          <span onClick={() => setEditing(true)}
            className="cursor-pointer text-xs hover:text-[var(--brand)] transition-colors">
            {localVal || '—'}
            {state.saved && <Check size={10} className="inline ml-1 text-green-500" />}
            {state.saving && <Loader2 size={10} className="inline ml-1 animate-spin" />}
          </span>
        )}
      </td>
    )
  }

  return (
    <td className="py-1 px-2">
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
          className="cursor-pointer text-xs hover:text-[var(--brand)] transition-colors block truncate">
          {displayValue}
          {state.saved && <Check size={10} className="inline ml-1 text-green-500" />}
          {state.saving && <Loader2 size={10} className="inline ml-1 animate-spin" />}
        </span>
      )}
    </td>
  )
}

interface Props {
  lancamento: Lancamento
  onDelete:   () => void
}

export function LancamentoRow({ lancamento: l, onDelete }: Props) {
  const [isPending, startDelete] = useTransition()
  const [confirmDel, setConfirmDel] = useState(false)

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

  return (
    <tr className="border-b border-zinc-50 hover:bg-zinc-50/50">
      <EditableCell value={l.tipo}           onSave={makeSaver('tipo')}           type="select" options={['A pagar', 'A receber']} />
      <EditableCell value={l.pessoa}         onSave={makeSaver('pessoa')} />
      <EditableCell value={l.valor_final}    onSave={makeSaver('valor_final')}    type="number" />
      <EditableCell value={l.descricao}      onSave={makeSaver('descricao')} />
      <EditableCell value={l.conta_previsao} onSave={makeSaver('conta_previsao')} />
      <EditableCell value={l.vencimento}     onSave={makeSaver('vencimento')}     type="date" />
      <td className="py-1 px-2">
        <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${l.origem === 'manual' ? 'bg-[var(--brand-soft)] text-[var(--brand-deep)]' : 'bg-zinc-100 text-zinc-500'}`}>
          {l.origem}
        </span>
      </td>
      <td className="py-1 px-2 text-right">
        <button
          onClick={handleDelete}
          disabled={isPending}
          title={confirmDel ? 'Clique novamente para confirmar' : 'Remover'}
          className={`p-1 rounded transition-colors ${confirmDel ? 'text-red-500 bg-red-50' : 'text-zinc-300 hover:text-red-400'}`}
        >
          {isPending ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
        </button>
      </td>
    </tr>
  )
}
