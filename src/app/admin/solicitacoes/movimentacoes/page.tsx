import { requireArea } from '@/lib/auth/sessao'
import { getMovimentacoes } from '@/lib/solicitacoes/rpc'
import MovimentacoesContent from '@/components/solicitacoes/movimentacoes-content'

// v4.19.1 — Auditoria de movimentações das solicitações (gestão-only, área 'solicitacoes').
// GATE DE ÁREA = o requireArea('solicitacoes') abaixo (camada 2) + o exigir_acesso(['solicitacoes'])
// da RPC (camadas 3/4). O proxy NÃO checa área — só exige sessão (camada 1; proxy.ts:4-7). A rota
// vive sob /admin/solicitacoes por organização (irmã do admin de tipos), não por gate de proxy.
// Lista única DERIVADA das colunas de app.solicitacao (não há tabela de eventos): Abertura
// (solicitante/criado_em) e a decisão terminal (decidido_por/decidido_em/status→ação). Tema neutro.

export const dynamic = 'force-dynamic'

export default async function MovimentacoesPage() {
  await requireArea('solicitacoes')
  const movimentacoes = await getMovimentacoes()

  const erroCarga = movimentacoes === null
    ? 'Não foi possível carregar as movimentações. Recarregue a página.'
    : null

  return (
    <div className="max-w-5xl mx-auto px-4">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-zinc-900">Movimentações</h1>
        <p className="text-sm text-zinc-400 mt-0.5">
          Histórico de auditoria: o que cada usuário fez nas solicitações (abertura, conclusão, rejeição, cancelamento).
        </p>
      </div>

      <MovimentacoesContent movimentacoes={movimentacoes ?? []} erroCarga={erroCarga} />
    </div>
  )
}
