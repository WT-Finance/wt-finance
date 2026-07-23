'use client'

import { useState } from 'react'
import UiTooltip from '@/components/ui/tooltip'
import type { RankingCaixa as RankingCaixaData, RankingItem } from '@/lib/fluxo/rpc-fluxo'
import { numBRL2, fmtAxisPct } from '@/lib/fmt'

// Maiores variações (v5.2.0, checkpoint — reformulado): UM card com divisória vertical,
// duas tabelas — "Pioraram o caixa" (título vermelho) | "Melhoraram o caixa" (verde) —
// comparando o acumulado do ano (YTD) com o mesmo período do ano anterior, por categoria.
// A NATUREZA é indicada pela COR do nome da categoria (vermelho = gasto, verde = receita;
// sem badge). Sem escala de prioridade nem fundo de linha. Colunas Var. (R$) e Var. (%)
// ORDENÁVEIS por clique (padrão Var. (R$): pior primeiro no card vermelho, melhor
// primeiro no verde). Explicação no botão "?" (sem subtítulos).
//
// Desenho ADAPTATIVO preservado: sem base comparável no ano anterior (histórico ausente),
// as colunas do ano-1 e Var. somem e o card explica no "?" — quando o histórico chegar,
// a comparação completa (e a ordenação) aparecem sozinhas.

interface Props {
  data: RankingCaixaData
}

type ColOrd = 'd' | 'pct'
type DirOrd = 'asc' | 'desc'

/** Ano corrente no fuso de São Paulo (mesmo idioma do hojeSP() do resto do Fluxo). */
function anoAtualSP(): number {
  return Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()).slice(0, 4))
}

export default function RankingCaixa({ data }: Props) {
  const anoAtual    = anoAtualSP()
  const anoAnterior = anoAtual - 1

  if (data.pioraram.length === 0 && data.melhoraram.length === 0) {
    return (
      <div className="rounded-xl shadow-sm bg-white p-5">
        <h3 className="text-base font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Maiores variações</h3>
        <p className="text-sm text-zinc-400">Sem movimentações realizadas para ranquear no ano.</p>
      </div>
    )
  }

  const temBase = [...data.pioraram, ...data.melhoraram].some(i => i.t25 !== 0)

  return (
    <div className="rounded-xl shadow-sm bg-white p-5">
      <div className="flex items-center gap-1.5 mb-4">
        <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Maiores variações</h3>
        <UiTooltip
          conteudo={temBase
            ? `Acumulado do ano por categoria vs o mesmo período de ${anoAnterior}. Var. = ${anoAtual} − ${anoAnterior}; nome verde = receita, vermelho = gasto; negativo entre parênteses. Clique em Var. (R$) ou Var. (%) para ordenar.`
            : `Acumulado de ${anoAtual} por categoria. A comparação com ${anoAnterior} (e a ordenação por variação) aparece quando o histórico do ano anterior estiver carregado.`}
          className="z-30 w-72 !whitespace-normal font-normal leading-snug"
        >
          <span aria-label="Como as maiores variações são calculadas" className="inline-flex h-3 w-3 items-center justify-center rounded-full border border-zinc-300 text-[8px] font-semibold leading-none text-zinc-400">?</span>
        </UiTooltip>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 md:divide-x md:divide-zinc-100 gap-y-6 md:gap-y-0">
        <div className="md:pr-6">
          <TabelaVariacao
            titulo="Pioraram o caixa"
            corTitulo="var(--danger)"
            itens={data.pioraram}
            temBase={temBase}
            anoAtual={anoAtual}
            anoAnterior={anoAnterior}
            dirPadrao="asc"
          />
        </div>
        <div className="md:pl-6">
          <TabelaVariacao
            titulo="Melhoraram o caixa"
            corTitulo="var(--success)"
            itens={data.melhoraram}
            temBase={temBase}
            anoAtual={anoAtual}
            anoAnterior={anoAnterior}
            dirPadrao="desc"
          />
        </div>
      </div>
    </div>
  )
}

function TabelaVariacao({ titulo, corTitulo, itens, temBase, anoAtual, anoAnterior, dirPadrao }: {
  titulo:      string
  corTitulo:   string
  itens:       RankingItem[]
  temBase:     boolean
  anoAtual:    number
  anoAnterior: number
  /** Direção padrão da ordenação (pioraram: asc = pior primeiro; melhoraram: desc). */
  dirPadrao:   DirOrd
}) {
  const [col, setCol] = useState<ColOrd>('d')
  const [dir, setDir] = useState<DirOrd>(dirPadrao)

  const ordenar = (c: ColOrd) => {
    if (c === col) setDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setCol(c); setDir(dirPadrao) }
  }

  // pct null (sem base comparável na linha) vai sempre para o FIM, em qualquer direção.
  const ordenados = temBase
    ? [...itens].sort((a, b) => {
        const va = col === 'd' ? a.d : a.pct
        const vb = col === 'd' ? b.d : b.pct
        if (va === null && vb === null) return 0
        if (va === null) return 1
        if (vb === null) return -1
        return dir === 'asc' ? va - vb : vb - va
      })
    : itens

  return (
    <div>
      <h4 className="text-sm font-semibold mb-2" style={{ color: corTitulo }}>{titulo}</h4>
      {itens.length === 0 ? (
        <p className="text-xs text-zinc-400 py-2">Sem categorias nesta lista.</p>
      ) : (
        <table className="w-full table-fixed">
          <thead>
            <tr className="text-2xs font-medium text-zinc-400">
              <th className="text-left pb-1.5 font-medium">Categoria</th>
              {temBase && <th className="w-[96px] text-right pb-1.5 pl-2 font-medium whitespace-nowrap">{anoAnterior}</th>}
              <th className={`${temBase ? 'w-[96px]' : 'w-[128px]'} text-right pb-1.5 pl-2 font-medium whitespace-nowrap`}>{anoAtual}</th>
              {temBase && <ThOrdenavel rotulo="Var. (R$)" ativo={col === 'd'} dir={dir} onClick={() => ordenar('d')} largura="w-[104px]" />}
              {temBase && <ThOrdenavel rotulo="Var. (%)" ativo={col === 'pct'} dir={dir} onClick={() => ordenar('pct')} largura="w-[76px]" />}
            </tr>
          </thead>
          <tbody>
            {ordenados.map(it => (
              <tr key={it.c} className="[&:last-child>td]:border-0">
                <td className="py-2 align-middle border-b border-zinc-50 pr-2 min-w-0">
                  {/* natureza pela COR do nome: vermelho = gasto, verde = receita */}
                  <span
                    className="block truncate text-2xs font-medium"
                    style={{ color: it.nat === 'desp' ? 'var(--danger)' : 'var(--success)' }}
                    title={it.c}
                  >
                    {it.c || '(sem categoria)'}
                  </span>
                </td>
                {temBase && (
                  <td className="py-2 align-middle border-b border-zinc-50 pl-2 text-right whitespace-nowrap">
                    <ValorParen v={it.t25} />
                  </td>
                )}
                <td className="py-2 align-middle border-b border-zinc-50 pl-2 text-right whitespace-nowrap">
                  <ValorParen v={it.t26} />
                </td>
                {temBase && (
                  <td className="py-2 align-middle border-b border-zinc-50 pl-2 text-right whitespace-nowrap">
                    <ValorParen v={it.d} cor={it.d >= 0 ? 'var(--success)' : 'var(--danger)'} />
                  </td>
                )}
                {temBase && (
                  <td className="py-2 align-middle border-b border-zinc-50 pl-2 text-right whitespace-nowrap">
                    {it.pct === null ? (
                      <span className="text-2xs text-zinc-300">—</span>
                    ) : (
                      <span className="text-2xs font-medium tabular-nums" style={{ color: it.pct >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                        {it.pct >= 0 ? '+' : ''}{fmtAxisPct(it.pct, 1)}
                      </span>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

/** Cabeçalho ORDENÁVEL — clique alterna a direção; a seta indica a coluna ativa. */
function ThOrdenavel({ rotulo, ativo, dir, onClick, largura }: {
  rotulo:  string
  ativo:   boolean
  dir:     DirOrd
  onClick: () => void
  largura: string
}) {
  return (
    <th className={`${largura} text-right pb-1.5 pl-2 font-medium whitespace-nowrap`}>
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-0.5 hover:text-zinc-600 transition-colors ${ativo ? 'text-zinc-600' : ''}`}
        aria-label={`Ordenar por ${rotulo}`}
      >
        {rotulo}
        <span className="text-[8px] leading-none" aria-hidden>{ativo ? (dir === 'asc' ? '▲' : '▼') : '↕'}</span>
      </button>
    </th>
  )
}

/**
 * Formato contábil (modelo da controladoria): negativo entre parênteses e em cor de
 * alerta; positivo herda a cor do texto. `cor` força a cor (Var. segue o sinal).
 */
function ValorParen({ v, cor }: { v: number; cor?: string }) {
  const neg   = v < 0
  const style = cor ? { color: cor } : (neg ? { color: 'var(--danger)' } : undefined)
  return (
    <span className="text-2xs font-medium tabular-nums" style={style}>
      {neg ? `(${numBRL2(Math.abs(v))})` : numBRL2(v)}
    </span>
  )
}
