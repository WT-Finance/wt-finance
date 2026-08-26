'use client'

import Tooltip from '@/components/ui/tooltip'
import { GraficoCascata, alturaCascata } from '@/components/charts'
import type { Cascata } from '@/lib/dre/cascata'

// ── Card de cascata (v5.8.1) ──────────────────────────────────────────────────
// O invólucro compartilhado pelas duas cascatas da página, que hoje vivem em seções
// DIFERENTES: a "Decomposição da Variação do Resultado" no Regime de Competência (os
// degraus dela são folhas daquela árvore) e a "Ponte Competência ↔ Caixa" na Visão
// Geral (ela fala dos DOIS regimes, então não pertence a nenhum). São a mesma figura
// com conteúdos diferentes, então o shell — título, ajuda, subtítulo, box — mora num
// lugar só: duas cópias divergiriam no primeiro ajuste visual, que é a história de
// sempre.
//
// A anatomia é a do `ResumoExecutivo`: `rounded-xl bg-surface p-5 shadow-sm`, título
// 15px semibold com o "?" de ajuda ao lado, e o conteúdo dentro de um box com borda —
// o que faz as peças da página lerem como uma família.

interface Props {
  titulo: string
  /** Linha de contexto sob o título: o recorte que a cascata está mostrando. */
  subtitulo: string
  ajuda: string
  cascata: Cascata
}

export default function CascataCard({ titulo, subtitulo, ajuda, cascata }: Props) {
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

      {/* ⚠️ ALTURA EXPLÍCITA, nunca `minHeight`. O `ResponsiveContainer` do Recharts é um
          filho com `height: 100%`, e em CSS um percentual de altura resolve contra a
          `height` do pai — **`min-height` não serve**. Com `min-height` o pai fica com a
          altura certa (o box aparece), o filho resolve para `auto`, mede 0 e o gráfico
          some sem erro nenhum: card desenhado, área cinza vazia.
          Isto ficou LATENTE enquanto os dois cards viviam num `grid`: ali o item recebe
          altura definida pelo `align-items: stretch`, e o `height: 100%` resolvia por
          tabela. Empilhá-los com `space-y-6` os tornou blocos de altura automática e o
          defeito apareceu. Medido em página isolada: bloco+min-height → filho 0px;
          grid+min-height → 200px; bloco+height → 200px.
          A altura é função do número de barras, então cravá-la aqui é honesto — não é um
          número mágico, e não depende do contexto de layout em que o card for posto. */}
      {/* Box em BRANCO, e não no `bg-band` dos demais cards da página (conferência do
          Yan). A banda cinza é a moldura certa para TABELA — ela separa as bandas de
          linha e dá contraste às células. Num gráfico ela vira só uma segunda cor
          competindo com as barras, que é onde o olho deveria estar. A borda fica: com
          card e box na mesma cor, é ela que delimita a área do gráfico. */}
      <div
        className="overflow-hidden rounded-lg border border-wt-border bg-surface p-2"
        style={{ height: alturaCascata(barras) }}
      >
        <GraficoCascata cascata={cascata} />
      </div>
    </div>
  )
}
