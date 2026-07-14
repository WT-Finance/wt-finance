import { z } from 'zod'

// Schemas Zod da API Monde (v5.1.2 — Ingestão Monde). TOLERANTES por invariante: a
// API é de terceiro e pode mudar de formato sem aviso — isso NUNCA pode quebrar a
// ingestão/o painel. Por isso:
//   - todo objeto usa `.passthrough()` (campos extras do lado de lá não derrubam o parse);
//   - campo não-essencial é `.optional()`/`.nullable()`, e campo que alimenta cálculo tem
//     `.catch(<default>)` (nunca lança por tipo inesperado/ausência);
//   - número que pode chegar como string OU number usa `z.coerce.number()` (aceita ambos;
//     string não-numérica vira NaN → parsedType 'nan' → falha → `.catch(0)` resolve).
//
// Falha de parse em `fetchSalesPage`/`fetchSaleDetail` (client.ts) ainda é reportada com
// contexto — a tolerância aqui é por CAMPO, não pelo formato geral da resposta.

/** Custom field genérico `{ name, value }` — usado na listagem e no detalhe. */
export const zCustomField = z.object({
  name: z.string(),
  value: z.string().nullable().optional(),
}).passthrough()

export const zSaleListItem = z.object({
  sale_number: z.string().catch(''),
  sale_id: z.string().nullable().optional(),
  sale_date: z.string().catch(''),
  status: z.string().catch(''),
  period_start: z.string().nullable().optional(),
  period_end: z.string().nullable().optional(),
  travel_agent_name: z.string().nullable().optional(),
  payer_name: z.string().nullable().optional(),
  payer_cpf_cnpj: z.string().nullable().optional(),
  total_final_value: z.coerce.number().catch(0),
  total_revenue: z.coerce.number().catch(0),
  product_count: z.coerce.number().catch(0),
  custom_fields: z.array(zCustomField).catch([]),
}).passthrough()

export const zSalesListResponse = z.object({
  resource: z.string().optional(),
  total: z.coerce.number().catch(0),
  page: z.coerce.number().catch(1),
  page_size: z.coerce.number().catch(0),
  data: z.array(zSaleListItem).catch([]),
}).passthrough()

export const zPassenger = z.object({
  person_name: z.string().nullable().optional(),
  amount: z.coerce.number().catch(0),
  agency_fee: z.coerce.number().catch(0),
  fees: z.coerce.number().catch(0),
}).passthrough()

export const zProduct = z.object({
  product_kind: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  supplier_name: z.string().nullable().optional(),
  status: z.string().catch(''),
  canceled_at: z.string().nullable().optional(),
  total_amount: z.coerce.number().catch(0),
  agency_service_fee: z.coerce.number().catch(0),
  over_amount: z.coerce.number().catch(0),
  intermediary_commission_amount: z.coerce.number().catch(0),
  data_inicio: z.string().nullable().optional(),
  data_fim: z.string().nullable().optional(),
  passengers: z.array(zPassenger).catch([]),
}).passthrough()

export const zSaleDetail = z.object({
  sale_id: z.string().nullable().optional(),
  sale_number: z.string().catch(''),
  sale_date: z.string().catch(''),
  status: z.string().catch(''),
  payer_name: z.string().nullable().optional(),
  payer_cpf_cnpj: z.string().nullable().optional(),
  // Não listado nos "campos que importam" do detalhe, mas a API o repete (mesmo nome da
  // listagem) — usado no fallback de vendedor em transform.ts (regra 3). `.passthrough()`
  // já toleraria a chave sem tipagem; declarar explicitamente dá tipo limpo ao call-site.
  travel_agent_name: z.string().nullable().optional(),
  custom_fields: z.array(zCustomField).catch([]),
  total_final_value: z.coerce.number().catch(0),
  total_revenue: z.coerce.number().catch(0),
  // `raw` guarda o payload INTEIRO da venda (inclui `intermediary`, usado na síntese de
  // `operacao_propria` em transform.ts) — tolerante: qualquer objeto vira record; o que
  // não for objeto vira `{}` (nunca derruba o parse do resto da venda).
  raw: z.record(z.string(), z.unknown()).catch({}),
  raw_hash: z.string().catch(''),
  products: z.array(zProduct).catch([]),
}).passthrough()

export const zSaleDetailResponse = z.object({
  resource: z.string().optional(),
  data: zSaleDetail,
}).passthrough()

export type CustomField = z.infer<typeof zCustomField>
export type Passenger = z.infer<typeof zPassenger>
export type Product = z.infer<typeof zProduct>
export type SaleListItem = z.infer<typeof zSaleListItem>
export type SalesListResponse = z.infer<typeof zSalesListResponse>
export type SaleDetail = z.infer<typeof zSaleDetail>
export type SaleDetailResponse = z.infer<typeof zSaleDetailResponse>
