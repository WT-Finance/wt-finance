'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Upload, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react'
import {
  getLancamentosStatusAction,
  inserirLoteLancamentosAction,
  finalizarLancamentosAction,
  getVendasStatusAction,
  inserirLoteVendasAction,
  finalizarVendasAction,
  getLancamentosMovimentacaoStatusAction,
  inserirLoteLancamentosMovimentacaoAction,
  finalizarLancamentosMovimentacaoAction,
  getTitulosEmAbertoStatusAction,
  inserirLoteTitulosEmAbertoAction,
  finalizarTitulosEmAbertoAction,
  getPessoasStatusAction,
  inserirLotePessoasAction,
  finalizarPessoasAction,
  getDemonstrativoCompetenciaStatusAction,
  inserirLoteDemonstrativoCompetenciaAction,
  finalizarDemonstrativoCompetenciaAction,
  getMondeSincronizacaoStatusAction,
} from './actions'
import type { StatusSincronizacaoMonde } from './actions'
import { fmtDataHoraSP, fmtBRL2 } from '@/lib/fmt'
import { ModalConfirmacaoUpload } from '@/components/admin/modal-confirmacao-upload'
import { parseLancamentosFile, LANCAMENTOS_COLUNAS } from '@/lib/carga/parse-lancamentos'
import { parseVendasProdutoFile } from '@/lib/carga/parse-vendas-produto'
import { parseLancamentosMovimentacaoFile, LANCAMENTOS_MOVIMENTACAO_COLUNAS } from '@/lib/carga/parse-lancamentos-movimentacao'
import { parseTitulosEmAbertoFile, TITULOS_EM_ABERTO_COLUNAS } from '@/lib/carga/parse-titulos-em-aberto'
import { parsePessoasFile, PESSOAS_COLUNAS } from '@/lib/carga/parse-pessoas'
import {
  parseDemonstrativoCompetenciaFile,
  somaCentavos,
  DEMONSTRATIVO_COMPETENCIA_COLUNAS,
} from '@/lib/carga/parse-demonstrativo-competencia'
import { parseArquivoEmWorker } from '@/lib/carga/parse-em-worker'
import type { VendaProdutoRaw } from '@/lib/carga/parse-vendas-produto'
import type { LancamentoRaw } from '@/lib/carga/lancamentos'
import type { LancamentoMovimentacaoRaw } from '@/lib/carga/parse-lancamentos-movimentacao'
import type { TituloEmAbertoRaw } from '@/lib/carga/parse-titulos-em-aberto'
import type { PessoaRaw } from '@/lib/carga/parse-pessoas'
import type { DemonstrativoCompetenciaRaw } from '@/lib/carga/parse-demonstrativo-competencia'

type BaseKey =
  | 'vendas' | 'lancamentos' | 'lancamentos_movimentacao' | 'titulos_em_aberto' | 'pessoas'
  | 'demonstrativo_competencia'
type EstadoCard = 'idle' | 'validando' | 'aguardando_confirmacao' | 'carregando' | 'sucesso' | 'erro'

interface StatusCarga {
  total: number
  ultima_atualizacao: string | null
  /** Σ da base em centavos INTEIROS — só a competência a expõe hoje (v5.8.0). O card a
   *  mostra porque essa base é conferida por SOMA, não só por contagem: o valor é a
   *  grandeza da DRE, e contagem igual com soma diferente é exatamente o defeito que a
   *  v5.5.2 deixou passar. `undefined` = base que não mede soma. */
  soma_centavos?: number
  /** Cobertura temporal da base (`AAAA-MM-DD`) — alimenta o cabeçalho da seção da DRE. */
  cobertura?: { de: string | null; ate: string | null }
}

interface EstadoUpload {
  estado:      EstadoCard
  arquivo:     File | null
  totalLinhas: number
  totalAntes:  number
  mensagem:    string
  /** Progresso do envio em lotes (null = sem barra; feito===total = aguardando servidor). */
  progresso:   { feito: number; total: number } | null
}

const ESTADO_INICIAL: EstadoUpload = {
  estado: 'idle', arquivo: null, totalLinhas: 0, totalAntes: 0, mensagem: '', progresso: null,
}

interface BaseConfig {
  key:      BaseKey
  label:    string
  descricao: string
  /** Tamanho de lote validado para esta base — não unificar (cabe em <3s). */
  batch:    number
  /** Sufixo do contador na linha de status (ex.: "vendas", "lançamentos", "registros"). */
  unidade:  string
  /** Colunas obrigatórias (rótulos) exibidas no card. DERIVADAS do parser (v4.29.0); o
   *  Vendas é tolerante (parser não exige nenhuma) → lista vazia, sem mudar o que aceita. */
  obrigatorias: string[]
  /** Extensões aceitas no seletor. Omitido = `.xlsx,.csv` (o que todas as bases aceitavam
   *  antes da v5.8.0 — o default preserva o comportamento existente). A base de
   *  competência aceita só `.xlsx`: o export real é xlsx e o parser depende do valor
   *  NATIVO da célula, que o CSV não tem. */
  accept?:  string
}

const ACCEPT_PADRAO = '.xlsx,.csv'

// Texto explicativo uniforme: cada base SUBSTITUI TODA a base; importar sempre completo.
const BASES: BaseConfig[] = [
  {
    key: 'vendas',
    label: 'Vendas por Produto',
    descricao: 'Substitui toda a base de Vendas por Produto. Importe sempre o arquivo completo.',
    batch: 1000,
    unidade: 'vendas',
    obrigatorias: [], // parser tolerante (mapeia o que estiver presente) — nenhuma exigida hoje
  },
  {
    key: 'lancamentos',
    label: 'Lançamentos por Operação',
    descricao: 'Substitui toda a base de Lançamentos por Operação. Importe sempre o arquivo completo.',
    batch: 1000,
    unidade: 'lançamentos',
    obrigatorias: LANCAMENTOS_COLUNAS,
  },
  {
    key: 'lancamentos_movimentacao',
    label: 'Lançamentos por Movimentação',
    descricao: 'Substitui toda a base de Lançamentos por Movimentação (realizado — data em que o dinheiro entrou/saiu da conta). Importe sempre o arquivo completo.',
    batch: 500,
    unidade: 'registros',
    obrigatorias: LANCAMENTOS_MOVIMENTACAO_COLUNAS,
  },
  {
    key: 'titulos_em_aberto',
    label: 'Lançamentos por Vencimento (em aberto)',
    descricao: 'Substitui toda a base de títulos em aberto (previsto — por data de vencimento). Importe sempre o arquivo completo.',
    batch: 500,
    unidade: 'registros',
    obrigatorias: TITULOS_EM_ABERTO_COLUNAS,
  },
  {
    key: 'pessoas',
    label: 'Pessoas',
    descricao: 'Substitui toda a base de Pessoas (cadastro do Monde). Importe sempre o arquivo completo.',
    batch: 500,
    unidade: 'pessoas',
    obrigatorias: PESSOAS_COLUNAS,
  },
  {
    key: 'demonstrativo_competencia',
    label: 'Demonstrativo de Resultado (Competência)',
    descricao: 'Substitui toda a base do regime de COMPETÊNCIA (fato gerador: data de emissão) — o export "Demonstrativo de Resultado" do Monde já tratado. Importe sempre o arquivo completo.',
    batch: 500,
    unidade: 'linhas',
    obrigatorias: DEMONSTRATIVO_COMPETENCIA_COLUNAS,
    accept: '.xlsx',
  },
]

function formatarData(iso: string | null): string {
  if (!iso) return 'Nunca'
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatarNum(n: number): string {
  return n.toLocaleString('pt-BR')
}

/** `AAAA-MM-DD` → `MM/AAAA`. Fatia a string de propósito: é data de calendário puro
 *  (competência), e passar por `Date` traria deslocamento de fuso sem ganho nenhum. */
function mesAno(iso: string): string {
  return `${iso.slice(5, 7)}/${iso.slice(0, 4)}`
}

/**
 * Sincronização Monde (v5.4.4) — cartão de LEITURA, sem upload.
 *
 * Não é uma base de planilha: o espelho vem da API do Monde a cada 15 min. O cartão existe
 * porque o tripwire precisa de um lugar para ACENDER — o briefing pede alerta visível, não
 * linha de log. Mostra o frescor das duas engrenagens (incremental e reconciliação) e, quando
 * algum mês verificado diverge, o motivo exato.
 */
function CardSincronizacaoMonde({ status }: { status: StatusSincronizacaoMonde | null }) {
  const tripwire = status?.tripwire ?? null
  const aceso = tripwire?.acendeu === true

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-zinc-900">Sincronização Monde</h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Espelho das vendas vindo da API do Monde. Não é upload — sincroniza sozinho a cada 15 min,
            e a reconciliação diária recupera venda lançada com atraso.
          </p>
        </div>
        {status ? (
          <span
            className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-2xs font-medium ${
              aceso ? 'bg-danger-bg text-danger' : 'bg-success-bg text-success'
            }`}
          >
            {aceso ? <AlertTriangle className="h-3 w-3" /> : <CheckCircle className="h-3 w-3" />}
            {aceso ? 'Divergência' : 'Conferido'}
          </span>
        ) : null}
      </div>

      {status === null ? (
        <p className="mt-4 text-xs text-zinc-400">Status indisponível.</p>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
            {/* shrink-0: valor longo encolhe abaixo do próprio conteúdo e invade o vizinho (DS §8). */}
            <div className="shrink-0">
              <p className="text-2xs uppercase tracking-wide text-zinc-400">Vendas que contam</p>
              <p className="text-sm font-semibold text-zinc-900 tabular-nums">
                {formatarNum(status.vendas_que_contam)}
              </p>
              {/* v5.4.5: só aparece quando há diferença — venda cujos produtos a origem cancelou
                  segue espelhada (auditável) e deixa de somar. Sem venda cancelada, a linha some
                  e o cartão fica como era. */}
              {status.vendas > status.vendas_que_contam ? (
                <p className="text-2xs text-zinc-400 tabular-nums">
                  +{formatarNum(status.vendas - status.vendas_que_contam)} cancelada
                  {status.vendas - status.vendas_que_contam > 1 ? 's' : ''} no espelho
                </p>
              ) : null}
            </div>
            <div className="shrink-0">
              <p className="text-2xs uppercase tracking-wide text-zinc-400">Última sincronização</p>
              <p className="text-sm text-zinc-700">{fmtDataHoraSP(status.ultima_sincronizacao)}</p>
            </div>
            <div className="shrink-0">
              <p className="text-2xs uppercase tracking-wide text-zinc-400">Última reconciliação</p>
              <p className="text-sm text-zinc-700">
                {status.ultima_reconciliacao ? fmtDataHoraSP(status.ultima_reconciliacao) : 'Nunca'}
                {status.reconciliacao_cursor ? (
                  <span className="text-zinc-400"> · {status.reconciliacao_cursor}</span>
                ) : null}
              </p>
            </div>
          </div>

          {aceso && tripwire ? (
            <div className="mt-4 rounded-lg bg-danger-bg px-3 py-2.5">
              <p className="text-xs font-medium text-danger">
                O espelho diverge da API {tripwire.motivos.length === 1 ? 'em 1 mês' : `em ${tripwire.motivos.length} meses`}:
              </p>
              <ul className="mt-1 space-y-0.5">
                {tripwire.motivos.map(m => (
                  <li key={m} className="text-2xs text-danger tabular-nums">{m}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {tripwire ? (
            <p className="mt-3 text-2xs text-zinc-400">
              Conferido contra a API em {fmtDataHoraSP(tripwire.atualizado_em)}. Mês que a reconciliação
              ainda não visitou aparece como não verificado e nunca acende.
            </p>
          ) : (
            <p className="mt-3 text-2xs text-zinc-400">
              Nenhuma conferência registrada ainda — a primeira reconciliação diária a produz.
            </p>
          )}
        </>
      )}
    </div>
  )
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
          {config.obrigatorias.length > 0 ? (
            <p className="text-2xs text-zinc-400 mt-1">
              <span className="font-medium text-zinc-500">Colunas obrigatórias:</span> {config.obrigatorias.join(', ')}
            </p>
          ) : (
            <p className="text-2xs text-zinc-400 mt-1">As colunas são reconhecidas automaticamente.</p>
          )}
        </div>
        {estado.estado === 'sucesso' && <CheckCircle size={18} className="text-success shrink-0" />}
        {estado.estado === 'erro'    && <AlertTriangle size={18} className="text-danger shrink-0" />}
      </div>

      <p className="text-xs text-zinc-400 mb-3">
        {status ? (
          <>
            Última atualização: {formatarData(status.ultima_atualizacao)} · {formatarNum(status.total)} {config.unidade}
            {/* Soma e cobertura só existem na base conferida por soma (competência) — ver
                a nota em StatusCarga. */}
            {status.soma_centavos !== undefined && <> · Σ {fmtBRL2(status.soma_centavos / 100)}</>}
            {status.cobertura?.de && status.cobertura.ate && (
              <> · cobertura {mesAno(status.cobertura.de)} a {mesAno(status.cobertura.ate)}</>
            )}
          </>
        ) : '—'}
      </p>

      {/* Zona de drop / arquivo selecionado */}
      <div
        className={[
          'border-2 border-dashed rounded-lg p-4 text-center transition-colors mb-3',
          ativo ? 'cursor-pointer' : 'cursor-default',
          ativo && isDragging
            ? 'border-action-soft-border bg-action-soft'
            : ativo
              ? 'border-zinc-200 hover:border-action-soft-border hover:bg-action-soft/40'
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
          accept={config.accept ?? ACCEPT_PADRAO}
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) onArquivoSelecionado(f); e.target.value = '' }}
        />
        {estado.estado === 'idle' && (
          <>
            <Upload size={16} className="mx-auto mb-1.5 text-zinc-400" />
            {/* O texto segue o `accept` da base — prometer .csv onde o parser exige o valor
                nativo da célula convidaria a um upload que falha (ou pior, que lê torto). */}
            <p className="text-xs text-zinc-500">
              Arraste ou clique para selecionar um arquivo{' '}
              {(config.accept ?? ACCEPT_PADRAO)
                .split(',')
                .map(e => e.trim())
                .map((e, i, arr) => (
                  <span key={e}>
                    <span className="font-medium">{e}</span>
                    {i < arr.length - 1 ? (i === arr.length - 2 ? ' ou ' : ', ') : ''}
                  </span>
                ))}
            </p>
          </>
        )}
        {estado.estado === 'validando' && (
          <div className="flex items-center justify-center gap-2 text-xs text-zinc-500">
            <Loader2 size={14} className="animate-spin" /> Lendo planilha {estado.arquivo?.name}…
          </div>
        )}
        {estado.estado === 'aguardando_confirmacao' && (
          <p className="text-xs text-zinc-700">
            <span className="font-medium">{estado.arquivo?.name}</span> — {formatarNum(estado.totalLinhas)} linhas válidas
          </p>
        )}
        {estado.estado === 'carregando' && (() => {
          const p = estado.progresso
          const pct = p && p.total > 0 ? Math.round((100 * p.feito) / p.total) : 0
          // feito < total → ainda enviando lotes; feito === total → aguardando o servidor (promote/transform).
          const enviando = p ? p.feito < p.total : true
          return (
            <div className="text-xs text-text-secondary">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Loader2 size={14} className="animate-spin" />
                {enviando ? `Enviando… ${pct}%` : 'Processando no servidor…'}
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-action-soft">
                <div className="h-full rounded-full bg-action-primary transition-all" style={{ width: `${enviando ? pct : 100}%` }} />
              </div>
            </div>
          )
        })()}
        {estado.estado === 'sucesso' && (
          <p className="text-xs text-success font-medium">{estado.mensagem}</p>
        )}
        {estado.estado === 'erro' && (
          <div>
            <p className="text-xs text-danger font-medium mb-1">{estado.mensagem}</p>
            <p className="text-xs text-zinc-400">Arraste ou clique para tentar com outro arquivo</p>
          </div>
        )}
      </div>

      {/* Botão Cancelar/Confirmar (o "Selecione um arquivo…" desabilitado foi removido — era inerte:
          a seleção acontece na própria zona de arrastar/clicar acima). */}
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
            className="flex-1 px-4 py-2 text-sm rounded-lg bg-action-primary text-action-primary-fg hover:opacity-90 transition-colors font-medium"
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
    vendas: null, lancamentos: null, lancamentos_movimentacao: null, titulos_em_aberto: null, pessoas: null,
    demonstrativo_competencia: null,
  })
  const [estados, setEstados] = useState<Record<BaseKey, EstadoUpload>>({
    vendas: ESTADO_INICIAL, lancamentos: ESTADO_INICIAL,
    lancamentos_movimentacao: ESTADO_INICIAL, titulos_em_aberto: ESTADO_INICIAL, pessoas: ESTADO_INICIAL,
    demonstrativo_competencia: ESTADO_INICIAL,
  })
  const [modal, setModal] = useState<BaseKey | null>(null)
  // Sincronização Monde (v5.4.4): leitura, fora do Record de bases (não tem upload nem estado
  // de carga). Fail-safe: erro vira `null` e o cartão diz "indisponível" — nunca derruba a tela.
  const [statusMonde, setStatusMonde] = useState<StatusSincronizacaoMonde | null>(null)

  const linhasRef = useRef<LinhasRef>({
    vendas: [], lancamentos: [], lancamentos_movimentacao: [], titulos_em_aberto: [], pessoas: [],
    demonstrativo_competencia: [],
  })

  function setEstado(key: BaseKey, patch: Partial<EstadoUpload>) {
    setEstados(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }))
  }

  const carregarStatus = useCallback(async () => {
    // ⚠️ Base nova entra no FIM da lista E no fim da desestruturação. Estes índices são
    // POSICIONAIS: inserir no meio desloca em silêncio o resultado de todos os vizinhos
    // (a armadilha que a v5.7.1 documentou na página da DRE).
    const [vendasRes, lancRes, lancMovRes, titAbertoRes, pessoasRes, mondeRes, demoCompRes] = await Promise.allSettled([
      getVendasStatusAction(),
      getLancamentosStatusAction(),
      getLancamentosMovimentacaoStatusAction(),
      getTitulosEmAbertoStatusAction(),
      getPessoasStatusAction(),
      getMondeSincronizacaoStatusAction(),
      getDemonstrativoCompetenciaStatusAction(),
    ])

    setStatusMonde(
      mondeRes.status === 'fulfilled' && !('error' in mondeRes.value) ? mondeRes.value : null,
    )

    const toStatus = (
      r: PromiseSettledResult<{ total: number; ultima_atualizacao?: string | null } | { error: string }>,
    ): StatusCarga | null => {
      if (r.status !== 'fulfilled' || 'error' in r.value) return null
      return { total: r.value.total, ultima_atualizacao: r.value.ultima_atualizacao ?? null }
    }

    // A competência carrega soma e cobertura além da contagem — mapeador próprio, para
    // esses dois campos não serem descartados pelo `toStatus` genérico.
    const statusCompetencia: StatusCarga | null =
      demoCompRes.status === 'fulfilled' && !('error' in demoCompRes.value)
        ? {
            total:              demoCompRes.value.total,
            ultima_atualizacao: demoCompRes.value.ultima_atualizacao,
            soma_centavos:      demoCompRes.value.soma_centavos,
            cobertura:          { de: demoCompRes.value.cobertura_de, ate: demoCompRes.value.cobertura_ate },
          }
        : null

    setStatus({
      vendas:                    toStatus(vendasRes),
      lancamentos:               toStatus(lancRes),
      lancamentos_movimentacao:  toStatus(lancMovRes),
      titulos_em_aberto:         toStatus(titAbertoRes),
      pessoas:                   toStatus(pessoasRes),
      demonstrativo_competencia: statusCompetencia,
    })
  }, [])

  // Carrega o status no mount. IIFE async: o setState (dentro de carregarStatus) cai DEPOIS
  // do await — não é síncrono no efeito (react-hooks/set-state-in-effect). carregarStatus é
  // reusado (mount e pós-upload), por isso permanece um useCallback à parte.
  useEffect(() => { void (async () => { await carregarStatus() })() }, [carregarStatus])

  async function handleArquivoSelecionado(key: BaseKey, arquivo: File) {
    setEstado(key, { estado: 'validando', arquivo, totalLinhas: 0, totalAntes: 0, mensagem: '', progresso: null })

    try {
      if (key === 'vendas') {
        const res = await parseArquivoEmWorker<VendaProdutoRaw>('vendas', arquivo, parseVendasProdutoFile)
        if ('error' in res) { setEstado(key, { estado: 'erro', mensagem: res.error }); return }
        const st = await getVendasStatusAction()
        if ('error' in st) { setEstado(key, { estado: 'erro', mensagem: st.error }); return }
        linhasRef.current.vendas = res
        // "Depois" para vendas = nº de vendas únicas (não de linhas/itens).
        const uniqueVendas = new Set(res.map(r => r.venda_numero).filter(Boolean)).size
        setEstado(key, { estado: 'aguardando_confirmacao', totalLinhas: uniqueVendas, totalAntes: st.total })
      } else if (key === 'lancamentos') {
        const res = await parseArquivoEmWorker<LancamentoRaw>('lancamentos', arquivo, parseLancamentosFile)
        if ('error' in res) { setEstado(key, { estado: 'erro', mensagem: res.error }); return }
        const st = await getLancamentosStatusAction()
        if ('error' in st) { setEstado(key, { estado: 'erro', mensagem: st.error }); return }
        linhasRef.current.lancamentos = res
        setEstado(key, { estado: 'aguardando_confirmacao', totalLinhas: res.length, totalAntes: st.total })
      } else if (key === 'lancamentos_movimentacao') {
        const res = await parseArquivoEmWorker<LancamentoMovimentacaoRaw>('lancamentos_movimentacao', arquivo, parseLancamentosMovimentacaoFile)
        if ('error' in res) { setEstado(key, { estado: 'erro', mensagem: res.error }); return }
        const st = await getLancamentosMovimentacaoStatusAction()
        if ('error' in st) { setEstado(key, { estado: 'erro', mensagem: st.error }); return }
        linhasRef.current.lancamentos_movimentacao = res
        setEstado(key, { estado: 'aguardando_confirmacao', totalLinhas: res.length, totalAntes: st.total })
      } else if (key === 'titulos_em_aberto') {
        const res = await parseArquivoEmWorker<TituloEmAbertoRaw>('titulos_em_aberto', arquivo, parseTitulosEmAbertoFile)
        if ('error' in res) { setEstado(key, { estado: 'erro', mensagem: res.error }); return }
        const st = await getTitulosEmAbertoStatusAction()
        if ('error' in st) { setEstado(key, { estado: 'erro', mensagem: st.error }); return }
        linhasRef.current.titulos_em_aberto = res
        setEstado(key, { estado: 'aguardando_confirmacao', totalLinhas: res.length, totalAntes: st.total })
      } else if (key === 'demonstrativo_competencia') {
        const res = await parseArquivoEmWorker<DemonstrativoCompetenciaRaw>('demonstrativo_competencia', arquivo, parseDemonstrativoCompetenciaFile)
        if ('error' in res) { setEstado(key, { estado: 'erro', mensagem: res.error }); return }
        const st = await getDemonstrativoCompetenciaStatusAction()
        if ('error' in st) { setEstado(key, { estado: 'erro', mensagem: st.error }); return }
        linhasRef.current.demonstrativo_competencia = res
        setEstado(key, { estado: 'aguardando_confirmacao', totalLinhas: res.length, totalAntes: st.total })
      } else {
        const res = await parseArquivoEmWorker<PessoaRaw>('pessoas', arquivo, parsePessoasFile)
        if ('error' in res) { setEstado(key, { estado: 'erro', mensagem: res.error }); return }
        const st = await getPessoasStatusAction()
        if ('error' in st) { setEstado(key, { estado: 'erro', mensagem: st.error }); return }
        linhasRef.current.pessoas = res
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
        setEstado(key, { progresso: { feito: 0, total: rows.length } })
        for (let i = 0; i < rows.length; i += BATCH) {
          const res = await inserirLoteVendasAction(rows.slice(i, i + BATCH), i === 0)
          if ('error' in res) { setEstado(key, { estado: 'erro', mensagem: res.error }); return }
          inseridas += res.inseridas
          setEstado(key, { progresso: { feito: inseridas, total: rows.length } })
        }
        const fin = await finalizarVendasAction(totalAntes, inseridas)
        if ('error' in fin) { setEstado(key, { estado: 'erro', mensagem: fin.error }); return }
        linhasRef.current.vendas = []
        // op_propria (v4.17.0): aviso não-bloqueante (ex.: queda de operacao_propria) anexado ao sucesso.
        const avisoVendas = fin.avisos.length ? ` ⚠ ${fin.avisos.join(' ')}` : ''
        setEstado(key, { estado: 'sucesso', mensagem: `${formatarNum(fin.vendas_count)} vendas importadas com sucesso${avisoVendas}` })

      } else if (key === 'lancamentos') {
        const rows = linhasRef.current.lancamentos as LancamentoRaw[]
        let inseridas = 0
        setEstado(key, { progresso: { feito: 0, total: rows.length } })
        for (let i = 0; i < rows.length; i += BATCH) {
          const res = await inserirLoteLancamentosAction(rows.slice(i, i + BATCH), i === 0)
          if ('error' in res) { setEstado(key, { estado: 'erro', mensagem: res.error }); return }
          inseridas += res.inseridas
          setEstado(key, { progresso: { feito: inseridas, total: rows.length } })
        }
        const fin = await finalizarLancamentosAction(totalAntes, inseridas)
        if ('error' in fin) { setEstado(key, { estado: 'erro', mensagem: fin.error }); return }
        linhasRef.current.lancamentos = []
        setEstado(key, { estado: 'sucesso', mensagem: `${formatarNum(fin.total_linhas)} lançamentos importados com sucesso` })

      } else if (key === 'lancamentos_movimentacao') {
        const rows = linhasRef.current.lancamentos_movimentacao as LancamentoMovimentacaoRaw[]
        let inseridas = 0
        setEstado(key, { progresso: { feito: 0, total: rows.length } })
        for (let i = 0; i < rows.length; i += BATCH) {
          const res = await inserirLoteLancamentosMovimentacaoAction(rows.slice(i, i + BATCH), i === 0, nome)
          if ('error' in res) { setEstado(key, { estado: 'erro', mensagem: res.error }); return }
          inseridas += res.inseridas
          setEstado(key, { progresso: { feito: inseridas, total: rows.length } })
        }
        const fin = await finalizarLancamentosMovimentacaoAction(totalAntes, inseridas)
        if ('error' in fin) { setEstado(key, { estado: 'erro', mensagem: fin.error }); return }
        linhasRef.current.lancamentos_movimentacao = []
        setEstado(key, { estado: 'sucesso', mensagem: `${formatarNum(inseridas)} registros importados com sucesso` })

      } else if (key === 'titulos_em_aberto') {
        const rows = linhasRef.current.titulos_em_aberto as TituloEmAbertoRaw[]
        let inseridas = 0
        setEstado(key, { progresso: { feito: 0, total: rows.length } })
        for (let i = 0; i < rows.length; i += BATCH) {
          const res = await inserirLoteTitulosEmAbertoAction(rows.slice(i, i + BATCH), i === 0, nome)
          if ('error' in res) { setEstado(key, { estado: 'erro', mensagem: res.error }); return }
          inseridas += res.inseridas
          setEstado(key, { progresso: { feito: inseridas, total: rows.length } })
        }
        const fin = await finalizarTitulosEmAbertoAction(totalAntes, inseridas)
        if ('error' in fin) { setEstado(key, { estado: 'erro', mensagem: fin.error }); return }
        linhasRef.current.titulos_em_aberto = []
        setEstado(key, { estado: 'sucesso', mensagem: `${formatarNum(inseridas)} registros importados com sucesso` })

      } else if (key === 'demonstrativo_competencia') {
        const rows = linhasRef.current.demonstrativo_competencia as DemonstrativoCompetenciaRaw[]
        // A soma de conferência é medida ANTES de enviar, sobre as linhas que o parser
        // produziu — e pela MESMA função que o teste prova (`somaCentavos`). Medi-la depois,
        // ou reimplementá-la aqui, seria conferir a base contra ela mesma.
        const somaArquivo = somaCentavos(rows)
        let inseridas = 0
        setEstado(key, { progresso: { feito: 0, total: rows.length } })
        for (let i = 0; i < rows.length; i += BATCH) {
          const res = await inserirLoteDemonstrativoCompetenciaAction(rows.slice(i, i + BATCH), i === 0, nome)
          if ('error' in res) { setEstado(key, { estado: 'erro', mensagem: res.error }); return }
          inseridas += res.inseridas
          setEstado(key, { progresso: { feito: inseridas, total: rows.length } })
        }
        const fin = await finalizarDemonstrativoCompetenciaAction(inseridas, somaArquivo)
        if ('error' in fin) { setEstado(key, { estado: 'erro', mensagem: fin.error }); return }
        linhasRef.current.demonstrativo_competencia = []
        setEstado(key, {
          estado: 'sucesso',
          mensagem:
            `${formatarNum(fin.status.total)} linhas · Σ ${fmtBRL2(fin.status.soma_centavos / 100)} ` +
            `· ${formatarNum(fin.status.pares)} pares — conferido com o arquivo`,
        })

      } else {
        // Pessoas — pipeline ATÔMICO (= Vendas): lotes na staging + swap em finalizar.
        const rows = linhasRef.current.pessoas as PessoaRaw[]
        let inseridas = 0
        setEstado(key, { progresso: { feito: 0, total: rows.length } })
        for (let i = 0; i < rows.length; i += BATCH) {
          const res = await inserirLotePessoasAction(rows.slice(i, i + BATCH), i === 0)
          if ('error' in res) { setEstado(key, { estado: 'erro', mensagem: res.error }); return }
          inseridas += res.inseridas
          setEstado(key, { progresso: { feito: inseridas, total: rows.length } })
        }
        const fin = await finalizarPessoasAction(totalAntes, inseridas)
        if ('error' in fin) { setEstado(key, { estado: 'erro', mensagem: fin.error }); return }
        linhasRef.current.pessoas = []
        setEstado(key, { estado: 'sucesso', mensagem: `${formatarNum(fin.pessoas_count)} pessoas importadas com sucesso` })
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
    <div>
      <div className="mb-6">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Atualização de Dados</h1>
          <p className="text-sm text-zinc-400 mt-0.5">Importe planilhas para atualizar a base de dados da plataforma</p>
        </div>
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
        {/* Fecha a lista: as 5 de cima são planilha; esta base vem sozinha da API. */}
        <CardSincronizacaoMonde status={statusMonde} />
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
