'use client'

import { useId, useState, type ReactNode } from 'react'

// TopSection — barra recolhível de seção com "linha-cortina" (v5.1.9, aprovada em mockup
// interativo pelo Yan: curva fluida cubic-bezier(.32,.72,0,1), 380ms).
//
// Mecânica: a BARRA nunca muda de altura; o conteúdo SAI POR BAIXO dela, revelado de cima
// para baixo (janela de revelação animando `grid-template-rows` 0fr↔1fr — o conteúdo fica
// ancorado no topo do clip, efeito de cortina desenrolando, não de bloco empurrado). A
// LINHA separadora fica presa à borda inferior da janela (`absolute bottom:0`), então está
// SEMPRE ao final do conteúdo visível: desce à frente dele ao abrir e sobe à frente ao
// fechar, como a haste de uma cortina. Padrão de toda barra horizontal recolhível.
//
// Substitui o `<details open>` nativo (abria/fechava sem animação). Comportamento
// preservado: nasce ABERTO a cada carregamento (estado só em memória, sem persistência);
// o conteúdo permanece montado quando fechado (como no <details>). Cores via tokens da
// aba (`--brand*`, resolvidos por [data-theme]); `motion-reduce` desliga a transição.

interface Props {
  titulo: string
  subtitulo?: string
  children: ReactNode
}

export default function TopSection({ titulo, subtitulo, children }: Props) {
  const [aberto, setAberto] = useState(true)
  const idConteudo = useId()

  return (
    <div className="mb-8">
      {/* Barra (fixa — o trilho da cortina). Mesmo visual do summary anterior. */}
      <button
        type="button"
        onClick={() => setAberto(a => !a)}
        aria-expanded={aberto}
        aria-controls={idConteudo}
        className="foco-neutro relative z-[1] flex w-full items-center gap-3 px-6 py-4.5 cursor-pointer select-none rounded-xl overflow-hidden text-left transition-all hover:brightness-95"
        style={{ background: 'var(--brand-soft)' }}
      >
        <span className="absolute left-0 top-2 bottom-2 w-1 rounded-full" style={{ background: 'var(--brand)' }} />
        <svg
          className={`w-5 h-5 shrink-0 transition-transform duration-[380ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none ${aberto ? 'rotate-90' : ''}`}
          style={{ color: 'var(--brand-deep)' }}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <span
          className="uppercase tracking-[1.5px]"
          style={{ fontSize: 14, fontWeight: 800, color: 'var(--brand-deep)' }}
        >
          {titulo}
        </span>
        {subtitulo && (
          <span
            className="text-sm font-normal normal-case tracking-normal"
            style={{ color: 'var(--text-muted)' }}
          >
            {subtitulo}
          </span>
        )}
      </button>

      {/* Cortina: janela de revelação (anima a ALTURA; o conteúdo não desliza).
          `inert` quando fechado: o <details> nativo tirava o conteúdo fechado do tab-order
          (display:none); com o grid 0fr ele ficaria invisível mas AINDA focável/lido por
          teclado e leitor de tela — o inert (React 19) o remove da árvore de acessibilidade
          sem desmontar (achado ALTO do revisor, v5.1.9). */}
      <div
        id={idConteudo}
        inert={!aberto}
        className="grid transition-[grid-template-rows] duration-[380ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none"
        style={{ gridTemplateRows: aberto ? '1fr' : '0fr' }}
      >
        <div className="relative min-h-0 overflow-hidden">
          {/* pt-6 = o respiro barra↔conteúdo (revelado junto, parte da cortina);
              pb-5 = respiro conteúdo↔linha. */}
          <div className="pt-6 pb-5">{children}</div>
          {/* A linha-cortina: presa à borda inferior da janela de revelação. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-3 bottom-0 h-0.5 rounded-full"
            style={{
              background:
                'linear-gradient(90deg, transparent, color-mix(in srgb, var(--brand-deep) 55%, transparent) 8%, color-mix(in srgb, var(--brand-deep) 55%, transparent) 92%, transparent)',
            }}
          />
        </div>
      </div>
    </div>
  )
}
