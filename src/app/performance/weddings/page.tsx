import WeddingsContent from '@/components/performance/weddings-content'

interface SearchParams {
  preset?: string
  from?:   string
  to?:     string
}

export default async function WeddingsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  return <WeddingsContent searchParams={sp} />
}
