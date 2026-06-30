import { requireArea } from '@/lib/auth/sessao'
import FaturamentoCorp from '@/components/financeiro/faturamento-corp'
import { asaasAmbiente, asaasConfigurado } from '@/lib/asaas/client'

// Faturamento Corporativo — Fase 1b (v4.31.0). Aba sob a área RBAC própria e apertada
// 'financeiro/faturamento-corp' (NÃO reusa gerencial). Importa a crua, cruza com a base de
// pessoas (1a) e EMITE boletos via Asaas (1b). O ambiente (sandbox/produção) é resolvido
// SERVER-SIDE (asaasAmbiente) e passado para a tela — a UI nunca decide nem mente o ambiente.
export default async function FaturamentoCorpPage() {
  await requireArea('financeiro/faturamento-corp')
  return (
    <div className="max-w-5xl mx-auto px-4">
      <FaturamentoCorp ambiente={asaasAmbiente()} configurado={asaasConfigurado()} />
    </div>
  )
}
