# ADR 0001 — Stack Inicial: Next.js + Supabase + Vercel + TypeScript

**Status:** Aceito  
**Data:** 2026-04-28  
**Autores:** Yan  

---

## Contexto

O wt-finance precisa de uma plataforma web para gestão financeira interna da Welcome Trips. O time é pequeno (1–3 devs), o prazo para o primeiro MVP é curto, e os requisitos incluem:

- Autenticação de usuários com controle de acesso por papel (admin, financeiro, operacional)
- Leitura e escrita de dados transacionais em tempo real
- Deploy rápido com preview por PR
- Custo operacional baixo na fase inicial
- Capacidade de escalar sem reescrever a base

---

## Decisão

Adotar a seguinte stack:

| Componente | Escolha |
|------------|---------|
| Framework web | **Next.js 15** (App Router) |
| Linguagem | **TypeScript 5** |
| Backend-as-a-Service | **Supabase** (PostgreSQL + Auth + Storage + Realtime) |
| Hospedagem / CI-CD | **Vercel** |
| Estilo | **Tailwind CSS** + **shadcn/ui** |

---

## Alternativas consideradas

### Framework: Next.js vs Remix vs SvelteKit

| Critério | Next.js | Remix | SvelteKit |
|---------|---------|-------|-----------|
| Ecossistema / comunidade | Maior | Médio | Crescendo |
| Integração Vercel | Nativa | Boa | Boa |
| App Router (RSC) | Sim | Não (loaders) | Não |
| Curva de aprendizado | Média | Alta | Baixa |

**Decisão:** Next.js — integração nativa com Vercel, React Server Components reduzem bundle JS no cliente, ecossistema maior facilita contratação futura.

### BaaS: Supabase vs Firebase vs PlanetScale + Clerk

| Critério | Supabase | Firebase | PlanetScale + Clerk |
|---------|---------|---------|---------------------|
| Banco relacional | PostgreSQL | NoSQL | MySQL |
| Row Level Security | Nativo | Regras Firestore | Via Clerk + app |
| Self-hostável | Sim | Não | Parcial |
| Custo inicial | Free tier generoso | Free tier generoso | Pago mais cedo |
| SQL puro | Sim | Não | Sim |

**Decisão:** Supabase — dados financeiros exigem relacional com ACID, RLS nativo simplifica autorização sem lógica extra no backend, e o free tier é suficiente para o MVP.

### Deploy: Vercel vs Fly.io vs AWS

**Decisão:** Vercel — preview deploys automáticos por PR são críticos para revisão de código, integração zero-config com Next.js, e custo zero na fase inicial.

---

## Consequências

**Positivas:**
- Time pode focar em produto em vez de infraestrutura
- RLS do Supabase garante isolamento de dados sem camada extra
- Preview deploys permitem QA antes de qualquer merge para produção
- Types gerados automaticamente pelo Supabase CLI eliminam drift entre schema e código
- PostgreSQL permite queries analíticas complexas (relatórios financeiros) sem ETL

**Negativas / riscos:**
- Vendor lock-in no Supabase (mitigado: é open-source e self-hostável)
- Vendor lock-in na Vercel para funcionalidades avançadas (Edge Functions, ISR)
- App Router do Next.js ainda tem rugosidades (caching complexo, Server Actions em evolução)
- Time precisa entender o modelo mental de RSC vs Client Components

**Mitigações planejadas:**
- Abstrair o cliente Supabase em `src/lib/supabase/` para facilitar eventual migração
- Manter lógica de negócio em funções puras sem dependência de framework
- Documentar decisões de caching explicitamente quando não-óbvias

---

## Referências

- [Next.js App Router docs](https://nextjs.org/docs/app)
- [Supabase Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)
- [Conventional Commits](https://www.conventionalcommits.org)
- [ADR GitHub — Michael Nygard](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)
