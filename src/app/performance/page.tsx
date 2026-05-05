import PerformanceContent from '@/components/performance/performance-content'

interface SearchParams {
  preset?: string
  from?:   string
  to?:     string
  setor?:  string
}

export default async function PerformancePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp    = await searchParams
  const setor = sp.setor ?? 'todos'
  return <PerformanceContent setor={setor} searchParams={sp} />
}
