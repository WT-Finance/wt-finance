// Janela ajustável de uma série MENSAL simples (v5.4.2) — Fluxo de Caixa do Financeiro.
//
// Irmã de `@/lib/weddings/janela-fluxo`, mas deliberadamente MAIS SIMPLES, e a
// diferença importa: lá a RPC devolve ACUMULADOS, então fatiar exige rebasear na
// borda (e reservar um mês de margem para ter de onde derivar). Aqui cada linha já
// é o valor DO PRÓPRIO MÊS — nada acumula, então recortar é só recortar: nenhum
// número muda de significado ao mudar a borda, e não há mês de margem.
//
// Tentar reusar o `fatiarJanela` de Weddings aqui seria pior que duplicar: obrigaria
// esta série a fingir que tem acumulado e `eh_futuro`.
//
// A janela larga vem da migration 0229 (36 meses atrás + mês atual + 36 à frente,
// hardcoded no corpo de `get_fluxo_caixa_mensal_v3__nucleo` — ao contrário da RPC de
// Weddings, onde a janela sempre foi parâmetro do chamador).

/** Limite do slider em cada direção — igual ao de Weddings, e igual ao que a 0229 busca. */
export const LIMITE_MESES_FLUXO = 36

/** Qualquer linha de série mensal com a chave `mes` no formato 'YYYY-MM'. */
export interface LinhaMensal {
  mes: string
}

export interface JanelaMensal<T extends LinhaMensal> {
  pontos: T[]
  /** `mes` do mês corrente, quando visível na janela. */
  mesHoje: string | null
  maxAtras: number
  maxFrente: number
}

/**
 * Índice do mês corrente na série ORDENADA.
 *
 * Casamento exato quando o mês existe; senão, o último mês ANTERIOR a ele (comparação
 * lexicográfica funciona em 'YYYY-MM'). Devolve 0 numa série que começa depois do mês
 * corrente, e −1 só para série vazia — nunca lança.
 */
export function indiceMesHoje(rows: readonly LinhaMensal[], mesHoje: string): number {
  if (rows.length === 0) return -1
  const exato = rows.findIndex(r => r.mes === mesHoje)
  if (exato >= 0) return exato
  let ultimoAnterior = -1
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].mes <= mesHoje) ultimoAnterior = i
    else break
  }
  return ultimoAnterior >= 0 ? ultimoAnterior : 0
}

/** Quantos meses a janela pode andar para cada lado, dado onde o "hoje" caiu. */
export function limitesJanelaMensal(
  rows: readonly LinhaMensal[],
  mesHoje: string,
): { maxAtras: number; maxFrente: number } {
  const idx = indiceMesHoje(rows, mesHoje)
  if (idx < 0) return { maxAtras: 0, maxFrente: 0 }
  return {
    maxAtras:  Math.min(idx, LIMITE_MESES_FLUXO),
    maxFrente: Math.min(rows.length - 1 - idx, LIMITE_MESES_FLUXO),
  }
}

const clamp = (v: number, min: number, max: number) =>
  Math.min(Math.max(Number.isFinite(v) ? Math.round(v) : min, min), max)

/**
 * Recorta a série na janela [hoje − atras, hoje + frente].
 *
 * Assume `rows` ORDENADA por `mes` (o chamador ordena). Clampa os pedidos aos limites
 * reais em vez de estourar, e nunca lança: série vazia devolve janela vazia.
 */
export function fatiarJanelaMensal<T extends LinhaMensal>(
  rows: readonly T[],
  mesHoje: string,
  atras: number,
  frente: number,
): JanelaMensal<T> {
  const { maxAtras, maxFrente } = limitesJanelaMensal(rows, mesHoje)
  if (rows.length === 0) return { pontos: [], mesHoje: null, maxAtras, maxFrente }

  const idx = indiceMesHoje(rows, mesHoje)
  const esquerda = Math.max(0, idx - clamp(atras, 0, maxAtras))
  const direita  = Math.min(rows.length - 1, idx + clamp(frente, 0, maxFrente))

  const pontos = rows.slice(esquerda, direita + 1) as T[]
  const hojeVisivel = rows[idx] && idx >= esquerda && idx <= direita ? rows[idx].mes : null

  return { pontos, mesHoje: hojeVisivel, maxAtras, maxFrente }
}
