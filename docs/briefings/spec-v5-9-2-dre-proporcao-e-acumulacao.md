# v5.9.2 — Melhorias na página Demonstrativo de Resultado

## Contexto

A v5.8.1 deu à `/financeiro/dre` a estrutura de três seções (Visão Geral, Regime de
Competência, Regime de Caixa) e a ponte que concilia os dois regimes. Três lacunas ficaram:

1. A página mostra **valores**, mas não mostra **estrutura de custo ao longo do tempo** — se RH
   passou de 32% para 39% da receita em dois anos, isso não aparece em lugar nenhum.
2. A "Decomposição da Variação do Resultado" compara YTD 25 × YTD 26, e o Yan quer que ela
   responda outra pergunta: *do fechamento de 2025 até agora, o que aconteceu?*
3. Os dois selos de "Última atualização" vivem dentro dos cards de demonstrativo, cada um numa
   seção diferente — quem quer saber o frescor das bases precisa rolar a página para achá-los.

Patch de UI e leitura: **zero migration, zero RPC nova**, tudo derivado dos payloads que a
página já busca.

## Estado verificado (não presumido)

- Produção na **v5.9.0** (`ccf9300`); a v5.8.1 e o pós-merge dela estão no main.
- **A v5.9.1 está em voo em outra sessão** (o Yan confirmou) — daí o número **v5.9.2**.
- ADRs no main até **0171**; migrations até **0263**.
- ⚠️ **Não reservar ADR novo.** A v5.9.1 irmã pode tomar o `0172`, e na v5.9.0 uma branch irmã
  já passou por cima de uma reserva. O item 2 muda a semântica de uma figura já registrada, e
  isso cabe como **Emenda ao ADR-0171** — sem número novo, sem colisão. (Precedente: "Emenda 1
  do ADR-0169", v5.9.0.)
- A DRE não mudou entre a base da worktree atual e `origin/main` — a leitura de código feita
  aqui vale.

## Decisões tomadas na abertura

### A decomposição vira ACUMULAÇÃO, não diferença

O pedido literal era "2025 cheio × YTD 26". Medido contra a base viva: isso faz **8 dos 15
degraus inverterem de sinal**, porque um lado tem 12 meses e o outro 8. RH apareceria como
**+814.691,75 em barra verde** — mas RH consome 38,9% da receita em 2026 contra 35,4% em 2025,
ou seja está pior. Receita de Vendas apareceria como **−3,52 milhões** em vermelho, com a
receita crescendo.

**Decisão do Yan:** mantém as âncoras que ele quer e troca a OPERAÇÃO dos degraus. Cada degrau
passa a ser *o que aquele grupo fez em 2026*, não a diferença contra 2025. Medido, fecha ao
centavo:

```
ÂNCORA  Resultado de 2025 (fechado)          439.628,52
  RV                                       7.296.378,94
  RH                                      -2.673.767,20
  COM                                     -1.024.541,79
  …
ÂNCORA  Onde estamos (2025 + 2026 jan–ago)   360.193,85     Σ degraus = -79.434,67
```

Nenhum degrau distorcido pelo calendário, e a variação que o card quer mostrar é a soma deles.

### A grade de proporção usa eixo ANUAL

Medidas as duas: a anual sai limpa (RH −32,1% → −35,4% → −38,9%); a mensal vira serrote (abril
de 2026 dá −26% no custo contra média de −4%, por um mês de receita fraca). **Decisão do Yan:
eixo por ano**, 3 pontos, com 2026 marcado como parcial.

---

## Missões

### M1 — Grade de proporção dos grupos (item 1)

- `src/lib/dre/proporcao-grupos.ts` **(novo, puro + teste)** — para cada um dos 7 grupos
  (`CUSTO, ADM, COM, MKT, ESTR, RH, RHB`), a série anual de AV sobre `RB_H`. Reusa
  `folhasPorGrupo` (`lib/dre/folhas.ts`), `avPercentual`/`baseAv`/`CHAVE_BASE_AV` (`lib/dre/av.ts`)
  e `rotuloBloco`+`semCaixaAlta` (`lib/dre/rotulo-bloco.ts`) para os rótulos vivos. Ano fechado
  usa 12 meses; o ano corrente usa a janela da cobertura (`janelaYtdCompetencia`) e vem marcado
  como **parcial** no retorno — quem exibe decide como sinalizar.
- `src/components/financeiro/dre/grade-proporcao.tsx` **(novo)** — `CUSTO` isolado na linha de
  cima (largura cheia), os outros 6 num `grid-cols-3` (2×3), na ordem da árvore. Cada mini-gráfico
  usa os primitivos canônicos (`ChartGrid`, `ChartXAxisCategoria`, `ChartYAxisPct`,
  `CustomTooltip`) — nunca Recharts cru (skill `graficos`).
  - **AV com sinal algébrico** (−32,1%), como a coluna AV da tabela: dois jeitos de mostrar o
    mesmo número na mesma página seria o defeito que a v5.7.2 corrigiu.
  - ⚠️ **`ResponsiveContainer` exige `height` no pai, nunca `min-height`** — a armadilha medida
    na v5.8.1, que some com o gráfico sem erro nenhum.
- Entra na **Visão Geral, abaixo da ponte**.

### M2 — Decomposição vira acumulação (item 2)

- `src/lib/dre/decomposicao-variacao.ts` — `montarDecomposicao` dá lugar a `montarAcumulacao`:
  âncora inicial = REX do ano anterior CHEIO (12 meses); um degrau por folha do ano corrente na
  janela da cobertura, **valor absoluto do grupo, não a diferença**; âncora final = a soma.
  Ordenação por |valor| decrescente e o mesmo piso de agrupamento (`cascata.ts`).
  - A **narrativa por degrau muda de sentido**: deixa de ser "puxado por X (Δ)" e passa a
    nomear a maior conta do grupo no período. `DL` mantém "decisão societária".
  - A função antiga sai — sem consumidor, seria código morto. Testes e o caso de contrato de
    `rpc-contrato.test.ts` acompanham.
- `src/app/financeiro/dre/page.tsx` — título e subtítulo do card refletem a leitura nova
  (algo como "Do fechamento de 2025 até aqui").
- `docs/adr/0171-…md` — **Emenda** registrando a troca e o porquê (o número medido dos 8 sinais
  invertidos é a justificativa, e vale mais que a prosa).

### M3 — Os dois selos de frescor no topo (item 3)

- `src/components/financeiro/dre/tabela-dre.tsx` — o `<UltimaAtualizacao>` sai do
  `CabecalhoCard`, e a prop `ultimaCargaMovimentacao` sai da `TabelaDre` junto (os dois cards da
  DRE são os únicos consumidores, e ambos perdem o selo).
- `src/app/financeiro/dre/page.tsx` — faixa no topo, acima da TopSection "Visão Geral", com os
  dois selos. Reusa `@/components/metas/ultima-atualizacao`, que **já aceita `prefixo`** e já
  devolve `null` sem data:
  ```tsx
  <UltimaAtualizacao iso={compQualquer.carregado_em}  prefixo="Competência · Última atualização em" />
  <UltimaAtualizacao iso={ultimaCargaMovimentacao}    prefixo="Caixa · Última atualização em" />
  ```
  `vigiarAtraso={false}` nos dois, como já era no card — a régua de 45 min é do cron do Monde e
  acusaria atraso quase sempre numa base de cadência humana.

---

## Verificação

- **Gates:** `npx tsc --noEmit` + `npm run lint` por missão; `npm run build` + `npm test` na
  fronteira e no fechamento. Baseline a confirmar no main da v5.9.0 antes de começar.
- **Testes novos:** série anual de AV (ano parcial, base ≤ 0 → sem ponto, grupo ausente);
  aditividade da acumulação ao centavo (`REX_anterior + Σ degraus ≡ acumulado`).
- **Caso de contrato contra a BASE VIVA** (`rpc-contrato.test.ts`): a acumulação fecha ao
  centavo, e as 7 chaves da grade existem na árvore viva de competência — chave renomeada no
  editor deixaria um gráfico vazio em silêncio, que é o mesmo risco que o teste das linhas do
  Resumo Executivo já cobre.
- **Conferência visual** (o modelo que funcionou nas 4 rodadas da v5.8.1): `npm run dev`,
  conferir na tela e ajustar. Pontos de risco: altura/legibilidade dos 7 mini-gráficos com só 3
  pontos, o `CUSTO` esticado em largura cheia, e a cor da linha (`--brand`, série principal única
  pela skill `graficos`).
- **Revisão:** `revisor` ao fim. `revisor-db` **não se aplica** — zero migration/RPC.

## Fronteira (fica fora)

Proporção no regime de CAIXA (a grade é só de competência, como pedido) · mais anos que os 3 da
janela navegável · orçado · qualquer mudança nas tabelas densas.

## Riscos de coordenação

⚠️ **A v5.9.1 corre em paralelo.** Antes de abrir a worktree e de fechar, conferir no `origin`
se ela tocou `src/app/financeiro/dre/page.tsx` — é o arquivo mais provável de colisão, e o
`page.tsx` da DRE tem um `Promise.allSettled` de **índices posicionais** que já custou caro duas
vezes. Nenhuma chamada nova será acrescentada ali nesta versão.
