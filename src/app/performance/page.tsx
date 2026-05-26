import PerformanceContent from '@/components/performance/performance-content'
import EmConstrucao from '@/components/shared/em-construcao'

interface SearchParams {
  preset?:   string
  from?:     string
  to?:       string
  setor?:    string
  preview?:  string
}

export default async function PerformancePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp      = await searchParams
  const preview = sp.preview === '1'
  const setor   = sp.setor ?? 'todos'
  return (
    <EmConstrucao preview={preview}>
      <PerformanceContent setor={setor} searchParams={sp} />
    </EmConstrucao>
  )
}
