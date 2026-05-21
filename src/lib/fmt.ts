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
