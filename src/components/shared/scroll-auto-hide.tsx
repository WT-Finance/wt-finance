'use client'

// ── Scroll com barra FLUTUANTE auto-hide (v4.40.0 — padrão do DS para barras de rolagem) ──
// Extraído da mecânica da sidebar (v4.16.2): a scrollbar NATIVA é escondida (`.scrollbar-none`,
// largura 0 → não desloca o conteúdo, sem "goteira") e um THUMB absoluto flutua em overlay,
// aparecendo ao rolar/hover e sumindo sozinho após ~1,2s. Tudo IMPERATIVO (mutação de style via
// ref em effects/handlers, ZERO state) — evita re-render por scroll e satisfaz o ruleset do
// React Compiler (sem setState em effect, sem ler ref no render). Indicador puro (sem drag).
//
// Uso: substituir `<div className="overflow-y-auto ...">` por
//   <ScrollAutoHide className="...">…</ScrollAutoHide>
// `className` vai no VIEWPORT (o elemento que rola); não incluir overflow/scrollbar nela.
// A sidebar mantém a implementação própria embutida (mesma mecânica; migração incremental).

import { useCallback, useEffect, useRef, type ReactNode } from 'react'

export default function ScrollAutoHide({ className = '', children }: { className?: string; children: ReactNode }) {
  const viewRef    = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const thumbRef   = useRef<HTMLDivElement | null>(null)
  const hideRef    = useRef<ReturnType<typeof setTimeout> | null>(null)

  const measureThumb = useCallback(() => {
    const el = viewRef.current, th = thumbRef.current
    if (!el || !th) return
    const { scrollHeight, clientHeight, scrollTop } = el
    if (scrollHeight <= clientHeight + 1) { th.style.display = 'none'; return }
    const h = Math.max(28, Math.round((clientHeight / scrollHeight) * clientHeight))
    const top = Math.round((scrollTop / (scrollHeight - clientHeight)) * (clientHeight - h))
    th.style.display = 'block'
    th.style.height = `${h}px`
    th.style.transform = `translateY(${top}px)`
  }, [])

  const revealThumb = useCallback(() => {
    const th = thumbRef.current
    if (th) th.style.opacity = '1'
    if (hideRef.current) clearTimeout(hideRef.current)
    hideRef.current = setTimeout(() => {
      const t = thumbRef.current
      if (t) t.style.opacity = '0'
    }, 1200)
  }, [])

  useEffect(() => {
    const el = viewRef.current
    if (!el) return
    measureThumb()
    const ro = new ResizeObserver(() => measureThumb())
    ro.observe(el)
    if (contentRef.current) ro.observe(contentRef.current)
    return () => { ro.disconnect(); if (hideRef.current) clearTimeout(hideRef.current) }
  }, [measureThumb])

  const onScroll = useCallback(() => { measureThumb(); revealThumb() }, [measureThumb, revealThumb])

  return (
    <div className="relative flex-1 min-h-0" onMouseEnter={revealThumb} onMouseMove={revealThumb}>
      <div ref={viewRef} onScroll={onScroll} className={`h-full overflow-y-auto scrollbar-none ${className}`}>
        <div ref={contentRef}>{children}</div>
      </div>
      <div
        ref={thumbRef}
        aria-hidden
        className="pointer-events-none absolute right-1 top-0 w-1.5 rounded-full transition-opacity duration-300 motion-reduce:transition-none"
        style={{
          display: 'none',
          height: 0,
          opacity: 0,
          background: 'color-mix(in srgb, var(--text-muted) 55%, transparent)',
          willChange: 'transform',
        }}
      />
    </div>
  )
}
