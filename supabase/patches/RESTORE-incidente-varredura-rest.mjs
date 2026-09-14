// RESTORE do incidente de 10/09/2026 — varredura REST que executou funções de TRUNCATE.
//
// NÃO FOI EXECUTADO PELO AGENTE. Restaurar 306 mil linhas em produção é escrita ampla e
// irreversível; a decisão é humana, como foi a da destrutiva. Rode você, em TTY:
//
//   cd /home/yan-wt/projects/wt-finance/.claude/worktrees/chore+v5-10-0-limpeza-fechamento-v5
//   node supabase/patches/RESTORE-incidente-varredura-rest.mjs --dry-run   # confere e não escreve
//   node supabase/patches/RESTORE-incidente-varredura-rest.mjs --confirmar # restaura
//
// Fonte: backup do backup-gate tirado às 22:10:45Z, ANTES da varredura — conferido tabela a
// tabela contra o snapshot da Fase 1. Procedimento: o do runbook
// `docs/runbooks/db-backup-gate-runbook.md` (§ "Como recuperar a partir de um backup"),
// usando os primitivos `pgCopyIn`/`getPool`/`closePool` de `scripts/db-gate/lib.mjs`.
//
// (Nota amarga: `getPool` é justamente o export que o Bloco 1 removeu como "órfão" e o
//  `revisor` mandou restaurar, porque o runbook de recuperação o importa. Sem aquela
//  correção, este script não rodaria.)
import { pgCopyIn, getPool, closePool } from '../../scripts/db-gate/lib.mjs'
import { readFileSync } from 'node:fs'

const B = `${process.env.HOME}/wt-finance-backups/2026-09-10-pre-migration-221044`
const manifest = JSON.parse(readFileSync(`${B}/manifest.json`, 'utf8'))
const colunasDe = Object.fromEntries(manifest.tabelas.map(t => [t.tabela, t.colunas]))

// Ordem de dependência: uploads crus primeiro (independentes), depois as dimensões, e só
// então os fatos que referenciam as dimensões. `fato_venda_item` depois de `fato_venda`.
const ORDEM = [
  'raw.vendas_excel',
  'raw.lancamentos_movimentacao',
  'raw.titulos_em_aberto',
  'raw.demonstrativo_competencia',
  'analytics.dim_pagante',
  'analytics.dim_produto',
  'analytics.dim_vendedor',
  'analytics.fato_venda',
  'analytics.fato_venda_item',
  'analytics.fato_lancamento_operacao',
]

const CONFIRMAR = process.argv.includes('--confirmar')
if (!CONFIRMAR) console.log('MODO DRY-RUN — nada será escrito. Use --confirmar para restaurar.\n')

try {
  for (const fq of ORDEM) {
    const cols = colunasDe[fq]
    const arquivo = `${B}/data/${fq}.copy`
    const noBackup = readFileSync(arquivo, 'utf8').split('\n').filter(Boolean).length
    const antes = (await getPool().query(`SELECT count(*)::bigint AS n FROM ${fq}`)).rows[0].n

    if (!CONFIRMAR) {
      console.log(`  ${fq.padEnd(40)} agora=${String(antes).padStart(7)}  backup=${String(noBackup).padStart(7)}  cols=${cols.length}`)
      continue
    }

    // pgCopyIn faz TRUNCATE + COPY FROM na tabela informada (uso de emergência previsto
    // no runbook: apontar para a tabela ORIGINAL, não para o scratch).
    await pgCopyIn(fq, cols, arquivo)
    const depois = (await getPool().query(`SELECT count(*)::bigint AS n FROM ${fq}`)).rows[0].n
    const ok = Number(depois) === noBackup
    console.log(`  ${ok ? 'OK ' : 'DIVERGIU'} ${fq.padEnd(40)} ${antes} -> ${depois} (esperado ${noBackup})`)
    if (!ok) throw new Error(`${fq}: restaurou ${depois}, esperado ${noBackup} — PARANDO`)

    // Reset de sequência quando a tabela tem coluna de identidade/serial.
    const seq = await getPool().query(
      `SELECT a.attname AS col, pg_get_serial_sequence($1, a.attname) AS seq
         FROM pg_attribute a
        WHERE a.attrelid = $1::regclass AND a.attnum > 0 AND NOT a.attisdropped
          AND pg_get_serial_sequence($1, a.attname) IS NOT NULL`, [fq])
    for (const s of seq.rows) {
      await getPool().query(
        `SELECT setval($1, coalesce((SELECT max(${JSON.stringify(s.col).replace(/"/g, '"')}) FROM ${fq}), 0) + 1, false)`,
        [s.seq])
      console.log(`       sequência ${s.seq} realinhada por ${s.col}`)
    }
  }

  if (CONFIRMAR) {
    console.log('\nRegenerando as materializadas que dependem dos fatos...')
    await getPool().query('SELECT public.refresh_all_materialized_views()')
    console.log('OK. Confira a seguir: DRE, Weddings e Fluxo de Caixa nas telas.')
  }
} finally {
  await closePool()
}
