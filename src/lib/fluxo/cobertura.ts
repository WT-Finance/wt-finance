// Runway de Caixa (v5.2.0, ajuste do checkpoint) — estatística PURA da cobertura em meses:
//   cobertura = recebíveis em aberto ÷ saída média mensal.
// A incerteza vem do DENOMINADOR (a saída mensal varia mês a mês): IC 95% da média da
// saída via t de Student (média m, erro-padrão SE = sd/√n, m ± t·SE) e, como os recebíveis
// R são um total lançado (constante), o IC da razão é a transformação direta
//   [ R/(m + t·SE) , R/(m − t·SE) ]  (válido com m − t·SE > 0; senão o teto é ABERTO).
// A estimativa "com antecipação" desconta a taxa média de 4% dos recebíveis (fator 0,96)
// — mesmo denominador, mesmo IC relativo.

/** Valores-críticos t bicaudais a 95% (P(|T|>t)=0,05) por graus de liberdade; >30 → z≈1,96. */
const T_95: Record<number, number> = {
  1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571, 6: 2.447, 7: 2.365, 8: 2.306,
  9: 2.262, 10: 2.228, 11: 2.201, 12: 2.179, 13: 2.16, 14: 2.145, 15: 2.131,
  16: 2.12, 17: 2.11, 18: 2.101, 19: 2.093, 20: 2.086, 21: 2.08, 22: 2.074,
  23: 2.069, 24: 2.064, 25: 2.06, 26: 2.056, 27: 2.052, 28: 2.048, 29: 2.045, 30: 2.042,
}

export function tCritico95(df: number): number {
  if (df < 1) return NaN
  return T_95[df] ?? 1.96
}

export interface CoberturaEstimativa {
  /** Estimativa pontual, em meses. */
  meses: number
  /** Piso do IC 95%, em meses. */
  icLo: number
  /** Teto do IC 95%, em meses — `null` = aberto (m − t·SE ≤ 0, denominador indistinguível de zero). */
  icHi: number | null
}

export interface CoberturaCalc {
  n:          number
  mediaSaida: number
  sdSaida:    number
  se:         number
  tCrit:      number
  semTaxa:    CoberturaEstimativa
  comTaxa:    CoberturaEstimativa
}

/** Fator da estimativa "com antecipação": desconta a taxa média de 4% dos recebíveis. */
export const FATOR_ANTECIPACAO = 0.96

/**
 * Calcula as duas estimativas (sem e com taxa de antecipação) com IC 95%.
 * @param recebiveis     total a receber em aberto (R$, > 0)
 * @param saidasMensais  magnitudes das saídas dos meses FECHADOS (R$/mês; sinal é normalizado)
 * Retorna `null` quando não há como estimar (sem recebíveis, sem meses, média ≤ 0).
 * Com n = 1 não existe variância amostral → IC degenera na própria estimativa pontual.
 */
export function calcularCobertura(recebiveis: number, saidasMensais: number[]): CoberturaCalc | null {
  const saidas = saidasMensais.map(Math.abs)
  const n = saidas.length
  if (recebiveis <= 0 || n === 0) return null

  const media = saidas.reduce((a, b) => a + b, 0) / n
  if (media <= 0) return null

  const sd = n > 1
    ? Math.sqrt(saidas.reduce((a, x) => a + (x - media) ** 2, 0) / (n - 1))
    : 0
  const se    = n > 1 ? sd / Math.sqrt(n) : 0
  const tCrit = n > 1 ? tCritico95(n - 1) : 0

  const estimar = (r: number): CoberturaEstimativa => {
    const meses = r / media
    if (n === 1) return { meses, icLo: meses, icHi: meses }
    const denomHi = media + tCrit * se
    const denomLo = media - tCrit * se
    return {
      meses,
      icLo: r / denomHi,
      icHi: denomLo > 0 ? r / denomLo : null,
    }
  }

  return {
    n,
    mediaSaida: media,
    sdSaida:    sd,
    se,
    tCrit,
    semTaxa: estimar(recebiveis),
    comTaxa: estimar(recebiveis * FATOR_ANTECIPACAO),
  }
}
