import PerformanceContent from '@/components/performance/performance-content'
import EmConstrucao from '@/components/shared/em-construcao'
import { requireArea } from '@/lib/auth/sessao'
import { areasDoSetor } from '@/lib/auth/areas'

interface SearchParams {
  preset?:  string
  from?:    string
  to?:      string
  setor?:   string
  preview?: string
}

export default async function PerformancePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp    = await searchParams
  const setor = sp.setor ?? 'todos'
  // v4.13: guard de área (ADR-0109) — ?setor=X exige a permissão do setor X
  await requireArea(setor === 'todos' ? 'performance' : areasDoSetor(setor))

  const preview = sp.preview === '1'
  if (!preview) return <EmConstrucao preview={false}>{null}</EmConstrucao>

  return <PerformanceContent setor={setor} searchParams={sp} />
}
