'use client'

// Faturamento Corporativo — Fase 2 (v4.32.0). TELA DE REVISÃO + EMISSÃO de boletos E NOTAS.
// Fase 1: importa a crua → cruza → emite BOLETOS. Fase 2 (esta): por cima, NOTAS FISCAIS
// (NFS-e) opcionais por linha (Normal/Avulsa/Não emitir). A NF é documento fiscal irreversível
// e ASSÍNCRONA — a UI mostra "processando" e um refresh de status resolve; "ver nota" abre o
// pdfUrl quando autorizada. Ambiente sempre visível; produção = confirmação reforçada.

import { useRef, useState, useCallback, useMemo } from 'react'
import { Upload, Loader2, AlertTriangle, ShieldAlert, FlaskConical, CheckCircle2, ExternalLink, FileText, RefreshCw } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { numBRL2 } from '@/lib/fmt'
import { SETOR_COLORS } from '@/lib/config'
import { parseFaturamentoFile } from '@/lib/faturamento/parse-faturamento'
import { classificarFaturas, mapaPorNome } from '@/lib/faturamento/classificar'
import {
  cruzarFaturamento, emitirBoletos, emitirNotas, atualizarStatusNotas,
  type FaturaEmitir, type ResultadoEmissao, type ItemEmissao,
  type NotaEmitir, type ResultadoNotas, type ItemNota,
} from '@/app/financeiro/faturamento-corp/actions'
import type { FaturaClassificada, ResumoFaturamento, StatusCruzamento, ModoNota } from '@/lib/faturamento/tipos'
import type { AsaasAmbiente } from '@/lib/asaas/client'

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
// externalReference da NF no cliente (espelha externalReferenceNota do server-only notas.ts).
const refNota = (fcn: string, modo: ModoNota) => modo === 'avulsa' ? `${fcn}-AVULSA` : fcn

type Estado = 'vazio' | 'processando' | 'pronto' | 'erro'
type Fase   = 'lendo' | 'cruzando'
const LARGURA: Record<Fase, string> = { lendo: '40%', cruzando: '85%' }
const LABEL:   Record<Fase, string> = { lendo: 'Lendo a planilha…', cruzando: 'Cruzando com a base de pessoas…' }

/** Status corrente de uma NF (após emitir/atualizar). */
interface NotaStatus { status: string | null; pdfUrl: string | null; number: string | null; invoiceId: string | null }

interface Props {
  ambiente:    AsaasAmbiente
  configurado: boolean
}

export default function FaturamentoCorp({ ambiente, configurado }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [estado, setEstado]       = useState<Estado>('vazio')
  const [fase, setFase]           = useState<Fase>('lendo')
  const [erro, setErro]           = useState<string | null>(null)
  const [faturas, setFaturas]     = useState<FaturaClassificada[]>([])
  const [resumo, setResumo]       = useState<ResumoFaturamento | null>(null)
  const [nomeArquivo, setNome]    = useState<string | null>(null)
  const [isDragging, setDragging] = useState(false)

  // Emissão de BOLETOS (Fase 1)
  const [modalAberto, setModal]       = useState(false)
  const [confirmTexto, setConfirm]    = useState('')
  const [emitindo, setEmitindo]       = useState(false)
  const [resultado, setResultado]     = useState<ResultadoEmissao | null>(null)

  // Emissão de NOTAS + status (Fase 2)
  const [modalNota, setModalNota]     = useState(false)
  const [confirmNota, setConfirmNota] = useState('')
  const [emitindoNota, setEmitNota]   = useState(false)
  const [resultadoNota, setResNota]   = useState<ResultadoNotas | null>(null)
  const [notaStatus, setNotaStatus]   = useState<Record<string, NotaStatus>>({}) // ref → status corrente
  const [atualizando, setAtualizando] = useState(false)

  const ativo = estado !== 'processando' && !emitindo && !emitindoNota
  const ehProducao = ambiente === 'producao'

  // Mapa ref→resultado (boletos) — marca cada linha após emitir.
  const resultadoPorRef = useMemo(() => {
    const m = new Map<string, ItemEmissao>()
    if (resultado) for (const it of [...resultado.emitidos, ...resultado.jaExistiam, ...resultado.falharam, ...resultado.pulados]) m.set(it.ref, it)
    return m
  }, [resultado])

  // Mapa ref→resultado (notas).
  const notaPorRef = useMemo(() => {
    const m = new Map<string, ItemNota>()
    if (resultadoNota) for (const it of [...resultadoNota.emitidas, ...resultadoNota.jaExistiam, ...resultadoNota.falharam, ...resultadoNota.puladas]) m.set(it.ref, it)
    return m
  }, [resultadoNota])

  // Boleto: só faturas PRONTAS marcadas.
  const selecionadas = useMemo(
    () => faturas.filter(f => f.status === 'pronta' && f.emitir && f.fatura_cliente_no),
    [faturas],
  )
  const totalSelecionado = useMemo(() => selecionadas.reduce((s, f) => s + (f.valor ?? 0), 0), [selecionadas])

  // NF: só faturas PRONTAS-NF com modo != 'nao'. Valor = boleto (normal) ou avulso.
  const selecionadasNota = useMemo(
    () => faturas.filter(f => f.prontaNf && f.modoNf !== 'nao' && f.fatura_cliente_no),
    [faturas],
  )
  const totalNota = useMemo(
    () => selecionadasNota.reduce((s, f) => s + ((f.modoNf === 'avulsa' ? f.valorAvulso : f.valor) ?? 0), 0),
    [selecionadasNota],
  )

  async function processar(file: File) {
    setErro(null); setEstado('processando'); setFase('lendo'); setResumo(null); setFaturas([]); setResultado(null); setResNota(null); setNotaStatus({})

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
    setFaturas(prev => prev.map(f => f.linha === linha && f.status === 'pronta' ? { ...f, emitir: !f.emitir } : f))
  }
  function setModoNf(linha: number, modo: ModoNota) {
    setFaturas(prev => prev.map(f => f.linha === linha && f.prontaNf ? { ...f, modoNf: modo } : f))
  }
  function setValorAvulso(linha: number, valor: number | null) {
    setFaturas(prev => prev.map(f => f.linha === linha ? { ...f, valorAvulso: valor } : f))
  }

  // ── Emitir boletos (Fase 1) ─────────────────────────────────────────────────
  function abrirConfirmacao() { if (selecionadas.length === 0 || !configurado) return; setConfirm(''); setModal(true) }
  async function confirmarEmissao() {
    setModal(false); setEmitindo(true)
    const payload: FaturaEmitir[] = selecionadas.map(f => ({
      pessoa: (f.pessoa ?? '').trim(), valor: f.valor, vencimento: f.vencimento, fatura_cliente_no: f.fatura_cliente_no,
    }))
    try {
      const res = await emitirBoletos(payload, { confirmacaoProducao: ehProducao })
      setResultado(res)
    } catch {
      setResultado({ ambiente, emitidos: [], jaExistiam: [], falharam: payload.map(p => ({ ref: p.fatura_cliente_no ?? '(sem nº)', pessoa: p.pessoa, resultado: 'falhou' as const, erro: 'Falha inesperada ao emitir. Nada confirmado — verifique e tente de novo.' })), pulados: [], total: payload.length })
    } finally { setEmitindo(false) }
  }

  // ── Emitir notas fiscais (Fase 2) ───────────────────────────────────────────
  function abrirConfirmacaoNota() { if (selecionadasNota.length === 0 || !configurado) return; setConfirmNota(''); setModalNota(true) }
  async function confirmarEmissaoNota() {
    setModalNota(false); setEmitNota(true)
    const payload: NotaEmitir[] = selecionadasNota.map(f => ({
      pessoa: (f.pessoa ?? '').trim(), fatura_cliente_no: f.fatura_cliente_no,
      modo: f.modoNf === 'avulsa' ? 'avulsa' : 'normal',
      valorBoleto: f.valor, valorAvulso: f.valorAvulso,
    }))
    try {
      const res = await emitirNotas(payload, { confirmacaoProducao: ehProducao })
      setResNota(res)
      // semente do status corrente a partir do resultado (as emitidas ficam "processando")
      setNotaStatus(prev => {
        const next = { ...prev }
        for (const it of [...res.emitidas, ...res.jaExistiam]) {
          next[it.ref] = { status: it.status ?? null, pdfUrl: it.pdfUrl ?? null, number: null, invoiceId: it.invoiceId ?? null }
        }
        return next
      })
    } catch {
      setResNota({ ambiente, emitidas: [], jaExistiam: [], falharam: payload.map(p => ({ ref: p.fatura_cliente_no ?? '(sem nº)', faturaClienteNo: p.fatura_cliente_no ?? '', pessoa: p.pessoa, modo: p.modo, resultado: 'falhou' as const, erro: 'Falha inesperada ao emitir. Nada confirmado — verifique e tente de novo.' })), puladas: [], total: payload.length })
    } finally { setEmitNota(false) }
  }

  async function atualizarStatus() {
    const itens = Object.entries(notaStatus)
      .filter(([, s]) => s.invoiceId)
      .map(([ref, s]) => ({ externalReference: ref, invoiceId: s.invoiceId! }))
    if (itens.length === 0) return
    setAtualizando(true)
    try {
      const res = await atualizarStatusNotas(itens)
      setNotaStatus(prev => {
        const next = { ...prev }
        for (const r of res) {
          const atual = next[r.externalReference]
          if (atual) next[r.externalReference] = { ...atual, status: r.status ?? atual.status, pdfUrl: r.pdfUrl ?? atual.pdfUrl, number: r.number ?? atual.number }
        }
        return next
      })
    } catch { /* silencioso — o usuário pode tentar de novo */ } finally { setAtualizando(false) }
  }

  // ── Drag & drop ─────────────────────────────────────────────────────────────
  const onDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); if (ativo) setDragging(true) }, [ativo])
  const onDragLeave = useCallback((e: React.DragEvent) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false) }, [])
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    if (!ativo) return
    const f = e.dataTransfer.files?.[0]; if (f) void processar(f)
  }, [ativo])
  function onInput(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (f) void processar(f); e.target.value = ''
  }

  const temNotaComStatus = Object.values(notaStatus).some(s => s.invoiceId)

  return (
    <div className="space-y-6">
      {/* Cabeçalho + badge de ambiente (SEMPRE visível) */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Faturamento Corporativo</h1>
          <p className="text-sm text-zinc-400 mt-0.5">
            Importe a planilha, confira o cruzamento e emita boletos e notas fiscais das faturas prontas.
          </p>
        </div>
        <AmbienteBadge ambiente={ambiente} configurado={configurado} />
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

      {/* Resultados da emissão (aparecem após emitir) */}
      {resultado && <ResultadoEmissaoCard resultado={resultado} />}
      {resultadoNota && (
        <ResultadoNotaCard
          resultado={resultadoNota}
          onAtualizar={() => void atualizarStatus()}
          atualizando={atualizando}
          podeAtualizar={temNotaComStatus}
        />
      )}

      {/* Revisão */}
      {resumo && estado === 'pronto' && (
        <Card title="Revisão do faturamento" subtitle="Confira o cruzamento, marque os boletos e escolha as notas fiscais.">
          {/* Resumo no topo */}
          <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 border-b border-zinc-100 pb-3 mb-3 text-sm">
            <span className="font-semibold" style={{ color: COR_CORP }}>{resumo.total} {resumo.total === 1 ? 'fatura' : 'faturas'}</span>
            <span className="text-zinc-500">Total <span className="text-[var(--text-subtle)] text-2xs">R$</span> <span className="tabular-nums font-medium text-zinc-700">{numBRL2(resumo.valorTotal)}</span></span>
            <span className="text-success">{resumo.prontas} {resumo.prontas === 1 ? 'pronta' : 'prontas'}</span>
            <span className="text-warning">{resumo.semDados} sem dados fiscais</span>
            <span className="text-zinc-500">{resumo.naoIdentificadas} não identificadas</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[56rem] text-2xs">
              <thead>
                <tr className="border-b border-zinc-100 text-left uppercase tracking-wide text-zinc-400">
                  <th className="py-1.5 px-2">Pessoa</th>
                  <th className="py-1.5 px-2 text-right w-28">Valor</th>
                  <th className="py-1.5 px-2 w-24">Vencimento</th>
                  <th className="py-1.5 px-2 w-28">Fatura Cliente Nº</th>
                  <th className="py-1.5 px-2">Cruzamento</th>
                  <th className="py-1.5 px-2 w-14 text-center">Boleto</th>
                  <th className="py-1.5 px-2 w-44">Nota fiscal</th>
                </tr>
              </thead>
              <tbody>
                {faturas.map(f => {
                  const rBol = f.fatura_cliente_no ? resultadoPorRef.get(f.fatura_cliente_no) : undefined
                  const refNf = f.fatura_cliente_no ? refNota(f.fatura_cliente_no, f.modoNf) : ''
                  const rNota = refNf ? notaPorRef.get(refNf) : undefined
                  const stNota = refNf ? notaStatus[refNf] : undefined
                  return (
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
                        {rBol && <LinhaResultado item={rBol} />}
                      </td>
                      <td className="py-1.5 px-2 text-center">
                        <input
                          type="checkbox"
                          className="foco-neutro accent-[var(--setor-corporativo)] cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                          checked={f.status === 'pronta' && f.emitir}
                          disabled={f.status !== 'pronta' || emitindo}
                          onChange={() => toggleEmitir(f.linha)}
                          aria-label={`Marcar para emitir boleto — fatura ${f.fatura_cliente_no ?? f.linha}`}
                        />
                      </td>
                      <td className="py-1.5 px-2">
                        <ControleNota
                          fatura={f}
                          desabilitado={emitindoNota}
                          onModo={m => setModoNf(f.linha, m)}
                          onValorAvulso={v => setValorAvulso(f.linha, v)}
                        />
                        {rNota && <LinhaResultadoNota item={rNota} status={stNota} />}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Barra de ação — boleto */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 pt-4">
            <p className="text-2xs text-zinc-500">
              {selecionadas.length > 0
                ? <>Boletos: <b className="text-zinc-700">{selecionadas.length}</b> {selecionadas.length === 1 ? 'fatura' : 'faturas'} · Total <span className="text-[var(--text-subtle)]">R$</span> <span className="tabular-nums text-zinc-700">{numBRL2(totalSelecionado)}</span></>
                : 'Marque as faturas prontas para emitir boleto.'}
            </p>
            <button
              type="button" onClick={abrirConfirmacao}
              disabled={selecionadas.length === 0 || !configurado || emitindo}
              className="inline-flex items-center gap-2 rounded-md bg-action-primary px-4 py-2 text-xs font-medium text-action-primary-fg foco-neutro transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {emitindo ? <Loader2 size={14} className="animate-spin" /> : null}
              {emitindo ? 'Emitindo…' : `Emitir ${selecionadas.length || ''} ${selecionadas.length === 1 ? 'boleto' : 'boletos'}`.trim()}
            </button>
          </div>

          {/* Barra de ação — nota fiscal */}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <p className="text-2xs text-zinc-500">
              {selecionadasNota.length > 0
                ? <>Notas fiscais: <b className="text-zinc-700">{selecionadasNota.length}</b> ({selecionadasNota.filter(f => f.modoNf === 'avulsa').length} avulsa{selecionadasNota.filter(f => f.modoNf === 'avulsa').length === 1 ? '' : 's'}) · Total <span className="text-[var(--text-subtle)]">R$</span> <span className="tabular-nums text-zinc-700">{numBRL2(totalNota)}</span></>
                : 'Escolha as notas fiscais (Normal/Avulsa) nas faturas prontas para NF.'}
            </p>
            <button
              type="button" onClick={abrirConfirmacaoNota}
              disabled={selecionadasNota.length === 0 || !configurado || emitindoNota}
              className="inline-flex items-center gap-2 rounded-md border border-action-soft-border bg-action-soft px-4 py-2 text-xs font-medium text-action-primary foco-neutro transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {emitindoNota ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
              {emitindoNota ? 'Emitindo…' : `Emitir ${selecionadasNota.length || ''} ${selecionadasNota.length === 1 ? 'nota fiscal' : 'notas fiscais'}`.trim()}
            </button>
          </div>

          {!configurado && (
            <p className="mt-2 text-2xs text-warning">⚠ Asaas não configurado neste ambiente — a emissão está indisponível.</p>
          )}
          <p className="mt-3 text-3xs text-zinc-400">
            A nota fiscal é opcional por fatura e exige endereço/CEP no cadastro. A NF é <b>assíncrona</b>: após emitir, fica “processando” até a prefeitura autorizar — use “Atualizar status” para ver o resultado e o link da nota.
          </p>
        </Card>
      )}

      {/* Modais de confirmação */}
      {modalAberto && (
        <ConfirmacaoEmissao
          ambiente={ambiente} itemSingular="boleto" itemPlural="boletos" avisoProducao="boletos reais e cobráveis"
          quantidade={selecionadas.length} total={totalSelecionado}
          confirmTexto={confirmTexto} onTexto={setConfirm}
          confirmacaoOk={!ehProducao || confirmTexto.trim().toUpperCase() === 'EMITIR'}
          onCancelar={() => setModal(false)} onConfirmar={() => void confirmarEmissao()}
        />
      )}
      {modalNota && (
        <ConfirmacaoEmissao
          ambiente={ambiente} itemSingular="nota fiscal" itemPlural="notas fiscais" avisoProducao="notas fiscais reais (documento fiscal com a Receita)"
          quantidade={selecionadasNota.length} total={totalNota}
          confirmTexto={confirmNota} onTexto={setConfirmNota}
          confirmacaoOk={!ehProducao || confirmNota.trim().toUpperCase() === 'EMITIR'}
          onCancelar={() => setModalNota(false)} onConfirmar={() => void confirmarEmissaoNota()}
        />
      )}
    </div>
  )
}

// ── Controle de NF por linha (3 estados + valor avulso) ───────────────────────
function ControleNota({ fatura, desabilitado, onModo, onValorAvulso }: {
  fatura: FaturaClassificada
  desabilitado: boolean
  onModo: (m: ModoNota) => void
  onValorAvulso: (v: number | null) => void
}) {
  if (!fatura.prontaNf) {
    return <span className="text-3xs text-zinc-400">{fatura.status === 'nao_identificado' ? '—' : 'faltam dados fiscais p/ NF'}</span>
  }
  return (
    <div className="space-y-1">
      <select
        value={fatura.modoNf}
        disabled={desabilitado}
        onChange={e => onModo(e.target.value as ModoNota)}
        className="foco-neutro w-full rounded border border-zinc-200 bg-white px-1.5 py-1 text-3xs text-zinc-700 disabled:opacity-40"
        aria-label={`Nota fiscal — fatura ${fatura.fatura_cliente_no ?? fatura.linha}`}
      >
        <option value="nao">Não emitir</option>
        <option value="normal">Normal (valor da fatura)</option>
        <option value="avulsa">Avulsa (valor próprio)</option>
      </select>
      {fatura.modoNf === 'avulsa' && (
        <div className="flex items-center gap-1">
          <span className="text-3xs text-[var(--text-subtle)]">R$</span>
          <input
            type="number" step="0.01" min="0" inputMode="decimal"
            value={fatura.valorAvulso ?? ''}
            disabled={desabilitado}
            onChange={e => onValorAvulso(e.target.value === '' ? null : Number(e.target.value))}
            className="foco-neutro w-full rounded border border-zinc-200 px-1.5 py-1 text-3xs tabular-nums text-zinc-700 disabled:opacity-40"
            placeholder="valor avulso"
            aria-label="Valor da nota avulsa"
          />
        </div>
      )}
    </div>
  )
}

// ── Badge de ambiente — SEMPRE visível; produção é forte e vermelho ───────────
function AmbienteBadge({ ambiente, configurado }: Props) {
  if (ambiente === 'producao') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-danger bg-danger-bg px-2.5 py-1 text-xs font-semibold text-danger">
        <ShieldAlert size={14} /> PRODUÇÃO · documentos reais
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-action-soft-border bg-action-soft px-2.5 py-1 text-xs font-medium text-action-primary">
      <FlaskConical size={14} /> Ambiente de testes (sandbox){!configurado && ' · sem chave'}
    </span>
  )
}

// ── Resultado por fatura (boleto) na coluna Cruzamento ────────────────────────
function LinhaResultado({ item }: { item: ItemEmissao }) {
  if (item.resultado === 'emitido' || item.resultado === 'ja_existia') {
    return (
      <span className="mt-0.5 flex items-center gap-1 text-3xs text-success">
        <CheckCircle2 size={11} />
        {item.resultado === 'ja_existia' ? 'boleto já existia' : 'boleto emitido'}
        {item.bankSlipUrl && (
          <a href={item.bankSlipUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 underline">ver boleto <ExternalLink size={9} /></a>
        )}
        {item.registroFalhou && <span className="text-warning">(registro local falhou)</span>}
      </span>
    )
  }
  if (item.resultado === 'pulado') return <span className="mt-0.5 block text-3xs text-zinc-400">boleto pulado (já emitido)</span>
  return <span className="mt-0.5 block text-3xs text-danger">boleto falhou: {item.erro}</span>
}

// ── Resultado + status por fatura (nota) na coluna Nota fiscal ─────────────────
function LinhaResultadoNota({ item, status }: { item: ItemNota; status?: NotaStatus }) {
  if (item.resultado === 'falhou') return <span className="mt-1 block text-3xs text-danger">falhou: {item.erro}</span>
  if (item.resultado === 'pulada') return <span className="mt-1 block text-3xs text-zinc-400">pulada (já emitida)</span>

  const st = (status?.status ?? item.status ?? '').toUpperCase()
  const pdf = status?.pdfUrl ?? item.pdfUrl ?? null
  const autorizada = st === 'AUTHORIZED'
  // NF criada mas autorização falhou: a nota existe, porém não foi autorizada — avisa (não mascara).
  if (item.avisoAutorizacao) {
    return (
      <span className="mt-1 flex flex-wrap items-center gap-1 text-3xs text-warning">
        <AlertTriangle size={11} /> NF criada, mas a autorização falhou: {item.avisoAutorizacao}
        {status?.number && <span className="text-zinc-400">nº {status.number}</span>}
        {pdf && <a href={pdf} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 underline">ver nota <ExternalLink size={9} /></a>}
      </span>
    )
  }
  return (
    <span className={`mt-1 flex flex-wrap items-center gap-1 text-3xs ${autorizada ? 'text-success' : 'text-action-primary'}`}>
      {autorizada ? <CheckCircle2 size={11} /> : <Loader2 size={11} className="animate-spin" />}
      {autorizada ? 'NF autorizada' : `NF ${st ? st.toLowerCase() : 'processando'}`}
      {status?.number && <span className="text-zinc-400">nº {status.number}</span>}
      {pdf && <a href={pdf} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 underline">ver nota <ExternalLink size={9} /></a>}
      {item.registroFalhou && <span className="text-warning">(registro local falhou)</span>}
    </span>
  )
}

// ── Painel de resultado da emissão de boletos ─────────────────────────────────
function ResultadoEmissaoCard({ resultado }: { resultado: ResultadoEmissao }) {
  const { emitidos, jaExistiam, falharam, pulados, ambiente } = resultado
  const okN = emitidos.length + jaExistiam.length
  return (
    <Card title="Resultado da emissão de boletos" subtitle={`Ambiente: ${ambiente === 'producao' ? 'PRODUÇÃO' : 'sandbox (testes)'}`}>
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm">
        <span className="text-success font-medium">{okN} {okN === 1 ? 'boleto' : 'boletos'} ok{jaExistiam.length > 0 ? ` (${jaExistiam.length} já existia${jaExistiam.length === 1 ? '' : 'm'})` : ''}</span>
        {falharam.length > 0 && <span className="text-danger font-medium">{falharam.length} {falharam.length === 1 ? 'falhou' : 'falharam'}</span>}
        {pulados.length > 0 && <span className="text-zinc-500">{pulados.length} pulada{pulados.length === 1 ? '' : 's'} (já emitidas)</span>}
      </div>
      {falharam.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-zinc-100 pt-3 text-2xs text-zinc-600">
          {falharam.map((it, i) => (<li key={`${it.ref}-${i}`}><span className="font-medium text-zinc-700">{it.pessoa || it.ref}</span> — <span className="text-danger">{it.erro}</span></li>))}
        </ul>
      )}
      <p className="mt-3 text-3xs text-zinc-400">Cada boleto é independente: as falhas não afetam os já emitidos. Reprocessar não duplica — as faturas já emitidas são puladas.</p>
    </Card>
  )
}

// ── Painel de resultado da emissão de notas + atualizar status ────────────────
function ResultadoNotaCard({ resultado, onAtualizar, atualizando, podeAtualizar }: {
  resultado: ResultadoNotas; onAtualizar: () => void; atualizando: boolean; podeAtualizar: boolean
}) {
  const { emitidas, jaExistiam, falharam, puladas, ambiente } = resultado
  const okN = emitidas.length + jaExistiam.length
  return (
    <Card title="Resultado da emissão de notas fiscais" subtitle={`Ambiente: ${ambiente === 'producao' ? 'PRODUÇÃO' : 'sandbox (testes)'} · a NF é assíncrona`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm">
          <span className="text-success font-medium">{okN} {okN === 1 ? 'nota' : 'notas'} ok{jaExistiam.length > 0 ? ` (${jaExistiam.length} já existia${jaExistiam.length === 1 ? '' : 'm'})` : ''}</span>
          {falharam.length > 0 && <span className="text-danger font-medium">{falharam.length} {falharam.length === 1 ? 'falhou' : 'falharam'}</span>}
          {puladas.length > 0 && <span className="text-zinc-500">{puladas.length} pulada{puladas.length === 1 ? '' : 's'}</span>}
        </div>
        {podeAtualizar && (
          <button
            type="button" onClick={onAtualizar} disabled={atualizando}
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 px-3 py-1.5 text-2xs font-medium text-zinc-600 foco-neutro hover:bg-zinc-50 disabled:opacity-40"
          >
            {atualizando ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            {atualizando ? 'Atualizando…' : 'Atualizar status'}
          </button>
        )}
      </div>
      {falharam.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-zinc-100 pt-3 text-2xs text-zinc-600">
          {falharam.map((it, i) => (<li key={`${it.ref}-${i}`}><span className="font-medium text-zinc-700">{it.pessoa || it.ref}</span> — <span className="text-danger">{it.erro}</span></li>))}
        </ul>
      )}
      <p className="mt-3 text-3xs text-zinc-400">
        A autorização da prefeitura pode levar alguns minutos. Clique em “Atualizar status” para ver quando cada nota fica <b>autorizada</b> e abrir o link. Reprocessar não duplica — as notas já emitidas (normal e avulsa) são puladas.
      </p>
    </Card>
  )
}

// ── Modal de confirmação (genérico boleto/nota; produção = reforçada) ─────────
function ConfirmacaoEmissao(props: {
  ambiente: AsaasAmbiente
  itemSingular: string
  itemPlural: string
  avisoProducao: string
  quantidade: number
  total: number
  confirmTexto: string
  onTexto: (v: string) => void
  confirmacaoOk: boolean
  onCancelar: () => void
  onConfirmar: () => void
}) {
  const { ambiente, itemSingular, itemPlural, avisoProducao, quantidade, total, confirmTexto, onTexto, confirmacaoOk, onCancelar, onConfirmar } = props
  const ehProducao = ambiente === 'producao'
  const rotulo = quantidade === 1 ? itemSingular : itemPlural
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancelar}>
      <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          {ehProducao ? <ShieldAlert size={18} className="text-danger" /> : <FlaskConical size={18} className="text-action-primary" />}
          <h2 className="text-base font-semibold text-zinc-900">Confirmar emissão</h2>
        </div>

        <p className="mt-3 text-sm text-zinc-600">
          Você vai emitir <b className="text-zinc-900">{quantidade}</b> {rotulo}, totalizando{' '}
          <span className="text-[var(--text-subtle)]">R$</span> <b className="tabular-nums text-zinc-900">{numBRL2(total)}</b>, no ambiente{' '}
          {ehProducao
            ? <b className="text-danger">PRODUÇÃO ({avisoProducao})</b>
            : <b className="text-action-primary">sandbox (testes — nada é cobrado)</b>}.
        </p>

        {ehProducao && (
          <div className="mt-3 rounded-md border border-danger bg-danger-bg px-3 py-2">
            <p className="text-xs text-danger font-medium">Esta ação é irreversível e gera documentos reais.</p>
            <p className="mt-2 text-2xs text-zinc-600">Para confirmar, digite <b>EMITIR</b>:</p>
            <input
              type="text" value={confirmTexto} onChange={e => onTexto(e.target.value)} autoFocus
              className="mt-1 w-full rounded border border-zinc-300 px-2 py-1 text-sm foco-neutro" placeholder="EMITIR"
            />
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancelar} className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 foco-neutro hover:bg-zinc-50">Cancelar</button>
          <button
            type="button" onClick={onConfirmar} disabled={!confirmacaoOk}
            className={['rounded-md px-4 py-1.5 text-xs font-medium text-action-primary-fg foco-neutro transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40', ehProducao ? 'bg-danger' : 'bg-action-primary'].join(' ')}
          >
            {ehProducao ? 'Emitir em produção' : 'Emitir'}
          </button>
        </div>
      </div>
    </div>
  )
}
