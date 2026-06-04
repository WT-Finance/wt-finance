/**
 * Tema central de gráficos — WT Finance Design System (v4.8 / M4).
 *
 * Fonte única de verdade para cores, dimensões e padrões dos gráficos Recharts.
 * Todas as cores apontam para tokens CSS (`var(--*)` de `src/styles/tokens.css`).
 * NUNCA usar hex hardcoded num componente de gráfico — consumir daqui.
 *
 * Convenção de tracejado (regra geral da plataforma):
 *   SÓLIDO   = dado real / efetivo.
 *   TRACEJADO = referência (ano anterior) ou projeção (futuro).
 *
 * Os primitivos em `src/components/charts/*` consomem este tema; os drawers de
 * M5/M6 devem consumir os primitivos (não reimplementar eixos/grade/legenda).
 */

/** Cores estruturais (eixos, grade, linha-zero) — todas via token CSS. */
export const chartColors = {
  axisTick: 'var(--chart-axis-tick)',
  grid:     'var(--chart-grid)',
  /** Linha do zero — sólida e mais forte que a grade. */
  zeroLine: 'var(--border-strong)',
} as const

/** Paleta de séries semânticas genéricas (status). */
export const chartSeries = {
  success: 'var(--chart-success)',
  warning: 'var(--chart-warning)',
  danger:  'var(--chart-danger)',
  neutral: 'var(--chart-neutral)',
  info:    'var(--chart-info)',
} as const

/**
 * Cores semânticas de FLUXO DE CAIXA (entrada / saída / resultado).
 * Usadas nos ComposedChart de Fluxo (Weddings e Financeiro).
 *
 * Paleta canônica (ADR-0103, v4.10): entrada = `--positive` (verde sage),
 * saída = `--negative` (terracota), resultado = preto institucional, ponto
 * negativo no danger. É semântica fixa e IDÊNTICA em toda a plataforma — não
 * herda a cor da aba. Substitui o antigo azul-trips/mostarda (#0091B3/#D9A23F),
 * que colidia com `--brand` em Trips (#0091B3) e divergia do drawer de operação.
 */
export const fluxoColors = {
  entrada:           'var(--positive)',     // verde sage — entradas/recebimentos
  saida:             'var(--negative)',      // terracota — saídas/pagamentos
  resultado:         'var(--text-primary)',  // linha de resultado
  resultadoNegativo: 'var(--danger)',        // ponto de resultado < 0
} as const

/**
 * Opacidade aplicada às séries de PROJEÇÃO / PREVISTO (futuro) em barras.
 * O dado efetivo fica em opacidade cheia (1); o previsto, esmaecido.
 */
export const FUTURE_OPACITY = 0.35

/** Margens padrão do gráfico, por "forma". Use spread no `margin` do chart. */
export const chartMargins = {
  /** Coluna/linha temporal com eixo Y de valores à esquerda. */
  default:    { top: 8, right: 16, bottom: 0, left: 0 },
  /** Quando há ReferenceLine com label à direita (precisa de folga). */
  withRightLabel: { top: 8, right: 80, bottom: 0, left: 0 },
  /** Barra horizontal (categoria no Y, valor no X) com rótulo à direita. */
  horizontal: { top: 0, right: 64, bottom: 0, left: 0 },
} as const

/** Tamanhos de fonte dos ticks de eixo. */
export const tickFontSize = {
  x: 10,
  y: 11,
} as const

/** Dasharrays padronizados. */
export const dashArrays = {
  /** Grade horizontal sutil. */
  grid:       '3 4',
  /** Referência (ano anterior) ou projeção (futuro). */
  reference:  '5 4',
} as const

/** Espessuras de linha. */
export const strokeWidths = {
  /** Linha principal (dado real). */
  line:       2,
  /** Linha de comparação/projeção (tracejada). */
  lineDashed: 1.5,
  /** Linha do zero (mais forte que a grade). */
  zeroLine:   1.5,
} as const

/** Raios de canto padrão de barras (só nas pontas externas). */
export const barRadius = {
  /** Coluna vertical apontando para cima (topo arredondado). */
  top:    [2, 2, 0, 0] as [number, number, number, number],
  /** Coluna vertical apontando para baixo (base arredondada) — saídas invertidas. */
  bottom: [0, 0, 2, 2] as [number, number, number, number],
  /** Barra horizontal (ponta direita arredondada). */
  right:  [0, 4, 4, 0] as [number, number, number, number],
  /** Sem arredondamento — segmentos internos de um stack. */
  none:   [0, 0, 0, 0] as [number, number, number, number],
} as const

/** Larguras de barra padrão. */
export const barSizes = {
  /** Coluna de fluxo (séries finas, lado a lado). */
  fluxo:      5,
  /** Coluna temporal padrão. */
  column:     14,
  /** Barra horizontal de composição (mix por setor/subsetor). */
  horizontal: 28,
} as const
