// Calculadora de Rateio (v4.28.0) — tipos compartilhados.
//
// INVARIANTE central: o setor LÓGICO usa o valor REAL da base ('Lazer'); a
// conversão 'Lazer'→'Trips' é SÓ na camada de EXIBIÇÃO (componente). Cruzar/casar
// por 'Trips' jogaria todas as vendas de lazer no balde 'Não identificado'.

/** Setor lógico (interno): os 3 valores reais de setor_macro + o balde de não-casados. */
export type SetorLogico = 'Corporativo' | 'Lazer' | 'Weddings' | 'Não identificado'

/** Os 3 setores REAIS da base (valores de analytics.vw_vendas_agregadas.setor_macro). */
export const SETORES_REAIS = ['Corporativo', 'Lazer', 'Weddings'] as const
export type SetorReal = (typeof SETORES_REAIS)[number]

/** Ordem fixa dos baldes na exibição (Não identificado por último). */
export const SETORES_LOGICOS: readonly SetorLogico[] = [
  'Corporativo', 'Lazer', 'Weddings', 'Não identificado',
]

export function ehSetorReal(s: string): s is SetorReal {
  return (SETORES_REAIS as readonly string[]).includes(s)
}

/** Uma linha da fatura, já extraída (venda como string p/ casar; valor BRL com sinal). */
export interface LinhaFatura {
  /** nº da linha na planilha (1-based, cabeçalho = 1) — referência p/ o usuário. */
  linha:        number
  /** Venda Nº como string (cast int→text); null se a célula não converte. */
  venda_numero: string | null
  /** Valor BRL COM SINAL (a fatura é negativa = saída); null se não converte. */
  valor:        number | null
}

export interface ParseFaturaResult {
  linhas:       LinhaFatura[]
  /** Colunas obrigatórias ausentes no cabeçalho ('Venda Nº' / 'Valor'). Vazio = ok. */
  faltando:     string[]
}

/** Uma linha já resolvida ao seu setor lógico (entra no rateio: tem valor). */
export interface LinhaResolvida {
  linha:        number
  venda_numero: string | null
  valor:        number
  setor:        SetorLogico
}

export interface Balde {
  setor:  SetorLogico
  valor:  number
  /** Fração do total (valor / total). 0 quando total = 0. */
  pct:    number
  linhas: number
}

export interface ResultadoRateio {
  /** Sempre os 4 baldes, na ordem de SETORES_LOGICOS (Não identificado por último). */
  baldes:     Balde[]
  total:      number
  resolvidas: LinhaResolvida[]
  /** Linhas SEM valor válido — não entram no rateio (carregam 0); contadas à parte. */
  ignoradas:  number
  /** soma(baldes) == total (partição exata). Tolerância de meio centavo p/ ruído de float. */
  fecha:      boolean
}
