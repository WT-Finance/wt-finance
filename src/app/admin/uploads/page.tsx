'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Upload, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react'
import {
  getLancamentosStatusAction,
  getVendasStatusAction,
  getLancamentosMovimentacaoStatusAction,
  getTitulosEmAbertoStatusAction,
  getPessoasStatusAction,
  inserirLotePessoasAction,
  finalizarPessoasAction,
  getDemonstrativoCompetenciaStatusAction,
  getMondeSincronizacaoStatusAction,
} from './actions'
import type { StatusSincronizacaoMonde } from './actions'
import { fmtDataHoraSP, fmtBRL2 } from '@/lib/fmt'
import { ModalConfirmacaoUpload, type DetalhesConferencia } from '@/components/admin/modal-confirmacao-upload'
import { parsePessoasFile, PESSOAS_COLUNAS } from '@/lib/carga/parse-pessoas'
import { LANCAMENTOS_COLUNAS } from '@/lib/carga/parse-lancamentos'
import { LANCAMENTOS_MOVIMENTACAO_COLUNAS } from '@/lib/carga/parse-lancamentos-movimentacao'
import { TITULOS_EM_ABERTO_COLUNAS } from '@/lib/carga/parse-titulos-em-aberto'
import { DEMONSTRATIVO_COMPETENCIA_COLUNAS } from '@/lib/carga/parse-demonstrativo-competencia'
import { parseArquivoEmWorker } from '@/lib/carga/parse-em-worker'
import type { PessoaRaw } from '@/lib/carga/parse-pessoas'
import type { BaseIngestao } from '@/lib/ingestao/bases'
import {
  sha256DoArquivo, pedirUrlsAssinadas, enviarArquivoParaStorage, processarCarga,
  type ArquivoDaCarga, type PacoteConferido, type RespostaCarga,
} from './ingestao-cliente'

type BaseKey =
  | 'vendas' | 'lancamentos' | 'lancamentos_movimentacao' | 'titulos_em_aberto' | 'pessoas'
  | 'demonstrativo_competencia'

type EstadoCard =
  | 'idle'
  | 'validando'               // só Pessoas: parse no cliente
  | 'enviando'                // fluxo novo: sha256 + PUT no Storage (barra por bytes)
  | 'conferindo'              // fluxo novo: POST confirmar:false — parse/checksums/diff no servidor
  | 'aguardando_confirmacao'
  | 'aplicando'               // fluxo novo: POST confirmar:true
  | 'carregando'              // só Pessoas: envio de lotes já parseados
  | 'sucesso'
  | 'erro'

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
  arquivos:    File[]
  totalLinhas: number
  totalAntes:  number
  mensagem:    string
  /** Progresso — bytes no fluxo novo (`enviando`), linhas já gravadas no fluxo antigo
   *  (`carregando`, só Pessoas). `null` = sem barra (ainda calculando/aguardando servidor). */
  progresso:   { feito: number; total: number } | null
  /** Fluxo novo: o que a CONFERÊNCIA do servidor devolveu — guardado para alimentar o modal
   *  rico e, depois de confirmado, reenviado com `confirmar: true`. `null` no fluxo antigo. */
  carga:       PacoteConferido | null
}

const ESTADO_INICIAL: EstadoUpload = {
  estado: 'idle', arquivos: [], totalLinhas: 0, totalAntes: 0, mensagem: '', progresso: null, carga: null,
}

interface BaseConfig {
  key:      BaseKey
  /** Presente ⇒ fluxo NOVO (rota de ingestão, v6.0.0/M4): upload do arquivo cru, sha256 no
   *  navegador, conferência do servidor antes de aplicar (contrato
   *  `docs/contratos/ingestao-v1.md`). Ausente ⇒ fluxo antigo — só Pessoas, fora do contrato
   *  (decisão 11 do briefing: "parada, viva"). */
  baseIngestao?: BaseIngestao
  label:    string
  descricao: string
  /** Sufixo do contador na linha de status (ex.: "vendas", "lançamentos", "registros"). */
  unidade:  string
  /** Colunas obrigatórias (rótulos) exibidas no card. DERIVADAS do parser (v4.29.0); o
   *  Vendas é tolerante (parser não exige nenhuma) → lista vazia, sem mudar o que aceita. */
  obrigatorias: string[]
  /** Extensões aceitas no seletor. A extensão é POR BASE (contrato §2.1): `.xlsx` para as
   *  quatro bases de planilha; `.csv` para Lançamentos por Operação (scrape). */
  accept:  string
  /** Só Vendas: a base aceita N arquivos, um por ano (contrato §2.1/§3). */
  multiplos?: boolean
}

// Texto explicativo uniforme: cada base SUBSTITUI TODA a base; importar sempre completo.
const BASES: BaseConfig[] = [
  {
    key: 'vendas',
    baseIngestao: 'vendas-produto',
    label: 'Vendas por Produto',
    descricao: 'Substitui toda a base de Vendas por Produto. Um arquivo por ano — selecione todos de uma vez.',
    unidade: 'vendas',
    obrigatorias: [], // parser tolerante (mapeia o que estiver presente) — nenhuma exigida hoje
    accept: '.xlsx',
    multiplos: true,
  },
  {
    key: 'lancamentos',
    baseIngestao: 'lancamentos-operacao',
    label: 'Lançamentos por Operação',
    descricao: 'Substitui toda a base de Lançamentos por Operação. Importe sempre o arquivo completo.',
    unidade: 'lançamentos',
    obrigatorias: LANCAMENTOS_COLUNAS,
    accept: '.csv', // contrato §2.1: só esta base aceita csv (export "Análise de Operações", scrape)
  },
  {
    key: 'lancamentos_movimentacao',
    baseIngestao: 'lancamentos-movimentacao',
    label: 'Lançamentos por Movimentação',
    descricao: 'Substitui toda a base de Lançamentos por Movimentação (realizado — data em que o dinheiro entrou/saiu da conta). Importe sempre o arquivo completo.',
    unidade: 'registros',
    obrigatorias: LANCAMENTOS_MOVIMENTACAO_COLUNAS,
    accept: '.xlsx',
  },
  {
    key: 'titulos_em_aberto',
    baseIngestao: 'lancamentos-aberto',
    label: 'Lançamentos por Vencimento (em aberto)',
    descricao: 'Substitui toda a base de títulos em aberto (previsto — por data de vencimento). Importe sempre o arquivo completo.',
    unidade: 'registros',
    obrigatorias: TITULOS_EM_ABERTO_COLUNAS,
    accept: '.xlsx',
  },
  {
    key: 'pessoas',
    label: 'Pessoas',
    descricao: 'Substitui toda a base de Pessoas (cadastro do Monde). Importe sempre o arquivo completo.',
    unidade: 'pessoas',
    obrigatorias: PESSOAS_COLUNAS,
    accept: '.xlsx,.csv',
  },
  {
    key: 'demonstrativo_competencia',
    baseIngestao: 'demonstrativo-competencia',
    label: 'Demonstrativo de Resultado (Competência)',
    descricao: 'Substitui toda a base do regime de COMPETÊNCIA (fato gerador: data de emissão) — o export "Demonstrativo de Resultado" do Monde já tratado. Importe sempre o arquivo completo.',
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

/** Nome do(s) arquivo(s) selecionado(s), para o rótulo do card — Vendas pode trazer vários. */
function descricaoArquivos(arquivos: File[]): string {
  if (arquivos.length === 0) return ''
  if (arquivos.length === 1) return arquivos[0].name
  return `${arquivos.length} arquivos`
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
  onArquivosSelecionados,
  onCancelar,
  onConfirmar,
}: {
  config:                 BaseConfig
  status:                 StatusCarga | null
  estado:                 EstadoUpload
  onArquivosSelecionados: (files: File[]) => void
  onCancelar:             () => void
  onConfirmar:            () => void
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
    const arquivos = Array.from(e.dataTransfer.files ?? [])
    if (arquivos.length === 0) return
    onArquivosSelecionados(config.multiplos ? arquivos : arquivos.slice(0, 1))
  }, [ativo, config.multiplos, onArquivosSelecionados])

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
          accept={config.accept}
          multiple={config.multiplos === true}
          className="hidden"
          onChange={e => {
            const arquivos = Array.from(e.target.files ?? [])
            if (arquivos.length > 0) onArquivosSelecionados(arquivos)
            e.target.value = ''
          }}
        />
        {estado.estado === 'idle' && (
          <>
            <Upload size={16} className="mx-auto mb-1.5 text-zinc-400" />
            {/* O texto segue o `accept` da base — prometer .csv onde o parser exige o valor
                nativo da célula convidaria a um upload que falha (ou pior, que lê torto). */}
            <p className="text-xs text-zinc-500">
              Arraste ou clique para selecionar {config.multiplos ? 'um ou mais arquivos' : 'um arquivo'}{' '}
              {config.accept
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
            <Loader2 size={14} className="animate-spin" /> Lendo planilha {descricaoArquivos(estado.arquivos)}…
          </div>
        )}
        {estado.estado === 'enviando' && (() => {
          const p = estado.progresso
          if (!p) {
            return (
              <div className="flex items-center justify-center gap-2 text-xs text-zinc-500">
                <Loader2 size={14} className="animate-spin" /> Preparando {descricaoArquivos(estado.arquivos)}…
              </div>
            )
          }
          const pct = p.total > 0 ? Math.min(100, Math.round((100 * p.feito) / p.total)) : 0
          return (
            <div className="text-xs text-text-secondary">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Loader2 size={14} className="animate-spin" /> Enviando {descricaoArquivos(estado.arquivos)}… {pct}%
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-action-soft">
                <div className="h-full rounded-full bg-action-primary transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>
          )
        })()}
        {estado.estado === 'conferindo' && (
          <div className="flex items-center justify-center gap-2 text-xs text-zinc-500">
            <Loader2 size={14} className="animate-spin" /> Conferindo no servidor…
          </div>
        )}
        {estado.estado === 'aguardando_confirmacao' && (
          <p className="text-xs text-zinc-700">
            <span className="font-medium">{descricaoArquivos(estado.arquivos)}</span> — {formatarNum(estado.totalLinhas)} linhas válidas
          </p>
        )}
        {estado.estado === 'aplicando' && (
          <div className="flex items-center justify-center gap-2 text-xs text-zinc-500">
            <Loader2 size={14} className="animate-spin" /> Aplicando…
          </div>
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

/** Os avisos não-bloqueantes que o aplicador do servidor produziu (queda de `operacao_propria`,
 *  par novo da competência, conta nova do fluxo de caixa) — todos pousam em `alarmes`
 *  (`src/lib/ingestao/carga.ts#ResultadoCarga`). */
function avisosDaResposta(resposta: RespostaCarga): string[] {
  return [...resposta.alarmes]
}

/** Extrai do pacote conferido o que o modal RICO (cinco bases do contrato) mostra além do
 *  antes/depois de sempre. `null` no fluxo antigo (Pessoas, sem `carga`). Sem detalhamento por
 *  ano (`por_ano`/`anos_fechados_alterados`): exige `ingestao.baseline`, que é M6. */
function detalhesDoModal(carga: PacoteConferido | null): DetalhesConferencia | null {
  if (!carga) return null
  const { resposta } = carga
  return {
    rejeitadasPorData:  resposta.parse.rejeitadas_por_data,
    paresNovos:         resposta.parse.pares_novos,
    checksumsConferidos: resposta.arquivos.reduce((s, a) => s + a.checksums_conferidos, 0),
    checksumsFalhos:     resposta.arquivos.reduce((s, a) => s + a.checksums_falhos, 0),
    somaDiff:            resposta.diff.soma,
    avisos:              avisosDaResposta(resposta),
  }
}

/** Mensagem final de sucesso do fluxo novo — o que a resposta da carga (contrato §2.3) traz,
 *  no molde do que o card já mostrava por base antes desta missão: contagem, Σ quando existe,
 *  "conferido com o arquivo" na competência, e os avisos não-bloqueantes (nunca descartados). */
function mensagemDeSucesso(config: BaseConfig, resposta: RespostaCarga): string {
  const extras: string[] = []
  if (resposta.parse.rejeitadas_por_data > 0) {
    extras.push(`${formatarNum(resposta.parse.rejeitadas_por_data)} data(s) fora da faixa`)
  }
  if (resposta.diff.soma !== null) extras.push(`Σ ${fmtBRL2(resposta.diff.soma)}`)
  if (config.key === 'demonstrativo_competencia') {
    const falhos = resposta.arquivos.reduce((s, a) => s + a.checksums_falhos, 0)
    if (falhos === 0) extras.push('conferido com o arquivo')
  }
  const sufixo = extras.length > 0 ? ` (${extras.join(' · ')})` : ''
  const avisos = avisosDaResposta(resposta)
  const sufixoAvisos = avisos.length > 0 ? ` ⚠ ${avisos.join(' ')}` : ''
  return `${formatarNum(resposta.parse.linhas)} ${config.unidade} importadas com sucesso${sufixo}${sufixoAvisos}`
}

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

  // Só Pessoas ainda parseia no cliente (fluxo antigo) — as linhas já parseadas ficam aqui
  // entre a seleção do arquivo e a confirmação, exatamente como as cinco bases faziam antes
  // desta missão.
  const linhasPessoasRef = useRef<PessoaRaw[]>([])

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

  /**
   * Fluxo NOVO (v6.0.0/M4) — as cinco bases do contrato de ingestão. Passo a passo do anexo
   * `docs/briefings/anexo-v6-0-0-m4-desenho-da-rota.md` §5:
   *   1. sha256 no navegador (Web Crypto) → 2. `upload-url` → 3. `PUT` no Storage com
   *   progresso real → 4. conferência do servidor (`confirmar: false`) → modal → 5. aplica
   *   (`confirmar: true`, disparado por `handleConfirmar`).
   */
  async function handleArquivosSelecionadosNovo(key: BaseKey, base: BaseIngestao, files: File[]) {
    setEstado(key, {
      estado: 'enviando', arquivos: files, mensagem: '', carga: null,
      totalLinhas: 0, totalAntes: 0, progresso: null,
    })

    try {
      const [statusAtual, hashes] = await Promise.all([
        statusAntesDoUpload(key),
        Promise.all(files.map(f => sha256DoArquivo(f))),
      ])
      const infos = files.map((f, i) => ({ nome: f.name, bytes: f.size, sha256: hashes[i], file: f }))

      const { carga_id: cargaId, arquivos: assinados } = await pedirUrlsAssinadas(
        base, infos.map(({ nome, bytes, sha256 }) => ({ nome, bytes, sha256 })),
      )

      const totalBytes = infos.reduce((s, i) => s + i.bytes, 0)
      const bytesPorArquivo = new Map<string, number>()
      setEstado(key, { progresso: { feito: 0, total: totalBytes } })

      for (const info of infos) {
        const assinado = assinados.find(a => a.nome === info.nome)
        if (!assinado) throw new Error(`O servidor não devolveu URL de envio para "${info.nome}".`)
        await enviarArquivoParaStorage(assinado.signed_url, info.file, bytesEnviados => {
          bytesPorArquivo.set(info.nome, bytesEnviados)
          const feito = Array.from(bytesPorArquivo.values()).reduce((s, v) => s + v, 0)
          setEstado(key, { progresso: { feito, total: totalBytes } })
        })
      }

      const arquivosDaCarga: ArquivoDaCarga[] = infos.map(i => {
        const assinado = assinados.find(a => a.nome === i.nome)!
        return { path: assinado.path, nome: i.nome, sha256: i.sha256 }
      })
      const extraidoEm = new Date().toISOString()

      // Conferência — parse, checksums e diff no servidor, SEM aplicar (o gate humano
      // continua sendo o modal, agora sobre o número que o servidor conferiu).
      setEstado(key, { estado: 'conferindo', progresso: null })
      const resposta = await processarCarga(base, { cargaId, arquivos: arquivosDaCarga, extraidoEm, confirmar: false })

      setEstado(key, {
        estado: 'aguardando_confirmacao',
        totalAntes: statusAtual,
        totalLinhas: resposta.parse.linhas,
        carga: { cargaId, arquivos: arquivosDaCarga, extraidoEm, resposta },
      })
      setModal(key)
    } catch (err) {
      setEstado(key, { estado: 'erro', mensagem: err instanceof Error ? err.message : 'Erro ao enviar o arquivo' })
    }
  }

  /** Fluxo ANTIGO — só Pessoas: parse no cliente (Web Worker), como sempre foi. */
  async function handleArquivoSelecionadoAntigo(key: BaseKey, arquivo: File) {
    setEstado(key, { estado: 'validando', arquivos: [arquivo], totalLinhas: 0, totalAntes: 0, mensagem: '', progresso: null, carga: null })
    try {
      const res = await parseArquivoEmWorker<PessoaRaw>('pessoas', arquivo, parsePessoasFile)
      if ('error' in res) { setEstado(key, { estado: 'erro', mensagem: res.error }); return }
      const st = await getPessoasStatusAction()
      if ('error' in st) { setEstado(key, { estado: 'erro', mensagem: st.error }); return }
      linhasPessoasRef.current = res
      setEstado(key, { estado: 'aguardando_confirmacao', totalLinhas: res.length, totalAntes: st.total })
      setModal(key)
    } catch (err) {
      setEstado(key, { estado: 'erro', mensagem: err instanceof Error ? err.message : 'Erro de parse' })
    }
  }

  async function handleArquivosSelecionados(key: BaseKey, files: File[]) {
    if (files.length === 0) return
    const config = BASES.find(b => b.key === key)!
    if (config.baseIngestao) {
      await handleArquivosSelecionadosNovo(key, config.baseIngestao, config.multiplos ? files : files.slice(0, 1))
    } else {
      await handleArquivoSelecionadoAntigo(key, files[0])
    }
  }

  async function handleConfirmarNovo(key: BaseKey, config: BaseConfig, carga: PacoteConferido) {
    setEstado(key, { estado: 'aplicando' })
    try {
      const resposta = await processarCarga(config.baseIngestao!, {
        cargaId: carga.cargaId, arquivos: carga.arquivos, extraidoEm: carga.extraidoEm, confirmar: true,
      })
      setEstado(key, {
        estado: 'sucesso',
        mensagem: mensagemDeSucesso(config, resposta),
        arquivos: [], carga: null,
      })
      await carregarStatus()
    } catch (err) {
      setEstado(key, { estado: 'erro', mensagem: err instanceof Error ? err.message : 'Erro ao aplicar a carga' })
    }
  }

  async function handleConfirmarAntigo(key: BaseKey) {
    const est = estados[key]
    const totalAntes = est.totalAntes
    // Único consumidor hoje: Pessoas. Tamanho de lote validado (era o mesmo antes da migração).
    const BATCH = 500
    setEstado(key, { estado: 'carregando' })
    try {
      const rows = linhasPessoasRef.current
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
      linhasPessoasRef.current = []
      setEstado(key, { estado: 'sucesso', mensagem: `${formatarNum(fin.pessoas_count)} pessoas importadas com sucesso` })
      await carregarStatus()
    } catch (err) {
      setEstado(key, { estado: 'erro', mensagem: err instanceof Error ? err.message : 'Erro na importação' })
    }
  }

  async function handleConfirmar(key: BaseKey) {
    setModal(null)
    const config = BASES.find(b => b.key === key)!
    const est = estados[key]
    if (config.baseIngestao) {
      if (!est.carga) return
      await handleConfirmarNovo(key, config, est.carga)
    } else {
      if (est.arquivos.length === 0) return
      await handleConfirmarAntigo(key)
    }
  }

  function handleCancelar(key: BaseKey) {
    setModal(null)
    if (key === 'pessoas') linhasPessoasRef.current = []
    setEstado(key, { ...ESTADO_INICIAL })
  }

  /** Fluxo novo: o "antes" mostrado no gate humano é o total ATUAL da base, lido fresco no
   *  momento do envio — a mesma RPC de status que o card já usa para "última atualização". */
  async function statusAntesDoUpload(key: BaseKey): Promise<number> {
    switch (key) {
      case 'vendas': { const r = await getVendasStatusAction(); return 'error' in r ? 0 : r.total }
      case 'lancamentos': { const r = await getLancamentosStatusAction(); return 'error' in r ? 0 : r.total }
      case 'lancamentos_movimentacao': { const r = await getLancamentosMovimentacaoStatusAction(); return 'error' in r ? 0 : r.total }
      case 'titulos_em_aberto': { const r = await getTitulosEmAbertoStatusAction(); return 'error' in r ? 0 : r.total }
      case 'demonstrativo_competencia': { const r = await getDemonstrativoCompetenciaStatusAction(); return 'error' in r ? 0 : r.total }
      case 'pessoas': return 0 // fluxo antigo não passa por aqui
    }
  }

  const modalConfig = modal ? BASES.find(b => b.key === modal)! : null

  return (
    <div>
      <div className="mb-6">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Atualização de Dados</h1>
          <p className="mt-0.5 text-sm text-text-subtle">Importe planilhas para atualizar a base de dados da plataforma</p>
        </div>
      </div>

      <div className="space-y-4">
        {BASES.map(config => (
          <CardUpload
            key={config.key}
            config={config}
            status={status[config.key]}
            estado={estados[config.key]}
            onArquivosSelecionados={files => { void handleArquivosSelecionados(config.key, files) }}
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
          detalhes={detalhesDoModal(estados[modal].carga)}
          onConfirmar={() => { void handleConfirmar(modal) }}
          onCancelar={() => handleCancelar(modal)}
        />
      )}
    </div>
  )
}
