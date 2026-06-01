/**
 * Helper de eixo temporal CONTÍNUO (v4.8 / M4).
 *
 * Padrão da plataforma: gráficos temporais SEMPRE mostram todos os meses do
 * intervalo, mesmo os sem dado (buracos viram zero/placeholder, não somem).
 * Use antes de passar `data` ao chart para garantir o eixo X contínuo.
 */

/** Soma `n` meses (pode ser negativo) a um 'yyyy-MM', retornando 'yyyy-MM'. */
function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number)
  const total = y * 12 + (m - 1) + n
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  return `${ny}-${String(nm).padStart(2, '0')}`
}

/** Lista todos os 'yyyy-MM' de `from` a `to` (inclusivo), em ordem crescente. */
export function listMonths(from: string, to: string): string[] {
  if (from > to) return []
  const out: string[] = []
  let cur = from
  // guarda de segurança contra intervalos absurdos (60 anos)
  for (let i = 0; i < 720 && cur <= to; i++) {
    out.push(cur)
    cur = addMonths(cur, 1)
  }
  return out
}

/**
 * Preenche meses faltantes numa série temporal, garantindo o eixo X contínuo.
 *
 * @param rows   Linhas existentes (podem ter buracos).
 * @param getMes Extrai o 'yyyy-MM' de uma linha.
 * @param makeEmpty Cria a linha "vazia" para um mês ausente (ex.: zeros).
 * @param range  Opcional `{ from, to }` em 'yyyy-MM' para fixar o intervalo;
 *               se omitido, usa o min/max dos dados existentes.
 * @returns Série ordenada por mês, sem buracos.
 */
export function fillMonths<T>(
  rows: T[],
  getMes: (row: T) => string,
  makeEmpty: (mes: string) => T,
  range?: { from: string; to: string },
): T[] {
  if (!rows.length && !range) return []

  const byMes = new Map<string, T>()
  for (const r of rows) byMes.set(getMes(r), r)

  const meses = [...byMes.keys()].sort()
  const from = range?.from ?? meses[0]
  const to   = range?.to   ?? meses[meses.length - 1]

  return listMonths(from, to).map(mes => byMes.get(mes) ?? makeEmpty(mes))
}
