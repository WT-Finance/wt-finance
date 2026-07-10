import type { ReactNode } from 'react'
import { Card } from '@/components/ui/card'
import MetaProgressBar from '@/components/shared/meta-progress-bar'
import { fmtMi } from '@/lib/fmt'
import { classificarRitmo } from '@/lib/metas/ritmo'
import type { PainelSetor } from '@/components/metas/tipos'

// Card de UM painel (Group ou setor) do Acompanhamento de Metas (v5.0.0).
// Elemento central = <MetaProgressBar> (barra + tick + tooltip). SEM YoY na
// superfície (decisão v5.0.0: Metas responde "entregamos o combinado?", não
// "melhoramos vs ano passado?"). Margem = delta em p.p. contra o alvo de %Rec,
// colorido pela régua. "% do esperado" (o antigo "ritmo") colorido pela régua.
// A régua só colore "% do esperado" e a margem — nunca a barra (identidade).

const COR_REGUA: Record<'verde' | 'ambar' | 'vermelho', string> = {
  verde:     'text-success',
  ambar:     'text-warning',
  vermelho:  'text-danger',
}

/** Classe Tailwind para a régua de ritmo — null (sem meta/sem dado) cai no neutro.
 *  Exportado para o gráfico "Ritmo do período" (ritmo-chart.tsx) reusar a MESMA régua. */
export function corRitmo(pct: number | null): string {
  const status = classificarRitmo(pct)
  return status ? COR_REGUA[status] : 'text-[var(--text-muted)]'
}

const fmtNum1 = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const fmtPct1 = (v: number) => `${fmtNum1(v)}%`
const fmtMiOuTraco = (v: number | null): string => (v == null ? '—' : fmtMi(v))
const round = (v: number | null): string => (v == null ? '—' : `${Math.round(v)}%`)

/** "82% do esperado", com o número colorido pela régua e "do esperado" discreto. */
function EsperadoLabel({ pct }: { pct: number | null }) {
  return (
    <span className="text-sm">
      <span className={`font-semibold ${corRitmo(pct)}`}>{round(pct)}</span>{' '}
      <span className="text-[var(--text-muted)]">do esperado</span>
    </span>
  )
}

/** "13,9% −0,1 p.p. vs alvo 14%" — margem realizada + delta em p.p. contra o alvo
 *  (colorido: acima=success, abaixo=danger). `compacto` (cards setoriais) omite o
 *  "vs alvo X%" p/ caber numa linha — o delta+cor já dizem acima/abaixo. Sem alvo → só a margem. */
function Margem({ margemPct, alvo, compacto }: { margemPct: number | null; alvo: number | null; compacto?: boolean }) {
  if (margemPct == null) return <span className="text-[var(--text-primary)]">—</span>
  if (alvo == null) {
    return <span className="tabular-nums text-[var(--text-primary)]">{fmtPct1(margemPct)}</span>
  }
  const delta = margemPct - alvo
  const cor = delta >= 0 ? 'text-success' : 'text-danger'
  const sinal = delta >= 0 ? '+' : '−'
  return (
    <span className="whitespace-nowrap tabular-nums text-[var(--text-primary)]">
      {fmtPct1(margemPct)}{' '}
      <span className={`text-xs font-medium ${cor}`}>{sinal}{fmtNum1(Math.abs(delta))} p.p.</span>
      {!compacto && <> <span className="text-xs text-[var(--text-muted)]">vs alvo {fmtPct1(alvo)}</span></>}
    </span>
  )
}

function Klabel({ children }: { children: ReactNode }) {
  return <p className="text-[13px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{children}</p>
}

interface Props {
  painel:  PainelSetor
  tamanho: 'grande' | 'setor'
}

export default function MetaCard({ painel, tamanho }: Props) {
  const { display, cor, faturamento, receita, margemPct, ritmo } = painel

  const pctEsperadoTick = ritmo.metaPeriodo > 0 ? (ritmo.esperadoAteHoje / ritmo.metaPeriodo) * 100 : 0
  const barra = (altura: number) => (
    <MetaProgressBar
      pctMeta={ritmo.pctMeta}
      pctEsperado={pctEsperadoTick}
      cor={cor}
      altura={altura}
      pctDecorrido={ritmo.pctDecorrido}
      esperado={ritmo.esperadoAteHoje}
      realizado={ritmo.realizado}
    />
  )

  if (tamanho === 'grande') {
    return (
      <Card className="px-6 py-5">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
          {display === 'Group' ? 'Welcome Group' : display}
        </p>

        <div className="mb-2 flex items-end justify-between gap-6">
          <div>
            <Klabel>Faturamento</Klabel>
            <p className="mt-1 text-3xl font-bold tabular-nums text-[var(--text-primary)]">{fmtMiOuTraco(faturamento)}</p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">Meta: <span className="tabular-nums">{fmtMi(ritmo.metaPeriodo)}</span></p>
          </div>
          <div className="text-right">
            <p><span className="text-2xl font-bold tabular-nums text-[var(--text-primary)]">{round(ritmo.pctMeta)}</span> <span className="text-sm text-[var(--text-muted)]">da meta</span></p>
            <p className="mt-0.5"><EsperadoLabel pct={ritmo.ritmoPct} /></p>
          </div>
        </div>

        {barra(12)}

        <div className="mt-4 grid grid-cols-2 divide-x divide-zinc-100 border-t border-zinc-100 pt-4">
          <div className="pr-5">
            <Klabel>Receita</Klabel>
            <p className="mt-1 text-xl font-bold tabular-nums text-[var(--text-primary)]">{fmtMiOuTraco(receita)}</p>
          </div>
          <div className="pl-5">
            <Klabel>Margem</Klabel>
            <p className="mt-1 text-xl font-bold"><Margem margemPct={margemPct} alvo={ritmo.pctReceitaAlvo} /></p>
          </div>
        </div>
      </Card>
    )
  }

  return (
    <Card className="flex h-full flex-col px-5 py-4">
      <p className="text-[15px] font-semibold" style={{ color: cor }}>{display}</p>

      <div className="mt-2 flex items-baseline justify-between gap-3">
        <span className="text-2xl font-bold tabular-nums text-[var(--text-primary)]">{fmtMiOuTraco(faturamento)}</span>
        <span className="text-sm"><span className="font-semibold tabular-nums text-[var(--text-primary)]">{round(ritmo.pctMeta)}</span> <span className="text-[var(--text-muted)]">da meta</span></span>
      </div>
      <div className="mt-0.5 flex items-baseline justify-between gap-3 text-sm">
        <span className="text-[var(--text-muted)]">Meta: <span className="tabular-nums">{fmtMi(ritmo.metaPeriodo)}</span></span>
        <EsperadoLabel pct={ritmo.ritmoPct} />
      </div>

      <div className="mt-3">{barra(10)}</div>

      <div className="mt-auto flex items-baseline justify-between gap-3 border-t border-zinc-100 pt-3 text-[13px]">
        <span className="whitespace-nowrap text-[var(--text-muted)]">Receita <span className="font-medium tabular-nums text-[var(--text-primary)]">{fmtMiOuTraco(receita)}</span></span>
        <span className="text-[var(--text-muted)]">Margem <Margem margemPct={margemPct} alvo={ritmo.pctReceitaAlvo} compacto /></span>
      </div>
    </Card>
  )
}
