import { Suspense } from 'react'
import TopSection from '@/components/shared/top-section'
import DropdownOperacao from '@/components/weddings/dropdown-operacao'
import FluxoCaixaTotaisCard from '@/components/weddings/fluxo-caixa-totais-card'
import FluxoCaixaCard from '@/components/weddings/fluxo-caixa-card'
import { requireArea } from '@/lib/auth/sessao'
import { getServerClient } from '@/lib/supabase/server'
import { unwrapRpc } from '@/lib/rpc'
import type { AcumuladoWeddings, OperacoesLista } from '@/types/api'
import { JANELA_LARGA_ATRAS, JANELA_LARGA_FRENTE } from '@/lib/weddings/janela-fluxo'

// ROTA DE PREVIEW — GATE da v5.4.2/M0.
//
// Mockup INTERATIVO com dados REAIS do card de Fluxo de Caixa reformulado, para
// o Yan aprovar antes de M2/M3 tornarem o arranjo definitivo. A página real
// (/performance/weddings) segue INTOCADA até o OK — é isso que a invariante 1 do
// briefing exige.
//
// Quando o gate passar, este arranjo migra para dentro da `weddings-content` e
// esta rota é REMOVIDA (item do fechamento).

export const metadata = { title: 'Preview · Fluxo de Caixa (Weddings)' }

export default async function PreviewFluxoCaixaPage({
  searchParams,
}: {
  searchParams: Promise<{ operacao?: string | string[] }>
}) {
  await requireArea('performance/weddings')
  const sp = await searchParams
  const operacoes = ([] as string[]).concat(sp.operacao ?? [])

  const db = await getServerClient()
  const [acumuladoRes, operacoesRes] = await Promise.all([
    // A janela LARGA, buscada uma vez. Cabe folgada nos limites da própria RPC
    // (0141 clampa em 120 atrás / 60 à frente), por isso não houve migration.
    db.rpc('get_acumulado_weddings', {
      p_meses_passados: JANELA_LARGA_ATRAS,
      p_meses_futuros:  JANELA_LARGA_FRENTE,
      p_operacoes:      operacoes.length ? operacoes : null,
    }),
    db.rpc('get_operacoes_lista_weddings'),
  ])

  const acumulado     = unwrapRpc<AcumuladoWeddings>(acumuladoRes, 'get_acumulado_weddings')
  const operacoesList = unwrapRpc<OperacoesLista>(operacoesRes, 'get_operacoes_lista_weddings') ?? [] as OperacoesLista

  const nomeExibido = (op: string) =>
    operacoesList.find(o => o.operacao === op)?.label.split(' - ')[1] ?? op
  const operacaoLabel =
    operacoes.length === 0 ? undefined
    : operacoes.length === 1 ? nomeExibido(operacoes[0])
    : `${operacoes.length} operações`

  return (
    <div>
      <div className="mb-4 rounded-lg px-4 py-3 text-sm" style={{ background: 'var(--warning-bg)' }}>
        <strong className="font-semibold">Preview do gate (v5.4.2/M0).</strong>{' '}
        Arranjo proposto do Fluxo de Caixa, com dados reais. A tela oficial de Weddings
        segue inalterada até a aprovação. Janela buscada: {JANELA_LARGA_ATRAS} meses atrás
        + {JANELA_LARGA_FRENTE} à frente; o slider fatia no cliente, sem novo carregamento.
      </div>

      <TopSection titulo="Fluxo de Caixa">
        {/* 1. Filtro por operação — no TOPO da TopSection, valendo para os DOIS cards. */}
        <div className="flex items-center justify-between mb-6">
          <span className="text-sm text-[var(--text-muted)]">Filtrar por operação:</span>
          <Suspense>
            <DropdownOperacao operacoes={operacoesList} selecionadas={operacoes} />
          </Suspense>
        </div>

        {/* 2. Card de totais — compromisso total, imune ao slider. */}
        <div className="mb-6">
          <FluxoCaixaTotaisCard
            totalAReceber={acumulado?.total_a_receber}
            totalAPagar={acumulado?.total_a_pagar}
            operacaoLabel={operacaoLabel}
          />
        </div>

        {/* 3. Card único dos gráficos, com o slider de janela entre eles. */}
        <FluxoCaixaCard data={acumulado} operacaoLabel={operacaoLabel} />
      </TopSection>
    </div>
  )
}
