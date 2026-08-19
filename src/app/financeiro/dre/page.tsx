import { Suspense } from 'react'
import Link from 'next/link'
import { SquarePen } from 'lucide-react'
import { getServerClient } from '@/lib/supabase/server'
import { requireArea } from '@/lib/auth/sessao'
import { type RpcLike } from '@/lib/rpc'
import { parseRpc } from '@/lib/schemas-rpc'
import { resolverPeriodoCompleto } from '@/lib/periodo'
import { hojeSP } from '@/lib/fmt'
import { rpcDre } from '@/lib/dre/rpc-dre'
import { buscarUltimaCargaMovimentacao } from '@/lib/dre/ultima-carga-movimentacao'
import {
  dreMensalSchema,
  decomposicaoBlocoSchema,
  type DreMensal,
  type DreLinha,
  type DreBandeja,
} from '@/lib/dre/schemas'
import { rankingCaixaSchema, type RankingCaixa as RankingCaixaData } from '@/lib/fluxo/rpc-fluxo'
import PeriodoFilterPillsUrl from '@/components/shared/periodo-filter-pills-url'
import DecomposicaoLancamentos from '@/components/financeiro/decomposicao-lancamentos'
import RankingCaixa from '@/components/financeiro/ranking-caixa'
import TopSection from '@/components/shared/top-section'
import TabelaDre from '@/components/financeiro/dre/tabela-dre'
import ResumoExecutivo from '@/components/financeiro/dre/resumo-executivo'
import { PILL, PILL_NEUTRO } from '@/components/shared/botoes'

// DRE por Fluxo de Caixa (v5.3.0 · Onda 2) — a tabela hierárquica da controladoria
// (159 linhas) na aba definitiva. M4: a tabela lê a estrutura viva + o fato real via
// `get_dre_mensal` (a fixture da M0 saiu deste caminho — ver tabela-dre.tsx). Ano
// navegável por `?ano=` (pills na própria TabelaDre), janela de 3 anos
// [corrente-2, corrente], default = ano corrente no fuso de São Paulo. O editor da
// estrutura viva vive em página própria (/financeiro/dre/estrutura), atrás do botão
// "Editar estrutura" da toolbar.
//
// A Decomposição dos Lançamentos (semente da aba desde a v5.2.0, então "Composição")
// DEIXOU de ter TopSection própria na v5.3.1: vive agora dentro de "Regime de Caixa",
// logo abaixo da tabela, e passou a agrupar por BLOCO DA ESTRUTURA VIVA (não pelo grupo
// nativo do Monde) via `get_decomposicao_bloco` (0209) — é o que a faz reconciliar ao
// centavo com os subtotais da tabela acima. O `?preset=&from=&to=` das pills continua
// INDEPENDENTE do `?ano=` da tabela: são dois recortes de propósito distinto no mesmo
// card (o card é autocontido e traz as próprias pills).
//
// RBAC: área própria 'financeiro/dre' (0197) — cobre ver E editar a estrutura (decisão
// firme; divisão ver/editar = futuro se precisar).

interface SearchParams {
  preset?: string
  from?:   string
  to?:     string
  ano?:    string
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max)
}

export default async function DrePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  await requireArea('financeiro/dre')

  const sp = await searchParams
  const { from, to } = resolverPeriodoCompleto({ ...sp, defaultPreset: 'este-ano' })

  // Ano corrente NO FUSO DE SÃO PAULO — nunca `new Date().getFullYear()` cru (o
  // runtime do servidor roda em UTC; perto da virada do ano isso adiantaria/
  // atrasaria em relação ao calendário de SP). `hojeSP()` é o helper canônico.
  const anoCorrente     = parseInt(hojeSP().slice(0, 4), 10)
  const anoPedido       = parseInt(sp.ano ?? '', 10) || anoCorrente
  const ano             = clamp(anoPedido, anoCorrente - 2, anoCorrente)
  const anosDisponiveis = [anoCorrente - 2, anoCorrente - 1, anoCorrente]

  const db = await getServerClient()

  // TODAS as chamadas em UM `Promise.allSettled` (não serializar) — `rpcDre` é o helper
  // de tipagem frouxa genérico do módulo (não específico de DRE apesar do nome),
  // reaproveitado aqui para as duas RPCs de Composição também, unificando o tipo
  // de retorno (`RpcLike`) sem o cast ad-hoc local que existia antes.
  //
  // Anos buscados = os da JANELA NAVEGÁVEL (`anosDisponiveis`, que a visão Consolidado
  // usa como caixas de seleção — qualquer combinação pode ser pedida sem ida ao servidor)
  // ∪ os DOIS anos seguintes (a coluna "Total do ano" da Mensal abre, por um toggle, o
  // previsto de ano+1/ano+2, como no modelo da controladoria). É sempre a MESMA RPC com
  // outro `p_ano` — nenhuma migration nova, e como tudo corre em paralelo o custo em
  // wall-clock é o da chamada mais lenta (medido: ~240ms aquecido para o conjunto).
  const anosSeguintesNums = [ano + 1, ano + 2]
  const anosDre = [...new Set([...anosDisponiveis, ...anosSeguintesNums])]

  // ⚠️ Tudo num `Promise.allSettled` ÚNICO, e o tratamento de falha é o `status` de cada
  // item — NUNCA `.catch()` na chamada. O que `rpcDre` devolve é o *thenable* do Supabase
  // (um builder com `.then`), não uma Promise: `.catch` não existe nele e estoura
  // "rpcDre(...).catch is not a function" em RUNTIME, sem o `tsc` reclamar.
  //
  // O frescor da base (`buscarUltimaCargaMovimentacao`) corre no MESMO tempo de espera,
  // mas FORA do `allSettled` acima: ele devolve `string | null`, não um `RpcLike`, e
  // enfiá-lo naquele array quebraria a indexação posicional que casa `anosDre[i]` com
  // `resultados[i]`. O `Promise.all` externo é seguro porque essa função é fail-safe por
  // construção (try/catch → `null`): ela nunca rejeita, então não derruba as outras.
  const empty: RpcLike = { data: null, error: null }
  const [resultados, ultimaCargaMovimentacao] = await Promise.all([
    Promise.allSettled([
      ...anosDre.map(a => rpcDre(db, 'get_dre_mensal', { p_ano: a })),
      rpcDre(db, 'get_decomposicao_bloco', { p_from: from, p_to: to }),
      // "Maiores variações" (v5.7.0) — veio do Fluxo de Caixa. Entra no MESMO estágio:
      // é mais uma chamada em paralelo, então não custa wall-clock nenhum.
      rpcDre(db, 'get_fluxo_ranking'),
    ]).then(rs => rs.map(r => (r.status === 'fulfilled' ? r.value : empty))),
    buscarUltimaCargaMovimentacao(),
  ])

  const dreAnos = new Map(
    anosDre.map((a, i) => [a, parseRpc(dreMensalSchema, resultados[i], `get_dre_mensal(${a})`)]),
  )
  const decomposicaoRes = resultados[anosDre.length]
  const rankingRes      = resultados[anosDre.length + 1]

  const dre = dreAnos.get(ano) ?? null

  // ── JANELA DO YTD ────────────────────────────────────────────────────────────
  // Quantos meses entram no "YTD" de TODOS os anos comparados. Ancorado em HOJE
  // (mês corrente no fuso de SP), NUNCA no ano exibido: "year to date" é, por
  // definição, jan..mês-corrente do calendário — não muda porque o usuário está
  // olhando um ano fechado. Fixar a janela num número só é o que torna a comparação
  // honesta: "mesmo período" = a MESMA fatia do calendário em cada ano.
  //
  // ⚠️ Custou caro: antes isto era `dre?.mes_corrente ?? 12`, o mês do ano EXIBIDO.
  // Com `?ano=2025` (ano fechado, sem mês corrente) a janela virava 12 e o YTD de
  // TODO ano passava a ser o ano inteiro — a coluna "YTD 25" ficava idêntica à coluna
  // "2025" e o "YTD 26" somava dezembro de um ano que ainda não terminou. Números
  // plausíveis, silenciosamente errados; nenhum gate pega isso.
  const mesJanela = parseInt(hojeSP().slice(5, 7), 10)

  /** Indexa um payload por linha: `b:<chave>` (blocos/totalizadores) e `c:<categoria_id>`
   *  (categorias e bandeja) — o MESMO par de chaves que a tabela usa para casar as linhas
   *  entre anos (a estrutura pode ter mudado de um ano para o outro; casar por chave, e
   *  não por posição, é o que impede a coluna de escorregar de linha). */
  function indexar<T>(p: DreMensal, valor: (l: DreLinha | DreBandeja) => T): Record<string, T> {
    const m: Record<string, T> = {}
    for (const l of p.linhas) {
      if (l.t === 'cat') { if (l.categoria_id != null) m[`c:${l.categoria_id}`] = valor(l) }
      else if (l.chave) { m[`b:${l.chave}`] = valor(l) }
    }
    for (const b of p.bandeja) m[`c:${b.categoria_id}`] = valor(b)
    return m
  }

  // Totais por linha de cada ano seguinte (visão Mensal, toggle do "Total do ano").
  // Ano que falhar sai da lista — fail-safe: a coluna simplesmente não aparece.
  const anosSeguintes = anosSeguintesNums
    .map(a => {
      const p = dreAnos.get(a)
      return p ? { ano: a, totais: indexar(p, l => l.total) } : null
    })
    .filter((x): x is { ano: number; totais: Record<string, number> } => x !== null)

  // ── Base do CONSOLIDADO (visão ano-a-ano, seleção MÚLTIPLA de anos) ──────────
  // Um registro por ano da janela navegável, com os três números que a visão precisa
  // por linha: o ano CHEIO (`total`), o YTD na janela acima e os vencidos em aberto
  // (`venc`). Tudo já resolvido aqui para que marcar/desmarcar um ano na tela seja
  // puramente client-side — nenhuma ida ao servidor ao mudar a seleção.
  const consolidadoAnos = anosDisponiveis
    .map(a => {
      const p = dreAnos.get(a)
      if (!p) return null
      return {
        ano: a,
        // `corrente` decide quem pode exibir previsto/vencidos: num ano FECHADO,
        // `total − ytd` é realizado de ago..dez, não previsão — rotulá-lo de "previsto"
        // seria mentira. Só o ano corrente tem previsto em aberto.
        corrente: p.relacao === 'corrente',
        porLinha: indexar(p, l => ({
          total: l.total,
          ytd:   l.meses.slice(0, mesJanela).reduce((s, v) => s + v, 0),
          venc:  l.venc,
        })),
      }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)

  // Decomposição por BLOCO da estrutura viva no intervalo das pills (0209).
  // `null` = a chamada FALHOU — estado DISTINTO de "período sem lançamentos"; o card
  // anuncia cada caso com a sua própria mensagem, porque dizer "sem lançamentos" numa
  // falha seria dado errado parecendo certo. Em nenhum dos dois casos a página cai.
  const dec = parseRpc(decomposicaoBlocoSchema, decomposicaoRes, 'get_decomposicao_bloco')

  // Maiores variações (v5.7.0): categorias que mais pioraram/melhoraram o caixa no YTD
  // contra o mesmo período do ano anterior. Falha ⇒ objeto vazio, e o card diz "sem
  // movimentações para ranquear" por conta própria — o mesmo desenho fail-safe que ele
  // já tinha no Fluxo de Caixa.
  const rankingCaixa: RankingCaixaData =
    parseRpc(rankingCaixaSchema, rankingRes, 'get_fluxo_ranking') ?? { pioraram: [], melhoraram: [] }

  return (
    <div>
      <TopSection titulo="Regime de Caixa">
        {/* ORDEM DOS CARDS (v5.7.0, decisão do Yan): Resumo Executivo → DRE → Maiores
            variações → Decomposição. A leitura vai do agregado ao detalhe — as seis
            linhas-chave primeiro, o demonstrativo inteiro depois, e só então as duas
            decomposições (por categoria que variou, por bloco no período). Antes o Resumo
            vinha DEPOIS da tabela, o que obrigava a rolar o demonstrativo inteiro para
            chegar ao resumo dele. */}
        <div className="space-y-6">
          {/* Resumo Executivo — CARD PRÓPRIO desde a v5.4.1, irmão do card da DRE e não
              mais um bloco dentro dele. Ele nunca dependeu de `dre` (o ano NAVEGADO), só
              de `consolidadoAnos`; morando dentro da TabelaDre precisava ser repetido nos
              dois ramos de render dela e sumia junto num ramo que não era dele.
              A ÂNCORA é `anoCorrente`, de propósito distinta do `ano` da pill abaixo. */}
          <ResumoExecutivo anoCorrente={anoCorrente} consolidadoAnos={consolidadoAnos} />

          <TabelaDre
            dados={dre}
            ano={ano}
            anosDisponiveis={anosDisponiveis}
            anosSeguintes={anosSeguintes}
            consolidadoAnos={consolidadoAnos}
            mesJanela={mesJanela}
            ultimaCargaMovimentacao={ultimaCargaMovimentacao}
            slotAcoes={
              <Link href="/financeiro/dre/estrutura" className={`${PILL} ${PILL_NEUTRO}`}>
                <SquarePen size={13} />
                Editar estrutura
              </Link>
            }
          />

          {/* Maiores variações — veio do Fluxo de Caixa na v5.7.0. Compara categorias no
              YTD contra o mesmo período do ano anterior: é leitura de DEMONSTRATIVO, e
              aqui ela responde "o que explica a variação" logo depois da tabela que a
              mostra. Recorte PRÓPRIO (YTD do ano corrente), independente do `?ano=` da
              tabela e das pills da Decomposição — três recortes de propósito distinto na
              mesma seção, como o `?ano=` e as pills já eram. */}
          <RankingCaixa data={rankingCaixa} />

          <DecomposicaoLancamentos
            blocos={dec?.blocos ?? []}
            categorias={dec?.categorias ?? []}
            erro={dec === null}
            slotPills={
              <Suspense>
                <PeriodoFilterPillsUrl defaultPreset="este-ano" />
              </Suspense>
            }
          />
        </div>
      </TopSection>
    </div>
  )
}
