import { config } from 'dotenv'
config({ path: '.env.local' })
import { getAdminClient } from '../../src/lib/supabase/admin'

async function main() {
  const supabase = getAdminClient()
  
  const { data, count, error } = await supabase
    .schema('analytics')
    .from('dim_produto_subsetor')
    .select('produto, subsetor', { count: 'exact' })
    .limit(5)
  
  console.log('data:', JSON.stringify(data))
  console.log('count:', count)
  console.log('error:', JSON.stringify(error))
}
main().catch(e => console.error(e.message))
