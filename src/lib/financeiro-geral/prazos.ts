// Prazos médios (v6.4.0) — módulo PURO sobre o retorno de `get_geral_prazos`.
//
// Método (decisão do Yan, GATE 0 — clientes × fornecedores, saldo do Aberto):
//   PMR = a receber de clientes (grupo "Receita de Vendas") ÷ entrada de clientes (ENT_H, 12 meses) × 365
//   PMP = repasse a pagar (grupo "Repasse")                 ÷ pagamento a fornecedor (PAG_H, 12 meses) × 365
//   Folga = PMP − PMR  (positiva: a empresa paga depois de receber; negativa: paga antes de receber)
// A JANELA são os 12 meses fechados anteriores ao mês da data da foto — explícita na tela. Despesas
// ficam fora. Os saldos vêm das cargas do Aberto e a série de fotos começa no dia em que a migration foi
// aplicada (`historico_desde`, vindo da RPC — nunca uma data fixa daqui): ela CRESCE a cada carga e,
// antes da 1ª foto, não há ponto — nunca zero fabricado.

import { fmtDate } from '@/lib/fmt'
import type { Prazos } from './schemas'

const DIAS_ANO = 365

/** saldo ÷ fluxo × 365, em dias, 1 casa. `null` com fluxo zero ou inválido (nunca Infinity). */
export function prazoMedio(saldo: number, fluxo12m: number): number | null {
  if (!Number.isFinite(saldo) || !Number.isFinite(fluxo12m) || Math.abs(fluxo12m) < 0.005) return null
  return Math.round(((Math.abs(saldo) / Math.abs(fluxo12m)) * DIAS_ANO) * 10) / 10
}

const nfDias = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

/** "45,3 dias"; `null` → travessão. */
export function fmtDias(v: number | null): string {
  if (v === null) return '—'
  const r = Math.round(v * 10) / 10
  const n = r === 0 ? 0 : r // normaliza -0
  return `${nfDias.format(n)} dias`
}

/** "+12,5 dias" / "−3,0 dias" (menos tipográfico); `null` → travessão. */
export function fmtFolga(v: number | null): string {
  if (v === null) return '—'
  const r = Math.round(v * 10) / 10
  const sinal = r > 0 ? '+' : r < 0 ? '−' : ''
  return `${sinal}${nfDias.format(Math.abs(r))} dias`
}

/** "12 meses fechados: 01/10/2025 a 30/09/2026" — a janela dita explicitamente. */
export function rotuloJanela(atual: Pick<NonNullable<Prazos['atual']>, 'janela_de' | 'janela_ate'>): string {
  return `12 meses fechados, de ${fmtDate(atual.janela_de)} a ${fmtDate(atual.janela_ate)}`
}

export type SentidoFolga = 'favoravel' | 'desfavoravel' | 'neutro'

/** Lê a folga em palavras. Positiva = paga depois de receber (folga de caixa); negativa = financia
 *  o cliente com o próprio caixa. `null` = sem prazo calculável. */
export function interpretarFolga(folga: number | null): { texto: string; sentido: SentidoFolga } | null {
  if (folga === null) return null
  const r = Math.round(folga * 10) / 10
  if (r === 0) return { texto: 'Recebe e paga no mesmo prazo médio', sentido: 'neutro' }
  return r > 0
    ? { texto: 'Paga os fornecedores depois de receber dos clientes', sentido: 'favoravel' }
    : { texto: 'Paga os fornecedores antes de receber dos clientes', sentido: 'desfavoravel' }
}

export interface PontoPrazo {
  /** 'AAAA-MM-DD' */
  data: string
  /** "15/10" */
  rotulo: string
  pmr: number | null
  pmp: number | null
  folga: number | null
}

/** A série pelas fotos, do mais antigo ao mais recente. Um ponto só é uma série legítima no começo
 *  do histórico — a tela mostra o ponto e diz "histórico desde". */
export function pontosDaSerie(serie: Prazos['serie']): PontoPrazo[] {
  return [...serie]
    .sort((a, b) => a.data.localeCompare(b.data))
    .map(s => {
      const [, m, d] = s.data.split('-')
      return { data: s.data, rotulo: `${d}/${m}`, pmr: s.pmr, pmp: s.pmp, folga: s.folga }
    })
}

/** A foto atual confere com o método? (PMR/PMP recalculados dos saldos e fluxos; tolerância de 0,1 dia
 *  — a RPC arredonda a 1 casa.) Serve de teste de contrato da definição, não de filtro de tela. */
export function prazosConferem(a: NonNullable<Prazos['atual']>): boolean {
  const pmr = prazoMedio(a.saldo_receber, a.entrada_12m)
  const pmp = prazoMedio(a.saldo_pagar, a.pagamento_12m)
  const perto = (x: number | null, y: number | null) => (x === null || y === null ? x === y : Math.abs(x - y) <= 0.1)
  const folgaOk = a.folga === null ? pmr === null || pmp === null : pmp !== null && pmr !== null && Math.abs(a.folga - (pmp - pmr)) <= 0.15
  return perto(a.pmr, pmr) && perto(a.pmp, pmp) && folgaOk
}
