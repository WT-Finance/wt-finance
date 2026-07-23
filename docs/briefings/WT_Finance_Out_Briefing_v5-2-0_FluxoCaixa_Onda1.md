# Out-Briefing — v5.2.0 · Fluxo de Caixa · Onda 1

**Data:** 2026-07-17 · **Branch:** `feat/v5-2-0-fluxo-caixa-onda1` · **Base:** main @ v5.1.11
**Tipo:** MINOR (abre o arco do Fluxo de Caixa). **Migrations:** 0185–0192. **ADR:** 0154.

## Objetivo
Absorver a **Onda 1** do modelo "DRE por Fluxo de Caixa" da controladoria: o realizado muda de eixo
(**liquidação → data de MOVIMENTAÇÃO**) e a página `/financeiro/fluxo-caixa` é reformada (Projetado/
Realizado). Cirurgia por etapas, convivência antes de morte de base. **Os números da Visão Geral mudam
por definição, não por bug** — reconciliação explicável, não paridade.

## Missões implementadas

| Missão | Entrega | Commit |
|---|---|---|
| M1 | Bases `raw.lancamentos_movimentacao` + `raw.titulos_em_aberto` + parsers (normalizeHeader) + 2 cards de upload (substituem os antigos) | 409d99a |
| M2 | `financeiro.fato_fluxo` + `regenerar_fluxo_caixa()` — roteamento realizado/previsto/futuras→previsto/corte 2028 (tabela/função NOVAS; v1 intacta = convivência) | 1a86a11 |
| M3 | Repoint de 5 views + 5 RPCs `__nucleo` para `fato_fluxo` (Abordagem B natural; kpis_diario completo) | 825795c |
| M4/M5 backend | RPCs novas: `get_repasse_mensal`/`get_fluxo_horizonte`/`get_fluxo_runway_semanal`/`get_fluxo_ranking` + `gerencial_saldos.data_saldo` | 9ca1485 |
| M4/M5 frontend | Página Projetado/Realizado + 5 componentes novos + dedupe Gerencial + saldo por data/staleness + ADR-0154 | b481b30 |
| M6 | Aposentadoria (seed→bases novas, remoção de código morto) + 0192 DROP (destrutiva, Yan aplica) + versão/changelogs/out-briefing | (este) |

## Migrations
- **0185/0186** (M1, aditivas, aplicadas): bases raw novas + RPCs de upload (service_role).
- **0187** (M2, aditiva, aplicada): `fato_fluxo` + `regenerar_fluxo_caixa()`.
- **0188** (M3, aditiva, aplicada): repoint dos consumidores (CREATE OR REPLACE de views/RPCs).
- **0189** (M5, aditiva, aplicada): `gerencial_saldos.data_saldo` + `get_gerencial_saldos()` engordada + overload `update_gerencial_saldo(_,_,data)`.
- **0190** (M4, aditiva, aplicada): 4 RPCs novas + índice `(tipo,vencimento)`.
- **0191** (M4, aditiva, aplicada): horizonte "resto do ano" = futuro (parqueia vencidos).
- **0192** (M6, DESTRUTIVA): DROP das bases/RPCs antigas. ⚠️ **Aplicada — ACEITO pelo Yan.** (Foi
  aplicada sem intenção junto de 0193 via `db:migrate --aditiva` — `db push` empurra todo o pending;
  backup pré-push em `~/wt-finance-backups/2026-07-17-pre-migration-181849/`. O DROP era o end-state
  planejado e a Onda 1 está validada ao centavo, então o Yan aceitou. Lição durável: nunca deixar uma
  migration destrutiva pendente na pasta ao rodar `--aditiva`.)
- **0193** (M4 fix): `get_fluxo_runway_semanal` — bug `column t.idx` no ORDER BY (pego pelo contrato RPC).

## ADR
- **ADR-0154** — Fluxo de Caixa no eixo da movimentação: fato_fluxo (convivência/tabela nova),
  Abordagem B natural, repasse BRUTO (discussão líquida registrada), internas incluídas, dedupe Gerencial.

## Reconciliação (liquidação × movimentação) — o essencial p/ a diretoria
Contra o dashboard da controladoria (objeto `D`, base 15/07/2026), meu `fato_fluxo` (base 17/07):
- **Repasse mensal BRUTO bate AO CENTAVO** nos meses fechados: Jan 220.882,78 · Fev 939.731,05 · Mar
  −249.484,16 · Abr −1.973.357,27 · Mai −178.839,30 (idênticos a D). Jun/Jul divergem só pelos ~2 dias
  de data-base (o modelo é diário).
- Entrada de Clientes YTD 17.79M (D 17.61M) e Pagamento ao Fornecedor −17.70M (D −17.69M) — delta ~1%,
  = os 2 dias a mais de movimentação (17/07 vs 15/07). **É a diferença de data-base, não bug.**
- Horizonte "Resto de 2026" (futuro) −2,85M ≈ D −2,92M; 2027/2028/pós-2028 dentro de ~2%.
- Roteamento provado: realizado 21.866 / futuras→previsto 16 / em_aberto 37.257 / pós-corte 13.707.

**Amostra é SÓ-2026** — os comparativos multi-ano (margem do ano anterior no repasse; ranking YTD×YTD;
histórico de 24 meses; anual 2024/2025) só populam com o **upload de produção com histórico 2024+**. As
RPCs estão corretas para o histórico completo.

## Parecer da revisão
- **revisor-db** (por migration, antes de cada aplicação): 0185/0186 aprovadas (só MÉDIO: NOTIFY +
  índice liquidação — endereçados). 0187 — ALTO (dedup de dim_categoria multi-fonte) + 2 MÉDIO
  endereçados. 0188 — CRÍTICO (`get_fluxo_caixa_kpis_diario` com fonte mista) + ALTO/MÉDIO (pos_corte
  em decomposição/próximos) endereçados. 0189/0190 — 2 ALTO (0189 editava função morta; runway
  parqueando vencidos silenciosamente) + MÉDIOs endereçados. **Nenhum CRÍTICO/ALTO pendente.**
- **revisor (contexto)**: pendente — rodar sobre o conjunto final antes do checkpoint (registrado abaixo).

## Pendências / follow-ups (registrados, não implementados)
- **Cobertura em `rpc-contrato.test.ts`** das 4 RPCs novas (schemas vivem em `src/lib/fluxo/rpc-fluxo.ts`,
  não no `schemas-rpc.ts` central) — as RPCs são gated (exigir_acesso), então o teste de contrato precisaria
  de contexto autenticado.
- **`src/types/api.ts` `GerencialSaldo`** — interface órfã e defasada (sem `data_saldo`/`papel`/…); não usada.
- **Duplicação** de `rotuloStaleness`/`diasDesde` entre `saldo-caixa-kpi.tsx` e `contas-cards.tsx` — candidata a helper compartilhado.
- **Próximos Lançamentos (lista lateral)** saiu da página (a grade Projetado é Calendário | Runway, per mockup) — confirmar no checkpoint se a lista deve voltar em algum lugar.
- **Onda 2:** página "DRE Gerencial" (struct de 159 linhas como seed). **Parqueados:** vencidos em aberto, aderência/qualidade da previsão, maturação/ledger, leitura líquida do repasse, aposentar `gerencial_lancamentos`, parser comendo o formato cru do Monde.

## Ajustes do checkpoint (round 2, pré-merge — pedidos do Yan)
1. Subtítulo "Baseado em lançamentos…" removido da barra do Fluxo Projetado.
2. **Saldo de Caixa desconectado do Gerencial:** tabela própria `financeiro.saldo_caixa` (migration
   **0194**, seed one-time copiando as contas; `papel`→flag `reserva` com COALESCE — achado CRÍTICO
   do revisor-db endereçado) + RPCs `get_saldo_caixa`/`atualizar_saldo_caixa`; o modal do drill virou
   EDITÁVEL (saldo + data por conta, otimista + router.refresh). Runway repontado à tabela nova.
   `analytics.gerencial_saldos` e a rota Gerencial seguem intactos. (Sem CRUD de conta nova na tabela
   própria — follow-up se precisar.)
3. Runway despoluído (sem "13 semanas"/saldo/nota; rótulos do eixo X na diagonal, menores —
   `ChartXAxisCategoria` ganhou opts `angle/fontSize/height` aditivos).
4. **Horizonte Previsto v2** (RPC reescrita na 0194): 12 meses ROLANTES em calendário (mês passado →
   mesmo mês do ano seguinte, em CINZA neutro; mês corrente = resto, com *; meses futuros do ano em
   verde/vermelho pelo sinal) + anos consolidados **sem dupla contagem** (2027* = só jul–dez, já que
   jan–jun/27 estão nas colunas; 2028 cheio) — decisão técnica anti-dupla-contagem, sinalizada ao Yan.
5. Repasse Mensal → gráfico de LINHA (ano corrente sólido + anterior tracejado + mês negativo em
   vermelho, labels nos pontos) com o indicador (saldo bruto do ano) à esquerda no mesmo box.
6. Ranking de Caixa com a hierarquia do modelo: 2 cards (atenção/positivo), prioridades 1–5, formato
   contábil (parênteses), chips gasto/receita, YTD×YTD.
Gates re-rodados verdes (tsc/lint/**445 testes**/build); contrato cobre get_saldo_caixa + invariante
12 meses/2 anos do horizonte.

## Ajustes do checkpoint (round 3 e round 4, pré-merge — pedidos do Yan)
**Round 3:** (1) Horizonte com escala Y SIMÉTRICA (zero centralizado, ±R$ 8 Mi com os dados atuais),
barras mais largas/arredondadas e divisor tracejado antes dos anos consolidados; (2) Ranking de Caixa
repensado por inteiro — layout ADAPTATIVO que esconde as colunas ano-anterior/Δ quando não há base
comparável (amostra só-2026), prioridade 1–5 só no card "Pioraram", contábil, chips gasto/receita.

**Round 4 — arredondamento de barras (correção PLATAFORMA-WIDE, commit `02082a2`):** quando uma barra
aponta PARA BAIXO (valor negativo, abaixo do eixo x), o canto arredondado ficava na ponta encostada no
eixo, não na ponta livre. Causa: o Recharts passa ao `Rectangle` `height` ASSINADO (negativo na barra
que desce) e o `ySign` de `getRectanglePath` inverte, fazendo os índices `[0,1]` do raio grudarem SEMPRE
na ponta do valor (a livre) e `[2,3]` no eixo — logo `[r,r,0,0]` arredonda a ponta livre nos DOIS
sentidos e `[0,0,r,r]` pega o eixo (o bug). Provado empiricamente reproduzindo `getRectanglePath`.
Corrigidos os 5 gráficos com barra que desce + o tema: `chart-theme.ts` (convenção documentada em
`barRadius.top`/`.bottom`), `chart-showcase` (ref do DS), `runway-semanal` (pagVal), `horizonte-previsto`
(`radiusDe`→`RAIO_LIVRE`), `fluxo-mensal-chart` e `weddings/fluxo-caixa-mensal` (botão "Inverter saídas":
`saidaRadius` deixou de alternar e virou constante `[2,2,0,0]`, correto nos 2 estados). Gráficos com
`[2,2,0,0]` uniforme (acumulados, histórico-12m, mix horizontal, stack do drawer) já estavam certos —
`[2,2,0,0]` é o raio universal da ponta livre. **revisor de contexto APROVADO** (confirmou a geometria e
a completude; nenhum CRÍTICO/ALTO/MÉDIO). Gates verdes (tsc 0/lint/445 testes/build).
- **BAIXO (registros do revisor):** `barRadius.bottom` ficou órfão (sem consumidor) após a correção —
  mantido por completude/simetria, documentado como "arredonda o eixo, raramente desejado" (não removido
  por prudência/escopo). `horizonte-previsto` usa `RAIO_LIVRE=[6,6,0,0]` local (barra generosa do card) —
  candidato a variante nomeada no `chart-theme` (`barRadius.topLg`) se o padrão se repetir.

## Ajustes do checkpoint (rounds 5–6, pré-merge — pedidos do Yan)
**Round 5 (commits 49b332d…af2c5a6):** Runway Semanal só com a LINHA do saldo (barras removidas;
rótulo = data de FIM da semana, alinhado ao acumulado); aviso substituído por tabela das próximas
5 semanas (Semana · A receber · A pagar · Saldo acumulado — `ValorContabil`, verde/vermelho
`--success`/`--danger`, negativo com sinal de menos, saldo positivo verde, divisória antes da
tabela). Horizonte: eixo Y assimétrico +4/−8 Mi (anti-clip no topo; margem p/ o rótulo +4 Mi),
título "Horizonte Previsto" sem subtítulo, legenda cinza "Correspondente ao ano seguinte", sem "*".

**Round 6 — card "Tempo de Vida · Runway de Caixa" (NOVO, acima do Horizonte):** régua 0–12 meses
(0–3 risco / 3–6 atenção / 6–12 ideal turismo, tokens soft) com o indicador = **recebíveis em
aberto ÷ saída média mensal**, em DUAS estimativas pontuais — **sem** e **com antecipação (−4%
nos recebíveis)** — cada uma com **IC 95%** (t de Student sobre a média das saídas mensais
fechadas; IC da razão = R/(m±t·SE), teto aberto se o denominador for indistinguível de zero).
Estatística pura em `src/lib/fluxo/cobertura.ts` (10 unit tests, incl. IC calculado à mão);
RPC `get_fluxo_cobertura` (migration **0195**, aditiva) devolve numerador (previsto de entrada,
inclui vencidos, dentro do corte) + série do denominador (saídas realizadas por mês FECHADO de
movimentação, ≤12, janela defensiva de 14 meses). Componente RSC `tempo-vida-caixa.tsx`;
contrato coberto em `rpc-contrato.test.ts`.
- **revisor-db (0195): APROVADA COM RESSALVAS** — CRÍTICO era confirmar que a 0192 destrutiva não
  estava mais pendente antes do push (confirmado aplicada via `migration list`; conjunto pendente =
  só 0195); MÉDIO (scan sem limite inferior em `data_movimentacao`) **endereçado na própria 0195**
  (limite defensivo de 14 meses); BAIXO registrado: invariante "realizado ⇒ data_movimentacao NOT
  NULL" vive no filtro da `regenerar_fluxo_caixa`, não em constraint.
- **Migration 0195 APLICADA pelo Yan** (`--aditiva`, gate verde, única no push) — a sessão não pôde
  aplicar (classificador bloqueou o `db:migrate`) e o Yan rodou em seguida. RPC verificada via REST
  (service role): recebíveis R$ 16,84 Mi + 12 meses fechados jul/25–jun/26 (base de produção já
  carregada). **Testes 456/456 verdes** com o caso novo do contrato.

## Ajustes do checkpoint (rounds 7–8, pré-merge — pedidos do Yan)
**Round 7 (0a6d741…0bb806c):** Runway de Caixa refinado (título "Tempo de Vida"→"Runway de Caixa",
fórmula/nota viram botão "?" com Tooltip, bloco explicativo removido, escala colada na barra,
faixa "ideal", badge fora, manchete com "| X,X meses no pior cenário" = piso do IC com antecipação);
"Runway Semanal"→"Projeção Semanal"; tabela da Projeção sem corte (**table-fixed** + colgroup — no
layout auto o min-content nowrap alargava a tabela além do card; min-w 480 + ScrollAutoHide abaixo).

**Round 8 — card ÚNICO de posição do Fluxo Projetado (commit a6d2961; modelo fechado em MOCKUP
INTERATIVO, variante A aprovada):** os 4 KPI cards viram um card — Saldo de Caixa (+ reserva +
"Editar saldos ›" no modal editável) | A receber · A pagar · NCG com divisórias verticais e
**horizonte ajustável** no cabeçalho (dropdown Dias 1–90/Meses 1–12/Sempre + slider com régua de
marcações 30/60/90 e 3/6/9/12; "Sempre" trava e soma todo o lançado incl. vencidos). Migration
**0196** (aditiva, **revisor-db APROVADA**): `get_fluxo_previsto_diario` = série diária do previsto
+ balde de vencidos; o cliente soma a janela (slider instantâneo). Semântica = BETWEEN hoje..hoje+N
do card antigo; `get_fluxo_caixa_kpis_diario` sai da página (fica no banco). `saldo-caixa-kpi.tsx`
→ `posicao-projetado.tsx` (git mv). **revisor APROVADO**; MÉDIOs endereçados (somarMeses com clamp
no fim do mês; pill do select em `--brand-*`, não `--action-*`); BAIXOs corrigidos (dedupe hojeSP,
comentários do rename). Registro (BAIXO revisor-db): `NOT pos_corte` no balde de vencidos é
redundante hoje (defensivo); tooltip "?" só hover é padrão pré-existente do primitivo.
- ⚠️ **Migration 0196 PENDENTE de aplicação** (classificador da sessão bloqueia `db:migrate`; o Yan
  aplica com `--aditiva` — única pendente). Até lá: KPIs do card zeram (fail-safe) e contrato 456/457.
- Decisões em aberto do mockup (não implementadas): persistência do horizonte escolhido (por
  usuário/sessão) — hoje reseta a cada visita.

## CHECKPOINT do Yan (antes do merge)
1. Subir as 2 bases reais de produção (com histórico 2024+) pelos cards novos de Upload.
2. Conferir a Visão Geral reformada contra o dashboard da controladoria (mesma base ~15-16/07):
   entradas/saídas/repasse bruto; calendário + KPIs 10d; horizonte com divisor 27/28; ranking; drill de saldos com staleness.
3. Confirmar que a rota própria `/financeiro/fluxo-caixa/gerencial` segue intacta.
4. Entender a reconciliação liquidação × movimentação (para explicar à diretoria).
5. ~~Aplicar a migration 0192 (DESTRUTIVA) em TTY~~ — **JÁ APLICADA (aceito pelo Yan);** não há passo destrutivo pendente. Backup pré-push disponível se precisar restaurar as bases antigas.

## Arquivos (resumo)
Migrations 0185–0192. `src/lib/carga/parse-lancamentos-movimentacao.ts`, `parse-titulos-em-aberto.ts`,
`parse-fluxo-caixa-onda1.test.ts`. `src/lib/fluxo/rpc-fluxo.ts`. `src/components/financeiro/`:
`runway-semanal`, `horizonte-previsto`, `repasse-mensal`, `ranking-caixa`, `saldo-caixa-kpi` (novos);
`gerencial/tipos`, `gerencial/contas-cards` (M5). `src/app/financeiro/fluxo-caixa/page.tsx` (reforma),
`.../gerencial/actions.ts` (M5). `src/app/admin/uploads/{page,actions}.ts` + `parse.worker.ts` (cards
novos + aposentadoria). `supabase/seed/` (bases novas). `docs/adr/0154-*`. Versão/CHANGELOGs.
