'use server'

import { getServerClient } from '@/lib/supabase/server'
import type { ExecutivaKpis, TendenciaMargem, MixProduto, SumarioSubsetor } from '@/types/api'

export async function fetchWeddingsKpis(
  from: string, to: string,
  antFrom: string, antTo: string,
  yoyFrom: string, yoyTo: string,
) {
  const db = getServerClient()
  const [kpisRes, tendRes, sumarioRes] = await Promise.all([
    db.rpc('get_executiva_kpis', {
      p_from: from, p_to: to, p_setor: 'Weddings',
      p_ant_from: antFrom, p_ant_to: antTo,
      p_yoy_from: yoyFrom, p_yoy_to: yoyTo,
    }),
    db.rpc('get_tendencia_margem', { p_from: from, p_to: to, p_setor: 'Weddings' }),
    db.rpc('get_sumario_subsetor', { p_from: from, p_to: to }),
  ])
  return {
    kpis:      kpisRes.error    ? null : kpisRes.data    as unknown as ExecutivaKpis,
    tendencia: tendRes.error    ? null : tendRes.data    as unknown as TendenciaMargem,
    sumario:   sumarioRes.error ? null : sumarioRes.data as unknown as SumarioSubsetor,
  }
}

export async function fetchWeddingsMix(from: string, to: string) {
  const db = getServerClient()
  const res = await db.rpc('get_mix_produto', { p_from: from, p_to: to, p_setor: 'Weddings', p_limite: 10 })
  return res.error ? null : res.data as unknown as MixProduto
}

export async function fetchWeddingsComposicao(from: string, to: string) {
  const db = getServerClient()
  const res = await db.rpc('get_sumario_subsetor', { p_from: from, p_to: to })
  return res.error ? null : res.data as unknown as SumarioSubsetor
}
