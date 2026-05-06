import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import type { Database } from '@/types/database'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type       = searchParams.get('type')

  if (!token_hash || type !== 'email') {
    return NextResponse.redirect(new URL('/login', origin))
  }

  // Resposta de sucesso criada antes do verifyOtp para que setAll
  // possa escrever os cookies de sessão diretamente neste response.
  const response = NextResponse.redirect(new URL('/executiva', origin))

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll:  () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options)
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

  return response
}
