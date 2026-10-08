import { requireArea } from '@/lib/auth/sessao'
import { hojeSP } from '@/lib/fmt'
import GastosContent from '@/components/marketing/gastos/gastos-content'
import { ANO_MINIMO_FIXTURE, montarDadosFixture } from '@/components/marketing/gastos/fixture'
import type { EstadoMockup } from '@/components/marketing/gastos/tipos'

// Marketing · Gastos de Marketing (v6.3.0) — GATE 1: MOCKUP navegável, alimentado por FIXTURE.
//
// Área PROVISÓRIA 'admin/design-system'. A área própria ('marketing/gastos') nasce na M3, junto
// com a migration que a insere em `app.rbac_areas`: declará-la antes, só no código, quebraria o
// teste de paridade banco↔app (`rpc-contrato.test.ts`) — e a M0/M1 não aplicam migration.
// Precedente: a v5.6.0 fez exatamente isto com o Inventário de Ativos
// (`gestao-pessoas/inventario/page.tsx`). Na M3 viram juntas, no mesmo commit: `requireArea`
// aqui, `AREAS`/`AREA_INFO`/`PRIORIDADE_INICIAL`, `areasDaRota` e o gate do item da sidebar.
//
// Estados forçáveis para conferência visual:
//   ?estado=vazio → o ano não tem lançamento (cada card mostra o próprio estado vazio);
//   ?estado=erro  → o ranking por fornecedor falha; o resto da página segue de pé.
// Ano: `?ano=AAAA` (default = ano corrente em São Paulo).
//
// Na M3 só a FONTE do dado muda: no lugar de `montarDadosFixture`, as RPCs `marketing_gastos_*`
// via `Promise.allSettled` (uma leitura que cai vira `{ ok: false }`, não derruba a página).
export const dynamic = 'force-dynamic'

type ParamBruto = string | string[] | undefined
interface SearchParams { ano?: ParamBruto; estado?: ParamBruto }

const primeiro = (v: ParamBruto): string | undefined => (Array.isArray(v) ? v[0] : v)

export default async function GastosMarketingPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  await requireArea('admin/design-system')

  const sp = await searchParams
  // "Hoje" NO FUSO DE SÃO PAULO e no SERVIDOR — o runtime roda em UTC e o cliente não pode usar
  // relógio próprio (mismatch de hidratação; perto da virada do ano erraria o ano corrente).
  const hoje = hojeSP()
  const anoHoje = parseInt(hoje.slice(0, 4), 10)

  const pedido = Number(primeiro(sp.ano))
  const ano = Number.isInteger(pedido) && pedido >= ANO_MINIMO_FIXTURE && pedido <= anoHoje ? pedido : anoHoje

  const estadoBruto = primeiro(sp.estado)
  const estado: EstadoMockup | null = estadoBruto === 'vazio' || estadoBruto === 'erro' ? estadoBruto : null

  const dados = montarDadosFixture({ ano, hoje, estado })

  // `key={ano}`: trocar o ano remonta o container e o recorte de meses volta ao padrão do ano.
  return <GastosContent key={ano} dados={dados} />
}
