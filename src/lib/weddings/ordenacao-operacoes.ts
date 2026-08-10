// Chaves de ordenação da Lista de Operações de Weddings (v5.5.0).
//
// ── POR QUE ISTO SAIU DA API ROUTE ───────────────────────────────────────────
// Esta lista é UMA das quatro pontas de um contrato que atravessa camadas
// diferentes e não tem quem o segure:
//
//   cabeçalho clicável (lista-operacoes.tsx)
//     → querystring
//       → ESTE enum (validação Zod da rota)
//         → parâmetro `p_ordenar_por` da RPC
//           → o `CASE` de whitelist dentro do SQL
//
// E o modo de falha é assimétrico e cruel: **faltar a chave no `CASE` do SQL é
// SILENCIOSO** (o `ELSE 'd_data_evento'` ordena por outra coisa e ninguém percebe),
// enquanto **faltar aqui é ESTRONDOSO** (a rota devolve 400 e a Lista inteira vira
// uma linha de erro). Nenhum dos dois aparece em tsc, lint, build ou nos testes de
// UI.
//
// **Custou caro (v5.5.0):** a chave `rend_float` entrou no `CASE` da migration 0241
// e no cabeçalho clicável, mas NÃO neste enum. A verificação da ordenação tinha sido
// feita via REST/service_role direto contra a RPC — que pula exatamente esta camada.
// Passou por tsc, lint, build e 744 testes; clicar no cabeçalho da própria coluna
// entregue na versão quebrava a tela. Achado CRÍTICO do `revisor`.
//
// Vive em `lib/` para poder ser TESTADA: o guard mecânico em
// `ordenacao-operacoes.test.ts` lê o `CASE` do SQL da migration e compara com esta
// lista, nas duas direções. A API Route importa daqui.

/**
 * Chaves aceitas em `?ordenar_por=`. Tem de ser exatamente o conjunto de `WHEN` da
 * whitelist de `get_operacoes_weddings__nucleo` — o teste-irmão garante isso.
 */
export const CHAVES_ORDENACAO_OPERACOES = [
  'data_evento',
  'nome_casal',
  'hotel',
  'faturamento',
  'receita',
  'margem',
  'custos',
  'resultado',
  'ml',
  'margem_aa',
  'rend_float',
  'margem_teorica_aa',
  'duracao',
  'tipo_contrato',
  'convidados',
] as const

export type ChaveOrdenacaoOperacoes = (typeof CHAVES_ORDENACAO_OPERACOES)[number]

/**
 * Chave usada pelo `ELSE` da whitelist do SQL.
 *
 * É o **fallback silencioso**: pedir uma chave desconhecida não dá erro no banco,
 * ordena por isto. Está aqui nomeado para que o teste possa afirmar que ele existe
 * e é o que se espera — um fallback anônimo é o que torna o defeito invisível.
 */
export const CHAVE_ORDENACAO_PADRAO: ChaveOrdenacaoOperacoes = 'data_evento'
