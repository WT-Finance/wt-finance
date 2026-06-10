'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getServerClient } from '@/lib/supabase/server'
import { nextSeguro } from '@/lib/auth/areas'

// v4.13 (ADR-0106): envio do magic link. shouldCreateUser: false = cadastro SÓ
// por convite — e-mail desconhecido não cria conta. A resposta da UI é a MESMA
// para e-mail cadastrado ou não (anti-enumeração): erros de "usuário não existe"
// são deliberadamente engolidos; só falhas operacionais (rate limit) aparecem.

export async function enviarMagicLink(formData: FormData): Promise<void> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const next = nextSeguro(String(formData.get('next') ?? '') || null)

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    redirect('/login?erro=email-invalido')
  }

  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? ''
  const proto = h.get('x-forwarded-proto') ?? 'https'
  const origin = host ? `${proto}://${host}` : ''

  const supabase = await getServerClient()
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${origin}/auth/confirm?next=${encodeURIComponent(next)}`,
    },
  })

  if (error) {
    // Anti-enumeração: "usuário não encontrado" responde como sucesso.
    const msg = error.message.toLowerCase()
    const inofensivo = msg.includes('user not found') || msg.includes('signups not allowed')
    if (!inofensivo) {
      console.error('[login] falha ao enviar magic link:', error.message)
      redirect('/login?erro=envio')
    }
  }

  redirect(`/login?enviado=1&next=${encodeURIComponent(next)}`)
}
