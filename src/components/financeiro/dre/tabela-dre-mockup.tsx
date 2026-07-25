'use client'

// ── Mockup interativo da tabela hierárquica da DRE por Fluxo de Caixa (v5.3.0 · M0) ──
// Sem RPC, sem persistência — dados REAIS em fixture (mockup-dados.ts), base 15/07/2026.
// Alvo: qualidade visual/interação de produção, para servir de gate antes da M4 (tabela
// real sobre get_dre_mensal). Removível/substituível quando a RPC chegar.
//
// Desenho FINAL (rodada visual pedida pelo Yan após o gate do estudo, docs/relatorios/
// dre-estudo-visual.html): hierarquia por BANDA EM ESCALA DE CINZA (`--band`/`--band-soft`,
// tokens novos, neutro-quente — NÃO zinc/hex) em vez da régua contábil; SEM faixa de
// natureza (a distinção receita×gasto não vive mais numa régua vertical da coluna Conta —
// vai direto na TINTA do valor, verde/vermelho por SINAL em QUALQUER tipo de linha, com
// tons `*-deep` sobre banda cinza para manter contraste AA); densidade CONFORTÁVEL (células
// 32px, texto-base 13px); o previsto (colunas Jul·P..Dez, 2026) agora é RECOLHÍVEL
// horizontalmente (toggle no cabeçalho, soma numa única coluna); e a tabela vira um BOX com
// borda própria dentro do card, com respiro (`p-5`) nos quatro lados. "Fundo âmbar"
// (previsto marca o TEMPO no fundo) atravessa a coluna inteira MENOS o `blocoH` — em `sub`/
// `tot` ele é misturado à banda via `color-mix` de tokens (ver `CelulaValor`; sem isso, a
// visão padrão tudo-recolhido, composta só de bandas, perderia a marcação de previsto). As
// variantes NÃO escolhidas (régua contábil, faixa de natureza, tinta âmbar, mono) ficam só
// no estudo visual, não aqui.
//
// Estrutura: blocoH (agregador-topo) → sub (agregador-meio, ex.: Despesas Administrativas)
// → cat (categoria-folha). `cat.g` aponta para a CHAVE do pai (blocoH OU sub) — visibilidade
// de uma linha `cat` depende de `abertos.has(cat.g)`. Linha expansível (chevron) = tem `k` E
// `EXPANSIVEIS.includes(k)`.
//
// FILTROS — os dois NÃO são simétricos, de propósito:
//  · BUSCA é consulta explícita por nome: auto-expande (ignora `abertos`) e ESCONDE os blocos
//    sem nenhum achado — quem procura "aluguel" quer ver só onde ele mora.
//  · "Esconder zerados" é redução de RUÍDO: mexe só nas categorias. Blocos/sub/totalizadores
//    permanecem, porque são a ESTRUTURA do demonstrativo — fazer uma linha oficial da DRE
//    desaparecer por um filtro de ruído confundiria mais do que ajudaria ("onde foi o IMOB?").
//    Se um bloco tiver todas as categorias filtradas, a contagem mostra "0 de N" e diz o que
//    houve. (Na fixture atual nenhum bloco chega a zerar: 14 categorias zeram em 2026, 6 em
//    2025, mas sempre sobra alguma no bloco.)
//
// ⚠️ ARMADILHA DO CABEÇALHO DE 2 LINHAS: as `th` com `rowSpan={2}` (Conta / Total do ano)
// existem SÓ na 1ª <tr> — um seletor CSS do tipo "última linha do thead" nunca as alcança.
// Por isso a régua de base (`border-b-[1.5px] border-b-wt-border-strong`) e a sombra-ao-rolar
// são aplicadas DIRETAMENTE nessas duas células, além da 2ª linha (não via um seletor
// genérico). (Achado ALTO do revisor na v5.3.0/M0 — o padrão do DS pressupõe 1 linha.)
//
// ⚠️ PREVISTO RECOLHÍVEL: `previstoAberto` decide se as 6 colunas de previsto (2026,
// índices 7..12) aparecem separadas ou somadas numa ÚNICA coluna agregada — o índice do
// corte (7) NÃO muda entre os dois estados (a coluna agregada ocupa o mesmo lugar), então
// `previsto`/`corte` (calculados por índice em `LinhaDreTr`) não precisam de ramo extra.
// `colunasVisiveis`/`rotulosVisiveis` fazem a colagem; o "Total do ano" nunca usa a versão
// recolhida (sempre soma as 13 colunas reais — o recolhimento é só de EXIBIÇÃO).

import { useState, type ReactNode } from 'react'
import { ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import Button from '@/components/ui/button'
import Checkbox from '@/components/ui/checkbox'
import { Input } from '@/components/ui/field'
import ScrollAutoHide from '@/components/shared/scroll-auto-hide'
import { PILL_FILTRO, PILL_FILTRO_INATIVO, PILL_FILTRO_ATIVO_STYLE } from '@/components/shared/botoes'
import { fmtContabil } from './fmt-contabil'
import { LINHAS, BANDEJA, EXPANSIVEIS, DATA_BASE, type LinhaDre, type TipoLinha } from './mockup-dados'

type Ano = 2026 | 2025

const MESES_26 = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul·R', 'Jul·P', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const MESES_25 = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

// A partir do índice 7, em 2026, a coluna é PREVISTO (Jul·P em diante); em 2025 (ano
// fechado) não há previsto — usa-se Infinity para que nenhum índice real bata. O MESMO
// índice 7 é o "corte" quando o previsto está RECOLHIDO (a coluna agregada ocupa esse
// lugar) — ver `colunasVisiveis`/`rotulosVisiveis` abaixo.
const IDX_PREVISTO_26 = 7

function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

function somaAno(valores: number[]): number {
  return valores.reduce((acc, v) => acc + v, 0)
}

/** Soma as colunas de previsto (índice >= 7) numa ÚNICA coluna agregada quando `colapsar`
 *  é true (2026 com o previsto recolhido); em 2025 (ano fechado, sem previsto) ou em 2026
 *  com o previsto aberto, devolve os valores como estão. O índice do corte (7) não muda
 *  entre os dois estados — a coluna agregada ocupa o MESMO índice, então `previsto`/`corte`
 *  (calculados por índice em `LinhaDreTr`/`LinhaBandejaTr`) não precisam de ramo extra. */
function colunasVisiveis(valores: number[], colapsar: boolean): number[] {
  if (!colapsar) return valores
  return [...valores.slice(0, IDX_PREVISTO_26), somaAno(valores.slice(IDX_PREVISTO_26))]
}

/** Mesmo colapso, para os RÓTULOS dos meses (2ª linha do cabeçalho). */
function rotulosVisiveis(meses: string[], colapsar: boolean): string[] {
  if (!colapsar) return meses
  return [...meses.slice(0, IDX_PREVISTO_26), 'Jul·P–Dez']
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

// Hierarquia INVERTIDA (rodada 3, pedido do Yan): grupos de categoria em cinza CLARO
// (blocoH = --band, sub = --band-soft) e as LINHAS DE RESULTADO em cinza ESCURO
// (--action-primary, o dark neutro institucional da plataforma — independente de tema),
// com o rótulo em --action-primary-fg. É a inversão que dá a hierarquia: o olho varre os
// grupos claros e PARA nos resultados escuros.
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
 *  PREVISTO = a escala de cinza vira escala ÂMBAR (rodada 3): cada nível de fundo tem o
 *  seu par âmbar, misturado por `color-mix` de tokens (opaco — seguro para sticky):
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
 *  DIREITA da célula (rodada 3; sem a contagem de categorias). Linha expansível = a célula
 *  INTEIRA é o botão (alvo de clique grande, padrão acordeão). Fundo SEMPRE opaco, na cor
 *  da banda da linha (translúcido vazaria valores por baixo no scroll horizontal). */
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
  linha: LinhaDre
  ano: Ano
  idxPrevisto: number
  colapsar: boolean
  expansivel: boolean
  aberto: boolean
  onToggle?: () => void
}

/** Uma linha completa da tabela (blocoH/sub/cat/tot): Conta + meses (ou a versão recolhida
 *  do previsto) + total do ano. O total do ano SEMPRE soma as 13/12 colunas reais — o
 *  recolhimento (`colapsar`) é só de EXIBIÇÃO das colunas mensais. */
function LinhaDreTr({ linha, ano, idxPrevisto, colapsar, expansivel, aberto, onToggle }: LinhaDreTrProps) {
  const estilo = estiloLinha(linha.t)
  const valoresBase = ano === 2026 ? linha.m26 : linha.m25
  const totalAno = somaAno(valoresBase)
  const valores = colunasVisiveis(valoresBase, colapsar)
  return (
    <tr className="group">
      <CelulaConta
        rotulo={linha.l}
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
          corte={idx === idxPrevisto}
          peso={estilo.peso}
          bg={estilo.bg}
          bgHover={estilo.bgHover}
          borda={estilo.borda}
        />
      ))}
      <CelulaValor
        valor={totalAno}
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

/** Linha de categoria órfã da bandeja "Não classificadas" (sempre visível — não entra
 *  no sistema de busca/zerados/abertos, que é só para a hierarquia real). Acompanha o
 *  recolhimento do previsto como qualquer outra linha. */
function LinhaBandejaTr({ linha, ano, idxPrevisto, colapsar }: { linha: LinhaDre; ano: Ano; idxPrevisto: number; colapsar: boolean }) {
  const valoresBase = ano === 2026 ? linha.m26 : linha.m25
  const totalAno = somaAno(valoresBase)
  const valores = colunasVisiveis(valoresBase, colapsar)
  return (
    <tr className="group">
      {/* fundo OPACO (não `/40`): célula sticky translúcida deixa os valores das colunas
          passarem por baixo do rótulo no scroll horizontal. O hover usa --neutral-soft,
          o âmbar um passo mais saturado do DS. */}
      <td
        className="sticky left-0 z-10 h-8 w-[330px] min-w-[330px] max-w-[330px] border-r border-r-wt-border-strong border-l-[3px] border-l-warning bg-warning-bg pl-[26px] pr-3 group-hover:bg-neutral-soft"
        title="Mockup: valores ilustrativos — o dado real desta categoria vive em 2023"
      >
        <span className="truncate text-[13px] text-text-secondary">{linha.l}</span>
      </td>
      {valores.map((v, idx) => (
        <CelulaValorBandeja key={idx} valor={v} corte={idx === idxPrevisto} />
      ))}
      <CelulaValorBandeja valor={totalAno} corte={false} totalAno />
    </tr>
  )
}

interface TabelaDreMockupProps {
  /** Ação injetada pela página (ex.: botão "Editar estrutura") — renderizada na toolbar,
   *  à direita, antes de "Expandir tudo". */
  slotAcoes?: ReactNode
}

export default function TabelaDreMockup({ slotAcoes }: TabelaDreMockupProps) {
  const [ano, setAno] = useState<Ano>(2026)
  const [abertos, setAbertos] = useState<Set<string>>(() => new Set())
  const [rolado, setRolado] = useState(false)
  const [busca, setBusca] = useState('')
  const [esconderZerados, setEsconderZerados] = useState(false)
  const [previstoAberto, setPrevistoAberto] = useState(true)

  const toggleAberto = (k: string) => setAbertos(prev => {
    const s = new Set(prev)
    if (s.has(k)) s.delete(k)
    else s.add(k)
    return s
  })
  const expandirTudo = () => setAbertos(new Set(EXPANSIVEIS))
  const recolherTudo = () => { setAbertos(new Set()); setBusca('') }

  const meses = ano === 2026 ? MESES_26 : MESES_25
  const idxPrevisto = ano === 2026 ? IDX_PREVISTO_26 : Number.POSITIVE_INFINITY
  const colapsar = ano === 2026 && !previstoAberto
  const mesesVisiveis = rotulosVisiveis(meses, colapsar)
  const totalColunas = 1 + mesesVisiveis.length + 1 // Conta + meses (visíveis) + Total do ano
  const minW = colapsar ? 'min-w-[1180px]' : 'min-w-[1480px]'

  // ── Visibilidade: busca (auto-expande, ignora abertos) × zerados × abertos ──
  const termo = normalizar(busca.trim())
  const filtroAtivo = termo !== '' || esconderZerados
  const achadosPorBloco = new Map<string, number>()
  const catVisivel = new Map<number, boolean>()

  LINHAS.forEach((l, i) => {
    if (l.t !== 'cat' || l.g == null) return
    const totalRow = somaAno(ano === 2026 ? l.m26 : l.m25)
    const casa = termo === '' || normalizar(l.l).includes(termo)
    const zeroOk = !esconderZerados || Math.abs(totalRow) >= 0.005
    const visivel = casa && zeroOk && (termo !== '' || abertos.has(l.g))
    catVisivel.set(i, visivel)
    if (casa && zeroOk) achadosPorBloco.set(l.g, (achadosPorBloco.get(l.g) ?? 0) + 1)
  })

  // Só a BUSCA esconde bloco (ver nota de FILTROS no topo): "esconder zerados" não mexe na
  // estrutura do demonstrativo — de propósito, não por esquecimento.
  const blocoVisivel = (l: LinhaDre): boolean => {
    if (l.t !== 'blocoH' && l.t !== 'sub') return true
    if (l.k == null || !EXPANSIVEIS.includes(l.k)) return true
    if (termo === '') return true
    return (achadosPorBloco.get(l.k) ?? 0) > 0
  }

  const contagemPorTipo = LINHAS.reduce<Record<TipoLinha, number>>((acc, l) => {
    acc[l.t] += 1
    return acc
  }, { blocoH: 0, sub: 0, cat: 0, tot: 0 })

  // Contagem do rodapé (só com filtro ativo): categorias que PASSAM no filtro — não as
  // "visíveis" (que dependem de bloco aberto e fariam "0 de 130" com tudo recolhido).
  const nCatsVisiveis = [...achadosPorBloco.values()].reduce((a, n) => a + n, 0)

  const bordaBaseHeader = [
    'border-b-[1.5px] border-b-wt-border-strong',
    rolado ? 'shadow-[0_4px_6px_-4px_rgba(45,42,38,0.12)]' : '',
  ].filter(Boolean).join(' ')

  return (
    <div className="rounded-xl bg-surface p-5 shadow-sm">
      {/* ── Toolbar ── */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {([2026, 2025] as Ano[]).map(a => (
            <button
              key={a}
              type="button"
              onClick={() => setAno(a)}
              className={['foco-neutro', PILL_FILTRO, ano === a ? '' : PILL_FILTRO_INATIVO].join(' ')}
              style={ano === a ? PILL_FILTRO_ATIVO_STYLE : undefined}
            >
              {a}
            </button>
          ))}
          <span className="ml-1 text-[11px] text-text-muted">
            {ano === 2026 ? `base ${DATA_BASE}` : 'ano fechado — tudo realizado'}
          </span>
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

      {/* ── Box da tabela — borda própria, cantos clipam o cabeçalho sticky ── */}
      <div className="overflow-hidden rounded-lg border border-wt-border">
        {/* Box maior (80vh, rodada 3) + gutter interno `pr/pb` nos LIMITES do scroll: nos
            extremos, o thumb do ScrollAutoHide flutua sobre o gutter vazio em vez de cobrir
            a última coluna/linha — o mesmo respiro que a sidebar tem via padding do nav. */}
        <ScrollAutoHide eixo="both" className="max-h-[80vh] pr-1.5 pb-1.5" onScroll={e => setRolado(e.currentTarget.scrollTop > 0)}>
          <table className={`w-full ${minW} border-separate border-spacing-0 text-[13px]`}>
            <thead className="sticky top-0 z-20 [&_th]:bg-band">
              {ano === 2026 ? (
                <>
                  <tr>
                    <th
                      rowSpan={2}
                      className={`sticky left-0 z-30 w-[330px] min-w-[330px] max-w-[330px] border-r border-r-wt-border-strong pl-3 pr-3 text-left text-[10px] font-semibold uppercase tracking-[0.09em] text-text-secondary ${bordaBaseHeader}`}
                    >
                      Conta
                    </th>
                    {/* Rótulos enxutos (rodada 3): só "Realizado" / "Previsto" — a semântica
                        completa (movimentação × vencimento, corte 15/07) fica no `title`. */}
                    <th
                      title="Realizado por data de movimentação"
                      className="whitespace-nowrap px-[9px] py-1.5 text-right text-[10px] font-semibold uppercase tracking-[0.09em] text-text-secondary"
                      colSpan={IDX_PREVISTO_26}
                    >
                      Realizado
                    </th>
                    <th
                      title="Previsto por vencimento — corte na data-base 15/07"
                      className="whitespace-nowrap border-l-2 border-l-wt-border-strong px-[9px] py-1.5 text-right text-[10px] font-semibold uppercase tracking-[0.09em] text-warning-deep"
                      colSpan={colapsar ? 1 : meses.length - IDX_PREVISTO_26}
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
                          i >= IDX_PREVISTO_26 ? 'text-warning-deep' : 'text-text-secondary',
                          i === IDX_PREVISTO_26 ? 'border-l-2 border-l-wt-border-strong' : '',
                          bordaBaseHeader,
                        ].join(' ')}
                      >
                        {m}
                      </th>
                    ))}
                  </tr>
                </>
              ) : (
                <>
                  <tr>
                    <th
                      rowSpan={2}
                      className={`sticky left-0 z-30 w-[330px] min-w-[330px] max-w-[330px] border-r border-r-wt-border-strong pl-3 pr-3 text-left text-[10px] font-semibold uppercase tracking-[0.09em] text-text-secondary ${bordaBaseHeader}`}
                    >
                      Conta
                    </th>
                    <th
                      title="Ano fechado — tudo realizado (por data de movimentação)"
                      className="whitespace-nowrap px-[9px] py-1.5 text-right text-[10px] font-semibold uppercase tracking-[0.09em] text-text-secondary"
                      colSpan={12}
                    >
                      Realizado
                    </th>
                    <th
                      rowSpan={2}
                      className={`w-[140px] min-w-[140px] border-l border-l-wt-border-strong px-[9px] text-right text-[10px] font-semibold uppercase tracking-[0.09em] text-text-secondary ${bordaBaseHeader}`}
                    >
                      Total do ano
                    </th>
                  </tr>
                  <tr>
                    {meses.map(m => (
                      <th key={m} className={`h-[25px] px-[9px] text-right text-[10px] font-semibold uppercase tracking-[0.09em] text-text-secondary ${bordaBaseHeader}`}>
                        {m}
                      </th>
                    ))}
                  </tr>
                </>
              )}
            </thead>

            <tbody>
              {LINHAS.map((l, i) => {
                if (l.t === 'cat') {
                  if (catVisivel.get(i) !== true) return null
                  return (
                    <LinhaDreTr
                      key={`cat-${l.g}-${i}`}
                      linha={l}
                      ano={ano}
                      idxPrevisto={idxPrevisto}
                      colapsar={colapsar}
                      expansivel={false}
                      aberto={false}
                    />
                  )
                }
                if (!blocoVisivel(l)) return null
                const chave = l.k
                const expansivel = chave != null && EXPANSIVEIS.includes(chave)
                const aberto = termo !== '' || (chave != null && abertos.has(chave))
                const onToggle = expansivel && chave != null ? () => toggleAberto(chave) : undefined
                return (
                  <LinhaDreTr
                    key={`${l.t}-${chave ?? l.l}-${i}`}
                    linha={l}
                    ano={ano}
                    idxPrevisto={idxPrevisto}
                    colapsar={colapsar}
                    expansivel={expansivel}
                    aberto={aberto}
                    onToggle={onToggle}
                  />
                )
              })}

              {/* Bandeja "Não classificadas" — categoria(s) órfã(s) do de-para (fora do
                  sistema de busca/zerados/abertos). Rótulo na célula STICKY (visível mesmo
                  com scroll horizontal); explicador na faixa restante. */}
              <tr>
                <td className="sticky left-0 z-10 h-8 w-[330px] min-w-[330px] max-w-[330px] border-t-[1.5px] border-t-warning border-l-[3px] border-l-warning bg-warning-bg pl-3 pr-3 whitespace-nowrap">
                  <span className="text-[11.5px] font-semibold text-warning-deep">Não classificadas ({BANDEJA.length})</span>
                </td>
                <td className="border-t-[1.5px] border-t-warning bg-warning-bg px-[9px] text-[10.5px] text-warning-deep" colSpan={totalColunas - 1}>
                  categorias do Monde sem bloco na estrutura — nada some em silêncio
                </td>
              </tr>
              {BANDEJA.map((l, i) => (
                <LinhaBandejaTr key={`bandeja-${l.l}-${i}`} linha={l} ano={ano} idxPrevisto={idxPrevisto} colapsar={colapsar} />
              ))}
            </tbody>
          </table>
        </ScrollAutoHide>
      </div>

      {/* ── Rodapé enxuto (conferência visual do Yan: "limpar o que polui"): UMA linha de
          legenda; a contagem só aparece quando um FILTRO está reduzindo a lista (fora
          disso é ruído). As notas de mockup/decisões saíram da UI — vivem no PR/gate;
          a origem ilustrativa da bandeja virou `title` na própria linha. Rodada 3: a
          LEGENDA também saiu (pedido do Yan) — verde/vermelho e o âmbar do previsto são
          auto-evidentes com os cabeçalhos "Realizado | Previsto". ── */}
      {filtroAtivo && (
        <p className="mt-3 text-right text-[11px] text-text-muted">
          Mostrando {nCatsVisiveis} de {contagemPorTipo.cat} categorias
        </p>
      )}
    </div>
  )
}
