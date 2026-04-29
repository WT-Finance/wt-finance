/**
 * seed.ts — Orquestrador principal da carga de dados
 *
 * Fluxo:
 *   1. truncate_dynamic_tables()        — zera tabelas recarregáveis
 *   2. parseia cada .xlsx em supabase/seed/data/
 *   3. inserir_lote_raw() em lotes       — popula raw.vendas_excel
 *   4. loadMetas()                       — insere app.meta_setor
 *   5. transform_raw_to_analytics()      — popula dims + fatos
 *   6. refresh_all_materialized_views()  — atualiza MVs
 *
 * Uso:
 *   npm run seed
 *
 * Requisitos:
 *   - .env.local com SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY
 *   - Arquivos .xlsx em supabase/seed/data/
 *   - Migração 0008 aplicada no Supabase
 */

import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })
loadEnv() // fallback: carrega .env se existir
import * as fs from 'fs'
import * as path from 'path'
import { adminClient } from '@/lib/supabase/admin'
import { parseExcel } from './parse-excel'
import { loadMetas } from './load-metas'

const DATA_DIR = path.join(process.cwd(), 'supabase', 'seed', 'data')
const BATCH_SIZE = 500

type RpcFn = typeof adminClient.rpc

async function rpc(fn: string, args?: Record<string, unknown>): Promise<unknown> {
  const call = adminClient.rpc as unknown as (
    fn: string,
    args?: Record<string, unknown>
  ) => ReturnType<RpcFn>
  const { data, error } = await call(fn, args)
  if (error) throw new Error(`RPC ${fn} falhou: ${error.message}`)
  return data
}

async function main() {
  console.log('=== WT Finance — Seed ===\n')

  // 1. Truncar tabelas dinâmicas
  console.log('1. Truncando tabelas dinâmicas...')
  await rpc('truncate_dynamic_tables')
  console.log('   ✓ Tabelas zeradas\n')

  // 2. Ler arquivos Excel
  const arquivos = fs
    .readdirSync(DATA_DIR)
    .filter(f => f.endsWith('.xlsx'))
    .sort()

  if (arquivos.length === 0) {
    console.error(`Nenhum .xlsx encontrado em ${DATA_DIR}`)
    console.error('Coloque os arquivos de dados em supabase/seed/data/ e tente novamente.')
    process.exit(1)
  }

  console.log(`2. Processando ${arquivos.length} arquivo(s) Excel...`)

  let totalLinhas = 0

  for (const arquivo of arquivos) {
    const filePath = path.join(DATA_DIR, arquivo)
    console.log(`\n   Lendo ${arquivo}...`)

    const linhas = parseExcel(filePath)
    console.log(`   ${linhas.length} linhas lidas`)

    if (linhas.length === 0) continue

    // Inserir em lotes para não estourar o payload do Supabase
    let inseridas = 0
    for (let i = 0; i < linhas.length; i += BATCH_SIZE) {
      const lote = linhas.slice(i, i + BATCH_SIZE)
      await rpc('inserir_lote_raw', { p_linhas: JSON.stringify(lote) })
      inseridas += lote.length
      process.stdout.write(`   inseridas ${inseridas}/${linhas.length}\r`)
    }
    console.log(`   ✓ ${linhas.length} linhas em raw.vendas_excel                `)
    totalLinhas += linhas.length
  }

  console.log(`\n   Total raw: ${totalLinhas} linhas\n`)

  // 3. Inserir metas
  console.log('3. Inserindo metas em app.meta_setor...')
  await loadMetas()
  console.log()

  // 4. Transformar raw → analytics
  console.log('4. Transformando raw → analytics...')
  const resultado = await rpc('transform_raw_to_analytics') as unknown as {
    vendas_count: number
    fato_venda_item_count: number
  }
  console.log(`   ✓ ${resultado.vendas_count} vendas em fato_venda`)
  console.log(`   ✓ ${resultado.fato_venda_item_count} itens em fato_venda_item\n`)

  // 5. Atualizar views materializadas
  console.log('5. Atualizando views materializadas...')
  await rpc('refresh_all_materialized_views')
  console.log('   ✓ 4 views atualizadas\n')

  // 6. Registrar no log de auditoria
  await rpc('registrar_ingestao_log', {
    p_fonte: `seed-${new Date().toISOString().slice(0, 10)}`,
    p_status: 'sucesso',
    p_registros: totalLinhas,
  })

  console.log('=== Seed concluído com sucesso! ===')
}

main().catch(err => {
  console.error('\n[ERRO]', err.message)
  process.exit(1)
})
