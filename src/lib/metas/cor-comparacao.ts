// Régua de cor COMUM entre "% da meta" e "% esperado" (v5.0.0/rodada 5) — extraída
// para módulo compartilhado (v5.1.0) e reusada pelo card do Acompanhamento (meta-card)
// e pela pele do Modo TV. Classifica pela DISTÂNCIA (p.p.) entre a fração da meta
// realizada e a fração do período decorrida:
//   meta ≥ esperado → verde · até 3 p.p. abaixo → âmbar · mais que 3 p.p. abaixo → vermelho.
// Retorna a classe utilitária de cor do DS (token) — não redefine régua nem cores.
export function corComparacao(pctMeta: number | null, pctEsperado: number | null): string {
  if (pctMeta == null || pctEsperado == null) return 'text-[var(--text-muted)]'
  const diff = pctMeta - pctEsperado
  if (diff >= 0) return 'text-success'
  if (diff >= -3) return 'text-warning'
  return 'text-danger'
}

/** Mesma régua, mas devolve o VALOR da cor (CSS var) — para onde não cabe classe utilitária,
 *  ex.: pintar a SETA do esperado (triângulo CSS) na cor do "% da meta". null → cinza (--border). */
export function corComparacaoValor(pctMeta: number | null, pctEsperado: number | null): string {
  if (pctMeta == null || pctEsperado == null) return 'var(--border)'
  const diff = pctMeta - pctEsperado
  if (diff >= 0) return 'var(--success)'
  if (diff >= -3) return 'var(--warning)'
  return 'var(--danger)'
}
