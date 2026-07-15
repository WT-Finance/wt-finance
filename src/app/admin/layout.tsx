import type { ReactNode } from 'react'
import { VenetianMask } from 'lucide-react'
import { requireArea } from '@/lib/auth/sessao'

// Guard baseline de TODA a subárvore /admin (v4.17.0/Balde 1). Antes este layout não
// tinha proteção própria — dependia de cada página-filha lembrar do seu requireArea.
// requireArea(null) exige só sessão autenticada ATIVA (e troca de senha resolvida); as
// permissões granulares por subárea seguem nos guards das próprias páginas/handlers.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireArea(null)
  return (
    <div className="relative">
      {/* Badge de seção (v5.1.9): âmbar de gestão (tokens --gestao*) no canto superior direito,
          ALINHADO à altura do título de cada página — `absolute` (fora do fluxo) → não deixa
          espaço sobrando E fica na linha do H1. Cada página /admin/* tem o H1 à esquerda e o
          top-right livre (o refresh de /admin/uploads saiu na v5.1.9). Vale p/ toda /admin/*. */}
      <span className="absolute right-0 top-0 z-10 inline-flex items-center gap-1.5 rounded-md border border-gestao bg-gestao-soft px-2.5 py-1 text-xs font-semibold text-gestao-fg">
        <VenetianMask size={14} /> Administração
      </span>
      {children}
    </div>
  )
}
