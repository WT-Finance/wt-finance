'use server'

import { redirect } from 'next/navigation'
import { getAdminClient } from '@/lib/supabase/admin'
import { enviarNotificacaoAcessoSolicitado } from '@/lib/email'

// v4.14 (ADR-0110) + v5.0.1 (ADR-0147): solicitação de acesso pública (pré-cadastro).
// Usa a RPC SERVICE_ROLE `solicitar_acesso_admin` (via admin client, 100% server-side):
// insere a pendência (mesma guarda de `solicitar_acesso`) e, SÓ quando foi um pedido NOVO,
// devolve os e-mails dos administradores de Usuários & Acessos para notificar (best-effort,
// await, nunca bloqueia o fluxo). A resposta ao usuário é SEMPRE de sucesso (anti-enumeração);
// o "inserida"/e-mails nunca chegam ao cliente (redirect). service_role-only → sem furo anon.
// redirect() fica FORA do try (ele lança internamente no Next).

type AdminRpc = (fn: string, args?: Record<string, unknown>) =>
  Promise<{ data: unknown; error: { message: string } | null }>

/** "13 de julho de 2026, 11:35" no fuso de São Paulo (momento do pedido = agora). */
function agoraFormatado(): string {
  const d = new Date()
  const data = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: 'numeric', month: 'long', year: 'numeric',
  }).format(d)
  const hora = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d)
  return `${data}, ${hora}`
}

export async function solicitarAcesso(formData: FormData): Promise<void> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const nome  = String(formData.get('nome') ?? '').trim()

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    redirect('/solicitar-acesso?erro=email')
  }

  try {
    const supabase = getAdminClient()
    const { data } = await (supabase.rpc as unknown as AdminRpc)('solicitar_acesso_admin', {
      p_email: email,
      p_nome: nome || null,
    })
    const res = data as { inserida?: boolean; emails?: string[] } | null
    // Só notifica em pedido NOVO (inserida) — evita avisar em reenvios/duplicatas.
    if (res?.inserida && Array.isArray(res.emails) && res.emails.length > 0) {
      await enviarNotificacaoAcessoSolicitado({
        paras:            res.emails,
        emailSolicitante: email,
        nomeSolicitante:  nome || null,
        quando:           agoraFormatado(),
      })
    }
  } catch (err) {
    // Anti-enumeração + best-effort: não revela falhas; loga para diagnóstico.
    console.error('[solicitar-acesso] erro:', err)
  }

  redirect('/solicitar-acesso?enviado=1')
}
