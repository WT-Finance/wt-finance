import { config } from 'dotenv'
config({ path: '.env.local' })
import { getAdminClient } from '../../src/lib/supabase/admin'

type Rpc = (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>

async function main() {
  const db = getAdminClient()
  const rpc = (db.rpc as unknown as Rpc).bind(db)

  const { data, error } = await rpc('get_operacoes_weddings', {
    p_status: 'todos', p_subsetor: 'todos',
    p_ordenar_por: 'data_evento', p_direcao: 'desc',
    p_pagina: 1, p_por_pagina: 5,
  })
  if (error) { console.error('ERROR:', error.message); return }
  const res = data as { total: number; operacoes: unknown[] }
  console.log(`OK — total: ${res.total}, page: ${res.operacoes?.length}`)
  if (res.operacoes?.length) console.log('Primeiro:', JSON.stringify(res.operacoes[0]))
}
main().catch(e => { console.error(e.message); process.exit(1) })
