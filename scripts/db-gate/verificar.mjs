#!/usr/bin/env node
// Verificador do backup-gate. Prova que um backup é (1) COMPLETO vs produção e
// (2) RESTAURÁVEL e FIEL — restaurando num schema descartável e comparando o
// RESTAURADO contra a TABELA VIVA DE PRODUÇÃO (count + checksum por tabela).
//
// A comparação é PRODUÇÃO × RESTAURADO, NUNCA dump × restaurado: restaurar e
// comparar contra o próprio dump seria circular (provaria round-trip, não fidelidade
// à produção). Lê produção viva a cada verificação — é a razão de existir do gate.
//
// TRANSPORTE (ADR-0119): restore via COPY FROM (pg direto), não mais aplicação de
// INSERTs via Management API. O dado vem de <fq>.copy (COPY text format) e as colunas
// vêm do manifest (mesma ordem do export). A guarda "scratch-only" é ESTRUTURAL: o
// COPY só atinge a tabela NOMEADA do schema scratch — não há SQL de INSERT a fiscalizar.
//
// Uso:  node verificar.mjs <dir-backup> --mode=full|spot [--only schema.tabela]
// Exit: 0 = VERDE (tudo bate) · ≠0 = VERMELHO (motivo no relatório).

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { qExec, pgCopyIn, contaEChecksum, tabelasVivas, closePool } from './lib.mjs'

const SCRATCH = 'gate_scratch'
// Subconjunto-chave do SPOT robusto (núcleo mínimo): financeiras críticas + FK + grande +
// coluna gerada + auth. NÃO é amostra ingênua — cobre os tipos de tabela que mais doem.
const KEY_TABLES = [
  'financeiro.fato_lancamentos',     // financeira crítica (~19k)
  'analytics.fato_venda',            // financeira/vendas + FK p/ analytics.dim_data + a "grande" do subconjunto (~27k)
  'analytics.dim_operacao_weddings', // coluna GERADA (resultado_caixa/ncg) — mantém o fix coberto
  'app.rbac_usuarios',               // auth/RBAC crítica
]

export async function verificar(backupDir, { mode, only } = {}) {
  const manifestPath = join(backupDir, 'manifest.json')
  if (!existsSync(manifestPath)) return red([`manifest.json ausente em ${backupDir}`])

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const manifestTabs = manifest.tabelas.map(t => t.tabela)
  const colsByTable = new Map(manifest.tabelas.map(t => [t.tabela, t.colunas]))
  const motivos = []
  const relatorio = { backupDir, mode, gerado_em: manifest.gerado_em, completude: {}, restore: [], veredito: null }

  // ── (1) COMPLETUDE ───────────────────────────────────────────────────────
  const vivas = await tabelasVivas()
  const faltamNoBackup = vivas.filter(t => !manifestTabs.includes(t))           // prod ⊆ manifest?
  const semArquivo = manifest.tabelas.filter(t => !existsSync(join(backupDir, 'data', `${t.tabela}.copy`))).map(t => t.tabela)
  const exportIncompleto = manifest.tabelas.filter(t => t.ok === false).map(t => t.tabela)
  relatorio.completude = { tabelas_vivas: vivas.length, tabelas_no_manifest: manifestTabs.length, faltam_no_backup: faltamNoBackup, sem_arquivo: semArquivo, export_incompleto: exportIncompleto }
  if (faltamNoBackup.length) motivos.push(`tabela(s) viva(s) ausente(s) do backup: ${faltamNoBackup.join(', ')}`)
  if (semArquivo.length) motivos.push(`arquivo .copy ausente para: ${semArquivo.join(', ')}`)
  if (exportIncompleto.length) motivos.push(`export incompleto (ok=false) em: ${exportIncompleto.join(', ')}`)

  // Falha rápido: se a completude já reprovou, não adianta restaurar (já está vermelho).
  if (motivos.length) { relatorio.veredito = 'VERMELHO'; relatorio.restore_pulado = 'completude reprovou'; return { ok: false, motivos, relatorio } }

  // ── (2) RESTORE-TEST (PRODUÇÃO × RESTAURADO) ──────────────────────────────
  let alvos
  if (only) {
    alvos = [only]                                              // alvo único (testes adversariais)
  } else if (mode === 'full') {
    alvos = manifestTabs                                        // FOLLOW-UP: todas as tabelas
  } else {
    alvos = KEY_TABLES.filter(t => manifestTabs.includes(t))    // SPOT robusto (subconjunto-chave)
    relatorio.spot_subconjunto = alvos
  }

  try {
    await qExec(`DROP SCHEMA IF EXISTS ${SCRATCH} CASCADE; CREATE SCHEMA ${SCRATCH};`)
    let i = 0
    for (const fq of alvos) {
      process.stdout.write(`\r  restaurando ${++i}/${alvos.length}: ${fq}                    `)
      const [s, t] = fq.split('.')
      const scratchFq = `${SCRATCH}."${s}__${t}"`
      const file = join(backupDir, 'data', `${fq}.copy`)
      const linha = { tabela: fq }
      try {
        if (!existsSync(file)) throw new Error('arquivo .copy ausente')
        const cols = colsByTable.get(fq)
        if (!cols || !cols.length) throw new Error('colunas ausentes no manifest (backup de formato antigo?)')
        // scratch estruturalmente idêntico (INCLUDING GENERATED → recomputa as colunas geradas).
        await qExec(`CREATE TABLE ${scratchFq} (LIKE ${fq} INCLUDING GENERATED);`)
        // Restore por COPY FROM (streaming) — sem parsing de INSERT, sem batelagem de API.
        await pgCopyIn(scratchFq, cols, file)
        const prod = await contaEChecksum(fq)         // ← produção VIVA, a cada execução
        const rest = await contaEChecksum(scratchFq)  // ← restaurado do dump no scratch
        linha.prod = prod; linha.restaurado = rest
        linha.bate = prod.count === rest.count && prod.checksum === rest.checksum
        if (!linha.bate) motivos.push(`${fq}: prod(${prod.count}/${prod.checksum.slice(0, 8)}) ≠ restaurado(${rest.count}/${rest.checksum.slice(0, 8)})`)
      } catch (e) {
        linha.bate = false; linha.erro = String(e.message || e).slice(0, 240)
        motivos.push(`${fq}: falha no restore-test — ${linha.erro}`)
      }
      relatorio.restore.push(linha)
    }
  } finally {
    // Cleanup GARANTIDO — scratch nunca vaza em produção, mesmo em falha.
    try { await qExec(`DROP SCHEMA IF EXISTS ${SCRATCH} CASCADE;`) } catch { /* best-effort */ }
  }

  relatorio.veredito = motivos.length ? 'VERMELHO' : 'VERDE'
  return { ok: motivos.length === 0, motivos, relatorio }

  function red(ms) { return { ok: false, motivos: ms, relatorio: { ...relatorio, veredito: 'VERMELHO' } } }
}

export function imprimirRelatorio({ ok, motivos, relatorio }) {
  const c = relatorio.completude
  console.log(`\n━━━ BACKUP-GATE · relatório ━━━`)
  console.log(`backup:   ${relatorio.backupDir}`)
  console.log(`modo:     ${relatorio.mode}    gerado_em: ${relatorio.gerado_em ?? '—'}`)
  console.log(`completude: ${c.tabelas_vivas ?? '?'} vivas / ${c.tabelas_no_manifest ?? '?'} no manifest` +
    `${c.faltam_no_backup?.length ? ` · FALTAM: ${c.faltam_no_backup.join(', ')}` : ''}` +
    `${c.sem_arquivo?.length ? ` · SEM .copy: ${c.sem_arquivo.join(', ')}` : ''}` +
    `${c.export_incompleto?.length ? ` · EXPORT INCOMPLETO: ${c.export_incompleto.join(', ')}` : ''}`)
  console.log(`restore-test (${relatorio.restore.length} tabela(s), produção × restaurado):`)
  for (const r of relatorio.restore) {
    const tag = r.bate ? '✓' : '✗'
    if (r.erro) console.log(`  ${tag} ${r.tabela} — ERRO: ${r.erro}`)
    else console.log(`  ${tag} ${r.tabela}  prod ${r.prod.count} (${r.prod.checksum.slice(0, 8)}) · rest ${r.restaurado.count} (${r.restaurado.checksum.slice(0, 8)})`)
  }
  console.log(`\nVEREDITO: ${relatorio.veredito}`)
  if (!ok) { console.log('motivos:'); motivos.forEach(m => console.log(`  • ${m}`)) }
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`)
}

// CLI
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const backupDir = process.argv[2]
  if (!backupDir) { console.error('uso: node verificar.mjs <dir-backup> [--mode=spot|full] [--only schema.tabela]'); process.exit(2) }
  const modeArg = (process.argv.find(a => a.startsWith('--mode=')) || '--mode=spot').split('=')[1]
  const onlyIdx = process.argv.indexOf('--only')
  const only = onlyIdx >= 0 ? process.argv[onlyIdx + 1] : undefined
  let res
  try {
    res = await verificar(backupDir, { mode: modeArg, only })
  } finally {
    await closePool()
  }
  imprimirRelatorio(res)
  process.exit(res.ok ? 0 : 1)
}
