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
  return (
    <EmConstrucao preview={preview}>
      <PerformanceContent setor="Lazer" searchParams={sp} />
    </EmConstrucao>
  )
}
