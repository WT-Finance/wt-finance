export const fmtBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency', currency: 'BRL', maximumFractionDigits: 0,
  }).format(v)

export const fmtMi = (v: number) => {
  if (Math.abs(v) >= 1_000_000)
    return `R$ ${(v / 1_000_000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Mi`
  if (Math.abs(v) >= 1_000)
    return `R$ ${(v / 1_000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} k`
  return fmtBRL(v)
}

/**
 * Formatador de TICK de eixo (valores monetários abreviados, SEM quebra de linha).
 * "R$ 1,8 Mi" / "R$ 600 k" / "R$ 0". Reusa a base de `fmtMi`, garantindo que o
 * zero saia limpo como "R$ 0" (e não "R$ 0,00"). Use em `tickFormatter` do eixo Y.
 */
export const fmtAxisBRL = (v: number): string => {
  const n = Number(v)
  if (n === 0) return 'R$ 0'
  return fmtMi(n)
}

/**
 * Formatador de TICK percentual. "14%" / "-3,5%".
 * `casas` controla casas decimais (default 0). Use em `tickFormatter` do eixo Y.
 */
export const fmtAxisPct = (v: number, casas = 0): string =>
  `${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`

const MESES_ABREV_MIN = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez']

/**
 * Formatador de TICK de eixo temporal. Mês minúsculo: 'yyyy-MM' → 'jan/26'.
 * Aceita também 'yyyy-MM-dd' (ignora o dia). Use em `tickFormatter` do eixo X.
 */
export const fmtAxisMes = (mes: string): string => {
  const [y, m] = mes.split('-')
  return `${MESES_ABREV_MIN[parseInt(m, 10) - 1]}/${y.slice(2)}`
}

/** Converte string ISO 'yyyy-MM-dd' para 'dd/mm/aaaa'. */
export const fmtDate = (s: string) => {
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}

const MESES_COMPACTOS = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez']
const MESES_EXTENSO   = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro']

/** Converte 'yyyy-MM-dd' para 'DD mês AAAA' (ex: 21 mai 2026). */
export const fmtDateCompact = (s: string): string => {
  const [y, m, d] = s.split('-')
  return `${parseInt(d, 10)} ${MESES_COMPACTOS[parseInt(m, 10) - 1]} ${y}`
}

/** Converte 'yyyy-MM-dd' para 'DD de mês de AAAA' (ex: 07 de novembro de 2026). */
export const fmtDateLong = (s: string): string => {
  const [y, m, d] = s.split('-')
  return `${d} de ${MESES_EXTENSO[parseInt(m, 10) - 1]} de ${y}`
}

/** Converte 'yyyy-MM-dd' para 'dd de mês de AAAA' (formato médio, ex: 17 de jun de 2026). */
export const fmtDateMid = (iso: string): string => {
  const [y, m, d] = iso.split('-')
  return `${d} de ${MESES_COMPACTOS[parseInt(m, 10) - 1]} de ${y}`
}
