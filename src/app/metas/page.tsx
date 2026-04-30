import MetasDashboard from './MetasDashboard'

export default async function MetasPage({
  searchParams,
}: {
  searchParams: Promise<{ setor?: string; ano?: string; mes?: string }>
}) {
  const sp = await searchParams
  const now = new Date()
  const setor = sp.setor ?? 'todos'
  const ano   = Number(sp.ano)  || now.getFullYear()
  const mes   = Number(sp.mes)  || (now.getMonth() + 1)

  return <MetasDashboard setor={setor} ano={ano} mes={mes} />
}
