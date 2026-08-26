'use client'

import Tooltip from '@/components/ui/tooltip'
import { GraficoCascata, alturaCascata } from '@/components/charts'
import type { Cascata } from '@/lib/dre/cascata'

// ── Card de cascata (v5.8.1) ──────────────────────────────────────────────────
// O invólucro compartilhado pelos dois cards novos da seção de competência. Eles são a
// MESMA figura com conteúdos diferentes (uma explica a variação entre dois anos, a
// outra a diferença entre dois regimes), então o shell — título, ajuda, subtítulo com a
// janela declarada, box, rodapé — mora num lugar só. Duas cópias divergiriam no
// primeiro ajuste visual, que é a história de sempre.
//
// A anatomia é a do `ResumoExecutivo`: `rounded-xl bg-surface p-5 shadow-sm`, título
// 15px semibold com o "?" de ajuda ao lado, e o conteúdo dentro do box
// `rounded-lg border border-wt-border bg-band`. É o que faz as peças da página lerem
// como uma família.

interface Props {
  titulo: string
  /** Declara a JANELA — não é decoração. É esta linha que explica ao leitor por que o
   *  "YTD 26" daqui pode mostrar menos meses que a coluna YTD da tabela densa acima
   *  (a base de competência é um upload periódico; a de caixa é contínua). */
  subtitulo: string
  ajuda: string
  cascata: Cascata
  /** Linha final do card — as datas-base, na ponte. */
  rodape?: string
}

export default function CascataCard({ titulo, subtitulo, ajuda, cascata, rodape }: Props) {
  const barras = cascata.degraus.length + 2

  return (
    <div className="flex flex-col rounded-xl bg-surface p-5 shadow-sm">
      <div className="mb-4">
        <div className="mb-1 flex items-center gap-1.5">
          <h2 className="text-[15px] font-semibold text-text-primary">{titulo}</h2>
          {/* `<button type="button">`, nunca `<span>`: o balão também abre no FOCO, e um
              `span` fica fora do tab-order (receita da skill ui-design-system §2). */}
          <Tooltip conteudo={ajuda} className="z-30 w-72 !whitespace-normal font-normal normal-case tracking-normal leading-snug">
            <button
              type="button"
              aria-label={`${titulo}: ${ajuda}`}
              className="foco-neutro inline-flex h-3 w-3 items-center justify-center rounded-full border border-zinc-300 text-[8px] font-semibold leading-none text-zinc-400"
            >
              ?
            </button>
          </Tooltip>
        </div>
        <p className="text-[11px] text-text-secondary">{subtitulo}</p>
      </div>

      {/* A identidade fecha por construção (ver `folhas.ts`). Se um payload torto
          quebrar a premissa, o card DIZ isso em vez de desenhar uma cascata que não
          soma — um gráfico que mente é pior que um aviso. */}
      {!cascata.fecha && (
        <p className="mb-3 rounded-md bg-band-soft px-3 py-2 text-[11px] text-text-secondary">
          Os degraus não fecham contra as âncoras nesta carga — a leitura abaixo é parcial.
        </p>
      )}

      <div
        className="overflow-hidden rounded-lg border border-wt-border bg-band p-2"
        style={{ minHeight: alturaCascata(barras) }}
      >
        <GraficoCascata cascata={cascata} />
      </div>

      {rodape && <p className="mt-3 text-[11px] text-text-subtle">{rodape}</p>}
    </div>
  )
}
