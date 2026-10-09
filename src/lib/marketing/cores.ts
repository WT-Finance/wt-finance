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
//   3 ou mais para trás    → --text-subtle         (REPETE o tom mais claro: a escada tem 3 degraus)
//
// A seleção de anos NÃO tem teto (todas as pills podem estar ligadas). Com até 3 anos nenhuma cor se
// repete; com 4 ou mais, os anos mais antigos dividem o tom mais claro — a leitura continua sem
// ambiguidade porque cada barra fica na ordem dos anos e a legenda/tooltip nomeiam o ano.
//
// A cor segue a POSIÇÃO entre os selecionados (não a distância no calendário): com `2024 + 2026` os
// dois anos recebem tons distintos e vizinhos.
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
 *  tons mais claros. Com mais anos que tons, os mais antigos repetem o mais claro. */
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
