import { SkeletonHeader, SkeletonPagina, SkeletonTabela } from '@/components/shared/skeletons'

// Admin · Log de Ingestão (v6.0.0/M6): header + faixa de alarmes/vigia (silhueta como
// "tabela" curta) + tabela de cargas + tabela de execuções. O respiro (px/py) vem do
// <main> do AppShell.
export default function Loading() {
  return (
    <SkeletonPagina>
      <SkeletonHeader />
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
