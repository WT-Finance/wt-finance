// Define (ou redefine) a SENHA de um usuário de máquina e a grava no `.env.local` da raiz do
// repositório — é o segredo de longa duração da credencial (v6.0.0): a suíte, os scripts de
// medição e a rota de ingestão fazem login com ela e recebem um token ES256 de 1 h com o claim
// `role` trocado pelo `custom_access_token_hook` (0275).
//
//   node scripts/credencial/definir-senha-maquina.mjs verificador [--gravar]
//   node scripts/credencial/definir-senha-maquina.mjs ingestor    [--gravar]
//
// Sem `--gravar` só imprime a senha nova (uma vez). Com `--gravar`, acrescenta/substitui a
// linha `SUPABASE_<PAPEL>_SENHA=` no `.env.local` (arquivo gitignored). Na Vercel (ingestor) a
// variável é colada à mão. Rodar de novo = ROTAÇÃO: a senha antiga deixa de logar na hora.
//
// Ponto declarado de uso da `SUPABASE_SERVICE_ROLE_KEY` (sonda `sonda-credencial.test.ts`):
// `auth.admin.updateUserById` só existe com a chave de serviço — ato administrativo, como a
// tela de acessos.
import { randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const ENV = join(RAIZ, '.env.local')
config({ path: ENV, quiet: true })

const CREDENCIAIS = {
  verificador: { email: 'verificador@janus.interno', env: 'SUPABASE_VERIFICADOR_SENHA' },
  ingestor:    { email: 'ingestor@janus.interno',    env: 'SUPABASE_INGESTOR_SENHA' },
}
const qual = process.argv[2]
const gravar = process.argv.includes('--gravar')
const cred = CREDENCIAIS[qual]
if (!cred) { console.error(`Credencial desconhecida: "${qual}". Válidas: ${Object.keys(CREDENCIAIS).join(', ')}`); process.exit(2) }

const url = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/(rest\/v1\/?)?$/, '')
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) { console.error('Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local'); process.exit(2) }
const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

// 1. user_id pelo e-mail (RPC da 0273, gate admin/acessos — service_role passa).
const u = await admin.rpc('admin_usuario_maquina_por_email', { p_email: cred.email })
if (u.error || !u.data) { console.error(`usuário ${cred.email} não encontrado (rode o bootstrap antes): ${u.error?.message ?? ''}`); process.exit(1) }
if (!u.data.ativo) { console.error(`usuário ${cred.email} está INATIVO — reative antes de definir senha (ou é isso que você quer: revogado).`); process.exit(1) }

// 2. Senha nova: 48 bytes aleatórios em base64url (64 caracteres), nunca reutilizada.
const senha = randomBytes(48).toString('base64url')
const r = await admin.auth.admin.updateUserById(u.data.user_id, { password: senha })
if (r.error) { console.error(`updateUserById falhou: ${r.error.message}`); process.exit(1) }

if (gravar) {
  const linha = `${cred.env}=${senha}`
  let texto = existsSync(ENV) ? readFileSync(ENV, 'utf8') : ''
  const re = new RegExp(`^${cred.env}=.*$`, 'm')
  texto = re.test(texto) ? texto.replace(re, linha) : `${texto.replace(/\n*$/, '\n')}${linha}\n`
  writeFileSync(ENV, texto)
  console.log(`senha de ${cred.email} redefinida e gravada em .env.local (${cred.env}).`)
} else {
  console.log(`senha de ${cred.email} redefinida. Cole em .env.local (só aparece UMA vez):\n${cred.env}=${senha}`)
}
console.log(`user_id=${u.data.user_id}`)
