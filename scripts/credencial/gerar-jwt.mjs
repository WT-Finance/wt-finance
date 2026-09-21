// Gera o JWT de uma credencial de MÁQUINA do Janus (`verificador`, `ingestor`), assinado com
// o JWT secret do projeto Supabase (HS256 — o mesmo mecanismo das chaves anon/service_role).
//
//   SUPABASE_JWT_SECRET='<segredo>' node scripts/credencial/gerar-jwt.mjs verificador <sub-uuid> [anos]
//
// Quem roda é o HUMANO: o JWT secret não fica no `.env.local` nem no repositório (só o nome
// da variável, no `.env.example`). O resultado vai para `SUPABASE_VERIFICADOR_KEY` /
// `SUPABASE_INGESTOR_KEY` no `.env.local` (e, para o ingestor, no ambiente da Vercel).
//
// Claims:
//   role  — o papel do Postgres que o PostgREST assume (`SET ROLE`), precisa estar
//           concedido a `authenticator` (migration 0273/0274);
//   sub   — o `user_id` do usuário de máquina em `app.rbac_usuarios`/`auth.users`
//           (é o que `app.exigir_acesso` e `auth.uid()` leem); DESATIVAR esse usuário
//           mata o JWT na hora, sem rotação;
//   aud   — 'authenticated' (o que o Supabase espera de um JWT de usuário);
//   iss   — 'janus/credencial-maquina', para o token se reconhecer no log;
//   exp   — longa validade (default 10 anos): rotação é por revogação do usuário, não por
//           expiração (decisão do briefing da role verificador).
// Sem dependência: HS256 com `node:crypto`.
import { createHmac, randomUUID } from 'node:crypto'

const [role, sub, anosArg] = process.argv.slice(2)
const ROLES = new Set(['verificador', 'ingestor'])
if (!ROLES.has(role) || !sub) {
  console.error('Uso: SUPABASE_JWT_SECRET=... node scripts/credencial/gerar-jwt.mjs <verificador|ingestor> <sub-uuid> [anos=10]')
  process.exit(2)
}
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sub)) {
  console.error(`sub inválido (esperado uuid): ${sub}`)
  process.exit(2)
}
const secret = process.env.SUPABASE_JWT_SECRET
if (!secret) {
  console.error('SUPABASE_JWT_SECRET ausente. Dashboard → Project Settings → API → JWT Settings → JWT Secret. Não o grave em arquivo.')
  process.exit(2)
}
const anos = Number(anosArg ?? 10)
const agora = Math.floor(Date.now() / 1000)

const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url')
const header = b64url({ alg: 'HS256', typ: 'JWT' })
const payload = b64url({
  role,
  sub,
  aud: 'authenticated',
  iss: 'janus/credencial-maquina',
  iat: agora,
  exp: agora + Math.round(anos * 365.25 * 86400),
  jti: randomUUID(),
})
const assinatura = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url')
process.stdout.write(`${header}.${payload}.${assinatura}\n`)
