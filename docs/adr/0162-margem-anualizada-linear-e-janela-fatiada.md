# ADR-0162 — Margem anualizada LINEAR e janela do Fluxo de Caixa fatiada no cliente

- **Status:** aceito
- **Data:** 2026-08-03
- **Versão:** v5.4.2 (Weddings — margem anualizada + fluxo de caixa unificado)
- **Contexto:** aba Performance › Weddings — Lista de Operações e Fluxo de Caixa

## Decisão 1 — Margem a.a. é LINEAR, nunca composta

A Lista de Operações mostrava margem absoluta, e comparar operações de ciclos
diferentes por ela distorce a análise: **17,5% em 30,4 meses não valem 17,5% em 12**
(a primeira ocupou dois anos e meio de capacidade para entregar o mesmo percentual).
Entra a coluna **"Margem (a.a.)"**, definida como

```
margem_aa = margem × 12 / duração_em_meses
```

e **nunca** como capitalização composta (`(1+m)^(12/n) − 1`).

**Por que linear.** A leitura é "margem por ano de operação ocupada" — explicável em
uma frase, que é como a gestão de Weddings raciocina sobre capacidade. A composta
pressuporia **reinvestimento do resultado a cada ciclo**, que não é o que acontece
num casamento: o resultado é realizado uma vez, no evento. Uma métrica de gestão que
exige uma nota de rodapé para ser entendida não é usada.

**Duração é o denominador, então a semântica dela passa a valer dinheiro:**

```
duração = data_evento − data_venda_contrato       (dias)
```

exibida em meses de **30,44 dias**. É a MESMA definição que a coluna "Duração" já
usava (`fmtMeses`) e a mesma que o banco usa para ordenar (`d_duracao`). As três
pontas — display da Duração, cálculo da anualização e chave de ordenação em SQL —
dividem pelo mesmo 30,44 **de propósito**; mexer numa exige mexer nas três.

**Ciclo curto é SINAL, não cap.** Anualizar ciclo curto é frágil por construção
(3,9 meses a 32,5% ⇒ 100% a.a.). O valor é exibido **cru** — sem teto, sem
winsorização — e a fragilidade é comunicada pela ajuda "?" do cabeçalho. Capar
silenciosamente esconderia a distorção em vez de sinalizá-la, e um número capado num
demonstrativo financeiro é pior que um número extremo explicado.

**Nulos:** duração ausente, zero ou negativa (evento antes do contrato = dado
inconsistente) e margem não-finita ⇒ **travessão**, nunca `Infinity`/`NaN`.

**Cor:** a mesma regra de faixa da coluna "Margem" (`margemColor`: alvo 14% /
atenção 12%), por decisão do Yan. Consequência conhecida e aceita: a anualização vive
em outra escala, então **79 das 237 operações (33%) mostram banda de cor diferente nas
duas colunas** — 25 vermelhas no a.a. com Margem verde (o efeito pretendido: 17,5% em
30 meses lidos como 6,9% a.a., abaixo do alvo) e 10 no inverso (ciclo curto verde no
a.a. com Margem vermelha). É o "?" do cabeçalho que explica a diferença de escala.

### Ordenação: derivada no cliente, ordenada no servidor

O **valor exibido** é derivado no cliente a partir de números que a lista já
devolvia — nenhum número existente mudou. Mas a lista **pagina no servidor**, e a
whitelist de `ORDER BY` da RPC termina em `ELSE 'd_data_evento'`: um **fallback
silencioso**. Ordenar a coluna só no cliente reordenaria apenas as 10 linhas visíveis
enquanto o cabeçalho anuncia ordenação global, e pedir `margem_aa` sem tocar o SQL
ordenaria por data do evento **sem avisar**.

Por isso a migration **0228** (aditiva) acrescenta a chave `d_margem_aa` à CTE `base`
e à whitelist, usando **a mesma expressão** de `d_margem_liquida` no numerador
(inclusive o `ROUND` para 1 casa e o `ELSE 0` de faturamento zero). Se as duas
fórmulas divergirem, a lista ordena por um número diferente do que exibe — é o tipo
de defeito que nenhum gate pega. `d_margem_aa` **não entra no payload**: é chave de
ordenação interna, então nenhum schema Zod muda.

## Decisão 2 — Janela larga buscada uma vez, fatiada no cliente

Os dois gráficos separados (mensal e acumulado) viraram **um card único** com um
**slider de janela entre eles**, funcionando como eixo de tempo compartilhado: os dois
obedecem sempre à mesma janela.

**A RPC devolve uma janela larga (37 meses atrás + 36 à frente) uma única vez e o
cliente fatia.** Arrastar o slider não refetcha nada — é instantâneo. Isso **não
exigiu migration**: a janela sempre foi parâmetro do chamador, e
`get_acumulado_weddings` já a clampava em 120 atrás / 60 à frente (migration 0141) —
o briefing supunha que precisaria alargar a RPC. Custo medido do payload:
**3,9 KB → 6,6 KB**.

**Limite do slider: 36 meses em cada direção** (decisão do Yan). O lado do passado
busca **um mês a mais** que o limite: esse mês extra é a margem técnica do rebase (ver
abaixo) e **não é uma posição alcançável** pelo slider — com isso os limites caem
exatamente em 36/36 sem clamp adicional.

### O acumulado REINICIA na borda esquerda da janela

A RPC acumula desde o início da janela larga. Exibida crua, uma janela estreita já
chegaria "cheia" de história anterior e a leitura viraria outra coisa. Então todo
elemento acumulado é rebaseado na borda:

```
valor_rebaseado[i] = acum[i] − acum[esquerda − 1]
```

Vale para entradas acumuladas, saídas acumuladas **e** a referência de saídas —
**juntos, nunca um sem o outro**: com o acumulado reiniciando, uma referência absoluta
sairia de escala e achataria o gráfico. A referência passa a ser o total previsto
**dentro da janela**, com rótulo explícito ("…na janela"). O invariante que amarra as
duas coisas é testado: `totalSaidasJanela` tem de ser igual ao acumulado de saídas do
último mês visível; se um for rebaseado sem o outro, a igualdade quebra.

Medição que justifica a escolha: o `total_saidas` da própria RPC **muda com a janela
buscada** (R$ 50,5 Mi em 24+18 → R$ 63,7 Mi em 48+36) — usar o campo da RPC como
referência faria o benchmark inflar junto com uma decisão puramente técnica de fetch.

### Efeito colateral: um defeito latente corrigido

O gráfico mensal antigo derivava o valor do mês pela diferença de acumulados e usava
`prev = {0,0}` no índice 0 — a **primeira barra visível absorvia silenciosamente toda
a história anterior à janela**. A margem de um mês reservada pelo rebase elimina isso:
todo mês visível tem um mês anterior real de onde derivar.

## Alternativas descartadas

- **Anualização composta** — pressupõe reinvestimento que não existe no negócio e
  exige explicação; ver Decisão 1.
- **Capar a a.a. de ciclos curtos** — esconderia a distorção; sinal > cap.
- **Ordenar a Margem (a.a.) só no cliente** — reordenaria apenas a página visível
  numa lista paginada no servidor, mentindo sobre ser ordenação global.
- **Refetch a cada arrasto do slider** — a RPC roda como `authenticated` (orçamento de
  8s) e o arraste emite eventos contínuos; fatiar no cliente é instantâneo e não gera
  carga.
- **Controle de duas alças (range slider) num só trilho** — dois inputs
  independentes seguem o eixo (passado à esquerda, futuro à direita) e ganham
  teclado/leitor de tela sem trabalho extra.
- **Totais recortados pela janela** — "Total a receber/a pagar" é **compromisso
  total**, não recorte de tempo; a RPC já os calcula sem filtro de data e foi medido:
  idênticos em janelas diferentes.

## Consequências

- A Lista de Operações passa a ter 10 colunas; "Operação / Casal" → "Operação" e
  "Resultado Previsto" → "Resultado Prev." cedem largura. O Exportar leva a coluna
  nova como **número cru**, para a planilha poder somar e refazer a conta.
- A fórmula é uma **definição de métrica**, então vive em módulo próprio e testável
  (`src/lib/weddings/margem-anualizada.ts`, 24 testes de fronteira) — não inline no
  componente. O vitest só coleta `src/**/*.test.ts`, nunca `.tsx`.
- A matemática da janela vive em `src/lib/weddings/janela-fluxo.ts` (25 testes).
- Weddings ganha uma TopSection própria "Fluxo de Caixa"; o filtro por operação sobe
  para o topo dela, porque vale para os dois cards e não pertence ao cabeçalho de um
  gráfico.
- O slider de horizonte virou o primitivo compartilhado
  `src/components/shared/slider-horizonte.tsx`, com a geometria do slider do Fluxo de
  Caixa do Financeiro (trilho neutro, régua de riscos, `posTick` compensando a
  meia-largura do thumb). `financeiro/posicao-projetado.tsx` pode migrar para ele
  quando aquela tela for tocada.
