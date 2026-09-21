// Cria (uma vez) o USUÁRIO de uma credencial de máquina: conta no Supabase Auth + vínculo
// RBAC ativo com a role de máquina correspondente (0273 = verificador; 0274 = ingestor, M2). Idempotente: se o
// e-mail já existe em `app.rbac_usuarios`, só imprime o `user_id` (o `sub` do JWT).
//
//   node scripts/credencial/bootstrap-usuario-maquina.mjs verificador
//   node scripts/credencial/bootstrap-usuario-maquina.mjs ingestor
//
// Por que um script e não a migration: `app.rbac_usuarios.user_id` tem FK para
// `auth.users(id)`, e uma linha em `auth.users` só nasce pela Auth Admin API
// (`auth.admin.createUser`) — o mesmo caminho do usuário-robô da API externa
// (`src/app/admin/api-externa/actions.ts`). A senha é aleatória e descartada: a conta
// NUNCA loga; ela existe para dar `sub` ao JWT e para `exigir_acesso` exigir `ativo`.
//
// Este é um dos PONTOS DECLARADOS de uso da `SUPABASE_SERVICE_ROLE_KEY` (sonda
// `src/lib/sonda-credencial.test.ts`): bootstrap de credencial é ato administrativo,
// executado uma vez, com a chave que cria usuários — a mesma que a tela de acessos usa.
import { randomBytes } from 'node:crypto'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
config({ path: join(RAIZ, '.env.local'), quiet: true })

/** Uma entrada por credencial: e-mail inequívoco (nunca confundível com pessoa) + role de máquina. */
const CREDENCIAIS = {
  verificador: { email: 'verificador@janus.interno', nome: 'Máquina · verificação (suíte de contrato e medições)', roleNome: 'Máquina · verificação' },
  ingestor:    { email: 'ingestor@janus.interno',    nome: 'Máquina · ingestão (rota /api/ingestao)',             roleNome: 'Máquina · ingestão' },
}

const qual = process.argv[2]
const cred = CREDENCIAIS[qual]
if (!cred) {
  console.error(`Credencial desconhecida: "${qual}". Válidas: ${Object.keys(CREDENCIAIS).join(', ')}`)
  process.exit(2)
}

const url = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/(rest\/v1\/?)?$/, '')
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) { console.error('Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local'); process.exit(2) }

const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

// 1. Já existe? (idempotência pelo e-mail — UNIQUE em app.rbac_usuarios)
const existente = await admin.rpc('admin_usuario_maquina_por_email', { p_email: cred.email })
if (existente.error) { console.error(`admin_usuario_maquina_por_email falhou: ${existente.error.message}`); process.exit(1) }
if (existente.data) {
  const u = existente.data
  console.log(`já existe: ${cred.email}  user_id=${u.user_id}  ativo=${u.ativo}  role=${u.role}`)
  console.log(`\nsub para o JWT: ${u.user_id}`)
  process.exit(0)
}

// 2. Conta no Auth — senha aleatória, e-mail confirmado (sem jornada de confirmação).
const criado = await admin.auth.admin.createUser({
  email: cred.email,
  password: randomBytes(32).toString('base64url'),
  email_confirm: true,
  user_metadata: { credencial_maquina: qual },
})
if (criado.error || !criado.data.user) { console.error(`createUser falhou: ${criado.error?.message}`); process.exit(1) }
const userId = criado.data.user.id

// 3. Vínculo RBAC ATIVO com a role de máquina (RPC da 0273; gate admin/acessos — o
//    service_role passa por ser o ramo trusted de exigir_acesso).
const reg = await admin.rpc('admin_registrar_usuario_maquina', {
  p_user_id: userId, p_email: cred.email, p_nome: cred.nome, p_role_nome: cred.roleNome,
})
if (reg.error) {
  // Não deixar conta órfã no Auth (o CASCADE limpa o RBAC, que aqui nem chegou a existir).
  try { await admin.auth.admin.deleteUser(userId) } catch { /* best-effort */ }
  console.error(`admin_registrar_usuario_maquina falhou: ${reg.error.message}`)
  process.exit(1)
}

console.log(`criado: ${cred.email}  user_id=${userId}  role="${cred.roleNome}"`)
console.log(`\nsub para o JWT: ${userId}`)
console.log(`próximo passo (humano): SUPABASE_JWT_SECRET=... node scripts/credencial/gerar-jwt.mjs ${qual} ${userId}`)
