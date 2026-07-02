'use client'

// Faturamento Corporativo — Fase 3 (v4.33.0). Aba "Cadastro de Clientes".
// Cadastro gerenciável dos clientes corporativos (traz a planilha paralela p/ a plataforma).
// REUSA a mecânica do Fluxo de Caixa Gerencial: tabela editável (edição inline por célula),
// filtro de origem (Toda/Planilha/Manual), Nova linha (manual), Importar (substitui planilha,
// mantém manual), Apagar (respeita o filtro de origem). Cadastro é REFERÊNCIA (Visão A): só
// guarda os dados; a Emissão NÃO consome isto ainda. Destinatários = texto (split = Fase 4).

import { useState, useMemo, useRef, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Upload, Trash2, Loader2, Check, X, FileSpreadsheet, PencilLine, AlertTriangle } from 'lucide-react'
import ConfirmModal from '@/components/shared/confirm-modal'
import { parseClientesCorpFile } from '@/lib/faturamento/parse-clientes-corp'
import {
  inserirClienteCorp, atualizarClienteCorp, excluirClienteCorp, apagarClientesCorp,
  importarClientesCorp, type ResultadoImportClientes,
} from '@/app/financeiro/faturamento-corp/cadastro-actions'

export interface ClienteCorp {
  id:            number
  empresa:       string
  situacao:      string | null
  faturar_em:    string | null
  vencimento:    string | null
  obs:           string | null
  pct_juros:     string | null
  pct_multa:     string | null
  destinatarios: string | null
  forma_pgto:    string | null
  contato_whats: string | null
  origem:        string
}

type CampoEditavel = 'empresa' | 'situacao' | 'faturar_em' | 'vencimento' | 'obs' | 'pct_juros' | 'pct_multa' | 'destinatarios' | 'forma_pgto' | 'contato_whats'
type SituacaoFiltro = 'todas' | 'ativo' | 'inativo'

const FILTRO_INPUT = 'w-full text-2xs border border-zinc-200 rounded px-1.5 py-1 bg-white focus:outline-none focus:border-[var(--setor-corporativo)] placeholder:text-zinc-300'
const EDIT_BORDER  = 'border border-[var(--setor-corporativo)]'

// ── Célula editável (texto ou select). onSave retorna false → reverte + estado de erro. ──
function EditableCell({ value, onSave, type = 'text', options, truncate = true }: {
  value: string | null
  onSave: (v: string) => Promise<boolean>
  type?: 'text' | 'select'
  options?: { value: string; label: string }[]
  truncate?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [localVal, setLocalVal] = useState(value ?? '')
  const [state, setState] = useState<{ saving: boolean; saved: boolean; error: boolean }>({ saving: false, saved: false, error: false })

  const save = async () => {
    if (localVal === (value ?? '')) { setEditing(false); return }
    setState({ saving: true, saved: false, error: false })
    const ok = await onSave(localVal)
    if (ok) {
      setState({ saving: false, saved: true, error: false })
      setEditing(false)
      setTimeout(() => setState(s => ({ ...s, saved: false })), 1200)
    } else {
      setLocalVal(value ?? '') // reverte
      setState({ saving: false, saved: false, error: true })
      setEditing(false)
      setTimeout(() => setState(s => ({ ...s, error: false })), 2000)
    }
  }

  const display = value ?? '—'
  const icon = state.saved ? <Check size={10} className="inline ml-1 shrink-0 text-success" />
    : state.saving ? <Loader2 size={10} className="inline ml-1 shrink-0 animate-spin" />
    : state.error ? <X size={10} className="inline ml-1 shrink-0 text-danger" />
    : null

  if (type === 'select' && options) {
    return (
      <td className="py-1 px-2">
        {editing ? (
          <select autoFocus value={localVal} onChange={e => setLocalVal(e.target.value)} onBlur={save}
            className={`w-full text-xs ${EDIT_BORDER} rounded px-1 py-0.5 outline-none bg-white`}>
            <option value="">—</option>
            {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ) : (
          <span onClick={() => setEditing(true)} className="cursor-pointer text-xs hover:text-[var(--setor-corporativo)] transition-colors block truncate" title={String(display)}>
            {options.find(o => o.value === value)?.label ?? display}{icon}
          </span>
        )}
      </td>
    )
  }

  return (
    <td className="py-1 px-2">
      {editing ? (
        <input autoFocus type="text" value={localVal} onChange={e => setLocalVal(e.target.value)} onBlur={save}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setLocalVal(value ?? ''); setEditing(false) } }}
          className={`w-full text-xs ${EDIT_BORDER} rounded px-1 py-0.5 outline-none min-w-0`} />
      ) : (
        <span onClick={() => setEditing(true)} className="cursor-pointer text-xs hover:text-[var(--setor-corporativo)] transition-colors flex items-center gap-1 min-w-0">
          <span className={`block ${truncate ? 'truncate' : ''}`} title={String(display)}>{display}</span>{icon}
        </span>
      )}
    </td>
  )
}

const situacaoBadge = (s: string | null): ReactNode => {
  if (s === 'ativo')   return <span className="inline-block rounded-full border border-success bg-success-bg text-success px-2 py-0.5 text-3xs font-medium">Ativo</span>
  if (s === 'inativo') return <span className="inline-block rounded-full border border-zinc-200 bg-zinc-100 text-zinc-500 px-2 py-0.5 text-3xs font-medium">Inativo</span>
  return <span className="text-zinc-400 text-xs">—</span>
}

interface Props {
  clientes: ClienteCorp[]
}

export default function CadastroClientes({ clientes: inicial }: Props) {
  const router = useRouter()
  const inputFile = useRef<HTMLInputElement>(null)

  const [itens, setItens]             = useState<ClienteCorp[]>(inicial)
  const [situacaoFiltro, setSituacao] = useState<SituacaoFiltro>('ativo')
  const [fEmpresa, setFEmpresa]       = useState('')
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set())
  const [confirmBulk, setConfirmBulk] = useState(false)
  const [removendo, startRemover]     = useTransition()

  const [criando, setCriando]         = useState(false)
  const [novo, setNovo]               = useState<Partial<ClienteCorp>>({})
  const [erroNovo, setErroNovo]       = useState<string | null>(null)
  const [salvandoNovo, startSalvar]   = useTransition()

  const [importando, setImportando]   = useState(false)
  const [erroImport, setErroImport]   = useState<string | null>(null)
  const [resultado, setResultado]     = useState<ResultadoImportClientes | null>(null)
  const [, startRefresh]              = useTransition()

  // Re-sincroniza com o servidor após mutações (router.refresh). Padrão "ajustar na renderização".
  const [prevInicial, setPrevInicial] = useState(inicial)
  if (inicial !== prevInicial) { setPrevInicial(inicial); setItens(inicial); setSelecionados(new Set()) }

  const filtrados = useMemo(() => itens
    .filter(c => situacaoFiltro === 'todas' || (c.situacao ?? '') === situacaoFiltro)
    .filter(c => !fEmpresa || c.empresa.toLowerCase().includes(fEmpresa.toLowerCase())),
  [itens, situacaoFiltro, fEmpresa])

  const totais = useMemo(() => ({
    total: itens.length,
    planilha: itens.filter(c => c.origem === 'planilha').length,
    manual: itens.filter(c => c.origem === 'manual').length,
    ativos: itens.filter(c => c.situacao === 'ativo').length,
  }), [itens])

  // ── Seleção ────────────────────────────────────────────────────────────────
  const toggleSel = (id: number) => setSelecionados(prev => { const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); return s })
  const idsVisiveis = filtrados.map(c => c.id)
  const todosSel = idsVisiveis.length > 0 && idsVisiveis.every(id => selecionados.has(id))
  const toggleTodos = () => setSelecionados(prev => {
    const s = new Set(prev)
    if (todosSel) idsVisiveis.forEach(id => s.delete(id)); else idsVisiveis.forEach(id => s.add(id))
    return s
  })
  // Apagar: sem seleção → todos; com seleção → selecionados.
  const apagarTodos = selecionados.size === 0
  const idsApagar   = apagarTodos ? itens.map(c => c.id) : itens.filter(c => selecionados.has(c.id)).map(c => c.id)

  const handleApagar = () => {
    if (idsApagar.length === 0) { setConfirmBulk(false); return }
    startRemover(async () => {
      const res = await apagarClientesCorp(idsApagar)
      setConfirmBulk(false)
      if (res.ok) {
        const set = new Set(idsApagar)
        setItens(prev => prev.filter(c => !set.has(c.id)))
        setSelecionados(new Set())
        router.refresh()
      }
    })
  }

  // Edição inline: update otimista LOCAL (mantém filtros/exibição reativos). NÃO faz
  // router.refresh por edição — o action já revalidou no servidor; refresh por-tecla criaria
  // corrida com edições em paralelo. A re-sincronização vem no próximo carregamento SSR.
  const makeSaver = (id: number, campo: CampoEditavel) => async (valor: string): Promise<boolean> => {
    const res = await atualizarClienteCorp(id, campo, valor)
    if (res.ok) {
      setItens(prev => prev.map(c => c.id === id ? { ...c, [campo]: valor || null } : c))
      return true
    }
    return false
  }

  // Delete: remoção otimista LOCAL (o servidor já apagou; sem refresh aninhado na transição).
  const handleDelete = (id: number) => {
    setItens(prev => prev.filter(c => c.id !== id))
    setSelecionados(prev => { const s = new Set(prev); s.delete(id); return s })
  }

  const handleSalvarNovo = () => {
    setErroNovo(null)
    const empresa = (novo.empresa ?? '').trim()
    if (!empresa) { setErroNovo('Informe o nome da empresa.'); return }
    startSalvar(async () => {
      const res = await inserirClienteCorp({
        empresa, situacao: novo.situacao ?? null, faturar_em: novo.faturar_em ?? null,
        vencimento: novo.vencimento ?? null, obs: novo.obs ?? null, pct_juros: novo.pct_juros ?? null,
        pct_multa: novo.pct_multa ?? null, destinatarios: novo.destinatarios ?? null,
        forma_pgto: novo.forma_pgto ?? null, contato_whats: novo.contato_whats ?? null,
      })
      if (res.ok) { setCriando(false); setNovo({}); router.refresh() }
      else setErroNovo(res.motivo === 'duplicado' ? 'Já existe um cliente com esse nome.' : res.motivo === 'empresa_obrigatoria' ? 'Informe o nome da empresa.' : 'Não foi possível salvar.')
    })
  }

  async function onArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    setImportando(true); setErroImport(null); setResultado(null)
    const parsed = await parseClientesCorpFile(file)
    if ('error' in parsed) { setErroImport(parsed.error); setImportando(false); return }
    const res = await importarClientesCorp(parsed)
    setImportando(false)
    if (!res.ok) { setErroImport(res.erro ?? 'Falha na importação.'); return }
    setResultado(res)
    startRefresh(() => router.refresh())
  }

  return (
    <div className="space-y-4">
      {/* Resumo (esquerda) + controles (direita) na MESMA linha */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm">
          <span className="font-semibold text-zinc-800">{totais.total} {totais.total === 1 ? 'cliente' : 'clientes'}</span>
          <span className="text-zinc-500">{totais.planilha} da planilha · {totais.manual} manual</span>
          <span className="text-success">{totais.ativos} {totais.ativos === 1 ? 'ativo' : 'ativos'}</span>
        </div>
        <div className="flex gap-2 items-center">
          <button onClick={() => { setCriando(true); setErroNovo(null) }} disabled={criando}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-zinc-200 rounded hover:border-zinc-300 transition-colors disabled:opacity-50">
            <Plus size={12} /> Nova linha
          </button>
          <input ref={inputFile} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onArquivo} />
          <button onClick={() => inputFile.current?.click()} disabled={importando}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded text-action-primary-fg bg-action-primary hover:opacity-90 transition-opacity disabled:opacity-50">
            {importando ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />} {importando ? 'Importando…' : 'Importar'}
          </button>
          <button onClick={() => setConfirmBulk(true)} disabled={idsApagar.length === 0}
            className="flex items-center justify-center gap-1 w-[168px] px-2.5 py-1.5 text-xs rounded border border-danger text-danger hover:bg-danger-bg transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            <Trash2 size={12} /> {apagarTodos ? 'Apagar todos' : 'Apagar selecionados'}
          </button>
        </div>
      </div>

      {/* Resultado / erro do último import */}
      {resultado && (
        <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2 text-2xs text-zinc-600 space-y-1">
          <p><b className="text-zinc-800">{resultado.inseridos}</b> {resultado.inseridos === 1 ? 'cliente importado' : 'clientes importados'} da planilha (os manuais foram preservados).</p>
          {resultado.colisoesManual.length > 0 && (
            <p className="flex items-start gap-1.5 text-warning"><AlertTriangle size={13} className="mt-0.5 shrink-0" />
              <span>Estes nomes já existem como <b>manual</b> e não foram sobrescritos: {resultado.colisoesManual.join(', ')}.</span></p>
          )}
          {resultado.duplicadasPlanilha.length > 0 && (
            <p className="text-zinc-500">Nomes repetidos na planilha (importado só o primeiro): {resultado.duplicadasPlanilha.join(', ')}.</p>
          )}
        </div>
      )}
      {erroImport && <p className="rounded-lg border border-danger bg-danger-bg px-3 py-2 text-2xs text-danger">{erroImport}</p>}

      {/* Tabela */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm table-fixed min-w-[1180px]">
          <thead>
            <tr className="border-b border-zinc-100 text-left text-xs font-medium text-zinc-400">
              <th className="py-2 px-2 w-[32px] text-center">
                <input type="checkbox" checked={todosSel} onChange={toggleTodos} className="accent-[var(--setor-corporativo)] cursor-pointer" aria-label="Selecionar todos os visíveis" />
              </th>
              <th className="py-2 px-2 w-[190px]">Empresa</th>
              <th className="py-2 px-2 w-[84px]">Situação</th>
              <th className="py-2 px-2 w-[110px]">Faturar em</th>
              <th className="py-2 px-2 w-[100px]">Vencimento</th>
              <th className="py-2 px-2 w-[80px]">% Juros</th>
              <th className="py-2 px-2 w-[80px]">% Multa</th>
              <th className="py-2 px-2 w-[120px]">Forma pgto</th>
              <th className="py-2 px-2 w-[120px]">Contato</th>
              <th className="py-2 px-2 w-[200px]">Destinatários</th>
              <th className="py-2 px-2 w-[200px]">Observações</th>
              <th className="py-2 px-2 w-[64px]"></th>
            </tr>
            <tr className="border-b border-zinc-100">
              <th className="py-1.5 px-2"></th>
              <th className="py-1.5 px-2"><input type="text" placeholder="Empresa…" value={fEmpresa} onChange={e => setFEmpresa(e.target.value)} className={FILTRO_INPUT} aria-label="Filtrar por empresa" /></th>
              <th className="py-1.5 px-2">
                <select value={situacaoFiltro} onChange={e => setSituacao(e.target.value as SituacaoFiltro)} className={FILTRO_INPUT} aria-label="Filtrar por situação">
                  <option value="todas">Toda</option>
                  <option value="ativo">Ativo</option>
                  <option value="inativo">Inativo</option>
                </select>
              </th>
              <th colSpan={9} className="py-1.5 px-2"></th>
            </tr>
          </thead>
          <tbody>
            {criando && (
              <tr className="border-b border-[var(--setor-corporativo)] bg-action-soft/30">
                <td className="py-1 px-2"></td>
                <td className="py-1 px-2"><input autoFocus type="text" placeholder="Empresa *" value={novo.empresa ?? ''} onChange={e => setNovo(p => ({ ...p, empresa: e.target.value }))} className="w-full text-xs border border-zinc-200 rounded px-1 py-0.5" /></td>
                <td className="py-1 px-2">
                  <select value={novo.situacao ?? ''} onChange={e => setNovo(p => ({ ...p, situacao: e.target.value || null }))} className="w-full text-xs border border-zinc-200 rounded px-1 py-0.5 bg-white">
                    <option value="">—</option><option value="ativo">Ativo</option><option value="inativo">Inativo</option>
                  </select>
                </td>
                {(['faturar_em','vencimento','pct_juros','pct_multa','forma_pgto','contato_whats','destinatarios','obs'] as CampoEditavel[]).map(campo => (
                  <td key={campo} className="py-1 px-2">
                    <input type="text" value={(novo[campo] as string) ?? ''} onChange={e => setNovo(p => ({ ...p, [campo]: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') handleSalvarNovo() }}
                      className="w-full text-xs border border-zinc-200 rounded px-1 py-0.5" />
                  </td>
                ))}
                <td className="py-1 px-2">
                  <div className="flex gap-1 justify-end">
                    <button onClick={handleSalvarNovo} disabled={salvandoNovo} className="text-3xs px-1.5 py-0.5 rounded text-action-primary-fg bg-action-primary disabled:opacity-50">Salvar</button>
                    <button onClick={() => { setCriando(false); setNovo({}); setErroNovo(null) }} className="text-3xs px-1.5 py-0.5 rounded border border-zinc-200 text-zinc-400">✕</button>
                  </div>
                </td>
              </tr>
            )}
            {erroNovo && criando && (
              <tr><td colSpan={12} className="px-2 py-1 text-3xs text-danger">{erroNovo}</td></tr>
            )}

            {filtrados.map(c => (
              <ClienteRow key={c.id} cliente={c} makeSaver={makeSaver} onDelete={() => handleDelete(c.id)}
                selecionado={selecionados.has(c.id)} onToggleSel={() => toggleSel(c.id)} />
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-1 text-3xs text-zinc-400">
        {filtrados.length} de {itens.length} {itens.length === 1 ? 'cliente' : 'clientes'}
        {selecionados.size > 0 && <> · {selecionados.size} selecionado(s)</>}
        {' '}· o cadastro é referência (a emissão não aplica as regras automaticamente).
      </p>

      {confirmBulk && (
        <ConfirmModal
          titulo={apagarTodos ? 'Apagar todos os clientes' : 'Apagar clientes selecionados'}
          confirmarLabel={removendo ? 'Apagando…' : apagarTodos ? `Apagar todos (${idsApagar.length})` : `Apagar ${selecionados.size}`}
          onConfirmar={handleApagar}
          onFechar={() => setConfirmBulk(false)}
          mensagem={
            <p>{apagarTodos
              ? <>Apagar <strong>todos os {idsApagar.length}</strong> clientes? Esta ação <strong>não pode ser desfeita</strong>.</>
              : <>Apagar <strong>{selecionados.size}</strong> cliente(s) selecionado(s)? Esta ação não pode ser desfeita.</>}</p>
          }
        />
      )}
    </div>
  )
}

function ClienteRow({ cliente: c, makeSaver, onDelete, selecionado, onToggleSel }: {
  cliente: ClienteCorp
  makeSaver: (id: number, campo: CampoEditavel) => (v: string) => Promise<boolean>
  onDelete: () => void
  selecionado: boolean
  onToggleSel: () => void
}) {
  const [isPending, startDelete] = useTransition()
  const [confirmDel, setConfirmDel] = useState(false)
  const ehManual = c.origem === 'manual'

  const handleDelete = () => {
    if (!confirmDel) { setConfirmDel(true); return }
    startDelete(async () => { await excluirClienteCorp(c.id); onDelete() })
  }

  return (
    <tr className={`border-b border-zinc-50 ${selecionado ? 'bg-action-soft/40' : 'hover:bg-zinc-50/50'}`}>
      <td className="py-1 px-2 text-center">
        <input type="checkbox" checked={selecionado} onChange={onToggleSel} className="accent-[var(--setor-corporativo)] cursor-pointer" aria-label="Selecionar linha" />
      </td>
      <EditableCell value={c.empresa} onSave={makeSaver(c.id, 'empresa')} />
      {/* Situação: badge no display, select ao editar */}
      <td className="py-1 px-2"><SituacaoCell cliente={c} onSave={makeSaver(c.id, 'situacao')} /></td>
      <EditableCell value={c.faturar_em} onSave={makeSaver(c.id, 'faturar_em')} />
      <EditableCell value={c.vencimento} onSave={makeSaver(c.id, 'vencimento')} />
      <EditableCell value={c.pct_juros} onSave={makeSaver(c.id, 'pct_juros')} />
      <EditableCell value={c.pct_multa} onSave={makeSaver(c.id, 'pct_multa')} />
      <EditableCell value={c.forma_pgto} onSave={makeSaver(c.id, 'forma_pgto')} />
      <EditableCell value={c.contato_whats} onSave={makeSaver(c.id, 'contato_whats')} />
      <EditableCell value={c.destinatarios} onSave={makeSaver(c.id, 'destinatarios')} />
      <EditableCell value={c.obs} onSave={makeSaver(c.id, 'obs')} />
      <td className="py-1 px-2">
        <div className="flex items-center justify-end gap-1.5">
          <span className="shrink-0 text-zinc-400" title={ehManual ? 'Cadastro manual' : 'Veio da importação da planilha'}>
            {ehManual ? <PencilLine size={12} /> : <FileSpreadsheet size={12} />}
          </span>
          <button onClick={handleDelete} disabled={isPending}
            title={confirmDel ? 'Clique novamente para confirmar' : 'Remover'}
            className={`p-1 rounded transition-colors ${confirmDel ? 'text-danger bg-danger-bg' : 'text-zinc-300 hover:text-danger'}`}>
            {isPending ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
          </button>
        </div>
      </td>
    </tr>
  )
}

// Situação com badge no display + select ao editar (reusa EditableCell type=select, mas com badge).
function SituacaoCell({ cliente: c, onSave }: { cliente: ClienteCorp; onSave: (v: string) => Promise<boolean> }) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const salvar = async (v: string) => {
    setSaving(true); const ok = await onSave(v); setSaving(false); setEditing(false)
    return ok
  }
  if (editing) {
    return (
      <select autoFocus defaultValue={c.situacao ?? ''} onChange={e => void salvar(e.target.value)} onBlur={() => setEditing(false)}
        className={`w-full text-xs ${EDIT_BORDER} rounded px-1 py-0.5 outline-none bg-white`}>
        <option value="">—</option><option value="ativo">Ativo</option><option value="inativo">Inativo</option>
      </select>
    )
  }
  return (
    <span onClick={() => setEditing(true)} className="cursor-pointer inline-flex items-center gap-1" title="Editar situação">
      {situacaoBadge(c.situacao)}
      {saving && <Loader2 size={10} className="animate-spin" />}
    </span>
  )
}
