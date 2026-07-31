import { requireArea } from '@/lib/auth/sessao'
import { getDestinatarios, getTiposAdmin } from '@/lib/solicitacoes/rpc'
import { DocumentacaoContent } from '@/components/admin/chaves-api/documentacao-content'

// v5.4.0/Round3 (2026-07-29) — "Documentação" da API externa DENTRO da
// plataforma (pedido do Yan: "deveria haver também uma forma de acessar a
// documentação pela própria plataforma"). Espelha docs/api-externa-
// solicitacoes.md; a seção 3 ("Tipos expostos agora") é VIVA — lê o cadastro
// real de tipos expostos (admin_solic_listar_tipos, filtrado por
// exposto_via_api e não-arquivado — mesmo filtro de public.solic_tipos_api)
// e a lista de equipes válidas (solic_destinatarios).
// v5.4.0/Round4 (2026-07-30, pedido do Yan): área PRÓPRIA
// 'solicitacoes/documentacao' — quem só tem essa permissão entra sem ver a
// gestão; quem tem a gestão 'solicitacoes' continua entrando (semântica OU).
// O prefixo de rota (/admin/chaves-api/documentacao) já casa ANTES do genérico
// '/admin/chaves-api' em areas.ts (areasDaRota) — aqui é só o guard local.

export const dynamic = 'force-dynamic'

export default async function DocumentacaoApiPage() {
  await requireArea(['solicitacoes/documentacao', 'solicitacoes'])

  const [tiposRes, destinatarios] = await Promise.all([
    getTiposAdmin(),
    getDestinatarios(),
  ])

  const tiposExpostos = (tiposRes ?? []).filter(t => t.exposto_via_api && !t.arquivado)
  const equipes = destinatarios?.roles ?? []

  const erroCarga = tiposRes === null
    ? 'Não foi possível carregar os tipos de solicitação — a seção de tipos expostos pode aparecer incompleta. Recarregue a página.'
    : destinatarios === null
      ? 'Não foi possível carregar as equipes — a lista de destinos válidos pode aparecer incompleta. Recarregue a página.'
      : null

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-zinc-900">Documentação da API externa</h1>
        <p className="text-sm text-zinc-400 mt-0.5">
          Contrato do integrador — autenticação, descoberta, criação, callbacks e erros
        </p>
      </div>

      <DocumentacaoContent
        tiposExpostos={tiposExpostos}
        equipes={equipes}
        erroCarga={erroCarga}
      />
    </div>
  )
}
