import { fetchSalesPage } from './client'

// Auditoria do espelho Monde (v5.4.5) — a camada de I/O do detector e do tripwire.
//
// Fica separada de `ingest.ts` DE PROPÓSITO: auditar e ingerir têm necessidades diferentes
// (a auditoria quer TODOS os `sale_number` da API, inclusive os que a ingestão nem consegue
// buscar; a ingestão quer os que têm `sale_id`) e esta versão é um hotfix — o caminho de
// ingestão vivo não é refatorado por conveniência.
//
// Nada aqui compara contra o UPLOAD. A referência é sempre a API: o upload vai ficar dormente
// e esfriar, e um monitor ancorado nele morre junto (decisão do Yan no briefing).

/** Todos os `sale_number` que a API lista para uma janela, + os que não têm `sale_id`. */
export interface JanelaDaApi {
  numeros: string[]
  /**
   * Vendas listadas pela API SEM `sale_id`. A ingestão as pula (`ingest.ts` precisa do id para
   * buscar o detalhe), então elas nunca chegam ao espelho — é um segundo furo, de natureza
   * diferente do que esta versão conserta, e a auditoria o reporta em vez de escondê-lo dentro
   * da contagem de ausentes.
   */
  sem_sale_id: string[]
  /** `total` que a própria API declara para a janela (guia da paginação). */
  total: number
  paginas: number
}

/**
 * Lista a janela inteira na API, coletando só o que a auditoria precisa. Mesma paginação guiada
 * por `total` de `ingestWindow`, e o mesmo teto de `page_size` (200, o máximo da API).
 */
export async function listarJanelaDaApi(opts: {
  from: string
  to: string
  pageSize?: number
  onLog?: (msg: string) => void
}): Promise<JanelaDaApi> {
  const { from, to, pageSize = 200, onLog } = opts
  const numeros: string[] = []
  const semSaleId: string[] = []
  let page = 1
  let total = Number.POSITIVE_INFINITY
  let paginas = 0

  while (numeros.length < total) {
    const resp = await fetchSalesPage({ from, to, page, pageSize })
    total = resp.total ?? numeros.length
    paginas++
    const data = resp.data ?? []
    if (data.length === 0) break
    for (const s of data) {
      const numero = s.sale_number ?? ''
      if (!numero) continue // sem número não há como comparar com o espelho
      numeros.push(numero)
      if (!s.sale_id) semSaleId.push(numero)
    }
    if (data.length < pageSize) break
    page++
  }

  onLog?.(
    `auditoria ${from}..${to}: ${numeros.length} venda(s) na API em ${paginas} página(s)` +
      (semSaleId.length ? ` · ${semSaleId.length} SEM sale_id (a ingestão não as alcança)` : ''),
  )
  return { numeros, sem_sale_id: semSaleId, total: Number.isFinite(total) ? total : numeros.length, paginas }
}

// NOTA (v5.4.5): houve aqui um `contarVendasPorMesNaApi` que fazia 12 chamadas `page_size=1`
// lendo só o `total`, para o tripwire da M4. Foi REMOVIDO: medido em 04/08/2026, comparar o
// `total` da API contra a contagem do espelho acende todo mês para sempre, porque a API conta
// vendas que a transformação exclui por regra (jul/2026: 8 Welcome + 12 sem setor + 9 sem item
// ativo, de 775). O tripwire passou a ser subproduto da reconciliação, que já tem o detalhe de
// cada venda e portanto a contagem EXATA de espelháveis — zero chamada extra. Ver
// `reconciliacao.ts` (§TRIPWIRE) e o ADR-0164.
