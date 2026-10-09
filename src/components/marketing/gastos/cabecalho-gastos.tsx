import UltimaAtualizacao from '@/components/metas/ultima-atualizacao'
import type { ResumoMarketing } from '@/lib/marketing/tipos'

// Componente A — cabeçalho: título, subtítulo e o carimbo de última atualização.
//
// O carimbo é o `UltimaAtualizacao` vigente, com `vigiarAtraso={false}` como na DRE: a base de
// movimentação é de cadência HUMANA (upload da controladoria), e a régua de 45 min do cron do
// Monde acusaria atraso quase sempre — alerta permanente é ruído. NÃO há sufixo "· parcial" no
// mês corrente. A cobertura de datas e a defasagem do cartão (`ultimaDataCartao`) seguem no dado
// da RPC, mas não são exibidas.

export default function CabecalhoGastos({ resumo }: {
  /** `null` = o resumo não carregou; o título fica, o carimbo some. */
  resumo: ResumoMarketing | null
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-text-primary">Despesas de Marketing</h1>
        <p className="mt-0.5 text-sm text-text-subtle">Detalhamento das despesas de marketing</p>
      </div>

      {resumo && (
        <div className="flex flex-col items-start gap-y-0.5 text-2xs sm:items-end">
          <UltimaAtualizacao iso={resumo.ultimaCarga} iconSize={12} vigiarAtraso={false} />
        </div>
      )}
    </div>
  )
}
