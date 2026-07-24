import { Suspense } from 'react'
import Link from 'next/link'
import { SquarePen } from 'lucide-react'
import { getServerClient } from '@/lib/supabase/server'
import { requireArea } from '@/lib/auth/sessao'
import { unwrapRpc } from '@/lib/rpc'
import { resolverPeriodoCompleto } from '@/lib/periodo'
import PeriodoFilterPillsUrl from '@/components/shared/periodo-filter-pills-url'
import ComposicaoPeriodo from '@/components/financeiro/composicao-lancamentos'
import TopSection from '@/components/shared/top-section'
import TabelaDreMockup from '@/components/financeiro/dre/tabela-dre-mockup'
import { PILL, PILL_NEUTRO } from '@/components/shared/botoes'

// DRE por Fluxo de Caixa (v5.3.0 · Onda 2) — a tabela hierárquica da controladoria
// (159 linhas) na aba definitiva. FASE DE MOCKUP (M0, gate do Yan): a tabela ainda lê
// FIXTURE (dados reais da controladoria, base 15/07/2026); a M3/M4 trocam a fixture pela
// RPC `get_dre_mensal` sem mudar esta página. O editor da estrutura viva vive em página
// própria (/financeiro/dre/estrutura), atrás do botão "Editar estrutura" da toolbar.
//
// A Composição dos Lançamentos (semente da aba desde a v5.2.0) fica MANTIDA em TopSection
// próprio, COLAPSADO por padrão (decisão do briefing; destino final adiado). Nota de
// regime corrigida: desde a 0188 as RPCs de decomposição leem o MESMO
// `financeiro.fato_fluxo` da DRE (eixo da movimentação) — o aviso antigo de "regime
// contábil ≠ fluxo bancário" ficou obsoleto.
//
// RBAC: área própria 'financeiro/dre' (0197) — cobre ver E editar a estrutura (decisão
// firme; divisão ver/editar = futuro se precisar).

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
      <TopSection
        titulo="DRE por Fluxo de Caixa"
        subtitulo="estrutura oficial da controladoria · mês corrente híbrido (realizado + previsto)"
      >
        <TabelaDreMockup
          slotAcoes={
            <Link href="/financeiro/dre/estrutura" className={`${PILL} ${PILL_NEUTRO}`}>
              <SquarePen size={13} />
              Editar estrutura
            </Link>
          }
        />
      </TopSection>

      <TopSection
        titulo="Composição dos Lançamentos"
        subtitulo="decomposição por Grupo de Categoria no período"
        defaultAberto={false}
      >
        <div className="mb-6">
          <Suspense>
            <PeriodoFilterPillsUrl defaultPreset="este-ano" />
          </Suspense>
        </div>
        <div className="rounded-xl shadow-sm bg-surface p-5">
          <p className="text-2xs text-text-subtle mb-3">
            Mesma base da DRE (lançamentos pelo eixo da movimentação) — visão agregada por grupo,
            com detalhamento por categoria ao clicar.
          </p>
          <ComposicaoPeriodo entradas={entradas} saidas={saidas} categorias={categorias} />
        </div>
      </TopSection>
    </div>
  )
}
