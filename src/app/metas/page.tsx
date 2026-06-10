import MetasDashboard from './MetasDashboard'
import EmConstrucao from '@/components/shared/em-construcao'
import { requireArea } from '@/lib/auth/sessao'

export default async function MetasPage({
  searchParams,
}: {
  searchParams: Promise<{ setor?: string; ano?: string; mes?: string; preview?: string }>
}) {
  await requireArea('metas') // v4.13: guard de área (ADR-0109)
  const sp      = await searchParams
  const preview = sp.preview === '1'
  const now     = new Date()
  const setor   = sp.setor ?? 'todos'
  const ano     = Number(sp.ano) || now.getFullYear()
  const mes     = Number(sp.mes) || (now.getMonth() + 1)
  return (
    <EmConstrucao preview={preview}>
      <MetasDashboard setor={setor} ano={ano} mes={mes} />
    </EmConstrucao>
  )
}
