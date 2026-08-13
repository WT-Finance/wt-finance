// Núcleo de ingestão do Monde (v5.1.2/M5). Server-side. Orquestra:
//   lista (paginada) → detalhe (concorrência limitada) → transformSale →
//   staging (monde_ingest_lote em lotes) → monde_ingest_promover (UPSERT idempotente) →
//   monde_refresh_mv. Resiliente: erro por venda é logado e pulado, nunca aborta a janela.
// A API Route (cron/backfill) e scripts de carga chamam `ingestWindow` com um client
// service-role. NÃO importa 'server-only' aqui de propósito (reuso fora do bundle Next);
// o segredo mora no client.ts (que é server-only) e no client service-role passado in.
import { fetchSalesPage, fetchSaleDetail } from './client'
import { transformSale, type VendaEspelho } from './transform'

/** Client mínimo (supabase-js/admin) — só o que a ingestão usa. Evita acoplar a database.ts. */
export interface MondeDb {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
}

export interface IngestOpts {
  from: string            // YYYY-MM-DD (data da venda)
  to: string              // YYYY-MM-DD
  pageSize?: number       // default 200 (máx da API)
  detailConcurrency?: number  // default 8 chamadas de detalhe em paralelo
  loteSize?: number       // default 25 vendas por chamada de staging (raw é grande)
  maxSales?: number       // corta a leitura (para janelas de demonstração)
  onLog?: (msg: string) => void
}

export interface PromoverResult {
  ok: boolean; inseridas: number; atualizadas: number; ignoradas: number; itens: number
}

export interface IngestResult {
  janela: { from: string; to: string }
  total_janela: number
  paginas: number
  lidas: number
  excluidas: { welcome: number; sem_setor: number; sem_item_ativo: number }
  espelhaveis: number
  /** sale_ids das vendas que a rodada provou espelháveis (v5.6.3) — insumo da CURA:
   *  a reconciliação remove do espelho o que ficou fora deste conjunto. */
  espelhaveis_ids: string[]
  erros: number
  promover: PromoverResult | null
}

async function rpc(db: MondeDb, fn: string, args?: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await db.rpc(fn, args)
  if (error) throw new Error(`RPC ${fn} falhou: ${JSON.stringify(error)}`)
  return data
}

/** map com pool de concorrência fixa (sem dependência externa). */
async function mapPool<T>(items: T[], limit: number, fn: (item: T, i: number) => Promise<void>): Promise<void> {
  let idx = 0
  const worker = async () => {
    while (idx < items.length) {
      const i = idx++
      await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker))
}

export async function ingestWindow(db: MondeDb, opts: IngestOpts): Promise<IngestResult> {
  const { from, to, pageSize = 200, detailConcurrency = 8, loteSize = 25, maxSales, onLog } = opts
  const log = (m: string) => onLog?.(m)

  // 1. Lista paginada (guiada por `total`).
  const lista: { sale_id: string; sale_number: string }[] = []
  let page = 1
  let total = Number.POSITIVE_INFINITY
  let paginas = 0
  while (lista.length < total) {
    const resp = await fetchSalesPage({ from, to, page, pageSize })
    total = resp.total ?? lista.length
    paginas++
    const data = resp.data ?? []
    if (data.length === 0) break
    for (const s of data) {
      if (!s.sale_id) continue // sem id não há como buscar o detalhe
      lista.push({ sale_id: s.sale_id, sale_number: s.sale_number ?? '' })
    }
    if (maxSales && lista.length >= maxSales) { lista.length = maxSales; break }
    if (data.length < pageSize) break
    page++
  }
  log(`lista: ${lista.length} vendas em ${paginas} página(s) (total janela=${Number.isFinite(total) ? total : lista.length})`)

  // 2. Detalhe + transform (concorrência limitada). Erro por venda: loga e pula.
  const excluidas = { welcome: 0, sem_setor: 0, sem_item_ativo: 0 }
  const vendas: VendaEspelho[] = []
  let erros = 0
  await mapPool(lista, detailConcurrency, async (s) => {
    try {
      const det = await fetchSaleDetail(s.sale_id)
      const r = transformSale(det)
      if ('venda' in r) vendas.push(r.venda)
      else excluidas[r.excluida]++
    } catch (e) {
      erros++
      log(`venda ${s.sale_number}: erro no detalhe/transform — ${(e as Error).message}`)
    }
  })
  log(`transform: ${vendas.length} espelháveis · excluídas ${JSON.stringify(excluidas)} · erros ${erros}`)

  // 3. Staging → promover (UPSERT idempotente) → refresh da mv.
  await rpc(db, 'monde_ingest_limpar_staging')
  for (let i = 0; i < vendas.length; i += loteSize) {
    await rpc(db, 'monde_ingest_lote', { p_vendas: vendas.slice(i, i + loteSize) })
  }
  const promover = vendas.length
    ? (await rpc(db, 'monde_ingest_promover')) as PromoverResult
    : null
  await rpc(db, 'monde_refresh_mv')
  log(`promover: ${JSON.stringify(promover)}`)

  return {
    janela: { from, to },
    total_janela: Number.isFinite(total) ? total : lista.length,
    paginas,
    lidas: lista.length,
    excluidas,
    espelhaveis: vendas.length,
    espelhaveis_ids: vendas.map(v => v.sale_id).filter((id): id is string => id != null),
    erros,
    promover,
  }
}
