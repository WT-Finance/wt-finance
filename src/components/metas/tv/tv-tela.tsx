import Link from 'next/link'
import MetaProgressBar from '@/components/shared/meta-progress-bar'
import TvAutoRefresh from '@/components/metas/tv/tv-auto-refresh'
import { corComparacao } from '@/lib/metas/cor-comparacao'
import { fmtMi, fmtDataHoraLongoSP } from '@/lib/fmt'
import type { AcompanhamentoData, PainelSetor } from '@/components/metas/tipos'

// ── Modo TV (v5.1.0) — pele de exibição do Acompanhamento para a parede do comercial ──
// Server Component (mesma AcompanhamentoData da /metas — fonte única). 16:9, tema claro,
// ZERO interação: sem pills/tooltip/hover. A leitura de ritmo vem da SETA + da legenda fixa
// no rodapé (o balão do app some). Paridade visual: barra na cor do setor + seta + "% da
// meta" colorido pela MESMA régua (corComparacao). Group = neutro. Escalado para a parede.

const pctRound = (v: number | null): string => (v == null ? '—' : `${Math.round(v)}%`)
const fmtMiOuTraco = (v: number | null): string => (v == null ? '—' : fmtMi(v))

/** Fração da meta esperada por agora (esperado é LINEAR) = % do período decorrido. */
function pctEsperado(p: PainelSetor): number | null {
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
      mostrarTooltip={false}
      pctDecorrido={p.ritmo.pctDecorrido}
      esperado={p.ritmo.esperadoAteHoje}
      realizado={p.ritmo.realizado}
    />
  )
}

export default function TvTela({ data }: { data: AcompanhamentoData }) {
  const [group, ...setores] = data.setores
  if (!group) return null

  const corGroup = corComparacao(group.ritmo.pctMeta, pctEsperado(group))

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-[var(--surface-soft)] px-12 py-8 text-[var(--text-primary)]">
      {/* Cabeçalho */}
      <header className="flex items-baseline justify-between gap-6">
        <div className="flex items-baseline gap-6">
          <span className="text-4xl font-[800] uppercase tracking-[4px]" style={{ color: 'var(--text-muted)' }}>Janus</span>
          <span className="text-2xl text-[var(--text-secondary)]">Metas · {data.periodoLabel}</span>
        </div>
        <div className="flex items-baseline gap-8">
          {data.ultimaAtualizacao && (
            <span className="text-lg text-[var(--text-muted)]">
              Atualizado em {fmtDataHoraLongoSP(data.ultimaAtualizacao)}
            </span>
          )}
          <Link href="/metas" className="foco-neutro text-base text-[var(--text-muted)] transition-colors hover:text-[var(--text-secondary)]">
            Sair do modo TV
          </Link>
        </div>
      </header>

      {/* Faixa GROUP */}
      <section className="mt-8 rounded-2xl bg-white px-10 py-7 shadow-sm">
        <div className="flex items-end justify-between gap-10">
          <div>
            <p className="text-2xl font-semibold" style={{ color: group.cor }}>{group.display}</p>
            <p className="mt-1 text-6xl font-bold tabular-nums" style={{ color: group.cor }}>{fmtMiOuTraco(group.faturamento)}</p>
            <p className="mt-2 text-xl text-[var(--text-muted)]">Meta do mês: <span className="tabular-nums">{fmtMiOuTraco(group.ritmo.metaPeriodo)}</span></p>
          </div>
          <div className="whitespace-nowrap text-right">
            <span className={`text-7xl font-bold tabular-nums ${corGroup}`}>{pctRound(group.ritmo.pctMeta)}</span>
            <span className="ml-3 text-2xl text-[var(--text-muted)]">da meta</span>
          </div>
        </div>
        <div className="mt-5">{barra(group, 22, 2)}</div>
      </section>

      {/* 3 cards setoriais */}
      <section className="mt-6 grid flex-1 grid-cols-3 gap-6">
        {setores.map(s => {
          const cor = corComparacao(s.ritmo.pctMeta, pctEsperado(s))
          return (
            <div key={s.key} className="flex flex-col rounded-2xl bg-white px-8 py-7 shadow-sm">
              <p className="text-3xl font-semibold" style={{ color: s.cor }}>{s.display}</p>
              {/* Cluster valor + % + meta + barra, centrado verticalmente no card. */}
              <div className="flex flex-1 flex-col justify-center">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="whitespace-nowrap text-5xl font-bold tabular-nums" style={{ color: s.cor }}>{fmtMiOuTraco(s.faturamento)}</span>
                  <span className="whitespace-nowrap">
                    <span className={`text-5xl font-bold tabular-nums ${cor}`}>{pctRound(s.ritmo.pctMeta)}</span>
                    <span className="ml-2 text-lg text-[var(--text-muted)]">da meta</span>
                  </span>
                </div>
                <p className="mt-3 text-xl text-[var(--text-muted)]">de <span className="tabular-nums">{fmtMiOuTraco(s.ritmo.metaPeriodo)}</span></p>
                <div className="mt-8">{barra(s, 20, 1.8)}</div>
              </div>
            </div>
          )
        })}
      </section>

      {/* Legenda fixa no rodapé */}
      <footer className="mt-6 flex items-center justify-center gap-2.5 text-base text-[var(--text-muted)]">
        <span
          aria-hidden
          className="inline-block h-0 w-0"
          style={{ borderStyle: 'solid', borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 8, borderColor: 'transparent', borderTopColor: 'var(--border)' }}
        />
        A seta indica o valor esperado para hoje, considerando o período já decorrido no mês.
      </footer>

      <TvAutoRefresh />
    </div>
  )
}
