'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Upload, CheckCircle, AlertTriangle, Loader2, RefreshCw } from 'lucide-react'
import {
  getLancamentosStatusAction,
  inserirLoteLancamentosAction,
  finalizarLancamentosAction,
  getVendasStatusAction,
  inserirLoteVendasAction,
  finalizarVendasAction,
  getLancamentosFinanceiroStatusAction,
  inserirLoteLancamentosFinanceiroAction,
  finalizarLancamentosFinanceiroAction,
  getFluxoCaixaTitulosStatusAction,
  inserirLoteFluxoCaixaTitulosAction,
  finalizarFluxoCaixaTitulosAction,
} from './actions'
import { ModalConfirmacaoUpload } from '@/components/admin/modal-confirmacao-upload'
import { parseLancamentosFile } from '@/lib/carga/parse-lancamentos'
import { parseVendasProdutoFile } from '@/lib/carga/parse-vendas-produto'
import { parseLancamentosFinanceiroFile } from '@/lib/carga/parse-lancamentos-financeiro'
import { parseFluxoCaixaTitulosFile } from '@/lib/carga/parse-fluxo-caixa-titulos'
import type { VendaProdutoRaw } from '@/lib/carga/parse-vendas-produto'
import type { LancamentoRaw } from '@/lib/carga/lancamentos'
import type { LancamentoFinanceiroRaw } from '@/lib/carga/parse-lancamentos-financeiro'
import type { FluxoCaixaTituloRaw } from '@/lib/carga/parse-fluxo-caixa-titulos'

type BaseKey = 'vendas' | 'lancamentos' | 'lancamentos_financeiro' | 'fluxo_caixa_titulos'
type EstadoCard = 'idle' | 'validando' | 'aguardando_confirmacao' | 'carregando' | 'sucesso' | 'erro'

interface StatusCarga {
  total: number
  ultima_atualizacao: string | null
}

interface EstadoUpload {
  estado:      EstadoCard
  arquivo:     File | null
  totalLinhas: number
  totalAntes:  number
  mensagem:    string
}

const ESTADO_INICIAL: EstadoUpload = {
  estado: 'idle', arquivo: null, totalLinhas: 0, totalAntes: 0, mensagem: '',
}

interface BaseConfig {
  key:      BaseKey
  label:    string
  descricao: string
  /** Tamanho de lote validado para esta base — não unificar (cabe em <3s). */
  batch:    number
  /** Sufixo do contador na linha de status (ex.: "vendas", "lançamentos", "registros"). */
  unidade:  string
}

// Texto explicativo uniforme: cada base SUBSTITUI TODA a base; importar sempre completo.
const BASES: BaseConfig[] = [
  {
    key: 'vendas',
    label: 'Vendas por Produto',
    descricao: 'Substitui toda a base de Vendas por Produto. Importe sempre o arquivo completo.',
    batch: 1000,
    unidade: 'vendas',
  },
  {
    key: 'lancamentos',
    label: 'Lançamentos por Operação',
    descricao: 'Substitui toda a base de Lançamentos por Operação. Importe sempre o arquivo completo.',
    batch: 1000,
    unidade: 'lançamentos',
  },
  {
    key: 'lancamentos_financeiro',
    label: 'Lançamentos por Categoria',
    descricao: 'Substitui toda a base de Lançamentos por Categoria. Importe sempre o arquivo completo.',
    batch: 500,
    unidade: 'registros',
  },
  {
    key: 'fluxo_caixa_titulos',
    label: 'Fluxo de Caixa (CAP/CAR)',
    descricao: 'Substitui toda a base de Fluxo de Caixa (CAP/CAR). Importe sempre o arquivo completo.',
    batch: 500,
    unidade: 'registros',
  },
]

function formatarData(iso: string | null): string {
  if (!iso) return 'Nunca'
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatarNum(n: number): string {
  return n.toLocaleString('pt-BR')
}

function CardUpload({
  config,
  status,
  estado,
  onArquivoSelecionado,
  onCancelar,
  onConfirmar,
}: {
  config:               BaseConfig
  status:               StatusCarga | null
  estado:               EstadoUpload
  onArquivoSelecionado: (f: File) => void
  onCancelar:           () => void
  onConfirmar:          () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const ativo = estado.estado === 'idle' || estado.estado === 'erro'

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (ativo) setIsDragging(true)
  }, [ativo])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (!ativo) return
    const f = e.dataTransfer.files?.[0]
    if (f) onArquivoSelecionado(f)
  }, [ativo, onArquivoSelecionado])

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between mb-1">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">{config.label}</h2>
          <p className="text-xs text-zinc-500 mt-0.5">{config.descricao}</p>
        </div>
        {estado.estado === 'sucesso' && <CheckCircle size={18} className="text-emerald-500 shrink-0" />}
        {estado.estado === 'erro'    && <AlertTriangle size={18} className="text-red-500 shrink-0" />}
      </div>

      <p className="text-xs text-zinc-400 mb-3">
        {status ? (
          <>Última atualização: {formatarData(status.ultima_atualizacao)} · {formatarNum(status.total)} {config.unidade}</>
        ) : '—'}
      </p>

      {/* Zona de drop / arquivo selecionado */}
      <div
        className={[
          'border-2 border-dashed rounded-lg p-4 text-center transition-colors mb-3',
          ativo ? 'cursor-pointer' : 'cursor-default',
          ativo && isDragging
            ? 'border-blue-400 bg-blue-50'
            : ativo
              ? 'border-zinc-200 hover:border-blue-300 hover:bg-blue-50/40'
              : 'border-zinc-100 bg-zinc-50',
        ].join(' ')}
        onClick={() => ativo && inputRef.current?.click()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.csv"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) onArquivoSelecionado(f); e.target.value = '' }}
        />
        {estado.estado === 'idle' && (
          <>
            <Upload size={16} className="mx-auto mb-1.5 text-zinc-400" />
            <p className="text-xs text-zinc-500">Arraste ou clique para selecionar um arquivo <span className="font-medium">.xlsx</span> ou <span className="font-medium">.csv</span></p>
          </>
        )}
        {estado.estado === 'validando' && (
          <div className="flex items-center justify-center gap-2 text-xs text-zinc-500">
            <Loader2 size={14} className="animate-spin" /> Validando {estado.arquivo?.name}…
          </div>
        )}
        {estado.estado === 'aguardando_confirmacao' && (
          <p className="text-xs text-zinc-700">
            <span className="font-medium">{estado.arquivo?.name}</span> — {formatarNum(estado.totalLinhas)} linhas válidas
          </p>
        )}
        {estado.estado === 'carregando' && (
          <div className="flex items-center justify-center gap-2 text-xs text-blue-600">
            <Loader2 size={14} className="animate-spin" /> Importando {formatarNum(estado.totalLinhas)} linhas…
          </div>
        )}
        {estado.estado === 'sucesso' && (
          <p className="text-xs text-emerald-600 font-medium">{estado.mensagem}</p>
        )}
        {estado.estado === 'erro' && (
          <div>
            <p className="text-xs text-red-600 font-medium mb-1">{estado.mensagem}</p>
            <p className="text-xs text-zinc-400">Arraste ou clique para tentar com outro arquivo</p>
          </div>
        )}
      </div>

      {/* Botão Validar/Cancelar */}
      {(estado.estado === 'idle' || estado.estado === 'erro') && (
        <button
          disabled
          className="w-full px-4 py-2 text-sm rounded-lg bg-zinc-100 text-zinc-400 cursor-not-allowed"
        >
          Selecione um arquivo para importar
        </button>
      )}
      {estado.estado === 'aguardando_confirmacao' && (
        <div className="flex gap-2">
          <button
            onClick={onCancelar}
            className="flex-1 px-4 py-2 text-sm rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirmar}
            className="flex-1 px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors font-medium"
          >
            Confirmar e importar
          </button>
        </div>
      )}
    </div>
  )
}

// As linhas parseadas de cada base têm tipos diferentes; guardamos como unknown[]
// por base e repassamos para a action correta no handleConfirmar.
type LinhasRef = Record<BaseKey, unknown[]>

export default function AdminUploadsPage() {
  const [status, setStatus] = useState<Record<BaseKey, StatusCarga | null>>({
    vendas: null, lancamentos: null, lancamentos_financeiro: null, fluxo_caixa_titulos: null,
  })
  const [estados, setEstados] = useState<Record<BaseKey, EstadoUpload>>({
    vendas: ESTADO_INICIAL, lancamentos: ESTADO_INICIAL,
    lancamentos_financeiro: ESTADO_INICIAL, fluxo_caixa_titulos: ESTADO_INICIAL,
  })
  const [modal, setModal] = useState<BaseKey | null>(null)

  const linhasRef = useRef<LinhasRef>({
    vendas: [], lancamentos: [], lancamentos_financeiro: [], fluxo_caixa_titulos: [],
  })

  function setEstado(key: BaseKey, patch: Partial<EstadoUpload>) {
    setEstados(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }))
  }

  const carregarStatus = useCallback(async () => {
    const [vendasRes, lancRes, lancFinRes, fctRes] = await Promise.allSettled([
      getVendasStatusAction(),
      getLancamentosStatusAction(),
      getLancamentosFinanceiroStatusAction(),
      getFluxoCaixaTitulosStatusAction(),
    ])

    const toStatus = (
      r: PromiseSettledResult<{ total: number; ultima_atualizacao?: string | null } | { error: string }>,
    ): StatusCarga | null => {
      if (r.status !== 'fulfilled' || 'error' in r.value) return null
      return { total: r.value.total, ultima_atualizacao: r.value.ultima_atualizacao ?? null }
    }

    setStatus({
      vendas:                 toStatus(vendasRes),
      lancamentos:            toStatus(lancRes),
      lancamentos_financeiro: toStatus(lancFinRes),
      fluxo_caixa_titulos:    toStatus(fctRes),
    })
  }, [])

  useEffect(() => { carregarStatus() }, [carregarStatus])

  async function handleArquivoSelecionado(key: BaseKey, arquivo: File) {
    setEstado(key, { estado: 'validando', arquivo, totalLinhas: 0, totalAntes: 0, mensagem: '' })

    try {
      if (key === 'vendas') {
        const res = await parseVendasProdutoFile(arquivo)
        if ('error' in res) { setEstado(key, { estado: 'erro', mensagem: res.error }); return }
        const st = await getVendasStatusAction()
        if ('error' in st) { setEstado(key, { estado: 'erro', mensagem: st.error }); return }
        linhasRef.current.vendas = res
        // "Depois" para vendas = nº de vendas únicas (não de linhas/itens).
        const uniqueVendas = new Set(res.map(r => r.venda_numero).filter(Boolean)).size
        setEstado(key, { estado: 'aguardando_confirmacao', totalLinhas: uniqueVendas, totalAntes: st.total })
      } else if (key === 'lancamentos') {
        const res = await parseLancamentosFile(arquivo)
        if ('error' in res) { setEstado(key, { estado: 'erro', mensagem: res.error }); return }
        const st = await getLancamentosStatusAction()
        if ('error' in st) { setEstado(key, { estado: 'erro', mensagem: st.error }); return }
        linhasRef.current.lancamentos = res
        setEstado(key, { estado: 'aguardando_confirmacao', totalLinhas: res.length, totalAntes: st.total })
      } else if (key === 'lancamentos_financeiro') {
        const res = await parseLancamentosFinanceiroFile(arquivo)
        if ('error' in res) { setEstado(key, { estado: 'erro', mensagem: res.error }); return }
        const st = await getLancamentosFinanceiroStatusAction()
        if ('error' in st) { setEstado(key, { estado: 'erro', mensagem: st.error }); return }
        linhasRef.current.lancamentos_financeiro = res
        setEstado(key, { estado: 'aguardando_confirmacao', totalLinhas: res.length, totalAntes: st.total })
      } else {
        const res = await parseFluxoCaixaTitulosFile(arquivo)
        if ('error' in res) { setEstado(key, { estado: 'erro', mensagem: res.error }); return }
        const st = await getFluxoCaixaTitulosStatusAction()
        if ('error' in st) { setEstado(key, { estado: 'erro', mensagem: st.error }); return }
        linhasRef.current.fluxo_caixa_titulos = res
        setEstado(key, { estado: 'aguardando_confirmacao', totalLinhas: res.length, totalAntes: st.total })
      }

      setModal(key)
    } catch (err) {
      setEstado(key, { estado: 'erro', mensagem: err instanceof Error ? err.message : 'Erro de parse' })
    }
  }

  async function handleConfirmar(key: BaseKey) {
    setModal(null)
    const est = estados[key]
    if (!est.arquivo) return

    const config = BASES.find(b => b.key === key)!
    const BATCH = config.batch
    const nome = est.arquivo.name
    const totalAntes = est.totalAntes
    setEstado(key, { estado: 'carregando' })

    try {
      if (key === 'vendas') {
        const rows = linhasRef.current.vendas as VendaProdutoRaw[]
        let inseridas = 0
        for (let i = 0; i < rows.length; i += BATCH) {
          const res = await inserirLoteVendasAction(rows.slice(i, i + BATCH), i === 0)
          if ('error' in res) { setEstado(key, { estado: 'erro', mensagem: res.error }); return }
          inseridas += res.inseridas
        }
        const fin = await finalizarVendasAction(totalAntes, inseridas)
        if ('error' in fin) { setEstado(key, { estado: 'erro', mensagem: fin.error }); return }
        linhasRef.current.vendas = []
        setEstado(key, { estado: 'sucesso', mensagem: `${formatarNum(fin.vendas_count)} vendas importadas com sucesso` })

      } else if (key === 'lancamentos') {
        const rows = linhasRef.current.lancamentos as LancamentoRaw[]
        let inseridas = 0
        for (let i = 0; i < rows.length; i += BATCH) {
          const res = await inserirLoteLancamentosAction(rows.slice(i, i + BATCH), i === 0)
          if ('error' in res) { setEstado(key, { estado: 'erro', mensagem: res.error }); return }
          inseridas += res.inseridas
        }
        const fin = await finalizarLancamentosAction(totalAntes, inseridas)
        if ('error' in fin) { setEstado(key, { estado: 'erro', mensagem: fin.error }); return }
        linhasRef.current.lancamentos = []
        setEstado(key, { estado: 'sucesso', mensagem: `${formatarNum(fin.total_linhas)} lançamentos importados com sucesso` })

      } else if (key === 'lancamentos_financeiro') {
        const rows = linhasRef.current.lancamentos_financeiro as LancamentoFinanceiroRaw[]
        let inseridas = 0
        for (let i = 0; i < rows.length; i += BATCH) {
          const res = await inserirLoteLancamentosFinanceiroAction(rows.slice(i, i + BATCH), i === 0, nome)
          if ('error' in res) { setEstado(key, { estado: 'erro', mensagem: res.error }); return }
          inseridas += res.inseridas
        }
        const fin = await finalizarLancamentosFinanceiroAction(totalAntes, inseridas)
        if ('error' in fin) { setEstado(key, { estado: 'erro', mensagem: fin.error }); return }
        linhasRef.current.lancamentos_financeiro = []
        setEstado(key, { estado: 'sucesso', mensagem: `${formatarNum(inseridas)} registros importados com sucesso` })

      } else {
        const rows = linhasRef.current.fluxo_caixa_titulos as FluxoCaixaTituloRaw[]
        let inseridas = 0
        for (let i = 0; i < rows.length; i += BATCH) {
          const res = await inserirLoteFluxoCaixaTitulosAction(rows.slice(i, i + BATCH), i === 0, nome)
          if ('error' in res) { setEstado(key, { estado: 'erro', mensagem: res.error }); return }
          inseridas += res.inseridas
        }
        const fin = await finalizarFluxoCaixaTitulosAction(totalAntes, inseridas)
        if ('error' in fin) { setEstado(key, { estado: 'erro', mensagem: fin.error }); return }
        linhasRef.current.fluxo_caixa_titulos = []
        setEstado(key, { estado: 'sucesso', mensagem: `${formatarNum(inseridas)} registros importados com sucesso` })
      }

      await carregarStatus()
    } catch (err) {
      setEstado(key, { estado: 'erro', mensagem: err instanceof Error ? err.message : 'Erro na importação' })
    }
  }

  function handleCancelar(key: BaseKey) {
    setModal(null)
    linhasRef.current[key] = []
    setEstado(key, { ...ESTADO_INICIAL })
  }

  const modalConfig = modal ? BASES.find(b => b.key === modal)! : null

  return (
    <div className="max-w-2xl mx-auto px-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Atualização de Dados</h1>
          <p className="text-sm text-zinc-400 mt-0.5">Importe planilhas para atualizar a base do dashboard</p>
        </div>
        <button
          onClick={carregarStatus}
          className="p-2 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
          aria-label="Atualizar status"
        >
          <RefreshCw size={15} />
        </button>
      </div>

      <div className="space-y-4">
        {BASES.map(config => (
          <CardUpload
            key={config.key}
            config={config}
            status={status[config.key]}
            estado={estados[config.key]}
            onArquivoSelecionado={f => handleArquivoSelecionado(config.key, f)}
            onCancelar={() => handleCancelar(config.key)}
            onConfirmar={() => setModal(config.key)}
          />
        ))}
      </div>

      {modal && modalConfig && estados[modal].estado === 'aguardando_confirmacao' && (
        <ModalConfirmacaoUpload
          baseLabel={modalConfig.label}
          totalAntes={estados[modal].totalAntes}
          totalDepois={estados[modal].totalLinhas}
          onConfirmar={() => handleConfirmar(modal)}
          onCancelar={() => handleCancelar(modal)}
        />
      )}
    </div>
  )
}
