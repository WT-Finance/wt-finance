# CLAUDE.md — WT Finance

Plataforma financeira interna do Welcome Group. Este arquivo define como se trabalha
neste projeto. Vale para toda sessão. Conteúdo específico de cada versão vem no
briefing (`/docs/briefings/*.pdf`) e no prompt da versão, não aqui.

---

## Manutenção deste arquivo (documento vivo)

Este arquivo evolui com o projeto. Ao gerar o out-briefing de cada versão (passo 6 do
workflow), avaliar: **esta versão revelou algum aprendizado permanente que deveria ser
documentado aqui?**

Critério para entrar (os três precisam ser verdade):
- **Permanente** — vale para sempre, não só para esta versão (config, convenção, padrão arquitetural).
- **Transversal** — afeta features futuras, não um componente isolado.
- **Custou caro** — foi um bug difícil, uma investigação longa, ou um erro que se repetiria.

Teste rápido: *"a próxima versão erraria isso de novo se não estivesse documentado?"*
Se sim, entra (em "Convenções" ou "Banco de dados"). Se não, fica no out-briefing da versão.

Exemplos que entraram: schema `analytics` não exposto (v4.6); upload → API Route (v4.7).

**Manter denso, não só crescer:** adicionar é também podar. Convenção que deixou de
valer deve ser corrigida ou removida, não acumulada. Alterações no arquivo passam pelo
PR — o usuário revisa antes do merge.

---

## Stack

Next.js 16 · React 19 · TypeScript estrito · Tailwind 4 · shadcn/ui · Recharts ·
Supabase (Postgres + PostgREST) · Vercel. Repositório: `WT-Finance/wt-finance`.

---

## Comandos essenciais

```bash
npm run dev               # servidor local (next dev)
npm run build             # build de produção (next build) — gate de fechamento
npm run lint              # eslint — gate de fechamento
npx tsc --noEmit          # typecheck (NÃO existe script dedicado; rodar assim) — gate
npm test                  # vitest (unit + contrato RPC) — gate de fechamento (v4.12)
npm run seed              # popular banco (tsx supabase/seed/seed.ts)
```

Não existe script de typecheck no `package.json`. Sempre usar `npx tsc --noEmit`
diretamente. Não inventar `npm run typecheck`.

---

## Banco de dados (Supabase)

### Comandos
```bash
npx supabase migration list           # inspecionar local vs remote (READ-ONLY, seguro)
npm run db:migrate -- --aditiva       # aplica migration aditiva (backup-gate rede → db push auto)
npm run db:migrate -- --destrutiva    # backup-gate rede → db push COM CONFIRMAÇÃO HUMANA (não auto)
# o wrapper db:migrate roda a REDE (backup + manifest-check + restore-test spot) antes do push (ADR-0116)
```

O CLI não está instalado globalmente — sempre `npx supabase ...`, nunca `supabase ...`.

### ⚠️ Produção direta, sem staging
`--linked` aplica no banco de PRODUÇÃO (não há ambiente de staging separado; só
existe `.env.local`). Uma migration ruim vai direto para produção, sem rede de proteção.
Branching do Supabase foi avaliado e **descartado** (investigação 2026-06-13): o branch
efêmero nasce sem dado de produção — pega erro de schema, **não** perda de dado (que é o
nosso risco real: `dim_data` range fixo, timeout 3s, N+1 por volume), e a promoção no merge
roda direto em prod sem re-validação. `supabase start` local depende de Docker, ausente no
WSL2. A rede que cobre o risco que dói é o **backup-gate** (ver abaixo).

**O wrapper `npm run db:migrate` (`scripts/db-gate/`, ADR-0116) roda o backup-gate ANTES do push —
uma REDE de recuperação, não autorização.** Gera o backup-do-dia em `~/wt-finance-backups/AAAA-MM-DD-<label>/`,
checa **completude** (todas as tabelas vivas de produção presentes, count conferido) e restaura um
**subconjunto-chave** num schema descartável comparando **produção × restaurado** (count + checksum);
**vermelho aborta** (push não acontece). O gate garante **recuperação**, não prevenção — uma migration
equivocada ainda muda produção, mas dá para restaurar do backup-do-dia. Runbook:
`docs/runbooks/db-backup-gate-runbook.md`. (Restore-test do conjunto COMPLETO é follow-up; o spot é o núcleo.)

**Migration ADITIVA / retrocompatível** (CREATE, ADD COLUMN anulável, RPC nova, índice, GRANT/REVOKE,
validação que só acrescenta a `erros`) — **regime autônomo, SEM confirmação:** `npm run db:migrate -- --aditiva`
(gate como rede) + **declaração prévia no header** (o que faz; aditiva/retrocompatível com a `main` viva;
não escreve em dados pré-existentes).

**Migration DESTRUTIVA** (`DROP`, `TRUNCATE`, `ALTER` que remove/reescreve coluna ou dado,
`UPDATE`/`DELETE` em dado existente) — **continua exigindo CONFIRMAÇÃO HUMANA antes do `db push`.**
O `npm run db:migrate -- --destrutiva` roda o backup-gate como rede e então **mantém a confirmação**
(não auto-confirma). O gate é rede, **não** autoriza autonomia destrutiva — isso só mudaria com o
restore-test COMPLETO (follow-up). Continua valendo: **verificar consumidores reais** antes de remover
qualquer objeto — "órfão" pelo briefing pode ter uso vivo não-óbvio (ex.: a v4.17.1 ia dropar
`truncate_dynamic_tables`/`inserir_lote_raw` e a auto-auditoria achou o `npm run seed` consumindo-as;
só `admin_definir_usuario_ativo` era órfã).

Ao testar escrita em produção (ex.: commit de import), usar dados com nomes distintos
e deletar logo em seguida.

### Schema `analytics` NÃO é exposto pela API
O `config.toml` expõe apenas `["public", "graphql_public"]`. Tabelas em `analytics`
**não são acessíveis** via `.schema('analytics').from(...)` (retorna PGRST106).

**Regra:** todo acesso a tabelas de `analytics` é via RPCs `SECURITY DEFINER` no schema
`public`. Mesmo padrão do resto do codebase. (Descoberto na v4.6.)

### `dim_data` tem range fixo — FK em `fato_venda`
`analytics.fato_venda.data_venda` tem FK para `analytics.dim_data(data)`, semeada com
range FIXO (era 2024-2030; estendida para 2022-2030 na migration 0100). Subir Vendas
com datas FORA do range faz `transform_raw_to_analytics` abortar em
`fato_venda_data_venda_fkey`. Pior: o upload roda `truncate_dynamic_tables` (CASCADE)
ANTES do transform — se o transform falha, `fato_venda` fica VAZIA em produção (os
dados crus sobrevivem em `raw.vendas_excel`).

**Regra:** ao surgir esse erro, estender `dim_data` (migration com `generate_series` +
mesma derivação do seed `0002`, `ON CONFLICT (data) DO NOTHING`) e recuperar SEM
re-upload via RPCs `transform_raw_to_analytics` → `regenerar_dim_operacao_weddings` →
`refresh_all_materialized_views`. (Descoberto em mai/2026, migration 0100.)

### statement_timeout por role — o PostgREST aplica o rolconfig do papel a CADA requisição
Os roles têm timeout DIFERENTE, vindo do `rolconfig` (`ALTER ROLE … SET statement_timeout`):
`anon`=3s, `authenticated`=8s, `service_role`=**0 (sem limite), mas só porque a migration 0145
setou isso EXPLICITAMENTE** (ADR-0122). Uma RPC que passe do limite estoura
`57014 canceling statement due to statement timeout` → HTTP 500/erro de carga.

**Como funciona (não é automático):** `SET ROLE` sozinho **não** aplica o rolconfig do papel-alvo
(testado). É o **PostgREST que aplica o rolconfig do papel da requisição a cada chamada** — é assim
que `anon`=3s/`authenticated`=8s valem. Se o rolconfig do papel **não** define `statement_timeout`,
cai no **default do banco (120s)**. (Custou caro: o `service_role` ficou com rolconfig nulo → cargas
pesadas via `getAdminClient` herdaram 120s e `promover_carga_vendas` estourou — v4.20.1, fix 0145.)

**Regras:**
- Toda RPC consumida pela UI (roda como **`authenticated`**, 8s) precisa caber nesse limite — não
  validar só com service role. Atenção a N+1 em RPC de listagem (função escalar por linha) e a casts
  em coluna de JOIN que impedem índice — pioram com o volume. (Custou caro: `contar_convidados_operacao`
  × ~140 ops após o backfill 0100; fix 0101.)
- **O timer é armado no statement EXTERNO do PostgREST e NÃO dá para desarmá-lo de dentro da função**
  (testado: atributo `SET statement_timeout=0` na função e `SET LOCAL` no corpo não afetam o statement
  em curso). Uma RPC de carga pesada (service_role) só escapa do timeout pelo **rolconfig do role** — não
  por código da função. Mudou o timeout de um role? `NOTIFY pgrst, 'reload config'`.

### Fuso: app roles em America/Sao_Paulo; `postgres` (migrations/seed) segue UTC
A sessão **padrão** do Postgres (Supabase) é **UTC**, mas os papéis que o PostgREST usa por requisição — `anon`/`authenticated`/`service_role` — têm `timezone = 'America/Sao_Paulo'` no rolconfig (migration **0152**, ADR-0125). O PostgREST aplica o rolconfig do papel a CADA chamada (mesmo mecanismo do `statement_timeout`), então em **toda RPC do app** `CURRENT_DATE`/`now()::date`/`date_trunc('month', CURRENT_DATE)` já refletem o **"hoje" de São Paulo** — RPC nova ganha isso de graça, **sem** precisar de `AT TIME ZONE` explícito. (Antes da 0152 era UTC e o "hoje" adiantava um dia a partir das ~21h de SP; sintoma: a projeção do Gerencial começava em "amanhã" — fix pontual 0151, depois sistêmico 0152.)
**Exceção que importa:** `postgres` **NÃO** foi alterado — **migrations e `npm run seed` rodam como `postgres` em UTC**. Se uma MIGRATION/seed precisar do "hoje" de SP num `UPDATE`/backfill/`generate_series`, use `(now() AT TIME ZONE 'America/Sao_Paulo')::date` explícito; `CURRENT_DATE` cru dentro de migration ainda é UTC. Para **exibição** de `timestamptz` no app a regra é a de sempre: `fmtDataSP`/`Intl`+`timeZone`, nunca split — o fuso do role muda só o **offset** do ISO, não o instante.

### Auth e RBAC (v4.13/v4.14) — enforcement em 4 camadas
Login obrigatório (Supabase Auth). **Método primário = e-mail + SENHA** (v4.14, ADR-0110); o magic link (`/auth/confirm` em 2 passos) virou **recuperação/anti-lockout**, fora da tela de login. Autorização **RBAC dinâmico por área** (`app.rbac_*`; 11 áreas; em Performance, granular por setor). ADRs 0106-0110.

- **Senha (v4.14):** admin cria usuário com **senha provisória exibida na tela** (não por e-mail — sem dependência de SMTP); flag `app.rbac_usuarios.precisa_trocar_senha` força a troca no 1º acesso. **Portão forte:** com a flag ligada, `requireArea` manda para `/trocar-senha` (página), 403 (API) ou lança (action) — antes de qualquer dado. Reset = admin gera nova provisória. Auto-cadastro = `/solicitar-acesso` (RPC `solicitar_acesso`, anon, 1 pendente/e-mail, nada criado até aprovar) + aba Solicitações. `senhaProvisoria()` ≥16 chars; mínimo de senha 8 (config). NUNCA persistir senha em claro.

- **Sessão flui ao banco:** `getServerClient()` é **assíncrono** e por-request (`@supabase/ssr` + cookies) — sempre `await`. As RPCs do app correm como `authenticated` (timeout **8s**, não os 3s do anon). `getAdminClient()` (service role) só server-side para cargas e `auth.admin` (convites). `proxy.ts` (convenção Next 16, **não** `middleware.ts`) exige sessão fora de `/login` e `/auth/*`.
- **Guards em toda superfície:** página → `requireArea(area)`; route handler → `requireAreaApi` (retorna `Response` 401/403); server action → `requireAreaAction`. Mapa único em `src/lib/auth/areas.ts`, **espelhado** em `app.rbac_areas` (paridade testada em `rpc-contrato.test.ts`). Rota nova **nasce protegida** (proxy + guard do banco); não esquecer o guard explícito.
- **Toda RPC de leitura exposta é um wrapper** `SECURITY DEFINER` que chama `app.exigir_acesso(<áreas>)` e delega ao `<fn>__nucleo` (service-role-only). RPC nova consumida pela UI segue esse padrão (migration 0121); RPC com `p_setor` deriva a área via `app.areas_do_setor`.
- **`anon`/`authenticated` por default têm EXECUTE em função nova** (default privileges do Supabase) — **custou caro:** as 72 funções tinham `anon` mesmo com `REVOKE ... FROM PUBLIC` (incl. `truncate_dynamic_tables`). A 0122 corrigiu com `ALTER DEFAULT PRIVILEGES ... REVOKE EXECUTE ... FROM anon, authenticated`. Todo `GRANT EXECUTE` é **explícito**; nunca contar com o default.
- **RLS é deny-by-default e NÃO-permissivo:** RLS ligado em todas as tabelas dos 6 schemas, sem policy `USING true` (a 0123 removeu as herdadas). O app nunca acessa tabela direto (zero `.from()`), então RLS não afeta o caminho via RPC (owner `postgres` ignora RLS) — mas a policy permissiva é furo latente; manter a camada de RLS também fechada.
- **Predicado de permissão com coluna ANULÁVEL precisa de `coalesce(..., false)` — NULL não é negação.** `coluna = auth.uid()` retorna **NULL** (não `false`) quando a coluna é NULL — ex.: `destinatario_user_id = uid` numa solicitação atribuída a uma ROLE (user_id nulo). Numa cadeia OR, `false OR NULL = NULL`; e `IF NOT <expr nula> THEN RAISE` **NÃO dispara** (NOT NULL = NULL ≠ true) → o RAISE de negação é pulado → **vazamento de permissão** (terceiro vê/age). Cláusula `WHERE` tolera (NULL exclui a linha), mas predicado booleano em `IF`/função `RETURNS boolean` **não**. Regra: toda comparação de permissão com coluna anulável vai em `coalesce(<cmp>, false)`; funções de visibilidade retornam boolean estrito. (Custou caro: vazamento em `pode_ver_solic`/`sou_atendente` pego pela auto-auditoria adversarial — v4.16.0, fix migration 0129. Foi a auditoria de RPC direta, não a UI, que pegou.)
- **Janela anônima ENCERRADA (v4.17.0/M1, ADR-0114):** `anon` não executa nenhuma RPC de dado — `REVOKE EXECUTE` em tudo de `public`/`app` **exceto `solicitar_acesso`** (auto-cadastro, com rate-limit). `exigir_acesso` nega anon SEMPRE (ramo "anon passa quando OFF" removido) e só libera contexto **sem JWT** se `session_user` for superusuário real (migrations/seed/`db query` como `postgres`) — a requisição anônima do PostgREST chega sem claims, e era esse o furo (fail-open). Toda RPC consumida pela UI roda como **authenticated**. RPC/grant novo: nasce sem `anon` (default privileges da 0122 + esta limpeza). Não reabrir anon.
- **Kill switch = emergência (não mais compatibilidade):** `app.config.auth_enforcement` + `admin_set_enforcement` permanecem como alavanca de emergência (runbook `docs/runbooks/v4-13-auth-runbook.md`), mas **não regem mais o caminho anon** (M1 removeu o ramo). Anti-lockout vive nas RPCs `admin_*` (não dá para se auto-desativar nem tirar o próprio `admin/acessos`).
- **Confirmação de magic link é em DOIS passos (`/auth/confirm`):** o GET só renderiza o botão; o `verifyOtp`/`exchangeCodeForSession` roda no **POST** do clique. Magic link é **uso único** — confirmar no GET deixa bots de pré-visualização de link (WhatsApp/e-mail/antivírus/prefetch) **consumirem o token** antes do humano, derrubando o convite com "link inválido". Nunca consumir token de auth num GET. Convite por e-mail depende de **SMTP próprio** (o nativo do Supabase limita a 2/h). O gerador de "Link de acesso" sob demanda (`gerarLinkAcesso`) foi **removido na v4.17.1** — o modelo v4.14 é por **senha provisória** (admin cria/reseta e exibe na tela); o magic link `/auth/confirm` permanece só como anti-lockout. (Custou caro: diretoria sem acesso na ativação da v4.13; fix v4.13.1.)

### Convenções de migration
- Arquivos: `supabase/migrations/NNNN_nome.sql`, numeração sequencial.
- RPCs: sempre `SECURITY DEFINER` + `REVOKE EXECUTE ... FROM PUBLIC` + `GRANT EXECUTE ... TO service_role`.
- `max_rows = 1000` no PostgREST — limite de payload de RPCs/queries. Considerar em listagens grandes.
- Subagentes que criam migration recebem o número exato e NÃO aplicam — o orquestrador aplica todas em lote, sequencialmente, depois.
- **Antes de `DROP` de qualquer objeto, verificar consumidores reais** (grep no app **e** em `supabase/seed/`, mais auditoria cética). Classificação de "órfão" vinda do briefing não basta — ela errou na v4.17.1 (`truncate_dynamic_tables`/`inserir_lote_raw` pareciam soltas mas o `npm run seed` as usa; ficaram, marcadas seed-only). DROP é destrutivo: confirmação + reversibilidade documentada (corpo na migration de origem).

### Verificação pós-push
Testar as RPCs novas via REST com a service role key antes de considerar pronto:
```bash
curl -s -X POST "https://<project-ref>.supabase.co/rest/v1/rpc/<fn>" \
  -H "apikey: $SVCKEY" -H "Authorization: Bearer $SVCKEY" \
  -H "Content-Type: application/json" -d '{...}'
```

---

## Regime de trabalho (default: autônomo)

O **regime autônomo é o padrão** deste projeto (validado v4.13–v4.17). Dentro do escopo do
briefing/prompt da versão, trabalha-se com **autonomia técnica total**: decisões técnicas
(modelo de dados, organização de código, caminho de implementação) são do Claude Code;
migrations aplicam-se **sem confirmação** sob as âncoras abaixo; não se pergunta o operacional.
O que muda de versão para versão é a **fronteira de produto**, que o prompt define.

Três coisas são invariantes e **não** dependem do prompt afrouxar:
- **Auto-auditoria adversarial antes de declarar concluído.** É o que pega o "dado errado
  parecendo certo" — incluindo erros do próprio briefing (ex.: a v4.17.1 descobriu que RPCs
  que o briefing mandava dropar tinham consumidor vivo no `seed`; a auto-auditoria da v4.16.0
  pegou o vazamento de permissão da 0129). Verificar a realidade contra o prompt; divergiu, **parar**.
- **Merge humano é a única fronteira de entrada em produção.** O Code nunca mergeia nem deploya.
- **Decisão de produto é do usuário.** Na dúvida se algo é técnico ou de produto, **é produto**:
  registrar/perguntar, não decidir.

**Checkpoints** (parar no meio e aguardar) são a exceção, pedidos explicitamente pelo prompt —
ver Workflow §4. Sem pedido de checkpoint, a confirmação acontece ao fim de todas as missões.

---

## Workflow de versão

### 1. Recebimento
- Ler o briefing em `/docs/briefings/<versão>.pdf` + o prompt `.md` da versão.
- **Confirmar entendimento do escopo antes de implementar.** Se houver ambiguidade real, perguntar; senão, prosseguir.

### 2. Implementação
- Seguir a estrutura de fases do prompt.
- **Identificar oportunidades de paralelização proativamente**, garantindo não-conflito (ver "Paralelização" abaixo).
- Commits Conventional Commits em pt-BR, **um por missão**, com `git add <arquivos específicos>` — nunca `git add -A` cego.
- Rodar `build` + `tsc` + `lint` ao final de cada missão, não só no fim de tudo.
- **Reportar o progresso pelo chat** (sem criar arquivo de relatório).

### 3. Validação (gate)
- `npm run build` limpo, `npx tsc --noEmit` zero erros, `npm run lint` sem warnings novos, `npm test` verde.
- Smoke tests das áreas afetadas.

### 4. Confirmação
- Por padrão, a confirmação do usuário acontece **ao final de todas as missões** (autonomia total durante a execução).
- Se o prompt pedir **checkpoint** explícito numa missão, parar nela e aguardar confirmação antes de prosseguir.

### 5. Correções
- Aplicar correções apontadas pelo usuário; aguardar nova confirmação pós-correção quando relevante.

### 6. Out-briefing
- **Out-briefing é parte do DoD, não pós-entrega:** nenhuma versão/patch fecha sem ele. (Custou caro: a v4.14.1 fechou sem out-briefing e exigiu backfill depois — v4.14.3.)
- Gerar out-briefing `.md` no formato consolidado: missões implementadas, migrations, ADRs, pendências, arquivos modificados.
- **Verificar que todos os arquivos estão corretamente sincronizados.**
- **Avaliar se a versão revelou aprendizado permanente para este CLAUDE.md** (ver "Manutenção deste arquivo" no topo).
- **Entrada no `CHANGELOG_DIRETORIA`** (`src/data/changelog-diretoria.ts`): a cada versão/patch, adicionar **uma entrada no topo**, em **linguagem de negócio** — descrever o **efeito/implicação**, NUNCA o mecanismo (a diretoria não sabe o que é RPC/migration/componente). Com a **data/hora REAL do merge** (de `git log --merges`, fuso −03) e o(s) **tipo(s)** (novidade/correção/melhoria). **A `data` NUNCA é uma hora redonda chutada** — a entrada nasce **antes** do merge, então registre o **horário real de autoria** (`date`/`git`) e, idealmente, **reconcilie ao tempo do merge** quando ele acontecer (a v4.11.0–v4.22.2 saíram com horas aproximadas/redondas e foram corrigidas em massa na v4.22.3). **TODAS as entregas entram** (granular, sem buracos); patches puramente técnicos ganham descrição genérica honesta (ex.: "Ajustes visuais e de formatação"). É o histórico que a diretoria lê pelo modal de versão. O detalhe técnico fica no out-briefing e no `CHANGELOG.md`. (v4.11)
- **Limpar as worktrees** (ver abaixo).

### 7. PR
- Abrir PR (`gh pr create`) com sumário apontando para o out-briefing.
- **NUNCA fazer merge. NUNCA fazer deploy.** O merge é do usuário; o deploy do Vercel é automático no merge.

---

## Paralelização (regra de ouro)

A paralelização acontece por **subagentes editando arquivos disjuntos dentro de uma
única worktree da versão**. Não é uma worktree por missão.

**Regra crítica de segurança — subagentes são editores puros:**
> Subagentes SÓ editam arquivos. NUNCA rodam `git commit`, `supabase db push`,
> `next build` nem servidor. Isso causaria race no índice git, no banco e em portas.

Toda operação com estado compartilhado (git, banco, build, servidor) é **serializada
pelo orquestrador**, depois que os subagentes terminam de editar.

- Missões que tocam o **mesmo arquivo** são sequenciadas (ex.: M1→M2 no mesmo componente).
- Missões em **arquivos diferentes** rodam em paralelo.

---

## Worktrees

Uma worktree **por versão**, isolando-a do `main`. Convenção: `.worktrees/<branch-com-hífen>`
(`feat/v4-8` → `.worktrees/feat-v4-8`). `.worktrees/` está no `.gitignore`.

### Criar (início da versão)
```bash
git worktree add .worktrees/feat-vX-Y -b feat/vX-Y
# a worktree nasce "crua" — montar o ambiente com symlinks + cópia do link supabase:
ln -s <raiz>/node_modules .worktrees/feat-vX-Y/node_modules
ln -s <raiz>/.env.local   .worktrees/feat-vX-Y/.env.local
mkdir -p .worktrees/feat-vX-Y/supabase/.temp && cp <raiz>/supabase/.temp/* .worktrees/feat-vX-Y/supabase/.temp/
```
Sem os symlinks e o `.temp/`, faltam `node_modules`, `.env.local` e o link do Supabase — nada funciona.

### Consolidar (fim da implementação)
Tudo numa branch só → não há merge entre worktrees.
```bash
npx tsc --noEmit && npx next build      # valida o conjunto
# aplicar via `npm run db:migrate` (backup-gate rede; destrutiva MANTÉM confirmação humana — ADR-0116)
git add <arquivos da missão>            # commits específicos, um por missão
git commit -m "feat(vX-Y-mN): ..."
git push origin feat/vX-Y
```

### Limpar (APÓS o PR mergear no main)
Sempre a partir da raiz do `main`, **nunca de dentro da worktree**:
```bash
cd <raiz do main>
git worktree remove .worktrees/feat-vX-Y --force
git worktree prune
```
Nunca remover worktree com trabalho não-merjado.

---

## ADRs

Decisões arquiteturais geram um ADR em `docs/adr/NNNN-titulo.md`.

**Antes de criar um ADR novo, verificar a numeração real existente:**
```bash
ls docs/adr/        # continuar a partir do MAIOR número real, não do número que o briefing sugere
```
A numeração dos briefings pode divergir da numeração real do projeto. A fonte da
verdade é `docs/adr/`. Evitar colisão de número.

---

## Convenções de código (permanentes)

- **Design System Welcome:** usar tokens CSS, nunca hex hardcoded. Fonte Avenir LT Std.
- **Cores semânticas fixas:** `#1A1814` (preto/H1), `#BD965C` (dourado/H2/destaque), `#4B4F54` (cinza-azulado/H3), `#75777B` (cinza texto). Tokens de subsetor e de gráfico em `src/styles/tokens.css`.
- **Card:** padrão `shadow-sm` (não border destacado).
- **Token CSS em classe Tailwind = `[var(--token)]`, NUNCA `[--token]`.** O Tailwind v4 removeu o shorthand v3 `text-[--brand]`/`bg-[--token]`: ele compila para `color:--brand` (CSS **inválido**) e a cor do token é **silenciosamente descartada** — sem erro de build/tsc/lint, degradação só visível a olho. Use sempre a forma com `var()`: `text-[var(--brand)]`, `bg-[var(--action-soft)]` (ou a utilitária canônica `text-text-muted` quando o token tem mapeamento `@theme`). Ao copiar exemplo de Tailwind v3, converter. (Custou caro: 81 ocorrências quebradas app-wide — raiz de incoerência visual; fix v4.16.1, registrado v4.16.2.)
- **Respiro vertical de página vem do `<main>` do AppShell (`py-8`) — fonte única.** Páginas NÃO definem `py`/`pt`/`pb` no container raiz; o container é só `max-w-* mx-auto px-*` (largura e respiro horizontal continuam por tela: `7xl px-6` dashboards, `5xl px-4` plataforma). Antes da v4.16.1 cada tela inventava o seu (16px, 32px ou zero — conteúdo "grudado" no topo, visto em Solicitações e Acessos). Tela nova nasce sem `py` próprio. (DS §12, v4.16.1.)
- **Versionamento X.Y.Z** (ADR-0084): MAJOR quebra premissa de domínio; MINOR capacidade/reformulação; PATCH correção/polimento. Sidebar mostra X.Y.Z. CHANGELOG.md formato Keep-a-Changelog.
- **Upload/parse de arquivo → API Route, não Server Action.** Libs como `@e965/xlsx` falham no SSR/RSC; API Route (`runtime = 'nodejs'`) isola do contexto React Server Components. (Descoberto no PEND-001/v4.7.)
- **Parse de planilha grande NO CLIENTE → Web Worker, nunca na main thread.** O upload das 4 bases (`/admin/uploads`) parseia client-side; `XLSX.read`+`sheet_to_json`+`parseXxxRows` (~45k linhas) são **síncronos e pesados** — na main thread **travam a página** ("não está respondendo") e congelam o spinner. Rodar no worker (`src/lib/carga/parse.worker.ts`, que reaproveita os 4 parsers isomórficos; chamado via `parseArquivoEmWorker` com **fallback** p/ a main thread se o worker não carregar). `new Worker(new URL('./x.worker.ts', import.meta.url), { type: 'module' })` bunda certo no Next 16/Turbopack. (Custou caro: travada reportada no upload de Vendas — v4.20.2.)
- **Parser de Excel lê o valor `Date` NATIVO da célula, não a string formatada.** Usar `XLSX.read(..., { cellDates: true })` + `sheet_to_json(..., { raw: true })` para datas; `{ raw: false }` reformata para a string de exibição da célula (formato americano `mm-dd-yy` na origem), e adivinhar DD/MM vs MM/DD inverte dia↔mês quando ambos ≤ 12. O `Date` nativo é inequívoco. Heurística de string só como fallback para células que cheguem genuinamente como texto. (Custou caro: inversão dia/mês na importação Gerencial, mascarada porque dias > 12 acertavam por acaso — ADR-0099, v4.9.)
- **Coerção de célula (número/data/string) vem de UM módulo só:** `@/lib/carga/coercao.ts` (`toNum`/`toIsoDate`/`toStr`). NUNCA reescrever um `toNum` local — o ingênuo `Number(String(v).replace(',','.'))` devolve NaN→null para BR com milhar (`8.840,00`, `1.234,56`) = **perda silenciosa**. O `toNum` canônico desambigua ponto milhar (3 díg) × decimal US (≤2 díg); `toIsoDate` lê `Date` nativo sem tz-shift + `DD/MM/YYYY` sem inverter + rejeita serial-0 do Excel. `fmtValor` de Solicitações também consome ele. Testes de tabela em `coercao.test.ts`. (v4.17.0/Balde 2.)
- **Ingestão de Vendas tem UM parser só** (`@/lib/carga/vendas-parser.ts`, isomórfico, sem `'use client'`). Hoje há **um caminho vivo**: a UI (`/admin/uploads`, via Server Actions). Paridade de colunas (incl. `operacao_propria`) é garantida pelo parser único **e** pelo SQL (staging 0118). Não recriar parser por caminho: dois parsers divergentes regrediram silenciosamente a v4.9.x (a via servidor não populava `operacao_propria`). **F2 FECHADO (v4.15.0, ADR-0111):** o caminho real usa o **pipeline atômico** (`limpar_staging_vendas` → `inserir_lote_staging` → `validar_carga_staging` → `promover_carga_vendas`, 0116/0118) — `getAdminClient` (service role), sem timeout de 3s. Uma carga com erro não esvazia mais a base (swap numa transação; ROLLBACK preserva). **Fase 2 CONCLUÍDA (v4.17.1):** a rota servidor vestigial `upload-vendas` e a lib `carga/vendas.ts` (`carregarVendas`) foram **removidas** (código morto desde a v4.15.0). As RPCs do caminho destrutivo antigo `truncate_dynamic_tables`/`inserir_lote_raw` **permanecem no banco SÓ para o `npm run seed`** — fora de qualquer request vivo (exposição de anon já fechada na v4.17.0/M1); a recovery trio (`transform_raw_to_analytics`/`regenerar_dim_operacao_weddings`/`refresh_all_materialized_views`) segue intacta.
- **Schema de `parseRpc` reflete o retorno REAL da RPC, não o tipo TS** (que pode mentir). Um campo que a RPC às vezes não emite tem de ser `.optional()` (não só `.nullable()` — `.nullable()` reprova `undefined`); senão `parseRpc` devolve `null` → a rota dá **HTTP 500** / a tela degrada. Ao criar/alterar um schema de `parseRpc`, adicionar o caso em `rpc-contrato.test.ts` (roda `safeParse` contra a RPC viva) — é o que pega esse drift; o `tsc`/build NÃO pega (validação é em runtime). (Custou caro: 500 na Lista de Operações por `passageiros_raw` exigido mas nunca emitido — v4.12.1, fix pós-M2.)
- **Config/regra nova por campo/entidade atravessa VÁRIAS camadas de mapeamento — verificar ponta-a-ponta.** Quando um atributo novo viaja form → server action → RPC `INSERT` → RPC `SELECT` → schema Zod, **cada camada que faz pick/strip de campos descarta chaves desconhecidas em silêncio** (o map de `handleSubmit`, o map da action, o `jsonb_build_object`/`INSERT` da RPC, e o objeto Zod **sem `.passthrough()`** que estripa antes da UI ler). Esquecer **uma** = a feature some **sem erro de build/tsc/lint** (degradação só em runtime). Regra: ao adicionar um campo de config, listar as camadas e conferir cada uma; o teste que pega é o de contrato (`rpc-contrato.test.ts`, `safeParse`/sobrevivência da chave), não o `tsc`. (Custou caro/atenção: regra de data por campo em Solicitações — 5 camadas + o `SELECT` do loop de `criar_solicitacao` — v4.19.0, ADR-0118.)
- **Casas decimais por contexto.** Valor monetário em **operação individual** (Lista de Operações, drawer de operação) → 2 casas via `fmtBRL2`/`numBRL2` (helpers centrais de `@/lib/fmt`). Agregados e **eixos de gráfico** → abreviado (`fmtMi`/`fmtAxisBRL`, "R$ 1,8 Mi"). Nunca formatação local. (ADR-0100, v4.9.)
- **Formato contábil em tabela financeira densa → `<ValorContabil>`** (`@/components/shared/valor-contabil`, ADR-0124/v4.22): "R$" ancorado à **esquerda** da célula (`--text-subtle`) e número **à direita** com centavos (`numBRL2`), `flex justify-between` + `tabular-nums` (dígitos alinhados entre as linhas). A cor opcional (`className`) pinta **só o número**. Usar nas tabelas do Fluxo de Caixa Gerencial (projeção agregada e base); não remontar esse flex à mão. (Distinto do `fmtBRL2` inline de operação individual.)
- **Timestamptz (UTC do banco) → exibir SEMPRE no fuso de São Paulo via `Intl`+`timeZone`, NUNCA split de string.** Os timestamps do Postgres (`last_sign_in_at`, `decidido_em`, `criado_em`…) chegam em UTC; formatá-los por `iso.split('T')`/`slice(0,10)` mostra a **hora UTC** e **erra o dia perto da meia-noite** (ex.: 02:30Z é 23:30 do dia anterior em SP). Usar `fmtDataSP`/`fmtDataHoraSP` (`@/lib/fmt`, `Intl.DateTimeFormat` + `timeZone:'America/Sao_Paulo'`, cacheados). O split SÓ vale para **datetime LOCAL ingênuo** (sem fuso — ex.: as datas do `CHANGELOG_DIRETORIA`); `fmtDataHora` detecta o marcador de fuso e faz a coisa certa nos dois casos. `data_limite` é `date` puro (sem fuso) — comparar/exibir como string. (Custou caro: `fmtDataHora` de split mostrava UTC — v4.18/M2; o padrão Intl já existia em `solicitacoes/format.ts`.)
- **Gráficos → primitivos de `@/components/charts`.** Tema central, eixos/grade/linha-do-zero, `ChartLegend`, `CustomTooltip` e formatadores de eixo (`fmtAxisBRL`/`fmtAxisPct`/`fmtAxisMes`) — não reconfigurar Recharts à mão. Convenção: sólido = real/efetivo, tracejado = referência/projeção; eixo temporal sempre contínuo. Migração dos legados é incremental (quando tocados). (ADR-0095, v4.8.)
- **Paleta de cores canônica — cor por CONTEXTO semântico, sempre via token, nunca hex literal** (ADR-0103, v4.10): série principal única = `--brand` (herda a aba via `[data-theme]`); ênfase = `--brand-deep`; multi-série YoY = cor distingue métrica (`--brand`/`--text-secondary`) e traço distingue período; **margem** = `--brand-deep`; **cash-flow** (entrada/saída/result.) = `--positive`/`--negative` via `fluxoColors` no drawer de operação e no Financeiro — **exceção:** os cards de cash-flow da visão principal de Weddings (Fluxo de Caixa Mensal, Acumulado de Recebimentos e Pagamentos) usam a identidade Welcome turquesa/mostarda (`--chart-fluxo-entrada/saida`), por decisão de id visual; composição por subsetor = `--subsetor-*` (fallback `--brand`, via `subsetorColor` de `@/lib/config`); breakdown cross-setor = `--setor-*`/`SETOR_COLORS`. **Duas cores por setor (não confundir):** DESTAQUE `--brand` (cor da aba, dentro da aba do setor) vs IDENTIDADE `--setor-*` (só em gráficos cross-setor). Atenção: `--brand` de Trips é #0091B3 — não hardcodar esse hex para série principal em telas de Trips que tenham cash-flow (evitar colisão). **Telas de plataforma (não-setoriais) = neutro Group, nunca `var(--brand)`** (ADR-0103 ext. v4.14.1): auth (`/login`, `/trocar-senha`, `/solicitar-acesso`, `/auth/*`), `/sem-acesso` e `/admin/*` usam tokens neutros DEDICADOS (`--action-primary` #3F4144 botão/realce, `--action-primary-fg`, `--focus-ring`, utilitária `.foco-neutro`), independentes de `[data-theme]` — porque o `:root` tem `--brand: #BD965C` (Weddings) como default e `var(--brand)` daria flash dourado pré-hidratação. Tela de plataforma nova nasce com esses tokens; nunca `#BD965C` nem `var(--brand)`. O wordmark WT FINANCE é dinâmico (cor da aba no setor, `--text-muted` no resto). **Pill "ativa/primária" de plataforma = bege suave** `--action-soft`/`--action-soft-border`/`--action-soft-fg` (espelham o ativo do tema group; mesmo visual das pills de período do Financeiro) — NÃO o `--action-primary` escuro, que é para CTA sólido (ex.: botão Entrar do login). **Foco neutro só em `:focus-visible`** (`.foco-neutro`): o anel sai no teclado, mas clicar com mouse num botão/pill/aba NÃO deixa "sombreado" (inputs de texto ainda mostram o anel ao clicar, pois o browser os trata como focus-visible). (v4.14.2)
- **Card KPI clicável → afordância no hover na cor da aba.** Borda + sombra + o CTA "Ver mais" mudam para `var(--brand)` (cor da aba, resolvida por `[data-theme]`). Utilitária `.card-clicavel`/`.card-clicavel-cta` em `globals.css`; abas futuras herdam pela var (sem regra por setor). (v4.8.1.)
- **Responsividade (telas menores e maiores).** O layout precisa funcionar em larguras pequenas e grandes — validar nos dois extremos, não só no monitor do dev. Padrões que custaram caro (v4.8.x):
  - **Cards num grid de altura igual:** o card deve ser `flex flex-col h-full` e o rodapé (ex.: Receita/Margem) usar `mt-auto`, para as linhas alinharem entre cards mesmo quando o valor principal quebra em 2 linhas em telas estreitas. Não confiar em altura implícita.
  - **Tabelas em container estreito:** preferir `table-fixed w-full` + `truncate` nas colunas flexíveis (evita barra de rolagem horizontal). Em cards compactos, reduzir colunas (o detalhe completo fica no drawer); evitar `whitespace-nowrap` em texto largo.
  - **Eixo Y de gráfico:** usar `ChartYAxisBRL`/`fmtAxisBRL` (rótulo compacto "R$ 1,8 Mi", 1 casa) — formato longo quebra linha em larguras menores.
  - **Sticky dentro do `ListDrawer`** (scroll body `px-6 py-5`): para grudar pills/cabeçalho ao topo sem fresta, usar `sticky -top-5 -mx-6 -mt-5 px-6 pt-5` (o `-top-5/-mt-5` cancelam o `py-5` do scroll body). (Recorrente — não reinventar.)

---

## Definition of Done

Uma versão está pronta quando:
- [ ] `npm run build` limpo
- [ ] `npx tsc --noEmit` zero erros
- [ ] `npm run lint` sem warnings novos
- [ ] `npm test` verde (unit dos helpers + contrato das RPCs críticas) — ADR-0105
- [ ] Smoke tests das áreas afetadas passando
- [ ] Migrations aplicadas via `npm run db:migrate` (backup-gate rede verde; **destrutiva com confirmação humana**) e RPCs verificadas via REST
- [ ] ADRs novos registrados (numeração real verificada)
- [ ] `CHANGELOG.md` com entrada da versão
- [ ] Entrada da versão no `CHANGELOG_DIRETORIA` (`src/data/changelog-diretoria.ts`), em linguagem de negócio
- [ ] `package.json` e `src/lib/version.ts` com a versão nova
- [ ] Out-briefing `.md` gerado
- [ ] CLAUDE.md avaliado (aprendizado permanente adicionado, se houver)
- [ ] Worktree limpa (após merge)
- [ ] PR aberto (merge e deploy ficam com o usuário)

---

## Salvaguardas (o que NÃO fazer)

**Barreiras duras (nunca, independentemente do prompt):**
- **Não fazer merge** de PR. **Não fazer deploy** (Vercel é automático no merge). Merge humano é a única fronteira.
- **Não aplicar migration DESTRUTIVA sem confirmação humana** — o `npm run db:migrate` roda o backup-gate como **rede** (backup + manifest-check + restore-test spot), mas a confirmação **permanece**; o gate NÃO autoriza autonomia destrutiva (isso seria follow-up do modo completo). Aditiva roda em autonomia sob gate-rede + declaração prévia. Verificar consumidores reais antes de remover objeto. (ADR-0116.)
- **Não pular a auto-auditoria adversarial** antes de declarar concluído — é o que pega o "dado errado parecendo certo", inclusive erros do briefing.
- **Subagentes não rodam git/build/banco/servidor** — só editam arquivos (race no índice git, banco e portas).
- **Não decidir produto.** Item de fronteira de produto para e pergunta; na dúvida, é produto.

**Disciplina (regra do projeto):**
- **Não expandir escopo** além do briefing da versão — achado novo vira registro no out-briefing, não implementação no meio.
- **Verificar consumidores reais antes de remover** qualquer objeto (RPC/rota/lib) — "órfão" pelo briefing pode ter uso vivo (precedente: `seed` na v4.17.1).
- **Não remover worktree** com trabalho não-merjado.
- **Não usar `git add -A` cego** — adicionar arquivos específicos por missão.
- **Não confiar na numeração de ADR/migration do briefing** — verificar `docs/adr/` e `supabase/migrations/` reais.
- **Não adicionar escopo a um PR/versão já mergeado.** Addendum pedido depois do merge do PR de origem vira **patch novo** (branch, PR e número de versão próprios), nunca commit tardio no escopo já fechado. (Precedente: v4.14.2 — ajustes pedidos "para fechar a 4.14.1" já mergeada foram para PR/versão próprios.)
