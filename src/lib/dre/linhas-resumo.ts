// ── Linhas do Resumo Executivo da DRE — módulo PURO ───────────────────────────
// As listas de manchete dos DOIS regimes. Moram aqui, e não dentro do componente, por
// um motivo prático: o caso de contrato que confronta estas chaves contra a árvore VIVA
// precisa importá-las, e o componente é `'use client'` — importá-lo num teste de node
// arrastaria React e a árvore de UI inteira junto.
//
// ── Por que uma lista ESTÁTICA de chaves ─────────────────────────────────────
// Decisão herdada da v5.7.0 e que segue valendo: o payload de `get_dre_mensal` não
// carrega o campo `formula`, então não há como saber dinamicamente quais linhas são
// agregadoras. Derivar por `t === 'tot'` seria frágil por outro motivo — o TIPO de um
// bloco é DADO editável (a `RB_H` era `blocoH` até a v5.7.1 e virou `tot`). Uma lista de
// CHAVES sobrevive a isso; um filtro por tipo mudaria de conteúdo sozinho.
//
// O que NÃO é estático são os valores: eles saem do payload vivo, casados por
// `b:<chave>` — nunca por nome nem por posição (a estrutura reordena e renomeia, e
// renomeou na própria v5.7.0).
//
// ⚠️ Chave que sumir da árvore deixa a linha VAZIA, em silêncio. É o `rpc-contrato.test`
// que pega isso, confrontando estas listas com o demonstrativo real de cada regime.

/** Uma linha do resumo. O `prefixo` contábil é separado do rótulo de propósito: é a
 *  coluna estreita que alinha verticalmente os sinais. */
export interface LinhaResumo {
  prefixo: string
  rotulo:  string
  chave:   string
}

/**
 * Regime de CAIXA — 6 linhas.
 *
 * v5.7.1 — a Receita Bruta passou de `(+)` para `(=)`. Ela sempre foi um SUBTOTAL
 * (`REPASSE + RV`), mas estava tipada como cabeçalho de grupo e marcada aqui como
 * entrada; a v5.7.1 a promoveu a linha de RESULTADO na estrutura, e o prefixo segue o
 * papel. Consequência: as seis linhas são resultados, e a coluna de prefixo deixou de
 * distinguir entrada de resultado — ela agora só alinha os sinais verticalmente.
 */
export const LINHAS_CAIXA: ReadonlyArray<LinhaResumo> = [
  { prefixo: '(=)', rotulo: 'Saldo Repasse',          chave: 'REPASSE' },
  { prefixo: '(=)', rotulo: 'Receita Bruta',          chave: 'RB_H' },
  { prefixo: '(=)', rotulo: 'Receita Op. Líquida',    chave: 'ROL' },
  { prefixo: '(=)', rotulo: 'Lucro Bruto',            chave: 'LB' },
  { prefixo: '(=)', rotulo: 'Lucro Operacional',      chave: 'LOP' },
  { prefixo: '(=)', rotulo: 'Resultado do Exercício', chave: 'REX' },
] as const

/**
 * Regime de COMPETÊNCIA (v5.8.1) — 8 linhas.
 *
 * A lista é outra porque as árvores divergem de verdade (ADR-0170): a competência não
 * tem REPASSE, e tem LL, RAIR e REXG que o caixa não tem.
 *
 * Rótulos em cópia de produto (curta), como os do caixa — os gravados no banco vêm em
 * caixa alta e com prefixo contábil, e o demonstrativo logo abaixo mostra o nome
 * completo de cada linha.
 */
export const LINHAS_COMPETENCIA: ReadonlyArray<LinhaResumo> = [
  { prefixo: '(=)', rotulo: 'Receita Bruta',          chave: 'RB_H' },
  { prefixo: '(=)', rotulo: 'Receita Op. Líquida',    chave: 'ROL' },
  { prefixo: '(=)', rotulo: 'Lucro Bruto',            chave: 'LB' },
  { prefixo: '(=)', rotulo: 'Lucro Operacional',      chave: 'LOP' },
  { prefixo: '(=)', rotulo: 'Lucro Líquido',          chave: 'LL' },
  { prefixo: '(=)', rotulo: 'Resultado antes do IR',  chave: 'RAIR' },
  { prefixo: '(=)', rotulo: 'Resultado do Exercício', chave: 'REX' },
  { prefixo: '(=)', rotulo: 'Resultado Gerencial',    chave: 'REXG' },
] as const
