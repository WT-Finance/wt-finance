import { requireArea } from '@/lib/auth/sessao'
import { getServerClient } from '@/lib/supabase/server'
import { parseRpc, executivaKpisSchema, metasListarSchema, metasRitmoDiarioSchema } from '@/lib/schemas-rpc'
import { resolverPeriodoCompleto, formatarLabelPeriodo } from '@/lib/periodo'
import { calcularRitmo, type MetaMensal, type PontoDia } from '@/lib/metas/ritmo'
import { rpcMetas } from '@/lib/metas/rpc-metas'
import { SETOR_MARCA_COLORS } from '@/lib/config'
import AcompanhamentoContent from '@/components/metas/acompanhamento-content'
import type { PainelSetor } from '@/components/metas/tipos'

// Acompanhamento das Metas (v5.0.0) — substitui o dashboard v1 legado em /metas.
// FONTE ÚNICA DO REAL: get_executiva_kpis por setor (mesmo motor da Performance).
// A meta/pró-rata/ritmo vêm do módulo puro calcularRitmo. Group é COMPUTADO (soma
// dos 3 setores), nunca cadastrado. Tema group (rota não-setorial). Área: leitura
// com OR ['metas/acompanhamento','metas'].

interface SearchParams {
  preset?: string
  from?:   string
  to?:     string
}

// Ordem e identidade dos painéis. Group = barra neutra; setores usam a cor de
// identidade cross-setor (SETOR_COLORS, ADR-0103). Chave = nome interno do banco
// (Lazer); display = 'Trips' etc.
const PAINEIS: { key: string; display: string; cor: string }[] = [
  { key: 'todos',       display: 'Group',       cor: 'var(--text-muted)' },
  { key: 'Lazer',       display: 'Trips',       cor: SETOR_MARCA_COLORS.Lazer },
  { key: 'Weddings',    display: 'Weddings',    cor: SETOR_MARCA_COLORS.Weddings },
  { key: 'Corporativo', display: 'Corporativo', cor: SETOR_MARCA_COLORS.Corporativo },
]

interface MetaRow {
  ano: number
  setor_nome: string
  mes: number
  valor_meta: number
  pct_receita: number | null
}

/** Metas mensais de um setor (Group = soma por mês; pct ponderado por VT). */
function metasDoSetor(rows: MetaRow[], key: string): MetaMensal[] {
  if (key !== 'todos') {
    return rows
      .filter(r => r.setor_nome === key)
      .map(r => ({ ano: r.ano, mes: r.mes, valorMeta: r.valor_meta, pctReceita: r.pct_receita }))
  }
  // Group: soma VT por (ano,mes); pct = média ponderada por VT (só meses/setores com alvo).
  const porMes = new Map<string, { ano: number; mes: number; vt: number; vtComPct: number; recAlvo: number }>()
  for (const r of rows) {
    const k = `${r.ano}-${r.mes}`
    const acc = porMes.get(k) ?? { ano: r.ano, mes: r.mes, vt: 0, vtComPct: 0, recAlvo: 0 }
    acc.vt += r.valor_meta
    if (r.pct_receita != null) {
      acc.vtComPct += r.valor_meta
      acc.recAlvo += r.valor_meta * (r.pct_receita / 100)
    }
    porMes.set(k, acc)
  }
  return [...porMes.values()].map(a => ({
    ano: a.ano,
    mes: a.mes,
    valorMeta: a.vt,
    pctReceita: a.vtComPct > 0 ? (a.recAlvo / a.vtComPct) * 100 : null,
  }))
}

export default async function MetasPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireArea(['metas/acompanhamento', 'metas'])
  const sp = await searchParams

  const { from, to, antFrom, antTo, yoyFrom, yoyTo, eParcial } =
    resolverPeriodoCompleto({ ...sp, defaultPreset: 'este-ano' })
  const preset = sp.preset ?? 'este-ano'

  const db = await getServerClient()

  // Anos que o período toca (1 ou 2) → uma metas_listar por ano.
  const anos = [...new Set([Number(from.slice(0, 4)), Number(to.slice(0, 4))])]

  const [kpisResArr, metasResArr, ritmoResArr] = await Promise.all([
    Promise.all(PAINEIS.map(p => db.rpc('get_executiva_kpis', {
      p_from: from, p_to: to, p_setor: p.key,
      p_ant_from: antFrom, p_ant_to: antTo, p_yoy_from: yoyFrom, p_yoy_to: yoyTo,
    }))),
    Promise.all(anos.map(a => rpcMetas(db, 'metas_listar', { p_ano: a }))),
    Promise.all(PAINEIS.map(p => rpcMetas(db, 'metas_ritmo_diario', { p_from: from, p_to: to, p_setor: p.key }))),
  ])

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
      ritmo,
    }
  })

  const primeiroRitmo = parseRpc(metasRitmoDiarioSchema, ritmoResArr[0], 'metas_ritmo_diario ultima')
  const ultimaVenda = primeiroRitmo?.ultima_venda ?? null

  return (
    <div className="max-w-7xl mx-auto px-6">
      <AcompanhamentoContent
        data={{
          preset,
          periodoLabel: formatarLabelPeriodo(preset, from, to),
          from, to, eParcial, ultimaVenda, setores,
        }}
      />
    </div>
  )
}
