import type { ReactNode } from 'react'
import { requireArea } from '@/lib/auth/sessao'

// v4.13: guard de área (ADR-0109) no layout — a page é client component,
// então o requireArea vive aqui. Cobre também /admin/uploads/financeiro.
export default async function UploadsLayout({ children }: { children: ReactNode }) {
  await requireArea('admin/uploads')
  return <>{children}</>
}
