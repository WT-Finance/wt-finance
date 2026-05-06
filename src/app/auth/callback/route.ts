import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/types/database'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type       = searchParams.get('type')

  if (!token_hash || type !== 'email') {
    return NextResponse.redirect(new URL('/login', origin))
  }

  // cookies() de next/headers garante que as mutações de cookie
  // sejam incluídas na resposta mesmo quando ela é um redirect.
  const cookieStore = await cookies()

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            try {
              cookieStore.set(name, value, options)
            } catch {
              // Silencioso em contextos read-only (não deve ocorrer aqui)
            }
          })
        },
      },
    }
  )

  const { error } = await supabase.auth.verifyOtp({ token_hash, type: 'email' })

  if (error) {
    const url = new URL('/login', origin)
    url.searchParams.set('error', error.message)
    return NextResponse.redirect(url)
  }

  // Confirma que a sessão foi de fato estabelecida antes de redirecionar.
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    const url = new URL('/login', origin)
    url.searchParams.set('error', 'Sessão não estabelecida após verifyOtp')
    return NextResponse.redirect(url)
  }

  return NextResponse.redirect(new URL('/executiva', origin))
}
