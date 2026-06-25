'use client'

// Calculadora de Rateio (v4.28.0) — Financeiro. Importa uma fatura xlsx, cruza
// cada Venda Nº com a base (setor macro), rateia o valor por setor e EXIBE
// (READ-ONLY, não grava). Reusa @e965/xlsx (parse-fatura) + a server action de
// cruzamento + os primitivos/cores do DS. O dropzone (arrastar/clicar) + spinner +
// barra de progresso espelham a tela de Atualização de Dados (admin/uploads), para
// coerência de UX em toda a plataforma.
//
// INVARIANTE de exibição: o setor LÓGICO é o valor REAL da base ('Lazer'); aqui na
// tela 'Lazer' vira 'Trips' (ROTULO). O cruzamento e os baldes nunca usam 'Trips'.

import { useRef, useState, useCallback } from 'react'
import { Upload, Loader2, CheckCircle2, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { numBRL2 } from '@/lib/fmt'
import { SETOR_COLORS } from '@/lib/config'
import { parseFaturaRateioFile } from '@/lib/rateio/parse-fatura'
import { calcularRateio } from '@/lib/rateio/calcular'
import { ehSetorReal, type SetorLogico, type ResultadoRateio } from '@/lib/rateio/tipos'
import { cruzarVendasSetor } from '@/app/financeiro/calculadora-rateio/actions'

// 'Lazer' (base) → 'Trips' (tela). Os outros baldes mantêm o nome.
const ROTULO: Record<SetorLogico, string> = {
  Corporativo: 'Corporativo', Lazer: 'Trips', Weddings: 'Weddings', 'Não identificado': 'Não identificado',
}
// Cor identitária por setor (fonte única: SETOR_COLORS via tokens). 'Não identificado' = neutro.
const COR: Record<SetorLogico, string> = {
  Corporativo: SETOR_COLORS.Corporativo,
  Lazer:       SETOR_COLORS.Lazer,
  Weddings:    SETOR_COLORS.Weddings,
  'Não identificado': 'var(--text-muted)',
}

const fmtPct = (p: number) =>
  `${(p * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`

type Estado = 'vazio' | 'processando' | 'pronto' | 'erro'
type Fase   = 'lendo' | 'cruzando'

// Largura da barra por fase (determinística, reflete o estágio real — sem % falso).
const LARGURA_FASE: Record<Fase, string> = { lendo: '40%', cruzando: '85%' }
const LABEL_FASE:   Record<Fase, string> = { lendo: 'Lendo a fatura…', cruzando: 'Cruzando com a base de vendas…' }

export default function CalculadoraRateio() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [estado, setEstado]           = useState<Estado>('vazio')
  const [fase, setFase]               = useState<Fase>('lendo')
  const [erro, setErro]               = useState<string | null>(null)
  const [resultado, setResultado]     = useState<ResultadoRateio | null>(null)
  const [nomeArquivo, setNomeArquivo] = useState<string | null>(null)
  const [verLinhas, setVerLinhas]     = useState(false)
  const [isDragging, setIsDragging]   = useState(false)

  const ativo = estado !== 'processando'

  async function processar(file: File) {
    setErro(null); setVerLinhas(false); setEstado('processando'); setFase('lendo')

    if (file.size > 10 * 1024 * 1024) {
      setErro('Arquivo maior que 10MB.'); setEstado('erro'); return
    }

    const parsed = await parseFaturaRateioFile(file)
    if ('error' in parsed) { setErro(parsed.error); setEstado('erro'); return }
    if (parsed.faltando.length > 0) {
      setErro(`Coluna(s) não encontrada(s) no cabeçalho: ${parsed.faltando.join(', ')}. Confira a planilha.`)
      setEstado('erro'); return
    }

    setFase('cruzando')
    const numeros = Array.from(new Set(
      parsed.linhas.map(l => l.venda_numero).filter((v): v is string => v !== null),
    ))

    let pares: { venda_no: string; setor_macro: string }[]
    try {
      pares = await cruzarVendasSetor(numeros)
    } catch {
      setErro('Não foi possível consultar a base de vendas. Tente novamente.')
      setEstado('erro'); return
    }

    // Só setores REAIS entram no mapa; o que não casar cai em 'Não identificado' no cálculo.
    const mapa: Record<string, SetorLogico> = {}
    for (const p of pares) if (ehSetorReal(p.setor_macro)) mapa[p.venda_no] = p.setor_macro

    setResultado(calcularRateio(parsed.linhas, mapa))
    setNomeArquivo(file.name)
    setEstado('pronto')
  }

  // ── Drag & drop (mesmo padrão da Atualização de Dados) ──────────────────────
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (estado !== 'processando') setIsDragging(true)
  }, [estado])
  const onDragLeave = useCallback((e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false)
  }, [])
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (estado === 'processando') return
    const f = e.dataTransfer.files?.[0]
    if (f) void processar(f)
  }, [estado])

  function onInput(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) void processar(f)
    e.target.value = '' // permite reimportar o mesmo arquivo
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho — sem ícone, padrão das demais páginas (ex.: Atualização de Dados) */}
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">Calculadora de Rateio</h1>
        <p className="text-sm text-zinc-400 mt-0.5">
          Importe uma fatura para calcular o valor a ser rateado por setor
        </p>
      </div>

      {/* Upload — dropzone arrastar/clicar + spinner/barra (espelha admin/uploads) */}
      <Card>
        <div
          className={[
            'border-2 border-dashed rounded-lg p-6 text-center transition-colors',
            ativo ? 'cursor-pointer' : 'cursor-default',
            ativo && isDragging
              ? 'border-action-soft-border bg-action-soft'
              : ativo
                ? 'border-zinc-200 hover:border-action-soft-border hover:bg-action-soft/40'
                : 'border-zinc-100 bg-zinc-50',
          ].join(' ')}
          onClick={() => ativo && inputRef.current?.click()}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={onInput}
          />

          {(estado === 'vazio' || estado === 'pronto') && (
            <>
              <Upload size={18} className="mx-auto mb-1.5 text-zinc-400" />
              <p className="text-sm text-zinc-600">
                Arraste ou clique para selecionar a fatura <span className="font-medium">.xlsx</span> ou <span className="font-medium">.csv</span>
              </p>
              <p className="mt-1 text-xs text-zinc-400">
                A planilha precisa ter as colunas <b>Venda Nº</b> e <b>Valor</b>. O arquivo não é enviado nem armazenado.
              </p>
              {estado === 'pronto' && nomeArquivo && (
                <p className="mt-2 text-xs text-zinc-500">Fatura atual: <span className="font-medium">{nomeArquivo}</span> — clique para trocar</p>
              )}
            </>
          )}

          {estado === 'processando' && (
            <div className="text-xs text-text-secondary">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Loader2 size={14} className="animate-spin" />
                {LABEL_FASE[fase]}
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-action-soft">
                <div className="h-full rounded-full bg-action-primary transition-all duration-500" style={{ width: LARGURA_FASE[fase] }} />
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

      {/* Resultado */}
      {resultado && estado === 'pronto' && (
        <Card title="Rateio por setor" subtitle="Proporcional ao valor de cada venda. Valores com sinal (a fatura é saída).">
          <ul className="space-y-3">
            {resultado.baldes.map(b => {
              const vazio = b.linhas === 0
              return (
                <li key={b.setor} className={vazio ? 'opacity-50' : ''}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: COR[b.setor] }} />
                      <span className="text-sm font-medium text-zinc-700 truncate">{ROTULO[b.setor]}</span>
                      <span className="text-2xs text-zinc-400 shrink-0">
                        {b.linhas} {b.linhas === 1 ? 'linha' : 'linhas'}
                      </span>
                    </span>
                    <span className="flex items-baseline gap-3 shrink-0 tabular-nums">
                      <span className="text-2xs text-zinc-400 w-12 text-right">{fmtPct(b.pct)}</span>
                      <span className="text-sm font-semibold text-[var(--text-primary)] w-32 text-right">
                        <span className="text-[var(--text-subtle)] mr-1 text-2xs">R$</span>{numBRL2(b.valor)}
                      </span>
                    </span>
                  </div>
                  {/* Barra proporcional (largura = |pct|) */}
                  <div className="mt-1 h-1 w-full rounded-full bg-zinc-100 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.min(Math.abs(b.pct) * 100, 100)}%`, background: COR[b.setor] }}
                    />
                  </div>
                </li>
              )
            })}
          </ul>

          {/* Total + fechamento de conta */}
          <div className="mt-4 flex items-center justify-between border-t border-zinc-100 pt-3">
            <span className="flex items-center gap-1.5 text-2xs">
              {resultado.fecha ? (
                <><CheckCircle2 size={14} className="text-[var(--positive)]" /><span className="text-zinc-500">Fecha com o total da fatura</span></>
              ) : (
                <><AlertTriangle size={14} className="text-[var(--negative)]" /><span className="text-[var(--negative)]">A soma dos setores não fecha — verifique a planilha</span></>
              )}
            </span>
            <span className="text-sm font-bold text-[var(--text-primary)] tabular-nums">
              Total <span className="text-[var(--text-subtle)] mx-1 text-2xs">R$</span>{numBRL2(resultado.total)}
            </span>
          </div>

          {resultado.ignoradas > 0 && (
            <p className="mt-2 text-2xs text-zinc-400">
              {resultado.ignoradas} {resultado.ignoradas === 1 ? 'linha ignorada' : 'linhas ignoradas'} (sem Venda Nº ou Valor válido) — fora do rateio.
            </p>
          )}

          {/* Detalhe linha a linha (opcional) */}
          <button
            type="button"
            onClick={() => setVerLinhas(v => !v)}
            className="foco-neutro mt-3 inline-flex items-center gap-1 text-2xs font-medium text-zinc-500 hover:text-zinc-700"
          >
            {verLinhas ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            {verLinhas ? 'Ocultar' : 'Ver'} as {resultado.resolvidas.length} linhas
          </button>
          {verLinhas && (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[28rem] table-fixed text-2xs">
                <colgroup><col className="w-14" /><col className="w-28" /><col /><col className="w-32" /></colgroup>
                <thead>
                  <tr className="border-b border-zinc-100 text-left uppercase tracking-wide text-zinc-400">
                    <th className="py-1 px-1.5">Linha</th>
                    <th className="py-1 px-1.5">Venda Nº</th>
                    <th className="py-1 px-1.5">Setor</th>
                    <th className="py-1 px-1.5 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {resultado.resolvidas.map(r => (
                    <tr key={r.linha} className="border-b border-zinc-50">
                      <td className="py-1 px-1.5 text-zinc-400 tabular-nums">{r.linha}</td>
                      <td className="py-1 px-1.5 text-zinc-600 tabular-nums">{r.venda_numero ?? '—'}</td>
                      <td className="py-1 px-1.5">
                        <span className="inline-flex items-center gap-1.5 text-zinc-600">
                          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: COR[r.setor] }} />
                          {ROTULO[r.setor]}
                        </span>
                      </td>
                      <td className="py-1 px-1.5 text-right tabular-nums text-zinc-700">{numBRL2(r.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
