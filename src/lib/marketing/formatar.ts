// Formatação de percentuais da página "Despesas de Marketing" (v6.3.0) — módulo PURO.
// Valores monetários usam `fmtBRL2`/`<ValorContabil>` de `@/lib/fmt` e `@/components/shared`;
// aqui só o que o `fmt` central não cobre (percentual com travessão).

import { fmtAxisPct } from '@/lib/fmt'

/** Arredonda a 1 casa e normaliza o -0 ("-0,0%" nunca aparece). */
function umaCasa(v: number): number {
  const r = Math.round(v * 10) / 10
  return r === 0 ? 0 : r
}

/** Percentual sem sinal explícito de positivo: "12,3%"; `null` → travessão. */
export function fmtPct(v: number | null): string {
  return v === null ? '—' : fmtAxisPct(umaCasa(v), 1)
}

const nfModulo = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

/** Variação percentual COM sinal, no molde do Δ% da DRE: "+16,3%" / "−34,5%" / "0,0%". O sinal é
 *  escrito aqui (o "−" é o menos TIPOGRÁFICO, U+2212 — não depende do locale do `Intl`, que em
 *  pt-BR pode usar o hífen) sobre o módulo formatado; zero fica sem sinal e "−0,0%" nunca aparece.
 *  `null` → travessão. */
export function fmtDeltaPct(v: number | null): string {
  if (v === null) return '—'
  const r = umaCasa(v)
  const sinal = r > 0 ? '+' : r < 0 ? '−' : ''
  return `${sinal}${nfModulo.format(Math.abs(r))}%`
}
