import { requireArea } from '@/lib/auth/sessao'
import { carregarInventario } from '@/lib/patrimonio/carregar'
import InventarioContent from '@/components/gestao-pessoas/inventario/inventario-content'

// Gestão de Pessoas · Inventário de Ativos (v5.6.0).
//
// Área própria desde a migration 0247. Na M0 esta rota ficou provisoriamente sob
// 'admin/design-system': declarar a área nova só no código, sem a migration que a insere em
// `app.rbac_areas`, quebraria o teste de paridade banco↔app (`rpc-contrato.test.ts`) — e a
// M0 não podia aplicar migration. As duas pontas viraram juntas na M1.
//
// Desde a M3 a tela lê as RPCs `patrimonio_*` (o fixture morreu). Dado pronto vem daqui, do
// RSC; cada escrita é server action + `router.refresh()` — o padrão da casa (tipos-content,
// chaves-api-content).
export const dynamic = 'force-dynamic'

export default async function InventarioPage() {
  await requireArea('gestao-pessoas/inventario')
  const dados = await carregarInventario()

  return (
    <InventarioContent
      ativos={dados.ativos}
      movimentacoes={dados.movimentacoes}
      catalogos={dados.catalogos}
      resumo={dados.resumo}
      erroDeLeitura={dados.erro}
    />
  )
}
