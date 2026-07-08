import type { ReactNode } from 'react'
import { Card } from '@/components/ui/card'
import Gauge from '@/components/shared/gauge'
import { fmtMi } from '@/lib/fmt'
import { classificarRitmo } from '@/lib/metas/ritmo'
import type { PainelSetor } from '@/components/metas/tipos'

// Card de UM painel (Group ou setor) do Acompanhamento de Metas (v5.0.0).
// Reutilizado nos dois tamanhos do mockup: 'grande' (Group, com a faixa de 3 KPIs)
// e 'setor' (Trips/Weddings/Corporativo, com as 3 linhas Realizado/Meta/Receita).
// A régua de status (verde/âmbar/vermelho) SÓ colore o "ritmo X%"/"% do esperado" —
// nunca o arco do Gauge (identidade) nem o resto do card.

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

/** Badge de variação YoY: seta + % (verde ≥0, vermelho <0; "—" se null). */
function Yoy({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-xs text-[var(--text-muted)]">—</span>
  const isPos = pct >= 0
  return (
    <span className={`text-xs ${isPos ? 'text-success' : 'text-danger'}`}>
      {isPos ? '↑' : '↓'} {fmtPct1(Math.abs(pct))}
    </span>
  )
}

/** Comparação da Receita realizada contra o alvo de %Rec do período (ritmo.pctReceitaAlvo). */
function receitaVsAlvo(margemPct: number | null, pctReceitaAlvo: number | null): ReactNode {
  if (margemPct == null) return null
  if (pctReceitaAlvo == null) {
    return <span className="text-[var(--text-muted)]">{fmtPct1(margemPct)} rec</span>
  }
  if (margemPct >= pctReceitaAlvo) {
    return <span className="text-success">✓ alvo</span>
  }
  const delta = margemPct - pctReceitaAlvo
  return <span className="text-danger">{fmtNum1(delta)} p.p.</span>
}

function KpiBloco({ label, valor, sub }: { label: string; valor: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-2 py-1 text-center">
      <span className="text-xs text-[var(--text-muted)]">{label}</span>
      <span className="mt-1 text-lg font-semibold tabular-nums text-[var(--text-primary)]">{valor}</span>
      {sub != null && <span className="mt-0.5 text-2xs">{sub}</span>}
    </div>
  )
}

function LinhaValor({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className="font-medium tabular-nums text-[var(--text-primary)]">{valor}</span>
    </div>
  )
}

interface Props {
  painel:  PainelSetor
  tamanho: 'grande' | 'setor'
}

export default function MetaCard({ painel, tamanho }: Props) {
  const { display, cor, faturamento, faturamentoYoY, receita, margemPct, ritmo } = painel

  const tick = ritmo.metaPeriodo > 0
    ? { pct: (ritmo.esperadoAteHoje / ritmo.metaPeriodo) * 100, label: fmtMi(ritmo.esperadoAteHoje) }
    : undefined

  const corReguaRitmo = corRitmo(ritmo.ritmoPct)
  const centroTitulo = ritmo.pctMeta == null ? '—' : `${Math.round(ritmo.pctMeta)}%`
  const ritmoLabel = ritmo.ritmoPct == null ? '—' : `${Math.round(ritmo.ritmoPct)}%`
  const centroSubtitulo = (
    <>da meta · ritmo <span className={corReguaRitmo}>{ritmoLabel}</span></>
  )
  const ariaLabel =
    `${display}: ${centroTitulo} da meta do período, ritmo ${ritmoLabel === '—' ? 'indisponível' : ritmoLabel}`

  if (tamanho === 'grande') {
    return (
      <Card className="flex flex-col items-center">
        <p className="mb-3 text-sm font-medium text-[var(--text-muted)]">{display}</p>

        <Gauge
          tamanho="grande"
          cor={cor}
          valorPct={ritmo.pctMeta ?? 0}
          tick={tick}
          centroTitulo={centroTitulo}
          centroSubtitulo={centroSubtitulo}
          ariaLabel={ariaLabel}
        />

        <div className="mt-6 grid w-full grid-cols-3 divide-x divide-zinc-100 border-t border-zinc-100 pt-4">
          <KpiBloco
            label="Faturamento"
            valor={fmtMiOuTraco(faturamento)}
            sub={<Yoy pct={faturamentoYoY} />}
          />
          <KpiBloco
            label="Meta do período"
            valor={fmtMi(ritmo.metaPeriodo)}
            sub={<span className="text-[var(--text-muted)]">esperado até hoje: {fmtMi(ritmo.esperadoAteHoje)}</span>}
          />
          <KpiBloco
            label="Receita"
            valor={fmtMiOuTraco(receita)}
            sub={receitaVsAlvo(margemPct, ritmo.pctReceitaAlvo)}
          />
        </div>
      </Card>
    )
  }

  return (
    <Card className="flex h-full flex-col">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium" style={{ color: cor }}>{display}</span>
        <Yoy pct={faturamentoYoY} />
      </div>

      <Gauge
        tamanho="setor"
        cor={cor}
        valorPct={ritmo.pctMeta ?? 0}
        tick={tick}
        centroTitulo={centroTitulo}
        centroSubtitulo={centroSubtitulo}
        ariaLabel={ariaLabel}
      />

      <div className="mt-4 space-y-1.5 border-t border-zinc-100 pt-3">
        <LinhaValor label="Realizado" valor={fmtMiOuTraco(faturamento)} />
        <LinhaValor label="Meta"      valor={fmtMi(ritmo.metaPeriodo)} />
        <LinhaValor label="Receita"   valor={fmtMiOuTraco(receita)} />
      </div>
    </Card>
  )
}
