# Bootstrap — Primeiro Usuário (Yan)

Executar UMA ÚNICA VEZ, durante a V4-1, antes de habilitar o middleware de autenticação obrigatória (V4-2).

## Pré-requisitos

- Migration 0024 aplicada (`npx supabase db push`)
- Supabase Auth habilitado com magic link (painel Supabase)
- Email `yan@welcometrips.com.br` válido e acessível

## Procedimento

### Passo 1 — Fazer primeiro login pelo magic link

Acessar `/login` e enviar o magic link para `yan@welcometrips.com.br`. Clicar no link recebido por email.

Isso cria automaticamente a entrada em `auth.users`. Sem este passo, o INSERT a seguir falha por violação de FK.

### Passo 2 — Descobrir o UUID de Yan em auth.users

No SQL Editor do Supabase (Authentication → SQL Editor ou Table Editor → auth.users):

```sql
SELECT id, email, created_at
FROM auth.users
WHERE email = 'yan@welcometrips.com.br';
```

Anotar o UUID retornado (ex: `a1b2c3d4-...`).

### Passo 3 — Criar perfil de Yan como financeiro

```sql
INSERT INTO app.usuarios (id, email, nome, role, setor_id, ativo)
VALUES (
  '<UUID_DO_PASSO_2>',
  'yan@welcometrips.com.br',
  'Yan',
  'financeiro',
  NULL,
  true
);
```

### Passo 4 — Validar

```sql
SELECT * FROM app.usuarios WHERE email = 'yan@welcometrips.com.br';
-- Deve retornar 1 linha com role = 'financeiro'
```

### Passo 5 — Testar login completo

Fazer logout (se ainda logado). Fazer login novamente via magic link. Confirmar que entra normalmente em `/executiva` como Yan.

---

## Recuperação se algo der errado

Se Yan se trancar fora (perfil desativado por engano, role mudada):

```sql
-- Reativar Yan como financeiro
UPDATE app.usuarios
SET ativo = true, role = 'financeiro'
WHERE email = 'yan@welcometrips.com.br';
```

Executar no SQL Editor do Supabase (requer acesso ao painel — não depende de login no app).
