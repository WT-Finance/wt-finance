# ADR-0104 — Ingestão atômica de Vendas (staging + swap)

**Status:** Aceito
**Data:** 2026-06-08
**Contexto:** O upload de Vendas (modo executar) rodava `truncate_dynamic_tables` **antes** do transform, cada passo em sua própria transação (PostgREST faz auto-commit por chamada). Se o transform falhasse — tipicamente uma `data_venda` fora do range de `analytics.dim_data` (erro de FK) — a base de leitura (`analytics`) ficava **VAZIA em produção** (achado F2; já custou caro na migration 0100). Não havia pré-validação nem rollback.

## Decisão

Ingestão em **três etapas**, com a destruição isolada numa transação única:

1. **Staging (não-destrutivo).** O raw novo é carregado em `raw.vendas_excel_staging` (`inserir_lote_staging`, em lotes). A base atual permanece intacta.
2. **Pré-validação ANTES de qualquer destruição.** `validar_carga_staging()` checa contagem mínima e **range de datas vs `dim_data`** (sem hardcode — consulta `min/max` de `dim_data`). Validação falha → a carga aborta, base intacta, erro claro ("X vendas fora do calendário…").
3. **Swap atômico.** `promover_carga_vendas()` faz, **numa única transação**: re-validação defensiva → `TRUNCATE` das dynamic tables → copia staging→`raw.vendas_excel` → `transform_raw_to_analytics` → `regenerar_dim_operacao_weddings` → `refresh_all_materialized_views` → limpa a staging. Falha em qualquer passo → **ROLLBACK** → a base **nunca fica vazia**.

`TRUNCATE` participa de transação no Postgres (revertido no rollback); `REFRESH MATERIALIZED VIEW` (não-CONCURRENTLY) também. As metas (`loadMetas`/`inserir_metas`, upsert idempotente) ficam fora do swap.

## Consequências

- A base de leitura **nunca fica vazia** por falha de carga — pior caso é "carga abortada, dados antigos preservados".
- As RPCs antigas (`truncate_dynamic_tables`, `inserir_lote_raw`, `transform_raw_to_analytics`) **coexistem** (seed e recuperação manual ainda as usam); a rota de carga (`carregarVendas`) passou ao fluxo novo. Remoção da via antiga: versão futura.
- A staging é `UNLOGGED` (recriável) e limpa a cada carga.
- Migration **0116** (com confirmação do usuário — produção direta). Validado em modo preview antes de qualquer executar.
- **Paridade de colunas:** o swap insere exatamente as mesmas colunas que `inserir_lote_raw` (sem introduzir/remover campos) — a divergência entre `vendas.ts` e `parse-vendas-produto.ts` (este popula `operacao_propria`/`passageiros`, aquele não) fica registrada como follow-up, fora do escopo da v4.12.
