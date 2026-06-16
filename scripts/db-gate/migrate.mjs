#!/usr/bin/env node
// Wrapper de aplicação de migration: roda o backup-gate (REDE de recuperação) e só
// então aplica. O gate NÃO substitui a confirmação humana de migration destrutiva.
//
//   --aditiva     → gate verde ⇒ aplica (auto). Migration aditiva/retrocompatível.
//   --destrutiva  → gate verde ⇒ aplica COM **confirmação humana** (não auto-confirma).
//   (sem flag / heurística destrutiva) → trata como destrutiva (erra para o seguro).
//   --label/--reuse/--full → repassados ao gate.
//
// O caminho recomendado de push é este wrapper (o gate é a rede). `npx supabase db push`
// cru continua possível, mas pula a rede — evite. Para destrutiva, a confirmação humana
// permanece obrigatória (cláusula do CLAUDE.md inalterada).

import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { REPO } from './lib.mjs'   // fonte única, worktree-aware (v4.20.0)

const HERE = dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const flag = n => argv.includes(n)

// ── tipo: aditiva só se EXPLÍCITO e a migration pendente não cheirar destrutiva ──
function heuristicaDestrutiva() {
  try {
    const out = execFileSync('npx', ['supabase', 'migration', 'list', '--linked'], { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    const pend = []
    for (const ln of out.split('\n')) { const m = ln.match(/^\s*(\d{4,})\s*\|\s*\|\s*\d/); if (m) pend.push(m[1]) }
    const dir = join(REPO, 'supabase', 'migrations')
    const re = /\bDROP\s+(table|column|function|schema|view|index|type|trigger|policy)\b|\bTRUNCATE\b|\bALTER\s+TABLE[\s\S]*?\bDROP\b|\bDELETE\s+FROM\b|\bUPDATE\s+\w/i
    return readdirSync(dir).filter(f => pend.some(p => f.startsWith(p)))
      .some(f => { try { return re.test(readFileSync(join(dir, f), 'utf8')) } catch { return false } })
  } catch { return false }
}

let destrutiva = !flag('--aditiva')                 // default seguro: destrutiva
if (flag('--destrutiva')) destrutiva = true
if (!destrutiva && heuristicaDestrutiva()) {
  console.log('⚠ heurística: migration pendente parece DESTRUTIVA → exigindo confirmação humana (ignorando --aditiva).')
  destrutiva = true
}

// 1) GATE (rede) — backup + completude + restore-test spot. Exit ≠0 aborta antes de tocar produção.
let gateOk = true
try {
  execFileSync('node', [join(HERE, 'gate.mjs'), ...argv], { cwd: REPO, stdio: 'inherit' })
} catch { gateOk = false }

if (!gateOk) {
  console.error('\n✗ GATE VERMELHO — aplicação ABORTADA. Nada tocou produção.')
  console.error('  Leia o relatório (gate-report.json no diretório do backup) e corrija antes de reaplicar.')
  process.exit(1)
}

// 2) APLICAÇÃO — gate verde garante a REDE; agora aplica.
if (destrutiva) {
  // Migration DESTRUTIVA: a confirmação humana PERMANECE (CLAUDE.md inalterado). O gate é rede,
  // não autorização. NÃO auto-confirma — o prompt do `db push` exige um humano responder.
  console.log('\n✓ gate verde (rede de recuperação OK).')
  console.log('⚠ Migration DESTRUTIVA: CONFIRMAÇÃO HUMANA obrigatória. Responda ao prompt do db push (Y para aplicar).')
  try {
    execFileSync('npx', ['supabase', 'db', 'push', '--linked'], { cwd: REPO, stdio: 'inherit' })
  } catch (e) {
    console.error('✗ db push não concluído (recusado/abortado):', String(e.message || e).slice(0, 160))
    process.exit(1)
  }
} else {
  // Migration ADITIVA/retrocompatível: regime autônomo — aplica.
  console.log('\n✓ gate verde → aplicando migration aditiva (db push)...\n')
  try {
    execFileSync('npx', ['supabase', 'db', 'push', '--linked'], { cwd: REPO, input: 'Y\n', stdio: ['pipe', 'inherit', 'inherit'] })
  } catch (e) {
    console.error('✗ db push falhou:', String(e.message || e).slice(0, 160))
    process.exit(1)
  }
}
console.log('\n✓ concluído.')
