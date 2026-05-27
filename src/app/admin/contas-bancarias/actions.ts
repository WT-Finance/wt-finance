'use server'
import { getAdminClient } from '@/lib/supabase/admin'

export async function salvarClassificacaoContas(
  updates: Array<{ id: number; tipo: string; eh_cartao_credito: boolean }>
) {
  const db = getAdminClient()
  for (const u of updates) {
    await (db as any)
      .from('financeiro.dim_conta_bancaria')
      .update({ tipo: u.tipo, eh_cartao_credito: u.eh_cartao_credito })
      .eq('id', u.id)
  }
}
