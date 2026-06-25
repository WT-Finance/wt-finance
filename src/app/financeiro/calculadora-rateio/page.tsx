import { requireArea } from '@/lib/auth/sessao'
import CalculadoraRateio from '@/components/financeiro/calculadora-rateio'

// Aba nova de Financeiro (v4.28.0), sob a permissão 'financeiro/gerencial' (reusa a
// área — sem RBAC novo). Server Component só com o guard; a calculadora é cliente
// (parseia a fatura no browser, chama a server action de cruzamento). READ-ONLY.
export default async function CalculadoraRateioPage() {
  await requireArea('financeiro/gerencial')
  return (
    <div className="max-w-2xl mx-auto px-4">
      <CalculadoraRateio />
    </div>
  )
}
