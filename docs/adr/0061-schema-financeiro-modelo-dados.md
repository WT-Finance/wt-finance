# ADR-0061 — Schema financeiro e modelo de dados

**Status:** Aceito
**Data:** Maio/2026
**Versão:** v4.0-m2

## Contexto

Até a v3.x, o banco de dados continha apenas os schemas `raw` (staging de vendas), `analytics` (tabelas materializadas de Weddings/Performance) e `public` (RPCs). A v4.0 introduziu lançamentos financeiros, contas a pagar/receber e formas de pagamento — dados de natureza distinta dos dados de Vendas. Misturá-los no schema `analytics` ou em `raw` criaria acoplamento indevido e dificultaria queries financeiras futuras.

## Decisão

Criar o schema `financeiro` para isolar completamente os dados financeiros. O schema `raw` já existia para staging de Vendas e foi ampliado com 3 novas tabelas de staging financeiro.

### Tabelas criadas

**Staging (schema `raw`):**
- `raw.lancamentos` — espelho do export de Lançamentos do ERP (valor positivo = entrada, negativo = saída)
- `raw.vendas_pagamento` — planilha "Vendas por forma de pagamento" (17 colunas)
- `raw.contas_pagar_receber` — CAP/CAR com `tipo_movimento IN ('A_RECEBER', 'A_PAGAR')`

**Dimensões e fato (schema `financeiro`):**
- `financeiro.dim_categoria` — categorias e grupos de categoria, populada dinamicamente via upload
- `financeiro.dim_conta_bancaria` — contas bancárias com tipo pré-classificado (`banco`, `gateway`, `carteira_interna`, `caixa_fisico`, `outro`)
- `financeiro.fato_lancamentos` — cópia enriquecida de `raw.lancamentos` com FKs para dimensões

**Views analíticas (schema `financeiro`):**
- `vw_fluxo_caixa_mensal` — mês × grupo de categoria, realizado vs. previsto
- `vw_proximos_vencimentos` — títulos em aberto com bucket de aging
- `vw_posicao_por_conta` — saldo realizado por conta bancária
- `vw_decomposicao_grupo` — entrada/saída por grupo de categoria

**Migrations relacionadas:** `0057_financeiro_schema_raw_tables.sql`, `0058_financeiro_dims_fato.sql`, `0059_financeiro_views.sql`, `0060_financeiro_raw_rpcs.sql`, `0061_financeiro_vp_cpr_rpcs.sql`

### Desvio crítico descoberto em hotfix (commit 09368c8)

Os schemas `raw` e `analytics` **não estão expostos via PostgREST**. A configuração `config.toml` lista apenas `schemas = ["public", "graphql_public"]`. Chamadas do tipo `supabase.schema('raw').from('lancamentos')` falham silenciosamente em produção (retornam erro 404/406 do PostgREST).

**Solução adotada:** todas as operações em `raw.*` e `analytics.*` devem passar por funções `SECURITY DEFINER` no schema `public`. As migrations 0060 e 0061 implementam esse padrão com RPCs de truncar, inserir em lote e contar para cada tabela `raw.*`. Este é o padrão obrigatório para qualquer nova tabela em `raw` ou `analytics` que precise ser acessada pelo cliente Next.js.

## Consequências

- Dados financeiros isolados de dados operacionais — queries de fluxo de caixa não sofrem interferência de joins acidentais com Vendas
- O padrão SECURITY DEFINER para acesso a `raw.*` adiciona uma indireção (RPC por tabela), mas garante que o código funcione em produção e em ambiente local (Supabase CLI)
- A coluna `tipo_movimento` em `raw.contas_pagar_receber` exige pré-tratamento por Yan antes do upload (planilha CAP e CAR precisam ser unidas e rotuladas)
- `financeiro.dim_conta_bancaria` tem classificação inicial estática; contas `WCLARA-*` são inseridas dinamicamente após upload
