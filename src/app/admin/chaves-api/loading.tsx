import { SkeletonHeader, SkeletonPagina, SkeletonTabela } from '@/components/shared/skeletons'

// Admin · API externa: header + tabela de "Chaves de API" + tabela de "Tipos
// Expostos" (duas seções, v5.4.0/Round2 — a página ganhou a seção de tipos
// expostos; Round4 trocou a ORDEM: "Chaves de API" vem primeiro). O respiro
// (px/py) vem do <main> do AppShell.
export default function Loading() {
  return (
    <SkeletonPagina>
      <SkeletonHeader />
      <div className="mb-5">
        <SkeletonTabela linhas={6} />
      </div>
      <SkeletonTabela linhas={4} />
    </SkeletonPagina>
  )
}
