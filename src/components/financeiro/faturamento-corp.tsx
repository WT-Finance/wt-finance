'use client'

// Faturamento Corporativo — Fase 1a (v4.30.0). TELA DE REVISÃO, READ-ONLY.
// Importa a crua → cruza com a base de pessoas (buscar_pessoas via server action) →
// classifica (pronta / faltam dados fiscais / não identificado) → revisão.
// ZERO Asaas, ZERO emissão, ZERO escrita-no-mundo. A fase TERMINA aqui — o botão de
// emitir é da Fase 1b. Espelha a UX da Calculadora de Rateio (dropzone + spinner 2 fases).

import { useRef, useState, useCallback } from 'react'
import { Upload, Loader2, AlertTriangle } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { numBRL2 } from '@/lib/fmt'
import { SETOR_COLORS } from '@/lib/config'
import { parseFaturamentoFile } from '@/lib/faturamento/parse-faturamento'
import { classificarFaturas, mapaPorNome } from '@/lib/faturamento/classificar'
import { cruzarFaturamento } from '@/app/financeiro/faturamento-corp/actions'
import type { FaturaClassificada, ResumoFaturamento, StatusCruzamento } from '@/lib/faturamento/tipos'

const COR_CORP = SETOR_COLORS.Corporativo // var(--setor-corporativo) — cor do setor

const STATUS_LABEL: Record<StatusCruzamento, string> = {
  pronta: 'Pronta', sem_dados_fiscais: 'Faltam dados fiscais', nao_identificado: 'Não identificado',
}
const STATUS_CLASSE: Record<StatusCruzamento, string> = {
  pronta:            'border-success bg-success-bg text-success',
  sem_dados_fiscais: 'border-warning bg-warning-bg text-warning',
  nao_identificado:  'border-zinc-200 bg-zinc-100 text-zinc-500',
}

const fmtData = (iso: string | null) => iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—'

type Estado = 'vazio' | 'processando' | 'pronto' | 'erro'
type Fase   = 'lendo' | 'cruzando'
const LARGURA: Record<Fase, string> = { lendo: '40%', cruzando: '85%' }
const LABEL:   Record<Fase, string> = { lendo: 'Lendo a planilha…', cruzando: 'Cruzando com a base de pessoas…' }

export default function FaturamentoCorp() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [estado, setEstado]       = useState<Estado>('vazio')
  const [fase, setFase]           = useState<Fase>('lendo')
  const [erro, setErro]           = useState<string | null>(null)
  const [faturas, setFaturas]     = useState<FaturaClassificada[]>([])
  const [resumo, setResumo]       = useState<ResumoFaturamento | null>(null)
  const [nomeArquivo, setNome]    = useState<string | null>(null)
  const [isDragging, setDragging] = useState(false)

  const ativo = estado !== 'processando'

  async function processar(file: File) {
    setErro(null); setEstado('processando'); setFase('lendo'); setResumo(null); setFaturas([])

    if (file.size > 10 * 1024 * 1024) { setErro('Arquivo maior que 10MB.'); setEstado('erro'); return }

    const parsed = await parseFaturamentoFile(file)
    if ('error' in parsed) { setErro(parsed.error); setEstado('erro'); return }

    setFase('cruzando')
    const nomes = Array.from(new Set(
      parsed.map(f => f.pessoa).filter((p): p is string => p !== null && p.trim() !== ''),
    ))
    let cadastros
    try {
      cadastros = await cruzarFaturamento(nomes)
    } catch {
      setErro('Não foi possível consultar a base de pessoas. Tente novamente.'); setEstado('erro'); return
    }

    const { faturas: classificadas, resumo: r } = classificarFaturas(parsed, mapaPorNome(cadastros))
    setFaturas(classificadas)
    setResumo(r)
    setNome(file.name)
    setEstado('pronto')
  }

  function toggleEmitir(linha: number) {
    setFaturas(prev => prev.map(f => f.linha === linha ? { ...f, emitir: !f.emitir } : f))
  }

  // ── Drag & drop (padrão admin/uploads + Calculadora) ────────────────────────
  const onDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); if (estado !== 'processando') setDragging(true) }, [estado])
  const onDragLeave = useCallback((e: React.DragEvent) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false) }, [])
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    if (estado === 'processando') return
    const f = e.dataTransfer.files?.[0]; if (f) void processar(f)
  }, [estado])
  function onInput(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (f) void processar(f); e.target.value = ''
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho — sem ícone (padrão das páginas) */}
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">Faturamento Corporativo</h1>
        <p className="text-sm text-zinc-400 mt-0.5">
          Importe a planilha de faturamento — cruzamos cada cliente com a base de pessoas e mostramos a revisão. Nada é emitido nesta etapa.
        </p>
      </div>

      {/* Upload */}
      <Card>
        <div
          className={[
            'border-2 border-dashed rounded-lg p-6 text-center transition-colors',
            ativo ? 'cursor-pointer' : 'cursor-default',
            ativo && isDragging ? 'border-action-soft-border bg-action-soft'
              : ativo ? 'border-zinc-200 hover:border-action-soft-border hover:bg-action-soft/40'
              : 'border-zinc-100 bg-zinc-50',
          ].join(' ')}
          onClick={() => ativo && inputRef.current?.click()}
          onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
        >
          <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onInput} />
          {(estado === 'vazio' || estado === 'pronto') && (
            <>
              <Upload size={18} className="mx-auto mb-1.5 text-zinc-400" />
              <p className="text-sm text-zinc-600">
                Arraste ou clique para selecionar a planilha <span className="font-medium">.xlsx</span> ou <span className="font-medium">.csv</span>
              </p>
              <p className="mt-1 text-xs text-zinc-400">
                Precisa conter <b>Pessoa</b>, <b>Valor Final</b>, <b>Vencimento</b> e <b>Fatura Cliente Nº</b>. O arquivo não é enviado nem armazenado.
              </p>
              {estado === 'pronto' && nomeArquivo && (
                <p className="mt-2 text-xs text-zinc-500">Planilha: <span className="font-medium">{nomeArquivo}</span> — clique para trocar</p>
              )}
            </>
          )}
          {estado === 'processando' && (
            <div className="text-xs text-text-secondary">
              <div className="flex items-center justify-center gap-2 mb-2"><Loader2 size={14} className="animate-spin" />{LABEL[fase]}</div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-action-soft">
                <div className="h-full rounded-full bg-action-primary transition-all duration-500" style={{ width: LARGURA[fase] }} />
              </div>
            </div>
          )}
          {estado === 'erro' && (
            <div>
              <AlertTriangle size={18} className="mx-auto mb-1.5 text-danger" />
              <p className="text-sm text-danger font-medium">{erro}</p>
              <p className="mt-1 text-xs text-zinc-400">Arraste ou clique para tentar com outro arquivo</p>
            </div>
          )}
        </div>
      </Card>

      {/* Revisão */}
      {resumo && estado === 'pronto' && (
        <Card title="Revisão do faturamento" subtitle="Confira o cruzamento de cada fatura. Nada é emitido nesta etapa.">
          {/* Resumo no topo */}
          <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 border-b border-zinc-100 pb-3 mb-3 text-sm">
            <span className="font-semibold" style={{ color: COR_CORP }}>{resumo.total} {resumo.total === 1 ? 'fatura' : 'faturas'}</span>
            <span className="text-zinc-500">Total <span className="text-[var(--text-subtle)] text-2xs">R$</span> <span className="tabular-nums font-medium text-zinc-700">{numBRL2(resumo.valorTotal)}</span></span>
            <span className="text-success">{resumo.prontas} {resumo.prontas === 1 ? 'pronta' : 'prontas'}</span>
            <span className="text-warning">{resumo.semDados} sem dados fiscais</span>
            <span className="text-zinc-500">{resumo.naoIdentificadas} não identificadas</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-2xs">
              <thead>
                <tr className="border-b border-zinc-100 text-left uppercase tracking-wide text-zinc-400">
                  <th className="py-1.5 px-2">Pessoa</th>
                  <th className="py-1.5 px-2 text-right w-28">Valor</th>
                  <th className="py-1.5 px-2 w-24">Vencimento</th>
                  <th className="py-1.5 px-2 w-28">Fatura Cliente Nº</th>
                  <th className="py-1.5 px-2">Cruzamento</th>
                  <th className="py-1.5 px-2 w-16 text-center">Emitir</th>
                </tr>
              </thead>
              <tbody>
                {faturas.map(f => (
                  <tr key={f.linha} className="border-b border-zinc-50 align-top">
                    <td className="py-1.5 px-2 text-zinc-700">
                      <span className="block">{f.pessoa ?? <span className="text-zinc-400">(sem nome)</span>}</span>
                      {f.multiplos && <span className="text-3xs text-warning">⚠ múltiplos cadastros com este nome</span>}
                    </td>
                    <td className="py-1.5 px-2 text-right tabular-nums text-zinc-700">{f.valor !== null ? numBRL2(f.valor) : '—'}</td>
                    <td className="py-1.5 px-2 tabular-nums text-zinc-600">{fmtData(f.vencimento)}</td>
                    <td className="py-1.5 px-2 tabular-nums text-zinc-600">{f.fatura_cliente_no ?? '—'}</td>
                    <td className="py-1.5 px-2">
                      <span className={`inline-block rounded-full border px-2 py-0.5 text-3xs font-medium whitespace-nowrap ${STATUS_CLASSE[f.status]}`}>
                        {STATUS_LABEL[f.status]}
                      </span>
                      {f.faltam.length > 0 && f.status !== 'nao_identificado' && (
                        <span className="block mt-0.5 text-3xs text-zinc-400">faltam: {f.faltam.join(', ')}</span>
                      )}
                    </td>
                    <td className="py-1.5 px-2 text-center">
                      <input
                        type="checkbox"
                        className="foco-neutro accent-[var(--setor-corporativo)] cursor-pointer"
                        checked={f.emitir}
                        onChange={() => toggleEmitir(f.linha)}
                        aria-label={`Pré-selecionar para emissão (Fase 1b) — fatura ${f.fatura_cliente_no ?? f.linha}; nada é emitido nesta etapa`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* SEM botão de emitir — a fase termina na revisão */}
          <p className="mt-4 rounded-lg bg-zinc-50 border border-zinc-100 px-3 py-2 text-2xs text-zinc-500">
            A <b>emissão de boletos</b> será habilitada na próxima versão (Fase 1b). Nesta tela nada é emitido — o
            marcador “Emitir” é apenas a sua pré-seleção para a revisão.
          </p>
        </Card>
      )}
    </div>
  )
}
