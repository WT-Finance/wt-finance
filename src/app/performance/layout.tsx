import { PeriodoFilterProvider } from '@/components/layout/period-filter-provider'

export default function PerformanceLayout({ children }: { children: React.ReactNode }) {
  return <PeriodoFilterProvider>{children}</PeriodoFilterProvider>
}
