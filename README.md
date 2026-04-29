# WT Finance

Dashboard analítico de performance de vendas da Welcome Trips.  
Substitui o dashboard Power BI (RPA + Excel) com ganhos analíticos e base técnica para crescimento.

**Stack:** Next.js 16 · TypeScript · Supabase · shadcn/ui · Recharts · Vercel

---

## Pré-requisitos

- Node.js 20+
- Conta no [Supabase](https://supabase.com) (projeto provisionado em São Paulo)
- Conta no [Vercel](https://vercel.com) (conectada ao repositório GitHub)

---

## Setup local

### 1. Instalar dependências

```bash
npm install
```

### 2. Configurar variáveis de ambiente

Copie o template e preencha com os valores do painel do Supabase:

```bash
cp .env.example .env.local
```

Preencha em `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://<projeto>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<chave anon>
SUPABASE_SERVICE_ROLE_KEY=<chave service_role>   # apenas para o seed local
```

> **Atenção:** `SUPABASE_SERVICE_ROLE_KEY` nunca vai para o Vercel. Usada apenas no `npm run seed` local.

### 3. Aplicar migrations no Supabase

Acesse o **SQL Editor** do painel do Supabase e execute os arquivos em ordem:

```
supabase/migrations/0001_init_schemas.sql
supabase/migrations/0002_dimensions.sql
supabase/migrations/0003_facts.sql
supabase/migrations/0004_app_tables.sql
supabase/migrations/0005_audit_tables.sql
supabase/migrations/0006_views.sql
supabase/migrations/0007_rls_policies.sql
```

**Validação após aplicar:**

```sql
-- Deve retornar 3 linhas: Lazer, Weddings, Corporativo
SELECT * FROM analytics.dim_setor_macro;

-- Deve retornar ~2557
SELECT COUNT(*) FROM analytics.dim_data;

-- Deve listar todas as tabelas criadas
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_schema IN ('raw', 'analytics', 'app', 'audit')
ORDER BY table_schema, table_name;
```

### 4. Carregar dados (Missão 2)

As planilhas Excel devem ser colocadas em `supabase/seed/data/` (pasta ignorada pelo git):

```
supabase/seed/data/VendasPorProduto2024.xlsx
supabase/seed/data/VendasPorProduto2025.xlsx
supabase/seed/data/VendasPorProduto2026.xlsx
```

Depois, rodar o seed:

```bash
npm run seed
```

> O script `seed` ainda não existe — será implementado na Missão 2.

### 5. Rodar localmente

```bash
npm run dev
```

Acesse [http://localhost:3000](http://localhost:3000).

---

## Deploy

Push em `main` dispara deploy automático no Vercel.

Variáveis de ambiente necessárias no Vercel (sem a service_role):

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

---

## Estrutura do projeto

```
src/
  app/
    (dashboard)/     # página principal do dashboard
    api/dashboard/   # Route Handlers (APIs)
    layout.tsx
  components/
    dashboard/       # componentes do dashboard
    ui/              # shadcn/ui
  lib/
    supabase/        # clientes browser/server/admin
    formatters.ts    # formatBRL, formatPct, etc.
    types.ts         # tipos de resposta das APIs
  types/
    database.ts      # tipos do schema Supabase

supabase/
  migrations/        # migrations SQL (0001–0007)
  seed/
    seed.ts          # script de carga (M2)
    data/            # planilhas .xlsx (gitignored)

docs/
  adr/               # Architecture Decision Records
  briefings/         # briefing técnico do projeto
```

---

## Missões (status)

| Missão | Foco                       | Status       |
|--------|----------------------------|--------------|
| M1     | Modelagem do banco         | ✅ Concluída  |
| M2     | Carga dos dados            | 🔲 Pendente  |
| M3     | APIs (Route Handlers)      | 🔲 Pendente  |
| M4     | Frontend (componentes)     | 🔲 Pendente  |
| M5     | Filtros, polimento, deploy | 🔲 Pendente  |

---

## Decisões arquiteturais

Registradas em [`docs/adr/`](docs/adr/):

- [ADR 0001 — Stack inicial](docs/adr/0001-stack-inicial.md)
- [ADR 0002 — Modelagem do banco](docs/adr/0002-modelagem-banco.md)

---

> Metas 2024 e 2025 são fictícias — calculadas com decréscimo de 15% a.a. sobre 2026.
