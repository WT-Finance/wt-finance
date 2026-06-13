'use client'

import { useState, type ReactNode } from 'react'
import ModalCentral from './modal-central'
import { PILL, PILL_NEUTRO, PILL_PERIGO } from '@/components/admin/acessos/botoes'

// Confirmação destrutiva no padrão do design system (sobre ModalCentral), em vez
// de window.confirm nativo. Trata estado de carregamento durante a ação async.
// (v4.16.1 — achado da auditoria de coerência.)

interface Props {
  titulo: string
  mensagem: ReactNode
  confirmarLabel?: string
  cancelarLabel?: string
  /** Ação destrutiva (pill de perigo). Default true. */
  perigo?: boolean
  /** Executa a ação; o modal mostra "Processando…" enquanto resolve e fecha ao concluir. */
  onConfirmar: () => void | Promise<void>
  onFechar: () => void
}

export default function ConfirmModal({
  titulo, mensagem, confirmarLabel = 'Confirmar', cancelarLabel = 'Cancelar',
  perigo = true, onConfirmar, onFechar,
}: Props) {
  const [processando, setProcessando] = useState(false)

  async function confirmar() {
    setProcessando(true)
    try {
      await onConfirmar()
      onFechar()
    } finally {
      setProcessando(false)
    }
  }

  return (
    <ModalCentral titulo={titulo} onClose={onFechar}>
      <div className="text-sm text-zinc-600">{mensagem}</div>
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" className={`${PILL} ${PILL_NEUTRO}`} onClick={onFechar} disabled={processando}>
          {cancelarLabel}
        </button>
        <button
          type="button"
          className={`${PILL} ${perigo ? PILL_PERIGO : PILL_NEUTRO}`}
          onClick={confirmar}
          disabled={processando}
        >
          {processando ? 'Processando…' : confirmarLabel}
        </button>
      </div>
    </ModalCentral>
  )
}
