import { requireArea } from '@/lib/auth/sessao'
import { carregarEstante } from '@/lib/estante/carregar'
import EstanteContent from '@/components/gestao-pessoas/estante/estante-content'

// Gestão de Pessoas · Estante Welcome (v5.11.0).
//
// DOIS níveis (migration 0271): a página abre com a área de uso OU a de gestão — a de
// gestão inclui a de uso. O que a gestão libera a mais (cadastrar, editar, excluir,
// devolver em nome de outra pessoa) é decidido por `podeGerir`, e o banco é o backstop:
// as RPCs de catálogo exigem a área de gestão por conta própria.
export const dynamic = 'force-dynamic'

export default async function EstantePage() {
  const sessao = await requireArea(['gestao-pessoas/estante', 'gestao-pessoas/estante/gestao'])
  const dados = await carregarEstante()

  return (
    <EstanteContent
      livros={dados.livros}
      movimentacoes={dados.movimentacoes}
      erroDeLeitura={dados.erro}
      podeGerir={sessao.permissoes.includes('gestao-pessoas/estante/gestao')}
      meuId={sessao.userId}
    />
  )
}
