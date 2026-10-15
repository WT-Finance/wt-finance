import { z } from 'zod'

// Antecipações de recebíveis por mês no gráfico "Fluxo de Caixa Mensal" (v6.4.1).
//
// A RPC `get_fluxo_antecipacoes_mensal()` (0299, gate `financeiro/fluxo-caixa`) devolve, por
// mês da `data` da antecipação, o valor LÍQUIDO (o que de fato entrou) e o ANTECIPADO
// (bruto), sobre todas as contas — fonte única: o registro `financeiro.antecipacao`. Este
// módulo é PURO (sem I/O, sem React): valida o retorno e casa o registro com a série mensal
// do fluxo (`get_fluxo_caixa_mensal_v3`), decidindo quanto da barra de "Entradas
// efetivadas" vira âmbar.
//
// A leitura é honesta mas é um RECORTE DO REGISTRO, não uma marcação do Monde: por isso o
// âmbar nunca passa do total das entradas efetivadas do mês (clamp) e a UI avisa quando o
// registro excede o que entrou.

// ── Contrato da RPC ──────────────────────────────────────────────────────────

export const antecipacaoMensalRowSchema = z.object({
  mes:        z.string().regex(/^\d{4}-\d{2}$/),
  liquido:    z.number(),
  n:          z.number(),
}).passthrough()

/**
 * `json_agg` de conjunto vazio devolve NULL, não `[]` (skill contrato-rpc-front §3): "sem
 * antecipação nenhuma" é um estado normal, não uma falha — normaliza para `[]`.
 */
export const antecipacoesMensalSchema = z
  .array(antecipacaoMensalRowSchema)
  .nullable()
  .transform(v => v ?? [])

export type AntecipacaoMensalRow = z.infer<typeof antecipacaoMensalRowSchema>

// ── Mescla com a série mensal do fluxo ───────────────────────────────────────

/** O mínimo que a mescla precisa de uma linha do fluxo mensal. */
export interface LinhaFluxoComEntrada {
  mes:               string   // 'YYYY-MM'
  entrada_efetivada: number
}

export interface AntecipacaoMesclada {
  /** Parte das entradas efetivadas que vira âmbar: min(líquido, entradas), nunca negativa. */
  antecipacao: number
  /** Entradas efetivadas − antecipação: o segmento verde (topo) da barra. */
  entrada_efetivada_sem_antecipacao: number
  /** O líquido do registro no mês, SEM clamp (é o que o tooltip cita quando excede). */
  antecipacaoLiquidaRegistrada: number
  /** O registro do mês é maior que as entradas efetivadas — a cor foi limitada. */
  antecipacaoExcedeu: boolean
  /** antecipação / entradas efetivadas; `null` quando o mês não tem entrada efetivada. */
  pctAntecipacao: number | null
}

/**
 * Acrescenta a cada linha do fluxo mensal a fatia de antecipação do mês.
 *
 * - Mês sem registro = 0 (a barra fica toda verde, como antes).
 * - Mês do registro que NÃO existe em `rows` (fora da janela da RPC mensal) é ignorado.
 * - Linhas repetidas do mesmo mês no registro são somadas (defensivo: a RPC já agrega).
 * - Preserva todos os campos da linha original (`T`) — as demais séries não mudam.
 */
export function mesclarAntecipacoes<T extends LinhaFluxoComEntrada>(
  rows: readonly T[],
  antecipacoes: readonly AntecipacaoMensalRow[] | null | undefined,
): Array<T & AntecipacaoMesclada> {
  const liquidoPorMes = new Map<string, number>()
  for (const a of antecipacoes ?? []) {
    liquidoPorMes.set(a.mes, (liquidoPorMes.get(a.mes) ?? 0) + a.liquido)
  }

  return rows.map(r => {
    const liquido = liquidoPorMes.get(r.mes) ?? 0
    const teto = Math.max(r.entrada_efetivada, 0)
    const antecipacao = Math.min(Math.max(liquido, 0), teto)
    return {
      ...r,
      antecipacao,
      entrada_efetivada_sem_antecipacao: r.entrada_efetivada - antecipacao,
      antecipacaoLiquidaRegistrada: liquido,
      antecipacaoExcedeu: liquido > teto,
      pctAntecipacao: r.entrada_efetivada > 0 ? antecipacao / r.entrada_efetivada : null,
    }
  })
}
