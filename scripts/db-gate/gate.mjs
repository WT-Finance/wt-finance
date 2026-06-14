#!/usr/bin/env node
// Backup-gate (REDE de recuperação, não autorização): ANTES de aplicar migration,
// (1) gera backup do dia, (2) prova COMPLETUDE (todas as tabelas vivas presentes,
// count conferido) e (3) restaura um SUBCONJUNTO-CHAVE num schema descartável e
// compara produção × restaurado (count + checksum). Verde → o wrapper pode seguir
// (aditiva: aplica; destrutiva: aplica COM confirmação humana). Vermelho → exit ≠0.
//
// Uso:  node gate.mjs [--full] [--label <nome>] [--reuse <dir>]
//   (default)     → restore-test SPOT robusto (subconjunto-chave). É o núcleo mínimo.
//   --full        → restore-test de TODAS as tabelas (FOLLOW-UP; lento; ainda não é o caminho).
//   --label <n>   → nome do diretório do backup do dia.
//   --reuse <dir> → não gera backup novo; re-verifica um backup existente (testes/re-run).

import { execFileSync } from 'node:child_process'
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { verificar, imprimirRelatorio } from './verificar.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = '/home/yan-wt/projects/wt-finance'
const BACKUP_ROOT = join(homedir(), 'wt-finance-backups')

const argv = process.argv.slice(2)
const flag = n => argv.includes(n)
const val = n => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined }

const mode = flag('--full') ? 'full' : 'spot'   // spot (subconjunto) é o núcleo; full é follow-up

// ── backup ────────────────────────────────────────────────────────────────────
let backupDir = val('--reuse')
if (backupDir) {
  console.log(`↺ reusando backup existente: ${backupDir} (sem gerar novo)`)
  if (!existsSync(backupDir)) { console.error(`backup ${backupDir} não existe`); process.exit(2) }
} else {
  const stamp = new Date().toISOString()
  const dia = stamp.slice(0, 10)
  const label = val('--label') || 'pre-migration'
  let dir = join(BACKUP_ROOT, `${dia}-${label}`)
  if (existsSync(dir)) dir = join(BACKUP_ROOT, `${dia}-${label}-${stamp.slice(11, 19).replace(/:/g, '')}`)
  mkdirSync(dir, { recursive: true })
  backupDir = dir
  console.log(`→ backup do dia em ${backupDir} ...`)
  try {
    execFileSync('node', [join(HERE, 'exportar.mjs'), backupDir], { cwd: REPO, stdio: 'inherit' })
  } catch {
    console.error('✗ backup FALHOU — gate VERMELHO (não há rede; push abortado).')
    process.exit(1)
  }
}

// ── verificação ─────────────────────────────────────────────────────────────
console.log(`→ verificando (restore-test ${mode === 'full' ? 'COMPLETO/follow-up' : 'SPOT subconjunto-chave'}) ...`)
const t0 = Date.now()
const res = verificar(backupDir, { mode })
const dur = ((Date.now() - t0) / 1000).toFixed(1)
imprimirRelatorio(res)
console.log(`duração da verificação: ${dur}s`)

// relatório auditável (referenciado pela "declaração prévia" da migration)
try { writeFileSync(join(backupDir, 'gate-report.json'), JSON.stringify({ ...res.relatorio, duracao_s: Number(dur), motivos: res.motivos }, null, 2)) } catch { /* não-fatal */ }

if (!res.ok) { console.error('GATE VERMELHO → migration NÃO autorizada (rede comprometida).'); process.exit(1) }
console.log('GATE VERDE → rede de recuperação OK.')
process.exit(0)
