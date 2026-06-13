import { fmtMi } from '@/lib/fmt'
import type { KpiMetrica } from '@/types/api'

// Coluna de KPI do card principal (Faturamento / Receita Bruta / Margem).
// Extraída de weddings-kpis-section (v4.10.1) para reuso no card principal
// genérico de Trips/Corp (KpiPrincipalCard). Valor na cor da aba (var(--brand),
// resolvido por [data-theme]); YoY abaixo. Sem mudança visual em Weddings.
export default function KpiColuna({
  rotulo,
  metrica,
  formato,
  padded,
}: {
  rotulo: string
  metrica: KpiMetrica
  formato: 'brl' | 'pct'
  padded?: boolean
}) {
  const valor  = metrica.valor
  const varYoy = metrica.variacao_yoy

  const fmtValor = (v: number | null) => {
    if (v == null) return '—'
    return formato === 'pct'
      ? `${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
      : fmtMi(v)
  }

  const fmtVar = (v: number | null, isPP?: boolean) => {
    if (v == null) return null
    const sinal  = v >= 0 ? '+' : ''
    const sufixo = isPP ? ' p.p.' : '%'
    const f      = `${sinal}${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}${sufixo}`
    return (
      <span className={v >= 0 ? 'text-success' : 'text-danger'}>
        {v >= 0 ? '↑' : '↓'} {f}
      </span>
    )
  }

  return (
    <div className={padded ? 'pl-4' : ''}>
      <p className="text-[14px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1">{rotulo}</p>
      <p className="text-2xl font-bold tabular-nums mb-1" style={{ color: 'var(--brand)' }}>
        {fmtValor(valor)}
      </p>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        {varYoy != null && (
          <span className="text-xs text-zinc-400">
            YoY: {fmtVar(varYoy, metrica.is_pp)}
          </span>
        )}
      </div>
    </div>
  )
}
