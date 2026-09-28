// Copia os anexos do briefing v6.0.0 para `tests/fixtures/ingestao/` (gitignorado) e confere
// o sha256 de cada um contra `fixtures-manifest.json`. Os arquivos NUNCA entram no git —
// Vendas cru traz CPF/CNPJ/e-mail (decisão 3 da v6.0.0) e o conjunto passa de 30 MB.
//
// Uso:
//   JANUS_ANEXOS_DIRS="/mnt/c/Users/x/Downloads:/mnt/c/Users/x/Office 365/..." \
//     node scripts/ingestao/fixtures.mjs            # copia + confere
//   node scripts/ingestao/fixtures.mjs --verificar  # só confere o que já está no destino
//
// Procura cada `origem` (nome do arquivo como exportado) em TODAS as pastas de
// JANUS_ANEXOS_DIRS (separador `:`), recursivamente até 3 níveis. Hash divergente ABORTA:
// fixture com hash diferente do manifest não é a fixture — é outro export, e o oráculo
// que roda em cima dela estaria medindo outra coisa.
import { createHash } from 'node:crypto'
import { readFileSync, existsSync, readdirSync, statSync, mkdirSync, copyFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const manifest = JSON.parse(readFileSync(join(RAIZ, 'scripts/ingestao/fixtures-manifest.json'), 'utf8'))
const DESTINO = join(RAIZ, manifest.destino)
const soVerificar = process.argv.includes('--verificar')

function sha256(caminho) {
  return createHash('sha256').update(readFileSync(caminho)).digest('hex')
}

/** TODOS os candidatos com esse nome (o mesmo export costuma existir em mais de uma pasta,
 *  em versões diferentes — Downloads de 25/08 × Office 365 de 21/09). Quem decide é o hash. */
function procurar(nome, dirs, profundidade = 0, acc = []) {
  for (const d of dirs) {
    if (!existsSync(d)) continue
    const direto = join(d, nome)
    if (existsSync(direto)) acc.push(direto)
    if (profundidade >= 3) continue
    let filhos = []
    try { filhos = readdirSync(d).map(f => join(d, f)).filter(p => { try { return statSync(p).isDirectory() } catch { return false } }) } catch { /* sem acesso */ }
    procurar(nome, filhos, profundidade + 1, acc)
  }
  return acc
}

mkdirSync(DESTINO, { recursive: true })
const dirs = (process.env.JANUS_ANEXOS_DIRS ?? '').split(':').filter(Boolean)
if (!soVerificar && dirs.length === 0) {
  console.error('Defina JANUS_ANEXOS_DIRS (pastas separadas por ":") ou use --verificar.')
  process.exit(2)
}

let ok = 0, faltando = 0, divergentes = 0
for (const f of manifest.fixtures) {
  const alvo = join(DESTINO, f.nome)
  if (!soVerificar && !existsSync(alvo)) {
    const candidatos = procurar(f.origem, dirs)
    if (candidatos.length === 0) { console.log(`FALTA   ${f.nome}  (origem "${f.origem}" não encontrada)`); faltando++; continue }
    const certo = candidatos.find(c => sha256(c) === f.sha256)
    if (!certo) {
      console.log(`DIVERGE ${f.nome}  ${candidatos.length} candidato(s) com esse nome, nenhum com o sha256 do manifest:`)
      for (const c of candidatos) console.log(`          ${c}`)
      divergentes++; continue
    }
    copyFileSync(certo, alvo)
  }
  if (!existsSync(alvo)) { console.log(`FALTA   ${f.nome}`); faltando++; continue }
  const h = sha256(alvo)
  if (h !== f.sha256) { console.log(`DIVERGE ${f.nome}  sha256=${h.slice(0, 12)}… esperado ${f.sha256.slice(0, 12)}…`); divergentes++; continue }
  console.log(`OK      ${f.nome}`)
  ok++
}
console.log(`\n${ok} ok · ${faltando} faltando · ${divergentes} divergentes  →  ${manifest.destino}`)
if (divergentes > 0) process.exit(1)
