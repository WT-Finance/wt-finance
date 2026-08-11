'use client'

import { useState, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { Search, Download, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react'
import type { ListaOperacoes, OperacaoItem } from '@/types/api'
import { fmtDateLong, fmtMeses, numBRL2, parseLocalDate } from '@/lib/fmt'
import { margemColor } from '@/lib/config'
import {
  DURACAO_CURTA_MESES,
  duracaoDias,
  duracaoMesesExibida,
  margemAnualizada,
  fmtPct1,
} from '@/lib/weddings/margem-anualizada'
import Tooltip from '@/components/ui/tooltip'
import EmptyState from '@/components/shared/empty-state'
import ScrollAutoHide from '@/components/shared/scroll-auto-hide'

// ── Status pills ──────────────────────────────────────────────────────────────

const STATUS_PILLS = [
  { v: 'todos',   l: 'Todas'      },
  { v: 'passado', l: 'Realizados' },
  { v: 'futuro',  l: 'Futuros'    },
]

// ── Período personalizado ─────────────────────────────────────────────────────

type PeriodoPreset = 'todos' | 'personalizado'

interface PeriodoDatas {
  inicio: string | null
  fim: string | null
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10)

// ── Duração e Margem a.a. ─────────────────────────────────────────────────────
// A duração e a anualização vivem em @/lib/weddings/margem-anualizada (v5.4.2/M1):
// a fórmula é a definição de uma MÉTRICA (ADR), então precisa ser testável — e o
// vitest só coleta `src/**/*.test.ts`, nunca `.tsx`.

/** Texto único do tooltip da Margem (a.a.) — a definição que o ADR registra. */
const TOOLTIP_MARGEM_AA =
  'Margem × 12 ÷ Duração (meses) — anualização LINEAR, nunca composta. ' +
  'Duração = dias entre a assinatura do contrato e a data do evento, convertidos a ' +
  'meses de 30,44 dias. Lê-se "margem por ano de operação ocupada". ' +
  `Atenção: em operações de menos de ${DURACAO_CURTA_MESES} meses a anualização é ` +
  'frágil (3,9 meses a 32,5% ⇒ 100% a.a.); o valor é exibido cru, sem teto.'

// ── Rendimento potencial do float (v5.5.0) ────────────────────────────────────

/** Texto do tooltip da coluna — a definição, mais a nota teórica obrigatória. */
const TOOLTIP_REND_FLOAT =
  'Quanto o caixa recebido antecipadamente desta operação renderia se aplicado a 100% ' +
  'do CDI, em regime composto, mês a mês, do primeiro ao último lançamento. Saldo ' +
  'negativo rende negativamente — é o custo teórico de precisar captar. ' +
  'Rendimento teórico a 100% do CDI · não representa aplicação real.'

/**
 * Tooltip da "Margem Poten. (a.a.)" (v5.5.1; renomeada de "Margem Teórica" na
 * v5.6.1 a pedido do Yan — o campo/chave de ordenação segue `margem_teorica_aa`).
 *
 * O texto PRECISA dizer que o número soma um componente não-contábil: é isso que o
 * separa da "Margem (a.a.)" ao lado, e a v5.5.0 tinha como invariante justamente NÃO
 * fazer essa soma. A mudança é deliberada (emenda ao ADR-0166), e quem lê a tela
 * precisa saber o que está lendo — senão vê duas margens diferentes para a mesma
 * operação e conclui que uma delas está errada.
 */
const TOOLTIP_MARGEM_TEORICA =
  'Margem anualizada considerando o Resultado Previsto MAIS o rendimento potencial do ' +
  'caixa livre: (Resultado + Rend. Teórico) ÷ Faturamento, anualizado pela mesma régua ' +
  'LINEAR da "Margem (a.a.)". Embute um componente TEÓRICO — rendimento a 100% do CDI, ' +
  'que não representa aplicação real —, então NÃO substitui a "Margem (a.a.)" ao lado: ' +
  'a diferença entre as duas é exatamente o peso do float na operação. ' +
  'Travessão quando não há float conhecido.'

/**
 * Meses de atraso da série do CDI acima dos quais vale avisar.
 *
 * 1 mês é o estado NORMAL, não atraso: o CDI de um mês só existe depois de o mês
 * fechar, então em agosto a última taxa é sempre a de julho. Avisar aí seria alarme
 * permanente — e alarme que acende sempre é alarme que ninguém lê (v5.4.4).
 */
const STALENESS_MESES = 2

/** Aviso a acrescentar ao tooltip quando a ingestão do CDI está atrasada. */
function avisoStaleness(taxaVigenteMes: string | null | undefined): string {
  if (!taxaVigenteMes) return ''
  const ref = parseLocalDate(taxaVigenteMes)
  const hoje = new Date()
  const atraso = (hoje.getFullYear() - ref.getFullYear()) * 12 + (hoje.getMonth() - ref.getMonth())
  if (atraso <= STALENESS_MESES) return ''
  const mesAno = ref.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
  return ` ⚠️ Taxa de referência de ${mesAno} — a série do CDI não é atualizada desde então.`
}

/**
 * Afordância "?" de ajuda no cabeçalho — padrão da casa (mesmo desenho de
 * `CabecalhoAjuda` em faturamento-corp e do KPI do Fluxo de Caixa).
 *
 * Dois detalhes que já custaram caro e não são estéticos:
 *  • `!whitespace-normal` (important): o primitivo `Tooltip` traz
 *    `whitespace-nowrap` na base — sem o `!`, texto longo não quebra e vira uma
 *    linha gigante INVISÍVEL que transborda e cria barra de rolagem horizontal.
 *  • `!left-auto right-0`: âncora à DIREITA. São TRÊS call-sites — "Margem (a.a.)",
 *    "Rend. Teórico" e "Margem Teórica (a.a.)", esta última a ÚLTIMA coluna da
 *    tabela. A âncora à direita é obrigatória para a última (à esquerda o balão
 *    abriria para fora da borda) e inofensiva para as do meio, onde ele abre para
 *    dentro. Não "corrigir" pensando num call-site só — quebra os outros em silêncio.
 */
function AjudaHeader({ texto, rotulo }: { texto: string; rotulo: string }) {
  return (
    <Tooltip
      conteudo={texto}
      className="z-30 w-64 !whitespace-normal !left-auto right-0 font-normal normal-case tracking-normal leading-snug text-left"
    >
      {/* `<button>`, não `<span>` (achado ALTO do revisor, v5.4.2): span não entra no
          tab-order nem é nomeável por leitor de tela, então a dica — a ÚNICA explicação
          de por que esta coluna pode discordar da "Margem" ao lado — ficava invisível
          para quem navega por teclado. Com o botão focável + o `focus-within` do
          primitivo `Tooltip`, o balão abre no Tab.
          stopPropagation: o `<th>` inteiro ordena a tabela — ler a dica não deve
          reordenar a lista. */}
      <button
        type="button"
        onClick={e => e.stopPropagation()}
        aria-label={`${rotulo}: ${texto}`}
        className="foco-neutro inline-flex h-3 w-3 items-center justify-center rounded-full border border-zinc-300 text-[8px] font-semibold leading-none text-zinc-400 cursor-help"
      >
        ?
      </button>
    </Tooltip>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      {/* v5.5.1: 12 colunas — o bloco teórico ("Rend. Teórico" + "Margem Teórica")
          foi para o FIM, depois das contábeis. A silhueta do skeleton acompanha a da
          tabela real; se as duas divergirem, a tela "pula" ao terminar de carregar. */}
      {[120, 80, 64, 60, 56, 36, 72, 60, 52, 56, 64, 60].map((w, i) => (
        <td key={i} className="py-2.5 px-3">
          <div className="h-3 rounded bg-zinc-100" style={{ width: w }} />
        </td>
      ))}
    </tr>
  )
}

interface SortThProps {
  children: ReactNode
  field: string | null
  right?: boolean
  center?: boolean
  title?: string
  ordem: string
  onSort: (field: string) => void
}

function SortTh({ children, field, right, center, title, ordem, onSort }: SortThProps) {
  const [activeField, activeDir] = ordem.split(':')
  const isActive = field !== null && activeField === field

  const baseClass = `py-2 px-3 text-xs font-medium whitespace-nowrap ${center ? 'text-center' : right ? 'text-right' : 'text-left'}`
  const colorClass = isActive ? 'text-[var(--text-primary)]' : 'text-zinc-400'
  const cursorClass = field ? 'cursor-pointer select-none hover:text-zinc-600' : ''
  const helpClass = title && !field ? 'cursor-help underline decoration-dotted decoration-zinc-300' : ''

  if (!field) {
    return (
      <th
        title={title}
        className={`${baseClass} ${colorClass} ${helpClass}`}
      >
        {children}
      </th>
    )
  }

  return (
    <th
      title={title}
      onClick={() => onSort(field)}
      className={`${baseClass} ${colorClass} ${cursorClass}`}
    >
      {/* Setinha de ordenação no padrão da tabela de Movimentações (v5.1.9): ícones lucide —
          ativo = ArrowUp/ArrowDown; ordenável inativo = ArrowUpDown cinza. */}
      <span className="inline-flex items-center gap-1 align-middle">
        {children}
        {isActive
          ? (activeDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)
          : <ArrowUpDown size={12} className="text-zinc-300" />}
      </span>
    </th>
  )
}

// ── Excel export ──────────────────────────────────────────────────────────────

async function exportarParaExcel(operacoes: OperacaoItem[], periodoLabel: string) {
  // Import dinâmico (P3b, v4.39.0/M5): tira o @e965/xlsx do bundle inicial —
  // só carrega quando o usuário efetivamente clica em "Exportar" (padrão do
  // resto do app; ver @/lib/carga/parse-vendas-produto.ts).
  const XLSX = await import('@e965/xlsx')

  const dados = operacoes.map(op => {
    const dias = duracaoDias(op.data_venda_contrato, op.data_evento)
    const mAA  = margemAnualizada(op.margem_liquida_pct, dias)
    const mTeoricaAA = op.margem_teorica_pct == null
      ? null
      : margemAnualizada(op.margem_teorica_pct, dias)
    return {
      'Operação':              op.nome_casal ?? op.operacao,
      'Hotel':                 op.hotel ?? '—',
      'Data do Evento':        op.data_evento ? parseLocalDate(op.data_evento).toLocaleDateString('pt-BR') : '—',
      'Duração (meses)':       duracaoMesesExibida(dias) ?? '—',
      'Contrato':              op.tipo_contrato ?? '—',
      'Conv.':                 op.convidados ?? 0,
      'Faturamento (R$)':         op.faturamento ?? 0,
      // v4.9/M6: Resultado Previsto = entradas_total − saidas_total (mesma fórmula do drawer).
      'Resultado Previsto (R$)':  (op.entradas_total ?? 0) - (op.saidas_total ?? 0),
      'Margem (%)':               op.margem_liquida_pct ?? 0,
      // v5.4.2/M1: número CRU (não string formatada) — a planilha precisa poder somar,
      // ordenar e refazer a conta. Duração não anualizável vira travessão, nunca 0.
      'Margem a.a. (%)':          mAA != null ? Number(mAA.toFixed(1)) : '—',
      // v5.5.1: as duas colunas TEÓRICAS no fim, na mesma ordem da tela. Os rótulos
      // carregam "Teórico"/"Teórica" de propósito — fora do Janus a planilha perde o
      // tooltip, e o nome é a única coisa que impede a coluna de virar receita.
      'Rend. Teórico (R$)':       op.rend_float ?? '—',
      'Margem Poten. a.a. (%)':   mTeoricaAA != null ? Number(mTeoricaAA.toFixed(1)) : '—',
    }
  })

  const ws = XLSX.utils.json_to_sheet(dados)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Operações Weddings')
  const hoje = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `weddings-operacoes-${periodoLabel}-${hoje}.xlsx`)
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  onSelectOperacao?: (operacao: string) => void
}

export default function ListaOperacoesCard({ onSelectOperacao }: Props) {
  const [status,   setStatus]   = useState('passado')
  const [busca,    setBusca]    = useState('')
  const [buscaDeb, setBuscaDeb] = useState('')
  const [ordem,    setOrdem]    = useState('data_evento:desc')
  const [pagina,   setPagina]   = useState(1)

  const [pageSize, setPageSize] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      return parseInt(localStorage.getItem('wt-finance-lista-operacoes-page-size') ?? '10', 10)
    }
    return 10
  })

  const [periodoPreset,  setPeriodoPreset]  = useState<PeriodoPreset>('todos')
  const [periodoCustom,  setPeriodoCustom]  = useState<{ inicio: string; fim: string } | null>(null)
  const [customPopover,  setCustomPopover]  = useState(false)
  const [customFrom,     setCustomFrom]     = useState('')
  const [customTo,       setCustomTo]       = useState('')
  const popoverRef = useRef<HTMLDivElement>(null)

  const [isExporting,  setIsExporting]  = useState(false)

  const [requestState, setRequestState] = useState<{
    key: string
    data: ListaOperacoes | null
    erro: string | null
  }>({ key: '', data: null, erro: null })

  const periodoAtivo: PeriodoDatas = useMemo(() => {
    if (periodoPreset === 'personalizado' && periodoCustom) {
      return { inicio: periodoCustom.inicio, fim: periodoCustom.fim }
    }
    return { inicio: null, fim: null }
  }, [periodoPreset, periodoCustom])

  const periodoLabel = useMemo(() => {
    if (periodoPreset === 'personalizado' && periodoCustom) {
      return `${periodoCustom.inicio}_${periodoCustom.fim}`
    }
    return 'todos'
  }, [periodoPreset, periodoCustom])

  // Close popover on outside click
  useEffect(() => {
    if (!customPopover) return
    function handler(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setCustomPopover(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [customPopover])

  // Debounce busca 300ms
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (debRef.current) clearTimeout(debRef.current)
    debRef.current = setTimeout(() => {
      setBuscaDeb(busca)
      setPagina(1)
    }, 300)
    return () => { if (debRef.current) clearTimeout(debRef.current) }
  }, [busca])

  const queryString = useMemo(() => {
    const [ordenar_por, direcao] = ordem.split(':')
    const params = new URLSearchParams({
      status,
      subsetor: 'todos',
      ordenar_por,
      direcao,
      pagina: String(pagina),
      por_pagina: String(pageSize),
    })
    if (buscaDeb) params.set('busca', buscaDeb)
    if (periodoAtivo.inicio) params.set('periodo_inicio', periodoAtivo.inicio)
    if (periodoAtivo.fim)    params.set('periodo_fim',    periodoAtivo.fim)
    return params.toString()
  }, [status, buscaDeb, ordem, pagina, pageSize, periodoAtivo])

  useEffect(() => {
    let cancelled = false

    fetch(`/api/dashboard/weddings/operacoes?${queryString}`)
      .then(async res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<ListaOperacoes>
      })
      .then(data => {
        if (!cancelled) setRequestState({ key: queryString, data, erro: null })
      })
      .catch(e => {
        if (!cancelled) {
          setRequestState({
            key: queryString,
            data: null,
            erro: e instanceof Error ? e.message : 'Erro desconhecido',
          })
        }
      })

    return () => { cancelled = true }
  }, [queryString])

  const loading = requestState.key !== queryString
  const data = loading ? null : requestState.data
  const erro = loading ? null : requestState.erro

  const totalPaginas = data ? Math.ceil(data.total / data.por_pagina) : 0

  const paginasBtns = (() => {
    if (totalPaginas <= 5) return Array.from({ length: totalPaginas }, (_, i) => i + 1)
    const start = Math.max(1, Math.min(pagina - 2, totalPaginas - 4))
    return Array.from({ length: 5 }, (_, i) => start + i)
  })()

  function handleSort(field: string) {
    setOrdem(prev => {
      const [cur, dir] = prev.split(':')
      if (cur === field) return `${field}:${dir === 'desc' ? 'asc' : 'desc'}`
      return `${field}:desc`
    })
    setPagina(1)
  }

  function handlePageSizeChange(value: string) {
    const size = parseInt(value, 10)
    setPageSize(size)
    localStorage.setItem('wt-finance-lista-operacoes-page-size', value)
    setPagina(1)
  }

  function handlePeriodoPersonalizado() {
    setCustomPopover(prev => !prev)
  }

  function clearPeriodoCustom() {
    setPeriodoCustom(null)
    setPeriodoPreset('todos')
    setCustomPopover(false)
    setPagina(1)
  }

  function aplicarPeriodoCustom() {
    if (!customFrom || !customTo) return
    if (customTo < customFrom) return
    setPeriodoCustom({ inicio: customFrom, fim: customTo })
    setPeriodoPreset('personalizado')
    setCustomPopover(false)
    setPagina(1)
  }

  async function handleExportar() {
    setIsExporting(true)
    try {
      // M6 (v4.17.0): pagina até cobrir data.total. Antes exportava só a 1ª página
      // (cap fixo de 200), perdendo silenciosamente o resto (ex.: 232 ops → 32 fora).
      const [ordenar_por, direcao] = ordem.split(':')
      const PAGE = 200
      const todas: OperacaoItem[] = []
      let pag = 1
      let total = Infinity
      while (todas.length < total) {
        const params = new URLSearchParams({
          status, subsetor: 'todos', ordenar_por, direcao,
          pagina: String(pag), por_pagina: String(PAGE),
        })
        if (buscaDeb) params.set('busca', buscaDeb)
        if (periodoAtivo.inicio) params.set('periodo_inicio', periodoAtivo.inicio)
        if (periodoAtivo.fim)    params.set('periodo_fim',    periodoAtivo.fim)
        const res = await fetch(`/api/dashboard/weddings/operacoes?${params.toString()}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json() as ListaOperacoes
        total = data.total
        todas.push(...data.operacoes)
        if (data.operacoes.length < PAGE || todas.length >= total) break
        pag++
      }
      await exportarParaExcel(todas, periodoLabel)
    } catch {
    } finally {
      setIsExporting(false)
    }
  }

  const sortThProps = { ordem, onSort: handleSort }

  const TODAY = isoDate(new Date())

  return (
    <div className="bg-white rounded-xl shadow-sm px-5 py-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-baseline gap-2">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">Lista de Operações</h2>
          {data && !loading && (
            <span className="text-xs text-zinc-400">{data.total} encontradas</span>
          )}
        </div>
        <button
          onClick={handleExportar}
          disabled={isExporting || loading}
          className="flex items-center gap-1.5 px-3 h-8 text-xs font-medium rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {isExporting ? (
            <span className="w-3.5 h-3.5 rounded-full border-2 border-zinc-400 border-t-transparent animate-spin" />
          ) : (
            <Download size={14} strokeWidth={1.8} />
          )}
          Exportar
        </button>
      </div>

      {/* Status pills + Personalizado + busca */}
      <div className="flex flex-wrap gap-2 mb-4">
        {STATUS_PILLS.map(pill => {
          const isActive = status === pill.v
          return (
            <button
              key={pill.v}
              onClick={() => { setStatus(pill.v); setPagina(1) }}
              className={[
                'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                isActive ? '' : 'border-zinc-200 text-zinc-500 hover:border-zinc-300 hover:bg-zinc-50',
              ].join(' ')}
              style={isActive ? {
                background:   'var(--brand-soft)',
                borderColor:  'var(--brand)',
                color:        'var(--brand-deep)',
              } : undefined}
            >
              {pill.l}
            </button>
          )
        })}

        {/* Personalizado — separador visual */}
        <span className="text-zinc-200 self-center">|</span>

        <div className="relative">
          <button
            onClick={handlePeriodoPersonalizado}
            className={[
              'px-3 py-1 rounded-full text-xs font-medium border transition-colors whitespace-nowrap',
              periodoPreset === 'personalizado' ? '' : 'border-zinc-200 text-zinc-500 hover:border-zinc-300 hover:bg-zinc-50',
            ].join(' ')}
            style={periodoPreset === 'personalizado' ? {
              background:  'var(--brand-soft)',
              borderColor: 'var(--brand)',
              color:       'var(--brand-deep)',
            } : undefined}
          >
            {periodoPreset === 'personalizado' && periodoCustom
              ? `${periodoCustom.inicio.slice(5)} — ${periodoCustom.fim.slice(5)}`
              : 'Personalizado'}
          </button>
          {periodoPreset === 'personalizado' && periodoCustom && (
            <button
              onClick={clearPeriodoCustom}
              className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-zinc-300 hover:bg-zinc-400 text-white flex items-center justify-center text-3xs leading-none transition-colors"
              title="Limpar filtro de período"
            >
              ×
            </button>
          )}

          {customPopover && (
            <div
              ref={popoverRef}
              className="absolute top-full left-0 mt-2 z-50 bg-white border border-zinc-200 rounded-xl shadow-lg p-4 w-64 font-sans"
            >
              <p className="text-xs font-semibold mb-3 text-zinc-500">Período personalizado:</p>
              <div className="flex gap-2 mb-3">
                <div className="flex-1">
                  <label className="text-xs mb-1 block text-zinc-400">Início</label>
                  <input
                    type="date" value={customFrom} max={customTo || TODAY}
                    onChange={e => setCustomFrom(e.target.value)}
                    className="w-full rounded-md border border-zinc-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs mb-1 block text-zinc-400">Fim</label>
                  <input
                    type="date" value={customTo} min={customFrom} max={TODAY}
                    onChange={e => setCustomTo(e.target.value)}
                    className="w-full rounded-md border border-zinc-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => setCustomPopover(false)}
                  className="text-xs px-2 py-1 text-zinc-400 hover:text-zinc-700 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={aplicarPeriodoCustom}
                  disabled={!customFrom || !customTo || customTo < customFrom}
                  className="text-xs font-medium text-white px-3 py-1.5 rounded-md hover:opacity-90 transition-opacity disabled:opacity-40"
                  style={{ background: 'var(--brand)' }}
                >
                  Aplicar
                </button>
              </div>
            </div>
          )}
        </div>

        <input
          type="text" placeholder="Buscar por casal..."
          value={busca} onChange={e => setBusca(e.target.value)}
          className="text-xs border border-zinc-200 rounded-lg px-2.5 h-8 text-zinc-700 placeholder:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] min-w-44 ml-2"
        />
      </div>

      {/* Tabela */}
      <ScrollAutoHide eixo="x">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-100">
              <SortTh field="nome_casal" {...sortThProps}>Operação</SortTh>
              <SortTh field="hotel" title="Hotel / fornecedor principal do casamento (Contrato=1)" {...sortThProps}>Hotel</SortTh>
              <SortTh field="data_evento" {...sortThProps}>Data do Evento</SortTh>
              <SortTh field="duracao" right title="Meses entre assinatura do contrato e data do casamento" {...sortThProps}>Duração</SortTh>
              <SortTh field="tipo_contrato" center title="Tipo de contrato (Tudo Incluído, Cardápio, etc.) — disponível após reimportação com nova coluna" {...sortThProps}>Contrato</SortTh>
              <SortTh field="convidados" center title="Número de convidados únicos nas Diárias de Hospedagem" {...sortThProps}>Conv.</SortTh>
              <SortTh field="faturamento" right title="Soma do valor total das vendas desta operação" {...sortThProps}>Faturamento</SortTh>
              <SortTh field="resultado" right title="Entradas − Saídas (resultado de caixa da operação)" {...sortThProps}>Resultado Prev.</SortTh>
              <SortTh field="ml" right title="Resultado Previsto ÷ Faturamento × 100" {...sortThProps}>Margem</SortTh>
              <SortTh field="margem_aa" right {...sortThProps}>
                <span className="inline-flex items-center gap-1">
                  Margem (a.a.)
                  <AjudaHeader texto={TOOLTIP_MARGEM_AA} rotulo="Margem (a.a.)" />
                </span>
              </SortTh>
              {/* v5.5.1 (pedido do Yan): as duas colunas TEÓRICAS foram para o fim da
                  tabela, depois das contábeis — as três margens passam a ser lidas em
                  sequência e o bloco teórico não corta mais a leitura contábil pelo
                  meio. Ordenação pelo SERVIDOR nas duas (chaves `rend_float` da 0241 e
                  `margem_teorica_aa` da 0246): a lista pagina no servidor e a whitelist
                  tem fallback SILENCIOSO.
                  ⚠️ Com 12 colunas a tabela TRANSBORDA na horizontal, e isso é
                  ACEITO (decisão do Yan): as duas colunas teóricas ficam atrás da
                  rolagem do `ScrollAutoHide`. A alternativa era encurtar rótulos e
                  formatos que valem mais legíveis do que a ausência da barra. */}
              <SortTh field="rend_float" right {...sortThProps}>
                <span className="inline-flex items-center gap-1">
                  Rend. Teórico
                  <AjudaHeader
                    texto={TOOLTIP_REND_FLOAT + avisoStaleness(data?.taxa_vigente_mes)}
                    rotulo="Rend. Teórico"
                  />
                </span>
              </SortTh>
              <SortTh field="margem_teorica_aa" right {...sortThProps}>
                <span className="inline-flex items-center gap-1">
                  Margem Poten. (a.a.)
                  <AjudaHeader
                    texto={TOOLTIP_MARGEM_TEORICA + avisoStaleness(data?.taxa_vigente_mes)}
                    rotulo="Margem Poten. (a.a.)"
                  />
                </span>
              </SortTh>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-50">
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
            ) : erro ? (
              <tr>
                <td colSpan={12} className="py-6 text-center text-sm text-danger">{erro}</td>
              </tr>
            ) : !data?.operacoes?.length ? (
              <tr>
                <td colSpan={12}>
                  <EmptyState icon={Search} message="Nenhuma operação encontrada para os filtros selecionados" />
                </td>
              </tr>
            ) : (
              data.operacoes.map(op => {
                // v4.9/M6: Resultado Previsto = entradas_total − saidas_total (mesma fórmula do drawer).
                const resultadoPrevisto = op.entradas_total - op.saidas_total
                const rlNegativa = resultadoPrevisto < 0
                const duracao = duracaoDias(op.data_venda_contrato, op.data_evento)
                // v5.4.2/M1: derivada no cliente a partir de números que a lista já
                // devolve — nenhum valor existente muda (invariante 2 do briefing).
                const margemAA = margemAnualizada(op.margem_liquida_pct, duracao)
                // v5.5.1: MESMO helper e MESMA duração da linha acima — só muda o
                // percentual de entrada, que já vem arredondado do SQL (a 0246
                // explica por que o arredondamento não pode acontecer aqui).
                const margemTeoricaAA = op.margem_teorica_pct == null
                  ? null
                  : margemAnualizada(op.margem_teorica_pct, duracao)
                return (
                  <tr
                    key={op.operacao}
                    onClick={() => onSelectOperacao?.(op.operacao)}
                    className={[
                      'transition-colors',
                      rlNegativa ? 'bg-danger-bg/40 hover:bg-danger-bg/70' : 'hover:bg-zinc-50',
                      onSelectOperacao ? 'cursor-pointer' : '',
                    ].join(' ')}
                  >
                    {/* v5.4.2/M1: largura reduzida (truncate + max-w) para abrir espaço às
                        colunas da direita; o nome completo fica no title.
                        v5.5.1: MANTIDA em 150px. Cheguei a cortar para 124 tentando fazer
                        as 12 colunas caberem sem rolagem, mas a decisão foi ACEITAR a
                        rolagem — e aí truncar o nome do casal mais cedo seria custo sem
                        contrapartida. */}
                    <td className="py-2.5 px-3 max-w-[150px]">
                      <p
                        className="font-medium text-zinc-800 text-xs truncate"
                        title={op.nome_casal ?? op.operacao}
                      >
                        {op.nome_casal ?? op.operacao}
                      </p>
                    </td>
                    <td className="py-2.5 px-3 text-xs text-zinc-500 truncate max-w-[100px] whitespace-nowrap">
                      {op.hotel ?? <span className="text-zinc-300">—</span>}
                    </td>
                    <td className="py-2.5 px-3 text-xs text-zinc-600 whitespace-nowrap">
                      {op.data_evento ? fmtDateLong(op.data_evento) : <span className="text-zinc-300">—</span>}
                    </td>
                    <td className="py-2.5 px-3 text-right text-xs whitespace-nowrap tabular-nums">
                      {duracao !== null
                        ? <span className="text-zinc-600">{fmtMeses(duracao)}</span>
                        : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                    <td className="py-2.5 px-3 text-center text-xs text-zinc-600 whitespace-nowrap">
                      {op.tipo_contrato ?? <span className="text-zinc-300">—</span>}
                    </td>
                    <td className="py-2.5 px-3 text-center tabular-nums text-xs whitespace-nowrap">
                      {op.convidados == null || op.convidados === 0 ? (
                        <span
                          className="text-zinc-300"
                          title={op.convidados === 0 ? 'Sem passageiros cadastrados nas Diárias desta operação' : undefined}
                        >
                          {op.convidados === 0 ? '0' : '—'}
                        </span>
                      ) : (
                        <span className="text-zinc-700">{op.convidados}</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-xs text-zinc-700 whitespace-nowrap">
                      <span className="flex justify-between gap-2 tabular-nums">
                        <span className="text-zinc-400">R$</span>
                        <span>{numBRL2(op.faturamento)}</span>
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-xs font-medium whitespace-nowrap">
                      <span className="flex justify-between gap-2 tabular-nums">
                        <span className="text-zinc-400">R$</span>
                        <span className={rlNegativa ? 'text-danger' : 'text-zinc-700'}>{numBRL2(resultadoPrevisto)}</span>
                      </span>
                    </td>
                    <td className={`py-2.5 px-3 text-right tabular-nums text-xs font-medium whitespace-nowrap ${margemColor(op.margem_liquida_pct)}`}>
                      {fmtPct1(op.margem_liquida_pct)}
                    </td>
                    {/* Margem (a.a.) — MESMA regra de cor da "Margem" (margemColor por
                        faixa: alvo/atenção/abaixo), decisão do Yan. Consequência conhecida
                        e aceita: a anualização vive em outra escala, então um ciclo curto
                        pode ficar verde aqui com a Margem vermelha ao lado — é o que o "?"
                        do cabeçalho explica. */}
                    <td className={`py-2.5 px-3 text-right tabular-nums text-xs font-medium whitespace-nowrap ${margemAA != null ? margemColor(margemAA) : ''}`}>
                      {margemAA != null
                        ? fmtPct1(margemAA)
                        : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                    {/* ── Bloco TEÓRICO (v5.5.1): depois das contábeis, nunca no meio ── */}
                    {/* Rend. Teórico — DOURADO quando positivo, danger quando negativo.
                        Nunca verde: verde/vermelho já significam resultado REAL nesta
                        mesma linha, e pintar o teórico de verde faria a tela afirmar
                        que a empresa ganhou aquilo. Nulo vira travessão, nunca zero. */}
                    <td className="py-2.5 px-3 text-xs font-medium whitespace-nowrap">
                      {op.rend_float == null ? (
                        <span className="flex justify-end tabular-nums" style={{ color: 'var(--text-muted)' }}>—</span>
                      ) : (
                        <span className="flex justify-between gap-2 tabular-nums">
                          <span className="text-zinc-400">R$</span>
                          <span className={op.rend_float < 0 ? 'text-danger' : 'text-teorico'}>
                            {numBRL2(op.rend_float)}
                          </span>
                        </span>
                      )}
                    </td>
                    {/* Margem Teórica (a.a.) — DOURADO/danger, não a faixa de margem
                        (decisão do Yan, v5.5.1). O par com "Rend. Teórico" ao lado é o
                        que manda: as duas são o mesmo tipo de número (teórico), e a cor
                        agora diz isso. Colorir esta pela faixa de alvo faria uma margem
                        TEÓRICA aparecer verde ao lado de uma margem contábil vermelha —
                        a leitura "no fim das contas estamos bem" que a versão inteira
                        existe para não induzir. */}
                    <td className="py-2.5 px-3 text-right tabular-nums text-xs font-medium whitespace-nowrap">
                      {margemTeoricaAA != null
                        ? <span className={margemTeoricaAA < 0 ? 'text-danger' : 'text-teorico'}>
                            {fmtPct1(margemTeoricaAA)}
                          </span>
                        : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </ScrollAutoHide>

      {/* Paginação */}
      {!loading && data && (totalPaginas > 1 || data.total > 0) && (
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-zinc-100">
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-400">
              Pág. {pagina} / {Math.max(totalPaginas, 1)} · {data.total} resultados
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-zinc-400">Itens:</span>
              <select
                value={String(pageSize)}
                onChange={e => handlePageSizeChange(e.target.value)}
                className="text-xs border border-zinc-200 rounded-md px-1.5 h-7 text-zinc-600 focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] bg-white"
              >
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="50">50</option>
              </select>
            </div>
          </div>
          {totalPaginas > 1 && (
            <div className="flex gap-1">
              <button
                onClick={() => setPagina(p => Math.max(1, p - 1))}
                disabled={pagina <= 1}
                className="px-2.5 h-7 text-xs rounded border border-zinc-200 text-zinc-600 hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ← Ant.
              </button>
              {paginasBtns.map(p => (
                <button
                  key={p}
                  onClick={() => setPagina(p)}
                  className={`w-7 h-7 text-xs rounded border ${
                    p === pagina
                      ? 'border-action-soft-border bg-action-soft text-action-soft-fg font-semibold'
                      : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50'
                  }`}
                >
                  {p}
                </button>
              ))}
              <button
                onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}
                disabled={pagina >= totalPaginas}
                className="px-2.5 h-7 text-xs rounded border border-zinc-200 text-zinc-600 hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Próx. →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
