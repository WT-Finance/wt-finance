import { requireArea } from '@/lib/auth/sessao'
import { getDestinatarios, getTiposDocumentacao } from '@/lib/solicitacoes/rpc'
import { DocumentacaoContent } from '@/components/admin/chaves-api/documentacao-content'

// v5.4.0/Round3 (2026-07-29) — "Documentação" da API externa DENTRO da
// plataforma (pedido do Yan: "deveria haver também uma forma de acessar a
// documentação pela própria plataforma"). Espelha docs/api-externa-
// solicitacoes.md; a seção 3 ("Tipos expostos agora") é VIVA — lê o cadastro
// real de tipos expostos (solic_tipos_documentacao, que já filtra
// exposto_via_api e não-arquivado — mesmo filtro de public.solic_tipos_api)
// e a lista de equipes válidas (solic_destinatarios).
// v5.4.0/Round4 (2026-07-30, pedido do Yan): área PRÓPRIA
// 'solicitacoes/documentacao' — quem só tem essa permissão entra sem ver a
// gestão; quem tem a gestão 'solicitacoes' continua entrando (semântica OU).
// O prefixo de rota (/admin/chaves-api/documentacao) já casa ANTES do genérico
// '/admin/chaves-api' em areas.ts (areasDaRota) — aqui é só o guard local.
//
// A FONTE dos tipos mudou na migration 0219 (achado CRÍTICO da revisão do round
// 4): era `admin_solic_listar_tipos`, gated na área de GESTÃO — quem tinha SÓ a
// permissão nova passava no guard da página e recebia PERMISSAO_NEGADA do banco,
// vendo a seção viva vazia com aviso de erro. Justo a pessoa para quem a
// permissão existe. `solic_tipos_documentacao` aceita as DUAS áreas e devolve
// apenas os tipos expostos (menor privilégio: nada de tipo arquivado/interno).

export const dynamic = 'force-dynamic'

export default async function DocumentacaoApiPage() {
  const sessao = await requireArea(['solicitacoes/documentacao', 'solicitacoes'])
  // Distingue quem entrou pela gestão de quem entrou pela permissão nova: os links
  // internos para /admin/chaves-api só valem para o primeiro (ver DocumentacaoContent).
  const podeGestao = sessao.permissoes.includes('solicitacoes')

  const [tiposRes, destinatarios] = await Promise.all([
    getTiposDocumentacao(),
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
        podeGestao={podeGestao}
      />
    </div>
  )
}
