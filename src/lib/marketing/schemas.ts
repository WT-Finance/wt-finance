import { z } from 'zod'
import type {
  FornecedoresMarketing,
  LancamentoMkt,
  ResumoMarketing,
} from '@/components/marketing/gastos/tipos'

// ── Schemas Zod das 3 RPCs de "Gastos de Marketing" (v6.3.0 · migration 0292) ────────────
// Regra do projeto: o schema reflete o retorno REAL da RPC, não o tipo TS. Os três retornos são
// `json` (database.ts tipa como `Json`), então o `tsc` não protege nada aqui — é este schema, via
// `parseRpc`, que impede um campo ausente de chegar à UI. Casos vivos em `rpc-contrato.test.ts`
// (a M4 acrescenta; este arquivo não os cria).
//
// Números: `numeric` do Postgres serializa como número JSON (`z.number()`, sem coerção — o mesmo
// tratamento dos schemas da DRE). `valor` vem com o sinal da DRE (gasto < 0, estorno > 0).
//
// As chaves de objeto vêm SEMPRE (com `null`, quando for o caso) — `json_build_object` não omite —
// e os arrays vêm `[]` quando vazios (`COALESCE(..., '[]')` no SQL), portanto aqui é `.nullable()`
// e não `.optional()`: uma chave que SUMA é drift e tem de reprovar. Chave extra é descartada em
// silêncio (comportamento padrão do `z.object`), sem falsear um drift que não existe.

const mes = z.number().int().min(1).max(12)
/** 'YYYY-MM-DD' (date puro, sem fuso). */
const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const resumoMarketingSchema: z.ZodType<ResumoMarketing> = z.object({
  ano: z.number().int(),
  anosDisponiveis: z.array(z.number().int()),
  porMesCategoria: z.array(z.object({
    mes,
    categoria: z.string(),
    valor: z.number(),
    qtd: z.number().int(),
  })),
  // NULL (e não `{min:null,max:null}`) quando o ano não tem lançamento.
  cobertura: z.object({ min: dataIso, max: dataIso }).nullable(),
  // timestamptz serializado pelo Postgres: ISO COM offset (`...-03:00`/`+00:00`). `datetime()`
  // puro reprovaria o offset, e a exibição é por `fmtDataSP` — basta ser texto.
  ultimaCarga: z.string().nullable(),
  ultimaDataCartao: dataIso.nullable(),
})

export const fornecedoresMarketingSchema: z.ZodType<FornecedoresMarketing> = z.object({
  ano: z.number().int(),
  porMesFornecedor: z.array(z.object({
    mes,
    fornecedor: z.string().nullable(),
    valor: z.number(),
    qtd: z.number().int(),
  })),
})

export const lancamentosMarketingSchema: z.ZodType<LancamentoMkt[]> = z.array(z.object({
  id: z.number().int(),
  data: dataIso,
  categoria: z.string(),
  fornecedor: z.string().nullable(),
  descricao: z.string().nullable(),
  documento: z.string().nullable(),
  valor: z.number(),
}))
