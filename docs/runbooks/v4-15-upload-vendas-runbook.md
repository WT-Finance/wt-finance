# Runbook v4.15 — Upload de Vendas (pipeline atômico)

Operação do carregamento de Vendas após a v4.15.0 (F2-real, ADR-0111). O caminho real
da UI (`/admin/uploads` → Server Actions) usa o pipeline atômico **staging → validação →
swap** (RPCs 0116/0118, `service_role`). Comandos SQL via `npx supabase db query --linked`
na raiz do repo, ou REST com a service role key (padrão do projeto).

---

## Fluxo normal (o que acontece numa carga pela tela)

1. Cliente faz o parse do arquivo (parser único `vendas-parser.ts`).
2. Por lote: `inserir_lote_staging` carrega `raw.vendas_excel_staging` (1º lote chama
   `limpar_staging_vendas` antes — **não toca a base de leitura**).
3. Finalizar: `validar_carga_staging` (pré-checagem não-destrutiva: contagem + range de
   datas vs `analytics.dim_data`). Reprovou → erro na tela, **base intacta**, nada gravado.
4. Aprovou → `promover_carga_vendas`: numa **transação única**, trunca analytics+raw,
   copia staging→raw, roda transform + regenera dims + refresh das MVs. Qualquer falha →
   **ROLLBACK** → a base **nunca fica vazia**.

## Quando uma carga é REJEITADA na validação

Sintoma: a tela mostra erro tipo *"N venda(s) com data fora do calendário (2022-01-01 a
2030-12-31). Estenda dim_data antes de carregar. A base atual foi preservada."*

- **Nada foi destruído** — a base de leitura segue a anterior. É seguro corrigir e re-subir.
- Causa comum: datas fora do range de `analytics.dim_data`. Conferir:
  ```sql
  select min(data_venda), max(data_venda) from raw.vendas_excel_staging;
  select min(data), max(data) from analytics.dim_data;
  ```
- Se for data legítima fora do range, estender `dim_data` (migration `generate_series`,
  `ON CONFLICT (data) DO NOTHING` — ver CLAUDE.md / migration 0100) e re-subir.
- Se for erro no arquivo (data digitada errada), corrigir a planilha e re-subir.

## Como inspecionar um lote em staging

```sql
select count(*)                                   from raw.vendas_excel_staging;
select min(data_venda), max(data_venda)           from raw.vendas_excel_staging;
select * from raw.vendas_excel_staging order by linha_origem limit 20;
```
Pré-validar sem promover (não-destrutivo):
```sql
select public.validar_carga_staging();
```
Limpar a staging (scratch; o 1º lote de qualquer carga já faz isso):
```sql
select public.limpar_staging_vendas();
```

## Falha DURANTE a promoção (`promover_carga_vendas`)

Sintoma: erro *"Erro ao promover a carga (base preservada): …"*.

- A promoção é uma transação única → **rollback automático**; a base de leitura continua
  a anterior. Confirmar contagem inalterada:
  ```sql
  select (public.get_upload_status() -> 'vendas' ->> 'total');
  ```
- Diagnosticar a causa no erro e re-subir após corrigir. Não há limpeza manual necessária
  (o swap não chegou a acontecer).

## Recarga (subir o mesmo arquivo de novo)

`promover_carga_vendas` faz **substituição completa** (truncate + reload), não append. Subir
o mesmo arquivo duas vezes deixa a base **idêntica** à primeira carga — não há duplicação.
A "verdade" é sempre o último arquivo promovido.

## Rollback de APLICAÇÃO (reverter a v4.15.0)

A v4.15.0 **não tem migration** e o caminho antigo coexiste intacto no banco
(`truncate_dynamic_tables`, `inserir_lote_raw`, `transform_raw_to_analytics` soltos). Para
reverter: **Vercel → Deployments → promover o deployment anterior à v4.15.0** (volta as
Server Actions ao caminho antigo). Nenhuma migration de desfazer é necessária. O pipeline
atômico (0116/0118) permanece no banco e inerte para o caminho antigo.

## Backup / restore (âncora desta versão)

Backup lógico completo pré-v4.15 em `~/wt-finance-backups/2026-06-12-pre-v4-15/`
(`exportar.mjs` + `data/*.sql` + `manifest.json`; restore via `restaurar.mjs`). Em caso de
carga ruim que escape do pipeline, restaurar `raw.vendas_excel` e regenerar:
```bash
cd ~/wt-finance-backups/2026-06-12-pre-v4-15
node restaurar.mjs data/raw.vendas_excel.sql
cd ~/projects/wt-finance
npx supabase db query --linked 'select public.transform_raw_to_analytics(); select public.regenerar_dim_operacao_weddings(); select public.refresh_all_materialized_views();'
```
