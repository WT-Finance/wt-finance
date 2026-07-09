import type { ReactNode } from 'react'
import { Card } from '@/components/ui/card'
import Gauge from '@/components/shared/gauge'
import { fmtMi } from '@/lib/fmt'
import { classificarRitmo } from '@/lib/metas/ritmo'
import type { PainelSetor } from '@/components/metas/tipos'

// Card de UM painel (Group ou setor) do Acompanhamento de Metas (v5.0.0).
// 'grande' (Group) = layout HORIZONTAL no molde do card principal de Weddings:
// gauge à esquerda + 3 colunas de KPI (rótulo uppercase, valor bold, linha YoY).
// 'setor' = card vertical compacto: header colorido + gauge + linhas divididas.
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

/** "YoY: ↑ +4,2%" no padrão de KpiColuna (prefixo neutro, variação colorida). */
function Yoy({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-xs text-zinc-400">YoY: —</span>
  const isPos = pct >= 0
  return (
    <span className="text-xs text-zinc-400">
      YoY:{' '}
      <span className={isPos ? 'text-success' : 'text-danger'}>
        {isPos ? '↑' : '↓'} {isPos ? '+' : '−'}{fmtPct1(Math.abs(pct))}
      </span>
    </span>
  )
}

/** Indicador da Receita realizada contra o alvo de %Rec do período. */
function alvoIndicador(margemPct: number | null, pctReceitaAlvo: number | null): ReactNode {
  if (margemPct == null) return null
  if (pctReceitaAlvo == null) return null
  if (margemPct >= pctReceitaAlvo) {
    return <span className="text-success">✓ alvo</span>
  }
  const delta = margemPct - pctReceitaAlvo
  return <span className="text-danger">{fmtNum1(delta)} p.p. do alvo</span>
}

/** Coluna de KPI do card Group — tipografia do card principal (KpiColuna), valor neutro. */
function KpiBloco({ label, valor, sub }: { label: string; valor: string; sub?: ReactNode }) {
  return (
    <div className="min-w-0 px-5 first:pl-0 last:pr-0">
      <p className="mb-1 text-[13px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{label}</p>
      <p className="mb-1 text-2xl font-bold tabular-nums text-[var(--text-primary)]">{valor}</p>
      {sub != null && <div className="flex flex-wrap items-center gap-x-2 text-xs text-zinc-400">{sub}</div>}
    </div>
  )
}

function LinhaValor({ label, valor, extra }: { label: string; valor: ReactNode; extra?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between py-1.5 text-[13px]">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className="flex items-baseline gap-2 font-medium tabular-nums text-[var(--text-primary)]">
        {valor}
        {extra != null && <span className="text-xs font-normal">{extra}</span>}
      </span>
    </div>
  )
}

interface Props {
  painel:  PainelSetor
  tamanho: 'grande' | 'setor'
}

export default function MetaCard({ painel, tamanho }: Props) {
  const { display, cor, faturamento, faturamentoYoY, receita, receitaYoY, margemPct, ritmo } = painel

  const tick = ritmo.metaPeriodo > 0
    ? { pct: (ritmo.esperadoAteHoje / ritmo.metaPeriodo) * 100, label: fmtMi(ritmo.esperadoAteHoje) }
    : undefined

  const corReguaRitmo = corRitmo(ritmo.ritmoPct)
  const centroTitulo = ritmo.pctMeta == null ? '—' : `${Math.round(ritmo.pctMeta)}%`
  const ritmoLabel = ritmo.ritmoPct == null ? '—' : `${Math.round(ritmo.ritmoPct)}%`
  const centroSubtitulo = (
    <>da meta · ritmo <span className={`font-semibold ${corReguaRitmo}`}>{ritmoLabel}</span></>
  )
  const ariaLabel =
    `${display}: ${centroTitulo} da meta do período, ritmo ${ritmoLabel === '—' ? 'indisponível' : ritmoLabel}`

  if (tamanho === 'grande') {
    return (
      <Card className="px-6 py-5">
        <div className="flex flex-col items-center gap-8 lg:flex-row">
          {/* Gauge à esquerda, com a identidade do painel */}
          <div className="flex w-full max-w-[300px] shrink-0 flex-col items-center lg:w-[300px]">
            <p className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              {display}
            </p>
            <Gauge
              tamanho="grande"
              cor={cor}
              valorPct={ritmo.pctMeta ?? 0}
              tick={tick}
              centroTitulo={centroTitulo}
              centroSubtitulo={centroSubtitulo}
              ariaLabel={ariaLabel}
            />
          </div>

          {/* 3 colunas de KPI no molde do card principal de Weddings */}
          <div className="grid w-full flex-1 grid-cols-1 gap-y-5 sm:grid-cols-3 sm:divide-x sm:divide-zinc-100">
            <KpiBloco
              label="Faturamento"
              valor={fmtMiOuTraco(faturamento)}
              sub={<Yoy pct={faturamentoYoY} />}
            />
            <KpiBloco
              label="Meta do período"
              valor={fmtMi(ritmo.metaPeriodo)}
              sub={<span>esperado até hoje: <span className="font-medium text-zinc-500">{fmtMi(ritmo.esperadoAteHoje)}</span></span>}
            />
            <KpiBloco
              label="Receita"
              valor={fmtMiOuTraco(receita)}
              sub={
                <>
                  <Yoy pct={receitaYoY} />
                  {margemPct != null && (
                    <span>
                      margem {fmtPct1(margemPct)}
                      {alvoIndicador(margemPct, ritmo.pctReceitaAlvo) != null && (
                        <> · {alvoIndicador(margemPct, ritmo.pctReceitaAlvo)}</>
                      )}
                    </span>
                  )}
                </>
              }
            />
          </div>
        </div>
      </Card>
    )
  }

  return (
    <Card className="flex h-full flex-col px-5 py-4">
      <div className="mb-3 flex items-baseline justify-between">
        <span className="text-[15px] font-semibold" style={{ color: cor }}>{display}</span>
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

      <div className="mt-auto divide-y divide-zinc-50 border-t border-zinc-100 pt-1.5">
        <LinhaValor label="Realizado" valor={fmtMiOuTraco(faturamento)} />
        <LinhaValor label="Meta"      valor={fmtMi(ritmo.metaPeriodo)} />
        <LinhaValor label="Receita"   valor={fmtMiOuTraco(receita)} />
        <LinhaValor
          label="Margem"
          valor={margemPct == null ? '—' : fmtPct1(margemPct)}
          extra={alvoIndicador(margemPct, ritmo.pctReceitaAlvo)}
        />
      </div>
    </Card>
  )
}
