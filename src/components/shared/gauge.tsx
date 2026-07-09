import type { ReactNode } from 'react'

// ── Gauge (medidor em semicírculo) ──────────────────────────────────────────
// Primitivo de DS reutilizável para os cards de Metas (v5.0.0) e reúso futuro
// (v5.1). Componente PURO — sem hooks, sem 'use client', sem fetch: recebe
// tudo por props e desenha um SVG de 180° (meia-lua, abertura para cima) com o
// NÚMERO DENTRO DO VÃO do arco (overlay absoluto — o gauge é uma peça só, não
// um arco com texto embaixo).
//
// A cor do ARCO de progresso é IDENTIDADE (setorial ou de marca — ADR-0103);
// o chamador decide qual token/var passar em `cor`. A régua de status (verde/
// âmbar/vermelho) é responsabilidade do CHAMADOR — este componente não
// interpreta o valor, só desenha o que recebe (inclusive no `centroSubtitulo`,
// que pode trazer um <span> colorido injetado por fora).
//
// Matemática: centro (cx, cy) na base do semicírculo, raio r. Para uma fração
// f ∈ [0,1] do arco (0 = extremo esquerdo, 1 = extremo direito), o ângulo em
// radianos é θ = π − f·π; como o SVG tem y crescendo para baixo, o ponto é
// x = cx + r·cos(θ), y = cy − r·sin(θ). O arco de f=0 a f=1 é desenhado com
// um único `<path d="M x0 y0 A r r 0 0 1 x1 y1">` (sweep-flag 1). O
// preenchimento usa `pathLength` fixo (100) + `strokeDasharray`/`strokeDashoffset`,
// o que evita medir o comprimento real do arco em px.

export interface GaugeProps {
  /** 0..100+ — fração preenchida do arco = min(valorPct,100)/100. O texto do centro mostra o % REAL (pode passar de 100). */
  valorPct: number
  /** Cor do ARCO de progresso — string CSS já pronta (ex.: 'var(--setor-weddings)', 'var(--text-muted)'). NUNCA hex literal. */
  cor: string
  /** Texto grande no centro (ex.: '68%'). */
  centroTitulo: string
  /** Subtítulo abaixo do número central; ReactNode porque o chamador injeta trechos coloridos (ex.: 'ritmo <span>90%</span>'). */
  centroSubtitulo?: ReactNode
  /** Marcador de PACE ("o esperado até hoje") sobre o arco, COM valor. pct 0..100 = posição no arco; label = texto (ex.: 'R$ 1,65 Mi'). Opcional. */
  tick?: { pct: number; label: string }
  /** Tamanho: 'grande' (card Group central) | 'setor' (cards setoriais menores). Default 'setor'. */
  tamanho?: 'grande' | 'setor'
  /** Obrigatório — acessibilidade. */
  ariaLabel: string
}

/** Dimensões por tamanho — viewBox, espessura do traço e tipografia do centro. */
const DIMENSOES = {
  grande: {
    largura: 260,
    espessuraArco: 18,
    maxW: 'max-w-[260px]',
    textoTitulo: 'text-4xl',
    textoSub: 'text-xs',
  },
  setor: {
    largura: 180,
    espessuraArco: 12,
    maxW: 'max-w-[180px]',
    textoTitulo: 'text-[26px]',
    textoSub: 'text-[11px]',
  },
} as const

// Folga vertical EXTRA no topo do viewBox — o rótulo do tick fica fora do arco
// e, perto do topo, subiria além de y=0 sem esta margem.
const FOLGA_TOPO = 16

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
  const { largura, espessuraArco, maxW, textoTitulo, textoSub } = DIMENSOES[tamanho]

  // viewBox: altura = metade da largura + folga para as pontas arredondadas do
  // stroke; o topo ganha FOLGA_TOPO extra para o rótulo do tick nunca cortar.
  const folga = espessuraArco
  const altura = largura / 2 + folga
  const cx = largura / 2
  const cy = altura - folga / 2
  const r = largura / 2 - espessuraArco / 2 - folga / 2

  const fracao = Math.min(Math.max(valorPct, 0), 100) / 100

  const inicio = pontoNoArco(cx, cy, r, 0)
  const fim = pontoNoArco(cx, cy, r, 1)
  const pathArco = `M ${inicio.x} ${inicio.y} A ${r} ${r} 0 0 1 ${fim.x} ${fim.y}`

  // Tick de pace: traço radial atravessando a espessura do arco na posição
  // tick.pct, com o rótulo do valor RADIALMENTE PARA FORA (lado esquerdo do
  // semicírculo → texto termina no ponto; lado direito → começa; topo → centrado
  // acima). Assim o texto nunca invade o arco.
  let tickElementos: ReactNode = null
  if (tick) {
    const fTick = Math.min(Math.max(tick.pct, 0), 100) / 100
    const rInterno = r - espessuraArco / 2
    const rExterno = r + espessuraArco / 2
    const pInterno = pontoNoArco(cx, cy, rInterno, fTick)
    const pExterno = pontoNoArco(cx, cy, rExterno, fTick)

    const rLabel = rExterno + 7
    const pLabel = pontoNoArco(cx, cy, rLabel, fTick)
    const anchor = fTick < 0.36 ? 'end' : fTick > 0.64 ? 'start' : 'middle'
    const dy = anchor === 'middle' ? -3 : 3 // topo: sobe; laterais: centra na linha radial

    // Clamp horizontal: o rótulo nunca sai do viewBox (largura estimada por
    // caractere, ~4.6px na fonte de 9px). Quando o clamp o empurra sobre a
    // trilha, o halo branco (paint-order: stroke) mantém a leitura.
    const estW = tick.label.length * 4.6
    let lx = pLabel.x
    if (anchor === 'end') lx = Math.max(lx, estW + 2)
    else if (anchor === 'start') lx = Math.min(lx, largura - estW - 2)
    else lx = Math.min(Math.max(lx, estW / 2 + 2), largura - estW / 2 - 2)

    tickElementos = (
      <g aria-hidden="true">
        <line
          x1={pInterno.x}
          y1={pInterno.y}
          x2={pExterno.x}
          y2={pExterno.y}
          className="stroke-zinc-400"
          strokeWidth={2}
          strokeLinecap="round"
        />
        <text
          x={lx}
          y={pLabel.y}
          dy={dy}
          textAnchor={anchor}
          strokeWidth={3}
          style={{ paintOrder: 'stroke' }}
          className="fill-zinc-400 stroke-white text-[9px] font-medium"
        >
          {tick.label}
        </text>
      </g>
    )
  }

  return (
    <div className={`relative w-full ${maxW} mx-auto`}>
      <svg
        viewBox={`0 ${-FOLGA_TOPO} ${largura} ${altura + FOLGA_TOPO}`}
        role="img"
        aria-label={ariaLabel}
        className="w-full"
      >
        {/* Trilha — arco completo em cinza neutro (fundo) */}
        <path
          d={pathArco}
          fill="none"
          className="stroke-zinc-100"
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

      {/* Centro DENTRO do vão do arco: número grande + subtítulo, ancorados à base. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center justify-end pb-0.5 text-center"
      >
        <span className={`${textoTitulo} font-bold leading-none tabular-nums text-[var(--text-primary)]`}>
          {centroTitulo}
        </span>
        {centroSubtitulo != null && (
          <span className={`mt-1 ${textoSub} leading-tight text-[var(--text-muted)]`}>{centroSubtitulo}</span>
        )}
      </div>
    </div>
  )
}
