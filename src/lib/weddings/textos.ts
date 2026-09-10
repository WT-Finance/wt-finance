// Nota teórica do float (v5.5.0) — CONSTANTE ÚNICA. Obrigatória nos TRÊS pontos de
// UI que exibem o Rendimento potencial do float: coluna/tooltip da Lista de
// Operações, drawer de detalhe e Margem Potencial (invariante 2 da v5.5.0/ADR-0166).
// Antes desta constante, o texto vivia duplicado em cada ponto — divergência
// silenciosa de copy é o mesmo defeito de "dois números vizinhos discordando",
// só que em texto em vez de número.
export const FRASE_NAO_APLICACAO_REAL = 'não representa aplicação real'
export const NOTA_FLOAT_TEORICO = `Rendimento teórico a 100% do CDI · ${FRASE_NAO_APLICACAO_REAL}`
