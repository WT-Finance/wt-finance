import WeddingsContent from '@/components/performance/weddings-content'

export default async function WeddingsPage({
  searchParams,
}: {
  searchParams: Promise<{ operacao?: string }>
}) {
  const sp = await searchParams
  return <WeddingsContent searchParams={sp} />
}
