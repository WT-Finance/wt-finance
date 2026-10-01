import { requireArea } from '@/lib/auth/sessao'
import { listarChavesApi } from '@/lib/api-externa/rpc'
import { getTiposAdmin } from '@/lib/solicitacoes/rpc'
import { ChavesApiContent } from '@/components/admin/api-externa/chaves-api-content'

// v5.4.0/M2 (+ Round2/Round3/Round6) — "API externa": duas seções reunidas
// numa página só (área RBAC 'api-externa' desde a v6.1.1/M3, migration 0289; antes
// 'solicitacoes'), tema neutro Group. "Tipos
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
// NAVEGAÇÃO (v6.1.1/M3): grupo "API Externa" da sidebar (subaba "Chaves"; a irmã é
// "Documentação"). Os atalhos que ficavam em Solicitações (tipos-content.tsx e a caixa
// de entrada) saíram.

export const dynamic = 'force-dynamic'

export default async function ChavesApiPage() {
  await requireArea('api-externa')

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
        <h1 className="text-xl font-semibold text-text-primary">API externa</h1>
        <p className="mt-0.5 text-sm text-text-subtle">
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
