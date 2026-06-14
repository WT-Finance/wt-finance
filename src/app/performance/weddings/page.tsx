import WeddingsContent from '@/components/performance/weddings-content'
import { requireArea } from '@/lib/auth/sessao'

export default async function WeddingsPage({
  searchParams,
}: {
  searchParams: Promise<{ operacao?: string | string[] }>
}) {
  await requireArea('performance/weddings') // v4.13: guard de área (ADR-0109)
  const sp = await searchParams
  return <WeddingsContent searchParams={sp} />
}
