'use client'

// ── Mockup interativo da tabela hierárquica da DRE por Fluxo de Caixa (v5.3.0 · M0) ──
// Sem RPC, sem persistência — dados REAIS em fixture (mockup-dados.ts), base 15/07/2026.
// Alvo: qualidade visual/interação de produção, para servir de gate antes da M4 (tabela
// real sobre get_dre_mensal). Removível/substituível quando a RPC chegar.
//
// Desenho FINAL (gate do estudo visual, docs/relatorios/dre-estudo-visual.html):
// "Régua contábil" (hierarquia por borda/peso/caixa, ZERO preenchimento de banda) +
// "Faixa + sinal" (natureza receita×gasto só na régua vertical da coluna Conta dos
// blocos; sinal na TINTA só nas linhas de resultado) + "Fundo âmbar" (previsto marca o
// TEMPO no fundo, nunca na tinta — as duas dimensões não competem) + sans tabular +
// densidade compacta. As variantes NÃO escolhidas (banda bege/tinta, faixa isolada,
// tinta âmbar, mono, confortável) ficam só no estudo, não aqui.
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
// Por isso a régua de base (`border-b-[1.5px] border-b-text-primary`) e a sombra-ao-rolar
// são aplicadas DIRETAMENTE nessas duas células, além da 2ª linha (não via um seletor
// genérico). (Achado ALTO do revisor na v5.3.0/M0 — o padrão do DS pressupõe 1 linha.)

import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import Button from '@/components/ui/button'
import Checkbox from '@/components/ui/checkbox'
import { Input } from '@/components/ui/field'
import ScrollAutoHide from '@/components/shared/scroll-auto-hide'
import { PILL_FILTRO, PILL_FILTRO_INATIVO, PILL_FILTRO_ATIVO_STYLE } from '@/components/shared/botoes'
import { fmtContabil } from './fmt-contabil'
import { LINHAS, BANDEJA, EXPANSIVEIS, DATA_BASE, type LinhaDre, type TipoLinha } from './mockup-dados'

type Ano = 2026 | 2025
type Natureza = 'e' | 's' | 'm' | 'r'

const MESES_26 = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul·R', 'Jul·P', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const MESES_25 = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

// A partir do índice 7, em 2026, a coluna é PREVISTO (Jul·P em diante); em 2025 (ano
// fechado) não há previsto — usa-se Infinity para que nenhum índice real bata.
const IDX_PREVISTO_26 = 7

/** Natureza por CHAVE de bloco/totalizador (blocoH/sub/tot) — categorias (`k=null`) não
 *  entram aqui e caem no fallback transparente. Espelha o `nat` do estudo visual. */
const NATUREZA: Record<string, Natureza> = {
  ENT_H: 'e', RB_H: 'e', RV: 'e', RFIN: 'e', RNOP: 'e',
  PAG_H: 's', IMP_H: 's', CUSTO: 's', DESP_H: 's', ADM: 's', COM: 's', IMOB: 's', FIN: 's',
  MKT: 's', ESTR: 's', RH: 's', RHB: 's', DNOP: 's', INV_H: 's', INV: 's', DIST_LUCROS: 's',
  ONOP_H: 'm',
  REPASSE: 'r', ROL: 'r', LB: 'r', LOP: 'r', LL: 'r', RAIR: 'r', REX: 'r',
}

const BORDA_NATUREZA: Record<Natureza, string> = {
  e: 'border-l-positive',
  s: 'border-l-negative',
  m: 'border-l-neutral',
  r: 'border-l-brand',
}

/** Cor da régua vertical (3px) da coluna Conta — só nos blocos/totalizadores com chave
 *  mapeada; categorias e demais linhas ficam transparentes (a largura do texto não muda). */
function corNaturezaBorda(k: string | null): string {
  if (k == null) return 'border-l-transparent'
  const nat = NATUREZA[k]
  return nat ? BORDA_NATUREZA[nat] : 'border-l-transparent'
}

function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

function somaAno(valores: number[]): number {
  return valores.reduce((acc, v) => acc + v, 0)
}

interface EstiloLinha {
  /** border-t/border-b da régua de hierarquia — aplicada a TODAS as <td> da linha. */
  borda: string
  /** só 'tot': acrescenta border-b-[3px] + borderBottomStyle:'double' (régua dupla). */
  reguaDupla: boolean
  /** classes do <span> do rótulo (peso/caixa/tamanho/cor) na célula Conta. */
  rotulo: string
  /** padding-left da célula Conta (escada de indentação). */
  indent: string
  /** peso/tamanho do valor numérico (SEM cor — a cor é resolvida à parte). */
  peso: string
  /** cor do valor numérico quando não-zero e a linha não é 'tot'. */
  corPadrao: string
}

function estiloLinha(t: TipoLinha): EstiloLinha {
  switch (t) {
    case 'blocoH':
      return {
        borda: 'border-t-[1.5px] border-t-text-primary border-b border-b-transparent',
        reguaDupla: false,
        rotulo: 'uppercase tracking-[0.07em] text-[10.5px] font-bold text-text-primary',
        indent: 'pl-3',
        peso: 'font-bold',
        corPadrao: 'text-text-primary',
      }
    case 'sub':
      return {
        borda: 'border-t border-t-wt-border border-b border-b-transparent',
        reguaDupla: false,
        rotulo: 'text-[13px] font-semibold text-text-secondary',
        indent: 'pl-[26px]',
        peso: 'font-semibold',
        corPadrao: 'text-text-secondary',
      }
    case 'tot':
      return {
        borda: 'border-t-[1.5px] border-t-text-primary',
        reguaDupla: true,
        rotulo: 'font-bold text-[13px] text-text-primary',
        indent: 'pl-3',
        peso: 'font-bold text-[13px]',
        corPadrao: 'text-text-primary',
      }
    case 'cat':
    default:
      return {
        borda: 'border-b border-b-wt-border',
        reguaDupla: false,
        rotulo: 'text-[13px] text-text-secondary',
        indent: 'pl-11',
        peso: '',
        corPadrao: 'text-text-secondary',
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
  corPadrao: string
  borda: string
  reguaDupla: boolean
}

/** Célula de valor mensal ou do total do ano. Sinal na tinta SÓ em linhas de resultado
 *  ('tot'); zero sempre em travessão discreto. Positivo/zero reservam a largura do ")"
 *  (span invisível) para a coluna não desalinhar — negativo já vem balanceado do
 *  `fmtContabil`. Previsto marca o FUNDO (âmbar), nunca a tinta — as duas dimensões
 *  (tempo × sinal) não competem.
 *
 *  O âmbar é CONTÍNUO na coluna, inclusive nas linhas de bloco: o previsto é uma
 *  propriedade da COLUNA (tempo), então interrompê-lo por linha confundiria as duas
 *  dimensões e deixaria buracos brancos nos 7 cabeçalhos de bloco. (No estudo visual
 *  as bandas coloridas ficavam de fora do âmbar; aqui a régua contábil não tem banda,
 *  então não há o que preservar.) */
function CelulaValor({ valor, tipo, previsto, corte, totalAno = false, peso, corPadrao, borda, reguaDupla }: CelulaValorProps) {
  const zero = Math.abs(valor) < 0.005
  const negativo = !zero && valor < 0
  const cor = zero
    ? 'text-text-subtle'
    : tipo === 'tot'
      ? (negativo ? 'text-negative-deep' : 'text-positive-deep')
      : corPadrao
  const ambar = previsto
  const fundo = ambar ? 'bg-warning-bg/50 group-hover:bg-warning-bg' : 'bg-surface group-hover:bg-surface-strong'
  const bordaCorte = corte ? 'border-l-2 border-l-wt-border-strong' : ''
  const bordaTotal = totalAno ? `border-l border-l-wt-border-strong ${peso === '' ? 'font-medium' : ''}` : ''
  const bordaDupla = reguaDupla ? 'border-b-[3px] border-b-text-primary' : ''
  return (
    <td
      className={`h-[27px] px-[9px] text-right tabular-nums whitespace-nowrap ${fundo} ${borda} ${bordaDupla} ${bordaCorte} ${bordaTotal} ${peso} ${cor}`}
      style={reguaDupla ? { borderBottomStyle: 'double' } : undefined}
    >
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
  reguaDupla: boolean
  corNatureza: string
  estrela: boolean
  expansivel: boolean
  aberto: boolean
  onToggle?: () => void
  contagem?: string
}

/** Célula sticky da coluna Conta — régua vertical (natureza) + chevron + rótulo + nota
 *  da controladoria ('*') + contagem do bloco. Fundo SEMPRE opaco (nunca translúcido —
 *  vazaria valores por baixo no scroll horizontal). */
function CelulaConta({ rotulo, rotuloClasse, indent, borda, reguaDupla, corNatureza, estrela, expansivel, aberto, onToggle, contagem }: CelulaContaProps) {
  return (
    <td
      className={`sticky left-0 z-10 h-[27px] w-[330px] min-w-[330px] max-w-[330px] border-r border-r-wt-border-strong border-l-[3px] bg-surface pr-3 group-hover:bg-surface-strong ${indent} ${borda} ${reguaDupla ? 'border-b-[3px] border-b-text-primary' : ''} ${corNatureza}`}
      style={reguaDupla ? { borderBottomStyle: 'double' } : undefined}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        {expansivel && onToggle && (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={aberto}
            aria-label={`${aberto ? 'Recolher' : 'Expandir'} ${rotulo}`}
            className="foco-neutro inline-flex shrink-0 items-center justify-center rounded p-0.5 text-text-muted transition-colors hover:bg-surface-soft hover:text-text-secondary"
          >
            <ChevronRight size={14} className={`transition-transform ${aberto ? 'rotate-90' : ''}`} />
          </button>
        )}
        <span className={`truncate ${rotuloClasse}`}>{rotulo}</span>
        {estrela && <sup className="text-warning-deep" title="Nota da controladoria">*</sup>}
        {contagem != null && <span className="text-[10px] text-text-subtle">{contagem}</span>}
      </div>
    </td>
  )
}

interface LinhaDreTrProps {
  linha: LinhaDre
  ano: Ano
  idxPrevisto: number
  expansivel: boolean
  aberto: boolean
  onToggle?: () => void
  contagem?: string
}

/** Uma linha completa da tabela (blocoH/sub/cat/tot): Conta + 12/13 meses + total do ano. */
function LinhaDreTr({ linha, ano, idxPrevisto, expansivel, aberto, onToggle, contagem }: LinhaDreTrProps) {
  const estilo = estiloLinha(linha.t)
  const valores = ano === 2026 ? linha.m26 : linha.m25
  const totalAno = somaAno(valores)
  return (
    <tr className="group">
      <CelulaConta
        rotulo={linha.l}
        rotuloClasse={estilo.rotulo}
        indent={estilo.indent}
        borda={estilo.borda}
        reguaDupla={estilo.reguaDupla}
        corNatureza={corNaturezaBorda(linha.k)}
        estrela={linha.estrela}
        expansivel={expansivel}
        aberto={aberto}
        onToggle={onToggle}
        contagem={contagem}
      />
      {valores.map((v, idx) => (
        <CelulaValor
          key={idx}
          valor={v}
          tipo={linha.t}
          previsto={idx >= idxPrevisto}
          corte={idx === idxPrevisto}
          peso={estilo.peso}
          corPadrao={estilo.corPadrao}
          borda={estilo.borda}
          reguaDupla={estilo.reguaDupla}
        />
      ))}
      <CelulaValor
        valor={totalAno}
        tipo={linha.t}
        previsto={false}
        corte={false}
        totalAno
        peso={estilo.peso}
        corPadrao={estilo.corPadrao}
        borda={estilo.borda}
        reguaDupla={estilo.reguaDupla}
      />
    </tr>
  )
}

/** Célula de valor da bandeja "Não classificadas" — mesma lógica de sinal/parênteses,
 *  fundo âmbar diluído (a categoria é órfã do de-para, não faz parte da hierarquia). */
function CelulaValorBandeja({ valor, corte, totalAno = false }: { valor: number; corte: boolean; totalAno?: boolean }) {
  const zero = Math.abs(valor) < 0.005
  const negativo = !zero && valor < 0
  const cor = zero ? 'text-text-subtle' : 'text-text-secondary'
  const bordaCorte = corte ? 'border-l-2 border-l-wt-border-strong' : ''
  const bordaTotal = totalAno ? 'border-l border-l-wt-border-strong font-medium' : ''
  return (
    <td className={`h-[27px] px-[9px] text-right tabular-nums whitespace-nowrap bg-warning-bg group-hover:bg-neutral-soft ${cor} ${bordaCorte} ${bordaTotal}`}>
      {fmtContabil(valor)}
      {!negativo && <span className="invisible">)</span>}
    </td>
  )
}

/** Linha de categoria órfã da bandeja "Não classificadas" (sempre visível — não entra
 *  no sistema de busca/zerados/abertos, que é só para a hierarquia real). */
function LinhaBandejaTr({ linha, ano, idxPrevisto }: { linha: LinhaDre; ano: Ano; idxPrevisto: number }) {
  const valores = ano === 2026 ? linha.m26 : linha.m25
  const totalAno = somaAno(valores)
  return (
    <tr className="group">
      {/* fundo OPACO (não `/40`): célula sticky translúcida deixa os valores das colunas
          passarem por baixo do rótulo no scroll horizontal. O hover usa --neutral-soft,
          o âmbar um passo mais saturado do DS. */}
      <td className="sticky left-0 z-10 h-[27px] w-[330px] min-w-[330px] max-w-[330px] border-r border-r-wt-border-strong border-l-[3px] border-l-warning bg-warning-bg pl-[26px] pr-3 group-hover:bg-neutral-soft">
        <span className="truncate text-[13px] text-text-secondary">{linha.l}</span>
      </td>
      {valores.map((v, idx) => (
        <CelulaValorBandeja key={idx} valor={v} corte={idx === idxPrevisto} />
      ))}
      <CelulaValorBandeja valor={totalAno} corte={false} totalAno />
    </tr>
  )
}

export default function TabelaDreMockup() {
  const [ano, setAno] = useState<Ano>(2026)
  const [abertos, setAbertos] = useState<Set<string>>(() => new Set())
  const [rolado, setRolado] = useState(false)
  const [busca, setBusca] = useState('')
  const [esconderZerados, setEsconderZerados] = useState(false)

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
  const totalColunas = 1 + meses.length + 1 // Conta + meses + Total do ano

  // ── Visibilidade: busca (auto-expande, ignora abertos) × zerados × abertos ──
  const termo = normalizar(busca.trim())
  const filtroAtivo = termo !== '' || esconderZerados
  const achadosPorBloco = new Map<string, number>()
  const totalPorBloco = new Map<string, number>()
  const catVisivel = new Map<number, boolean>()

  LINHAS.forEach((l, i) => {
    if (l.t !== 'cat' || l.g == null) return
    totalPorBloco.set(l.g, (totalPorBloco.get(l.g) ?? 0) + 1)
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

  const linhasRenderizadas = LINHAS.filter((l, i) => (l.t === 'cat' ? catVisivel.get(i) === true : blocoVisivel(l)))
  const totalLinhasTabela = LINHAS.length + BANDEJA.length + 1 // + linha-cabeçalho da bandeja
  const nVisivel = linhasRenderizadas.length + BANDEJA.length + 1

  const bordaBaseHeader = [
    'border-b-[1.5px] border-b-text-primary',
    rolado ? 'shadow-[0_4px_6px_-4px_rgba(45,42,38,0.12)]' : '',
  ].filter(Boolean).join(' ')

  return (
    <div className="overflow-hidden rounded-xl bg-surface shadow-sm">
      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-start justify-between gap-3 p-5 pb-4">
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
          <Button variant="ghost" size="sm" onClick={expandirTudo}>Expandir tudo</Button>
          <Button variant="ghost" size="sm" onClick={recolherTudo}>Recolher tudo</Button>
        </div>
      </div>

      <ScrollAutoHide eixo="both" className="max-h-[74vh]" onScroll={e => setRolado(e.currentTarget.scrollTop > 0)}>
        <table className="w-full min-w-[1480px] border-separate border-spacing-0 text-[12.5px]">
          <thead className="sticky top-0 z-20">
            {ano === 2026 ? (
              <>
                <tr>
                  <th
                    rowSpan={2}
                    className={`sticky left-0 z-30 w-[330px] min-w-[330px] max-w-[330px] rounded-tl-lg border-r border-r-wt-border-strong bg-surface pl-3 pr-3 text-left text-[10px] font-semibold uppercase tracking-[0.09em] text-text-secondary ${bordaBaseHeader}`}
                  >
                    Conta
                  </th>
                  <th className="whitespace-nowrap bg-surface px-[9px] py-1.5 text-right text-[10px] font-semibold uppercase tracking-[0.09em] text-text-secondary" colSpan={IDX_PREVISTO_26}>
                    Realizado · movimentação
                  </th>
                  <th
                    className="whitespace-nowrap border-l-2 border-l-wt-border-strong bg-surface px-[9px] py-1.5 text-right text-[10px] font-semibold uppercase tracking-[0.09em] text-warning-deep"
                    colSpan={meses.length - IDX_PREVISTO_26}
                  >
                    Previsto · vencimento
                    <span className="ml-1.5 rounded-sm bg-warning-bg px-1 align-[1px] text-[8.5px] tracking-[0.06em] text-warning-deep">corte 15/07</span>
                  </th>
                  <th
                    rowSpan={2}
                    className={`w-[140px] min-w-[140px] rounded-tr-lg border-l border-l-wt-border-strong bg-surface px-[9px] text-right text-[10px] font-semibold uppercase tracking-[0.09em] text-text-secondary ${bordaBaseHeader}`}
                  >
                    Total do ano
                  </th>
                </tr>
                <tr>
                  {meses.map((m, i) => (
                    <th
                      key={m}
                      className={[
                        'h-[25px] bg-surface px-[9px] text-right text-[10px] font-semibold uppercase tracking-[0.09em]',
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
                    className={`sticky left-0 z-30 w-[330px] min-w-[330px] max-w-[330px] rounded-tl-lg border-r border-r-wt-border-strong bg-surface pl-3 pr-3 text-left text-[10px] font-semibold uppercase tracking-[0.09em] text-text-secondary ${bordaBaseHeader}`}
                  >
                    Conta
                  </th>
                  <th className="whitespace-nowrap bg-surface px-[9px] py-1.5 text-right text-[10px] font-semibold uppercase tracking-[0.09em] text-text-secondary" colSpan={12}>
                    Realizado · movimentação (ano fechado)
                  </th>
                  <th
                    rowSpan={2}
                    className={`w-[140px] min-w-[140px] rounded-tr-lg border-l border-l-wt-border-strong bg-surface px-[9px] text-right text-[10px] font-semibold uppercase tracking-[0.09em] text-text-secondary ${bordaBaseHeader}`}
                  >
                    Total do ano
                  </th>
                </tr>
                <tr>
                  {meses.map(m => (
                    <th key={m} className={`h-[25px] bg-surface px-[9px] text-right text-[10px] font-semibold uppercase tracking-[0.09em] text-text-secondary ${bordaBaseHeader}`}>
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
              const totalDoBloco = chave != null ? totalPorBloco.get(chave) ?? 0 : 0
              const achadosDoBloco = chave != null ? achadosPorBloco.get(chave) ?? 0 : 0
              const contagem = expansivel
                ? (filtroAtivo && achadosDoBloco !== totalDoBloco ? `${achadosDoBloco} de ${totalDoBloco}` : String(totalDoBloco))
                : undefined
              return (
                <LinhaDreTr
                  key={`${l.t}-${chave ?? l.l}-${i}`}
                  linha={l}
                  ano={ano}
                  idxPrevisto={idxPrevisto}
                  expansivel={expansivel}
                  aberto={aberto}
                  onToggle={onToggle}
                  contagem={contagem}
                />
              )
            })}

            {/* Bandeja "Não classificadas" — categoria(s) órfã(s) do de-para (fora do
                sistema de busca/zerados/abertos). Rótulo na célula STICKY (visível mesmo
                com scroll horizontal); explicador na faixa restante. */}
            <tr>
              <td className="sticky left-0 z-10 h-[27px] w-[330px] min-w-[330px] max-w-[330px] border-t-[1.5px] border-t-warning border-l-[3px] border-l-warning bg-warning-bg pl-3 pr-3 whitespace-nowrap">
                <span className="text-[11.5px] font-semibold text-warning-deep">Não classificadas ({BANDEJA.length})</span>
              </td>
              <td className="border-t-[1.5px] border-t-warning bg-warning-bg px-[9px] text-[10.5px] text-text-muted" colSpan={totalColunas - 1}>
                categorias do Monde sem bloco na estrutura — nada some em silêncio
              </td>
            </tr>
            {BANDEJA.map((l, i) => (
              <LinhaBandejaTr key={`bandeja-${l.l}-${i}`} linha={l} ano={ano} idxPrevisto={idxPrevisto} />
            ))}
          </tbody>
        </table>
      </ScrollAutoHide>

      {/* ── Rodapé: legenda + notas ── */}
      <div className="flex flex-col gap-2 border-t border-t-wt-border p-4">
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex items-center gap-1.5 text-[11.5px] text-text-secondary">
            <span className="h-[11px] w-[11px] rounded-sm bg-positive" /> Entrada / receita
          </span>
          <span className="flex items-center gap-1.5 text-[11.5px] text-text-secondary">
            <span className="h-[11px] w-[11px] rounded-sm bg-negative" /> Saída / gasto
          </span>
          <span className="flex items-center gap-1.5 text-[11.5px] text-text-secondary">
            <span className="h-[11px] w-[11px] rounded-sm bg-neutral" /> Misto
          </span>
          <span className="flex items-center gap-1.5 text-[11.5px] text-text-secondary">
            <span className="h-[11px] w-[11px] rounded-sm bg-brand" /> Linha de resultado
          </span>
          <span className="flex items-center gap-1.5 text-[11.5px] text-text-secondary">
            <span className="h-[11px] w-[11px] rounded-sm border border-warning bg-warning-bg" /> Previsto
          </span>
          <span className="flex items-center gap-1.5 text-[11.5px] text-text-secondary">
            <sup className="text-warning-deep">*</sup> Nota da controladoria
          </span>
        </div>
        <p className="text-[10.5px] text-text-muted">
          Mostrando {nVisivel} de {totalLinhasTabela} linhas · {contagemPorTipo.blocoH} cabeçalhos de bloco,{' '}
          {contagemPorTipo.sub} sub-blocos, {contagemPorTipo.cat} categorias, {contagemPorTipo.tot} totalizadores.
        </p>
        <p className="text-[10.5px] text-text-muted">
          Mockup (M0) — dados reais da controladoria (base 15/07/2026); os valores da categoria da bandeja são ilustrativos.
        </p>
        <p className="text-[10.5px] text-text-muted">
          Total do ano = soma das colunas mensais exibidas. O modelo da controladoria soma também os vencidos em aberto
          (sem coluna neste recorte) — em validação.
        </p>
      </div>
    </div>
  )
}
