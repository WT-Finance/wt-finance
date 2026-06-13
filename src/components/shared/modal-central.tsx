'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { pushOverlay, popOverlay } from '@/lib/ui/overlay-stack'

// Modal CENTRAL (sobre fundo escurecido), rolável, fecha no X / Esc / clique fora.
// Segue o padrão do projeto (admin/modal-confirmacao-upload): container
// `fixed inset-0 flex items-center justify-center` + overlay + painel `relative` —
// NÃO usa position:fixed no painel (não quebra layout). Mecânica de animação,
// trava de scroll do body e Escape herdadas do ListDrawer.

interface Props {
  titulo:           string
  /** Conteúdo inline ao lado do título (ex.: "powered by …"). */
  tituloAcessorio?: ReactNode
  subtitulo?:       string
  onClose:          () => void
  children:         ReactNode
}

export default function ModalCentral({ titulo, tituloAcessorio, subtitulo, onClose, children }: Props) {
  const [visible, setVisible] = useState(false)
  const painelRef = useRef<HTMLDivElement>(null)

  const handleClose = useCallback(() => {
    setVisible(false)
    setTimeout(onClose, 200)
  }, [onClose])

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 10)
    return () => clearTimeout(t)
  }, [])

  // Esc fecha só o overlay do topo (pilha global) — um modal aberto sobre um
  // drawer não fecha os dois.
  useEffect(() => {
    const id = pushOverlay(handleClose)
    return () => popOverlay(id)
  }, [handleClose])

  // Foco inicial no painel + restauração do foco anterior ao fechar (a11y).
  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null
    const alvo = painelRef.current?.querySelector<HTMLElement>(
      'input, textarea, select, button:not([aria-label="Fechar"])',
    ) ?? painelRef.current
    alvo?.focus()
    return () => anterior?.focus?.()
  }, [])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // Portal no document.body: o modal é invocado de dentro da sidebar, cujo
  // contexto de empilhamento ficaria ABAIXO do conteúdo principal — sem o portal,
  // o z-50 não vence e o modal abre atrás dos cards. No body, fica na raiz.
  if (typeof document === 'undefined') return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50"
        style={{ opacity: visible ? 1 : 0, transition: 'opacity 200ms ease' }}
        onClick={handleClose}
      />
      <div
        ref={painelRef}
        tabIndex={-1}
        className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col outline-none"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'scale(1)' : 'scale(0.97)',
          transition: 'opacity 200ms ease, transform 200ms ease',
        }}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
      >
        <div className="flex items-start justify-between px-6 py-4 border-b border-zinc-100 shrink-0">
          <div>
            <div className="flex items-baseline gap-2 flex-wrap">
              <p className="text-lg font-semibold text-zinc-900">{titulo}</p>
              {tituloAcessorio}
            </div>
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
    </div>,
    document.body,
  )
}
