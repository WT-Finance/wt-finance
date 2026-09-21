// Credenciais de MÁQUINA do Janus (v6.0.0): `verificador` (suíte de contrato, medições) e
// `ingestor` (rota /api/ingestao). A identidade é um USUÁRIO do Supabase Auth
// (`<papel>@janus.interno`, role RBAC "Máquina · …", ativo) que faz LOGIN com senha e recebe um
// access token ES256 de curta validade; o `custom_access_token_hook` (migration 0275) troca o
// claim `role` pelo papel do Postgres (`verificador`/`ingestor`), e é esse claim que o PostgREST
// assume no `SET ROLE` — daí valem as allowlists de EXECUTE da 0273/0274.
//
// Por que login e não um JWT fixo: o projeto está no regime novo de chaves (JWKS ES256 gerido
// pelo Supabase); não há como assinar localmente um token que o gateway aceite. A senha do
// usuário de máquina é o segredo de longa duração (`SUPABASE_VERIFICADOR_SENHA` /
// `SUPABASE_INGESTOR_SENHA`, só em .env.local e na Vercel); o token é obtido sob demanda e
// cacheado no processo até perto de expirar. Revogar = desativar o usuário (o hook e
// `app.exigir_acesso` exigem `ativo`) ou trocar a senha.
//
// Sem dependência de `@supabase/supabase-js`: um POST em `/auth/v1/token?grant_type=password`
// (o mesmo que o SDK faz), para servir igual a teste (vitest), script (.mjs via tsx) e rota.

export type CredencialMaquina = 'verificador' | 'ingestor'

export const EMAIL_MAQUINA: Record<CredencialMaquina, string> = {
  verificador: 'verificador@janus.interno',
  ingestor:    'ingestor@janus.interno',
}

export const ENV_SENHA_MAQUINA: Record<CredencialMaquina, string> = {
  verificador: 'SUPABASE_VERIFICADOR_SENHA',
  ingestor:    'SUPABASE_INGESTOR_SENHA',
}

/** Host do projeto sem `/rest/v1` (a URL do .env pode vir com ele). */
export function hostSupabase(): string {
  const raw = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  return raw.replace(/\/+$/, '').replace(/\/rest\/v1$/, '')
}

/** As três variáveis de que o login depende estão presentes? (para `describe.skipIf`). */
export function credencialConfigurada(qual: CredencialMaquina): boolean {
  return Boolean(hostSupabase() && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && process.env[ENV_SENHA_MAQUINA[qual]])
}

type Cache = { token: string; expiraEm: number }
const cache = new Map<CredencialMaquina, Cache>()

/** Margem antes do `exp` para renovar (o token do Auth dura 1 h por default). */
const MARGEM_MS = 60_000

/**
 * Access token da credencial de máquina — faz login na primeira chamada e reutiliza até perto
 * de expirar. Lança com mensagem operacional quando a senha falta ou o login é recusado (isso
 * é erro de configuração, não de dado — nunca deve virar "sem dado" em silêncio).
 */
export async function tokenMaquina(qual: CredencialMaquina): Promise<string> {
  const agora = Date.now()
  const c = cache.get(qual)
  if (c && c.expiraEm - MARGEM_MS > agora) return c.token

  const host = hostSupabase()
  const apikey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const senha = process.env[ENV_SENHA_MAQUINA[qual]]
  if (!host || !apikey) throw new Error('SUPABASE_URL/NEXT_PUBLIC_SUPABASE_ANON_KEY ausentes — credencial de máquina não pode logar.')
  if (!senha) throw new Error(`${ENV_SENHA_MAQUINA[qual]} ausente — ver docs/runbooks/credenciais-maquina-runbook.md.`)

  const res = await fetch(`${host}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL_MAQUINA[qual], password: senha }),
  })
  if (!res.ok) {
    const texto = await res.text()
    throw new Error(`login da credencial ${qual} recusado (HTTP ${res.status}): ${texto.slice(0, 200)}`)
  }
  const dados = (await res.json()) as { access_token?: string; expires_in?: number }
  if (!dados.access_token) throw new Error(`login da credencial ${qual} sem access_token na resposta.`)
  const expiraEm = agora + (dados.expires_in ?? 3600) * 1000
  cache.set(qual, { token: dados.access_token, expiraEm })
  return dados.access_token
}

/** Claim `role` do token (sem verificar assinatura — é diagnóstico, não autorização). */
export function roleDoToken(token: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()) as { role?: string }
    return payload.role ?? null
  } catch {
    return null
  }
}
