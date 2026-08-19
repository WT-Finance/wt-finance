// ── Análise Vertical da DRE (v5.7.0) — módulo PURO ────────────────────────────
// AV = quanto cada linha do demonstrativo representa da **Receita Operacional
// Líquida do MESMO período**. É como a diretoria lê composição: "custo é 38% da
// receita" diz mais do que o valor absoluto, e permite comparar anos de tamanhos
// diferentes.
//
// DERIVADA, NUNCA BUSCADA. Não há RPC nova nem mudança de contrato: tudo sai do
// payload que a página já carrega (`get_dre_mensal`). Por isso este módulo é puro —
// sem React, sem rede, sem `Date` — e testável linha a linha.
//
// ── Três decisões que valem explicação ───────────────────────────────────────
//
// 1. **Devolve PERCENTUAL (7.9), não fração (0.079).** A regra do projeto de guardar
//    fração vale para o BANCO, onde um `/100` espalhado vira divergência silenciosa.
//    Aqui nada persiste, e a célula vizinha na mesma tabela (`CelulaDeltaPct`) já
//    trabalha em percentual: duas células de % lado a lado com unidades diferentes é
//    o risco real neste contexto. O nome da função crava a unidade.
//
// 2. **A base é a ROL, e ela precisa ser POSITIVA.** Com ROL ≤ 0 a razão inverte de
//    sinal e passa a dizer o contrário do que o leitor entende ("custo de −40%"),
//    então a coluna inteira daquele período vira travessão. Não é fail-safe genérico:
//    é a única leitura honesta.
//
// 3. **A AV se aplica a TODAS as linhas, inclusive as de cima da ROL.** Entrada de
//    Clientes sobre a ROL passa de 100% e isso é informação — o repasse é bruto e a
//    ROL é líquida. Truncar em 100% esconderia justamente a escala da intermediação.
//
// ── Aditividade ──────────────────────────────────────────────────────────────
// Antes do arredondamento a AV é perfeitamente aditiva: se os valores somam, as AVs
// somam (é uma divisão pela MESMA base). O teste trava isso.
// Na EXIBIÇÃO com 1 casa a soma da coluna pode fechar com ±0,1 p.p. de diferença —
// é inerente a arredondar cada linha, e **não se maquia**. É uma exceção consciente
// à lição da v5.5.0 (onde a soma cosmética venceu): ali o total era o número que
// alguém conferia; aqui o que se lê é a correção de CADA linha contra a ROL, e
// forçar o fechamento estragaria a linha para salvar a coluna.

import type { DreLinha } from './schemas'

/** Chave do bloco que serve de base à AV. Fica aqui para não virar string solta em
 *  três componentes — se um dia a base mudar (ex.: Receita Bruta), muda num lugar. */
export const CHAVE_BASE_AV = 'ROL'

/** Meio centavo — o mesmo limiar que `fmtContabil` usa para tratar um valor como
 *  zero. Reaproveitado aqui para a base não ser "positiva" por um resíduo de float. */
const EPSILON = 0.005

/**
 * Valida a base (ROL) de um período.
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
 * Localiza a linha-base (ROL) num payload de `get_dre_mensal`.
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
 * Formata a AV para a célula: **sem `%`** (o cabeçalho da coluna já diz "AV", e um
 * sufixo repetido em ~2 mil células é só ruído), 1 casa decimal, e negativo entre
 * PARÊNTESES — a mesma convenção contábil dos valores da tabela, para o olho não
 * precisar trocar de gramática ao atravessar a linha.
 *
 * `null` → travessão. Zero vira `0,0` (e não travessão): "esta linha não compõe a
 * receita" é uma informação, diferente de "não dá para calcular".
 */
export function fmtAv(pct: number | null): string {
  if (pct == null) return '–'
  const abs = nfAv.format(Math.abs(pct))
  return pct < 0 ? `(${abs})` : abs
}
