// Atraso da sincronização do Monde (v5.1.11). O cron ingere o espelho a cada ~15min
// (migration 0182); o rótulo "Última atualização" mostra a última sincronização
// (`monde_ingest_status.ultima_sincronizacao`, v5.1.8). Se ela não avança por 3 TICKS
// (45min), a integração provavelmente parou de transmitir → o rótulo fica VERMELHO.
//
// Nuance (diagnóstico v5.1.10): isto pega a falha DURA (API fora do ar / cron parado /
// RPC de carga falhando) — nesses casos a rota devolve 500 e NÃO grava o marcador, então
// `ultima_sincronizacao` congela e cruza o limite. NÃO pega a falha SILENCIOSA (API responde
// 200 mas sem vendas), em que o marcador continua avançando — essa é indistinguível de uma
// janela legitimamente quieta pelo rótulo (seria outro mecanismo).
//
// Puro e isomórfico (sem React, sem server, sem I/O) → testável e seguro no client island.

export const INTERVALO_SYNC_MIN = 15          // cadência do cron (0182)
export const TICKS_ATE_ATRASO = 3             // nº de sincronizações perdidas até alertar
export const LIMITE_ATRASO_MS = INTERVALO_SYNC_MIN * TICKS_ATE_ATRASO * 60_000  // 45min

/**
 * `true` se a última sincronização (`iso`, um timestamptz do Postgres) é mais velha que
 * `LIMITE_ATRASO_MS` em relação a `agoraMs` (epoch ms). Comparação de INSTANTE (fuso-agnóstica:
 * `Date.parse` de timestamptz devolve epoch absoluto) — o fuso só importa para EXIBIR, não para
 * medir a idade. `iso` nulo/vazio/inválido → `false` (sem dado não é "atraso"; o rótulo nem aparece).
 */
export function sincronizacaoAtrasada(iso: string | null | undefined, agoraMs: number): boolean {
  if (!iso) return false
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return false
  return agoraMs - t > LIMITE_ATRASO_MS
}
