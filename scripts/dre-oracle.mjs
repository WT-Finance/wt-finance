// Oracle da reestruturação da DRE (v5.7.0).
//
// Lê `get_dre_mensal` por REST/service_role e imprime, por ano, as linhas que a
// migration de estrutura move — e as duas que ela NÃO PODE mover (RAIR e REX).
//
//   node scripts/dre-oracle.mjs            → só o retrato de agora
//   node scripts/dre-oracle.mjs antes.json → grava o retrato num arquivo
//   node scripts/dre-oracle.mjs antes.json --comparar
//                                          → compara o agora contra o retrato gravado
//
// POR QUE existe: a migration é destrutiva e aplicada à mão, em produção, sem
// staging. O invariante que a autoriza — "o resultado final não muda um centavo" —
// precisa ser conferível no ATO, e não só no papel. Para 2024 e 2025 os números são
// estáveis e já estão no cabeçalho do patch; **2026 anda todo dia** (o total do ano
// corrente inclui previsto, que amadurece), então só um par antes/depois tirado com
// minutos de diferença prova alguma coisa ali.
//
// Uso previsto: rodar com `antes.json` ANTES de aplicar, aplicar, rodar de novo com
// `--comparar`. Leitura pura — não escreve nada no banco.

import { readFileSync, writeFileSync } from 'node:fs'

const RAW = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const HOST = RAW.replace(/\/+$/, '').replace(/\/rest\/v1$/, '')
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!HOST || !KEY) {
  console.error('Faltam SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente.')
  console.error('Rode com: set -a; . .env.local; set +a; node scripts/dre-oracle.mjs')
  process.exit(1)
}

const ANOS = [2024, 2025, 2026]
/** As linhas que interessam: as que a reestruturação move e as que ela não pode mover. */
const CHAVES = ['ROL', 'IMOB', 'FIN', 'DESP_H', 'LOP', 'LL', 'INV_H', 'RAIR', 'REX']
/** RAIR e REX são o oracle propriamente dito — qualquer delta aqui reprova a migration. */
const INVARIANTES = ['RAIR', 'REX']

const brl = v =>
  v < 0
    ? `(${Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`
    : v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

async function totaisDoAno(ano) {
  const res = await fetch(`${HOST}/rest/v1/rpc/get_dre_mensal`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_ano: ano }),
  })
  if (!res.ok) throw new Error(`get_dre_mensal(${ano}) → HTTP ${res.status}: ${await res.text()}`)
  const d = await res.json()
  const porChave = Object.fromEntries(
    d.linhas.filter(l => l.chave).map(l => [l.chave, l.total]),
  )
  return Object.fromEntries(CHAVES.filter(k => k in porChave).map(k => [k, porChave[k]]))
}

const [arquivo, flag] = process.argv.slice(2)
const comparar = flag === '--comparar'

const agora = {}
for (const ano of ANOS) agora[ano] = await totaisDoAno(ano)

if (arquivo && !comparar) {
  writeFileSync(arquivo, JSON.stringify(agora, null, 2))
  console.log(`Retrato gravado em ${arquivo}.`)
}

const antes = comparar ? JSON.parse(readFileSync(arquivo, 'utf8')) : null

for (const ano of ANOS) {
  console.log(`\n── ${ano} ${'─'.repeat(58)}`)
  console.log(
    comparar
      ? 'linha'.padEnd(10) + 'ANTES'.padStart(20) + 'DEPOIS'.padStart(20) + 'DELTA'.padStart(20)
      : 'linha'.padEnd(10) + 'TOTAL'.padStart(20),
  )
  for (const k of CHAVES) {
    const v = agora[ano]?.[k]
    if (v === undefined) continue
    if (!comparar) { console.log(k.padEnd(10) + brl(v).padStart(20)); continue }
    const a = antes[ano]?.[k]
    if (a === undefined) { console.log(k.padEnd(10) + '—'.padStart(20) + brl(v).padStart(20) + ' (linha nova)'); continue }
    const delta = v - a
    // Meio centavo: o mesmo limiar de zero contábil usado na tela.
    const marca = INVARIANTES.includes(k) ? (Math.abs(delta) < 0.005 ? '  ✅' : '  ❌ REPROVA') : ''
    console.log(k.padEnd(10) + brl(a).padStart(20) + brl(v).padStart(20) + brl(delta).padStart(20) + marca)
  }
}

if (comparar) {
  const falhas = ANOS.flatMap(ano =>
    INVARIANTES
      .filter(k => antes[ano]?.[k] !== undefined && Math.abs(agora[ano][k] - antes[ano][k]) >= 0.005)
      .map(k => `${ano}/${k}`),
  )
  console.log(
    falhas.length === 0
      ? '\n✅ ORACLE OK — RAIR e REX idênticos ao centavo em todos os anos.'
      : `\n❌ ORACLE REPROVA em: ${falhas.join(', ')}`,
  )
  process.exit(falhas.length === 0 ? 0 : 1)
}
