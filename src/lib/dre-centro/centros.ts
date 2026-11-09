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

/** O que o seletor do card escolhe: um centro ou os centros lado a lado. A visão Empresa é a
 *  tabela de cima, separada (decisão do Yan no GATE 1) — não é opção aqui. */
export type SeletorCentro = CentroId | 'lado'

/** Pills do seletor. "Sem centro" NÃO tem pill própria (pedido do Yan no PR #311) — segue como coluna do Lado a
 *  lado, que é onde fecha a soma com a Empresa. */
export const OPCOES_SELETOR: readonly SeletorCentro[] = [...CENTROS.filter(c => c !== 'sem_centro'), 'lado']

export const ROTULO_SELETOR: Record<SeletorCentro, string> = {
  ...ROTULO_CENTRO,
  lado: 'Todos', // era "Lado a lado" (pedido do Yan no PR #311); o id interno segue `lado`
}

/** Abertura do card: os centros lado a lado (a comparação e o Quem cobre quem). */
export const SELETOR_INICIAL: SeletorCentro = 'lado'

/** Registro vazio por centro — ponto único de inicialização (nenhum centro esquecido). */
export function porCentro<T>(f: (c: CentroId) => T): Record<CentroId, T> {
  return Object.fromEntries(CENTROS.map(c => [c, f(c)])) as Record<CentroId, T>
}

export const zeros12 = (): number[] => Array.from({ length: 12 }, () => 0)
