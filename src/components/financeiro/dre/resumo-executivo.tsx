// ── Resumo Executivo da DRE (v5.3.1) ──────────────────────────────────────────
// Bloco de APRESENTAÇÃO PURA: 6 linhas-chave × 6 colunas de comparação, entra
// dentro do card da tabela existente. Não busca dado, não tem estado — tudo
// chega por prop (mesmo payload que já alimenta os totalizadores da tabela e a
// visão Consolidado, ver `@/lib/dre/schemas`).
//
// 1. ANCORAGEM NO ANO CORRENTE, NÃO NO ANO NAVEGADO (decisão explícita do Yan).
//    O componente recebe `anoCorrente` (resolvido pela página via `hojeSP()`) e
//    ignora completamente qual ano está selecionado na pill da tabela acima:
//    com `?ano=2025` na URL o Resumo continua mostrando 2024 | 2025 | YTD 25 |
//    YTD 26 — é o retrato de AGORA, não da navegação. Isso é INTENCIONAL, não
//    bug; por isso a legenda abaixo do título avisa o leitor explicitamente.
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
import { fmtContabil } from './fmt-contabil'
import type { ConsolidadoAno } from '@/lib/dre/schemas'

interface Props {
  /** Ano corrente no fuso de São Paulo, resolvido na página via hojeSP(). É a ÂNCORA. */
  anoCorrente: number
  /** Um item por ano da janela [corrente-2, corrente-1, corrente] que a página
   *  conseguiu carregar. Ano cuja RPC falhou simplesmente não vem na lista. */
  consolidadoAnos: ConsolidadoAno[]
}

/** As 6 linhas-chave, nesta ordem — casadas por CHAVE (`b:<chave>` em `porLinha`),
 *  nunca por nome nem por posição (a estrutura pode reordenar/renomear entre anos). */
const LINHAS: ReadonlyArray<{ rotulo: string; chave: string }> = [
  { rotulo: 'Saldo Repasse',           chave: 'REPASSE' },
  { rotulo: 'Receita Bruta',           chave: 'RB_H' },
  { rotulo: 'Receita Op. Líquida',     chave: 'ROL' },
  { rotulo: 'Lucro Bruto',             chave: 'LB' },
  { rotulo: 'Lucro Operacional',       chave: 'LOP' },
  { rotulo: 'Resultado do Exercício',  chave: 'REX' },
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

/** Cor por SINAL — só nas colunas de Δ (as 4 colunas de valor absoluto ficam
 *  neutras: as 6 linhas são todas "quanto maior melhor", então o sinal só é
 *  informativo na VARIAÇÃO). Zero/ausência ficam neutros também (nada a
 *  celebrar nem lamentar). */
function corDelta(v: number | null): string {
  if (v === null || Math.abs(v) < 0.005) return 'text-text-subtle'
  return v > 0 ? 'text-positive' : 'text-negative'
}

function ThResumo({ children, alinhamento }: { children: string; alinhamento: 'esquerda' | 'direita' }) {
  return (
    <th
      className={`h-7 whitespace-nowrap bg-band px-3 text-2xs font-medium text-text-muted ${alinhamento === 'direita' ? 'text-right' : 'text-left'}`}
    >
      {children}
    </th>
  )
}

function CelulaAbs({ valor }: { valor: number | null }) {
  return (
    <td className="h-8 px-3 text-right text-2xs tabular-nums whitespace-nowrap text-text-primary">
      {fmtContabil(valor ?? 0)}
    </td>
  )
}

function CelulaDelta({ valor }: { valor: number | null }) {
  return (
    <td className={`h-8 px-3 text-right text-2xs tabular-nums whitespace-nowrap ${corDelta(valor)}`}>
      {fmtContabil(valor ?? 0)}
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
    <div className="mt-5 border-t border-zinc-100 pt-4">
      <p className="text-[13px] font-semibold text-text-primary">Resumo Executivo</p>
      <p className="mt-0.5 text-2xs text-text-subtle">
        retrato do ano corrente — não acompanha o ano selecionado acima
      </p>
      <div className="mt-3">
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
              {LINHAS.map(({ rotulo, chave }) => {
                const t2   = valorLinha(regA2, chave, 'total')
                const t1   = valorLinha(regA1, chave, 'total')
                const ytd1 = valorLinha(regA1, chave, 'ytd')
                const ytdAc = valorLinha(regAc, chave, 'ytd')
                const dTotal = delta(t2, t1)
                const dYtd   = delta(ytd1, ytdAc)
                return (
                  <tr key={chave} className="[&>td]:border-b [&>td]:border-zinc-50">
                    <td className="h-8 truncate px-3 text-2xs font-medium text-text-primary">{rotulo}</td>
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
