import { OrcamentoEsgotado, type ClienteMonde } from './client'
import { corteDoDia } from './ingest'

// Auditoria do espelho Monde (v5.4.4; refeita na v6.2.0 para a API oficial v3) — o detector "quais
// números a API tem que o espelho não tem". SÓ LEITURA: lê a lista e não grava nada (nem o índice de
// cabeçalhos), então pode rodar fora do lock de ingestão.
//
// A v3 não filtra a lista por data e a ordena por CRIAÇÃO. Para cobrir as vendas com `sale_date` em
// [from, to] é preciso descer até a criação anterior a `from − MARGEM_CRIACAO_DIAS`: medido em 05/10/2026
// (12 meses do espelho), venda criada até 16 dias ANTES da própria data. Janela antiga custa muitas
// páginas; sem orçamento, a resposta sai com `parcial: true` em vez de fingir completude.
//
// Nada aqui compara contra o UPLOAD. A referência é sempre a API (decisão do Yan na v5.4.4).

/** Folga de criação ANTES da data da venda (máximo medido: 16 dias). */
export const MARGEM_CRIACAO_DIAS = 20

export interface JanelaDaApi {
  numeros: string[]
  /** Vendas da janela listadas SEM id — a ingestão não consegue abri-las. */
  sem_sale_id: string[]
  /** A v3 não declara total: é a contagem do que foi listado. */
  total: number
  paginas: number
  /** `true` se o orçamento acabou antes do corte — a lista está incompleta. */
  parcial: boolean
}

export function menosDias(diaISO: string, n: number): string {
  const d = new Date(`${diaISO}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

export async function listarJanelaDaApi(
  cliente: ClienteMonde,
  opts: { from: string; to: string; onLog?: (msg: string) => void },
): Promise<JanelaDaApi> {
  const { from, to, onLog } = opts
  const corte = corteDoDia(menosDias(from, MARGEM_CRIACAO_DIAS))
  const numeros: string[] = []
  const semSaleId: string[] = []
  let paginas = 0
  let parcial = false
  let cursor: string | null = null
  try {
    for (;;) {
      const pagina = await cliente.listarVendas(cursor)
      paginas++
      for (const s of pagina.data) {
        if (!s.sale_number || s.sale_date < from || s.sale_date > to) continue
        numeros.push(s.sale_number)
        if (!s.id) semSaleId.push(s.sale_number)
      }
      const ultima = pagina.data[pagina.data.length - 1]
      if (ultima?.created_at && ultima.created_at < corte) break
      if (!pagina.pagination.has_next_page || !pagina.pagination.next_cursor) break
      cursor = pagina.pagination.next_cursor
    }
  } catch (e) {
    if (!(e instanceof OrcamentoEsgotado)) throw e
    parcial = true
  }
  const unicos = [...new Set(numeros)]
  onLog?.(
    `auditoria ${from}..${to}: ${unicos.length} venda(s) na API em ${paginas} página(s)` +
      (semSaleId.length ? ` · ${semSaleId.length} SEM id` : '') + (parcial ? ' · PARCIAL (orçamento)' : ''),
  )
  return { numeros: unicos, sem_sale_id: semSaleId, total: unicos.length, paginas, parcial }
}
