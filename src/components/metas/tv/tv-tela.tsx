import Link from 'next/link'
import Image from 'next/image'
import { X } from 'lucide-react'
import MetaProgressBar from '@/components/shared/meta-progress-bar'
import TvFullscreenButton from '@/components/metas/tv/tv-fullscreen-button'
import { corComparacao, corComparacaoValor } from '@/lib/metas/cor-comparacao'
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
      corSeta={corComparacaoValor(p.ritmo.pctMeta, pctEsperado(p))}
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
  const corGroupSeta = corComparacaoValor(group.ritmo.pctMeta, pctEsperado(group))

  // [TESTE v5.1.0] Fundo com blooms suaves das 3 cores de setor (Trips/Weddings/Corp) sobre o
  // off-white da casa — cartões brancos "flutuam" sobre o gradiente. Inline (color-mix + var()).
  // Se não agradar, reverter para `bg-[var(--surface-soft)]`.
  const fundo =
    'radial-gradient(60% 75% at 6% 0%, color-mix(in srgb, var(--marca-lazer) 15%, transparent), transparent 68%),' +
    'radial-gradient(55% 70% at 94% 4%, color-mix(in srgb, var(--marca-weddings) 15%, transparent), transparent 68%),' +
    'radial-gradient(75% 75% at 50% 100%, color-mix(in srgb, var(--marca-corporativo) 12%, transparent), transparent 70%),' +
    'var(--surface-soft)'

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden px-12 py-8 text-[var(--text-primary)]" style={{ background: fundo }}>
      {/* Cabeçalho — logo Janus (não o wordmark escrito) + período à esquerda; à direita a
          data da última atualização + tela cheia + sair. */}
      <header className="flex items-center justify-between gap-6">
        <div className="flex items-center gap-6">
          {/* Lockup duplo [JANUS] | [WELCOME GROUP] — mesma composição dos e-mails internos. */}
          <span className="relative block h-16 w-64">
            <Image src="/logos/logo-janus.svg" alt="Janus" fill priority className="object-contain object-left" />
          </span>
          <span className="h-12 w-px shrink-0 bg-[var(--border-strong)]" aria-hidden />
          {/* Welcome LEVEMENTE menor que o Janus (harmonia óptica — mesma régua dos e-mails). */}
          <span className="relative block h-12 w-60">
            <Image src="/logos/welcome-group.svg" alt="Welcome Group" fill className="object-contain object-left" />
          </span>
          <span className="ml-4 text-2xl text-[var(--text-secondary)]">Metas · {data.periodoLabel}</span>
        </div>
        <div className="flex items-center gap-6">
          {data.ultimaAtualizacao && (
            <span className="text-lg text-[var(--text-muted)]">
              Atualizado em {fmtDataHoraLongoSP(data.ultimaAtualizacao)}
            </span>
          )}
          {/* Ações só-ícone (v5.1.0/checkpoint): tela cheia + X para sair. */}
          <TvFullscreenButton />
          <Link
            href="/metas"
            aria-label="Sair do modo de exibição"
            title="Sair do modo de exibição"
            className="foco-neutro text-[var(--text-muted)] transition-colors hover:text-[var(--text-secondary)]"
          >
            <X size={22} />
          </Link>
        </div>
      </header>

      {/* Faixa GROUP */}
      <section className="mt-8 rounded-2xl bg-white px-10 py-8 shadow-sm">
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

      {/* Legenda fixa no rodapé */}
      <footer className="mt-6 flex items-center justify-center gap-2.5 text-base text-[var(--text-muted)]">
        <span
          aria-hidden
          className="inline-block h-0 w-0"
          style={{ borderStyle: 'solid', borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 8, borderColor: 'transparent', borderTopColor: corGroupSeta }}
        />
        A seta indica o valor esperado para hoje, considerando o período já decorrido no mês.
      </footer>
    </div>
  )
}
