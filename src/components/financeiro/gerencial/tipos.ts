// Tipos compartilhados do Fluxo de Caixa Gerencial (v4.21.0).

export type PapelConta = 'isolada' | 'reserva' | null

/** Conta gerenciável (analytics.gerencial_saldos). */
export interface Conta {
  conta:       string
  saldo:       number
  ordem:       number
  ativo?:      boolean
  limite:      number | null      // crédito; alimenta a faixa amarela (só a isolada usa)
  consolidado: boolean            // entra na soma do "Consolidado"
  papel:       PapelConta         // 'isolada' (coluna individual) | 'reserva' (somada à parte) | null
}

export interface DiaProjecao {
  data:      string   // YYYY-MM-DD
  a_receber: number
  a_pagar:   number
  resultado: number
}
