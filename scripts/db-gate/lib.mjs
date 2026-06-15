// Núcleo compartilhado do backup-gate. Fala com PRODUÇÃO via CONEXÃO POSTGRES DIRETA
// (pooler Supavisor, session mode, porta 5432) usando COPY — substitui a Management API
// (`npx supabase db query`, um-statement-por-chamada: lenta e sujeita a degradação).
// A LÓGICA do gate NÃO mudou; só o TRANSPORTE. (ADR-0119, estende ADR-0116.)
//
// Tudo aqui é READ-ONLY contra dado real, EXCETO o schema descartável do restore-test
// (criado/dropado em runtime, coberto pela âncora de backup-do-dia).
//
// ⚠️ Coração do gate que autoriza migration destrutiva (com confirmação humana). Um falso
// "verde" autorizaria destruir produção sem rede. Correção > tudo.
//
// Credencial: SUPABASE_DB_URL (connection string do pooler SESSION, com senha,
// sslmode=require) vem do .env.local — NUNCA commitada (.gitignore cobre .env*),
// NUNCA logada. A conexão direta `db.<ref>` é IPv6-only (fora do WSL2); o pooler é IPv4.

import { config } from 'dotenv'
import { execFileSync } from 'node:child_process'
import { createWriteStream, createReadStream } from 'node:fs'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import pg from 'pg'
import copyStreams from 'pg-copy-streams'

const { to: copyTo, from: copyFrom } = copyStreams

// REPO = raiz do checkout ATUAL (worktree-aware, v4.20.0): git rev-parse na cwd, fallback cwd.
// Antes era hardcoded p/ a raiz do main — rodado de uma worktree, o `db push` corria do main
// (que não enxerga a migration da worktree → "Remote database is up to date" silencioso).
// NÃO afeta o backup-gate (fala com produção via SUPABASE_DB_URL, independente do REPO);
// só conserta a cwd do export/push. Fonte ÚNICA: gate.mjs/migrate.mjs importam este REPO.
export const REPO = (() => {
  try { return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() }
  catch { return process.cwd() }
})()
export const SCHEMAS = ['analytics', 'app', 'audit', 'dim', 'financeiro', 'raw']

config({ path: join(REPO, '.env.local') })

let _pool = null
export function getPool() {
  if (_pool) return _pool
  const cs = process.env.SUPABASE_DB_URL
  if (!cs) {
    throw new Error('SUPABASE_DB_URL ausente no .env.local — o backup-gate via COPY exige a ' +
      'connection string do pooler (Session mode, porta 5432, sslmode=require).')
  }
  _pool = new pg.Pool({
    connectionString: cs,
    // Pooler Supavisor: TLS sem verificação de CA (host fixo da connection string; o
    // tráfego já é cifrado). Sem isto, a cadeia do pooler pode reprovar a verificação.
    ssl: { rejectUnauthorized: false },
    max: 4,
  })
  return _pool
}

/** Fecha o pool (idempotente). Chamar no finally de cada entrypoint — sem conexão pendurada. */
export async function closePool() {
  if (!_pool) return
  const p = _pool; _pool = null
  await p.end()
}

// Retry com backoff SÓ para queries (SELECT/DDL): a conexão do pooler pode dar hiccup
// transitório. COPY NÃO re-tenta (falha → vermelho, conservador): um falso-vermelho é
// re-rodável; retry mid-stream não vale o risco no coração do gate.
async function withRetry(fn) {
  let last
  for (let attempt = 1; attempt <= 4; attempt++) {
    try { return await fn() } catch (e) {
      last = e
      if (attempt < 4) await new Promise(r => setTimeout(r, attempt * 1500)) // 1.5,3,4.5s
    }
  }
  throw last
}

/** SELECT → array de objetos. `params` opcional (placeholders $1.. — preferir p/ identificadores externos). */
export async function qJson(sql, params) {
  return withRetry(async () => (await getPool().query(sql, params)).rows)
}

/** DDL/DML (não retorna linhas). Lança em erro real. */
export async function qExec(sql) {
  return withRetry(async () => { await getPool().query(sql) })
}

/** Colunas NÃO-geradas (ordem física) de uma tabela — base do COPY: as GERADAS são
 *  excluídas do dado e RECOMPUTADAS no destino pelo schema (LIKE INCLUDING GENERATED). */
export async function colunasNaoGeradas(schema, table) {
  const rows = await qJson(
    `select column_name as c from information_schema.columns
     where table_schema = $1 and table_name = $2 and is_generated = 'NEVER'
     order by ordinal_position`, [schema, table])
  return rows.map(r => r.c)
}

/** EXPORT: COPY <fqtn> (<colunas>) TO STDOUT → arquivo (streaming, sem carregar em memória). */
export async function pgCopyOut(fqtn, cols, destPath) {
  const client = await getPool().connect()
  try {
    const lista = cols.map(c => `"${c}"`).join(', ')
    await pipeline(client.query(copyTo(`COPY ${fqtn} (${lista}) TO STDOUT`)), createWriteStream(destPath))
  } finally { client.release() }
}

/** RESTORE: arquivo → COPY <destFq> (<colunas>) FROM STDIN (streaming). TRUNCATE antes
 *  (idempotente; o COPY só atinge a tabela NOMEADA — a guarda scratch-only é estrutural). */
export async function pgCopyIn(destFq, cols, srcPath) {
  const client = await getPool().connect()
  try {
    await client.query(`TRUNCATE ${destFq};`)
    const lista = cols.map(c => `"${c}"`).join(', ')
    await pipeline(createReadStream(srcPath), client.query(copyFrom(`COPY ${destFq} (${lista}) FROM STDIN`)))
  } finally { client.release() }
}

/** Tabelas-base vivas nos schemas de negócio → ['schema.tabela', ...]. */
export async function tabelasVivas() {
  return (await qJson(
    `select schemaname as s, tablename as t from pg_tables
     where schemaname = any($1) order by 1,2`, [SCHEMAS]))
    .map(r => `${r.s}.${r.t}`)
}

/** count + checksum de CONTEÚDO (independe de ordem) de uma tabela qualificada.
 *  md5(t::text) por linha cobre TODAS as colunas — inclusive as GERADAS, que o destino
 *  recomputa; é o que prova fidelidade prod × restaurado. */
export async function contaEChecksum(fqtn) {
  const [r] = await qJson(`select count(*)::text as n,
      coalesce(md5(string_agg(h, '' order by h)), 'VAZIA') as ck
    from (select md5(t::text) as h from ${fqtn} t) s`)
  return { count: Number(r.n), checksum: r.ck }
}
