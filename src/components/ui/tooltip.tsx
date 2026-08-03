import type { ReactNode } from 'react'

// ── <Tooltip> — dica on-hover de UI (v4.26 / Fase B) ──────────────────────────
// Balão CSS-puro (sem dependência), tom escuro (zinc-800), igual ao do KpiCard.
// Aparece no hover/foco do gatilho (group/tip). NÃO confundir com o CustomTooltip
// de Recharts (gráficos). Para dica de texto curta em rótulos/ícones de UI.
//
// `posicao`: 'baixo' (default, top-5) | 'cima' (bottom-5). `className` ajusta o balão.
//
// ACESSIBILIDADE (v5.4.2, achado ALTO do revisor): o balão abre no hover **e no FOCO**
// (`group-focus-within/tip:visible`). Antes era hover-only, então quem navega por teclado
// nunca via a dica — e em cabeçalho de coluna a dica costuma ser a única explicação de uma
// definição de métrica. O `focus-within` cobre qualquer gatilho focável dentro do wrapper;
// o gatilho é quem precisa ser focável (use `<button type="button">`, não `<span>` — span
// não entra no tab-order nem é nomeável por AT). Vale para TODOS os call-sites do
// primitivo, não só o que revelou o problema.

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
        className={`pointer-events-none absolute left-0 ${pos} z-20 invisible rounded bg-zinc-800 px-2 py-1 text-2xs text-white whitespace-nowrap shadow-lg group-hover/tip:visible group-focus-within/tip:visible ${className}`}
      >
        {conteudo}
      </span>
    </span>
  )
}
