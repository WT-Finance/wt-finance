// ── Passo "redondo" para régua de gráfico — módulo PURO ───────────────────────
// Nasceu dentro de `charts/cascata.tsx` (v5.8.1) e foi promovido na v5.9.2, quando a
// grade de proporção precisou da mesma conta. Duplicar a tabela de mantissas em dois
// arquivos é como duas réguas divergem no primeiro ajuste.
//
// Por que existe: quem fixa `domain` num eixo do Recharts PERDE o algoritmo de marcas
// "bonitas" dele — o eixo passa a dividir o intervalo cru e produz `-471 k · 79 k · 629 k`.
// Escolher um passo redondo e derivar os ticks a partir dele é o que devolve uma régua
// legível. (Medido na v5.8.1; a mesma armadilha vale para qualquer eixo com domínio fixo.)

/** Mantissas aceitas para o passo, em ordem. Todas produzem meio-passo legível
 *  (300k, 750k, 1,5 p.p.…), que importa porque as réguas costumam ter poucos passos. */
const MANTISSAS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10] as const

/**
 * O menor passo "redondo" ≥ `v`.
 *
 * `v` ≤ 0 devolve o menor passo positivo possível em vez de estourar: um domínio
 * degenerado (série constante, ou uma única leitura) é um caso real, e ali qualquer passo
 * serve — o que não pode é `Math.log10(0)` virar `-Infinity` e contaminar o eixo.
 */
export function passoRedondo(v: number): number {
  if (!Number.isFinite(v) || v <= 0) return 1
  const base = Math.pow(10, Math.floor(Math.log10(v)))
  for (const m of MANTISSAS) if (m * base >= v) return m * base
  return 10 * base
}
