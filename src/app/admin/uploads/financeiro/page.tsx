'use client'

import { useState, useRef, useEffect } from 'react'
import { Upload, CheckCircle, AlertTriangle, Loader2, RefreshCw } from 'lucide-react'
import {
  getLancamentosFinanceiroStatusAction,
  inserirLoteLancamentosFinanceiroAction,
  finalizarLancamentosFinanceiroAction,
  getVendasPagamentoStatusAction,
  inserirLoteVendasPagamentoAction,
  finalizarVendasPagamentoAction,
  getContasPagarReceberStatusAction,
  inserirLoteContasPagarReceberAction,
  finalizarContasPagarReceberAction,
} from './actions'
import { parseLancamentosFinanceiroFile } from '@/lib/carga/parse-lancamentos-financeiro'
import { parseVendasPagamentoFile } from '@/lib/carga/parse-vendas-pagamento'
import { parseContasPagarReceberFile } from '@/lib/carga/parse-contas-pagar-receber'
import type { LancamentoFinanceiroRaw } from '@/lib/carga/parse-lancamentos-financeiro'
import type { VendasPagamentoRaw } from '@/lib/carga/parse-vendas-pagamento'
import type { ContaPagarReceberRaw } from '@/lib/carga/parse-contas-pagar-receber'

type FonteFinanceira = 'lancamentos' | 'vendas_pagamento' | 'contas_pagar_receber'
type EstadoCard = 'idle' | 'validando' | 'aguardando_confirmacao' | 'carregando' | 'sucesso' | 'erro'

interface StatusCarga {
  total: number
  ultima_atualizacao: string | null
}

interface EstadoUpload {
  estado:     EstadoCard
  arquivo:    File | null
  totalLinhas: number
  totalAntes:  number
  mensagem:   string
}

const ESTADO_INICIAL: EstadoUpload = {
  estado: 'idle', arquivo: null, totalLinhas: 0, totalAntes: 0, mensagem: ''
}

const FONTES: { key: FonteFinanceira; label: string; descricao: string }[] = [
  { key: 'lancamentos',          label: 'Lançamentos por Categoria', descricao: 'Export financeiro do ERP — inclui entradas e saídas por categoria' },
  { key: 'vendas_pagamento',     label: 'Vendas por Forma de Pagamento', descricao: 'Vendas discriminadas por instrumento de pagamento e conta bancária' },
  { key: 'contas_pagar_receber', label: 'CAP/CAR', descricao: 'Contas a pagar e receber — adicione coluna tipo_movimento antes do upload' },
]

function formatarData(iso: string | null): string {
  if (!iso) return 'Nunca'
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatarNum(n: number): string { return n.toLocaleString('pt-BR') }

function CardUploadFinanceiro({
  fonte,
  status,
  estado,
  onArquivo,
  onCancelar,
  onConfirmar,
}: {
  fonte:       typeof FONTES[number]
  status:      StatusCarga | null
  estado:      EstadoUpload
  onArquivo:   (f: File) => void
  onCancelar:  () => void
  onConfirmar: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between mb-1">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">{fonte.label}</h2>
          <p className="text-xs text-zinc-400 mt-0.5">{fonte.descricao}</p>
        </div>
        {estado.estado === 'sucesso' && <CheckCircle size={18} className="text-emerald-500 shrink-0" />}
        {estado.estado === 'erro'    && <AlertTriangle size={18} className="text-red-500 shrink-0" />}
      </div>

      {status && (
        <p className="text-xs text-zinc-400 mb-3">
          Última atualização: {formatarData(status.ultima_atualizacao)} · {formatarNum(status.total)} registros
        </p>
      )}

      <div
        className={[
          'border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors mb-3',
          estado.estado === 'idle' || estado.estado === 'erro'
            ? 'border-zinc-200 hover:border-blue-300 hover:bg-blue-50/40'
            : 'border-zinc-100 bg-zinc-50 cursor-default',
        ].join(' ')}
        onClick={() => (estado.estado === 'idle' || estado.estado === 'erro') && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.csv"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) onArquivo(f); e.target.value = '' }}
        />
        {estado.estado === 'idle' && (
          <>
            <Upload size={16} className="mx-auto mb-1.5 text-zinc-400" />
            <p className="text-xs text-zinc-500">Clique para selecionar <span className="font-medium">.xlsx</span> ou <span className="font-medium">.csv</span></p>
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
            <p className="text-xs text-zinc-400">Clique para tentar com outro arquivo</p>
          </div>
        )}
      </div>

      {(estado.estado === 'idle' || estado.estado === 'erro') && (
        <button disabled className="w-full px-4 py-2 text-sm rounded-lg bg-zinc-100 text-zinc-400 cursor-not-allowed">
          Selecione um arquivo para importar
        </button>
      )}
      {estado.estado === 'aguardando_confirmacao' && (
        <div className="flex gap-2">
          <button onClick={onCancelar} className="flex-1 px-4 py-2 text-sm rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50 transition-colors">
            Cancelar
          </button>
          <button onClick={onConfirmar} className="flex-1 px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors font-medium">
            Confirmar e importar
          </button>
        </div>
      )}
    </div>
  )
}

export default function AdminUploadsFinanceiroPage() {
  const [status,  setStatus]  = useState<Record<FonteFinanceira, StatusCarga | null>>({
    lancamentos: null, vendas_pagamento: null, contas_pagar_receber: null,
  })
  const [estados, setEstados] = useState<Record<FonteFinanceira, EstadoUpload>>({
    lancamentos: ESTADO_INICIAL, vendas_pagamento: ESTADO_INICIAL, contas_pagar_receber: ESTADO_INICIAL,
  })

  const lancLinhasRef  = useRef<LancamentoFinanceiroRaw[]>([])
  const vpLinhasRef    = useRef<VendasPagamentoRaw[]>([])
  const cprLinhasRef   = useRef<ContaPagarReceberRaw[]>([])

  function setEstado(key: FonteFinanceira, patch: Partial<EstadoUpload>) {
    setEstados(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }))
  }

  async function carregarStatus() {
    const [lancRes, vpRes, cprRes] = await Promise.allSettled([
      getLancamentosFinanceiroStatusAction(),
      getVendasPagamentoStatusAction(),
      getContasPagarReceberStatusAction(),
    ])
    setStatus({
      lancamentos:          !('error' in (lancRes.status === 'fulfilled' ? lancRes.value : {})) && lancRes.status === 'fulfilled' ? lancRes.value as StatusCarga : null,
      vendas_pagamento:     !('error' in (vpRes.status === 'fulfilled' ? vpRes.value : {})) && vpRes.status === 'fulfilled' ? vpRes.value as StatusCarga : null,
      contas_pagar_receber: !('error' in (cprRes.status === 'fulfilled' ? cprRes.value : {})) && cprRes.status === 'fulfilled' ? cprRes.value as StatusCarga : null,
    })
  }

  useEffect(() => { carregarStatus() }, [])

  async function handleArquivo(key: FonteFinanceira, arquivo: File) {
    setEstado(key, { estado: 'validando', arquivo, totalLinhas: 0, totalAntes: 0, mensagem: '' })

    try {
      let linhas: LancamentoFinanceiroRaw[] | VendasPagamentoRaw[] | ContaPagarReceberRaw[]
      let total: number

      if (key === 'lancamentos') {
        const res = await parseLancamentosFinanceiroFile(arquivo)
        if ('error' in res) { setEstado(key, { estado: 'erro', mensagem: res.error }); return }
        const st = await getLancamentosFinanceiroStatusAction()
        if ('error' in st) { setEstado(key, { estado: 'erro', mensagem: st.error }); return }
        linhas = res; total = st.total; lancLinhasRef.current = res
      } else if (key === 'vendas_pagamento') {
        const res = await parseVendasPagamentoFile(arquivo)
        if ('error' in res) { setEstado(key, { estado: 'erro', mensagem: res.error }); return }
        const st = await getVendasPagamentoStatusAction()
        if ('error' in st) { setEstado(key, { estado: 'erro', mensagem: st.error }); return }
        linhas = res; total = st.total; vpLinhasRef.current = res
      } else {
        const res = await parseContasPagarReceberFile(arquivo)
        if ('error' in res) { setEstado(key, { estado: 'erro', mensagem: res.error }); return }
        const st = await getContasPagarReceberStatusAction()
        if ('error' in st) { setEstado(key, { estado: 'erro', mensagem: st.error }); return }
        linhas = res; total = st.total; cprLinhasRef.current = res
      }

      setEstado(key, { estado: 'aguardando_confirmacao', totalLinhas: linhas.length, totalAntes: total })
    } catch (err) {
      setEstado(key, { estado: 'erro', mensagem: err instanceof Error ? err.message : 'Erro de parse' })
    }
  }

  async function handleConfirmar(key: FonteFinanceira) {
    const est = estados[key]
    if (!est.arquivo) return
    setEstado(key, { estado: 'carregando' })

    const BATCH = 1000
    const nome = est.arquivo.name
    let inseridas = 0

    try {
      if (key === 'lancamentos') {
        const rows = lancLinhasRef.current
        for (let i = 0; i < rows.length; i += BATCH) {
          const res = await inserirLoteLancamentosFinanceiroAction(rows.slice(i, i + BATCH), i === 0, nome)
          if ('error' in res) { setEstado(key, { estado: 'erro', mensagem: res.error }); return }
          inseridas += res.inseridas
        }
        const fin = await finalizarLancamentosFinanceiroAction(est.totalAntes, inseridas)
        if ('error' in fin) { setEstado(key, { estado: 'erro', mensagem: fin.error }); return }
        lancLinhasRef.current = []

      } else if (key === 'vendas_pagamento') {
        const rows = vpLinhasRef.current
        for (let i = 0; i < rows.length; i += BATCH) {
          const res = await inserirLoteVendasPagamentoAction(rows.slice(i, i + BATCH), i === 0, nome)
          if ('error' in res) { setEstado(key, { estado: 'erro', mensagem: res.error }); return }
          inseridas += res.inseridas
        }
        const fin = await finalizarVendasPagamentoAction(est.totalAntes, inseridas)
        if ('error' in fin) { setEstado(key, { estado: 'erro', mensagem: fin.error }); return }
        vpLinhasRef.current = []

      } else {
        const rows = cprLinhasRef.current
        for (let i = 0; i < rows.length; i += BATCH) {
          const res = await inserirLoteContasPagarReceberAction(rows.slice(i, i + BATCH), i === 0, nome)
          if ('error' in res) { setEstado(key, { estado: 'erro', mensagem: res.error }); return }
          inseridas += res.inseridas
        }
        const fin = await finalizarContasPagarReceberAction(est.totalAntes, inseridas)
        if ('error' in fin) { setEstado(key, { estado: 'erro', mensagem: fin.error }); return }
        cprLinhasRef.current = []
      }

      setEstado(key, { estado: 'sucesso', mensagem: `${formatarNum(inseridas)} registros importados com sucesso` })
      await carregarStatus()
    } catch (err) {
      setEstado(key, { estado: 'erro', mensagem: err instanceof Error ? err.message : 'Erro na importação' })
    }
  }

  function handleCancelar(key: FonteFinanceira) {
    if (key === 'lancamentos')          lancLinhasRef.current = []
    if (key === 'vendas_pagamento')     vpLinhasRef.current = []
    if (key === 'contas_pagar_receber') cprLinhasRef.current = []
    setEstado(key, ESTADO_INICIAL)
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Uploads Financeiro</h1>
          <p className="text-sm text-zinc-400 mt-0.5">Importe planilhas financeiras para alimentar o Fluxo de Caixa</p>
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
        {FONTES.map(fonte => (
          <CardUploadFinanceiro
            key={fonte.key}
            fonte={fonte}
            status={status[fonte.key]}
            estado={estados[fonte.key]}
            onArquivo={f => handleArquivo(fonte.key, f)}
            onCancelar={() => handleCancelar(fonte.key)}
            onConfirmar={() => handleConfirmar(fonte.key)}
          />
        ))}
      </div>
    </div>
  )
}
