// API Route de ingestão do Monde (v5.1.2/M5). runtime nodejs, server-only.
// Aciona `ingestWindow` (lista→detalhe→transform→staging→promover→refresh) com um client
// SERVICE-ROLE (as RPCs monde_ingest_* são service_role-only). Idempotente por raw_hash.
//
// Auth (duas portas):
//   • Vercel Cron → header `Authorization: Bearer $CRON_SECRET` (Vercel injeta quando CRON_SECRET
//     está no ambiente). Sem sessão/cookies.
//   • Disparo manual (backfill/window) → sessão com área `admin/uploads` (requireAreaApi).
//
// Modos (?mode=):
//   • incremental (default) — janela = hoje−2d..hoje (sobreposição idempotente; pega edições
//     recentes). É o que o Cron de 15min chama.
//   • window&from=YYYY-MM-DD&to=YYYY-MM-DD[&max=N] — janela explícita (demonstração/checkpoint).
//   • backfill[&from=YYYY-MM-DD] — resumível por cursor de MÊS: processa o próximo mês após o
//     cursor e avança; re-invocar até `done:true`. UPSERT torna o reprocesso seguro.
export const runtime = 'nodejs'
export const maxDuration = 300

import { NextRequest, NextResponse } from 'next/server'
import { requireAreaApi } from '@/lib/auth/sessao'
import { getAdminClient } from '@/lib/supabase/admin'
import { ingestWindow, type MondeDb } from '@/lib/monde/ingest'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rpc = (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>

function hojeSP(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
}
function addDiasISO(iso: string, n: number): string {
  const d = new Date(iso + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
function mesRange(ym: string): { from: string; to: string } {
  const [y, m] = ym.split('-').map(Number)
  const ultimoDia = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return { from: `${ym}-01`, to: `${ym}-${String(ultimoDia).padStart(2, '0')}` }
}
function proxMes(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(Date.UTC(y, m, 1)) // m (1-based) → mês seguinte (0-based)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

async function handle(req: NextRequest): Promise<Response> {
  // ── auth: cron secret OU sessão admin ──
  const secret = process.env.CRON_SECRET
  const cronOk = !!secret && req.headers.get('authorization') === `Bearer ${secret}`
  if (!cronOk) {
    const guard = await requireAreaApi(['admin/uploads'])
    if (guard instanceof Response) return guard
  }

  const sp = req.nextUrl.searchParams
  const mode = sp.get('mode') ?? 'incremental'
  const admin = getAdminClient()
  const db: MondeDb = { rpc: (fn, args) => (admin.rpc as unknown as Rpc)(fn, args) }
  const log: string[] = []
  const onLog = (m: string) => { log.push(m); console.log(`[monde-ingest] ${m}`) }

  try {
    if (mode === 'window') {
      const from = sp.get('from'); const to = sp.get('to')
      if (!from || !to) return NextResponse.json({ error: 'faltam from/to (YYYY-MM-DD)' }, { status: 400 })
      const max = sp.get('max')
      const resultado = await ingestWindow(db, { from, to, maxSales: max ? Number(max) : undefined, onLog })
      return NextResponse.json({ mode, resultado, log })
    }

    if (mode === 'backfill') {
      const inicioYm = (sp.get('from') ?? '2023-01-01').slice(0, 7)
      const fimYm = hojeSP().slice(0, 7)
      const { data: cursor } = await db.rpc('monde_ingest_control_get', { p_chave: 'backfill_cursor' })
      const alvoYm = cursor ? proxMes(String(cursor)) : inicioYm
      if (alvoYm > fimYm) return NextResponse.json({ mode, done: true, cursor })
      const { from, to } = mesRange(alvoYm)
      const resultado = await ingestWindow(db, { from, to, onLog })
      await db.rpc('monde_ingest_control_set', { p_chave: 'backfill_cursor', p_valor: alvoYm })
      return NextResponse.json({ mode, mes: alvoYm, done: proxMes(alvoYm) > fimYm, resultado, log })
    }

    // incremental (default)
    const to = hojeSP()
    const from = addDiasISO(to, -2)
    const resultado = await ingestWindow(db, { from, to, onLog })
    await db.rpc('monde_ingest_control_set', { p_chave: 'ultimo_incremental', p_valor: `${from}..${to}` })
    return NextResponse.json({ mode: 'incremental', resultado, log })
  } catch (e) {
    const msg = (e as Error).message
    console.error(`[monde-ingest] ERRO: ${msg}`)
    return NextResponse.json({ error: msg, log }, { status: 500 })
  }
}

export const GET = handle
export const POST = handle
