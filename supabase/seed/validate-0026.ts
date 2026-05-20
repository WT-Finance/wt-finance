import { config } from 'dotenv'
config({ path: '.env.local' })
import { getAdminClient } from '../../src/lib/supabase/admin'

async function main() {
  const supabase = getAdminClient()

  const { count: c1 } = await supabase.schema('analytics').from('dim_produto_subsetor').select('*', { count: 'exact', head: true })
  console.log(`dim_produto_subsetor: ${c1} produtos (esperado: 21)`)

  const { count: c2 } = await supabase.schema('analytics').from('fato_lancamento_operacao').select('*', { count: 'exact', head: true })
  console.log(`fato_lancamento_operacao: ${c2} linhas (esperado: 0)`)

  const { count: c3 } = await supabase.schema('analytics').from('dim_operacao_weddings').select('*', { count: 'exact', head: true })
  console.log(`dim_operacao_weddings: ${c3} linhas (esperado: 0)`)

  // Testa subsetores presentes
  const { data: subsetores } = await supabase.schema('analytics').from('dim_produto_subsetor').select('subsetor').order('subsetor')
  const grupos = [...new Set(subsetores?.map(r => r.subsetor))]
  console.log(`Subsetores: ${grupos.join(', ')}`)

  if (c1 === 21 && c2 === 0 && c3 === 0) {
    console.log('\n✓ Migration 0026 validada com sucesso')
  } else {
    console.error('\n✗ Contagens inesperadas')
    process.exit(1)
  }
}
main().catch(e => { console.error(e.message); process.exit(1) })
