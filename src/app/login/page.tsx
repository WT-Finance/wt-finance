import Image from 'next/image'
import { enviarMagicLink } from './actions'
import { nextSeguro } from '@/lib/auth/areas'

// v4.13 (ADR-0106): login por magic link, único método. Tela pública (middleware
// libera /login e /auth/*). Mensagem idêntica para e-mail cadastrado ou não.

interface SearchParams {
  enviado?: string
  erro?:    string
  next?:    string
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  const enviado = sp.enviado === '1'
  const next = nextSeguro(sp.next)

  const mensagemErro =
    sp.erro === 'email-invalido' ? 'Informe um e-mail válido.' :
    sp.erro === 'link-invalido'  ? 'Link inválido ou expirado. Peça um novo abaixo.' :
    sp.erro === 'envio'          ? 'Não foi possível enviar o e-mail agora. Tente novamente em alguns minutos.' :
    null

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-xl shadow-sm px-8 py-9">
          <div className="flex flex-col items-center mb-7">
            <div className="relative h-12 w-44">
              <Image
                src="/logos/welcome-group.svg"
                alt="Welcome Group"
                fill
                priority
                className="object-contain"
              />
            </div>
            <p className="mt-3 text-[13px] font-[800] uppercase tracking-[1.5px]" style={{ color: '#BD965C' }}>
              WT Finance
            </p>
          </div>

          {enviado ? (
            <div className="text-center space-y-3">
              <h1 className="text-base font-semibold" style={{ color: '#1A1814' }}>
                Verifique seu e-mail
              </h1>
              <p className="text-sm leading-relaxed" style={{ color: '#75777B' }}>
                Se o e-mail informado estiver cadastrado, você receberá um link de
                acesso. O link vale por 1 hora.
              </p>
              <a
                href="/login"
                className="inline-block text-sm font-medium hover:underline"
                style={{ color: '#BD965C' }}
              >
                Usar outro e-mail
              </a>
            </div>
          ) : (
            <>
              <h1 className="text-base font-semibold mb-1" style={{ color: '#1A1814' }}>
                Entrar
              </h1>
              <p className="text-sm mb-5" style={{ color: '#75777B' }}>
                Acesso por link enviado ao seu e-mail corporativo.
              </p>

              {mensagemErro && (
                <p className="mb-4 text-sm rounded-lg border border-red-200 bg-red-50 text-red-700 px-3 py-2">
                  {mensagemErro}
                </p>
              )}

              <form action={enviarMagicLink} className="space-y-4">
                <input type="hidden" name="next" value={next} />
                <div>
                  <label htmlFor="email" className="block text-xs font-medium uppercase tracking-wide mb-1.5" style={{ color: '#4B4F54' }}>
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
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-[#BD965C] focus:ring-2 focus:ring-[#BD965C]/20 transition"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                  style={{ background: '#BD965C' }}
                >
                  Enviar link de acesso
                </button>
              </form>

              <p className="mt-5 text-xs leading-relaxed text-center" style={{ color: '#75777B' }}>
                O acesso é por convite. Se você ainda não tem cadastro, fale com o
                time Financeiro.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
