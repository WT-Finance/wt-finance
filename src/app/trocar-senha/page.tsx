import { redirect } from 'next/navigation'
import { getSessao } from '@/lib/auth/sessao'
import { trocarSenha } from './actions'
import AuthHeader from '@/components/auth/auth-header'

// v4.14: troca obrigatória de senha. Tela cheia (o RootLayout não renderiza o
// chrome enquanto precisaTrocarSenha). Quem não precisa trocar é mandado para a home.

interface SearchParams { erro?: string }

export default async function TrocarSenhaPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  const sessao = await getSessao()
  if (!sessao.logado) redirect('/login')
  if (!sessao.precisaTrocarSenha) redirect('/')

  const erro =
    sp.erro === 'curta'     ? 'A senha deve ter ao menos 8 caracteres.' :
    sp.erro === 'diferente' ? 'As senhas não coincidem.' :
    sp.erro === 'falha'     ? 'Não foi possível salvar. Use uma senha diferente da atual e tente de novo.' :
    null

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-sm">
        <AuthHeader className="flex flex-col items-center mb-7" />

        <div className="bg-white rounded-xl shadow-sm px-8 py-9">
          <h1 className="text-base font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Defina sua senha</h1>
          <p className="text-sm mb-5" style={{ color: 'var(--text-muted)' }}>
            {sessao.email
              ? <>Você está entrando como <span className="font-medium">{sessao.email}</span>. Crie uma senha para continuar.</>
              : 'Crie uma senha para continuar.'}
          </p>

          {erro && (
            <p
              className="mb-4 text-sm rounded-lg border px-3 py-2"
              style={{ borderColor: 'var(--danger)', background: 'var(--danger-bg)', color: 'var(--danger)' }}
            >
              {erro}
            </p>
          )}

          <form action={trocarSenha} className="space-y-4">
            <div>
              <label htmlFor="senha" className="block text-[13px] mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                Nova senha
              </label>
              <input
                id="senha" name="senha" type="password" required minLength={8} autoFocus
                autoComplete="new-password" placeholder="ao menos 8 caracteres"
                className="foco-neutro w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none transition"
              />
            </div>
            <div>
              <label htmlFor="confirmar" className="block text-[13px] mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                Confirmar senha
              </label>
              <input
                id="confirmar" name="confirmar" type="password" required minLength={8}
                autoComplete="new-password" placeholder="repita a senha"
                className="foco-neutro w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none transition"
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold transition hover:opacity-90"
              style={{ background: 'var(--action-primary)', color: 'var(--action-primary-fg)' }}
            >
              Salvar e entrar
            </button>
          </form>

          <form action="/auth/signout" method="post" className="mt-4 text-center">
            <button type="submit" className="text-xs text-zinc-400 hover:text-zinc-600">Sair</button>
          </form>
        </div>
      </div>
    </div>
  )
}
