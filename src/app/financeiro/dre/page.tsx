import Link from 'next/link'
import { SquarePen } from 'lucide-react'
import { getServerClient } from '@/lib/supabase/server'
import { requireArea } from '@/lib/auth/sessao'
import { type RpcLike } from '@/lib/rpc'
import { parseRpc } from '@/lib/schemas-rpc'
import { hojeSP, fmtDataSP } from '@/lib/fmt'
import { rpcDre } from '@/lib/dre/rpc-dre'
import { buscarUltimaCargaMovimentacao } from '@/lib/dre/ultima-carga-movimentacao'
import {
  dreMensalSchema,
  dreCompMensalSchema,
  type DreMensalLike,
  type DreLinha,
  type DreBandejaLinha,
} from '@/lib/dre/schemas'
import { chaveDeLinha, chaveDeBandeja } from '@/lib/dre/identidade'
import { janelaYtdCompetencia, rotuloJanela } from '@/lib/dre/janela-competencia'
import { montarDecomposicao } from '@/lib/dre/decomposicao-variacao'
import { montarPonte } from '@/lib/dre/ponte-regimes'
import CascataCard from '@/components/financeiro/dre/cascata-card'
import { rankingCaixaSchema, type RankingCaixa as RankingCaixaData } from '@/lib/fluxo/rpc-fluxo'
import RankingCaixa from '@/components/financeiro/ranking-caixa'
import TopSection from '@/components/shared/top-section'
import TabelaDre from '@/components/financeiro/dre/tabela-dre'
import ResumoExecutivo from '@/components/financeiro/dre/resumo-executivo'
import { LINHAS_COMPETENCIA } from '@/lib/dre/linhas-resumo'
import { PILL, PILL_NEUTRO } from '@/components/shared/botoes'

// DRE por Fluxo de Caixa (v5.3.0 · Onda 2) — a tabela hierárquica da controladoria
// (159 linhas) na aba definitiva. M4: a tabela lê a estrutura viva + o fato real via
// `get_dre_mensal` (a fixture da M0 saiu deste caminho — ver tabela-dre.tsx). Ano
// navegável por `?ano=` (pills na própria TabelaDre), janela de 3 anos
// [corrente-2, corrente], default = ano corrente no fuso de São Paulo. O editor da
// estrutura viva vive em página própria (/financeiro/dre/estrutura), atrás do botão
// "Editar estrutura" da toolbar.
//
// ⚠️ A **Decomposição dos Lançamentos** SAIU desta página na v5.7.1 (decisão do Yan), mas
// **não foi apagada** — é código morto proposital, para voltar sem reescrita se a decisão
// mudar. O que sobreviveu intocado: o componente
// `@/components/financeiro/decomposicao-lancamentos`, o `decomposicaoBlocoSchema` em
// `@/lib/dre/schemas` e a RPC `get_decomposicao_bloco` (0209) no banco. Para reativar,
// basta reinstalar aqui as quatro peças que saíram juntas: o import do componente, a
// chamada `rpcDre(db, 'get_decomposicao_bloco', { p_from: from, p_to: to })` no
// `Promise.allSettled`, o `parseRpc` do resultado e o JSX com o `slotPills` — este último
// depende de `resolverPeriodoCompleto` e do `PeriodoFilterPillsUrl`, que também saíram dos
// imports. O `?preset=&from=&to=` era dele e ficou órfão: a página hoje só lê `?ano=`.
//
// RBAC: área própria 'financeiro/dre' (0197) — cobre ver E editar a estrutura (decisão
// firme; divisão ver/editar = futuro se precisar).

// ── Regime de COMPETÊNCIA (v5.8.0) ───────────────────────────────────────────
// A página passou a ter DUAS TopSections, e a de competência vem PRIMEIRO (decisão do
// Yan): fato gerador = data de EMISSÃO, fonte = `raw.demonstrativo_competencia` (upload
// próprio) lida por `get_dre_competencia_mensal` (0257), com árvore e de-para PRÓPRIOS
// (`financeiro.dre_comp_bloco`/`dre_comp_map`). O motor de caixa não é tocado.
//
// Cada regime navega o SEU parâmetro de URL — `?ano=` (caixa) e `?anoComp=` (competência).
// Um só faria a pill de um mover o outro.
//
// FAIL-SAFE: a seção nova só renderiza se a RPC do ano pedido respondeu. Ela é a primeira
// coisa da página, então um bloco quebrado no topo seria pior que a ausência dela — e o
// regime de caixa, que é a leitura consolidada da casa, segue inteiro de qualquer forma.

interface SearchParams {
  ano?: string
  anoComp?: string
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

  // Ano corrente NO FUSO DE SÃO PAULO — nunca `new Date().getFullYear()` cru (o
  // runtime do servidor roda em UTC; perto da virada do ano isso adiantaria/
  // atrasaria em relação ao calendário de SP). `hojeSP()` é o helper canônico.
  const anoCorrente     = parseInt(hojeSP().slice(0, 4), 10)
  const anoPedido       = parseInt(sp.ano ?? '', 10) || anoCorrente
  const ano             = clamp(anoPedido, anoCorrente - 2, anoCorrente)
  const anosDisponiveis = [anoCorrente - 2, anoCorrente - 1, anoCorrente]

  // Ano da seção de COMPETÊNCIA — parâmetro PRÓPRIO, mesma janela de 3 anos. A cobertura
  // real da base vem no payload (`anos`), e a pill de um ano sem dado fica desabilitada
  // pelo mesmo caminho que o caixa já usa (`consolidadoAnos` sem o ano ⇒ `semBase`).
  // ⚠️ Registrado: cobertura FORA da janela de 3 anos não é oferecida — é a mesma
  // limitação que o regime de caixa já tem, e hoje a base começa exatamente em 2024.
  const anoComp = clamp(
    parseInt(sp.anoComp ?? '', 10) || anoCorrente,
    anoCorrente - 2,
    anoCorrente,
  )

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
      // "Maiores variações" (v5.7.0) — veio do Fluxo de Caixa. Entra no MESMO estágio:
      // é mais uma chamada em paralelo, então não custa wall-clock nenhum.
      rpcDre(db, 'get_fluxo_ranking'),
      // ⚠️ COMPETÊNCIA ENTRA NO FIM, e nunca no meio (v5.8.0). Os índices deste array são
      // POSICIONAIS: a v5.7.1 já pagou por isso — tirar uma chamada do meio fez o ranking
      // ler o payload de um ANO da DRE, o `parseRpc` rejeitou em silêncio e o card virou
      // "sem movimentações". Acrescentar no fim não desloca ninguém.
      ...anosDisponiveis.map(a => rpcDre(db, 'get_dre_competencia_mensal', { p_ano: a })),
    ]).then(rs => rs.map(r => (r.status === 'fulfilled' ? r.value : empty))),
    buscarUltimaCargaMovimentacao(),
  ])

  const dreAnos = new Map(
    anosDre.map((a, i) => [a, parseRpc(dreMensalSchema, resultados[i], `get_dre_mensal(${a})`)]),
  )
  // ⚠️ Índice POSICIONAL: `resultados` espelha a ordem do `allSettled` acima. Quando a
  // Decomposição saiu (v5.7.1), o ranking andou de `+1` para `+0` — tirar uma chamada do
  // meio do array sem mexer aqui faria o ranking ler o payload de um ANO da DRE, que o
  // `parseRpc` rejeitaria em silêncio e o card viraria "sem movimentações".
  const rankingRes = resultados[anosDre.length]

  // Competência: os `anosDisponiveis.length` últimos itens, na ordem em que foram pedidos.
  // O deslocamento é `anosDre.length + 1` (os anos do caixa + o ranking) — declarado aqui
  // uma vez, e não espalhado em índices literais.
  const OFFSET_COMP = anosDre.length + 1
  const dreCompAnos = new Map(
    anosDisponiveis.map((a, i) => [
      a,
      parseRpc(dreCompMensalSchema, resultados[OFFSET_COMP + i], `get_dre_competencia_mensal(${a})`),
    ]),
  )

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
  //
  // ⚠️ A convenção de chave NÃO mora aqui: vem de `@/lib/dre/identidade`, o MESMO módulo
  // que a TABELA usa para CONSULTAR estes mapas. Enquanto eram duas implementações (uma
  // aqui, outra lá), a igualdade dependia de ninguém mexer numa só — e divergir é
  // silencioso: a coluna do Consolidado passa a ler o valor de outra linha. A função
  // serve aos DOIS regimes, porque a identidade de cada espécie de folha está resolvida
  // dentro dela. (Deduplicação feita na v5.8.0, achado MÉDIO do `revisor`.)
  function indexar<T>(
    p: DreMensalLike,
    valor: (l: DreLinha | DreBandejaLinha) => T,
  ): Record<string, T> {
    const m: Record<string, T> = {}
    for (const l of p.linhas) {
      const k = chaveDeLinha(l)
      if (k) m[k] = valor(l)
    }
    for (const b of p.bandeja) m[chaveDeBandeja(b)] = valor(b)
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

  // Maiores variações: categorias que mais pioraram/melhoraram o caixa no YTD contra a
  // MESMA janela do ano anterior — jan até o mês corrente, a mesma do Demonstrativo desde
  // a `0253` (antes o card cortava o ano anterior pelo dia-do-ano e os dois números não
  // reconciliavam). Falha ⇒ objeto vazio, e o card diz "sem movimentações para ranquear"
  // por conta própria — o mesmo desenho fail-safe que ele já tinha no Fluxo de Caixa.
  const rankingCaixa: RankingCaixaData =
    parseRpc(rankingCaixaSchema, rankingRes, 'get_fluxo_ranking') ?? { pioraram: [], melhoraram: [] }

  // ── COMPETÊNCIA: mesma montagem do caixa, pelo MESMO `indexar` ────────────────
  //
  // A janela do YTD é PARÂMETRO porque a competência precisa das duas: a tabela densa
  // segue no calendário (`mesJanela`, como a v5.8.0 entregou) e o Resumo Executivo corta
  // pela cobertura real da base (`mCob`, decisão da v5.8.1). Ver `janela-competencia.ts`
  // para o porquê — e note que os dois consumidores partem do MESMO payload e do MESMO
  // `indexar`, então a diferença entre eles é só a janela, nunca a fonte.
  function consolidadoComp(janelaYtd: number) {
    return anosDisponiveis
      .map(a => {
        const p = dreCompAnos.get(a)
        if (!p) return null
        return {
          ano: a,
          // No caixa, `corrente` quer dizer "ano com previsto em aberto". Na competência
          // não existe previsto — mas o campo tem o MESMO efeito útil: ele é o que impede a
          // visão Consolidado de mostrar uma coluna "ano inteiro" para um ano que não está
          // inteiro. Aqui `relacao === 'corrente'` significa "ano ainda não coberto até
          // dezembro pela base", e é exatamente quando rotular o total de "2026" seria
          // mentira (a base cobre jan–ago). PREV/VENCIDOS não voltam por isso: o modo está
          // travado em 'realizado', e `montarColunasCons` retorna antes de chegar neles.
          corrente: p.relacao === 'corrente',
          porLinha: indexar(p, l => ({
            total: l.total,
            ytd:   l.meses.slice(0, janelaYtd).reduce((s, v) => s + v, 0),
            venc:  l.venc,
          })),
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
  }

  const consolidadoAnosComp = consolidadoComp(mesJanela)

  const dreComp = dreCompAnos.get(anoComp) ?? null
  // Qualquer ano que tenha carregado serve: a data de carga descreve a BASE inteira, não o
  // ano navegado — é ela que alimenta o selo de frescor no canto do card.
  const compQualquer = dreComp ?? consolidadoAnosComp.map(c => dreCompAnos.get(c.ano)).find(Boolean) ?? null

  // ── COMPLEMENTOS DA COMPETÊNCIA (v5.8.1) ─────────────────────────────────────
  // Três leituras derivadas dos payloads que já estão em mãos: linhas-chave (sumário),
  // decomposição da variação (o que moveu o resultado de um ano para o outro) e a ponte
  // entre regimes (por que os dois demonstrativos desta página mostram números
  // diferentes). NENHUMA chamada nova — ver o aviso no `Promise.allSettled` acima: os
  // índices daquele array são posicionais e acrescentar no meio já custou caro duas vezes.
  //
  // RECORTE PRÓPRIO, ancorado no ANO CORRENTE e independente da pill `?anoComp=` — a
  // mesma decisão do card "Maiores variações" do caixa. A pill navega o DEMONSTRATIVO;
  // estes três respondem "como estamos agora", e segui-la faria a ponte comparar o
  // regime de competência de 2024 com o caixa de 2026.
  const compCorrente  = dreCompAnos.get(anoCorrente) ?? null
  const compAnterior  = dreCompAnos.get(anoCorrente - 1) ?? null
  const caixaCorrente = dreAnos.get(anoCorrente) ?? null

  // A janela dos TRÊS componentes: jan até o último mês que a base de competência
  // cobre — e não até o mês do calendário (`mesJanela`, que a tabela densa usa). A base
  // de competência é um upload periódico: cortar pelo calendário somaria meses ainda não
  // carregados como se fossem zero, subestimando o YTD em silêncio. Cada card declara a
  // janela no subtítulo, que é o que explica a divergência quando ela aparecer.
  const mCob = compCorrente ? janelaYtdCompetencia(compCorrente) : 0
  const janela = rotuloJanela(mCob)

  // O Resumo Executivo da competência lê o MESMO consolidado da tabela densa, só que
  // cortado pela cobertura. É o que garante que ele e o demonstrativo nunca discordem
  // por CAMINHO — se discordarem, é a janela, e o subtítulo diz qual é.
  const consolidadoResumoComp = mCob > 0 ? consolidadoComp(mCob) : []

  // Fail-safe POR CARD (não por seção): cada um exige o seu e some sozinho. A ponte é a
  // única que depende dos DOIS regimes.
  const decomposicao = compCorrente && compAnterior && mCob > 0
    ? montarDecomposicao(
        compCorrente, compAnterior, mCob,
        `Resultado ${anoCorrente - 1}`, `Resultado ${anoCorrente}`,
      )
    : null

  const ponte = compCorrente && caixaCorrente && mCob > 0
    ? montarPonte(compCorrente, caixaCorrente, mCob)
    : null

  return (
    <div className="space-y-6">
      {/* ── Regime de COMPETÊNCIA — PRIMEIRO na página (decisão do Yan, v5.8.0) ──
          Só renderiza com dado: a seção é a primeira coisa que se vê, e um bloco
          quebrado no topo é pior que a ausência dele. O regime de caixa abaixo segue
          inteiro em qualquer cenário. */}
      {compQualquer && (
        <TopSection titulo="Regime de Competência">
          <div className="space-y-6">
          {/* ORDEM (v5.8.1, briefing): sumário → demonstrativo → as duas decomposições.
              A MESMA ordem conceitual da seção de caixa logo abaixo — do agregado ao
              detalhe. As linhas-chave vêm ACIMA da tabela para não obrigar a rolar o
              demonstrativo inteiro até o resumo dele (a correção que o caixa recebeu na
              v5.7.0). */}
          {consolidadoResumoComp.length > 0 && (
            <ResumoExecutivo
              anosDisponiveis={anosDisponiveis}
              consolidadoAnos={consolidadoResumoComp}
              linhas={LINHAS_COMPETENCIA}
              subtitulo={`YTD de ${janela} — a janela coberta pela base de competência`}
              ajuda={
                'Os anos escolhidos aqui valem só para este resumo — a seleção é independente ' +
                'das pills da tabela abaixo. "YTD" compara todos os anos na MESMA janela, que ' +
                'aqui vai de janeiro até o último mês coberto pela base de competência (e não ' +
                'até o mês do calendário, como no regime de caixa): a base vem de um envio ' +
                'periódico, e contar meses ainda não enviados como zero encolheria o acumulado ' +
                'sem aviso. A coluna do ano cheio aparece só para anos já encerrados.'
              }
            />
          )}

          <TabelaDre
            dados={dreComp}
            ano={anoComp}
            anosDisponiveis={anosDisponiveis}
            /* Competência não tem anos seguintes: não há projeção a mostrar. */
            anosSeguintes={[]}
            consolidadoAnos={consolidadoAnosComp}
            mesJanela={mesJanela}
            ultimaCargaMovimentacao={compQualquer.carregado_em}
            titulo="Demonstrativo de Resultado por Competência"
            paramAno="anoComp"
            semPrevisto
            slotAcoes={
              <Link href="/financeiro/dre/estrutura-competencia" className={`${PILL} ${PILL_NEUTRO}`}>
                <SquarePen size={13} />
                Editar estrutura
              </Link>
            }
          />

          {/* EMPILHADAS, cada uma na largura cheia da seção (conferência do Yan). Lado a
              lado, num grid de 2 colunas, os rótulos longos das folhas quebravam em duas
              linhas e colidiam com o rótulo de valor da barra vizinha — e são até 18
              barras por cascata. Largura cheia devolve o espaço horizontal, que é
              exatamente a dimensão que uma cascata deitada consome. */}
          {(decomposicao || ponte) && (
            <div className="space-y-6">
              {decomposicao && (
                <CascataCard
                  titulo="Decomposição da variação"
                  subtitulo={`Resultado do exercício · YTD ${String(anoCorrente).slice(2)} × YTD ${String(anoCorrente - 1).slice(2)} · ${janela}`}
                  ajuda={
                    'Do resultado do ano anterior ao deste ano, um degrau por grupo de contas, ' +
                    'na mesma janela de meses nos dois anos. Verde melhora o resultado, vermelho piora. ' +
                    'Grupos que variaram menos de R$ 500 são somados em "Outros ajustes".'
                  }
                  cascata={decomposicao}
                />
              )}
              {ponte && (
                <CascataCard
                  titulo="Ponte Competência ↔ Caixa"
                  subtitulo={`Do resultado por emissão ao resultado por movimentação · YTD ${String(anoCorrente).slice(2)} · ${janela}`}
                  ajuda={
                    'Por que os dois demonstrativos desta página mostram números diferentes. ' +
                    'Cada degrau é a diferença, naquele grupo de contas, entre o que foi movimentado ' +
                    'no caixa e o que foi reconhecido por competência. O repasse só existe no caixa; ' +
                    'os reembolsos, só na competência.'
                  }
                  cascata={ponte}
                  // As duas bases têm safras INDEPENDENTES, e ver isso é a resposta curta
                  // para metade das perguntas que este card vai gerar.
                  rodape={
                    `Competência carregada em ${fmtDataSP(compQualquer.carregado_em) || '—'}` +
                    ` · caixa carregado em ${fmtDataSP(ultimaCargaMovimentacao) || '—'}`
                  }
                />
              )}
            </div>
          )}
          </div>
        </TopSection>
      )}

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
              Desde a v5.7.0 ele tem PILLS PRÓPRIAS de ano (seleção aditiva) — a ancoragem
              fixa em `anoCorrente` saiu, e a seleção segue independente da pill da tabela
              abaixo, de propósito. */}
          <ResumoExecutivo anosDisponiveis={anosDisponiveis} consolidadoAnos={consolidadoAnos} />

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
              YTD contra a MESMA janela do ano anterior: é leitura de DEMONSTRATIVO, e aqui
              ela responde "o que explica a variação" logo depois da tabela que a mostra.
              Recorte PRÓPRIO (YTD do ano corrente), independente do `?ano=` da tabela —
              e desde a `0253` os números reconciliam com a coluna "YTD" dela. */}
          <RankingCaixa data={rankingCaixa} />
        </div>
      </TopSection>
    </div>
  )
}
