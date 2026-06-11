'use server'

import { redirect } from 'next/navigation'
import { getServerClient } from '@/lib/supabase/server'

// v4.14 (ADR-0110): troca de senha (obrigatória no 1º acesso / após reset).
// NÃO usa requireAreaAction (que bloquearia por precisa_trocar_senha) — só exige
// sessão. Após updateUser, desliga a flag via marcar_senha_trocada(). Todos os
// redirect() ficam FORA do try (sinalizam navegação por throw interno).

type BoundRpc = (fn: string, args?: Record<string, unknown>) => Promise<{ error: { message: string } | null }>

export async function trocarSenha(formData: FormData): Promise<void> {
  const senha     = String(formData.get('senha') ?? '')
  const confirmar = String(formData.get('confirmar') ?? '')

  if (senha.length < 8)   redirect('/trocar-senha?erro=curta')
  if (senha !== confirmar) redirect('/trocar-senha?erro=diferente')

  let resultado: 'ok' | 'falha' | 'sem-sessao' = 'falha'
  try {
    const supabase = await getServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      resultado = 'sem-sessao'
    } else {
      const { error } = await supabase.auth.updateUser({ password: senha })
      if (error) {
        console.error('[trocar-senha] updateUser:', error.message)
        resultado = 'falha'
      } else {
        await (supabase.rpc as unknown as BoundRpc)('marcar_senha_trocada')
        resultado = 'ok'
      }
    }
  } catch (err) {
    console.error('[trocar-senha] erro:', err)
    resultado = 'falha'
  }

  if (resultado === 'sem-sessao') redirect('/login')
  if (resultado === 'falha')      redirect('/trocar-senha?erro=falha')
  redirect('/')
}
