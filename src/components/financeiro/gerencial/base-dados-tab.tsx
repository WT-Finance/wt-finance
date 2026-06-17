'use client'

import { useState, useTransition, useMemo, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Upload, Trash2, AlertTriangle } from 'lucide-react'
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
  const [buscaInput, setBuscaInput]     = useState('')
  const [busca, setBusca]               = useState('')
  // v4.22.0 (M5) — filtros por coluna (client-side, aditivos sobre a busca geral).
  const [fPessoa, setFPessoa]           = useState('')
  const [fValorMin, setFValorMin]       = useState('')
  const [fDescricao, setFDescricao]     = useState('')
  const [fConta, setFConta]             = useState('')        // '' = todas; nome da conta ou ROTULO_OUTRAS
  const [fVencIni, setFVencIni]         = useState('')
  const [fVencFim, setFVencFim]         = useState('')
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

  // Debounce busca 300ms
  useEffect(() => {
    const t = setTimeout(() => setBusca(buscaInput), 300)
    return () => clearTimeout(t)
  }, [buscaInput])

  useEffect(() => {
    if (criando && primeiroInputRef.current) primeiroInputRef.current.focus()
  }, [criando])

  const filtrados = useMemo(() => {
    const valorMin = fValorMin.trim() === '' ? null : Number(fValorMin)
    return itens
      // filtros existentes (não reescrever)
      .filter(l => tipoFiltro === 'todos' || l.tipo === (tipoFiltro === 'receber' ? 'A receber' : 'A pagar'))
      .filter(l => origemFiltro === 'todos' || l.origem === origemFiltro)
      .filter(l => !busca || l.pessoa.toLowerCase().includes(busca.toLowerCase()))
      // filtros por coluna (v4.22 / M5) — aditivos
      .filter(l => !fPessoa || l.pessoa.toLowerCase().includes(fPessoa.toLowerCase()))
      .filter(l => valorMin == null || Number.isNaN(valorMin) || l.valor_final >= valorMin)
      .filter(l => !fDescricao || (l.descricao ?? '').toLowerCase().includes(fDescricao.toLowerCase()))
      .filter(l => !fConta || canonizarConta(l.conta_previsao, contasReais) === fConta)
      .filter(l => !fVencIni || l.vencimento >= fVencIni)
      .filter(l => !fVencFim || l.vencimento <= fVencFim)
  }, [itens, tipoFiltro, origemFiltro, busca, fPessoa, fValorMin, fDescricao, fConta, fVencIni, fVencFim, contasReais])

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

  const handleDelete = (id: number) => {
    setItens(prev => prev.filter(l => l.id !== id))
    setSelecionados(prev => { const s = new Set(prev); s.delete(id); return s })
  }

  const handleApagarSelecionados = () => {
    startRemover(async () => {
      const res = await deleteLancamentosBulk(idsSelecionados)
      setConfirmBulk(false)
      if (res.success) {
        const apagados = new Set(idsSelecionados)
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
      {/* Header com filtros e ações */}
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div className="flex gap-2 flex-wrap items-center">
          {(['todos', 'receber', 'pagar'] as TipoFiltro[]).map(v => (
            <button key={v} className={[PILL_BASE, tipoFiltro === v ? '' : PILL_INACTIVE].join(' ')}
              style={tipoFiltro === v ? PILL_ACTIVE : undefined} onClick={() => setTipoFiltro(v)}>
              {v === 'todos' ? 'Todos' : v === 'receber' ? 'A receber' : 'A pagar'}
            </button>
          ))}
          <span className="text-zinc-200">·</span>
          {(['todos', 'planilha', 'manual'] as OrigemFiltro[]).map(v => (
            <button key={v} className={[PILL_BASE, origemFiltro === v ? '' : PILL_INACTIVE].join(' ')}
              style={origemFiltro === v ? PILL_ACTIVE : undefined} onClick={() => setOrigemFiltro(v)}>
              {v === 'todos' ? 'Toda origem' : v === 'planilha' ? 'Planilha' : 'Manual'}
            </button>
          ))}
        </div>

        <div className="flex gap-2 items-center">
          {selecionados.size > 0 && (
            <button
              onClick={() => setConfirmBulk(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded text-white transition-opacity"
              style={{ background: 'var(--danger)' }}
            >
              <Trash2 size={12} /> Apagar selecionados ({selecionados.size})
            </button>
          )}
          <input type="text" placeholder="Buscar por pessoa…" value={buscaInput} onChange={e => setBuscaInput(e.target.value)}
            className="px-2.5 py-1.5 text-xs border border-zinc-200 rounded focus:outline-none focus:border-[var(--brand)]" />
          <button onClick={() => setCriando(true)} disabled={criando}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-zinc-200 rounded hover:border-zinc-300 transition-colors disabled:opacity-50">
            <Plus size={12} /> Nova linha
          </button>
          <button onClick={() => setImportOpen(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-white rounded transition-opacity" style={{ background: 'var(--brand)' }}>
            <Upload size={12} /> Importar
          </button>
        </div>
      </div>

      {/* Tabela */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm table-fixed min-w-[760px]">
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
              <th className="py-2 px-2 text-xs font-medium text-zinc-400 w-[120px]">Vencimento</th>
              <th className="py-2 px-2 w-[32px]"></th>
            </tr>
            {/* Filtros por coluna (v4.22 / M5) */}
            <tr className="border-b border-zinc-100 align-top">
              <th className="py-1.5 px-2"></th>
              <th className="py-1.5 px-2 font-normal text-zinc-400 text-[10px]">por tipo ↑</th>
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
                <div className="flex flex-col gap-1">
                  <input type="date" value={fVencIni} onChange={e => setFVencIni(e.target.value)}
                    className={FILTRO_INPUT} aria-label="Vencimento de" title="Vencimento — início" />
                  <input type="date" value={fVencFim} onChange={e => setFVencFim(e.target.value)}
                    className={FILTRO_INPUT} aria-label="Vencimento até" title="Vencimento — fim" />
                </div>
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
          titulo="Apagar lançamentos selecionados"
          confirmarLabel={removendo ? 'Apagando…' : `Apagar ${selecionados.size}`}
          onConfirmar={handleApagarSelecionados}
          onFechar={() => setConfirmBulk(false)}
          mensagem={
            <div className="space-y-2">
              <p>Apagar <strong>{selecionados.size}</strong> lançamento(s) selecionado(s)? Esta ação não pode ser desfeita.</p>
              {planilhaNaSelecao > 0 && (
                <p className="flex items-start gap-1.5 rounded-lg border border-[var(--warning)] bg-[var(--warning-bg)] px-2.5 py-2 text-xs text-[var(--warning)]">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <span>
                    <strong>{planilhaNaSelecao}</strong> {planilhaNaSelecao === 1 ? 'linha vem' : 'linhas vêm'} da planilha curada (origem <em>planilha</em>) —
                    {' '}se ainda {planilhaNaSelecao === 1 ? 'estiver' : 'estiverem'} na planilha, {planilhaNaSelecao === 1 ? 'será re-trazida' : 'serão re-trazidas'} no próximo import.
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
