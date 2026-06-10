import { type NextRequest, NextResponse } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { getServerClient } from '@/lib/supabase/server'
import { nextSeguro } from '@/lib/auth/areas'

// v4.13 (ADR-0106): confirmação do magic link / convite SERVER-SIDE.
// Aceita os dois formatos que o Supabase produz:
//  • ?token_hash=…&type=…  (template com TokenHash / generateLink)
//  • ?code=…               (PKCE — ConfirmationURL do template padrão)
// Nada de token em hash de URL nem callback client-side — a lição do revert da
// v4-2 (fluxo implícito) está registrada no ADR-0106.

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const tokenHash = searchParams.get('token_hash')
  // Allowlist explícita dos fluxos suportados — não fazer cast cego de query
  // string para EmailOtpType (reduz superfície; achado de higiene da S11).
  const TIPOS_OK: ReadonlyArray<EmailOtpType> = ['magiclink', 'email', 'invite', 'recovery', 'email_change']
  const typeParam = searchParams.get('type')
  const type = TIPOS_OK.includes(typeParam as EmailOtpType) ? (typeParam as EmailOtpType) : null
  const code = searchParams.get('code')
  const next = nextSeguro(searchParams.get('next'))

  const supabase = await getServerClient()

  let ok = false
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    ok = !error
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    ok = !error
  }

  const destino = request.nextUrl.clone()
  destino.search = ''
  if (ok) {
    destino.pathname = next
  } else {
    destino.pathname = '/login'
    destino.searchParams.set('erro', 'link-invalido')
  }
  return NextResponse.redirect(destino)
}
