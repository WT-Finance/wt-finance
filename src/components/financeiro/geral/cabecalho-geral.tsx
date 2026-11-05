import UltimaAtualizacao from '@/components/metas/ultima-atualizacao'
import type { CarimboFonte } from '@/lib/financeiro-geral/carimbos'

// Cabeçalho da página: título, subtítulo e, à direita, UMA linha "<Fonte> · Última atualização em <data>" por
// base de dados — o formato da DRE e de Weddings: o `UltimaAtualizacao` com `vigiarAtraso={false}` (as fontes
// têm cadência HUMANA — carga de planilha, registro manual — e a régua de 45 min do cron do Monde acusaria atraso
// quase sempre; alerta permanente é ruído). As fontes e a ordem vêm de `carimbosDaPagina`; fonte que não
// carregou não vem, e sem nenhuma o título fica sozinho.

export default function CabecalhoGeral({ carimbos }: { carimbos: readonly CarimboFonte[] }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-text-primary">Geral</h1>
        <p className="mt-0.5 text-sm text-text-subtle">Visão executiva das finanças: recebíveis e inadimplência, prejuízos e antecipações</p>
      </div>

      {carimbos.length > 0 && (
        <div className="flex flex-col items-start gap-y-0.5 text-2xs sm:items-end">
          {carimbos.map(c => (
            <UltimaAtualizacao
              key={c.fonte}
              iso={c.iso}
              prefixo={`${c.fonte} · Última atualização em`}
              iconSize={12}
              vigiarAtraso={false}
            />
          ))}
        </div>
      )}
    </div>
  )
}
