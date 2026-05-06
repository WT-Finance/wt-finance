'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'

type State = 'idle' | 'sending' | 'sent' | 'error'

const REASON_MESSAGES: Record<string, string> = {
  no_session: 'Sessão expirada. Faça login novamente.',
  no_profile: 'Usuário não encontrado no sistema. Contate o administrador.',
}

function LoginForm() {
  const searchParams  = useSearchParams()
  const callbackError = searchParams.get('error')
  const reason        = searchParams.get('reason')

  const initialMsg   = callbackError ?? (reason ? REASON_MESSAGES[reason] ?? `Bloqueado: ${reason}` : '')
  const [email,    setEmail]    = useState('')
  const [state,    setState]    = useState<State>(initialMsg ? 'error' : 'idle')
  const [errorMsg, setErrorMsg] = useState(initialMsg)

  // Atualiza se os searchParams mudarem após montagem
  useEffect(() => {
    const msg = callbackError ?? (reason ? REASON_MESSAGES[reason] ?? `Bloqueado: ${reason}` : '')
    if (msg) {
      setState('error')
      setErrorMsg(msg)
    }
  }, [callbackError, reason])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setState('sending')
    setErrorMsg('')

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })

    if (error) {
      setState('error')
      setErrorMsg(error.message)
    } else {
      setState('sent')
    }
  }

  return (
    <>
      {state === 'sent' ? (
        <div className="rounded-xl border border-zinc-200 bg-white px-6 py-8 text-center shadow-sm">
          <p className="font-medium text-zinc-900">Verifique seu e-mail</p>
          <p className="text-sm text-zinc-500 mt-2 leading-relaxed">
            Enviamos um link para <span className="font-medium text-zinc-700">{email}</span>.
            <br />Clique no link para entrar.
          </p>
          <button
            onClick={() => setState('idle')}
            className="mt-5 text-sm text-blue-600 hover:underline"
          >
            Usar outro e-mail
          </button>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-zinc-200 bg-white px-6 py-8 space-y-4 shadow-sm"
        >
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-zinc-700 mb-1.5"
            >
              E-mail
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              disabled={state === 'sending'}
              placeholder="seu@email.com"
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 transition"
            />
          </div>

          {state === 'error' && errorMsg && (
            <p className="text-sm text-red-600">{errorMsg}</p>
          )}

          <button
            type="submit"
            disabled={state === 'sending' || !email}
            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {state === 'sending' ? 'Enviando…' : 'Enviar link de acesso'}
          </button>
        </form>
      )}
    </>
  )
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50">
      <div className="w-full max-w-sm px-4">
        <div className="mb-8">
          <p className="text-[22px] font-semibold text-zinc-900 leading-tight">WT Finance</p>
          <p className="text-sm text-zinc-400 mt-0.5">Welcome Group</p>
        </div>
        <Suspense fallback={<div className="h-48" />}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  )
}
