export const fmtBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency', currency: 'BRL', maximumFractionDigits: 0,
  }).format(v)

/**
 * Valor monetário com 2 casas decimais, para CONTEXTO DE OPERAÇÃO INDIVIDUAL
 * (Lista de Operações, drawer de operação). "R$ 344.444,44". (ADR-0100, v4.9/M8.)
 * Em contexto agregado / eixos de gráfico, usar fmtMi/fmtAxisBRL (abreviado).
 */
export const fmtBRL2 = (v: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(v)

/**
 * Número pt-BR com 2 casas, SEM símbolo — para o formato contábil ("R$" à esquerda,
 * valor à direita) em contexto de operação individual. "344.444,44". (v4.9/M8.)
 */
export const numBRL2 = (v: number) =>
  new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)

export const fmtMi = (v: number) => {
  if (Math.abs(v) >= 1_000_000)
    return `R$ ${(v / 1_000_000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Mi`
  if (Math.abs(v) >= 1_000)
    return `R$ ${(v / 1_000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} k`
  return fmtBRL(v)
}

/**
 * Formatador de TICK de eixo (valores monetários abreviados, SEM quebra de linha).
 * "R$ 1,8 Mi" / "R$ 600 k" / "R$ 0" (ADR-0095). Usa 1 casa em Mi e 0 casas em k
 * para manter o rótulo curto (fmtMi usa 2 casas em Mi e fica reservado a
 * tooltips/totais). Use em `tickFormatter` do eixo Y.
 */
export const fmtAxisBRL = (v: number): string => {
  const n = Number(v)
  if (n === 0) return 'R$ 0'
  const a = Math.abs(n)
  if (a >= 1_000_000)
    return `R$ ${(n / 1_000_000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} Mi`
  if (a >= 1_000)
    return `R$ ${Math.round(n / 1_000).toLocaleString('pt-BR')} k`
  return fmtBRL(n)
}

/** Duração em meses, 1 casa decimal: "3,7 meses". `dias` = dias corridos (30,44 d/mês). */
export const fmtMeses = (dias: number): string =>
  `${(dias / 30.44).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} meses`

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

/**
 * Parse LOCAL de uma data 'yyyy-MM-dd' (ou 'yyyy-MM-ddT…') → Date à meia-noite LOCAL.
 * NUNCA usar `new Date('yyyy-MM-dd')`: o construtor interpreta data-only como UTC
 * (meia-noite UTC = 21h do dia anterior em −03), deslocando o dia em comparações.
 * Este helper parseia por componentes — sem fuso. (F6, v4.12.)
 */
export const parseLocalDate = (iso: string): Date => {
  const [y, m, d] = iso.split('T')[0].split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

/** Converte 'yyyy-MM-ddTHH:MM' para 'dd de mês de AAAA, às HHhMMmin' (ex: 05 de jun de 2026, às 17h53min).
 *  Sem componente de hora, devolve só a data (formato médio). Parse por split — sem fuso. */
export const fmtDataHora = (iso: string): string => {
  const [data, hora] = iso.split('T')
  const [y, m, d] = data.split('-')
  const dataFmt = `${d} de ${MESES_COMPACTOS[parseInt(m, 10) - 1]} de ${y}`
  if (!hora) return dataFmt
  const [hh, mm] = hora.split(':')
  return `${dataFmt}, às ${hh}h${mm}min`
}
