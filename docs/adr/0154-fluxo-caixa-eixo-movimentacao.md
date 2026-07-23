# ADR-0154 — Fluxo de Caixa no eixo da MOVIMENTAÇÃO (Onda 1 do modelo da controladoria)

**Status:** Aceito
**Data:** 2026-07-17
**Versão:** v5.2.0

## Contexto

A controladoria construiu um modelo de "DRE por Fluxo de Caixa" (regime de caixa) alimentado por
2 exports diários do Monde — "Lançamentos por movimentação" (o realizado) e "Lançamentos por
vencimento em aberto" (o previsto) — documentado em `docs/referencias/REFERENCIA_DRE_FluxoCaixa.md`
(+ dashboard HTML, objeto `D`). A plataforma absorve esse modelo em 2 ondas. **Onda 1 (esta):
bases novas + reforma da página `/financeiro/fluxo-caixa`. Onda 2: página "DRE Gerencial".** O
sistema de maturação (ledger de fotos) fica FORA (trabalho paralelo da controladoria).

Até aqui, o Fluxo de Caixa da plataforma media o realizado por **data de LIQUIDAÇÃO**
(`financeiro.fato_lancamentos` ← `raw.lancamentos` "por categoria"), com a Abordagem B (ADR-0065)
substituindo o gasto de cartão pela fatura via `raw.fluxo_caixa_titulos`.

## Decisão

**O realizado passa a ser medido pela DATA DE MOVIMENTAÇÃO** (o dia em que o dinheiro entrou/saiu
da conta), não mais pela liquidação. Os números da Visão Geral mudam **por definição, não por bug** —
não há paridade ao centavo a perseguir com o modelo antigo; há **reconciliação explicável** contra o
dashboard da controladoria.

Regras metodológicas preservadas da referência (§3): realizado = movimentação ≤ data-base;
**movimentações com data futura → previsto** (vencimento = movimentação); previsto = títulos em
aberto por vencimento; **corte 31/12/2028** (além dele, bloco meta informativo); **entidades internas
do grupo INCLUÍDAS** (recorte diferente do de vendas — pagamentos e recebimentos); conta de reserva
(XP/`papel='reserva'`) separada do caixa operacional.

### Arquitetura (convivência, não big-bang)
- 2 bases raw novas por upload (full-swap): `raw.lancamentos_movimentacao` (com `data_movimentacao`)
  e `raw.titulos_em_aberto`. Parsers `normalizeHeader`+interseção (o `º` de "Venda Nº" é U+00BA,
  não sai por NFD — normalizar igual dos dois lados).
- **Fato e função NOVOS, não mutação dos antigos:** `financeiro.fato_fluxo` +
  `regenerar_fluxo_caixa()`. `financeiro.fato_lancamentos` e `regenerar_financeiro_lancamentos` (v1)
  ficam INTACTOS (o `seed` usa a v1) até o último consumidor repontar. Foi a escolha que preserva a
  convivência total ("mapa antes do bisturi; convivência antes de morte de base").
- Consumidores repontados por CREATE OR REPLACE (views preservando colunas → as RPCs que as
  consomem seguem sem alteração; os `__nucleo` que liam tabela direto reescritos). O DROP das bases/
  fato/RPCs antigos é **migration destrutiva separada, aplicada por humano em TTY** (o agente não
  aplica destrutiva).

### Abordagem B (cartões) — preservada naturalmente
No eixo movimentação, o lançamento de cartão já vem datado na **data do movimento** (quando a fatura
debitou a conta) — verificado nos dados reais (as movimentações de conta-cartão se agrupam nas datas
de fatura). Logo **some a substituição-fatura via `fluxo_caixa_titulos`** do modelo antigo: basta
somar `fato_fluxo`. Confirmado pela reconciliação (bate com o dashboard da controladoria).

### Repasse = BRUTO (decisão do Yan)
A métrica central "Repasse = Entrada de Clientes − Pagamento ao Fornecedor" é lida **BRUTA** (sem
netar "Reembolso Fornecedor"). A referência (§3.7) sugere a leitura **líquida** (netar o reembolso);
**fica registrada aqui como discussão futura** — na base atual o "Reembolso Fornecedor - C" cresceu
~160% YoY e distorce a margem, então a escolha bruto×líquido é material e deve ser decidida com a
controladoria numa versão dedicada, não embutida silenciosamente.

## Consequências

**Positivas:**
- O Fluxo de Caixa reflete "quando o dinheiro andou", alinhado ao modelo de caixa da controladoria.
- Reconciliação com o dashboard da controladoria bate **ao centavo** no repasse mensal (meses
  fechados); o delta residual é só a diferença de data-base (o pull é diário).
- Abordagem B mais simples (sem UNION de fatura); menos superfície de erro.

**Negativas / trade-offs:**
- Os números da Visão Geral mudam vs a versão anterior — comunicação à diretoria necessária (a
  reconciliação liquidação × movimentação está no out-briefing).
- Comparativos multi-ano (margem do ano anterior no repasse; ranking YTD×YTD-anterior; anual;
  histórico de 24 meses) só populam com o upload de produção com histórico 2024+ (a amostra de
  desenvolvimento é só-2026).
- Convivência temporária de duas famílias de objetos (antigo dormindo, novo vivo) até o DROP.

## Relacionados
- ADR-0065 (Abordagem B, agora natural no eixo movimentação), ADR-0080/0082 (estrutura dual /
  Calendário de Liquidez), ADR-0089 (Fluxo Gerencial — deduplicado da página nesta onda, rota própria
  mantida), ADR-0151 (virada Monde das vendas — mesmo princípio de repoint reversível).
- Migrations 0185–0191. Investigação prévia: relatório Onda 1 (mapa de consumidores + sondas).
