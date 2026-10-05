import { z } from 'zod'

// Schemas Zod da API OFICIAL do Monde, versão 3 (v6.2.0 — a `monde-data` do TTARS, que a v5.1.2
// consumia, foi desligada em 02/10/2026). Formatos medidos ao vivo em 05/10/2026 e conferidos contra
// o `raw` já guardado no espelho, que É o payload de `GET /sales/{id}` (o TTARS só acrescentava os
// nomes resolvidos por fora).
//
// Tolerância por CAMPO, como antes: todo objeto é `.passthrough()`, campo não essencial é
// `.optional()`/`.nullable()`, número que alimenta cálculo usa `z.coerce.number()` com `.catch(0)`.
//
// ⚠️ Mas a ESTRUTURA que decide "quantas vendas existem" é ESTRITA. Na v5.x o `data` da lista tinha
// `.catch([])`, e a paginação se guiava pelo `total` da API. A v3 não tem `total`: a varredura para
// quando `has_next_page` é false. Se uma resposta malformada virasse "página vazia, sem próxima", a
// varredura terminaria cedo, a apuração do mês contaria menos vendas e a CURA removeria do espelho
// as que não foram listadas. Por isso `data` e `pagination.has_next_page` falham o parse — e o erro
// sobe — em vez de cair num default.

/** Texto a partir de string OU número (a v3 manda `sale_number` como número; o espelho guarda texto). */
const zTexto = z.preprocess((v) => (v === null || v === undefined ? '' : String(v)), z.string())

/** `{ id }` de pessoa/produto/fornecedor. A v3 nunca manda o nome junto. */
const zRef = z.object({ id: z.string().nullable().optional() }).passthrough().nullable().optional()

const zNum = z.coerce.number().catch(0)
const zTextoOpc = z.string().nullable().optional()

// ── Lista: GET /sales ─────────────────────────────────────────────────────────────────────
const zCabecalho = z.object({
  id: z.string().nullable().optional(),
  sale_number: zTexto.catch(''),
  sale_date: z.string().catch(''),
  /** Sem fuso, no horário de Brasília. É por ELE que a lista vem ordenada (desc). */
  created_at: z.string().catch(''),
  status: z.string().catch(''),
  totals: z.record(z.string(), z.unknown()).catch({}),
}).passthrough()

export const zPaginaVendas = z.object({
  data: z.array(zCabecalho),
  pagination: z.object({
    has_next_page: z.boolean(),
    next_cursor: z.string().nullable().optional(),
  }).passthrough(),
}).passthrough()

// ── Detalhe: GET /sales/{id} ──────────────────────────────────────────────────────────────
const zTrecho = z.object({
  departure_date: zTextoOpc,
  arrival_date: zTextoOpc,
}).passthrough()

const zProduto = z.object({
  id: z.string().nullable().optional(),
  status: z.string().catch(''),
  canceled_at: zTextoOpc,
  supplier: zRef,
  /** Só em `others`/`operations`: o produto do catálogo (nome em /products/{id}). */
  product: zRef,
  totals: z.object({ amount: zNum }).passthrough().catch({ amount: 0 }),
  agency_service_fee: zNum,
  passengers: z.array(z.unknown()).catch([]),
  // Campos de nome e de data — cada tipo usa os seus (ver transform.ts).
  accommodation_kind: zTextoOpc,
  package_name: zTextoOpc,
  ship_name: zTextoOpc,
  check_in: zTextoOpc,
  check_out: zTextoOpc,
  begin_date: zTextoOpc,
  end_date: zTextoOpc,
  pickup_date: zTextoOpc,
  dropoff_date: zTextoOpc,
  departure_date: zTextoOpc,
  arrival_date: zTextoOpc,
  segments: z.array(zTrecho).catch([]),
}).passthrough()

const zCampoPersonalizado = z.object({
  id: z.coerce.number().catch(-1),
  value: z.unknown().optional(),
}).passthrough()

const zListaProdutos = z.array(zProduto).catch([])

export const zVendaDetalhe = z.object({
  id: z.string(),
  sale_number: zTexto,
  // Formato validado AQUI: data fora do formato falharia o cast no `monde_ingest_lote` e envenenaria o
  // lote inteiro a cada tick (MÉDIO do revisor). No parse, vira `erro` só desta venda.
  sale_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.string().catch(''),
  payer: zRef,
  seller: zRef,
  intermediary: z.unknown().optional(),
  custom_fields: z.array(zCampoPersonalizado).catch([]),
  // Estrito: `final_amount`/`revenue` viram `total_final_value`/`total_revenue` e o rateio de receita
  // inteiro. Zero silencioso aqui seria receita sumindo do espelho sem erro nenhum.
  totals: z.object({
    final_amount: z.coerce.number(),
    revenue: z.coerce.number(),
  }).passthrough(),
  hotels: zListaProdutos,
  airline_tickets: zListaProdutos,
  insurances: zListaProdutos,
  cruises: zListaProdutos,
  car_rentals: zListaProdutos,
  ground_transportations: zListaProdutos,
  train_tickets: zListaProdutos,
  travel_packages: zListaProdutos,
  others: zListaProdutos,
  operations: zListaProdutos,
  cvc_packages: zListaProdutos,
  excursions: zListaProdutos,
}).passthrough()

// ── Cadastros ─────────────────────────────────────────────────────────────────────────────
export const zPessoa = z.object({
  id: z.string(),
  name: zTextoOpc,
  cpf_cnpj: zTextoOpc,
}).passthrough()

const zProdutoCatalogo = z.object({
  id: z.string(),
  name: zTextoOpc,
  kind: zTextoOpc,
}).passthrough()

export const zProdutoCatalogoDetalhe = zProdutoCatalogo

export const zPaginaCatalogo = z.object({
  data: z.array(zProdutoCatalogo),
  pagination: z.object({
    has_next_page: z.boolean(),
    next_cursor: z.string().nullable().optional(),
  }).passthrough(),
}).passthrough()

export const zCamposPersonalizados = z.object({
  data: z.array(z.object({ id: z.coerce.number(), name: z.string() }).passthrough()),
}).passthrough()

export type Cabecalho = z.infer<typeof zCabecalho>
export type PaginaVendas = z.infer<typeof zPaginaVendas>
export type VendaDetalhe = z.infer<typeof zVendaDetalhe>
export type Produto = z.infer<typeof zProduto>
export type Pessoa = z.infer<typeof zPessoa>
