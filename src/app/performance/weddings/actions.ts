'use server'

import { getServerClient } from '@/lib/supabase/server'
import { unwrapRpc } from '@/lib/rpc'
import { parseRpc, executivaKpisSchema, tendenciaMargemSchema } from '@/lib/schemas-rpc'
import type { MixProduto, SumarioSubsetor } from '@/types/api'

export async function fetchWeddingsKpis(
  from: string, to: string,
  antFrom: string, antTo: string,
  yoyFrom: string, yoyTo: string,
) {
  const db = getServerClient()
  const [kpisRes, tendRes, sumarioRes, sumarioYoyRes] = await Promise.all([
    db.rpc('get_executiva_kpis', {
      p_from: from, p_to: to, p_setor: 'Weddings',
      p_ant_from: antFrom, p_ant_to: antTo,
      p_yoy_from: yoyFrom, p_yoy_to: yoyTo,
    }),
    db.rpc('get_tendencia_margem', { p_from: from, p_to: to, p_setor: 'Weddings' }),
    db.rpc('get_sumario_subsetor', { p_from: from, p_to: to }),
    db.rpc('get_sumario_subsetor', { p_from: yoyFrom, p_to: yoyTo }),
  ])
  return {
    kpis:       parseRpc(executivaKpisSchema, kpisRes, 'get_executiva_kpis'),       // F7
    tendencia:  parseRpc(tendenciaMargemSchema, tendRes, 'get_tendencia_margem'),   // F7
    sumario:    unwrapRpc<SumarioSubsetor>(sumarioRes, 'get_sumario_subsetor'),
    sumarioYoy: unwrapRpc<SumarioSubsetor>(sumarioYoyRes, 'get_sumario_subsetor (yoy)'),
  }
}

export async function fetchWeddingsMix(from: string, to: string) {
  const db = getServerClient()
  const res = await db.rpc('get_mix_produto', { p_from: from, p_to: to, p_setor: 'Weddings', p_limite: 10 })
  return unwrapRpc<MixProduto>(res, 'get_mix_produto')
}
