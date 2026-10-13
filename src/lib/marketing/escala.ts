// Escala do eixo Y do gráfico mensal (v6.3.0) — módulo PURO.
//
// Por que existe: a série é de GASTO, ou seja, NEGATIVA (e, raramente, cruza o zero com um
// estorno). O domínio default do Recharts é `[0, 'auto']` — ancora em zero e CORTA os negativos,
// sem lançar nada (skill `graficos`). E `domain` explícito DESLIGA os ticks bonitos, que passam a
// dividir o intervalo cru (`-471 k · 79 k · 629 k`). Quem fixa o domínio fixa os ticks junto, a
// partir de um PASSO redondo (`passoRedondo`), nunca o contrário.
//
// O domínio sempre CONTÉM o dado e o zero: a ponta é arredondada PARA FORA do dado até a grade
// do passo (nenhum ponto sai do eixo — o defeito que a skill descreve é o inverso, encaixar a
// ponta para dentro).

import { passoRedondo } from '@/lib/escala-grafico'

export interface EscalaSerie {
  domain: [number, number]
  ticks: number[]
}

/** Alvo de intervalos entre ticks (o passo redondo pode produzir até ~6 após arredondar). */
const INTERVALOS_ALVO = 4

const limpar = (n: number): number => (n === 0 ? 0 : Math.round(n * 100) / 100) // normaliza -0

export function escalaSerie(valores: readonly (number | null | undefined)[]): EscalaSerie {
  const v = valores.filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
  const min = Math.min(0, ...v)
  const max = Math.max(0, ...v)
  const amplitude = max - min
  // Série toda zero (ou vazia): domínio mínimo e legível; o gráfico nem é desenhado nesse caso.
  if (amplitude <= 0) return { domain: [-4000, 0], ticks: [-4000, -3000, -2000, -1000, 0] }

  const passo = passoRedondo(amplitude / INTERVALOS_ALVO)
  const lo = Math.floor(min / passo) * passo
  const hi = Math.ceil(max / passo) * passo
  const ticks: number[] = []
  for (let t = lo; t <= hi + passo / 1000; t += passo) ticks.push(limpar(t))
  return { domain: [limpar(lo), limpar(hi)], ticks }
}
