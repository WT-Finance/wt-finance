import { redirect } from 'next/navigation'
import { getSessao } from '@/lib/auth/sessao'
import { rotaInicial } from '@/lib/auth/areas'

// v4.13: destino de quem está logado mas sem permissões (conta nova sem role,
// conta desativada, ou navegação direta a área não permitida).

export default async function SemAcessoPage() {
  const sessao = await getSessao()
  if (!sessao.logado) redirect('/login')

  const home = rotaInicial(sessao.permissoes)

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-sm px-8 py-9 text-center">
        <p className="text-[13px] font-[800] uppercase tracking-[1.5px] mb-4" style={{ color: '#BD965C' }}>
          WT Finance
        </p>
        <h1 className="text-lg font-semibold mb-2" style={{ color: '#1A1814' }}>
          {sessao.ativo ? 'Sem acesso a esta área' : 'Conta sem acesso ativo'}
        </h1>
        <p className="text-sm leading-relaxed mb-6" style={{ color: '#75777B' }}>
          {sessao.ativo
            ? 'Seu perfil não tem permissão para a área solicitada. Se você precisa deste acesso, fale com o time Financeiro.'
            : 'Sua conta foi autenticada, mas não tem um perfil de acesso ativo no WT Finance. Fale com o time Financeiro para liberar o acesso.'}
        </p>
        <p className="text-xs mb-6" style={{ color: '#75777B' }}>
          Conectado como <span className="font-medium">{sessao.email}</span>
        </p>
        <div className="flex items-center justify-center gap-3">
          {home && (
            <a
              href={home}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
              style={{ background: '#BD965C' }}
            >
              Ir para minha área
            </a>
          )}
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="rounded-lg px-4 py-2 text-sm font-medium border border-zinc-300 text-zinc-600 hover:bg-zinc-50 transition"
            >
              Sair
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
