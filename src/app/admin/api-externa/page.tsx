import { requireArea } from '@/lib/auth/sessao'
import { listarChavesApi } from '@/lib/api-externa/rpc'
import { getTiposAdmin } from '@/lib/solicitacoes/rpc'
import { ChavesApiContent } from '@/components/admin/api-externa/chaves-api-content'

// v5.4.0/M2 (+ Round2/Round3/Round6) — "API externa": duas seções reunidas
// numa página só (área RBAC 'solicitacoes'), tema neutro Group. "Tipos
// expostos" (Round3: só o toggle exposto_via_api — a lista de equipes de
// destino por tipo morreu, decisão do Yan; qualquer equipe cadastrada é
// destino válido) + "Chaves de API" (uma chave por plataforma integradora —
// Round6, decisão do Yan 31/07: a whitelist de tipos por chave SAIU, toda
// chave alcança todo tipo exposto; consequência: uma chave só tem dois
// estados na vida — criada e revogada, não existe mais "editar") + log de
// chamadas por chave. A busca de equipes (getDestinatarios) SAIU desta page —
// só existia para a extinta seção de destinos por tipo; a página irmã
// /admin/api-externa/documentacao é quem agora precisa dela (seção viva).
//
// NAVEGAÇÃO: esta rota não está na sidebar (mesmo padrão de /admin/solicitacoes,
// que também só é alcançada por link a partir de /solicitacoes — v4.16.0). O
// link de IDA (a partir de /admin/solicitacoes) fica em tipos-content.tsx.

export const dynamic = 'force-dynamic'

export default async function ChavesApiPage() {
  await requireArea('solicitacoes')

  const [chaves, tiposRes] = await Promise.all([
    listarChavesApi(),
    getTiposAdmin(),
  ])

  const erroCarga = chaves === null
    ? 'Não foi possível carregar as chaves de API. Recarregue a página.'
    : tiposRes === null
      ? 'Não foi possível carregar os tipos de solicitação — os tipos expostos podem aparecer incompletos. Recarregue a página.'
      : null

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-zinc-900">API externa</h1>
        <p className="text-sm text-zinc-400 mt-0.5">
          Tipos expostos e chaves de API para plataformas externas abrirem e consultarem solicitações
        </p>
      </div>

      <ChavesApiContent
        chaves={chaves ?? []}
        tiposAdmin={tiposRes ?? []}
        erroCarga={erroCarga}
      />
    </div>
  )
}
