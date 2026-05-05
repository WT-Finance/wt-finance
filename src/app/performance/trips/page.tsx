import PerformanceContent from '@/components/performance/performance-content'

interface SearchParams {
  preset?: string
  from?:   string
  to?:     string
}

export default async function TripsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  return <PerformanceContent setor="Lazer" searchParams={sp} />
}
