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

// ── TRIPWIRE ────────────────────────────────────────────────────────────────────────────────
//
// ⚠️ POR QUE NÃO É CONTAGEM CRUA. O briefing pedia "contagem mensal do espelho × `total` da API".
// Medido em 04/08/2026: NÃO funciona — a API conta vendas que a transformação exclui por regra
// (jul/2026: 8 Welcome + 12 sem setor + 9 sem item ativo = 29 de 775). O espelho nunca iguala o
// total da API, e um tripwire assim **acende todo mês, para sempre**. Alarme sempre aceso não é
// alarme: é a falha silenciosa invertida.
//
// A comparação exata é possível de graça: a reconciliação já baixa o DETALHE de cada venda do
// mês, então ela sabe exatamente quantas eram espelháveis e quantas excluiu, por motivo. O
// tripwire passou a ser subproduto dela — zero chamada extra à API — e só fala dos meses que
// foram de fato reconciliados. Mês fora da janela aparece como `nao_verificado`, nunca como
// divergente (decisão do Yan).

/** O que a reconciliação de UM mês apurou. Todos os campos saem do `IngestResult` da janela. */
export interface MesVerificado {
  mes: string
  /** `total` que a API declara para o mês. */
  api: number
  /** Vendas que a ingestão conseguiu LER (a listagem pula as sem `sale_id`). */
  lidas: number
  /** `api − lidas`: vendas que a API lista mas a ingestão não alcança (não têm `sale_id`). */
  sem_sale_id: number
  /** Vendas que a transformação aceitou. */
  espelhaveis: number
  excluidas: { welcome: number; sem_setor: number; sem_item_ativo: number }
  /** Vendas que falharam no detalhe/transform — nem espelhadas, nem excluídas por regra. */
  erros: number
  /** `count(*)` do espelho no range do mês, depois da reconciliação. */
  espelho: number
  /**
   * `espelho − espelhaveis`. Vendas que continuam no espelho tendo deixado de ser espelháveis
   * (perderam o último item ativo depois de ingeridas) — o UPSERT nunca remove. Achado da
   * v5.4.5; nesta versão é MEDIDO e reportado, não corrigido (remover linha é escrita
   * destrutiva e muda faturamento exibido — decisão do Yan).
   */
  sobrando: number
  /**
   * `lidas === espelhaveis + Σexcluidas + erros`. Se não fecha, alguma venda lida sumiu sem
   * explicação — é a checagem de integridade que dá sentido ao alarme.
   */
  conta_fecha: boolean
  verificado_em: string
}

export interface MesNaoVerificado { nao_verificado: true }

export interface Tripwire {
  atualizado_em: string
  /** `true` se algum mês VERIFICADO tem problema. Mês não verificado nunca acende. */
  acendeu: boolean
  motivos: string[]
  meses: Record<string, MesVerificado | MesNaoVerificado>
}

/** Um mês verificado tem problema? (a regra do alarme, num lugar só) */
export function mesProblematico(m: MesVerificado): boolean {
  return m.erros > 0 || m.sobrando > 0 || m.sem_sale_id > 0 || !m.conta_fecha
}

function ehVerificado(m: MesVerificado | MesNaoVerificado | undefined): m is MesVerificado {
  return !!m && !('nao_verificado' in m)
}

/**
 * Apura um mês a partir do que a janela de ingestão devolveu + a contagem do espelho.
 * `apiTotal`/`lidas`/`espelhaveis`/`excluidas`/`erros` vêm do `IngestResult`; `espelho` vem do
 * detector usado como contador.
 */
export function avaliarMes(entrada: {
  mes: string
  apiTotal: number
  lidas: number
  espelhaveis: number
  excluidas: { welcome: number; sem_setor: number; sem_item_ativo: number }
  erros: number
  espelho: number
  verificadoEmISO: string
}): MesVerificado {
  const { mes, apiTotal, lidas, espelhaveis, excluidas, erros, espelho, verificadoEmISO } = entrada
  const somaExcluidas = excluidas.welcome + excluidas.sem_setor + excluidas.sem_item_ativo
  return {
    mes,
    api: apiTotal,
    lidas,
    sem_sale_id: Math.max(0, apiTotal - lidas),
    espelhaveis,
    excluidas,
    erros,
    espelho,
    sobrando: Math.max(0, espelho - espelhaveis),
    conta_fecha: lidas === espelhaveis + somaExcluidas + erros,
    verificado_em: verificadoEmISO,
  }
}

/**
 * Funde a apuração de um mês no tripwire guardado e recalcula o alarme sobre a janela visível.
 * Meses da janela sem apuração viram `nao_verificado`; meses que saíram da janela são
 * descartados (o painel mostra 12 meses, não histórico).
 */
export function mesclarTripwire(
  anterior: Tripwire | null | undefined,
  novo: MesVerificado | null,
  mesesVisiveis: string[],
  agoraISO: string,
): Tripwire {
  const acumulado: Record<string, MesVerificado | MesNaoVerificado> = {}
  for (const m of mesesVisiveis) {
    const previo = anterior?.meses?.[m]
    acumulado[m] = ehVerificado(previo) ? previo : { nao_verificado: true }
  }
  if (novo && mesesVisiveis.includes(novo.mes)) acumulado[novo.mes] = novo

  const motivos: string[] = []
  for (const m of mesesVisiveis) {
    const linha = acumulado[m]
    if (!ehVerificado(linha) || !mesProblematico(linha)) continue
    const causas: string[] = []
    if (linha.erros > 0) causas.push(`${linha.erros} erro(s)`)
    if (linha.sobrando > 0) causas.push(`${linha.sobrando} sobrando`)
    if (linha.sem_sale_id > 0) causas.push(`${linha.sem_sale_id} sem sale_id`)
    if (!linha.conta_fecha) causas.push('conta não fecha')
    motivos.push(`${m}: ${causas.join(', ')}`)
  }

  return { atualizado_em: agoraISO, acendeu: motivos.length > 0, motivos, meses: acumulado }
}
