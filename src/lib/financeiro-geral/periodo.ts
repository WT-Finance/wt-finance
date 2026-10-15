// Anos e recortes da página "Financeiro · Geral" (v6.4.0) — módulo PURO, sem I/O nem React.
//
// A seleção de anos reaproveita `@/lib/marketing/anos` e `@/lib/marketing/periodo` SEM mover nada
// (inv. 9: nada fora da página muda; D7 do plano — não há componente de pills compartilhado). Aqui
// ficam só as duas diferenças desta página:
//
//  • As RPCs do Geral NÃO devolvem `anosDisponiveis`, então a lista de pills é uma janela fixa: do
//    primeiro ano com dado até o ano corrente em São Paulo.
//  • O RECORTE de cada ano (para o `*` de ano parcial) vem da PRÓPRIA RPC (`relacao` + `mes_corrente`),
//    a fonte que já decidiu o que é realizado — não de `hoje` recalculado no cliente.

import { anosDaUrl, resolverAnos, type ParamsAnos } from '@/lib/marketing/anos'
import {
  MESES_ABREV, recorteParcial, rotuloAnoNoTotal, rotuloRecorte, type Recorte,
} from '@/lib/marketing/periodo'

/** Primeiro ano com dado na página: o Realizado da DRE de caixa e o registro de antecipações
 *  começam em 2024 (invariante 7 do briefing; M0). Ano anterior a este é ausência, não zero. */
export const PRIMEIRO_ANO = 2024

/** As pills de ano: PRIMEIRO_ANO..anoCorrente, crescente. */
export function anosDasPillsGeral(anoCorrente: number): number[] {
  const n = Math.max(1, anoCorrente - PRIMEIRO_ANO + 1)
  return Array.from({ length: n }, (_, i) => PRIMEIRO_ANO + i)
}

/** A seleção final: `?anos=` (ou `?ano=`) filtrada pelas pills; sem nada válido, o default da casa
 *  (os 3 últimos anos até o corrente — mesmo critério da página de Marketing). */
export function anosSelecionados(params: ParamsAnos, anoCorrente: number): number[] {
  return resolverAnos(anosDaUrl(params, anoCorrente), anosDasPillsGeral(anoCorrente), anoCorrente)
}

/** O que a RPC de fluxo diz do ano: fechado, corrente (até `mes_corrente`) ou futuro. */
export interface RelacaoDoAno {
  relacao: 'fechado' | 'corrente' | 'futuro'
  mes_corrente: number | null
}

/** O recorte de meses REALIZADOS do ano: jan–dez (fechado), jan até o mês corrente (corrente), ou só
 *  jan (futuro — nada aconteceu; a UI não oferece a pill, mas a conta não pode inventar um mês). */
export function recorteDaLeitura({ relacao, mes_corrente }: RelacaoDoAno): Recorte {
  if (relacao === 'fechado') return { mesIni: 1, mesFim: 12 }
  if (relacao === 'futuro') return { mesIni: 1, mesFim: 1 }
  const fim = mes_corrente ?? 12
  return { mesIni: 1, mesFim: Math.min(12, Math.max(1, fim)) }
}

/** "2026*" quando o ano é parcial; "2025" num ano inteiro. */
export function rotuloDoAno(ano: number, r: RelacaoDoAno): string {
  return rotuloAnoNoTotal(ano, recorteDaLeitura(r))
}

/** "jan–out" para o ano parcial; `null` no ano inteiro. */
export function recorteTexto(r: RelacaoDoAno): string | null {
  const rec = recorteDaLeitura(r)
  return recorteParcial(rec) ? rotuloRecorte(rec) : null
}

/** "2025 (jan–out)" / "2025" — a referência do Δ ("vs 2025 (jan–out)"): o ano anterior no MESMO recorte. */
export function rotuloReferencia(anoAnterior: number, r: RelacaoDoAno): string {
  const txt = recorteTexto(r)
  return txt ? `${anoAnterior} (${txt})` : String(anoAnterior)
}

/** Meses (1..12) que o ano já realizou — para esconder o que ainda não aconteceu (`null`, nunca 0). */
export function mesesRealizados(r: RelacaoDoAno): number {
  return recorteDaLeitura(r).mesFim
}

/** "jan" … "dez" no rótulo de um eixo. */
export const ROTULOS_MES = MESES_ABREV
