import type { ReactNode } from 'react'

// Para futura adição de proteção de acesso server-side:
// - Adicionar componente RequireAdmin aqui
// - Verificar sessão/role antes de renderizar children
// - Ou integrar middleware de autenticação

export default function AdminLayout({ children }: { children: ReactNode }) {
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
