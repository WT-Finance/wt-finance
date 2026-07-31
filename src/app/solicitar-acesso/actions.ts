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
    // v5.3.5 — `.bind(supabase)` NÃO é decorativo: `SupabaseClient.rpc` é método de
    // PROTÓTIPO e faz `return this.rest.rpc(...)`. Atribuir o método a uma variável
    // (`const rpc = supabase.rpc`) o DESTACA do cliente; em módulo ESM (strict) o `this`
    // vira `undefined` e a chamada estoura `TypeError: Cannot read properties of
    // undefined (reading 'rest')` — engolido pelo catch anti-enumeração abaixo, ou seja,
    // pedido PERDIDO com tela de sucesso. Foi exatamente o bug de 13/07 a 31/07.
    // (`(supabase.rpc)(...)` entre parênteses preserva o `this`; a atribuição, não.)
    const rpc = (supabase.rpc as unknown as AdminRpc).bind(supabase)
    const { data, error } = await rpc('solicitar_acesso_admin', {
      p_email: email,
      p_nome: nome || null,
    })
    if (error) {
      // FALLBACK: a RPC nova (migration 0177) pode ainda não estar aplicada em produção
      // (janela deploy-antes-da-migration). Garante o INSERT pelo caminho legado
      // solicitar_acesso — o pedido NUNCA se perde; só não sai a notificação (segue no
      // próximo pedido, após a 0177). service_role tem EXECUTE em solicitar_acesso.
      console.error('[solicitar-acesso] solicitar_acesso_admin falhou — tentando o legado:', error.message)
      const { error: erroLegado } = await rpc('solicitar_acesso', { p_email: email, p_nome: nome || null })
      // Antes o erro do fallback era DESCARTADO: se os dois caminhos falhassem, o pedido
      // sumia sem uma linha de log. A tela segue dizendo sucesso (anti-enumeração), mas o
      // operador precisa saber.
      if (erroLegado) {
        console.error('[solicitar-acesso] FALLBACK legado TAMBÉM falhou — PEDIDO PERDIDO:', erroLegado.message)
      }
    } else {
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
    }
  } catch (err) {
    // Anti-enumeração + best-effort: não revela falhas; loga para diagnóstico.
    console.error('[solicitar-acesso] erro:', err)
  }

  redirect('/solicitar-acesso?enviado=1')
}
