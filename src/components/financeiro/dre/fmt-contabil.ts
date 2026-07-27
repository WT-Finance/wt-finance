// Formatação CONTÁBIL dos valores da DRE (v5.3.0) — CENTAVOS sempre (2 casas, formato
// contábil pedido pelo Yan na rodada 4), negativos entre PARÊNTESES (convenção mantida —
// nunca o sinal "−") e zero como travessão discreto. Os centavos alargam as 13 colunas:
// a tabela compensa com mais respiro por célula (densidade menor, ver tabela-dre.tsx).
// Direção número→string (formatador, não coerção — o toNum canônico segue em
// @/lib/carga/coercao para o caminho inverso).

const nf = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** 1234567.89 → "1.234.567,89" · −1234567.89 → "(1.234.567,89)" · 0 → "–" */
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
