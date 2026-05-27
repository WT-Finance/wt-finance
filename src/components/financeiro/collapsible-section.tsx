'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

interface Props {
  titulo: string
  subtitulo?: string
  children: React.ReactNode
  defaultExpanded?: boolean
}

export default function CollapsibleSection({
  titulo,
  subtitulo,
  children,
  defaultExpanded = true,
}: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  return (
    <div className="mb-4">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 py-3 hover:bg-zinc-50 rounded-lg px-2 -mx-2 transition-colors text-left"
      >
        {expanded
          ? <ChevronDown size={18} className="text-zinc-400 shrink-0" />
          : <ChevronRight size={18} className="text-zinc-400 shrink-0" />
        }
        <div>
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
            {titulo}
          </h2>
          {subtitulo && (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {subtitulo}
            </p>
          )}
        </div>
      </button>
      {expanded && <div className="mt-2">{children}</div>}
    </div>
  )
}
