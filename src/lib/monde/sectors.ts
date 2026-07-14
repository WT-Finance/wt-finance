// Mapa MICRO → MACRO dos setores do Monde (v5.1.2 — Ingestão Monde). Nomes INTERNOS
// (não de exibição — a camada de UI resolve o rótulo, se precisar). O micro vem do
// custom_field `name==="Setor"` da venda (lista ou detalhe).
//
// `Welcome` é EXCLUÍDO (emissões internas — decisão de produto do briefing v5.1.2,
// ver transform.ts). Micro fora deste mapa (desconhecido) também não tem macro —
// a venda é excluída da ingestão, não classificada às cegas.

export type SetorMacro = 'Lazer' | 'Weddings' | 'Corporativo'

/** Nome do micro-setor "Welcome" — emissões internas, sempre excluídas da ingestão. */
export const SETOR_WELCOME = 'Welcome'

export const MICRO_MACRO: Record<string, SetorMacro> = {
  Lazer: 'Lazer',
  'Expedições': 'Lazer',
  WedMe: 'Weddings',
  Weddings: 'Weddings',
  'Planejamento-WED': 'Weddings',
  'Produção': 'Weddings',
  Corporativo: 'Corporativo',
}

/**
 * Resolve o macro-setor a partir do micro. `Welcome` e micro desconhecido → `null`
 * (a venda é excluída da ingestão — ver `transformSale` em `transform.ts`).
 */
export function setorMacro(micro: string | null | undefined): SetorMacro | null {
  if (!micro) return null
  if (micro === SETOR_WELCOME) return null
  return MICRO_MACRO[micro] ?? null
}
