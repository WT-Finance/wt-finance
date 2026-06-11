# Runbook v4.13 — Autenticação e Permissões

Procedimentos operacionais do sistema de auth/RBAC. Três seções: **ativação**
(pós-merge), **emergências** (S3 — lockout e desativação do enforcement) e
**backup/restore** (S4). Todos os comandos SQL podem ser executados pelo SQL Editor
do dashboard do Supabase **ou** por `npx supabase db query --linked '<sql>'` na raiz
do repo (a CLI já está logada/linkada).

---

## 0. v4.14 — login por SENHA (substitui o magic link como método primário)

A partir da v4.14 a entrada é **e-mail + senha**. O magic link continua existindo só
como **recuperação** (botão "Link" no admin / `/auth/confirm`). Operação:

- **Criar usuário:** `/admin/acessos` → aba Usuários → "Criar usuário" (e-mail + nome +
  role). O sistema mostra uma **senha provisória** na tela — copie e repasse à pessoa.
  Ela entra com e-mail + essa senha e é obrigada a definir uma nova no 1º acesso.
- **Esqueci a senha:** "Resetar senha" na linha do usuário → nova provisória (exibida) +
  troca obrigatória. (Não há reset por e-mail enquanto não houver SMTP.)
- **Solicitações:** quem não tem conta usa "Ainda não tenho uma conta" em `/login`
  (`/solicitar-acesso`). O admin vê na aba **Solicitações** e Aprova (cria usuário +
  senha provisória) ou Rejeita.
- **Cutover dos usuários atuais (que entravam por magic link):** todos foram marcados
  para trocar senha. Eles entram **uma vez** por um "Link" de acesso gerado no admin
  (recuperação) e caem em `/trocar-senha` para definir a senha; daí em diante, senha.
- **Lockout do admin:** se o admin não tiver senha, gere um "Link" de acesso para ele
  (ou, no Dashboard → Authentication → Users → reset), entre e defina a senha.
- **Emergência → voltar à v4.12.1 (app público):** Vercel → Deployments → o deployment
  da v4.12.1 → "Promote to Production" **+** `select public.admin_set_enforcement(false)`.
  Para voltar só ao magic link (v4.13.1), promova o deployment da v4.13.1. As migrations
  0119-0125 são aditivas e não quebram nenhuma dessas versões.

---

## 1. Ativação (depois do merge na main)

O sistema sobe com o **enforcement do banco DESLIGADO** (janela de compatibilidade,
ADR-0108): o app exige login desde o primeiro deploy, mas o PostgREST ainda aceita
leituras anônimas — era o necessário para a main antiga continuar funcionando até o
merge. Após o merge, ativar na ordem:

1. **Confirmar que a produção nova está no ar** (login funciona, telas carregam):
   abrir https://wt-finance.vercel.app → deve redirecionar a `/login`.
2. **Ligar o enforcement** (fecha o acesso anônimo no banco). NÃO há toggle na UI —
   é via SQL (Supabase Dashboard → SQL Editor, ou `npx supabase db query --linked`):
   ```sql
   select public.admin_set_enforcement(true);
   ```
3. **Verificar** (deve retornar HTTP 403/401, NUNCA 200):
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" -X POST \
     "https://awfdnjnzcxjjrqnhersg.supabase.co/rest/v1/rpc/get_executiva_kpis" \
     -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" \
     -H "Content-Type: application/json" -d '{"p_from":"2026-01-01","p_to":"2026-01-31"}'
   ```
4. **Fechar o signup público do GoTrue** (defesa em profundidade — sem isso um
   usuário "fantasma" pode se auto-registrar via API, mas sem NENHUM acesso, pois
   não terá registro RBAC): Dashboard Supabase → Authentication → Sign In / Up →
   **desmarcar "Allow new users to sign up"**.
5. **Allow-list de redirects para previews** (opcional; necessário só se quiser
   testar o fluxo de e-mail em previews futuros): Dashboard → Authentication →
   URL Configuration → adicionar
   `https://wt-finance-git-*-rheev21s-projects.vercel.app/**`.
6. **Convidar os usuários reais**: `/admin/acessos` → Convidar usuário (e-mail +
   role). O convite chega por e-mail **e** gera um link copiável (independe do
   e-mail). Criar antes as roles necessárias na aba Roles.
7. **SMTP próprio (recomendado, não urgente)**: o e-mail nativo do Supabase tem
   limite baixo (poucas mensagens/hora — suficiente para uso individual, apertado
   para onboarding em lote). Dashboard → Project Settings → Auth → SMTP. Enquanto
   isso, o link copiável do convite cobre qualquer falha de entrega.

---

## 2. Emergências (S3)

### 2.1 Desligar o enforcement (kill switch global)

Sintoma: telas com erro de carregamento generalizado após a ativação; suspeita de
bloqueio indevido pelo guard do banco. **Um comando reverte ao comportamento
pré-auth no banco** (o login do app continua exigido; só o enforcement anônimo do
PostgREST desliga):

```sql
select public.admin_set_enforcement(false);
-- ou, se até as RPCs estiverem inacessíveis:
update app.config set valor = 'false'::jsonb where chave = 'auth_enforcement';
```

Efeito imediato (sem deploy). Reativar com `true` após diagnosticar.

### 2.2 Lockout do administrador (perdeu acesso ao /admin/acessos)

As RPCs de admin têm anti-lockout (não deixam você se desativar, tirar a própria
role de admin nem remover `admin/acessos` da própria role). Se mesmo assim o acesso
se perder (ex.: outro admin desativou você; e-mail trocou; role apagada por SQL):

```sql
-- 1. Identificar seu user_id:
select id, email from auth.users where email = 'voce@welcometrips.com.br';

-- 2. Garantir role com acesso total (Financeiro) e vínculo ativo:
select id from app.rbac_roles where nome = 'Financeiro';
insert into app.rbac_usuarios (user_id, email, role_id, ativo)
values ('<user_id>', '<email>', <role_id>, true)
on conflict (user_id) do update set role_id = excluded.role_id, ativo = true;

-- 3. Se a própria role Financeiro foi mutilada, restaurar TODAS as permissões:
insert into app.rbac_role_permissoes (role_id, area)
select <role_id>, area from app.rbac_areas
on conflict do nothing;
```

### 2.3 Login quebrado (auth fora do ar / e-mail não chega)

1. Link de acesso manual, sem e-mail (Dashboard → Authentication → Users → ⋯ →
   "Send magic link" — ou via API admin `generateLink`), e entregar o link
   `https://wt-finance.vercel.app/auth/confirm?token_hash=<hashed_token>&type=magiclink`.
2. Persistindo: desligar o enforcement (2.1) **e** — caso extremo — fazer revert do
   merge na Vercel (Deployments → deployment anterior → "Promote to Production"),
   que volta a app sem login enquanto o banco segue compatível (flag OFF).

### 2.4 Testar o caminho negado sem afetar produção

`rbac_verificar_guard` simula o enforcement SÓ na própria chamada:

```bash
curl -s -X POST ".../rest/v1/rpc/rbac_verificar_guard" -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $ANON_KEY" -H "Content-Type: application/json" \
  -d '{"p_area":"executiva"}'        # esperado: erro 42501 (PERMISSAO/AUTH)
```

---

## 3. Backup e restore (S4)

### 3.1 O que existe

Backup lógico COMPLETO tirado **antes da primeira migration da v4.13**
(2026-06-10), em `~/wt-finance-backups/2026-06-10-pre-v4-13/` (máquina do Yan,
fora do git):

- `data/<schema>.<tabela>.sql` — um arquivo por tabela (29 tabelas dos schemas
  `analytics`, `app`, `audit`, `dim`, `financeiro`, `raw`), cada um com
  `BEGIN; TRUNCATE ...; INSERT ...; setval(...); COMMIT;`.
- `manifest.json` — contagem exportada × contagem na origem por tabela (auditoria
  de completude).
- `exportar.mjs` — o gerador (re-executável para novos backups).
- O **schema** não precisa de dump: é reproduzível pelas migrations `0001..0118`
  (verificadas em sync com o remoto via `npx supabase migration list` na data).
- O schema `auth` (usuários/sessões) NÃO entra no dump: é gerenciado pelo Supabase;
  como o login é magic link (sem senhas), a recuperação de contas = re-convidar.

### 3.2 Restaurar uma tabela (ou todas)

**Arquivos pequenos (< ~1 MB)** podem ir direto:
```bash
cd ~/projects/wt-finance
npx supabase db query --linked -f ~/wt-finance-backups/2026-06-10-pre-v4-13/data/app.meta_setor.sql
```

**Arquivos grandes**: o Management API rejeita corpos de vários MB (falha
SILENCIOSA — verificado no teste de restore). Usar o replay em chunks:
```bash
cd ~/wt-finance-backups/2026-06-10-pre-v4-13
node restaurar.mjs data/raw.vendas_excel.sql          # restaura NA tabela original
node restaurar.mjs data/raw.lancamentos.sql --target backup_check.lancamentos  # ensaio
```
Ordem livre (cada arquivo faz `TRUNCATE ... CASCADE` + INSERTs + `setval`).
Depois de restaurar tabelas RAW, regenerar o analytics:
```bash
npx supabase db query --linked 'select public.transform_raw_to_analytics(); select public.regenerar_dim_operacao_weddings(); select public.refresh_all_materialized_views();'
```

### 3.3 Teste de restauração executado (evidência — 2026-06-10)

- `app.meta_setor` (pequeno, replay direto): **108/108** linhas; `sum(valor_meta)`
  idêntico à origem.
- `raw.lancamentos` (5,3 MB, replay chunked em 22 statements): **19.225/19.225**
  linhas; `sum(valor)` idêntico à origem.
- O replay direto do arquivo de 5,3 MB FALHOU (limite do Management API) — por
  isso o `restaurar.mjs` é o caminho documentado para arquivos grandes.
- Ensaio feito em `backup_check.<tabela>` (LIKE original INCLUDING ALL), removido
  com `DROP SCHEMA backup_check CASCADE` ao final.

### 3.4 Desfazer SÓ as migrations da v4.13 (rollback funcional)

As migrations 0119-0122 são aditivas (tabelas novas + wrappers + revokes). Para
neutralizá-las sem restore completo:

```sql
select public.admin_set_enforcement(false);  -- guards permitem anon de novo (estado pré-v4.13 na prática)
```

Reverter wrappers individualmente (se necessário): `DROP FUNCTION public.<fn>(args)`
(o wrapper) + `ALTER FUNCTION public.<fn>__nucleo(args) RENAME TO <fn>` +
`GRANT EXECUTE ... TO anon, authenticated, service_role`.
