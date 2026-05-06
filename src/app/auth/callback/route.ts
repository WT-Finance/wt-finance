import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import type { Database } from '@/types/database'
import type { ResponseCookie } from 'next/dist/compiled/@edge-runtime/cookies'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type       = searchParams.get('type')

  if (!token_hash || type !== 'email') {
    return NextResponse.redirect(new URL('/login', origin))
  }

  const pending: Array<{ name: string; value: string; options: Partial<ResponseCookie> }> = []

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(c => pending.push(c))
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

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    const url = new URL('/login', origin)
    url.searchParams.set('error', 'verifyOtp OK mas sessão não foi estabelecida')
    return NextResponse.redirect(url)
  }

  // Retorna 200 + HTML com JS redirect em vez de 3xx.
  // Set-Cookie em respostas 3xx pode ser descartado por CDNs/proxies;
  // num 200 os cookies são sempre processados antes da navegação JS.
  const response = new NextResponse(
    `<!DOCTYPE html><html><head><title>Autenticando…</title></head><body>` +
    `<script>window.location.replace('/executiva')</script>` +
    `</body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html' } }
  )

  pending.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options)
  })

  return response
}
