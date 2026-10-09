// Card "Total de despesas no período" (v6.3.0, 3ª rodada) — módulo PURO.
//
// Com UM ano o card mostra o total dele; com DOIS OU MAIS, uma linha por ano — do mais recente ao
// mais antigo — com o valor do ano e a VARIAÇÃO % contra o ano logo abaixo na lista (o próximo mais
// antigo SELECIONADO, mesmo que não seja o do calendário: `2026 + 2024` compara 2026 com 2024), e
// uma linha final "Acumulado" com a soma de todos (o mesmo número de `totalDoPeriodo`).
//
// IGUAL COM IGUAL: a base da variação é lida no MESMO recorte do ano da linha — `totalNoRecorte(
// base.linhas, atual.recorte)`. Linha parcial (ano corrente, jan–out): o ano de baixo entra com jan–out
// também. Linha fechada (jan–dez): o de baixo é lido jan–dez (o recorte padrão de um ano anterior
// ao corrente é sempre o ano inteiro). Uma regra só, sem ramo; os dois lados dela têm teste. É a mesma
// ideia do YTD da DRE: "o mesmo período do ano anterior".
//
// FÓRMULA: `deltaYtd` da DRE (`@/lib/dre/colunas-tabela`) — (atual − base) / |base| × 100, sobre
// valores COM SINAL (despesa < 0), travessão (`null`) quando |base| < 0,005. Logo, despesa que CRESCE
// = Δ negativo = DESFAVORÁVEL (−100 → −120 dá −20%); despesa que cai dá Δ positivo = favorável. O
// sentido sai do Δ já ARREDONDADO a 1 casa (o que se mostra): "0,0%" é neutro, nunca favorável/
// desfavorável. A cor sozinha não basta: o componente escreve a palavra.
//
// FAIL-CLOSED: se algum ano selecionado não carregou (`anosFalha`), NÃO se devolve linha nenhuma —
// somar (ou comparar) só os anos que chegaram daria um número errado sob o mesmo rótulo. O card
// mostra o erro nomeando os anos.

import { deltaYtd } from '@/lib/dre/colunas-tabela'
import { totalDoPeriodo, totalNoRecorte, type FatiaAno } from './agregacao'
import { recorteParcial, rotuloAnoNoTotal, rotuloRecorte } from './periodo'

interface LinhaCubo { mes: number; valor: number; qtd: number }

export type SentidoVariacao = 'favoravel' | 'desfavoravel' | 'neutro'

export interface VariacaoVsAnterior {
  /** O ano comparado (o próximo mais antigo da lista). */
  contra: number
  /** Δ% (`deltaYtd`); `null` = base em zero contábil → travessão. */
  pct: number | null
  /** `null` quando não há Δ. Despesa que cresce (Δ < 0) = `desfavoravel`. */
  sentido: SentidoVariacao | null
  /** O recorte comparado ("jan–out") quando a linha é de ano parcial; `null` = ano inteiro × inteiro. */
  recorte: string | null
  /** Referência curta ao lado do Δ: "vs 2025" · "vs 2025 (jan–out)". */
  referencia: string
}

export interface LinhaTotalAno {
  ano: number
  /** "2026*" no ano parcial, "2025" no inteiro. */
  rotulo: string
  /** O recorte do ano ("jan–out") quando é parcial; `null` num ano inteiro. */
  recorte: string | null
  /** Total do ano no SEU recorte, com o sinal da DRE. */
  valor: number
  qtd: number
  /** `null` na última linha (o ano mais antigo não tem contra quem comparar). */
  variacao: VariacaoVsAnterior | null
}

export type TotalPorAno =
  | {
      ok: true
      /** Do ano mais RECENTE ao mais antigo. */
      linhas: LinhaTotalAno[]
      /** A soma dos anos, cada um no seu recorte — o mesmo total de `totalDoPeriodo`. */
      acumulado: { valor: number; qtd: number }
    }
  | { ok: false; anosFalha: number[] }

/** O sentido de um Δ%, olhando o valor que se exibe (1 casa). */
export function sentidoDaVariacao(pct: number | null): SentidoVariacao | null {
  if (pct === null) return null
  const exibido = Math.round(pct * 10) / 10
  return exibido > 0 ? 'favoravel' : exibido < 0 ? 'desfavoravel' : 'neutro'
}

export function linhasTotalPorAno(
  fatias: readonly FatiaAno<LinhaCubo>[],
  anosFalha: readonly number[],
): TotalPorAno {
  if (anosFalha.length > 0) return { ok: false, anosFalha: [...anosFalha] }

  const decrescente = [...fatias].sort((a, b) => b.ano - a.ano)

  const linhas = decrescente.map((f, i): LinhaTotalAno => {
    const { valor, qtd } = totalNoRecorte(f.linhas, f.recorte)
    const abaixo = decrescente[i + 1]
    const recorte = recorteParcial(f.recorte) ? rotuloRecorte(f.recorte) : null
    let variacao: VariacaoVsAnterior | null = null
    if (abaixo) {
      // A base é lida no recorte do ano DA LINHA (igual com igual).
      const base = totalNoRecorte(abaixo.linhas, f.recorte)
      const pct = deltaYtd(base.valor, valor)
      variacao = {
        contra: abaixo.ano,
        pct,
        sentido: sentidoDaVariacao(pct),
        recorte,
        referencia: recorte ? `vs ${abaixo.ano} (${recorte})` : `vs ${abaixo.ano}`,
      }
    }
    return { ano: f.ano, rotulo: rotuloAnoNoTotal(f.ano, f.recorte), recorte, valor, qtd, variacao }
  })

  return { ok: true, linhas, acumulado: totalDoPeriodo(fatias) }
}
