# wt-finance

Plataforma financeira interna da Welcome Trips — gestão de receitas, despesas, repasses e relatórios financeiros para operações de turismo.

---

## Visão

O **wt-finance** centraliza o controle financeiro da Welcome Trips, eliminando planilhas dispersas e oferecendo visibilidade em tempo real sobre o fluxo de caixa, comissões de parceiros e saúde financeira por produto/destino.

**Princípios:**
- Dados confiáveis como primeira prioridade
- Interface simples para operadores não-técnicos
- Auditabilidade completa de todas as transações
- Deploy contínuo sem downtime

---

## Stack

| Camada | Tecnologia | Motivo |
|--------|-----------|--------|
| Frontend | [Next.js 15](https://nextjs.org) (App Router) | SSR, rotas de API, performance |
| Linguagem | TypeScript 5 | Segurança de tipos end-to-end |
| Banco de dados | [Supabase](https://supabase.com) (PostgreSQL) | Auth, RLS, realtime, storage |
| Deploy | [Vercel](https://vercel.com) | Integração nativa Next.js, preview deploys |
| Estilo | Tailwind CSS + shadcn/ui | Velocidade de desenvolvimento |
| Testes | Vitest + Playwright | Unit, integração e E2E |

---

## Setup

### Pré-requisitos

- Node.js >= 20
- pnpm >= 9
- Supabase CLI (`npm i -g supabase`)
- Conta Vercel (para deploy)

### Instalação

```bash
# 1. Clone o repositório
git clone https://github.com/welcometrips/wt-finance.git
cd wt-finance

# 2. Instale as dependências
pnpm install

# 3. Configure as variáveis de ambiente
cp .env.example .env.local
# Edite .env.local com suas credenciais Supabase

# 4. Suba o Supabase localmente
supabase start

# 5. Execute as migrations
supabase db push

# 6. Inicie o servidor de desenvolvimento
pnpm dev
```

### Variáveis de ambiente

```env
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

---

## Scripts

| Comando | Descrição |
|---------|-----------|
| `pnpm dev` | Servidor de desenvolvimento (localhost:3000) |
| `pnpm build` | Build de produção |
| `pnpm start` | Servidor de produção local |
| `pnpm lint` | ESLint + TypeScript check |
| `pnpm test` | Testes unitários (Vitest) |
| `pnpm test:e2e` | Testes E2E (Playwright) |
| `pnpm db:migrate` | Aplica migrations pendentes |
| `pnpm db:reset` | Reseta banco local e reaplicar migrations |
| `pnpm db:types` | Gera tipos TypeScript a partir do schema Supabase |

---

## Estrutura de pastas

```
wt-finance/
├── src/
│   ├── app/               # Rotas Next.js (App Router)
│   │   ├── (auth)/        # Grupo: páginas de autenticação
│   │   ├── (dashboard)/   # Grupo: área autenticada
│   │   └── api/           # Route Handlers
│   ├── components/        # Componentes React reutilizáveis
│   │   ├── ui/            # Primitivos (shadcn/ui)
│   │   └── finance/       # Componentes de domínio
│   ├── lib/               # Utilitários e configurações
│   │   ├── supabase/      # Clients Supabase (server/client/middleware)
│   │   └── utils/         # Funções auxiliares
│   └── types/             # Tipos TypeScript globais e de domínio
├── supabase/
│   ├── migrations/        # Migrations SQL versionadas
│   └── seed.sql           # Dados iniciais para desenvolvimento
├── docs/
│   └── adr/               # Architecture Decision Records
├── public/                # Assets estáticos
├── tests/                 # Testes E2E (Playwright)
└── .env.example           # Template de variáveis de ambiente
```

---

## Contribuição

1. Crie uma branch a partir de `main`: `git checkout -b feat/nome-da-feature`
2. Faça commits atômicos com mensagens no padrão [Conventional Commits](https://www.conventionalcommits.org)
3. Abra um Pull Request descrevendo o que muda e por quê
4. PRs requerem aprovação de pelo menos 1 revisor antes do merge
5. O merge é feito via **Squash and merge** para manter o histórico limpo

### Padrão de commits

```
feat: adiciona relatório de fluxo de caixa mensal
fix: corrige cálculo de comissão para pacotes compostos
chore: atualiza dependências de segurança
docs: documenta decisão de usar RLS no Supabase
```

---

## Architecture Decision Records

Decisões arquiteturais relevantes estão documentadas em [docs/adr/](docs/adr/).

| ADR | Título |
|-----|--------|
| [0001](docs/adr/0001-stack-inicial.md) | Stack inicial: Next.js + Supabase + Vercel + TypeScript |

---

## Licença

Proprietário — Welcome Trips. Todos os direitos reservados.
