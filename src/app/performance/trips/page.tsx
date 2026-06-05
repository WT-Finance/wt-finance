import PerformanceContent from '@/components/performance/performance-content'

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
  const sp = await searchParams
  return <PerformanceContent setor="Lazer" searchParams={sp} />
}
