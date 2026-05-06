# ADR 0019 — Bootstrap manual via SQL para primeiro usuário

**Data:** 2026-05-06
**Status:** Aceito
**Versão:** V4-1

## Contexto

O sistema de convites (V4-3) exige que um usuário `financeiro` já exista para convidar outros. Mas esse primeiro usuário não pode ser criado via convite — é o próprio criador do sistema. O Supabase Auth cria a entrada em `auth.users` quando o usuário faz login pelo magic link, mas não cria o perfil em `app.usuarios` automaticamente.

## Decisão

O bootstrap é feito manualmente, uma única vez, via SQL direto no Supabase:

1. Yan faz login pelo magic link → cria entrada em `auth.users`
2. Yan executa INSERT em `app.usuarios` com o UUID retornado
3. Procedimento completo documentado em `docs/bootstrap.md`

### Por que não automatizar via trigger?

Um trigger `ON INSERT ON auth.users` criaria perfil automaticamente, mas não saberia qual `role` e `setor_id` atribuir. Qualquer pessoa que conseguisse fazer login (email não cadastrado) viraria usuário automaticamente — falha de segurança crítica. O bootstrap manual é intencional.

### Por que não usar um script seed?

O seed só roda localmente e não se aplica ao banco de produção. O procedimento precisa funcionar uma vez no Supabase de produção, sem ferramentas extras.

## Consequências

**Positivas:**
- Seguro: nenhum usuário é criado sem decisão explícita
- Simples: 3 SQLs documentados em um arquivo

**Negativas / trade-offs:**
- Operação manual, não auditada automaticamente
- Se Yan se trancar fora, recuperação exige acesso ao painel Supabase (documentado em `docs/bootstrap.md`)
