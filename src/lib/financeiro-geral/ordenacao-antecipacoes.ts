// Ordenação por clique no cabeçalho da lista de registros de antecipação (v6.5.0) — módulo puro, só de UI:
// muda a ORDEM, nunca o conjunto de linhas. Mesmo molde de `src/lib/gerencial/ordenacao.ts`.

export type ColRegistro = 'data' | 'conta' | 'antecipado' | 'liquido' | 'desconto'
export type DirRegistro = 'asc' | 'desc'

/** Subconjunto de `RegistroAntecipacao` que o comparador lê. */
export interface LinhaRegistro {
  id: number
  conta: string
  /** 'AAAA-MM-DD' (date puro, sem fuso). */
  data: string
  valor_antecipado: number
  valor_liquido: number
  desconto: number
}

/** Coluna ativa ao abrir a lista: do registro mais recente para o mais antigo. */
export const COL_PADRAO_REGISTRO: ColRegistro = 'data'
export const DIR_PADRAO_REGISTRO: DirRegistro = 'desc'

/** Direção ao TROCAR de coluna: texto em asc (A→Z); data e valores em desc (maior/mais recente primeiro). */
export const DIR_PADRAO_COL_REGISTRO: Record<ColRegistro, DirRegistro> = {
  data: 'desc', conta: 'asc', antecipado: 'desc', liquido: 'desc', desconto: 'desc',
}

function compararTexto(a: string, b: string): number {
  return a.localeCompare(b, 'pt-BR', { sensitivity: 'base' })
}

function compararPrincipal(col: ColRegistro, a: LinhaRegistro, b: LinhaRegistro): number {
  switch (col) {
    // ISO 'AAAA-MM-DD': a ordem lexicográfica é a ordem cronológica.
    case 'data':       return a.data < b.data ? -1 : a.data > b.data ? 1 : 0
    case 'conta':      return compararTexto(a.conta, b.conta)
    case 'antecipado': return a.valor_antecipado - b.valor_antecipado
    case 'liquido':    return a.valor_liquido - b.valor_liquido
    case 'desconto':   return a.desconto - b.desconto
  }
}

/** Comparador estável por coluna. Empate na coluna (em qualquer direção) desempata por data desc e depois id
 *  desc — o mais recente fica em cima e a ordem não oscila entre renders. */
export function comparadorRegistros(col: ColRegistro, dir: DirRegistro) {
  const sinal = dir === 'asc' ? 1 : -1
  return (a: LinhaRegistro, b: LinhaRegistro): number => {
    const principal = compararPrincipal(col, a, b)
    if (principal !== 0) return sinal * principal
    if (a.data !== b.data) return a.data < b.data ? 1 : -1
    return b.id - a.id
  }
}

/** Cópia ordenada (a entrada não é mutada). */
export function ordenarRegistros<T extends LinhaRegistro>(linhas: readonly T[], col: ColRegistro, dir: DirRegistro): T[] {
  return [...linhas].sort(comparadorRegistros(col, dir))
}
