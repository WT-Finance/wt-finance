# WT Finance

Plataforma interna de acompanhamento e análise financeira da Welcome Trips.

O objetivo do projeto é centralizar os dados da empresa em uma base analítica única, substituindo fluxos baseados em Power BI, RPA e planilhas soltas por uma aplicação web com dados versionados, APIs próprias e visões executivas por área.

No estágio atual, a prioridade de desenvolvimento está na aba **Weddings**, conforme demanda da diretoria. A v3.5 consolidou a leitura analítica de casamentos, operações, carteira de vendas x entregas, próximos eventos e drill-down financeiro por operação.

## Stack

- Next.js 16.2.4 com App Router
- React 19
- TypeScript
- Supabase/Postgres
- Supabase SSR/client SDK
- Recharts
- Tailwind CSS 4
- Zod
- XLSX para ingestão de planilhas

## Pré-Requisitos

- Node.js 20+
- npm
- Acesso ao projeto Supabase remoto
- Supabase CLI global ou via `npx --yes supabase`
- Variáveis de ambiente locais preenchidas em `.env.local`

## Setup Local

Instale as dependências:

```bash
npm install
```

Crie o arquivo de ambiente:

```bash
cp .env.example .env.local
```

Preencha:

```bash
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
```

`SUPABASE_SERVICE_ROLE_KEY` é sensível. Use apenas no backend local, seed e rotas server-side. Não exponha no frontend.

## Banco De Dados

As migrations ficam em `supabase/migrations/` e devem ser aplicadas em ordem pelo Supabase CLI:

```bash
npx --yes supabase db push
```

Para conferir o estado local/remoto:

```bash
npx --yes supabase migration list
```

Até a v3.5, a migration mais recente é:

```text
0035_review_fixes.sql
```

Ela endurece o pipeline da aba Weddings, preserva metas em uploads de vendas, faz upsert real de metas, deriva a situação dos casamentos por data em tempo de consulta e adiciona índices para os caminhos mais usados.

## Carga De Dados

O seed local lê arquivos em `supabase/seed/data/`, pasta ignorada pelo Git.

Arquivos de vendas esperados:

```text
VendasPorProduto2024.xlsx
VendasPorProduto2025.xlsx
VendasPorProduto2026.xlsx
```

Arquivo opcional de lançamentos por operação:

```text
Lançamentos por Operação.csv
lancamentos.csv
lancamentos.xlsx
```

Execute:

```bash
npm run seed
```

O seed:

1. Limpa tabelas dinâmicas de vendas.
2. Insere dados raw de vendas.
3. Recarrega metas de 2024, 2025 e 2026.
4. Transforma raw em analytics.
5. Carrega lançamentos por operação, quando houver arquivo.
6. Regenera `analytics.dim_operacao_weddings`.
7. Atualiza views materializadas.

Também existe carga manual pela interface em:

```text
/admin/uploads
```

Essa tela aceita uploads de vendas e lançamentos. No estado atual, trate-a como rota administrativa sensível.

## Rodando A Aplicação

Desenvolvimento:

```bash
npm run dev
```

Produção local:

```bash
npm run build
npm run start
```

Checks principais:

```bash
npm run lint
./node_modules/.bin/tsc --noEmit --pretty false
npm run build
```

## Scripts

| Script | Uso |
|--------|-----|
| `npm run dev` | Sobe o servidor Next local |
| `npm run build` | Gera build de produção |
| `npm run start` | Serve o build |
| `npm run lint` | Executa ESLint |
| `npm run seed` | Executa carga completa via Supabase service role |

## Rotas Principais

| Rota | Descrição |
|------|-----------|
| `/` | Entrada da aplicação |
| `/executiva` | Sumário executivo e KPIs consolidados |
| `/metas` | Dashboard de metas mensais por setor |
| `/performance` | Área de performance geral |
| `/performance/trips` | Performance de Trips/Lazer |
| `/performance/corporativo` | Performance de Corporativo |
| `/performance/weddings` | Performance e análise operacional de Weddings |
| `/admin/uploads` | Upload manual de vendas e lançamentos |

## APIs Internas

As APIs são Route Handlers do App Router.

Principais grupos:

```text
src/app/api/dashboard/executiva/
src/app/api/dashboard/performance/
src/app/api/dashboard/weddings/
src/app/api/admin/
src/app/api/kpis/
src/app/api/ritmo-diario/
src/app/api/historico-mensal/
src/app/api/ranking-vendedores/
src/app/api/ranking-produtos/
```

Os endpoints de Weddings chamam RPCs SQL no Supabase para manter agregações, regras de negócio e filtros próximos dos dados.

## Estrutura

```text
src/
  app/
    api/                 Route Handlers
    admin/uploads/       Upload manual de arquivos
    executiva/           Aba Executiva
    metas/               Dashboard de metas
    performance/         Abas de performance
  components/
    dashboard/           Componentes da visão de metas
    executiva/           Componentes do sumário executivo
    performance/         Componentes de performance
    shared/              Componentes compartilhados
    weddings/            Componentes da aba Weddings
  lib/
    carga/               Parsers e rotinas de ingestão
    supabase/            Clientes Supabase browser/server/admin
    periodo.ts           Resolução de períodos e comparativos
  types/
    api.ts               Tipos de respostas das APIs
    database.ts          Tipos do schema Supabase

supabase/
  migrations/            Evolução do schema e RPCs SQL
  seed/                  Seed local e parsers auxiliares

docs/
  adr/                   Architecture Decision Records
  briefings/             Briefings do projeto
  changelog.md           Histórico funcional
  bugs-resolvidos.md     Registro de correções relevantes
```

## Dados E Convenções

- Schemas principais: `raw`, `analytics`, `app`, `audit`.
- Tabelas `raw` preservam dados próximos do arquivo de origem.
- Tabelas `analytics` concentram dimensões, fatos, views e funções analíticas.
- Metas ficam em `app.meta_setor`.
- Lançamentos por operação alimentam a análise específica de Weddings.
- A dimensão `analytics.dim_operacao_weddings` é reconstruída após carga de vendas/lançamentos.

## Status Funcional

| Área | Estado |
|------|--------|
| Modelagem Supabase | Implementada |
| Seed e upload de dados | Implementados |
| Aba Executiva | Implementada |
| Aba Metas | Implementada |
| Performance geral e por setor | Implementada |
| Weddings v3.5 | Implementada e em revisão |
| Autenticação/admin hardening | Próxima frente relevante |

## Documentação

Referências principais:

- `docs/changelog.md`
- `docs/bugs-resolvidos.md`
- `docs/adr/`
- `docs/briefings/`

ADRs recentes relevantes para Weddings:

- `docs/adr/0026-mapeamento-produto-subsetor-tabela.md`
- `docs/adr/0027-resultado-de-caixa-exclusivo-weddings.md`
- `docs/adr/0028-carga-manual-via-ui.md`
- `docs/adr/0029-admin-uploads-sem-auth.md`
- `docs/adr/0030-receita-bruta-receita-liquida-weddings.md`
- `docs/adr/0031-data-canonical-e-hotel-do-contrato.md`
- `docs/adr/0032-carteira-matrix-vendas-entregas.md`
- `docs/adr/0033-proximos-casamentos-substitui-pipeline.md`

## Observações Operacionais

- Não commite `.env.local` nem arquivos de dados em `supabase/seed/data/`.
- Não exponha `SUPABASE_SERVICE_ROLE_KEY` no cliente.
- Depois de alterar migrations, rode `npx --yes supabase db push` e confirme com `npx --yes supabase migration list`.
- Depois de alterar carga de dados ou RPCs de Weddings, valide `npm run lint`, `tsc`, `npm run build` e uma carga real/preview quando possível.
