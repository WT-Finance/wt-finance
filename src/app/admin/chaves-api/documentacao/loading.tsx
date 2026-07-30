import { SkeletonHeader, SkeletonPagina, SkeletonTabela } from '@/components/shared/skeletons'

// Admin · Documentação da API externa: header + pill de volta + sumário +
// blocos de seção (silhueta aproximada — a página real é toda prosa/tabelas
// dentro de Cards, sem KPI/gráfico). O respiro (px/py) vem do <main> do AppShell.
export default function Loading() {
  return (
    <SkeletonPagina>
      <SkeletonHeader />
      <div className="mb-5">
        <SkeletonTabela linhas={3} titulo={false} />
      </div>
      <SkeletonTabela linhas={5} titulo={false} />
      <div className="mt-5 space-y-5">
        <SkeletonTabela linhas={4} />
        <SkeletonTabela linhas={4} />
        <SkeletonTabela linhas={4} />
      </div>
    </SkeletonPagina>
  )
}
