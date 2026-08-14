import TvSlideConteudo from '@/components/metas/tv/tv-slide-conteudo'
import type { AcompanhamentoData } from '@/components/metas/tipos'

// Trilha do carrossel do Modo TV (v5.6.4) — mês → trimestre → ano. Puramente apresentacional
// e CONTROLADO pelo pai (`tv-tela.tsx`): o índice ativo e o timer de avanço automático vivem
// lá (molde de `metas-auto-refresh.tsx`) — este componente só desenha a trilha + os dots.
//
// TODOS os slides ficam MONTADOS o tempo todo (nunca `{ativo && <Slide/>}`): o inativo ganha
// `inert` + `aria-hidden`, igual à cortina do DS (skill ui-design-system §2.1) — desmontar
// pisca ao trocar de slide (o conteúdo some no mesmo render em que a transição começa).
// Curva canônica 450ms `cubic-bezier(.32,.72,0,1)` (a mesma de `shared/top-section.tsx`),
// `motion-reduce:transition-none` desliga a animação para quem pediu menos movimento.

interface Props {
  /** [mensal, trimestral, anual] — nesta ordem (índice = posição no track). */
  slides: AcompanhamentoData[]
  indiceAtivo: number
}

export default function TvCarrossel({ slides, indiceAtivo }: Props) {
  return (
    <div className="mt-8 flex flex-1 flex-col">
      {/* Viewport — overflow-hidden é o clip horizontal da trilha. */}
      <div
        className="relative flex-1 overflow-hidden"
        role="region"
        aria-roledescription="carrossel"
        aria-label="Rotação das metas entre mês, trimestre e ano"
      >
        <div
          className="flex h-full transition-transform duration-[450ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none"
          style={{ transform: `translateX(-${indiceAtivo * 100}%)` }}
        >
          {slides.map((data, i) => {
            const ativo = i === indiceAtivo
            return (
              <div
                key={data.preset}
                className="flex h-full w-full shrink-0 flex-col"
                inert={!ativo}
                aria-hidden={!ativo}
                role="group"
                aria-roledescription="slide"
                aria-label={data.periodoLabel}
              >
                <TvSlideConteudo data={data} />
              </div>
            )
          })}
        </div>
      </div>

      {/* Indicador de posição — 3 dots discretos (tokens neutros; o ativo mais forte).
          `--border-strong` (não `--border`, contraste baixo demais contra o fundo da tela —
          mesmo token do divisor vertical do cabeçalho, já provado legível neste fundo).
          Decorativo: a semântica de "qual slide está ativo" já vive no `role="region"` +
          no slide anunciável acima (o inativo some do leitor de tela via `inert`). */}
      <div className="mt-4 flex items-center justify-center gap-2" aria-hidden>
        {slides.map((data, i) => (
          <span
            key={data.preset}
            className={`h-2 w-2 rounded-full transition-colors ${i === indiceAtivo ? 'bg-[var(--text-secondary)]' : 'bg-[var(--border-strong)]'}`}
          />
        ))}
      </div>
    </div>
  )
}
