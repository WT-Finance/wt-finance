import PerformanceContent from '@/components/performance/performance-content'

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
  const sp = await searchParams
  return <PerformanceContent setor="Corporativo" searchParams={sp} />
}
