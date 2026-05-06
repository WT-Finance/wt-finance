# ADR 0020 — Funções de permissão centralizadas (Grau 1 evoluível)

**Data:** 2026-05-06
**Status:** Aceito
**Versão:** V4-1

## Contexto

Com múltiplos usuários e roles, o código precisa verificar permissões em vários lugares: endpoints de API, Server Components, componentes de UI. A abordagem mais simples — `if (user.role === 'financeiro')` espalhado pelo código — cria problemas quando o modelo de permissões evolui.

## Decisão

Toda verificação de permissão passa por funções centralizadas em `src/lib/permissions.ts`. Nenhum consumidor compara `user.role` diretamente.

### Grau 1 (esta versão)

Funções hardcoded que retornam booleano baseado em `user.role`:

```ts
canEditCosts(user)       // financeiro
canInviteUsers(user)     // financeiro
canViewAllSectors(user)  // financeiro
canManageUsers(user)     // financeiro
getUserSectorScope(user) // null para financeiro, setor_id para gestor
```

### Por que "Grau 1 evoluível"?

Quando Grau 2/3 chegar (sistema configurável via banco), apenas o interior dessas funções muda — os consumidores continuam chamando `canInviteUsers(user)` sem saber da mudança. O design evita reescrita ampla.

### O que NÃO fazer

```ts
// Proibido — dispersa lógica de permissão pelo código
if (user.role === 'financeiro') { ... }
```

## Consequências

**Positivas:**
- Mudança de permissão em 1 lugar afeta todos os consumidores
- Facilita auditoria: todas as verificações estão em um arquivo
- Migração para Grau 2/3 não exige tocar componentes

**Negativas / trade-offs:**
- Grau 1 não verifica banco — um `financeiro` desativado no banco continua passando nas verificações até a sessão expirar. Aceitável: o middleware (V4-2) já bloqueia `ativo = false`.
