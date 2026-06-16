import { requireArea } from '@/lib/auth/sessao'
import * as rpc from '@/lib/solicitacoes/rpc'
import SolicitacoesContent from '@/components/solicitacoes/solicitacoes-content'

export const dynamic = 'force-dynamic'

type Escopo = 'mim_e_role' | 'so_mim' | 'todas'

export default async function SolicitacoesPage({ searchParams }: { searchParams: Promise<{ view?: string; escopo?: string }> }) {
  // v4.20.0 (ADR-0121): acesso BÁSICO ('solicitacoes/basico': caixa + minhas) OU GESTÃO
  // ('solicitacoes'). A gestão inclui o básico (OR). Antes era requireArea(null) = qualquer
  // autenticado; agora a página exige a permissão de Solicitações.
  const sessao = await requireArea(['solicitacoes/basico', 'solicitacoes'])
  const sp = await searchParams
  // v4.18/M6 — Caixa de entrada é a aba primeira e o DEFAULT (reformulação centrada na
  // fila de trabalho do destinatário); Minhas só quando pedida explicitamente.
  const view: 'minhas' | 'caixa' = sp.view === 'minhas' ? 'minhas' : 'caixa'
  const escopoReq = (['mim_e_role', 'so_mim', 'todas'].includes(sp.escopo ?? '') ? sp.escopo : 'mim_e_role') as Escopo
  const podeGestao = sessao.permissoes.includes('solicitacoes')
  const escopo: Escopo = escopoReq === 'todas' && !podeGestao ? 'mim_e_role' : escopoReq

  // Paralelo: apenas a lista da view atual (evita buscar as duas) + pendências + metadados.
  // pendentes (contador da pill "Caixa de entrada (N)") sempre buscado — visível nas duas views.
  const [lista, pendentes, tipos, destinatarios] = await Promise.all([
    view === 'minhas' ? rpc.getMinhas() : rpc.getCaixa(escopo),
    rpc.getPendencias(),
    rpc.getTiposAbertura(),
    rpc.getDestinatarios(),
  ])

  // null em qualquer resultado = falha de RPC (as listas fazem coalesce p/ '[]', então null é sempre erro).
  const erroCarga = [lista, pendentes, tipos, destinatarios].some(x => x === null)
    ? 'Não foi possível carregar as solicitações. Recarregue a página.'
    : null

  return (
    <SolicitacoesContent
      view={view} escopo={escopo}
      lista={lista ?? []} pendentes={pendentes ?? 0} podeGestao={podeGestao}
      tipos={tipos ?? []} destinatarios={destinatarios ?? { usuarios: [], roles: [] }}
      erroCarga={erroCarga}
    />
  )
}
