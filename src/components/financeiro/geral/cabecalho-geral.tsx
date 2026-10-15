import UltimaAtualizacao from '@/components/metas/ultima-atualizacao'

// Cabeçalho da página: título, subtítulo e o carimbo "Última atualização" — o `UltimaAtualizacao`
// vigente com `vigiarAtraso={false}`, como na DRE e no Marketing: as fontes têm cadência HUMANA (carga
// de planilha, registro manual) e a régua de 45 min do cron do Monde acusaria atraso quase sempre —
// alerta permanente é ruído. O carimbo é o mais recente entre as fontes que carregaram; cada seção
// mostra a própria data. `null` = nenhuma fonte carregou: o título fica, o carimbo some.

export default function CabecalhoGeral({ carimbo }: { carimbo: string | null }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-text-primary">Geral</h1>
        <p className="mt-0.5 text-sm text-text-subtle">Visão executiva das finanças: inadimplência, antecipações, prejuízos, custos financeiros e prazos</p>
      </div>

      {carimbo && (
        <div className="flex flex-col items-start gap-y-0.5 text-2xs sm:items-end">
          <UltimaAtualizacao iso={carimbo} iconSize={12} vigiarAtraso={false} />
        </div>
      )}
    </div>
  )
}
