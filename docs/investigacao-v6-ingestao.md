# Investigação — Ingestão (insumo da v6)

**Data:** 2026-09-21 · **Natureza:** só leitura (código, docs do repo, catálogo do banco via
`npx supabase db query --linked`; nenhuma chamada à API do Monde, nenhuma escrita no repo além deste
arquivo, nenhuma escrita no banco). **Formato:** medida + evidência. Sem recomendação.

Convenção de evidência: `caminho:linha` para código/doc; `query → resultado` para catálogo. Linhas
referem-se a `origin/main` em `59a986a` (PR #274, pós-merge da v5.11.0).

---

## 1. API do Monde — grão de produto

### 1.1 Endpoints consumidos hoje

| # | Endpoint (query string) | Função | Uso | Evidência |
|---|---|---|---|---|
| 1 | `GET <base>?resource=sales&from&to&page&page_size` | `fetchSalesPage` | listagem paginada por **data da venda**; `page_size` default 200; `total` guia a paginação | `src/lib/monde/client.ts:86-104`; consumo em `src/lib/monde/ingest.ts:79-92` |
| 2 | `GET <base>?resource=sale&id=<sale_id>` | `fetchSaleDetail` | detalhe completo de UMA venda | `src/lib/monde/client.ts:107-114`; consumo em `src/lib/monde/ingest.ts:101` |

Base default: `https://szyrzxvlptqqheizyrxu.supabase.co/functions/v1/monde-data` (Edge Function do
fornecedor, sobrescritível por `MONDE_API_URL`) — `client.ts:12,17-19`. Auth por header `x-api-key`
(`client.ts:40`). Timeout 15 s, até 2 retries em 5xx/rede (`client.ts:13-14,62-80`).
Não há outro `resource` no código vivo em `src/`. O `resource=people` é citado só na pauta ao
provedor (`docs/briefings/briefing-v5-4-5-espelho-fiel.md:127-135`), não é consumido.

### 1.2 Campos por venda que o código tipa (schemas Zod)

| Nível | Campos declarados | Evidência |
|---|---|---|
| listagem (`zSaleListItem`) | `sale_number, sale_id, sale_date, status, period_start, period_end, travel_agent_name, payer_name, payer_cpf_cnpj, total_final_value, total_revenue, product_count, custom_fields[]{name,value}` | `src/lib/monde/schemas.ts:21-35` |
| detalhe (`zSaleDetail`) | `sale_id, sale_number, sale_date, status, payer_name, payer_cpf_cnpj, travel_agent_name, custom_fields[], total_final_value, total_revenue, raw{}, raw_hash, products[]` | `schemas.ts:67-87` |
| **produto** (`zProduct`, dentro de `products[]`) | `product_kind, description, supplier_name, status, canceled_at, total_amount, agency_service_fee, over_amount, intermediary_commission_amount, data_inicio, data_fim, passengers[]{person_name, amount, agency_fee, fees}` | `schemas.ts:45-65` |

Todos os objetos são `.passthrough()` (campo extra do fornecedor não derruba o parse) —
`schemas.ts:3-13`. `products[]` é **achatado pela Edge Function** a partir dos buckets do `raw`
(§1.4); o código não lê os buckets, lê `products[]`.

### 1.3 O que o código faz com o grão de produto

| Medida | Valor | Evidência |
|---|---|---|
| Itens gravados por venda | **TODOS** os `products[]`, com `status` real (desde v5.4.5) | `src/lib/monde/transform.ts:103-107,143-166` |
| Campo de receita por produto vindo da API | **não existe** — `receitas` do item é **ALOCAÇÃO** do `total_revenue` da venda, proporcional a `total_amount`, só entre itens `active`, resto no último ativo | `transform.ts:127-153`; ADR `docs/adr/0149-ingestao-monde.md:70-78` |
| Colunas de item persistidas | `produto(description), product_kind, fornecedor, status, canceled_at, valor_total(total_amount), receitas(alocada), data_inicio, data_fim, passageiros(count)` | `transform.ts:38-49`; `supabase/migrations/0178_monde_espelho.sql:63-77` |
| Campos de produto **recebidos e descartados** pelo transform | `agency_service_fee` (só para o booleano `taxa_servico`), `over_amount`, `intermediary_commission_amount`, `passengers[].amount/agency_fee/fees` | `transform.ts:122,154-165` |
| Candidatos a receita nativa por produto testados (ago/2026) | 4 combinações; o melhor bate ao centavo em **2.275/8.493 vendas (26,8%)** e cobre **55% do valor** | `docs/investigacoes/2026-08-04-scope-b-item-level-e-pessoas.md:221-231` |
| Pedido formal ao provedor | "Receita por produto" é o item **8.2** da pauta; status: **pendente de envio** | `docs/briefings/briefing-v5-4-5-espelho-fiel.md:105-113`; `WT_Finance_Out_Briefing_v5-4-5_Espelho_Fiel.md:98-104` (§8 item 4) |

### 1.4 Payload bruto gravado — inspeção de UM registro real

`monde.venda.raw` guarda o payload inteiro (`0178_monde_espelho.sql:51`). Registro inspecionado:
`venda_numero = 74538` (`data_venda = 2026-09-21`, a mais recente com `raw`), e um segundo
(`74520`) para ver um bucket `hotels` não vazio.

**Chaves de topo do `raw` (venda 74538):**
`airline_tickets, approver, attachments, car_rentals, commissions, company, created_at, created_by,
cruises, custom_fields, cvc_packages, departure_date, excursions, financial, ground_transportations,
hotels, id, insurances, intermediary, observations, operation, operations, others, payer, payments,
printed_receipt, promoter, requester, return_date, sale_date, sale_number, seller, status, totals,
train_tickets, travel, travel_packages`
(query: `jsonb_object_keys(raw)` em `monde.venda WHERE venda_numero='74538'`).

**Não existe chave `products` no `raw`** (`jsonb_typeof(raw->'products')` → `null`). Os produtos
vivem em **12 arrays por tipo**: `airline_tickets, car_rentals, cruises, cvc_packages, excursions,
ground_transportations, hotels, insurances, operations, others, train_tickets, travel_packages`
(a investigação de ago/2026 contava 11 — `excursions` não constava; `docs/investigacoes/2026-08-04-scope-b-item-level-e-pessoas.md:82-84`).

**Chaves de um produto** (bucket `operations`, venda 74538):
`agency_card_rate, agency_fee, agency_service_fee, arrival_date, canceled_at, currency,
departure_date, discount_amount, document, exchange_rate, id, included_services,
intermediary_commission_amount, intermediary_commission_percentage, intermediary_over,
intermediary_over_amount, intermediary_over_percentage, issue_date, observations, passengers[],
product{}, quantity, status, supplier{}, totals{}, unit_fee, unit_price, vendor_reservation_url`

**Chaves de um produto** (bucket `hotels`, venda 74520):
`accommodation_kind, agency_card_rate, agency_service_fee, booking_number, canceled_at, cc_rav_fee,
check_in, check_out, commission_amount, commission_percentage, currency, deductions, destination,
discount_amount, exchange_rate, id, included_services, intermediary_commission_amount,
intermediary_commission_percentage, intermediary_over, intermediary_over_amount,
intermediary_over_percentage, issue_date, meal_plan, nights, observations, over, over_amount,
over_percentage, passengers[], representative{}, room_category, status, supplier{}, totals{},
vendor_reservation_url`

**`totals{}` do produto** (hotel 74520): `agency_fee=0, amount=1285.2, customer_amount=1224,
discount=0, fees=61.2, products=1224, rav_fee=0, rav_fee_discount=0`.
**`totals{}` da venda** (74520): `balance=0, discount=0, fees=61.2, final_amount=1285.2,
products=1224, revenue=183.6`.
**Chaves de `passengers[0]`** (hotel 74520): `agency_fee, amount, canceled_at, cost_center,
customer_amount, emission_name, fees, other_fees, person{}, rav_fee, rav_fee_discount, total_amount`.

| Medida | Valor |
|---|---|
| Chave `revenue`/`receita` **no produto** (`totals{}` do produto ou nível do produto) | **ausente** nos dois registros inspecionados; `revenue` só existe em `raw.totals` (venda) |
| Campos financeiros por produto presentes | `commission_amount, over_amount, agency_service_fee, cc_rav_fee, intermediary_*`, `totals.agency_fee/fees/rav_fee` — os mesmos que a investigação de ago/2026 combinou sem reconstruir `total_revenue` |
| Ramo `financial` | presente nos dois registros de set/2026; o backlog registra que só **527 de 28.250** vendas o têm (`docs/backlog-v6.md:51`, B-27) |
| Doc do fornecedor salva no repo | **nenhuma** além do que ADR-0149 e as investigações descrevem (grep `monde-data` em `docs/`, `src/`, `*.json` → só `client.ts`, ADR-0149, briefings/investigações) |

---

## 2. Inventário dos cards de `/admin/uploads`

O briefing pede "5 uploads"; a página tem **6 cards de upload** (`src/app/admin/uploads/page.tsx:99-166`,
array `BASES`) mais 1 card de leitura (Sincronização Monde, `page.tsx:174`). O 6º card
(Demonstrativo de Competência) entrou na v5.8.0.

Todos os 6 usam o mesmo caminho: parse **no cliente** via `parseArquivoEmWorker` (`page.tsx:520-557`),
linhas já parseadas viajam em lotes para Server Actions em `src/app/admin/uploads/actions.ts`. Nenhuma
RPC `contar_*` é usada por card algum; a única `contar_*` viva no catálogo é
`contar_convidados_operacao(p_operacao)` (leitura de Weddings), não é RPC de upload.

| Card (label) | key | Parser (arquivo) | RPCs em ordem | Tabela raw destino | Chave / grão | Alarme contagem+soma | Dependentes (pg_depend + funções que citam a tabela) |
|---|---|---|---|---|---|---|---|
| **Vendas por Produto** | `vendas` | `src/lib/carga/parse-vendas-produto.ts` → parser único `vendas-parser.ts` | `get_upload_status` (antes) → `limpar_staging_vendas` (1º lote) → `inserir_lote_staging` ×N (batch 1000) → `validar_carga_staging` → `promover_carga_vendas` | `raw.vendas_excel_staging` → swap para `raw.vendas_excel` (+ `analytics.fato_venda`, `fato_venda_item`, dims, MVs dentro do `promover`) | `id bigserial`; **sem UNIQUE de negócio**; grão = 1 linha por **item** de venda (`venda_numero`+`produto`); `0001_init_schemas.sql:31-52` | **Parcial**: `validar_carga_staging` checa `count>0`, datas fora de `dim_data`, setor fora do mapa e queda de `operacao_propria` (aviso) — `0135_balde3_lock_carga_e_aviso_op_propria.sql:94-215`. **Não confere soma**, nem contagem arquivo×gravado (a tela mostra `vendas_count` retornado, sem comparar com `totalLinhas` — `page.tsx:593-598`) | views: `analytics.vw_vendas_agregadas` (v); funções: `regenerar_dim_operacao_weddings, contar_convidados_operacao, get_carteira_weddings__nucleo, get_operacao_weddings__nucleo, get_operacoes_weddings__nucleo, inserir_lote_raw, promover_carga_vendas, transform_raw_to_analytics, truncate_dynamic_tables, validar_carga_staging`. Derivados: `analytics.fato_venda` → MVs `mv_vendas_diarias, mv_vendas_mensais, mv_ranking_produtos_mensal, mv_ranking_vendedores_mensal` (m); FK `fato_venda_item → fato_venda` |
| **Lançamentos por Operação** | `lancamentos` | `src/lib/carga/parse-lancamentos.ts` (tipos em `lancamentos.ts`) | `get_upload_status` → `truncar_lancamentos` (1º lote) → `inserir_lote_lancamentos` ×N (batch 1000) → `regenerar_dim_operacao_weddings` | **não tem raw**: escreve direto em `analytics.fato_lancamento_operacao` (`0027_public_rpcs.sql:36,49`) | `id bigserial`; sem UNIQUE; grão = 1 lançamento (`lancamento_n`, `venda_n`, `operacao`); `0026_weddings_tables.sql:58-72` | **Nenhum** (`finalizarLancamentosAction` só regenera dims — `actions.ts:63-85`); truncate **antes** de inserir, não atômico (`actions.ts:49-54`) | views: `analytics.vw_rendimento_float_operacao` (v); funções: `analytics.regenerar_dim_operacao_weddings, get_acumulado_weddings__nucleo, get_operacao_weddings__nucleo, get_pipeline_weddings__nucleo, get_upload_status, inserir_lote_lancamentos, truncar_lancamentos`. Regenera `analytics.dim_operacao_weddings` (238 linhas; WORKING-CONTEXT exige este upload PRIMEIRO no repovoamento — `docs/WORKING-CONTEXT.md:77-79`) |
| **Lançamentos por Movimentação** | `lancamentos_movimentacao` | `src/lib/carga/parse-lancamentos-movimentacao.ts` (13 colunas) | `status_lancamentos_movimentacao` → `truncar_lancamentos_movimentacao` (1º lote) → `inserir_lote_lancamentos_movimentacao` ×N (batch 500) → `regenerar_fluxo_caixa` | `raw.lancamentos_movimentacao` (`0185_raw_lancamentos_movimentacao.sql:18-37`) | `id bigserial`; sem UNIQUE; grão = 1 lançamento liquidado, eixo `data_movimentacao`; `numero`, `venda_no` não são chave | **Nenhum** de contagem/soma; só aviso de `contas_novas` não classificadas (`actions.ts:390-411`); truncate antes de inserir, não atômico (`actions.ts:307-313`) | views: nenhuma; funções: `inserir_lote_lancamentos_movimentacao, regenerar_fluxo_caixa, status_lancamentos_movimentacao, truncar_lancamentos_movimentacao`. Derivado: `financeiro.fato_fluxo` (TRUNCATE+rebuild em `regenerar_fluxo_caixa`, `0187_fato_fluxo_roteamento.sql:137-179`) |
| **Lançamentos por Vencimento (em aberto)** | `titulos_em_aberto` | `src/lib/carga/parse-titulos-em-aberto.ts` (12 colunas) | `status_titulos_em_aberto` → `truncar_titulos_em_aberto` (1º lote) → `inserir_lote_titulos_em_aberto` ×N (batch 500) → `regenerar_fluxo_caixa` | `raw.titulos_em_aberto` (`0186_raw_titulos_em_aberto.sql:18-35`) | `id bigserial`; sem UNIQUE; grão = 1 título em aberto, eixo `vencimento` | **Nenhum** de contagem/soma; mesmo aviso de `contas_novas`; não atômico (`actions.ts:363-369`) | views: nenhuma; funções: `inserir_lote_titulos_em_aberto, regenerar_fluxo_caixa, status_titulos_em_aberto, truncar_titulos_em_aberto`. Derivado: `financeiro.fato_fluxo` |
| **Pessoas** | `pessoas` | `src/lib/carga/parse-pessoas.ts` (17 colunas) | `status_pessoas` → `limpar_staging_pessoas` (1º lote) → `inserir_lote_staging_pessoas` ×N (batch 500) → `validar_carga_pessoas` → `promover_carga_pessoas` | `raw.pessoas_staging` → swap para `raw.pessoas` (`0160_base_pessoas.sql:19-37`) | **sem PK, sem id, sem UNIQUE**; grão = 1 pessoa do cadastro Monde; lookup por `nome` (índice `idx_pessoas_nome`) | **Parcial**: `validar_carga_pessoas` só checa `count>0` (`0160:107-112`); tela usa `pessoas_count` retornado sem comparar com o arquivo (`actions.ts:240-274`) | views: nenhuma; funções: `buscar_pessoas, promover_carga_pessoas, status_pessoas`. Consumidor: Faturamento/Cadastro Corp (`app.cliente_corporativo` casa por nome — `docs/investigacoes/2026-08-04-scope-b-item-level-e-pessoas.md:368`) |
| **Demonstrativo de Resultado (Competência)** | `demonstrativo_competencia` | `src/lib/carga/parse-demonstrativo-competencia.ts` (8 colunas; só `.xlsx`) | `status_demonstrativo_competencia` → `truncar_demonstrativo_competencia` (1º lote) → `inserir_lote_demonstrativo_competencia` ×N (batch 500) → `status_demonstrativo_competencia` (conferência) → `provisionar_dre_comp_par` | `raw.demonstrativo_competencia` (`0255_raw_demonstrativo_competencia.sql:33-46`) | `id bigserial`; grão = 1 linha por (`tipo, grupo, descricao, ano, mes_num`); chave do de-para = (`grupo, descricao`) | **SIM — contagem E soma**: `somaCentavos(rows)` no cliente × `status.total`/`status.soma_centavos` no banco; divergência devolve erro e o card não declara sucesso (`page.tsx:644-671`; `actions.ts:516-540`; `0255:134-146`) | views: `financeiro.vw_dre_competencia` (v); funções: `dre_comp_estrutura, get_dre_competencia_mensal, inserir_lote_demonstrativo_competencia, provisionar_dre_comp_par, status_demonstrativo_competencia, truncar_demonstrativo_competencia` |

Query de dependências (pg_catalog): para cada tabela, `pg_depend` com `classid='pg_rewrite'`
(views/MVs), `pg_constraint contype='f'` (FKs apontando) e `pg_get_functiondef(p.oid) ~ '\m<schema>.<tabela>\M'`
sobre `pg_proc` fora de `pg_catalog`/`information_schema`. Arquivo da query:
`$CLAUDE_JOB_DIR/tmp/dep.sql` (efêmero); resultado transcrito na coluna "Dependentes".

Observações medidas (sem juízo):
- 4 dos 6 cards fazem **TRUNCATE antes do INSERT em lotes** (Lançamentos por Operação, Movimentação,
  Títulos, Competência); 2 usam staging + swap atômico (Vendas, Pessoas).
- Só 1 dos 6 (Competência) confere contagem **e** soma arquivo×banco.
- RPCs `truncate_dynamic_tables` e `inserir_lote_raw` seguem no catálogo (caminho antigo, usadas
  por `npm run seed` — skill `ingestao-planilhas` §5).

---

## 3. COALESCE da A1 (v5.9.4) no corpo vivo de `monde_ingest_promover`

| Medida | Valor |
|---|---|
| Query | `SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='monde_ingest_promover'` |
| Trecho no corpo vivo | `ON CONFLICT (venda_numero) DO UPDATE SET sale_id=COALESCE(EXCLUDED.sale_id, d.sale_id), data_venda=EXCLUDED.data_venda, ...` |
| Confere com a migration | `supabase/migrations/0267_promover_coalesce_sale_id_e_metas_le_kpis.sql:97` (texto idêntico) |
| Migration aplicada no remoto | sim — `supabase_migrations.schema_migrations` tem `0267 promover_coalesce_sale_id_e_metas_le_kpis` |
| Definições posteriores da função | nenhuma: `0269` só faz `COMMENT ON FUNCTION public.monde_ingest_promover()` (`0269_...sql:152`) |

**Resultado: o COALESCE está no corpo vivo.**

---

## 4. Estado das pendências relacionadas

### 4.1 Migration `0254` (destrutiva — DRE, `RB_H` vira resultado)

| Medida | Valor | Evidência |
|---|---|---|
| Arquivo | existe em `supabase/migrations/0254_dre_receita_bruta_vira_resultado.sql` (foi movido de `supabase/patches/`, como o header manda) | header linhas 1-13 |
| Aplicada no remoto | **sim** — `schema_migrations` contém `0254 dre_receita_bruta_vira_resultado` | query em `supabase_migrations.schema_migrations` |
| Local × remoto | `npx supabase migration list`: 0254 presente nos dois lados | saída do comando |
| Registro documental | out-briefing v5.7.1 marcava "⏳ do Yan" (`WT_Finance_Out_Briefing_v5-7-1_Ajustes_DRE.md:89`); out-briefing v5.8.0 registra "já aplicada" (`WT_Finance_Out_Briefing_v5-8-0_DRE_Competencia.md:276`) | — |

**Estado: RESOLVIDA (aplicada).**

### 4.2 `PENDENTE-agendamento-cdi`

| Medida | Valor | Evidência |
|---|---|---|
| Arquivo `supabase/patches/PENDENTE-agendamento-cdi.sql` | **não existe** (patches hoje: `RESTORE-incidente-varredura-rest.mjs`, `bloco5-precondicoes.sql`, `bloco5-recontagem.sql`) | `ls supabase/patches/` |
| Substituto | migration `0244_cdi_agendamento_mensal.sql` (`cron.unschedule` guardado + `cron.schedule`) | `0244:5,44` |
| Aplicada no remoto | **sim** — `schema_migrations` contém `0244 cdi_agendamento_mensal` | query |
| Job vivo | `cron.job` jobid 9 `cdi-ingest-mensal`, schedule `0 9 3 * *`, `active=true` | query em `cron.job` |
| Referência morta ao arquivo | ainda citada em `0239_cdi_ingest_upsert.sql:14` (comentário) e em `WT_Finance_Out_Briefing_v5-5-0_Rendimento_Float.md:252,294`; o relatório triado registra a remoção da citação do WORKING-CONTEXT (`docs/auditoria-v5/relatorio-triado.md:183`, D8-012) | — |

**Estado: RESOLVIDA (agendamento aplicado pela 0244; sobram 2 citações históricas ao nome antigo).**

Outros jobs vivos em `cron.job`: `monde-ingest-incremental` (`*/15 * * * *`), `monde-reconciliacao-1/2/3`
(`5 6`, `20 6`, `35 6 * * *`), todos `active=true`.

### 4.3 As 10 tabelas do incidente de 10/09/2026 — contagem atual × backup

Backup de referência: `~/wt-finance-backups/2026-09-10-pre-migration-221044/manifest.json`
(`linhas_na_origem`, todas `ok:true`). Contagem atual: `pg_stat_user_tables.n_live_tup` e
`pg_class.reltuples` (catálogo, **estimativa** pós-autovacuum; `last_autoanalyze` de 2026-09-21
14:14–14:17 UTC nas 10 tabelas — ou seja, estatística fresca de hoje). Não foi feito `count(*)`.

| Tabela | Backup (10/09) | Agora (`n_live_tup`) | Δ | Abaixo do backup? |
|---|---|---|---|---|
| `raw.lancamentos_movimentacao` | 92.506 | 94.667 | +2.161 | não |
| `analytics.fato_venda_item` | 48.147 | 48.652 | +505 | não |
| `raw.vendas_excel` | 48.147 | 48.652 | +505 | não |
| `analytics.fato_lancamento_operacao` | 41.091 | 41.745 | +654 | não |
| `raw.titulos_em_aberto` | 36.756 | 36.176 | **−580** | **sim** |
| `analytics.fato_venda` | 29.106 | 29.458 | +352 | não |
| `analytics.dim_pagante` | 7.033 | 7.115 | +82 | não |
| `raw.demonstrativo_competencia` | 3.294 | 3.334 | +40 | não |
| `analytics.dim_produto` | 117 | 118 | +1 | não |
| `analytics.dim_vendedor` | 64 | 64 | 0 | não |

Contexto medido, não interpretado: `raw.titulos_em_aberto` é a base de **títulos em aberto** (o
que ainda não foi liquidado), substituída integralmente a cada upload (`0186:2-7`); o backup é de
10/09 e a carga atual é posterior (`last_autoanalyze` 21/09).

Tabelas vizinhas, para referência (mesma query): `analytics.dim_operacao_weddings` 238 → 242;
`raw.pessoas` 64.104 → 64.104 (`last_autoanalyze` 2026-06-30, sem carga desde então);
`monde.venda` 29.731; `monde.venda_item` 49.406.

Script de restore continua **não executado** (`supabase/patches/RESTORE-incidente-varredura-rest.mjs:3-9`);
decisão registrada: repovoar por upload (`docs/WORKING-CONTEXT.md:73-75`).

### 4.4 Divergência encontrada de passagem — checkout raiz atrasado

`origin/main` (`59a986a`, PR #274) já registra "Última migration aplicada **0272** · próxima livre
**0273**" (`docs/WORKING-CONTEXT.md:55`), coerente com `schema_migrations` no remoto (0271
`estante_estrutura`, 0272 `estante_rpcs`). O **checkout raiz** em `~/projects/wt-finance` está em
`62bd8b9` (PR #273) e ainda diz 0270/0271 (`WORKING-CONTEXT.md:38` naquele checkout): falta o
`git pull --ff-only` do pós-merge da v5.11.0.
