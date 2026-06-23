import type { ReactNode } from 'react'

// ── <Tooltip> — dica on-hover de UI (v4.26 / Fase B) ──────────────────────────
// Balão CSS-puro (sem dependência), tom escuro (zinc-800), igual ao do KpiCard.
// Aparece no hover/foco do gatilho (group/tip). NÃO confundir com o CustomTooltip
// de Recharts (gráficos). Para dica de texto curta em rótulos/ícones de UI.
//
// `posicao`: 'baixo' (default, top-5) | 'cima' (bottom-5). `className` ajusta o balão.

interface TooltipProps {
  children:   ReactNode   // o gatilho (rótulo/ícone)
  conteudo:   ReactNode   // o texto da dica
  posicao?:   'baixo' | 'cima'
  className?: string
}

export default function Tooltip({ children, conteudo, posicao = 'baixo', className = '' }: TooltipProps) {
  const pos = posicao === 'cima' ? 'bottom-5' : 'top-5'
  return (
    <span className="relative inline-flex group/tip">
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute left-0 ${pos} z-20 invisible rounded bg-zinc-800 px-2 py-1 text-2xs text-white whitespace-nowrap shadow-lg group-hover/tip:visible ${className}`}
      >
        {conteudo}
      </span>
    </span>
  )
}
