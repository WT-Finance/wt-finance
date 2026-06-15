#!/usr/bin/env node
// Backup lógico completo via COPY (conexão Postgres direta, pooler session) — substitui o
// exportador via Management API (lento, um-statement-por-chamada). Saída por tabela em
// COPY TEXT FORMAT (.copy) + manifest.json com a lista de colunas NÃO-geradas por tabela
// (o restore reusa a MESMA ordem). Colunas GERADAS são EXCLUÍDAS do dado — o destino as
// recompõe a partir das base (LIKE INCLUDING GENERATED); incluí-las daria dump não-restaurável
// ("cannot insert into a generated column"). Resolve o achado histórico das geradas de forma
// estrutural (column-list), em vez de filtro campo-a-campo. (ADR-0119.)
//
// Recuperação a partir deste backup: ver runbook (TRUNCATE alvo → COPY FROM <arquivo> →
// reset de sequências por max(coluna)). NÃO é mais .sql aplicável via API; é COPY via pg.
//
// Uso:  node exportar.mjs <dir-de-saída>
// Saída: <dir>/data/<schema>.<tabela>.copy + <dir>/manifest.json

import { writeFileSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { qJson, pgCopyOut, colunasNaoGeradas, closePool, SCHEMAS } from './lib.mjs'

const OUTDIR = process.argv[2]
if (!OUTDIR) { console.error('uso: node exportar.mjs <dir-de-saída>'); process.exit(1) }
const DATA = join(OUTDIR, 'data')
mkdirSync(DATA, { recursive: true })

// COPY TEXT FORMAT: 1 linha física por registro (newlines em dado vêm escapadas como \n),
// então `wc -l` == nº de linhas exportadas. Confronta com o count da origem (integridade).
function contarLinhas(path) {
  return Number(execFileSync('wc', ['-l', path], { encoding: 'utf8' }).trim().split(/\s+/)[0])
}

try {
  const tables = await qJson(`select schemaname as s, tablename as t from pg_tables
    where schemaname = any($1) order by 1,2`, [SCHEMAS])

  const manifest = { gerado_em: new Date().toISOString(), formato: 'copy-text', colunas_geradas_excluidas: true, tabelas: [] }

  for (const { s, t } of tables) {
    const fq = `${s}.${t}`
    const cols = await colunasNaoGeradas(s, t)
    const [{ n }] = await qJson(`select count(*)::bigint as n from ${fq}`)
    const total = Number(n)
    const destPath = join(DATA, `${fq}.copy`)
    await pgCopyOut(fq, cols, destPath)
    const exported = contarLinhas(destPath)
    const ok = exported === total
    manifest.tabelas.push({ tabela: fq, colunas: cols, linhas_na_origem: total, linhas_exportadas: exported, ok })
    process.stdout.write(`\r${fq}: ${exported}/${total} ${ok ? '✓' : '✗'}        \n`)
  }

  writeFileSync(join(OUTDIR, 'manifest.json'), JSON.stringify(manifest, null, 2))
  const falhas = manifest.tabelas.filter(t => !t.ok)
  console.log(`\n${manifest.tabelas.length} tabelas exportadas; falhas: ${falhas.length}`)
  if (falhas.length) { console.error(JSON.stringify(falhas, null, 2)); process.exitCode = 1 }
} catch (e) {
  console.error('✗ export FALHOU:', String(e.message || e).slice(0, 300))
  process.exitCode = 1
} finally {
  await closePool()
}
