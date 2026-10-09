'use client'

import { useMemo, useRef, useState } from 'react'
import { ChevronsLeft, ChevronsRight, Tags } from 'lucide-react'
import EmptyState from '@/components/shared/empty-state'
import ErroCarregamento from '@/components/shared/erro-carregamento'
import ScrollAutoHide from '@/components/shared/scroll-auto-hide'
import { ValorContabil } from '@/components/shared/valor-contabil'
import { Card } from '@/components/ui/card'
import type { FatiaAno } from '@/lib/marketing/agregacao'
import { MESES_ABREV, rotuloAnos } from '@/lib/marketing/periodo'
import {
  alternarAnoAberto, podarAnosAbertos, tabelaCategoriasPorAno, type ColunaAno,
} from '@/lib/marketing/tabela-por-ano'
import type { LinhaMesCategoria } from '@/lib/marketing/tipos'
import CabecalhoCard from './cabecalho-card'
import { useScrollAoAlternar } from './use-scroll-ao-alternar'
import { useTotalPreso } from './use-total-preso'

// Componente D — categoria × ANO, cada ano expansível nos meses dele.
//
// A estrutura completa (todos os meses de todos os anos e o total de cada ano) vem pronta de
// `tabelaCategoriasPorAno` (módulo puro, com teste de completude); aqui só se decide QUAIS colunas
// desenhar. Recolhido (estado inicial), um ano é uma coluna com o total dele no SEU recorte;
// expandido, mostra os meses do recorte (ano fechado jan–dez; ano corrente só até o mês atual)
// seguidos da coluna de total. Cada ano abre e fecha sozinho pelo chevron ao lado do rótulo; o
// estado é local (não vai para a URL) e anos novos entram recolhidos.
//
// Se algum ano selecionado não carregou, o card mostra o erro nomeando o ano — somar só os que
// chegaram daria uma tabela cujo total não bate com a DRE (fail-closed).
//
// Tabela densa com scroll interno (skill `tabela-densa`): `border-separate border-spacing-0`,
// fundo opaco NAS CÉLULAS, borda horizontal nas células (nunca no <tr>), cantos arredondados,
// `table-fixed` + <colgroup>. LARGURA: a tabela ocupa o card (`w-full`), com `minWidth` = soma das
// colunas. A "Categoria" (224px — mais enxuta que os 330px da "Conta" da DRE: categorias de marketing
// têm nomes curtos) e os meses têm `<col>` com largura FIXA; a coluna "Total" de cada ano fica SEM
// largura declarada — no layout fixo, a sobra do card vai só para as colunas sem largura, então os
// totais dos anos a dividem por igual e a "Categoria" nunca estica (decisão do Yan, 09/10: com todos os
// anos recolhidos a tabela ficava curta no canto do card). Todo ano tem uma coluna de total, então
// sempre há quem absorva a sobra; na largura mínima, cada total fica com LARG_TOTAL. Esta é a EXCEÇÃO
// de `min-w` prevista na skill: 12 meses por ano não cabem em tela estreita, então a tabela rola num
// `ScrollAutoHide eixo="x"` — a 1ª coluna (categoria) fica presa à esquerda. Cada grupo de ano abre com
// uma borda mais forte (`border-l-2`), como a DRE separa os grupos.
//
// CABEÇALHO NO PADRÃO DA DRE, DE ALTURA FIXA (o bug do "pulo"): são SEMPRE duas linhas, com altura
// fixa em toda `<th>` (`h-[27px]` em cima, `h-[25px]` embaixo), esteja algum ano expandido ou não. Na
// de cima fica o rótulo do ano (à direita, com o chevron depois dele); na de baixo, o ano recolhido tem
// uma célula "Total" (sem `rowSpan`) e o expandido tem os meses + "Total". Assim expandir/recolher não
// muda a altura do cabeçalho nem empurra o corpo. Só a "Categoria" usa `rowSpan={2}` (existe sempre) —
// a régua de base é aplicada direto em TODA célula da linha de baixo e na "Categoria" (ver skill
// `tabela-densa`, cabeçalho de duas linhas; aqui sem seletor de "última linha").
//
// ANIMAÇÃO = a da DRE: rolagem suave ao expandir/recolher um ano (`use-scroll-ao-alternar`); a DRE não
// anima largura de coluna.
//
// COLUNA "TOTAL" DO ANO EXPANDIDO PRESA À DIREITA: enquanto a borda direita da área visível está
// dentro de um grupo de ano expandido, a coluna "Total" DAQUELE ano (rótulo+chevron e "Total" no
// cabeçalho, corpo e rodapé) fica presa nessa borda, por cima dos meses; ao chegar à posição natural
// ela solta. `sticky right` não serve (o sticky de célula é limitado pela tabela, não pelo grupo):
// `useTotalPreso` mede a rolagem e escreve `translateX` nas células marcadas `data-total-ano`, sem
// estado nem re-render por pixel (matemática pura em `lib/marketing/total-preso`). Por isso o
// cabeçalho de cima de um ano expandido são DUAS células — uma vazia sobre os meses e o rótulo sobre
// o "Total" —, para o rótulo acompanhar a coluna. A coluna de total tem fundo OPACO próprio (`--band`
// no rodapé, `--band-soft` no corpo; no cabeçalho, `--band` contínuo como na DRE): é o que a destaca
// dos meses e impede que eles vazem por baixo quando ela flutua. A coluna "Categoria" (sticky à
// esquerda) usa os MESMOS tons (pedido do Yan, 09/10 — coerência visual entre as colunas fixas/de
// referência e os meses).
//
// Valor = `<ValorContabil>`, no sinal da DRE (sem `Math.abs`). Célula "—" = ausência (a categoria
// não teve lançamento naquele mês/ano), distinta de "R$ 0,00" (houve lançamento e somou zero).

const LARG_CATEGORIA = 224
const LARG_MES = 116
const LARG_TOTAL = 132

// CABEÇALHO NO PADRÃO DA DRE (`tabela-dre.tsx`): rótulos em CAIXA ALTA, 10px, `font-semibold`,
// `tracking-[0.09em]`, `text-text-secondary`; fundo `--band` contínuo; alturas `h-[27px]` (linha do
// grupo) e `h-[25px]` (linha das colunas). A skill `tabela-densa` manda cabeçalho em caixa normal e
// sem negrito — a instrução do dono do produto (coerência com a DRE) prevalece nesta tabela.
/** Linha de BAIXO do cabeçalho (rótulos das colunas — meses e "Total"). A régua de base é aplicada
 *  direto em cada célula, não por seletor de "última linha" (a "Categoria" tem `rowSpan`). Padding
 *  horizontal igual ao do corpo (`px-3`) para o rótulo alinhar com os dígitos. */
const TH = 'h-[25px] whitespace-nowrap px-3 text-right text-[10px] font-semibold uppercase tracking-[0.09em] text-text-secondary border-b-[1.5px] border-b-wt-border-strong'
const TD = 'py-2 px-3 text-xs border-b border-zinc-50'
const TD_FOOT = 'px-3 py-2 text-xs font-semibold text-zinc-800'
/** Linha de CIMA do cabeçalho (rótulo do grupo/ano). Altura FIXA (`h-[27px]`, a faixa da linha de grupo
 *  da DRE), sem padding vertical para o chevron (17px) caber sem esticar a linha — vale também para a
 *  célula vazia sobre os meses, que de outro modo colapsaria e faria o cabeçalho crescer ao expandir.
 *  A régua fina (`border-b`) separa a linha de grupo da de colunas SÓ sobre os grupos (a "Categoria",
 *  com `rowSpan`, não a tem). Rótulo à direita, como os números da coluna. */
const TH_GRUPO = 'h-[27px] whitespace-nowrap px-3 text-right text-[10px] font-semibold uppercase tracking-[0.09em] text-text-secondary border-b border-b-wt-border'
/** Régua mais forte na 1ª coluna de cada grupo de ano (atravessa as duas linhas do cabeçalho). */
const SEP = 'border-l-2 border-l-wt-border-strong'
/** Fundo OPACO da coluna de total do ano no corpo (recolhida ou "Total" do expandido) e no rodapé:
 *  impede os meses de vazarem por baixo quando ela flutua. No cabeçalho o fundo é `--band` contínuo
 *  (como na DRE), então a coluna de total ali se distingue pela régua e pela sombra de quando prende.
 *  O rodapé precisa do `!`: `[&_td]:bg-zinc-50` do container é mais específico que a classe da célula. */
const BG_TOTAL_TD = 'bg-band-soft'
const BG_TOTAL_FOOT = '!bg-band'

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

  // Coluna de total presa à direita (ver bloco de comentário no topo). O hook fica ANTES dos early
  // returns; `chave` muda com a estrutura (tabela visível, nº de linhas, anos abertos) e remede.
  const tabelaRef = useRef<HTMLTableElement | null>(null)
  const mostrandoTabela = anosFalha.length === 0 && tabela.qtd > 0
  const chaveEstrutura = `${mostrandoTabela}|${tabela.linhas.length}|${tabela.anos
    .map(a => `${a.ano}:${abertos.includes(a.ano) ? a.meses.length : 0}`)
    .join(',')}`
  const aoRolar = useTotalPreso(tabelaRef, chaveEstrutura, LARG_CATEGORIA)
  // Rolagem suave ao expandir/recolher um ano — o "movimento" da DRE (ver o hook).
  useScrollAoAlternar(tabelaRef, abertos, LARG_CATEGORIA)

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
  const larguraMin = LARG_CATEGORIA + larguras.reduce((s, w) => s + w, 0)
  const ultimoAno = tabela.anos[tabela.anos.length - 1].ano

  return (
    <Card>
      <CabecalhoCard titulo="Por categoria" />
      {/* Gutter externo `pb-1.5` + interno `pb-3.5`: o thumb horizontal flutua em overlay e não
          pode pousar em cima da linha de total. */}
      <div className="pb-1.5">
        {/* `clip-path` arredonda os 4 cantos da ÁREA VISÍVEL da tabela (raio de `rounded-lg`, o mesmo
            das células de canto; o `0.875rem` de baixo é o `pb-3.5` do gutter, fora da tabela). Só o
            `rounded-*` nas células sticky de canto não basta com a tabela rolada: a "Categoria" fica
            parada e os meses que passam por baixo mostram seus cantos QUADRADOS nos recortes do raio —
            o lado esquerdo parecia reto. O recorte vale para o que estiver embaixo, e também dá canto
            redondo à coluna de total presa na borda direita. */}
        <ScrollAutoHide
          eixo="x"
          className="pb-3.5 [clip-path:inset(0_0_0.875rem_0_round_0.5rem)]"
          onScroll={aoRolar}
        >
          <table
            ref={tabelaRef}
            className="w-full table-fixed border-separate border-spacing-0"
            style={{ minWidth: larguraMin }}
          >
            <colgroup>
              <col style={{ width: LARG_CATEGORIA }} />
              {tabela.anos.flatMap(a =>
                largurasDoAno(a, estaAberto(a.ano)).map((w, i, todas) => (
                  // A última coluna do ano é o "Total": sem largura, ela recebe a sobra do card.
                  <col key={`${a.ano}-${i}`} style={i === todas.length - 1 ? undefined : { width: w }} />
                )),
              )}
            </colgroup>
            {/* Régua: a 1ª linha leva uma divisória leve; a última (e a "Categoria", que só existe na
                1ª por causa do rowSpan) a régua de base. `!border-zinc-200` na "Categoria" vence o
                seletor do thead, que é mais específico. */}
            <thead className="[&_th]:bg-band">
              <tr>
                {/* Como "Conta" na DRE: rowSpan 2, embaixo à esquerda, régua de base aplicada DIRETO na
                    célula (o seletor de "última linha" nunca a alcança). */}
                <th rowSpan={2} className="sticky left-0 z-20 rounded-tl-lg border-b-[1.5px] border-b-wt-border-strong pb-[7px] pl-3 pr-3 text-left align-bottom text-[10px] font-semibold uppercase tracking-[0.09em] text-text-secondary">Categoria</th>
                {tabela.anos.flatMap(a => {
                  const aberto = estaAberto(a.ano)
                  const titulo = a.recorte ? `${a.ano}: ${a.recorte}` : undefined
                  const rotuloAcao = aberto ? `Recolher ${a.ano}` : `Expandir ${a.ano} por mês`
                  const comMeses = aberto && a.meses.length > 0
                  const canto = a.ano === ultimoAno ? 'rounded-tr-lg' : ''
                  // Rótulo do ano + chevron: fica sobre a coluna de total (a única de um ano recolhido;
                  // a última de um expandido) — por isso, expandido, é uma célula PRÓPRIA, que acompanha
                  // o total quando ele prende; sobre os meses fica uma célula vazia.
                  const rotulo = (
                    <th
                      key={`${a.ano}-rotulo`}
                      title={titulo}
                      data-total-ano={aberto ? a.ano : undefined}
                      className={`${TH_GRUPO} ${comMeses ? '' : SEP} ${canto}`}
                    >
                      <span className="inline-flex items-center justify-end gap-1">
                        {a.rotulo}
                        <button
                          type="button"
                          onClick={() => setAbertos(prev => alternarAnoAberto(prev, a.ano))}
                          aria-expanded={aberto}
                          aria-label={rotuloAcao}
                          title={rotuloAcao}
                          className="foco-neutro inline-flex shrink-0 items-center justify-center rounded p-0.5 text-[var(--text-muted)] transition-colors hover:bg-zinc-100"
                        >
                          {aberto ? <ChevronsLeft size={13} /> : <ChevronsRight size={13} />}
                        </button>
                      </span>
                    </th>
                  )
                  return comMeses
                    ? [<th key={`${a.ano}-meses`} colSpan={a.meses.length} aria-hidden="true" className={`${TH_GRUPO} ${SEP}`} />, rotulo]
                    : [rotulo]
                })}
              </tr>
              <tr>
                {tabela.anos.flatMap(a => {
                  // Ano recolhido: UMA célula (sem rowSpan) com "Total" — como a DRE mostra "Total previsto"
                  // sob o `»`. `data-ano-recolhido` é o alvo da rolagem ao recolher (não entra no
                  // `useTotalPreso`, que só prende anos expandidos).
                  if (!estaAberto(a.ano)) {
                    return [<th key={a.ano} data-ano-recolhido={a.ano} className={`${TH} ${SEP}`}>Total</th>]
                  }
                  return [
                    ...a.meses.map((m, i) => (
                      <th
                        key={`${a.ano}-${m}`}
                        data-grupo-ano={i === 0 ? a.ano : undefined}
                        className={`${TH} ${i === 0 ? SEP : ''}`}
                      >{MESES_ABREV[m - 1]}</th>
                    )),
                    <th
                      key={`${a.ano}-total`}
                      data-total-ano={a.ano}
                      data-total-ref=""
                      className={`${TH} ${a.meses.length === 0 ? SEP : ''}`}
                    >Total</th>,
                  ]
                })}
              </tr>
            </thead>
            <tbody>
              {tabela.linhas.map(l => (
                <tr key={l.categoria}>
                  <td className={`${TD} sticky left-0 z-10 ${BG_TOTAL_TD} text-zinc-700`}>
                    <span className="block truncate" title={l.categoria}>{l.categoria}</span>
                  </td>
                  {tabela.anos.flatMap((a, i) => {
                    const c = l.anos[i]
                    if (!estaAberto(a.ano)) {
                      return [<td key={a.ano} className={`${TD} ${SEP} ${BG_TOTAL_TD} font-medium text-zinc-800`}><Valor v={c.total} /></td>]
                    }
                    return [
                      ...a.meses.map((m, j) => (
                        <td key={`${a.ano}-${m}`} className={`${TD} text-zinc-700 ${j === 0 ? SEP : ''}`}><Valor v={c.porMes[j]} /></td>
                      )),
                      <td
                        key={`${a.ano}-total`}
                        data-total-ano={a.ano}
                        className={`${TD} ${BG_TOTAL_TD} font-medium text-zinc-800 ${a.meses.length === 0 ? SEP : ''}`}
                      ><Valor v={c.total} /></td>,
                    ]
                  })}
                </tr>
              ))}
            </tbody>
            <tfoot className="[&_td]:bg-zinc-50">
              <tr>
                <td className={`${TD_FOOT} sticky left-0 z-10 ${BG_TOTAL_FOOT} rounded-bl-lg`}>Total de marketing</td>
                {tabela.anos.flatMap(a => {
                  // O último <td> da última coluna de ano fecha o canto inferior direito do card.
                  const cantoFinal = a.ano === ultimoAno ? 'rounded-br-lg' : ''
                  if (!estaAberto(a.ano)) {
                    return [<td key={a.ano} className={`${TD_FOOT} ${SEP} ${BG_TOTAL_FOOT} ${cantoFinal}`}><Valor v={a.total} /></td>]
                  }
                  return [
                    ...a.meses.map((m, j) => (
                      <td key={`${a.ano}-${m}`} className={`${TD_FOOT} ${j === 0 ? SEP : ''}`}><Valor v={a.totalPorMes[j]} /></td>
                    )),
                    <td
                      key={`${a.ano}-total`}
                      data-total-ano={a.ano}
                      className={`${TD_FOOT} ${BG_TOTAL_FOOT} ${a.meses.length === 0 ? SEP : ''} ${cantoFinal}`}
                    ><Valor v={a.total} /></td>,
                  ]
                })}
              </tr>
            </tfoot>
          </table>
        </ScrollAutoHide>
      </div>
    </Card>
  )
}
