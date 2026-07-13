'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { fmtMi } from '@/lib/fmt'
import { clampTooltip, type ClampResult } from '@/lib/metas/tooltip-clamp'

// ── <MetaProgressBar> — barra de progresso de meta (v5.0.0) ──────────────────
// Elemento central dos cards do Acompanhamento de Metas. Trilha neutra +
// preenchimento = % da meta (na COR DE IDENTIDADE do painel; Group = neutro),
// SETA estática na posição do "esperado até hoje" (o esperado é LINEAR → o tick
// fica em `pctEsperado` = `pctDecorrido`), e um tooltip ESCURO no hover que NASCE
// DA SETA (a seta é a ponta do balão; a caixa cresce a partir dela com scale+fade).
//
// Client component: mede a barra/balão e faz o CLAMP AO VIEWPORT (lógica pura em
// `@/lib/metas/tooltip-clamp`, testada) — a caixa nunca vaza para fora da tela;
// perto das bordas ela desliza para dentro e a seta desliza dentro dela para
// continuar apontando o tick. `transform-origin` acompanha a seta (a animação
// "cresce da seta" em qualquer posição). A régua de status colore só a conclusão.

export interface MetaProgressBarProps {
  /** Preenchimento: % da meta (realizado/meta). null → barra vazia. Largura clampa em 100. */
  pctMeta: number | null
  /** Posição do tick "esperado": esperado/meta × 100 (0..100) = % do período decorrido. */
  pctEsperado: number
  /** Cor do preenchimento — identidade (var(--marca-*)) ou neutro (Group). NUNCA hex. */
  cor: string
  /** Espessura da barra em px (12 no Group, 10 nos setoriais). Default 10. */
  altura?: number
  /** % do período decorrido em dias (título do tooltip). */
  pctDecorrido: number
  /** Esperado até hoje (R$) — linha do tooltip. */
  esperado: number
  /** Realizado (R$) — linha do tooltip. */
  realizado: number
}

export default function MetaProgressBar({
  pctMeta, pctEsperado, cor, altura = 10, pctDecorrido, esperado, realizado,
}: MetaProgressBarProps) {
  const fill = Math.min(Math.max(pctMeta ?? 0, 0), 100)
  const tick = Math.min(Math.max(pctEsperado, 0), 100)

  const adiantado = realizado >= esperado
  const gap = Math.abs(realizado - esperado)

  const containerRef = useRef<HTMLDivElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  // pos = null até medir (SSR / pré-hidratação) → cai no fallback CSS abaixo.
  const [pos, setPos] = useState<ClampResult | null>(null)

  useLayoutEffect(() => {
    const container = containerRef.current
    const tip = tipRef.current
    if (!container || !tip) return

    function medir() {
      if (!container || !tip) return
      const cr = container.getBoundingClientRect()
      setPos(clampTooltip({
        tickX: cr.left + (tick / 100) * cr.width,
        tipW: tip.offsetWidth,
        viewportW: window.innerWidth,
        containerLeft: cr.left,
      }))
    }
    medir()
    window.addEventListener('resize', medir)
    return () => window.removeEventListener('resize', medir)
  }, [tick, esperado, realizado, pctDecorrido])

  // Estilo do balão: medido (px, clampado ao viewport) OU fallback CSS (no-JS/SSR:
  // centrado no tick, ~13,5rem de largura). transform-origin acompanha a seta.
  const tipStyle = pos
    ? { left: `${pos.left}px`, transformOrigin: `${pos.caret}px 100%` }
    : { left: `calc(${tick}% - 6.75rem)`, transformOrigin: '50% 100%' }

  return (
    <div ref={containerRef} className="group/bar relative pb-1 pt-2">
      {/* Trilha + preenchimento */}
      <div className="relative w-full overflow-hidden rounded-full bg-zinc-100" style={{ height: altura }}>
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${fill}%`, backgroundColor: cor }}
        />
      </div>

      {/* SETA do esperado — marcador estático apontando para baixo; é a PONTA do balão. */}
      <span
        aria-hidden="true"
        className="absolute top-0 h-0 w-0 -translate-x-1/2 border-x-[5px] border-t-[7px] border-x-transparent border-t-zinc-800"
        style={{ left: `${tick}%` }}
      />

      {/* Tooltip escuro no hover — nasce da seta (scale+fade a partir do tick), clampado ao
          viewport pelo módulo puro (nunca vaza; a seta desliza dentro da caixa perto das bordas). */}
      <div
        ref={tipRef}
        role="tooltip"
        style={tipStyle}
        className="pointer-events-none absolute bottom-full z-20 w-max min-w-[13rem] max-w-[15rem] scale-90 rounded-lg bg-zinc-800 px-3 py-2.5 text-white opacity-0 shadow-lg transition-[opacity,transform] duration-200 ease-out group-hover/bar:scale-100 group-hover/bar:opacity-100 motion-reduce:transition-none"
      >
        <p className="mb-1.5 text-2xs font-medium text-zinc-300">
          {Math.round(pctDecorrido)}% do período decorrido
        </p>
        <div className="flex flex-col gap-1 text-xs tabular-nums">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-zinc-400">Esperado</span>
            <span>{fmtMi(esperado)}</span>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-zinc-400">Realizado</span>
            <span>{fmtMi(realizado)}</span>
          </div>
        </div>
        <div className="mt-2 border-t border-zinc-700 pt-1.5 text-xs font-medium">
          {adiantado
            ? <span className="text-success">+{fmtMi(gap)} adiantado</span>
            : <span className="text-danger">{fmtMi(gap)} abaixo do esperado</span>}
        </div>
      </div>
    </div>
  )
}
