# ADR-0114 — Encerramento da janela anônima (M1) e estreitamento do fail-open

**Data:** 2026-06-13 · **Versão:** v4.17.0 (Balde 1) · **Status:** aceito

## Contexto

A v4.13 introduziu auth + RBAC em 4 camadas, mas manteve uma **janela de compatibilidade**
para `anon` enquanto a `main` migrava: `app.exigir_acesso` liberava o caminho anônimo quando
`auth_enforcement` estava OFF, e as 46 RPCs de leitura ainda tinham `GRANT EXECUTE` a `anon`
(default privileges do Supabase pré-0122). Com o enforcement ON desde a v4.13 e a UI usando
exclusivamente sessão **autenticada** (`getServerClient`), essa janela virou superfície de
exposição sem uso legítimo. A auditoria técnica (2026-06-13) também flagrou um **fail-open**:
`exigir_acesso` retornava cedo para QUALQUER contexto sem `request.jwt.claims` — e a requisição
**anônima do PostgREST chega justamente sem claims**, então o ramo "claims nulo → RETURN" era o
furo real (não o ramo `v_uid IS NULL`).

## Decisão

Fechar a janela anônima de uma vez (migrations 0133/0134):

1. **`exigir_acesso` — fail-open estreitado:** `v_claims IS NULL` só retorna se `session_user`
   for **superusuário real** (migrations/seed/`db query` conectam como `postgres`); demais
   papéis sem claims (inclusive o `authenticator` do PostgREST sem JWT) → `RAISE 42501`.
2. **`exigir_acesso` — ramo anon-OFF removido (M1):** `v_uid IS NULL` (JWT sem `sub` / role anon)
   → SEMPRE negado; não consulta mais `auth_enforcement_ativo()` para o caminho anon.
3. **REVOKE EXECUTE de `anon`** em TODAS as RPCs de `public`/`app` exceto `solicitar_acesso`
   (a única RPC anônima legítima — auto-cadastro). A 0134 fecha o grant via PUBLIC nas funções
   de `app` (o REVOKE FROM anon da 0133 era no-op nelas).
4. **`solicitar_acesso`** mantém `anon`, agora com **rate-limit por janela** (5/min) anti-flood.
5. Guards de superfície: `admin/layout.tsx` ganha `requireArea(null)` baseline; `admin.ts`
   (service role) ganha `import 'server-only'`; `solic_minhas_pendencias` ganha `exigir_acesso`.

O **kill switch** (`auth_enforcement` / `admin_set_enforcement`) permanece como mecanismo de
emergência (runbook), apenas deixa de reger o caminho anon.

## Consequências

- `anon` não executa nenhuma RPC de dado (verificado: `has_function_privilege` → só
  `solicitar_acesso`). Auditoria adversarial 7/7 (anon negado em read RPC/badge; autenticado
  ativo OK; inativo negado; service_role OK; throttle dispara).
- Aditivo e **retrocompatível com a main viva** (a UI usa authenticated; nenhum fluxo legítimo
  dependia do grant anon).
- `session_user` é confiável dentro de SECURITY DEFINER (não muda com o definer), por isso a
  checagem de superusuário no ramo claims-nulo.

## Alternativas consideradas

- **Manter a janela até o merge:** rejeitada — enforcement já está ON; a janela só ampliava
  superfície sem benefício.
- **Apenas REVOKE sem mexer no `exigir_acesso`:** insuficiente — o fail-open de claims-nulo
  deixaria anon passar pelo ramo de "conexão direta". Os dois precisam andar juntos.
