import { SkeletonHeader, SkeletonPagina, SkeletonTabela, SkeletonGrafico } from '@/components/shared/skeletons'

// Admin · Log de Ingestão (v6.0.0/M6): header + cartão Sincronização Monde (v6.1.1) + faixa de
// alarmes/vigia (silhueta como "tabela" curta) + tabela de cargas + tabela de execuções. O
// respiro (px/py) vem do <main> do AppShell.
// ⚠️ Este loading.tsx também envolve o segmento filho /admin/ingestao/upload — o Upload tem o
// seu próprio (upload/loading.tsx), senão ele mostraria esta silhueta.
export default function Loading() {
  return (
    <SkeletonPagina>
      <SkeletonHeader />
      <div className="mb-5">
        <SkeletonGrafico altura="h-16" />
      </div>
      <div className="mb-5">
        <SkeletonTabela linhas={3} />
      </div>
      <div className="mb-5">
        <SkeletonTabela linhas={8} />
      </div>
      <SkeletonTabela linhas={6} />
    </SkeletonPagina>
  )
}
