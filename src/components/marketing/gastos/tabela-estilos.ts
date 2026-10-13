// Estilos COMUNS das tabelas da página "Despesas de Marketing" — "Por categoria"
// (`tabela-categorias.tsx`) e "Por fornecedor" (`ranking-fornecedores.tsx`). Uma fonte só: as duas
// tabelas têm de parecer a mesma tabela (a causa-raiz histórica de divergência é cada tela
// reinventar o seu CSS).
//
// CABEÇALHO NO PADRÃO DA DRE (`tabela-dre.tsx`): rótulos em CAIXA ALTA, 10px, `font-semibold`,
// `tracking-[0.09em]`, `text-text-secondary`; fundo `--band` contínuo; alturas `h-[27px]` (linha do
// grupo) e `h-[25px]` (linha das colunas). A skill `tabela-densa` manda cabeçalho em caixa normal e
// sem negrito — a instrução do dono do produto (coerência com a DRE) prevalece nestas tabelas.

/** Largura da 1ª coluna (fixa, presa à esquerda): "Categoria" / "Fornecedor". */
export const LARG_PRIMEIRA = 224
/** Largura de uma coluna de VALOR (mês/total). */
export const LARG_TOTAL = 132
/** Largura (FIXA) da coluna "%" — participação no total do ano; cabe "-100,0%" com folga. Nas duas
 *  tabelas a coluna "Valor"/"Total" fica sem largura e recebe a sobra do card; a "%" nunca estica. */
export const LARG_PCT = 84

/** Linha de BAIXO do cabeçalho (rótulos das colunas). A régua de base é aplicada direto em cada
 *  célula, não por seletor de "última linha" (a 1ª coluna tem `rowSpan`). Padding horizontal igual ao
 *  do corpo (`px-3`) para o rótulo alinhar com os dígitos. */
export const TH = 'h-[25px] whitespace-nowrap px-3 text-right text-[10px] font-semibold uppercase tracking-[0.09em] text-text-secondary border-b-[1.5px] border-b-wt-border-strong'
export const TD = 'py-2 px-3 text-xs border-b border-zinc-50'
export const TD_FOOT = 'px-3 py-2 text-xs font-semibold text-zinc-800'
/** Linha de CIMA do cabeçalho (rótulo do grupo/ano). Altura FIXA (`h-[27px]`, a faixa da linha de grupo
 *  da DRE), sem padding vertical para o chevron (17px) caber sem esticar a linha. A régua fina
 *  (`border-b`) separa a linha de grupo da de colunas SÓ sobre os grupos (a 1ª coluna, com `rowSpan`,
 *  não a tem). Rótulo à direita, como os números da coluna. */
export const TH_GRUPO = 'h-[27px] whitespace-nowrap px-3 text-right text-[10px] font-semibold uppercase tracking-[0.09em] text-text-secondary border-b border-b-wt-border'
/** Régua mais forte na 1ª coluna de cada grupo de ano (atravessa as duas linhas do cabeçalho). */
export const SEP = 'border-l-2 border-l-wt-border-strong'
/** A mesma régua, na BORDA DIREITA da 1ª coluna (sticky): rola junto com ela, então a linha bege
 *  fica sempre ao lado da coluna fixa. Por isso o 1º ano NÃO leva `SEP` — seria uma linha dupla com a
 *  tabela parada. */
export const SEP_CATEGORIA = 'border-r-2 border-r-wt-border-strong'
/** Fundo OPACO da 1ª coluna no corpo e (a coluna de total do ano, na "Por categoria"): impede o que
 *  rola de vazar por baixo. No cabeçalho o fundo é `--band` contínuo (como na DRE). O rodapé precisa do
 *  `!`: `[&_td]:bg-band` do container é mais específico que a classe da célula. */
export const BG_TOTAL_TD = 'bg-band-soft'
export const BG_TOTAL_FOOT = '!bg-band'
