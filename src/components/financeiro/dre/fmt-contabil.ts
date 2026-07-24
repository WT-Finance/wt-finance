// Formatação CONTÁBIL dos valores da DRE (v5.3.0 · M0) — negativos em parênteses,
// sem centavos (densidade da tabela de 159 linhas), zero como travessão discreto.
// Direção número→string (formatador, não coerção — o toNum canônico segue em
// @/lib/carga/coercao para o caminho inverso).

const nf = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })

/** 1234567.89 → "1.234.568" · −1234567.89 → "(1.234.568)" · 0 → "–" */
export function fmtContabil(v: number): string {
  if (Math.abs(v) < 0.005) return '–'
  const abs = nf.format(Math.abs(v))
  return v < 0 ? `(${abs})` : abs
}

/** Variante com prefixo R$ (cards/subtotais do editor). */
export function fmtContabilBRL(v: number): string {
  if (Math.abs(v) < 0.005) return '–'
  const abs = nf.format(Math.abs(v))
  return v < 0 ? `(R$ ${abs})` : `R$ ${abs}`
}
