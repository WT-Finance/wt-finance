import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// v4.13 (ADR-0109): camada 1 do enforcement — SESSÃO obrigatória em tudo que não
// for público. Páginas sem sessão → /login?next=…; APIs sem sessão → 401 JSON.
// Permissão de ÁREA não é checada aqui (custo por navegação): é responsabilidade
// dos guards por página/rota (camada 2) com backstop no banco (camadas 3 e 4).
// Também faz o refresh do token (padrão @supabase/ssr getAll/setAll) — o ÚNICO
// lugar que pode regravar cookies de sessão em toda navegação.

const PUBLIC_PREFIXES = ['/auth/']
// /solicitar-acesso é público (pré-cadastro, sem sessão). /trocar-senha NÃO é
// público: exige sessão (o guard manda o usuário logado para lá quando preciso).
const PUBLIC_PATHS = new Set(['/login', '/solicitar-acesso'])

function ehPublica(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true
  return PUBLIC_PREFIXES.some(p => pathname.startsWith(p))
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/(rest\/v1\/?)?$/, '')
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        )
      },
    },
  })

  // getUser() valida o JWT no servidor de auth — nunca confiar só no cookie.
  const { data: { user } } = await supabase.auth.getUser()
  const { pathname } = request.nextUrl

  if (!user && !ehPublica(pathname)) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'AUTH_NECESSARIA' }, { status: 401 })
    }
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.search = ''
    const next = pathname + (request.nextUrl.search || '')
    if (next !== '/') loginUrl.searchParams.set('next', next)
    return NextResponse.redirect(loginUrl)
  }

  if (user && pathname === '/login') {
    const homeUrl = request.nextUrl.clone()
    homeUrl.pathname = '/'
    homeUrl.search = ''
    return NextResponse.redirect(homeUrl)
  }

  return response
}

export const config = {
  // Exclui APENAS assets reais, por prefixo/nome exato — NUNCA por "qualquer path
  // terminado em .png/.svg" (isso furava a camada 1: uma rota dinâmica como
  // /api/.../[id] com id terminado em .png escapava do proxy — achado da
  // auto-auditoria S11). Páginas e APIs com ponto no nome agora SEMPRE passam pelo
  // proxy. Ícones de metadata do Next ficam na raiz e são listados por nome.
  matcher: [
    '/((?!_next/|favicon\\.ico|icon\\.svg|icon\\.png|icon0\\.png|icon1\\.png|apple-icon\\.png|logos/).*)',
  ],
}
