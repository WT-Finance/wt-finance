// Cor de cada ano nos gráficos de "Despesas de Marketing" (v6.3.0) — módulo PURO.
//
// Tela de plataforma neutra (sem `--brand`): o ano MAIS RECENTE selecionado usa a cor de ação da
// plataforma (`--action-primary`, o Cool Gray escuro institucional) e cada ano anterior um tom de
// cinza PROGRESSIVAMENTE mais claro, todos por token (nunca hex). A escada começa no escuro de
// propósito: o último degrau (`--text-subtle`) ainda precisa ser legível como barra sobre o fundo
// do card — um degrau mais claro (a banda `--band`, #E8E6E1) quase some:
//
//   mais recente           → --action-primary      (#3F4144, Cool Gray escuro)
//   1 posição para trás    → --action-soft-border  (#75777B, Cool Gray 9)
//   2 posições para trás   → --text-subtle         (#ACA39A, Warm Gray 5 — o cinza neutro-quente canônico)
//
// A cor segue a POSIÇÃO entre os selecionados (não a distância no calendário): com `2024 + 2026`
// os dois anos recebem tons distintos e vizinhos, e três anos nunca colidem. O teto de
// `MAX_ANOS` (3) é exatamente o número de tons.
//
// QUEM ESCOLHE A COR: sempre estas funções, com a lista dos anos SELECIONADOS (não só dos que
// carregaram) — a cor de um ano não pode mudar porque o resumo de outro ano falhou. Legenda,
// tooltip, painel Total e card de proporção leem a mesma escada.

export const TONS_DO_ANO = [
  'var(--action-primary)',
  'var(--action-soft-border)',
  'var(--text-subtle)',
] as const

/** Uma cor por ano, na ordem recebida (crescente): o último é a cor principal; os anteriores,
 *  tons mais claros. Mais anos que tons repete o mais claro (não acontece com `MAX_ANOS`). */
export function coresDosAnos(anosCrescentes: readonly number[]): string[] {
  const n = anosCrescentes.length
  return anosCrescentes.map((_, i) => TONS_DO_ANO[Math.min(n - 1 - i, TONS_DO_ANO.length - 1)])
}

/** A cor de cada ano SELECIONADO (qualquer ordem de entrada), por ano. Um ano que falhou continua
 *  na lista — então a cor dos outros não muda. */
export function coresPorAno(anosSelecionados: readonly number[]): Map<number, string> {
  const anos = [...new Set(anosSelecionados)].sort((a, b) => a - b)
  const cores = coresDosAnos(anos)
  return new Map(anos.map((ano, i) => [ano, cores[i]]))
}
