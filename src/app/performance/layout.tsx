import { PeriodoFilterProvider } from '@/components/layout/period-filter-provider'

export default function PerformanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <PeriodoFilterProvider>
      {/* Título/subtítulo do segmento (v5.1.9) — padrão de formatação das páginas (h1 + sub
          discreto, como Metas/Comparação/Uploads). No LAYOUT: vale p/ as 4 telas (Geral/
          Trips/Weddings/Corporativo) e persiste durante o loading.tsx (sem CLS). */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-zinc-900">Performance dos Setores</h1>
        <p className="mt-0.5 text-sm text-zinc-400">Painel de acompanhamento de indicadores de performance</p>
      </div>
      {children}
    </PeriodoFilterProvider>
  )
}
