'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'

interface Props {
  titulo: string
  subtitulo?: string
  onClose: () => void
  children: ReactNode
}

export default function ListDrawer({ titulo, subtitulo, onClose, children }: Props) {
  const [visible, setVisible] = useState(false)

  const handleClose = useCallback(() => {
    setVisible(false)
    setTimeout(onClose, 280)
  }, [onClose])

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 10)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [handleClose])

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
        className="fixed inset-y-0 right-0 z-50 flex flex-col w-full md:w-[60vw] max-w-2xl bg-white shadow-2xl"
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
