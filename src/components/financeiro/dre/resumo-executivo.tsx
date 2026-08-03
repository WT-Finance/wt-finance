// ── Resumo Executivo da DRE (v5.3.1 · refino visual v5.4.1) ───────────────────
// Bloco de APRESENTAÇÃO PURA: 6 linhas-chave × 6 colunas de comparação, entra
// dentro do card da tabela existente. Não busca dado, não tem estado — tudo
// chega por prop (mesmo payload que já alimenta os totalizadores da tabela e a
// visão Consolidado, ver `@/lib/dre/schemas`).
//
// 0. GRAMÁTICA VISUAL = A DA TABELA (v5.4.1). O Resumo é uma VISUALIZAÇÃO das
//    linhas-chave da tabela logo acima, no MESMO card — quando os dois destoam,
//    o leitor lê a diferença como divergência de DADO, não como escolha de
//    estilo. Por isso o cabeçalho, o box, a altura de linha, o "R$" esmaecido, os
//    parênteses do negativo e a régua de cor vêm de `./celula-contabil` e de
//    `tabela-dre.tsx`, nunca de cópias locais. As linhas usam a cor dos grupos de
//    categoria (`blocoH` = --band), NÃO a banda escura dos totalizadores: seis
//    bandas escuras seguidas viravam parede e a banda perdia a função de
//    contraste (decisão do Yan, v5.4.1).
//
// 1. ANCORAGEM NO ANO CORRENTE, NÃO NO ANO NAVEGADO (decisão explícita do Yan).
//    O componente recebe `anoCorrente` (resolvido pela página via `hojeSP()`) e
//    ignora completamente qual ano está selecionado na pill da tabela acima:
//    com `?ano=2025` na URL o Resumo continua mostrando 2024 | 2025 | YTD 25 |
//    YTD 26 — é o retrato de AGORA, não da navegação. Isso é INTENCIONAL, não
//    bug; o aviso saiu do subtítulo e virou o "?" ao lado do título (v5.4.1),
//    para o Resumo abrir na mesma hierarquia do título da DRE.
//
// 2. O YTD VEM PRONTO, NUNCA É RECALCULADO AQUI. `porLinha[k].ytd` já sai da
//    janela `mesJanela` (ancorada em `hojeSP()` na página) — a MESMA em todos
//    os anos, o que torna a comparação honesta. Recalcular o YTD localmente
//    foi a origem de um bug caro: a janela vinha do ano EXIBIDO, e num ano
//    fechado o "YTD" ficava idêntico ao ano cheio (nenhum gate pega esse erro,
//    é definição, não tipo). Por isso este arquivo não usa `Date`/`new Date()`
//    nem qualquer derivação de mês corrente.
//
// 3. AS 6 CHAVES SÃO ESTÁTICAS (não descobertas do payload). O payload de
//    `get_dre_mensal` não carrega o campo `formula`, então não há como saber
//    dinamicamente quais linhas são agregadoras; e a Receita Bruta é a linha
//    `RB_H`, com `tipo:'blocoH'` — NÃO `'tot'` —, então filtrar por `t==='tot'`
//    deixaria a Receita Bruta de fora. Os rótulos exibidos são cópia de
//    produto do Yan (os rótulos gravados no banco vêm em CAIXA ALTA e com
//    prefixo contábil inconsistente: "(=) SALDO REPASSE" × "= LUCRO BRUTO").

import ScrollAutoHide from '@/components/shared/scroll-auto-hide'
import Tooltip from '@/components/ui/tooltip'
import { ConteudoContabil, corPorSinal } from './celula-contabil'
import type { ConsolidadoAno } from '@/lib/dre/schemas'

interface Props {
  /** Ano corrente no fuso de São Paulo, resolvido na página via hojeSP(). É a ÂNCORA. */
  anoCorrente: number
  /** Um item por ano da janela [corrente-2, corrente-1, corrente] que a página
   *  conseguiu carregar. Ano cuja RPC falhou simplesmente não vem na lista. */
  consolidadoAnos: ConsolidadoAno[]
}

/** O aviso que ocupava o subtítulo até a v5.3.1. Vive no "?" ao lado do título desde a
 *  v5.4.1 — o subtítulo custava uma linha inteira para uma ressalva que só interessa a
 *  quem estranha o Resumo não seguir a pill de ano. */
const ANCORAGEM =
  'Retrato do ano corrente — este bloco não acompanha o ano selecionado nas pills acima.'

/** As 6 linhas-chave, nesta ordem — casadas por CHAVE (`b:<chave>` em `porLinha`),
 *  nunca por nome nem por posição (a estrutura pode reordenar/renomear entre anos).
 *  O `prefixo` contábil é separado do rótulo de propósito: é a coluna estreita que
 *  alinha verticalmente os seis sinais, e deixa visível numa leitura que só a Receita
 *  Bruta ENTRA no cálculo — as outras cinco são resultados. */
const LINHAS: ReadonlyArray<{ prefixo: string; rotulo: string; chave: string }> = [
  { prefixo: '(=)', rotulo: 'Saldo Repasse',          chave: 'REPASSE' },
  { prefixo: '(+)', rotulo: 'Receita Bruta',          chave: 'RB_H' },
  { prefixo: '(=)', rotulo: 'Receita Op. Líquida',    chave: 'ROL' },
  { prefixo: '(=)', rotulo: 'Lucro Bruto',            chave: 'LB' },
  { prefixo: '(=)', rotulo: 'Lucro Operacional',      chave: 'LOP' },
  { prefixo: '(=)', rotulo: 'Resultado do Exercício', chave: 'REX' },
] as const

function encontrarAno(consolidadoAnos: ConsolidadoAno[], ano: number): ConsolidadoAno | undefined {
  return consolidadoAnos.find(c => c.ano === ano)
}

/** `undefined` (ano ausente da lista, ou a chave não existe naquele ano) → `null`
 *  (AUSÊNCIA) — nunca 0, que inventaria um valor e contaminaria o Δ. */
function valorLinha(ano: ConsolidadoAno | undefined, chave: string, campo: 'total' | 'ytd'): number | null {
  const reg = ano?.porLinha[`b:${chave}`]
  return reg ? reg[campo] : null
}

/** Δ em REAIS (subtração), nunca percentual — o Δ% já é entregue pela visão
 *  Consolidado. Falta qualquer operando → `null` (travessão), nunca 0 − X. */
function delta(a: number | null, b: number | null): number | null {
  if (a === null || b === null) return null
  return b - a
}

/** Dois últimos dígitos do ano ("2025" → "25"), convenção já usada na visão
 *  Consolidado ("YTD «aa»"). */
function aa(ano: number): string {
  return String(ano).slice(2)
}

/** Cabeçalho na régua EXATA da tabela (`tabela-dre.tsx`, `ThConta` e as th de mês):
 *  10px, semibold, caixa alta, tracking 0.09em, `text-text-secondary`. */
function ThResumo({ children, alinhamento }: { children: string; alinhamento: 'esquerda' | 'direita' }) {
  return (
    <th
      className={`whitespace-nowrap border-b border-b-wt-border px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.09em] text-text-secondary ${
        alinhamento === 'direita' ? 'text-right' : 'text-left'
      }`}
    >
      {children}
    </th>
  )
}

/** Coluna de valor ABSOLUTO — deliberadamente NEUTRA. As 6 linhas são todas "quanto
 *  maior melhor", então pintar os absolutos por sinal só acrescentaria cor sem
 *  informação; o sinal importa na VARIAÇÃO, e é lá que a cor entra (`CelulaDelta`).
 *  O layout (R$ esmaecido à esquerda, número tabular à direita, negativo entre
 *  parênteses) é o mesmo `ConteudoContabil` da tabela. */
function CelulaAbs({ valor }: { valor: number | null }) {
  return (
    <td className="h-9 border-b border-b-wt-border px-3.5 text-2xs tabular-nums whitespace-nowrap text-text-primary">
      <ConteudoContabil valor={valor} />
    </td>
  )
}

/** Coluna de Δ — cor por sinal pela régua COMPARTILHADA, com o tipo `'blocoH'`: é a
 *  banda em que estas linhas estão pousadas, e sobre ela os tons base reprovam AA
 *  (3,88–4,31:1). `corPorSinal` devolve os `-deep` (7–10:1) justamente por isso.
 *  Zero e ausência ficam neutros — nada a celebrar nem a lamentar. */
function CelulaDelta({ valor }: { valor: number | null }) {
  return (
    <td
      className={`h-9 border-b border-b-wt-border px-3.5 text-2xs tabular-nums whitespace-nowrap ${corPorSinal('blocoH', valor)}`}
    >
      <ConteudoContabil valor={valor} />
    </td>
  )
}

export default function ResumoExecutivo({ anoCorrente, consolidadoAnos }: Props) {
  const a2 = anoCorrente - 2
  const a1 = anoCorrente - 1
  const ac = anoCorrente

  const regA2 = encontrarAno(consolidadoAnos, a2)
  const regA1 = encontrarAno(consolidadoAnos, a1)
  const regAc = encontrarAno(consolidadoAnos, ac)

  // Fail-safe: sem nenhum ano-âncora presente, o bloco simplesmente não existe
  // (a tabela acima continua funcionando sozinha).
  if (!regA2 && !regA1 && !regAc) return null

  const rotulosColuna = [
    `${a2}`,
    `${a1}`,
    `Δ ${aa(a2)}→${aa(a1)}`,
    `YTD ${aa(a1)}`,
    `YTD ${aa(ac)}`,
    'Δ YTD',
  ] as const

  return (
    <div className="mt-5 border-t border-wt-border pt-4">
      {/* Título na MESMA hierarquia visual do título da DRE (`text-[15px] font-semibold`);
          <h3> e não <h2> porque é uma subseção do card, cujo <h2> é "Demonstrativo de
          Resultado por Fluxo de Caixa" — mesma aparência, ordem de headings correta.
          O "?" é o idioma de ajuda já usado em posicao-projetado/repasse-mensal:
          `!whitespace-normal` é obrigatório (o balão nasce `whitespace-nowrap`, e sem o
          `!` quem decide é a ORDEM DO CSS GERADO, não a ordem das classes). */}
      <div className="mb-3 flex items-center gap-1.5">
        <h3 className="text-[15px] font-semibold text-text-primary">Resumo Executivo</h3>
        <Tooltip conteudo={ANCORAGEM} className="z-30 w-64 !whitespace-normal font-normal normal-case tracking-normal leading-snug">
          <span
            aria-label={ANCORAGEM}
            className="inline-flex h-3 w-3 items-center justify-center rounded-full border border-zinc-300 text-[8px] font-semibold leading-none text-zinc-400"
          >
            ?
          </span>
        </Tooltip>
      </div>
      {/* Box idêntico ao da tabela — é o que faz as duas peças lerem como uma só. */}
      <div className="overflow-hidden rounded-lg border border-wt-border bg-band">
        <ScrollAutoHide eixo="x">
          <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <ThResumo alinhamento="esquerda">Conta</ThResumo>
                {rotulosColuna.map(rotulo => (
                  <ThResumo key={rotulo} alinhamento="direita">{rotulo}</ThResumo>
                ))}
              </tr>
            </thead>
            <tbody>
              {LINHAS.map(({ prefixo, rotulo, chave }, i) => {
                const t2   = valorLinha(regA2, chave, 'total')
                const t1   = valorLinha(regA1, chave, 'total')
                const ytd1 = valorLinha(regA1, chave, 'ytd')
                const ytdAc = valorLinha(regAc, chave, 'ytd')
                const dTotal = delta(t2, t1)
                const dYtd   = delta(ytd1, ytdAc)
                // A última linha dispensa a régua de baixo: a borda do box já está ali,
                // e as duas juntas desenhariam uma linha dupla.
                const ultima = i === LINHAS.length - 1
                return (
                  <tr key={chave} className={ultima ? '[&>td]:border-b-0' : undefined}>
                    <td className="h-9 border-b border-b-wt-border pl-3 pr-3">
                      <span className="flex items-baseline gap-1.5 truncate uppercase tracking-[0.05em] text-[11px] font-semibold text-text-primary">
                        <span className="text-text-subtle">{prefixo}</span>
                        {rotulo}
                      </span>
                    </td>
                    <CelulaAbs valor={t2} />
                    <CelulaAbs valor={t1} />
                    <CelulaDelta valor={dTotal} />
                    <CelulaAbs valor={ytd1} />
                    <CelulaAbs valor={ytdAc} />
                    <CelulaDelta valor={dYtd} />
                  </tr>
                )
              })}
            </tbody>
          </table>
        </ScrollAutoHide>
      </div>
    </div>
  )
}
