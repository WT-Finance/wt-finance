import { requireArea } from '@/lib/auth/sessao'
import InventarioContent from '@/components/gestao-pessoas/inventario/inventario-content'

// Gestão de Pessoas · Inventário de Ativos (v5.6.0).
//
// Área própria desde a migration 0247. Na M0 esta rota ficou provisoriamente sob
// 'admin/design-system': declarar a área nova só no código, sem a migration que a insere em
// `app.rbac_areas`, quebraria o teste de paridade banco↔app (`rpc-contrato.test.ts`) — e a
// M0 não podia aplicar migration. As duas pontas viraram juntas na M1.
//
// ⚠️ A tela ainda roda sobre `fixture.ts` (mockup aprovado na M0). As RPCs
// `patrimonio_*` já estão no ar; quem as liga é a M3.
export const dynamic = 'force-dynamic'

export default async function InventarioPage() {
  await requireArea('gestao-pessoas/inventario')
  return <InventarioContent />
}
