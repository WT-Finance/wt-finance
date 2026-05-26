import PerformanceContent from '@/components/performance/performance-content'
import EmConstrucao from '@/components/shared/em-construcao'

interface SearchParams {
  preset?:  string
  from?:    string
  to?:      string
  preview?: string
}

export default async function TripsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp      = await searchParams
  const preview = sp.preview === '1'
  if (!preview) return <EmConstrucao preview={false}>{null}</EmConstrucao>

  return <PerformanceContent setor="Lazer" searchParams={sp} />
}
