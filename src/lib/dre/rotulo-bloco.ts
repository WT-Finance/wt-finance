// Rótulo de EXIBIÇÃO de um bloco da estrutura viva da DRE (v5.3.1).
//
// Os rótulos GRAVADOS no banco carregam um prefixo contábil — mas de forma
// INCONSISTENTE (às vezes parênteses, às vezes solto, às vezes ausente):
//   "(+) ENTRADA DE CLIENTES", "(-) PAGAMENTO AO FORNECEDOR", "(=) SALDO REPASSE",
//   "= LUCRO BRUTO", "Receita de Vendas" (sem prefixo).
// Na Decomposição dos Lançamentos o SINAL já é comunicado pelo lado (Entradas |
// Saídas) e pela cor da barra — repetir o prefixo contábil no rótulo é ruído.
//
// v5.7.0 — o prefixo DUPLO `(+/-)` passou a existir de verdade. Até aqui a classe
// aceitava UM único caractere de sinal dentro dos parênteses, então o
// "(+ / -) OUTRAS RECEITAS E DESPESAS NÃO OPERACIONAIS" já vazava com o prefixo
// inteiro para a Decomposição — defeito silencioso, porque ninguém confere aquele
// rótulo esperando encontrar o prefixo. Com a padronização da v5.7.0 são TRÊS os
// blocos `(+/-)` (`FIN` — o novo Resultado Financeiro —, `INV_H` e `ONOP_H`), e o do
// FIN é linha de manchete. A forma COM ESPAÇOS (`(+ / -)`) segue aceita de propósito:
// é o que esteve gravado até a normalização, e a função tem de limpar o histórico,
// não só o futuro.

/** Prefixo contábil no INÍCIO da string, seguido de espaço: `(+)`, `(-)`, `(−)`,
 *  `(=)`, o par `(+/-)` (com ou sem espaços em volta da barra), ou o símbolo solto
 *  `+`/`-`/`−`/`=`. Nunca casa um `-` no MEIO do texto (ex.: "Movimentação de Caixa
 *  - C") — a âncora `^` garante isso. */
const PREFIXO_CONTABIL = /^(\(\s*[+\-−=](?:\s*\/\s*[+\-−=])?\s*\)|[+\-−=])\s+/

/**
 * Rótulo do bloco para EXIBIÇÃO: remove o prefixo contábil
 * `(+)`/`(-)`/`(=)`/`(+/-)`/`=` (só quando seguido de espaço) e faz `trim()`.
 * Preserva o RESTO intocado — inclusive caixa alta e acentos (nunca title-case:
 * mangularia siglas como "RH"). Idempotente e seguro para string vazia.
 */
export function rotuloBloco(rotulo: string): string {
  return rotulo.replace(PREFIXO_CONTABIL, '').trim()
}
