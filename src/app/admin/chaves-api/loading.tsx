import { SkeletonHeader, SkeletonPagina, SkeletonTabela } from '@/components/shared/skeletons'

// Admin · API externa: header + tabela de "Tipos expostos" + tabela de "Chaves
// de API" (duas seções, v5.4.0/Round2 — a página ganhou a seção de tipos
// expostos acima das chaves). O respiro (px/py) vem do <main> do AppShell.
export default function Loading() {
  return (
    <SkeletonPagina>
      <SkeletonHeader />
      <div className="mb-5">
        <SkeletonTabela linhas={4} />
      </div>
      <SkeletonTabela linhas={6} />
    </SkeletonPagina>
  )
}
