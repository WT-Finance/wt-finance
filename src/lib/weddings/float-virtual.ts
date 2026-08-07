// Curvas do Rendimento potencial do float dentro da janela do card (v5.5.0/M5).
//
// ── POR QUE ISTO NÃO É UM FATIAMENTO ─────────────────────────────────────────
// O saldo da conta virtual é COMPOSTO: cada mês rende sobre o saldo do mês
// anterior. Então o valor de um mês depende de onde a série COMEÇOU. O card de
// Fluxo de Caixa rebaseia todo acumulado na borda esquerda da janela sempre que o
// slider se move (`fatiarJanela`, v5.4.2) — e uma curva virtual pronta, recortada
// nessa mesma janela, carregaria juros acumulados de meses que não estão mais à
// vista. Ficaria errada em TODA posição do slider menos a default, e de um jeito
// que parece certo: a curva continua subindo, só que do lugar errado.
//
// Por isso o banco não devolve a curva pronta. Ele devolve a série de TAXAS
// (`get_taxas_cdi`), que é a mesma para toda operação e todo filtro, e é aqui que
// as duas curvas nascem — a partir do fluxo mensal que `fatiarJanela` já deriva.
// Consequência boa: arrastar o slider continua sendo puro cálculo local, sem
// refetch (invariante 7 do briefing).
import type { PontoJanela } from './janela-fluxo'

export interface PontoFloat {
  mes: string
  eh_futuro: boolean
  /** Saldo contábil, rebaseado na borda esquerda da janela. */
  saldo_real: number
  /** Saldo da conta virtual remunerada, semeado no MESMO ponto da borda. */
  saldo_virtual: number
  /** Rendimento gerado DENTRO da janela: `saldo_virtual − saldo_real`. */
  rendimento_acum: number
}

/**
 * Reconstrói as duas curvas a partir do fluxo mensal da janela e das taxas.
 *
 * As duas partem do MESMO valor na borda esquerda, então o gap começa em zero e o
 * que o gráfico mostra é o rendimento gerado dentro da janela visível — nunca o
 * total histórico da operação. É de propósito, e é o motivo de este número ser
 * MENOR do que a coluna "Rend. Float" da Lista, que mede a vida inteira.
 *
 * Devolve `[]` quando não há nenhuma taxa conhecida: sem taxa, as duas curvas
 * coincidiriam e o gráfico afirmaria "o float não rendeu nada" — que é falso, e
 * pior do que não desenhar.
 */
export function curvasFloat(
  pontos: readonly PontoJanela[],
  taxaPorMes: ReadonlyMap<string, number | null | undefined>,
): PontoFloat[] {
  if (pontos.length === 0) return []

  let algumaTaxa = false
  for (const p of pontos) {
    const t = taxaPorMes.get(p.mes)
    if (t != null) { algumaTaxa = true; break }
  }
  if (!algumaTaxa) return []

  const curvas: PontoFloat[] = []
  let saldoReal = 0
  let saldoVirtual = 0

  pontos.forEach((p, i) => {
    if (i === 0) {
      // Semeadura: as duas curvas começam iguais, no saldo real da borda.
      saldoReal = p.resultado_mes
      saldoVirtual = p.resultado_mes
    } else {
      // Juro do mês incide sobre o saldo virtual do mês ANTERIOR — o fluxo do
      // próprio mês entra depois, sem render nele. Mesma convenção da RPC
      // (analytics.vw_rendimento_float_operacao); divergir aqui faria o gráfico
      // discordar da coluna e do drawer.
      const taxa = taxaPorMes.get(p.mes) ?? 0
      saldoVirtual = saldoVirtual * (1 + taxa) + p.resultado_mes
      saldoReal = saldoReal + p.resultado_mes
    }
    curvas.push({
      mes: p.mes,
      eh_futuro: p.eh_futuro,
      saldo_real: saldoReal,
      saldo_virtual: saldoVirtual,
      rendimento_acum: saldoVirtual - saldoReal,
    })
  })

  return curvas
}

/** Rendimento gerado na janela inteira (o gap no último mês visível). */
export function rendimentoDaJanela(curvas: readonly PontoFloat[]): number {
  return curvas.length ? curvas[curvas.length - 1].rendimento_acum : 0
}
