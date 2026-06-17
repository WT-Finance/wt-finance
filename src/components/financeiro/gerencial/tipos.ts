// Tipos compartilhados do Fluxo de Caixa Gerencial (v4.21.0).

export type PapelConta = 'isolada' | 'reserva' | null

// Rótulo de exibição do papel (v4.22). A CHAVE no banco continua 'isolada'/'reserva';
// só o texto mudou para a linguagem de negócio "Principal"/"Rendimento".
export const PAPEL_LABEL: Record<string, string> = { '': '—', isolada: 'Principal', reserva: 'Rendimento' }

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
