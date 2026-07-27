'use client'

// ── Tabela hierárquica da DRE por Fluxo de Caixa (v5.3.0 · M4 + refino visual + Onda 2/rodada 3) ──
// Tabela DE PRODUÇÃO, data-driven por props — lê a estrutura viva + o fato real via
// `get_dre_mensal` (a página busca a RPC de CADA ano da janela e injeta `dados`/`ano`/
// `anosDisponiveis`/`anosSeguintes`/`consolidadoAnos`/`mesJanela`). Sucede o mockup de
// fixture da M0 (tabela-dre-mockup.tsx + mockup-dados.ts, agora removidos deste
// caminho); o VISUAL/INTERAÇÃO gateados pelo Yan na M0 são preservados onde não
// listados abaixo — a FONTE dos dados, as colunas dinâmicas por ano e os refinos das
// rodadas seguintes (ver bullets abaixo) mudaram.
//
// Estrutura do payload (ver @/lib/dre/schemas): `linhas` vem FLAT na ordem do
// demonstrativo — blocos (`t:'blocoH'|'sub'|'tot'`, com `chave`) seguidos das suas
// categorias (`t:'cat'`, com `g` apontando para a `chave` do pai). Linha expansível
// (chevron) = tem `chave` E existe ao menos uma `cat` cujo `g` aponte para ela —
// derivado em `expansiveis` (Set), não mais uma lista fixa de fixture. A visibilidade
// de uma categoria é só `abertos.has(l.g)` — blocoH/sub/tot SEMPRE aparecem (não há
// mais busca/"esconder zerados" escondendo estrutura — removidos neste refino).
//
// DUAS VISÕES (`visao`, pills na toolbar, default 'mensal') — MESMA hierarquia de
// linhas (blocos/sub/categorias/totalizador/bandeja), MESMO expandir/recolher, MESMA
// cor por sinal e MESMO R$ contábil; só o CONJUNTO DE COLUNAS muda:
//  · 'mensal' — a tabela mês a mês descrita abaixo (Realizado/Previsto por mês, Total
//    do ano, anos seguintes).
//  · 'consolidado' — ano a ano, com SELEÇÃO MÚLTIPLA de anos (rodada 3): na visão
//    Consolidado as pills de ano deixam de navegar e viram CAIXAS DE SELEÇÃO
//    (`role="checkbox"`), cada ano marcado acrescentando o seu grupo de colunas.
//    Estado de UI puro (`anosSelecionados`), 100% client-side: TODOS os anos da janela
//    navegável já vieram no MESMO payload (`consolidadoAnos`, prop da página), então
//    marcar/desmarcar NUNCA vai ao servidor — nada de `router.push` nesta visão.
//    Default = os DOIS anos mais recentes disponíveis (reproduz o comparativo
//    anterior); mínimo de 1 (desmarcar o último é no-op, a pill fica `aria-disabled`).
//    ANO DE REFERÊNCIA = o MAIOR marcado; é ele que ganha o bloco de detalhe à direita.
//    Sendo y1<…<yn os marcados, as colunas saem nesta ordem: para cada yi (i<n)
//    "«yi»" (ano cheio) / "YTD «aa»" / "Δ% «aa»·«aa+1»"; depois "YTD «yn»" e, SÓ se yn
//    for o ano CORRENTE, "PREV «yn»" (= total − YTD) e "VENCIDOS"; então "TOTAL «yn»"
//    e, ainda só se yn é corrente, as colunas de anos seguintes atrás do MESMO toggle
//    «»» da visão Mensal. Num ano FECHADO não há previsto: `total − ytd` ali é
//    realizado de ago..dez, não projeção — rotulá-lo "PREV" seria mentira (por isso o
//    flag `corrente` por ano vem do payload, não é inferido na UI). `totalModo` NÃO
//    participa desta visão (as pills ficam ocultas): a cor âmbar do "TOTAL «yn»"
//    depende de o ano de referência ser o corrente (aí o total contém projeção), não
//    de um toggle escondido. `consolidadoAnos` vazio (todas as RPCs falharam) = pill
//    `disabled` + `visaoEfetiva` cai para 'mensal' sozinho.
//
// TRÊS RELAÇÕES (`dados.relacao`) — as colunas mudam de forma:
//  · 'corrente' — mês corrente HÍBRIDO: meses 1..mes_corrente são REALIZADO (o do mês
//    corrente rotulado "«Mês»·R" SÓ quando o modo 'tudo' está ativo — Refino 12), +
//    1 coluna extra "«Mês»·P" (= `prev_corrente`, fundo âmbar, corte à esquerda, essa
//    coluna também só existe no modo 'tudo'), + meses mes_corrente+1..12 PREVISTO.
//    13 colunas no modo 'tudo'; no modo 'realizado' só os mes_corrente meses já
//    realizados (Refino 5). O previsto (da coluna ·P até Dez) é RECOLHÍVEL no modo
//    'tudo' (toggle no cabeçalho, soma numa única coluna) — só nesta relação.
//  · 'fechado' — ano fechado: 12 colunas, tudo REALIZADO, sem corte/âmbar (os dois
//    modos de "Total do ano" mostram exatamente as mesmas colunas).
//  · 'futuro'  — ano ainda não iniciado: 12 colunas, tudo PREVISTO (âmbar), sem corte
//    (no modo 'realizado' não sobra coluna mensal alguma — nada aconteceu ainda).
// `idxPrevisto`/`corteIdx`/`modoPrevisto` concentram essa diferença por ÍNDICE de
// coluna — o índice do corte NÃO muda entre os modos (só o RECORTE do array de valores
// muda, ver `construirValores`/`colunasVisiveis`) — o resto (CelulaValor, cabeçalho da
// 2ª linha) é um ÚNICO trecho genérico para as 3 relações.
//
// "TOTAL DO ANO" TEM MODO (`totalModo`, pills na toolbar, default 'tudo') — na visão
// Mensal ele governa a TABELA INTEIRA, não só a coluna do total:
//  · 'tudo' — o `total` do PAYLOAD (Σ meses + prev_corrente, como a RPC entrega —
//    comportamento original). A célula ganha fundo ÂMBAR (Refino 10 — reaproveita o
//    MESMO mapa `BG_PREVISTO` das colunas de previsto): reforça visualmente que esse
//    número INCLUI projeção, não só o que já aconteceu. Vale para blocos/categorias
//    E bandeja (a bandeja já era sempre âmbar de base — nada muda nela aqui).
//  · 'realizado' — a visão mostra SÓ MESES REALIZADOS (jan..mês corrente) + Total do
//    ano (rodada 3, Refino 5 do Yan): some a coluna "«Mês»·P" do mês corrente, somem
//    os meses FUTUROS (âmbar), some o grupo "Previsto" do cabeçalho com o seu toggle
//    ««», e somem as colunas de ANOS SEGUINTES com o toggle «»». O total é recomputado
//    (`totalDoAno`) só com o que já aconteceu, e a célula volta ao fundo normal da
//    linha. Antes desta rodada o modo escondia apenas a coluna ·P — o previsto dos
//    meses futuros continuava à vista, o que contradizia o rótulo do próprio modo.
//    Em ano 'fechado' os dois modos coincidem (tudo é realizado, nada some).
// Na visão Consolidado o modo NÃO existe (pills ocultas): lá realizado (YTD),
// previsto (PREV) e soma (TOTAL) já são COLUNAS separadas — ver acima.
//
// COLUNAS DE ANOS SEGUINTES (`anosSeguintes`, prop da página — 0 a 2 itens, ano+1/
// ano+2; item que a RPC não conseguiu buscar é simplesmente omitido pela página): na
// visão Mensal, um toggle no cabeçalho "Total do ano" (`anosAbertos`, default false —
// a seta ALINHADA com a do toggle de Previsto, Refino 9: a `th` ganha `relative`, o
// botão vira `absolute right-3.5 top-0 h-[27px]` — a faixa exata da 1ª linha —, o
// texto "Total do ano" continua embaixo, `align-bottom`, como sempre; a seta é ÂMBAR
// como a do Previsto — rodada 3/Refino 1: as duas revelam projeção, então falam a
// mesma língua de cor) abre uma coluna por item, DEPOIS do Total do ano, com o
// fundo/cor de PREVISTO do tipo da linha (são projeção pura, nunca realizado). A chave
// que casa linha↔total (`chaveLinha`, ex-`chaveAnoSeguinte` — generalizada porque a
// visão Consolidado usa a MESMA convenção para casar com `consolidadoAnos[].porLinha`)
// é: `b:<chave>` (bloco/sub/tot) ou `c:<categoria_id>` (categoria/bandeja). O toggle
// só aparece quando há item a mostrar — no modo 'realizado' da Mensal não há (ver
// acima), e na Consolidado só quando o ano de referência é o corrente.
//
// SCROLL AO ABRIR **E AO FECHAR** (Refino 11, ampliado na rodada 3): as duas
// transições de `previstoAberto`/`anosAbertos` rolam a tabela na horizontal (hook
// `useScrollAoAlternar`). ABRINDO, vai até a 1ª coluna revelada
// (`scrollIntoView({ inline:'start', block:'nearest' })` — `block:'nearest'` é
// OBRIGATÓRIO, senão o scroll VERTICAL da página salta junto arrastado pelo
// horizontal). FECHANDO, o destino é por grupo: Previsto → INÍCIO (recolher o previsto
// é "quero ver o ano desde janeiro"); anos seguintes → FIM (o "Total do ano" volta a
// ser a última coluna e é onde o olho estava). Só dispara em transição REAL: o hook
// compara contra o valor ANTERIOR guardado numa ref (não um flag "primeira
// renderização"), o que o deixa robusto ao duplo-invoke de efeitos do StrictMode em
// dev — sem isso, `previstoAberto` nascendo `true` causaria um scroll no mount.
// Respeita `prefers-reduced-motion`. Efeito de DOM puro (nunca `setState` dentro do
// efeito) — permitido pelo ruleset do React Compiler.
//
// FAIL-SAFE: `dados === null` (RPC falhou ou o shape divergiu — `parseRpc` já logou
// no servidor) renderiza o card e a toolbar de ANO — que CONTINUA funcional, trocar
// de ano é a forma natural de tentar de novo — com um aviso discreto no lugar da
// tabela. A página nunca quebra.
//
// ⚠️ ARMADILHA DO CABEÇALHO DE 2 LINHAS: as `th` com `rowSpan={2}` (Conta / Total do
// ano na visão Mensal; só Conta na visão Consolidado) existem SÓ na 1ª <tr> — um
// seletor CSS do tipo "última linha do thead" nunca as alcança. Por isso a régua de
// base (`border-b-[1.5px] border-b-wt-border-strong`) e a sombra-ao-rolar são
// aplicadas DIRETAMENTE nessas células, além de TODA célula da 2ª linha (não via um
// seletor genérico). (Achado ALTO do revisor na v5.3.0/M0 — o padrão do DS pressupõe
// cabeçalho de 1 linha.) As colunas de anos seguintes e as da visão Consolidado NÃO
// são rowSpan — seguem o padrão dos meses (grupo em branco/rotulado na 1ª linha,
// rótulo específico na 2ª) — por isso a régua/sombra nelas vem do MESMO
// `bordaBaseHeader` aplicado à 2ª linha, sem tratamento especial.
//
// ANO por URL **só na visão Mensal**: ali as pills navegam via `router.push`
// (preserva os demais params da URL, ex.: o período da Composição), com
// `startTransition` — o indicador de carregamento é a opacidade sutil na CAIXA da
// tabela (`isPending`), não nas pills (padrão v4.39). Na visão Consolidado as MESMAS
// pills viram caixas de seleção múltipla e NÃO navegam (ver acima). `visao` é estado
// de UI puro (NÃO vai pra URL) — trocar de visão não recarrega nada: os dois
// conjuntos de colunas vêm do MESMO lote de props que a página já buscou.
//
// TOOLBAR EM DUAS LINHAS, tudo à esquerda (rodada 3/Refino 2): em cima as pills de
// VISÃO (Mensal|Consolidado) — com "Expandir tudo"/"Recolher tudo" à direita, na mesma
// faixa —, embaixo as pills de ANO, um divisor fino e as pills de "Total do ano"
// (Realizado|Realizado + previsto, só na Mensal). Os rótulos textuais "Visão:" e
// "Total do ano:" SAÍRAM; para a acessibilidade não piorar com o enxuga, CADA pill
// carrega um `title` dizendo o que faz.

import { useEffect, useRef, useState, useTransition, type ReactNode, type RefObject } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import Button from '@/components/ui/button'
import ScrollAutoHide from '@/components/shared/scroll-auto-hide'
import { PILL_FILTRO, PILL_FILTRO_INATIVO, PILL_FILTRO_ATIVO_STYLE } from '@/components/shared/botoes'
import { fmtContabil } from './fmt-contabil'
import type { DreMensal, DreLinha, DreBandeja } from '@/lib/dre/schemas'

type Relacao   = DreMensal['relacao']
type TipoLinha = DreLinha['t']
/** Modo de exibição do "Total do ano" (Refino 8) — ver bullet no topo do arquivo. */
type TotalModo = 'realizado' | 'tudo'
/** Visão da tabela (Refino 13) — 'mensal' é o comportamento pré-existente; ver bullet
 *  "DUAS VISÕES" no topo do arquivo. */
type Visao = 'mensal' | 'consolidado'

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

function soma(valores: number[]): number {
  return valores.reduce((acc, v) => acc + v, 0)
}

/** Monta as colunas mensais de EXIBIÇÃO a partir do payload cru: em 'fechado'/'futuro'
 *  os 12 `meses` bastam; em 'corrente' COM `incluirPrevCorrente` (totalModo 'tudo'),
 *  insere `prev_corrente` logo após o mês corrente (a 2ª coluna do mês híbrido) —
 *  12+1 = 13 colunas. Em 'corrente' SEM `incluirPrevCorrente` (totalModo 'realizado',
 *  Refino 12/item 6) devolve os 12 `meses` CRUS, sem inserir nada — o mês corrente
 *  aparece só com o que já aconteceu (`meses[mesCorrente-1]`), sem a coluna de
 *  projeção do restante do mês. `mesCorrente` é 1-based; os meses
 *  ANTES-E-INCLUINDO ele (índices 0..mesCorrente-1) são realizado, os DEPOIS
 *  (mesCorrente..11) já vêm previsto do payload — em AMBOS os casos. */
function construirValores(
  meses: number[],
  prevCorrente: number | null | undefined,
  relacao: Relacao,
  mesCorrente: number | null,
  incluirPrevCorrente: boolean,
): number[] {
  if (relacao === 'corrente' && mesCorrente != null) {
    if (!incluirPrevCorrente) return meses
    return [...meses.slice(0, mesCorrente), prevCorrente ?? 0, ...meses.slice(mesCorrente)]
  }
  return meses
}

/** Como as colunas de PREVISTO da visão Mensal aparecem:
 *  · 'aberto'    — uma coluna por mês (comportamento padrão);
 *  · 'colapsado' — tudo a partir de `idxPrevisto` somado numa ÚNICA coluna (toggle ««»);
 *  · 'oculto'    — nenhuma coluna de previsto (modo 'realizado', rodada 3/Refino 5). */
type ModoPrevisto = 'aberto' | 'colapsado' | 'oculto'

/** Recorta/soma as colunas conforme o `ModoPrevisto`. Em 'colapsado' o índice do corte
 *  não muda — a coluna agregada ocupa o MESMO índice — então `previsto`/`corte`
 *  (calculados por índice em `LinhaDreTr`/`LinhaBandejaTr`) não precisam de ramo extra.
 *  Em 'oculto' corta fora tudo a partir de `idxPrevisto`: em 'fechado' o índice é
 *  +Infinity (nada é cortado — ano fechado é 100% realizado), em 'futuro' é 0 (não
 *  sobra coluna nenhuma: nada aconteceu ainda). Guarda `idxPrevisto >= valores.length`
 *  em 'colapsado': quando não sobra NENHUM mês futuro, `soma([])` (=0) criaria uma
 *  coluna fantasma a mais. */
function colunasVisiveis(valores: number[], modo: ModoPrevisto, idxPrevisto: number): number[] {
  if (modo === 'oculto') return valores.slice(0, idxPrevisto)
  if (modo === 'aberto' || idxPrevisto >= valores.length) return valores
  return [...valores.slice(0, idxPrevisto), soma(valores.slice(idxPrevisto))]
}

/** Rótulos das colunas mensais em 'corrente': COM `incluirPrevCorrente` (totalModo
 *  'tudo'), 13 rótulos — meses antes do corrente + "«Mês»·R" (o próprio mês
 *  corrente, realizado) + "«Mês»·P" (mesma competência, previsto) + os meses
 *  restantes. SEM `incluirPrevCorrente` (totalModo 'realizado', Refino 12/item 6),
 *  os 12 meses PUROS — o mês corrente some para "«Mês»" só (sem sufixo: não há mais
 *  o par ·R/·P para distinguir). */
function labelsCorrente(mesCorrente: number, incluirPrevCorrente: boolean): string[] {
  if (!incluirPrevCorrente) return MESES
  const atual = MESES[mesCorrente - 1]
  return [...MESES.slice(0, mesCorrente - 1), `${atual}·R`, `${atual}·P`, ...MESES.slice(mesCorrente)]
}

/** Mesmo recorte de `colunasVisiveis`, para os RÓTULOS (2ª linha do cabeçalho) — os
 *  dois PRECISAM andar juntos, senão rótulo e valor escorregam de coluna. O rótulo da
 *  coluna agregada ('colapsado') reaproveita o do PRIMEIRO índice previsto
 *  (`labels[idxPrevisto]`) — "«Mês»·P" quando a coluna ·P existe — sem precisar saber
 *  qual caso é: o rótulo de origem já carrega a diferença. */
function rotulosVisiveis(labels: string[], modo: ModoPrevisto, idxPrevisto: number): string[] {
  if (modo === 'oculto') return labels.slice(0, idxPrevisto)
  if (modo === 'aberto' || idxPrevisto >= labels.length) return labels
  return [...labels.slice(0, idxPrevisto), `${labels[idxPrevisto]}–Dez`]
}

/** Totais dos anos seguintes (ano+1/ano+2) por linha — prop injetada pela página (ver
 *  bullet no topo do arquivo). `totais` é indexado pela MESMA chave que `chaveLinha`
 *  deriva de cada linha. */
interface AnoSeguinteDados {
  ano: number
  totais: Record<string, number>
}

/** Os três números que a visão Consolidado precisa de UMA linha em UM ano — já
 *  resolvidos pela página (o `ytd` sai da MESMA janela `mesJanela` em todos os anos,
 *  que é o que torna a comparação honesta). */
interface RegistroAnoLinha {
  total: number
  ytd:   number
  venc:  number
}

/** Um ano da visão Consolidado — um item por ano da janela navegável que a página
 *  conseguiu carregar (ano cuja RPC falhou simplesmente não vem, e a pill dele fica
 *  desabilitada). `porLinha` é indexado pela MESMA chave que `chaveLinha` deriva de
 *  cada linha (idêntica convenção de `anosSeguintes[].totais`) — casar por CHAVE, e
 *  não por posição, é o que impede a coluna de escorregar de linha quando a estrutura
 *  muda de um ano para o outro. */
interface ConsolidadoAno {
  ano: number
  /** true = ano CORRENTE (tem previsto em aberto). Vem do payload, NUNCA é inferido
   *  aqui: num ano fechado `total − ytd` é realizado de ago..dez, não projeção. */
  corrente: boolean
  porLinha: Record<string, RegistroAnoLinha>
}

/** Campo de `RegistroAnoLinha` que uma coluna exibe. 'prev' é derivado
 *  (`total − ytd`) e só é oferecido quando o ano é o CORRENTE — ver `ConsolidadoAno`. */
type CampoAno = 'total' | 'ytd' | 'venc' | 'prev'

/** Em qual grupo da 1ª linha do cabeçalho a coluna cai (ver `TabelaConsolidada`). */
type GrupoCons = 'comp' | 'prev' | 'total'

/** Descritor de UMA coluna da visão Consolidado. O conjunto de colunas é DINÂMICO (um
 *  grupo por ano marcado), então cabeçalho e células são gerados do MESMO array —
 *  rótulo e valor não têm como divergir por edição de um lado só. */
type ColunaCons =
  | {
      k: 'valor'
      id: string
      rotulo: string
      /** De qual ano marcado o valor sai. */
      ano: number
      campo: CampoAno
      /** Fundo âmbar (zona de projeção/pendência). */
      previsto: boolean
      /** Régua grossa de 2px — fronteira realizado → previsto. */
      corte: boolean
      /** Régua fina + peso do "Total". */
      totalAno: boolean
      grupo: GrupoCons
      classe: string
      titulo: string
    }
  | {
      k: 'delta'
      id: string
      rotulo: string
      /** Δ% do YTD de `de` para o YTD de `para`. */
      de: number
      para: number
      grupo: GrupoCons
      classe: string
      titulo: string
    }

/** Valor de uma coluna para uma linha. `undefined` no mapa = a linha NÃO EXISTE naquele
 *  ano (a estrutura mudou entre os anos) → devolve `null` = AUSÊNCIA, que a célula
 *  mostra como travessão. Nunca 0: zero é informação (não houve movimento), ausência é
 *  outra coisa (a conta nem existia) — inventar 0 aqui produziria um Δ% falso. */
function valorCons(reg: RegistroAnoLinha | undefined, campo: CampoAno): number | null {
  if (reg === undefined) return null
  if (campo === 'prev') return reg.total - reg.ytd
  return reg[campo]
}

/** Δ% (em pontos percentuais) do YTD de A para o de B. `null` → travessão quando falta
 *  um dos lados (ausência) ou quando o denominador é ZERO: variação sobre zero é
 *  indefinida, nunca Infinity/NaN na tela. O teste de zero usa o MESMO epsilon do zero
 *  contábil (`fmtContabil`, 0,005) — uma célula que se EXIBE como travessão não pode
 *  gerar um "+9.999.900,0%" a partir de resíduo de ponto flutuante.
 *  Denominador em MÓDULO (decisão firmada): sair de prejuízo para lucro tem de ler como
 *  MELHORA (+118,2%), não como piora. */
function deltaYtd(a: number | null, b: number | null): number | null {
  if (a === null || b === null) return null
  if (Math.abs(a) < 0.005) return null
  return ((b - a) / Math.abs(a)) * 100
}

/** Chave de casamento com `anosSeguintes[].totais` E `consolidadoAnos[].porLinha` —
 *  MESMA convenção que a página usa para montar os dois mapas (ver page.tsx): bloco/
 *  sub/totalizador → `b:<chave>`; categoria → `c:<categoria_id>`. `null` quando a
 *  linha não tem identificador (não deveria acontecer na prática — fail-safe: a coluna
 *  cai em AUSÊNCIA, travessão). Generalizada (ex-`chaveAnoSeguinte`) porque serve a
 *  DOIS consumidores, não só as colunas de ano seguinte. */
function chaveLinha(l: DreLinha): string | null {
  if (l.t === 'cat') return l.categoria_id != null ? `c:${l.categoria_id}` : null
  return l.chave != null ? `b:${l.chave}` : null
}

/** "Total do ano" por MODO (Refino 8): 'tudo' é o `total` do PAYLOAD (Σ meses +
 *  `prev_corrente`, como a RPC já entrega — comportamento ORIGINAL, default).
 *  'realizado' soma só a parte JÁ ACONTECIDA, a partir dos `meses` crus (NUNCA do
 *  `prev_corrente`, que é 100% projeção): 'fechado' → os 12 meses (tudo realizado);
 *  'corrente' → só `meses[0..mesCorrente-1]` (o mês corrente entra pela fatia
 *  realizada-até-a-data-base; exclui a `prev_corrente` e os meses futuros); 'futuro' →
 *  0 (nada aconteceu ainda). Vale para blocos/categorias E bandeja (mesma forma). As
 *  colunas de ANOS SEGUINTES (Refino 7) NÃO passam por aqui — são previsto por
 *  natureza (projeção pura, a mesma base independente do modo escolhido nesta
 *  coluna). A visão Consolidado TAMBÉM não passa por aqui: lá o YTD de CADA ano
 *  marcado vem pronto do payload (`porLinha[k].ytd`, todos na mesma janela) — inclusive
 *  o do ano de referência, que pode nem ser o ano cujas `linhas` estão em tela. */
function totalDoAno(
  meses: number[],
  total: number,
  totalModo: TotalModo,
  relacao: Relacao,
  mesCorrente: number | null,
): number {
  if (totalModo === 'tudo') return total
  if (relacao === 'futuro') return 0
  if (relacao === 'corrente' && mesCorrente != null) return soma(meses.slice(0, mesCorrente))
  return soma(meses) // 'fechado' (ou 'corrente' sem mes_corrente informado — trata como realizado)
}

interface EstiloLinha {
  /** border-t/border-b da hierarquia (banda cinza substitui a régua contábil). */
  borda: string
  /** fundo-padrão da linha (fora do previsto) — também usado na coluna Conta/Total do ano. */
  bg: string
  /** fundo no hover (`group-hover`) — vazio quando o tipo não ganha realce (blocoH: já é a
   *  banda mais escura das quatro, um hover a mais competiria com a hierarquia). */
  bgHover: string
  /** classes do <span> do rótulo (peso/caixa/tamanho/cor) na célula Conta. */
  rotulo: string
  /** padding-left da célula Conta (escada de indentação). */
  indent: string
  /** peso/tamanho do valor numérico (SEM cor — a cor é resolvida por SINAL, ver corPorSinal). */
  peso: string
}

// Hierarquia INVERTIDA: grupos de categoria em cinza CLARO (blocoH = --band, sub =
// --band-soft) e as LINHAS DE RESULTADO em cinza ESCURO (--action-primary, o dark
// neutro institucional da plataforma — independente de tema), com o rótulo em
// --action-primary-fg. É a inversão que dá a hierarquia: o olho varre os grupos
// claros e PARA nos resultados escuros.
function estiloLinha(t: TipoLinha): EstiloLinha {
  switch (t) {
    case 'blocoH':
      return {
        borda: 'border-b border-b-wt-border',
        bg: 'bg-band',
        bgHover: '',
        rotulo: 'uppercase tracking-[0.05em] text-[11px] font-semibold text-text-primary',
        indent: 'pl-3',
        peso: 'font-bold',
      }
    case 'sub':
      return {
        borda: 'border-b border-b-wt-border',
        bg: 'bg-band-soft',
        bgHover: 'group-hover:bg-band',
        rotulo: 'text-[13px] font-semibold text-text-primary',
        indent: 'pl-[26px]',
        peso: 'font-semibold',
      }
    case 'tot':
      return {
        // Banda escura já É a ênfase — sem réguas pesadas por cima.
        borda: 'border-b border-b-wt-border',
        bg: 'bg-action-primary',
        bgHover: '',
        rotulo: 'font-semibold text-[13px] text-action-primary-fg',
        indent: 'pl-3',
        peso: 'font-semibold text-[13px]',
      }
    case 'cat':
    default:
      return {
        borda: 'border-b border-b-wt-border/60',
        bg: 'bg-surface',
        bgHover: 'group-hover:bg-surface-strong',
        rotulo: 'text-[13px] text-text-secondary',
        indent: 'pl-11',
        peso: '',
      }
  }
}

// ── Módulo: componentes de célula (fora do render — nunca remontam a cada render) ──

interface CelulaValorProps {
  /** `null` = AUSÊNCIA (a linha não existe naquele ano) — travessão neutro, como o
   *  zero. Distinguir os dois no MODELO importa mesmo rendendo o mesmo pixel: é o que
   *  impede um Δ% calculado sobre um zero inventado. */
  valor: number | null
  tipo: TipoLinha
  previsto: boolean
  corte: boolean
  totalAno?: boolean
  peso: string
  bg: string
  bgHover: string
  borda: string
}

/** Célula de valor mensal ou do total do ano (e, via `CelulaAnoSeguinte`, das colunas de
 *  ano seguinte — e, via a visão Consolidado, das colunas ano a ano). Cor por SINAL em
 *  toda linha não-zero (`corPorSinal`): `cat` (fundo claro) usa os tons base; `blocoH`/
 *  `sub` (bandas cinza CLARAS) usam `*-deep` (base dá 3,88–4,31:1 sobre as bandas —
 *  reprova AA; deep dá 7–10:1); `tot` (banda ESCURA) usa os tons `*-soft` COMO TINTA
 *  (6,5:1 sobre --action-primary; 4,6:1 sobre a variante âmbar-escura — medido). Zero
 *  sempre em travessão discreto, SEM "R$" (Refino 1 — evita poluir milhares de células
 *  vazias); só o positivo reserva a largura do ")" (span invisible, em
 *  `ConteudoContabil`) para o dígito não desalinhar com o negativo (que TEM o ")" de
 *  verdade).
 *
 *  PREVISTO = a escala de cinza vira escala ÂMBAR: cada nível de fundo tem o seu par
 *  âmbar, misturado por `color-mix` de tokens (opaco — seguro para sticky):
 *  cat→warning-bg/50 · blocoH→60% warning-bg sobre --band · sub→60% sobre --band-soft ·
 *  tot→22% de --warning sobre --action-primary (mais que isso derruba o contraste dos
 *  tons -soft abaixo de AA). */
const BG_PREV_CLARO  = 'bg-[color-mix(in_srgb,var(--warning-bg)_60%,var(--band))]'
const BG_PREV_SOFT   = 'bg-[color-mix(in_srgb,var(--warning-bg)_60%,var(--band-soft))]'
const BG_PREV_ESCURO = 'bg-[color-mix(in_srgb,var(--warning)_22%,var(--action-primary))]'

const BG_PREVISTO: Record<TipoLinha, string> = {
  cat:    'bg-warning-bg/50 group-hover:bg-warning-bg',
  blocoH: BG_PREV_CLARO,
  sub:    BG_PREV_SOFT,
  tot:    BG_PREV_ESCURO,
}

/** Cor do valor por SINAL — extraída de `CelulaValor` p/ ser reaproveitada por
 *  `CelulaAnoSeguinte` (mesma régua, valor sempre previsto) e por `CelulaDeltaPct`
 *  (mesma régua, aplicada ao Δ% da visão Consolidado). Zero é sempre neutro; do
 *  contrário, o tom muda por TIPO de linha (fundo claro × escuro) — ver os fundos
 *  `BG_PREVISTO` logo acima.
 *  (Nada de escrever `BG_PREV_` + asterisco + barra aqui: a sequência fecharia ESTE
 *  comentário no meio — a mesma armadilha que mordeu o CSS na v4.26.) */
function corPorSinal(tipo: TipoLinha, valor: number | null): string {
  const zero = valor === null || Math.abs(valor) < 0.005
  if (zero) return 'text-text-subtle'
  const negativo = valor < 0
  const escuro = tipo === 'tot'
  const bandaClara = tipo === 'blocoH' || tipo === 'sub'
  if (negativo) return escuro ? 'text-negative-soft' : bandaClara ? 'text-negative-deep' : 'text-negative'
  return escuro ? 'text-positive-soft' : bandaClara ? 'text-positive-deep' : 'text-positive'
}

/** Conteúdo em formato CONTÁBIL (Refino 1) — variante COM PARÊNTESES do padrão do DS
 *  (`@/components/shared/valor-contabil.tsx`, ADR-0124): "R$" mudo (`text-text-subtle`)
 *  ancorado à ESQUERDA, número tabular à DIREITA (`flex justify-between`). O componente
 *  `ValorContabil` do DS NÃO serve aqui: ele formata com `numBRL2` (sinal "−" simples),
 *  mas a DRE precisa do NEGATIVO ENTRE PARÊNTESES de `fmtContabil` (convenção contábil já
 *  em uso na tabela) — o que se replica é só o LAYOUT, não o componente. Zero vira
 *  travessão puro alinhado à direita, SEM "R$" (um prefixo em ~2 mil células vazias seria
 *  só ruído). A cor (sinal/neutro) fica no <td> pai, herdada — só o "R$" força o tom
 *  neutro sempre, qualquer que seja o sinal do valor. */
function ConteudoContabil({ valor }: { valor: number | null }) {
  const zero = valor === null || Math.abs(valor) < 0.005
  if (zero) return <span className="block text-right">{fmtContabil(0)}</span>
  const negativo = valor < 0
  return (
    <span className="flex justify-between gap-2">
      <span className="text-text-subtle">R$</span>
      <span>
        {fmtContabil(valor)}
        {!negativo && <span className="invisible">)</span>}
      </span>
    </span>
  )
}

function CelulaValor({ valor, tipo, previsto, corte, totalAno = false, peso, bg, bgHover, borda }: CelulaValorProps) {
  const cor = corPorSinal(tipo, valor)
  const fundo = previsto ? BG_PREVISTO[tipo] : `${bg} ${bgHover}`
  const bordaCorte = corte ? 'border-l-2 border-l-wt-border-strong' : ''
  const bordaTotal = totalAno ? `border-l border-l-wt-border-strong ${peso === '' ? 'font-medium' : ''}` : ''
  return (
    <td className={`h-9 px-3.5 tabular-nums whitespace-nowrap ${fundo} ${borda} ${bordaCorte} ${bordaTotal} ${peso} ${cor}`}>
      <ConteudoContabil valor={valor} />
    </td>
  )
}

interface CelulaAnoSeguinteProps {
  /** `null` = ausência (ver `CelulaValorProps.valor`). */
  valor: number | null
  tipo: TipoLinha
  peso: string
  borda: string
  primeira: boolean
}

/** Célula de uma coluna de "ano seguinte" (Refino 7 — ano+1/ano+2 ao lado do Total do
 *  ano, atrás do toggle "Expandir/Recolher anos seguintes"; na visão Consolidado, essas
 *  mesmas colunas ficam SEMPRE visíveis, sem toggle). SEMPRE previsto (é projeção pura,
 *  sem realizado) — por isso usa direto o `BG_PREVISTO[tipo]`, a MESMA régua de fundo/
 *  cor da coluna de previsto mensal, sem o parâmetro `previsto` de `CelulaValor` (aqui
 *  nunca há outro estado). A 1ª coluna aberta ganha a régua divisória que a separa da
 *  coluna anterior (Total do ano na visão Mensal; TOTAL «AAAA» na Consolidado) — mesmo
 *  tom de borda usado nas demais divisórias de total. */
function CelulaAnoSeguinte({ valor, tipo, peso, borda, primeira }: CelulaAnoSeguinteProps) {
  const cor = corPorSinal(tipo, valor)
  const bordaPrimeira = primeira ? 'border-l border-l-wt-border-strong' : ''
  return (
    <td className={`h-9 px-3.5 tabular-nums whitespace-nowrap ${BG_PREVISTO[tipo]} ${borda} ${bordaPrimeira} ${peso} ${cor}`}>
      <ConteudoContabil valor={valor} />
    </td>
  )
}

interface CelulaContaProps {
  rotulo: string
  rotuloClasse: string
  indent: string
  borda: string
  bg: string
  bgHover: string
  estrela: boolean
  expansivel: boolean
  aberto: boolean
  onToggle?: () => void
}

/** Célula sticky da coluna Conta — rótulo à esquerda e o chevron de expansão SEMPRE à
 *  DIREITA da célula. Linha expansível = a célula INTEIRA é o botão (alvo de clique
 *  grande, padrão acordeão). Fundo SEMPRE opaco, na cor da banda da linha (translúcido
 *  vazaria valores por baixo no scroll horizontal). */
function CelulaConta({ rotulo, rotuloClasse, indent, borda, bg, bgHover, estrela, expansivel, aberto, onToggle }: CelulaContaProps) {
  const conteudoRotulo = (
    <span className={`truncate ${rotuloClasse}`}>
      {rotulo}
      {estrela && <sup className="text-warning-deep" title="Nota da controladoria">*</sup>}
    </span>
  )
  return (
    <td className={`sticky left-0 z-10 h-9 w-[330px] min-w-[330px] max-w-[330px] border-r border-r-wt-border-strong pr-2 ${bg} ${bgHover} ${indent} ${borda}`}>
      {expansivel && onToggle ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={aberto}
          aria-label={`${aberto ? 'Recolher' : 'Expandir'} ${rotulo}`}
          className="foco-neutro flex w-full min-w-0 items-center justify-between gap-1.5 text-left"
        >
          {conteudoRotulo}
          <ChevronRight
            size={14}
            className={`shrink-0 text-text-muted transition-transform ${aberto ? 'rotate-90' : ''}`}
          />
        </button>
      ) : (
        <div className="flex min-w-0 items-center">{conteudoRotulo}</div>
      )}
    </td>
  )
}

/** Célula sticky da coluna Conta no CABEÇALHO — rowSpan 2, idêntica nas duas visões
 *  (Mensal/Consolidado, Refino 13). Extraída para as duas tabelas não divergirem por
 *  cópia-e-cola. Ver a ARMADILHA do cabeçalho de 2 linhas no topo do arquivo —
 *  `bordaBaseHeader` é sempre aplicado diretamente aqui (célula rowSpan). */
function ThConta({ bordaBaseHeader }: { bordaBaseHeader: string }) {
  return (
    <th
      rowSpan={2}
      className={`sticky left-0 z-30 w-[330px] min-w-[330px] max-w-[330px] border-r border-r-wt-border-strong pl-3 pr-3 align-bottom pb-[7px] text-left text-[10px] font-semibold uppercase tracking-[0.09em] text-text-secondary ${bordaBaseHeader}`}
    >
      Conta
    </th>
  )
}

interface CelulaDeltaPctProps {
  /** `null` quando o denominador (YTD do ano anterior) é zero — indefinido, mostra travessão. */
  pct: number | null
  tipo: TipoLinha
  peso: string
  bg: string
  bgHover: string
  borda: string
}

const nfDeltaPct = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: 'exceptZero',
})

/** "+16,3%" / "−34,5%" / "+0,0%" — Δ% da visão Consolidado (Refino 13). `signDisplay:
 *  'exceptZero'` já entrega o sinal certo (inclusive o MINUS TIPOGRÁFICO "−" que o
 *  Intl usa nativamente para negativo em pt-BR, não um hífen "-" comum) e omite o
 *  sinal só quando o valor é exatamente zero — sem concatenação manual de sinal. */
function fmtDeltaPct(pct: number): string {
  return `${nfDeltaPct.format(pct)}%`
}

/** Célula do Δ% (visão Consolidado) — SEM "R$" (é percentual, não contábil), alinhada
 *  à direita, cor por SINAL via `corPorSinal` (a MESMA régua das células de valor —
 *  garante contraste AA nas bandas claras/escuras, não só o par text-positive/
 *  text-negative "base" que basta na linha `cat`). Fundo é sempre o NORMAL da linha
 *  (nunca âmbar: é uma razão entre dois REALIZADOS, não uma projeção). */
function CelulaDeltaPct({ pct, tipo, peso, bg, bgHover, borda }: CelulaDeltaPctProps) {
  const cor = pct == null ? 'text-text-subtle' : corPorSinal(tipo, pct)
  return (
    <td className={`h-9 px-3.5 text-right tabular-nums whitespace-nowrap ${bg} ${bgHover} ${borda} ${peso} ${cor}`}>
      {pct == null ? '–' : fmtDeltaPct(pct)}
    </td>
  )
}

interface LinhaDreTrProps {
  linha: DreLinha
  relacao: Relacao
  mesCorrente: number | null
  idxPrevisto: number
  corteIdx: number | null
  modoPrevisto: ModoPrevisto
  expansivel: boolean
  aberto: boolean
  onToggle?: () => void
  totalModo: TotalModo
  anosSeguintes: AnoSeguinteDados[]
  anosAbertos: boolean
}

/** Uma linha completa da tabela (blocoH/sub/cat/tot): Conta + meses (ou a versão
 *  recolhida/oculta do previsto) + Total do ano (por `totalModo`, Refino 8 — com fundo
 *  âmbar quando 'tudo', Refino 10) + colunas de anos seguintes (Refino 7, quando
 *  `anosAbertos`). Em modo 'tudo', o Total do ano é sempre o `total` do PAYLOAD (a RPC
 *  já soma Σ meses + prev_corrente) — nunca recomputado aqui; em modo 'realizado',
 *  `totalDoAno` refaz a soma só com o que já aconteceu. `modoPrevisto` é só de EXIBIÇÃO
 *  das colunas mensais; `incluirPrevCorrente` (derivado de `totalModo`) decide se a
 *  coluna "«Mês»·P" existe. */
function LinhaDreTr({
  linha, relacao, mesCorrente, idxPrevisto, corteIdx, modoPrevisto, expansivel, aberto, onToggle,
  totalModo, anosSeguintes, anosAbertos,
}: LinhaDreTrProps) {
  const estilo = estiloLinha(linha.t)
  const incluirPrevCorrente = totalModo === 'tudo'
  const valoresBase = construirValores(linha.meses, linha.prev_corrente, relacao, mesCorrente, incluirPrevCorrente)
  const valores = colunasVisiveis(valoresBase, modoPrevisto, idxPrevisto)
  const chaveAno = chaveLinha(linha)
  return (
    <tr className="group">
      <CelulaConta
        rotulo={linha.rotulo}
        rotuloClasse={estilo.rotulo}
        indent={estilo.indent}
        borda={estilo.borda}
        bg={estilo.bg}
        bgHover={estilo.bgHover}
        estrela={linha.estrela}
        expansivel={expansivel}
        aberto={aberto}
        onToggle={onToggle}
      />
      {valores.map((v, idx) => (
        <CelulaValor
          key={idx}
          valor={v}
          tipo={linha.t}
          previsto={idx >= idxPrevisto}
          corte={corteIdx !== null && idx === corteIdx}
          peso={estilo.peso}
          bg={estilo.bg}
          bgHover={estilo.bgHover}
          borda={estilo.borda}
        />
      ))}
      <CelulaValor
        valor={totalDoAno(linha.meses, linha.total, totalModo, relacao, mesCorrente)}
        tipo={linha.t}
        previsto={totalModo === 'tudo'}
        corte={false}
        totalAno
        peso={estilo.peso}
        bg={estilo.bg}
        bgHover={estilo.bgHover}
        borda={estilo.borda}
      />
      {anosAbertos && anosSeguintes.map((a, idx) => (
        <CelulaAnoSeguinte
          key={`ano-${a.ano}`}
          valor={chaveAno != null ? (a.totais[chaveAno] ?? null) : null}
          tipo={linha.t}
          peso={estilo.peso}
          borda={estilo.borda}
          primeira={idx === 0}
        />
      ))}
    </tr>
  )
}

/** Célula de valor da bandeja "Não classificadas" — mesma lógica de parênteses/zero (via
 *  `ConteudoContabil`), sem cor por sinal (a bandeja é órfã do de-para, fora da
 *  hierarquia — mantém o neutro), fundo âmbar (a categoria pode cair em qualquer mês,
 *  inclusive previsto — SEMPRE âmbar, em QUALQUER modo/visão: `totalModo`/Refino 10 não
 *  muda nada aqui, pois já era âmbar de base). `divisor` é a régua que separa a 1ª
 *  coluna de "ano seguinte" (Refino 7) — ou a 1ª coluna após o TOTAL, na visão
 *  Consolidado — do Total do ano/TOTAL «AAAA»: mesmo tom de `totalAno`, sem o
 *  `font-medium`. */
function CelulaValorBandeja({ valor, corte, totalAno = false, divisor = false }: { valor: number | null; corte: boolean; totalAno?: boolean; divisor?: boolean }) {
  const zero = valor === null || Math.abs(valor) < 0.005
  const cor = zero ? 'text-text-subtle' : 'text-text-secondary'
  const bordaCorte = corte ? 'border-l-2 border-l-wt-border-strong' : ''
  const bordaTotal = totalAno ? 'border-l border-l-wt-border-strong font-medium' : ''
  const bordaDivisor = divisor ? 'border-l border-l-wt-border-strong' : ''
  return (
    <td className={`h-9 px-3.5 tabular-nums whitespace-nowrap bg-warning-bg group-hover:bg-neutral-soft ${cor} ${bordaCorte} ${bordaTotal} ${bordaDivisor}`}>
      <ConteudoContabil valor={valor} />
    </td>
  )
}

/** Δ% da bandeja (visão Consolidado) — mesmo neutro (`text-text-secondary`/
 *  `text-text-subtle`) de `CelulaValorBandeja`, sem cor por sinal (a bandeja não
 *  participa da hierarquia colorida). Fundo âmbar sempre, como toda célula de bandeja. */
function CelulaDeltaPctBandeja({ pct }: { pct: number | null }) {
  const zero = pct == null || Math.abs(pct) < 0.005
  const cor = zero ? 'text-text-subtle' : 'text-text-secondary'
  return (
    <td className={`h-9 px-3.5 text-right tabular-nums whitespace-nowrap bg-warning-bg group-hover:bg-neutral-soft ${cor}`}>
      {pct == null ? '–' : fmtDeltaPct(pct)}
    </td>
  )
}

interface LinhaBandejaTrProps {
  linha: DreBandeja
  relacao: Relacao
  mesCorrente: number | null
  idxPrevisto: number
  corteIdx: number | null
  modoPrevisto: ModoPrevisto
  totalModo: TotalModo
  anosSeguintes: AnoSeguinteDados[]
  anosAbertos: boolean
}

/** Linha de categoria órfã da bandeja "Não classificadas" (sempre visível — não entra
 *  no sistema de abertos/hierarquia, que é só para a estrutura real). Acompanha o
 *  recolhimento do previsto, o modo do Total do ano (Refino 8) — incl. a coluna ·P do
 *  mês corrente (Refino 12) — e as colunas de anos seguintes (Refino 7) como qualquer
 *  outra linha. O `title` aponta a origem real no Monde (o dado É real desde a M4 —
 *  nada de "valores ilustrativos"). */
function LinhaBandejaTr({
  linha, relacao, mesCorrente, idxPrevisto, corteIdx, modoPrevisto, totalModo, anosSeguintes, anosAbertos,
}: LinhaBandejaTrProps) {
  const incluirPrevCorrente = totalModo === 'tudo'
  const valoresBase = construirValores(linha.meses, linha.prev_corrente, relacao, mesCorrente, incluirPrevCorrente)
  const valores = colunasVisiveis(valoresBase, modoPrevisto, idxPrevisto)
  const chaveAno = `c:${linha.categoria_id}`
  return (
    <tr className="group">
      {/* fundo OPACO (não `/40`): célula sticky translúcida deixa os valores das colunas
          passarem por baixo do rótulo no scroll horizontal. O hover usa --neutral-soft,
          o âmbar um passo mais saturado do DS. */}
      <td
        className="sticky left-0 z-10 h-9 w-[330px] min-w-[330px] max-w-[330px] border-r border-r-wt-border-strong border-l-[3px] border-l-warning bg-warning-bg pl-[26px] pr-3 group-hover:bg-neutral-soft"
        title={`Grupo no Monde: ${linha.grupo_monde}`}
      >
        <span className="truncate text-[13px] text-text-secondary">{linha.rotulo}</span>
      </td>
      {valores.map((v, idx) => (
        <CelulaValorBandeja key={idx} valor={v} corte={corteIdx !== null && idx === corteIdx} />
      ))}
      <CelulaValorBandeja
        valor={totalDoAno(linha.meses, linha.total, totalModo, relacao, mesCorrente)}
        corte={false}
        totalAno
      />
      {anosAbertos && anosSeguintes.map((a, idx) => (
        <CelulaValorBandeja
          key={`ano-${a.ano}`}
          valor={a.totais[chaveAno] ?? null}
          corte={false}
          divisor={idx === 0}
        />
      ))}
    </tr>
  )
}

/** Mapa ano → linhas daquele ano (`porLinha` de `ConsolidadoAno`), montado uma vez no
 *  componente-raiz e repassado às linhas. */
type PorAnoCons = Map<number, Record<string, RegistroAnoLinha>>

interface LinhaConsolidadoTrProps {
  linha: DreLinha
  colunas: ColunaCons[]
  porAno: PorAnoCons
  anosSeguintes: AnoSeguinteDados[]
  expansivel: boolean
  aberto: boolean
  onToggle?: () => void
}

/** Uma linha completa da visão CONSOLIDADO — MESMA Conta/hierarquia/expandir-recolher
 *  de `LinhaDreTr`, colunas ano a ano em vez de mês a mês. As colunas NÃO são fixas:
 *  vêm do array `colunas` (um grupo por ano marcado, ver `montarColunasCons`), e cada
 *  célula lê o seu valor do ANO da própria coluna — nunca de `linha.meses`/`linha.total`
 *  (que são do ano exibido na URL, que pode não ser nenhum dos marcados). O que a linha
 *  empresta do payload em tela é só a IDENTIDADE (rótulo, tipo, chave, estrela).
 *  PREV/VENCIDOS são âmbar (zona de projeção/pendência); comparação, YTDs e Δ% usam o
 *  fundo normal (comparam REALIZADOS). */
function LinhaConsolidadoTr({ linha, colunas, porAno, anosSeguintes, expansivel, aberto, onToggle }: LinhaConsolidadoTrProps) {
  const estilo = estiloLinha(linha.t)
  const chave = chaveLinha(linha)
  const reg = (a: number) => (chave === null ? undefined : porAno.get(a)?.[chave])
  const cel = { tipo: linha.t, peso: estilo.peso, bg: estilo.bg, bgHover: estilo.bgHover, borda: estilo.borda }

  return (
    <tr className="group">
      <CelulaConta
        rotulo={linha.rotulo}
        rotuloClasse={estilo.rotulo}
        indent={estilo.indent}
        borda={estilo.borda}
        bg={estilo.bg}
        bgHover={estilo.bgHover}
        estrela={linha.estrela}
        expansivel={expansivel}
        aberto={aberto}
        onToggle={onToggle}
      />
      {colunas.map(c => c.k === 'delta' ? (
        <CelulaDeltaPct
          key={c.id}
          {...cel}
          pct={deltaYtd(valorCons(reg(c.de), 'ytd'), valorCons(reg(c.para), 'ytd'))}
        />
      ) : (
        <CelulaValor
          key={c.id}
          {...cel}
          valor={valorCons(reg(c.ano), c.campo)}
          previsto={c.previsto}
          corte={c.corte}
          totalAno={c.totalAno}
        />
      ))}
      {anosSeguintes.map((a, idx) => (
        <CelulaAnoSeguinte
          key={`cons-ano-${a.ano}`}
          valor={chave !== null ? (a.totais[chave] ?? null) : null}
          tipo={linha.t}
          peso={estilo.peso}
          borda={estilo.borda}
          primeira={idx === 0}
        />
      ))}
    </tr>
  )
}

interface LinhaConsolidadoBandejaTrProps {
  linha: DreBandeja
  colunas: ColunaCons[]
  porAno: PorAnoCons
  anosSeguintes: AnoSeguinteDados[]
}

/** Linha de bandeja da visão Consolidado — mesmas colunas de `LinhaConsolidadoTr`, com
 *  o tratamento de bandeja (sempre âmbar, sem cor por sinal). */
function LinhaConsolidadoBandejaTr({ linha, colunas, porAno, anosSeguintes }: LinhaConsolidadoBandejaTrProps) {
  const chave = `c:${linha.categoria_id}`
  const reg = (a: number) => porAno.get(a)?.[chave]

  return (
    <tr className="group">
      <td
        className="sticky left-0 z-10 h-9 w-[330px] min-w-[330px] max-w-[330px] border-r border-r-wt-border-strong border-l-[3px] border-l-warning bg-warning-bg pl-[26px] pr-3 group-hover:bg-neutral-soft"
        title={`Grupo no Monde: ${linha.grupo_monde}`}
      >
        <span className="truncate text-[13px] text-text-secondary">{linha.rotulo}</span>
      </td>
      {colunas.map(c => c.k === 'delta' ? (
        <CelulaDeltaPctBandeja key={c.id} pct={deltaYtd(valorCons(reg(c.de), 'ytd'), valorCons(reg(c.para), 'ytd'))} />
      ) : (
        <CelulaValorBandeja
          key={c.id}
          valor={valorCons(reg(c.ano), c.campo)}
          corte={c.corte}
          totalAno={c.totalAno}
        />
      ))}
      {anosSeguintes.map((a, idx) => (
        <CelulaValorBandeja key={`cons-ano-${a.ano}`} valor={a.totais[chave] ?? null} corte={false} divisor={idx === 0} />
      ))}
    </tr>
  )
}

interface AnoPillsProps {
  anosDisponiveis: number[]
  /** 'unico' = navegação exclusiva por URL (visão Mensal e fail-safe) · 'multi' =
   *  caixas de seleção CUMULATIVAS (visão Consolidado, rodada 3/Refino 4). */
  modo: 'unico' | 'multi'
  /** Ano ativo no modo 'unico'. */
  ano: number
  /** Anos marcados no modo 'multi' (a seleção EFETIVA, já filtrada pelo chamador). */
  selecionados?: Set<number>
  /** Anos sem base consolidada (a RPC daquele ano falhou) — pill `disabled` no 'multi'. */
  semBase?: Set<number>
  /** Navegar (modo 'unico') ou alternar a marcação (modo 'multi') — a regra de "nunca
   *  vazio" vive no chamador, fonte única; a pill só a REPORTA via `aria-disabled`. */
  onSelect: (a: number) => void
}

/** Só as pills — o container/flex fica no chamador, que varia entre a toolbar normal
 *  (2ª linha, ao lado do toggle de "Total do ano") e o fail-safe (o único controle da
 *  toolbar reduzida). Duas semânticas na MESMA pill, por visão: na Mensal é navegação
 *  (um ano por vez, `aria-pressed`); na Consolidado é caixa de seleção (`role="checkbox"`
 *  + `aria-checked`), em que cada marcado acrescenta um grupo de colunas. Como os
 *  rótulos textuais saíram da toolbar (Refino 2), o `title` de cada pill é que carrega
 *  a explicação — inclusive a de por que a última marcada não desmarca. */
function AnoPills({ anosDisponiveis, modo, ano, selecionados, semBase, onSelect }: AnoPillsProps) {
  const multi = modo === 'multi'
  return (
    <>
      {anosDisponiveis.map(a => {
        const ativo = multi ? (selecionados?.has(a) ?? false) : ano === a
        const indisponivel = multi && (semBase?.has(a) ?? false)
        const ultimoMarcado = multi && ativo && (selecionados?.size ?? 0) <= 1
        const titulo = indisponivel
          ? `${a} não pôde ser carregado — recarregue a página para tentar de novo`
          : multi
            ? ultimoMarcado
              ? `${a} — mantenha ao menos um ano marcado`
              : ativo
                ? `Desmarcar ${a} da comparação`
                : `Marcar ${a} — a seleção é cumulativa (um grupo de colunas por ano)`
            : `Ver o ano ${a}`
        return (
          <button
            key={a}
            type="button"
            onClick={() => onSelect(a)}
            disabled={indisponivel}
            title={titulo}
            role={multi ? 'checkbox' : undefined}
            aria-checked={multi ? ativo : undefined}
            aria-pressed={multi ? undefined : ativo}
            aria-disabled={ultimoMarcado || undefined}
            className={[
              'foco-neutro', PILL_FILTRO,
              ativo ? '' : PILL_FILTRO_INATIVO,
              'disabled:opacity-50 disabled:cursor-not-allowed',
            ].join(' ')}
            style={ativo ? PILL_FILTRO_ATIVO_STYLE : undefined}
          >
            {a}
          </button>
        )
      })}
    </>
  )
}

/** Últimos 2 dígitos do ano — "2026" → "26" (rótulos compactos da visão Consolidado). */
function anoCurto(a: number): string {
  return String(a).slice(-2)
}

/** Monta as colunas da visão Consolidado a partir dos anos MARCADOS (ascendente, ao
 *  menos 1 — vazio devolve vazio). Sendo y1<…<yn:
 *   · para cada yi com i<n (anos de COMPARAÇÃO): "«yi»" (ano cheio) · "YTD «aa»" ·
 *     "Δ% «aa»·«aa+1»" (variação do YTD de yi para o do PRÓXIMO marcado — encadeada,
 *     não todos contra o de referência: é assim que se lê a evolução ano a ano);
 *   · para yn (REFERÊNCIA): "YTD «aa»", e só se ele for o ano CORRENTE "PREV «aa»"
 *     (= total − YTD) e "VENCIDOS"; depois "TOTAL «yn»".
 *  Num ano fechado, `total − ytd` seria realizado de ago..dez — por isso PREV/VENCIDOS
 *  não existem ali, e o TOTAL fica com o fundo NORMAL (nada de âmbar de projeção). */
function montarColunasCons(sel: ConsolidadoAno[], janelaTexto: string): ColunaCons[] {
  if (sel.length === 0) return []
  const ref = sel[sel.length - 1]
  const cols: ColunaCons[] = []

  sel.slice(0, -1).forEach((c, i) => {
    const prox = sel[i + 1]
    cols.push({
      k: 'valor', id: `ano-${c.ano}`, rotulo: String(c.ano), ano: c.ano, campo: 'total',
      previsto: false, corte: false, totalAno: false, grupo: 'comp', classe: 'text-text-secondary',
      titulo: `${c.ano} — ano inteiro`,
    })
    cols.push({
      k: 'valor', id: `ytd-${c.ano}`, rotulo: `YTD ${anoCurto(c.ano)}`, ano: c.ano, campo: 'ytd',
      previsto: false, corte: false, totalAno: false, grupo: 'comp', classe: 'text-text-secondary',
      titulo: `${c.ano} na MESMA janela dos demais anos (${janelaTexto})`,
    })
    cols.push({
      k: 'delta', id: `delta-${c.ano}-${prox.ano}`, rotulo: `Δ% ${anoCurto(c.ano)}·${anoCurto(prox.ano)}`,
      de: c.ano, para: prox.ano, grupo: 'comp', classe: 'text-text-secondary',
      titulo: `Variação do YTD de ${c.ano} para ${prox.ano} (mesma janela: ${janelaTexto})`,
    })
  })

  cols.push({
    k: 'valor', id: `ytd-${ref.ano}`, rotulo: `YTD ${anoCurto(ref.ano)}`, ano: ref.ano, campo: 'ytd',
    previsto: false, corte: false, totalAno: false, grupo: 'comp', classe: 'text-text-secondary',
    titulo: `${ref.ano} na MESMA janela dos demais anos (${janelaTexto})`,
  })

  if (ref.corrente) {
    cols.push({
      k: 'valor', id: `prev-${ref.ano}`, rotulo: `PREV ${anoCurto(ref.ano)}`, ano: ref.ano, campo: 'prev',
      previsto: true, corte: true, totalAno: false, grupo: 'prev', classe: 'text-warning-deep',
      titulo: `Previsto de ${ref.ano} — total do ano menos o já realizado (YTD)`,
    })
    cols.push({
      k: 'valor', id: `venc-${ref.ano}`, rotulo: 'VENCIDOS', ano: ref.ano, campo: 'venc',
      previsto: true, corte: false, totalAno: false, grupo: 'prev', classe: 'text-warning-deep',
      titulo: 'Vencido em aberto, ainda não liquidado',
    })
  }

  cols.push({
    k: 'valor', id: `total-${ref.ano}`, rotulo: `TOTAL ${ref.ano}`, ano: ref.ano, campo: 'total',
    // Âmbar só quando o total CONTÉM projeção (ano corrente). Antes desta rodada a cor
    // seguia o `totalModo` da toolbar — que nesta visão fica OCULTO, ou seja, um controle
    // invisível pintando a célula; o ano de referência é o critério honesto.
    previsto: ref.corrente, corte: false, totalAno: true, grupo: 'total', classe: 'text-text-secondary',
    titulo: ref.corrente
      ? `${ref.ano} inteiro — realizado (${janelaTexto}) + previsto do que falta`
      : `${ref.ano} inteiro — tudo realizado (ano fechado)`,
  })

  return cols
}

interface TabelaConsolidadaProps {
  linhas: DreLinha[]
  bandeja: DreBandeja[]
  /** Colunas já montadas por `montarColunasCons` (cabeçalho e células saem daqui). */
  colunas: ColunaCons[]
  porAno: PorAnoCons
  /** Anos marcados, ascendente — só para o rótulo do grupo de comparação. */
  anosSel: number[]
  /** "jan a jul" — a janela do YTD, para os `title` do cabeçalho. */
  janelaTexto: string
  /** Já filtrados pelo chamador: vazio quando o ano de referência não é o corrente. */
  anosSeguintes: AnoSeguinteDados[]
  anosAbertos: boolean
  onToggleAnos: () => void
  refAnoSeguinte: RefObject<HTMLTableCellElement | null>
  refTabela: RefObject<HTMLTableElement | null>
  abertos: Set<string>
  expansiveis: Set<string>
  toggleAberto: (chave: string) => void
  bordaBaseHeader: string
  minWidth: number
}

/** Tabela completa da visão CONSOLIDADO — mesma <table> que a Mensal substitui por
 *  inteiro (não é uma variação de props da mesma table: o conjunto de colunas é outro).
 *  Cabeçalho de 2 linhas, TRÊS grupos na 1ª — os mesmos três da visão Mensal, para as
 *  duas falarem a mesma língua: comparação/realizado ("2024 × 2025 × 2026 · realizado",
 *  sobre os anos marcados + o YTD do de referência), "Previsto" (PREV + VENCIDOS, só
 *  quando a referência é o ano corrente) e "Total" (TOTAL + anos seguintes, com o
 *  toggle «»» à direita). A 2ª linha traz o rótulo de cada coluna, vindo do MESMO
 *  descritor que rende a célula. Só a Conta é expansível, igual à visão Mensal.
 *  ⚠️ Ver a ARMADILHA do cabeçalho de 2 linhas no topo do arquivo: aqui a única `th`
 *  com `rowSpan` é a Conta (`ThConta`), que recebe `bordaBaseHeader` DIRETAMENTE. */
function TabelaConsolidada({
  linhas, bandeja, colunas, porAno, anosSel, janelaTexto, anosSeguintes, anosAbertos, onToggleAnos,
  refAnoSeguinte, refTabela, abertos, expansiveis, toggleAberto, bordaBaseHeader, minWidth,
}: TabelaConsolidadaProps) {
  const anosSegVisiveis = anosAbertos ? anosSeguintes : []
  const nComp  = colunas.filter(c => c.grupo === 'comp').length
  const nPrev  = colunas.filter(c => c.grupo === 'prev').length
  const nTotal = colunas.filter(c => c.grupo === 'total').length + anosSegVisiveis.length
  const totalColunas = 1 + colunas.length + anosSegVisiveis.length // Conta + colunas + anos seguintes

  const th1 = 'whitespace-nowrap px-3.5 py-1.5 text-right text-[10px] font-semibold uppercase tracking-[0.09em]'
  const th2 = (extra: string) =>
    `h-[25px] px-3.5 text-right text-[10px] font-semibold uppercase tracking-[0.09em] ${extra} ${bordaBaseHeader}`

  // Rótulo do grupo de comparação. A janela navegável tem 3 anos, então o join sempre
  // cabe; se ela crescer, encurta para "menor × … × maior" (rótulo comprido demais só
  // empurraria a largura mínima da tabela sem informar mais). Um ano só marcado = não
  // há comparação, o grupo é simplesmente "Realizado" (como na Mensal).
  const rotuloComp = anosSel.length <= 1
    ? 'Realizado'
    : `${anosSel.length > 3 ? `${anosSel[0]} × … × ${anosSel[anosSel.length - 1]}` : anosSel.join(' × ')} · realizado`

  return (
    <table ref={refTabela} className="w-full border-separate border-spacing-0 text-[13px]" style={{ minWidth }}>
      <thead className="sticky top-0 z-20 [&_th]:bg-band">
        <tr>
          <ThConta bordaBaseHeader={bordaBaseHeader} />
          <th
            colSpan={nComp}
            title={`Comparação na MESMA janela dos dois lados (${janelaTexto}) — um grupo de colunas por ano marcado`}
            className={`${th1} text-text-secondary`}
          >
            {rotuloComp}
          </th>
          {nPrev > 0 && (
            <th
              colSpan={nPrev}
              title="Do ano de referência: o que falta projetar e o que já venceu sem liquidar"
              className={`${th1} border-l-2 border-l-wt-border-strong text-warning-deep`}
            >
              Previsto
            </th>
          )}
          <th colSpan={nTotal} className={`${th1} border-l border-l-wt-border-strong text-text-secondary`}>
            <span className="flex w-full items-center justify-end gap-1.5">
              <span>Total</span>
              {anosSeguintes.length > 0 && (
                <button
                  type="button"
                  onClick={onToggleAnos}
                  aria-expanded={anosAbertos}
                  aria-label="Expandir/Recolher anos seguintes"
                  className="foco-neutro inline-flex shrink-0 items-center justify-center rounded p-0.5 text-warning-deep transition-colors hover:bg-warning-bg"
                >
                  {anosAbertos ? <ChevronsLeft size={13} /> : <ChevronsRight size={13} />}
                </button>
              )}
            </span>
          </th>
        </tr>
        <tr>
          {colunas.map(c => (
            <th
              key={c.id}
              title={c.titulo}
              className={th2([
                c.classe,
                c.k === 'valor' && c.corte ? 'border-l-2 border-l-wt-border-strong' : '',
                c.k === 'valor' && c.totalAno ? 'border-l border-l-wt-border-strong' : '',
              ].filter(Boolean).join(' '))}
            >
              {c.rotulo}
            </th>
          ))}
          {anosSegVisiveis.map((a, idx) => (
            <th
              key={`cons-ano-th-${a.ano}`}
              ref={idx === 0 ? refAnoSeguinte : undefined}
              title={`Previsto de ${a.ano} — projeção pura (nada realizado ainda)`}
              className={th2(`text-warning-deep ${idx === 0 ? 'border-l border-l-wt-border-strong' : ''}`)}
            >
              {String(a.ano)}
            </th>
          ))}
        </tr>
      </thead>

      <tbody>
        {linhas.map((l, i) => {
          if (l.t === 'cat') {
            if (l.g == null || !abertos.has(l.g)) return null
            return (
              <LinhaConsolidadoTr
                key={`cons-cat-${l.categoria_id ?? l.rotulo}-${i}`}
                linha={l}
                colunas={colunas}
                porAno={porAno}
                anosSeguintes={anosSegVisiveis}
                expansivel={false}
                aberto={false}
              />
            )
          }
          const chave = l.chave ?? null
          const expansivel = chave != null && expansiveis.has(chave)
          const aberto = chave != null && abertos.has(chave)
          return (
            <LinhaConsolidadoTr
              key={`cons-${l.t}-${chave ?? l.rotulo}-${i}`}
              linha={l}
              colunas={colunas}
              porAno={porAno}
              anosSeguintes={anosSegVisiveis}
              expansivel={expansivel}
              aberto={aberto}
              onToggle={expansivel && chave != null ? () => toggleAberto(chave) : undefined}
            />
          )
        })}

        {bandeja.length > 0 && (
          <>
            <tr>
              <td className="sticky left-0 z-10 h-9 w-[330px] min-w-[330px] max-w-[330px] border-t-[1.5px] border-t-warning border-l-[3px] border-l-warning bg-warning-bg pl-3 pr-3 whitespace-nowrap">
                <span className="text-[11.5px] font-semibold text-warning-deep">Não classificadas ({bandeja.length})</span>
              </td>
              <td className="border-t-[1.5px] border-t-warning bg-warning-bg px-3.5 text-[10.5px] text-warning-deep" colSpan={totalColunas - 1}>
                categorias do Monde sem bloco na estrutura — nada some em silêncio
              </td>
            </tr>
            {bandeja.map((b, i) => (
              <LinhaConsolidadoBandejaTr
                key={`cons-bandeja-${b.categoria_id}-${i}`}
                linha={b}
                colunas={colunas}
                porAno={porAno}
                anosSeguintes={anosSegVisiveis}
              />
            ))}
          </>
        )}
      </tbody>
    </table>
  )
}

/** Sobe do elemento até o container rolável na HORIZONTAL (o viewport do
 *  <ScrollAutoHide>). A partir do ELEMENTO passado, não de um seletor global: a tabela
 *  Mensal e a Consolidada vivem no mesmo viewport, mas só uma está montada por vez. */
function containerHorizontal(el: HTMLElement | null): HTMLElement | null {
  let c: HTMLElement | null = el?.parentElement ?? null
  while (c && !(c.scrollWidth > c.clientWidth && /auto|scroll/.test(getComputedStyle(c).overflowX))) {
    c = c.parentElement
  }
  return c
}

/** Destino do scroll ao FECHAR um grupo de colunas (rodada 3/Refino 3). */
type DestinoAoFechar = 'inicio' | 'fim'

/** Rola a tabela na horizontal nas DUAS transições de um grupo recolhível (Refino 11,
 *  ampliado na rodada 3):
 *   · ABRINDO  — `scrollIntoView` na 1ª coluna revelada (`refAlvo`), `inline:'start'`.
 *     `block:'nearest'` é OBRIGATÓRIO — sem ele, o scroll VERTICAL da página salta
 *     junto com o horizontal.
 *   · FECHANDO — vai para o `destinoAoFechar`: 'inicio' (previsto recolhido = "quero
 *     ver o ano desde janeiro") ou 'fim' (anos seguintes recolhidos = o "Total do ano"
 *     volta a ser a última coluna, e é lá que o olho estava). Aqui NÃO dá para usar
 *     `refAlvo`: a coluna que ele apontava acabou de sair do DOM (a ref já é `null`) —
 *     por isso o container é achado a partir de `refAncora`, um elemento que sobrevive
 *     às duas transições (a própria <table>).
 *  Compara `aberto` contra o valor ANTERIOR guardado numa ref (não um flag "já montou")
 *  — por isso é robusto ao duplo-invoke de efeitos do StrictMode em dev: a 2ª invocação
 *  do MESMO mount vê a ref já atualizada pela 1ª e não repete o scroll; e não dispara no
 *  mount quando o estado nasce `true` (caso do `previstoAberto`, default aberto).
 *  Respeita `prefers-reduced-motion`.
 *
 *  ⚠️ REDE CONTRA O NO-OP SILENCIOSO DO `behavior: 'smooth'`: quando o scroll suave está
 *  DESLIGADO no navegador (flag `Smooth Scrolling` do Chrome desativada, alguns modos de
 *  automação/acessibilidade), `scrollIntoView({behavior:'smooth'})` **não rola nada** — não
 *  cai para instantâneo, simplesmente não acontece, sem erro. A coluna revelada some do
 *  campo de visão e o refino parece não existir. Por isso guardamos a posição do container
 *  antes e, se ~150ms depois nada se moveu, refazemos o scroll em `'auto'`. (Provado ao vivo
 *  na v5.3.0: `scrollTo({behavior:'smooth'})` era no-op page-wide, `scrollLeft = n` funcionava.)
 *  Vale para os DOIS sentidos — daí o fechamento também ter o seu fallback imperativo.
 *
 *  Efeito de DOM puro (nunca `setState` dentro do efeito) — permitido pelo ruleset do
 *  React Compiler. */
function useScrollAoAlternar(
  aberto: boolean,
  refAlvo: RefObject<HTMLTableCellElement | null>,
  refAncora: RefObject<HTMLTableElement | null>,
  destinoAoFechar: DestinoAoFechar,
): void {
  const anteriorRef = useRef(aberto)
  useEffect(() => {
    const antesAberto = anteriorRef.current
    anteriorRef.current = aberto
    if (antesAberto === aberto) return // mount / re-render sem transição real

    const container = containerHorizontal(refAncora.current)
    if (!container) return // tabela cabe na tela: não há o que rolar
    const antes = container.scrollLeft
    const reduzido = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (aberto) {
      const alvo = refAlvo.current
      if (!alvo) return
      const opcoes: ScrollIntoViewOptions = { inline: 'start', block: 'nearest' }
      if (reduzido) {
        alvo.scrollIntoView({ ...opcoes, behavior: 'auto' })
        return
      }
      alvo.scrollIntoView({ ...opcoes, behavior: 'smooth' })
      const t = window.setTimeout(() => {
        if (container.scrollLeft === antes) alvo.scrollIntoView({ ...opcoes, behavior: 'auto' })
      }, 150)
      return () => window.clearTimeout(t)
    }

    const destino = destinoAoFechar === 'inicio' ? 0 : Math.max(0, container.scrollWidth - container.clientWidth)
    if (Math.abs(antes - destino) < 1) return // já está lá
    if (reduzido) {
      container.scrollLeft = destino
      return
    }
    container.scrollTo({ left: destino, behavior: 'smooth' })
    const t = window.setTimeout(() => {
      if (container.scrollLeft === antes) container.scrollLeft = destino
    }, 150)
    return () => window.clearTimeout(t)
  }, [aberto, refAlvo, refAncora, destinoAoFechar])
}

interface TabelaDreProps {
  /** Payload de `get_dre_mensal` já validado pelo `parseRpc` — `null` quando a RPC
   *  falhou ou o shape divergiu (a página nunca quebra; ver FAIL-SAFE no topo). */
  dados: DreMensal | null
  /** Ano resolvido pela página (clampado à janela [corrente-2, corrente]) — fonte
   *  única para destacar a pill ativa (não lê `dados.ano`, que pode ser `null`). */
  ano: number
  anosDisponiveis: number[]
  /** Totais dos anos seguintes (ano+1/ano+2) por linha, indexados por `b:<chave>`
   *  (blocos/totalizadores) e `c:<categoria_id>` (categorias e bandeja) — MESMA
   *  convenção que `chaveLinha` usa para casar a linha. Pode ter 0, 1 ou 2 itens
   *  (a página omite o ano que a RPC não conseguiu buscar); vazio = o toggle de "anos
   *  seguintes" no cabeçalho simplesmente não aparece (Refino 7). */
  anosSeguintes: AnoSeguinteDados[]
  /** Base da visão Consolidado — UM item por ano da janela navegável que a página
   *  conseguiu carregar, em ordem ASCENDENTE (ano cuja RPC falhou simplesmente não vem:
   *  a pill dele fica desabilitada). Lista vazia = a pill "Consolidado" fica
   *  `disabled`; ver bullet "DUAS VISÕES" no topo do arquivo. */
  consolidadoAnos: ConsolidadoAno[]
  /** Quantos meses entram no YTD de TODOS os anos comparados (mês corrente do ano
   *  exibido, ou 12 se ele é fechado) — a página já aplicou essa janela ao montar os
   *  `ytd`; aqui ela só descreve a comparação nos `title` do cabeçalho. */
  mesJanela: number
  /** Ação injetada pela página (ex.: botão "Editar estrutura") — renderizada no
   *  RODAPÉ do card, à direita (Refino 4). */
  slotAcoes?: ReactNode
}

export default function TabelaDre({ dados, ano, anosDisponiveis, anosSeguintes, consolidadoAnos, mesJanela, slotAcoes }: TabelaDreProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const [abertos, setAbertos] = useState<Set<string>>(() => new Set())
  const [rolado, setRolado] = useState(false)
  const [previstoAberto, setPrevistoAberto] = useState(true)
  const [totalModo, setTotalModo] = useState<TotalModo>('tudo')
  const [anosAbertos, setAnosAbertos] = useState(false)
  const [visao, setVisao] = useState<Visao>('mensal')
  // Seleção múltipla da visão Consolidado — os DOIS anos mais recentes disponíveis por
  // padrão (reproduz o comparativo "ano anterior × ano exibido" que existia antes).
  // Initializer de `useState` (nunca um efeito de mount — ruleset do React Compiler).
  const [anosSelecionados, setAnosSelecionados] = useState<Set<number>>(
    () => new Set(consolidadoAnos.slice(-2).map(c => c.ano)),
  )

  // Refino 11 — refs das 1ª colunas de cada grupo recolhível + a ÂNCORA (a <table>, que
  // sobrevive a abrir/fechar e serve para achar o container rolável mesmo quando a
  // coluna-alvo acabou de sair do DOM). Hooks SEMPRE chamados (mesmo quando a
  // visão/relação atual não os usa) — regra dos hooks. A âncora é a MESMA ref nas duas
  // tabelas: só uma está montada por vez.
  const refPrevisto = useRef<HTMLTableCellElement | null>(null)
  const refAnoSeguinte = useRef<HTMLTableCellElement | null>(null)
  const refTabela = useRef<HTMLTableElement | null>(null)
  useScrollAoAlternar(previstoAberto, refPrevisto, refTabela, 'inicio')
  useScrollAoAlternar(anosAbertos, refAnoSeguinte, refTabela, 'fim')

  // Se NENHUM ano pôde ser carregado, a visão Consolidado não tem o que mostrar — a
  // pill fica `disabled` —, mas trata-se também defensivamente aqui: se `visao` ainda
  // estiver 'consolidado' e a base sumir numa troca de ano, cai para 'mensal' sozinho,
  // sem exigir um clique do usuário.
  const visaoEfetiva: Visao = visao === 'consolidado' && consolidadoAnos.length === 0 ? 'mensal' : visao

  // Seleção EFETIVA: o estado filtrado contra o que a página conseguiu carregar (um ano
  // marcado pode sumir de `consolidadoAnos` numa navegação em que a RPC dele falhou) e
  // NUNCA vazia — cai para o ano mais recente disponível. É derivação de RENDER: nada de
  // `setState` num efeito para "consertar" o estado (ruleset do React Compiler).
  const marcados = consolidadoAnos.filter(c => anosSelecionados.has(c.ano))
  const anosCons = marcados.length > 0 ? marcados : consolidadoAnos.slice(-1)
  const anosConsSet = new Set(anosCons.map(c => c.ano))
  const anosSemBase = new Set(anosDisponiveis.filter(a => !consolidadoAnos.some(c => c.ano === a)))

  function trocarAno(a: number) {
    if (a === ano) return
    const params = new URLSearchParams(searchParams.toString())
    params.set('ano', String(a))
    // scroll:false — trocar o ano não deve rolar a página ao topo (mesmo racional
    // do PeriodoFilterPillsUrl da Composição, na mesma página).
    startTransition(() => router.push(`${pathname}?${params.toString()}`, { scroll: false }))
  }

  /** Marca/desmarca um ano na visão Consolidado — puramente client-side (todos os anos
   *  já vieram no payload; NUNCA `router.push` aqui). Desmarcar o ÚLTIMO marcado é
   *  no-op: sem nenhum ano a tabela não teria coluna alguma. Parte da seleção EFETIVA
   *  (não do estado cru), o que de quebra normaliza anos fantasma que tenham deixado de
   *  ser carregáveis. */
  function alternarAnoCons(a: number) {
    if (anosConsSet.has(a) && anosConsSet.size <= 1) return
    const s = new Set(anosConsSet)
    if (s.has(a)) s.delete(a)
    else s.add(a)
    setAnosSelecionados(s)
  }

  const bordaBaseHeader = [
    'border-b-[1.5px] border-b-wt-border-strong',
    rolado ? 'shadow-[0_4px_6px_-4px_rgba(45,42,38,0.12)]' : '',
  ].filter(Boolean).join(' ')

  if (dados === null) {
    return (
      <div className="rounded-xl bg-surface p-5 shadow-sm">
        <h2 className="mb-4 text-[15px] font-semibold text-text-primary">Demonstrativo de Resultado por Fluxo de Caixa</h2>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <AnoPills modo="unico" ano={ano} anosDisponiveis={anosDisponiveis} onSelect={trocarAno} />
        </div>
        <div className={`rounded-lg border border-wt-border p-6 text-center ${isPending ? 'opacity-60' : ''}`}>
          <p className="text-sm text-text-muted">Não foi possível carregar a DRE — tente recarregar.</p>
        </div>
        {slotAcoes && <div className="mt-3 flex justify-end">{slotAcoes}</div>}
      </div>
    )
  }

  const { relacao, mes_corrente: mesCorrente, hoje, linhas, bandeja } = dados

  // 'AAAA-MM-DD' → 'DD/MM' — date PURO (sem fuso, sem hora): split/reverse é seguro
  // aqui (diferente de timestamptz, que exige Intl+timeZone — ver CLAUDE.md). Só sobra
  // `hojeCurta` (o Refino 5 tirou o rótulo "base DD/MM/AAAA" da toolbar) — ainda usado
  // no `title` do cabeçalho "Previsto" (corte na data-base).
  const hojeCurta = hoje.split('-').reverse().join('/').slice(0, 5)

  const idxPrevisto =
    relacao === 'corrente' ? (mesCorrente ?? Number.POSITIVE_INFINITY) :
    relacao === 'futuro'   ? 0 :
    Number.POSITIVE_INFINITY // 'fechado'

  // Refino 5 (rodada 3) — o modo 'realizado' esconde TODO o previsto da visão Mensal:
  // a coluna ·P do mês corrente, os meses futuros, o grupo "Previsto" do cabeçalho com
  // o seu toggle, e as colunas de anos seguintes com o toggle delas.
  const soRealizado = totalModo === 'realizado'
  const incluirPrevCorrente = !soRealizado
  // 'fechado' fica de FORA do 'oculto': ali não existe previsto algum para esconder
  // (`idxPrevisto` = +Infinity), os dois modos mostram exatamente as mesmas 12 colunas —
  // e manter 'aberto' evita que a largura mínima da tabela pule sem que coluna nenhuma
  // tenha mudado. Em 'futuro' o 'oculto' vale e corta tudo (nada aconteceu ainda).
  const modoPrevisto: ModoPrevisto =
    soRealizado && relacao !== 'fechado'      ? 'oculto' :
    relacao === 'corrente' && !previstoAberto ? 'colapsado' :
    'aberto'

  // Sem coluna de previsto não há fronteira realizado→previsto para marcar.
  const corteIdx: number | null =
    modoPrevisto !== 'oculto' && relacao === 'corrente' && mesCorrente != null ? mesCorrente : null

  // Grupo "Previsto" no cabeçalho: existe sempre que o modo NÃO é 'realizado' (no
  // 'tudo' + 'corrente' a coluna ·P existe por construção, mesmo em dezembro). Em
  // 'realizado' nunca existe — é justamente o ponto do modo.
  const temColunaPrevisto = !soRealizado

  const mesesVisiveis: string[] = rotulosVisiveis(
    relacao === 'corrente' && mesCorrente != null ? labelsCorrente(mesCorrente, incluirPrevCorrente) : MESES,
    modoPrevisto,
    idxPrevisto,
  )

  // Anos seguintes são projeção pura: somem junto com o resto do previsto no modo
  // 'realizado' (o estado `anosAbertos` é preservado — voltar ao modo 'tudo' devolve as
  // colunas como estavam).
  const anosSegMensal = soRealizado ? [] : anosSeguintes

  const totalColunas = 1 + mesesVisiveis.length + 1 + (anosAbertos ? anosSegMensal.length : 0)
  // Conta + meses (visíveis) + Total do ano + anos seguintes (quando abertos, Refino 7)

  // Centavos (formato contábil, 2 casas) alargam cada coluna mensal — as bases 1420
  // ('colapsado') e 1860 ('aberto') são as calibradas nas rodadas anteriores e ficam
  // INTOCADAS. Cada coluna de "ano seguinte" ABERTA (Refino 7) soma ~150px: a largura
  // depende do estado, então uma classe `min-w-[...]` fixa não serve — `style` com um
  // NÚMERO é mais honesto que uma classe por combinação possível. No modo 'oculto'
  // (Refino 5) a contagem de colunas varia com o mês corrente, então a largura sai da
  // contagem REAL (~109px por coluna, exatamente a média implícita no 1860: (1860−330)/14),
  // não de uma constante nova: menos colunas = a tabela cabe sem barra horizontal.
  const minWBase =
    modoPrevisto === 'oculto'    ? 330 + (mesesVisiveis.length + 1) * 109 :
    modoPrevisto === 'colapsado' ? 1420 :
    1860
  const minWTotal = minWBase + (anosAbertos ? anosSegMensal.length * 150 : 0)

  const tituloTotalAno = totalModo === 'tudo'
    ? 'Modo ativo: Realizado + previsto — soma do ano inteiro (meses fechados + a projeção dos meses restantes)'
    : 'Modo ativo: Realizado — só o que já aconteceu; a visão esconde as colunas de previsto e de anos seguintes'

  const toggleAberto = (k: string) => setAbertos(prev => {
    const s = new Set(prev)
    if (s.has(k)) s.delete(k)
    else s.add(k)
    return s
  })

  // Bloco (blocoH/sub) expansível = tem ao menos uma `cat` cujo `g` aponte para ele.
  const expansiveis = new Set<string>()
  linhas.forEach(l => { if (l.t === 'cat' && l.g) expansiveis.add(l.g) })

  const expandirTudo = () => setAbertos(new Set(expansiveis))
  const recolherTudo = () => setAbertos(new Set())

  // ── Visão Consolidado: colunas derivadas da seleção ─────────────────────────
  // Janela do YTD em texto ("jan a jul") para os `title` do cabeçalho — clampada, para
  // um `mesJanela` fora de 1..12 nunca virar "jan a undefined" na tela.
  const janelaTexto = `jan a ${MESES[Math.min(Math.max(mesJanela, 1), 12) - 1].toLowerCase()}`
  // Ano de REFERÊNCIA = o maior marcado (nome sem "Ref" para não se confundir com uma
  // ref do React).
  const anoReferencia = anosCons.length > 0 ? anosCons[anosCons.length - 1] : null
  const colunasCons = montarColunasCons(anosCons, janelaTexto)
  const porAnoCons: PorAnoCons = new Map(consolidadoAnos.map(c => [c.ano, c.porLinha]))
  // Anos seguintes aqui só quando a REFERÊNCIA é o ano corrente (num ano fechado não há
  // projeção a mostrar) e só os que vêm DEPOIS dela: `anosSeguintes` é derivado do ano
  // da URL (ano+1/ano+2), que pode não ser o de referência quando a seleção múltipla
  // mira outro ano — sem esse filtro a tabela repetiria como "ano seguinte" um ano já
  // marcado na comparação.
  const anosSegCons = anoReferencia !== null && anoReferencia.corrente
    ? anosSeguintes.filter(a => a.ano > anoReferencia.ano)
    : []
  // ~145px por coluna de valor (o formato contábil com centavos é o que manda) + os
  // 330px fixos da coluna Conta.
  const minWTotalConsolidado =
    330 + (colunasCons.length + (anosAbertos ? anosSegCons.length : 0)) * 145

  return (
    <div className="rounded-xl bg-surface p-5 shadow-sm">
      <h2 className="mb-4 text-[15px] font-semibold text-text-primary">Demonstrativo de Resultado por Fluxo de Caixa</h2>

      {/* ── Toolbar em DUAS linhas, tudo à esquerda (rodada 3/Refino 2) ──
          Linha de cima: pills de VISÃO (+ Expandir/Recolher tudo à direita).
          Linha de baixo: pills de ANO · divisor · pills de "Total do ano".
          Os rótulos "Visão:" e "Total do ano:" saíram — cada pill carrega o `title`
          que explica o que ela faz, para a acessibilidade não piorar com o enxuga. */}
      <div className="mb-4 flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setVisao('mensal')}
              title="Visão mês a mês do ano selecionado"
              aria-pressed={visaoEfetiva === 'mensal'}
              className={['foco-neutro', PILL_FILTRO, visaoEfetiva === 'mensal' ? '' : PILL_FILTRO_INATIVO].join(' ')}
              style={visaoEfetiva === 'mensal' ? PILL_FILTRO_ATIVO_STYLE : undefined}
            >
              Mensal
            </button>
            <button
              type="button"
              onClick={() => setVisao('consolidado')}
              disabled={consolidadoAnos.length === 0}
              aria-pressed={visaoEfetiva === 'consolidado'}
              title={consolidadoAnos.length === 0
                ? 'Comparativo indisponível — nenhum ano pôde ser carregado'
                : 'Visão ano a ano — marque quantos anos quiser nas pills abaixo'}
              className={[
                'foco-neutro', PILL_FILTRO,
                visaoEfetiva === 'consolidado' ? '' : PILL_FILTRO_INATIVO,
                'disabled:opacity-50 disabled:cursor-not-allowed',
              ].join(' ')}
              style={visaoEfetiva === 'consolidado' ? PILL_FILTRO_ATIVO_STYLE : undefined}
            >
              Consolidado
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="ghost" size="sm" onClick={expandirTudo}>Expandir tudo</Button>
            <Button variant="ghost" size="sm" onClick={recolherTudo}>Recolher tudo</Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* MESMAS pills, duas semânticas: navegação na Mensal, caixas de seleção
              cumulativas na Consolidado (ver `AnoPills`). */}
          <AnoPills
            modo={visaoEfetiva === 'consolidado' ? 'multi' : 'unico'}
            ano={ano}
            anosDisponiveis={anosDisponiveis}
            selecionados={anosConsSet}
            semBase={anosSemBase}
            onSelect={visaoEfetiva === 'consolidado' ? alternarAnoCons : trocarAno}
          />
          {/* "Total do ano" só existe na visão Mensal: no Consolidado o realizado (YTD), o
              previsto (PREV) e a soma (TOTAL) já são COLUNAS separadas, então o modo não teria
              o que alternar — deixar as pills à mostra ali seria um controle inerte. O estado
              `totalModo` é preservado (não resetado) para a volta à Mensal. Sem as pills, o
              divisor também não aparece. */}
          {visaoEfetiva === 'mensal' && (
            <>
              <span className="mx-1 h-4 w-px bg-wt-border-strong" aria-hidden />
              <button
                type="button"
                onClick={() => setTotalModo('realizado')}
                title="Total do ano só com o realizado — esconde as colunas de previsto e de anos seguintes"
                aria-pressed={totalModo === 'realizado'}
                className={['foco-neutro', PILL_FILTRO, totalModo === 'realizado' ? '' : PILL_FILTRO_INATIVO].join(' ')}
                style={totalModo === 'realizado' ? PILL_FILTRO_ATIVO_STYLE : undefined}
              >
                Realizado
              </button>
              <button
                type="button"
                onClick={() => setTotalModo('tudo')}
                title="Total do ano com realizado + previsto — mostra as colunas de previsto e de anos seguintes"
                aria-pressed={totalModo === 'tudo'}
                className={['foco-neutro', PILL_FILTRO, totalModo === 'tudo' ? '' : PILL_FILTRO_INATIVO].join(' ')}
                style={totalModo === 'tudo' ? PILL_FILTRO_ATIVO_STYLE : undefined}
              >
                Realizado + previsto
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Box da tabela — borda própria dentro do card, cantos clipam o cabeçalho sticky ── */}
      <div
        className={`overflow-hidden rounded-lg border border-wt-border bg-band transition-opacity ${isPending ? 'opacity-60' : ''}`}
        aria-busy={isPending}
      >
        {/* Box de 80vh + gutter interno EMBAIXO (`pb-3.5`, 14px) no LIMITE do scroll: no
            fundo, o thumb do ScrollAutoHide (absolute bottom-1, 6px) flutua sobre o
            gutter em vez de encostar na última linha. O gutter da DIREITA (`pr-3.5`/
            `pr-1.5`) foi RETIRADO (Refino 2 — sem a margem cinza ali): o thumb horizontal
            é overlay (não desloca conteúdo), então a borda direita do box agora encosta
            na última coluna, sem sobra.
            `bg-band` no VIEWPORT: o cinza do cabeçalho preenche o gutter de baixo e
            qualquer sobra abaixo da última linha (ex.: tudo recolhido em tela alta) — a
            tabela termina numa moldura contínua, não num vazio branco. As células têm
            fundo próprio, então só o espaço realmente vazio aparece em cinza. */}
        {/* Gutter EXTERNO (pb-1.5): o thumb do ScrollAutoHide é `absolute bottom-1`
            (4px) do PRÓPRIO wrapper — encolher o wrapper afasta a barra da borda do box
            sem tocar no componente compartilhado (que é padrão da plataforma). */}
        <div className="pb-1.5">
          <ScrollAutoHide eixo="both" className="max-h-[80vh] pb-3.5" onScroll={e => setRolado(e.currentTarget.scrollTop > 0)}>
          {visaoEfetiva === 'consolidado' && anoReferencia ? (
            <TabelaConsolidada
              linhas={linhas}
              bandeja={bandeja}
              colunas={colunasCons}
              porAno={porAnoCons}
              anosSel={anosCons.map(c => c.ano)}
              janelaTexto={janelaTexto}
              anosSeguintes={anosSegCons}
              anosAbertos={anosAbertos}
              onToggleAnos={() => setAnosAbertos(v => !v)}
              refAnoSeguinte={refAnoSeguinte}
              refTabela={refTabela}
              abertos={abertos}
              expansiveis={expansiveis}
              toggleAberto={toggleAberto}
              bordaBaseHeader={bordaBaseHeader}
              minWidth={minWTotalConsolidado}
            />
          ) : (
          <table
            ref={refTabela}
            className="w-full border-separate border-spacing-0 text-[13px]"
            style={{ minWidth: minWTotal }}
          >
            <thead className="sticky top-0 z-20 [&_th]:bg-band">
              <tr>
                <ThConta bordaBaseHeader={bordaBaseHeader} />

                {relacao === 'corrente' && mesCorrente != null ? (
                  <>
                    {/* Rótulos enxutos: só "Realizado" / "Previsto" — a semântica completa
                        (movimentação × vencimento, corte na data-base) fica no `title`. */}
                    <th
                      title="Realizado por data de movimentação"
                      className="whitespace-nowrap px-3.5 py-1.5 text-right text-[10px] font-semibold uppercase tracking-[0.09em] text-text-secondary"
                      colSpan={mesCorrente}
                    >
                      Realizado
                    </th>
                    {temColunaPrevisto && (
                      <th
                        ref={refPrevisto}
                        title={`Previsto por vencimento — corte na data-base ${hojeCurta}`}
                        className="whitespace-nowrap border-l-2 border-l-wt-border-strong px-3.5 py-1.5 text-right text-[10px] font-semibold uppercase tracking-[0.09em] text-warning-deep"
                        colSpan={modoPrevisto === 'colapsado' ? 1 : 13 - mesCorrente /* 12 meses + a coluna extra do mês híbrido (·P) */}
                      >
                        <span className="flex w-full items-center justify-end gap-1.5">
                          <span>Previsto</span>
                          <button
                            type="button"
                            onClick={() => setPrevistoAberto(v => !v)}
                            aria-expanded={previstoAberto}
                            aria-label="Recolher/Expandir colunas de previsto"
                            className="foco-neutro inline-flex shrink-0 items-center justify-center rounded p-0.5 text-warning-deep transition-colors hover:bg-warning-bg"
                          >
                            {previstoAberto ? <ChevronsLeft size={13} /> : <ChevronsRight size={13} />}
                          </button>
                        </span>
                      </th>
                    )}
                  </>
                ) : relacao === 'fechado' ? (
                  <th
                    title="Ano fechado — tudo realizado (por data de movimentação)"
                    className="whitespace-nowrap px-3.5 py-1.5 text-right text-[10px] font-semibold uppercase tracking-[0.09em] text-text-secondary"
                    colSpan={12}
                  >
                    Realizado
                  </th>
                ) : temColunaPrevisto ? (
                  <th
                    title="Previsto por vencimento"
                    className="whitespace-nowrap px-3.5 py-1.5 text-right text-[10px] font-semibold uppercase tracking-[0.09em] text-warning-deep"
                    colSpan={12}
                  >
                    Previsto
                  </th>
                ) : null /* 'futuro' no modo 'realizado': nada aconteceu ainda, então não
                            sobra coluna mensal alguma — e um colSpan={0} teria significado
                            especial em HTML ("até o fim do grupo"), nunca "zero colunas".
                            (Inalcançável pela URL: o ano é clampado ao corrente.) */}

                {/* Refino 9 — a seta de anos seguintes agora é ABSOLUTA, ancorada na
                    faixa exata da 1ª linha (`h-[27px]`, mesma altura da "Previsto"
                    acima), alinhada com ela. O texto "Total do ano" segue embaixo,
                    `align-bottom`, como sempre — por isso a `th` precisa de `relative`. */}
                <th
                  rowSpan={2}
                  className={`relative w-[170px] min-w-[170px] border-l border-l-wt-border-strong px-3.5 align-bottom pb-[7px] text-right text-[10px] font-semibold uppercase tracking-[0.09em] text-text-secondary ${bordaBaseHeader}`}
                  title={tituloTotalAno}
                >
                  {anosSegMensal.length > 0 && (
                    /* Refino 1 (rodada 3) — MESMA cor do toggle do Previsto
                       (`text-warning-deep` + `hover:bg-warning-bg`): as duas setas
                       revelam projeção, então falam a mesma língua de cor. */
                    <button
                      type="button"
                      onClick={() => setAnosAbertos(v => !v)}
                      aria-expanded={anosAbertos}
                      aria-label="Expandir/Recolher anos seguintes"
                      className="foco-neutro absolute right-3.5 top-0 flex h-[27px] items-center justify-center rounded p-0.5 text-warning-deep transition-colors hover:bg-warning-bg"
                    >
                      {anosAbertos ? <ChevronsLeft size={13} /> : <ChevronsRight size={13} />}
                    </button>
                  )}
                  Total do ano
                </th>

                {anosAbertos && anosSegMensal.length > 0 && (
                  <th colSpan={anosSegMensal.length} aria-hidden="true" className="border-l border-l-wt-border-strong" />
                )}
              </tr>
              <tr>
                {mesesVisiveis.map((m, i) => (
                  <th
                    key={m}
                    className={[
                      'h-[25px] px-3.5 text-right text-[10px] font-semibold uppercase tracking-[0.09em]',
                      i >= idxPrevisto ? 'text-warning-deep' : 'text-text-secondary',
                      corteIdx !== null && i === corteIdx ? 'border-l-2 border-l-wt-border-strong' : '',
                      bordaBaseHeader,
                    ].join(' ')}
                  >
                    {m}
                  </th>
                ))}
                {anosAbertos && anosSegMensal.map((a, idx) => (
                  <th
                    key={`ano-th-${a.ano}`}
                    ref={idx === 0 ? refAnoSeguinte : undefined}
                    className={[
                      'h-[25px] px-3.5 text-right text-[10px] font-semibold uppercase tracking-[0.09em] text-warning-deep',
                      idx === 0 ? 'border-l border-l-wt-border-strong' : '',
                      bordaBaseHeader,
                    ].join(' ')}
                  >
                    {String(a.ano)}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {linhas.map((l, i) => {
                if (l.t === 'cat') {
                  if (l.g == null || !abertos.has(l.g)) return null
                  return (
                    <LinhaDreTr
                      key={`cat-${l.categoria_id ?? l.rotulo}-${i}`}
                      linha={l}
                      relacao={relacao}
                      mesCorrente={mesCorrente}
                      idxPrevisto={idxPrevisto}
                      corteIdx={corteIdx}
                      modoPrevisto={modoPrevisto}
                      expansivel={false}
                      aberto={false}
                      totalModo={totalModo}
                      anosSeguintes={anosSegMensal}
                      anosAbertos={anosAbertos}
                    />
                  )
                }
                const chave = l.chave ?? null
                const expansivel = chave != null && expansiveis.has(chave)
                const aberto = chave != null && abertos.has(chave)
                const onToggle = expansivel && chave != null ? () => toggleAberto(chave) : undefined
                return (
                  <LinhaDreTr
                    key={`${l.t}-${chave ?? l.rotulo}-${i}`}
                    linha={l}
                    relacao={relacao}
                    mesCorrente={mesCorrente}
                    idxPrevisto={idxPrevisto}
                    corteIdx={corteIdx}
                    modoPrevisto={modoPrevisto}
                    expansivel={expansivel}
                    aberto={aberto}
                    onToggle={onToggle}
                    totalModo={totalModo}
                    anosSeguintes={anosSegMensal}
                    anosAbertos={anosAbertos}
                  />
                )
              })}

              {/* Bandeja "Não classificadas" — categoria(s) órfã(s) do de-para (sempre
                  visíveis, fora do sistema de abertos/hierarquia). Rótulo na célula
                  STICKY (visível mesmo com scroll horizontal); explicador na faixa
                  restante. Some por completo quando não há órfãs (nada a avisar). */}
              {bandeja.length > 0 && (
                <>
                  <tr>
                    <td className="sticky left-0 z-10 h-9 w-[330px] min-w-[330px] max-w-[330px] border-t-[1.5px] border-t-warning border-l-[3px] border-l-warning bg-warning-bg pl-3 pr-3 whitespace-nowrap">
                      <span className="text-[11.5px] font-semibold text-warning-deep">Não classificadas ({bandeja.length})</span>
                    </td>
                    <td className="border-t-[1.5px] border-t-warning bg-warning-bg px-3.5 text-[10.5px] text-warning-deep" colSpan={totalColunas - 1}>
                      categorias do Monde sem bloco na estrutura — nada some em silêncio
                    </td>
                  </tr>
                  {bandeja.map((b, i) => (
                    <LinhaBandejaTr
                      key={`bandeja-${b.categoria_id}-${i}`}
                      linha={b}
                      relacao={relacao}
                      mesCorrente={mesCorrente}
                      idxPrevisto={idxPrevisto}
                      corteIdx={corteIdx}
                      modoPrevisto={modoPrevisto}
                      totalModo={totalModo}
                      anosSeguintes={anosSegMensal}
                      anosAbertos={anosAbertos}
                    />
                  ))}
                </>
              )}
            </tbody>
          </table>
          )}
          </ScrollAutoHide>
        </div>
      </div>

      {/* Ações da tabela (ex.: "Editar estrutura") — rodapé do card, à direita (Refino
          4; antes vivia na toolbar). Mesma regra no fail-safe acima. */}
      {slotAcoes && <div className="mt-3 flex justify-end">{slotAcoes}</div>}
    </div>
  )
}
