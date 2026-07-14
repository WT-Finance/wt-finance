import 'server-only'
import type { z } from 'zod'
import { zSalesListResponse, zSaleDetail, zSaleDetailResponse } from './schemas'

// Cliente HTTP da API Monde (v5.1.2 — Ingestão Monde). SERVER-ONLY: a chave nunca pode
// chegar ao bundle do cliente (`import 'server-only'` falha o build se vazar). Postura
// espelha src/lib/asaas/client.ts (a 1ª integração externa do projeto): env-driven,
// timeout curto, sem log de credencial. Diferença: aqui o chamador (ingestão) trata o
// erro em bloco (lote falho não deve fingir sucesso) — por isso o cliente LANÇA em vez
// de devolver `{ok,error}` estruturado; quem lê decide o que fazer com a falha de lote.

const DEFAULT_BASE_URL = 'https://szyrzxvlptqqheizyrxu.supabase.co/functions/v1/monde-data'
const TIMEOUT_MS = 15_000
const MAX_RETRIES = 2 // + a tentativa inicial = até 3 chamadas de rede por página/detalhe
const RETRY_BASE_DELAY_MS = 500

function baseUrl(): string {
  return (process.env.MONDE_API_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, '')
}

/** Chave da API Monde. Ausência é erro de OPERAÇÃO (config faltando), não de dado — lança cedo. */
export function mondeApiKey(): string {
  const key = process.env.MONDE_API_KEY?.trim()
  if (!key) throw new Error('MONDE_API_KEY ausente — configure o ambiente da integração Monde (.env / Vercel).')
  return key
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

type Tentativa = { ok: true; json: unknown } | { ok: false; retryable: boolean; erro: Error }

async function tentarUmaVez(url: string, key: string, contexto: string): Promise<Tentativa> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const resp = await fetch(url, {
      method: 'GET',
      headers: { 'x-api-key': key, Accept: 'application/json' },
      signal: ctrl.signal,
      cache: 'no-store', // dado sempre fresco (equivalente a next.revalidate:0; os dois juntos conflitam no fetch patcheado do Next)
    })
    if (!resp.ok) {
      const erro = new Error(`[monde:${contexto}] HTTP ${resp.status} ao chamar a API Monde.`)
      return { ok: false, retryable: resp.status >= 500, erro }
    }
    const json = (await resp.json()) as unknown
    return { ok: true, json }
  } catch (e) {
    const abortado = e instanceof Error && e.name === 'AbortError'
    const erro = abortado
      ? new Error(`[monde:${contexto}] tempo de resposta excedido (${TIMEOUT_MS}ms).`)
      : new Error(`[monde:${contexto}] falha de rede ao chamar a API Monde.`)
    return { ok: false, retryable: true, erro }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * GET com timeout (~15s) e até 2 retries com backoff em erro de rede/5xx (4xx NÃO tenta
 * de novo — é erro de requisição, repetir não ajuda). Nunca loga a chave nem a URL com
 * a query completa em nível de erro sensível — a mensagem só carrega `contexto`/status.
 */
async function mondeGetJson(params: Record<string, string>, contexto: string): Promise<unknown> {
  const key = mondeApiKey()
  const qs = new URLSearchParams(params).toString()
  const url = `${baseUrl()}${qs ? `?${qs}` : ''}`

  let ultimaTentativa: Tentativa | null = null
  for (let tentativa = 0; tentativa <= MAX_RETRIES; tentativa++) {
    const r = await tentarUmaVez(url, key, contexto)
    if (r.ok) return r.json
    ultimaTentativa = r
    if (!r.retryable || tentativa === MAX_RETRIES) break
    await sleep(RETRY_BASE_DELAY_MS * (tentativa + 1))
  }
  throw ultimaTentativa?.erro ?? new Error(`[monde:${contexto}] falha desconhecida ao chamar a API Monde.`)
}

/**
 * Uma página da listagem de vendas (`resource=sales`), ordenada por `sale_number` desc.
 * `total` (no retorno) guia a paginação do chamador. `pageSize` default 200 (<= 200).
 */
export async function fetchSalesPage(opts: {
  from: string
  to: string
  page: number
  pageSize?: number
}): Promise<z.infer<typeof zSalesListResponse>> {
  const { from, to, page, pageSize = 200 } = opts
  const json = await mondeGetJson(
    { resource: 'sales', from, to, page: String(page), page_size: String(pageSize) },
    'sales',
  )
  const parsed = zSalesListResponse.safeParse(json)
  if (!parsed.success) {
    throw new Error(
      `[monde:sales] shape inesperado na resposta (from=${from} to=${to} page=${page}): ${parsed.error.message}`,
    )
  }
  return parsed.data
}

/** Detalhe completo de uma venda (`resource=sale&id=<sale_id>`), já validado. */
export async function fetchSaleDetail(saleId: string): Promise<z.infer<typeof zSaleDetail>> {
  const json = await mondeGetJson({ resource: 'sale', id: saleId }, 'sale')
  const parsed = zSaleDetailResponse.safeParse(json)
  if (!parsed.success) {
    throw new Error(`[monde:sale] shape inesperado na resposta (sale_id=${saleId}): ${parsed.error.message}`)
  }
  return parsed.data.data
}
