'use client'

import { useMemo, useRef, useState } from 'react'
import { ChevronsLeft, ChevronsRight, Tags } from 'lucide-react'
import EmptyState from '@/components/shared/empty-state'
import ErroCarregamento from '@/components/shared/erro-carregamento'
import ScrollAutoHide from '@/components/shared/scroll-auto-hide'
import { Card } from '@/components/ui/card'
import type { FatiaAno } from '@/lib/marketing/agregacao'
import { fmtPct } from '@/lib/marketing/formatar'
import { MESES_ABREV, rotuloAnos } from '@/lib/marketing/periodo'
import {
  alternarAnoAberto, podarAnosAbertos, tabelaCategoriasPorAno, type ColunaAno,
} from '@/lib/marketing/tabela-por-ano'
import type { LinhaMesCategoria } from '@/lib/marketing/tipos'
import CabecalhoCard from './cabecalho-card'
import Valor from './celula-valor'
import {
  BG_TOTAL_FOOT, BG_TOTAL_TD, LARG_PCT, LARG_PRIMEIRA, LARG_TOTAL, SEP, SEP_CATEGORIA, TD, TD_FOOT, TH, TH_GRUPO,
} from './tabela-estilos'
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
// sempre há quem absorva a sobra; na largura mínima, cada total fica com LARG_TOTAL (e a "%" ao lado,
// com LARG_PCT fixa, que nunca estica). Esta é a EXCEÇÃO
// de `min-w` prevista na skill: 12 meses por ano não cabem em tela estreita, então a tabela rola num
// `ScrollAutoHide eixo="x"` — a 1ª coluna (categoria) fica presa à esquerda. Cada grupo de ano abre com
// uma borda mais forte (`border-l-2`), como a DRE separa os grupos.
//
// CABEÇALHO NO PADRÃO DA DRE, DE ALTURA FIXA (o bug do "pulo"): são SEMPRE duas linhas, com altura
// fixa em toda `<th>` (`h-[27px]` em cima, `h-[25px]` embaixo), esteja algum ano expandido ou não. Na
// de cima fica o rótulo do ano (à direita do bloco Total + %, com o chevron depois dele); na de baixo, o
// ano recolhido tem "Total" + "%" (sem `rowSpan`) e o expandido tem os meses + "Total" + "%". Assim expandir/recolher não
// muda a altura do cabeçalho nem empurra o corpo. Só a "Categoria" usa `rowSpan={2}` (existe sempre) —
// a régua de base é aplicada direto em TODA célula da linha de baixo e na "Categoria" (ver skill
// `tabela-densa`, cabeçalho de duas linhas; aqui sem seletor de "última linha").
//
// ANIMAÇÃO = a da DRE: rolagem suave ao expandir/recolher um ano (`use-scroll-ao-alternar`); a DRE não
// anima largura de coluna.
//
// ANÁLISE VERTICAL ("%"): todo ano termina num BLOCO de duas colunas — "Total" + "%" (a participação da
// categoria no total DAQUELE ano; denominador = total do ano; rodapé 100,0%; "—" = ausente ou total do
// ano zero). A "%" tem largura fixa (`LARG_PCT`); a sobra do card continua indo para o "Total".
//
// BLOCO "TOTAL + %" DO ANO EXPANDIDO PRESO À DIREITA: enquanto a borda direita da área visível está
// dentro de um grupo de ano expandido, o BLOCO daquele ano (rótulo+chevron, "Total" e "%" no
// cabeçalho, corpo e rodapé) fica preso nessa borda, por cima dos meses, as duas colunas como uma
// unidade; ao chegar à posição natural ele solta. `sticky right` não serve (o sticky de célula é
// limitado pela tabela, não pelo grupo): `useTotalPreso` mede a rolagem e escreve `translateX` nas
// células marcadas `data-total-ano` (as da "%" também levam `data-total-pct`: só elas NÃO recebem a
// sombra à esquerda, que é do bloco), sem estado nem re-render por pixel (matemática pura em
// `lib/marketing/total-preso`, que recebe a largura do BLOCO). Por isso o cabeçalho de cima de um
// ano expandido são DUAS células — uma vazia sobre os meses e o rótulo (colSpan 2) sobre o bloco —,
// para o rótulo acompanhar as colunas. O bloco tem fundo OPACO próprio (`--band`
// no rodapé, `--band-soft` no corpo; no cabeçalho, `--band` contínuo como na DRE): é o que a destaca
// dos meses e impede que eles vazem por baixo quando ela flutua. A coluna "Categoria" (sticky à
// esquerda) usa os MESMOS tons (pedido do Yan, 09/10 — coerência visual entre as colunas fixas/de
// referência e os meses).
//
// Valor = `<ValorContabil>`, no sinal da DRE (sem `Math.abs`). Célula "—" = ausência (a categoria
// não teve lançamento naquele mês/ano), distinta de "R$ 0,00" (houve lançamento e somou zero).

// As constantes de estilo (cabeçalho no padrão da DRE, réguas, tons) vivem em `tabela-estilos.ts`,
// compartilhadas com a tabela "Por fornecedor"; `CelulaValor` (o "—" de ausência) idem.
const LARG_CATEGORIA = LARG_PRIMEIRA
const LARG_MES = 116

/** Larguras das colunas de um ano — a ÚNICA fonte do <colgroup> e da largura mínima da tabela
 *  (as duas saem da mesma lista, então não divergem). O ano termina SEMPRE no bloco "Total" + "%":
 *  a penúltima coluna (o "Total") recebe a sobra do card; a última (a "%") tem largura fixa. */
function largurasDoAno(a: ColunaAno, aberto: boolean): number[] {
  return aberto ? [...a.meses.map(() => LARG_MES), LARG_TOTAL, LARG_PCT] : [LARG_TOTAL, LARG_PCT]
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
  const primeiroAno = tabela.anos[0].ano
  /** Régua de início de grupo — o 1º ano não leva (a borda da "Categoria" já faz esse papel). */
  const sep = (ano: number) => (ano === primeiroAno ? '' : SEP)

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
                  // A penúltima coluna do ano é o "Total": sem largura, ela recebe a sobra do card (a
                  // última é a "%", de largura fixa).
                  <col key={`${a.ano}-${i}`} style={i === todas.length - 2 ? undefined : { width: w }} />
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
                <th rowSpan={2} className={`sticky left-0 z-20 rounded-tl-lg ${SEP_CATEGORIA} border-b-[1.5px] border-b-wt-border-strong pb-[7px] pl-3 pr-3 text-left align-bottom text-[10px] font-semibold uppercase tracking-[0.09em] text-text-secondary`}>Categoria</th>
                {tabela.anos.flatMap(a => {
                  const aberto = estaAberto(a.ano)
                  const titulo = a.recorte ? `${a.ano}: ${a.recorte}` : undefined
                  const rotuloAcao = aberto ? `Recolher ${a.ano}` : `Expandir ${a.ano} por mês`
                  const comMeses = aberto && a.meses.length > 0
                  const canto = a.ano === ultimoAno ? 'rounded-tr-lg' : ''
                  // Rótulo do ano + chevron: fica sobre o BLOCO "Total" + "%" (colSpan 2, alinhado à direita
                  // dele) — por isso, expandido, é uma célula PRÓPRIA, que acompanha o bloco quando ele
                  // prende; sobre os meses fica uma célula vazia.
                  const rotulo = (
                    <th
                      key={`${a.ano}-rotulo`}
                      colSpan={2}
                      title={titulo}
                      data-total-ano={aberto ? a.ano : undefined}
                      className={`${TH_GRUPO} ${comMeses ? '' : sep(a.ano)} ${canto}`}
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
                    ? [<th key={`${a.ano}-meses`} colSpan={a.meses.length} aria-hidden="true" className={`${TH_GRUPO} ${sep(a.ano)}`} />, rotulo]
                    : [rotulo]
                })}
              </tr>
              <tr>
                {tabela.anos.flatMap(a => {
                  // Ano recolhido: UMA célula (sem rowSpan) com "Total" — como a DRE mostra "Total previsto"
                  // sob o `»`. `data-ano-recolhido` é o alvo da rolagem ao recolher (não entra no
                  // `useTotalPreso`, que só prende anos expandidos).
                  if (!estaAberto(a.ano)) {
                    return [
                      <th key={a.ano} data-ano-recolhido={a.ano} className={`${TH} ${sep(a.ano)}`}>Total</th>,
                      <th key={`${a.ano}-pct`} data-ano-recolhido-fim={a.ano} className={TH}>%</th>,
                    ]
                  }
                  return [
                    ...a.meses.map((m, i) => (
                      <th
                        key={`${a.ano}-${m}`}
                        data-grupo-ano={i === 0 ? a.ano : undefined}
                        className={`${TH} ${i === 0 ? sep(a.ano) : ''}`}
                      >{MESES_ABREV[m - 1]}</th>
                    )),
                    <th
                      key={`${a.ano}-total`}
                      data-total-ano={a.ano}
                      data-total-ref=""
                      className={`${TH} ${a.meses.length === 0 ? sep(a.ano) : ''}`}
                    >Total</th>,
                    // `data-total-pct`: acompanha o bloco (transform) mas NÃO leva a sombra à esquerda.
                    <th key={`${a.ano}-pct`} data-total-ano={a.ano} data-total-pct="" className={TH}>%</th>,
                  ]
                })}
              </tr>
            </thead>
            <tbody>
              {tabela.linhas.map(l => (
                <tr key={l.categoria}>
                  <td className={`${TD} sticky left-0 z-10 ${SEP_CATEGORIA} ${BG_TOTAL_TD} text-zinc-700`}>
                    <span className="block truncate" title={l.categoria}>{l.categoria}</span>
                  </td>
                  {tabela.anos.flatMap((a, i) => {
                    const c = l.anos[i]
                    // "%" = participação da categoria no total do ano ("—" = ausente ou total do ano zero);
                    // mesmo fundo da coluna de total, formato igual ao "%" da "Por fornecedor".
                    const classePct = `${TD} ${BG_TOTAL_TD} text-right tabular-nums text-zinc-700`
                    if (!estaAberto(a.ano)) {
                      return [
                        <td key={a.ano} className={`${TD} ${sep(a.ano)} ${BG_TOTAL_TD} font-medium text-zinc-800`}><Valor v={c.total} /></td>,
                        <td key={`${a.ano}-pct`} className={classePct}>{fmtPct(c.pct)}</td>,
                      ]
                    }
                    return [
                      ...a.meses.map((m, j) => (
                        <td key={`${a.ano}-${m}`} className={`${TD} text-zinc-700 ${j === 0 ? sep(a.ano) : ''}`}><Valor v={c.porMes[j]} /></td>
                      )),
                      <td
                        key={`${a.ano}-total`}
                        data-total-ano={a.ano}
                        className={`${TD} ${BG_TOTAL_TD} font-medium text-zinc-800 ${a.meses.length === 0 ? sep(a.ano) : SEP}`}
                      ><Valor v={c.total} /></td>,
                      <td key={`${a.ano}-pct`} data-total-ano={a.ano} data-total-pct="" className={classePct}>{fmtPct(c.pct)}</td>,
                    ]
                  })}
                </tr>
              ))}
            </tbody>
            <tfoot className="[&_td]:bg-band">
              <tr>
                <td className={`${TD_FOOT} sticky left-0 z-10 ${SEP_CATEGORIA} ${BG_TOTAL_FOOT} rounded-bl-lg`}>Total</td>
                {tabela.anos.flatMap(a => {
                  // O último <td> da última coluna de ano (a "%") fecha o canto inferior direito do card.
                  const cantoFinal = a.ano === ultimoAno ? 'rounded-br-lg' : ''
                  const classePct = `${TD_FOOT} ${BG_TOTAL_FOOT} text-right tabular-nums ${cantoFinal}`
                  if (!estaAberto(a.ano)) {
                    return [
                      <td key={a.ano} className={`${TD_FOOT} ${sep(a.ano)} ${BG_TOTAL_FOOT}`}><Valor v={a.total} /></td>,
                      <td key={`${a.ano}-pct`} className={classePct}>{fmtPct(a.pctTotal)}</td>,
                    ]
                  }
                  return [
                    ...a.meses.map((m, j) => (
                      <td key={`${a.ano}-${m}`} className={`${TD_FOOT} ${j === 0 ? sep(a.ano) : ''}`}><Valor v={a.totalPorMes[j]} /></td>
                    )),
                    <td
                      key={`${a.ano}-total`}
                      data-total-ano={a.ano}
                      className={`${TD_FOOT} ${BG_TOTAL_FOOT} ${a.meses.length === 0 ? sep(a.ano) : SEP}`}
                    ><Valor v={a.total} /></td>,
                    <td key={`${a.ano}-pct`} data-total-ano={a.ano} data-total-pct="" className={classePct}>{fmtPct(a.pctTotal)}</td>,
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
