'use client'

import { useMemo, useState } from 'react'
import { ChevronsDownUp, ChevronsLeft, ChevronsRight, ChevronsUpDown, Tags } from 'lucide-react'
import EmptyState from '@/components/shared/empty-state'
import ErroCarregamento from '@/components/shared/erro-carregamento'
import { CARD_TABELA_TH } from '@/components/shared/card-tabela'
import ScrollAutoHide from '@/components/shared/scroll-auto-hide'
import { ValorContabil } from '@/components/shared/valor-contabil'
import Button from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import GatilhoAjuda from '@/components/ui/gatilho-ajuda'
import { pctDoTotal, type FatiaAno } from '@/lib/marketing/agregacao'
import { fmtPct } from '@/lib/marketing/formatar'
import { MESES_ABREV, rotuloAnos } from '@/lib/marketing/periodo'
import {
  alternarAnoAberto, colunasDoAno, podarAnosAbertos, tabelaCategoriasPorAno, type ColunaAno,
} from '@/lib/marketing/tabela-por-ano'
import type { LinhaMesCategoria } from '@/lib/marketing/tipos'
import CabecalhoCard from './cabecalho-card'

// Componente D — categoria × ANO, cada ano expansível nos meses dele.
//
// A estrutura completa (todos os meses de todos os anos, o total de cada ano, o acumulado e a
// "% do total") vem pronta de `tabelaCategoriasPorAno` (módulo puro, com teste de completude); aqui
// só se decide QUAIS colunas desenhar. Recolhido (estado inicial), um ano é uma coluna com o total
// dele no SEU recorte; expandido, mostra os meses do recorte (ano fechado jan–dez; ano corrente só
// até o mês atual) seguidos da coluna de total. Cada ano abre e fecha sozinho; "Expandir tudo" /
// "Recolher tudo" mexem em todos. O estado é local (não vai para a URL) e anos novos entram
// recolhidos. Colunas finais: "Acumulado" (Σ dos anos — o mesmo número do card "Total de despesas
// no período") e "% do total" (participação no acumulado; UM denominador para todas as linhas).
//
// Se algum ano selecionado não carregou, o card mostra o erro nomeando o ano — somar só os que
// chegaram daria uma tabela cujo total não bate com a DRE (fail-closed).
//
// Tabela densa com scroll interno (skill `tabela-densa`): `border-separate border-spacing-0`,
// fundo opaco NAS CÉLULAS, borda horizontal nas células (nunca no <tr>), cantos arredondados,
// `table-fixed` + <colgroup>. Cabeçalho de DUAS linhas: a de cima com o rótulo do ano (+ chevron),
// a de baixo com os meses; as células `rowSpan={2}` carregam a própria borda (`[&_th]:border-b` no
// <thead>, não seletor de "última linha"). Esta é a EXCEÇÃO de `min-w` prevista na skill: 12 meses
// por ano não cabem em tela estreita, então a tabela tem largura mínima e rola num
// `ScrollAutoHide eixo="x"` — a 1ª coluna (categoria) fica presa à esquerda. Cada grupo de ano abre
// com uma borda mais forte (`border-l-2`), como a DRE separa os grupos.
//
// Valor = `<ValorContabil>`, no sinal da DRE (sem `Math.abs`). Célula "—" = ausência (a categoria
// não teve lançamento naquele mês/ano), distinta de "R$ 0,00" (houve lançamento e somou zero).

const LARG_CATEGORIA = 224
const LARG_MES = 116
const LARG_TOTAL = 132
const LARG_PCT = 76

const TH = CARD_TABELA_TH
const TD = 'py-2 px-3 text-xs border-b border-zinc-50'
const TD_FOOT = 'px-3 py-2 text-xs font-semibold text-zinc-800'
/** Rótulo do cabeçalho de grupo — o mesmo vocabulário do grupo "Previsto" da DRE. */
const TH_GRUPO = 'whitespace-nowrap px-3 py-1.5 text-center text-xs font-semibold text-text-secondary'
/** Régua mais forte na 1ª coluna de cada grupo de ano (e do Acumulado). */
const SEP = 'border-l-2 border-l-wt-border-strong'
const GHOST_ICONE = 'inline-flex items-center gap-1.5'

/** Larguras das colunas de um ano — a ÚNICA fonte do <colgroup> e da largura mínima da tabela
 *  (as duas saem da mesma lista, então não divergem). */
function largurasDoAno(a: ColunaAno, aberto: boolean): number[] {
  return aberto ? [...a.meses.map(() => LARG_MES), LARG_TOTAL] : [LARG_TOTAL]
}

function Valor({ v }: { v: number | null }) {
  return v === null
    ? <span className="block text-right text-[var(--text-subtle)]">—</span>
    : <ValorContabil valor={v} />
}

interface Props {
  /** Rótulo do período ("2025 + 2026 (até out)") — só para a mensagem de tabela vazia. */
  periodo: string
  /** Os anos selecionados que carregaram, cada um no seu recorte. */
  fatias: readonly FatiaAno<LinhaMesCategoria>[]
  /** Anos selecionados cujo resumo falhou (vazio = a tabela é completa). */
  anosFalha: readonly number[]
}

export default function TabelaCategorias({ periodo, fatias, anosFalha }: Props) {
  const tabela = useMemo(() => tabelaCategoriasPorAno(fatias), [fatias])
  const [abertos, setAbertos] = useState<number[]>([])

  // Ao mudar a seleção de anos, o ano que saiu deixa de ser "aberto" (se voltar, entra recolhido);
  // os anos novos já nascem recolhidos por não estarem na lista.
  const anosSelecionados = tabela.anos.map(a => a.ano)
  const chaveAnos = anosSelecionados.join(',')
  const [chaveVista, setChaveVista] = useState(chaveAnos)
  if (chaveVista !== chaveAnos) {
    setChaveVista(chaveAnos)
    setAbertos(prev => podarAnosAbertos(prev, anosSelecionados))
  }

  if (anosFalha.length > 0) {
    return (
      <Card>
        <CabecalhoCard titulo="Por categoria" />
        <ErroCarregamento mensagem={`Não foi possível carregar o resumo por categoria de ${rotuloAnos(anosFalha)}.`} />
      </Card>
    )
  }
  if (tabela.qtd === 0) {
    return (
      <Card>
        <CabecalhoCard titulo="Por categoria" />
        <EmptyState icon={Tags} message={`Sem lançamentos pagos em ${periodo}.`} />
      </Card>
    )
  }

  const estaAberto = (ano: number) => abertos.includes(ano)
  const larguras = tabela.anos.flatMap(a => largurasDoAno(a, estaAberto(a.ano)))
  const larguraMin = LARG_CATEGORIA + larguras.reduce((s, w) => s + w, 0) + LARG_TOTAL + LARG_PCT

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-x-4">
        <CabecalhoCard titulo="Por categoria" />
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAbertos(anosSelecionados)}
            className={GHOST_ICONE}
            title="Abrir todos os anos por mês"
          >
            <ChevronsUpDown size={13} />
            Expandir tudo
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAbertos([])}
            className={GHOST_ICONE}
            title="Fechar todos os anos — só o total de cada ano à vista"
          >
            <ChevronsDownUp size={13} />
            Recolher tudo
          </Button>
        </div>
      </div>
      {/* Gutter externo `pb-1.5` + interno `pb-3.5`: o thumb horizontal flutua em overlay e não
          pode pousar em cima da linha de total. */}
      <div className="pb-1.5">
        <ScrollAutoHide eixo="x" className="pb-3.5">
          <table
            className="w-full table-fixed border-separate border-spacing-0"
            style={{ minWidth: larguraMin }}
          >
            <colgroup>
              <col style={{ width: LARG_CATEGORIA }} />
              {tabela.anos.flatMap(a =>
                largurasDoAno(a, estaAberto(a.ano)).map((w, i) => <col key={`${a.ano}-${i}`} style={{ width: w }} />),
              )}
              <col style={{ width: LARG_TOTAL }} />
              <col style={{ width: LARG_PCT }} />
            </colgroup>
            <thead className="[&_th]:border-b [&_th]:border-zinc-200 [&_th]:bg-zinc-50">
              <tr>
                <th rowSpan={2} className={`${TH} sticky left-0 z-20 rounded-tl-lg text-left align-bottom`}>Categoria</th>
                {tabela.anos.map(a => {
                  const aberto = estaAberto(a.ano)
                  const titulo = a.recorte ? `${a.ano}: ${a.recorte}` : undefined
                  return (
                    <th
                      key={a.ano}
                      colSpan={colunasDoAno(a, aberto)}
                      // Recolhido, o ano é UMA coluna: a célula ocupa as duas linhas do cabeçalho.
                      rowSpan={aberto ? 1 : 2}
                      title={titulo}
                      className={`${TH_GRUPO} ${SEP}`}
                    >
                      <span className="inline-flex items-center justify-center gap-1">
                        {a.rotulo}
                        <button
                          type="button"
                          onClick={() => setAbertos(prev => alternarAnoAberto(prev, a.ano))}
                          aria-expanded={aberto}
                          aria-label={aberto ? `Recolher ${a.ano}` : `Expandir ${a.ano} por mês`}
                          title={aberto ? `Recolher ${a.ano}` : `Expandir ${a.ano} por mês`}
                          className="foco-neutro inline-flex shrink-0 items-center justify-center rounded p-0.5 text-[var(--text-muted)] transition-colors hover:bg-zinc-100"
                        >
                          {aberto ? <ChevronsLeft size={13} /> : <ChevronsRight size={13} />}
                        </button>
                      </span>
                    </th>
                  )
                })}
                <th rowSpan={2} className={`${TH} ${SEP} text-right align-bottom`} title="Soma dos anos selecionados, cada um no seu recorte">
                  Acumulado
                </th>
                <th rowSpan={2} className={`${TH} rounded-tr-lg text-right align-bottom`}>
                  <span className="inline-flex items-center justify-end gap-1">
                    % do total
                    <GatilhoAjuda
                      rotulo="% do total"
                      texto="Participação da categoria no acumulado dos anos selecionados (um único denominador para todas as linhas). Despesa sobre despesa: a razão é positiva."
                      ancoraDireita
                    />
                  </span>
                </th>
              </tr>
              <tr>
                {tabela.anos.filter(a => estaAberto(a.ano)).flatMap(a => [
                  ...a.meses.map((m, i) => (
                    <th key={`${a.ano}-${m}`} className={`${TH} text-right ${i === 0 ? SEP : ''}`}>{MESES_ABREV[m - 1]}</th>
                  )),
                  <th key={`${a.ano}-total`} className={`${TH} text-right`}>Total</th>,
                ])}
              </tr>
            </thead>
            <tbody>
              {tabela.linhas.map(l => (
                <tr key={l.categoria}>
                  <td className={`${TD} sticky left-0 z-10 bg-white text-zinc-700`}>
                    <span className="block truncate" title={l.categoria}>{l.categoria}</span>
                  </td>
                  {tabela.anos.flatMap((a, i) => {
                    const c = l.anos[i]
                    if (!estaAberto(a.ano)) {
                      return [<td key={a.ano} className={`${TD} ${SEP} font-medium text-zinc-800`}><Valor v={c.total} /></td>]
                    }
                    return [
                      ...a.meses.map((m, j) => (
                        <td key={`${a.ano}-${m}`} className={`${TD} text-zinc-700 ${j === 0 ? SEP : ''}`}><Valor v={c.porMes[j]} /></td>
                      )),
                      <td key={`${a.ano}-total`} className={`${TD} font-medium text-zinc-800`}><Valor v={c.total} /></td>,
                    ]
                  })}
                  <td className={`${TD} ${SEP} font-medium text-zinc-800`}><ValorContabil valor={l.acumulado} /></td>
                  <td className={`${TD} text-right tabular-nums text-zinc-600`}>{fmtPct(l.pct)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="[&_td]:bg-zinc-50">
              <tr>
                <td className={`${TD_FOOT} sticky left-0 z-10 rounded-bl-lg`}>Total de marketing</td>
                {tabela.anos.flatMap(a => {
                  if (!estaAberto(a.ano)) {
                    return [<td key={a.ano} className={`${TD_FOOT} ${SEP}`}><Valor v={a.total} /></td>]
                  }
                  return [
                    ...a.meses.map((m, j) => (
                      <td key={`${a.ano}-${m}`} className={`${TD_FOOT} ${j === 0 ? SEP : ''}`}><Valor v={a.totalPorMes[j]} /></td>
                    )),
                    <td key={`${a.ano}-total`} className={TD_FOOT}><Valor v={a.total} /></td>,
                  ]
                })}
                <td className={`${TD_FOOT} ${SEP}`}><ValorContabil valor={tabela.acumulado} /></td>
                <td className={`${TD_FOOT} rounded-br-lg text-right tabular-nums`}>
                  {fmtPct(pctDoTotal(tabela.acumulado, tabela.acumulado))}
                </td>
              </tr>
            </tfoot>
          </table>
        </ScrollAutoHide>
      </div>
    </Card>
  )
}
