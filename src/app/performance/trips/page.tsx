import PerformanceContent from '@/components/performance/performance-content'
import { requireArea } from '@/lib/auth/sessao'

interface SearchParams {
  preset?: string
  from?:   string
  to?:     string
}

// v4.10/M8: aba ativa — gate ?preview=1 removido. Trips = setor_macro 'Lazer'.
export default async function TripsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  await requireArea('performance/trips') // v4.13: guard de área (ADR-0109)
  const sp = await searchParams
  return <PerformanceContent setor="Lazer" searchParams={sp} />
}
