// As CINCO bases do contrato de ingestão v1 (`docs/contratos/ingestao-v1.md` §3) — fonte única
// para a rota `/api/ingestao/{base}`, o escopo da chave (`app.api_chave.escopo_bases`), a UI
// de chaves e o grafo de dependência. O CHECK em `app.api_chave.escopo_bases` (migration 0274)
// repete esta lista em SQL; `bases-paridade.test.ts` prova que as duas pontas são idênticas.
export const BASES_INGESTAO = [
  'demonstrativo-competencia',
  'vendas-produto',
  'lancamentos-movimentacao',
  'lancamentos-aberto',
  'lancamentos-operacao',
] as const

export type BaseIngestao = (typeof BASES_INGESTAO)[number]

export function ehBaseIngestao(x: unknown): x is BaseIngestao {
  return typeof x === 'string' && (BASES_INGESTAO as readonly string[]).includes(x)
}

/** Rótulo para a UI (chaves de API, cards, tela de cargas). */
export const ROTULO_BASE: Record<BaseIngestao, string> = {
  'demonstrativo-competencia': 'Demonstrativo de Resultado (competência)',
  'vendas-produto':            'Vendas por Produto',
  'lancamentos-movimentacao':  'Lançamentos por Movimentação',
  'lancamentos-aberto':        'Lançamentos por Vencimento (em aberto)',
  'lancamentos-operacao':      'Lançamentos por Operação',
}
