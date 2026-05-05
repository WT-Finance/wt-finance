import PerformanceContent from '@/components/performance/performance-content'

interface SearchParams {
  preset?: string
  from?:   string
  to?:     string
}

export default async function CorporativoPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  return <PerformanceContent setor="Corporativo" searchParams={sp} />
}
