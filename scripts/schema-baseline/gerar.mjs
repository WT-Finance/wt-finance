// Gera supabase/baseline/schema-v6.json a partir do catálogo VIVO de produção (v6.0.0/M8).
//
//   npm run db:baseline
//
// Conecta por SUPABASE_DB_URL (lendo .env.local, como os scripts irmãos — derivar-allowlist.mjs,
// credencial-ingestor.test.ts), trava a sessão em READ ONLY como PRIMEIRO comando depois do
// connect() (skill banco-e-rpc §6), chama snapshotCatalogo (o MESMO módulo que o teste de drift
// usa — nunca duas fontes de queries para a mesma verdade) e grava o JSON canonicalizado
// (chaves ordenadas — gerar duas vezes seguidas produz o arquivo BYTE A BYTE idêntico).
//
// Convenção nova (ADR-0173, mesma régua do database.ts): toda migration aplicada regenera este
// arquivo e ele entra no MESMO commit.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from 'dotenv'
import pg from 'pg'
import { snapshotCatalogo, ordenarChavesRecursivo, SCHEMAS_PROJETO, SCHEMAS_EXCLUIDOS } from './snapshot.mjs'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
config({ path: join(RAIZ, '.env.local'), quiet: true })

const CAMINHO_SAIDA = join(RAIZ, 'supabase', 'baseline', 'schema-v6.json')

const cs = process.env.SUPABASE_DB_URL
if (!cs) { console.error('SUPABASE_DB_URL ausente no .env.local'); process.exit(2) }

const client = new pg.Client({ connectionString: cs, ssl: { rejectUnauthorized: false } })
await client.connect()
await client.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY')

let snapshot
try {
  snapshot = await snapshotCatalogo(client)
} finally {
  await client.end()
}

// Achado a reportar, não a corrigir aqui: um schema não-sistema fora das duas listas fixas
// (SCHEMAS_PROJETO/SCHEMAS_EXCLUIDOS) ainda assim entra no arquivo (schemas_nao_sistema é o
// retrato fiel do que existe) — é o TESTE de drift que reprova a omissão, não o gerador.
const naoDeclarados = snapshot.schemas_nao_sistema.filter(
  s => !SCHEMAS_PROJETO.includes(s) && !SCHEMAS_EXCLUIDOS.includes(s),
)
if (naoDeclarados.length > 0) {
  console.warn(
    `⚠ schema(s) não declarado(s) em SCHEMAS_PROJETO nem SCHEMAS_EXCLUIDOS: ${naoDeclarados.join(', ')} ` +
    '— classifique em scripts/schema-baseline/snapshot.mjs antes de considerar o baseline completo.',
  )
}

const canonico = ordenarChavesRecursivo(snapshot)
mkdirSync(dirname(CAMINHO_SAIDA), { recursive: true })
writeFileSync(CAMINHO_SAIDA, JSON.stringify(canonico, null, 2) + '\n', 'utf8')

console.log(`baseline gravado em ${CAMINHO_SAIDA}`)
console.log(`última migration: ${snapshot.ultima_migration}`)
console.log(`tabelas: ${Object.keys(snapshot.tabelas).length} · views: ${Object.keys(snapshot.views).length} · funções: ${Object.keys(snapshot.funcoes).length} · cron: ${Object.keys(snapshot.cron).length}`)
