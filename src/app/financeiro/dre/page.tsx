import { Suspense } from 'react'
import Link from 'next/link'
import { SquarePen } from 'lucide-react'
import { getServerClient } from '@/lib/supabase/server'
import { requireArea } from '@/lib/auth/sessao'
import { unwrapRpc, type RpcLike } from '@/lib/rpc'
import { parseRpc } from '@/lib/schemas-rpc'
import { resolverPeriodoCompleto } from '@/lib/periodo'
import { hojeSP } from '@/lib/fmt'
import { rpcDre } from '@/lib/dre/rpc-dre'
import { dreMensalSchema } from '@/lib/dre/schemas'
import PeriodoFilterPillsUrl from '@/components/shared/periodo-filter-pills-url'
import ComposicaoPeriodo from '@/components/financeiro/composicao-lancamentos'
import TopSection from '@/components/shared/top-section'
import TabelaDre from '@/components/financeiro/dre/tabela-dre'
import { PILL, PILL_NEUTRO } from '@/components/shared/botoes'

// DRE por Fluxo de Caixa (v5.3.0 · Onda 2) — a tabela hierárquica da controladoria
// (159 linhas) na aba definitiva. M4: a tabela lê a estrutura viva + o fato real via
// `get_dre_mensal` (a fixture da M0 saiu deste caminho — ver tabela-dre.tsx). Ano
// navegável por `?ano=` (pills na própria TabelaDre), janela de 3 anos
// [corrente-2, corrente], default = ano corrente no fuso de São Paulo. O editor da
// estrutura viva vive em página própria (/financeiro/dre/estrutura), atrás do botão
// "Editar estrutura" da toolbar.
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
  ano?:    string
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

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max)
}

export default async function DrePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  await requireArea('financeiro/dre')

  const sp = await searchParams
  const { from, to } = resolverPeriodoCompleto({ ...sp, defaultPreset: 'este-ano' })

  // Ano corrente NO FUSO DE SÃO PAULO — nunca `new Date().getFullYear()` cru (o
  // runtime do servidor roda em UTC; perto da virada do ano isso adiantaria/
  // atrasaria em relação ao calendário de SP). `hojeSP()` é o helper canônico.
  const anoCorrente     = parseInt(hojeSP().slice(0, 4), 10)
  const anoPedido       = parseInt(sp.ano ?? '', 10) || anoCorrente
  const ano             = clamp(anoPedido, anoCorrente - 2, anoCorrente)
  const anosDisponiveis = [anoCorrente - 2, anoCorrente - 1, anoCorrente]

  const db = await getServerClient()

  // As 3 chamadas em UM `Promise.allSettled` (não serializar) — `rpcDre` é o helper
  // de tipagem frouxa genérico do módulo (não específico de DRE apesar do nome),
  // reaproveitado aqui para as duas RPCs de Composição também, unificando o tipo
  // de retorno (`RpcLike`) sem o cast ad-hoc local que existia antes.
  // Os DOIS anos seguintes entram na mesma leva: a coluna "Total do ano" abre, por um
  // toggle, o previsto de ano+1/ano+2 (o modelo da controladoria mostra 2027/2028 ao
  // lado do total). É a MESMA RPC com outro `p_ano` — nenhuma migration nova; as 5
  // chamadas correm em paralelo, então o custo em wall-clock é o da mais lenta.
  const anosSeguintesNums = [ano + 1, ano + 2]

  const empty: RpcLike = { data: null, error: null }
  const [dreRes, seg1Res, seg2Res, decomposicaoRes, decomposicaoCategoriaRes] = await Promise.allSettled([
    rpcDre(db, 'get_dre_mensal',          { p_ano: ano }),
    rpcDre(db, 'get_dre_mensal',          { p_ano: anosSeguintesNums[0] }),
    rpcDre(db, 'get_dre_mensal',          { p_ano: anosSeguintesNums[1] }),
    rpcDre(db, 'get_decomposicao_grupo',     { p_from: from, p_to: to }),
    rpcDre(db, 'get_decomposicao_categoria', { p_from: from, p_to: to }),
  ]).then(results => results.map(r => (r.status === 'fulfilled' ? r.value : empty)))

  const dre          = parseRpc(dreMensalSchema, dreRes, 'get_dre_mensal')

  // Totais por linha de cada ano seguinte, indexados por `b:<chave>` (blocos) e
  // `c:<categoria_id>` (categorias) — o mesmo par de chaves que a tabela usa para casar
  // as linhas. Ano que falhar sai da lista (fail-safe: a coluna simplesmente não aparece).
  const anosSeguintes = [seg1Res, seg2Res]
    .map((res, i) => {
      const p = parseRpc(dreMensalSchema, res, `get_dre_mensal(${anosSeguintesNums[i]})`)
      if (!p) return null
      const totais: Record<string, number> = {}
      for (const l of p.linhas) {
        if (l.t === 'cat') { if (l.categoria_id != null) totais[`c:${l.categoria_id}`] = l.total }
        else if (l.chave) { totais[`b:${l.chave}`] = l.total }
      }
      for (const b of p.bandeja) totais[`c:${b.categoria_id}`] = b.total
      return { ano: anosSeguintesNums[i], totais }
    })
    .filter((x): x is { ano: number; totais: Record<string, number> } => x !== null)
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
        <TabelaDre
          dados={dre}
          ano={ano}
          anosDisponiveis={anosDisponiveis}
          anosSeguintes={anosSeguintes}
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
