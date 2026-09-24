import type { ReactNode } from 'react'
import { requireArea } from '@/lib/auth/sessao'

// v6.0.0/M6: mesma área de quem carrega planilha (anexo §7) — "as mesmas pessoas que
// carregam são as que precisam ver o log". A page é client component (estado de
// modal/toggles), então o guard vive aqui, no molde de admin/uploads/layout.tsx.
export default async function IngestaoLayout({ children }: { children: ReactNode }) {
  await requireArea('admin/uploads')
  return <>{children}</>
}
