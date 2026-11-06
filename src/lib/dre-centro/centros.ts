// ── Centros de custo da DRE de caixa (v6.5.1) — módulo PURO ──────────────────
//
// Os centros vêm do relatório "Lançamentos por Centro de Custo" do Monde (D1–D7 da M0).
// "Sem centro" é coluna VISÍVEL e nunca redistribuída: lançamento sem centro se resolve no
// Monde, no próprio lançamento. O CSC é um centro próprio; o rateio dele entre as unidades
// é fronteira (§11 do briefing).

export const CENTROS = ['trips', 'weddings', 'corp', 'csc', 'sem_centro'] as const
export type CentroId = (typeof CENTROS)[number]

export const ROTULO_CENTRO: Record<CentroId, string> = {
  trips:      'Trips',
  weddings:   'Weddings',
  corp:       'Corp',
  csc:        'CSC',
  sem_centro: 'Sem centro',
}

/** Centros que podem TOMAR uma antecipação (§3.4: "todos, menos Sem centro"). Mudar esta
 *  lista é decisão de produto — volta ao Chat. */
export const CENTROS_ELEGIVEIS_DEFICIT: readonly CentroId[] = ['trips', 'weddings', 'corp', 'csc']

/** O que o seletor da página escolhe: a DRE de hoje (`empresa`, o padrão), um centro, ou os
 *  centros lado a lado. */
export type SeletorCentro = 'empresa' | CentroId | 'lado'

export const OPCOES_SELETOR: readonly SeletorCentro[] = ['empresa', ...CENTROS, 'lado']

export const ROTULO_SELETOR: Record<SeletorCentro, string> = {
  empresa: 'Empresa',
  ...ROTULO_CENTRO,
  lado: 'Lado a lado',
}

/** `?centro=` → opção do seletor. Ausente, vazio ou desconhecido = `empresa`: a URL de hoje
 *  continua abrindo exatamente a DRE de hoje. */
export function seletorDaUrl(v: string | string[] | undefined): SeletorCentro {
  const s = Array.isArray(v) ? v[0] : v
  return (OPCOES_SELETOR as readonly string[]).includes(s ?? '') ? (s as SeletorCentro) : 'empresa'
}

/** Registro vazio por centro — ponto único de inicialização (nenhum centro esquecido). */
export function porCentro<T>(f: (c: CentroId) => T): Record<CentroId, T> {
  return Object.fromEntries(CENTROS.map(c => [c, f(c)])) as Record<CentroId, T>
}

export const zeros12 = (): number[] => Array.from({ length: 12 }, () => 0)
