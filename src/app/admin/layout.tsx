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
    <div>
      {/* Badge de seção (v5.1.9): substitui a antiga faixa full-bleed "Administração". Âmbar de
          gestão (tokens --gestao*, o canônico "ação administrativa só-admin" do DS), no canto
          superior direito. Fluxo normal (não absolute) → não colide com controles top-right das
          páginas (ex.: o refresh de /admin/uploads); a página vem logo abaixo. Sem a faixa não
          sobra espaço (o conteúdo sobe); o `mb-3` é só o respiro badge↔conteúdo. Vale p/ /admin/*. */}
      <div className="mb-3 flex justify-end">
        <span className="inline-flex items-center gap-1.5 rounded-md border border-gestao bg-gestao-soft px-2.5 py-1 text-xs font-semibold text-gestao-fg">
          <VenetianMask size={14} /> Administração
        </span>
      </div>
      {children}
    </div>
  )
}
