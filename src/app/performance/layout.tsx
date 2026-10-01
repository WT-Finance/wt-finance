import { PeriodoFilterProvider } from '@/components/layout/period-filter-provider'

// O título/subtítulo "Performance dos Setores" NÃO mora mais aqui (v6.1.1/M2): precisa
// ficar na MESMA linha do selo "Última atualização em", que vive no conteúdo — ver
// `CabecalhoPerformance` (src/components/performance/cabecalho-performance.tsx), renderizado
// pelo conteúdo, pelo `loading.tsx` e pelo ramo "em construção" do `page.tsx`.
export default function PerformanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <PeriodoFilterProvider>
      {children}
    </PeriodoFilterProvider>
  )
}
