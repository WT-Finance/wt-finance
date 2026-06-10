'use client'

import { X } from 'lucide-react'

// Faixa de feedback (sucesso/erro) no topo das abas e painéis — sem lib de toast.
export function FaixaMensagem({
  tipo,
  texto,
  onFechar,
}: {
  tipo:     'sucesso' | 'erro'
  texto:    string
  onFechar?: () => void
}) {
  const cores = tipo === 'sucesso'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : 'border-red-200 bg-red-50 text-red-700'

  return (
    <div
      role={tipo === 'erro' ? 'alert' : 'status'}
      className={`mb-4 flex items-start justify-between gap-3 rounded-lg border px-4 py-2.5 text-sm ${cores}`}
    >
      <span>{texto}</span>
      {onFechar && (
        <button
          type="button"
          onClick={onFechar}
          aria-label="Fechar mensagem"
          className="shrink-0 mt-0.5 opacity-60 hover:opacity-100 transition-opacity"
        >
          <X size={14} />
        </button>
      )}
    </div>
  )
}
