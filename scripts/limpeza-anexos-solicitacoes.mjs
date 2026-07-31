// ---------------------------------------------------------------------------
// limpeza-anexos-solicitacoes.mjs — v5.4.0/Round4
//
// Apaga os BINÁRIOS dos anexos de Solicitações no bucket privado
// `solicitacoes-anexos`, par do patch destrutivo
// `supabase/patches/0218_limpeza_historico_e_slugs.sql` (que apaga o METADADO).
//
// Por que fora do SQL: apagar `storage.objects` por SQL remove o REGISTRO e deixa
// os bytes órfãos no bucket (o Storage do Supabase não é um simples índice de
// tabela). A remoção real passa pela Storage API com service_role.
//
// ███ DESTRUTIVO E IRREVERSÍVEL ███ — sem `--confirmar` o script só LISTA (dry-run).
//
// ORDEM RECOMENDADA: rodar ESTE script ANTES do patch 0218. Ele cruza cada arquivo
// do bucket com `app.solicitacao_anexo` e só apaga o que tem metadado
// correspondente — arquivo desconhecido é REPORTADO e PRESERVADO (fail-closed).
// Se o patch 0218 já tiver rodado (metadado apagado), todo arquivo fica "órfão":
// nesse caso use `--incluir-orfaos`, que exige `app.solicitacao_anexo` VAZIA como
// prova de que o histórico realmente saiu.
//
// Uso:
//   node scripts/limpeza-anexos-solicitacoes.mjs                          # dry-run
//   node scripts/limpeza-anexos-solicitacoes.mjs --confirmar              # apaga
//   node scripts/limpeza-anexos-solicitacoes.mjs --confirmar --incluir-orfaos
// ---------------------------------------------------------------------------
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import pg from 'pg'

const BUCKET = 'solicitacoes-anexos'
// Bucket de OUTRO módulo (Acervo). Nunca é alvo; conferido antes e depois como
// prova de que a limpeza não vazou de escopo.
const BUCKET_INTOCAVEL = 'acervo-documentos'

const REPO = (() => {
  try { return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() }
  catch { return process.cwd() }
})()
config({ path: join(REPO, '.env.local') })

const CONFIRMAR = process.argv.includes('--confirmar')
const INCLUIR_ORFAOS = process.argv.includes('--incluir-orfaos')

const rawUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const dbUrl = process.env.SUPABASE_DB_URL
if (!rawUrl || !serviceKey || !dbUrl) {
  console.error('ABORTADO: .env.local precisa de NEXT_PUBLIC_SUPABASE_URL (ou SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY e SUPABASE_DB_URL.')
  process.exit(1)
}
// A env do projeto inclui o sufixo /rest/v1 — o cliente JS quer a URL base
// (mesma normalização de src/lib/supabase/admin.ts).
const supabase = createClient(rawUrl.replace(/\/(rest\/v1\/?)?$/, ''), serviceKey, { auth: { persistSession: false } })

const db = new pg.Client({ connectionString: dbUrl })
await db.connect()

// ── 1. Censo: arquivos do bucket × metadado em app.solicitacao_anexo ──────────
const { rows: objetos } = await db.query(
  `SELECT o.name AS path,
          coalesce((o.metadata->>'size')::bigint, 0) AS bytes,
          EXISTS (SELECT 1 FROM app.solicitacao_anexo a WHERE a.storage_path = o.name) AS tem_metadado
     FROM storage.objects o
    WHERE o.bucket_id = $1
    ORDER BY o.name`,
  [BUCKET],
)
const { rows: [{ n: anexosRestantes }] } = await db.query('SELECT count(*)::int AS n FROM app.solicitacao_anexo')
const { rows: [{ n: intocaveisAntes }] } = await db.query(
  'SELECT count(*)::int AS n FROM storage.objects WHERE bucket_id = $1', [BUCKET_INTOCAVEL])

const comMetadado = objetos.filter(o => o.tem_metadado)
const orfaos = objetos.filter(o => !o.tem_metadado)
const bytes = objetos.reduce((s, o) => s + Number(o.bytes), 0)

console.log(`\nBucket \`${BUCKET}\`: ${objetos.length} arquivo(s), ${(bytes / 1024 / 1024).toFixed(2)} MB`)
console.log(`  • com metadado em app.solicitacao_anexo: ${comMetadado.length}`)
console.log(`  • sem metadado (órfãos):                 ${orfaos.length}`)
console.log(`app.solicitacao_anexo: ${anexosRestantes} linha(s)`)
console.log(`Bucket \`${BUCKET_INTOCAVEL}\` (não é alvo): ${intocaveisAntes} arquivo(s)`)

// ── 2. Alvo ───────────────────────────────────────────────────────────────────
let alvo = comMetadado.map(o => o.path)
if (orfaos.length > 0) {
  if (!INCLUIR_ORFAOS) {
    console.log(`\nPRESERVADOS (fail-closed): ${orfaos.length} arquivo(s) sem metadado. Nenhum registro em app.solicitacao_anexo aponta para eles — este script não apaga o que não sabe identificar.`)
    for (const o of orfaos) console.log(`   ~ ${o.path}`)
    console.log('   Para incluí-los (só faz sentido se o patch 0218 já apagou o metadado): --incluir-orfaos')
  } else if (anexosRestantes > 0) {
    console.error(`\nABORTADO: --incluir-orfaos exige app.solicitacao_anexo VAZIA (prova de que o histórico saiu), mas há ${anexosRestantes} linha(s). Rode o patch 0218 primeiro, ou tire a flag.`)
    await db.end(); process.exit(1)
  } else {
    alvo = objetos.map(o => o.path)
    console.log(`\n--incluir-orfaos: os ${orfaos.length} órfão(s) entram no alvo (app.solicitacao_anexo está vazia).`)
  }
}

if (alvo.length === 0) {
  console.log('\nNada a apagar. Encerrando.')
  await db.end(); process.exit(0)
}

console.log(`\nALVO: ${alvo.length} arquivo(s)`)
for (const p of alvo) console.log(`   - ${p}`)

if (!CONFIRMAR) {
  console.log('\nDRY-RUN (nada foi apagado). Para apagar de verdade: --confirmar')
  await db.end(); process.exit(0)
}

// ── 3. Remoção (Storage API: apaga bytes E registro) ──────────────────────────
console.log('\nApagando…')
const LOTE = 100
let apagados = 0
for (let i = 0; i < alvo.length; i += LOTE) {
  const fatia = alvo.slice(i, i + LOTE)
  const { data, error } = await supabase.storage.from(BUCKET).remove(fatia)
  if (error) {
    console.error(`ABORTADO no lote ${i / LOTE + 1}: ${error.message}`)
    await db.end(); process.exit(1)
  }
  apagados += Array.isArray(data) ? data.length : 0
}
console.log(`Storage confirmou ${apagados} remoção(ões).`)

// ── 4. Verificação pós-remoção ────────────────────────────────────────────────
const { rows: [{ n: restam }] } = await db.query(
  'SELECT count(*)::int AS n FROM storage.objects WHERE bucket_id = $1', [BUCKET])
const { rows: [{ n: intocaveisDepois }] } = await db.query(
  'SELECT count(*)::int AS n FROM storage.objects WHERE bucket_id = $1', [BUCKET_INTOCAVEL])

console.log(`\nDEPOIS → \`${BUCKET}\`: ${restam} arquivo(s) (antes ${objetos.length}); \`${BUCKET_INTOCAVEL}\`: ${intocaveisDepois} (antes ${intocaveisAntes})`)
if (intocaveisDepois !== intocaveisAntes) {
  console.error('ALERTA GRAVE: a contagem do bucket do Acervo mudou — investigar imediatamente.')
  await db.end(); process.exit(1)
}
const esperado = objetos.length - alvo.length
if (restam !== esperado) {
  console.error(`ALERTA: esperava ${esperado} arquivo(s) restantes e há ${restam}. Rodar de novo em dry-run e conferir.`)
  await db.end(); process.exit(1)
}
console.log('OK.')
await db.end()
