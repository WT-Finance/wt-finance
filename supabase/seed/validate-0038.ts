import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })
import { getAdminClient } from '@/lib/supabase/admin'

async function main() {
  const db = getAdminClient()

  const { data: counts, error: e1 } = await db.rpc('get_vendas_em_aberto_weddings' as never, { p_limite: 0, p_offset: 0 })
  if (e1) { console.error('RPC error:', e1.message); return }
  console.log('Total vendas Weddings abertas/NULL:', (counts as { total: number }).total)

  const { data: sample, error: e2 } = await db.rpc('get_vendas_em_aberto_weddings' as never, { p_limite: 5, p_offset: 0 })
  if (e2) { console.error('RPC sample error:', e2.message); return }
  const vendas = (sample as { vendas: unknown[] }).vendas
  console.log('\nPrimeiros 5:')
  console.log(JSON.stringify(vendas, null, 2))
}

main().catch(console.error)
