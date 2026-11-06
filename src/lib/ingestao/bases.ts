// As SETE bases do contrato de ingestão v1 (`docs/contratos/ingestao-v1.md` §3) — fonte única
// para a rota `/api/ingestao/{base}`, o escopo da chave (`app.api_chave.escopo_bases`), a UI
// de chaves e o grafo de dependência. O CHECK em `app.api_chave.escopo_bases` (migration 0274)
// repete esta lista em SQL; `bases-paridade.test.ts` prova que as duas pontas são idênticas.
//
// `contas-receber` (v6.4.0) entra no FIM da lista de propósito: os CHECKs de `ingestao.carga` e
// `ingestao.promocao` (migration `0298_contas_receber_checks_ingestao.sql`, destrutiva por classificação) repetem a lista
// NA MESMA ORDEM, e o teste de paridade compara a ordem.
//
// `lancamentos-centro-custo` (v6.5.1) é a SÉTIMA e também entra por ÚLTIMO: o patch destrutivo
// `supabase/patches/centro_custo_checks_ingestao.sql` (Yan em TTY) amplia os mesmos CHECKs, na mesma ordem.
export const BASES_INGESTAO = [
  'demonstrativo-competencia',
  'vendas-produto',
  'lancamentos-movimentacao',
  'lancamentos-aberto',
  'lancamentos-operacao',
  'contas-receber',
  'lancamentos-centro-custo',
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
  'contas-receber':            'Contas a receber',
  'lancamentos-centro-custo':  'Lançamentos por Centro de Custo',
}

/** Bases que aceitam N arquivos por carga (contrato §2.1): Vendas, um por ano; Contas a receber,
 *  um por faixa de vencimento (o Monde limita a pesquisa a 30 mil linhas). Antes da v6.4.0 isto era
 *  um `base !== 'vendas-produto'` solto em dois lugares de `carga.ts`. */
export const BASES_MULTIARQUIVO: readonly BaseIngestao[] = ['vendas-produto', 'contas-receber']

export function aceitaMultiplosArquivos(base: BaseIngestao): boolean {
  return BASES_MULTIARQUIVO.includes(base)
}

/** Bases que uma CHAVE de API (RPA) pode cobrir — as que o CHECK `api_chave_escopo_bases_validas`
 *  (0274) e a validação `ESCOPO_INVALIDO` de `api_chave_registrar` (0289) aceitam. `contas-receber`
 *  e `lancamentos-centro-custo` (v6.5.1) ficam de fora: não há RPA para elas e o banco recusaria o
 *  escopo. A UI de criação de chave e a Server Action filtram por esta lista; `bases-paridade.test.ts`
 *  a confere contra o SQL. Lista EXPLÍCITA das sem-RPA: base nova nasce COM escopo de chave só se
 *  alguém a tirar daqui de propósito. */
const BASES_SEM_ESCOPO_DE_CHAVE: readonly BaseIngestao[] = ['contas-receber', 'lancamentos-centro-custo']

export const BASES_COM_ESCOPO_DE_CHAVE: readonly BaseIngestao[] = BASES_INGESTAO.filter(
  (b) => !BASES_SEM_ESCOPO_DE_CHAVE.includes(b),
)
