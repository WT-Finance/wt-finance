import 'server-only'
import { getServerClient } from '@/lib/supabase/server'
import { buscarUltimaSincronizacaoMonde } from '@/lib/metas/ultima-sincronizacao'
import { parseRpc, executivaKpisSchema, metasListarSchema, metasRitmoDiarioSchema } from '@/lib/schemas-rpc'
import { format } from 'date-fns'
import { resolverPeriodoMetas, type PresetMetas } from '@/lib/metas/periodo-metas'
import { calcularRitmo, type PontoDia } from '@/lib/metas/ritmo'
import { rpcMetas } from '@/lib/metas/rpc-metas'
import { PAINEIS, metasDoSetor, type MetaRow } from '@/lib/metas/paineis'
import type { AcompanhamentoData, PainelSetor } from '@/components/metas/tipos'
import type { SumarioSubsetorItem } from '@/types/api'

// FONTE ÚNICA DO ACOMPANHAMENTO DE METAS (v5.1.0) — orquestração extraída de
// src/app/metas/page.tsx para ser consumida por DOIS lugares sem duplicar cálculo:
// a página /metas (Acompanhamento) e a pele /metas/tv (Modo TV). Um só motor
// (get_executiva_kpis ×4 + metas_listar + calcularRitmo; Group = soma computada) →
// os números batem por construção nas duas telas. NÃO há terceiro caminho de dados.
// O GUARD de área fica em cada PÁGINA (esta função só busca dado).
//
// PAINEIS/MetaRow/metasDoSetor vivem em './paineis' (client-safe) — este arquivo é
// `server-only`; a seção Comparativo (v5.6.1) os reusa sem duplicar (§1 do patch).

/** Monta o dado completo do Acompanhamento para um preset de período. Reusado por
 *  /metas e /metas/tv — mesma orquestração, mesmos números. */
export async function carregarAcompanhamento(preset: PresetMetas): Promise<AcompanhamentoData> {
  const { from, to, label } = resolverPeriodoMetas(preset)
  const eParcial = to >= format(new Date(), 'yyyy-MM-dd')

  const db = await getServerClient()

  // Anos que o período toca (1 ou 2) → uma metas_listar por ano.
  const anos = [...new Set([Number(from.slice(0, 4)), Number(to.slice(0, 4))])]

  const [kpisResArr, metasResArr, ritmoResArr, sumRes] = await Promise.all([
    Promise.all(PAINEIS.map(p => db.rpc('get_executiva_kpis', {
      p_from: from, p_to: to, p_setor: p.key,
    }))),
    Promise.all(anos.map(a => rpcMetas(db, 'metas_listar', { p_ano: a }))),
    Promise.all(PAINEIS.map(p => rpcMetas(db, 'metas_ritmo_diario', { p_from: from, p_to: to, p_setor: p.key }))),
    // Contratos de casamento (subsetor COMERCIAL de Weddings) — mesma RPC do card da
    // Performance de Weddings. Fail-safe: erro/negação (a RPC exige 'performance/weddings')
    // degrada p/ null. (No Modo TV o usuário não tem essa área → 'Contratos' nem aparece.)
    db.rpc('get_sumario_subsetor', { p_from: from, p_to: to }),
  ])

  const contratosWeddings: number | null = sumRes.error
    ? null
    : (((sumRes.data as { subsetores?: SumarioSubsetorItem[] } | null)?.subsetores ?? [])
        .find(s => s.subsetor === 'COMERCIAL')?.n_contratos ?? null)

  // "Última atualização" = frescor do espelho Monde = última SINCRONIZAÇÃO (não o último dado
  // mudado). Helper compartilhado com /metas/comparacao (v5.1.9); fail-safe → null (o topo omite).
  const ultimaAtualizacao = await buscarUltimaSincronizacaoMonde()

  // Metas de todos os anos do período (fonte='real', filtrada pela RPC).
  const metaRows: MetaRow[] = metasResArr.flatMap((res, i) => {
    const parsed = parseRpc(metasListarSchema, res, `metas_listar ${anos[i]}`)
    if (!parsed) return []
    return parsed.metas.map(m => ({
      ano: parsed.ano,
      setor_nome: m.setor_nome,
      mes: m.mes,
      valor_meta: m.valor_meta,
      pct_receita: m.pct_receita,
    }))
  })

  const setores: PainelSetor[] = PAINEIS.map((p, i) => {
    const kpis = parseRpc(executivaKpisSchema, kpisResArr[i], `get_executiva_kpis ${p.key}`)
    const ritmoData = parseRpc(metasRitmoDiarioSchema, ritmoResArr[i], `metas_ritmo_diario ${p.key}`)
    const serie: PontoDia[] = (ritmoData?.serie ?? []).map(d => ({ data: d.data, valor: d.valor_total }))
    const ritmo = calcularRitmo({
      from, to,
      ultimaVenda: ritmoData?.ultima_venda ?? null,
      metas: metasDoSetor(metaRows, p.key),
      serie,
    })
    return {
      key: p.key,
      display: p.display,
      cor: p.cor,
      faturamento:    kpis?.faturamento.valor ?? null,
      receita:        kpis?.receita.valor ?? null,
      margemPct:      kpis?.margem_pct.valor ?? null,
      contratos:      p.key === 'Weddings' ? contratosWeddings : null,
      ritmo,
    }
  })

  const primeiroRitmo = parseRpc(metasRitmoDiarioSchema, ritmoResArr[0], 'metas_ritmo_diario ultima')
  const ultimaVenda = primeiroRitmo?.ultima_venda ?? null

  return { preset, periodoLabel: label, from, to, eParcial, ultimaVenda, ultimaAtualizacao, setores }
}
