'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type State = 'verifying' | 'error'

export default function AuthCallbackPage() {
  const [state,    setState]    = useState<State>('verifying')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    async function handleCallback() {
      const supabase = createClient()

      // Fluxo implícito: tokens chegam no hash da URL (#access_token=...&refresh_token=...)
      const hash   = window.location.hash.substring(1)
      const params = new URLSearchParams(hash)
      const access_token  = params.get('access_token')
      const refresh_token = params.get('refresh_token')

      if (access_token && refresh_token) {
        const { error } = await supabase.auth.setSession({ access_token, refresh_token })
        if (error) {
          setState('error')
          setErrorMsg(error.message)
          return
        }
        window.location.replace('/executiva')
        return
      }

      // Fallback: fluxo PKCE (token_hash em query param)
      const sp         = new URLSearchParams(window.location.search)
      const token_hash = sp.get('token_hash')
      const type       = sp.get('type')

      if (token_hash && type === 'email') {
        const { error } = await supabase.auth.verifyOtp({ token_hash, type: 'email' })
        if (error) {
          setState('error')
          setErrorMsg(error.message)
          return
        }
        window.location.replace('/executiva')
        return
      }

      setState('error')
      setErrorMsg('Link inválido ou expirado.')
    }

    handleCallback()
  }, [])

  if (state === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50">
        <div className="text-center space-y-3">
          <p className="font-medium text-zinc-900">Não foi possível fazer login</p>
          <p className="text-sm text-zinc-500">{errorMsg}</p>
          <a href="/login" className="block text-sm text-blue-600 hover:underline">
            Tentar novamente
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50">
      <p className="text-sm text-zinc-500">Autenticando…</p>
    </div>
  )
}
