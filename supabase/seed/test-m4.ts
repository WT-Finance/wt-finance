import { config } from 'dotenv'
config({ path: '.env.local' })
import { getAdminClient } from '@/lib/supabase/admin'

type BoundRpc = (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>

async function main() {
  const db = getAdminClient()
  const rpc = (db.rpc as unknown as BoundRpc).bind(db)

  const { data: cart, error: e1 } = await rpc('get_carteira_weddings', { p_metric: 'casamentos' })
  if (e1) { console.error('Carteira error:', e1.message); }
  else {
    const c = cart as { anos_casamento: string[], linhas: { ano_venda: string, total: number }[] }
    console.log('Carteira OK — anos:', c?.anos_casamento, 'linhas:', c?.linhas?.length)
    console.log('Primeira linha:', JSON.stringify(c?.linhas?.[0]))
  }

  const { data: prox, error: e2 } = await rpc('get_proximos_casamentos', { p_horizonte_meses: 6 })
  if (e2) { console.error('Proximos error:', e2.message) }
  else {
    const p = prox as { horizonte_meses: number, margem_historica_pct: number, casamentos: unknown[] }
    console.log(`Proximos OK — ${p?.casamentos?.length} casamentos, margem histórica: ${p?.margem_historica_pct}%`)
    if (p?.casamentos?.length > 0) console.log('Primeiro:', JSON.stringify(p.casamentos[0]))
  }
}
main().catch(e => { console.error(e.message); process.exit(1) })
