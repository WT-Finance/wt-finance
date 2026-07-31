import { requireArea } from '@/lib/auth/sessao'
import { getTiposAdmin } from '@/lib/solicitacoes/rpc'
import { TiposContent } from '@/components/admin/solicitacoes/tipos-content'

// v4.16.0 (spec §2.4 C) — Admin de Tipos de Solicitação. Rota de plataforma
// (grupo Administração), tema neutro Group. Busca server-side (RPC de sessão;
// o banco valida a área 'solicitacoes' do chamador) e delega ao client.
//
// v5.4.0/Round2 (2026-07-28) — o editor voltou a ser SÓ nome+campos: a
// configuração de API do tipo (exposto_via_api/api_roles_permitidas) foi
// movida para /admin/api-externa ("API externa" → "Tipos expostos"), então esta
// página não precisa mais buscar os roles (solic_destinatarios) — só o editor
// os consumia.

export const dynamic = 'force-dynamic'

export default async function TiposSolicitacaoPage() {
  await requireArea('solicitacoes')
  const tipos = await getTiposAdmin()

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-zinc-900">Tipos de solicitação</h1>
        <p className="text-sm text-zinc-400 mt-0.5">
          Defina os tipos de solicitação e os campos que cada um pede ao solicitante
        </p>
      </div>

      <TiposContent tipos={tipos ?? []} />
    </div>
  )
}
