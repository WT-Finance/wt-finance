'use server'

import { redirect } from 'next/navigation'
import type { EmailOtpType } from '@supabase/supabase-js'
import { getServerClient } from '@/lib/supabase/server'
import { nextSeguro } from '@/lib/auth/areas'

// v4.13.1: a confirmação do magic link/convite acontece SÓ neste POST (Server
// Action), nunca no GET da página. Magic link é uso único — um GET de preview
// (WhatsApp, e-mail, antivírus, prefetch) abrindo a URL consumia o token antes da
// pessoa clicar, derrubando o convite com "link inválido". Como bots de preview
// fazem só GET, mover o verifyOtp para o POST do botão os impede de queimar o token.

const TIPOS_OK: ReadonlyArray<EmailOtpType> = ['magiclink', 'email', 'invite', 'recovery', 'email_change']

export async function confirmarAcesso(formData: FormData): Promise<void> {
  const tokenHash = String(formData.get('token_hash') ?? '')
  const typeRaw   = String(formData.get('type') ?? '')
  const type      = TIPOS_OK.includes(typeRaw as EmailOtpType) ? (typeRaw as EmailOtpType) : null
  const code      = String(formData.get('code') ?? '')
  const next      = nextSeguro(String(formData.get('next') ?? ''))

  const supabase = await getServerClient()

  let ok = false
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    ok = !error
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    ok = !error
  }

  redirect(ok ? next : '/login?erro=link-invalido')
}
