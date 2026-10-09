// Coluna "Total" de cada ano EXPANDIDO presa à borda direita da área visível (v6.3.0).
//
// `position: sticky; right: 0` não serve: o sticky de célula de tabela é limitado pela TABELA, não
// pelo grupo do ano — todos os totais se empilhariam na borda. Em vez disso o componente mede a
// rolagem e desloca (`translateX`) só a coluna de total do grupo que está sob a borda direita. Este
// módulo é a matemática PURA dessa decisão: dado o scroll e as faixas dos grupos expandidos, diz
// QUAL grupo prende e QUANTO a coluna dele se desloca.
//
// Coordenadas = as do CONTEÚDO da tabela (x = 0 na borda esquerda da tabela, antes da rolagem).
//
// Modelo, com R = scrollLeft + larguraVisivel (a borda direita visível, em coordenadas do conteúdo):
//   - o grupo [inicio, fim] prende quando inicio < R < fim (estritamente);
//   - a coluna de total fica NATURALMENTE em [fim − larguraTotal, fim]; presa, a borda direita dela
//     vai para R, mas a borda ESQUERDA nunca passa do início do grupo (senão cobriria o grupo vizinho:
//     logo depois da troca, R − larguraTotal ainda cairia dentro do total do ano anterior);
//   - deslocamento = esquerdaPresa − esquerdaNatural  (≤ 0; 0 = solta, na posição natural).
// Continuidade: em R = fim o deslocamento é 0 (solta sem salto); em R = inicio a coluna presa fica
// toda À DIREITA de R (fora da área visível), então entrar/sair do grupo não "teletransporta" nada
// visível. Em cada instante no máximo UM grupo prende (os grupos expandidos não se sobrepõem).

export interface GrupoAno {
  ano: number
  /** x da borda esquerda do grupo (a 1ª coluna de mês). */
  inicio: number
  /** x da borda direita do grupo = borda direita natural da coluna de total. */
  fim: number
  larguraTotal: number
}

export interface TotalPreso {
  ano: number
  /** px (≤ 0) a aplicar em `translateX` nas células de total deste ano. */
  deslocamento: number
}

export interface EntradaTotalPreso {
  scrollLeft: number
  /** Largura visível do viewport (clientWidth). */
  larguraVisivel: number
  /** Largura da coluna "Categoria" (sticky à esquerda): a área útil é o que sobra dela. */
  larguraEsquerda: number
  /** Apenas os grupos EXPANDIDOS (ano recolhido não prende nada). */
  grupos: readonly GrupoAno[]
}

export function totalPreso({ scrollLeft, larguraVisivel, larguraEsquerda, grupos }: EntradaTotalPreso): TotalPreso | null {
  // Sem área útil à direita da "Categoria" não há onde prender (a coluna da esquerda vence).
  if (larguraVisivel - larguraEsquerda <= 0) return null
  const borda = scrollLeft + larguraVisivel
  for (const g of grupos) {
    if (!(borda > g.inicio && borda < g.fim)) continue
    const esquerdaNatural = g.fim - g.larguraTotal
    const esquerdaPresa = Math.max(borda - g.larguraTotal, g.inicio)
    const deslocamento = esquerdaPresa - esquerdaNatural
    // Grupo sem meses (inicio = esquerdaNatural) ou nada a deslocar: sem efeito.
    return deslocamento < 0 ? { ano: g.ano, deslocamento } : null
  }
  return null
}
