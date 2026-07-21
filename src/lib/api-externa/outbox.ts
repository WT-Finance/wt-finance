import 'server-only'
import { chamarRpcExterna } from './http'

// v5.4.0/M4 (ADR-0953) — miolo da ENTREGA do outbox de callbacks: reivindica um
// lote pendente (`api_outbox_reivindicar`), tenta o POST em `callback_url` com o
// header `x-callback-secret`, e registra o resultado (`api_outbox_resultado`) —
// sucesso = 2xx; qualquer outra coisa (exceção incluída) agenda RETRY (backoff
// exponencial no banco, teto 8 tentativas → esgotado). NUNCA lança: é chamado
// tanto pela varredura do CRON (rota /api/externo/outbox/processar, ~5min)
// quanto INLINE, best-effort, logo após uma movimentação externa bem-sucedida
// (latência boa no caminho feliz — a movimentação em si NUNCA depende deste
// resultado; ver src/app/api/externo/solicitacoes/*).

interface ItemOutbox {
  outbox_id:        number
  evento:           string
  payload:          unknown
  tentativas:       number
  callback_url:     string
  callback_segredo: string | null
}

function comoItens(data: unknown): ItemOutbox[] {
  if (!Array.isArray(data)) return []
  return data
    .filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null)
    .map(x => ({
      outbox_id:        typeof x.outbox_id === 'number' ? x.outbox_id : 0,
      evento:           typeof x.evento === 'string' ? x.evento : '',
      payload:          x.payload,
      tentativas:       typeof x.tentativas === 'number' ? x.tentativas : 0,
      callback_url:     typeof x.callback_url === 'string' ? x.callback_url : '',
      callback_segredo: typeof x.callback_segredo === 'string' ? x.callback_segredo : null,
    }))
    .filter(i => i.outbox_id > 0 && i.callback_url !== '')
}

export interface ResultadoOutbox { processados: number; entregues: number; falhas: number }

/**
 * Processa até `limite` itens pendentes da outbox, uma vez. `timeoutMs` é o
 * timeout do POST de callback por item — 10s no caminho do CRON (default);
 * o disparo INLINE (pós-movimentação) usa 5s (via parâmetro) para não segurar
 * a resposta ao integrador por muito tempo no pior caso. NUNCA lança: falha de
 * RPC/rede/callback vira item que permanece 'pendente' (o próximo tick tenta
 * de novo) — o pior resultado possível é `{processados:0,...}`.
 */
export async function processarOutboxUmaVez(limite = 20, timeoutMs = 10_000, budgetMs = 45_000): Promise<ResultadoOutbox> {
  let entregues = 0
  let falhas = 0
  const inicio = Date.now()
  try {
    const { data, error } = await chamarRpcExterna('api_outbox_reivindicar', { p_limite: limite })
    if (error) return { processados: 0, entregues: 0, falhas: 0 }
    const itens = comoItens(data)

    for (const item of itens) {
      // Corte por ORÇAMENTO de tempo (revisor v5.4.0): sob degradação (callbacks lentos),
      // 20×10s estouraria o maxDuration da rota — melhor parar a tempo. Item reivindicado
      // e não resolvido volta a ser elegível no próximo tick (o claim não trava status;
      // at-least-once por contrato — o assinante deduplica).
      if (Date.now() - inicio > budgetMs) break
      let sucesso = false
      let erro: string | null = null
      try {
        const res = await fetch(item.callback_url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-callback-secret': item.callback_segredo ?? '',
          },
          body: JSON.stringify(item.payload),
          signal: AbortSignal.timeout(timeoutMs),
        })
        sucesso = res.ok
        if (!sucesso) erro = `HTTP ${res.status}`
      } catch (e) {
        erro = e instanceof Error ? e.message.slice(0, 200) : 'falha de rede/timeout ao chamar o callback'
      }

      try {
        await chamarRpcExterna('api_outbox_resultado', { p_id: item.outbox_id, p_sucesso: sucesso, p_erro: erro })
      } catch { /* best-effort: o item permanece 'pendente' (tentativas já incrementadas no claim) — o cron tenta de novo */ }

      if (sucesso) entregues++
      else falhas++
    }

    return { processados: itens.length, entregues, falhas }
  } catch {
    // Nunca lança: o pior caso é os itens continuarem pendentes (o cron tenta de novo).
    return { processados: 0, entregues, falhas }
  }
}
