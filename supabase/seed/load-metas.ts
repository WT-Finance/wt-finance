/**
 * load-metas.ts
 *
 * Insere as metas mensais via RPC inserir_metas() — evita depender da
 * exposição do schema analytics via PostgREST.
 *
 * Valores de 2026 são reais (fonte='real'), fornecidos pelos gestores — Anexo A.3.
 * Valores de 2024 e 2025 são fictícios (fonte='ficticia'):
 *   meta_2024 = meta_2026 / 1.15^2   (÷ 1.3225)
 *   meta_2025 = meta_2026 / 1.15^1   (÷ 1.15)
 */

import { getAdminClient } from '@/lib/supabase/admin'

// Metas reais de 2026 — Anexo A.3 do briefing
// "Trips" no briefing corresponde ao setor_macro nome='Lazer' (display_nome='Trips')
// Estrutura: { [setor_macro]: { [mes 1-12]: valor } }
const METAS_2026: Record<string, Record<number, number>> = {
  Lazer: {
     1: 1730750.02,
     2: 2499737.96,
     3: 4976144.14,
     4: 2367602.37,
     5: 4568894.42,
     6: 3465682.65,
     7: 2729013.05,
     8: 2654149.86,
     9: 2566020.89,
    10: 2665341.68,
    11: 2507327.88,
    12: 2090730.12,
  },
  Corporativo: {
     1: 1268695.00,
     2: 1268694.80,
     3: 1482647.30,
     4: 1450430.10,
     5: 1765413.60,
     6: 1394935.90,
     7: 1016725.60,
     8: 1276959.00,
     9: 1059222.00,
    10: 1228347.20,
    11: 1579303.90,
    12: 1140608.20,
  },
  Weddings: {
     1: 2048746.41,
     2: 2048746.41,
     3: 2299718.93,
     4: 1762255.41,
     5: 2136683.63,
     6: 1811492.12,
     7: 1989324.96,
     8: 2504343.40,
     9: 2008704.18,
    10: 1620179.91,
    11: 2083088.39,
    12: 1504452.79,
  },
}

type MetaPayload = {
  setor_macro_nome: string
  ano: number
  mes: number
  valor_meta: number
  fonte: 'real' | 'ficticia'
}

export async function loadMetas(): Promise<void> {
  const rows: MetaPayload[] = []

  for (const [nomeSetor, mesesValores] of Object.entries(METAS_2026)) {
    for (const [mesStr, meta2026] of Object.entries(mesesValores)) {
      const mes = Number(mesStr)

      rows.push({ setor_macro_nome: nomeSetor, ano: 2026, mes, valor_meta: meta2026,              fonte: 'real' })
      rows.push({ setor_macro_nome: nomeSetor, ano: 2025, mes, valor_meta: Math.round(meta2026 / 1.15),     fonte: 'ficticia' })
      rows.push({ setor_macro_nome: nomeSetor, ano: 2024, mes, valor_meta: Math.round(meta2026 / 1.3225),   fonte: 'ficticia' })
    }
  }

  const client = getAdminClient()
  const bound = (client.rpc as unknown as (fn: string, args: unknown) => Promise<{ error: { message: string } | null }>).bind(client)
  const { error } = await bound('inserir_metas', { p_metas: rows })

  if (error) throw new Error(`Erro ao inserir metas: ${error.message}`)

  console.log(`  ✓ ${rows.length} linhas inseridas em app.meta_setor`)
}
