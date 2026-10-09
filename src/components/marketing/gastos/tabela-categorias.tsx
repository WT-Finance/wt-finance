'use client'

import { useMemo } from 'react'
import { Tags } from 'lucide-react'
import EmptyState from '@/components/shared/empty-state'
import ErroCarregamento from '@/components/shared/erro-carregamento'
import { CARD_TABELA_TH } from '@/components/shared/card-tabela'
import ScrollAutoHide from '@/components/shared/scroll-auto-hide'
import { ValorContabil } from '@/components/shared/valor-contabil'
import { Card } from '@/components/ui/card'
import GatilhoAjuda from '@/components/ui/gatilho-ajuda'
import { pctDoTotal, tabelaPorCategoriaPeriodo, type FatiaAno } from '@/lib/marketing/agregacao'
import { fmtPct } from '@/lib/marketing/formatar'
import { MESES_ABREV, rotuloAnos } from '@/lib/marketing/periodo'
import type { LinhaMesCategoria } from '@/lib/marketing/tipos'
import CabecalhoCard from './cabecalho-card'

// Componente D — categoria × mês (jan–dez), com total e "% do total de marketing".
//
// Soma os anos selecionados: a célula de um mês é a soma desse mês em cada ano (cada ano no seu
// recorte), o total é o do período e a "% do total" é sobre o total do período. Se algum ano
// selecionado não carregou, o card mostra o erro nomeando o ano — somar só os que chegaram daria
// uma tabela cujo total não bate com a DRE.
//
// Tabela densa com scroll interno (skill `tabela-densa`): `border-separate border-spacing-0`,
// fundo opaco NAS CÉLULAS, borda horizontal nas células (nunca no <tr>), cantos do cabeçalho
// arredondados, `table-fixed` + <colgroup>. Esta é a EXCEÇÃO de `min-w` prevista na skill: até
// 12 colunas de mês + total + % não cabem em tela estreita, então a tabela tem largura mínima e
// rola num `ScrollAutoHide eixo="x"` — a 1ª coluna (categoria) fica presa à esquerda.
//
// Valor = `<ValorContabil>`, no sinal da DRE (sem `Math.abs`). Célula "—" = a categoria não teve
// lançamento naquele mês em nenhum dos anos (ausência — inclusive o mês que o ano corrente ainda
// não alcançou), distinta de "R$ 0,00" (houve lançamento e somou zero).
// "% do total": UM denominador (o total de marketing do período) para todas as linhas; razão de
// dois negativos é positiva e as linhas somam 100%.

const LARG_CATEGORIA = 224
const LARG_MES = 116
const LARG_TOTAL = 132
const LARG_PCT = 76

const TH = CARD_TABELA_TH
const TD = 'py-2 px-3 text-xs border-b border-zinc-50'

interface Props {
  /** Rótulo do período ("2025 + 2026 (até out)"). */
  periodo: string
  /** Os anos selecionados que carregaram, cada um no seu recorte. */
  fatias: readonly FatiaAno<LinhaMesCategoria>[]
  /** Anos selecionados cujo resumo falhou (vazio = a tabela é completa). */
  anosFalha: readonly number[]
}

export default function TabelaCategorias({ periodo, fatias, anosFalha }: Props) {
  const tabela = useMemo(() => tabelaPorCategoriaPeriodo(fatias), [fatias])
  const subtitulo = `${periodo} · % sobre o total de marketing do período`

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
        <CabecalhoCard titulo="Por categoria" subtitulo={subtitulo} />
        <EmptyState icon={Tags} message={`Sem lançamentos pagos em ${periodo}.`} />
      </Card>
    )
  }

  const larguraMin = LARG_CATEGORIA + LARG_MES * tabela.meses.length + LARG_TOTAL + LARG_PCT

  return (
    <Card>
      <CabecalhoCard titulo="Por categoria" subtitulo={subtitulo} />
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
              {tabela.meses.map(m => <col key={m} style={{ width: LARG_MES }} />)}
              <col style={{ width: LARG_TOTAL }} />
              <col style={{ width: LARG_PCT }} />
            </colgroup>
            <thead className="[&_th]:border-b [&_th]:border-zinc-200 [&_th]:bg-zinc-50">
              <tr>
                <th className={`${TH} sticky left-0 z-20 rounded-tl-lg text-left`}>Categoria</th>
                {tabela.meses.map(m => (
                  <th key={m} className={`${TH} text-right`}>{MESES_ABREV[m - 1]}</th>
                ))}
                <th className={`${TH} text-right`}>Total</th>
                <th className={`${TH} rounded-tr-lg text-right`}>
                  <span className="inline-flex items-center justify-end gap-1">
                    % do total
                    <GatilhoAjuda
                      rotulo="% do total"
                      texto="Participação da categoria no total de marketing do período (um único denominador para todas as linhas). Despesa sobre despesa: a razão é positiva."
                      ancoraDireita
                    />
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {tabela.linhas.map(l => (
                <tr key={l.categoria}>
                  <td className={`${TD} sticky left-0 z-10 bg-white text-zinc-700`}>
                    <span className="block truncate" title={l.categoria}>{l.categoria}</span>
                  </td>
                  {l.porMes.map((v, i) => (
                    <td key={tabela.meses[i]} className={`${TD} text-zinc-700`}>
                      {v === null ? <span className="block text-right text-[var(--text-subtle)]">—</span> : <ValorContabil valor={v} />}
                    </td>
                  ))}
                  <td className={`${TD} font-medium text-zinc-800`}><ValorContabil valor={l.total} /></td>
                  <td className={`${TD} text-right tabular-nums text-zinc-600`}>{fmtPct(l.pct)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="[&_td]:bg-zinc-50">
              <tr>
                <td className="sticky left-0 z-10 rounded-bl-lg px-3 py-2 text-xs font-semibold text-zinc-800">Total de marketing</td>
                {tabela.totalPorMes.map((v, i) => (
                  <td key={tabela.meses[i]} className="px-3 py-2 text-xs font-semibold text-zinc-800">
                    {v === null ? <span className="block text-right text-[var(--text-subtle)]">—</span> : <ValorContabil valor={v} />}
                  </td>
                ))}
                <td className="px-3 py-2 text-xs font-semibold text-zinc-800"><ValorContabil valor={tabela.total} /></td>
                <td className="rounded-br-lg px-3 py-2 text-right text-xs font-semibold tabular-nums text-zinc-800">
                  {fmtPct(pctDoTotal(tabela.total, tabela.total))}
                </td>
              </tr>
            </tfoot>
          </table>
        </ScrollAutoHide>
      </div>
    </Card>
  )
}
