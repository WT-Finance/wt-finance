import { getAdminClient } from '@/lib/supabase/admin'
import { requireArea } from '@/lib/auth/sessao'
import { unwrapRpc } from '@/lib/rpc'
import TopSection from '@/components/shared/top-section'
import GerencialSection from '@/components/financeiro/gerencial/gerencial-section'
import { type Lancamento } from '@/components/financeiro/gerencial/lancamento-row'

// v4.13: entrada DIRETA do Fluxo de Caixa Gerencial (item próprio na sidebar).
// Antes o Gerencial só existia embutido em /financeiro/fluxo-caixa — um usuário
// com permissão APENAS de financeiro/gerencial não tinha porta de entrada. A
// seção embutida continua existindo para quem tem as duas áreas; esta página
// renderiza o MESMO componente, standalone. Mesmo padrão de dados da página de
// fluxo (admin client server-side + unwrapRpc).

interface GerencialSaldo {
  conta: string
  saldo: number
  ordem: number
}

interface DiaProjecao {
  data:      string
  a_receber: number
  a_pagar:   number
  resultado: number
}

export default async function GerencialPage() {
  await requireArea('financeiro/gerencial')

  const db = getAdminClient()
  type RpcResult = { data: unknown; error: { message: string } | null }
  type BoundRpc  = (fn: string, args?: Record<string, unknown>) => Promise<RpcResult>
  const rpc = (db.rpc as unknown as BoundRpc).bind(db)

  const empty: RpcResult = { data: null, error: null }
  const [projecaoRes, saldosRes, lancamentosRes] = await Promise.allSettled([
    rpc('get_gerencial_projecao_diaria', { p_dias: 15 }),
    rpc('get_gerencial_saldos'),
    rpc('get_gerencial_lancamentos', { p_limit: 1000 }),
  ]).then(results => results.map(r => (r.status === 'fulfilled' ? r.value : empty)))

  const projecao    = unwrapRpc<DiaProjecao[]>(projecaoRes, 'get_gerencial_projecao_diaria') ?? []
  const saldos      = unwrapRpc<GerencialSaldo[]>(saldosRes, 'get_gerencial_saldos') ?? []
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
