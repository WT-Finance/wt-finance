import { SkeletonPagina, SkeletonHeader, SkeletonTabela } from '@/components/shared/skeletons'

// Cadastro = header + DUAS grades anuais (setores e subsetores de Weddings, v5.4.4) →
// compõe header + duas tabelas no MESMO container da página (px-6), padrão do Acervo
// para layout fora dos templates. (v4.39.0)
//
// A silhueta tem de bater com o que vai aparecer: um skeleton de um quadro só, numa
// página de dois, faz o conteúdo "pular" ao terminar de carregar — que é justamente o
// que o loading.tsx existe para evitar (ADR-0144).
export default function Loading() {
  return (
    <SkeletonPagina>
      <SkeletonHeader />
      <SkeletonTabela linhas={12} />
      <div className="mt-10">
        <SkeletonTabela linhas={12} />
      </div>
    </SkeletonPagina>
  )
}
