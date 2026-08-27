import type { DreLinha, DreBandejaLinha } from './schemas'

// ── Identidade de uma linha do demonstrativo — módulo PURO (v5.8.0) ───────────
//
// A chave que casa a MESMA linha entre payloads de anos diferentes. É o que a visão
// Consolidado usa para montar as colunas de comparação, e casar por chave (e não por
// posição) é o que impede a coluna de escorregar de linha quando a estrutura muda de um
// ano para o outro.
//
// POR QUE ISTO É UM MÓDULO, E NÃO DUAS FUNÇÕES EM DOIS ARQUIVOS: a convenção precisa ser
// idêntica em duas pontas que não se falam — a PÁGINA, que monta os mapas
// (`consolidadoAnos[].porLinha`, `anosSeguintes[].totais`), e a TABELA, que os consulta.
// Enquanto eram duas implementações, a igualdade dependia de ninguém mexer numa sem mexer
// na outra, e o sintoma de divergir é silencioso: a coluna do Consolidado passa a ler o
// valor de OUTRA linha. Foi achado MÉDIO do `revisor` na v5.8.0, e a resposta certa é
// eliminar a duplicação em vez de escrever um teste que a vigie.
//
// As duas espécies de identidade, e por que existem duas:
//   · regime de CAIXA — a folha é uma categoria do banco, e a identidade é
//     `dim_categoria.id` (`categoria_id`);
//   · regime de COMPETÊNCIA — a folha vem de um par de TEXTO do arquivo
//     (`Grupo` + `Descrição`) e não existe categoria nenhuma; a identidade é a `chave`
//     que a RPC emite (`<sub_chave> · <rótulo>`), estável entre anos.
// O prefixo (`b:` para bloco/sub/totalizador, `c:` para folha e bandeja) mantém os dois
// espaços de nome separados.

/** Identidade de uma linha da estrutura (bloco, sub, totalizador ou folha).
 *  `null` só quando a linha não traz identificador nenhum — fail-safe: a coluna de
 *  comparação cai em AUSÊNCIA (travessão) em vez de casar com a linha errada. */
export function chaveDeLinha(l: DreLinha): string | null {
  if (l.t === 'cat') {
    if (l.categoria_id != null) return `c:${l.categoria_id}`
    return l.chave != null ? `c:${l.chave}` : null
  }
  return l.chave != null ? `b:${l.chave}` : null
}

/** Identidade de uma linha da BANDEJA ("Não classificadas"). Nunca devolve `null`: sem
 *  identificador nenhum cai no rótulo, porque a bandeja precisa aparecer de todo jeito —
 *  é literalmente o que ela serve para dizer. */
export function chaveDeBandeja(b: DreBandejaLinha): string {
  if (b.categoria_id != null) return `c:${b.categoria_id}`
  return `c:${b.chave ?? b.rotulo}`
}
