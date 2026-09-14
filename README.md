# Janus

Plataforma financeira **interna** do **Welcome Group**. Centraliza os dados da empresa numa base
analítica única — no lugar de Power BI, RPA e planilhas soltas — com controle de acesso por área,
contratos de dados validados e visões por unidade de negócio: **Weddings**, **Trips** e
**Corporativo**.

O nome interno é **Janus**, o deus de duas faces: uma olha os dados do passado, a outra as
projeções à frente. **O cliente externo nunca vê "Janus"** — boleto, nota fiscal e e-mail de fatura
são 100% marca **Welcome** (ADR-0145). O repositório ainda se chama `wt-finance`, por enquanto.

> **Novo por aqui?** Este README diz o que é e como rodar. Para entender **como o sistema pensa** —
> de onde vem cada número, os dois regimes contábeis, as decisões vigentes — leia
> **[`docs/estado-do-projeto.md`](docs/estado-do-projeto.md)**.

---

## Estado

Produção na **v5.9.7**. O quadro completo — migration e ADR correntes, tamanho da suíte, contagem
de documentos — tem um dono só, e é
[`docs/estado-do-projeto.md` §11](docs/estado-do-projeto.md#11-estado-atual); repetir os números
aqui garantiria que um dos dois ficasse para trás.

O que está em voo agora: [`docs/WORKING-CONTEXT.md`](docs/WORKING-CONTEXT.md).
O que ficou para depois: [`docs/backlog-v6.md`](docs/backlog-v6.md).

## Stack

**Next.js 16.3.4** (App Router) · **React 19.2.4** · **TypeScript** estrito ·
**Tailwind CSS 4** · **Recharts 3** · `lucide-react` · padrão visual shadcn/ui ·
**Supabase / Postgres** via PostgREST (`@supabase/ssr` + `@supabase/supabase-js`) ·
**Zod 4** (contrato de RPC) · `@e965/xlsx` (planilhas) · `nodemailer` (e-mail) ·
**Vitest** · Deploy **Vercel** (automático no merge para `main`).

## Como rodar

**Pré-requisitos:** Node.js 20.9+ (o `.nvmrc` fixa 24), npm, acesso ao projeto Supabase remoto
(CLI sempre por `npx supabase …`, não é global) e um `.env.local` preenchido.

```bash
npm install
cp .env.example .env.local   # e preencha — as notas de cada chave estão lá
npm run dev
```

Chaves obrigatórias: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`. As de SMTP, Asaas, Monde e cron são opcionais no desenvolvimento e
estão documentadas em `.env.example`.

> `SUPABASE_SERVICE_ROLE_KEY`, `SMTP_PASS`, `ASAAS_API_KEY`, `MONDE_API_KEY` e `CRON_SECRET` são
> **sensíveis**: só server-side, nunca no cliente, nunca com valor real no repositório. As de
> e-mail, Asaas e Monde precisam existir **também** no ambiente da Vercel.

### Gates

```bash
npx tsc --noEmit   # typecheck — NÃO existe "npm run typecheck"
npm run lint       # eslint (inclui as regras wt/* do projeto)
npm run build
npm test           # vitest: unidade + contrato de RPC contra o banco vivo
```

### Banco

```bash
npx supabase migration list            # local vs remoto — read-only, seguro
npm run db:migrate -- --aditiva        # backup-gate → push (autônomo sob o gate)
npm run db:migrate -- --destrutiva     # backup-gate → push COM CONFIRMAÇÃO HUMANA (TTY)
npm run db:gate                        # só o backup-gate
```

> **Produção direta, sem staging.** O wrapper roda um backup-gate antes do push (backup do dia +
> checagem de completude + restore-test num schema descartável) — é **rede de recuperação, não
> autorização**. Migration **destrutiva** (`DROP`/`TRUNCATE`/`ALTER` que remove dado) exige
> confirmação humana em TTY e é abortada em stdin não-interativo (ADR-0131). E **`db push` empurra
> todo o conjunto pendente**: destrutiva não fica estacionada em `supabase/migrations/` — fica em
> `supabase/patches/` até a hora. Runbook: [`docs/runbooks/db-backup-gate-runbook.md`](docs/runbooks/db-backup-gate-runbook.md).

### Carga de dados

```bash
npm run seed     # seed local; lê supabase/seed/data/ (pasta git-ignored)
```

Na aplicação, a carga é por **`/admin/uploads`** (Vendas, Lançamentos por Operação, Contas,
Títulos, Pessoas, Demonstrativo de Competência). Cada importação **substitui a base inteira**
correspondente. Vendas tem pipeline atômico — staging → validação → promoção em transação —, então
uma carga com erro faz ROLLBACK e **não esvazia** a base viva.

## O que tem em cada tela

| Área | Rota | O que é |
|---|---|---|
| Executiva | `/executiva` | KPIs consolidados do Grupo. **Em construção** — só com `?preview=1` |
| Performance — Geral | `/performance` | Visão cross-setor. **Em construção** — só com `?preview=1` |
| Performance — Trips | `/performance/trips` | KPIs, Mix por Produto, Top Vendedores, Vendas em Aberto, Receita Negativa |
| Performance — Weddings | `/performance/weddings` | A mais madura: carteira Vendas×Entregas, próximos casamentos, KPIs por subsetor com drawer, fluxo por operação, lista de operações |
| Performance — Corporativo | `/performance/corporativo` | Mesma visão de Trips, identidade própria |
| Fluxo de Caixa | `/financeiro/fluxo-caixa` | Regime caixa-banco, calendário de liquidez, próximos lançamentos, posição por conta |
| Gerencial | `/financeiro/fluxo-caixa/gerencial` | Planilha de previsão curada e editável, com diário e desfazer |
| DRE | `/financeiro/dre` | Por **Caixa** e por **Competência**, com a ponte entre os dois regimes; estrutura editável em `/estrutura` e `/estrutura-competencia` |
| Faturamento Corporativo | `/financeiro/faturamento-corp` | Boletos e NFS-e via Asaas, disparo de e-mail, cadastro de clientes |
| Acervo de Documentos | `/financeiro/acervo` | Biblioteca de documentos (RBAC em dois níveis: ver × gerir) |
| Calculadora de Rateio | `/financeiro/calculadora-rateio` | Upload de fatura → cruzamento read-only com vendas por setor |
| Metas | `/metas`, `/cadastro`, `/comparacao`, `/tv` | Realizado × meta por setor, cadastro em grade anual, comparação e Modo TV |
| Inventário de Ativos | `/gestao-pessoas/inventario` | Ativos, detentores e movimentações |
| Solicitações | `/solicitacoes` | Abrir / minhas / caixa (dois níveis de acesso) |
| Admin | `/admin/uploads`, `/acessos`, `/solicitacoes`, `/api-externa`, `/design-system` | Carga, usuários e roles, tipos de solicitação, chaves da API externa, catálogo do DS |

Fora do AppShell: `/login`, `/trocar-senha`, `/solicitar-acesso`, `/auth/confirm` e `/sem-acesso`.

## Acesso e permissões

Login obrigatório em toda a plataforma (Supabase Auth), por **e-mail + senha**; o magic link
(`/auth/confirm`) é recuperação/anti-lockout. Admin cria usuário com **senha provisória exibida na
tela**, e uma flag força a troca no primeiro acesso.

A unidade de permissão é a **área de navegação** — em Performance, granular por setor (ADR-0107). O
catálogo vive em `src/lib/auth/areas.ts` e é **espelhado** em `app.rbac_areas`, com a paridade
provada em `rpc-contrato.test.ts`.

**Enforcement em três camadas**, cada uma cobrindo uma falha diferente: `src/proxy.ts` (portão de
sessão na borda; rotas com auth própria são isentas por ADR-0153) → `requireArea` /
`requireAreaApi` / `requireAreaAction` (portão de área no app) → **`app.exigir_acesso()` inline
dentro de cada RPC**, que é o que protege o *dado* e não só a tela.

`anon` não executa nenhuma RPC de dado (só `solicitar_acesso`, com rate-limit). RLS é
**deny-by-default** em todas as tabelas, e o app nunca toca tabela direto.

## Estrutura de pastas

```
src/
  proxy.ts                 portão de sessão (convenção Next 16 — não é middleware.ts)
  app/                     rotas (App Router): páginas, Server Actions e api/ (Route Handlers)
  components/
    ui/                    primitivos do DS (Button, Input, Badge, Card, Tabs…)
    layout/ shared/        AppShell, sidebar, drawers, tabelas, pills, skeletons
    charts/                primitivos Recharts (tema, eixos, legenda, tooltip)
    performance/ weddings/ executiva/ financeiro/ metas/ solicitacoes/ admin/
  lib/
    auth/                  areas.ts (catálogo RBAC) · sessao.ts (requireArea*)
    supabase/              clients server (por request) / browser / admin (service role)
    carga/                 parsers isomórficos + coercao.ts (canônico) + Web Worker
    dre/ monde/ metas/ asaas/ faturamento/ email/ api-externa/ patrimonio/ cdi/
  data/changelog-diretoria.ts     histórico em linguagem de negócio (modal de versão)
  types/                   api.ts · database.ts (GERADO — ver ADR-0173)

supabase/
  migrations/              evolução do schema e das RPCs
  patches/                 migration destrutiva ANTES da hora de aplicar (fora do db push)
  seed/                    seed local (supabase/seed/data/ é git-ignored)
  config.toml              expõe só public + graphql_public; max_rows = 1000

scripts/db-gate/           backup-gate (migrate.mjs, gate.mjs, classificar.mjs, lib.mjs)
eslint-rules/              regras wt/* (no-cor-hardcoded, no-coercao-reimpl)
.claude/                   o harness: skills, agentes, hooks, rituais

docs/
  adr/                     Architecture Decision Records — a numeração real é a verdade
  briefings/               briefings e out-briefings por versão (v5+)
  runbooks/                backup-gate · auth (kill switch) · e-mail/SMTP
  investigacoes/           medições que ninguém vai refazer
  estado-do-projeto.md · WORKING-CONTEXT.md · backlog-v6.md · email-layout-guide.md
```

## Como se trabalha aqui

O processo é o assunto do **[`CLAUDE.md`](CLAUDE.md)** — leia-o antes de abrir uma versão. Em
resumo: briefing → worktree própria → missões com um commit cada (Conventional Commits em pt-BR) →
gates escalonados → revisão → auto-auditoria adversarial → out-briefing → PR. **O merge e o deploy
são sempre do usuário**; nenhum agente mergeia.

As convenções de código não negociáveis — cor só por token, coerção de célula de um módulo só, RPC
nova com `exigir_acesso` inline, `timestamptz` sempre formatado em São Paulo — estão em
`docs/estado-do-projeto.md` §7, e o "como fazer" de cada domínio, nas skills de `.claude/skills/`.

## Onde está cada coisa

| Procuro… | Está em |
|---|---|
| como o sistema funciona e de onde vem cada número | `docs/estado-do-projeto.md` |
| como se trabalha (workflow, banco, salvaguardas) | `CLAUDE.md` |
| por que uma decisão foi tomada | `docs/adr/` |
| o que está em voo agora | `docs/WORKING-CONTEXT.md` |
| o que ficou para depois | `docs/backlog-v6.md` |
| o que mudou em cada versão | `CHANGELOG.md` (técnico) · `src/data/changelog-diretoria.ts` (negócio) |
| como operar o backup-gate, a auth de emergência, o e-mail | `docs/runbooks/` |
| padrões visuais | a página `/admin/design-system` + skill `ui-design-system` |
| padrões de e-mail | `docs/email-layout-guide.md` |
| o que aquela medição deu | `docs/investigacoes/` |

## Limitações conhecidas

- **`/executiva` e `/performance` (Geral)** seguem em construção — só renderizam com `?preview=1`.
- **Sem ambiente de staging:** migration vai direto para produção, mitigada pelo backup-gate.
- **Sem CI:** os gates são disciplina local, rodados pela sessão antes do PR (item B-16 do backlog).
- O `npm test` inclui **contrato de RPC contra o banco vivo** — sem `.env.local` esses casos se
  auto-pulam, e uma sonda reprova a suíte se isso acontecer em silêncio.
