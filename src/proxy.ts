import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const PUBLIC_PATHS = ['/login', '/verify', '/auth/callback', '/aceitar-convite']

export async function proxy(request: NextRequest) {
  if (process.env.NODE_ENV === 'development' && process.env.BYPASS_AUTH === 'true') {
    return NextResponse.next()
  }

  const { pathname } = request.nextUrl

  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  const response = NextResponse.next()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    const url = new URL('/login', request.url)
    url.searchParams.set('reason', 'no_session')
    return NextResponse.redirect(url)
  }

  const { data: profile } = await supabase.rpc('get_my_profile')

  if (!profile || profile.length === 0) {
    const url = new URL('/login', request.url)
    url.searchParams.set('reason', 'no_profile')
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
