import MetaProgressBar from '@/components/shared/meta-progress-bar'
import { corComparacao, corComparacaoValor } from '@/lib/metas/cor-comparacao'
import { fmtMi } from '@/lib/fmt'
import type { AcompanhamentoData, PainelSetor } from '@/components/metas/tipos'

// Conteúdo de UM slide do carrossel do Modo TV (v5.6.4) — faixa Group + grid de 3 cards
// setoriais. EXTRAÍDO de tv-tela.tsx (era o corpo inteiro da tela antes do carrossel mês →
// trimestre → ano); a composição visual é a MESMA de sempre, só ganhou um lar próprio para
// ser reaproveitada 1× por recorte dentro de `<TvCarrossel>`. Puro/apresentacional (sem
// estado/efeito) — içado ao módulo, nunca definido dentro do render de outro componente.

const pctRound = (v: number | null): string => (v == null ? '—' : `${Math.round(v)}%`)
const fmtMiOuTraco = (v: number | null): string => (v == null ? '—' : fmtMi(v))

/** Fração da meta esperada por agora (esperado é LINEAR) = % do período decorrido.
 *  Exportada: tv-tela.tsx reusa para colorir a seta da legenda do rodapé pelo slide ATIVO. */
export function pctEsperado(p: PainelSetor): number | null {
  return p.ritmo.metaPeriodo > 0 ? (p.ritmo.esperadoAteHoje / p.ritmo.metaPeriodo) * 100 : null
}

function barra(p: PainelSetor, altura: number, setaEscala: number) {
  return (
    <MetaProgressBar
      pctMeta={p.ritmo.pctMeta}
      pctEsperado={pctEsperado(p) ?? 0}
      cor={p.cor}
      altura={altura}
      setaEscala={setaEscala}
      corSeta={corComparacaoValor(p.ritmo.pctMeta, pctEsperado(p))}
      mostrarTooltip={false}
      pctDecorrido={p.ritmo.pctDecorrido}
      esperado={p.ritmo.esperadoAteHoje}
      realizado={p.ritmo.realizado}
    />
  )
}

export default function TvSlideConteudo({ data }: { data: AcompanhamentoData }) {
  const [group, ...setores] = data.setores
  if (!group) return null

  const corGroup = corComparacao(group.ritmo.pctMeta, pctEsperado(group))

  return (
    <>
      {/* Faixa GROUP */}
      <section className="rounded-2xl bg-white px-10 py-8 shadow-sm">
        <div className="flex items-end justify-between gap-10">
          <div>
            <p className="text-2xl font-semibold" style={{ color: group.cor }}>{group.display}</p>
            {/* respiro abaixo de "Group" (coerente com os cards setoriais). SÓ o valor à esq. */}
            <p className="mt-5 text-6xl font-bold tabular-nums" style={{ color: group.cor }}>{fmtMiOuTraco(group.faturamento)}</p>
          </div>
          {/* À direita: "% da meta" + "de R$ {meta}" na linha de baixo. */}
          <div className="whitespace-nowrap text-right">
            <div>
              <span className={`text-5xl font-bold tabular-nums ${corGroup}`}>{pctRound(group.ritmo.pctMeta)}</span>
              <span className="ml-3 text-xl text-[var(--text-muted)]">da meta</span>
            </div>
            <p className="mt-1 text-xl text-[var(--text-muted)]">de <span className="tabular-nums">{fmtMiOuTraco(group.ritmo.metaPeriodo)}</span></p>
          </div>
        </div>
        <div className="mt-6">{barra(group, 22, 2)}</div>
      </section>

      {/* 3 cards setoriais */}
      <section className="mt-6 grid flex-1 grid-cols-3 gap-6">
        {setores.map(s => {
          const cor = corComparacao(s.ritmo.pctMeta, pctEsperado(s))
          return (
            <div key={s.key} className="flex flex-col rounded-2xl bg-white px-8 py-7 shadow-sm">
              <p className="text-3xl font-semibold" style={{ color: s.cor }}>{s.display}</p>
              {/* Cluster centrado. Mesmo FORMATO do Group: só o valor à esquerda; "% da meta"
                  + "de R$ {meta}" empilhados à direita, com o bloco de 2 linhas proporcional
                  à altura do valor do faturamento (alinhamento visual). */}
              <div className="flex flex-1 flex-col justify-center">
                <div className="flex items-end justify-between gap-4">
                  <span className="whitespace-nowrap text-5xl font-bold tabular-nums" style={{ color: s.cor }}>{fmtMiOuTraco(s.faturamento)}</span>
                  <div className="whitespace-nowrap text-right">
                    <div>
                      <span className={`text-3xl font-bold tabular-nums ${cor}`}>{pctRound(s.ritmo.pctMeta)}</span>
                      <span className="ml-2 text-base text-[var(--text-muted)]">da meta</span>
                    </div>
                    <p className="mt-0.5 text-base text-[var(--text-muted)]">de <span className="tabular-nums">{fmtMiOuTraco(s.ritmo.metaPeriodo)}</span></p>
                  </div>
                </div>
                <div className="mt-8">{barra(s, 20, 1.8)}</div>
              </div>
            </div>
          )
        })}
      </section>
    </>
  )
}
