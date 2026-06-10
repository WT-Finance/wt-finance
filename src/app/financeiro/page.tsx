import { redirect } from 'next/navigation'
import { requireArea } from '@/lib/auth/sessao'

export default async function FinanceiroPage() {
  // v4.13: guard de área (ADR-0109) — destino depende da permissão do usuário
  const s = await requireArea(['financeiro/fluxo-caixa', 'financeiro/gerencial'])
  if (s.permissoes.includes('financeiro/fluxo-caixa')) {
    redirect('/financeiro/fluxo-caixa')
  }
  redirect('/financeiro/fluxo-caixa/gerencial')
}
