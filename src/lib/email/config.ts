import 'server-only'

// v4.24.0 — Configuração SMTP lida 100% do ambiente (.env.local / Vercel).
// ZERO HARDCODE: host/porta/usuário/senha/REMETENTE vêm só de process.env — nenhum
// valor no código nem no repositório. Fallback-safe: faltando qualquer variável
// essencial, retorna null (o envio é pulado e o fluxo cai no fallback de
// senha-na-tela). NUNCA lança — config ausente é operação normal, não erro.

export interface ConfigSmtp {
  host:   string
  port:   number
  /** 465 = TLS direto; 587 (Office 365) = STARTTLS → secure=false. */
  secure: boolean
  user:   string
  pass:   string
  /** Remetente. Em Office 365 normalmente = user. Vem da config, nunca hardcoded. */
  from:   string
}

// Cache lazy (mesmo padrão de getAdminClient): env não muda em runtime. `undefined`
// = ainda não resolvido; `null` = resolvido e ausente; objeto = resolvido e presente.
let _config: ConfigSmtp | null | undefined = undefined

export function getConfigSmtp(): ConfigSmtp | null {
  if (_config !== undefined) return _config

  const host = process.env.SMTP_HOST?.trim()
  const user = process.env.SMTP_USER?.trim()
  const pass = process.env.SMTP_PASS
  const from = process.env.SMTP_FROM?.trim() || user   // remetente da config; default = user (Office 365)
  const portRaw = process.env.SMTP_PORT?.trim()
  const port = portRaw ? Number(portRaw) : 587
  const secure = process.env.SMTP_SECURE?.trim().toLowerCase() === 'true'

  if (!host || !user || !pass || !from || !Number.isFinite(port) || port <= 0) {
    console.warn(
      '[email] SMTP não configurado (faltam variáveis SMTP_*) — envio desabilitado; ' +
      'a senha provisória segue exibida na tela (fallback).',
    )
    _config = null
    return null
  }

  _config = { host, port, secure, user, pass, from }
  return _config
}

/** Limpa o cache — uso EXCLUSIVO de teste (reavaliar process.env entre casos). */
export function _resetConfigSmtpCache(): void {
  _config = undefined
}
