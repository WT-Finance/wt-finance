#!/usr/bin/env node
// Wrapper de aplicação de migration: roda o backup-gate (REDE de recuperação) e só
// então aplica. O gate NÃO substitui a confirmação humana de migration destrutiva.
//
//   --aditiva     → gate verde ⇒ aplica (auto). Migration aditiva/retrocompatível.
//   --destrutiva  → gate verde ⇒ aplica COM **confirmação humana** (não auto-confirma).
//   (sem flag / heurística destrutiva) → trata como destrutiva (erra para o seguro).
//   --label/--reuse/--full → repassados ao gate.
//
// v4.27.1 (ADR-0131):
//  • M1 — A confirmação destrutiva é DO WRAPPER, com default ABORTAR em stdin não-TTY/EOF.
//    Antes o ramo destrutivo delegava ao prompt do `db push` (stdio:'inherit'), cujo default
//    headless PROSSEGUE → fail-open; a segurança dependia do harness externo. Agora o EOF é
//    barrado pelo PRÓPRIO código, antes mesmo do gate.
//  • M2 — A classificação "destrutiva" vem de classificar.mjs (TOKENIZER que excisa
//    comentários/strings/corpos $$…$$ e casa só top-level), não mais de uma regex sobre o
//    texto cru — fim dos falsos-positivos de DML no CORPO de uma função (0150/0153/0154).

import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline/promises'
import { REPO } from './lib.mjs'                              // fonte única, worktree-aware (v4.20.0)
import { classificarSql, confirmaDestrutivaEOF } from './classificar.mjs'  // decisões puras (v4.27.1)

const HERE = dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const flag = n => argv.includes(n)

// ── nível da(s) migration(s) pendente(s): 'aditiva' | 'warn' | 'destrutiva' ──
// Usa o classificador PURO (tokenizer + top-level) por arquivo; agrega pelo MAIS forte.
function heuristicaNivel() {
  try {
    const out = execFileSync('npx', ['supabase', 'migration', 'list', '--linked'], { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    const pend = []
    for (const ln of out.split('\n')) { const m = ln.match(/^\s*(\d{4,})\s*\|\s*\|\s*\d/); if (m) pend.push(m[1]) }
    const dir = join(REPO, 'supabase', 'migrations')
    const arquivos = readdirSync(dir).filter(f => pend.some(p => f.startsWith(p)))
    let nivel = 'aditiva'
    for (const f of arquivos) {
      let sql
      try { sql = readFileSync(join(dir, f), 'utf8') } catch { return 'destrutiva' }   // ilegível → falha fechada
      const c = classificarSql(sql).nivel
      if (c === 'destrutiva') return 'destrutiva'
      if (c === 'warn') nivel = 'warn'
    }
    return nivel
  } catch { return 'aditiva' }   // sem lista de pendentes → não força (o flag manda; default já é destrutiva)
}

let destrutiva = !flag('--aditiva')                 // default seguro: destrutiva
if (flag('--destrutiva')) destrutiva = true
if (!destrutiva) {
  const nivel = heuristicaNivel()
  if (nivel === 'destrutiva') {
    console.log('⚠ heurística: migration pendente é DESTRUTIVA (DROP/TRUNCATE/UPDATE/DELETE top-level) → exigindo confirmação humana (ignorando --aditiva).')
    destrutiva = true
  } else if (nivel === 'warn') {
    console.log('⚠ heurística: migration pendente TROCA a ASSINATURA de uma função (DROP FUNCTION;CREATE). Aplicando como ADITIVA conforme --aditiva — confira se a nova assinatura é retrocompatível.')
  }
}

// ── M1: EOF-abortar ANTES de tocar produção (e antes do gate, para não gastar um backup à toa).
// Migration destrutiva sem terminal interativo (stdin não-TTY / EOF) → ABORTA. EOF JAMAIS confirma.
if (destrutiva && !process.stdin.isTTY) {
  console.error('\n✗ Migration DESTRUTIVA sem terminal interativo (stdin não-TTY/EOF) → ABORTADA.')
  console.error('  EOF/headless NUNCA confirma uma destrutiva (era fail-open). Rode num terminal')
  console.error('  interativo e confirme conscientemente — ou use --aditiva se for retrocompatível.')
  process.exit(1)
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
  // Migration DESTRUTIVA: confirmação humana CONSCIENTE, no wrapper (chegamos aqui só com TTY —
  // o EOF já abortou acima). O gate é rede, não autorização.
  console.log('\n✓ gate verde (rede de recuperação OK).')
  console.log('⚠ Migration DESTRUTIVA: CONFIRMAÇÃO HUMANA obrigatória.')
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  let resposta = null
  try {
    resposta = await rl.question('   Digite "aplicar" (ou Y) para CONFIRMAR — qualquer outra coisa ABORTA: ')
  } catch {
    resposta = null   // EOF no meio do prompt → não confirma (falha fechada)
  } finally {
    rl.close()
  }
  if (!confirmaDestrutivaEOF(process.stdin.isTTY, resposta)) {
    console.error('✗ Confirmação não recebida → ABORTADA. Nada foi aplicado a produção.')
    process.exit(1)
  }
  try {
    // O humano já confirmou AQUI → auto-responde o prompt do próprio `db push`.
    execFileSync('npx', ['supabase', 'db', 'push', '--linked'], { cwd: REPO, input: 'Y\n', stdio: ['pipe', 'inherit', 'inherit'] })
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
