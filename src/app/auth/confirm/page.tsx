import { confirmarAcesso } from './actions'
import { nextSeguro } from '@/lib/auth/areas'
import AuthHeader from '@/components/auth/auth-header'

// v4.13.1: página de confirmação em DOIS passos (ADR-0106 + fix anti-preview).
// O GET só RENDERIZA o botão — não confirma nada. A confirmação (verifyOtp) é o
// POST da Server Action, disparado pelo clique humano. Assim o bot de preview de
// link (que faz só GET) não consome o token de uso único.

interface SearchParams {
  token_hash?: string
  type?:       string
  code?:       string
  next?:       string
}

export default async function ConfirmarAcessoPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  const next = nextSeguro(sp.next)
  const temToken = Boolean((sp.token_hash && sp.type) || sp.code)

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-sm">
        <AuthHeader className="flex flex-col items-center mb-7" />

        <div className="bg-white rounded-xl shadow-sm px-8 py-9 text-center">
          {temToken ? (
            <>
              <h1 className="text-base font-semibold mb-1" style={{ color: '#1A1814' }}>
                Confirmar acesso
              </h1>
              <p className="text-sm mb-6" style={{ color: '#75777B' }}>
                Clique no botão abaixo para entrar no WT Finance.
              </p>
              <form action={confirmarAcesso}>
                <input type="hidden" name="token_hash" value={sp.token_hash ?? ''} />
                <input type="hidden" name="type"       value={sp.type ?? ''} />
                <input type="hidden" name="code"       value={sp.code ?? ''} />
                <input type="hidden" name="next"       value={next} />
                <button
                  type="submit"
                  className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold transition hover:opacity-90"
                  style={{ background: 'var(--action-primary)', color: 'var(--action-primary-fg)' }}
                >
                  Entrar no WT Finance
                </button>
              </form>
            </>
          ) : (
            <>
              <h1 className="text-base font-semibold mb-1" style={{ color: '#1A1814' }}>
                Link incompleto
              </h1>
              <p className="text-sm mb-6" style={{ color: '#75777B' }}>
                Este link de acesso está incompleto ou inválido. Peça um novo na tela de entrada.
              </p>
              <a
                href="/login"
                className="inline-block w-full rounded-lg px-4 py-2.5 text-sm font-semibold transition hover:opacity-90"
                style={{ background: 'var(--action-primary)', color: 'var(--action-primary-fg)' }}
              >
                Ir para a entrada
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
