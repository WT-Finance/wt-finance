'use server'

// Calculadora de Rateio (v4.28.0) — server action do cruzamento.
//
// READ-ONLY: só lê a base via a RPC cruzar_vendas_setor (migration 0159) e devolve
// os pares venda→setor encontrados. NÃO grava nada. O arquivo da fatura NÃO chega
// aqui — o cliente parseia e manda só os números distintos. Gate por área
// 'financeiro/gerencial' (requireAreaAction) + a própria RPC re-checa (exigir_acesso).

import { getServerClient } from '@/lib/supabase/server'
import { requireAreaAction } from '@/lib/auth/sessao'
import { parseRpc, cruzarVendasSetorSchema, type CruzarVendasSetor } from '@/lib/schemas-rpc'

export async function cruzarVendasSetor(vendas: string[]): Promise<CruzarVendasSetor> {
  await requireAreaAction('financeiro/gerencial')
  const distinct = Array.from(new Set(vendas.filter(v => v && v.trim() !== '')))
  if (distinct.length === 0) return []

  const db = await getServerClient()
  // `as any`: RPC nova ainda não está nos tipos gerados do supabase (padrão do projeto).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await (db.rpc as any)('cruzar_vendas_setor', { p_vendas: distinct })
  return parseRpc(cruzarVendasSetorSchema, res, 'cruzar_vendas_setor') ?? []
}
