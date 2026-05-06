# ADR 0022 — Proteção de rotas via src/proxy.ts

**Status:** Aceito  
**Data:** 2026-05-06

## Contexto

Next.js 16 deprecia `middleware.ts` e renomeia para `proxy.ts` (export `proxy`, não `middleware`). O projeto precisa proteger todas as rotas autenticadas e redirecionar para `/login` quando não há sessão ativa.

## Decisão

- Arquivo em `src/proxy.ts` com `export async function proxy()`
- Ordem de checagem: BYPASS_AUTH → rotas públicas → sessão Supabase → perfil em `app.usuarios`
- `createServerClient` de `@supabase/ssr` com `getAll/setAll` cookies
- Verificação de perfil via RPC `public.get_my_profile()` (app schema não exposto no PostgREST)
- Dupla proteção: proxy + RLS no banco são camadas independentes

## Consequências

- Usuário sem perfil em `app.usuarios` (ativo=false ou inexistente) é barrado mesmo com sessão válida
- BYPASS_AUTH=true em dev desliga toda autenticação; requer `NODE_ENV=development` para não vazar em prod
