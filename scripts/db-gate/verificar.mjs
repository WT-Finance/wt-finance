#!/usr/bin/env node
// Verificador do backup-gate. Prova que um backup é (1) COMPLETO vs produção e
// (2) RESTAURÁVEL e FIEL — restaurando num schema descartável e comparando o
// RESTAURADO contra a TABELA VIVA DE PRODUÇÃO (count + checksum por tabela).
//
// A comparação é PRODUÇÃO × RESTAURADO, NUNCA dump × restaurado: restaurar e
// comparar contra o próprio dump seria circular (provaria round-trip, não fidelidade
// à produção). Lê produção viva a cada verificação — é a razão de existir do gate.
//
// Uso:  node verificar.mjs <dir-backup> --mode=full|spot [--spot schema.tabela]
// Exit: 0 = VERDE (tudo bate) · ≠0 = VERMELHO (motivo no relatório).

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { qExec, contaEChecksum, tabelasVivas } from './lib.mjs'

const SCRATCH = 'gate_scratch'
// Teto de corpo por chamada da Management API (rejeita ~>1MB) — conservador a 500KB.
const BATCH_BYTES = 500_000
// Subconjunto-chave do SPOT robusto (núcleo mínimo): financeiras críticas + FK + grande +
// coluna gerada + auth. NÃO é amostra ingênua — cobre os tipos de tabela que mais doem.
const KEY_TABLES = [
  'financeiro.fato_lancamentos',     // financeira crítica (~19k)
  'analytics.fato_venda',            // financeira/vendas + FK p/ analytics.dim_data + a "grande" do subconjunto (~27k)
  'analytics.dim_operacao_weddings', // coluna GERADA (resultado_caixa/ncg) — mantém o fix coberto
  'app.rbac_usuarios',               // auth/RBAC crítica
]

/** Extrai os INSERTs de um arquivo de dump, reescritos para o alvo scratch.
 *  Splitter idêntico ao restaurar.mjs (provado A/B v4.15): fecha statement em linha
 *  terminada em ';' que não começa com espaço (linhas-valor `(...)` do meio terminam
 *  em ',', e só a última linha do INSERT termina em ';'). GUARDA DURA: o statement
 *  reescrito só pode inserir no schema scratch — qualquer INSERT que escaparia para
 *  uma tabela fora do scratch lança (o verificador NUNCA escreve em dado real). */
function insertsParaScratch(fileContent, fq, scratchFq) {
  const statements = []
  let atual = []
  for (const linha of fileContent.split('\n')) {
    if (linha.startsWith('--')) continue
    atual.push(linha)
    if (linha.endsWith(';') && !linha.startsWith(' ')) {
      const stmt = atual.join('\n').trim()
      atual = []
      if (!stmt.startsWith(`INSERT INTO ${fq} (`)) continue   // ignora BEGIN/TRUNCATE/setval/COMMIT
      const rew = stmt.split(`INSERT INTO ${fq} (`).join(`INSERT INTO ${scratchFq} (`)
      for (const m of rew.matchAll(/INSERT\s+INTO\s+(\S+)/gi)) {
        if (!m[1].startsWith(SCRATCH + '.')) throw new Error(`statement inseriria FORA do scratch (${m[1]}) — abortando por segurança`)
      }
      statements.push(rew)
    }
  }
  return statements
}

export function verificar(backupDir, { mode, only } = {}) {
  const manifestPath = join(backupDir, 'manifest.json')
  if (!existsSync(manifestPath)) return red([`manifest.json ausente em ${backupDir}`])

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const manifestTabs = manifest.tabelas.map(t => t.tabela)
  const motivos = []
  const relatorio = { backupDir, mode, gerado_em: manifest.gerado_em, completude: {}, restore: [], veredito: null }

  // ── (1) COMPLETUDE ───────────────────────────────────────────────────────
  const vivas = tabelasVivas()
  const faltamNoBackup = vivas.filter(t => !manifestTabs.includes(t))           // prod ⊆ manifest?
  const semArquivo = manifest.tabelas.filter(t => !existsSync(join(backupDir, 'data', `${t.tabela}.sql`))).map(t => t.tabela)
  const exportIncompleto = manifest.tabelas.filter(t => t.ok === false).map(t => t.tabela)
  relatorio.completude = { tabelas_vivas: vivas.length, tabelas_no_manifest: manifestTabs.length, faltam_no_backup: faltamNoBackup, sem_arquivo_sql: semArquivo, export_incompleto: exportIncompleto }
  if (faltamNoBackup.length) motivos.push(`tabela(s) viva(s) ausente(s) do backup: ${faltamNoBackup.join(', ')}`)
  if (semArquivo.length) motivos.push(`arquivo .sql ausente para: ${semArquivo.join(', ')}`)
  if (exportIncompleto.length) motivos.push(`export incompleto (ok=false) em: ${exportIncompleto.join(', ')}`)

  // Falha rápido: se a completude já reprovou, não adianta restaurar (já está vermelho).
  if (motivos.length) { relatorio.veredito = 'VERMELHO'; relatorio.restore_pulado = 'completude reprovou'; return { ok: false, motivos, relatorio } }

  // ── (2) RESTORE-TEST (PRODUÇÃO × RESTAURADO) ──────────────────────────────
  // Núcleo mínimo = SPOT robusto: subconjunto de tabelas-chave (financeiras críticas +
  // FK + grande + coluna gerada + auth), NÃO as 38. `full` (todas) é follow-up.
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
    qExec(`DROP SCHEMA IF EXISTS ${SCRATCH} CASCADE; CREATE SCHEMA ${SCRATCH};`)
    let i = 0
    for (const fq of alvos) {
      process.stdout.write(`\r  restaurando ${++i}/${alvos.length}: ${fq}                    `)
      const [s, t] = fq.split('.')
      const scratchFq = `${SCRATCH}."${s}__${t}"`
      const file = join(backupDir, 'data', `${fq}.sql`)
      const linha = { tabela: fq }
      try {
        if (!existsSync(file)) throw new Error('arquivo .sql ausente')
        // scratch estruturalmente idêntico (INCLUDING GENERATED → recomputa colunas geradas).
        qExec(`CREATE TABLE ${scratchFq} (LIKE ${fq} INCLUDING GENERATED);`)
        const inserts = insertsParaScratch(readFileSync(file, 'utf8'), fq, scratchFq)
        // Batelagem: empacota vários INSERTs por chamada (até ~${(BATCH_BYTES / 1000) | 0}KB) para
        // reduzir round-trips da Management API no modo completo. A API aceita multi-statement; cada
        // INSERT já passou pela guarda scratch-only em insertsParaScratch. Um INSERT > budget vai sozinho.
        let lote = [], bytes = 0
        const flush = () => { if (lote.length) { qExec(lote.join('\n')); lote = []; bytes = 0 } }
        for (const ins of inserts) {
          if (bytes + ins.length > BATCH_BYTES && lote.length) flush()
          lote.push(ins); bytes += ins.length + 1
        }
        flush()
        const prod = contaEChecksum(fq)         // ← produção VIVA, a cada execução
        const rest = contaEChecksum(scratchFq)  // ← restaurado do dump no scratch
        linha.prod = prod; linha.restaurado = rest
        linha.bate = prod.count === rest.count && prod.checksum === rest.checksum
        if (!linha.bate) motivos.push(`${fq}: prod(${prod.count}/${prod.checksum.slice(0, 8)}) ≠ restaurado(${rest.count}/${rest.checksum.slice(0, 8)})`)
      } catch (e) {
        // Surface o erro REAL — o supabase CLI prefixa stderr com ruído
        // ("Initialising login role...", "Connecting...") que mascararia a causa.
        const raw = String(e.stderr || e.message || e)
        const limpo = raw.split('\n').map(l => l.trim())
          .filter(l => l && !/^(Initialising|Connecting|Applying|Finished|Skipping)\b/.test(l))
          .join(' ').slice(0, 240)
        linha.bate = false; linha.erro = limpo || raw.slice(0, 240)
        motivos.push(`${fq}: falha no restore-test — ${linha.erro}`)
      }
      relatorio.restore.push(linha)
    }
  } finally {
    // Cleanup GARANTIDO — scratch nunca vaza em produção, mesmo em falha.
    try { qExec(`DROP SCHEMA IF EXISTS ${SCRATCH} CASCADE;`) } catch { /* tentativa best-effort */ }
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
    `${c.sem_arquivo_sql?.length ? ` · SEM .sql: ${c.sem_arquivo_sql.join(', ')}` : ''}` +
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
  const res = verificar(backupDir, { mode: modeArg, only })
  imprimirRelatorio(res)
  process.exit(res.ok ? 0 : 1)
}
