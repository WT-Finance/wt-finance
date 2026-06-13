'use client'

import { Paperclip, X } from 'lucide-react'
import { CAMPO } from '@/lib/ui/campos'
import type { CampoDef } from '@/lib/solicitacoes/schemas'

// Motor de render dinâmico dos campos de um tipo (v4.16.0). Presentational: recebe a
// definição + valores + callbacks; o modal orquestra upload de anexo. O SERVIDOR é a
// fonte de verdade da validação (criar_solicitacao) — aqui só HTML5 + marca de obrigatório.

const INPUT = CAMPO

export interface AnexoLocal { nome: string; enviando?: boolean; erro?: boolean }

interface Props {
  campos:        CampoDef[]
  valores:       Record<string, string>
  onValor:       (campoId: number, valor: string) => void
  anexos:        Record<number, AnexoLocal[]>
  onAnexoSelect: (campoId: number, files: FileList) => void
  onAnexoRemove: (campoId: number, idx: number) => void
}

export default function CamposDinamicos({ campos, valores, onValor, anexos, onAnexoSelect, onAnexoRemove }: Props) {
  if (campos.length === 0) return null
  return (
    <div className="space-y-3">
      {campos.map(campo => {
        const id = campo.id as number
        const v = valores[String(id)] ?? ''
        return (
          <div key={id}>
            <label htmlFor={`campo-${id}`} className="block text-xs font-medium text-zinc-600 mb-1">
              {campo.rotulo}{campo.obrigatorio && <span className="text-red-500" aria-hidden> *</span>}
            </label>

            {campo.tipo_campo === 'texto_longo' ? (
              <textarea id={`campo-${id}`} rows={3} value={v} onChange={e => onValor(id, e.target.value)} className={`${INPUT} resize-none`} />
            ) : campo.tipo_campo === 'selecao' ? (
              <select id={`campo-${id}`} value={v} onChange={e => onValor(id, e.target.value)} className={INPUT}>
                <option value="">Selecione…</option>
                {(campo.opcoes ?? []).map(op => <option key={op} value={op}>{op}</option>)}
              </select>
            ) : campo.tipo_campo === 'data' ? (
              <input id={`campo-${id}`} type="date" value={v} onChange={e => onValor(id, e.target.value)} className={INPUT} />
            ) : campo.tipo_campo === 'numero' || campo.tipo_campo === 'moeda' ? (
              <div className="relative">
                {campo.tipo_campo === 'moeda' && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-400">R$</span>}
                <input id={`campo-${id}`} inputMode="decimal" value={v}
                  onChange={e => onValor(id, e.target.value.replace(/[^\d.,-]/g, ''))}
                  className={`${INPUT} ${campo.tipo_campo === 'moeda' ? 'pl-9' : ''}`} placeholder="0" />
              </div>
            ) : campo.tipo_campo === 'anexo' ? (
              <div>
                <label className="foco-neutro flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-zinc-300 px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-50">
                  <Paperclip size={14} /> Anexar arquivo (PDF, imagem ou planilha, ≤10 MB)
                  <input type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.csv,application/pdf,image/*"
                    onChange={e => { if (e.target.files?.length) { onAnexoSelect(id, e.target.files); e.target.value = '' } }} />
                </label>
                {(anexos[id] ?? []).map((a, i) => (
                  <div key={i} className={`mt-1 flex items-center justify-between gap-2 rounded border px-2 py-1 text-xs ${a.erro ? 'border-red-200 bg-red-50 text-red-600' : 'border-zinc-200 bg-zinc-50 text-zinc-600'}`}>
                    <span className="truncate">{a.enviando ? 'Enviando… ' : ''}{a.nome}</span>
                    <button type="button" onClick={() => onAnexoRemove(id, i)} aria-label="Remover" className="foco-neutro shrink-0 rounded p-0.5 text-zinc-400 hover:text-red-600"><X size={13} /></button>
                  </div>
                ))}
              </div>
            ) : (
              <input id={`campo-${id}`} type="text" value={v} onChange={e => onValor(id, e.target.value)} className={INPUT} />
            )}
          </div>
        )
      })}
    </div>
  )
}
