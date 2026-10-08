import { CalendarRange, CreditCard } from 'lucide-react'
import Badge from '@/components/ui/badge'
import UltimaAtualizacao from '@/components/metas/ultima-atualizacao'
import { fmtDate } from '@/lib/fmt'
import { fmtDiaMes } from '@/lib/marketing/periodo'
import type { ResumoMarketing } from './tipos'

// Componente A — cabeçalho: título, regra de leitura, carimbo, cobertura e o aviso de
// defasagem do cartão.
//
// O carimbo é o `UltimaAtualizacao` vigente, com `vigiarAtraso={false}` como na DRE: a base de
// movimentação é de cadência HUMANA (upload da controladoria), e a régua de 45 min do cron do
// Monde acusaria atraso quase sempre — alerta permanente é ruído. NÃO há sufixo "· parcial" no
// mês corrente; no lugar dele, o aviso "Cartão lançado até DD/MM", que diz O QUE está atrasado.

const AJUDA_CARTAO =
  'A fatura do cartão entra com atraso. Google, Meta e Adobe são pagos no cartão, então o mês ' +
  'corrente fica subcontado até a fatura ser lançada.'

export default function CabecalhoGastos({
  resumo, prototipo, ultimaDataCartao,
}: {
  /** `null` = o resumo não carregou; o título fica, os selos somem. */
  resumo: ResumoMarketing | null
  /** Data do aviso "Cartão lançado até". O CHAMADOR decide quando mostrar: a data é global (não
   *  é do ano exibido), então só vale no ano corrente — em ano fechado vem `null`. */
  ultimaDataCartao: string | null
  /** Selo "dados fictícios" do mockup (some quando a fonte passa a ser a RPC). */
  prototipo: boolean
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="text-xl font-semibold text-text-primary">Gastos de Marketing</h1>
          {prototipo && <Badge variant="warning">Protótipo · dados fictícios</Badge>}
        </div>
        <p className="mt-0.5 text-sm text-text-subtle">Lançamentos pagos · data de movimentação</p>
        <p className="mt-1 text-2xs text-[var(--text-muted)]">
          Mesmo número da linha “(-) Despesas Marketing” da DRE de caixa. Gasto em negativo, como na DRE.
        </p>
      </div>

      {resumo && (
        <div className="flex flex-col items-start gap-y-0.5 text-2xs sm:items-end">
          <UltimaAtualizacao iso={resumo.ultimaCarga} iconSize={12} vigiarAtraso={false} />
          <span className="inline-flex items-center gap-1.5 text-[var(--text-muted)]">
            <CalendarRange size={12} className="text-zinc-400" aria-hidden />
            {resumo.cobertura
              ? `Dados de ${fmtDate(resumo.cobertura.min)} a ${fmtDate(resumo.cobertura.max)}`
              : 'Sem lançamentos no ano'}
          </span>
          {ultimaDataCartao && (
            <span className="inline-flex items-center gap-1.5 text-warning-deep" title={AJUDA_CARTAO}>
              <CreditCard size={12} aria-hidden />
              Cartão lançado até {fmtDiaMes(ultimaDataCartao)}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
