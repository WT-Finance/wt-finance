import Link from 'next/link'
import { entrar } from './actions'
import { nextSeguro } from '@/lib/auth/areas'
import AuthHeader from '@/components/auth/auth-header'

// v4.14 (ADR-0110): login por e-mail + senha. Sem magic link na tela (ele segue
// existindo só como recuperação, via link gerado pelo admin). "Solicitar acesso"
// leva à solicitação de acesso.

interface SearchParams {
  erro?: string
  next?: string
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  const next = nextSeguro(sp.next)

  const mensagemErro =
    sp.erro === 'credenciais' ? 'E-mail ou senha incorretos.' :
    sp.erro === 'sessao'      ? 'Sua sessão expirou. Entre novamente.' :
    null

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-sm">
        <AuthHeader className="flex flex-col items-center mb-7" />

        <div className="bg-white rounded-xl shadow-sm px-8 py-9">
          <h1 className="text-base font-semibold mb-1" style={{ color: '#1A1814' }}>Entrar</h1>
          <p className="text-sm mb-5" style={{ color: '#75777B' }}>Acesse com seu e-mail corporativo e senha</p>

          {mensagemErro && (
            <p
              className="mb-4 text-sm rounded-lg border px-3 py-2"
              style={{ borderColor: 'var(--danger)', background: 'var(--danger-bg)', color: 'var(--danger)' }}
            >
              {mensagemErro}
            </p>
          )}

          <form action={entrar} className="space-y-4">
            <input type="hidden" name="next" value={next} />
            <div>
              <label htmlFor="email" className="block text-[13px] mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                E-mail
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                autoFocus
                placeholder="voce@welcometrips.com.br"
                className="foco-neutro w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none transition"
              />
            </div>
            <div>
              <label htmlFor="senha" className="block text-[13px] mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                Senha
              </label>
              <input
                id="senha"
                name="senha"
                type="password"
                required
                autoComplete="current-password"
                placeholder="••••••••"
                className="foco-neutro w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none transition"
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold transition hover:opacity-90"
              style={{ background: 'var(--action-primary)', color: 'var(--action-primary-fg)' }}
            >
              Entrar
            </button>
          </form>

          <div className="mt-4 text-center">
            <Link
              href="/solicitar-acesso"
              className="text-sm font-medium hover:underline"
              style={{ color: 'var(--action-primary)' }}
            >
              Solicitar acesso
            </Link>
          </div>

          <p className="mt-3 text-xs leading-relaxed text-center" style={{ color: 'var(--text-muted)' }}>
            Esqueceu a senha?<br />
            Fale com o time Financeiro para receber uma nova.
          </p>
        </div>
      </div>
    </div>
  )
}
