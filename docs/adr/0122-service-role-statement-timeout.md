# ADR-0122 — `service_role` sem statement_timeout (cargas pesadas pelo PostgREST)

**Status:** Aceito (v4.20.1, 2026-06-16)
**Relacionado:** ADR-0111 (pipeline atômico de Vendas), ADR-0116 (backup-gate). Corrige premissa do CLAUDE.md ("service_role = sem limite").
**Escopo:** infra de banco (timeout de role) + 2 RPCs de status. Migration 0145 (aditiva).

## Contexto

A importação de **Vendas por Produto** passou a falhar com `57014 canceling statement due to statement timeout` no passo `promover_carga_vendas` — a tela travava, demorava (~120s) e dava erro. O promote roda via `getAdminClient()` (PostgREST com a service role key) e faz, **numa única transação**: TRUNCATE de 6 tabelas → `INSERT` staging→raw (45k linhas) → `transform_raw_to_analytics()` → `regenerar_dim_operacao_weddings()` → `refresh_all_materialized_views()` (4 MVs). Pesado e crescente.

### Investigação (causa-raiz, com evidência de produção)
- **Timeouts por role (rolconfig):** `anon = 3s`, `authenticated = 8s` (e `authenticator = 8s`), **`service_role = null`** (nenhum override). Default do banco: `statement_timeout = 120000` (120s, configuration file).
- **`SET ROLE` NÃO aplica o rolconfig do papel-alvo** (testado no pooler: após `SET ROLE authenticated`, o `statement_timeout` da sessão não mudou). Como `anon=3s`/`authenticated=8s` **são** os timeouts efetivos reais, conclui-se que **é o PostgREST que aplica o rolconfig do papel da requisição** (resetando os GUCs que o papel não define). Para o `service_role` (rolconfig nulo), ele cai no **default do banco = 120s**.
- O promote excede 120s → `57014`. Já a finalização de **Lançamentos por Operação** (só `regenerar_dim_operacao_weddings`, mais leve) cabe nos 120s → por isso "subia" sem erro.
- **O timer é armado no statement externo do PostgREST** (`SELECT promover_carga_vendas()`) e **não pode ser desarmado de dentro da função**: testado empiricamente que tanto o atributo `SET statement_timeout=0` na função quanto `SET LOCAL` no meio do corpo **não** afetam o statement em curso (ambos morreram no timeout da sessão). **A única alavanca é o nível do role.**

## Decisão

**`ALTER ROLE service_role SET statement_timeout = 0`** (sem limite), via migration 0145. Restaura o comportamento que o CLAUDE.md já documentava (e que havia derivado para 120s quando o rolconfig ficou nulo).

- **Por que 0 (ilimitado) e não um teto:** o `service_role` é o papel **server-side, admin-only** (cargas, `auth.admin`), nunca exposto a usuário final. As cargas são pesadas e crescem com o dado; um teto precisaria de revisão recorrente. Um runaway é **limitado na prática pelo timeout da função serverless** (Vercel ~300s) e pelo backup-gate (recuperação). Decisão do Yan.
- **Aplicação:** a migration roda como `postgres`, que tem `CREATEROLE` + `admin_option` sobre `service_role` (verificado) → o `ALTER ROLE` é permitido. `NOTIFY pgrst, 'reload config'` faz o PostgREST reler as settings do role.

### RPCs de status (mesmo patch)
A tela de Atualização de Dados só mostrava "última atualização" para Vendas. Adicionadas `public.status_lancamentos_financeiro()` e `public.status_fluxo_caixa_titulos()` (`SECURITY DEFINER`, `GRANT service_role`) devolvendo `{total, ultima_atualizacao}` com `MAX(carregado_em)` das tabelas raw; `getLancamentosStatusAction` passou a expor o `ultima_atualizacao` que já vinha em `get_upload_status` (era descartado).

## Consequências

- **Positiva:** Vendas volta a importar; à prova do crescimento da base. "Última atualização" correta nas 4 bases.
- **Atenção (registrada):** `service_role` sem timeout vale para **todo** caminho server-side (qualquer RPC via `getAdminClient`). É aceitável (admin-only, capado pela função serverless), mas significa que uma RPC server-side patológica não é mais cortada pelo Postgres — só pelo timeout da função. Mitigação: as RPCs consumidas pela UI continuam em `authenticated` (8s) / `anon` (3s); só o caminho de carga usa service_role.
- **Premissa corrigida:** o CLAUDE.md dizia "service_role = sem limite" como se fosse automático; na verdade dependia de um override de rolconfig que pode sumir. Agora é **explícito** (migration) e documentado: o PostgREST aplica o rolconfig do papel por requisição; um RPC pesado sob service_role **não** é automaticamente ilimitado.
