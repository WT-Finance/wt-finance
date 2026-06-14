// Núcleo compartilhado do backup-gate. Fala com PRODUÇÃO via Management API
// (`npx supabase db query --linked`) — Docker/pg_dump indisponíveis no WSL2.
// Tudo aqui é READ-ONLY contra dado real, EXCETO o schema descartável do
// restore-test (criado/dropado em runtime, coberto pela âncora de backup-do-dia).
//
// ⚠️ Este é o coração do gate que autoriza migration destrutiva sem confirmação.
// Um falso "verde" autorizaria destruir produção sem rede. Correção > tudo.

import { execFileSync } from 'node:child_process'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

export const REPO = '/home/yan-wt/projects/wt-finance'
export const SCHEMAS = ['analytics', 'app', 'audit', 'dim', 'financeiro', 'raw']
export const PAGE = 1000

const TMP = mkdtempSync(join(tmpdir(), 'db-gate-'))
let stmtSeq = 0

// Retry com backoff: o Management API solta 502/timeout transitórios em
// paginação/replay longos (visto na v4.17.0). Sem retry, um hiccup aborta tudo.
function withRetry(fn) {
  let lastErr
  for (let attempt = 1; attempt <= 6; attempt++) {
    try { return fn() } catch (e) {
      lastErr = e
      if (attempt < 6) execFileSync('sleep', [String(attempt * 3)]) // 3,6,9,12,15s
    }
  }
  throw lastErr
}

/** Query que RETORNA linhas (SELECT). Devolve array de objetos. */
export function qJson(sql) {
  return withRetry(() => {
    const raw = execFileSync('npx', ['supabase', 'db', 'query', '--linked', '-o', 'json', sql], {
      cwd: REPO, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
    })
    const start = raw.indexOf('{')
    if (start < 0) return []
    return JSON.parse(raw.slice(start)).rows ?? []
  })
}

/** Executa UM statement (DDL/DML) via arquivo temporário (-f evita escaping e
 *  corpos grandes inline). Não retorna linhas; lança em erro real. */
export function qExec(sqlText) {
  const f = join(TMP, `stmt-${++stmtSeq}.sql`)
  writeFileSync(f, sqlText)
  return withRetry(() => {
    execFileSync('npx', ['supabase', 'db', 'query', '--linked', '-f', f], {
      cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
    })
  })
}

/** Literal SQL seguro (mesma lógica do exportador histórico, validada A/B v4.15). */
export function sqlLit(v, type) {
  if (v === null || v === undefined) return 'NULL'
  if (type === 'boolean') return v === true || v === 'true' ? 'true' : 'false'
  if (['integer', 'bigint', 'smallint', 'numeric', 'double precision', 'real'].includes(type)) {
    const s = String(v)
    if (!/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(s)) throw new Error(`valor numérico inesperado: ${s}`)
    return s
  }
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
  const escaped = s.replace(/'/g, "''")
  if (escaped.includes('\\')) return `E'${escaped.replace(/\\/g, '\\\\')}'`
  return `'${escaped}'`
}

/** Lista de tabelas-base vivas em produção nos schemas de negócio. */
export function tabelasVivas() {
  return qJson(`select schemaname as s, tablename as t from pg_tables
    where schemaname in (${SCHEMAS.map(x => `'${x}'`).join(',')}) order by 1,2`)
    .map(r => `${r.s}.${r.t}`)
}

/** count + checksum de CONTEÚDO (independente de ordem) de uma tabela qualificada.
 *  Hash de cada linha (md5 do row::text — cobre TODAS as colunas, inclusive
 *  geradas, que o schema recomputa) agregado por ordem do próprio hash. */
export function contaEChecksum(fqtn) {
  const [r] = qJson(`select count(*)::text as n,
      coalesce(md5(string_agg(h, '' order by h)), 'VAZIA') as ck
    from (select md5(t::text) as h from ${fqtn} t) s`)
  return { count: Number(r.n), checksum: r.ck }
}
