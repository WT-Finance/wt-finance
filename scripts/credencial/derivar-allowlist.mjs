// Deriva a ALLOWLIST de EXECUTE de uma credencial de máquina a partir do CÓDIGO que a usa —
// nunca redigida à mão (invariante 4 do briefing da role `verificador`, v6.0.0/M1).
//
//   node scripts/credencial/derivar-allowlist.mjs verificador   # imprime o bloco GRANT
//   node scripts/credencial/derivar-allowlist.mjs verificador --json
//
// Como funciona:
//   1. Lê as FONTES declaradas para a credencial (abaixo) e extrai os nomes de RPC chamados —
//      `rpc('nome'` nos testes de contrato e `/rest/v1/rpc/nome` nos scripts de medição.
//   2. Resolve cada nome no CATÁLOGO VIVO por assinatura (`pg_get_function_identity_arguments`),
//      porque há sobrecargas em `public` e grant por nome cru é ambíguo.
//   3. Emite `GRANT EXECUTE ON FUNCTION public.<fn>(<args>) TO <role>;` — um por assinatura —
//      e reporta o que NÃO resolveu (nome sem função no catálogo = teste apontando para RPC
//      morta) e o que tem mais de uma assinatura (todas recebem o grant; o teste chama por
//      nome e o PostgREST resolve pelo corpo).
//
// A conexão é a direta (`SUPABASE_DB_URL`) travada em READ ONLY na sessão — este script só lê
// catálogo (`sonda-teste-escreve-banco.test.ts` cobra a trava; está em SOMENTE_LEITURA lá).
//
// Por que derivar e não filtrar por volatilidade: `public` tem ~191 VOLATILE e entre eles há
// leitores puros (`get_cagr`, `get_acumulado_weddings`) — VOLATILE é o default de quem não
// declarou nada. A allowlist é o que a verificação CHAMA; RPC nova nasce fora dela de
// propósito (fail-closed: o caso de contrato dela falha com PERMISSAO_NEGADA até alguém
// conceder deliberadamente).
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from 'dotenv'
import pg from 'pg'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
config({ path: join(RAIZ, '.env.local'), quiet: true })

/** Fontes por credencial: de onde vem a lista do que ela pode executar. */
const FONTES = {
  verificador: [
    // testes de contrato REST — chamam `rpc('<nome>', ...)` direto OU pela lista viva F7
    // (`{ fn: '<nome>', params, schema }`, percorrida com `rpc(c.fn, …)`)
    { arquivo: 'src/lib/rpc-contrato.test.ts', padrao: /\brpc\(\s*'([a-z_0-9]+)'/g },
    { arquivo: 'src/lib/rpc-contrato.test.ts', padrao: /\bfn:\s*'([a-z_0-9]+)'/g },
    // (`reverter-diario.test.ts` NÃO é fonte: exercita RPCs de ESCRITA em transação revertida
    // com identidade simulada, por `pg` — nunca pela credencial de verificação.)
    // scripts de medição — batem em `/rest/v1/rpc/<nome>`
    { arquivo: 'scripts/dre-oracle.mjs', padrao: /\/rest\/v1\/rpc\/([a-z_0-9]+)/g },
  ],
  // `ingestor` (M2): as RPCs de staging + promoção das 5 bases — fonte é a rota de ingestão.
  ingestor: [
    { arquivo: 'src/lib/ingestao/rpcs-ingestor.ts', padrao: /\brpc\(\s*'([a-z_0-9]+)'/g },
  ],
}

const role = process.argv[2]
const json = process.argv.includes('--json')
if (!FONTES[role]) {
  console.error(`Credencial desconhecida: "${role}". Válidas: ${Object.keys(FONTES).join(', ')}`)
  process.exit(2)
}

const nomes = new Set()
const porFonte = {}
for (const { arquivo, padrao } of FONTES[role]) {
  let fonte
  try { fonte = readFileSync(join(RAIZ, arquivo), 'utf8') } catch { console.error(`Fonte ausente: ${arquivo}`); process.exit(2) }
  const achados = new Set()
  for (const m of fonte.matchAll(padrao)) { achados.add(m[1]); nomes.add(m[1]) }
  porFonte[arquivo] = [...achados].sort()
}

const cs = process.env.SUPABASE_DB_URL
if (!cs) { console.error('SUPABASE_DB_URL ausente no .env.local'); process.exit(2) }
const c = new pg.Client({ connectionString: cs, ssl: { rejectUnauthorized: false } })
await c.connect()
await c.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY')
let rows
try {
  ;({ rows } = await c.query(
    `SELECT p.proname AS nome,
            pg_get_function_identity_arguments(p.oid) AS args,
            p.provolatile AS volatilidade
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.proname = ANY($1)
      ORDER BY 1, 2`,
    [[...nomes]],
  ))
} finally { await c.end() }

const resolvidos = new Map()
for (const r of rows) {
  if (!resolvidos.has(r.nome)) resolvidos.set(r.nome, [])
  resolvidos.get(r.nome).push(r)
}
const naoResolvidos = [...nomes].filter(n => !resolvidos.has(n)).sort()
const sobrecargas = [...resolvidos.entries()].filter(([, v]) => v.length > 1).map(([k]) => k).sort()

const grants = rows.map(r => `GRANT EXECUTE ON FUNCTION public.${r.nome}(${r.args}) TO ${role};`)

if (json) {
  console.log(JSON.stringify({ role, fontes: porFonte, assinaturas: rows.map(r => `${r.nome}(${r.args})`), sobrecargas, nao_resolvidos: naoResolvidos }, null, 2))
} else {
  console.log(`-- allowlist da credencial ${role} — DERIVADA por scripts/credencial/derivar-allowlist.mjs`)
  for (const [arq, lista] of Object.entries(porFonte)) console.log(`--   fonte ${arq}: ${lista.length} nome(s)`)
  console.log(`--   ${nomes.size} nome(s) distintos → ${rows.length} assinatura(s)`)
  if (sobrecargas.length) console.log(`--   sobrecargas (todas as assinaturas recebem o grant): ${sobrecargas.join(', ')}`)
  if (naoResolvidos.length) console.log(`--   ⚠ SEM função no catálogo: ${naoResolvidos.join(', ')}`)
  console.log(grants.join('\n'))
}
if (naoResolvidos.length) process.exit(1)
