'use client'

// Faturamento Corporativo — Fase 1b (v4.31.0). TELA DE REVISÃO + EMISSÃO de boletos.
// Importa a crua → cruza com a base de pessoas (1a) → revisão → EMITE boletos via Asaas.
// A emissão é AÇÃO IRREVERSÍVEL sobre dinheiro: ambiente SEMPRE visível (sandbox/produção,
// resolvido no servidor), confirmação explícita (produção = reforçada), idempotência dupla
// e falha parcial tratadas server-side (actions.emitirBoletos). Só faturas PRONTAS emitem.

import { useRef, useState, useCallback, useMemo } from 'react'
import { Upload, Loader2, AlertTriangle, ShieldAlert, FlaskConical, CheckCircle2, ExternalLink } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { numBRL2 } from '@/lib/fmt'
import { SETOR_COLORS } from '@/lib/config'
import { parseFaturamentoFile } from '@/lib/faturamento/parse-faturamento'
import { classificarFaturas, mapaPorNome } from '@/lib/faturamento/classificar'
import { cruzarFaturamento, emitirBoletos, type FaturaEmitir, type ResultadoEmissao, type ItemEmissao } from '@/app/financeiro/faturamento-corp/actions'
import type { FaturaClassificada, ResumoFaturamento, StatusCruzamento } from '@/lib/faturamento/tipos'
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

type Estado = 'vazio' | 'processando' | 'pronto' | 'erro'
type Fase   = 'lendo' | 'cruzando'
const LARGURA: Record<Fase, string> = { lendo: '40%', cruzando: '85%' }
const LABEL:   Record<Fase, string> = { lendo: 'Lendo a planilha…', cruzando: 'Cruzando com a base de pessoas…' }

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

  // Emissão (Fase 1b)
  const [modalAberto, setModal]       = useState(false)
  const [confirmTexto, setConfirm]    = useState('')
  const [emitindo, setEmitindo]       = useState(false)
  const [resultado, setResultado]     = useState<ResultadoEmissao | null>(null)

  const ativo = estado !== 'processando' && !emitindo
  const ehProducao = ambiente === 'producao'

  // Mapa ref→resultado (depois de emitir, marca cada linha da tabela).
  const resultadoPorRef = useMemo(() => {
    const m = new Map<string, ItemEmissao>()
    if (resultado) for (const it of [...resultado.emitidos, ...resultado.jaExistiam, ...resultado.falharam, ...resultado.pulados]) m.set(it.ref, it)
    return m
  }, [resultado])

  // Só faturas PRONTAS marcadas podem emitir (a UI não deixa marcar as outras).
  const selecionadas = useMemo(
    () => faturas.filter(f => f.status === 'pronta' && f.emitir && f.fatura_cliente_no),
    [faturas],
  )
  const totalSelecionado = useMemo(() => selecionadas.reduce((s, f) => s + (f.valor ?? 0), 0), [selecionadas])

  async function processar(file: File) {
    setErro(null); setEstado('processando'); setFase('lendo'); setResumo(null); setFaturas([]); setResultado(null)

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

  function abrirConfirmacao() {
    if (selecionadas.length === 0 || !configurado) return
    setConfirm(''); setModal(true)
  }

  async function confirmarEmissao() {
    setModal(false); setEmitindo(true)
    const payload: FaturaEmitir[] = selecionadas.map(f => ({
      pessoa: (f.pessoa ?? '').trim(), valor: f.valor, vencimento: f.vencimento, fatura_cliente_no: f.fatura_cliente_no,
    }))
    try {
      // Em produção o servidor exige a confirmação reforçada; só chegamos aqui após o
      // usuário digitar "EMITIR" (o botão de confirmar fica desabilitado até isso).
      const res = await emitirBoletos(payload, { confirmacaoProducao: ehProducao })
      setResultado(res)
    } catch {
      setResultado({ ambiente, emitidos: [], jaExistiam: [], falharam: payload.map(p => ({ ref: p.fatura_cliente_no ?? '(sem nº)', pessoa: p.pessoa, resultado: 'falhou' as const, erro: 'Falha inesperada ao emitir. Nada confirmado — verifique e tente de novo.' })), pulados: [], total: payload.length })
    } finally {
      setEmitindo(false)
    }
  }

  // ── Drag & drop (padrão admin/uploads + Calculadora) ────────────────────────
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

  const confirmacaoOk = !ehProducao || confirmTexto.trim().toUpperCase() === 'EMITIR'

  return (
    <div className="space-y-6">
      {/* Cabeçalho + badge de ambiente (SEMPRE visível) */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Faturamento Corporativo</h1>
          <p className="text-sm text-zinc-400 mt-0.5">
            Importe a planilha, confira o cruzamento com a base de pessoas e emita os boletos das faturas prontas.
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

      {/* Resultado da emissão (aparece após emitir) */}
      {resultado && <ResultadoEmissaoCard resultado={resultado} />}

      {/* Revisão */}
      {resumo && estado === 'pronto' && (
        <Card title="Revisão do faturamento" subtitle="Confira o cruzamento e marque as faturas prontas que deseja emitir.">
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
                {faturas.map(f => {
                  const r = f.fatura_cliente_no ? resultadoPorRef.get(f.fatura_cliente_no) : undefined
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
                        {r && <LinhaResultado item={r} />}
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
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Barra de ação — emitir */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 pt-4">
            <p className="text-2xs text-zinc-500">
              {selecionadas.length > 0
                ? <>Selecionadas <b className="text-zinc-700">{selecionadas.length}</b> {selecionadas.length === 1 ? 'fatura pronta' : 'faturas prontas'} · Total <span className="text-[var(--text-subtle)]">R$</span> <span className="tabular-nums text-zinc-700">{numBRL2(totalSelecionado)}</span></>
                : 'Marque as faturas prontas que deseja emitir.'}
            </p>
            <button
              type="button"
              onClick={abrirConfirmacao}
              disabled={selecionadas.length === 0 || !configurado || emitindo}
              className="inline-flex items-center gap-2 rounded-md bg-action-primary px-4 py-2 text-xs font-medium text-action-primary-fg foco-neutro transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {emitindo ? <Loader2 size={14} className="animate-spin" /> : null}
              {emitindo ? 'Emitindo…' : `Emitir ${selecionadas.length || ''} ${selecionadas.length === 1 ? 'boleto' : 'boletos'}`.trim()}
            </button>
          </div>
          {!configurado && (
            <p className="mt-2 text-2xs text-warning">⚠ Asaas não configurado neste ambiente — a emissão está indisponível.</p>
          )}
        </Card>
      )}

      {/* Modal de confirmação */}
      {modalAberto && (
        <ConfirmacaoEmissao
          ambiente={ambiente}
          quantidade={selecionadas.length}
          total={totalSelecionado}
          confirmTexto={confirmTexto}
          onTexto={setConfirm}
          confirmacaoOk={confirmacaoOk}
          onCancelar={() => setModal(false)}
          onConfirmar={() => void confirmarEmissao()}
        />
      )}
    </div>
  )
}

// ── Badge de ambiente — SEMPRE visível; produção é forte e vermelho ───────────
function AmbienteBadge({ ambiente, configurado }: Props) {
  if (ambiente === 'producao') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-danger bg-danger-bg px-2.5 py-1 text-xs font-semibold text-danger">
        <ShieldAlert size={14} /> PRODUÇÃO · boletos reais
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-action-soft-border bg-action-soft px-2.5 py-1 text-xs font-medium text-action-primary">
      <FlaskConical size={14} /> Ambiente de testes (sandbox){!configurado && ' · sem chave'}
    </span>
  )
}

// ── Linha de resultado por fatura (na coluna Cruzamento, após emitir) ─────────
function LinhaResultado({ item }: { item: ItemEmissao }) {
  if (item.resultado === 'emitido' || item.resultado === 'ja_existia') {
    return (
      <span className="mt-0.5 flex items-center gap-1 text-3xs text-success">
        <CheckCircle2 size={11} />
        {item.resultado === 'ja_existia' ? 'já existia' : 'emitido'}
        {item.bankSlipUrl && (
          <a href={item.bankSlipUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 underline">
            ver boleto <ExternalLink size={9} />
          </a>
        )}
        {item.registroFalhou && <span className="text-warning">(registro local falhou)</span>}
      </span>
    )
  }
  if (item.resultado === 'pulado') return <span className="mt-0.5 block text-3xs text-zinc-400">pulada (já emitida)</span>
  return <span className="mt-0.5 block text-3xs text-danger">falhou: {item.erro}</span>
}

// ── Painel de resultado da emissão ────────────────────────────────────────────
function ResultadoEmissaoCard({ resultado }: { resultado: ResultadoEmissao }) {
  const { emitidos, jaExistiam, falharam, pulados, ambiente } = resultado
  const okN = emitidos.length + jaExistiam.length
  return (
    <Card title="Resultado da emissão" subtitle={`Ambiente: ${ambiente === 'producao' ? 'PRODUÇÃO' : 'sandbox (testes)'}`}>
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm">
        <span className="text-success font-medium">{okN} {okN === 1 ? 'boleto' : 'boletos'} ok{jaExistiam.length > 0 ? ` (${jaExistiam.length} já existia${jaExistiam.length === 1 ? '' : 'm'})` : ''}</span>
        {falharam.length > 0 && <span className="text-danger font-medium">{falharam.length} {falharam.length === 1 ? 'falhou' : 'falharam'}</span>}
        {pulados.length > 0 && <span className="text-zinc-500">{pulados.length} pulada{pulados.length === 1 ? '' : 's'} (já emitidas)</span>}
      </div>
      {falharam.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-zinc-100 pt-3 text-2xs text-zinc-600">
          {falharam.map((it, i) => (
            <li key={`${it.ref}-${i}`}><span className="font-medium text-zinc-700">{it.pessoa || it.ref}</span> — <span className="text-danger">{it.erro}</span></li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-3xs text-zinc-400">
        Cada boleto é independente: as falhas não afetam os já emitidos. Reprocessar a mesma planilha não duplica — as faturas já emitidas são puladas.
      </p>
    </Card>
  )
}

// ── Modal de confirmação (produção = reforçada, digitar EMITIR) ───────────────
function ConfirmacaoEmissao(props: {
  ambiente: AsaasAmbiente
  quantidade: number
  total: number
  confirmTexto: string
  onTexto: (v: string) => void
  confirmacaoOk: boolean
  onCancelar: () => void
  onConfirmar: () => void
}) {
  const { ambiente, quantidade, total, confirmTexto, onTexto, confirmacaoOk, onCancelar, onConfirmar } = props
  const ehProducao = ambiente === 'producao'
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancelar}>
      <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          {ehProducao
            ? <ShieldAlert size={18} className="text-danger" />
            : <FlaskConical size={18} className="text-action-primary" />}
          <h2 className="text-base font-semibold text-zinc-900">Confirmar emissão</h2>
        </div>

        <p className="mt-3 text-sm text-zinc-600">
          Você vai emitir <b className="text-zinc-900">{quantidade}</b> {quantidade === 1 ? 'boleto' : 'boletos'}, totalizando{' '}
          <span className="text-[var(--text-subtle)]">R$</span> <b className="tabular-nums text-zinc-900">{numBRL2(total)}</b>, no ambiente{' '}
          {ehProducao
            ? <b className="text-danger">PRODUÇÃO (boletos reais e cobráveis)</b>
            : <b className="text-action-primary">sandbox (testes — nada é cobrado)</b>}.
        </p>

        {ehProducao && (
          <div className="mt-3 rounded-md border border-danger bg-danger-bg px-3 py-2">
            <p className="text-xs text-danger font-medium">Esta ação é irreversível e gera cobranças reais.</p>
            <p className="mt-2 text-2xs text-zinc-600">Para confirmar, digite <b>EMITIR</b>:</p>
            <input
              type="text"
              value={confirmTexto}
              onChange={e => onTexto(e.target.value)}
              autoFocus
              className="mt-1 w-full rounded border border-zinc-300 px-2 py-1 text-sm foco-neutro"
              placeholder="EMITIR"
            />
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancelar}
            className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 foco-neutro hover:bg-zinc-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirmar}
            disabled={!confirmacaoOk}
            className={[
              'rounded-md px-4 py-1.5 text-xs font-medium text-action-primary-fg foco-neutro transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40',
              ehProducao ? 'bg-danger' : 'bg-action-primary',
            ].join(' ')}
          >
            {ehProducao ? 'Emitir em produção' : 'Emitir'}
          </button>
        </div>
      </div>
    </div>
  )
}
