// Carimbos de data da página "Financeiro · Geral" (v6.4.0) — módulo PURO.
//
// Cada seção mostra a PRÓPRIA data (inv. 8) — carga, último registro, foto —, e o cabeçalho mostra o
// "Última atualização" da página: o carimbo mais recente entre as fontes que carregaram. Timestamps
// (timestamptz, com offset) ficam em ISO; a exibição é sempre por `fmtDataSP`/`UltimaAtualizacao`
// (nunca split de string — o dia erra perto da meia-noite).

import { dadosCarregados } from './composicao'
import type { DadosGeral } from './tipos'

/** O mais recente de uma lista de timestamps ISO; ignora nulos e valores que não são data. */
export function carimboMaisRecente(isos: readonly (string | null | undefined)[]): string | null {
  let melhor: { iso: string; t: number } | null = null
  for (const iso of isos) {
    if (!iso) continue
    const t = Date.parse(iso)
    if (Number.isNaN(t)) continue
    if (melhor === null || t > melhor.t) melhor = { iso, t }
  }
  return melhor?.iso ?? null
}

/** O carimbo das leituras de fluxo (por ano): o mais recente entre os anos que carregaram. */
export function carimboDoFluxo(leituras: readonly { atualizado_em: string | null }[]): string | null {
  return carimboMaisRecente(leituras.map(l => l.atualizado_em))
}

/** "Última atualização" do cabeçalho: antecipações (último registro), fato_fluxo (prejuízos e custos) e
 *  a gravação da última carga de contas a receber. Prazos entra pela foto (data pura, sem hora) e fica
 *  fora: misturar data pura com timestamptz inventaria uma hora. */
export function carimboGeral(d: DadosGeral): string | null {
  return carimboMaisRecente([
    d.recebiveis.ok ? d.recebiveis.dados.carga?.gravado_em : null,
    carimboDoFluxo(dadosCarregados(d.antecipacoes).map(x => x.dados)),
    carimboDoFluxo(dadosCarregados(d.prejuizos).map(x => x.dados)),
    carimboDoFluxo(dadosCarregados(d.custos).map(x => x.dados)),
  ])
}
