'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type State = 'verifying' | 'error'

export default function VerifyPage() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const [state,    setState]    = useState<State>('verifying')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    async function verify() {
      const token_hash = searchParams.get('token_hash')
      const type       = searchParams.get('type')

      if (!token_hash || type !== 'email') {
        setState('error')
        setErrorMsg('Link inválido ou expirado.')
        return
      }

      const supabase = createClient()
      const { error } = await supabase.auth.verifyOtp({ token_hash, type: 'email' })

      if (error) {
        setState('error')
        setErrorMsg(error.message)
        return
      }

      router.replace('/executiva')
    }

    verify()
  }, [router, searchParams])

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50">
      <div className="text-center">
        {state === 'verifying' ? (
          <p className="text-sm text-zinc-500">Verificando…</p>
        ) : (
          <div className="space-y-3">
            <p className="font-medium text-zinc-900">Não foi possível fazer login</p>
            <p className="text-sm text-zinc-500">{errorMsg}</p>
            <a href="/login" className="block text-sm text-blue-600 hover:underline">
              Tentar novamente
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
