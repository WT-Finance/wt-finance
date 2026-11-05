import type { ZodType } from 'zod'
import { getServerClient } from '@/lib/supabase/server'
import { requireArea } from '@/lib/auth/sessao'
import { hojeSP } from '@/lib/fmt'
import { type RpcLike } from '@/lib/rpc'
import { parseRpc } from '@/lib/schemas-rpc'
import { anosDasPillsGeral, anosDosPrejuizos, anosFixosDoFluxo, anosParaLer, type ParamsGeral } from '@/lib/financeiro-geral/periodo'
import { podeGerirAntecipacoes } from '@/lib/financeiro-geral/gestao'
import { antecipacoesSchema, prejuizosSchema, recebiveisSchema } from '@/lib/financeiro-geral/schemas'
import type { Carregado, DadosGeral, LeituraAno } from '@/lib/financeiro-geral/tipos'
import GeralContent from '@/components/financeiro/geral/geral-content'

// Financeiro · Geral (v6.4.0; reorganizada na v6.5.0) — leitura executiva da diretoria. Área própria
// 'financeiro/geral' (migration 0297). Três seções com conteúdo, cada uma autocontida (Vendas e Cartões de
// crédito são cascas, sem leitura):
//
//   ESTOQUE  Recebíveis e inadimplência  get_geral_recebiveis()         — a posição na última carga; ignora as pills
//   FLUXO    Perdas e prejuízos          get_geral_prejuizos(p_ano)     — uma chamada por ano selecionado
//   FLUXO    Antecipações                get_geral_antecipacoes(p_ano)  — idem
//
// As leituras do ANO CORRENTE (prejuízos e antecipações) vêm SEMPRE, mesmo com a pill de Prejuízos desmarcada: a
// faixa do topo e "Dias sem antecipação" não dependem das pills. O corrente está nos 3 anos fixos, e a leitura
// de prejuízos é a UNIÃO (pills ∪ fixos) com cada ano lido uma vez, repartida em `prejuizos` (pills) e
// `prejuizosMensal` (fixos).
//
// Todas as leituras partem EM PARALELO e cada uma falha SOZINHA (inv. 11): `Promise.allSettled` + `parseRpc`
// por chamada; o que cair vira `{ ok: false }` e só a seção que depende dele mostra o erro — a página fica
// de pé. O retorno de `.rpc()` é thenable (sem `.catch`): o tratamento de falha é o `status` de cada item.
// As RPCs são tipadas pelo `database.ts` GERADO (nenhum helper frouxo) e `.rpc` é chamado sem destacar o método.
//
// Anos: Perdas e prejuízos tem pills (`?prejuizos=2025,2026`; o antigo `?anos=`/`?ano=` vale como valor inicial;
// default = os anos desde PRIMEIRO_ANO até o corrente em São Paulo; a janela é fixa porque as RPCs não devolvem
// `anosDisponiveis`) — elas valem só para "Prejuízo por Pessoa". O "Prejuízo Mensal" e Antecipações são FIXOS: o
// ano corrente e os dois anteriores, sem pills e sem parâmetro.
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

export default async function GeralPage({ searchParams }: { searchParams: Promise<ParamsGeral> }) {
  const sessao = await requireArea('financeiro/geral')

  const sp = await searchParams
  // "Hoje" NO FUSO DE SÃO PAULO e no SERVIDOR — o runtime roda em UTC e o cliente não pode usar relógio
  // próprio (mismatch de hidratação; perto da virada do ano erraria o ano corrente).
  const hoje = hojeSP()
  const anoCorrente = parseInt(hoje.slice(0, 4), 10)
  // Perdas e prejuízos tem pills (`?prejuizos=`; o antigo `?anos=` é o valor inicial), que valem só para a tabela
  // por pessoa. O "Prejuízo Mensal" e as Antecipações são FIXOS — o ano corrente e os dois anteriores —, sem URL.
  const anosPrejuizos = anosDosPrejuizos(sp, anoCorrente)
  const anosFixos = anosFixosDoFluxo(anoCorrente)
  // Prejuízos lê a UNIÃO (pills ∪ fixos): cada ano UMA chamada. O ano corrente está sempre nos fixos, então a
  // leitura da faixa do topo sai daqui também.
  const prejuizosALer = anosParaLer(anosPrejuizos, anosFixos)

  const db: Db = await getServerClient()

  // Cada `db.rpc(...)` é chamado DIRETO no cliente (nunca `const f = db.rpc`: destacar o método perde o
  // `this`); o builder é thenable e só dispara quando `resolver` o aguarda — todos partem juntos.
  const [recebiveisRes, antecipacoesLidas, prejuizosLidos] = await Promise.all([
    resolver(db.rpc('get_geral_recebiveis')),
    Promise.all(anosFixos.map(ano => lerAno(ano, db.rpc('get_geral_antecipacoes', { p_ano: ano }), antecipacoesSchema, 'get_geral_antecipacoes'))),
    Promise.all(prejuizosALer.map(ano => lerAno(ano, db.rpc('get_geral_prejuizos', { p_ano: ano }), prejuizosSchema, 'get_geral_prejuizos'))),
  ])

  const doCorrente = <T,>(lidas: LeituraAno<T>[]): LeituraAno<T> =>
    lidas.find(l => l.ano === anoCorrente) ?? { ano: anoCorrente, leitura: { ok: false } }

  const dados: DadosGeral = {
    anosPrejuizos,
    anosAntecipacoes: anosFixos,
    anosDisponiveis: anosDasPillsGeral(anoCorrente),
    hoje,
    recebiveis: carregado(parseRpc(recebiveisSchema, recebiveisRes, 'get_geral_recebiveis')),
    antecipacoes: antecipacoesLidas,
    prejuizos: prejuizosLidos.filter(l => anosPrejuizos.includes(l.ano)),
    prejuizosMensal: prejuizosLidos.filter(l => anosFixos.includes(l.ano)),
    corrente: {
      prejuizos: doCorrente(prejuizosLidos),
      antecipacoes: doCorrente(antecipacoesLidas),
    },
    // Só quem tem 'financeiro/geral/gestao' vê o botão (as actions e as RPCs checam de novo).
    podeGerir: podeGerirAntecipacoes(sessao.permissoes),
  }

  return <GeralContent dados={dados} />
}
