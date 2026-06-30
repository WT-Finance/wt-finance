import { requireArea } from '@/lib/auth/sessao'
import FaturamentoCorp from '@/components/financeiro/faturamento-corp'

// Faturamento Corporativo — Fase 1a (v4.30.0). Aba sob a área RBAC própria e apertada
// 'financeiro/faturamento-corp' (NÃO reusa gerencial). READ-ONLY: importa a crua, cruza
// com a base de pessoas e mostra a tela de revisão. NÃO emite nada (emissão = Fase 1b).
export default async function FaturamentoCorpPage() {
  await requireArea('financeiro/faturamento-corp')
  return (
    <div className="max-w-5xl mx-auto px-4">
      <FaturamentoCorp />
    </div>
  )
}
