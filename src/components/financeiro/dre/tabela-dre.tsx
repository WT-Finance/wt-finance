'use client'

// ── Tabela hierárquica da DRE por Fluxo de Caixa (v5.3.0 · M4) ──────────────────
// Tabela DE PRODUÇÃO, data-driven por props — lê a estrutura viva + o fato real via
// `get_dre_mensal` (a página busca a RPC e injeta `dados`/`ano`/`anosDisponiveis`).
// Sucede o mockup de fixture da M0 (tabela-dre-mockup.tsx + mockup-dados.ts, agora
// removidos deste caminho); o VISUAL/INTERAÇÃO gateados pelo Yan na M0 são
// preservados byte-a-byte — só a FONTE dos dados e as colunas (dinâmicas por ano)
// mudaram.
//
// Estrutura do payload (ver @/lib/dre/schemas): `linhas` vem FLAT na ordem do
// demonstrativo — blocos (`t:'blocoH'|'sub'|'tot'`, com `chave`) seguidos das suas
// categorias (`t:'cat'`, com `g` apontando para a `chave` do pai). Linha expansível
// (chevron) = tem `chave` E existe ao menos uma `cat` cujo `g` aponte para ela —
// derivado em `expansiveis` (Set), não mais uma lista fixa de fixture.
//
// TRÊS RELAÇÕES (`dados.relacao`) — as colunas mudam de forma:
//  · 'corrente' — mês corrente HÍBRIDO: meses 1..mes_corrente são REALIZADO (o do mês
//    corrente rotulado "«Mês»·R"), + 1 coluna extra "«Mês»·P" (= `prev_corrente`,
//    fundo âmbar, corte à esquerda), + meses mes_corrente+1..12 PREVISTO. 13 colunas.
//    O previsto (da coluna ·P até Dez) é RECOLHÍVEL (toggle no cabeçalho, soma numa
//    única coluna "«Mês»·P–Dez") — só nesta relação.
//  · 'fechado' — ano fechado: 12 colunas, tudo REALIZADO, sem corte/âmbar.
//  · 'futuro'  — ano ainda não iniciado: 12 colunas, tudo PREVISTO (âmbar), sem corte.
// `idxPrevisto`/`corteIdx` concentram essa diferença por ÍNDICE de coluna; o resto
// (CelulaValor, cabeçalho da 2ª linha) é um ÚNICO trecho genérico para as 3 relações.
//
// FAIL-SAFE: `dados === null` (RPC falhou ou o shape divergiu — `parseRpc` já logou
// no servidor) renderiza o card e a toolbar de ANO — que CONTINUA funcional, trocar
// de ano é a forma natural de tentar de novo — com um aviso discreto no lugar da
// tabela. A página nunca quebra.
//
// FILTROS — os dois NÃO são simétricos, de propósito:
//  · BUSCA é consulta explícita por nome: auto-expande (ignora `abertos`) e ESCONDE os
//    blocos sem nenhum achado — quem procura "aluguel" quer ver só onde ele mora.
//  · "Esconder zerados" é redução de RUÍDO: mexe só nas categorias. Blocos/sub/
//    totalizadores permanecem, porque são a ESTRUTURA do demonstrativo — fazer uma
//    linha oficial da DRE desaparecer por um filtro de ruído confundiria mais do que
//    ajudaria ("onde foi o IMOB?").
//
// ⚠️ ARMADILHA DO CABEÇALHO DE 2 LINHAS: as `th` com `rowSpan={2}` (Conta / Total do
// ano) existem SÓ na 1ª <tr> — um seletor CSS do tipo "última linha do thead" nunca as
// alcança. Por isso a régua de base (`border-b-[1.5px] border-b-wt-border-strong`) e a
// sombra-ao-rolar são aplicadas DIRETAMENTE nessas duas células, além da 2ª linha (não
// via um seletor genérico). (Achado ALTO do revisor na v5.3.0/M0 — o padrão do DS
// pressupõe cabeçalho de 1 linha.)
//
// ANO por URL: as pills vivem aqui e navegam via `router.push` (preserva os demais
// params da URL, ex.: o período da Composição), com `startTransition` — o indicador
// de carregamento é a opacidade sutil na CAIXA da tabela (`isPending`), não nas
// pills (padrão v4.39).

import { useState, useTransition, type ReactNode } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import Button from '@/components/ui/button'
import Checkbox from '@/components/ui/checkbox'
import { Input } from '@/components/ui/field'
import ScrollAutoHide from '@/components/shared/scroll-auto-hide'
import { PILL_FILTRO, PILL_FILTRO_INATIVO, PILL_FILTRO_ATIVO_STYLE } from '@/components/shared/botoes'
import { fmtContabil } from './fmt-contabil'
import type { DreMensal, DreLinha, DreBandeja } from '@/lib/dre/schemas'

type Relacao   = DreMensal['relacao']
type TipoLinha = DreLinha['t']

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

function soma(valores: number[]): number {
  return valores.reduce((acc, v) => acc + v, 0)
}

/** Monta as colunas mensais de EXIBIÇÃO a partir do payload cru: em 'fechado'/'futuro'
 *  os 12 `meses` bastam; em 'corrente', insere `prev_corrente` logo após o mês corrente
 *  (a 2ª coluna do mês híbrido) — 12+1 = 13 colunas. `mesCorrente` é 1-based; os meses
 *  ANTES-E-INCLUINDO ele (índices 0..mesCorrente-1) são realizado, os DEPOIS
 *  (mesCorrente..11) já vêm previsto do payload. */
function construirValores(
  meses: number[],
  prevCorrente: number | null | undefined,
  relacao: Relacao,
  mesCorrente: number | null,
): number[] {
  if (relacao === 'corrente' && mesCorrente != null) {
    return [...meses.slice(0, mesCorrente), prevCorrente ?? 0, ...meses.slice(mesCorrente)]
  }
  return meses
}

/** Soma as colunas a partir de `idxPrevisto` numa ÚNICA coluna agregada quando
 *  `colapsar` é true (só 'corrente' com o previsto recolhido); nos demais casos
 *  devolve os valores como estão. O índice do corte não muda entre os dois estados —
 *  a coluna agregada ocupa o MESMO índice — então `previsto`/`corte` (calculados por
 *  índice em `LinhaDreTr`/`LinhaBandejaTr`) não precisam de ramo extra. */
function colunasVisiveis(valores: number[], colapsar: boolean, idxPrevisto: number): number[] {
  if (!colapsar) return valores
  return [...valores.slice(0, idxPrevisto), soma(valores.slice(idxPrevisto))]
}

/** Rótulos das 13 colunas de 'corrente': meses antes do corrente + "«Mês»·R" (o
 *  próprio mês corrente, realizado) + "«Mês»·P" (mesma competência, previsto) + os
 *  meses restantes. Sempre 13 rótulos, qualquer que seja `mesCorrente` (1..12). */
function labelsCorrente(mesCorrente: number): string[] {
  const atual = MESES[mesCorrente - 1]
  return [...MESES.slice(0, mesCorrente - 1), `${atual}·R`, `${atual}·P`, ...MESES.slice(mesCorrente)]
}

/** Mesmo colapso de `colunasVisiveis`, para os RÓTULOS (2ª linha do cabeçalho). */
function rotulosVisiveis(labels: string[], colapsar: boolean, idxPrevisto: number, mesCorrente: number): string[] {
  if (!colapsar) return labels
  const atual = MESES[mesCorrente - 1]
  return [...labels.slice(0, idxPrevisto), `${atual}·P–Dez`]
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
  /** peso/tamanho do valor numérico (SEM cor — a cor é resolvida por SINAL, ver CelulaValor). */
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

/** Célula de valor mensal ou do total do ano. Cor por SINAL em toda linha (não-zero):
 *  `cat` (fundo claro) usa os tons base; `blocoH`/`sub` (bandas cinza CLARAS) usam `*-deep`
 *  (base dá 3,88–4,31:1 sobre as bandas — reprova AA; deep dá 7–10:1); `tot` (banda ESCURA)
 *  usa os tons `*-soft` COMO TINTA (6,5:1 sobre --action-primary; 4,6:1 sobre a variante
 *  âmbar-escura — medido). Zero sempre em travessão discreto. Positivo/zero reservam a
 *  largura do ")" (span invisível) para a coluna não desalinhar.
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

function CelulaValor({ valor, tipo, previsto, corte, totalAno = false, peso, bg, bgHover, borda }: CelulaValorProps) {
  const zero = Math.abs(valor) < 0.005
  const negativo = !zero && valor < 0
  const escuro = tipo === 'tot'
  const bandaClara = tipo === 'blocoH' || tipo === 'sub'
  const cor = zero
    ? 'text-text-subtle'
    : negativo
      ? (escuro ? 'text-negative-soft' : bandaClara ? 'text-negative-deep' : 'text-negative')
      : (escuro ? 'text-positive-soft' : bandaClara ? 'text-positive-deep' : 'text-positive')
  const fundo = previsto ? BG_PREVISTO[tipo] : `${bg} ${bgHover}`
  const bordaCorte = corte ? 'border-l-2 border-l-wt-border-strong' : ''
  const bordaTotal = totalAno ? `border-l border-l-wt-border-strong ${peso === '' ? 'font-medium' : ''}` : ''
  return (
    <td className={`h-8 px-[9px] text-right tabular-nums whitespace-nowrap ${fundo} ${borda} ${bordaCorte} ${bordaTotal} ${peso} ${cor}`}>
      {fmtContabil(valor)}
      {!negativo && <span className="invisible">)</span>}
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
    <td className={`sticky left-0 z-10 h-8 w-[330px] min-w-[330px] max-w-[330px] border-r border-r-wt-border-strong pr-2 ${bg} ${bgHover} ${indent} ${borda}`}>
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
}

/** Uma linha completa da tabela (blocoH/sub/cat/tot): Conta + meses (ou a versão recolhida
 *  do previsto) + total do ano. O "Total do ano" é sempre o `total` do PAYLOAD (a RPC já
 *  soma Σ meses + prev_corrente) — nunca recomputado aqui; o recolhimento (`colapsar`) é
 *  só de EXIBIÇÃO das colunas mensais. */
function LinhaDreTr({ linha, relacao, mesCorrente, idxPrevisto, corteIdx, colapsar, expansivel, aberto, onToggle }: LinhaDreTrProps) {
  const estilo = estiloLinha(linha.t)
  const valoresBase = construirValores(linha.meses, linha.prev_corrente, relacao, mesCorrente)
  const valores = colunasVisiveis(valoresBase, colapsar, idxPrevisto)
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
        valor={linha.total}
        tipo={linha.t}
        previsto={false}
        corte={false}
        totalAno
        peso={estilo.peso}
        bg={estilo.bg}
        bgHover={estilo.bgHover}
        borda={estilo.borda}
      />
    </tr>
  )
}

/** Célula de valor da bandeja "Não classificadas" — mesma lógica de parênteses/zero, sem
 *  cor por sinal (a bandeja é órfã do de-para, fora da hierarquia — mantém o neutro), fundo
 *  âmbar (a categoria pode cair em qualquer mês, inclusive previsto). */
function CelulaValorBandeja({ valor, corte, totalAno = false }: { valor: number; corte: boolean; totalAno?: boolean }) {
  const zero = Math.abs(valor) < 0.005
  const negativo = !zero && valor < 0
  const cor = zero ? 'text-text-subtle' : 'text-text-secondary'
  const bordaCorte = corte ? 'border-l-2 border-l-wt-border-strong' : ''
  const bordaTotal = totalAno ? 'border-l border-l-wt-border-strong font-medium' : ''
  return (
    <td className={`h-8 px-[9px] text-right tabular-nums whitespace-nowrap bg-warning-bg group-hover:bg-neutral-soft ${cor} ${bordaCorte} ${bordaTotal}`}>
      {fmtContabil(valor)}
      {!negativo && <span className="invisible">)</span>}
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
}

/** Linha de categoria órfã da bandeja "Não classificadas" (sempre visível — não entra
 *  no sistema de busca/zerados/abertos, que é só para a hierarquia real). Acompanha o
 *  recolhimento do previsto como qualquer outra linha. O `title` aponta a origem real
 *  no Monde (o dado É real desde a M4 — nada de "valores ilustrativos"). */
function LinhaBandejaTr({ linha, relacao, mesCorrente, idxPrevisto, corteIdx, colapsar }: LinhaBandejaTrProps) {
  const valoresBase = construirValores(linha.meses, linha.prev_corrente, relacao, mesCorrente)
  const valores = colunasVisiveis(valoresBase, colapsar, idxPrevisto)
  return (
    <tr className="group">
      {/* fundo OPACO (não `/40`): célula sticky translúcida deixa os valores das colunas
          passarem por baixo do rótulo no scroll horizontal. O hover usa --neutral-soft,
          o âmbar um passo mais saturado do DS. */}
      <td
        className="sticky left-0 z-10 h-8 w-[330px] min-w-[330px] max-w-[330px] border-r border-r-wt-border-strong border-l-[3px] border-l-warning bg-warning-bg pl-[26px] pr-3 group-hover:bg-neutral-soft"
        title={`Grupo no Monde: ${linha.grupo_monde}`}
      >
        <span className="truncate text-[13px] text-text-secondary">{linha.rotulo}</span>
      </td>
      {valores.map((v, idx) => (
        <CelulaValorBandeja key={idx} valor={v} corte={corteIdx !== null && idx === corteIdx} />
      ))}
      <CelulaValorBandeja valor={linha.total} corte={false} totalAno />
    </tr>
  )
}

/** Só as pills — o container/flex fica no chamador (a nota do período e o
 *  isPending-opacity vivem em contextos diferentes na toolbar normal × fail-safe). */
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

interface TabelaDreProps {
  /** Payload de `get_dre_mensal` já validado pelo `parseRpc` — `null` quando a RPC
   *  falhou ou o shape divergiu (a página nunca quebra; ver FAIL-SAFE no topo). */
  dados: DreMensal | null
  /** Ano resolvido pela página (clampado à janela [corrente-2, corrente]) — fonte
   *  única para destacar a pill ativa (não lê `dados.ano`, que pode ser `null`). */
  ano: number
  anosDisponiveis: number[]
  /** Ação injetada pela página (ex.: botão "Editar estrutura") — renderizada na toolbar,
   *  à direita, antes de "Expandir tudo". */
  slotAcoes?: ReactNode
}

export default function TabelaDre({ dados, ano, anosDisponiveis, slotAcoes }: TabelaDreProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const [abertos, setAbertos] = useState<Set<string>>(() => new Set())
  const [rolado, setRolado] = useState(false)
  const [busca, setBusca] = useState('')
  const [esconderZerados, setEsconderZerados] = useState(false)
  const [previstoAberto, setPrevistoAberto] = useState(true)

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
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <AnoPills ano={ano} anosDisponiveis={anosDisponiveis} onSelect={trocarAno} />
          </div>
          {slotAcoes}
        </div>
        <div className={`rounded-lg border border-wt-border p-6 text-center ${isPending ? 'opacity-60' : ''}`}>
          <p className="text-sm text-text-muted">Não foi possível carregar a DRE — tente recarregar.</p>
        </div>
      </div>
    )
  }

  const { relacao, mes_corrente: mesCorrente, hoje, linhas, bandeja } = dados

  // 'AAAA-MM-DD' → 'DD/MM/AAAA' — date PURO (sem fuso, sem hora): split/reverse é
  // seguro aqui (diferente de timestamptz, que exige Intl+timeZone — ver CLAUDE.md).
  const hojeFmt = hoje.split('-').reverse().join('/')
  const hojeCurta = hojeFmt.slice(0, 5) // 'DD/MM'

  const idxPrevisto =
    relacao === 'corrente' ? (mesCorrente ?? Number.POSITIVE_INFINITY) :
    relacao === 'futuro'   ? 0 :
    Number.POSITIVE_INFINITY // 'fechado'

  const corteIdx: number | null = relacao === 'corrente' && mesCorrente != null ? mesCorrente : null
  const colapsar = relacao === 'corrente' && !previstoAberto

  const mesesVisiveis: string[] =
    relacao === 'corrente' && mesCorrente != null
      ? rotulosVisiveis(labelsCorrente(mesCorrente), colapsar, idxPrevisto, mesCorrente)
      : MESES

  const totalColunas = 1 + mesesVisiveis.length + 1 // Conta + meses (visíveis) + Total do ano
  const minW = colapsar ? 'min-w-[1180px]' : 'min-w-[1480px]'

  const nota =
    relacao === 'corrente' ? `base ${hojeFmt}` :
    relacao === 'fechado'  ? 'ano fechado — tudo realizado' :
                              'tudo previsto (por vencimento)'

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
  const recolherTudo = () => { setAbertos(new Set()); setBusca('') }

  // ── Visibilidade: busca (auto-expande, ignora abertos) × zerados × abertos ──
  const termo = normalizar(busca.trim())
  const filtroAtivo = termo !== '' || esconderZerados
  const achadosPorBloco = new Map<string, number>()
  const catVisivel = new Map<number, boolean>()

  linhas.forEach((l, i) => {
    if (l.t !== 'cat' || l.g == null) return
    const casa = termo === '' || normalizar(l.rotulo).includes(termo)
    const zeroOk = !esconderZerados || Math.abs(l.total) >= 0.005
    const visivel = casa && zeroOk && (termo !== '' || abertos.has(l.g))
    catVisivel.set(i, visivel)
    if (casa && zeroOk) achadosPorBloco.set(l.g, (achadosPorBloco.get(l.g) ?? 0) + 1)
  })

  // Só a BUSCA esconde bloco (ver nota de FILTROS no topo): "esconder zerados" não mexe na
  // estrutura do demonstrativo — de propósito, não por esquecimento.
  const blocoVisivel = (l: DreLinha): boolean => {
    if (l.t !== 'blocoH' && l.t !== 'sub') return true
    if (l.chave == null || !expansiveis.has(l.chave)) return true
    if (termo === '') return true
    return (achadosPorBloco.get(l.chave) ?? 0) > 0
  }

  const contagemPorTipo = linhas.reduce<Record<TipoLinha, number>>((acc, l) => {
    acc[l.t] += 1
    return acc
  }, { blocoH: 0, sub: 0, cat: 0, tot: 0 })

  // Contagem do rodapé (só com filtro ativo): categorias que PASSAM no filtro — não as
  // "visíveis" (que dependem de bloco aberto e fariam "0 de 130" com tudo recolhido).
  const nCatsVisiveis = [...achadosPorBloco.values()].reduce((a, n) => a + n, 0)

  return (
    <div className="rounded-xl bg-surface p-5 shadow-sm">
      {/* ── Toolbar ── */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <AnoPills ano={ano} anosDisponiveis={anosDisponiveis} onSelect={trocarAno} />
          <span className="ml-1 text-[11px] text-text-muted">{nota}</span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label htmlFor="dre-busca" className="sr-only">Buscar categoria</label>
            <Input
              id="dre-busca"
              type="search"
              variant="compacto"
              placeholder="ex.: aluguel, comissão…"
              value={busca}
              onChange={e => setBusca(e.target.value)}
              className="w-56"
            />
          </div>
          <div className="flex items-center gap-1.5">
            {/* sem `aria-label`: o <label htmlFor> ao lado já nomeia o campo (e teria
                precedência sobre ele no cálculo do nome acessível). */}
            <Checkbox id="dre-zero" checked={esconderZerados} onChange={setEsconderZerados} />
            <label htmlFor="dre-zero" className="cursor-pointer select-none text-[12px] text-text-secondary">
              Esconder linhas zeradas
            </label>
          </div>
          {slotAcoes}
          <Button variant="ghost" size="sm" onClick={expandirTudo}>Expandir tudo</Button>
          <Button variant="ghost" size="sm" onClick={recolherTudo}>Recolher tudo</Button>
        </div>
      </div>

      {/* ── Box da tabela — borda própria dentro do card, cantos clipam o cabeçalho sticky ── */}
      <div
        className={`overflow-hidden rounded-lg border border-wt-border transition-opacity ${isPending ? 'opacity-60' : ''}`}
        aria-busy={isPending}
      >
        {/* Box maior (80vh) + gutter interno `pr/pb` nos LIMITES do scroll: nos extremos,
            o thumb do ScrollAutoHide flutua sobre o gutter vazio em vez de cobrir a
            última coluna/linha — o mesmo respiro que a sidebar tem via padding do nav. */}
        <ScrollAutoHide eixo="both" className="max-h-[80vh] pr-1.5 pb-1.5" onScroll={e => setRolado(e.currentTarget.scrollTop > 0)}>
          <table className={`w-full ${minW} border-separate border-spacing-0 text-[13px]`}>
            <thead className="sticky top-0 z-20 [&_th]:bg-band">
              <tr>
                <th
                  rowSpan={2}
                  className={`sticky left-0 z-30 w-[330px] min-w-[330px] max-w-[330px] border-r border-r-wt-border-strong pl-3 pr-3 text-left text-[10px] font-semibold uppercase tracking-[0.09em] text-text-secondary ${bordaBaseHeader}`}
                >
                  Conta
                </th>

                {relacao === 'corrente' && mesCorrente != null ? (
                  <>
                    {/* Rótulos enxutos: só "Realizado" / "Previsto" — a semântica completa
                        (movimentação × vencimento, corte na data-base) fica no `title`. */}
                    <th
                      title="Realizado por data de movimentação"
                      className="whitespace-nowrap px-[9px] py-1.5 text-right text-[10px] font-semibold uppercase tracking-[0.09em] text-text-secondary"
                      colSpan={mesCorrente}
                    >
                      Realizado
                    </th>
                    <th
                      title={`Previsto por vencimento — corte na data-base ${hojeCurta}`}
                      className="whitespace-nowrap border-l-2 border-l-wt-border-strong px-[9px] py-1.5 text-right text-[10px] font-semibold uppercase tracking-[0.09em] text-warning-deep"
                      colSpan={colapsar ? 1 : 13 - mesCorrente /* 12 meses + 1 col. extra do híbrido = 13 sempre */}
                    >
                      <span className="flex w-full items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setPrevistoAberto(v => !v)}
                          aria-expanded={previstoAberto}
                          aria-label="Recolher/Expandir colunas de previsto"
                          className="foco-neutro inline-flex shrink-0 items-center justify-center rounded p-0.5 text-warning-deep transition-colors hover:bg-warning-bg"
                        >
                          {previstoAberto ? <ChevronsLeft size={13} /> : <ChevronsRight size={13} />}
                        </button>
                        <span>Previsto</span>
                      </span>
                    </th>
                  </>
                ) : relacao === 'fechado' ? (
                  <th
                    title="Ano fechado — tudo realizado (por data de movimentação)"
                    className="whitespace-nowrap px-[9px] py-1.5 text-right text-[10px] font-semibold uppercase tracking-[0.09em] text-text-secondary"
                    colSpan={12}
                  >
                    Realizado
                  </th>
                ) : (
                  <th
                    title="Previsto por vencimento"
                    className="whitespace-nowrap px-[9px] py-1.5 text-right text-[10px] font-semibold uppercase tracking-[0.09em] text-warning-deep"
                    colSpan={12}
                  >
                    Previsto
                  </th>
                )}

                <th
                  rowSpan={2}
                  className={`w-[140px] min-w-[140px] border-l border-l-wt-border-strong px-[9px] text-right text-[10px] font-semibold uppercase tracking-[0.09em] text-text-secondary ${bordaBaseHeader}`}
                >
                  Total do ano
                </th>
              </tr>
              <tr>
                {mesesVisiveis.map((m, i) => (
                  <th
                    key={m}
                    className={[
                      'h-[25px] px-[9px] text-right text-[10px] font-semibold uppercase tracking-[0.09em]',
                      i >= idxPrevisto ? 'text-warning-deep' : 'text-text-secondary',
                      corteIdx !== null && i === corteIdx ? 'border-l-2 border-l-wt-border-strong' : '',
                      bordaBaseHeader,
                    ].join(' ')}
                  >
                    {m}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {linhas.map((l, i) => {
                if (l.t === 'cat') {
                  if (catVisivel.get(i) !== true) return null
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
                    />
                  )
                }
                if (!blocoVisivel(l)) return null
                const chave = l.chave ?? null
                const expansivel = chave != null && expansiveis.has(chave)
                const aberto = termo !== '' || (chave != null && abertos.has(chave))
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
                  />
                )
              })}

              {/* Bandeja "Não classificadas" — categoria(s) órfã(s) do de-para (fora do
                  sistema de busca/zerados/abertos). Rótulo na célula STICKY (visível mesmo
                  com scroll horizontal); explicador na faixa restante. Some por completo
                  quando não há órfãs (nada a avisar). */}
              {bandeja.length > 0 && (
                <>
                  <tr>
                    <td className="sticky left-0 z-10 h-8 w-[330px] min-w-[330px] max-w-[330px] border-t-[1.5px] border-t-warning border-l-[3px] border-l-warning bg-warning-bg pl-3 pr-3 whitespace-nowrap">
                      <span className="text-[11.5px] font-semibold text-warning-deep">Não classificadas ({bandeja.length})</span>
                    </td>
                    <td className="border-t-[1.5px] border-t-warning bg-warning-bg px-[9px] text-[10.5px] text-warning-deep" colSpan={totalColunas - 1}>
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
                    />
                  ))}
                </>
              )}
            </tbody>
          </table>
        </ScrollAutoHide>
      </div>

      {/* ── Rodapé enxuto: UMA linha de legenda; a contagem só aparece quando um FILTRO
          está reduzindo a lista (fora disso é ruído). Verde/vermelho e o âmbar do
          previsto são auto-evidentes com os cabeçalhos "Realizado | Previsto". ── */}
      {filtroAtivo && (
        <p className="mt-3 text-right text-[11px] text-text-muted">
          Mostrando {nCatsVisiveis} de {contagemPorTipo.cat} categorias
        </p>
      )}
    </div>
  )
}
