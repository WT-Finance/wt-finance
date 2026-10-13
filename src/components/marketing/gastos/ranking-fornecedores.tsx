'use client'

import { useMemo, useState } from 'react'
import { Users } from 'lucide-react'
import EmptyState from '@/components/shared/empty-state'
import ErroCarregamento from '@/components/shared/erro-carregamento'
import ScrollAutoHide from '@/components/shared/scroll-auto-hide'
import { Card } from '@/components/ui/card'
import type { FatiaAno } from '@/lib/marketing/agregacao'
import { fmtPct } from '@/lib/marketing/formatar'
import { rotuloAnos } from '@/lib/marketing/periodo'
import { tabelaFornecedoresPorAno } from '@/lib/marketing/tabela-fornecedores-por-ano'
import type { LinhaMesFornecedor } from '@/lib/marketing/tipos'
import CabecalhoCard from './cabecalho-card'
import Valor from './celula-valor'
import {
  BG_TOTAL_FOOT, BG_TOTAL_TD, LARG_PCT, LARG_PRIMEIRA, LARG_TOTAL, SEP, SEP_CATEGORIA, TD, TD_FOOT, TH, TH_GRUPO,
} from './tabela-estilos'

// Componente E — "Por fornecedor": um BLOCO por ano selecionado, cada um com "Valor" (a despesa do
// fornecedor no ano, no recorte DO ANO, no sinal da DRE) e "%" (participação dele no total de
// marketing daquele ano; denominador = total do ano). Linhas ordenadas pela soma dos anos (a maior
// despesa primeiro), "(sem fornecedor)" incluído sob a mesma regra; rodapé "Total" com o
// total de cada ano e 100,0%. Célula "—" = o fornecedor não teve lançamento naquele ano (≠ R$ 0,00).
// É só leitura: a linha NÃO é clicável e não há estado de seleção.
//
// A estrutura completa (fornecedores × anos, totais, %) vem pronta de `tabelaFornecedoresPorAno`
// (módulo puro, com teste de completude contra a "Por categoria"); aqui só se desenha.
//
// Falha isolada: se a leitura do ranking cai em algum ano selecionado, este card é OMITIDO com um
// aviso discreto (`ErroCarregamento`, sem alarme) — somar só os anos que chegaram daria uma tabela
// cujo total não fecha — e o resto da página segue de pé (invariante 14).
//
// VISUAL = o da "Por categoria" (`tabela-categorias.tsx`), com as constantes em `tabela-estilos.ts`:
// cabeçalho no padrão da DRE (duas linhas, `--band` contínuo, caixa alta 10px), "Fornecedor" embaixo à
// esquerda (`rowSpan=2`), rótulo do ano em cima à direita do bloco, 1ª coluna presa à esquerda com
// largura FIXA e tom `--band-soft`, régua bege na borda direita dela e à esquerda de cada bloco de ano
// a partir do 2º, `<ValorContabil>`, "—" na ausência, cantos arredondados (inclusive `clip-path`).
//
// DIFERENÇA para a "Por categoria" — são ~100 fornecedores, então a tabela ROLA TAMBÉM NA VERTICAL
// (skill `tabela-densa`, receita de tabela longa): `ScrollAutoHide eixo="both"`, `border-separate`,
// `<thead>` sticky com o fundo nas células, régua de base aplicada DIRETO nas células (a "Fornecedor"
// tem `rowSpan`; seletor de "última linha" não a alcança) e sombra sob o cabeçalho só quando rolado.
// O total fica num `<tfoot>` sticky `bottom-0` (sempre visível) e o viewport NÃO tem padding inferior.
// ATENÇÃO (bug da fresta): o `sticky` mede o offset a partir da borda do CONTEÚDO do viewport (a caixa
// de padding contraída pelo próprio padding): com `pb-3.5` no viewport, `bottom-0` já pousava 14px acima
// da borda e o `bottom-3.5` antigo somava +14px — o total ficava a ~28px da base, e na fresta de 14px
// abaixo dele (acima dos 14px finais que o `clip-path` recortava) as linhas do corpo rolavam à vista,
// por baixo do total. Sem padding inferior não há zona por onde o corpo role abaixo do total: ele é a última
// coisa visível, em qualquer posição de rolagem, e no fim da rolagem coincide com a posição natural (sem
// salto). O thumb horizontal do `ScrollAutoHide` é overlay (`absolute bottom-1` contra a raiz do
// componente, que termina onde o viewport termina) e por isso pousa sobre a linha de total quando
// aparece — aceito (some sozinho; o espaço abaixo da tabela vem do wrapper externo, `pb-5`).
//
// LARGURA: igual à da "Categoria" (224px — os dois cards alinham); a "Fornecedor" nunca estica. A coluna
// "%" tem largura fixa (`LARG_PCT`) e a "Valor" fica SEM largura declarada: a sobra do card vai para as
// colunas de valor, por igual. `minWidth` = soma das declaradas; abaixo disso a tabela rola na
// horizontal com a 1ª coluna presa.

/** Sombra sob o cabeçalho quando rolado (a mesma da DRE). */
const SOMBRA_ROLADO = 'shadow-[0_4px_6px_-4px_rgba(45,42,38,0.12)]'

interface Props {
  /** Rótulo do período ("2025 + 2026 (até out)"). */
  periodo: string
  /** Os anos selecionados cujo ranking carregou, cada um no seu recorte. */
  fatias: readonly FatiaAno<LinhaMesFornecedor>[]
  /** Anos selecionados cuja leitura do ranking falhou. */
  anosFalha: readonly number[]
}

export default function RankingFornecedores({ periodo, fatias, anosFalha }: Props) {
  const tabela = useMemo(() => tabelaFornecedoresPorAno(fatias), [fatias])
  const [rolado, setRolado] = useState(false)

  if (anosFalha.length > 0) {
    return (
      <ErroCarregamento
        className="px-1"
        mensagem={`Ranking por fornecedor indisponível para ${rotuloAnos(anosFalha)} — o restante da página segue normal.`}
      />
    )
  }

  if (tabela.qtd === 0) {
    return (
      <Card>
        <CabecalhoCard titulo="Por fornecedor" />
        <EmptyState icon={Users} message={`Sem lançamentos pagos em ${periodo}.`} />
      </Card>
    )
  }

  const larguraMin = LARG_PRIMEIRA + tabela.anos.length * (LARG_TOTAL + LARG_PCT)
  const ultimo = tabela.anos.length - 1
  /** Régua de início de bloco — o 1º ano não leva (a borda da "Fornecedor" já faz esse papel). */
  const sep = (i: number) => (i === 0 ? '' : SEP)
  const sombra = rolado ? SOMBRA_ROLADO : ''

  return (
    <Card>
      <CabecalhoCard titulo="Por fornecedor" />
      {/* Gutters: interno SÓ à direita (`pr-3.5`, o thumb vertical flutua em overlay, fora da tabela); o
          externo `-mr-3.5` devolve ao card esses 14px, então a borda da tabela fica alinhada à da tabela
          de cima, e o thumb vertical pousa no padding do card. Embaixo NÃO há gutter dentro do viewport
          (ver a nota sobre o `<tfoot>` no topo): o respiro abaixo da tabela, igual ao da "Por categoria"
          (`pb-1.5` + `pb-3.5`), vem do wrapper externo — `pb-5`. */}
      <div className="-mr-3.5 pb-5">
        {/* `clip-path` arredonda os 4 cantos da ÁREA VISÍVEL da tabela (raio de `rounded-lg`; os
            `0.875rem` da direita são o gutter, fora da tabela; embaixo o recorte é rente à tabela) — com a
            tabela rolada, o que passa por baixo da coluna presa mostraria cantos QUADRADOS (ver a "Por
            categoria"). */}
        <ScrollAutoHide
          eixo="both"
          className="max-h-[440px] pr-3.5 [clip-path:inset(0_0.875rem_0_0_round_0.5rem)]"
          onScroll={e => setRolado(e.currentTarget.scrollTop > 0)}
        >
          <table
            className="w-full table-fixed border-separate border-spacing-0"
            style={{ minWidth: larguraMin }}
          >
            <colgroup>
              <col style={{ width: LARG_PRIMEIRA }} />
              {tabela.anos.flatMap(a => [
                // "Valor" sem largura: recebe a sobra do card (como o "Total" da "Por categoria").
                <col key={`${a.ano}-valor`} />,
                <col key={`${a.ano}-pct`} style={{ width: LARG_PCT }} />,
              ])}
            </colgroup>
            <thead className="sticky top-0 z-20 [&_th]:bg-band">
              <tr>
                {/* Como "Conta" na DRE: rowSpan 2, embaixo à esquerda, régua de base DIRETO na célula. */}
                <th
                  rowSpan={2}
                  className={`sticky left-0 z-30 rounded-tl-lg ${SEP_CATEGORIA} border-b-[1.5px] border-b-wt-border-strong pb-[7px] pl-3 pr-3 text-left align-bottom text-[10px] font-semibold uppercase tracking-[0.09em] text-text-secondary ${sombra}`}
                >
                  Fornecedor
                </th>
                {tabela.anos.map((a, i) => (
                  <th
                    key={a.ano}
                    colSpan={2}
                    title={a.recorte ? `${a.ano}: ${a.recorte}` : undefined}
                    className={`${TH_GRUPO} ${sep(i)} ${i === ultimo ? 'rounded-tr-lg' : ''}`}
                  >
                    {a.rotulo}
                  </th>
                ))}
              </tr>
              <tr>
                {tabela.anos.flatMap((a, i) => [
                  <th key={`${a.ano}-valor`} className={`${TH} ${sep(i)} ${sombra}`}>Valor</th>,
                  <th key={`${a.ano}-pct`} className={`${TH} ${sombra}`}>%</th>,
                ])}
              </tr>
            </thead>
            <tbody>
              {tabela.linhas.map(l => (
                <tr key={l.chave === '' ? '__sem__' : l.chave}>
                  <td className={`${TD} sticky left-0 z-10 ${SEP_CATEGORIA} ${BG_TOTAL_TD} ${l.chave === '' ? 'italic text-[var(--text-muted)]' : 'text-zinc-700'}`}>
                    <span className="block truncate" title={l.rotulo}>{l.rotulo}</span>
                  </td>
                  {l.anos.flatMap((c, i) => [
                    <td key={`${tabela.anos[i].ano}-valor`} className={`${TD} ${sep(i)} text-zinc-800`}>
                      <Valor v={c.valor} />
                    </td>,
                    <td key={`${tabela.anos[i].ano}-pct`} className={`${TD} text-right tabular-nums text-zinc-700`}>
                      {fmtPct(c.pct)}
                    </td>,
                  ])}
                </tr>
              ))}
            </tbody>
            <tfoot className="sticky bottom-0 z-20 [&_td]:bg-band">
              <tr>
                <td className={`${TD_FOOT} sticky left-0 z-10 ${SEP_CATEGORIA} ${BG_TOTAL_FOOT} rounded-bl-lg`}>Total</td>
                {tabela.anos.flatMap((a, i) => [
                  <td key={`${a.ano}-valor`} className={`${TD_FOOT} ${sep(i)}`}>
                    <Valor v={a.total} />
                  </td>,
                  // O último <td> da última coluna fecha o canto inferior direito do card.
                  <td key={`${a.ano}-pct`} className={`${TD_FOOT} text-right tabular-nums ${i === ultimo ? 'rounded-br-lg' : ''}`}>
                    {fmtPct(a.pctTotal)}
                  </td>,
                ])}
              </tr>
            </tfoot>
          </table>
        </ScrollAutoHide>
      </div>
    </Card>
  )
}
