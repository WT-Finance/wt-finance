// Aritmética pequena e comum aos módulos da página "Financeiro · Geral" (v6.4.0) — PURO.

/** Percentual de `parte` sobre `total` (0..100, com o sinal do que vier); `null` quando o total é
 *  zero (ou não numérico) — divisão por zero nunca vira Infinity/NaN na tela. */
export function pctDe(parte: number, total: number): number | null {
  if (!Number.isFinite(parte) || !Number.isFinite(total) || Math.abs(total) < 0.005) return null
  return (parte / total) * 100
}

/** 'AAAA-MM-DD' → "DD/MM" (calendário puro, sem fuso). */
export function diaMes(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

/** Soma em centavos inteiros: evita que 0,1 + 0,2 vire 0,30000000000000004 numa conferência. */
export function somarCentavos(valores: readonly number[]): number {
  return valores.reduce((s, v) => s + Math.round(v * 100), 0) / 100
}
