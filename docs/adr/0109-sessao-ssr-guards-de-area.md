# ADR 0109 — Sessão SSR (@supabase/ssr) e guards de área no app

**Status:** Aceito
**Data:** Junho/2026
**Versão:** v4.13

## Contexto

Os três clientes Supabase do app eram *singletons sem sessão* (`persistSession: false`,
anon key). Para o enforcement do ADR-0108, o JWT do usuário precisa fluir do browser ao
Postgres em todas as superfícies (RSC, route handlers, server actions, client
components), e os guards de área precisam de um ponto único e barato por request.

## Decisão

1. **`getServerClient()` vira assíncrono e por-request** (`createServerClient` +
   `cookies()` do Next): cada request usa a sessão do chamador; RPCs correm como
   `authenticated` (timeout 8s, antes 3s do anon). Todos os ~30 call sites passam a
   `await getServerClient()`.
2. **`getBrowserClient()` vira `createBrowserClient`** (sessão em cookies,
   compartilhada com o servidor) — drawers/client components que chamam RPC direto
   carregam o JWT automaticamente.
3. **`getAdminClient()` (service role) permanece como está** — uso exclusivo
   server-side para cargas, gerencial e operações `auth.admin` (convites).
4. **`middleware.ts`**: refresh de sessão (padrão `getAll`/`setAll` do `@supabase/ssr`)
   + gate global: sem sessão → página redireciona a `/login?next=…`, API responde 401.
   Públicos: `/login`, `/auth/*`, assets. O middleware **não** consulta permissões
   (latência) — área é responsabilidade dos guards.
5. **`getSessaoComPermissoes()`** com `React.cache()`: 1 chamada de
   `get_minhas_permissoes()` por request, compartilhada entre layout (sidebar), página
   e guards. `requireArea(area)` redireciona `/login` (sem sessão) ou `/sem-acesso`
   (sem permissão); `requireAreaApi` retorna 401/403 JSON; `requireAreaAction` lança.
6. **Sidebar permission-driven**: o RootLayout (server) injeta sessão+permissões no
   `AppShell`; itens/subitens só aparecem com permissão; rodapé ganha identidade do
   usuário + "Sair" (POST `/auth/signout`). Sem sessão, o shell renderiza sem chrome
   (login em tela cheia).
7. **`/` redireciona para a primeira área permitida** (ordem: executiva → performance/*
   → financeiro → metas → admin) ou `/sem-acesso`.

## Alternativas consideradas

- **Permissões no middleware (edge)** — descartada: uma query por navegação no edge +
  duplicação do mapa de áreas; os guards por página/rota já cobrem com cache por request,
  e o banco é o backstop de qualquer rota esquecida.
- **Permissões em claims do JWT** — descartada no ADR-0107 (janela de staleness).
- **Singleton síncrono com sessão "global"** — inviável/perigoso em servidor: sessão é
  por-request; singleton vazaria sessão entre usuários.
- **Proteção por layout só (`/admin/layout.tsx` etc.)** — descartada como mecanismo
  único: layouts não protegem route handlers nem server actions; o guard explícito por
  superfície + backstop no banco é auditável rota a rota.

## Consequências

- Mudança mecânica ampla (await em ~30 call sites) — varredura única, sem mudança de
  comportamento para usuário autorizado (S7).
- Páginas todas dinâmicas por sessão (já eram, exceto `/financeiro` estática — passa a
  dinâmica; custo irrelevante para app interno).
- Qualquer rota nova nasce protegida por padrão: middleware exige sessão mesmo se o
  dev esquecer o guard de área, e o banco nega dados de área não permitida.
