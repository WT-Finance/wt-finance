import { PeriodoFilterProvider } from '@/components/layout/period-filter-provider'

export default function FinanceiroLayout({ children }: { children: React.ReactNode }) {
  return <PeriodoFilterProvider>{children}</PeriodoFilterProvider>
}
