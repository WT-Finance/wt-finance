#!/usr/bin/env node
// Backup lógico completo via Management API. Versão VERSIONADA (repo) do exportador
// histórico de ~/wt-finance-backups/. Diferenças vs o histórico:
//   1. Diretório de saída é ARGUMENTO (o gate controla onde a carga aterrissa).
//   2. EXCLUI colunas GERADAS do INSERT (is_generated <> 'NEVER'). O histórico as
//      incluía — e isso produz dump NÃO-restaurável para tabelas com coluna gerada
//      (ex.: analytics.dim_operacao_weddings.resultado_caixa/ncg): "cannot insert
//      into a generated column". A recuperação real restaura no schema original, que
//      RECOMPUTA a gerada a partir das base. Excluí-las é o que torna o dump fiel à
//      recuperação. (Achado da construção do gate — v4.18/processo.)
//
// Uso:  node exportar.mjs <dir-de-saída>
// Saída: <dir>/data/<schema>.<tabela>.sql + <dir>/manifest.json

import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { qJson, sqlLit, SCHEMAS, PAGE } from './lib.mjs'

const OUTDIR = process.argv[2]
if (!OUTDIR) { console.error('uso: node exportar.mjs <dir-de-saída>'); process.exit(1) }
const DATA = join(OUTDIR, 'data')
mkdirSync(DATA, { recursive: true })

const tables = qJson(`select schemaname as s, tablename as t from pg_tables
  where schemaname in (${SCHEMAS.map(x => `'${x}'`).join(',')}) order by 1,2`)

const manifest = { gerado_em: new Date().toISOString(), colunas_geradas_excluidas: true, tabelas: [] }

for (const { s, t } of tables) {
  const fq = `${s}.${t}`
  // is_generated='NEVER' → fora colunas GERADAS (recompostas no destino pelo schema).
  const cols = qJson(`select column_name as c, data_type as dt, is_identity as ident, column_default as cdef
    from information_schema.columns
    where table_schema='${s}' and table_name='${t}' and is_generated = 'NEVER'
    order by ordinal_position`)
  const colNames = cols.map(c => `"${c.c}"`).join(', ')
  const [{ n }] = qJson(`select count(*)::bigint as n from ${fq}`)
  const total = Number(n)

  const pk = qJson(`select a.attname as c from pg_index i
    join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
    where i.indrelid = '${fq}'::regclass and i.indisprimary`)
  const orderBy = pk.length ? pk.map(p => `"${p.c}"`).join(',') : colNames

  const lines = [`-- Backup ${fq} — ${total} linhas — ${manifest.gerado_em}`, `BEGIN;`, `TRUNCATE ${fq} RESTART IDENTITY CASCADE;`]
  let exported = 0
  for (let off = 0; off < total; off += PAGE) {
    const rows = qJson(`select ${colNames} from ${fq} order by ${orderBy} limit ${PAGE} offset ${off}`)
    if (!rows.length) break
    const values = rows.map(r => `(${cols.map(c => sqlLit(r[c.c], c.dt)).join(', ')})`).join(',\n')
    lines.push(`INSERT INTO ${fq} (${colNames}) VALUES\n${values};`)
    exported += rows.length
    process.stdout.write(`\r${fq}: ${exported}/${total}        `)
  }
  for (const c of cols) {
    if (c.ident === 'YES' || (c.cdef ?? '').startsWith('nextval(')) {
      lines.push(`SELECT setval(pg_get_serial_sequence('${fq}', '${c.c}'), coalesce((select max("${c.c}") from ${fq}), 0) + 1, false);`)
    }
  }
  lines.push('COMMIT;')
  writeFileSync(join(DATA, `${s}.${t}.sql`), lines.join('\n') + '\n')
  manifest.tabelas.push({ tabela: fq, linhas_exportadas: exported, linhas_na_origem: total, ok: exported === total })
  console.log(`\r${fq}: ${exported}/${total} ✓`)
}

writeFileSync(join(OUTDIR, 'manifest.json'), JSON.stringify(manifest, null, 2))
const falhas = manifest.tabelas.filter(t => !t.ok)
console.log(`\n${manifest.tabelas.length} tabelas exportadas; falhas: ${falhas.length}`)
if (falhas.length) { console.error(JSON.stringify(falhas, null, 2)); process.exit(1) }
