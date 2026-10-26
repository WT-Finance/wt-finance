import type { ZodType } from 'zod'
import { getServerClient } from '@/lib/supabase/server'
import { requireArea } from '@/lib/auth/sessao'
import { hojeSP } from '@/lib/fmt'
import { type RpcLike } from '@/lib/rpc'
import { parseRpc } from '@/lib/schemas-rpc'
import { anosSelecionados, anosDasPillsGeral } from '@/lib/financeiro-geral/periodo'
import { podeGerirAntecipacoes } from '@/lib/financeiro-geral/gestao'
import { antecipacoesSchema, prejuizosSchema, recebiveisSchema } from '@/lib/financeiro-geral/schemas'
import type { Carregado, DadosGeral, LeituraAno } from '@/lib/financeiro-geral/tipos'
import type { ParamsAnos } from '@/lib/marketing/anos'
import GeralContent from '@/components/financeiro/geral/geral-content'

// Financeiro · Geral (v6.4.0; reorganizada na v6.5.0) — leitura executiva da diretoria. Área própria
// 'financeiro/geral' (migration 0297). Três seções com conteúdo, cada uma autocontida (Vendas e Cartões de
// crédito são cascas, sem leitura):
//
//   ESTOQUE  Recebíveis e inadimplência  get_geral_recebiveis()         — a posição na última carga; ignora as pills
//   FLUXO    Perdas e prejuízos          get_geral_prejuizos(p_ano)     — uma chamada por ano selecionado
//   FLUXO    Antecipações                get_geral_antecipacoes(p_ano)  — idem
//
// As leituras do ANO CORRENTE (prejuízos e antecipações) vêm SEMPRE, mesmo com a pill desmarcada: a faixa
// do topo e "Dias sem antecipação" não dependem das pills. Se o ano corrente está selecionado, a leitura da
// lista é reaproveitada (uma chamada só).
//
// Todas as leituras partem EM PARALELO e cada uma falha SOZINHA (inv. 11): `Promise.allSettled` + `parseRpc`
// por chamada; o que cair vira `{ ok: false }` e só a seção que depende dele mostra o erro — a página fica
// de pé. O retorno de `.rpc()` é thenable (sem `.catch`): o tratamento de falha é o `status` de cada item.
// As RPCs são tipadas pelo `database.ts` GERADO (nenhum helper frouxo) e `.rpc` é chamado sem destacar o método.
//
// Anos: `?anos=2025,2026` (ou o antigo `?ano=2026`); default = os três últimos anos até o corrente em São
// Paulo. As pills são a janela fixa PRIMEIRO_ANO..corrente (as RPCs não devolvem `anosDisponiveis`).
export const dynamic = 'force-dynamic'

type Db = Awaited<ReturnType<typeof getServerClient>>

/** Uma rejeição (não só `error` no retorno) vira um `RpcLike` com erro — o `parseRpc` loga e devolve null. */
async function resolver(chamada: PromiseLike<RpcLike>): Promise<RpcLike> {
  const [r] = await Promise.allSettled([chamada])
  return r.status === 'fulfilled' ? r.value : { data: null, error: { message: `chamada rejeitada: ${String(r.reason)}` } }
}

function carregado<T>(dados: T | null): Carregado<T> {
  return dados === null ? { ok: false } : { ok: true, dados }
}

/** A leitura de UM ano de uma RPC de fluxo: nunca rejeita; falha vira `{ ok: false }` só daquele ano. */
async function lerAno<T>(
  ano: number,
  chamada: PromiseLike<RpcLike>,
  schema: ZodType<T>,
  nome: string,
): Promise<LeituraAno<T>> {
  const res = await resolver(chamada)
  return { ano, leitura: carregado(parseRpc(schema, res, `${nome}(${ano})`)) }
}

export default async function GeralPage({ searchParams }: { searchParams: Promise<ParamsAnos> }) {
  const sessao = await requireArea('financeiro/geral')

  const sp = await searchParams
  // "Hoje" NO FUSO DE SÃO PAULO e no SERVIDOR — o runtime roda em UTC e o cliente não pode usar relógio
  // próprio (mismatch de hidratação; perto da virada do ano erraria o ano corrente).
  const hoje = hojeSP()
  const anoCorrente = parseInt(hoje.slice(0, 4), 10)
  const anos = anosSelecionados(sp, anoCorrente)
  // O ano corrente entra na leitura mesmo fora da seleção (ver o cabeçalho); a lista da página continua
  // sendo só a dos anos selecionados.
  const anosLidos = anos.includes(anoCorrente) ? anos : [...anos, anoCorrente]

  const db: Db = await getServerClient()

  // Cada `db.rpc(...)` é chamado DIRETO no cliente (nunca `const f = db.rpc`: destacar o método perde o
  // `this`); o builder é thenable e só dispara quando `resolver` o aguarda — todos partem juntos.
  const [recebiveisRes, antecipacoesLidas, prejuizosLidos] = await Promise.all([
    resolver(db.rpc('get_geral_recebiveis')),
    Promise.all(anosLidos.map(ano => lerAno(ano, db.rpc('get_geral_antecipacoes', { p_ano: ano }), antecipacoesSchema, 'get_geral_antecipacoes'))),
    Promise.all(anosLidos.map(ano => lerAno(ano, db.rpc('get_geral_prejuizos', { p_ano: ano }), prejuizosSchema, 'get_geral_prejuizos'))),
  ])

  const selecionado = (l: LeituraAno<unknown>) => anos.includes(l.ano)
  const doCorrente = <T,>(lidas: LeituraAno<T>[]): LeituraAno<T> =>
    lidas.find(l => l.ano === anoCorrente) ?? { ano: anoCorrente, leitura: { ok: false } }

  const dados: DadosGeral = {
    anos,
    anosDisponiveis: anosDasPillsGeral(anoCorrente),
    hoje,
    recebiveis: carregado(parseRpc(recebiveisSchema, recebiveisRes, 'get_geral_recebiveis')),
    antecipacoes: antecipacoesLidas.filter(selecionado),
    prejuizos: prejuizosLidos.filter(selecionado),
    corrente: {
      prejuizos: doCorrente(prejuizosLidos),
      antecipacoes: doCorrente(antecipacoesLidas),
    },
    // Só quem tem 'financeiro/geral/gestao' vê o botão (as actions e as RPCs checam de novo).
    podeGerir: podeGerirAntecipacoes(sessao.permissoes),
  }

  return <GeralContent dados={dados} />
}
