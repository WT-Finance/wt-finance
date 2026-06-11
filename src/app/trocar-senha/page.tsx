import { redirect } from 'next/navigation'
import { getSessao } from '@/lib/auth/sessao'
import { trocarSenha } from './actions'

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
        <div className="bg-white rounded-xl shadow-sm px-8 py-9">
          <p className="text-[13px] font-[800] uppercase tracking-[1.5px] text-center mb-6" style={{ color: '#BD965C' }}>
            WT Finance
          </p>
          <h1 className="text-base font-semibold mb-1" style={{ color: '#1A1814' }}>Defina sua senha</h1>
          <p className="text-sm mb-5" style={{ color: '#75777B' }}>
            {sessao.email
              ? <>Você está entrando como <span className="font-medium">{sessao.email}</span>. Crie uma senha para continuar.</>
              : 'Crie uma senha para continuar.'}
          </p>

          {erro && (
            <p className="mb-4 text-sm rounded-lg border border-red-200 bg-red-50 text-red-700 px-3 py-2">{erro}</p>
          )}

          <form action={trocarSenha} className="space-y-4">
            <div>
              <label htmlFor="senha" className="block text-xs font-medium uppercase tracking-wide mb-1.5" style={{ color: '#4B4F54' }}>
                Nova senha
              </label>
              <input
                id="senha" name="senha" type="password" required minLength={8} autoFocus
                autoComplete="new-password" placeholder="ao menos 8 caracteres"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-[#BD965C] focus:ring-2 focus:ring-[#BD965C]/20 transition"
              />
            </div>
            <div>
              <label htmlFor="confirmar" className="block text-xs font-medium uppercase tracking-wide mb-1.5" style={{ color: '#4B4F54' }}>
                Confirmar senha
              </label>
              <input
                id="confirmar" name="confirmar" type="password" required minLength={8}
                autoComplete="new-password" placeholder="repita a senha"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-[#BD965C] focus:ring-2 focus:ring-[#BD965C]/20 transition"
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
              style={{ background: '#BD965C' }}
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
