import type { ReactNode } from 'react'

// ── Gauge (medidor em semicírculo) ──────────────────────────────────────────
// Primitivo de DS reutilizável para os cards de Metas (v5.0.0) e reúso futuro
// (v5.1). Componente PURO — sem hooks, sem 'use client', sem fetch: recebe
// tudo por props e desenha um SVG de 180° (meia-lua, abertura para cima).
//
// A cor do ARCO de progresso é IDENTIDADE (setorial ou de marca — ADR-0103);
// o chamador decide qual token/var passar em `cor`. A régua de status (ex.:
// "no ritmo" / "atrás" / "à frente") é responsabilidade do CHAMADOR — este
// componente não interpreta o valor, só desenha o que recebe (inclusive no
// `centroSubtitulo`, que pode trazer um <span> colorido injetado por fora).
//
// Matemática: centro (cx, cy) na base do semicírculo, raio r. Para uma fração
// f ∈ [0,1] do arco (0 = extremo esquerdo, 1 = extremo direito), o ângulo em
// radianos é θ = π − f·π; como o SVG tem y crescendo para baixo, o ponto é
// x = cx + r·cos(θ), y = cy − r·sin(θ). O arco de f=0 a f=1 é desenhado com
// um único `<path d="M x0 y0 A r r 0 0 1 x1 y1">` (sweep-flag 1, sentido
// horário do lado esquerdo para o direito). O preenchimento usa `pathLength`
// fixo (100) + `strokeDasharray`/`strokeDashoffset`, o que evita ter que medir
// o comprimento real do arco em px.

export interface GaugeProps {
  /** 0..100+ — fração preenchida do arco = min(valorPct,100)/100. O texto do centro mostra o % REAL (pode passar de 100). */
  valorPct: number
  /** Cor do ARCO de progresso — string CSS já pronta (ex.: 'var(--setor-weddings)', 'var(--brand)', 'var(--text-muted)'). NUNCA hex literal. */
  cor: string
  /** Texto grande no centro (ex.: '68%'). */
  centroTitulo: string
  /** Subtítulo abaixo do número central; ReactNode porque o chamador injeta trechos coloridos (ex.: 'da meta · ritmo <span>90%</span>'). */
  centroSubtitulo?: ReactNode
  /** Marcador de PACE ("o esperado até hoje") sobre o arco, COM valor. pct 0..100 = posição no arco; label = texto (ex.: 'R$ 1,65 Mi'). Opcional. */
  tick?: { pct: number; label: string }
  /** Tamanho: 'grande' (card Group central) | 'setor' (cards setoriais menores). Default 'setor'. */
  tamanho?: 'grande' | 'setor'
  /** Obrigatório — acessibilidade. */
  ariaLabel: string
}

/** Dimensões por tamanho — viewBox e espessura do traço do arco. */
const DIMENSOES = {
  grande: {
    largura: 240,
    espessuraArco: 16,
    maxW: 'max-w-[240px]',
    textoTitulo: 'text-3xl',
  },
  setor: {
    largura: 160,
    espessuraArco: 11,
    maxW: 'max-w-[160px]',
    textoTitulo: 'text-2xl',
  },
} as const

/** Ponto sobre o semicírculo (cx, cy, r) na fração f ∈ [0,1] do arco (esquerda → direita). */
function pontoNoArco(cx: number, cy: number, r: number, f: number) {
  const theta = Math.PI - f * Math.PI
  return {
    x: cx + r * Math.cos(theta),
    y: cy - r * Math.sin(theta),
  }
}

export default function Gauge({
  valorPct,
  cor,
  centroTitulo,
  centroSubtitulo,
  tick,
  tamanho = 'setor',
  ariaLabel,
}: GaugeProps) {
  const { largura, espessuraArco, maxW, textoTitulo } = DIMENSOES[tamanho]

  // viewBox: altura = metade da largura + folga para a espessura do traço
  // (senão as pontas arredondadas do stroke são cortadas).
  const folga = espessuraArco
  const altura = largura / 2 + folga
  const cx = largura / 2
  const cy = altura - folga / 2
  const r = largura / 2 - espessuraArco / 2 - folga / 2

  const fracao = Math.min(Math.max(valorPct, 0), 100) / 100

  // Extremos do arco (esquerda = f=0, direita = f=1) — fixos, não dependem do valor.
  const inicio = pontoNoArco(cx, cy, r, 0)
  const fim = pontoNoArco(cx, cy, r, 1)
  const pathArco = `M ${inicio.x} ${inicio.y} A ${r} ${r} 0 0 1 ${fim.x} ${fim.y}`

  // Tick de pace: um pequeno traço radial atravessando a espessura do arco,
  // na posição tick.pct (0..100 → f = pct/100), mais o rótulo textual do valor.
  let tickElementos: ReactNode = null
  if (tick) {
    const fTick = Math.min(Math.max(tick.pct, 0), 100) / 100
    const rInterno = r - espessuraArco / 2
    const rExterno = r + espessuraArco / 2
    const pInterno = pontoNoArco(cx, cy, rInterno, fTick)
    const pExterno = pontoNoArco(cx, cy, rExterno, fTick)

    // Rótulo posicionado um pouco além da borda externa do arco, na mesma
    // direção radial do tick (afasta o texto do traço).
    const rLabel = rExterno + 10
    const pLabel = pontoNoArco(cx, cy, rLabel, fTick)
    // Ancoragem horizontal do texto conforme o lado do semicírculo, para o
    // rótulo não vazar para fora do viewBox nas pontas.
    const anchor = fTick < 0.15 ? 'start' : fTick > 0.85 ? 'end' : 'middle'

    tickElementos = (
      <g aria-hidden="true">
        <line
          x1={pInterno.x}
          y1={pInterno.y}
          x2={pExterno.x}
          y2={pExterno.y}
          className="stroke-zinc-500"
          strokeWidth={2}
          strokeLinecap="round"
        />
        <text
          x={pLabel.x}
          y={pLabel.y}
          textAnchor={anchor}
          className="fill-zinc-500 text-[9px]"
        >
          {tick.label}
        </text>
      </g>
    )
  }

  return (
    <div className={`flex w-full flex-col items-center ${maxW}`}>
      <svg
        viewBox={`0 0 ${largura} ${altura}`}
        role="img"
        aria-label={ariaLabel}
        className="w-full"
      >
        {/* Trilha — arco completo em cinza neutro (fundo) */}
        <path
          d={pathArco}
          fill="none"
          className="stroke-zinc-200"
          strokeWidth={espessuraArco}
          strokeLinecap="round"
        />

        {/* Arco de progresso — cor de identidade (prop `cor`), preenchido pela fração */}
        <path
          d={pathArco}
          fill="none"
          style={{ stroke: cor }}
          strokeWidth={espessuraArco}
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={100}
          strokeDashoffset={100 - fracao * 100}
        />

        {tickElementos}
      </svg>

      {/* Centro: número grande + subtítulo, abaixo do arco (o semicírculo abre para cima) */}
      <div className="-mt-1 flex flex-col items-center text-center">
        <span
          className={`${textoTitulo} font-semibold tabular-nums text-[var(--text-primary)]`}
        >
          {centroTitulo}
        </span>
        {centroSubtitulo != null ? (
          <span className="text-2xs text-[var(--text-muted)]">{centroSubtitulo}</span>
        ) : null}
      </div>
    </div>
  )
}
