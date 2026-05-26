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
} from './actions'
import { parseLancamentosFile } from '@/lib/carga/parse-lancamentos'
import { parseVendasProdutoFile } from '@/lib/carga/parse-vendas-produto'
import type { LancamentoRaw } from '@/lib/carga/lancamentos'
import type { VendaProdutoRaw } from '@/lib/carga/parse-vendas-produto'

interface StatusCarga {
  total: number
  ultima_atualizacao: string | null
}

interface StatusGeral {
  vendas:       StatusCarga
  lancamentos:  StatusCarga
}

interface PreviewCarga {
  antes:  { total_vendas?: number; total_lancamentos?: number }
  depois: { total_vendas?: number; total_lancamentos?: number }
}

interface ResultadoCarga {
  sucesso:     boolean
  total_linhas: number
  erros:       string[]
  preview:     PreviewCarga
  vendas_count?:    number
  fato_item_count?: number
}

type EstadoCard = 'idle' | 'validando' | 'aguardando_confirmacao' | 'carregando' | 'sucesso' | 'erro'

interface EstadoUpload {
  estado:    EstadoCard
  arquivo:   File | null
  resultado: ResultadoCarga | null
  mensagem:  string
}

const ESTADO_INICIAL: EstadoUpload = {
  estado: 'idle', arquivo: null, resultado: null, mensagem: ''
}

function formatarData(iso: string | null): string {
  if (!iso) return 'Nunca'
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatarNum(n: number): string {
  return n.toLocaleString('pt-BR')
}

function ModalConfirmacao({
  tipo,
  resultado,
  onConfirmar,
  onCancelar,
}: {
  tipo: 'vendas' | 'lancamentos'
  resultado: ResultadoCarga
  onConfirmar: () => void
  onCancelar:  () => void
}) {
  const label = tipo === 'vendas' ? 'vendas' : 'lançamentos'
  const antes  = tipo === 'vendas' ? resultado.preview.antes.total_vendas : resultado.preview.antes.total_lancamentos
  const depois = tipo === 'vendas' ? resultado.preview.depois.total_vendas : resultado.preview.depois.total_lancamentos

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onCancelar} />
      <div className="relative bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
        <h3 className="text-base font-semibold text-zinc-900 mb-2">Confirmar importação</h3>
        <p className="text-sm text-zinc-600 mb-4">
          Vai apagar <span className="font-medium">{formatarNum(antes ?? 0)}</span> {label} atuais
          e carregar <span className="font-medium">{formatarNum(depois ?? 0)}</span> novos. Esta ação não pode ser desfeita.
        </p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancelar}
            className="px-4 py-2 text-sm rounded-lg border border-zinc-200 text-zinc-700 hover:bg-zinc-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirmar}
            className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors font-medium"
          >
            Confirmar importação
          </button>
        </div>
      </div>
    </div>
  )
}

function CardUpload({
  tipo,
  status,
  estado,
  onArquivoSelecionado,
  onCancelar,
  onConfirmar,
}: {
  tipo:                   'vendas' | 'lancamentos'
  status:                 StatusCarga | null
  estado:                 EstadoUpload
  onArquivoSelecionado:   (f: File) => void
  onCancelar:             () => void
  onConfirmar:            () => void
}) {
  const inputRef  = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const label      = tipo === 'vendas' ? 'Vendas por Produto' : 'Lançamentos por Operação'
  const extensao   = '.xlsx,.csv'
  const totalLabel = tipo === 'vendas' ? 'vendas' : 'lançamentos'
  const ativo      = estado.estado === 'idle' || estado.estado === 'erro'

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
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">{label}</h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            {status ? (
              <>Última atualização: {formatarData(status.ultima_atualizacao)} · {formatarNum(status.total)} {totalLabel}</>
            ) : '—'}
          </p>
        </div>
        {estado.estado === 'sucesso' && <CheckCircle size={18} className="text-emerald-500 shrink-0" />}
        {estado.estado === 'erro'    && <AlertTriangle size={18} className="text-red-500 shrink-0" />}
      </div>

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
          accept={extensao}
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
        {estado.estado === 'aguardando_confirmacao' && estado.resultado && (
          <p className="text-xs text-zinc-700">
            <span className="font-medium">{estado.arquivo?.name}</span> — {formatarNum(estado.resultado.total_linhas)} linhas válidas
          </p>
        )}
        {estado.estado === 'carregando' && (
          <div className="flex items-center justify-center gap-2 text-xs text-blue-600">
            <Loader2 size={14} className="animate-spin" /> Importando {formatarNum(estado.resultado?.total_linhas ?? 0)} linhas…
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

      {/* Erros pontuais de linhas */}
      {estado.resultado?.erros && estado.resultado.erros.length > 0 && estado.estado !== 'erro' && (
        <p className="text-xs text-amber-600 mb-3">
          {estado.resultado.erros.length} linha(s) com problemas ignoradas
        </p>
      )}

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

export default function AdminUploadsPage() {
  const [statusGeral, setStatusGeral] = useState<StatusGeral | null>(null)
  const [vendas,      setVendas]      = useState<EstadoUpload>(ESTADO_INICIAL)
  const [lanc,        setLanc]        = useState<EstadoUpload>(ESTADO_INICIAL)
  const [modal,       setModal]       = useState<'vendas' | 'lancamentos' | null>(null)
  const lancLinhasRef                 = useRef<LancamentoRaw[]>([])
  const vendasLinhasRef               = useRef<VendaProdutoRaw[]>([])

  async function carregarStatus() {
    try {
      const res = await fetch('/api/admin/upload-status')
      if (res.ok) setStatusGeral(await res.json())
    } catch { /* silencia */ }
  }

  useEffect(() => { carregarStatus() }, [])

  async function handleArquivoSelecionado(tipo: 'vendas' | 'lancamentos', arquivo: File) {
    const setter = tipo === 'vendas' ? setVendas : setLanc
    setter(s => ({ ...s, estado: 'validando', arquivo, resultado: null, mensagem: '' }))

    if (tipo === 'vendas') {
      try {
        const parseResult = await parseVendasProdutoFile(arquivo)
        if ('error' in parseResult) {
          setter(s => ({ ...s, estado: 'erro', mensagem: parseResult.error }))
          return
        }
        const statusResult = await getVendasStatusAction()
        if ('error' in statusResult) {
          setter(s => ({ ...s, estado: 'erro', mensagem: statusResult.error }))
          return
        }
        vendasLinhasRef.current = parseResult
        const uniqueVendas = new Set(parseResult.map(r => r.venda_numero).filter(Boolean)).size
        const resultado: ResultadoCarga = {
          sucesso: true,
          total_linhas: parseResult.length,
          erros: [],
          preview: {
            antes:  { total_vendas: statusResult.total },
            depois: { total_vendas: uniqueVendas },
          },
        }
        setter(s => ({ ...s, estado: 'aguardando_confirmacao', resultado }))
        setModal('vendas')
      } catch (err) {
        setter(s => ({ ...s, estado: 'erro', mensagem: err instanceof Error ? err.message : 'Erro de parse' }))
      }
      return
    }

    if (tipo === 'lancamentos') {
      try {
        const parseResult = await parseLancamentosFile(arquivo)
        if ('error' in parseResult) {
          setter(s => ({ ...s, estado: 'erro', mensagem: parseResult.error }))
          return
        }
        const statusResult = await getLancamentosStatusAction()
        if ('error' in statusResult) {
          setter(s => ({ ...s, estado: 'erro', mensagem: statusResult.error }))
          return
        }
        lancLinhasRef.current = parseResult
        const resultado: ResultadoCarga = {
          sucesso: true,
          total_linhas: parseResult.length,
          erros: [],
          preview: {
            antes:  { total_lancamentos: statusResult.total },
            depois: { total_lancamentos: parseResult.length },
          },
        }
        setter(s => ({ ...s, estado: 'aguardando_confirmacao', resultado }))
        setModal('lancamentos')
      } catch (err) {
        setter(s => ({ ...s, estado: 'erro', mensagem: err instanceof Error ? err.message : 'Erro de parse' }))
      }
      return
    }

  }

  async function handleConfirmar(tipo: 'vendas' | 'lancamentos') {
    const setter = tipo === 'vendas' ? setVendas : setLanc
    const estado = tipo === 'vendas' ? vendas : lanc
    setModal(null)

    if (!estado.arquivo) return
    setter(s => ({ ...s, estado: 'carregando' }))

    if (tipo === 'vendas') {
      const rows = vendasLinhasRef.current
      const totalAntes = estado.resultado?.preview?.antes?.total_vendas ?? 0
      const BATCH = 1000
      let inseridas = 0
      try {
        for (let i = 0; i < rows.length; i += BATCH) {
          const lote = rows.slice(i, i + BATCH)
          const result = await inserirLoteVendasAction(lote, i === 0)
          if ('error' in result) {
            setter(s => ({ ...s, estado: 'erro', mensagem: result.error }))
            return
          }
          inseridas += result.inseridas
        }
        const finalResult = await finalizarVendasAction(totalAntes, inseridas)
        if ('error' in finalResult) {
          setter(s => ({ ...s, estado: 'erro', mensagem: finalResult.error }))
          return
        }
        vendasLinhasRef.current = []
        const msg = `${formatarNum(finalResult.vendas_count)} vendas importadas com sucesso`
        setter(s => ({ ...s, estado: 'sucesso', resultado: finalResult as unknown as ResultadoCarga, mensagem: msg }))
        await carregarStatus()
      } catch (err) {
        setter(s => ({ ...s, estado: 'erro', mensagem: err instanceof Error ? err.message : 'Erro na importação' }))
      }
      return
    }

    if (tipo === 'lancamentos') {
      const rows = lancLinhasRef.current
      const totalAntes = estado.resultado?.preview?.antes?.total_lancamentos ?? 0
      const BATCH = 1000
      let inseridas = 0
      try {
        for (let i = 0; i < rows.length; i += BATCH) {
          const lote = rows.slice(i, i + BATCH)
          const result = await inserirLoteLancamentosAction(lote, i === 0)
          if ('error' in result) {
            setter(s => ({ ...s, estado: 'erro', mensagem: result.error }))
            return
          }
          inseridas += result.inseridas
        }
        const finalResult = await finalizarLancamentosAction(totalAntes, inseridas)
        if ('error' in finalResult) {
          setter(s => ({ ...s, estado: 'erro', mensagem: finalResult.error }))
          return
        }
        lancLinhasRef.current = []
        const msg = `${formatarNum(finalResult.total_linhas)} lançamentos importados com sucesso`
        setter(s => ({ ...s, estado: 'sucesso', resultado: finalResult as unknown as ResultadoCarga, mensagem: msg }))
        await carregarStatus()
      } catch (err) {
        setter(s => ({ ...s, estado: 'erro', mensagem: err instanceof Error ? err.message : 'Erro na importação' }))
      }
      return
    }

  }

  function handleCancelar(tipo: 'vendas' | 'lancamentos') {
    setModal(null)
    if (tipo === 'lancamentos') lancLinhasRef.current = []
    if (tipo === 'vendas') vendasLinhasRef.current = []
    const setter = tipo === 'vendas' ? setVendas : setLanc
    setter(ESTADO_INICIAL)
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
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
        <CardUpload
          tipo="vendas"
          status={statusGeral?.vendas ?? null}
          estado={vendas}
          onArquivoSelecionado={f => handleArquivoSelecionado('vendas', f)}
          onCancelar={() => handleCancelar('vendas')}
          onConfirmar={() => setModal('vendas')}
        />
        <CardUpload
          tipo="lancamentos"
          status={statusGeral?.lancamentos ?? null}
          estado={lanc}
          onArquivoSelecionado={f => handleArquivoSelecionado('lancamentos', f)}
          onCancelar={() => handleCancelar('lancamentos')}
          onConfirmar={() => setModal('lancamentos')}
        />
      </div>

      {modal && (modal === 'vendas' ? vendas : lanc).resultado && (
        <ModalConfirmacao
          tipo={modal}
          resultado={(modal === 'vendas' ? vendas : lanc).resultado!}
          onConfirmar={() => handleConfirmar(modal)}
          onCancelar={() => handleCancelar(modal)}
        />
      )}
    </div>
  )
}
