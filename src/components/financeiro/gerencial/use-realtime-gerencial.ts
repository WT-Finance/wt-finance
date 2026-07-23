'use client'

import { useEffect, useRef } from 'react'
import { getBrowserClient } from '@/lib/supabase/client'

export type GerencialBroadcast = {
  op: string
  n: number
  usuario_id: string | null
  usuario_nome: string | null
  lote: string
}

/**
 * M4 (v5.2.1) — assina o canal PRIVADO de broadcast do Gerencial (migration 0201). Dispara
 * `onOutraMudanca` quando OUTRO usuário altera a base (ignora as PRÓPRIAS mudanças por
 * usuario_id). Fail-safe TOTAL: qualquer falha de realtime/assinatura é engolida — a página
 * segue funcionando (a verdade é o servidor, relida no router.refresh). Canal privado exige
 * autorização por RLS em realtime.messages (policy da 0201); o token da sessão é passado por
 * realtime.setAuth antes de assinar.
 */
export function useRealtimeGerencial(
  usuarioId: string | null,
  onOutraMudanca: (p: GerencialBroadcast) => void,
): void {
  const cbRef = useRef(onOutraMudanca)
  useEffect(() => { cbRef.current = onOutraMudanca }, [onOutraMudanca])

  useEffect(() => {
    let ativo = true
    let canal: ReturnType<ReturnType<typeof getBrowserClient>['channel']> | null = null

    void (async () => {
      try {
        const supabase = getBrowserClient()
        const { data } = await supabase.auth.getSession()
        const token = data.session?.access_token
        if (!token || !ativo) return
        await supabase.realtime.setAuth(token)
        if (!ativo) return
        canal = supabase.channel('gerencial_lancamentos', { config: { private: true } })
        canal
          .on('broadcast', { event: 'gerencial_change' }, msg => {
            const p = (msg as { payload?: GerencialBroadcast }).payload
            if (!ativo || !p) return
            if (p.usuario_id && usuarioId && p.usuario_id === usuarioId) return // própria mudança → sem aviso
            cbRef.current(p)
          })
          .subscribe()
      } catch {
        // fail-safe: sem realtime, a página segue funcionando (sem aviso vivo)
      }
    })()

    return () => {
      ativo = false
      try {
        if (canal) getBrowserClient().removeChannel(canal)
      } catch {
        // noop
      }
    }
  }, [usuarioId])
}
