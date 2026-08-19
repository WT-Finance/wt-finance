# ADR-0168 — DRE: Resultado Financeiro unificado e Imobilizado abaixo da linha

- **Status:** aceito
- **Data:** 2026-08-19
- **Versão:** v5.7.0 (DRE: reestruturação, rótulos padronizados e Análise Vertical)
- **Contexto:** estrutura viva da DRE por Fluxo de Caixa (`financeiro.dre_bloco` e
  `financeiro.dre_categoria_map`, ADR-0156, migrations `0204`/`0205`). Migration `0251`
  (destrutiva, aplicada em 19/08 pelo Yan em TTY). Decisão de produto tomada com a gerente
  de controladoria.

## O problema

O demonstrativo tratava duas coisas de um jeito que a leitura gerencial não sustenta.

**As receitas financeiras viviam separadas das despesas financeiras.** `FIN` ("Despesas
Financeiras") e `RFIN` ("Receitas e Rendimentos Financeiros") eram dois subgrupos distintos
dentro das despesas operacionais. Ninguém lê despesa financeira sem o rendimento que a
compensa: a pergunta é sempre "quanto o financeiro custou, líquido". Com os dois separados,
responder exigia somar duas linhas de cabeça — e a linha de despesa isolada sempre parecia
pior do que é.

**O imobilizado rebaixava o resultado operacional.** `IMOB` (Máquinas e Equipamentos, Móveis
e Utensílios, Reforma) somava dentro de "(-) DESPESAS", logo dentro do Lucro Operacional.
Comprar uma mesa piorava a margem operacional do mês exatamente como piorava pagar aluguel —
e as duas coisas não são a mesma. Capex é decisão de investimento, não custo de operar; num
ano de obra a operação parecia ruim sem ter ficado ruim.

O efeito colateral era o de sempre com indicador mal posicionado: **o número certo levava à
conversa errada.**

## Decisão 1 — `FIN` absorve `RFIN` e vira "(+/-) Resultado Financeiro"

As 3 categorias de `RFIN` (Acréscimos Cobrados, Aplicações e Investimentos C, Desconto
Obtido) passam para o bloco `FIN`, que é renomeado. O bloco `RFIN` é removido.

A **chave** `FIN` é preservada de propósito: ela é âncora de fórmula, e trocá-la obrigaria a
reescrever `DESP_H` e `LOP` por um motivo cosmético.

**A fusão é neutra por construção.** `FIN` e `RFIN` já estavam **ambos** nas listas de
`DESP_H` e de `LOP` — trocar dois somandos por um só não move subtotal nenhum. Isso não é
detalhe de implementação: é o que permite fazer a fusão e a descida do imobilizado na MESMA
migration sem embaralhar as duas causas na hora de conferir.

## Decisão 2 — `IMOB` desce para o grupo de investimentos

`IMOB` sai das fórmulas de `DESP_H` e de `LOP` e entra nas de `INV_H` e `RAIR`, como
**subgrupo próprio** — as categorias NÃO são dissolvidas dentro de `INV`. Manter o subgrupo
preserva a leitura "quanto foi imobilizado" separada de "quanto foi empréstimo", que é a
razão de o bloco existir.

O cabeçalho `INV_H` passa a se chamar **"(+/-) INVESTIMENTOS, IMOBILIZADO E EMPRÉSTIMOS"**.
O prefixo `(+/-)` e não `(-)` é decisão explícita: hoje o bloco só tem amortização, mas em
ano de captação ele pode fechar positivo, e o rótulo já nasce à prova disso.

**As duas listas mudam juntas.** `DESP_H` (o cabeçalho de despesas) e `LOP` (o totalizador)
enumeram os mesmos subgrupos **cada um por conta própria** — uma assimetria herdada do struct
da controladoria, em que `LOP` não consome `DESP_H`. Remover `IMOB` de uma só faria o
cabeçalho contradizer o totalizador logo abaixo dele.

## Decisão 3 — o prefixo é o PAPEL da linha, não o sinal do valor

Regra de uma frase: **cabeçalho, subgrupo e totalizador carregam operador**
(`(+)` `(-)` `(+/-)` `(=)`); **categoria-folha nunca carrega.** O sinal de uma folha é do
VALOR (parênteses na célula), não do rótulo — repetido no texto ele vira ruído que ainda por
cima **mente** quando o valor daquele período sai com o sinal contrário (um "(-) Reembolso
GymPass" que num mês entra positivo).

Foi o que a migration aplicou: os 5 totalizadores com `=` solto entraram na fôrma `(=)`, o
`ONOP_H` teve o `(+ / -)` normalizado, os 14 subgrupos ganharam operador pelo papel dominante
e **12** overrides de categoria perderam o prefixo `(-)` (o briefing dizia 18; os outros 6 são
overrides de capitalização e ficam).

A regra é vigiada por **guarda mecânica nas duas direções**, em `rpc-contrato.test.ts`, lendo
o estado VIVO por REST. Só a primeira direção deixaria passar exatamente o defeito que a
versão veio corrigir.

## Por que o resultado não muda um centavo

Em forma fechada, sendo `X'` o valor depois:

```
FIN'   = FIN + RFIN
DESP_H'= DESP_H − IMOB          LOP' = LOP − IMOB          LL' = LL − IMOB
INV_H' = INV_H + IMOB
RAIR'  = LL' + INV + IMOB = (LL − IMOB) + INV + IMOB = RAIR
REX'   = RAIR' + DIST_LUCROS    = REX
```

O imobilizado **muda de lugar dentro da mesma soma**. Ele sai de cima da linha e entra
embaixo dela, e a linha de baixo — o Resultado do Exercício — é indiferente à ordem das
parcelas.

Medido em produção por REST, comparando um retrato tirado imediatamente antes da aplicação
com outro tirado depois (`scripts/dre-oracle.mjs`), **ΔRAIR = ΔREX = 0,00 nos três anos**.

## Consequências

**A mudança é RETROATIVA a todos os anos exibidos.** A estrutura é dado lido a cada consulta,
não um reprocessamento: no instante em que a migration entrou, 2024 e 2025 passaram a ser
apresentados pelo critério novo. Isso é desejável (comparabilidade), mas significa que
qualquer material impresso antes de 19/08/2026 mostra o critério antigo.

**O Lucro Operacional MELHORA em todos os anos** — o imobilizado é despesa, então tirá-lo de
cima da linha sobe o resultado operacional na exata medida dele:

| ano | IMOB | LOP antes → depois | AV do LOP | LL antes → depois | RAIR | REX |
|---|---|---|---|---|---|---|
| 2024 | (20.912,64) | 1.345.435,68 → **1.366.348,32** | 15,9% → 16,2% | 1.355.528,57 → 1.376.441,21 | 1.166.913,02 → **=** | 293.853,61 → **=** |
| 2025 | (99.342,56) | 692.722,91 → **792.065,47** | 6,9% → 7,9% | 1.205.386,08 → 1.304.728,64 | 993.514,58 → **=** | 248.434,54 → **=** |
| 2026\* | (236.572,23) | (1.538.932,99) → **(1.302.360,76)** | −21,0% → −17,8% | (1.454.120,71) → (1.217.548,48) | (1.703.591,25) → **=** | (2.496.722,68) → **=** |

\* 2026 é o ano corrente: o total inclui previsto e anda todo dia. Para comunicar o critério à
liderança, use **2024 e 2025**, que são estáveis.

**O par "Aplicações e Investimentos C/D" passou a conviver no bloco `FIN`.** É consequência da
fusão (o "C" vinha de `RFIN` e o "D" já estava em `FIN`), não a re-parentagem deliberada do
par — essa segue aguardando a conversa com a gerente.

**A `ordem` do `IMOB` é 265, não 245.** "Entre LL e RAIR" lido ao pé da letra o colocaria
ACIMA do cabeçalho `INV_H` (250) que passa a agregá-lo. A `ordem` não afeta o cálculo destes
dois blocos — eles somam categorias e são materializados antes do passe das fórmulas —, mas
manda na renderização.

**⚠️ O "desfazer em lote" do painel da estrutura NÃO reverte esta migration.** O header da
`0251` afirma que sim; está errado, e o achado é do `revisor-db` no fechamento.
`financeiro.reverter_diario` (`0206`) pressupõe **no máximo um toque por linha por lote** —
premissa verdadeira no fluxo normal do editor (`dre_estrutura_salvar` faz um upsert por
`categoria_id` distinto) e violada aqui: cinco blocos (`LOP`, `INV_H`, `RAIR`, `FIN`, `IMOB`)
são tocados DUAS vezes na mesma transação (fórmula/ordem no passo 2–3, rótulo no passo 4), sob
o mesmo `lote_id`. Como a reversão processa `ORDER BY id` ASC, a entrada mais antiga de cada
uma dessas chaves guarda um estado INTERMEDIÁRIO que não corresponde ao estado atual da linha,
e a checagem de conflito aborta a transação inteira **sem reverter nada**.

O dado continua recuperável — o diário capturou `dados_antes` de tudo, inclusive da linha
`RFIN` deletada, e `reverter_diario` reinsere em `operacao='D'` —, mas só entrada por entrada
(`dre_estrutura_desfazer_linha`, em ordem DESC estrita de `id`, ~40 chamadas) ou por migration
corretiva. **Nunca pelo clique único.** Corrigir `reverter_diario` para processar em DESC e
comparar contra o estado seguinte da própria cadeia é débito técnico registrado, fora do
escopo desta versão.

## Alternativa descartada — dissolver `IMOB` dentro de `INV`

Mais simples de escrever (uma fórmula a menos) e pior de ler: perderia a distinção entre
imobilizado e empréstimo dentro do bloco de investimentos, que é justamente a informação que
faz o bloco valer. Subgrupo próprio custa uma chave e preserva a leitura.

## Alternativa descartada — ensaiar a migration numa transação revertida

O briefing previa ensaiar em transação com `ROLLBACK` contra produção antes de entregar. Não
foi necessário: a transformação é **fechada em álgebra**, então o oracle pôde ser provado no
papel e **medido read-only** (um `get_dre_mensal` por ano, via REST) antes de qualquer SQL ser
escrito. Ensaio que escreve em produção — ainda que revertido — é risco sem retorno quando a
mesma garantia sai de uma leitura.

## Ver também

- ADR-0156 — estrutura viva da DRE (fórmulas por chave, grafo, undo generalizado)
- `supabase/migrations/0251_dre_reestruturacao_resultado_financeiro.sql` — o que foi aplicado,
  com a reconciliação fail-closed
- `scripts/dre-oracle.mjs` — captura antes/depois e reprova se RAIR ou REX moverem
