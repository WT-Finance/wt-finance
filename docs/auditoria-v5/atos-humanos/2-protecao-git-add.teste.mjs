// Prova do hook proposto (Ato 2) antes de oferecê-lo no PR.
import { spawnSync } from 'node:child_process'
const H = new URL('./2-protecao-git-add.mjs', import.meta.url).pathname

const roda = (cmd, env = {}) => spawnSync('node', [H], {
  input: JSON.stringify({ tool_input: { command: cmd } }),
  env: { ...process.env, ...env }, encoding: 'utf8',
}).status

const BLOQUEIA = [
  'git add -A', 'git add --all', 'git add -a', 'git add .', 'git add :/',
  'git -C /tmp add -A', 'npm run lint && git add -A', 'git add  -A  ',
  'git --no-pager add --all', 'git add -A -- src/',
]
const PASSA = [
  'git add src/lib/fmt.ts', 'git add -p', 'git add -u', 'git add docs/ src/',
  'git commit -m "menciona add -A no texto"',
  'git commit -m "Nao usar git add -A cego (CLAUDE.md)"',
  'git status --short', 'git add --patch src/',
  'git log --oneline | grep "add -A"',
  'git add supabase/migrations/0269_x.sql',
]

let falhas = 0
console.log('=== deve BLOQUEAR (exit 2) ===')
for (const c of BLOQUEIA) {
  const rc = roda(c); const ok = rc === 2
  if (!ok) falhas++
  console.log(`  ${ok ? 'OK    ' : 'FALHOU'} exit=${rc}  ${c}`)
}
console.log('=== deve PASSAR (exit 0) ===')
for (const c of PASSA) {
  const rc = roda(c); const ok = rc === 0
  if (!ok) falhas++
  console.log(`  ${ok ? 'OK    ' : 'FALHOU'} exit=${rc}  ${c}`)
}
console.log('=== escapes ===')
for (const [v, c] of [['WT_PERMITIR_ADD_TUDO', 'git add -A'], ['WT_DESLIGAR_HOOKS', 'git add -A']]) {
  const rc = roda(c, { [v]: '1' }); const ok = rc === 0
  if (!ok) falhas++
  console.log(`  ${ok ? 'OK    ' : 'FALHOU'} exit=${rc}  ${v}=1 com "${c}"`)
}
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTODOS OS CASOS PASSARAM')
