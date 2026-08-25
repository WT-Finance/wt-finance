'use client'

import { useState, useTransition, useMemo, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Plus, Upload, Trash2, AlertTriangle, CalendarRange, FilterX, X, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react'
import { createLancamento, deleteLancamentosBulk } from '@/app/financeiro/fluxo-caixa/gerencial/actions'
import { LancamentoRow, type Lancamento } from './lancamento-row'
import HistoricoAlteracoes from './historico-alteracoes'
import { useRealtimeGerencial } from './use-realtime-gerencial'
import ImportDrawer from './import-drawer'
import ConfirmModal from '@/components/shared/confirm-modal'
import ScrollAutoHide from '@/components/shared/scroll-auto-hide'
import { Card } from '@/components/ui/card'
import { type Conta } from './tipos'
import { ROTULO_OUTRAS, canonizarConta } from '@/lib/gerencial/normalizar-conta'
import { mascaraMoeda } from '@/lib/fmt'
import { toNum } from '@/lib/carga/coercao'
import { PILL_FILTRO_SM, PILL_FILTRO_INATIVO, PILL_FILTRO_ATIVO_STYLE } from '@/components/shared/botoes'

// Input de filtro por coluna (texto/número/data) — visual discreto, alinhado às pills.
const FILTRO_INPUT = 'w-full text-2xs border border-zinc-200 rounded px-1.5 py-1 bg-white focus:outline-none focus:border-[var(--brand)] placeholder:text-zinc-300'

type TipoFiltro   = 'todos' | 'pagar' | 'receber'
type OrigemFiltro = 'todos' | 'planilha' | 'manual'

// dd/MM a partir de uma data ISO (yyyy-mm-dd) — `vencimento` é date puro (sem fuso), split é seguro.
function fmtVencBr(iso: string): string {
  const [, m, d] = iso.split('-')
  return d && m ? `${d}/${m}` : iso
}

// v4.22 (patch, item 6): filtro de Vencimento por PERÍODO num botão "Personalizado" + popover
// (substitui os dois date-inputs empilhados que quebravam em 2 linhas). Popover via portal
// para escapar do overflow-x-auto da tabela; visual igual ao período personalizado de Weddings.
function FiltroVencimento({ ini, fim, onChange }: {
  ini: string; fim: string; onChange: (ini: string, fim: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos]   = useState<{ top: number; left: number } | null>(null)
  const [li, setLi]     = useState(ini)
  const [lf, setLf]     = useState(fim)
  const btnRef = useRef<HTMLButtonElement>(null)
  const ativo  = !!(ini || fim)

  const abrir = () => {
    const r = btnRef.current?.getBoundingClientRect()
    if (r) {
      // v4.23.2 (item 3): clampar ao viewport para o popover NÃO escapar do box/tela.
      const W = 340, H = 190, M = 8   // largura do popover (w-[340px]); altura aprox.; margem
      const left = Math.min(Math.max(M, r.right - W), window.innerWidth - W - M)
      const top  = r.bottom + 4 + H > window.innerHeight ? Math.max(M, r.top - 4 - H) : r.bottom + 4
      setPos({ top, left })
    }
    setLi(ini); setLf(fim); setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const fechar = () => setOpen(false)
    window.addEventListener('scroll', fechar, true)
    window.addEventListener('resize', fechar)
    return () => { window.removeEventListener('scroll', fechar, true); window.removeEventListener('resize', fechar) }
  }, [open])

  return (
    <>
      <button ref={btnRef} type="button" onClick={abrir}
        title="Filtrar por período de vencimento"
        className={`${FILTRO_INPUT} flex items-center justify-between gap-1 text-left ${ativo ? 'border-brand text-brand font-medium' : 'text-zinc-400'}`}>
        <span className="truncate">{ativo ? `${ini ? fmtVencBr(ini) : '…'}–${fim ? fmtVencBr(fim) : '…'}` : 'Personalizado'}</span>
        <CalendarRange size={12} className="shrink-0" />
      </button>
      {open && pos && createPortal(
        <>
          <div className="fixed inset-0 z-40" onMouseDown={() => setOpen(false)} />
          <div className="fixed z-50 w-[340px] bg-white border border-zinc-200 rounded-xl shadow-lg p-4 font-sans"
            style={{ top: pos.top, left: pos.left }}>
            <p className="text-xs font-semibold mb-3 text-[var(--text-muted)]">Selecione o período de vencimento:</p>
            <div className="flex gap-3 mb-3">
              <div className="flex-1">
                <label className="text-xs mb-1 block text-[var(--text-muted)]">Início</label>
                <input type="date" aria-label="Vencimento — início" value={li} max={lf || undefined}
                  onChange={e => setLi(e.target.value)}
                  className="w-full rounded-md border border-zinc-200 px-2 py-1.5 text-sm focus:outline-none focus:border-brand" />
              </div>
              <div className="flex-1">
                <label className="text-xs mb-1 block text-[var(--text-muted)]">Fim</label>
                <input type="date" aria-label="Vencimento — fim" value={lf} min={li || undefined}
                  onChange={e => setLf(e.target.value)}
                  className="w-full rounded-md border border-zinc-200 px-2 py-1.5 text-sm focus:outline-none focus:border-brand" />
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <button type="button" onClick={() => { setLi(''); setLf(''); onChange('', ''); setOpen(false) }}
                className="text-xs text-zinc-400 hover:text-zinc-600 transition-colors">Limpar</button>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setOpen(false)}
                  className="text-xs px-2 py-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">Cancelar</button>
                <button type="button" onClick={() => { onChange(li, lf); setOpen(false) }}
                  className="text-xs font-medium text-white px-3 py-1.5 rounded-md hover:opacity-90 transition-opacity"
                  style={{ background: 'var(--brand)' }}>Aplicar</button>
              </div>
            </div>
          </div>
        </>,
        document.body,
      )}
    </>
  )
}

// v5.7.2 — ordenação por clique no cabeçalho da Base de Dados. Aplicada DEPOIS dos
// filtros por coluna (nunca antes) e nunca muda o CONJUNTO de linhas exibidas, só a ordem
// — `idsVisiveis`/seleção em massa continuam derivados de `filtrados`, não da ordem.
type ColOrd = 'tipo' | 'pessoa' | 'valor' | 'descricao' | 'conta' | 'vencimento' | 'originador'
type DirOrd = 'asc' | 'desc'

// Direção padrão ao TROCAR de coluna: texto começa em asc (A→Z); número e data em desc
// (maior valor / vencimento mais distante primeiro — leitura mais útil ao abrir a base).
const DIR_PADRAO_COL: Record<ColOrd, DirOrd> = {
  tipo: 'asc', pessoa: 'asc', valor: 'desc', descricao: 'asc', conta: 'asc', vencimento: 'desc', originador: 'asc',
}

function compararTexto(a: string, b: string): number {
  return a.localeCompare(b, 'pt-BR', { sensitivity: 'base' })
}

/** Texto NULÁVEL — vazio/nulo sempre no FIM, em qualquer direção (convenção já usada em
 *  `ranking-caixa.tsx` para colunas que podem faltar dado). */
function compararTextoNulo(a: string | null, b: string | null, dir: DirOrd): number {
  const va = a?.trim() || null
  const vb = b?.trim() || null
  if (va === null && vb === null) return 0
  if (va === null) return 1
  if (vb === null) return -1
  return dir === 'asc' ? compararTexto(va, vb) : compararTexto(vb, va)
}

/** Comparador por coluna. `conta` usa a MESMA `canonizarConta` do filtro de Conta — senão
 *  a ordenação discordaria de "por qual conta esta linha está agrupada no filtro"
 *  (ex.: "Banco Itau" da planilha precisa ordenar junto de "Itaú", não separado). */
function comparadorLancamentos(col: ColOrd, dir: DirOrd, contasReais: string[]) {
  return (a: Lancamento, b: Lancamento): number => {
    switch (col) {
      case 'tipo':       return dir === 'asc' ? compararTexto(a.tipo, b.tipo) : compararTexto(b.tipo, a.tipo)
      case 'pessoa':     return dir === 'asc' ? compararTexto(a.pessoa, b.pessoa) : compararTexto(b.pessoa, a.pessoa)
      case 'valor':      return dir === 'asc' ? a.valor_final - b.valor_final : b.valor_final - a.valor_final
      // vencimento é date puro 'AAAA-MM-DD' (sem fuso) — comparação lexicográfica de
      // string ordena igual a uma comparação de data (mesmo raciocínio de `fmtVencBr`).
      case 'vencimento': return dir === 'asc' ? a.vencimento.localeCompare(b.vencimento) : b.vencimento.localeCompare(a.vencimento)
      case 'descricao':  return compararTextoNulo(a.descricao, b.descricao, dir)
      case 'originador': return compararTextoNulo(a.originador_nome, b.originador_nome, dir)
      case 'conta': {
        const ca = canonizarConta(a.conta_previsao, contasReais)
        const cb = canonizarConta(b.conta_previsao, contasReais)
        return dir === 'asc' ? compararTexto(ca, cb) : compararTexto(cb, ca)
      }
    }
  }
}

/** Cabeçalho ORDENÁVEL — idioma do DS (`ranking-caixa.tsx`/`lista-operacoes.tsx`): ativo =
 *  ArrowUp/ArrowDown; ordenável inativo = ArrowUpDown esmaecido. O gatilho é um
 *  `<button type="button">` DENTRO da `<th>` (focável, entra no tab-order) — a `<th>` em
 *  si NUNCA leva `onClick` (skill `ui-design-system`, receita do "?" de ajuda). */
function ThOrdenavel({ rotulo, col, colAtiva, dir, onOrdenar, className = '' }: {
  rotulo:     string
  col:        ColOrd
  colAtiva:   ColOrd | null
  dir:        DirOrd
  onOrdenar:  (col: ColOrd) => void
  className?: string
}) {
  const ativo = colAtiva === col
  const ariaSort: 'ascending' | 'descending' | 'none' = ativo ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'
  return (
    <th aria-sort={ariaSort} className={`py-2 px-2 text-xs font-medium text-zinc-400 ${className}`}>
      <button
        type="button"
        onClick={() => onOrdenar(col)}
        aria-label={`Ordenar por ${rotulo}`}
        className={`foco-neutro inline-flex items-center gap-0.5 hover:text-zinc-600 transition-colors ${ativo ? 'text-zinc-600' : ''}`}
      >
        {rotulo}
        {ativo
          ? (dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)
          : <ArrowUpDown size={12} className="text-zinc-300" />}
      </button>
    </th>
  )
}

interface Props {
  lancamentos: Lancamento[]
  /** Contas reais (gerencial_saldos) — alimentam o select de Conta e o filtro de Conta (M6). */
  saldos: Conta[]
  /** v5.2.1 (M4): usuário atual — o realtime ignora as PRÓPRIAS mudanças (sem auto-aviso). */
  usuarioId?: string | null
}

export default function BaseDadosTab({ lancamentos: inicial, saldos, usuarioId = null }: Props) {
  const router = useRouter()
  // v5.2.1: aviso vivo (banner) compartilhado por CONFLITO de trava (M5) e por mudança de OUTRO
  // usuário (M4); histKey força o painel de Histórico a recarregar após qualquer mudança/desfazer.
  const [aviso, setAviso] = useState<string | null>(null)
  const [histKey, setHistKey] = useState(0)
  const avisarErecarregar = (msg: string) => { setAviso(msg); setHistKey(k => k + 1); router.refresh() }

  useRealtimeGerencial(usuarioId, p => {
    const quem = p.usuario_nome ?? 'Outro usuário'
    avisarErecarregar(`${quem} alterou ${p.n} ${p.n === 1 ? 'linha' : 'linhas'}.`)
  })

  const [itens, setItens]               = useState<Lancamento[]>(inicial)
  const [tipoFiltro, setTipoFiltro]     = useState<TipoFiltro>('todos')
  const [origemFiltro, setOrigemFiltro] = useState<OrigemFiltro>('todos')
  // v4.22.0 (M5) — filtros por coluna (client-side). v4.23.1: a busca por pessoa do topo saiu
  // (redundante com o filtro de Pessoa na coluna); o tipo idem (filtro na coluna).

  const [fPessoa, setFPessoa]           = useState('')
  const [fValorMin, setFValorMin]       = useState('')
  const [fDescricao, setFDescricao]     = useState('')
  const [fConta, setFConta]             = useState('')        // '' = todas; nome da conta ou ROTULO_OUTRAS
  const [fVencIni, setFVencIni]         = useState('')
  const [fVencFim, setFVencFim]         = useState('')
  const [fOriginador, setFOriginador]   = useState('')        // v4.23.0 — filtro por originador (nome)
  const [importOpen, setImportOpen]     = useState(false)
  const [criando, setCriando]           = useState(false)
  const [novosValores, setNovosValores] = useState<Partial<Lancamento>>({})
  // Texto FORMATADO do campo Valor da nova linha (a máscara de moeda precisa de um estado
  // de string; o número extraído dela vive em `novosValores.valor_final`). Os dois são
  // limpos juntos — ver `limparNovaLinha`.
  const [novoValorDisplay, setNovoValorDisplay] = useState('')
  const [isPending, startCreate]        = useTransition()
  const [, startRefresh]                = useTransition()
  // v4.21.0 (M5) — seleção/exclusão em massa.
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set())
  const [confirmBulk, setConfirmBulk]   = useState(false)
  const [removendo, startRemover]       = useTransition()
  // Sombra sob o cabeçalho fixo só quando a lista está ROLADA (refino v4.34.1).
  const [rolado, setRolado] = useState(false)
  // v5.7.2 — ordenação por clique no cabeçalho. Default: **Vencimento, do mais recente ao
  // mais antigo** (decisão do Yan). O tipo `ColOrd | null` fica: `null` continua sendo um
  // estado alcançável e significa "ordem que veio do servidor" — a base é grande e um dia
  // pode valer um "limpar ordenação". Hoje ninguém o produz, e é de propósito: a tabela
  // nasce ordenada.
  const [colAtiva, setColAtiva] = useState<ColOrd | null>('vencimento')
  const [dirOrd, setDirOrd]     = useState<DirOrd>('desc')
  const ordenarPor = (col: ColOrd) => {
    if (col === colAtiva) setDirOrd(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setColAtiva(col); setDirOrd(DIR_PADRAO_COL[col]) }
  }

  const primeiroInputRef = useRef<HTMLSelectElement>(null)

  // Opções do select/filtro de Conta: contas reais + "Outras" (M6 — fim do texto livre).
  const opcoesContas = useMemo(() => [...saldos.map(s => s.conta), ROTULO_OUTRAS], [saldos])
  const contasReais  = useMemo(() => saldos.map(s => s.conta), [saldos])

  // Re-sincroniza com o servidor (router.refresh após import/mutações). Padrão React
  // "ajustar estado na renderização" (sem efeito). v5.2.1 (b): refresh NÃO-destrutivo — PRESERVA a
  // seleção (antes zerava a cada atualização, atrapalhando ação em massa); só descarta ids que
  // sumiram do servidor. (A trava é preservada por linha: LancamentoRow congela o token em edição.)
  const [prevInicial, setPrevInicial] = useState(inicial)
  if (inicial !== prevInicial) {
    setPrevInicial(inicial)
    setItens(inicial)
    const idsVivos = new Set(inicial.map(l => l.id))
    setSelecionados(prev => new Set([...prev].filter(id => idsVivos.has(id))))
  }

  useEffect(() => {
    if (criando && primeiroInputRef.current) primeiroInputRef.current.focus()
  }, [criando])

  const filtrados = useMemo(() => {
    const valorMin = toNum(fValorMin)   // BR-aware; null se vazio/inválido
    return itens
      // filtros existentes (não reescrever)
      .filter(l => tipoFiltro === 'todos' || l.tipo === (tipoFiltro === 'receber' ? 'A receber' : 'A pagar'))
      .filter(l => origemFiltro === 'todos' || l.origem === origemFiltro)
      // filtros por coluna (v4.22 / M5) — aditivos
      .filter(l => !fPessoa || l.pessoa.toLowerCase().includes(fPessoa.toLowerCase()))
      .filter(l => valorMin == null || l.valor_final >= valorMin)
      .filter(l => !fDescricao || (l.descricao ?? '').toLowerCase().includes(fDescricao.toLowerCase()))
      .filter(l => !fConta || canonizarConta(l.conta_previsao, contasReais) === fConta)
      .filter(l => !fVencIni || l.vencimento >= fVencIni)
      .filter(l => !fVencFim || l.vencimento <= fVencFim)
      .filter(l => !fOriginador || (l.originador_nome ?? '').toLowerCase().includes(fOriginador.toLowerCase()))
  }, [itens, tipoFiltro, origemFiltro, fPessoa, fValorMin, fDescricao, fConta, fVencIni, fVencFim, fOriginador, contasReais])

  // Ordenação (v5.7.2) — aplicada DEPOIS dos filtros, sobre uma CÓPIA de `filtrados`.
  // `filtrados` em si nunca é reordenado: `idsVisiveis`/seleção em massa abaixo continuam
  // lendo o CONJUNTO original, então ordenar não pode alterar o que está selecionável.
  const linhasExibidas = useMemo(() => {
    if (!colAtiva) return filtrados
    return [...filtrados].sort(comparadorLancamentos(colAtiva, dirOrd, contasReais))
  }, [filtrados, colAtiva, dirOrd, contasReais])

  // Algum filtro ativo? (mostra o "Limpar filtros"). Não conta a seleção.
  const filtroAtivo = tipoFiltro !== 'todos' || origemFiltro !== 'todos'
    || !!fPessoa || !!fValorMin || !!fDescricao || !!fConta || !!fVencIni || !!fVencFim || !!fOriginador
  const limparFiltros = () => {
    setTipoFiltro('todos'); setOrigemFiltro('todos')
    setFPessoa(''); setFValorMin(''); setFDescricao(''); setFConta(''); setFVencIni(''); setFVencFim(''); setFOriginador('')
  }

  // ── Seleção ────────────────────────────────────────────────────────────────
  const toggleSel = (id: number) => setSelecionados(prev => {
    const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); return s
  })
  const idsVisiveis = filtrados.map(l => l.id)
  const todosVisiveisSel = idsVisiveis.length > 0 && idsVisiveis.every(id => selecionados.has(id))
  const toggleTodosVisiveis = () => setSelecionados(prev => {
    const s = new Set(prev)
    if (todosVisiveisSel) idsVisiveis.forEach(id => s.delete(id))
    else idsVisiveis.forEach(id => s.add(id))
    return s
  })
  const idsSelecionados = itens.filter(l => selecionados.has(l.id)).map(l => l.id)
  const planilhaNaSelecao = itens.filter(l => selecionados.has(l.id) && l.origem === 'planilha').length

  // v4.23.1 (ajuste): trocar o filtro de ORIGEM RESETA a seleção (sai limpa).
  const mudarOrigem = (novo: OrigemFiltro) => {
    setOrigemFiltro(novo)
    setSelecionados(new Set())
  }

  // v4.23.1 (ajuste): nada selecionado → "Apagar todos" RESPEITA o filtro de origem
  // (Toda → base inteira; Planilha → só planilha; Manual → só manual); com seleção →
  // "Apagar selecionados". Sempre sob confirmação (ConfirmModal).
  const itensNaOrigem      = itens.filter(l => origemFiltro === 'todos' || l.origem === origemFiltro)
  const apagarTodos        = selecionados.size === 0
  const idsParaApagar      = apagarTodos ? itensNaOrigem.map(l => l.id) : idsSelecionados
  const planilhaParaApagar = apagarTodos ? itensNaOrigem.filter(l => l.origem === 'planilha').length : planilhaNaSelecao
  const rotuloOrigem       = origemFiltro === 'planilha' ? ' de origem Planilha' : origemFiltro === 'manual' ? ' de origem Manual' : ''

  const handleDelete = (id: number) => {
    setItens(prev => prev.filter(l => l.id !== id))
    setSelecionados(prev => { const s = new Set(prev); s.delete(id); return s })
  }

  const handleApagar = () => {
    const ids = idsParaApagar
    if (ids.length === 0) { setConfirmBulk(false); return }
    // v5.2.1 (M5): trava otimista em bloco — envia o atualizado_em de cada linha; o banco aborta
    // se ALGUMA mudou por baixo (conflito → avisa, nada é apagado em silêncio).
    const idSet = new Set(ids)
    const esperados: Record<string, string> = {}
    for (const l of itens) if (idSet.has(l.id) && l.atualizado_em) esperados[String(l.id)] = l.atualizado_em
    startRemover(async () => {
      const res = await deleteLancamentosBulk(ids, esperados)
      setConfirmBulk(false)
      if (res.success) {
        const apagados = new Set(ids)
        setItens(prev => prev.filter(l => !apagados.has(l.id)))
        setSelecionados(new Set())
        setHistKey(k => k + 1)
        router.refresh()
      } else {
        avisarErecarregar(res.error)
      }
    })
  }

  /** Fecha o formulário de nova linha zerando os DOIS estados que o alimentam — o número
   *  (`novosValores`) e o texto formatado do campo Valor. Esquecer o segundo deixaria o
   *  valor antigo visível ao reabrir o "Adicionar", sem número por trás. */
  const limparNovaLinha = () => {
    setCriando(false)
    setNovosValores({})
    setNovoValorDisplay('')
  }

  const handleSalvarNovo = () => {
    const { tipo, pessoa, valor_final, vencimento } = novosValores
    if (!tipo || !pessoa || valor_final == null || !vencimento) return
    startCreate(async () => {
      const res = await createLancamento({
        tipo: tipo as 'A pagar' | 'A receber',
        pessoa,
        valor_final: Number(valor_final),
        descricao:      novosValores.descricao      ?? null,
        conta_previsao: novosValores.conta_previsao ?? null,
        vencimento,
      })
      if (res.success) {
        setItens(prev => [res.lancamento as unknown as Lancamento, ...prev])
        limparNovaLinha()
      }
    })
  }

  const handleImportClose = (imported?: boolean) => {
    setImportOpen(false)
    if (imported) startRefresh(() => { router.refresh() })
  }

  return (
    <>
    {/* Card em volta: a tabela vive sobre fundo BRANCO (padrão DS), não no fundo cru da página. */}
    <Card>
    <div>
      {/* Aviso vivo (v5.2.1): conflito de trava (M5) ou mudança de outro usuário (M4). */}
      {aviso && (
        <div className="mb-3 flex items-start justify-between gap-2 rounded-lg border border-[var(--warning)] bg-[var(--warning-bg)] px-3 py-2 text-xs text-[var(--warning)]">
          <span className="flex items-start gap-1.5">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>{aviso} A lista foi atualizada.</span>
          </span>
          <button onClick={() => setAviso(null)} title="Dispensar" className="shrink-0 opacity-70 hover:opacity-100">
            <X size={14} />
          </button>
        </div>
      )}
      {/* Header com filtros e ações (v4.23.1: tipo e busca por pessoa saíram — filtros na coluna). */}
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div className="flex gap-2 flex-wrap items-center">
          {(['todos', 'planilha', 'manual'] as OrigemFiltro[]).map(v => (
            <button key={v} className={[PILL_FILTRO_SM, origemFiltro === v ? '' : PILL_FILTRO_INATIVO].join(' ')}
              style={origemFiltro === v ? PILL_FILTRO_ATIVO_STYLE : undefined} onClick={() => mudarOrigem(v)}>
              {v === 'todos' ? 'Toda origem' : v === 'planilha' ? 'Planilha' : 'Manual'}
            </button>
          ))}
        </div>

        <div className="flex gap-2 items-center">
          <button onClick={() => setCriando(true)} disabled={criando}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-zinc-200 rounded hover:border-zinc-300 transition-colors disabled:opacity-50">
            <Plus size={12} /> Nova linha
          </button>
          <button onClick={() => setImportOpen(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-white rounded transition-opacity" style={{ background: 'var(--brand)' }}>
            <Upload size={12} /> Importar
          </button>
          {/* Apagar (item 3): largura FIXA; rótulo alterna todos/selecionados; "todos" respeita a origem. */}
          <button onClick={() => setConfirmBulk(true)} disabled={idsParaApagar.length === 0}
            title={apagarTodos ? `Apagar todos os lançamentos${rotuloOrigem || ' da base'}` : `Apagar ${selecionados.size} selecionado(s)`}
            className="flex items-center justify-center gap-1 w-[164px] px-2.5 py-1.5 text-xs rounded border border-[var(--danger)] text-[var(--danger)] hover:bg-[var(--danger-bg)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            <Trash2 size={12} /> {apagarTodos ? 'Apagar todos' : 'Apagar selecionados'}
          </button>
        </div>
      </div>

      {/* Tabela */}
      {/* Scroll INTERNO (x + y) com cabeçalho FIXO. border-separate (não collapse): em
          collapse, borda e fundo não acompanham o sticky de forma confiável e as linhas
          VAZAM pelo cabeçalho ao rolar. Em separate, cada CÉLULA pinta fundo + borda e
          tudo gruda junto — por isso as bordas ficam nos th/td, nunca no <tr>.
          Sem min-w: Descrição/Conta/Originador são flexíveis e truncam — a tabela cabe no
          container sem barra horizontal (refino v4.34.1). */}
      <ScrollAutoHide eixo="both" className="max-h-[70vh] pr-3" onScroll={e => setRolado(e.currentTarget.scrollTop > 0)}>
        <table className="w-full text-sm table-fixed border-separate border-spacing-0">
          <thead className={`sticky top-0 z-20 [&_tr:first-child_th:first-child]:rounded-tl-lg [&_tr:first-child_th:last-child]:rounded-tr-lg [&_th]:bg-zinc-50 [&_tr:first-child_th]:border-b [&_tr:first-child_th]:border-zinc-100 [&_tr:last-child_th]:border-b [&_tr:last-child_th]:border-zinc-200 ${rolado ? '[&_tr:last-child_th]:shadow-[0_6px_8px_-6px_rgba(28,25,23,0.22)]' : ''}`}>
            <tr className="text-left">
              <th className="py-2 px-2 w-[32px] text-center">
                <input type="checkbox" checked={todosVisiveisSel} onChange={toggleTodosVisiveis}
                  className="accent-[var(--brand)] cursor-pointer" aria-label="Selecionar todos os visíveis" />
              </th>
              <ThOrdenavel rotulo="Tipo" col="tipo" colAtiva={colAtiva} dir={dirOrd} onOrdenar={ordenarPor} className="w-[92px]" />
              <ThOrdenavel rotulo="Pessoa" col="pessoa" colAtiva={colAtiva} dir={dirOrd} onOrdenar={ordenarPor} className="w-[18%]" />
              <ThOrdenavel rotulo="Valor" col="valor" colAtiva={colAtiva} dir={dirOrd} onOrdenar={ordenarPor} className="text-right w-[124px]" />
              <ThOrdenavel rotulo="Descrição" col="descricao" colAtiva={colAtiva} dir={dirOrd} onOrdenar={ordenarPor} />
              <ThOrdenavel rotulo="Conta" col="conta" colAtiva={colAtiva} dir={dirOrd} onOrdenar={ordenarPor} />
              <ThOrdenavel rotulo="Vencimento" col="vencimento" colAtiva={colAtiva} dir={dirOrd} onOrdenar={ordenarPor} className="w-[100px]" />
              <ThOrdenavel rotulo="Originador" col="originador" colAtiva={colAtiva} dir={dirOrd} onOrdenar={ordenarPor} />
              <th className="py-2 px-2 w-[92px]"></th>
            </tr>
            {/* Filtros por coluna (v4.22 / M5) */}
            <tr className="align-top">
              <th className="py-1.5 px-2"></th>
              <th className="py-1.5 px-2">
                <select value={tipoFiltro} onChange={e => setTipoFiltro(e.target.value as TipoFiltro)}
                  className={FILTRO_INPUT} aria-label="Filtrar por tipo">
                  <option value="todos">Todos</option>
                  <option value="receber">A receber</option>
                  <option value="pagar">A pagar</option>
                </select>
              </th>
              <th className="py-1.5 px-2">
                <input type="text" placeholder="Pessoa…" value={fPessoa} onChange={e => setFPessoa(e.target.value)}
                  className={FILTRO_INPUT} aria-label="Filtrar por pessoa" />
              </th>
              <th className="py-1.5 px-2">
                <input type="text" inputMode="decimal" placeholder="≥ valor" value={fValorMin} onChange={e => setFValorMin(e.target.value)}
                  className={`${FILTRO_INPUT} text-right`} aria-label="Filtrar por valor mínimo" />
              </th>
              <th className="py-1.5 px-2">
                <input type="text" placeholder="Descrição…" value={fDescricao} onChange={e => setFDescricao(e.target.value)}
                  className={FILTRO_INPUT} aria-label="Filtrar por descrição" />
              </th>
              <th className="py-1.5 px-2">
                <select value={fConta} onChange={e => setFConta(e.target.value)}
                  className={FILTRO_INPUT} aria-label="Filtrar por conta">
                  <option value="">Toda conta</option>
                  {opcoesContas.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </th>
              <th className="py-1.5 px-2">
                <FiltroVencimento ini={fVencIni} fim={fVencFim}
                  onChange={(i, f) => { setFVencIni(i); setFVencFim(f) }} />
              </th>
              <th className="py-1.5 px-2">
                <input type="text" placeholder="Originador…" value={fOriginador} onChange={e => setFOriginador(e.target.value)}
                  className={FILTRO_INPUT} aria-label="Filtrar por originador" />
              </th>
              <th className="py-1.5 px-2">
                {filtroAtivo && (
                  <button type="button" onClick={limparFiltros} title="Limpar filtros"
                    className="flex items-center gap-1 text-2xs text-zinc-400 hover:text-[var(--brand)] transition-colors whitespace-nowrap">
                    <FilterX size={12} /> Limpar
                  </button>
                )}
              </th>
            </tr>
          </thead>
          <tbody>
            {/* Nova linha inline */}
            {criando && (
              <tr className="[&>td]:border-b [&>td]:border-[var(--brand)] bg-[var(--brand-soft)]/20">
                <td className="py-1 px-2"></td>
                <td className="py-1 px-2">
                  <select ref={primeiroInputRef} value={novosValores.tipo ?? ''}
                    onChange={e => setNovosValores(p => ({ ...p, tipo: e.target.value as Lancamento['tipo'] }))}
                    className="w-full text-xs border border-zinc-200 rounded px-1 py-0.5 bg-white">
                    <option value="">Tipo…</option>
                    <option>A pagar</option>
                    <option>A receber</option>
                  </select>
                </td>
                <td className="py-1 px-2">
                  <input type="text" placeholder="Pessoa" value={novosValores.pessoa ?? ''}
                    onChange={e => setNovosValores(p => ({ ...p, pessoa: e.target.value }))}
                    className="w-full text-xs border border-zinc-200 rounded px-1 py-0.5" />
                </td>
                <td className="py-1 px-2">
                  {/* Máscara de moeda ao vivo — MESMO `mascaraMoeda` que a edição inline
                      desta coluna já usa em `lancamento-row.tsx` (dígitos como centavos,
                      `-` em qualquer posição = negativo). Era o único campo de dinheiro
                      da tela ainda em `type="number"` cru: digitar aqui não formatava e
                      quem digitasse "1.234,56" via o browser rejeitar a vírgula em
                      silêncio. O display mora num estado de STRING próprio porque
                      `novosValores` é `Partial<Lancamento>` e `valor_final` é `number`. */}
                  <input type="text" inputMode="numeric" placeholder="R$ 0,00" value={novoValorDisplay}
                    onChange={e => {
                      const { display, valor } = mascaraMoeda(e.target.value)
                      setNovoValorDisplay(display)
                      setNovosValores(p => ({ ...p, valor_final: valor ?? undefined }))
                    }}
                    className="w-full text-xs border border-zinc-200 rounded px-1 py-0.5 text-right tabular-nums" />
                </td>
                <td className="py-1 px-2">
                  <input type="text" placeholder="Descrição" value={novosValores.descricao ?? ''}
                    onChange={e => setNovosValores(p => ({ ...p, descricao: e.target.value }))}
                    className="w-full text-xs border border-zinc-200 rounded px-1 py-0.5" />
                </td>
                <td className="py-1 px-2">
                  <select value={novosValores.conta_previsao ?? ''}
                    onChange={e => setNovosValores(p => ({ ...p, conta_previsao: e.target.value || null }))}
                    className="w-full text-xs border border-zinc-200 rounded px-1 py-0.5 bg-white">
                    <option value="">Conta…</option>
                    {opcoesContas.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </td>
                <td className="py-1 px-2">
                  <input type="date" value={novosValores.vencimento ?? ''}
                    onChange={e => setNovosValores(p => ({ ...p, vencimento: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') handleSalvarNovo() }}
                    className="w-full text-xs border border-zinc-200 rounded px-1 py-0.5" />
                </td>
                {/* Originador é definido no servidor (sessão) ao salvar; aparece após o refresh. */}
                <td className="py-1 px-2 text-xs text-zinc-300">—</td>
                <td className="py-1 px-2">
                  <div className="flex gap-1 justify-end">
                    <button onClick={handleSalvarNovo} disabled={isPending}
                      className="text-3xs px-1.5 py-0.5 rounded text-white disabled:opacity-50" style={{ background: 'var(--brand)' }}>
                      Salvar
                    </button>
                    <button onClick={limparNovaLinha}
                      className="text-3xs px-1.5 py-0.5 rounded border border-zinc-200 text-zinc-400">✕</button>
                  </div>
                </td>
              </tr>
            )}

            {linhasExibidas.map(l => (
              <LancamentoRow
                key={l.id}
                lancamento={l}
                contasOpcoes={opcoesContas}
                onDelete={() => handleDelete(l.id)}
                selecionado={selecionados.has(l.id)}
                onToggleSelecao={() => toggleSel(l.id)}
                onConflito={avisarErecarregar}
              />
            ))}
          </tbody>
        </table>
      </ScrollAutoHide>

      {/* Footer */}
      <p className="mt-2 text-3xs text-[var(--text-muted)]">
        {filtrados.length} de {itens.length} lançamentos
        {selecionados.size > 0 && <> · {selecionados.size} selecionado(s)</>}
      </p>

      <ImportDrawer open={importOpen} onClose={() => handleImportClose(true)} />

      {confirmBulk && (
        <ConfirmModal
          titulo={apagarTodos ? 'Apagar todos os lançamentos' : 'Apagar lançamentos selecionados'}
          confirmarLabel={removendo ? 'Apagando…' : apagarTodos ? `Apagar todos (${idsParaApagar.length})` : `Apagar ${selecionados.size}`}
          onConfirmar={handleApagar}
          onFechar={() => setConfirmBulk(false)}
          mensagem={
            <div className="space-y-2">
              {apagarTodos
                ? <p>Apagar <strong>todos os {idsParaApagar.length}</strong> lançamentos{rotuloOrigem}? Você pode reverter pelo <strong>Histórico de alterações</strong> logo abaixo.</p>
                : <p>Apagar <strong>{selecionados.size}</strong> lançamento(s) selecionado(s)? Você pode reverter pelo <strong>Histórico de alterações</strong> logo abaixo.</p>}
              {planilhaParaApagar > 0 && (
                <p className="flex items-start gap-1.5 rounded-lg border border-[var(--warning)] bg-[var(--warning-bg)] px-2.5 py-2 text-xs text-[var(--warning)]">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <span>
                    <strong>{planilhaParaApagar}</strong> {planilhaParaApagar === 1 ? 'linha vem' : 'linhas vêm'} da planilha curada (origem <em>planilha</em>) —
                    {' '}se ainda {planilhaParaApagar === 1 ? 'estiver' : 'estiverem'} na planilha, {planilhaParaApagar === 1 ? 'será re-trazida' : 'serão re-trazidas'} no próximo import.
                  </span>
                </p>
              )}
            </div>
          }
        />
      )}
    </div>
    </Card>
    {/* v5.2.1 (M3): painel de histórico + desfazer, logo abaixo da base. */}
    <HistoricoAlteracoes recarregarKey={histKey} onDesfeito={() => { setHistKey(k => k + 1); router.refresh() }} />
    </>
  )
}
