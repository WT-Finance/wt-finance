import { Suspense } from 'react'
import { getServerClient } from '@/lib/supabase/server'
import { requireArea } from '@/lib/auth/sessao'
import { unwrapRpc } from '@/lib/rpc'
import { resolverPeriodoCompleto } from '@/lib/periodo'
import PeriodoFilterPillsUrl from '@/components/shared/periodo-filter-pills-url'
import ComposicaoPeriodo from '@/components/financeiro/composicao-lancamentos'
import TopSection from '@/components/shared/top-section'

// DRE (v5.2.0, checkpoint) — nova aba do Financeiro. Nasce com a "Composição dos
// Lançamentos" (decomposição por Grupo de Categoria, regime contábil), MOVIDA da página
// do Fluxo de Caixa: aqui ela é a semente da futura DRE por Fluxo de Caixa (Onda 2, a
// struct de 159 linhas da controladoria).
//
// RBAC: área PRÓPRIA 'financeiro/dre' (decisão do Yan; migration 0197) — seed gate
// apertado (só admins); o admin concede aos demais pelo editor de roles. Os wrappers de
// decomposição aceitam ['executiva','financeiro/dre'] desde a 0197.

interface SearchParams {
  preset?: string
  from?:   string
  to?:     string
}

interface DecomposicaoGrupo {
  grupo_categoria: string
  sinal:           'entrada' | 'saida'
  valor_total:     number
}

interface DecomposicaoCategoria {
  categoria:       string
  grupo_categoria: string
  sinal:           'entrada' | 'saida'
  valor_total:     number
}

function CardTitle({ titulo, subtitulo }: { titulo: string; subtitulo?: string }) {
  return (
    <div className="flex items-baseline gap-2 mb-4">
      <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{titulo}</h3>
      {subtitulo && <span className="text-[13px]" style={{ color: 'var(--text-muted)' }}>{subtitulo}</span>}
    </div>
  )
}

export default async function DrePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  await requireArea('financeiro/dre')

  const sp = await searchParams
  const { from, to } = resolverPeriodoCompleto({ ...sp, defaultPreset: 'este-ano' })

  const db = await getServerClient()
  type RpcResult = { data: unknown; error: { message: string } | null }
  type BoundRpc  = (fn: string, args?: Record<string, unknown>) => Promise<RpcResult>
  const rpc = (db.rpc as unknown as BoundRpc).bind(db)

  const empty: RpcResult = { data: null, error: null }
  const [decomposicaoRes, decomposicaoCategoriaRes] = await Promise.allSettled([
    rpc('get_decomposicao_grupo',     { p_from: from, p_to: to }),
    rpc('get_decomposicao_categoria', { p_from: from, p_to: to }),
  ]).then(results => results.map(r => (r.status === 'fulfilled' ? r.value : empty)))

  const decomposicao = unwrapRpc<DecomposicaoGrupo[]>(decomposicaoRes, 'get_decomposicao_grupo') ?? []
  const categorias   =
    unwrapRpc<DecomposicaoCategoria[]>(decomposicaoCategoriaRes, 'get_decomposicao_categoria') ?? []

  const entradas = decomposicao.filter(d => d.sinal === 'entrada').sort((a, b) => b.valor_total - a.valor_total)
  const saidas   = decomposicao.filter(d => d.sinal === 'saida').sort((a, b) => b.valor_total - a.valor_total)

  return (
    <div>
      <TopSection titulo="DRE por Fluxo de Caixa">

        {/* Pills de período (mesma semântica de URL da página do Fluxo) */}
        <div className="mb-6">
          <Suspense>
            <PeriodoFilterPillsUrl defaultPreset="este-ano" />
          </Suspense>
        </div>

        {/* Composição dos Lançamentos — movida do Fluxo de Caixa (checkpoint v5.2.0) */}
        <div className="rounded-xl shadow-sm bg-white p-5 mb-4">
          <CardTitle titulo="Composição dos Lançamentos" subtitulo="no período selecionado" />
          <p className="text-2xs text-zinc-400 mb-3 -mt-2">
            Decomposição por Grupo de Categoria (Lançamentos — regime contábil). Pode diferir levemente
            dos KPIs do Fluxo de Caixa, que refletem fluxo bancário real.
          </p>
          <ComposicaoPeriodo entradas={entradas} saidas={saidas} categorias={categorias} />
        </div>

      </TopSection>
    </div>
  )
}
