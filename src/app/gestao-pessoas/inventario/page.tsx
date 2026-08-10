import { requireArea } from '@/lib/auth/sessao'
import InventarioContent from '@/components/gestao-pessoas/inventario/inventario-content'

// Gestão de Pessoas · Inventário de Ativos (v5.6.0).
//
// ⚠️ M0 — GATE DE APROVAÇÃO VISUAL. A rota é real e a sidebar já mostra a seção nova, mas a
// área de permissão definitiva ('gestao-pessoas/inventario') AINDA NÃO EXISTE: criá-la em
// `src/lib/auth/areas.ts` sem a migration correspondente quebraria o teste de contrato de
// paridade banco↔app (`rpc-contrato.test.ts`), e a M0 não pode aplicar migration.
// Enquanto isso, o gate é a área EXISTENTE de Design System — quem revisa o mockup é quem
// já tem acesso ao catálogo visual.
// M2: trocar por `requireArea('gestao-pessoas/inventario')`, junto com a migration que
// insere a área em `app.rbac_areas` e a entrada no catálogo local (as duas pontas no mesmo
// passo). O mesmo flip acontece no gate do item de sidebar em `layout/sidebar.tsx`.
export const dynamic = 'force-dynamic'

export default async function InventarioPage() {
  await requireArea('admin/design-system')
  return <InventarioContent />
}
