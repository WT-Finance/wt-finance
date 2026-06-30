import 'server-only'

// Camada Asaas — cliente HTTP server-only (v4.31.0/Fase 1b). A PRIMEIRA integração com
// API externa de terceiro do projeto. Espelha a postura do src/lib/email/ (server-only,
// env-driven, fallback-safe: retorna resultado ESTRUTURADO, NUNCA lança cru). Fiel ao
// script legado (docs/faturamento-legado/asaas_from_simple_sheet.py): header `access_token`
// (não Authorization), timeout 30s, erro Asaas no formato {errors:[{code,description}]}.
//
// SANDBOX-FIRST: ASAAS_BASE_URL default = sandbox; produção SÓ por env consciente (a tela
// mostra o ambiente; produção exige confirmação reforçada). Chave 100% do env, nunca no
// cliente (import 'server-only' falha o build se vazar).

const SANDBOX_URL = 'https://sandbox.asaas.com/api/v3'

function baseUrl(): string {
  return (process.env.ASAAS_BASE_URL?.trim() || SANDBOX_URL).replace(/\/+$/, '')
}

export type AsaasAmbiente = 'sandbox' | 'producao'

/** Ambiente derivado do ASAAS_BASE_URL (sandbox por default). Exibido na tela (badge). */
export function asaasAmbiente(): AsaasAmbiente {
  return /sandbox/i.test(baseUrl()) ? 'sandbox' : 'producao'
}

/** Há chave configurada? (sem chave → emissão é pulada com erro claro, nunca quebra.) */
export function asaasConfigurado(): boolean {
  return Boolean(process.env.ASAAS_API_KEY?.trim())
}

export type AsaasResult<T> = { ok: true; data: T } | { ok: false; error: string }

export function onlyDigits(x: string | null | undefined): string | null {
  if (!x) return null
  const d = String(x).replace(/\D+/g, '')
  return d || null
}

export function emailValido(email: string | null | undefined): boolean {
  if (!email) return false
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())
}

function extrairErro(data: unknown, status: number): string {
  // Asaas devolve { errors: [{ code, description }] } (B5).
  if (data && typeof data === 'object' && 'errors' in data) {
    const errs = (data as { errors?: Array<{ description?: string }> }).errors
    if (Array.isArray(errs) && errs[0]?.description) return errs[0].description
  }
  return `Erro do Asaas (HTTP ${status})`
}

/**
 * Chamada à API do Asaas. Retorna SEMPRE um resultado estruturado (ok/erro) — nunca lança
 * cru (rede/timeout/parse viram { ok:false, error }), para a emissão tratar falha parcial.
 */
export async function asaasReq<T = unknown>(
  method: 'GET' | 'POST' | 'PUT',
  path: string,
  opts: { params?: Record<string, string>; body?: unknown } = {},
): Promise<AsaasResult<T>> {
  const key = process.env.ASAAS_API_KEY?.trim()
  if (!key) return { ok: false, error: 'ASAAS_API_KEY ausente — configure o ambiente do Asaas (.env / Vercel).' }

  const qs = opts.params && Object.keys(opts.params).length
    ? '?' + new URLSearchParams(opts.params).toString()
    : ''
  const url = `${baseUrl()}${path}${qs}`

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 30_000)
  try {
    const resp = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', access_token: key },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: ctrl.signal,
    })
    const txt = await resp.text()
    let data: unknown = null
    if (txt) { try { data = JSON.parse(txt) } catch { /* resposta não-JSON */ } }
    if (!resp.ok) return { ok: false, error: extrairErro(data, resp.status) }
    return { ok: true, data: data as T }
  } catch (e) {
    const abortado = e instanceof Error && e.name === 'AbortError'
    return { ok: false, error: abortado ? 'Tempo de resposta do Asaas excedido (30s).' : 'Falha de rede ao falar com o Asaas.' }
  } finally {
    clearTimeout(timer)
  }
}
