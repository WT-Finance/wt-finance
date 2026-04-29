/**
 * load-metas.ts
 *
 * Insere as metas mensais em app.meta_setor.
 *
 * Valores de 2026 são reais (fonte='real'), fornecidos pelos gestores — Anexo A.3.
 * Valores de 2024 e 2025 são fictícios (fonte='ficticia'):
 *   meta_2024 = meta_2026 / 1.15^2   (÷ 1.3225)
 *   meta_2025 = meta_2026 / 1.15^1   (÷ 1.15)
 */

import { adminClient } from '@/lib/supabase/admin'

// Metas reais de 2026 — Anexo A.3 do briefing
// ⚠️  ATENÇÃO: os valores abaixo são PLACEHOLDERS.
//    Substitua cada número pelos valores reais do Anexo A.3 antes de rodar o seed.
// Estrutura: { [setor_macro]: { [mes 1-12]: valor } }
const METAS_2026: Record<string, Record<number, number>> = {
  Lazer: {
     1: 280000,
     2: 260000,
     3: 310000,
     4: 290000,
     5: 320000,
     6: 300000,
     7: 350000,
     8: 330000,
     9: 295000,
    10: 310000,
    11: 340000,
    12: 400000,
  },
  Weddings: {
     1: 180000,
     2: 170000,
     3: 200000,
     4: 190000,
     5: 210000,
     6: 220000,
     7: 195000,
     8: 185000,
     9: 175000,
    10: 190000,
    11: 215000,
    12: 230000,
  },
  Corporativo: {
     1: 120000,
     2: 110000,
     3: 130000,
     4: 125000,
     5: 135000,
     6: 140000,
     7: 115000,
     8: 120000,
     9: 130000,
    10: 135000,
    11: 145000,
    12: 160000,
  },
}

type MetaRow = {
  setor_macro_id: number
  ano: number
  mes: number
  valor_meta: number
  fonte: 'real' | 'ficticia'
}

export async function loadMetas(): Promise<void> {
  // Busca os IDs dos setores macro
  const { data: setores, error: errSetores } = await adminClient
    .schema('analytics')
    .from('dim_setor_macro')
    .select('id, nome')

  if (errSetores || !setores) {
    throw new Error(`Erro ao buscar dim_setor_macro: ${errSetores?.message}`)
  }

  const setorIdPorNome = Object.fromEntries(setores.map(s => [s.nome, s.id]))

  const rows: MetaRow[] = []

  for (const [nomeSetor, mesesValores] of Object.entries(METAS_2026)) {
    const setorId = setorIdPorNome[nomeSetor]
    if (!setorId) throw new Error(`Setor macro não encontrado: ${nomeSetor}`)

    for (const [mesStr, meta2026] of Object.entries(mesesValores)) {
      const mes = Number(mesStr)

      // 2026 — real
      rows.push({
        setor_macro_id: setorId,
        ano: 2026,
        mes,
        valor_meta: meta2026,
        fonte: 'real',
      })

      // 2025 — fictício: ÷ 1.15
      rows.push({
        setor_macro_id: setorId,
        ano: 2025,
        mes,
        valor_meta: Math.round(meta2026 / 1.15),
        fonte: 'ficticia',
      })

      // 2024 — fictício: ÷ 1.15²
      rows.push({
        setor_macro_id: setorId,
        ano: 2024,
        mes,
        valor_meta: Math.round(meta2026 / 1.3225),
        fonte: 'ficticia',
      })
    }
  }

  const { error } = await adminClient
    .schema('app')
    .from('meta_setor')
    .insert(rows)

  if (error) throw new Error(`Erro ao inserir metas: ${error.message}`)

  console.log(`  ✓ ${rows.length} linhas inseridas em app.meta_setor`)
}
