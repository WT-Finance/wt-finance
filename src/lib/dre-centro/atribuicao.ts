import { CENTROS, CENTROS_ELEGIVEIS_DEFICIT, porCentro, zeros12, type CentroId } from './centros'
import type { RecebivelAntecipado } from './tipos'

// ── Quem tomou a antecipação (§3.4 do briefing v6.5.1) — módulo PURO ─────────
//
// Entrada: o resultado operacional de caixa de cada centro por mês (o REX da árvore
// operacional, que JÁ tem os recebíveis antecipados devolvidos ao mês do vencimento e o centro
// dono, e não tem a taxa), os recebíveis antecipados identificados e a taxa lançada no Monde.
//
// Saída: as três linhas do bloco de antecipação por centro e as linhas de memória.
//
//   saldo operacional acumulado  s_c(m) = Σ_{k≤m} op_c(k)            (fim do mês m)
//   peso no mês m                w_c(m) = max(0, −s_c(m)) / Σ_elegíveis max(0, −s(m))
//                                — nenhum negativo ⇒ o mix dos DONOS dos recebíveis do mês
//   C_c(m)    = antecipado(m) × w_c(m)
//   D_c(v)    = −Σ_a recebível(a→v) × w_c(a)       (o D acompanha o C: pesos do mês a)
//   taxa_c(m) = taxa do Monde(m) × w_c(m)          — mês SEM antecipação identificada: a taxa
//                                                    fica no centro em que o Monde a lançou
//
// Identidades (testadas): Σ_c w_c(m) = 1 nos meses com antecipação; Σ_c C = antecipado;
// Σ_c taxa = taxa do Monde; por mês, Σ_c (op + C + D + taxa) = Σ_c op + antecipado − vencido
// + taxa. Recebível com vencimento depois do ano: o C aparece, o D não — a diferença é a
// "antecipação tomada e ainda não devolvida".
//
// Valores em reais, sem arredondar: a tela arredonda na exibição. A paridade ao centavo com
// a visão Empresa (inv. 1) é da M3, contra o banco.

export interface EntradaAtribuicao {
  /** REX da árvore operacional por centro, 12 meses. */
  operacional: Record<CentroId, number[]>
  recebiveis: readonly RecebivelAntecipado[]
  /** Taxa de antecipação do Monde, por mês, no centro em que foi lançada (negativa). */
  taxaMonde: Record<CentroId, number[]>
}

export interface Atribuicao {
  /** Peso de cada centro no mês; `null` = mês sem antecipação identificada. */
  pesos: Array<Record<CentroId, number> | null>
  /** `deficit` = havia centro negativo; `donos` = ninguém negativo, ficou com os donos. */
  criterio: Array<'deficit' | 'donos' | null>
  c: Record<CentroId, number[]>
  d: Record<CentroId, number[]>
  taxa: Record<CentroId, number[]>
  /** Memória: recebíveis do próprio centro cedidos para antecipação (soma no período). */
  cedidos: Record<CentroId, number[]>
  /** Memória: saldos acumulados no fim de cada mês (no período, vale o do fim). */
  saldoOperacional: Record<CentroId, number[]>
  saldoCaixa: Record<CentroId, number[]>
  /** Antecipado no ano cujo vencimento cai depois de dezembro (C sem D no ano). */
  naoDevolvidoNoAno: number
}

function acumular(v: readonly number[]): number[] {
  return v.reduce<number[]>((acc, x) => [...acc, (acc.at(-1) ?? 0) + x], [])
}

/** Pesos de um mês: proporcionais ao déficit dos elegíveis; sem déficit, ao mix dos donos. */
function pesosDoMes(
  saldoOp: Record<CentroId, number[]>,
  m: number,
  donosDoMes: Record<CentroId, number>,
): { pesos: Record<CentroId, number>; criterio: 'deficit' | 'donos' } {
  const deficit = porCentro(c =>
    CENTROS_ELEGIVEIS_DEFICIT.includes(c) ? Math.max(0, -saldoOp[c][m]) : 0,
  )
  const totalDeficit = CENTROS.reduce((s, c) => s + deficit[c], 0)
  if (totalDeficit > 0) {
    return { pesos: porCentro(c => deficit[c] / totalDeficit), criterio: 'deficit' }
  }
  const totalDonos = CENTROS.reduce((s, c) => s + donosDoMes[c], 0)
  return { pesos: porCentro(c => donosDoMes[c] / totalDonos), criterio: 'donos' }
}

export function atribuirAntecipacoes(e: EntradaAtribuicao): Atribuicao {
  const saldoOperacional = porCentro(c => acumular(e.operacional[c]))

  const cedidos = porCentro(() => zeros12())
  for (const r of e.recebiveis) {
    if (r.mesAntecipacao >= 1 && r.mesAntecipacao <= 12) cedidos[r.dono][r.mesAntecipacao - 1] += r.valor
  }

  const pesos: Atribuicao['pesos'] = []
  const criterio: Atribuicao['criterio'] = []
  for (let m = 0; m < 12; m++) {
    const donosDoMes = porCentro(c => cedidos[c][m])
    const antecipado = CENTROS.reduce((s, c) => s + donosDoMes[c], 0)
    if (antecipado > 0) {
      const p = pesosDoMes(saldoOperacional, m, donosDoMes)
      pesos.push(p.pesos)
      criterio.push(p.criterio)
    } else {
      pesos.push(null)
      criterio.push(null)
    }
  }

  const c = porCentro(() => zeros12())
  const d = porCentro(() => zeros12())
  let naoDevolvidoNoAno = 0
  for (const r of e.recebiveis) {
    const w = pesos[r.mesAntecipacao - 1]
    if (!w) continue
    for (const k of CENTROS) {
      c[k][r.mesAntecipacao - 1] += r.valor * w[k]
      if (r.mesVencimento <= 12) d[k][r.mesVencimento - 1] -= r.valor * w[k]
    }
    if (r.mesVencimento > 12) naoDevolvidoNoAno += r.valor
  }

  const taxa = porCentro(() => zeros12())
  for (let m = 0; m < 12; m++) {
    const w = pesos[m]
    const totalMes = CENTROS.reduce((s, k) => s + e.taxaMonde[k][m], 0)
    for (const k of CENTROS) taxa[k][m] = w ? totalMes * w[k] : e.taxaMonde[k][m]
  }

  const saldoCaixa = porCentro(k =>
    acumular(e.operacional[k].map((op, m) => op + c[k][m] + d[k][m] + taxa[k][m])),
  )

  return { pesos, criterio, c, d, taxa, cedidos, saldoOperacional, saldoCaixa, naoDevolvidoNoAno }
}

// ── Quem cobre quem (seção 9 do protótipo) ───────────────────────────────────
// Posição acumulada no fim de cada mês. Usos = o déficit dos centros com saldo operacional
// negativo. Fontes = o saldo dos centros positivos + os recebíveis já antecipados e ainda não
// vencidos (por dono) − as taxas pagas + o caixa que a empresa já tinha (o que falta para
// fechar: −saldo de caixa acumulado da empresa). Usos ≡ fontes POR CONSTRUÇÃO — a linha de
// conferência é zero, e o teste prova.

export interface QuemCobreQuem {
  deficit: Record<CentroId, number[]>
  positivos: Record<CentroId, number[]>
  recebiveisNaoVencidos: Record<CentroId, number[]>
  taxasPagas: number[]
  caixaPrevio: number[]
  totalUsos: number[]
  totalFontes: number[]
}

export function quemCobreQuem(e: EntradaAtribuicao, a: Atribuicao): QuemCobreQuem {
  const deficit = porCentro(k => a.saldoOperacional[k].map(s => Math.max(0, -s)))
  const positivos = porCentro(k => a.saldoOperacional[k].map(s => Math.max(0, s)))
  const recebiveisNaoVencidos = porCentro(() => zeros12())
  for (const r of e.recebiveis) {
    for (let m = r.mesAntecipacao; m < Math.min(r.mesVencimento, 13); m++) {
      recebiveisNaoVencidos[r.dono][m - 1] += r.valor
    }
  }
  const taxasPagas = acumular(Array.from({ length: 12 }, (_, m) => CENTROS.reduce((s, k) => s + a.taxa[k][m], 0)))
  const caixaPrevio = Array.from({ length: 12 }, (_, m) => -CENTROS.reduce((s, k) => s + a.saldoCaixa[k][m], 0))
  const somaCentros = (r: Record<CentroId, number[]>, m: number) => CENTROS.reduce((s, k) => s + r[k][m], 0)
  const totalUsos = Array.from({ length: 12 }, (_, m) => somaCentros(deficit, m))
  const totalFontes = Array.from({ length: 12 }, (_, m) =>
    somaCentros(positivos, m) + somaCentros(recebiveisNaoVencidos, m) + taxasPagas[m] + caixaPrevio[m],
  )
  return { deficit, positivos, recebiveisNaoVencidos, taxasPagas, caixaPrevio, totalUsos, totalFontes }
}
