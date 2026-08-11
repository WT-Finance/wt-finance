import { SETOR_MARCA_COLORS } from '@/lib/config'
import type { MetaMensal } from '@/lib/metas/ritmo'

// Painéis (setores) e agregação de metas do Acompanhamento — CLIENT-SAFE (v5.6.1).
// Extraído de carregar-acompanhamento.ts (que é `server-only`) para ser reusado
// também pela seção Comparativo, que roda no client. Nenhuma mudança de
// comportamento — mesmos PAINEIS/MetaRow/metasDoSetor de antes.

// Ordem e identidade dos painéis. Group = barra neutra; setores usam a cor de
// identidade cross-setor (SETOR_MARCA_COLORS). Chave = nome interno do banco.
export const PAINEIS: { key: string; display: string; cor: string }[] = [
  { key: 'todos',       display: 'Group',       cor: 'var(--text-muted)' },
  { key: 'Lazer',       display: 'Trips',       cor: SETOR_MARCA_COLORS.Lazer },
  { key: 'Weddings',    display: 'Weddings',    cor: SETOR_MARCA_COLORS.Weddings },
  { key: 'Corporativo', display: 'Corporativo', cor: SETOR_MARCA_COLORS.Corporativo },
]

export interface MetaRow {
  ano: number
  setor_nome: string
  mes: number
  valor_meta: number
  pct_receita: number | null
}

/** Metas mensais de um setor (Group = soma por mês; pct ponderado por VT). */
export function metasDoSetor(rows: MetaRow[], key: string): MetaMensal[] {
  if (key !== 'todos') {
    return rows
      .filter(r => r.setor_nome === key)
      .map(r => ({ ano: r.ano, mes: r.mes, valorMeta: r.valor_meta, pctReceita: r.pct_receita }))
  }
  // Group: soma VT por (ano,mes); pct = média ponderada por VT (só meses/setores com alvo).
  const porMes = new Map<string, { ano: number; mes: number; vt: number; vtComPct: number; recAlvo: number }>()
  for (const r of rows) {
    const k = `${r.ano}-${r.mes}`
    const acc = porMes.get(k) ?? { ano: r.ano, mes: r.mes, vt: 0, vtComPct: 0, recAlvo: 0 }
    acc.vt += r.valor_meta
    if (r.pct_receita != null) {
      acc.vtComPct += r.valor_meta
      acc.recAlvo += r.valor_meta * (r.pct_receita / 100)
    }
    porMes.set(k, acc)
  }
  return [...porMes.values()].map(a => ({
    ano: a.ano,
    mes: a.mes,
    valorMeta: a.vt,
    pctReceita: a.vtComPct > 0 ? (a.recAlvo / a.vtComPct) * 100 : null,
  }))
}
