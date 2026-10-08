// Formatação de percentuais da página "Gastos de Marketing" (v6.3.0) — módulo PURO.
// Valores monetários usam `fmtBRL2`/`<ValorContabil>` de `@/lib/fmt` e `@/components/shared`;
// aqui só o que o `fmt` central não cobre (percentual com sinal e travessão).

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

/** Variação com sinal: "+12,3%" / "-12,3%" / "0,0%"; `null` → travessão. */
export function fmtDeltaPct(v: number | null): string {
  if (v === null) return '—'
  const r = umaCasa(v)
  return `${r > 0 ? '+' : ''}${fmtAxisPct(r, 1)}`
}
