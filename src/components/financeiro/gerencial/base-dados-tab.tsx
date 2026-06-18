'use client'

import { useState, useTransition, useMemo, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Plus, Upload, Trash2, AlertTriangle, CalendarRange } from 'lucide-react'
import { createLancamento, deleteLancamentosBulk } from '@/app/financeiro/fluxo-caixa/gerencial/actions'
import { LancamentoRow, type Lancamento } from './lancamento-row'
import ImportDrawer from './import-drawer'
import ConfirmModal from '@/components/shared/confirm-modal'
import { type Conta } from './tipos'
import { ROTULO_OUTRAS, canonizarConta } from '@/lib/gerencial/normalizar-conta'

const PILL_BASE     = 'px-2.5 py-0.5 rounded-full text-[11px] font-medium border transition-colors whitespace-nowrap'
const PILL_INACTIVE = 'border-zinc-200 text-zinc-500 hover:border-zinc-300 hover:bg-zinc-50'
const PILL_ACTIVE   = { background: 'var(--brand-soft)', borderColor: 'var(--brand)', color: 'var(--brand-deep)' }

// Input de filtro por coluna (texto/número/data) — visual discreto, alinhado às pills.
const FILTRO_INPUT = 'w-full text-[11px] border border-zinc-200 rounded px-1.5 py-1 bg-white focus:outline-none focus:border-[var(--brand)] placeholder:text-zinc-300'

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
    if (r) setPos({ top: r.bottom + 4, left: Math.max(8, r.right - 288) }) // 288 = w-72
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
          <div className="fixed z-50 w-72 bg-white border border-zinc-200 rounded-xl shadow-lg p-4 font-sans"
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

interface Props {
  lancamentos: Lancamento[]
  /** Contas reais (gerencial_saldos) — alimentam o select de Conta e o filtro de Conta (M6). */
  saldos: Conta[]
}

export default function BaseDadosTab({ lancamentos: inicial, saldos }: Props) {
  const router = useRouter()

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
  const [isPending, startCreate]        = useTransition()
  const [, startRefresh]                = useTransition()
  // v4.21.0 (M5) — seleção/exclusão em massa.
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set())
  const [confirmBulk, setConfirmBulk]   = useState(false)
  const [removendo, startRemover]       = useTransition()

  const primeiroInputRef = useRef<HTMLSelectElement>(null)

  // Opções do select/filtro de Conta: contas reais + "Outras" (M6 — fim do texto livre).
  const opcoesContas = useMemo(() => [...saldos.map(s => s.conta), ROTULO_OUTRAS], [saldos])
  const contasReais  = useMemo(() => saldos.map(s => s.conta), [saldos])

  // Re-sincroniza com o servidor (router.refresh após import/mutações). Padrão React
  // "ajustar estado na renderização" (sem efeito); limpa a seleção pois os ids mudam.
  const [prevInicial, setPrevInicial] = useState(inicial)
  if (inicial !== prevInicial) { setPrevInicial(inicial); setItens(inicial); setSelecionados(new Set()) }

  useEffect(() => {
    if (criando && primeiroInputRef.current) primeiroInputRef.current.focus()
  }, [criando])

  const filtrados = useMemo(() => {
    const valorMin = fValorMin.trim() === '' ? null : Number(fValorMin)
    return itens
      // filtros existentes (não reescrever)
      .filter(l => tipoFiltro === 'todos' || l.tipo === (tipoFiltro === 'receber' ? 'A receber' : 'A pagar'))
      .filter(l => origemFiltro === 'todos' || l.origem === origemFiltro)
      // filtros por coluna (v4.22 / M5) — aditivos
      .filter(l => !fPessoa || l.pessoa.toLowerCase().includes(fPessoa.toLowerCase()))
      .filter(l => valorMin == null || Number.isNaN(valorMin) || l.valor_final >= valorMin)
      .filter(l => !fDescricao || (l.descricao ?? '').toLowerCase().includes(fDescricao.toLowerCase()))
      .filter(l => !fConta || canonizarConta(l.conta_previsao, contasReais) === fConta)
      .filter(l => !fVencIni || l.vencimento >= fVencIni)
      .filter(l => !fVencFim || l.vencimento <= fVencFim)
      .filter(l => !fOriginador || (l.originador_nome ?? '').toLowerCase().includes(fOriginador.toLowerCase()))
  }, [itens, tipoFiltro, origemFiltro, fPessoa, fValorMin, fDescricao, fConta, fVencIni, fVencFim, fOriginador, contasReais])

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

  // v4.23.1 (item 3): a seleção acompanha o filtro de ORIGEM — ao trocar a origem com algo
  // selecionado, a seleção é intersectada com os lançamentos daquela origem.
  const mudarOrigem = (novo: OrigemFiltro) => {
    setOrigemFiltro(novo)
    setSelecionados(prev => {
      if (prev.size === 0) return prev
      const naOrigem = new Set(itens.filter(l => novo === 'todos' || l.origem === novo).map(l => l.id))
      return new Set([...prev].filter(id => naOrigem.has(id)))
    })
  }

  // v4.23.1 (item 3): nada selecionado → "Apagar todos" apaga a BASE inteira (ignora filtros);
  // com seleção → "Apagar selecionados". Sempre sob confirmação (ConfirmModal).
  const apagarTodos        = selecionados.size === 0
  const idsParaApagar      = apagarTodos ? itens.map(l => l.id) : idsSelecionados
  const planilhaParaApagar = apagarTodos ? itens.filter(l => l.origem === 'planilha').length : planilhaNaSelecao

  const handleDelete = (id: number) => {
    setItens(prev => prev.filter(l => l.id !== id))
    setSelecionados(prev => { const s = new Set(prev); s.delete(id); return s })
  }

  const handleApagar = () => {
    const ids = idsParaApagar
    if (ids.length === 0) { setConfirmBulk(false); return }
    startRemover(async () => {
      const res = await deleteLancamentosBulk(ids)
      setConfirmBulk(false)
      if (res.success) {
        const apagados = new Set(ids)
        setItens(prev => prev.filter(l => !apagados.has(l.id)))
        setSelecionados(new Set())
        router.refresh()
      }
    })
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
        setCriando(false)
        setNovosValores({})
      }
    })
  }

  const handleImportClose = (imported?: boolean) => {
    setImportOpen(false)
    if (imported) startRefresh(() => { router.refresh() })
  }

  return (
    <div>
      {/* Header com filtros e ações (v4.23.1: tipo e busca por pessoa saíram — filtros na coluna). */}
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div className="flex gap-2 flex-wrap items-center">
          {(['todos', 'planilha', 'manual'] as OrigemFiltro[]).map(v => (
            <button key={v} className={[PILL_BASE, origemFiltro === v ? '' : PILL_INACTIVE].join(' ')}
              style={origemFiltro === v ? PILL_ACTIVE : undefined} onClick={() => mudarOrigem(v)}>
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
          {/* Apagar (item 3): largura FIXA; rótulo alterna todos/selecionados; nada selecionado = base inteira. */}
          <button onClick={() => setConfirmBulk(true)} disabled={itens.length === 0}
            title={apagarTodos ? 'Apagar todos os lançamentos da base' : `Apagar ${selecionados.size} selecionado(s)`}
            className="flex items-center justify-center gap-1 w-[164px] px-2.5 py-1.5 text-xs rounded border border-[var(--danger)] text-[var(--danger)] hover:bg-[var(--danger-bg)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            <Trash2 size={12} /> {apagarTodos ? 'Apagar todos' : 'Apagar selecionados'}
          </button>
        </div>
      </div>

      {/* Tabela */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm table-fixed min-w-[860px]">
          <thead>
            <tr className="border-b border-zinc-100 text-left">
              <th className="py-2 px-2 w-[32px] text-center">
                <input type="checkbox" checked={todosVisiveisSel} onChange={toggleTodosVisiveis}
                  className="accent-[var(--brand)] cursor-pointer" aria-label="Selecionar todos os visíveis" />
              </th>
              <th className="py-2 px-2 text-xs font-medium text-zinc-400 w-[96px]">Tipo</th>
              <th className="py-2 px-2 text-xs font-medium text-zinc-400 w-[150px]">Pessoa</th>
              <th className="py-2 px-2 text-xs font-medium text-zinc-400 text-right w-[130px]">Valor</th>
              <th className="py-2 px-2 text-xs font-medium text-zinc-400 w-[160px]">Descrição</th>
              <th className="py-2 px-2 text-xs font-medium text-zinc-400 w-[140px]">Conta</th>
              <th className="py-2 px-2 text-xs font-medium text-zinc-400 w-[104px]">Vencimento</th>
              <th className="py-2 px-2 text-xs font-medium text-zinc-400 w-[110px]">Originador</th>
              <th className="py-2 px-2 w-[96px]"></th>
            </tr>
            {/* Filtros por coluna (v4.22 / M5) */}
            <tr className="border-b border-zinc-100 align-top">
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
                <input type="number" step="0.01" placeholder="≥ valor" value={fValorMin} onChange={e => setFValorMin(e.target.value)}
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
              <th className="py-1.5 px-2"></th>
            </tr>
          </thead>
          <tbody>
            {/* Nova linha inline */}
            {criando && (
              <tr className="border-b border-[var(--brand)] bg-[var(--brand-soft)]/20">
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
                  <input type="number" step="0.01" placeholder="0,00" value={novosValores.valor_final ?? ''}
                    onChange={e => setNovosValores(p => ({ ...p, valor_final: Number(e.target.value) }))}
                    className="w-full text-xs border border-zinc-200 rounded px-1 py-0.5 text-right" />
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
                      className="text-[10px] px-1.5 py-0.5 rounded text-white disabled:opacity-50" style={{ background: 'var(--brand)' }}>
                      Salvar
                    </button>
                    <button onClick={() => { setCriando(false); setNovosValores({}) }}
                      className="text-[10px] px-1.5 py-0.5 rounded border border-zinc-200 text-zinc-400">✕</button>
                  </div>
                </td>
              </tr>
            )}

            {filtrados.map(l => (
              <LancamentoRow
                key={l.id}
                lancamento={l}
                contasOpcoes={opcoesContas}
                onDelete={() => handleDelete(l.id)}
                selecionado={selecionados.has(l.id)}
                onToggleSelecao={() => toggleSel(l.id)}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <p className="mt-2 text-[10px] text-[var(--text-muted)]">
        {filtrados.length} de {itens.length} lançamentos
        {selecionados.size > 0 && <> · {selecionados.size} selecionado(s)</>}
      </p>

      <ImportDrawer open={importOpen} onClose={() => handleImportClose(true)} />

      {confirmBulk && (
        <ConfirmModal
          titulo={apagarTodos ? 'Apagar TODOS os lançamentos' : 'Apagar lançamentos selecionados'}
          confirmarLabel={removendo ? 'Apagando…' : apagarTodos ? `Apagar todos (${itens.length})` : `Apagar ${selecionados.size}`}
          onConfirmar={handleApagar}
          onFechar={() => setConfirmBulk(false)}
          mensagem={
            <div className="space-y-2">
              {apagarTodos
                ? <p>Apagar <strong>TODOS os {itens.length}</strong> lançamentos da base? Isto ignora os filtros ativos na tela e <strong>não pode ser desfeito</strong>.</p>
                : <p>Apagar <strong>{selecionados.size}</strong> lançamento(s) selecionado(s)? Esta ação não pode ser desfeita.</p>}
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
  )
}
