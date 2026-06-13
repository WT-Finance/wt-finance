'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { pushOverlay, popOverlay } from '@/lib/ui/overlay-stack'

interface Props {
  titulo: string
  subtitulo?: string
  onClose: () => void
  children: ReactNode
}

export default function ListDrawer({ titulo, subtitulo, onClose, children }: Props) {
  const [visible, setVisible] = useState(false)
  const painelRef = useRef<HTMLDivElement>(null)

  const handleClose = useCallback(() => {
    setVisible(false)
    setTimeout(onClose, 280)
  }, [onClose])

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 10)
    return () => clearTimeout(t)
  }, [])

  // Esc fecha só o overlay do topo (pilha global compartilhada com ModalCentral).
  useEffect(() => {
    const id = pushOverlay(handleClose)
    return () => popOverlay(id)
  }, [handleClose])

  // Foco inicial no painel + restauração ao fechar (a11y).
  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null
    painelRef.current?.focus()
    return () => anterior?.focus?.()
  }, [])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(0,0,0,0.5)', opacity: visible ? 1 : 0, transition: 'opacity 280ms ease' }}
        onClick={handleClose}
      />
      <div
        ref={painelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className="fixed inset-y-0 right-0 z-50 flex flex-col w-full md:w-[60vw] max-w-2xl bg-white shadow-2xl outline-none"
        style={{
          transform: visible ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 280ms cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        <div className="flex items-start justify-between px-6 py-4 border-b border-zinc-100 shrink-0">
          <div>
            <p className="text-lg font-semibold text-zinc-900">{titulo}</p>
            {subtitulo && <p className="text-sm text-zinc-400 mt-0.5">{subtitulo}</p>}
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {children}
        </div>
      </div>
    </>
  )
}
