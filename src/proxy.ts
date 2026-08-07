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

// Rotas de API que fazem a PRÓPRIA autenticação NO HANDLER (cron secret OU sessão admin) — o
// middleware NÃO exige sessão aqui, senão o request do cron (que manda só o Bearer do CRON_SECRET,
// SEM cookie de sessão) morre com 401 (`AUTH_NECESSARIA`) ANTES de chegar ao handler. O handler é
// quem autoriza: `/api/monde/ingest` checa CRON_SECRET e, se não bater, `requireAreaApi(['admin/uploads'])`
// (que re-valida a sessão — o proxy apenas duplicava essa checagem). (v5.1.7/ADR-0153 — bug latente
// desde a v5.1.2: a rota nasceu com bypass de cron no handler mas não fora isentada do proxy, então o
// cron nunca autenticava.)
// v5.5.0/M2 — `/api/cdi/ingest` entra pelo MESMO motivo e com o mesmo molde: é
// chamada pelo pg_cron com Bearer do CRON_SECRET e sem cookie. Esquecer esta linha
// não quebra nada em teste (o disparo manual tem sessão) e faz o agendamento
// mensal falhar calado em produção — exatamente o bug de 2 anos atrás.
// Exportado para o guard mecânico de `proxy.test.ts`: como o efeito de esquecer uma
// entrada aqui só aparece em produção e só no request do cron, `tsc`/`lint`/`build`
// passam verdes com o bug dentro.
export const API_AUTH_PROPRIA = new Set(['/api/monde/ingest', '/api/cdi/ingest'])

// v5.4.0/M3b — API externa de Solicitações: `/api/externo/*` autentica por CHAVE DE
// API (header x-api-key, validada no handler via api_chave_resolver), não por sessão
// Supabase — o integrador nunca loga. Mesmo molde do bypass de cron do ADR-0153, mas
// por PREFIXO (não path exato): a rota tem segmento dinâmico
// (/api/externo/solicitacoes/[id]/cancelar), então um Set de paths exatos não cobriria
// todas as rotas da família.
const API_AUTH_PROPRIA_PREFIXOS = ['/api/externo/']

function temAuthPropria(pathname: string): boolean {
  if (API_AUTH_PROPRIA.has(pathname)) return true
  return API_AUTH_PROPRIA_PREFIXOS.some(p => pathname.startsWith(p))
}

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

  if (!user && !ehPublica(pathname) && !temAuthPropria(pathname)) {
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
  //
  // v5.3.3: `fonts/` entrou por PREFIXO DE DIRETÓRIO (a mesma forma de `logos/`) e não por
  // extensão `.otf` — a lição S11 acima segue valendo. Sem a isenção, `/fonts/avenir/*.otf`
  // levava 307 → HTML do login nas telas SEM sessão, o browser abortava o decode
  // (`OTS parsing error`) e a tipografia caía para fonte de sistema (achado ALTO do
  // verificador-visual na v5.3.2). Não abre bypass: sob `logos/` e `fonts/` não existe rota
  // de página nem de API — é só arquivo estático de `public/`, público por natureza, sem
  // guard de camada 2 porque não há o que autorizar. Toda superfície real continua na
  // camada 1; criar rota sob um desses prefixos exigiria revisar esta lista.
  matcher: [
    '/((?!_next/|favicon\\.ico|icon\\.svg|icon\\.png|icon0\\.png|icon1\\.png|apple-icon\\.png|logos/|fonts/).*)',
  ],
}
