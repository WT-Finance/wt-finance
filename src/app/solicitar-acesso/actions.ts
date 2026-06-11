'use server'

import { redirect } from 'next/navigation'
import { getServerClient } from '@/lib/supabase/server'

// v4.14 (ADR-0110): solicitação de acesso (pública, pré-cadastro). Chama a RPC
// solicitar_acesso (anon). Resposta SEMPRE de sucesso (anti-enumeração) — a RPC
// só grava uma pendência se o e-mail ainda não é usuário nem tem pendente.
// redirect() fora do try.

type BoundRpc = (fn: string, args?: Record<string, unknown>) => Promise<{ error: { message: string } | null }>

export async function solicitarAcesso(formData: FormData): Promise<void> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const nome  = String(formData.get('nome') ?? '').trim()

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    redirect('/solicitar-acesso?erro=email')
  }

  try {
    const supabase = await getServerClient()
    await (supabase.rpc as unknown as BoundRpc)('solicitar_acesso', {
      p_email: email,
      p_nome: nome || null,
    })
  } catch (err) {
    // Anti-enumeração: não revela falhas; loga para diagnóstico.
    console.error('[solicitar-acesso] erro:', err)
  }

  redirect('/solicitar-acesso?enviado=1')
}
