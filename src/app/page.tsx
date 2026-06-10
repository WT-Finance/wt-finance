import { redirect } from 'next/navigation'
import { getSessao } from '@/lib/auth/sessao'
import { rotaInicial } from '@/lib/auth/areas'

// v4.13: a raiz redireciona para a PRIMEIRA área permitida do usuário
// (antes: /executiva fixo). Sem permissões → /sem-acesso.

export default async function Home() {
  const sessao = await getSessao()
  if (!sessao.logado) redirect('/login')
  redirect(rotaInicial(sessao.permissoes) ?? '/sem-acesso')
}
