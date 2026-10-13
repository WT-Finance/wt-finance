// Tabela "Por fornecedor" em blocos por ANO (v6.3.0, 5ª rodada) — módulo PURO.
//
// Por ano selecionado: duas colunas — "Valor" (despesa do fornecedor no ano, no recorte DO ANO) e
// "% do ano" (participação dele no total de marketing daquele ano; denominador = total do ano).
// É o par de `tabelaCategoriasPorAno` (tabela-por-ano.ts) para o eixo fornecedor, e vale a mesma
// completude, por ano:
//
//   Σ fornecedores  ≡  total do ano  ≡  total da tabela "Por categoria" daquele ano
//   Σ "% do ano"    =  100%          (dentro do arredondamento de exibição)
//
// Cada ano é lido por `rankingFornecedores` no SEU recorte (ano fechado jan–dez; ano corrente jan até
// o mês corrente) e os fornecedores são costurados entre os anos pela CHAVE (aparada), nunca pelo
// rótulo. "(sem fornecedor)" é um fornecedor como outro: entra na soma e na linha.
//
// DINHEIRO: somas em centavos via `somar` (agregacao.ts); valores no sinal da DRE (despesa < 0).
//
// AUSÊNCIA × ZERO: `null` = o fornecedor não teve lançamento naquele ano (célula "—", valor E %);
// `0` = houve lançamento e somou zero. Um ano sem NENHUM lançamento no recorte tem total `null`.
// O "% do ano" também é `null` quando o total do ano é zero contábil (razão sobre zero é
// indefinida — `pctDoTotal`): a célula de valor continua numérica, só a % vira travessão.

import { pctDoTotal, rankingFornecedores, somar, type FatiaAno } from './agregacao'
import { recorteParcial, rotuloAnoNoTotal, rotuloRecorte } from './periodo'
import type { LinhaMesFornecedor } from './tipos'

/** Um ano da tabela: rótulo e o rodapé do ano. */
interface ColunaAnoFornecedor {
  ano: number
  /** "2026*" no ano parcial; "2025" no inteiro (convenção da página). */
  rotulo: string
  /** "jan–out" quando o ano é parcial; `null` num ano inteiro. */
  recorte: string | null
  /** Total do ano no recorte; `null` = ano sem lançamento algum. */
  total: number | null
  /** "% do ano" do total (a linha de rodapé): 100 quando há total não-zero; `null` caso contrário. */
  pctTotal: number | null
  qtd: number
}

/** O que um fornecedor fez num ano. */
interface CelulaFornecedorAno {
  /** `null` = o fornecedor não aparece nesse ano. */
  valor: number | null
  /** % do total do ano; `null` = ausente no ano, ou total do ano zero. */
  pct: number | null
}

interface LinhaFornecedorAno {
  /** Chave de agrupamento ('' = sem fornecedor). */
  chave: string
  rotulo: string
  /** Alinhado a `TabelaFornecedoresPorAno.anos`. */
  anos: CelulaFornecedorAno[]
}

export interface TabelaFornecedoresPorAno {
  /** Do ano mais antigo ao mais recente — a ordem do gráfico mensal e da "Por categoria". */
  anos: ColunaAnoFornecedor[]
  /** Ordenadas pela soma dos anos (a mais negativa primeiro), desempate por nome. */
  linhas: LinhaFornecedorAno[]
  qtd: number
}

export function tabelaFornecedoresPorAno(fatias: readonly FatiaAno<LinhaMesFornecedor>[]): TabelaFornecedoresPorAno {
  const ordenadas = [...fatias].sort((a, b) => a.ano - b.ano)
  const porAno = ordenadas.map(f => ({ fatia: f, ranking: rankingFornecedores(f.linhas, f.recorte) }))

  const anos: ColunaAnoFornecedor[] = porAno.map(({ fatia, ranking }) => {
    const total = ranking.qtd === 0 ? null : ranking.total
    return {
      ano: fatia.ano,
      rotulo: rotuloAnoNoTotal(fatia.ano, fatia.recorte),
      recorte: recorteParcial(fatia.recorte) ? rotuloRecorte(fatia.recorte) : null,
      total,
      pctTotal: total === null ? null : pctDoTotal(total, total),
      qtd: ranking.qtd,
    }
  })

  const rotulos = new Map<string, string>()
  for (const { ranking } of porAno) for (const l of ranking.linhas) rotulos.set(l.chave, l.rotulo)

  const linhasComChave = [...rotulos.entries()].map(([chave, rotulo]) => {
    const celulas: CelulaFornecedorAno[] = porAno.map(({ ranking }) => {
      const l = ranking.linhas.find(x => x.chave === chave)
      return l ? { valor: l.valor, pct: l.pct } : { valor: null, pct: null }
    })
    // A ordem usa a soma dos anos do fornecedor (a mais negativa primeiro); a soma NÃO é exposta.
    const soma = somar(celulas.flatMap(c => (c.valor === null ? [] : [c.valor])))
    return { linha: { chave, rotulo, anos: celulas } satisfies LinhaFornecedorAno, soma }
  })
  linhasComChave.sort((a, b) => a.soma - b.soma || a.linha.rotulo.localeCompare(b.linha.rotulo, 'pt-BR'))

  return { anos, linhas: linhasComChave.map(x => x.linha), qtd: anos.reduce((s, a) => s + a.qtd, 0) }
}
