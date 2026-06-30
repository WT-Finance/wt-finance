'use server'

// Faturamento Corporativo — Fase 1a (v4.30.0). Server action do CRUZAMENTO (read-only).
// Recebe os nomes distintos da coluna Pessoa, chama buscar_pessoas (v4.29.0, gate
// estendido p/ esta área na 0161) e devolve os cadastros. NÃO chama o Asaas, NÃO grava
// nada — a classificação e a tela de revisão acontecem no cliente. Emissão = Fase 1b.

import { getServerClient } from '@/lib/supabase/server'
import { requireAreaAction } from '@/lib/auth/sessao'
import { parseRpc, buscarPessoasSchema } from '@/lib/schemas-rpc'
import type { PessoaCadastro } from '@/lib/faturamento/tipos'

export async function cruzarFaturamento(nomes: string[]): Promise<PessoaCadastro[]> {
  await requireAreaAction('financeiro/faturamento-corp')
  const distinct = Array.from(new Set(nomes.map(n => (n ?? '').trim()).filter(Boolean)))
  if (distinct.length === 0) return []

  const db = await getServerClient()
  // `as any`: RPC não está nos tipos gerados do supabase (padrão do projeto).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await (db.rpc as any)('buscar_pessoas', { p_nomes: distinct })
  return (parseRpc(buscarPessoasSchema, res, 'buscar_pessoas') ?? []) as PessoaCadastro[]
}
