'use client'

// ── Tabela hierárquica da DRE por Fluxo de Caixa (v5.3.0 · M4 + refino visual + Onda 2/rodada 2) ──
// Tabela DE PRODUÇÃO, data-driven por props — lê a estrutura viva + o fato real via
// `get_dre_mensal` (a página busca a RPC e injeta `dados`/`ano`/`anosDisponiveis`/
// `anosSeguintes`/`consolidado`). Sucede o mockup de fixture da M0 (tabela-dre-mockup.tsx +
// mockup-dados.ts, agora removidos deste caminho); o VISUAL/INTERAÇÃO gateados pelo
// Yan na M0 são preservados onde não listados abaixo — a FONTE dos dados, as colunas
// dinâmicas por ano e os refinos desta rodada (ver bullets abaixo) mudaram.
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
//  · 'consolidado' — ano a ano: "«anoAnterior» (ano)" / "YTD «aa»" (do ano anterior,
//    MESMA janela jan..mês-corrente do ano exibido) / "YTD «aa»" (do ano exibido,
//    realizado) / "Δ% aavaa" / "PREV «aa»" (= total − YTD) / "VENCIDOS" /
//    "TOTAL «AAAA»" + anos seguintes (SEMPRE visíveis, sem toggle — ver
//    `TabelaConsolidada`/`LinhaConsolidadoTr` mais abaixo). Vem de `consolidado`
//    (prop da página — `null` quando a RPC do ano anterior falhou; a pill fica
//    `disabled` e a visão fica inalcançável PELA UI, mas o componente TAMBÉM trata
//    defensivamente: `visaoEfetiva` — nunca `visao` cru — cai para 'mensal' sozinho
//    se `consolidado` for `null`, mesmo que o usuário já estivesse na visão
//    Consolidado antes de trocar de ano). O toggle de `totalModo` CONTINUA ativo
//    nesta visão: não muda o VALOR de nenhuma coluna (todas são fórmulas fixas — ver
//    a tabela de colunas na delegação), só a COR (âmbar/normal) da célula
//    "TOTAL «AAAA»", pelo MESMO racional do Refino 10 abaixo. Os toggles de
//    Previsto/anos-seguintes da visão Mensal não existem aqui — colunas fixas.
//
// TRÊS RELAÇÕES (`dados.relacao`) — as colunas mudam de forma:
//  · 'corrente' — mês corrente HÍBRIDO: meses 1..mes_corrente são REALIZADO (o do mês
//    corrente rotulado "«Mês»·R" SÓ quando o modo 'tudo' está ativo — Refino 12), +
//    1 coluna extra "«Mês»·P" (= `prev_corrente`, fundo âmbar, corte à esquerda, essa
//    coluna também só existe no modo 'tudo' — Refino 12), + meses
//    mes_corrente+1..12 PREVISTO. 13 colunas no modo 'tudo', 12 no modo 'realizado'.
//    O previsto (da coluna ·P — ou do 1º mês futuro, sem ela — até Dez) é RECOLHÍVEL
//    (toggle no cabeçalho, soma numa única coluna) — só nesta relação.
//  · 'fechado' — ano fechado: 12 colunas, tudo REALIZADO, sem corte/âmbar.
//  · 'futuro'  — ano ainda não iniciado: 12 colunas, tudo PREVISTO (âmbar), sem corte.
// `idxPrevisto`/`corteIdx` concentram essa diferença por ÍNDICE de coluna — o índice
// NÃO muda entre os modos 'tudo'/'realizado' (só o CONTEÚDO do array de valores muda,
// ver `construirValores`) — o resto (CelulaValor, cabeçalho da 2ª linha) é um ÚNICO
// trecho genérico para as 3 relações.
//
// "TOTAL DO ANO" TEM MODO (`totalModo`, pills na toolbar, default 'tudo'):
//  · 'tudo' — o `total` do PAYLOAD (Σ meses + prev_corrente, como a RPC entrega —
//    comportamento original). A célula ganha fundo ÂMBAR (Refino 10 — reaproveita o
//    MESMO mapa `BG_PREVISTO` das colunas de previsto): reforça visualmente que esse
//    número INCLUI projeção, não só o que já aconteceu. Vale para blocos/categorias
//    E bandeja (a bandeja já era sempre âmbar de base — nada muda nela aqui).
//  · 'realizado' — recomputa (`totalDoAno`) só com o que já aconteceu — em
//    'corrente' EXCLUI `prev_corrente` e os meses futuros — E remove a COLUNA
//    "«Mês»·P" inteira do mês corrente (cabeçalho, células E bandeja — Refino 12,
//    item 6 do Yan): sem a coluna extra, o mês corrente mostra só o que de fato
//    entrou/saiu até a data-base (o próprio `meses[mesCorrente-1]`), sem a projeção
//    do resto do mês. As colunas dos meses FUTUROS continuam (têm o próprio toggle
//    de recolher). Fundo da célula Total do ano volta ao normal da linha.
// NÃO afeta as colunas de anos seguintes (são previsto puro, ver abaixo) nem os
// VALORES da visão Consolidado (fórmulas fixas, ver acima — só a cor da célula
// "TOTAL «AAAA»" reage a `totalModo` lá também).
//
// COLUNAS DE ANOS SEGUINTES (`anosSeguintes`, prop da página — 0 a 2 itens, ano+1/
// ano+2; item que a RPC não conseguiu buscar é simplesmente omitido pela página): na
// visão Mensal, um toggle no cabeçalho "Total do ano" (`anosAbertos`, default false —
// a seta agora ALINHADA com a do toggle de Previsto, Refino 9: a `th` ganha
// `relative`, o botão vira `absolute right-3.5 top-0 h-[27px]` — a faixa exata da 1ª
// linha —, o texto "Total do ano" continua embaixo, `align-bottom`, como sempre)
// abre uma coluna por item, DEPOIS do Total do ano, com o fundo/cor de PREVISTO do
// tipo da linha (são projeção pura, nunca realizado). A chave que casa linha↔total
// (`chaveLinha`, ex-`chaveAnoSeguinte` — generalizada nesta rodada porque a visão
// Consolidado usa a MESMA convenção para casar com `consolidado.porLinha`) é:
// `b:<chave>` (bloco/sub/tot) ou `c:<categoria_id>` (categoria/bandeja). O toggle só
// aparece quando `anosSeguintes.length > 0`. Na visão Consolidado essas colunas
// SEMPRE aparecem, sem toggle (ver acima).
//
// SCROLL ATÉ AS COLUNAS RECÉM-ABERTAS (Refino 11): ao abrir o Previsto
// (`previstoAberto` false→true) ou os anos seguintes (`anosAbertos` false→true), a
// tabela rola horizontalmente até a 1ª coluna revelada (hook `useScrollAoAbrir`,
// `scrollIntoView({ inline: 'start', block: 'nearest' })` — `block: 'nearest'` é
// OBRIGATÓRIO, senão o scroll VERTICAL da página salta junto arrastado pelo
// horizontal). Só dispara na transição REAL false→true: o hook compara contra o
// valor ANTERIOR guardado numa ref (não um flag "primeira renderização"), o que o
// deixa robusto ao duplo-invoke de efeitos do StrictMode em dev (que rodaria o
// efeito 2x já no mount) — sem essa robustez, `previstoAberto` nascendo `true` por
// padrão causaria um scroll indesejado ao carregar a página. Respeita
// `prefers-reduced-motion`. Efeito de DOM puro (nunca `setState` dentro do efeito) —
// permitido pelo ruleset do React Compiler.
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
// ANO por URL: as pills vivem aqui e navegam via `router.push` (preserva os demais
// params da URL, ex.: o período da Composição), com `startTransition` — o indicador
// de carregamento é a opacidade sutil na CAIXA da tabela (`isPending`), não nas
// pills (padrão v4.39). `visao` (Mensal/Consolidado) é estado de UI puro (NÃO vai
// pra URL) — trocar de visão não recarrega nada: os dois conjuntos de colunas vêm
// do MESMO lote de props que a página já buscou.

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

/** Soma as colunas a partir de `idxPrevisto` numa ÚNICA coluna agregada quando
 *  `colapsar` é true (só 'corrente' com o previsto recolhido); nos demais casos
 *  devolve os valores como estão. O índice do corte não muda entre os dois estados —
 *  a coluna agregada ocupa o MESMO índice — então `previsto`/`corte` (calculados por
 *  índice em `LinhaDreTr`/`LinhaBandejaTr`) não precisam de ramo extra. Guarda
 *  `idxPrevisto >= valores.length`: quando o mês corrente é Dezembro E a coluna ·P
 *  foi removida (Refino 12), não sobra NENHUM mês futuro para colapsar — sem essa
 *  guarda, `soma([])` (=0) criaria uma coluna fantasma a mais. */
function colunasVisiveis(valores: number[], colapsar: boolean, idxPrevisto: number): number[] {
  if (!colapsar || idxPrevisto >= valores.length) return valores
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

/** Mesmo colapso de `colunasVisiveis`, para os RÓTULOS (2ª linha do cabeçalho). O
 *  rótulo da coluna agregada reaproveita o do PRIMEIRO índice previsto
 *  (`labels[idxPrevisto]`) — "«Mês»·P" quando a coluna ·P existe (totalModo 'tudo'),
 *  "«1º mês futuro»" quando ela foi removida (totalModo 'realizado', Refino 12) —
 *  sem precisar saber qual dos dois casos é: o rótulo de origem já carrega a
 *  diferença. Mesma guarda de `idxPrevisto >= labels.length` de `colunasVisiveis`. */
function rotulosVisiveis(labels: string[], colapsar: boolean, idxPrevisto: number): string[] {
  if (!colapsar || idxPrevisto >= labels.length) return labels
  return [...labels.slice(0, idxPrevisto), `${labels[idxPrevisto]}–Dez`]
}

/** Totais dos anos seguintes (ano+1/ano+2) por linha — prop injetada pela página (ver
 *  bullet no topo do arquivo). `totais` é indexado pela MESMA chave que `chaveLinha`
 *  deriva de cada linha. */
interface AnoSeguinteDados {
  ano: number
  totais: Record<string, number>
}

/** Um par (ano cheio, YTD na mesma janela do ano exibido) do ANO ANTERIOR, por linha
 *  — ver `TabelaDreProps.consolidado`. */
interface ConsolidadoLinha {
  ano: number
  ytd: number
}

/** Base da visão Consolidado (Refino 13) — prop injetada pela página. `porLinha` é
 *  indexado pela MESMA chave que `chaveLinha` deriva de cada linha (idêntica
 *  convenção de `anosSeguintes[].totais`). `null` (prop) = o ano anterior não pôde
 *  ser buscado — a visão fica inalcançável (pill desabilitada) e o componente cai
 *  para 'mensal' sozinho (`visaoEfetiva`). */
interface ConsolidadoDados {
  anoAnterior: number
  porLinha: Record<string, ConsolidadoLinha>
}

/** Chave de casamento com `anosSeguintes[].totais` E `consolidado.porLinha` — MESMA
 *  convenção que a página usa para montar os dois mapas (ver page.tsx): bloco/sub/
 *  totalizador → `b:<chave>`; categoria → `c:<categoria_id>`. `null` quando a linha
 *  não tem identificador (não deveria acontecer na prática — fail-safe: a coluna
 *  mostra 0). Generalizada nesta rodada (ex-`chaveAnoSeguinte`) porque agora serve
 *  a DOIS consumidores, não só as colunas de ano seguinte. */
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
 *  coluna). A visão Consolidado (Refino 13) reaproveita esta função FORÇANDO
 *  `totalModo:'realizado'` para o YTD do ano exibido — ver `LinhaConsolidadoTr`. */
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
  valor: number
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
function corPorSinal(tipo: TipoLinha, valor: number): string {
  const zero = Math.abs(valor) < 0.005
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
function ConteudoContabil({ valor }: { valor: number }) {
  const zero = Math.abs(valor) < 0.005
  if (zero) return <span className="block text-right">{fmtContabil(valor)}</span>
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
  valor: number
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
  colapsar: boolean
  expansivel: boolean
  aberto: boolean
  onToggle?: () => void
  totalModo: TotalModo
  anosSeguintes: AnoSeguinteDados[]
  anosAbertos: boolean
}

/** Uma linha completa da tabela (blocoH/sub/cat/tot): Conta + meses (ou a versão recolhida
 *  do previsto) + Total do ano (por `totalModo`, Refino 8 — com fundo âmbar quando
 *  'tudo', Refino 10) + colunas de anos seguintes (Refino 7, quando `anosAbertos`). Em
 *  modo 'tudo', o Total do ano é sempre o `total` do PAYLOAD (a RPC já soma Σ meses +
 *  prev_corrente) — nunca recomputado aqui; em modo 'realizado', `totalDoAno` refaz a
 *  soma só com o que já aconteceu. O recolhimento (`colapsar`) é só de EXIBIÇÃO das
 *  colunas mensais; `incluirPrevCorrente` (derivado de `totalModo`, Refino 12) decide se
 *  a coluna "«Mês»·P" existe. */
function LinhaDreTr({
  linha, relacao, mesCorrente, idxPrevisto, corteIdx, colapsar, expansivel, aberto, onToggle,
  totalModo, anosSeguintes, anosAbertos,
}: LinhaDreTrProps) {
  const estilo = estiloLinha(linha.t)
  const incluirPrevCorrente = totalModo === 'tudo'
  const valoresBase = construirValores(linha.meses, linha.prev_corrente, relacao, mesCorrente, incluirPrevCorrente)
  const valores = colunasVisiveis(valoresBase, colapsar, idxPrevisto)
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
          valor={chaveAno != null ? (a.totais[chaveAno] ?? 0) : 0}
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
function CelulaValorBandeja({ valor, corte, totalAno = false, divisor = false }: { valor: number; corte: boolean; totalAno?: boolean; divisor?: boolean }) {
  const zero = Math.abs(valor) < 0.005
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
  colapsar: boolean
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
  linha, relacao, mesCorrente, idxPrevisto, corteIdx, colapsar, totalModo, anosSeguintes, anosAbertos,
}: LinhaBandejaTrProps) {
  const incluirPrevCorrente = totalModo === 'tudo'
  const valoresBase = construirValores(linha.meses, linha.prev_corrente, relacao, mesCorrente, incluirPrevCorrente)
  const valores = colunasVisiveis(valoresBase, colapsar, idxPrevisto)
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
          valor={a.totais[chaveAno] ?? 0}
          corte={false}
          divisor={idx === 0}
        />
      ))}
    </tr>
  )
}

interface LinhaConsolidadoTrProps {
  linha: DreLinha
  relacao: Relacao
  mesCorrente: number | null
  totalModo: TotalModo
  consolidado: ConsolidadoDados
  anosSeguintes: AnoSeguinteDados[]
  expansivel: boolean
  aberto: boolean
  onToggle?: () => void
}

/** Uma linha completa da visão CONSOLIDADO (Refino 13) — MESMA Conta/hierarquia/
 *  expandir-recolher de `LinhaDreTr`, colunas ano a ano em vez de mês a mês:
 *  "«anoAnterior» (ano)" / YTD do ano anterior / YTD do ano exibido (SEMPRE
 *  'realizado' — reaproveita `totalDoAno`, independente do `totalModo` escolhido na
 *  toolbar) / Δ% entre os dois YTD / PREV (= total − YTD, ou seja, o que falta
 *  projetar) / VENCIDOS (`linha.venc`, direto do payload) / TOTAL «AAAA»
 *  (`linha.total` cru — a única célula que reage a `totalModo`, só na COR, Refino 10)
 *  / anos seguintes (sempre abertos, sem toggle). PREV e VENCIDOS são âmbar (zona de
 *  projeção/pendência); as 3 primeiras colunas (ano anterior, os 2 YTD) e o Δ% usam o
 *  fundo normal da linha (comparam REALIZADOS, não projeção). */
function LinhaConsolidadoTr({
  linha, relacao, mesCorrente, totalModo, consolidado, anosSeguintes, expansivel, aberto, onToggle,
}: LinhaConsolidadoTrProps) {
  const estilo = estiloLinha(linha.t)
  const chave = chaveLinha(linha)
  const anterior = chave != null ? consolidado.porLinha[chave] : undefined
  const anoAnteriorTotal = anterior?.ano ?? 0
  const ytdAnterior = anterior?.ytd ?? 0
  const ytdAtual = totalDoAno(linha.meses, linha.total, 'realizado', relacao, mesCorrente)
  const prev = linha.total - ytdAtual
  const deltaPct = ytdAnterior === 0 ? null : ((ytdAtual - ytdAnterior) / Math.abs(ytdAnterior)) * 100
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
      <CelulaValor {...cel} valor={anoAnteriorTotal} previsto={false} corte={false} />
      <CelulaValor {...cel} valor={ytdAnterior} previsto={false} corte={false} />
      <CelulaValor {...cel} valor={ytdAtual} previsto={false} corte={false} />
      <CelulaDeltaPct {...cel} pct={deltaPct} />
      <CelulaValor {...cel} valor={prev} previsto corte />
      <CelulaValor {...cel} valor={linha.venc} previsto corte={false} />
      <CelulaValor {...cel} valor={linha.total} previsto={totalModo === 'tudo'} corte={false} totalAno />
      {anosSeguintes.map((a, idx) => (
        <CelulaAnoSeguinte
          key={`cons-ano-${a.ano}`}
          valor={chave != null ? (a.totais[chave] ?? 0) : 0}
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
  relacao: Relacao
  mesCorrente: number | null
  consolidado: ConsolidadoDados
  anosSeguintes: AnoSeguinteDados[]
}

/** Linha de bandeja da visão Consolidado — mesmo esquema de `LinhaBandejaTr` (sempre
 *  âmbar, sem cor por sinal), colunas ano a ano. */
function LinhaConsolidadoBandejaTr({ linha, relacao, mesCorrente, consolidado, anosSeguintes }: LinhaConsolidadoBandejaTrProps) {
  const chave = `c:${linha.categoria_id}`
  const anterior = consolidado.porLinha[chave]
  const anoAnteriorTotal = anterior?.ano ?? 0
  const ytdAnterior = anterior?.ytd ?? 0
  const ytdAtual = totalDoAno(linha.meses, linha.total, 'realizado', relacao, mesCorrente)
  const prev = linha.total - ytdAtual
  const deltaPct = ytdAnterior === 0 ? null : ((ytdAtual - ytdAnterior) / Math.abs(ytdAnterior)) * 100

  return (
    <tr className="group">
      <td
        className="sticky left-0 z-10 h-9 w-[330px] min-w-[330px] max-w-[330px] border-r border-r-wt-border-strong border-l-[3px] border-l-warning bg-warning-bg pl-[26px] pr-3 group-hover:bg-neutral-soft"
        title={`Grupo no Monde: ${linha.grupo_monde}`}
      >
        <span className="truncate text-[13px] text-text-secondary">{linha.rotulo}</span>
      </td>
      <CelulaValorBandeja valor={anoAnteriorTotal} corte={false} />
      <CelulaValorBandeja valor={ytdAnterior} corte={false} />
      <CelulaValorBandeja valor={ytdAtual} corte={false} />
      <CelulaDeltaPctBandeja pct={deltaPct} />
      <CelulaValorBandeja valor={prev} corte />
      <CelulaValorBandeja valor={linha.venc} corte={false} />
      <CelulaValorBandeja valor={linha.total} corte={false} totalAno />
      {anosSeguintes.map((a, idx) => (
        <CelulaValorBandeja key={`cons-ano-${a.ano}`} valor={a.totais[chave] ?? 0} corte={false} divisor={idx === 0} />
      ))}
    </tr>
  )
}

/** Só as pills — o container/flex fica no chamador, que varia entre a toolbar normal
 *  (aninhado num cluster maior, com o toggle de "Total do ano" ao lado) e o fail-safe
 *  (o único controle da toolbar reduzida). */
function AnoPills({ ano, anosDisponiveis, onSelect }: { ano: number; anosDisponiveis: number[]; onSelect: (a: number) => void }) {
  return (
    <>
      {anosDisponiveis.map(a => (
        <button
          key={a}
          type="button"
          onClick={() => onSelect(a)}
          className={['foco-neutro', PILL_FILTRO, ano === a ? '' : PILL_FILTRO_INATIVO].join(' ')}
          style={ano === a ? PILL_FILTRO_ATIVO_STYLE : undefined}
        >
          {a}
        </button>
      ))}
    </>
  )
}

/** Últimos 2 dígitos do ano — "2026" → "26" (rótulos compactos da visão Consolidado). */
function anoCurto(a: number): string {
  return String(a).slice(-2)
}

interface TabelaConsolidadaProps {
  linhas: DreLinha[]
  bandeja: DreBandeja[]
  relacao: Relacao
  mesCorrente: number | null
  totalModo: TotalModo
  consolidado: ConsolidadoDados
  anosSeguintes: AnoSeguinteDados[]
  ano: number
  abertos: Set<string>
  expansiveis: Set<string>
  toggleAberto: (chave: string) => void
  bordaBaseHeader: string
  minWidth: number
}

/** Tabela completa da visão CONSOLIDADO (Refino 13) — mesma <table> que a Mensal
 *  substitui por inteiro (não é uma variação de props da mesma table: o conjunto de
 *  colunas é outro). Cabeçalho de 2 linhas: 1ª linha agrupa "«anoAnterior» × «ano» ·
 *  realizado e previsto" sobre as 5 primeiras colunas (ano anterior, os 2 YTD, Δ%,
 *  PREV) e "Total" sobre o resto (VENCIDOS, TOTAL «AAAA», anos seguintes); 2ª linha
 *  tem os rótulos de cada coluna. Sem toggles de Previsto/anos-seguintes (fixos,
 *  sempre visíveis) — só a Conta é expansível, igual à visão Mensal. */
function TabelaConsolidada({
  linhas, bandeja, relacao, mesCorrente, totalModo, consolidado, anosSeguintes, ano,
  abertos, expansiveis, toggleAberto, bordaBaseHeader, minWidth,
}: TabelaConsolidadaProps) {
  const totalColunas = 1 + 5 + 2 + anosSeguintes.length // Conta + grupo-comparação + (Vencidos+Total) + anos seguintes
  const th2 = (extra: string) =>
    `h-[25px] px-3.5 text-right text-[10px] font-semibold uppercase tracking-[0.09em] ${extra} ${bordaBaseHeader}`
  const tituloTotal = totalModo === 'tudo'
    ? 'Modo ativo: Realizado + previsto — soma do ano inteiro (meses fechados + a projeção dos meses restantes)'
    : 'Modo ativo: Realizado — soma só do que já aconteceu (exclui o previsto do mês corrente e os meses futuros)'

  return (
    <table className="w-full border-separate border-spacing-0 text-[13px]" style={{ minWidth }}>
      <thead className="sticky top-0 z-20 [&_th]:bg-band">
        <tr>
          <ThConta bordaBaseHeader={bordaBaseHeader} />
          <th
            colSpan={5}
            title={`Comparativo ${consolidado.anoAnterior} × ${ano} — mesma janela (YTD) dos dois lados`}
            className="whitespace-nowrap px-3.5 py-1.5 text-right text-[10px] font-semibold uppercase tracking-[0.09em] text-text-secondary"
          >
            {consolidado.anoAnterior} × {ano} · realizado e previsto
          </th>
          <th
            colSpan={2 + anosSeguintes.length}
            className="whitespace-nowrap px-3.5 py-1.5 text-right text-[10px] font-semibold uppercase tracking-[0.09em] text-text-secondary"
          >
            Total
          </th>
        </tr>
        <tr>
          <th className={th2('text-text-secondary')}>{consolidado.anoAnterior} (ano)</th>
          <th className={th2('text-text-secondary')}>YTD {anoCurto(consolidado.anoAnterior)}</th>
          <th className={th2('text-text-secondary')}>YTD {anoCurto(ano)}</th>
          <th className={th2('text-text-secondary')}>Δ% {anoCurto(ano)}v{anoCurto(consolidado.anoAnterior)}</th>
          <th
            title="Previsto do ano exibido — total do ano menos o já realizado (YTD)"
            className={th2('border-l-2 border-l-wt-border-strong text-warning-deep')}
          >
            PREV {anoCurto(ano)}
          </th>
          <th title="Vencido em aberto, ainda não liquidado" className={th2('text-warning-deep')}>
            VENCIDOS
          </th>
          <th title={tituloTotal} className={th2('border-l border-l-wt-border-strong text-text-secondary')}>
            TOTAL {ano}
          </th>
          {anosSeguintes.map((a, idx) => (
            <th
              key={`cons-ano-th-${a.ano}`}
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
                relacao={relacao}
                mesCorrente={mesCorrente}
                totalModo={totalModo}
                consolidado={consolidado}
                anosSeguintes={anosSeguintes}
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
              relacao={relacao}
              mesCorrente={mesCorrente}
              totalModo={totalModo}
              consolidado={consolidado}
              anosSeguintes={anosSeguintes}
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
                relacao={relacao}
                mesCorrente={mesCorrente}
                consolidado={consolidado}
                anosSeguintes={anosSeguintes}
              />
            ))}
          </>
        )}
      </tbody>
    </table>
  )
}

/** Ao abrir uma coluna recolhível (transição REAL false→true), rola a tabela
 *  horizontalmente até ela ficar visível (Refino 11). Compara `aberto` contra o valor
 *  ANTERIOR guardado numa ref (não um flag "já montou") — por isso é robusto ao
 *  duplo-invoke de efeitos do StrictMode em dev: a 2ª invocação do MESMO mount vê a ref
 *  já atualizada pela 1ª e não repete o scroll; e não dispara indevidamente quando o
 *  estado nasce `true` (caso do `previstoAberto`, default aberto). `block: 'nearest'` é
 *  OBRIGATÓRIO — sem ele, o scroll vertical da página salta junto com o horizontal.
 *  Respeita `prefers-reduced-motion`.
 *
 *  ⚠️ REDE CONTRA O NO-OP SILENCIOSO DO `behavior: 'smooth'`: quando o scroll suave está
 *  DESLIGADO no navegador (flag `Smooth Scrolling` do Chrome desativada, alguns modos de
 *  automação/acessibilidade), `scrollIntoView({behavior:'smooth'})` **não rola nada** — não
 *  cai para instantâneo, simplesmente não acontece, sem erro. A coluna revelada some do
 *  campo de visão e o refino parece não existir. Por isso guardamos a posição do container
 *  antes e, se ~150ms depois nada se moveu, refazemos o scroll em `'auto'`. (Provado ao vivo
 *  na v5.3.0: `scrollTo({behavior:'smooth'})` era no-op page-wide, `scrollLeft = n` funcionava.)
 *
 *  Efeito de DOM puro (nunca `setState` dentro do efeito) — permitido pelo ruleset do
 *  React Compiler. */
function useScrollAoAbrir(aberto: boolean, ref: RefObject<HTMLTableCellElement | null>): void {
  const anteriorRef = useRef(aberto)
  useEffect(() => {
    const jaEstavaAberto = anteriorRef.current
    anteriorRef.current = aberto
    if (!aberto || jaEstavaAberto) return
    const alvo = ref.current
    if (!alvo) return

    const opcoes: ScrollIntoViewOptions = { inline: 'start', block: 'nearest' }
    const reduzido = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduzido) {
      alvo.scrollIntoView({ ...opcoes, behavior: 'auto' })
      return
    }

    // Container rolável na horizontal (o viewport do <ScrollAutoHide>) — só para
    // MEDIR se o scroll suave pegou; não é ele que rolamos.
    let container: HTMLElement | null = alvo.parentElement
    while (container && !(container.scrollWidth > container.clientWidth &&
                          /auto|scroll/.test(getComputedStyle(container).overflowX))) {
      container = container.parentElement
    }

    const antes = container?.scrollLeft
    alvo.scrollIntoView({ ...opcoes, behavior: 'smooth' })
    if (!container || antes === undefined) return

    const t = window.setTimeout(() => {
      if (container.scrollLeft === antes) alvo.scrollIntoView({ ...opcoes, behavior: 'auto' })
    }, 150)
    return () => window.clearTimeout(t)
  }, [aberto, ref])
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
  /** Base da visão Consolidado (Refino 13) — `null` quando a RPC do ano anterior
   *  falhou (a pill "Consolidado" fica desabilitada; ver bullet "DUAS VISÕES" no
   *  topo do arquivo). */
  consolidado: ConsolidadoDados | null
  /** Ação injetada pela página (ex.: botão "Editar estrutura") — renderizada no
   *  RODAPÉ do card, à direita (Refino 4). */
  slotAcoes?: ReactNode
}

export default function TabelaDre({ dados, ano, anosDisponiveis, anosSeguintes, consolidado, slotAcoes }: TabelaDreProps) {
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

  // Refino 11 — refs das 1ª colunas de cada grupo recolhível (Mensal). Hooks SEMPRE
  // chamados (mesmo quando a visão/relação atual não os usa) — regra dos hooks.
  const refPrevisto = useRef<HTMLTableCellElement | null>(null)
  const refAnoSeguinte = useRef<HTMLTableCellElement | null>(null)
  useScrollAoAbrir(previstoAberto, refPrevisto)
  useScrollAoAbrir(anosAbertos, refAnoSeguinte)

  // Se o ano anterior não pôde ser buscado (`consolidado === null`), a visão
  // Consolidado nunca é alcançável — a pill fica `disabled` — mas trata-se também
  // defensivamente aqui: se `visao` ainda estiver 'consolidado' de uma seleção de ano
  // anterior (onde `consolidado` existia) e o novo ano não tiver comparativo, cai
  // para 'mensal' sozinho, sem exigir um clique do usuário.
  const visaoEfetiva: Visao = visao === 'consolidado' && consolidado === null ? 'mensal' : visao

  function trocarAno(a: number) {
    if (a === ano) return
    const params = new URLSearchParams(searchParams.toString())
    params.set('ano', String(a))
    // scroll:false — trocar o ano não deve rolar a página ao topo (mesmo racional
    // do PeriodoFilterPillsUrl da Composição, na mesma página).
    startTransition(() => router.push(`${pathname}?${params.toString()}`, { scroll: false }))
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
          <AnoPills ano={ano} anosDisponiveis={anosDisponiveis} onSelect={trocarAno} />
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

  const corteIdx: number | null = relacao === 'corrente' && mesCorrente != null ? mesCorrente : null
  const colapsar = relacao === 'corrente' && !previstoAberto

  // Refino 12/item 6 — no modo 'realizado', a coluna "«Mês»·P" do mês corrente some
  // (cabeçalho, células e bandeja); no 'tudo' ela existe como sempre existiu.
  const incluirPrevCorrente = totalModo === 'tudo'
  // Só há coluna de Previsto no cabeçalho quando sobra ao menos 1 mês futuro OU a
  // coluna ·P existe — em 'realizado' com mesCorrente=Dez (nada mais a projetar), o
  // grupo "Previsto" inteiro desaparece do cabeçalho (ver uso abaixo).
  const temColunaPrevisto = incluirPrevCorrente || (mesCorrente != null && mesCorrente < 12)

  const mesesVisiveis: string[] =
    relacao === 'corrente' && mesCorrente != null
      ? rotulosVisiveis(labelsCorrente(mesCorrente, incluirPrevCorrente), colapsar, idxPrevisto)
      : MESES

  const totalColunas = 1 + mesesVisiveis.length + 1 + (anosAbertos ? anosSeguintes.length : 0)
  // Conta + meses (visíveis) + Total do ano + anos seguintes (quando abertos, Refino 7)

  // Centavos (formato contábil, 2 casas) alargam cada coluna mensal — a base (1420/1860)
  // é a mesma de antes do refino. Cada coluna de "ano seguinte" ABERTA (Refino 7) soma
  // ~150px: a largura passa a depender de `anosAbertos`, então uma classe `min-w-[...]`
  // fixa não serve mais — `style` com um NÚMERO é mais honesto que uma classe por
  // combinação possível. Quando a coluna ·P some (Refino 12, 'realizado' + 'corrente'
  // COM o previsto expandido), há 1 coluna a menos que o caso 'tudo' — desconta
  // ~1 coluna (105px, a mesma largura média usada para calibrar 1860); RECOLHIDO
  // (`colapsar`) os dois modos convergem para a MESMA contagem de colunas (o previsto
  // inteiro vira 1 coluna agregada em ambos), então 1420 não muda com o modo.
  const semColunaPrevCorrente = relacao === 'corrente' && mesCorrente != null && !incluirPrevCorrente
  const minWTotal =
    (colapsar ? 1420 : (semColunaPrevCorrente ? 1755 : 1860)) +
    (anosAbertos ? anosSeguintes.length * 150 : 0)

  // Visão Consolidado (Refino 13) — menos colunas que a Mensal (7 fixas + Conta, sem
  // os toggles); cada ano seguinte soma o mesmo ~150px de sempre.
  const minWTotalConsolidado = 1250 + anosSeguintes.length * 150

  const tituloTotalAno = totalModo === 'tudo'
    ? 'Modo ativo: Realizado + previsto — soma do ano inteiro (meses fechados + a projeção dos meses restantes)'
    : 'Modo ativo: Realizado — soma só do que já aconteceu (exclui o previsto do mês corrente e os meses futuros)'

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

  return (
    <div className="rounded-xl bg-surface p-5 shadow-sm">
      <h2 className="mb-4 text-[15px] font-semibold text-text-primary">Demonstrativo de Resultado por Fluxo de Caixa</h2>

      {/* ── Toolbar ── */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <AnoPills ano={ano} anosDisponiveis={anosDisponiveis} onSelect={trocarAno} />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-text-muted">Visão:</span>
            <button
              type="button"
              onClick={() => setVisao('mensal')}
              className={['foco-neutro', PILL_FILTRO, visaoEfetiva === 'mensal' ? '' : PILL_FILTRO_INATIVO].join(' ')}
              style={visaoEfetiva === 'mensal' ? PILL_FILTRO_ATIVO_STYLE : undefined}
            >
              Mensal
            </button>
            <button
              type="button"
              onClick={() => setVisao('consolidado')}
              disabled={consolidado === null}
              title={consolidado === null ? 'Comparativo indisponível — não foi possível carregar o ano anterior' : undefined}
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
          {/* "Total do ano" só existe na visão Mensal: no Consolidado o realizado (YTD), o
              previsto (PREV) e a soma (TOTAL) já são COLUNAS separadas, então o modo não teria
              o que alternar — deixar as pills à mostra ali seria um controle inerte. O estado
              `totalModo` é preservado (não resetado) para a volta à Mensal. */}
          {visaoEfetiva === 'mensal' && (
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-text-muted">Total do ano:</span>
            <button
              type="button"
              onClick={() => setTotalModo('realizado')}
              className={['foco-neutro', PILL_FILTRO, totalModo === 'realizado' ? '' : PILL_FILTRO_INATIVO].join(' ')}
              style={totalModo === 'realizado' ? PILL_FILTRO_ATIVO_STYLE : undefined}
            >
              Realizado
            </button>
            <button
              type="button"
              onClick={() => setTotalModo('tudo')}
              className={['foco-neutro', PILL_FILTRO, totalModo === 'tudo' ? '' : PILL_FILTRO_INATIVO].join(' ')}
              style={totalModo === 'tudo' ? PILL_FILTRO_ATIVO_STYLE : undefined}
            >
              Realizado + previsto
            </button>
          </div>
          )}
          <Button variant="ghost" size="sm" onClick={expandirTudo}>Expandir tudo</Button>
          <Button variant="ghost" size="sm" onClick={recolherTudo}>Recolher tudo</Button>
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
          {visaoEfetiva === 'consolidado' && consolidado ? (
            <TabelaConsolidada
              linhas={linhas}
              bandeja={bandeja}
              relacao={relacao}
              mesCorrente={mesCorrente}
              totalModo={totalModo}
              consolidado={consolidado}
              anosSeguintes={anosSeguintes}
              ano={ano}
              abertos={abertos}
              expansiveis={expansiveis}
              toggleAberto={toggleAberto}
              bordaBaseHeader={bordaBaseHeader}
              minWidth={minWTotalConsolidado}
            />
          ) : (
          <table
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
                        colSpan={colapsar ? 1 : (incluirPrevCorrente ? 13 - mesCorrente : 12 - mesCorrente) /* 12 meses (+1 col. extra do híbrido, só no modo 'tudo') */}
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
                ) : (
                  <th
                    title="Previsto por vencimento"
                    className="whitespace-nowrap px-3.5 py-1.5 text-right text-[10px] font-semibold uppercase tracking-[0.09em] text-warning-deep"
                    colSpan={12}
                  >
                    Previsto
                  </th>
                )}

                {/* Refino 9 — a seta de anos seguintes agora é ABSOLUTA, ancorada na
                    faixa exata da 1ª linha (`h-[27px]`, mesma altura da "Previsto"
                    acima), alinhada com ela. O texto "Total do ano" segue embaixo,
                    `align-bottom`, como sempre — por isso a `th` precisa de `relative`. */}
                <th
                  rowSpan={2}
                  className={`relative w-[170px] min-w-[170px] border-l border-l-wt-border-strong px-3.5 align-bottom pb-[7px] text-right text-[10px] font-semibold uppercase tracking-[0.09em] text-text-secondary ${bordaBaseHeader}`}
                  title={tituloTotalAno}
                >
                  {anosSeguintes.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setAnosAbertos(v => !v)}
                      aria-expanded={anosAbertos}
                      aria-label="Expandir/Recolher anos seguintes"
                      className="foco-neutro absolute right-3.5 top-0 flex h-[27px] items-center justify-center rounded p-0.5 text-text-secondary transition-colors hover:bg-zinc-100 hover:text-text-primary"
                    >
                      {anosAbertos ? <ChevronsLeft size={13} /> : <ChevronsRight size={13} />}
                    </button>
                  )}
                  Total do ano
                </th>

                {anosAbertos && anosSeguintes.length > 0 && (
                  <th colSpan={anosSeguintes.length} aria-hidden="true" className="border-l border-l-wt-border-strong" />
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
                {anosAbertos && anosSeguintes.map((a, idx) => (
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
                      colapsar={colapsar}
                      expansivel={false}
                      aberto={false}
                      totalModo={totalModo}
                      anosSeguintes={anosSeguintes}
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
                    colapsar={colapsar}
                    expansivel={expansivel}
                    aberto={aberto}
                    onToggle={onToggle}
                    totalModo={totalModo}
                    anosSeguintes={anosSeguintes}
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
                      colapsar={colapsar}
                      totalModo={totalModo}
                      anosSeguintes={anosSeguintes}
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
