import { getServerClient } from '@/lib/supabase/server'
import { requireArea } from '@/lib/auth/sessao'
import { unwrapRpc } from '@/lib/rpc'
import TopSection from '@/components/shared/top-section'
import GerencialSection from '@/components/financeiro/gerencial/gerencial-section'
import { type Lancamento } from '@/components/financeiro/gerencial/lancamento-row'
import { type Conta, type DiaProjecao } from '@/components/financeiro/gerencial/tipos'

// v4.13: entrada DIRETA do Fluxo de Caixa Gerencial (item próprio na sidebar).
// v4.21.0 (M2): leitura via cliente de SESSÃO (getServerClient), não mais service role.
// As RPCs do gerencial exigem exigir_acesso(['financeiro/gerencial']) no banco — a
// negação vale no nível da RPC, não só neste guard de página.

export default async function GerencialPage() {
  await requireArea('financeiro/gerencial')

  const db = await getServerClient()
  type RpcResult = { data: unknown; error: { message: string } | null }
  type BoundRpc  = (fn: string, args?: Record<string, unknown>) => Promise<RpcResult>
  const rpc = (db.rpc as unknown as BoundRpc).bind(db)

  const empty: RpcResult = { data: null, error: null }
  const [projecaoRes, saldosRes, lancamentosRes] = await Promise.allSettled([
    // v4.22.1: janela ampla (60 dias a partir de hoje); a UI fatia por data inicial + horizonte (15/30).
    rpc('get_gerencial_projecao_diaria', { p_dias: 60 }),
    rpc('get_gerencial_saldos'),
    rpc('get_gerencial_lancamentos', { p_limit: 1000 }),
  ]).then(results => results.map(r => (r.status === 'fulfilled' ? r.value : empty)))

  const projecao    = unwrapRpc<DiaProjecao[]>(projecaoRes, 'get_gerencial_projecao_diaria') ?? []
  const saldos      = unwrapRpc<Conta[]>(saldosRes, 'get_gerencial_saldos') ?? []
  const lancamentos = unwrapRpc<Lancamento[]>(lancamentosRes, 'get_gerencial_lancamentos') ?? []

  return (
    <div className="max-w-7xl mx-auto px-6">
      <TopSection titulo="Fluxo de Caixa Gerencial" subtitulo="Baseado em planilha de previsão curada manualmente">
        <GerencialSection
          saldos={saldos}
          projecao={projecao}
          lancamentos={lancamentos}
        />
      </TopSection>
    </div>
  )
}
