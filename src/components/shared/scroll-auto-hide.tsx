'use client'

// ── Scroll com barra FLUTUANTE auto-hide (v4.40.0; ARRASTÁVEL + horizontal em v5.0.0) ──
// Padrão do DS para TODA barra de rolagem interna (vertical E horizontal). A scrollbar
// NATIVA é escondida (`.scrollbar-none`, largura 0 → não desloca o conteúdo, sem "goteira")
// e um THUMB absoluto flutua em overlay, aparecendo ao rolar/hover e sumindo sozinho após
// ~1,2s. O thumb é ARRASTÁVEL (pointer capture) e a barra nativa some — o mouse-scroll, o
// arraste do thumb e o teclado (o viewport é focável pelo conteúdo) funcionam. Tudo
// IMPERATIVO (mutação de style via ref em effects/handlers, ZERO state) — evita re-render
// por scroll e satisfaz o ruleset do React Compiler (sem setState em effect, sem ler ref no
// render). Matemática do thumb/arraste em `@/lib/ui/scrollbar-math` (pura, testada).
//
// Uso: substituir `<div className="overflow-y-auto ...">` por
//   <ScrollAutoHide className="...">…</ScrollAutoHide>          (vertical, default)
//   <ScrollAutoHide eixo="x" …>   /  <ScrollAutoHide eixo="both" …>
// `className` vai no VIEWPORT (o elemento que rola); NÃO incluir overflow/scrollbar nela.
// `onScroll` é repassado ao viewport (ex.: acender a sombra do cabeçalho sticky — DS §7).
// A sidebar mantém a implementação própria embutida (mesma mecânica; migração incremental).

import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent, type ReactNode, type UIEvent } from 'react'
import { thumbGeom, scrollAoArrastar } from '@/lib/ui/scrollbar-math'

type Eixo = 'y' | 'x' | 'both'

interface Props {
  className?: string
  children: ReactNode
  /** Eixo(s) roláveis. Default 'y'. 'both' = tabela densa (vertical + horizontal). */
  eixo?: Eixo
  /** Repassado ao viewport — ex.: `e => setRolado(e.currentTarget.scrollTop > 0)`. */
  onScroll?: (e: UIEvent<HTMLDivElement>) => void
  /** Classes de LAYOUT DOS FILHOS (`space-y-*`, `flex flex-col gap-*`) — vão no wrapper
   *  interno (pai direto dos filhos), pois `className` vai no viewport (cujo único filho é
   *  esse wrapper). Padding/altura ficam em `className` (preserva o cálculo do sticky). */
  contentClassName?: string
}

const OVERFLOW: Record<Eixo, string> = {
  y: 'overflow-y-auto',
  x: 'overflow-x-auto',
  both: 'overflow-auto',
}

export default function ScrollAutoHide({ className = '', children, eixo = 'y', onScroll: onScrollProp, contentClassName }: Props) {
  const viewRef     = useRef<HTMLDivElement | null>(null)
  const contentRef  = useRef<HTMLDivElement | null>(null)
  const thumbYRef   = useRef<HTMLDivElement | null>(null)
  const thumbXRef   = useRef<HTMLDivElement | null>(null)
  const hideRef     = useRef<ReturnType<typeof setTimeout> | null>(null)
  const draggingRef = useRef(false)

  const temY = eixo === 'y' || eixo === 'both'
  const temX = eixo === 'x' || eixo === 'both'

  const measure = useCallback(() => {
    const el = viewRef.current
    if (!el) return
    const ty = thumbYRef.current
    if (ty) {
      const g = thumbGeom(el.scrollHeight, el.clientHeight, el.scrollTop)
      if (!g.visivel) ty.style.display = 'none'
      else { ty.style.display = 'block'; ty.style.height = `${g.tamanho}px`; ty.style.transform = `translateY(${g.pos}px)` }
    }
    const tx = thumbXRef.current
    if (tx) {
      const g = thumbGeom(el.scrollWidth, el.clientWidth, el.scrollLeft)
      if (!g.visivel) tx.style.display = 'none'
      else { tx.style.display = 'block'; tx.style.width = `${g.tamanho}px`; tx.style.transform = `translateX(${g.pos}px)` }
    }
  }, [])

  const reveal = useCallback(() => {
    const y = thumbYRef.current, x = thumbXRef.current
    if (y) y.style.opacity = '1'
    if (x) x.style.opacity = '1'
    if (hideRef.current) clearTimeout(hideRef.current)
    hideRef.current = setTimeout(() => {
      if (draggingRef.current) return // não some no meio de um arraste
      const yy = thumbYRef.current, xx = thumbXRef.current
      if (yy) yy.style.opacity = '0'
      if (xx) xx.style.opacity = '0'
    }, 1200)
  }, [])

  useEffect(() => {
    const el = viewRef.current
    if (!el) return
    measure()
    const ro = new ResizeObserver(() => measure())
    ro.observe(el)
    if (contentRef.current) ro.observe(contentRef.current)
    return () => { ro.disconnect(); if (hideRef.current) clearTimeout(hideRef.current) }
  }, [measure])

  const onScroll = useCallback((e: UIEvent<HTMLDivElement>) => {
    measure()
    reveal()
    onScrollProp?.(e)
  }, [measure, reveal, onScrollProp])

  // Arraste do thumb → scrollTop/scrollLeft, via pointer capture (a mesma proporção da
  // geometria: delta do thumb × max/livre). Imperativo, sem state.
  const iniciarArraste = useCallback((axis: 'y' | 'x') => (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = viewRef.current
    const th = axis === 'y' ? thumbYRef.current : thumbXRef.current
    if (!el || !th) return
    e.preventDefault()
    e.stopPropagation()
    th.setPointerCapture(e.pointerId)
    draggingRef.current = true
    th.style.cursor = 'grabbing'
    reveal()

    const inicio      = axis === 'y' ? e.clientY : e.clientX
    const scrollBase  = axis === 'y' ? el.scrollTop : el.scrollLeft
    const scrollSize  = axis === 'y' ? el.scrollHeight : el.scrollWidth
    const clientSize  = axis === 'y' ? el.clientHeight : el.clientWidth

    const mover = (ev: PointerEvent) => {
      const delta = (axis === 'y' ? ev.clientY : ev.clientX) - inicio
      const novo = scrollAoArrastar(delta, scrollBase, scrollSize, clientSize)
      if (axis === 'y') el.scrollTop = novo
      else el.scrollLeft = novo
    }
    const soltar = () => {
      draggingRef.current = false
      th.style.cursor = 'grab'
      th.releasePointerCapture(e.pointerId)
      th.removeEventListener('pointermove', mover)
      th.removeEventListener('pointerup', soltar)
      th.removeEventListener('pointercancel', soltar)
      reveal()
    }
    th.addEventListener('pointermove', mover)
    th.addEventListener('pointerup', soltar)
    th.addEventListener('pointercancel', soltar)
  }, [reveal])

  const thumbBg = 'color-mix(in srgb, var(--text-muted) 55%, transparent)'

  // `isolate` cria um stacking context no wrapper: o thumb (z-30) fica ACIMA de um
  // cabeçalho sticky interno (`sticky top-0 z-20`, DS §7) — sem isso a barra some atrás
  // do header nas tabelas densas — e o z-30 não vaza para fora do wrapper.
  return (
    <div className="relative isolate flex-1 min-h-0" onMouseEnter={reveal} onMouseMove={reveal}>
      <div ref={viewRef} onScroll={onScroll} className={`h-full ${OVERFLOW[eixo]} scrollbar-none ${className}`}>
        <div ref={contentRef} className={contentClassName}>{children}</div>
      </div>
      {temY && (
        <div
          ref={thumbYRef}
          onPointerDown={iniciarArraste('y')}
          className="absolute right-1 top-0 z-30 w-1.5 cursor-grab touch-none rounded-full transition-opacity duration-300 motion-reduce:transition-none"
          style={{ display: 'none', height: 0, opacity: 0, background: thumbBg, willChange: 'transform' }}
        />
      )}
      {temX && (
        <div
          ref={thumbXRef}
          onPointerDown={iniciarArraste('x')}
          className="absolute bottom-1 left-0 z-30 h-1.5 cursor-grab touch-none rounded-full transition-opacity duration-300 motion-reduce:transition-none"
          style={{ display: 'none', width: 0, opacity: 0, background: thumbBg, willChange: 'transform' }}
        />
      )}
    </div>
  )
}
