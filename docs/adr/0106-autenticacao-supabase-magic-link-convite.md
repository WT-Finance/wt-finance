# ADR 0106 — Autenticação: Supabase Auth com magic link, cadastro só por convite

**Status:** Aceito
**Data:** Junho/2026
**Versão:** v4.13

## Contexto

O WT Finance rodou sem autenticação desde a v1 (decisão consciente, ADR-0029). A v4.13
implementa login obrigatório. Há histórico relevante: a primeira tentativa de auth
(branches `feature/v4-1-auth-bootstrap` / `feature/v4-2-login-proxy`, mai/2026) **foi
revertida em produção** (`revert/v4-auth-para-v3-3`) depois de uma cascata de correções
do **fluxo implícito**: tokens chegavam no *hash* da URL (`#access_token=…`), que nunca
alcança o servidor; o callback virou página client-side; cookies se perdiam em redirects
3xx. A migration da época (0024) nunca foi aplicada com esse número, mas deixou restos
no banco (`app.usuarios`, `app.convites`, `get_my_profile()` — tratados no ADR-0107).

## Decisão

1. **Supabase Auth** (GoTrue, já no projeto) com **magic link** como único método.
2. **Fluxo PKCE/token_hash via `@supabase/ssr`** (já era dependência): o e-mail leva a
   `/auth/confirm`, um **route handler** que verifica server-side
   (`verifyOtp({ token_hash })` ou `exchangeCodeForSession(code)` — os dois formatos
   são aceitos) e grava a sessão em **cookies httpOnly** pelo padrão `getAll`/`setAll`.
   Nada de token em hash, nada de callback client-side — elimina a classe inteira de
   bugs que derrubou a v4-2.
3. **Cadastro exclusivamente por convite**: o login usa
   `signInWithOtp({ shouldCreateUser: false })` — e-mail desconhecido **não cria conta**.
   Usuários nascem apenas via `auth.admin.inviteUserByEmail`/`createUser` (service role,
   chamados pela UI de administração). Não dependemos da config remota de signup.
4. Mensagem de login **anti-enumeração**: a UI responde o mesmo ("se o e-mail estiver
   cadastrado, você receberá um link") para e-mail existente ou não.
5. O e-mail do Supabase nativo tem **rate limit baixo** (poucas mensagens/hora). Para o
   volume real da diretoria isso basta no início; SMTP próprio fica documentado como
   melhoria na ativação. O convite pela UI também expõe **link de convite copiável**
   (gerado via `generateLink`, sem depender de entrega de e-mail).

## Alternativas consideradas

- **Clerk / Auth0 / WorkOS** — descartadas: segundo fornecedor de identidade ao lado do
  Supabase (que já guarda os dados e o RLS depende do `auth.uid()` dele); custo; e o
  RBAC dinâmico exigiria sincronizar permissões entre dois sistemas.
- **NextAuth/Auth.js** — descartada: camada extra sobre o mesmo GoTrue, sem ganho; o
  `auth.uid()` do Postgres (base do enforcement no banco) funciona nativamente com JWT
  do próprio Supabase.
- **Senha + magic link** — descartada: senha adiciona superfície (reset, política,
  vazamento) sem necessidade para ~dezena de usuários internos; magic link cobre o caso.
- **Fluxo implícito (como na v4-2)** — descartada com cicatriz: foi o que quebrou.

## Consequências

- Sessão em cookies httpOnly; RSC, route handlers, server actions e o browser client
  compartilham a mesma sessão (`@supabase/ssr`).
- O JWT do usuário passa a fluir até o Postgres em TODAS as chamadas do app — pré-requisito
  do enforcement no banco (ADR-0108).
- Login de quem não foi convidado é impossível por construção (não há signup público).
- Ativação pós-merge exige configurar Site URL/Redirect URLs no dashboard do Supabase
  (passo documentado no runbook de ativação do out-briefing v4.13).
