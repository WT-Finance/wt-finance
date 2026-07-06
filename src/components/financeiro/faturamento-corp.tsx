'use client'

// Faturamento Corporativo — Fase 2 (v4.32.0). TELA DE REVISÃO + EMISSÃO de boletos E NOTAS.
// Fase 1: importa a crua → cruza → emite BOLETOS. Fase 2 (esta): por cima, NOTAS FISCAIS
// (NFS-e) opcionais por linha (Normal/Avulsa/Não emitir). A NF é documento fiscal irreversível
// e ASSÍNCRONA — a UI mostra "processando" e um refresh de status resolve; "ver nota" abre o
// pdfUrl quando autorizada. Ambiente sempre visível; produção = confirmação reforçada.

import { useRef, useState, useCallback, useMemo } from 'react'
import { Upload, Loader2, AlertTriangle, ShieldAlert, FlaskConical, CheckCircle2, ExternalLink, FileText, RefreshCw, Barcode, Mail } from 'lucide-react'
import { Card } from '@/components/ui/card'
import ModalCentral from '@/components/shared/modal-central'
import { ValorContabil } from '@/components/shared/valor-contabil'
import { numBRL2 } from '@/lib/fmt'
import { SETOR_COLORS } from '@/lib/config'
import { parseFaturamentoFile } from '@/lib/faturamento/parse-faturamento'
import { classificarFaturas, mapaPorNome } from '@/lib/faturamento/classificar'
import {
  cruzarFaturamento, emitirBoletos, emitirNotas, atualizarStatusNotas,
  resultadoBoletos, resultadoNotas, emailEnviados,
  type FaturaEmitir, type ResultadoEmissao, type ItemEmissao,
  type NotaEmitir, type ResultadoNotas, type ItemNota,
  type BoletoResultado, type NotaResultado,
} from '@/app/financeiro/faturamento-corp/actions'
import type { FaturaClassificada, ResumoFaturamento, StatusCruzamento, ModoNota } from '@/lib/faturamento/tipos'
import type { AsaasAmbiente } from '@/lib/asaas/client'
import RevisarEnvioModal from './revisar-envio-modal'

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

// Status da NF (Asaas) → rótulo PT-BR (nunca inglês, ex.: "synchronized"). A NF é assíncrona:
// SCHEDULED/SYNCHRONIZED/PENDING/PROCESSING = "processando"; AUTHORIZED = "autorizada".
function labelStatusNota(st: string | null | undefined): string {
  const s = (st ?? '').toUpperCase()
  if (s === 'AUTHORIZED') return 'autorizada'
  if (s === 'ERROR') return 'falhou'
  if (s.includes('CANCEL')) return 'cancelada'
  return 'processando'
}

type Estado = 'vazio' | 'processando' | 'pronto' | 'erro'
type Fase   = 'lendo' | 'cruzando'
const LARGURA: Record<Fase, string> = { lendo: '40%', cruzando: '85%' }
const LABEL:   Record<Fase, string> = { lendo: 'Lendo a planilha…', cruzando: 'Cruzando com a base de pessoas…' }

/** Status corrente de uma NF (após emitir/atualizar). */
interface NotaStatus { status: string | null; pdfUrl: string | null; number: string | null; invoiceId: string | null }

// Juros/multa PADRÃO aplicados quando o cliente não tem valor próprio no Cadastro (v4.37.0).
// No modal de resultado, um percentual = ao padrão aparece DISCRETO; ≠ padrão (valor do cadastro,
// ex.: 1%/5%/10%) aparece em NEGRITO — destaca o que foge do usual. NULL (emissão antiga ou boleto
// que já existia) exibe "—" (nunca inventamos 2% retroativo — invariante da migration 0172).
const JM_PADRAO = 2

interface Props {
  ambiente:    AsaasAmbiente
  configurado: boolean
}

export default function FaturamentoCorp({ ambiente, configurado, emailModo }: Props & { emailModo: 'teste' | 'real' }) {
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

  // Estado LIDO DO BANCO (v4.38.0) — a FONTE que sobrevive ao reload. Populado ao cruzar
  // (re-hidratação, sem reemitir) e re-lido após cada emissão. Alimenta os modais "Ver resultado",
  // os botões de "dois momentos" e o elegível ao envio. Leituras fail-safe (action → [] em erro).
  const [boletosDB, setBoletosDB]       = useState<BoletoResultado[]>([])
  const [notasDB, setNotasDB]           = useState<NotaResultado[]>([])
  const [emailFeitos, setEmailFeitos]   = useState<string[]>([]) // refs já enviadas por e-mail no modo atual
  const [modalResBol, setModalResBol]   = useState(false) // "Ver resultado · boletos"
  const [modalResNota, setModalResNota] = useState(false) // "Ver resultado · notas fiscais"

  // Envio em LOTE (Fase 4b): modal "Revisar envio". emailRefs = snapshot das refs elegíveis (congelado ao abrir).
  const [modalEmail, setModalEmail] = useState(false)
  const [emailRefs, setEmailRefs]   = useState<string[]>([])

  const ativo = estado !== 'processando' && !emitindo && !emitindoNota
  const ehProducao = ambiente === 'producao'

  // Re-lê o estado do banco (boletos/notas/e-mail) das refs carregadas. Chamada ao CRUZAR
  // (re-hidratação — a tela lembra o que já foi feito, SEM reemitir) e após cada emissão. As três
  // leituras são fail-safe (a action devolve [] em erro) → leitura que caia não quebra a tela, só
  // segue com o que tinha. Semeia notaStatus (invoiceId) p/ o "Atualizar status" funcionar após
  // reload (fecha o follow-up da Fase 2) — sem sobrescrever um status já atualizado na sessão.
  const recarregarResultados = useCallback(async (refs: string[]) => {
    if (refs.length === 0) { setBoletosDB([]); setNotasDB([]); setEmailFeitos([]); return }
    const [bol, nts, mails] = await Promise.all([resultadoBoletos(refs), resultadoNotas(refs), emailEnviados(refs)])
    setBoletosDB(bol); setNotasDB(nts); setEmailFeitos(mails)
    if (nts.length > 0) setNotaStatus(prev => {
      const next = { ...prev }
      for (const n of nts) if (!next[n.externalReference]) next[n.externalReference] = { status: n.status, pdfUrl: n.pdfUrl, number: n.number, invoiceId: n.invoiceId }
      return next
    })
  }, [])

  // Mapa ref→resultado de SESSÃO (boletos) — o resultado rico logo após emitir (distingue
  // emitido/já-existia/pulado/falhou + aviso de registro local). O de-para do banco vem abaixo.
  const resultadoPorRef = useMemo(() => {
    const m = new Map<string, ItemEmissao>()
    if (resultado) for (const it of [...resultado.emitidos, ...resultado.jaExistiam, ...resultado.falharam, ...resultado.pulados]) m.set(it.ref, it)
    return m
  }, [resultado])

  // Mapa ref→resultado de SESSÃO (notas).
  const notaPorRef = useMemo(() => {
    const m = new Map<string, ItemNota>()
    if (resultadoNota) for (const it of [...resultadoNota.emitidas, ...resultadoNota.jaExistiam, ...resultadoNota.falharam, ...resultadoNota.puladas]) m.set(it.ref, it)
    return m
  }, [resultadoNota])

  // De-para LIDO DO BANCO (sobrevive ao reload): boleto por ref; nota por fatura_cliente_no
  // (1ª encontrada — normal ou avulsa; o modal de notas lista todas por external_reference).
  const boletosPorRef = useMemo(() => new Map(boletosDB.map(b => [b.ref, b] as const)), [boletosDB])
  const notaDBPorFcn = useMemo(() => {
    const m = new Map<string, NotaResultado>()
    for (const n of notasDB) if (n.ref && !m.has(n.ref)) m.set(n.ref, n)
    return m
  }, [notasDB])

  // Refs carregadas (todas as faturas com nº) — usadas para re-hidratar após emitir/atualizar.
  const refsCarregadas = useMemo(
    () => Array.from(new Set(faturas.map(f => f.fatura_cliente_no).filter((r): r is string => !!r))),
    [faturas],
  )

  // Já emitiu algo? (de-ênfase da coluna Cruzamento — o foco passa às colunas/modais próprios.)
  const jaEmitiu = !!resultado || !!resultadoNota || boletosDB.length > 0 || notasDB.length > 0

  // Refs com BOLETO emitido (do BANCO) — elegíveis ao envio por e-mail; sobrevive ao reload.
  const refsComBoleto = useMemo(() => boletosDB.filter(b => b.emitido).map(b => b.ref), [boletosDB])

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

  const processar = useCallback(async (file: File) => {
    setErro(null); setEstado('processando'); setFase('lendo'); setResumo(null); setFaturas([]); setResultado(null); setResNota(null); setNotaStatus({}); setBoletosDB([]); setNotasDB([]); setEmailFeitos([])

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
    // Re-hidratação: a tela lembra o que já foi emitido/enviado p/ estas faturas (sem reemitir).
    const refs = Array.from(new Set(classificadas.map(f => f.fatura_cliente_no).filter((x): x is string => !!x)))
    void recarregarResultados(refs)
  }, [recarregarResultados])

  function setEmitir(linha: number, val: boolean) {
    setFaturas(prev => prev.map(f => f.linha === linha && f.status === 'pronta' ? { ...f, emitir: val } : f))
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
    } finally {
      setEmitindo(false)
      void recarregarResultados(refsCarregadas) // reflete no banco (modal "Ver resultado" + botões)
    }
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
    } finally {
      setEmitNota(false)
      void recarregarResultados(refsCarregadas) // reflete no banco (modal "Ver resultado" + botões)
    }
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
    } catch { /* silencioso — o usuário pode tentar de novo */ } finally {
      setAtualizando(false)
      void recarregarResultados(refsCarregadas) // o status persistido no banco alimenta o modal de notas
    }
  }

  // ── Drag & drop ─────────────────────────────────────────────────────────────
  const onDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); if (ativo) setDragging(true) }, [ativo])
  const onDragLeave = useCallback((e: React.DragEvent) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false) }, [])
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    if (!ativo) return
    const f = e.dataTransfer.files?.[0]; if (f) void processar(f)
  }, [ativo, processar])
  function onInput(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (f) void processar(f); e.target.value = ''
  }

  const temNotaComStatus = Object.values(notaStatus).some(s => s.invoiceId)

  return (
    <div className="space-y-6">
      {/* Título/subtítulo + badge de ambiente vivem no wrapper de abas (faturamento-corp-content),
          compartilhados entre Emissão e Cadastro. Aqui a Emissão começa direto no upload. */}
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

      {/* Revisão (upload → revisão → resultado ABAIXO, após emitir — a ordem do fluxo real) */}
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
            {/* table-fixed: as larguras são respeitadas e o texto longo (ex.: "falhou: Endereço do
                cliente incompleto") QUEBRA dentro da coluna Nota — não escapa nem estoura a tabela. */}
            <table className="w-full table-fixed min-w-[54rem] text-2xs">
              <thead>
                <tr className="border-b border-zinc-100 text-left font-medium text-zinc-400">
                  <th className="py-1.5 px-2">Pessoa</th>
                  <th className="py-1.5 px-2 text-right w-24">Valor</th>
                  <th className="py-1.5 px-2 w-24">Vencimento</th>
                  <th className="py-1.5 px-2 w-20">Fatura Nº</th>
                  <th className="py-1.5 px-2 w-28">Status</th>
                  <th className="py-1.5 px-2 w-28">Boleto</th>
                  <th className="py-1.5 px-2 w-56">
                    {/* Atualizar status (↻) mora AQUI, ao lado do título da coluna cujas linhas ele
                        atualiza — só aparece quando há nota emitida com status a acompanhar. */}
                    <span className="inline-flex items-center gap-1.5">
                      Nota fiscal
                      {temNotaComStatus && (
                        <button
                          type="button" onClick={() => void atualizarStatus()} disabled={atualizando}
                          title="Atualizar status das notas fiscais" aria-label="Atualizar status das notas fiscais"
                          className="foco-neutro rounded p-0.5 text-zinc-400 hover:text-action-primary disabled:opacity-40"
                        >
                          <RefreshCw size={12} className={atualizando ? 'animate-spin' : ''} />
                        </button>
                      )}
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {faturas.map(f => {
                  const fcn = f.fatura_cliente_no
                  // Boleto: resultado de SESSÃO (rico) → senão o do BANCO (re-hidratado) → senão o seletor.
                  const bolSess = fcn ? resultadoPorRef.get(fcn) : undefined
                  const bolDB   = fcn ? boletosPorRef.get(fcn) : undefined
                  const rBol    = bolSess ?? (bolDB ? dbToItemBoleto(bolDB) : undefined)
                  // Nota: sessão (external_reference do modo escolhido) → senão a do BANCO (por nº da fatura).
                  const refNf    = fcn ? refNota(fcn, f.modoNf) : ''
                  const notaSess = refNf ? notaPorRef.get(refNf) : undefined
                  const notaDB   = fcn ? notaDBPorFcn.get(fcn) : undefined
                  const rNota    = notaSess ?? (notaDB ? dbToItemNota(notaDB) : undefined)
                  const stNota   = rNota ? notaStatus[rNota.ref] : undefined
                  const naoIdent = f.status === 'nao_identificado'
                  return (
                    <tr key={f.linha} className={`border-b border-zinc-50 align-top ${naoIdent ? 'bg-warning-bg/40' : ''}`}>
                      <td className="py-1 px-2 text-zinc-700">
                        <span className="block">{f.pessoa ?? <span className="text-warning font-medium">(sem nome)</span>}</span>
                        {f.multiplos && <span className="text-3xs text-warning">⚠ múltiplos cadastros com este nome</span>}
                      </td>
                      <td className={`py-1 px-2 text-right tabular-nums ${naoIdent ? 'text-warning font-semibold' : 'text-zinc-700'}`}>{f.valor !== null ? numBRL2(f.valor) : '—'}</td>
                      <td className="py-1 px-2 tabular-nums text-zinc-600">{fmtData(f.vencimento)}</td>
                      <td className="py-1 px-2 tabular-nums text-zinc-600">{fcn ?? '—'}</td>
                      {/* Status: SÓ o status do cruzamento (de-ênfase depois de emitir — o foco vai p/ colunas/modais próprios). */}
                      <td className="py-1 px-2">
                        <span className={`inline-block rounded-full border px-2 py-0.5 text-3xs font-medium whitespace-nowrap ${STATUS_CLASSE[f.status]} ${jaEmitiu ? 'opacity-50' : ''}`}>
                          {STATUS_LABEL[f.status]}
                        </span>
                        {!jaEmitiu && f.faltam.length > 0 && f.status !== 'nao_identificado' && (
                          <span className="block mt-0.5 text-3xs text-zinc-400">faltam: {f.faltam.join(', ')}</span>
                        )}
                      </td>
                      {/* Boleto: seletor Emitir/Não emitir (antes) → resultado co-locado (depois; sessão ou banco). */}
                      <td className="py-1 px-2">
                        {rBol ? <LinhaResultado item={rBol} /> : <ControleBoleto fatura={f} desabilitado={emitindo} onToggle={v => setEmitir(f.linha, v)} />}
                      </td>
                      {/* Nota fiscal: seletor (antes) → resultado co-locado (depois; sessão ou banco). */}
                      <td className="py-1 px-2">
                        {rNota
                          ? <LinhaResultadoNota item={rNota} status={stNota} />
                          : <ControleNota fatura={f} desabilitado={emitindoNota} onModo={m => setModoNf(f.linha, m)} onValorAvulso={v => setValorAvulso(f.linha, v)} />}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Barra de ação — DOIS MOMENTOS: cada "Emitir X" vira "Ver resultado · X" após a emissão
              (largura FIXA por botão: não pula na troca de texto). "Enviar e-mails" fixo à direita. */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 pt-4">
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-2xs text-zinc-500">
              <p>
                {selecionadas.length > 0
                  ? <>Boletos: <b className="text-zinc-700">{selecionadas.length}</b> {selecionadas.length === 1 ? 'fatura' : 'faturas'} · Total <span className="text-[var(--text-subtle)]">R$</span> <span className="tabular-nums text-zinc-700">{numBRL2(totalSelecionado)}</span></>
                  : 'Marque as faturas prontas para emitir boleto.'}
              </p>
              <p>
                {selecionadasNota.length > 0
                  ? <>Notas fiscais: <b className="text-zinc-700">{selecionadasNota.length}</b> ({selecionadasNota.filter(f => f.modoNf === 'avulsa').length} avulsa{selecionadasNota.filter(f => f.modoNf === 'avulsa').length === 1 ? '' : 's'}) · Total <span className="text-[var(--text-subtle)]">R$</span> <span className="tabular-nums text-zinc-700">{numBRL2(totalNota)}</span></>
                  : 'Escolha as notas fiscais (Normal/Avulsa) nas faturas prontas para NF.'}
              </p>
              {refsComBoleto.length > 0 && (
                <p>E-mails: <b className="text-zinc-700">{refsComBoleto.length}</b> com boleto{emailFeitos.length > 0 ? <> · <b className="text-zinc-700">{emailFeitos.length}</b> já enviado{emailFeitos.length === 1 ? '' : 's'}</> : ''}{emailModo === 'teste' ? ' (modo teste)' : ''}</p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* Boleto — Emitir ↔ Ver resultado (min-w igual nos dois momentos). */}
              {boletosDB.length > 0 ? (
                <button
                  type="button" onClick={() => setModalResBol(true)}
                  className="inline-flex min-w-[13rem] items-center justify-center gap-2 rounded-md bg-action-primary px-4 py-2 text-xs font-medium text-action-primary-fg foco-neutro transition-opacity hover:opacity-90"
                >
                  <Barcode size={14} /> Ver resultado · {boletosDB.length} {boletosDB.length === 1 ? 'boleto' : 'boletos'}
                </button>
              ) : (
                <button
                  type="button" onClick={abrirConfirmacao}
                  disabled={selecionadas.length === 0 || !configurado || emitindo}
                  className="inline-flex min-w-[13rem] items-center justify-center gap-2 rounded-md bg-action-primary px-4 py-2 text-xs font-medium text-action-primary-fg foco-neutro transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {emitindo ? <Loader2 size={14} className="animate-spin" /> : <Barcode size={14} />}
                  {emitindo ? 'Emitindo…' : 'Emitir boletos'}
                </button>
              )}
              {/* Nota — Emitir ↔ Ver resultado (min-w igual nos dois momentos). */}
              {notasDB.length > 0 ? (
                <button
                  type="button" onClick={() => setModalResNota(true)}
                  className="inline-flex min-w-[13rem] items-center justify-center gap-2 rounded-md border border-action-soft-border bg-action-soft px-4 py-2 text-xs font-medium text-action-primary foco-neutro transition-opacity hover:opacity-90"
                >
                  <FileText size={14} /> Ver resultado · {notasDB.length} {notasDB.length === 1 ? 'nota' : 'notas'}
                </button>
              ) : (
                <button
                  type="button" onClick={abrirConfirmacaoNota}
                  disabled={selecionadasNota.length === 0 || !configurado || emitindoNota}
                  className="inline-flex min-w-[13rem] items-center justify-center gap-2 rounded-md border border-action-soft-border bg-action-soft px-4 py-2 text-xs font-medium text-action-primary foco-neutro transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {emitindoNota ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                  {emitindoNota ? 'Emitindo…' : 'Emitir notas fiscais'}
                </button>
              )}
              {/* Enviar e-mails — fixo à direita, SEM contador (o contador vive no rodapé do modal). */}
              <button
                type="button"
                onClick={() => { setEmailRefs(refsComBoleto); setModalEmail(true) }}
                disabled={refsComBoleto.length === 0}
                title={refsComBoleto.length === 0 ? 'Emita boletos primeiro' : undefined}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-action-primary px-4 py-2 text-xs font-medium text-action-primary-fg foco-neutro transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Mail size={14} /> Enviar e-mails
              </button>
            </div>
          </div>

          {!configurado && (
            <p className="mt-2 text-2xs text-warning">⚠ Asaas não configurado neste ambiente — a emissão está indisponível.</p>
          )}
          <p className="mt-3 text-3xs text-zinc-400">
            Nota fiscal (opcional por fatura, exige endereço/CEP): <b>Normal</b> usa o valor da fatura, <b>Avulsa</b> um valor próprio.
            A NF é <b>assíncrona</b> — após emitir fica “processando” até a prefeitura autorizar; use o ícone <RefreshCw size={9} className="inline align-[-1px]" /> ao lado de “Nota fiscal” na tabela (ou “Atualizar status” no modal de resultado) para atualizar o status.
          </p>
          {/* Envio de e-mail: badge de modo + como disparar (lote via "Enviar e-mails"). */}
          <div className="mt-3 flex flex-wrap items-center gap-2 text-3xs">
            {emailModo === 'teste' ? (
              <>
                <span className="inline-flex items-center gap-1 rounded-md border border-gestao bg-gestao-soft px-2 py-0.5 font-medium text-gestao-fg">
                  <FlaskConical size={11} /> E-mail: modo teste
                </span>
                <span className="text-zinc-400">os e-mails de fatura vão para a caixa de teste (não para o cliente); use <b>Enviar e-mails</b> para revisar os destinatários e disparar em lote.</span>
              </>
            ) : (
              <span className="text-warning">⚠ Envio de e-mail em modo real não está liberado nesta versão.</span>
            )}
          </div>
        </Card>
      )}

      {/* Envio em LOTE (Fase 4b): revisão + disparo em blocos no modal "Revisar envio". */}
      {modalEmail && <RevisarEnvioModal refs={emailRefs} emailModo={emailModo} onClose={() => setModalEmail(false)} />}

      {/* Resultado da emissão (v4.38.0): modais SOB DEMANDA, lidos do BANCO (sobrevivem ao reload). */}
      {modalResBol && (
        <ModalResultadoBoletos boletos={boletosDB} sessMap={resultadoPorRef} ambiente={ambiente} onClose={() => setModalResBol(false)} />
      )}
      {modalResNota && (
        <ModalResultadoNotas
          notas={notasDB} notaStatus={notaStatus} sessMap={notaPorRef} ambiente={ambiente}
          atualizando={atualizando} temAtualizar={temNotaComStatus}
          onAtualizar={() => void atualizarStatus()} onClose={() => setModalResNota(false)}
        />
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

// ── Controle de boleto por linha (Emitir / Não emitir; espelha o seletor da NF) ──
function ControleBoleto({ fatura, desabilitado, onToggle }: {
  fatura: FaturaClassificada
  desabilitado: boolean
  onToggle: (v: boolean) => void
}) {
  // Só faturas prontas (têm CPF/CNPJ) podem gerar boleto; as demais nem oferecem a opção.
  if (fatura.status !== 'pronta') return <span className="text-3xs text-zinc-400">—</span>
  return (
    <select
      value={fatura.emitir ? 'sim' : 'nao'}
      disabled={desabilitado}
      onChange={e => onToggle(e.target.value === 'sim')}
      className="foco-neutro rounded border border-zinc-200 bg-white px-1.5 py-1 text-3xs text-zinc-700 disabled:opacity-40"
      aria-label={`Boleto — fatura ${fatura.fatura_cliente_no ?? fatura.linha}`}
    >
      <option value="sim">Emitir</option>
      <option value="nao">Não emitir</option>
    </select>
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
  // Rótulo CURTO no seletor (Normal/Avulsa/Não emitir; a explicação vive na legenda ao pé da
  // tabela). Valor avulso INLINE (mesma linha, à direita) — altura constante em todas as linhas.
  return (
    <div className="flex items-center gap-1.5">
      <select
        value={fatura.modoNf}
        disabled={desabilitado}
        onChange={e => onModo(e.target.value as ModoNota)}
        className="foco-neutro shrink-0 rounded border border-zinc-200 bg-white px-1.5 py-1 text-3xs text-zinc-700 disabled:opacity-40"
        aria-label={`Nota fiscal — fatura ${fatura.fatura_cliente_no ?? fatura.linha}`}
      >
        <option value="nao">Não emitir</option>
        <option value="normal">Normal</option>
        <option value="avulsa">Avulsa</option>
      </select>
      {fatura.modoNf === 'avulsa' && (
        <span className="flex items-center gap-0.5 min-w-0">
          <span className="text-3xs text-[var(--text-subtle)]">R$</span>
          <input
            type="number" step="0.01" min="0" inputMode="decimal"
            value={fatura.valorAvulso ?? ''}
            disabled={desabilitado}
            onChange={e => onValorAvulso(e.target.value === '' ? null : Number(e.target.value))}
            className="foco-neutro w-24 rounded border border-zinc-200 px-1.5 py-1 text-3xs tabular-nums text-right text-zinc-700 disabled:opacity-40"
            placeholder="valor"
            aria-label="Valor da nota avulsa"
          />
        </span>
      )}
    </div>
  )
}

// ── Adaptadores BANCO → Item (re-hidratação) ───────────────────────────────────
// O resultado lido do banco (BoletoResultado/NotaResultado) é convertido ao shape de SESSÃO
// (ItemEmissao/ItemNota) para as MESMAS linhas de resultado co-locadas servirem sessão E reload.
// Perde-se a distinção emitido/já-existia (o banco não a guarda) — no reload tudo emitido é
// "emitido", o que é fiel (o boleto ESTÁ emitido); o `registroFalhou` é, por natureza, só de
// sessão (quando ele ocorre não há linha no banco para re-hidratar).
function dbToItemBoleto(b: BoletoResultado): ItemEmissao {
  return {
    ref: b.ref, pessoa: b.pessoa ?? '', resultado: b.emitido ? 'emitido' : 'falhou',
    bankSlipUrl: b.bankSlipUrl, invoiceUrl: b.invoiceUrl, status: b.status, erro: b.erro ?? undefined,
  }
}
function dbToItemNota(n: NotaResultado): ItemNota {
  const falhou = (n.status ?? '').toUpperCase() === 'ERROR'
  return {
    ref: n.externalReference, faturaClienteNo: n.ref ?? '', pessoa: n.pessoa ?? '', modo: n.modo,
    resultado: falhou ? 'falhou' : 'emitida', invoiceId: n.invoiceId, status: n.status,
    pdfUrl: n.pdfUrl, erro: n.erro ?? undefined,
  }
}

// ── Badge de ambiente — SEMPRE visível; produção é forte e vermelho ───────────
export function AmbienteBadge({ ambiente, configurado }: Props) {
  if (ambiente === 'producao') {
    // Produção = NEUTRO. A badge é só indicador; o gate real de "documentos reais" é a
    // confirmação obrigatória (digitar EMITIR) no modal de emissão — essa trava NÃO muda.
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-action-soft-border bg-action-soft px-2.5 py-1 text-xs font-semibold text-action-primary">
        <ShieldAlert size={14} /> PRODUÇÃO · documentos reais
      </span>
    )
  }
  // Sandbox = ÂMBAR (tokens --gestao, os mesmos dos botões de permissão específica) —
  // destaca que se está em MODO TESTE (nada é real); some ao entrar em produção.
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-gestao bg-gestao-soft px-2.5 py-1 text-xs font-medium text-gestao-fg">
      <FlaskConical size={14} /> Ambiente de testes (sandbox){!configurado && ' · sem chave'}
    </span>
  )
}

// ── Resultado por fatura (boleto) — co-locado na coluna Boleto ────────────────
function LinhaResultado({ item }: { item: ItemEmissao }) {
  if (item.resultado === 'emitido' || item.resultado === 'ja_existia') {
    return (
      <span className="flex flex-wrap items-center gap-1 text-3xs text-success">
        <CheckCircle2 size={11} className="shrink-0" />
        {item.resultado === 'ja_existia' ? 'já existia' : 'emitido'}
        {item.bankSlipUrl && (
          <a href={item.bankSlipUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 underline">ver boleto <ExternalLink size={9} /></a>
        )}
        {item.registroFalhou && <span className="text-warning">(registro local falhou)</span>}
      </span>
    )
  }
  if (item.resultado === 'pulado') return <span className="block text-3xs text-zinc-400">pulado (já emitido)</span>
  return <span className="block text-3xs text-danger">falhou: {item.erro}</span>
}

// ── Resultado + status por fatura (nota) — co-locado na coluna Nota fiscal (PT-BR) ─────
function LinhaResultadoNota({ item, status }: { item: ItemNota; status?: NotaStatus }) {
  if (item.resultado === 'falhou') return <span className="block text-3xs text-danger">falhou: {item.erro}</span>
  if (item.resultado === 'pulada') return <span className="block text-3xs text-zinc-400">pulada (já emitida)</span>

  const st = (status?.status ?? item.status ?? '').toUpperCase()
  const pdf = status?.pdfUrl ?? item.pdfUrl ?? null
  const autorizada = st === 'AUTHORIZED'
  // NF criada mas autorização falhou: a nota existe, porém não foi autorizada — avisa (não mascara).
  if (item.avisoAutorizacao) {
    return (
      <span className="flex flex-wrap items-center gap-1 text-3xs text-warning">
        <AlertTriangle size={11} className="shrink-0" /> criada, mas a autorização falhou: {item.avisoAutorizacao}
        {status?.number && <span className="text-zinc-400">nº {status.number}</span>}
        {pdf && <a href={pdf} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 underline">ver nota <ExternalLink size={9} /></a>}
      </span>
    )
  }
  return (
    <span className={`flex flex-wrap items-center gap-1 text-3xs ${autorizada ? 'text-success' : 'text-action-primary'}`}>
      {autorizada ? <CheckCircle2 size={11} className="shrink-0" /> : <Loader2 size={11} className="shrink-0 animate-spin" />}
      {labelStatusNota(st)}
      {status?.number && <span className="text-zinc-400">nº {status.number}</span>}
      {pdf && <a href={pdf} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 underline">ver nota <ExternalLink size={9} /></a>}
      {item.registroFalhou && <span className="text-warning">(registro local falhou)</span>}
    </span>
  )
}

// ── Cartão de contagem (stat tile) — número em destaque + rótulo, tom semântico ──
function Contagem({ n, rotulo, tom }: { n: number; rotulo: string; tom: 'success' | 'danger' | 'zinc' }) {
  const cor = tom === 'success' ? 'text-success' : tom === 'danger' ? 'text-danger' : 'text-zinc-500'
  return (
    <div className="rounded-lg border border-zinc-100 bg-zinc-50/60 px-3 py-2 min-w-[92px]">
      <div className={`text-lg font-semibold tabular-nums leading-none ${cor}`}>{n}</div>
      <div className="mt-1 text-3xs text-zinc-500">{rotulo}</div>
    </div>
  )
}

// Percentual aplicado (juros/multa) no modal de boletos: ≠ padrão → NEGRITO (valor do cadastro);
// = padrão → discreto; NULL (emissão antiga / boleto que já existia) → "—" (nunca inventa retroativo).
function Percentual({ v }: { v: number | null }) {
  if (v == null) return <span className="text-zinc-300">—</span>
  return <span className={v === JM_PADRAO ? 'text-zinc-400' : 'font-semibold text-zinc-700'}>{v}%</span>
}

// Link "ver ↗" do boleto (prefere o bank slip; cai no invoice do Asaas).
function VerBoleto({ b }: { b: BoletoResultado }) {
  const url = b.bankSlipUrl ?? b.invoiceUrl
  if (!url) return null
  return <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 underline">ver <ExternalLink size={10} /></a>
}

// Classe do cabeçalho fixo (receita border-separate/DS §7): fundo opaco nas células, divisória e
// cantos arredondados na 1ª linha, sombra só ao rolar. Reusada pelos dois modais de resultado.
function theadFixo(rolado: boolean): string {
  return `sticky top-0 z-20 text-left font-medium text-zinc-400 [&_th]:bg-zinc-50 [&_th]:py-2 [&_th]:px-2 [&_tr:first-child_th]:border-b [&_tr:first-child_th]:border-zinc-200 [&_tr:first-child_th:first-child]:rounded-tl-lg [&_tr:first-child_th:last-child]:rounded-tr-lg ${rolado ? '[&_tr:last-child_th]:shadow-[0_2px_4px_-2px_rgba(0,0,0,0.12)]' : ''}`
}

// ── Modal "Ver resultado · boletos" (v4.38.0) — LIDO DO BANCO, sob demanda ─────
// Contagens fixas no topo + tabela rolável (cabeçalho fixo). Valor em formato contábil; juros/multa
// aplicados (do cadastro em negrito, padrão discreto, NULL "—"). Status distingue emitido/já-emitido
// (via resultado de sessão quando presente) e falhou (com motivo).
function ModalResultadoBoletos({ boletos, sessMap, ambiente, onClose }: {
  boletos:  BoletoResultado[]
  sessMap:  Map<string, ItemEmissao>
  ambiente: AsaasAmbiente
  onClose:  () => void
}) {
  const [rolado, setRolado] = useState(false)
  const linhas = boletos.map(b => {
    const s = sessMap.get(b.ref)
    const estado: 'emitido' | 'ja' | 'falhou' =
      s ? (s.resultado === 'emitido' ? 'emitido' : s.resultado === 'falhou' ? 'falhou' : 'ja')
        : (b.emitido ? 'emitido' : 'falhou')
    const erro = estado === 'falhou' ? (s?.erro ?? b.erro) : null
    return { b, estado, erro }
  })
  const nEmit = linhas.filter(l => l.estado === 'emitido').length
  const nJa   = linhas.filter(l => l.estado === 'ja').length
  const nFal  = linhas.filter(l => l.estado === 'falhou').length

  return (
    <ModalCentral
      titulo="Resultado da emissão de boletos"
      subtitulo={`Ambiente: ${ambiente === 'producao' ? 'PRODUÇÃO' : 'sandbox (testes)'}`}
      largura="4xl" corpoFlex onClose={onClose}
    >
      <div className="shrink-0 px-6 pt-5 pb-3 flex flex-wrap gap-3">
        <Contagem n={nEmit} rotulo={nEmit === 1 ? 'boleto emitido' : 'boletos emitidos'} tom="success" />
        {nJa > 0 && <Contagem n={nJa} rotulo={nJa === 1 ? 'já emitido' : 'já emitidos'} tom="zinc" />}
        {nFal > 0 && <Contagem n={nFal} rotulo={nFal === 1 ? 'falhou' : 'falharam'} tom="danger" />}
      </div>
      <div className="flex-1 min-h-0 overflow-auto px-6 pb-5" onScroll={e => setRolado(e.currentTarget.scrollTop > 0)}>
        <table className="w-full border-separate border-spacing-0 text-xs">
          <thead className={theadFixo(rolado)}>
            <tr>
              <th>Pessoa</th>
              <th className="w-24">Fatura Nº</th>
              <th className="w-36 text-right">Valor</th>
              <th className="w-16 text-right">Juros</th>
              <th className="w-16 text-right">Multa</th>
              <th className="w-52">Status</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map(({ b, estado, erro }) => (
              <tr key={b.ref} className="align-top [&>td]:border-b [&>td]:border-zinc-50 [&>td]:py-1.5 [&>td]:px-2">
                <td className="text-zinc-700">{b.pessoa || '—'}</td>
                <td className="tabular-nums text-zinc-500">{b.ref}</td>
                <td className="text-zinc-700">{b.valor != null ? <ValorContabil valor={b.valor} /> : <span className="block text-right text-zinc-400">—</span>}</td>
                <td className="text-right"><Percentual v={b.jurosAplicado} /></td>
                <td className="text-right"><Percentual v={b.multaAplicada} /></td>
                <td>
                  {estado === 'emitido' && (
                    <span className="inline-flex flex-wrap items-center gap-1 text-2xs text-success"><CheckCircle2 size={12} className="shrink-0" /> emitido <VerBoleto b={b} /></span>
                  )}
                  {estado === 'ja' && (
                    <span className="inline-flex flex-wrap items-center gap-1 text-2xs text-zinc-500"><CheckCircle2 size={12} className="shrink-0" /> já emitido <VerBoleto b={b} /></span>
                  )}
                  {estado === 'falhou' && (
                    <span className="block text-2xs text-danger">falhou{erro ? `: ${erro}` : ''}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ModalCentral>
  )
}

// ── Modal "Ver resultado · notas fiscais" (v4.38.0) — LIDO DO BANCO ────────────
// Contagens + "Atualizar status" fixos no topo (o ↻ do cabeçalho da coluna na tabela permanece);
// tabela rolável com status PT-BR (autorizada/processando/falhou/já emitida) + link "ver nota".
function ModalResultadoNotas({ notas, notaStatus, sessMap, ambiente, atualizando, temAtualizar, onAtualizar, onClose }: {
  notas:       NotaResultado[]
  notaStatus:  Record<string, NotaStatus>
  sessMap:     Map<string, ItemNota>
  ambiente:    AsaasAmbiente
  atualizando: boolean
  temAtualizar: boolean
  onAtualizar: () => void
  onClose:     () => void
}) {
  const [rolado, setRolado] = useState(false)
  const linhas = notas.map(n => {
    const st = notaStatus[n.externalReference]
    const status = (st?.status ?? n.status ?? '').toUpperCase()
    const pdf = st?.pdfUrl ?? n.pdfUrl ?? null
    const number = st?.number ?? n.number ?? null
    const s = sessMap.get(n.externalReference)
    const ja = s?.resultado === 'ja_existia' || s?.resultado === 'pulada'
    const falhou = status === 'ERROR' || s?.resultado === 'falhou'
    return { n, status, pdf, number, ja, falhou, erro: n.erro ?? s?.erro ?? null, aviso: s?.avisoAutorizacao }
  })
  const nOk  = linhas.filter(l => !l.falhou && !l.ja).length
  const nJa  = linhas.filter(l => l.ja && !l.falhou).length
  const nFal = linhas.filter(l => l.falhou).length

  return (
    <ModalCentral
      titulo="Resultado da emissão de notas fiscais"
      subtitulo={`Ambiente: ${ambiente === 'producao' ? 'PRODUÇÃO' : 'sandbox (testes)'} · a NF é assíncrona`}
      largura="4xl" corpoFlex onClose={onClose}
    >
      <div className="shrink-0 px-6 pt-5 pb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <Contagem n={nOk} rotulo={nOk === 1 ? 'nota' : 'notas'} tom="success" />
          {nJa > 0 && <Contagem n={nJa} rotulo={nJa === 1 ? 'já emitida' : 'já emitidas'} tom="zinc" />}
          {nFal > 0 && <Contagem n={nFal} rotulo={nFal === 1 ? 'falhou' : 'falharam'} tom="danger" />}
        </div>
        {temAtualizar && (
          <button
            type="button" onClick={onAtualizar} disabled={atualizando}
            className="foco-neutro inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:border-zinc-300 disabled:opacity-40"
          >
            <RefreshCw size={13} className={atualizando ? 'animate-spin' : ''} /> Atualizar status
          </button>
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-auto px-6 pb-5" onScroll={e => setRolado(e.currentTarget.scrollTop > 0)}>
        <table className="w-full border-separate border-spacing-0 text-xs">
          <thead className={theadFixo(rolado)}>
            <tr>
              <th>Pessoa</th>
              <th className="w-24">Fatura Nº</th>
              <th className="w-20">Tipo</th>
              <th className="w-36 text-right">Valor</th>
              <th className="w-64">Status</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map(({ n, status, pdf, number, ja, falhou, erro, aviso }) => (
              <tr key={n.externalReference} className="align-top [&>td]:border-b [&>td]:border-zinc-50 [&>td]:py-1.5 [&>td]:px-2">
                <td className="text-zinc-700">{n.pessoa || '—'}</td>
                <td className="tabular-nums text-zinc-500">{n.ref ?? '—'}</td>
                <td className="text-zinc-500 capitalize">{n.modo}</td>
                <td className="text-zinc-700">{n.valor != null ? <ValorContabil valor={n.valor} /> : <span className="block text-right text-zinc-400">—</span>}</td>
                <td>
                  {falhou ? (
                    <span className="block text-2xs text-danger">falhou{erro ? `: ${erro}` : ''}</span>
                  ) : ja ? (
                    <span className="inline-flex flex-wrap items-center gap-1 text-2xs text-zinc-500">
                      já emitida
                      {number && <span className="text-zinc-400">nº {number}</span>}
                      {pdf && <a href={pdf} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 underline">ver nota <ExternalLink size={10} /></a>}
                    </span>
                  ) : aviso ? (
                    <span className="inline-flex flex-wrap items-center gap-1 text-2xs text-warning">
                      <AlertTriangle size={12} className="shrink-0" /> criada, mas a autorização falhou: {aviso}
                      {pdf && <a href={pdf} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 underline">ver nota <ExternalLink size={10} /></a>}
                    </span>
                  ) : (
                    <span className={`inline-flex flex-wrap items-center gap-1 text-2xs ${status === 'AUTHORIZED' ? 'text-success' : 'text-action-primary'}`}>
                      {status === 'AUTHORIZED' ? <CheckCircle2 size={12} className="shrink-0" /> : <Loader2 size={12} className="shrink-0 animate-spin" />}
                      {labelStatusNota(status)}
                      {number && <span className="text-zinc-400">nº {number}</span>}
                      {pdf && <a href={pdf} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 underline">ver nota <ExternalLink size={10} /></a>}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ModalCentral>
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
