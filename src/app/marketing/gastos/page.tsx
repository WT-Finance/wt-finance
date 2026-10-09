import { getServerClient } from '@/lib/supabase/server'
import { requireArea } from '@/lib/auth/sessao'
import { hojeSP } from '@/lib/fmt'
import { type RpcLike } from '@/lib/rpc'
import { parseRpc } from '@/lib/schemas-rpc'
import { anosDaUrl, resolverAnos, type ParamsAnos } from '@/lib/marketing/anos'
import type { LeituraProporcao } from '@/lib/marketing/proporcao'
import { fornecedoresMarketingSchema, resumoMarketingSchema } from '@/lib/marketing/schemas'
import { proporcaoReceitaMarketingSchema } from '@/lib/marketing/schemas-proporcao'
import GastosContent from '@/components/marketing/gastos/gastos-content'
import ProporcaoReceita from '@/components/marketing/gastos/proporcao-receita'
import type { Carregado, DadosGastosMarketing, LeituraAno } from '@/lib/marketing/tipos'

// Marketing · Despesas de Marketing (v6.3.0). Área própria 'marketing/gastos' (migration 0292).
//
// Dado: 2 RPCs de leitura POR ANO (`get_marketing_gastos_resumo|fornecedores`), com o MESMO
// predicado da DRE de caixa (bloco MKT, só realizado) — o total da página é a linha
// "(-) Despesas Marketing" da DRE. A página lê as duas de CADA ano selecionado (1 a 3), todas em
// paralelo. (`get_marketing_gastos_lancamentos` e o resumo do ano anterior deixaram de ser lidos:
// a tela não tem mais tabela de lançamentos nem comparativo.) Junto vai a 3ª leitura por ano,
// `get_marketing_proporcao_receita` (0293) — % de Marketing sobre a Receita Bruta por COMPETÊNCIA,
// o mesmo número da grade da DRE — que alimenta o card "Proporção sobre a Receita Bruta".
//
// Cada leitura falha SOZINHA: `Promise.allSettled` + `parseRpc` por chamada; o que cair vira
// `{ ok: false }` e só o card que depende dele mostra o erro — a página fica de pé. O retorno de
// `.rpc()` é thenable (sem `.catch`): o tratamento de falha é o `status` de cada item.
//
// Anos: `?anos=2025,2026` (ou o antigo `?ano=2026`); default = só o ano corrente em São Paulo.
// A faixa [2001, ano corrente] filtra ANTES de ler; a lista de anos com dado (`anosDisponiveis`)
// só se conhece DEPOIS de ler um resumo, então o filtro por ela vem em seguida — e, se ele trocar
// o pedido pelo default (ano corrente) que ainda não foi lido, uma segunda leitura o busca.
export const dynamic = 'force-dynamic'

/** Quantos anos a pill oferece quando nenhum resumo carregou e `anosDisponiveis` não veio. */
const JANELA_FALLBACK = 3

type Db = Awaited<ReturnType<typeof getServerClient>>

/** Transforma o `T | null` do `parseRpc` no `Carregado<T>` que a página entrega ao container. */
function carregado<T>(dados: T | null): Carregado<T> {
  return dados === null ? { ok: false } : { ok: true, dados }
}

/** As duas leituras de UM ano. Nunca rejeita: uma rejeição (não só `error` no retorno) vira um
 *  `RpcLike` com erro — o `parseRpc` loga e devolve null, e a leitura vira `{ ok: false }`. */
async function lerAno(db: Db, ano: number): Promise<LeituraAno> {
  const [resumoRes, fornecedoresRes] = (
    await Promise.allSettled([
      db.rpc('get_marketing_gastos_resumo', { p_ano: ano }),
      db.rpc('get_marketing_gastos_fornecedores', { p_ano: ano }),
    ])
  ).map((r): RpcLike => (
    r.status === 'fulfilled'
      ? r.value
      : { data: null, error: { message: `chamada rejeitada: ${String(r.reason)}` } }
  ))

  return {
    ano,
    resumo: carregado(parseRpc(resumoMarketingSchema, resumoRes, `get_marketing_gastos_resumo(${ano})`)),
    fornecedores: carregado(
      parseRpc(fornecedoresMarketingSchema, fornecedoresRes, `get_marketing_gastos_fornecedores(${ano})`),
    ),
  }
}

/** A leitura da proporção de UM ano (`get_marketing_proporcao_receita`, 0293) — competência, a
 *  mesma conta da DRE. Fica fora de `LeituraAno`: é regime diferente (o resto da página é pago) e o
 *  card que a consome degrada sozinho. Nunca rejeita (mesma proteção de `lerAno`). */
async function lerProporcao(db: Db, ano: number): Promise<LeituraProporcao> {
  const [r] = await Promise.allSettled([db.rpc('get_marketing_proporcao_receita', { p_ano: ano })])
  const res: RpcLike = r.status === 'fulfilled'
    ? r.value
    : { data: null, error: { message: `chamada rejeitada: ${String(r.reason)}` } }
  return {
    ano,
    proporcao: carregado(parseRpc(proporcaoReceitaMarketingSchema, res, `get_marketing_proporcao_receita(${ano})`)),
  }
}

/** Tudo o que se lê de UM ano: as duas leituras do resumo/fornecedores e a proporção, em paralelo. */
async function lerAnoCompleto(db: Db, ano: number): Promise<{ leitura: LeituraAno; proporcao: LeituraProporcao }> {
  const [leitura, proporcao] = await Promise.all([lerAno(db, ano), lerProporcao(db, ano)])
  return { leitura, proporcao }
}

export default async function GastosMarketingPage({
  searchParams,
}: {
  searchParams: Promise<ParamsAnos>
}) {
  await requireArea('marketing/gastos')

  const sp = await searchParams
  // "Hoje" NO FUSO DE SÃO PAULO e no SERVIDOR — o runtime roda em UTC e o cliente não pode usar
  // relógio próprio (mismatch de hidratação; perto da virada do ano erraria o ano corrente).
  const hoje = hojeSP()
  const anoCorrente = parseInt(hoje.slice(0, 4), 10)

  const pedidos = anosDaUrl(sp, anoCorrente)
  const db = await getServerClient()

  // Leituras já feitas, por ano. Round 1: os anos pedidos, todos em paralelo.
  const lidos = new Map<number, LeituraAno>()
  const proporcoes = new Map<number, LeituraProporcao>()
  const guardar = (l: { leitura: LeituraAno; proporcao: LeituraProporcao }) => {
    lidos.set(l.leitura.ano, l.leitura)
    proporcoes.set(l.proporcao.ano, l.proporcao)
  }
  for (const l of await Promise.all(pedidos.map(a => lerAnoCompleto(db, a)))) guardar(l)

  // Pills de ano. Fonte: `anosDisponiveis` (anos com lançamento na base), que é GLOBAL — qualquer
  // resumo carregado traz a mesma lista. Só se NENHUM carregou cai para os `JANELA_FALLBACK` anos
  // até o corrente (mesmo critério da DRE). Sempre inclui o ano corrente (em janeiro ele ainda pode
  // não ter lançamento e a pill não pode sumir); um `?anos=` digitado fora da base NÃO ganha pill.
  const daBase = [...lidos.values()].flatMap(l => (l.resumo.ok ? [l.resumo.dados.anosDisponiveis] : []))[0] ?? null
  const base = daBase
    ?? Array.from({ length: JANELA_FALLBACK }, (_, i) => anoCorrente - (JANELA_FALLBACK - 1) + i)
  const anosDisponiveis = [...new Set([...base, anoCorrente])].sort((a, b) => a - b)

  // A seleção final só tem anos com pill. Sem a lista da base (todos falharam), vale o pedido.
  const anos = resolverAnos(pedidos, daBase === null ? null : anosDisponiveis, anoCorrente)

  // Round 2 (raro): o filtro trocou o pedido pelo ano corrente e ele ainda não foi lido.
  const faltam = anos.filter(a => !lidos.has(a))
  for (const l of await Promise.all(faltam.map(a => lerAnoCompleto(db, a)))) guardar(l)

  const dados: DadosGastosMarketing = {
    anos,
    anosDisponiveis,
    hoje,
    porAno: anos.flatMap(a => {
      const l = lidos.get(a)
      return l ? [l] : []
    }),
  }

  // Card "Proporção sobre a Receita Bruta": uma leitura por ano selecionado. Um ano sem leitura
  // (não deveria ocorrer) entra como falha — o card o nomeia no aviso em vez de omiti-lo.
  const leiturasProporcao = anos.map((a): LeituraProporcao => proporcoes.get(a) ?? { ano: a, proporcao: { ok: false } })

  return <GastosContent dados={dados} proporcao={<ProporcaoReceita anos={anos} leituras={leiturasProporcao} />} />
}
