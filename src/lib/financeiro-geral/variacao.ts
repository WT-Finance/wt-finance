// Δ% da página "Financeiro · Geral" (v6.4.0) — módulo PURO, sem I/O nem React.
//
// A conta é a `deltaYtd` da DRE (`@/lib/dre/colunas-tabela`), NÃO reimplementada: variação sobre
// zero é indefinida (`null`, nunca Infinity/NaN) e o denominador é o MÓDULO do valor anterior — sair
// de −100 para −50 é +50% (melhora), de −100 para −150 é −50% (piora). Por isso, com o sinal da DRE
// (despesa negativa), "Δ positivo = melhor" vale para prejuízo e para custo.
//
// O que a DRE não tem é a POLARIDADE: o mesmo +20% é bom para uma receita, ruim para a inadimplência
// (estoque positivo que se quer menor) e sem juízo algum para o volume antecipado. Quem desenha pinta
// a variação pela palavra ("favorável"/"desfavorável") + tinta `-deep`; a cor nunca vai sozinha.

import { deltaYtd } from '@/lib/dre/colunas-tabela'

export type Sentido = 'favoravel' | 'desfavoravel' | 'neutro'

/** Como ler a variação de uma grandeza:
 *  - `maior-melhor`: receita, ou despesa no sinal da DRE (negativa) — Δ positivo é bom;
 *  - `menor-melhor`: estoque positivo que se quer menor (inadimplência) — Δ positivo é ruim;
 *  - `sem-juizo`: o número só informa (volume antecipado) — sem palavra, sem cor. */
export type Polaridade = 'maior-melhor' | 'menor-melhor' | 'sem-juizo'

export interface Variacao {
  /** Δ% (pontos percentuais); `null` quando falta um dos lados ou o anterior é zero. */
  pct: number | null
  /** `null` sem Δ ou em `sem-juizo`. "Estável" (`neutro`) quando o Δ arredonda a 0,0%. */
  sentido: Sentido | null
}

/** O Δ de `anterior` para `atual`. `anterior` ausente (`null`/`undefined`) = ano sem referência. */
export function variacao(
  anterior: number | null | undefined,
  atual: number | null | undefined,
  polaridade: Polaridade,
): Variacao {
  const pct = deltaYtd(anterior ?? null, atual ?? null)
  if (pct === null) return { pct: null, sentido: null }
  if (polaridade === 'sem-juizo') return { pct, sentido: null }
  // Mesmo arredondamento que o `fmtDeltaPct` mostra (1 casa): "+0,0%" não pode virar "favorável".
  if (Math.round(pct * 10) / 10 === 0) return { pct, sentido: 'neutro' }
  const subiu = pct > 0
  const bom = polaridade === 'maior-melhor' ? subiu : !subiu
  return { pct, sentido: bom ? 'favoravel' : 'desfavoravel' }
}
