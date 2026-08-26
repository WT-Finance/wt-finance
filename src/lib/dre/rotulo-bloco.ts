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

// ── Caixa alta → capitalização de leitura (v5.8.1) ────────────────────────────
// A árvore mistura duas convenções de caixa, porque `blocoH` (cabeçalho) é gravado em
// CAIXA ALTA e `sub` (subgrupo) em capitalização normal. Numa TABELA isso não incomoda:
// a caixa alta marca o cabeçalho, que é o papel dela. Numa CASCATA, onde blocoH e sub
// viram degraus irmãos, uma linha gritando no meio de quinze normais é ruído — e foi o
// que a conferência do Yan pegou ("IMPOSTOS E DEDUÇÕES DA RECEITA BRUTA" entre
// "Despesas Marketing" e "Custo dos Serviços Prestados").
//
// ⚠️ Por que não `toLowerCase()` + capitalizar tudo, e por que a função SÓ age em
// strings inteiramente maiúsculas: title-case cego mangula sigla — "RH" viraria "Rh",
// "CSLL" viraria "Csll". As duas listas abaixo são o que torna a conversão segura, e a
// guarda de "só se for tudo maiúsculo" garante que um rótulo já capitalizado passe
// intocado (idempotência).

/** Preposições, artigos e conjunções que ficam em minúscula — exceto na 1ª posição. */
const MINUSCULAS = new Set([
  'a', 'ao', 'aos', 'as', 'à', 'às', 'com', 'da', 'das', 'de', 'do', 'dos', 'e',
  'em', 'na', 'nas', 'no', 'nos', 'o', 'os', 'ou', 'para', 'por', 'sem', 'sob', 'sobre',
])

/** Siglas do domínio que permanecem em CAIXA ALTA. Lista explícita de propósito: uma
 *  heurística por tamanho trataria "DA" (preposição) como sigla. */
const SIGLAS = new Set([
  'RH', 'RHB', 'IR', 'CSLL', 'DAS', 'ISS', 'RPA', 'DRE', 'AV', 'IRPJ',
  'PIS', 'COFINS', 'ICMS', 'ISSQN', 'CNPJ', 'CPF', 'NF', 'NFS',
])

/** Uma string está "gritando" se tem letra maiúscula e nenhuma minúscula. */
function todaMaiuscula(s: string): boolean {
  return /\p{Lu}/u.test(s) && !/\p{Ll}/u.test(s)
}

/**
 * Converte um rótulo em CAIXA ALTA para capitalização de leitura, preservando siglas.
 * Rótulo que já tenha qualquer minúscula volta INTOCADO — a função nunca "corrige" o
 * que já está capitalizado, o que a torna idempotente e segura de aplicar em lista mista.
 *
 *   "IMPOSTOS E DEDUÇÕES DA RECEITA BRUTA" → "Impostos e Deduções da Receita Bruta"
 *   "DESPESAS OPERACIONAIS DE RH"          → "Despesas Operacionais de RH"
 *   "Despesas Marketing"                   → "Despesas Marketing"  (intocado)
 */
export function semCaixaAlta(rotulo: string): string {
  if (!todaMaiuscula(rotulo)) return rotulo

  return rotulo
    .split(' ')
    .map((palavra, i) => {
      if (palavra === '') return palavra
      if (SIGLAS.has(palavra)) return palavra

      const min = palavra.toLocaleLowerCase('pt-BR')
      // Preposição no meio da frase fica minúscula; na primeira posição, não.
      if (i > 0 && MINUSCULAS.has(min)) return min

      return min.charAt(0).toLocaleUpperCase('pt-BR') + min.slice(1)
    })
    .join(' ')
}
