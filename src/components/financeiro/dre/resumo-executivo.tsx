'use client'

// ── Resumo Executivo da DRE (v5.3.1 · refino visual v5.4.1 · pills na v5.7.0) ──
// 6 linhas-chave × N colunas de comparação, em CARD PRÓPRIO — desde a v5.7.0 o
// PRIMEIRO card da página, acima da tabela (antes obrigava a rolar o demonstrativo
// inteiro para chegar ao resumo dele).
//
// 0. GRAMÁTICA VISUAL = A DA TABELA (v5.4.1). O Resumo é uma VISUALIZAÇÃO das
//    linhas-chave da tabela — quando os dois destoam, o leitor lê a diferença como
//    divergência de DADO, não como escolha de estilo. Por isso o cabeçalho, o box, a
//    altura de linha, o "R$" esmaecido, os parênteses do negativo, a régua de cor e
//    AGORA TAMBÉM AS PILLS DE ANO vêm de `./celula-contabil` e de `tabela-dre.tsx`,
//    nunca de cópias locais. As linhas usam o cinza claro dos SUBGRUPOS (`sub` =
//    --band-soft) sobre o box `--band`. Nunca a banda ESCURA dos totalizadores — seis
//    bandas escuras seguidas viravam parede (decisão do Yan, v5.4.1).
//
// 1. SELEÇÃO PRÓPRIA DE ANOS (v5.7.0). Até aqui o Resumo era ancorado em
//    `anoCorrente` e ignorava a navegação da tabela — um retrato fixo de "agora". O
//    Yan pediu pills com seleção aditiva, então a ancoragem fixa deu lugar a uma
//    seleção EXPLÍCITA, que continua INDEPENDENTE da pill de ano da tabela: são dois
//    recortes de propósito distinto no mesmo lugar, como o `?ano=` da tabela já era.
//    O default são os DOIS anos mais recentes (v5.7.2) — o mesmo da visão Consolidado
//    da tabela, para os dois cards nascerem falando do mesmo par. (Na v5.7.1 nasciam
//    todos os carregados; três anos abriam 7 colunas para uma leitura que é, na
//    prática, ano fechado × ano corrente.)
//
// 2. O YTD VEM PRONTO, NUNCA É RECALCULADO AQUI. `porLinha[k].ytd` já sai da janela
//    `mesJanela` (ancorada em `hojeSP()` na página) — a MESMA em todos os anos, o que
//    torna a comparação honesta. Recalcular o YTD localmente foi a origem de um bug
//    caro: a janela vinha do ano EXIBIDO, e num ano fechado o "YTD" ficava idêntico ao
//    ano cheio (nenhum gate pega esse erro, é definição, não tipo). Por isso este
//    arquivo não usa `Date`/`new Date()` nem deriva mês corrente.
//
// 3. ANO CHEIO SÓ DE ANO FECHADO. A coluna "«ano»" existe apenas para anos já
//    encerrados: no ano corrente o `total` inclui PREVISTO, e um resumo executivo que
//    mostrasse projeção sob um rótulo de ano seria projeção lida como fato. O ano
//    corrente aparece só no YTD, que é 100% realizado. É o `corrente` do payload que
//    decide — nunca uma inferência local.
//
// 4. AS 6 CHAVES SÃO ESTÁTICAS (não descobertas do payload). O payload de
//    `get_dre_mensal` não carrega o campo `formula`, então não há como saber
//    dinamicamente quais linhas são agregadoras. Derivar a lista de `t==='tot'` seria
//    frágil por outro motivo: o TIPO de um bloco é DADO editável — a `RB_H` era
//    `blocoH` até a v5.7.1 e virou `tot`. Uma lista estática de CHAVES sobrevive a
//    essas mudanças; um filtro por tipo mudaria de conteúdo sozinho. Os rótulos
//    exibidos são cópia de produto do Yan (os gravados no banco vêm em CAIXA ALTA e
//    com prefixo contábil).

import { useState } from 'react'
import ScrollAutoHide from '@/components/shared/scroll-auto-hide'
import Tooltip from '@/components/ui/tooltip'
import { ConteudoContabil, corPorSinal } from './celula-contabil'
import { AnoPills } from './tabela-dre'
import type { ConsolidadoAno } from '@/lib/dre/schemas'

interface Props {
  /** Janela navegável [corrente-2, corrente] — as pills que existem, mesmo as que a
   *  RPC não conseguiu carregar (essas ficam `disabled`, e não invisíveis: sumir com a
   *  pill esconderia que aquele ano existe). */
  anosDisponiveis: number[]
  /** Um item por ano da janela que a página conseguiu carregar, ASCENDENTE. Ano cuja
   *  RPC falhou simplesmente não vem. */
  consolidadoAnos: ConsolidadoAno[]
}

/** O aviso do "?" ao lado do título. Mudou na v5.7.0: antes explicava a ancoragem fixa
 *  no ano corrente; agora o que precisa de aviso é a INDEPENDÊNCIA entre estas pills e
 *  as da tabela — quem vê dois conjuntos de pills na mesma página supõe que um segue o
 *  outro. */
const AJUDA =
  'Os anos escolhidos aqui valem só para este resumo — a seleção é independente das pills ' +
  'da tabela abaixo. "YTD" compara todos os anos na mesma janela do calendário (jan até o ' +
  'mês corrente); a coluna do ano cheio aparece apenas para anos já encerrados, porque no ' +
  'ano corrente o total do ano incluiria previsto.'

/** As 6 linhas-chave, nesta ordem — casadas por CHAVE (`b:<chave>` em `porLinha`),
 *  nunca por nome nem por posição (a estrutura pode reordenar/renomear entre anos — e
 *  renomeou na própria v5.7.0). O `prefixo` contábil é separado do rótulo de propósito:
 *  é a coluna estreita que alinha verticalmente os seis sinais.
 *
 *  v5.7.1 — a Receita Bruta passou de `(+)` para `(=)`. Ela sempre foi um SUBTOTAL
 *  (`REPASSE + RV`), mas estava tipada como cabeçalho de grupo e marcada aqui como
 *  entrada; a v5.7.1 a promoveu a linha de RESULTADO na estrutura, e o prefixo segue o
 *  papel. Consequência: as seis linhas são resultados, e a coluna de prefixo deixou de
 *  distinguir entrada de resultado — ela agora só alinha os sinais verticalmente. */
const LINHAS: ReadonlyArray<{ prefixo: string; rotulo: string; chave: string }> = [
  { prefixo: '(=)', rotulo: 'Saldo Repasse',          chave: 'REPASSE' },
  { prefixo: '(=)', rotulo: 'Receita Bruta',          chave: 'RB_H' },
  { prefixo: '(=)', rotulo: 'Receita Op. Líquida',    chave: 'ROL' },
  { prefixo: '(=)', rotulo: 'Lucro Bruto',            chave: 'LB' },
  { prefixo: '(=)', rotulo: 'Lucro Operacional',      chave: 'LOP' },
  { prefixo: '(=)', rotulo: 'Resultado do Exercício', chave: 'REX' },
] as const

/** Uma coluna do resumo. `campo` diz de onde o número sai; `delta` é a subtração de
 *  duas colunas do MESMO campo (nunca de campos diferentes — ano cheio menos YTD não
 *  significaria nada). */
type Coluna =
  | { k: 'valor'; id: string; rotulo: string; ano: number; campo: 'total' | 'ytd'; titulo: string }
  | { k: 'delta'; id: string; rotulo: string; de: number; para: number; campo: 'total' | 'ytd'; titulo: string }

/** Dois últimos dígitos do ano ("2025" → "25"), convenção já usada na Consolidado. */
function aa(ano: number): string {
  return String(ano).slice(2)
}

/**
 * Colunas em DOIS grupos, cada um com o seu Δ no fim:
 *  · ano cheio dos anos FECHADOS marcados (+ Δ entre os dois últimos, se houver dois);
 *  · YTD de TODOS os anos marcados (+ Δ entre os dois últimos).
 * O Δ é em REAIS, nunca percentual — o Δ% já é o que a visão Consolidado entrega, e
 * repetir aqui tiraria do Resumo a única leitura que só ele dá.
 */
function montarColunas(sel: ConsolidadoAno[]): Coluna[] {
  const cols: Coluna[] = []
  const fechados = sel.filter(c => !c.corrente)

  for (const c of fechados) {
    cols.push({
      k: 'valor', id: `ano-${c.ano}`, rotulo: String(c.ano), ano: c.ano, campo: 'total',
      titulo: `${c.ano} — ano inteiro (encerrado)`,
    })
  }
  if (fechados.length >= 2) {
    const [p, u] = fechados.slice(-2)
    cols.push({
      k: 'delta', id: `d-ano-${p.ano}-${u.ano}`, rotulo: `Δ ${aa(p.ano)}·${aa(u.ano)}`,
      de: p.ano, para: u.ano, campo: 'total',
      titulo: `Variação em reais do ano cheio de ${p.ano} para ${u.ano}`,
    })
  }

  for (const c of sel) {
    cols.push({
      k: 'valor', id: `ytd-${c.ano}`, rotulo: `YTD ${aa(c.ano)}`, ano: c.ano, campo: 'ytd',
      titulo: `${c.ano} na MESMA janela dos demais anos (jan até o mês corrente)`,
    })
  }
  if (sel.length >= 2) {
    const [p, u] = sel.slice(-2)
    cols.push({
      k: 'delta', id: `d-ytd-${p.ano}-${u.ano}`, rotulo: `Δ YTD ${aa(p.ano)}·${aa(u.ano)}`,
      de: p.ano, para: u.ano, campo: 'ytd',
      titulo: `Variação em reais do YTD de ${p.ano} para ${u.ano} (mesma janela)`,
    })
  }

  return cols
}

/** Cabeçalho na régua EXATA da tabela (`tabela-dre.tsx`, `ThConta` e as th de mês):
 *  10px, semibold, caixa alta, tracking 0.09em, `text-text-secondary`. */
function ThResumo({ children, alinhamento, titulo }: { children: string; alinhamento: 'esquerda' | 'direita'; titulo?: string }) {
  return (
    <th
      title={titulo}
      className={`whitespace-nowrap border-b border-b-wt-border px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.09em] text-text-secondary ${
        alinhamento === 'direita' ? 'text-right' : 'text-left'
      }`}
    >
      {children}
    </th>
  )
}

/** Fundo das linhas = o cinza claro dos SUBGRUPOS da DRE (`--band-soft`), não o
 *  `--band` dos grupos: o box já é `--band`, então as linhas em `--band-soft` é o que
 *  destaca o cabeçalho do corpo em vez de deixar o bloco todo numa cor só. Vai em cada
 *  `<td>`, nunca no `<tr>` — com `border-separate` o fundo de linha não é confiável
 *  entre browsers (é a mesma razão pela qual a tabela pinta célula a célula). */
const BG_LINHA = 'bg-band-soft'
/** O TAMANHO não vem daqui: a `<table>` roda em `text-[13px]`, como a da DRE, e as células
 *  de valor herdam. Só o cabeçalho (10px) e o rótulo da conta (11px) cravam o próprio.
 *  `font-semibold` é o peso que a tabela dá aos valores das linhas de subgrupo — no Resumo
 *  os números SÃO o conteúdo, então ganham o mesmo destaque (pedido do Yan, v5.4.1). */
const CELULA = `h-9 ${BG_LINHA} border-b border-b-wt-border px-3.5 font-semibold tabular-nums whitespace-nowrap`

/** TODA célula de valor — absoluta ou Δ — é colorida por SINAL (verde/vermelho), pela
 *  régua COMPARTILHADA com a tabela. O tipo passado é `'sub'`: é a banda clara em que
 *  estas linhas estão pousadas, e sobre ela os tons base reprovam AA (3,88–4,31:1) —
 *  `corPorSinal` devolve os `-deep` (7–10:1) justamente por isso. Zero e ausência ficam
 *  neutros. O layout (R$ esmaecido à esquerda, número tabular à direita, negativo entre
 *  parênteses) é o mesmo `ConteudoContabil` da tabela. */
function CelulaValor({ valor }: { valor: number | null }) {
  return (
    <td className={`${CELULA} ${corPorSinal('sub', valor)}`}>
      <ConteudoContabil valor={valor} />
    </td>
  )
}

export default function ResumoExecutivo({ anosDisponiveis, consolidadoAnos }: Props) {
  // Default = os DOIS anos mais recentes (v5.7.2, decisão do Yan). Na v5.7.1 nasciam
  // TODOS os carregados, para o card não perder informação ao ganhar as pills; na prática
  // três anos abriam 7 colunas e a leitura útil é o ano fechado contra o corrente. Mesmo
  // default da visão Consolidado da tabela — os dois cards nascem falando do mesmo par.
  // Initializer de `useState`, nunca um efeito de mount (ruleset do React Compiler).
  const [selecionados, setSelecionados] = useState<Set<number>>(
    () => new Set(consolidadoAnos.slice(-2).map(c => c.ano)),
  )

  // Fail-safe: sem nenhum ano carregado o bloco não existe (a tabela abaixo continua
  // funcionando sozinha).
  if (consolidadoAnos.length === 0) return null

  // Seleção EFETIVA — derivação de RENDER, nunca `setState` num efeito para "consertar"
  // o estado: filtra contra o que a página conseguiu carregar e nunca fica vazia (cai
  // para o ano mais recente). Mesma receita da visão Consolidado.
  const marcados = consolidadoAnos.filter(c => selecionados.has(c.ano))
  const sel = marcados.length > 0 ? marcados : consolidadoAnos.slice(-1)
  const semBase = new Set(anosDisponiveis.filter(a => !consolidadoAnos.some(c => c.ano === a)))
  const colunas = montarColunas(sel)

  function alternar(a: number) {
    setSelecionados(prev => {
      const s = new Set(prev)
      // Nunca vazio: desmarcar o último marcado é no-op (a pill já anuncia isso pelo
      // `aria-disabled`, e a regra vive AQUI, em fonte única).
      if (s.has(a)) { if (s.size <= 1) return prev; s.delete(a) }
      else s.add(a)
      return s
    })
  }

  /** `undefined` (ano ausente da lista, ou a chave não existe naquele ano) → `null`
   *  (AUSÊNCIA) — nunca 0, que inventaria um valor e contaminaria o Δ. */
  function valor(ano: number, chave: string, campo: 'total' | 'ytd'): number | null {
    const reg = consolidadoAnos.find(c => c.ano === ano)?.porLinha[`b:${chave}`]
    return reg ? reg[campo] : null
  }

  return (
    <div className="rounded-xl bg-surface p-5 shadow-sm">
      {/* O "?" é o idioma de ajuda já usado em posicao-projetado/repasse-mensal:
          `!whitespace-normal` é obrigatório (o balão nasce `whitespace-nowrap`, e sem o
          `!` quem decide é a ORDEM DO CSS GERADO, não a ordem das classes). */}
      <div className="mb-4">
        <div className="mb-3 flex items-center gap-1.5">
          <h2 className="text-[15px] font-semibold text-text-primary">Resumo Executivo</h2>
          {/* `<button type="button">`, nunca `<span>` — receita da skill ui-design-system §2:
              `span` fica fora do tab-order e o balão, que também abre no FOCO, se torna
              inalcançável por teclado. (Achado ALTO do revisor na v5.4.2 e de novo na v5.7.0.) */}
          <Tooltip conteudo={AJUDA} className="z-30 w-72 !whitespace-normal font-normal normal-case tracking-normal leading-snug">
            <button
              type="button"
              aria-label={`Resumo Executivo: ${AJUDA}`}
              className="foco-neutro inline-flex h-3 w-3 items-center justify-center rounded-full border border-zinc-300 text-[8px] font-semibold leading-none text-zinc-400"
            >
              ?
            </button>
          </Tooltip>
        </div>
        {/* Pills ABAIXO do título e à esquerda (v5.7.0, conferência do Yan) — a MESMA
            anatomia do card da tabela: título, depois a faixa de controles. Encostadas à
            direita do título elas ficavam longe da tabela que governam e desalinhadas das
            pills do card de baixo, que é onde o olho já aprendeu a procurá-las.
            O componente é o MESMO da toolbar da tabela (`AnoPills`, modo 'multi') — duas
            cópias de pill divergiriam em cor, foco e `aria` no primeiro ajuste. */}
        <div className="flex flex-wrap items-center gap-2">
          <AnoPills
            anosDisponiveis={anosDisponiveis}
            modo="multi"
            ano={sel[sel.length - 1].ano}
            selecionados={new Set(sel.map(c => c.ano))}
            semBase={semBase}
            onSelect={alternar}
          />
        </div>
      </div>
      {/* Box idêntico ao da tabela — é o que faz as duas peças lerem como uma só. */}
      <div className="overflow-hidden rounded-lg border border-wt-border bg-band">
        {/* DOIS gutters no limite do scroll horizontal, a mesma receita da tabela da DRE.
            O thumb do ScrollAutoHide é `absolute bottom-1` (4px) com `h-1.5` (6px), medido
            do PRÓPRIO wrapper — sem folga ele encosta na última linha (foi o que aconteceu).
            · `pb-1.5` FORA: encolhe o wrapper, afastando a barra da borda do box sem tocar
              no componente compartilhado, que é padrão da plataforma.
            · `pb-3.5` no viewport (o `className` do ScrollAutoHide vai para lá): 14px de
              respiro DENTRO da área rolável, sobre os quais o thumb flutua.
            Os dois gutters mostram o `bg-band` do box, então a tabela termina numa moldura
            contínua — não num vazio branco. */}
        <div className="pb-1.5">
        <ScrollAutoHide eixo="x" className="pb-3.5">
          <table className="w-full border-separate border-spacing-0 text-[13px]">
            <thead>
              <tr>
                <ThResumo alinhamento="esquerda">Conta</ThResumo>
                {colunas.map(c => (
                  <ThResumo key={c.id} alinhamento="direita" titulo={c.titulo}>{c.rotulo}</ThResumo>
                ))}
              </tr>
            </thead>
            <tbody>
              {LINHAS.map(({ prefixo, rotulo, chave }, i) => {
                // A última linha dispensa a régua de baixo: a borda do box já está ali,
                // e as duas juntas desenhariam uma linha dupla.
                const ultima = i === LINHAS.length - 1
                return (
                  <tr key={chave} className={ultima ? '[&>td]:border-b-0' : undefined}>
                    <td className={`h-9 ${BG_LINHA} border-b border-b-wt-border pl-3 pr-3`}>
                      <span className="flex items-baseline gap-1.5 truncate uppercase tracking-[0.05em] text-[11px] font-semibold text-text-primary">
                        <span className="text-text-subtle">{prefixo}</span>
                        {rotulo}
                      </span>
                    </td>
                    {colunas.map(c => {
                      if (c.k === 'valor') {
                        return <CelulaValor key={c.id} valor={valor(c.ano, chave, c.campo)} />
                      }
                      const a = valor(c.de, chave, c.campo)
                      const b = valor(c.para, chave, c.campo)
                      // Falta qualquer operando → travessão, nunca 0 − X.
                      return <CelulaValor key={c.id} valor={a === null || b === null ? null : b - a} />
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </ScrollAutoHide>
        </div>
      </div>
    </div>
  )
}
