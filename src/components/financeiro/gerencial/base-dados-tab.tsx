'use client'

import { useState, useTransition, useMemo, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Upload } from 'lucide-react'
import { createLancamento } from '@/app/financeiro/fluxo-caixa/gerencial/actions'
import { LancamentoRow, type Lancamento } from './lancamento-row'
import ImportDrawer from './import-drawer'

const PILL_BASE     = 'px-2.5 py-0.5 rounded-full text-[11px] font-medium border transition-colors whitespace-nowrap'
const PILL_INACTIVE = 'border-zinc-200 text-zinc-500 hover:border-zinc-300 hover:bg-zinc-50'
const PILL_ACTIVE   = { background: 'var(--brand-soft)', borderColor: 'var(--brand)', color: 'var(--brand-deep)' }

type TipoFiltro   = 'todos' | 'pagar' | 'receber'
type OrigemFiltro = 'todos' | 'planilha' | 'manual'

interface Props {
  lancamentos: Lancamento[]
}

export default function BaseDadosTab({ lancamentos: inicial }: Props) {
  const router = useRouter()

  const [itens, setItens]               = useState<Lancamento[]>(inicial)
  const [tipoFiltro, setTipoFiltro]     = useState<TipoFiltro>('todos')
  const [origemFiltro, setOrigemFiltro] = useState<OrigemFiltro>('todos')
  const [buscaInput, setBuscaInput]     = useState('')
  const [busca, setBusca]               = useState('')
  const [importOpen, setImportOpen]     = useState(false)
  const [criando, setCriando]           = useState(false)
  const [novosValores, setNovosValores] = useState<Partial<Lancamento>>({})
  const [isPending, startCreate]        = useTransition()
  const [, startRefresh]                = useTransition()

  const primeiroInputRef = useRef<HTMLSelectElement>(null)

  // Debounce busca 300ms
  useEffect(() => {
    const t = setTimeout(() => setBusca(buscaInput), 300)
    return () => clearTimeout(t)
  }, [buscaInput])

  // Focar no primeiro campo ao abrir nova linha
  useEffect(() => {
    if (criando && primeiroInputRef.current) {
      primeiroInputRef.current.focus()
    }
  }, [criando])

  const filtrados = useMemo(() => {
    return itens
      .filter(l => tipoFiltro === 'todos' || l.tipo === (tipoFiltro === 'receber' ? 'A receber' : 'A pagar'))
      .filter(l => origemFiltro === 'todos' || l.origem === origemFiltro)
      .filter(l => !busca || l.pessoa.toLowerCase().includes(busca.toLowerCase()))
  }, [itens, tipoFiltro, origemFiltro, busca])

  const handleDelete = (id: number) => {
    setItens(prev => prev.filter(l => l.id !== id))
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
    if (imported) {
      startRefresh(() => { router.refresh() })
    }
  }

  return (
    <div>
      {/* Header com filtros e ações */}
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div className="flex gap-2 flex-wrap items-center">
          {/* Pills tipo */}
          {(['todos', 'receber', 'pagar'] as TipoFiltro[]).map(v => (
            <button
              key={v}
              className={[PILL_BASE, tipoFiltro === v ? '' : PILL_INACTIVE].join(' ')}
              style={tipoFiltro === v ? PILL_ACTIVE : undefined}
              onClick={() => setTipoFiltro(v)}
            >
              {v === 'todos' ? 'Todos' : v === 'receber' ? 'A receber' : 'A pagar'}
            </button>
          ))}
          <span className="text-zinc-200">·</span>
          {/* Pills origem */}
          {(['todos', 'planilha', 'manual'] as OrigemFiltro[]).map(v => (
            <button
              key={v}
              className={[PILL_BASE, origemFiltro === v ? '' : PILL_INACTIVE].join(' ')}
              style={origemFiltro === v ? PILL_ACTIVE : undefined}
              onClick={() => setOrigemFiltro(v)}
            >
              {v === 'todos' ? 'Toda origem' : v === 'planilha' ? 'Planilha' : 'Manual'}
            </button>
          ))}
        </div>

        <div className="flex gap-2 items-center">
          <input
            type="text"
            placeholder="Buscar por pessoa…"
            value={buscaInput}
            onChange={e => setBuscaInput(e.target.value)}
            className="px-2.5 py-1.5 text-xs border border-zinc-200 rounded focus:outline-none focus:border-[var(--brand)]"
          />
          <button
            onClick={() => setCriando(true)}
            disabled={criando}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-zinc-200 rounded hover:border-zinc-300 transition-colors disabled:opacity-50"
          >
            <Plus size={12} /> Nova linha
          </button>
          <button
            onClick={() => setImportOpen(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-white rounded transition-opacity"
            style={{ background: 'var(--brand)' }}
          >
            <Upload size={12} /> Importar
          </button>
        </div>
      </div>

      {/* Tabela */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-100 text-left">
              <th className="py-2 px-2 text-xs font-medium text-zinc-400 w-[110px]">Tipo</th>
              <th className="py-2 px-2 text-xs font-medium text-zinc-400">Pessoa</th>
              <th className="py-2 px-2 text-xs font-medium text-zinc-400 text-right w-[130px]">Valor</th>
              <th className="py-2 px-2 text-xs font-medium text-zinc-400 w-[180px]">Descrição</th>
              <th className="py-2 px-2 text-xs font-medium text-zinc-400 w-[140px]">Conta</th>
              <th className="py-2 px-2 text-xs font-medium text-zinc-400 w-[110px]">Vencimento</th>
              <th className="py-2 px-2 text-xs font-medium text-zinc-400 w-[80px]">Origem</th>
              <th className="py-2 px-2 w-[32px]"></th>
            </tr>
          </thead>
          <tbody>
            {/* Nova linha inline */}
            {criando && (
              <tr className="border-b border-[var(--brand)] bg-[var(--brand-soft)]/20">
                <td className="py-1 px-2">
                  <select
                    ref={primeiroInputRef}
                    value={novosValores.tipo ?? ''}
                    onChange={e => setNovosValores(p => ({ ...p, tipo: e.target.value as Lancamento['tipo'] }))}
                    className="w-full text-xs border border-zinc-200 rounded px-1 py-0.5 bg-white"
                  >
                    <option value="">Tipo…</option>
                    <option>A pagar</option>
                    <option>A receber</option>
                  </select>
                </td>
                <td className="py-1 px-2">
                  <input
                    type="text"
                    placeholder="Pessoa"
                    value={novosValores.pessoa ?? ''}
                    onChange={e => setNovosValores(p => ({ ...p, pessoa: e.target.value }))}
                    className="w-full text-xs border border-zinc-200 rounded px-1 py-0.5"
                  />
                </td>
                <td className="py-1 px-2">
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0,00"
                    value={novosValores.valor_final ?? ''}
                    onChange={e => setNovosValores(p => ({ ...p, valor_final: Number(e.target.value) }))}
                    className="w-full text-xs border border-zinc-200 rounded px-1 py-0.5 text-right"
                  />
                </td>
                <td className="py-1 px-2">
                  <input
                    type="text"
                    placeholder="Descrição"
                    value={novosValores.descricao ?? ''}
                    onChange={e => setNovosValores(p => ({ ...p, descricao: e.target.value }))}
                    className="w-full text-xs border border-zinc-200 rounded px-1 py-0.5"
                  />
                </td>
                <td className="py-1 px-2">
                  <input
                    type="text"
                    placeholder="Conta"
                    value={novosValores.conta_previsao ?? ''}
                    onChange={e => setNovosValores(p => ({ ...p, conta_previsao: e.target.value }))}
                    className="w-full text-xs border border-zinc-200 rounded px-1 py-0.5"
                  />
                </td>
                <td className="py-1 px-2">
                  <input
                    type="date"
                    value={novosValores.vencimento ?? ''}
                    onChange={e => setNovosValores(p => ({ ...p, vencimento: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') handleSalvarNovo() }}
                    className="w-full text-xs border border-zinc-200 rounded px-1 py-0.5"
                  />
                </td>
                <td className="py-1 px-2 text-[9px] text-zinc-400">manual</td>
                <td className="py-1 px-2">
                  <div className="flex gap-1 justify-end">
                    <button
                      onClick={handleSalvarNovo}
                      disabled={isPending}
                      className="text-[10px] px-1.5 py-0.5 rounded text-white disabled:opacity-50"
                      style={{ background: 'var(--brand)' }}
                    >
                      Salvar
                    </button>
                    <button
                      onClick={() => { setCriando(false); setNovosValores({}) }}
                      className="text-[10px] px-1.5 py-0.5 rounded border border-zinc-200 text-zinc-400"
                    >
                      ✕
                    </button>
                  </div>
                </td>
              </tr>
            )}

            {filtrados.map(l => (
              <LancamentoRow
                key={l.id}
                lancamento={l}
                onDelete={() => handleDelete(l.id)}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <p className="mt-2 text-[10px] text-[var(--text-muted)]">
        {filtrados.length} de {itens.length} lançamentos
      </p>

      <ImportDrawer
        open={importOpen}
        onClose={() => handleImportClose(true)}
      />
    </div>
  )
}
