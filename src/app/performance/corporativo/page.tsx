import PerformanceContent from '@/components/performance/performance-content'
import { requireArea } from '@/lib/auth/sessao'

interface SearchParams {
  preset?: string
  from?:   string
  to?:     string
}

// v4.10/M8: aba ativa — gate ?preview=1 removido. Corporativo = setor_macro 'Corporativo'.
export default async function CorporativoPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  await requireArea('performance/corporativo') // v4.13: guard de área (ADR-0109)
  const sp = await searchParams
  return <PerformanceContent setor="Corporativo" searchParams={sp} />
}
