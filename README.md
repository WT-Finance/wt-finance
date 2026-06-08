# WT Finance

Plataforma interna de acompanhamento e análise financeira do **Welcome Group**.

O objetivo é centralizar os dados da empresa em uma base analítica única — substituindo fluxos baseados em Power BI, RPA e planilhas soltas — por uma aplicação web com dados versionados, APIs próprias e visões executivas por área de negócio.

> **Versão atual: 4.11.0.** A versão completa aparece no rodapé da barra lateral; clicar nela abre o **histórico de versões em linguagem de negócio** (modal voltado à diretoria).

## Estado atual (junho/2026)

Todas as áreas de Performance estão ativas, além do Financeiro:

| Área | Rota | Estado |
|------|------|--------|
| **Weddings** (casamentos) | `/performance/weddings` | Mais madura — carteira Vendas×Entregas, próximos casamentos, KPIs por subsetor com drawer rico, fluxo de caixa por operação, lista de operações |
| **Trips** (lazer) | `/performance/trips` | Ativa — KPIs principais, Mix por Produto, Top Vendedores, Vendas em Aberto e Receita Negativa |
| **Corporativo** | `/performance/corporativo` | Ativa — mesma visão de Trips, com identidade visual própria |
| **Geral** | `/performance` | Em construção (atrás de `?preview=1`); herda o layout de Performance |
| **Executiva** | `/executiva` | Sumário executivo e KPIs consolidados (rota inicial) |
| **Metas** | `/metas` | Dashboard de metas mensais por setor |
| **Financeiro — Fluxo de Caixa** | `/financeiro/fluxo-caixa` | Regime caixa-banco, calendário de liquidez, próximos lançamentos |
| **Financeiro — Gerencial** | `/financeiro/fluxo-caixa/gerencial` | Fluxo de caixa gerencial (planilha de previsão curada), editável |
| **Admin — Uploads** | `/admin/uploads` | Carga manual das bases (rota administrativa sensível — ver Segurança) |
| **Admin — Design System** | `/admin/design-system` | Catálogo de tokens e componentes |

## Stack

- **Next.js 16.2.4** (App Router) · **React 19.2.4** · **TypeScript** estrito
- **Tailwind CSS 4** · **Recharts 3** · **lucide-react** · padrão visual shadcn/ui
- **Supabase / Postgres** via PostgREST · `@supabase/ssr` + `@supabase/supabase-js`
- **Zod** (validação) · **@e965/xlsx** (ingestão de planilhas)
- Deploy: **Vercel** (automático no merge para `main`)

Não há suíte de testes automatizados no projeto (ver "Limitações conhecidas").

## Arquitetura de dados

O dado percorre um pipeline de schemas no Postgres:

```
Planilha (Excel/CSV)
   │  upload (UI /admin/uploads ou API Route, runtime nodejs)
   ▼
schema raw         ← dados crus, próximos do arquivo de origem
   │  RPCs: transform_raw_to_analytics
   │        → regenerar_dim_operacao_weddings
   │        → refresh_all_materialized_views
   ▼
schema analytics   ← dimensões, fatos, views e materialized views
   │  RPCs SECURITY DEFINER no schema public
   ▼
Frontend (anon key, via PostgREST)
```

Schemas: **`raw`** (cru), **`analytics`** (dims/fatos/MVs/views), **`app`** (config de negócio, ex.: `app.meta_setor`), **`audit`**, **`public`** (RPCs expostas).

**Regras importantes do banco:**

- **Só `public` e `graphql_public` são expostos** pela API (`supabase/config.toml`). O schema `analytics` **não é acessível** diretamente — todo acesso é por **RPCs `SECURITY DEFINER` no `public`** (com `REVOKE EXECUTE FROM PUBLIC` + `GRANT` aos roles).
- O front usa a **anon key**, cujo `statement_timeout` é **3s**. Toda RPC consumida pela UI precisa caber nesse limite (validar pelo front, não só com a service role).
- `analytics.fato_venda.data_venda` tem FK para `analytics.dim_data`, semeada com **range fixo de datas**. Subir vendas fora do range quebra o transform.
- O upload roda `truncate_dynamic_tables` (CASCADE) **antes** do transform — se o transform falhar, os fatos ficam vazios em produção (dados crus sobrevivem em `raw`).

São **104 migrations** (até `0115_*`) e **77 RPCs** no schema `public`.

## Estrutura do projeto

```
src/
  app/
    page.tsx                 redireciona para /executiva
    executiva/               sumário executivo
    metas/                   metas por setor
    performance/             Geral, Trips, Corporativo, Weddings
    financeiro/fluxo-caixa/  Fluxo de Caixa + Gerencial
    admin/uploads|design-system
    api/                     Route Handlers (dashboard/*, admin/*, gerencial/import, …)
  components/
    weddings/                área Weddings (drawer rico, carteira, operações…)
    performance/             KPIs por setor, Mix por Produto, Top Vendedores…
    financeiro/ (+ gerencial/) fluxo de caixa, calendário, composição
    charts/                  primitivos Recharts (tema, eixos, legenda, tooltip)
    shared/                  CardTabela, ModalCentral, ListDrawer, pills, KPIs…
    layout/                  sidebar, app-shell, theme-provider, version-history
    executiva/ · dashboard/ · ui/ · admin/
  lib/
    carga/                   parsers de ingestão (vendas, lançamentos, contas…)
    gerencial/               parser do fluxo de caixa gerencial
    supabase/                clients server / browser / admin
    config.ts · fmt.ts · periodo.ts · version.ts · …
  data/
    changelog-diretoria.ts   histórico de versões em linguagem de negócio (modal)
  types/
    api.ts · database.ts

supabase/
  migrations/                evolução do schema + RPCs (104 arquivos)
  seed/                      seed local e dados (data/ é git-ignored)

docs/
  adr/                       Architecture Decision Records (84)
  briefings/                 briefings e out-briefings por versão
  audits/ · changelog.md · bugs-resolvidos.md · design-system.md
```

## Convenções

- **Design System Welcome** (`docs/design-system.md`, `/admin/design-system`): cores via **tokens CSS**, nunca hex hardcoded. Cor por aba resolvida via `[data-theme]` no `<html>`.
- **Paleta canônica — cor por contexto semântico** (ADR-0103): série principal = `var(--brand)`; cash-flow tem dois contextos deliberados (identidade turquesa/mostarda nos cards de página de Weddings × semântica `--positive`/`--negative` no drawer).
- **Gráficos**: primitivos centrais em `@/components/charts` (ADR-0095) — sólido = realizado, tracejado = projeção/referência.
- **Card-tabela** (v4.11): shell único `CardTabela` para os cards que são tabela (Mix por Produto, Top Vendedores, Próximos Casamentos, Vendas em Aberto, Receita Negativa).
- **Casas decimais por contexto** (ADR-0100): 2 casas em operação individual (`fmtBRL2`); agregados abreviados (`fmtMi`/`fmtAxisBRL`).
- **Versionamento X.Y.Z** (ADR-0084): MAJOR = quebra de premissa; MINOR = capacidade; PATCH = correção/polimento. `CHANGELOG.md` no formato Keep-a-Changelog.
- **Changelog da diretoria** (`src/data/changelog-diretoria.ts`): a cada versão/patch, uma entrada em linguagem de negócio (efeito, não mecanismo), com data/hora da entrega.
- **Processo de versão** (ver `CLAUDE.md`): briefing → worktree por versão → missões (commits Conventional Commits em pt-BR) → gates (`build`/`tsc`/`lint`) → out-briefing → PR (o merge e o deploy são do usuário).

## Pré-requisitos

- Node.js 20+
- npm
- Acesso ao projeto Supabase remoto (CLI via `npx supabase …`)
- `.env.local` preenchido

## Setup local

```bash
npm install
cp .env.example .env.local   # e preencha as variáveis abaixo
```

Variáveis de ambiente:

```bash
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>   # sensível — só backend/seed/server-side
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
```

> `SUPABASE_SERVICE_ROLE_KEY` é sensível — nunca exponha no cliente.

## Banco de dados

```bash
npx supabase migration list                 # inspecionar local vs remote (read-only, seguro)
echo "Y" | npx supabase db push --linked     # APLICAR migrations no remote (ESCREVE — produção direta)
```

> Não há ambiente de staging separado: `--linked` aplica em **produção**. Aplique migrations com cautela e confirmação.

## Carga de dados

**Seed local** (lê arquivos em `supabase/seed/data/`, pasta git-ignored):

```bash
npm run seed
```

O seed limpa as tabelas dinâmicas, insere os dados crus, recarrega metas, transforma `raw`→`analytics`, regenera `analytics.dim_operacao_weddings` e atualiza as materialized views.

**Carga manual pela UI:** `/admin/uploads` (vendas, lançamentos, contas a pagar/receber) e `/admin/uploads/financeiro`. Cada importação **substitui toda a base** correspondente.

## Rodando a aplicação

```bash
npm run dev      # desenvolvimento
npm run build    # build de produção
npm run start    # serve o build
```

Checks de fechamento (gates):

```bash
npm run lint
npx tsc --noEmit
npm run build
```

> Não existe script de typecheck no `package.json`; rode `npx tsc --noEmit` diretamente.

## Scripts

| Script | Uso |
|--------|-----|
| `npm run dev` | Servidor Next local |
| `npm run build` | Build de produção |
| `npm run start` | Serve o build |
| `npm run lint` | ESLint |
| `npm run seed` | Carga completa via Supabase service role |

## Segurança (estado atual)

- **`/admin/uploads` e as API Routes de upload não têm autenticação** (decisão registrada em ADR-0029). Como cada importação substitui toda a base, trate essas rotas como **sensíveis** — endurecer auth/admin é uma frente de trabalho conhecida.
- A `SUPABASE_SERVICE_ROLE_KEY` só é usada server-side (seed, rotas administrativas). Nunca no cliente.
- RPCs de UI são `SECURITY DEFINER` com `REVOKE … FROM PUBLIC` e `search_path` fixo.

## Documentação

- **`CLAUDE.md`** — como se trabalha no projeto (workflow, comandos, banco, convenções, salvaguardas).
- **`docs/adr/`** — decisões arquiteturais (84 ADRs).
- **`docs/briefings/`** — briefings e out-briefings por versão.
- **`CHANGELOG.md`** (técnico) e **`src/data/changelog-diretoria.ts`** (negócio/diretoria).
- **`docs/design-system.md`**, **`docs/bugs-resolvidos.md`**, **`docs/audits/`**.

## Limitações conhecidas / frentes futuras

- **Sem testes automatizados** — relevante para um sistema financeiro.
- **Admin sem autenticação** (uploads destrutivos) — endurecimento pendente.
- **Aba Geral** (`/performance`) ainda em construção; **DRE evolutiva** e **RPA/atualização automática** no roadmap.
- Curadoria de dados do ERP (vínculos `venda_n`, nomes de operação) segue como pendência operacional.

## Observações operacionais

- Não commite `.env.local` nem dados em `supabase/seed/data/`.
- Depois de alterar migrations, rode `npx supabase db push --linked` e confirme com `migration list`.
- Depois de alterar carga/RPCs, valide `lint` + `tsc` + `build` e, quando possível, uma carga real no preview.
