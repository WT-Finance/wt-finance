# WT Finance

Plataforma interna de acompanhamento e análise financeira do **Welcome Group**.

O objetivo é centralizar os dados da empresa em uma base analítica única — substituindo fluxos baseados em Power BI, RPA e planilhas soltas — por uma aplicação web com dados versionados, APIs próprias, controle de acesso por área e visões executivas por setor de negócio. A plataforma cobre hoje três frentes: **Performance** (vendas por setor), **Financeiro** (fluxo de caixa, faturamento, acervo) e **Metas**.

> **Versão atual: 5.0.0** (julho/2026) — a abertura da major 5, com **Metas por Setor**. A versão completa aparece sob o logotipo na barra lateral; clicar nela abre o **histórico de versões em linguagem de negócio** (modal voltado à diretoria, agrupado por major).

> **Identidade:** internamente a plataforma se chama **Janus** (o deus de duas faces — uma olha os dados do passado, a outra as projeções à frente); o cliente externo continua vendo apenas a marca **Welcome** (boletos, notas fiscais e e-mails de fatura são 100% Welcome). O repositório e o `package.json` mantêm o nome histórico `wt-finance`.

---

## Estado atual (julho/2026)

Acesso a cada tela é controlado por **permissão de área (RBAC)** — ver [Autenticação e permissões](#autenticação-e-permissões). As áreas abaixo estão agrupadas como aparecem na barra lateral e no editor de acessos.

| Área | Rota | Estado |
|------|------|--------|
| **Executiva** | `/executiva` | Sumário executivo / KPIs consolidados do Grupo. **Em construção** — só renderiza com `?preview=1` na URL. |
| **Performance — Geral** | `/performance` | Visão cross-setor. **Em construção** (`?preview=1`); herda o layout de Performance. |
| **Performance — Trips** (lazer) | `/performance/trips` | Ativa — KPIs principais, Mix por Produto, Top Vendedores, Vendas em Aberto e Receita Negativa. |
| **Performance — Weddings** (casamentos) | `/performance/weddings` | Mais madura — carteira Vendas×Entregas, próximos casamentos, KPIs por subsetor com drawer rico, fluxo de caixa por operação, lista de operações. |
| **Performance — Corporativo** | `/performance/corporativo` | Ativa — mesma visão de Trips, com identidade visual própria. |
| **Financeiro — Fluxo de Caixa** | `/financeiro/fluxo-caixa` | Regime caixa-banco, calendário de liquidez, próximos lançamentos, posição por conta. |
| **Financeiro — Gerencial** | `/financeiro/fluxo-caixa/gerencial` | Fluxo de caixa gerencial (planilha de previsão curada), editável; saldos de contas gerenciáveis. |
| **Financeiro — Faturamento Corporativo** | `/financeiro/faturamento-corp` | Emissão de boletos e NFS-e (via Asaas) + disparo de e-mails + Cadastro de clientes corporativos. |
| **Financeiro — Acervo de Documentos** | `/financeiro/acervo` | Biblioteca de documentos/modelos/manuais (RBAC em dois níveis: ver × gerir). |
| **Financeiro — Calculadora de Rateio** | `/financeiro/calculadora-rateio` | Upload de fatura → cruzamento read-only com vendas por setor. |
| **Metas — Acompanhamento** | `/metas` | **Novo (v5.0.0)** — realizado × meta por setor e Grupo, com o ritmo em relação ao esperado até a data. |
| **Metas — Cadastro** | `/metas/cadastro` | **Novo (v5.0.0)** — grade anual editável (12 meses × setor: Faturamento + % Rec), edição em lote. |
| **Solicitações** | `/solicitacoes` | Caixa de entrada / minhas solicitações / gestão (dois níveis de acesso). |
| **Admin — Upload de Arquivos** | `/admin/uploads` | Carga manual das bases (Vendas, Lançamentos, Contas, Títulos, Pessoas). |
| **Admin — Usuários e Acessos** | `/admin/acessos` | Gestão de usuários, roles/permissões e solicitações de acesso. |
| **Admin — Tipos de Solicitação** | `/admin/solicitacoes` | Configuração dos tipos de solicitação + auditoria de movimentações. |
| **Admin — Design System** | `/admin/design-system` | Catálogo de tokens e componentes (referência interna). |

Telas de autenticação, fora do AppShell: `/login` (e-mail + senha), `/trocar-senha` (troca obrigatória no 1º acesso), `/solicitar-acesso` (auto-cadastro público), `/auth/confirm` (magic link em 2 passos, anti-lockout) e `/sem-acesso`.

## Stack

- **Next.js 16.2.9** (App Router) · **React 19.2.4** · **TypeScript** estrito
- **Tailwind CSS 4** · **Recharts 3** · **lucide-react** · padrão visual shadcn/ui
- **Supabase / Postgres** via PostgREST · `@supabase/ssr` + `@supabase/supabase-js` (auth por sessão, cliente por-request)
- **Zod 4** (validação de contrato de RPC) · **@e965/xlsx** (ingestão de planilhas) · **nodemailer** (e-mail transacional)
- **Vitest** (testes de unidade + contrato de RPC) · **@vercel/speed-insights**
- Deploy: **Vercel** (automático no merge para `main`)

## Autenticação e permissões

Login **obrigatório** em toda a plataforma (Supabase Auth). O método primário é **e-mail + senha** (ADR-0110); o magic link (`/auth/confirm`) ficou como recuperação/anti-lockout.

- **Criação de usuário:** admin cria com **senha provisória exibida na tela** (e, se houver SMTP, também enviada por e-mail); uma flag força a troca no 1º acesso, com portão forte antes de qualquer dado. Auto-cadastro público via `/solicitar-acesso`.
- **Autorização RBAC dinâmica por área** (ADRs 0106–0110): a unidade de permissão é a **área de navegação** (em Performance, granular por setor). O catálogo vive em `src/lib/auth/areas.ts` e é **espelhado** em `app.rbac_areas` (paridade testada em `rpc-contrato.test.ts`). Áreas com padrão **ver × editar** (dois níveis): Solicitações, Acervo e Metas.
- **Enforcement em 4 camadas:** `src/proxy.ts` (convenção Next 16, exige sessão fora de `/login` e `/auth/*`) → página (`requireArea`) → route handler (`requireAreaApi`) → server action (`requireAreaAction`). **Toda RPC de leitura é `SECURITY DEFINER` e chama `app.exigir_acesso(<áreas>)` antes de tocar dado.**
- **`anon` não executa nenhuma RPC de dado** (só `solicitar_acesso`, com rate-limit). As RPCs consumidas pela UI rodam como `authenticated`. **RLS é deny-by-default** em todas as tabelas dos schemas.

## Arquitetura de dados

O dado percorre um pipeline de schemas no Postgres:

```
Planilha (Excel/CSV)
   │  upload (UI /admin/uploads → API Route, runtime nodejs; ou npm run seed)
   ▼
schema raw         ← dados crus, próximos do arquivo de origem
   │  pipeline atômico de Vendas (staging → validação → promoção em transação)
   │  RPCs: transform_raw_to_analytics
   │        → regenerar_dim_operacao_weddings
   │        → refresh_all_materialized_views
   ▼
schema analytics   ← dimensões, fatos, views e materialized views
   │  RPCs SECURITY DEFINER no schema public (exigir_acesso → dado)
   ▼
Frontend (sessão authenticated, via PostgREST)
```

**Schemas Postgres:** `raw` (cru), `analytics` (dims/fatos/MVs/views), `app` (config de negócio, RBAC, Solicitações, Faturamento, Acervo, Metas), `financeiro` (fluxo de caixa: dims/fatos/views), `dim` (normalização de hotel), `audit` (log de ingestão), `public` (**só RPCs** — a superfície exposta).

**Regras importantes do banco** (detalhadas no `CLAUDE.md`):

- **Só `public` e `graphql_public` são expostos** pela API (`supabase/config.toml`). `analytics`, `app`, `financeiro` etc. **não são acessíveis** diretamente — todo acesso é por **RPCs `SECURITY DEFINER` no `public`** (`REVOKE EXECUTE FROM PUBLIC, anon` + `GRANT` explícito aos roles).
- **`statement_timeout` por role** (aplicado pelo PostgREST a cada requisição): `anon` = 3s, `authenticated` = 8s, `service_role` = 0 (sem limite, setado explicitamente). Toda RPC consumida pela UI (roda como `authenticated`) precisa caber em 8s — validar pelo front, não só com a service role.
- **Fuso:** os roles do app (`anon`/`authenticated`/`service_role`) rodam em `America/Sao_Paulo`; migrations e `npm run seed` rodam como `postgres` em **UTC**.
- `analytics.fato_venda.data_venda` tem FK para `analytics.dim_data` (range fixo semeado) — subir vendas fora do range quebra o transform.
- `max_rows = 1000` no PostgREST — limite de payload de RPCs/listagens.

São **165 migrations** (até `0176_*`), **mais de 170 RPCs** vivas no schema `public` e **126 ADRs** (até `0146`).

## Estrutura do projeto

```
src/
  proxy.ts                   guarda de sessão (convenção Next 16; não é middleware.ts)
  app/
    (auth)                   login, trocar-senha, solicitar-acesso, auth/confirm, sem-acesso
    executiva/               sumário executivo (preview)
    performance/             Geral (preview), Trips, Corporativo, Weddings
    financeiro/              fluxo-caixa (+ gerencial), acervo, calculadora-rateio, faturamento-corp
    metas/ (+ cadastro/)     Acompanhamento e Cadastro de metas  ← v5.0.0
    solicitacoes/            caixa/minhas/gestão
    admin/                   uploads, acessos, solicitacoes (+ movimentacoes), design-system
    api/                     Route Handlers (dashboard/*, gerencial/import, admin/*, auth/*)
    loading.tsx              skeletons por segmento pesado (ADR-0144)
  components/
    ui/                      primitivos do DS (Button, Input/Select/Textarea, Badge, Card, Tabs…)
    layout/                  sidebar, app-shell, header, theme-provider, nav-group, version-history
    shared/                  drawers, card-tabela, valor-contabil, skeletons, scroll-auto-hide, pills…
    charts/                  primitivos Recharts (tema, eixos, legenda, tooltip)
    performance/ weddings/ executiva/   KPIs e gráficos por setor
    financeiro/              fluxo de caixa, gerencial, faturamento, acervo, calculadora-rateio
    metas/                   MetaProgressBar, cards, grade de cadastro  ← v5.0.0
    onboarding/              modal de boas-vindas Janus
    solicitacoes/ admin/
  lib/
    auth/                    areas.ts (catálogo RBAC) · sessao.ts (requireArea*)
    supabase/                clients server (async, per-request) / browser / admin (service role)
    carga/                   parsers isomórficos de ingestão + coercao.ts (canônico) + Web Worker
    gerencial/               parser do fluxo de caixa gerencial
    email/                   camada server-only de e-mail (fallback-safe; modo teste)
    faturamento/ asaas/      emissão de boletos/NF, status, juros/multa, cliente Asaas
    rateio/                  calculadora de rateio
    metas/                   ritmo, período, rpc-metas  ← v5.0.0
    config.ts · fmt.ts · periodo.ts · version.ts · schemas-rpc.ts · rpc.ts · …
  data/
    changelog-diretoria.ts   histórico de versões em linguagem de negócio (modal)
  types/
    api.ts · database.ts

supabase/
  migrations/                evolução do schema + RPCs (165 arquivos, até 0176)
  seed/                      seed local (supabase/seed/data/ é git-ignored)
  config.toml                expõe só public + graphql_public; max_rows = 1000

scripts/
  db-gate/                   backup-gate de migrations (migrate.mjs, gate.mjs, classificar.mjs…)

docs/
  adr/                       Architecture Decision Records (126)
  briefings/                 briefings e out-briefings por versão
  runbooks/                  runbooks operacionais (auth, e-mail, backup-gate…)
  audits/ · design-system.md · email-layout-guide.md · changelog.md · bugs-resolvidos.md
```

## Convenções

- **Design System Welcome** (`docs/design-system.md`, `/admin/design-system`): cores via **tokens CSS**, nunca hex hardcoded — cor crua/hex em classe **quebra o lint** (`wt/no-cor-hardcoded`). Cor por aba resolvida via `[data-theme]` no `<html>`.
- **Primitivos únicos:** UI nova usa os componentes de `src/components/ui/` e os gráficos os primitivos de `@/components/charts` (sólido = realizado, tracejado = projeção/referência) — não reinventa botão/campo/eixo.
- **Coerção de célula** (número/data/string) vem só de `@/lib/carga/coercao.ts` — reimplementar quebra o lint (`wt/no-coercao-reimpl`).
- **Fuso e formatação:** `timestamptz` sempre exibido em São Paulo via `fmtDataSP`/`fmtDataHoraSP` (`Intl` + `timeZone`), nunca split de string. Casas decimais por contexto (`fmtBRL2` em operação individual, `fmtMi`/`fmtAxisBRL` em agregados).
- **Ingestão pesada** (upload/parse de planilha) → **API Route** (`runtime = 'nodejs'`), nunca Server Action; parse client-side vai em **Web Worker**.
- **E-mail** → camada única `src/lib/email/` (server-only), **fallback-safe** (nunca lança; falha de SMTP não quebra o fluxo). E-mail interno = marca **Janus**; e-mail de cliente (fatura) = marca **Welcome**, intocável.
- **Versionamento X.Y.Z** (ADR-0084): MAJOR quebra premissa de domínio; MINOR capacidade; PATCH correção/polimento. `CHANGELOG.md` no formato Keep-a-Changelog; entrada de negócio em `src/data/changelog-diretoria.ts` a cada versão.
- **Processo de versão** (ver `CLAUDE.md`): briefing → worktree por versão → missões (Conventional Commits em pt-BR) → gates (`build`/`tsc`/`lint`/`test`) → auto-auditoria adversarial → out-briefing → PR. **O merge e o deploy são do usuário.**

## Pré-requisitos

- Node.js 20+
- npm
- Acesso ao projeto Supabase remoto (CLI via `npx supabase …`)
- `.env.local` preenchido (ver abaixo)

## Setup local

```bash
npm install
cp .env.example .env.local   # e preencha as variáveis
```

Variáveis de ambiente (ver `.env.example` para as notas completas):

```bash
# Supabase (obrigatórias)
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>   # sensível — só backend/seed/server-side
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>

# E-mail SMTP (opcional — sem elas, a senha provisória fica só na tela)
SMTP_HOST= SMTP_PORT= SMTP_SECURE= SMTP_USER= SMTP_PASS= SMTP_FROM=

# Faturamento — envio de e-mail de fatura (server-only)
EMAIL_MODO=teste            # != 'real' (ou ausente) = modo teste (fail-safe)
EMAIL_TESTE_DESTINO=        # obrigatório em teste: todos os e-mails vão para cá
APP_BASE_URL=               # URL canônica p/ o link "Acessar a plataforma" no e-mail

# Asaas — boletos/NF do Faturamento Corporativo (sandbox-first)
ASAAS_API_KEY=              # chave do ambiente correspondente (sandbox ≠ produção)
ASAAS_BASE_URL=             # vazio = SANDBOX; produção só ao definir a URL de prod
```

> `SUPABASE_SERVICE_ROLE_KEY`, `SMTP_PASS` e `ASAAS_API_KEY` são sensíveis — nunca exponha no cliente nem comite valores reais. As variáveis de e-mail/Asaas precisam existir **também** no ambiente da Vercel.

## Banco de dados

```bash
npx supabase migration list            # inspecionar local vs remote (read-only, seguro)
npm run db:migrate -- --aditiva        # aplica migration ADITIVA (backup-gate como rede → push auto)
npm run db:migrate -- --destrutiva     # backup-gate + push COM CONFIRMAÇÃO HUMANA (não auto)
```

> **Produção direta, sem staging:** `--linked` aplica no banco de **produção**. O wrapper `npm run db:migrate` roda um **backup-gate** antes do push (backup-do-dia + checagem de completude + restore-test spot num schema descartável) — uma **rede de recuperação**, não autorização. Migration **aditiva** roda em regime autônomo sob o gate; migration **destrutiva** (`DROP`/`TRUNCATE`/`ALTER` que remove dado) **exige confirmação humana** e é abortada em stdin não-TTY. Runbook: `docs/runbooks/db-backup-gate-runbook.md`.

## Carga de dados

**Seed local** (lê arquivos em `supabase/seed/data/`, pasta git-ignored):

```bash
npm run seed
```

O seed limpa as tabelas dinâmicas, insere os dados crus, recarrega metas, transforma `raw`→`analytics`, regenera `analytics.dim_operacao_weddings` e atualiza as materialized views.

**Carga manual pela UI:** `/admin/uploads` (Vendas, Lançamentos, Contas a pagar/receber, Títulos do Fluxo de Caixa, Pessoas). Cada importação **substitui toda a base** correspondente. Vendas usa um **pipeline atômico** (staging → validação → promoção em transação): uma carga com erro faz ROLLBACK e **não esvazia** a base viva.

## Rodando a aplicação

```bash
npm run dev      # desenvolvimento
npm run build    # build de produção
npm run start    # serve o build
```

Checks de fechamento (gates):

```bash
npm run lint       # eslint (regras de DS + coerção)
npx tsc --noEmit   # typecheck (não há script dedicado — rode assim)
npm run build      # build de produção
npm test           # vitest (unit + contrato de RPC)
```

## Scripts

| Script | Uso |
|--------|-----|
| `npm run dev` | Servidor Next local |
| `npm run build` | Build de produção |
| `npm run start` | Serve o build |
| `npm run lint` | ESLint |
| `npm test` | Vitest (unit + contrato de RPC) |
| `npm run test:watch` | Vitest em watch |
| `npm run seed` | Carga completa via Supabase service role |
| `npm run db:migrate` | Aplica migration com backup-gate (`-- --aditiva` / `-- --destrutiva`) |
| `npm run db:gate` | Roda só o backup-gate (backup + restore-test spot) |

## Testes

Há uma suíte **Vitest** (~29 arquivos de teste em `src/`), rodada no gate de fechamento (`npm test`). Cobre helpers puros e — o mais crítico — o **contrato das RPCs** (`rpc-contrato.test.ts` roda `safeParse` dos schemas Zod contra a RPC viva) e a **paridade RBAC** app↔banco (`areas.test.ts`). Também protege tokens-âncora do DS (`tokens.test.ts`), a coerção de célula (`coercao.test.ts` + sonda de lint), o tokenizer do backup-gate e os módulos de e-mail, faturamento e metas.

## Segurança (estado atual)

- **Toda a plataforma está atrás de autenticação e RBAC** (4 camadas: `proxy.ts` → página → API → action; ver [Autenticação e permissões](#autenticação-e-permissões)). Rotas administrativas sensíveis (`/admin/uploads`, `/admin/acessos`) exigem a área correspondente; não há mais superfície aberta sem sessão além das telas de auth e do auto-cadastro (`solicitar_acesso`, com rate-limit).
- `anon` não executa nenhuma RPC de dado; RLS é **deny-by-default** (sem policy permissiva `USING true`) em todas as tabelas dos schemas. O app nunca acessa tabela direto — sempre via RPC `SECURITY DEFINER` com `search_path` fixo e `exigir_acesso`.
- A `SUPABASE_SERVICE_ROLE_KEY` (e `ASAAS_API_KEY`, `SMTP_PASS`) só são usadas server-side. Nunca no cliente.
- **Faturamento e e-mail são sandbox-first / fail-closed:** Asaas usa o **sandbox** por padrão (produção só ao definir `ASAAS_BASE_URL`); o e-mail de fatura roda em **modo teste** por padrão (todos os destinatários viram `EMAIL_TESTE_DESTINO`; sem ele, o envio é recusado — nunca vaza para o cliente).

## Documentação

- **`CLAUDE.md`** — como se trabalha no projeto (workflow, comandos, banco, convenções, salvaguardas). Documento vivo, fonte da verdade operacional.
- **`docs/adr/`** — decisões arquiteturais (126 ADRs; a numeração real é a fonte da verdade).
- **`docs/runbooks/`** — procedimentos operacionais (auth, e-mail/SMTP, upload de Vendas, backup-gate).
- **`docs/design-system.md`** e **`docs/email-layout-guide.md`** — padrões visuais e de e-mail.
- **`CHANGELOG.md`** (técnico) e **`src/data/changelog-diretoria.ts`** (negócio, lido pelo modal de versão).

## Limitações conhecidas

- **`/executiva` e `/performance` (Geral)** ainda estão **em construção** — só renderizam com `?preview=1` na URL.
- A migration destrutiva **`0176`** (aposenta o dashboard de metas legado, removendo 4 RPCs órfãs) está **preparada mas pendente de aplicação humana** — o Acompanhamento de Metas (v5.0.0) já é a tela viva; o dashboard v1 só sai do banco após aplicar a 0176.
- **Sem ambiente de staging:** migrations vão direto para produção (mitigado pelo backup-gate). Ver `CLAUDE.md` § Banco de dados.
