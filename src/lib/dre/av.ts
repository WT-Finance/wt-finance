// ── Análise Vertical da DRE (v5.7.0 · base trocada na v5.7.2) — módulo PURO ────
// AV = quanto cada linha do demonstrativo representa da **Receita Bruta de Vendas do
// MESMO período**. É como a diretoria lê composição: "custo é 38% da receita" diz mais
// do que o valor absoluto, e permite comparar anos de tamanhos diferentes.
//
// DERIVADA, NUNCA BUSCADA. Não há RPC nova nem mudança de contrato: tudo sai do
// payload que a página já carrega (`get_dre_mensal`). Por isso este módulo é puro —
// sem React, sem rede, sem `Date` — e testável linha a linha.
//
// ── Quatro decisões que valem explicação ─────────────────────────────────────
//
// 1. **Devolve PERCENTUAL (7.9), não fração (0.079).** A regra do projeto de guardar
//    fração vale para o BANCO, onde um `/100` espalhado vira divergência silenciosa.
//    Aqui nada persiste, e a célula vizinha na mesma tabela (`CelulaDeltaPct`) já
//    trabalha em percentual: duas células de % lado a lado com unidades diferentes é
//    o risco real neste contexto. O nome da função crava a unidade.
//
// 2. **A base é a RECEITA BRUTA DE VENDAS (v5.7.2), e precisa ser POSITIVA.** Era a
//    ROL até a v5.7.1. A troca é de produto: a Receita Bruta é a primeira linha que
//    representa a receita CHEIA do negócio, então "% da receita" passa a significar o
//    que o leitor espera — antes, com a ROL (já líquida de impostos e deduções), toda
//    linha acima dela passava de 100% e o denominador era um número que já tinha
//    subtrações dentro. Com base ≤ 0 a razão inverte de sinal e diria o contrário do
//    que o leitor entende ("custo de −40%"), então a coluna inteira daquele período
//    vira travessão. Não é fail-safe genérico: é a única leitura honesta.
//
// 3. **AV só ABAIXO da base.** As linhas acima da Receita Bruta (Entrada de Clientes,
//    Pagamento ao Fornecedor, Saldo Repasse, Receita de Vendas) ficam travadas em
//    travessão — decisão do Yan na v5.7.2. Elas são as PARCELAS que formam a base, e
//    exibir "Entrada de Clientes = 285% da Receita Bruta" convida a uma leitura de
//    composição que não existe: nada ali é parte de um todo, é o caminho até o todo.
//    A separação é POSICIONAL e sai de `indiceBaseAv` — ver a nota lá.
//
// 4. **A base mostra 100,0%.** Ela é a referência, e vê-la explícita é o que ancora a
//    leitura da coluna inteira.
//
// ── Aditividade ──────────────────────────────────────────────────────────────
// Antes do arredondamento a AV é perfeitamente aditiva: se os valores somam, as AVs
// somam (é uma divisão pela MESMA base). O teste trava isso.
// Na EXIBIÇÃO com 1 casa a soma da coluna pode fechar com ±0,1 p.p. de diferença —
// é inerente a arredondar cada linha, e **não se maquia**. É uma exceção consciente
// à lição da v5.5.0 (onde a soma cosmética venceu): ali o total era o número que
// alguém conferia; aqui o que se lê é a correção de CADA linha contra a base, e
// forçar o fechamento estragaria a linha para salvar a coluna.

import type { DreLinha } from './schemas'

/** Chave do bloco que serve de base à AV. Fica aqui para não virar string solta em três
 *  componentes — e a previsão se cumpriu: a base MUDOU na v5.7.2, de `ROL` (Receita
 *  Operacional Líquida) para `RB_H` (Receita Bruta de Vendas), num lugar só. */
export const CHAVE_BASE_AV = 'RB_H'

/**
 * Posição da linha-base no payload — o que separa "acima" de "abaixo" dela.
 *
 * Aqui a POSIÇÃO é o instrumento certo, e não a chave: "acima da Receita Bruta" é uma
 * afirmação sobre a ORDEM do demonstrativo, e `linhas` já vem ordenada por `ordem` ASC.
 * (A regra do projeto de casar por chave e nunca por posição vale para IDENTIFICAR uma
 * linha entre payloads; aqui o que se quer é justamente a relação de ordem dentro de UM
 * payload.)
 *
 * `-1` quando a base não veio — e aí nenhuma linha tem AV, que é o fail-safe certo:
 * sem base, não há percentual a mostrar.
 */
export function indiceBaseAv(linhas: readonly DreLinha[]): number {
  return linhas.findIndex(l => l.chave === CHAVE_BASE_AV)
}

/** Meio centavo — o mesmo limiar que `fmtContabil` usa para tratar um valor como
 *  zero. Reaproveitado aqui para a base não ser "positiva" por um resíduo de float. */
const EPSILON = 0.005

/**
 * Valida a base (Receita Bruta de Vendas) de um período.
 *
 * `null` quando ausente, não-finita ou **≤ 0** (ver decisão 2 no topo) — e o `null`
 * é o que faz a coluna AV inteira daquele período virar travessão. Nunca lança.
 */
export function baseAv(rol: number | null | undefined): number | null {
  if (rol == null || !Number.isFinite(rol)) return null
  return rol < EPSILON ? null : rol
}

/**
 * AV de um valor sobre uma base já validada por `baseAv`.
 *
 * Devolve **percentual** com sinal algébrico preservado (despesa negativa → AV
 * negativa). `null` quando não há base válida ou o valor não é um número utilizável —
 * nunca `NaN` nem `Infinity`, por construção: a base é finita e ≥ meio centavo antes
 * da divisão, então o quociente de dois finitos é finito.
 */
export function avPercentual(
  valor: number | null | undefined,
  base: number | null,
): number | null {
  if (base == null) return null
  if (valor == null || !Number.isFinite(valor)) return null
  return (valor / base) * 100
}

/**
 * Localiza a linha-base (Receita Bruta de Vendas) num payload de `get_dre_mensal`.
 *
 * Casa por CHAVE, nunca por rótulo nem por posição: o rótulo mudou na própria v5.7.0
 * (`(=) RECEITA OPERACIONAL LÍQUIDA`) e a ordem é editável pela interface.
 */
export function linhaBaseAv(linhas: readonly DreLinha[]): DreLinha | undefined {
  return linhas.find(l => l.chave === CHAVE_BASE_AV)
}

const nfAv = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

/**
 * Formata a AV para a célula: 1 casa decimal, sufixo `%` e negativo entre PARÊNTESES —
 * a mesma convenção contábil dos valores da tabela, para o olho não precisar trocar de
 * gramática ao atravessar a linha.
 *
 * O `%` era omitido na primeira versão (o cabeçalho "AV" já diria), mas na tela o
 * número solto ao lado de uma coluna de reais lê como mais um valor — o sufixo é o que
 * o marca como percentual à primeira vista. Pedido do Yan na conferência.
 *
 * `null` → travessão. Zero vira `0,0%` (e não travessão): "esta linha não compõe a
 * receita" é uma informação, diferente de "não dá para calcular".
 */
export function fmtAv(pct: number | null): string {
  if (pct == null) return '–'
  const abs = `${nfAv.format(Math.abs(pct))}%`
  return pct < 0 ? `(${abs})` : abs
}
