// Janela ajustável do Fluxo de Caixa de Weddings (v5.4.2/M0–M3).
//
// A RPC `get_acumulado_weddings` devolve UMA janela larga fixa (48 meses atrás +
// 36 à frente) e o cliente FATIA. Arrastar o slider é instantâneo porque não há
// refetch — e a janela larga cabe folgada nos limites que a própria RPC já impõe
// (`LEAST(GREATEST(p_meses_passados,1),120)` e `...,60)` na migration 0141), então
// alargar não exigiu migration nenhuma.
//
// ── O REINÍCIO DO ACUMULADO ────────────────────────────────────────────────────
// A RPC acumula desde o início da janela LARGA. Se a série fosse exibida crua, os
// acumulados dentro de uma janela estreita já chegariam "cheios" de história
// anterior, e a leitura viraria outra coisa. Então TODO elemento acumulado é
// rebaseado na borda esquerda da janela visível:
//
//     valor_rebaseado[i] = acum[i] − acum[esquerda − 1]
//
// Vale para entradas acumuladas, saídas acumuladas E a referência de saídas —
// juntos, nunca um sem o outro (invariante 3 do briefing): com o acumulado
// reiniciando, uma referência absoluta sairia de escala e achataria o gráfico.
//
// ── POR QUE A BORDA NUNCA ENCOSTA NO INÍCIO DOS DADOS ──────────────────────────
// Rebasear e derivar o valor MENSAL exigem o mês ANTERIOR ao primeiro mês visível.
// Por isso `maxAtras` reserva um mês de margem: a esquerda da janela nunca pousa no
// primeiro mês buscado. Isso corrige de quebra um defeito latente do gráfico mensal
// antigo, que fazia `prev = {0,0}` no índice 0 — a primeira barra visível absorvia
// silenciosamente TODA a história anterior à janela.

/**
 * A janela LARGA pedida à RPC, buscada uma vez. Fica folgada dentro dos limites
 * que a própria `get_acumulado_weddings` impõe (120 atrás / 60 à frente, migration
 * 0141) — é por isso que alargar a janela NÃO exigiu migration: ela sempre foi
 * parâmetro do chamador.
 */
export const JANELA_LARGA_ATRAS  = 48
export const JANELA_LARGA_FRENTE = 36

/** Um mês como a RPC devolve: acumulados desde o início da janela larga. */
export interface MesAcumulado {
  mes:          string
  eh_futuro:    boolean
  entrada_acum: number
  saida_acum:   number
}

/** Um mês já fatiado: acumulado rebaseado na borda + o valor do próprio mês. */
export interface PontoJanela {
  mes:           string
  eh_futuro:     boolean
  /** Acumulado de entradas reiniciado na borda esquerda da janela. */
  entrada_acum:  number
  /** Acumulado de saídas reiniciado na borda esquerda da janela. */
  saida_acum:    number
  /** Entrada do próprio mês (derivada da diferença de acumulados). */
  entrada_mes:   number
  /** Saída do próprio mês. */
  saida_mes:     number
  /** Resultado do próprio mês: entrada − saída. */
  resultado_mes: number
}

export interface Janela {
  pontos: PontoJanela[]
  /** Total de saídas previsto DENTRO da janela (a referência recalculada). */
  totalSaidasJanela: number
  /** `mes` do mês corrente, quando ele está visível — a marca do "hoje". */
  mesHoje: string | null
  /** Quantos meses para trás a janela pode ir (já reservando a margem de 1 mês). */
  maxAtras: number
  /** Quantos meses para frente a janela pode ir. */
  maxFrente: number
}

/** Índice do mês corrente na série (o 1º `eh_futuro`); −1 se a série não o contém. */
export function indiceHoje(meses: readonly MesAcumulado[]): number {
  return meses.findIndex(m => m.eh_futuro)
}

/**
 * Limites do slider. `maxAtras` reserva 1 mês de margem à esquerda (ver o cabeçalho):
 * sem essa margem não há mês anterior para rebasear nem para derivar o valor mensal.
 */
export function limitesJanela(meses: readonly MesAcumulado[]): { maxAtras: number; maxFrente: number } {
  const idx = indiceHoje(meses)
  if (idx < 0) return { maxAtras: Math.max(0, meses.length - 1), maxFrente: 0 }
  return {
    maxAtras:  Math.max(0, idx - 1),
    maxFrente: Math.max(0, meses.length - 1 - idx),
  }
}

const clamp = (v: number, min: number, max: number) =>
  Math.min(Math.max(Number.isFinite(v) ? Math.round(v) : min, min), max)

/**
 * Fatia a série larga na janela [hoje − mesesAtras, hoje + mesesFrente], rebaseando
 * todo acumulado na borda esquerda e derivando os valores mensais.
 *
 * Nunca lança: série vazia (ou curta demais para ter um mês de margem) devolve uma
 * janela vazia com totais em zero.
 */
export function fatiarJanela(
  meses: readonly MesAcumulado[],
  mesesAtras: number,
  mesesFrente: number,
): Janela {
  const { maxAtras, maxFrente } = limitesJanela(meses)
  const vazia: Janela = { pontos: [], totalSaidasJanela: 0, mesHoje: null, maxAtras, maxFrente }

  const idxHoje = indiceHoje(meses)
  if (meses.length < 2 || idxHoje < 1) return vazia

  const atras  = clamp(mesesAtras,  0, maxAtras)
  const frente = clamp(mesesFrente, 0, maxFrente)

  const esquerda = idxHoje - atras
  const direita  = Math.min(idxHoje + frente, meses.length - 1)
  if (esquerda < 1 || direita < esquerda) return vazia

  // A base do rebase: o mês IMEDIATAMENTE anterior à janela visível.
  const base = meses[esquerda - 1]

  const pontos: PontoJanela[] = []
  for (let i = esquerda; i <= direita; i++) {
    const m = meses[i]
    const anterior = meses[i - 1]
    const entrada_mes = m.entrada_acum - anterior.entrada_acum
    const saida_mes   = m.saida_acum   - anterior.saida_acum
    pontos.push({
      mes:           m.mes,
      eh_futuro:     m.eh_futuro,
      entrada_acum:  m.entrada_acum - base.entrada_acum,
      saida_acum:    m.saida_acum   - base.saida_acum,
      entrada_mes,
      saida_mes,
      resultado_mes: entrada_mes - saida_mes,
    })
  }

  // A referência "Total previsto de saídas NA JANELA": as saídas acumuladas do
  // último mês visível, já rebaseadas — ou seja, a soma das saídas da janela.
  const totalSaidasJanela = pontos.length ? pontos[pontos.length - 1].saida_acum : 0

  return {
    pontos,
    totalSaidasJanela,
    mesHoje: meses[idxHoje] && idxHoje >= esquerda && idxHoje <= direita ? meses[idxHoje].mes : null,
    maxAtras,
    maxFrente,
  }
}
