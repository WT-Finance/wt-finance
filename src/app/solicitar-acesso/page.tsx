import Image from 'next/image'
import Link from 'next/link'
import { solicitarAcesso } from './actions'

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
        <div className="bg-white rounded-xl shadow-sm px-8 py-9">
          <div className="flex flex-col items-center mb-7">
            <div className="relative h-12 w-44">
              <Image src="/logos/welcome-group.svg" alt="Welcome Group" fill priority className="object-contain" />
            </div>
            <p className="mt-3 text-[13px] font-[800] uppercase tracking-[1.5px]" style={{ color: '#BD965C' }}>
              WT Finance
            </p>
          </div>

          {enviado ? (
            <div className="text-center space-y-3">
              <h1 className="text-base font-semibold" style={{ color: '#1A1814' }}>Solicitação registrada</h1>
              <p className="text-sm leading-relaxed" style={{ color: '#75777B' }}>
                Se o e-mail informado estiver apto, o time Financeiro vai analisar e liberar seu acesso.
                Você será avisado quando a conta estiver pronta.
              </p>
              <Link href="/login" className="inline-block text-sm font-medium hover:underline" style={{ color: '#BD965C' }}>
                Voltar para a entrada
              </Link>
            </div>
          ) : (
            <>
              <h1 className="text-base font-semibold mb-1" style={{ color: '#1A1814' }}>Solicitar acesso</h1>
              <p className="text-sm mb-5" style={{ color: '#75777B' }}>
                Informe seu e-mail corporativo. O time Financeiro analisa e libera o acesso.
              </p>

              {sp.erro === 'email' && (
                <p className="mb-4 text-sm rounded-lg border border-red-200 bg-red-50 text-red-700 px-3 py-2">
                  Informe um e-mail válido.
                </p>
              )}

              <form action={solicitarAcesso} className="space-y-4">
                <div>
                  <label htmlFor="nome" className="block text-xs font-medium uppercase tracking-wide mb-1.5" style={{ color: '#4B4F54' }}>
                    Nome <span className="normal-case text-zinc-400">(opcional)</span>
                  </label>
                  <input
                    id="nome" name="nome" type="text" autoComplete="name" placeholder="Seu nome"
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-[#BD965C] focus:ring-2 focus:ring-[#BD965C]/20 transition"
                  />
                </div>
                <div>
                  <label htmlFor="email" className="block text-xs font-medium uppercase tracking-wide mb-1.5" style={{ color: '#4B4F54' }}>
                    E-mail
                  </label>
                  <input
                    id="email" name="email" type="email" required autoComplete="email" autoFocus
                    placeholder="voce@welcometrips.com.br"
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-[#BD965C] focus:ring-2 focus:ring-[#BD965C]/20 transition"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                  style={{ background: '#BD965C' }}
                >
                  Enviar solicitação
                </button>
              </form>

              <div className="mt-5 text-center">
                <Link href="/login" className="text-sm font-medium hover:underline" style={{ color: '#BD965C' }}>
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
