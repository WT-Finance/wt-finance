import { requireArea } from '@/lib/auth/sessao'
import { getTiposAdmin } from '@/lib/solicitacoes/rpc'
import { TiposContent } from '@/components/admin/solicitacoes/tipos-content'

// v4.16.0 (spec §2.4 C) — Admin de Tipos de Solicitação. Rota de plataforma
// (grupo Administração), tema neutro Group. Busca server-side (RPC de sessão;
// o banco valida a área 'solicitacoes' do chamador) e delega ao client.

export const dynamic = 'force-dynamic'

export default async function TiposSolicitacaoPage() {
  await requireArea('solicitacoes')
  const tipos = (await getTiposAdmin()) ?? []

  return (
    <div className="max-w-5xl mx-auto px-4 pb-12">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-zinc-900">Tipos de solicitação</h1>
        <p className="text-sm text-zinc-400 mt-0.5">
          Defina os tipos de solicitação e os campos que cada um pede ao solicitante
        </p>
      </div>

      <TiposContent tipos={tipos} />
    </div>
  )
}
