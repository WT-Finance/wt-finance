// ── Centros de custo da DRE de caixa (v6.5.1) — módulo PURO ──────────────────
//
// Os centros vêm do relatório "Lançamentos por Centro de Custo" do Monde (D1–D7 da M0).
// "Sem centro" é coluna VISÍVEL e nunca redistribuída: lançamento sem centro se resolve no
// Monde, no próprio lançamento. O CSC é um centro próprio; o rateio dele entre as unidades
// é fronteira (§11 do briefing).

/** Ordem canônica de exibição (pills, colunas, Quem cobre quem, Exportar): CSC primeiro (pedido do Yan no PR #311).
 *  Nenhum cálculo depende da ordem — a atribuição só soma por centro e os dados vêm por chave. */
export const CENTROS = ['csc', 'trips', 'weddings', 'corp', 'sem_centro'] as const
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
export const CENTROS_ELEGIVEIS_DEFICIT: readonly CentroId[] = ['csc', 'trips', 'weddings', 'corp']

/** Abertura do card: um centro ou todos (id `lado`, rótulo "Todos"). A visão Empresa é a tabela de cima,
 *  separada (decisão do Yan no GATE 1) — não é opção aqui. */
export type SeletorCentro = CentroId | 'lado'

/** Centros com pill no seletor, marcáveis CUMULATIVAMENTE (pedido do Yan no PR #311). "Sem centro" NÃO tem pill
 *  própria — é coluna do "Todos", que é onde fecha a soma com a Empresa. As quatro marcadas = "Todos". */
export const CENTROS_SELECIONAVEIS = ['csc', 'trips', 'weddings', 'corp'] as const
export type CentroSelecionavel = (typeof CENTROS_SELECIONAVEIS)[number]

/** Seleção inicial a partir da abertura pedida: 'lado' (ou "Sem centro", que não tem pill) = todas marcadas. */
export function selecaoInicial(s: SeletorCentro | readonly CentroSelecionavel[]): ReadonlySet<CentroSelecionavel> {
  if (Array.isArray(s)) return new Set(s.length > 0 ? s : CENTROS_SELECIONAVEIS)
  const unico = CENTROS_SELECIONAVEIS.find(c => c === s)
  return new Set(unico ? [unico] : CENTROS_SELECIONAVEIS)
}

/** Marca/desmarca um centro; a seleção nunca fica vazia (o último marcado não sai). Com "Todos" aceso (os quatro
 *  marcados), o clique marca SÓ aquele centro e desmarca os outros (decisão do Yan no PR #311). */
export function alternarCentro(sel: ReadonlySet<CentroSelecionavel>, c: CentroSelecionavel): ReadonlySet<CentroSelecionavel> {
  if (CENTROS_SELECIONAVEIS.every(x => sel.has(x))) return new Set([c])
  const s = new Set(sel)
  if (!s.has(c)) s.add(c)
  else if (s.size > 1) s.delete(c)
  return s
}

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
