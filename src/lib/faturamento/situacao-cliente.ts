// Situação do cliente no Cadastro de Clientes Corporativos (v6.5.2). Fonte ÚNICA, isomórfica
// (sem server-only): o import (parser no navegador), a tela do Cadastro e o envio de e-mail
// (Server Actions) leem a MESMA regra — nunca duplicar a comparação de string.
//
// Três estados, espelhando a planilha oficial ("Faturamento Clientes - Corporativo.xlsx"):
//   • ativo    — cliente com contrato;
//   • eventual — cliente SEM contrato que fatura de vez em quando (planilha: CONTRATO = "Não");
//   • inativo  — não fatura mais.
// Até a v6.5.1 só existiam ativo/inativo e o EVENTUAL da planilha virava NULL no import — e NULL
// é tratado como inativo no envio (e-mail recusado). Decisão do Yan (10/11/2026): eventual é
// ENVIÁVEL, como ativo.

import { normalizeHeader } from '@/lib/carga/vendas-parser'

export type SituacaoCliente = 'ativo' | 'eventual' | 'inativo'

export const SITUACOES_CLIENTE: { valor: SituacaoCliente; rotulo: string }[] = [
  { valor: 'ativo',    rotulo: 'Ativo' },
  { valor: 'eventual', rotulo: 'Eventual' },
  { valor: 'inativo',  rotulo: 'Inativo' },
]

/** Texto da planilha → situação canônica; vazio/desconhecido → null.
 *  MATCH EXATO (após minúsculo + sem acento + trim), FAIL-CLOSED: como ativo e eventual recebem
 *  e-mail de fatura de cliente externo, "desativado"/"não ativo"/"ativo (suspenso)" NÃO podem virar
 *  'ativo' por conter "ativ" (era o `includes` da v4.33.0 — revisor v6.5.2). A planilha oficial traz
 *  exatamente ATIVO / INATIVO / EVENTUAL. */
export function normalizarSituacaoCliente(v: string | null | undefined): SituacaoCliente | null {
  if (!v) return null
  const n = normalizeHeader(v) // minúsculo + sem acento + trim
  return n === 'ativo' || n === 'eventual' || n === 'inativo' ? n : null
}

// ── Contrato (v6.5.2) ──────────────────────────────────────────────────────────────────────
// Coluna CONTRATO da planilha ("Sim"/"Não"). Gravada canônica: 'sim' | 'nao' | NULL (CHECK na 0307).
// É REFERÊNCIA (Visão A): exibida no Cadastro, não muda emissão nem envio.

export type ContratoCliente = 'sim' | 'nao'

export const CONTRATO_OPCOES: { valor: ContratoCliente; rotulo: string }[] = [
  { valor: 'sim', rotulo: 'Sim' },
  { valor: 'nao', rotulo: 'Não' },
]

/** "Sim"/"Não" (qualquer caixa/acento) → 'sim' | 'nao'; vazio/desconhecido → null. */
export function normalizarContrato(v: string | null | undefined): ContratoCliente | null {
  if (!v) return null
  const n = normalizeHeader(v)
  if (n === 'sim' || n === 's') return 'sim'
  if (n === 'nao' || n === 'n') return 'nao'
  return null
}

/** O cliente pode receber a fatura por e-mail pelo caminho do Cadastro? (ativo OU eventual).
 *  Lê o valor GRAVADO no banco (já canônico); tolera caixa/espaço por defesa. */
export function situacaoEnviavel(s: string | null | undefined): boolean {
  const n = (s ?? '').trim().toLowerCase()
  return n === 'ativo' || n === 'eventual'
}
