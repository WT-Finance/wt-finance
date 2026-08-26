'use client'

import ScrollAutoHide from '@/components/shared/scroll-auto-hide'
import Tooltip from '@/components/ui/tooltip'
import { ConteudoContabil, corPorSinal } from './celula-contabil'
import { fmtAv } from '@/lib/dre/av'
import type { LinhaChave } from '@/lib/dre/linhas-chave'

// ── Linhas-chave do regime de competência (v5.8.1) ────────────────────────────
// O sumário executivo da seção: as oito linhas de manchete, os anos fechados, o par de
// YTD comparável, a variação e a Análise Vertical de cada recorte.
//
// GRAMÁTICA VISUAL = A DA TABELA, pela mesma razão registrada no `ResumoExecutivo` do
// caixa: quando o resumo e o demonstrativo destoam, o leitor lê a diferença como
// divergência de DADO, não como escolha de estilo. Por isso o cabeçalho, a altura de
// linha, o "R$" esmaecido, os parênteses do negativo e a régua de cor vêm de
// `./celula-contabil`, nunca de cópias locais.
//
// Este card NÃO é o `ResumoExecutivo` reaproveitado: lá as colunas são N anos com pills
// de seleção e Δ em reais; aqui são anos cheios + dois YTD + Δ% + duas colunas de AV,
// sem seleção. Forçar um componente a servir os dois desenhos custaria mais que uma
// tabela pequena — o que se compartilha é a aritmética (`av.ts`, `folhas.ts`) e a
// gramática das células.

const AJUDA =
  'As oito linhas de manchete do demonstrativo por competência. Os anos cheios só aparecem ' +
  'para exercícios encerrados; o YTD usa a mesma janela nos dois anos, cortada pela cobertura ' +
  'da base de competência. A AV é sobre a Receita Bruta do próprio recorte — a mesma base do ' +
  'restante da página.'

/** Cabeçalho na régua EXATA da tabela densa (10px, semibold, caixa alta). */
function Th({ children, alinhamento, titulo }: { children: string; alinhamento: 'esquerda' | 'direita'; titulo?: string }) {
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

const BG_LINHA = 'bg-band-soft'
const CELULA = `h-9 ${BG_LINHA} border-b border-b-wt-border px-3.5 font-semibold tabular-nums whitespace-nowrap`

function CelulaValor({ valor }: { valor: number | null }) {
  return (
    <td className={`${CELULA} ${corPorSinal('sub', valor)}`}>
      <ConteudoContabil valor={valor} />
    </td>
  )
}

/** Percentual (Δ% ou AV) — neutro, alinhado à direita.
 *
 *  A cor por sinal fica de fora de propósito: numa linha de despesa a AV é
 *  estruturalmente negativa e pintá-la de vermelho sugeriria alerta onde só há
 *  composição. O Δ%, por sua vez, tem sinal ambíguo (cair 10% é bom numa despesa e
 *  ruim numa receita) — a leitura é do usuário. */
function CelulaPct({ pct }: { pct: number | null }) {
  return <td className={`${CELULA} text-right text-text-secondary`}>{fmtAv(pct)}</td>
}

/** Dois últimos dígitos do ano — a convenção da visão Consolidado. */
const aa = (ano: number) => String(ano).slice(2)

interface Props {
  linhas: LinhaChave[]
  /** Rótulo da janela, para o subtítulo (ex.: "jan–ago"). */
  janela: string
}

export default function LinhasChaveCompetencia({ linhas, janela }: Props) {
  if (linhas.length === 0) return null

  // As colunas saem da PRIMEIRA linha: todas as oito compartilham os mesmos anos (é o
  // mesmo conjunto de payloads), então derivar daqui evita repassar a lista de anos por
  // fora e as duas se desencontrarem.
  const anosCheios = linhas[0].cheios.map(c => c.ano)
  const anosYtd = linhas[0].ytd.map(y => y.ano)
  const temDelta = anosYtd.length >= 2

  return (
    <div className="rounded-xl bg-surface p-5 shadow-sm">
      <div className="mb-4">
        <div className="mb-1 flex items-center gap-1.5">
          <h2 className="text-[15px] font-semibold text-text-primary">Linhas-chave</h2>
          <Tooltip conteudo={AJUDA} className="z-30 w-72 !whitespace-normal font-normal normal-case tracking-normal leading-snug">
            <button
              type="button"
              aria-label={`Linhas-chave: ${AJUDA}`}
              className="foco-neutro inline-flex h-3 w-3 items-center justify-center rounded-full border border-zinc-300 text-[8px] font-semibold leading-none text-zinc-400"
            >
              ?
            </button>
          </Tooltip>
        </div>
        <p className="text-[11px] text-text-secondary">
          YTD de {janela} · AV sobre a Receita Bruta do próprio recorte
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-wt-border bg-band">
        <div className="pb-1.5">
          <ScrollAutoHide eixo="x" className="pb-3.5">
            <table className="w-full border-separate border-spacing-0 text-[13px]">
              <thead>
                <tr>
                  <Th alinhamento="esquerda">Linha</Th>
                  {anosCheios.map(a => (
                    <Th key={`cheio-${a}`} alinhamento="direita" titulo={`${a} — ano inteiro (encerrado)`}>
                      {String(a)}
                    </Th>
                  ))}
                  {anosYtd.map(a => (
                    <Th key={`ytd-${a}`} alinhamento="direita" titulo={`${a}, janela ${janela} — a mesma em todos os anos`}>
                      {`YTD ${aa(a)}`}
                    </Th>
                  ))}
                  {temDelta && (
                    <Th
                      alinhamento="direita"
                      titulo={`Variação do YTD de ${anosYtd[0]} para ${anosYtd.at(-1)}, na mesma janela`}
                    >
                      {`Δ% ${aa(anosYtd.at(-1)!)}×${aa(anosYtd[0])}`}
                    </Th>
                  )}
                  {anosYtd.map(a => (
                    <Th key={`av-${a}`} alinhamento="direita" titulo={`Participação na Receita Bruta do YTD ${a}`}>
                      {`AV% ${aa(a)}`}
                    </Th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {linhas.map((l, i) => {
                  const ultima = i === linhas.length - 1
                  return (
                    <tr key={l.chave} className={ultima ? '[&>td]:border-b-0' : undefined}>
                      <td className={`h-9 ${BG_LINHA} border-b border-b-wt-border pl-3 pr-3`}>
                        <span
                          className={`flex items-baseline gap-1.5 truncate uppercase tracking-[0.05em] text-[11px] ${
                            l.destaque ? 'font-semibold text-text-primary' : 'font-medium text-text-secondary'
                          }`}
                        >
                          {l.rotulo}
                        </span>
                      </td>
                      {l.cheios.map(c => <CelulaValor key={`c-${c.ano}`} valor={c.valor} />)}
                      {l.ytd.map(y => <CelulaValor key={`y-${y.ano}`} valor={y.valor} />)}
                      {temDelta && <CelulaPct pct={l.deltaPct} />}
                      {l.ytd.map(y => <CelulaPct key={`a-${y.ano}`} pct={y.av} />)}
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
