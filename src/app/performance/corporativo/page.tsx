import PerformanceContent from '@/components/performance/performance-content'
import EmConstrucao from '@/components/shared/em-construcao'

interface SearchParams {
  preset?:  string
  from?:    string
  to?:      string
  preview?: string
}

export default async function CorporativoPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp      = await searchParams
  const preview = sp.preview === '1'
  return (
    <EmConstrucao preview={preview}>
      <PerformanceContent setor="Corporativo" searchParams={sp} />
    </EmConstrucao>
  )
}
