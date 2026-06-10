# ADR 0107 — RBAC dinâmico: roles criáveis, permissão por área de navegação

**Status:** Aceito
**Data:** Junho/2026
**Versão:** v4.13

## Contexto

A autorização precisa permitir **criar qualquer role** com qualquer combinação de
permissões — não um conjunto fixo. A unidade de permissão é a **área de navegação** do
produto; em Performance, a granularidade desce ao setor. Existem restos do modelo
antigo no banco (tabelas vazias `app.usuarios`/`app.convites` com `CHECK role IN
('financeiro','gestor')` — estático, incompatível).

## Decisão

### Catálogo de áreas (unidade de permissão)

| Área | Cobre |
|---|---|
| `executiva` | `/executiva` + APIs do sumário executivo |
| `metas` | `/metas` + APIs de metas (kpis/ritmo/rankings mensais) |
| `performance` | `/performance` (aba geral) |
| `performance/weddings` | `/performance/weddings` + APIs/RPCs com setor Weddings |
| `performance/trips` | `/performance/trips` + setor Lazer |
| `performance/corporativo` | `/performance/corporativo` + setor Corporativo |
| `financeiro/fluxo-caixa` | `/financeiro/fluxo-caixa` + RPCs de fluxo de caixa |
| `financeiro/gerencial` | `/financeiro/fluxo-caixa/gerencial` + import gerencial |
| `admin/uploads` | `/admin/uploads*` + APIs de carga |
| `admin/design-system` | `/admin/design-system` |
| `admin/acessos` | UI/RPCs de administração de usuários e roles (a meta-permissão) |

O catálogo vive em `app.rbac_areas` (banco) **e** em `src/lib/auth/areas.ts` (app),
com teste de contrato garantindo paridade. Mapeamento setor→área:
`Weddings→performance/weddings`, `Lazer→performance/trips`,
`Corporativo→performance/corporativo`, `todos→{executiva, performance}`.

### Modelo (schema `app`, não exposto pela API)

- `app.rbac_roles` (id, nome único, descricao) — roles são **dados**, criáveis pela UI.
- `app.rbac_role_permissoes` (role_id, area) — N:N role×área, validada contra o catálogo.
- `app.rbac_usuarios` (user_id PK → auth.users ON DELETE CASCADE, email, nome, role_id,
  ativo) — 1 role por usuário; desativação por flag `ativo`.
- Seed: role **Financeiro** com TODAS as áreas; `yan@welcometrips.com.br` (usuário já
  existente em `auth.users` desde mai/2026) vinculado a ela.

### Restos do modelo antigo

`app.usuarios`, `app.convites` e `get_my_profile()` ficam **intocados** (vazios,
inofensivos, trancados por RLS/REVOKE no ADR-0108) — preservar em vez de remover, por
política do projeto. Documentados como legado; remoção pode ser decidida pelo usuário
em versão futura.

## Alternativas consideradas

- **Roles estáticas em enum/CHECK** (modelo da v4-1) — descartada: contradiz o requisito
  "criar qualquer role"; cada role nova exigiria migration.
- **Permissões como claims no JWT** (custom access token hook) — descartada: revogação/
  troca de role só valeria no refresh do token (janela de até 1h de permissão obsoleta),
  exige config de hook no dashboard, e complica o teste. Lookup indexado por chamada é
  sub-ms e reflete mudanças imediatamente.
- **Múltiplas roles por usuário** — descartada (YAGNI): uma role por usuário cobre o
  organograma atual; o modelo N:N de permissões já dá flexibilidade total ao conteúdo
  da role. Migrar depois é aditivo.
- **Permissão por recurso/linha (ex.: operação individual)** — fora de escopo: a
  unidade pedida é a área de navegação; granularidade por linha não tem caso de uso aqui.

## Consequências

- Criar/editar roles é operação de dados pela UI (RPCs `admin_*` com guard
  `admin/acessos`), sem deploy.
- Usuário sem registro em `rbac_usuarios` (ou `ativo=false`) autentica mas não acessa
  nada — cai em `/sem-acesso`. Convite sempre registra o vínculo.
- Anti-lockout no próprio banco: RPCs admin impedem desativar a si mesmo, tirar a
  própria role de admin ou remover `admin/acessos` da própria role (ver runbook S3).
