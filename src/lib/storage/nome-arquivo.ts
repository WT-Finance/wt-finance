/**
 * Sanitização do nome de arquivo para uso como CHAVE DE OBJETO no Supabase Storage.
 *
 * Por que existe (v5.4.3): o Storage valida a chave com `isValidKey`, cujo regex aceita
 * `\w` — e `\w` SEM a flag `u` é apenas [A-Za-z0-9_], ASCII puro. Qualquer acento
 * ("João", "Orçamento", "Comissão"), `#`, `%` ou travessão `–` (o que o Word/Excel gera
 * por autocorreção no lugar do hífen) faz o upload voltar `400 InvalidKey`.
 *
 * A falha é DETERMINÍSTICA POR NOME DE ARQUIVO, e é isso que a torna confusa em produção:
 * o mesmo usuário sobe dois anexos sem acento e falha no terceiro só porque o nome tinha
 * um "ã" — parece intermitência, não é. Bug vivo que originou este módulo:
 * "Nota Fiscal - Bruna e João.pdf" em Solicitações.
 *
 * Vale para os dois sistemas operacionais: no macOS o nome chega em NFD (`a` + U+0303) e
 * o combinante também está fora do `\w`.
 *
 * A chave é INTERNA. O nome original é sempre preservado à parte, como metadado
 * (`nome_arquivo`), e é dele que a UI tira o rótulo — sanitizar aqui não é visível
 * ao usuário.
 *
 * Origem: implementação do Acervo (v4.34.0), promovida a compartilhada sem mudança de
 * comportamento. A regra é deliberadamente mais estrita do que o Storage exige (espaço,
 * `(`, `)` e `&` seriam aceitos): uma chave restrita a [a-zA-Z0-9._-] também atravessa
 * URL, shell e S3 sem escape.
 */

// Faixa Unicode dos diacríticos combinantes (U+0300–U+036F), construída via
// String.fromCharCode para nunca depender de caracteres literais no código-fonte.
const DIACRITICOS = new RegExp(`[${String.fromCharCode(0x0300)}-${String.fromCharCode(0x036f)}]`, 'g')

/**
 * Remove acentos (NFD + descarte dos combinantes), troca qualquer caractere fora de
 * [a-zA-Z0-9._-] por '_' e limita o comprimento. Nome vazio → 'arquivo'.
 *
 * ⚠️ O corte em 100 chars pode levar a extensão embora num nome muito longo. É inócuo
 * (o `contentType` vai explícito no upload e o rótulo vem do metadado) e é o
 * comportamento que o Acervo já tinha em produção — preservado de propósito.
 */
export function sanitizarNomeArquivo(nome: string): string {
  const limpo = nome
    .normalize('NFD').replace(DIACRITICOS, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 100)
  return limpo || 'arquivo'
}
