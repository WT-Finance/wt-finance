import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

// v5.1.4/M2 — PROVA da virada (migration 0181), ISOLADA e SEM tocar produção.
// Aplica o UP da migration dentro de uma transação, chama get_executiva_kpis__nucleo
// (que passa a ler o espelho Monde) e prova que os totais == monde.mv_vendas_diarias —
// depois ROLLBACK. Roda verde ANTES do flip (o flip real é gate do Yan). Pula offline.
//
// Precisa de SUPABASE_DB_URL (o teste de contrato usa REST; este precisa de transação,
// só possível via conexão pg). É o único teste pg do projeto — documentado aqui.

const DB = process.env.SUPABASE_DB_URL
const require = createRequire(process.cwd() + '/')

// Mês FECHADO de referência (o espelho cobre 2025-01→2026-07).
const P = { from: '2025-06-01', to: '2025-06-30', mes: '2025-06' }
const SETORES = ['todos', 'Lazer', 'Weddings', 'Corporativo'] as const

describe.skipIf(!DB)('v5.1.4 — paridade pós-virada (get_executiva_kpis lê o Monde)', () => {
  it('após o repoint (em tx, rollback): get_executiva_kpis == monde.mv_vendas_diarias, Group + setores', async () => {
    const pg = require('pg')
    const c = new pg.Client({ connectionString: DB })
    await c.connect()
    try {
      const up = readFileSync('supabase/migrations/0181_virada_fonte_monde.sql', 'utf8').split('/* ===')[0]

      // verdade do espelho: agregação direta de monde.mv_vendas_diarias no mês
      const comp = await c.query(
        `select setor_macro macro, sum(valor_total)::float fat, sum(receitas)::float rec, sum(vendas_count)::int v
         from monde.mv_vendas_diarias where to_char(data_venda,'YYYY-MM')=$1 group by 1`, [P.mes])
      const rows = comp.rows as Array<{ macro: string; fat: number; rec: number; v: number }>
      const byMac: Record<string, { fat: number; rec: number; v: number }> = {}
      for (const r of rows) byMac[r.macro] = { fat: r.fat, rec: r.rec, v: r.v }
      const grp = rows.reduce((a, r) => ({ fat: a.fat + r.fat, rec: a.rec + r.rec, v: a.v + r.v }), { fat: 0, rec: 0, v: 0 })
      const esperado = (s: string) => s === 'todos' ? grp : byMac[s]

      await c.query('BEGIN')
      await c.query(up) // aplica o flip DENTRO da transação
      const got: Record<string, { fat: number; rec: number; v: number }> = {}
      for (const s of SETORES) {
        const r = await c.query(
          `select public.get_executiva_kpis__nucleo($1,$2,$3,$4,$5,$6,$7) k`,
          [P.from, P.to, s, '2025-05-01', '2025-05-31', '2024-06-01', '2024-06-30'])
        const k = r.rows[0].k
        got[s] = { fat: Number(k.faturamento.valor), rec: Number(k.receita.valor), v: Number(k.vendas.valor) }
      }
      await c.query('ROLLBACK') // produção intocada

      for (const s of SETORES) {
        const e = esperado(s)
        expect(Math.abs(got[s].fat - e.fat), `${s} faturamento`).toBeLessThan(0.05)
        expect(Math.abs(got[s].rec - e.rec), `${s} receita`).toBeLessThan(0.05)
        expect(got[s].v, `${s} vendas`).toBe(e.v)
      }
    } finally {
      await c.end()
    }
  })
})
