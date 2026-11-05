// Carimbos de data da página "Financeiro · Geral" (v6.4.0; por fonte na v6.5.0) — módulo PURO.
//
// A data de atualização de cada BASE vai para o TOPO da página, no formato padrão da plataforma (uma linha por
// fonte: "<Fonte> · Última atualização em <data>", como a DRE e Weddings). Aqui se decide quais fontes e qual
// data; a exibição é de `UltimaAtualizacao` (`fmtDataHoraLongoSP` — nunca split de string: o dia erra perto da
// meia-noite). Timestamps (timestamptz, com offset) ficam em ISO.

import { dadosCarregados } from './composicao'
import type { DadosGeral } from './tipos'

/** Nomes das fontes no topo. "Caixa" é o mesmo nome que a DRE dá à base do regime de caixa (fato_fluxo). */
export const FONTE_CONTAS_A_RECEBER = 'Contas a receber'
export const FONTE_CAIXA = 'Caixa'
export const FONTE_ANTECIPACOES = 'Antecipações'

/** Uma linha do topo: a fonte e o instante da última atualização dela. */
export interface CarimboFonte {
  fonte: string
  iso: string
}

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

/**
 * As linhas "Última atualização" do topo, nesta ordem: Contas a receber (gravação da última carga), Caixa
 * (prejuízos: o `atualizado_em` mais recente de todas as leituras carregadas — as dos anos selecionados, as do
 * gráfico mensal e a do ano corrente) e
 * Antecipações (idem). Fonte sem data — não carregou, ou ainda não tem registro — NÃO aparece.
 */
export function carimbosDaPagina(d: DadosGeral): CarimboFonte[] {
  const contas = d.recebiveis.ok ? d.recebiveis.dados.carga?.gravado_em ?? null : null
  const caixa = carimboDoFluxo([
    ...dadosCarregados(d.prejuizos).map(x => x.dados),
    ...dadosCarregados(d.prejuizosMensal).map(x => x.dados),
    ...dadosCarregados([d.corrente.prejuizos]).map(x => x.dados),
  ])
  const antecipacoes = carimboDoFluxo([
    ...dadosCarregados(d.antecipacoes).map(x => x.dados),
    ...dadosCarregados([d.corrente.antecipacoes]).map(x => x.dados),
  ])

  const fontes: { fonte: string; iso: string | null }[] = [
    { fonte: FONTE_CONTAS_A_RECEBER, iso: carimboMaisRecente([contas]) },
    { fonte: FONTE_CAIXA, iso: caixa },
    { fonte: FONTE_ANTECIPACOES, iso: antecipacoes },
  ]
  return fontes.flatMap(f => (f.iso ? [{ fonte: f.fonte, iso: f.iso }] : []))
}
