# ADR 0023 — Login via magic link (OTP por e-mail)

**Status:** Aceito  
**Data:** 2026-05-06

## Contexto

O sistema usa Supabase Auth com magic link. O fluxo é: usuário digita e-mail → recebe link → clica → autenticado. Não há senha.

## Decisão

- `/login`: Client Component, chama `supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: origin/verify } })`
- `/verify`: Client Component, lê `token_hash` e `type` da URL, chama `supabase.auth.verifyOtp()`, redireciona para `/executiva`
- Ambas as páginas usam `createBrowserClient` de `@supabase/ssr` via `src/lib/supabase/client.ts`
- AppShell detecta rotas `/login`, `/verify`, `/aceitar-convite` e renderiza sem sidebar

## Consequências

- O link de magic link expira conforme configuração do Supabase (padrão 1 hora)
- Se o token for inválido/expirado, o usuário vê mensagem e link para tentar novamente
