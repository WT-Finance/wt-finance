// Aritmética pequena e comum aos módulos da página "Financeiro · Geral" — PURO.

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

/** Reais → centavos INTEIROS. É a unidade das conferências "ao centavo": comparar dois somatórios em
 *  centavos inteiros (`===`) não tem a folga de um `toBeCloseTo`. */
export function emCentavos(v: number): number {
  return Math.round(v * 100)
}

/** Soma em centavos inteiros: evita que 0,1 + 0,2 vire 0,30000000000000004 numa conferência. */
export function somarCentavos(valores: readonly number[]): number {
  return valores.reduce((s, v) => s + emCentavos(v), 0) / 100
}

// ── Calendário puro ('AAAA-MM-DD', UTC dos dois lados — nunca o relógio ou o fuso da máquina) ─────

const MS_DIA = 86_400_000

function utcDe(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

/** Dias corridos de `deIso` até `ateIso` (negativo se `ateIso` for anterior). */
export function diasEntre(deIso: string, ateIso: string): number {
  return Math.round((utcDe(ateIso) - utcDe(deIso)) / MS_DIA)
}

/** 'AAAA-MM-DD' + `n` dias (n pode ser negativo). */
export function somarDias(iso: string, n: number): string {
  return new Date(utcDe(iso) + n * MS_DIA).toISOString().slice(0, 10)
}

/** A segunda-feira da semana (seg–dom) que contém a data — a convenção das fotos semanais. */
export function segundaDaSemana(iso: string): string {
  const diaDaSemana = new Date(utcDe(iso)).getUTCDay() // 0 = domingo
  return somarDias(iso, -((diaDaSemana + 6) % 7))
}
