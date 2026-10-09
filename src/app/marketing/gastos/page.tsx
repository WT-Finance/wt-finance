import { getServerClient } from '@/lib/supabase/server'
import { requireArea } from '@/lib/auth/sessao'
import { hojeSP } from '@/lib/fmt'
import { type RpcLike } from '@/lib/rpc'
import { parseRpc } from '@/lib/schemas-rpc'
import {
  fornecedoresMarketingSchema,
  lancamentosMarketingSchema,
  resumoMarketingSchema,
} from '@/lib/marketing/schemas'
import GastosContent from '@/components/marketing/gastos/gastos-content'
import type { Carregado, DadosGastosMarketing } from '@/lib/marketing/tipos'

// Marketing · Despesas de Marketing (v6.3.0). Área própria 'marketing/gastos' (migration 0292).
//
// Dado: 3 RPCs de leitura (`get_marketing_gastos_resumo|fornecedores|lancamentos`), todas com o
// MESMO predicado da DRE de caixa (bloco MKT, só realizado) — o total da página é a linha
// "(-) Despesas Marketing" da DRE. O resumo é lido DUAS vezes (ano e ano−1: comparativo).
//
// Cada leitura falha SOZINHA: `Promise.allSettled` + `parseRpc` por chamada; o que cair vira
// `{ ok: false }` e só o card que depende dele mostra o erro — a página fica de pé. O retorno de
// `.rpc()` é thenable (sem `.catch`): o tratamento de falha é o `status` de cada item.
//
// Ano: `?ano=AAAA`, default = ano corrente em São Paulo.
export const dynamic = 'force-dynamic'

type ParamBruto = string | string[] | undefined
interface SearchParams { ano?: ParamBruto }

const primeiro = (v: ParamBruto): string | undefined => (Array.isArray(v) ? v[0] : v)

/** Piso do `?ano=`. As RPCs aceitam 2000..2100 e o comparativo lê `ano − 1`, então o piso é 2001
 *  (com 2000, o ano anterior seria rejeitado pela RPC). Não é "o primeiro ano com dado" — esse vem
 *  do resumo (`anosDisponiveis`) e pode recuar se a base ganhar histórico. */
const ANO_PISO = 2001

/** Quantos anos a pill oferece quando o resumo do ano falhou e `anosDisponiveis` não veio. */
const JANELA_FALLBACK = 3

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max)
}

/** Transforma o `T | null` do `parseRpc` no `Carregado<T>` que a página entrega ao container. */
function carregado<T>(dados: T | null): Carregado<T> {
  return dados === null ? { ok: false } : { ok: true, dados }
}

export default async function GastosMarketingPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  await requireArea('marketing/gastos')

  const sp = await searchParams
  // "Hoje" NO FUSO DE SÃO PAULO e no SERVIDOR — o runtime roda em UTC e o cliente não pode usar
  // relógio próprio (mismatch de hidratação; perto da virada do ano erraria o ano corrente).
  const hoje = hojeSP()
  const anoCorrente = parseInt(hoje.slice(0, 4), 10)

  const pedido = parseInt(primeiro(sp.ano) ?? '', 10)
  const ano = clamp(Number.isNaN(pedido) ? anoCorrente : pedido, ANO_PISO, anoCorrente)

  const db = await getServerClient()

  // Cada chamada é independente; uma rejeição (não só `error` no retorno) vira um RpcLike com erro
  // — o `parseRpc` loga e devolve null, e a leitura vira `{ ok: false }`.
  const [resumoRes, anteriorRes, fornecedoresRes, lancamentosRes] = (
    await Promise.allSettled([
      db.rpc('get_marketing_gastos_resumo', { p_ano: ano }),
      db.rpc('get_marketing_gastos_resumo', { p_ano: ano - 1 }),
      db.rpc('get_marketing_gastos_fornecedores', { p_ano: ano }),
      db.rpc('get_marketing_gastos_lancamentos', { p_ano: ano }),
    ])
  ).map((r): RpcLike => (
    r.status === 'fulfilled'
      ? r.value
      : { data: null, error: { message: `chamada rejeitada: ${String(r.reason)}` } }
  ))

  const resumo = parseRpc(resumoMarketingSchema, resumoRes, `get_marketing_gastos_resumo(${ano})`)
  const resumoAnterior = parseRpc(
    resumoMarketingSchema, anteriorRes, `get_marketing_gastos_resumo(${ano - 1})`,
  )
  const fornecedores = parseRpc(
    fornecedoresMarketingSchema, fornecedoresRes, `get_marketing_gastos_fornecedores(${ano})`,
  )
  const lancamentos = parseRpc(
    lancamentosMarketingSchema, lancamentosRes, `get_marketing_gastos_lancamentos(${ano})`,
  )

  // Pills de ano. Fonte: `anosDisponiveis` (anos com lançamento na base), que é GLOBAL — o resumo
  // do ano anterior carrega a mesma lista, então ele cobre a falha do resumo do ano. Só se os DOIS
  // falharem cai para os `JANELA_FALLBACK` anos até o corrente (mesmo critério da DRE). Sempre
  // inclui o ano corrente (em janeiro ele ainda pode não ter lançamento e a pill não pode sumir);
  // um `?ano=` digitado fora da base NÃO ganha pill.
  const base = resumo?.anosDisponiveis
    ?? resumoAnterior?.anosDisponiveis
    ?? Array.from({ length: JANELA_FALLBACK }, (_, i) => anoCorrente - (JANELA_FALLBACK - 1) + i)
  const anosDisponiveis = [...new Set([...base, anoCorrente])].sort((a, b) => a - b)

  const dados: DadosGastosMarketing = {
    ano,
    anosDisponiveis,
    hoje,
    resumo: carregado(resumo),
    resumoAnterior: carregado(resumoAnterior),
    fornecedores: carregado(fornecedores),
    lancamentos: carregado(lancamentos),
  }

  // `key={ano}`: trocar o ano remonta o container e o recorte de meses volta ao padrão do ano.
  return <GastosContent key={ano} dados={dados} />
}
