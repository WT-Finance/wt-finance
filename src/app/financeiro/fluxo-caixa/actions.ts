'use server'

// Server Actions do Fluxo de Caixa PROJETADO (v5.2.0/Onda 1, ajuste do checkpoint do Yan).
// Hoje só a edição do Saldo de Caixa PRÓPRIO (financeiro.saldo_caixa, migration 0194),
// desconectado de analytics.gerencial_saldos — as duas telas (Projetado × Gerencial) evoluem
// separadas a partir daqui. Mesmo padrão de
// src/app/financeiro/fluxo-caixa/gerencial/actions.ts: cliente de SESSÃO (getServerClient,
// NÃO service role) — a RPC já exige app.exigir_acesso(['financeiro/fluxo-caixa']) no banco
// (defesa em profundidade); o guard de superfície (requireAreaAction) roda antes, por UX.

import { revalidatePath } from 'next/cache'
import { getServerClient } from '@/lib/supabase/server'
import { requireAreaAction } from '@/lib/auth/sessao'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rpc = (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: { message: string } | null }>

async function rpc(fn: string, args?: Record<string, unknown>) {
  const db = await getServerClient()
  return (db.rpc as unknown as Rpc)(fn, args)
}

/** 'yyyy-MM-dd' de HOJE no fuso de São Paulo (mesmo idioma de gerencial/actions.ts). */
function hojeSP(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
}

/**
 * Atualiza saldo + data (RPC `atualizar_saldo_caixa`, migration 0194) de uma conta da tabela
 * PRÓPRIA do Fluxo Projetado. Os DOIS campos são gravados juntos — o caller (modal do drill em
 * saldo-caixa-kpi.tsx) passa o valor CORRENTE do campo que não está sendo editado.
 * `dataSaldo` nulo/vazio assume HOJE (SP) — mesma regra de `updateSaldo` em gerencial/actions.ts.
 */
export async function atualizarSaldoCaixaAction(
  conta: string, saldo: number, dataSaldo: string | null,
): Promise<{ ok: true } | { error: string }> {
  await requireAreaAction('financeiro/fluxo-caixa')
  try {
    const p_data_saldo = dataSaldo == null || dataSaldo === '' ? hojeSP() : dataSaldo
    const { error } = await rpc('atualizar_saldo_caixa', { p_conta: conta, p_saldo: saldo, p_data_saldo })
    if (error) return { error: error.message }
    revalidatePath('/financeiro/fluxo-caixa')
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao atualizar saldo de caixa' }
  }
}
