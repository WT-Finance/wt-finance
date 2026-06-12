import { requireArea } from '@/lib/auth/sessao'
import * as rpc from '@/lib/solicitacoes/rpc'
import SolicitacoesContent from '@/components/solicitacoes/solicitacoes-content'

export const dynamic = 'force-dynamic'

type Escopo = 'mim_e_role' | 'so_mim' | 'todas'

export default async function SolicitacoesPage({ searchParams }: { searchParams: Promise<{ view?: string; escopo?: string }> }) {
  // Qualquer autenticado e ativo (areasDaRota('/solicitacoes') = null).
  const sessao = await requireArea(null)
  const sp = await searchParams
  const view: 'minhas' | 'caixa' = sp.view === 'caixa' ? 'caixa' : 'minhas'
  const escopoReq = (['mim_e_role', 'so_mim', 'todas'].includes(sp.escopo ?? '') ? sp.escopo : 'mim_e_role') as Escopo
  const podeGestao = sessao.permissoes.includes('solicitacoes')
  const escopo: Escopo = escopoReq === 'todas' && !podeGestao ? 'mim_e_role' : escopoReq

  const [minhas, caixa, pendentes, tipos, destinatarios] = await Promise.all([
    rpc.getMinhas(), rpc.getCaixa(escopo), rpc.getPendencias(), rpc.getTiposAbertura(), rpc.getDestinatarios(),
  ])

  return (
    <SolicitacoesContent
      view={view} escopo={escopo}
      minhas={minhas ?? []} caixa={caixa ?? []} pendentes={pendentes ?? 0} podeGestao={podeGestao}
      tipos={tipos ?? []} destinatarios={destinatarios ?? { usuarios: [], roles: [] }}
    />
  )
}
