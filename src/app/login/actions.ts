'use server'

import { redirect } from 'next/navigation'
import { getServerClient } from '@/lib/supabase/server'
import { nextSeguro } from '@/lib/auth/areas'

// v4.14 (ADR-0110): login por e-mail + SENHA. Mensagem genérica em qualquer falha
// (anti-enumeração: não revela se o e-mail existe). Se a senha for a provisória, o
// guard manda para /trocar-senha na primeira navegação (flag precisa_trocar_senha).
// redirect() fica FORA do try (ele sinaliza navegação via throw interno).

export async function entrar(formData: FormData): Promise<void> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const senha = String(formData.get('senha') ?? '')
  const next = nextSeguro(String(formData.get('next') ?? '') || null)

  if (!email || !senha) redirect('/login?erro=credenciais')

  let falhou = false
  try {
    const supabase = await getServerClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
    falhou = Boolean(error)
  } catch (err) {
    console.error('[login] erro no signInWithPassword:', err)
    falhou = true
  }

  if (falhou) redirect('/login?erro=credenciais')
  redirect(next)
}
