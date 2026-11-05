import { getServerClient } from '@/lib/supabase/server'
import { requireArea } from '@/lib/auth/sessao'
import { hojeSP } from '@/lib/fmt'
import { type RpcLike } from '@/lib/rpc'
import { parseRpc } from '@/lib/schemas-rpc'
import { anosPadrao } from '@/lib/marketing/anos'
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
// "(-) Despesas Marketing" da DRE. A página lê as duas de CADA um dos 3 anos, todas em paralelo. (`get_marketing_gastos_lancamentos` e o resumo do ano anterior deixaram de ser lidos:
// a tela não tem mais tabela de lançamentos nem comparativo.) Junto vai a 3ª leitura por ano,
// `get_marketing_proporcao_receita` (0293) — % de Marketing sobre a Receita Bruta por COMPETÊNCIA,
// o mesmo número da grade da DRE — que alimenta o card "Proporção sobre a Receita Bruta".
//
// Cada leitura falha SOZINHA: `Promise.allSettled` + `parseRpc` por chamada; o que cair vira
// `{ ok: false }` e só o card que depende dele mostra o erro — a página fica de pé. O retorno de
// `.rpc()` é thenable (sem `.catch`): o tratamento de falha é o `status` de cada item.
//
// Anos: FIXOS (v6.5.0) — o ano corrente em São Paulo e os dois anteriores (`anosPadrao`: 2024, 2025,
// 2026), sem filtro: `?anos=`/`?ano=` não têm efeito. Um ano sem dado na base aparece com o estado
// vazio do próprio card.
export const dynamic = 'force-dynamic'

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

export default async function GastosMarketingPage() {
  await requireArea('marketing/gastos')

  // "Hoje" NO FUSO DE SÃO PAULO e no SERVIDOR — o runtime roda em UTC e o cliente não pode usar
  // relógio próprio (mismatch de hidratação; perto da virada do ano erraria o ano corrente).
  const hoje = hojeSP()
  const anoCorrente = parseInt(hoje.slice(0, 4), 10)

  // Página FIXA: o ano corrente e os dois anteriores (crescente). Ano sem lançamento na base entra
  // do mesmo jeito — cada card mostra o próprio estado vazio, nunca zero fingido.
  const anos = anosPadrao(anoCorrente)
  const db = await getServerClient()

  const lidas = await Promise.all(anos.map(a => lerAnoCompleto(db, a)))

  const dados: DadosGastosMarketing = {
    anos,
    hoje,
    porAno: lidas.map(l => l.leitura),
  }

  // Card "Proporção sobre a Receita Bruta": uma leitura por ano, na mesma ordem de `anos`.
  const leiturasProporcao = lidas.map(l => l.proporcao)

  return <GastosContent dados={dados} proporcao={<ProporcaoReceita anos={anos} leituras={leiturasProporcao} />} />
}
