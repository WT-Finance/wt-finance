import { type ReactNode, Suspense } from 'react'
import PerformanceSubTabs from '@/components/performance/sub-tabs'

export default function PerformanceLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Suspense>
        <PerformanceSubTabs />
      </Suspense>
      {children}
    </>
  )
}
