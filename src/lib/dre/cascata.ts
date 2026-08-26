// ── Vocabulário comum das cascatas da DRE (v5.8.1) — módulo PURO ──────────────
// Os dois cards novos ("Decomposição da variação" e "Ponte Competência ↔ Caixa") são
// a MESMA figura: uma âncora, uma sequência de degraus que a movem, e outra âncora.
// O tipo mora aqui para que os dois módulos de cálculo e o primitivo de gráfico falem
// exatamente a mesma língua — tipo estruturalmente duplicado entre componentes é a
// receita do drift silencioso (a lição que já pôs `ConsolidadoAno` em `schemas.ts`).
//
// Tudo em CENTAVOS INTEIROS até a borda de exibição (ver `folhas.ts`).

/** Piso de exibição: degrau com |Δ| abaixo disto é agrupado no residual.
 *
 *  R$ 500 em centavos. Uma cascata com quinze degraus de dois dígitos deixa de ser
 *  leitura e vira escadinha — e o que se perde ao agrupá-los é nada, porque eles
 *  continuam somados no residual. A constante é ÚNICA para as duas cascatas de
 *  propósito: dois thresholds diferentes na mesma tela seriam duas réguas. */
export const THRESHOLD_AGRUPAMENTO = 50_000

/** Rótulo do balde que fecha a identidade. Único, pelo mesmo motivo. */
export const ROTULO_RESIDUAL = 'Outros ajustes'

export interface Ancora {
  rotulo: string
  /** Centavos inteiros. */
  valor: number
  /** Anotação sob a âncora (ex.: "Δ capital de giro: +216.246,06"). */
  nota?: string
}

export interface Degrau {
  rotulo: string
  /** Centavos inteiros, COM sinal: o quanto este degrau move a âncora. */
  delta: number
  /** Frase curta que explica o degrau, exibida no tooltip. Gerada por regra
   *  (natureza × sinal), nunca escrita à mão por linha — ver `ponte-regimes.ts`. */
  narrativa: string
  /** Verdadeiro só no balde residual, que é desenhado em cor neutra: ele não é um
   *  fato econômico, é o que sobrou. */
  residual?: boolean
}

export interface Cascata {
  inicial: Ancora
  degraus: Degrau[]
  final: Ancora
  /** `inicial + Σ degraus === final`, em centavos inteiros.
   *
   *  É verdadeiro por CONSTRUÇÃO em ambas as cascatas (ver a identidade provada em
   *  `folhas.ts`); o campo existe para o componente poder degradar em vez de mentir
   *  caso um payload torto quebre a premissa, e para o teste ter o que afirmar. */
  fecha: boolean
}

/** Fecha a cascata: ordena o residual por último, calcula `fecha` e devolve o objeto.
 *
 *  O residual é SEMPRE o último degrau, mesmo quando é grande: ele é o "e o resto",
 *  e um "resto" no meio da sequência lê como categoria. */
export function montarCascata(
  inicial: Ancora,
  degraus: Degrau[],
  final: Ancora,
): Cascata {
  const ordenados = [...degraus.filter(d => !d.residual), ...degraus.filter(d => d.residual)]
  const soma = ordenados.reduce((s, d) => s + d.delta, 0)
  return { inicial, degraus: ordenados, final, fecha: inicial.valor + soma === final.valor }
}

/** Agrupa os degraus sub-threshold num único residual, preservando a identidade.
 *
 *  Recebe os degraus já calculados mais o residual estrutural (o que não pareou), e
 *  devolve a lista final. O agrupamento nunca descarta valor — o que sai da lista
 *  entra no residual, então `Σ` é invariante. */
export function agruparPequenos(degraus: Degrau[], residualEstrutural: number): Degrau[] {
  const grandes: Degrau[] = []
  let resto = residualEstrutural

  for (const d of degraus) {
    if (Math.abs(d.delta) < THRESHOLD_AGRUPAMENTO) resto += d.delta
    else grandes.push(d)
  }

  // O residual só aparece quando tem corpo. Um degrau de R$ 0,00 rotulado "Outros
  // ajustes" sugere que existe algo ali — quando a árvore pareia inteira (o caso de
  // hoje), o card fica mais honesto sem a linha.
  if (resto === 0) return grandes

  return [...grandes, {
    rotulo:    ROTULO_RESIDUAL,
    delta:     resto,
    narrativa: 'demais descasamentos e contas fora dos blocos comuns',
    residual:  true,
  }]
}
