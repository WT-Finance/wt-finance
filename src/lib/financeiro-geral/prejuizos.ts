// Perdas e prejuízos (v6.4.0) — módulo PURO sobre o retorno de `get_geral_prejuizos`.
//
// Decisão do Yan (GATE 0): o número principal é o PREJUÍZO BRUTO (categoria da tabela curada, no sinal
// da DRE: negativo). A reversão (Reversão de Perdas Financeiras, positiva) e o LÍQUIDO ficam ao lado
// como contexto — "recuperado" e "o que sobra". "Por natureza" saiu: no lugar, o prejuízo por mês.
//
// O recorte é uma TABELA CURADA (inv. 2), com bandeja visível: categoria com nome de prejuízo/perda
// que ainda não está no mapa aparece em `bandeja` e a tela a MOSTRA — nunca fica de fora em silêncio.

import { somarCentavos } from './numeros'
import { rotuloDoAno } from './periodo'
import type { Prejuizos } from './schemas'
import type { LeituraAno } from './tipos'
import { variacao, type Variacao } from './variacao'

const EPS = 0.005

export interface ResumoAnoPrejuizo {
  ano: number
  /** "2026*" quando parcial. */
  rotulo: string
  prejuizo: number
  /** Recuperado (a reversão, positiva). */
  reversao: number
  liquido: number
  /** Δ do prejuízo bruto vs o mesmo período do ano anterior (despesa negativa: crescer = desfavorável). */
  deltaPrejuizo: Variacao
  /** O líquido bate com prejuízo + reversão? (a RPC o deriva; a conferência é de graça) */
  liquidoConfere: boolean
}

export function resumoDoAno(l: Prejuizos): ResumoAnoPrejuizo {
  return {
    ano: l.ano,
    rotulo: rotuloDoAno(l.ano, l),
    prejuizo: l.prejuizo.total,
    reversao: l.reversao.total,
    liquido: l.liquido.total,
    deltaPrejuizo: variacao(l.ano_anterior_ytd?.prejuizo, l.prejuizo.total, 'maior-melhor'),
    liquidoConfere: Math.abs(somarCentavos([l.prejuizo.total, l.reversao.total]) - l.liquido.total) <= EPS,
  }
}

export interface ItemBandeja {
  categoriaId: number
  rotulo: string
  /** Total por ano selecionado (só os que carregaram). */
  porAno: { ano: number; total: number }[]
  /** Soma dos anos listados. */
  total: number
}

/** A bandeja de todos os anos carregados, unida por categoria. Vazia = o mapa conhece tudo. */
export function bandejaDosAnos(leituras: readonly LeituraAno<Prejuizos>[]): ItemBandeja[] {
  const itens = new Map<number, ItemBandeja>()
  for (const { ano, leitura } of [...leituras].sort((a, b) => a.ano - b.ano)) {
    if (!leitura.ok) continue
    for (const b of leitura.dados.bandeja) {
      const item = itens.get(b.categoria_id) ?? { categoriaId: b.categoria_id, rotulo: b.rotulo, porAno: [], total: 0 }
      item.porAno.push({ ano, total: b.total })
      item.total = somarCentavos([item.total, b.total])
      itens.set(b.categoria_id, item)
    }
  }
  return [...itens.values()]
}
