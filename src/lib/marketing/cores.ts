// Cor de cada ano nos gráficos de "Despesas de Marketing" (v6.3.0) — módulo PURO.
//
// Tela de plataforma neutra (sem `--brand`): o ano MAIS RECENTE selecionado usa a cor principal da
// série (`--action-soft-border`, o Cool Gray institucional, o mesmo das barras do inventário) e
// cada ano anterior um tom de cinza PROGRESSIVAMENTE mais claro, todos por token (nunca hex):
//
//   mais recente           → --action-soft-border  (#75777B, Cool Gray 9)
//   1 posição para trás    → --text-subtle         (#ACA39A, Warm Gray 5 — o cinza neutro-quente canônico)
//   2 posições para trás   → --band                (#E8E6E1, o cinza neutro-quente das bandas da DRE)
//
// A cor segue a POSIÇÃO entre os selecionados (não a distância no calendário): com `2024 + 2026`
// os dois anos recebem tons distintos e vizinhos, e três anos nunca colidem. O teto de
// `MAX_ANOS` (3) é exatamente o número de tons.

export const TONS_DO_ANO = [
  'var(--action-soft-border)',
  'var(--text-subtle)',
  'var(--band)',
] as const

/** Uma cor por ano, na ordem recebida (crescente): o último é a cor principal; os anteriores,
 *  tons mais claros. Mais anos que tons repete o mais claro (não acontece com `MAX_ANOS`). */
export function coresDosAnos(anosCrescentes: readonly number[]): string[] {
  const n = anosCrescentes.length
  return anosCrescentes.map((_, i) => TONS_DO_ANO[Math.min(n - 1 - i, TONS_DO_ANO.length - 1)])
}
