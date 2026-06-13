import type { ReactNode } from 'react'
import { requireArea } from '@/lib/auth/sessao'

// Guard baseline de TODA a subárvore /admin (v4.17.0/Balde 1). Antes este layout não
// tinha proteção própria — dependia de cada página-filha lembrar do seu requireArea.
// requireArea(null) exige só sessão autenticada ATIVA (e troca de senha resolvida); as
// permissões granulares por subárea seguem nos guards das próprias páginas/handlers.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireArea(null)
  return (
    <div>
      <div className="border-b border-[var(--color-border-tertiary,#e4e4e7)] bg-white px-6 py-3 mb-6">
        <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted,#75777B)]">
          Administração
        </p>
      </div>
      {children}
    </div>
  )
}
