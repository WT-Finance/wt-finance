import Link from 'next/link'
import { solicitarAcesso } from './actions'
import AuthHeader from '@/components/auth/auth-header'

// v4.14 (ADR-0110): solicitação de acesso pública. O admin aprova em /admin/acessos.

interface SearchParams { enviado?: string; erro?: string }

export default async function SolicitarAcessoPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  const enviado = sp.enviado === '1'

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-sm">
        <AuthHeader className="flex flex-col items-center mb-7" />

        <div className="bg-white rounded-xl shadow-sm px-8 py-9">
          {enviado ? (
            <div className="text-center space-y-3">
              <h1 className="text-base font-semibold" style={{ color: '#1A1814' }}>Solicitação registrada</h1>
              <p className="text-sm leading-relaxed" style={{ color: '#75777B' }}>
                Se o e-mail informado estiver apto, o time Financeiro vai analisar e liberar seu acesso.
                Você será avisado quando a conta estiver pronta.
              </p>
              <Link
                href="/login"
                className="inline-block text-sm font-medium hover:underline"
                style={{ color: 'var(--action-primary)' }}
              >
                Voltar ao login
              </Link>
            </div>
          ) : (
            <>
              <h1 className="text-base font-semibold mb-1" style={{ color: '#1A1814' }}>Solicitar acesso</h1>
              <p className="text-sm mb-5" style={{ color: '#75777B' }}>
                Informe seu e-mail corporativo. O time Financeiro analisa e libera o acesso.
              </p>

              {sp.erro === 'email' && (
                <p
                  className="mb-4 text-sm rounded-lg border px-3 py-2"
                  style={{ borderColor: 'var(--danger)', background: 'var(--danger-bg)', color: 'var(--danger)' }}
                >
                  Informe um e-mail válido.
                </p>
              )}

              <form action={solicitarAcesso} className="space-y-4">
                <div>
                  <label htmlFor="nome" className="block text-[13px] mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                    Nome <span className="text-zinc-400">(opcional)</span>
                  </label>
                  <input
                    id="nome" name="nome" type="text" autoComplete="name" placeholder="Seu nome"
                    className="foco-neutro w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none transition"
                  />
                </div>
                <div>
                  <label htmlFor="email" className="block text-[13px] mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                    E-mail
                  </label>
                  <input
                    id="email" name="email" type="email" required autoComplete="email" autoFocus
                    placeholder="voce@welcometrips.com.br"
                    className="foco-neutro w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none transition"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold transition hover:opacity-90"
                  style={{ background: 'var(--action-primary)', color: 'var(--action-primary-fg)' }}
                >
                  Enviar solicitação
                </button>
              </form>

              <div className="mt-5 text-center">
                <Link
                  href="/login"
                  className="text-sm font-medium hover:underline"
                  style={{ color: 'var(--action-primary)' }}
                >
                  Já tenho conta — entrar
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
