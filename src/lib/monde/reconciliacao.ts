// Reconciliação do espelho Monde (v5.4.5). Lógica PURA — sem I/O, sem React, sem server —
// no molde de `src/lib/metas/sync-atraso.ts`: recebe o "hoje" como parâmetro em vez de ler o
// relógio, então é testável e não carrega surpresa de fuso.
//
// POR QUE ESTA VERSÃO EXISTE: o modo `incremental` da ingestão pede à API a janela
// `hoje−7d..hoje` e a API filtra por DATA DA VENDA. Venda registrada com atraso e data
// retroativa cai fora da janela e o incremental nunca volta lá — 42 vendas
// (R$ 392.070,01 de faturamento) ficaram de fora até 04/08/2026, com atraso de registro
// mediano de 4 dias e máximo de 32. A reconciliação é a rede AUTO-CURATIVA: reprocessa os
// últimos meses inteiros, então não depende de acertar o tamanho de nenhuma janela.
//
// O cursor mora em `monde.ingest_control` (chave `reconciliacao_cursor`) e cada invocação
// processa UM mês — três disparos diários fecham a janela de 3 meses e cabem folgado no
// `maxDuration` da rota.

/** Quantos meses a reconciliação cobre (cauda observada: 32 dias de atraso de registro). */
export const MESES_RECONCILIACAO = 3

/** Quantos meses o tripwire compara contra a API (12 chamadas `page_size=1`, custo desprezível). */
export const MESES_TRIPWIRE = 12

/** `YYYY-MM` de um ISO `YYYY-MM-DD`. */
function anoMes(iso: string): string {
  return iso.slice(0, 7)
}

/**
 * Os `n` meses terminando no mês de `hojeISO`, do MAIS RECENTE para o mais antigo.
 * A ordem importa: se só um disparo do dia vencer, o mês corrente — onde a venda lançada com
 * atraso é mais provável — é o que foi reprocessado.
 */
export function mesesRecentes(hojeISO: string, n: number): string[] {
  const [ano, mes] = anoMes(hojeISO).split('-').map(Number)
  const out: string[] = []
  for (let i = 0; i < Math.max(1, n); i++) {
    const d = new Date(Date.UTC(ano, mes - 1 - i, 1))
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
  }
  return out
}

/** Primeiro e último dia de um `YYYY-MM`, em ISO. */
export function rangeDoMes(ym: string): { from: string; to: string } {
  const [ano, mes] = ym.split('-').map(Number)
  const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate()
  return { from: `${ym}-01`, to: `${ym}-${String(ultimoDia).padStart(2, '0')}` }
}

/**
 * O mês que esta invocação deve processar, dado o cursor gravado e a janela vigente.
 *
 * Regras (nesta ordem):
 *  - cursor ausente/desconhecido → começa pelo primeiro da janela (o mês mais recente);
 *  - cursor no meio da janela → o seguinte;
 *  - cursor no ÚLTIMO da janela → volta ao primeiro (a reconciliação é um ciclo, não uma fila
 *    que termina: ela roda todo dia para sempre).
 *
 * Cursor de um mês que saiu da janela (virada de mês, ou pausa longa) cai no primeiro caso —
 * retomar do mais recente é o comportamento seguro.
 */
export function proximoMesReconciliacao(cursor: string | null | undefined, janela: string[]): string {
  if (janela.length === 0) throw new Error('janela de reconciliação vazia')
  const i = cursor ? janela.indexOf(cursor) : -1
  if (i < 0) return janela[0]
  return janela[(i + 1) % janela.length]
}

/** Uma linha do tripwire: quantas vendas a API tem no mês × quantas o espelho tem. */
export interface LinhaTripwire {
  mes: string
  api: number
  espelho: number
  /** `espelho − api`. Negativo = o espelho está PERDENDO venda (o defeito desta versão). */
  delta: number
}

export interface Tripwire {
  verificado_em: string
  /** `true` se algum mês divergiu — o cartão acende. */
  acendeu: boolean
  /** Só os meses com `delta ≠ 0`, para o alerta não exigir leitura das 12 linhas. */
  divergentes: string[]
  meses: LinhaTripwire[]
}

/**
 * Monta o tripwire a partir das duas contagens por mês. Mês sem entrada em um dos lados conta
 * ZERO — ausência é dado, não motivo para omitir a linha.
 *
 * Delta ≠ 0 nos DOIS sentidos acende: espelho menor é o defeito conhecido (venda perdida);
 * espelho MAIOR também é anomalia (venda que a API não lista mais — cancelamento ou mudança de
 * data que a reconciliação deveria ter refletido) e não pode passar em silêncio.
 */
export function montarTripwire(
  meses: string[],
  api: Record<string, number>,
  espelho: Record<string, number>,
  verificadoEmISO: string,
): Tripwire {
  const linhas: LinhaTripwire[] = meses.map((mes) => {
    const a = api[mes] ?? 0
    const e = espelho[mes] ?? 0
    return { mes, api: a, espelho: e, delta: e - a }
  })
  const divergentes = linhas.filter((l) => l.delta !== 0).map((l) => l.mes)
  return {
    verificado_em: verificadoEmISO,
    acendeu: divergentes.length > 0,
    divergentes,
    meses: linhas,
  }
}
