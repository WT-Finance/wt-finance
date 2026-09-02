---
name: banco-e-rpc
description: Banco Supabase do Janus — migrations (aditiva × destrutiva, backup-gate, wrapper db:migrate), RPCs SECURITY DEFINER com app.exigir_acesso inline, RBAC/RLS, timeouts por role, fuso, schemas (analytics não exposto; espelho Monde × upload) e verificação REST pós-push. Use SEMPRE que for criar ou alterar migration/RPC, investigar erro de banco (timeout 57014, PGRST, permissão), decidir de qual fonte um dado vem, ou reusar uma RPC existente (MEÇA a semântica antes).
---

# Banco e RPC — Janus (Supabase/Postgres)

> **Nota cruzada D-12.** O checklist do agente `revisor-db` (`.claude/agents/revisor-db.md`)
> espelha INLINE — por decisão deliberada, não descuido — as regras de RBAC/timeout/coalesce
> desta skill: banco é o domínio em que uma skill que não dispara custa mais caro que a
> duplicação. Sempre que uma convenção de banco mudar aqui, atualizar **esta skill E o
> `revisor-db`** juntos — isso é item do ritual `/fechamento-versao`. Divergência entre os
> dois é bug de documentação, não escolha de estilo.

Esta skill cobre TUDO que envolve o banco Supabase/Postgres do Janus: como aplicar
migrations com segurança, como uma RPC nova deve nascer (RBAC, grants, timeout), de qual
schema/fonte um dado realmente vem, e como verificar que uma RPC funciona de verdade antes
de dar por encerrado.

---

## 1. Comandos e o wrapper `db:migrate`

```bash
npx supabase migration list           # inspecionar local vs remote (READ-ONLY, seguro)
npm run db:migrate -- --aditiva       # backup-gate (rede) → db push AUTOMÁTICO
npm run db:migrate -- --destrutiva    # backup-gate (rede) → db push COM CONFIRMAÇÃO HUMANA
```

O CLI do Supabase não está instalado globalmente — sempre `npx supabase ...`, nunca
`supabase ...` puro.

### `db push` aplica TODO o conjunto PENDENTE, não só a migration que você escreveu

**Custou caro (v5.2.0):** a v5.2.0 dropou as bases antigas do Fluxo de Caixa sem querer ao
aplicar um fix aditivo, porque uma migration de `DROP` estava pendente na pasta
`supabase/migrations/` — o `--aditiva` **não bloqueia** uma destrutiva que esteja no pending;
ele só decide se a CONFIRMAÇÃO é automática, não o que é varrido. O backup pré-push salvou a
recuperabilidade, mas a barreira "destrutiva só com humano" foi furada por essa via.

**Regra:** nunca escrever a migration destrutiva dentro de `supabase/migrations/` antes da
hora de efetivamente rodar `--destrutiva`. Se precisar preparar o SQL destrutivo com
antecedência, guardá-lo **fora** dessa pasta até o momento de aplicar.

### Produção direta, sem staging — o backup-gate é a rede real

`--linked` aplica direto em PRODUÇÃO — não existe staging separado, só `.env.local`. Uma
migration ruim vai direto para produção, sem rede de proteção estrutural.

Branching do Supabase foi avaliado e **descartado** (investigação 2026-06-13): o branch
efêmero nasce sem dado de produção — pega erro de *schema*, não perda de *dado* (que é o
risco real aqui: `dim_data` de range fixo, timeout de 3s, N+1 por volume) — e a promoção no
merge roda direto em prod sem re-validação. `supabase start` local depende de Docker, ausente
no WSL2.

**O wrapper `npm run db:migrate` (`scripts/db-gate/`, ADR-0116) roda o backup-gate ANTES do
push — é uma REDE de recuperação, não uma autorização.** Ele:
1. Gera o backup-do-dia em `~/wt-finance-backups/AAAA-MM-DD-<label>/`.
2. Checa **completude** (todas as tabelas vivas de produção presentes, count conferido).
3. Restaura um **subconjunto-chave** num schema descartável e compara **produção × restaurado**
   (count + checksum).
4. **Vermelho aborta** — o push simplesmente não acontece.

O gate garante **recuperação**, não **prevenção**: uma migration equivocada ainda muda
produção, mas dá para restaurar do backup-do-dia. Runbook completo:
`docs/runbooks/db-backup-gate-runbook.md`. (Restore-test do conjunto COMPLETO é follow-up; o
spot atual é o núcleo que já existe.)

Ao testar escrita em produção (ex.: commit de import de teste), usar dados com nomes
distintos e deletar logo em seguida.

### Aditiva × destrutiva — a fronteira que decide o regime

**ADITIVA / retrocompatível** — `CREATE`, `ADD COLUMN` anulável, RPC nova, índice novo,
`GRANT`/`REVOKE`, validação que só acrescenta a um array de `erros`. Regime **autônomo, sem
confirmação humana**: `npm run db:migrate -- --aditiva` (gate como rede) + **declaração
prévia no header da migration** (o que ela faz; por que é aditiva/retrocompatível com a
`main` viva; que não escreve em dado pré-existente).

**DESTRUTIVA** — `DROP`, `TRUNCATE`, `ALTER` que remove/reescreve coluna ou dado,
`UPDATE`/`DELETE` em dado já existente. **Continua exigindo confirmação humana** antes do
`db push`. `npm run db:migrate -- --destrutiva` roda o backup-gate como rede e **mantém a
confirmação** — não auto-confirma. O gate é rede, não autorização de autonomia destrutiva
(isso só mudaria com o restore-test COMPLETO, ainda follow-up).

**Antes de qualquer DROP, verificar consumidores reais** — grep no app **e** em
`supabase/seed/`, mais uma auditoria cética. A classificação de "órfão" vinda do briefing NÃO
basta: na v4.17.1, o briefing mandava dropar `truncate_dynamic_tables`/`inserir_lote_raw` e a
auto-auditoria descobriu que `npm run seed` ainda as consumia — só `admin_definir_usuario_ativo`
era de fato órfã. `DROP` é destrutivo: exige confirmação + reversibilidade documentada (corpo
salvo na migration de origem).

### A confirmação destrutiva vive no WRAPPER, e EOF ABORTA (ADR-0131)

`migrate.mjs` pede a confirmação ele mesmo — não delega mais ao prompt nativo do `db push`
(cujo default em modo headless prosseguia, ou seja, era *fail-open*; a segurança dependia do
harness em volta, não do próprio comando). Em stdin **não-TTY/EOF** (headless, pipe, CI, ou um
agente rodando o comando), o wrapper **aborta antes do gate** — EOF nunca confirma.

Consequência prática: **um agente não consegue aplicar uma migration destrutiva** (sem TTY →
abort automático). Só um humano num terminal interativo consegue confirmar e aplicar.

A **classificação** "destrutiva" vem de `scripts/db-gate/classificar.mjs`, que usa um
**tokenizer** (excisa comentários, strings e corpos `$$...$$`, casando só o nível **top-level**
do SQL) — não mais regex sobre texto cru. Isso significa: DML dentro do **corpo** de um
`CREATE FUNCTION` não é mais falso-positivo; `DROP FUNCTION` vira **warn** (é troca de
assinatura, não perda de dado); `DROP`/`TRUNCATE`/`ALTER ... DROP`/`UPDATE`/`DELETE`
top-level e qualquer ambiguidade do tokenizer classificam como **destrutiva** — falha
fechada. A sonda que prova isso é `scripts/db-gate/classificar.test.mjs` (roda dentro de
`npm test`).

---

## 2. Schemas e de onde os dados realmente vêm

### `analytics` NÃO é exposto pela API REST

O `config.toml` do Supabase expõe só `["public", "graphql_public"]`. Tabelas do schema
`analytics` **não são acessíveis** via `.schema('analytics').from(...)` — isso retorna
`PGRST106`. **Regra:** todo acesso a tabela de `analytics` passa por RPC `SECURITY DEFINER`
no schema `public`. (Descoberto na v4.6; é o mesmo padrão para qualquer schema não-exposto.)

### Fonte de produção das vendas: espelho Monde × upload (fallback dormente) — v5.1.4/ADR-0151

Desde a v5.1.4 a fonte das vendas pode ser **virada** do upload de Excel para o **espelho
Monde** (`monde.mv_vendas_diarias`) por **REPOINT reversível** (migration 0181). As 7 funções
**PURA-mv**:

- `get_executiva_kpis__nucleo`
- `metas_ritmo_diario`
- `get_tendencia_margem__nucleo`
- `get_decomposicao_variacao__nucleo`
- `get_historico_12m_setores__nucleo`
- `get_mix_setor__nucleo`
- `get_historico_mensal__nucleo`

leem o Monde via **views-compat** (`monde.mv_vendas_diarias_compat`, com `setor_macro_id`; e
`monde.mv_vendas_mensais`). O **fato do upload é INTOCADO** — o rollback é o bloco `DOWN` da
migration 0181 (repoint de volta a `analytics.*`), **nunca** restauração de dado; o upload
vira **fallback dormente**, não removido.

**Exceção que importa:** `get_mix_produto`/`get_cagr` **NÃO viraram** — continuam lendo
`fato_venda` DIRETO (precisam de breakdown por produto / anos completos), então seguem no
upload até o *fato* do Monde existir com essa granularidade (escopo futuro). Metas ≡
Performance por construção (mesma `get_executiva_kpis`); a definição de receita/margem não
mudou (o diagnóstico da virada provou paridade ~99% ao centavo; o delta residual é currency
que some pós-flip). Sincronização agendada por **`pg_cron`+`pg_net` a cada ~15min** (migration
0182, secrets no Vault) chamando `/api/monde/ingest?mode=incremental`; o Cron da Vercel ficou
dormente/redundante. **O flip em si é aplicado pelo Yan** (gate: comunicação à diretoria antes
de aplicar; a migration NÃO se auto-aplica). O espelho Monde foi ingerido na v5.1.2 (schema
`monde`); a paridade de receita foi provada no diagnóstico da virada.

Ao decidir "de onde vem esse número", primeiro pergunte: é uma das 7 PURA-mv (veio do Monde,
via view-compat) ou é `get_mix_produto`/`get_cagr`/algo de Weddings operacional (ainda upload)?

### `dim_data` tem range fixo — FK em `fato_venda`

`analytics.fato_venda.data_venda` tem FK para `analytics.dim_data(data)`, semeada com range
**fixo** (era 2024–2030; estendida para 2022–2030 na migration 0100). Subir Vendas com datas
FORA do range faz `transform_raw_to_analytics` abortar em `fato_venda_data_venda_fkey`.

**Pior:** o upload roda `truncate_dynamic_tables` (CASCADE) **ANTES** do transform — se o
transform falha, `fato_venda` fica **VAZIA em produção** (os dados crus sobrevivem em
`raw.vendas_excel`, então nada se perde de verdade, mas a base fica inconsistente até
recuperar).

**Regra de recuperação (sem re-upload):** estender `dim_data` com uma migration
(`generate_series` + mesma derivação do seed `0002`, `ON CONFLICT (data) DO NOTHING`) e então
rodar, nessa ordem: `transform_raw_to_analytics` → `regenerar_dim_operacao_weddings` →
`refresh_all_materialized_views`. (Descoberto em mai/2026, migration 0100.) Esse mesmo sintoma
aparece na skill `ingestao-planilhas` do lado do upload — é o mesmo erro visto pela ponta do
app.

---

## 3. Performance: timeout por role e fuso horário

### `statement_timeout` por role — o PostgREST aplica o rolconfig a CADA requisição

Os roles têm timeout DIFERENTE, vindo do `rolconfig` (`ALTER ROLE ... SET
statement_timeout`): `anon`=3s, `authenticated`=8s, `service_role`=**0 (sem limite), e só
porque a migration 0145 setou isso EXPLICITAMENTE** (ADR-0122). Uma RPC que ultrapasse o
limite do seu role estoura `57014 canceling statement due to statement timeout` → vira
HTTP 500 na UI ou erro de carga.

**Como funciona (não é automático):** `SET ROLE` sozinho **não** aplica o rolconfig do
papel-alvo (testado). É o **PostgREST que aplica o rolconfig do papel da requisição a cada
chamada** — é assim que `anon`=3s / `authenticated`=8s realmente valem. Se o rolconfig do
papel **não** define `statement_timeout`, cai no default do banco (**120s**).

**Custou caro:** o `service_role` ficou com rolconfig nulo → cargas pesadas via
`getAdminClient` herdaram 120s, e `promover_carga_vendas` estourou (v4.20.1, fix migration
0145).

**Regras práticas:**
- Toda RPC consumida pela UI roda como **`authenticated`** (8s) — validar contra ESSE
  limite, não só com service role (que hoje não tem limite). Atenção especial a N+1 (função
  escalar por linha numa RPC de listagem) e a casts em coluna de JOIN que impedem uso de
  índice — ambos pioram com o volume. (Custou caro: `contar_convidados_operacao` ×
  ~140 operações após o backfill 0100; fix migration 0101.)
- **O timer é armado no statement EXTERNO do PostgREST e não dá para desarmá-lo de dentro da
  função** (testado: nem `SET statement_timeout=0` como atributo da função, nem `SET LOCAL`
  no corpo, afetam o statement em curso). Uma RPC de carga pesada (service_role) só escapa do
  timeout pelo **rolconfig do role** — nunca por código dentro da função. Mudou o timeout de
  um role? Rodar `NOTIFY pgrst, 'reload config'`.

Esse orçamento de 8s também está no checklist do `revisor-db` (é um dos itens espelhados
inline, ver nota D-12 no topo).

### Fuso: app roles em `America/Sao_Paulo`; `postgres` (migrations/seed) em UTC

A sessão **padrão** do Postgres/Supabase é UTC, mas os papéis que o PostgREST usa por
requisição — `anon`/`authenticated`/`service_role` — têm `timezone = 'America/Sao_Paulo'` no
rolconfig (migration **0152**, ADR-0125). Como o PostgREST aplica o rolconfig do papel a cada
chamada (mesmo mecanismo do `statement_timeout` acima), em **toda RPC do app**
`CURRENT_DATE`/`now()::date`/`date_trunc('month', CURRENT_DATE)` já refletem o "hoje" de São
Paulo — uma RPC nova ganha isso de graça, sem precisar de `AT TIME ZONE` explícito.

Antes da 0152 era UTC, e o "hoje" adiantava um dia a partir de ~21h de SP (sintoma real: a
projeção do Gerencial começava em "amanhã" — fix pontual na migration 0151, depois sistêmico
na 0152).

**Exceção que importa:** `postgres` **NÃO** foi alterado — **migrations e `npm run seed`
rodam como `postgres`, em UTC**. Se uma migration/seed precisar do "hoje" de SP num
`UPDATE`/backfill/`generate_series`, usar `(now() AT TIME ZONE 'America/Sao_Paulo')::date`
explícito — `CURRENT_DATE` cru dentro de uma migration ainda é UTC.

Para **exibição** de `timestamptz` no app a regra de sempre continua valendo:
`fmtDataSP`/`Intl` com `timeZone`, nunca split de string — o fuso do role muda só o **offset**
do ISO retornado, não o instante em si. (Ver skill `ui-design-system` para o lado da exibição.)

---

## 4. RBAC e RLS do lado do banco

Login obrigatório via Supabase Auth. Autorização é **RBAC dinâmico por área**
(`app.rbac_*`; 11 áreas; granular por setor em Performance). Enforcement em 4 camadas — a
camada de RPC/banco é a que esta skill cobre; guards de página/API/action (`requireArea*`,
`proxy.ts`) e o fluxo de senha provisória/troca no 1º acesso ficam na skill
`contrato-rpc-front`.

### RPC exposta = sempre `SECURITY DEFINER` + `app.exigir_acesso` — dois padrões coexistem

**Toda RPC de leitura exposta é `SECURITY DEFINER` e checa `app.exigir_acesso(<áreas>)` antes
de tocar em qualquer dado.**

- **Wrapper + `__nucleo`** — função pública `SECURITY DEFINER` que chama `exigir_acesso` e
  delega para `<fn>__nucleo` (service-role-only). É o molde da migration **0121**, um
  **retrofit** para preservar a assinatura de RPCs que já existiam e já tinham consumidores
  antes do RBAC dinâmico chegar. **Não é o molde para função nova** — é legado de retrofit.
- **Padrão INLINE** — desde a v4.29 (migrations 0160–0165), é o padrão para **RPC NOVA**:
  `PERFORM app.exigir_acesso(ARRAY[...])` como **primeira linha do próprio corpo** da função,
  sem indireção a `__nucleo`, mantendo explícitos `REVOKE EXECUTE ... FROM PUBLIC, anon` /
  `GRANT EXECUTE ... TO authenticated, service_role`. Exemplos: `acervo_listar`/
  `acervo_criar`/`acervo_doc_path` (0165), `importar_clientes_corp`/`listar_clientes_corp`
  (0164). RPC com `p_setor` deriva a área via `app.areas_do_setor`.

### `anon`/`authenticated` ganham EXECUTE em função nova por default — nunca contar com isso

O Supabase dá `anon`/`authenticated` EXECUTE em função nova por *default privileges*, mesmo
com `REVOKE ... FROM PUBLIC` explícito na própria função. **Custou caro:** as 72 funções do
projeto tinham `anon` mesmo com esse revoke (incluindo `truncate_dynamic_tables`) — a migration
0122 corrigiu isso com `ALTER DEFAULT PRIVILEGES ... REVOKE EXECUTE ... FROM anon,
authenticated`. **Regra:** todo `GRANT EXECUTE` é explícito; nunca contar com o default do
Postgres/Supabase.

### RLS é deny-by-default e NÃO-permissivo

RLS está ligado em todas as tabelas dos 6 schemas do projeto, sem nenhuma policy `USING true`
(a migration 0123 removeu as herdadas). Como o app nunca acessa tabela direto (zero `.from()`
no código), RLS hoje não afeta o caminho real (que é via RPC, e o owner `postgres` ignora
RLS) — mas uma policy permissiva seria um furo latente. Manter a camada de RLS também fechada,
mesmo sem uso direto.

### `coalesce(..., false)` em predicado com coluna anulável — NULL não é negação

`coluna = auth.uid()` retorna **NULL** (não `false`) quando `coluna` é NULL — exemplo real:
`destinatario_user_id = uid` numa solicitação atribuída a uma ROLE (onde `user_id` é nulo por
natureza). Numa cadeia `OR`, `false OR NULL = NULL`; e `IF NOT <expr nula> THEN RAISE` **não
dispara** (`NOT NULL = NULL`, que não é `true`) — então o `RAISE` de negação é pulado, e isso
é **vazamento de permissão** (um terceiro vê ou age sobre algo que não deveria).

Uma cláusula `WHERE` tolera isso (NULL simplesmente exclui a linha), mas um predicado
booleano usado em `IF` ou uma função `RETURNS boolean` **não tolera** — precisa do
`coalesce`.

**Regra:** toda comparação de permissão envolvendo coluna anulável vai em
`coalesce(<comparação>, false)`; funções de visibilidade retornam boolean estrito, nunca
NULL. **Custou caro:** vazamento em `pode_ver_solic`/`sou_atendente`, pego pela auto-auditoria
adversarial (v4.16.0, fix migration 0129) — foi a auditoria direto na RPC, não a UI, que
pegou o problema. Este item também está espelhado inline no checklist do `revisor-db`.

### Janela anônima ENCERRADA (v4.17.0/M1, ADR-0114)

`anon` não executa **nenhuma** RPC de dado — `REVOKE EXECUTE` em tudo de `public`/`app`
**exceto `solicitar_acesso`** (auto-cadastro, com rate-limit). `exigir_acesso` nega `anon`
SEMPRE (o ramo "anon passa quando o enforcement está OFF" foi removido) e só libera contexto
**sem JWT** se `session_user` for um superusuário real (migrations/seed/`db query` rodando
como `postgres`) — a requisição anônima do PostgREST chega sem claims, e era exatamente esse
o furo (fail-open) antes do M1. Toda RPC consumida pela UI roda como `authenticated`. RPC ou
grant novo nasce **sem** `anon` (é o efeito combinado da 0122 + essa limpeza). Não reabrir
`anon` para nenhuma RPC nova.

### Kill switch é emergência, não mais compatibilidade

`app.config.auth_enforcement` + `admin_set_enforcement` permanecem como alavanca de
**emergência** (runbook `docs/runbooks/v4-13-auth-runbook.md`), mas **não regem mais o
caminho anon** (o M1 removeu esse ramo). Anti-lockout vive nas RPCs `admin_*` — não dá para
se auto-desativar nem para tirar o próprio acesso a `admin/acessos`.

---

## 5. Convenções de migration

- Arquivos: `supabase/migrations/NNNN_nome.sql`, numeração sequencial — **verificar a
  numeração real em `supabase/migrations/`**, nunca confiar na numeração sugerida por
  briefing.
- RPC nova: sempre `SECURITY DEFINER` + `REVOKE EXECUTE ... FROM PUBLIC` + `GRANT EXECUTE ...
  TO service_role` (e `authenticated` quando for consumida pela UI).
- `max_rows = 1000` no PostgREST — é o limite de payload de RPCs/queries. Considerar isso em
  listagens grandes (paginação ou agregação no servidor).
- Subagentes que criam migration recebem o **número exato** do orquestrador e **NÃO aplicam**
  — quem aplica, em lote e sequencialmente, é o orquestrador depois que todas as edições
  terminam.
- **Antes de `DROP` de qualquer objeto, verificar consumidores reais** (grep no app **e** em
  `supabase/seed/`, mais uma auditoria cética). "Órfão" pelo briefing não é garantia — ver o
  precedente da v4.17.1 na seção 1. `DROP` é destrutivo: confirmação + reversibilidade
  documentada (corpo salvo na migration de origem).

### Validar contra o TIPO: ler do SNAPSHOT, nunca da tabela viva

Quando uma RPC precisa saber algo sobre a *definição* de um campo (é obrigatório? qual o
tipo?), a fonte intuitiva é a tabela de definição — e ela é a **errada** se o módulo mantém
snapshot. Definição viva muda; snapshot não. Ler da viva é **fail-open** sempre que a
consulta não achar linha e o código tratar "não sei" como "não".

**Custou caro (v5.9.1).** A regra "não esvaziar campo de anexo obrigatório" consultava
`app.solicitacao_campo`. Só que `solicitacao_anexo.campo_id` é referência **lógica, sem FK**
(0127), `admin_solic_salvar_tipo` faz `DELETE` + re-`INSERT` de **todos** os campos a cada
edição do tipo, e o id é `IDENTITY` (nunca reusado) — então todo anexo de um tipo já editado
tem `campo_id` órfão. `SELECT ... INTO v_obrig` não achava linha, `coalesce(v_obrig, false)`
lia isso como "não é obrigatório", e a trava abria exatamente onde devia fechar.

**Medido antes de corrigir: 9 dos 68 anexos com campo já estavam órfãos, e o snapshot de
todos dizia `obrigatorio: true`** — os casos em que a regra falharia eram justamente os que
ela existia para pegar.

```sql
-- ERRADO: fonte mutável; NOT FOUND vira "não é obrigatório"
SELECT c.obrigatorio INTO v_obrig FROM app.solicitacao_campo c WHERE c.id = v_anexo.campo_id;
IF coalesce(v_obrig, false) THEN ...

-- CERTO: snapshot da instância (ADR-0112: imutável, sobrevive a editar/arquivar o tipo)
SELECT (r->>'obrigatorio')::boolean INTO v_obrig
  FROM jsonb_array_elements(v_sol.respostas) r
 WHERE (r->>'campo_id')::bigint = v_anexo.campo_id AND r->>'tipo_campo' = 'anexo';
IF v_obrig IS NULL OR v_obrig THEN ...   -- e FAIL-CLOSED sob ambiguidade
```

Bônus: o snapshot costuma ser a **mesma fonte que a UI usa** para renderizar, então tela e
banco concordam por construção em vez de por coincidência. Antes de escrever a validação,
pergunte: *isto se lê de algo que muda, ou do retrato que a instância guardou?*

### `CREATE OR REPLACE` se escreve a partir do CATÁLOGO VIVO, nunca da migration de origem

A função que está no banco pode já ter divergido do arquivo que a criou — e o `REPLACE`
sobrescreve o corpo inteiro, então tudo que existia a mais **some em silêncio**: sem erro de
banco, sem erro de build, sem teste vermelho. O sintoma aparece na tela do usuário, como um
campo que parou de vir.

**Custou caro (v5.9.0):** `app.solic_json` foi criada na 0130, mas ganhou a chave `origem`
(plataforma da API externa) na **0217**. Reescrevê-la a partir da 0130 — o arquivo "de origem",
o que a intuição manda abrir — teria apagado o selo "aberta via integração" que o board exibe.

```bash
# a verdade é o catálogo, não o arquivo:
npx supabase db query --linked "SELECT pg_get_functiondef(p.oid) FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='app' AND p.proname='solic_json'"
```

Introspecção read-only é exatamente o uso legítimo do `db query` (o que ele NÃO faz é executar
o corpo de uma RPC gated — §6). O mesmo vale para a nota de **`DOWN`** do header: citar a
migration errada como fonte de reversão é induzir a MESMA perda na volta. Liste a **última**
definição de cada função, não a primeira — `grep -l "FUNCTION public.<nome>" supabase/migrations/`
e pegue a de número mais alto.

### Numeração de migration entre BRANCHES PARALELOS é ponto cego estrutural

Conferir `supabase/migrations/` da sua worktree **não basta** quando há outra versão em voo.
Cada árvore, isolada, parece sequencial e correta; a colisão só existe no conjunto — e o modo
de falha é **silencioso**: o CLI identifica a migration pelo **prefixo numérico**, não pelo
nome, então a segunda branch a aplicar tem o arquivo dela tratado como "já aplicado" e
**pulado**, deixando a estrutura ausente em produção sem erro nenhum.

```bash
ls supabase/migrations/ | tail -3
ls ../*/supabase/migrations/ | tail -3    # TODAS as worktrees irmãs
```

**Custou caro (v5.9.0):** a v5.8.0 tinha só a `0255` quando a v5.9.0 começou e avançou para
`0256`/`0257` no meio da implementação — a colisão nasceu depois da checagem. Por isso a
conferência é **imediatamente antes de aplicar**, não no planejamento: a outra branch se move.
Quem aplicar por último renumera. (Achado CRÍTICO do `revisor-db`; candidato a enforcement no
wrapper `db:migrate`, varrendo `.claude/worktrees/*/supabase/migrations/`.)
### Relaxar uma coluna (`DROP NOT NULL`) conta como DESTRUTIVA — e o desenho é que muda (v5.8.0)

O classificador do backup-gate (`scripts/db-gate/classificar.mjs`) casa
`/\bALTER\s+TABLE\b[\s\S]*\bDROP\b/` — **sem distinguir `DROP COLUMN` de `DROP NOT NULL` ou
`DROP CONSTRAINT`**. Qualquer um dos três torna a migration DESTRUTIVA, o que exige confirmação
humana em TTY (ADR-0131) e o agente **não alcança por construção**.

O regex está certo em ser conservador — quem tem de mudar é o desenho, não a rede. **Não
contorne** (é protocolo D5: `db push` cru pula o backup-gate). O caminho autônomo é:

1. **CREATE TABLE nova com a forma certa** (a coluna já anulável, os CHECKs certos);
2. **seed por `INSERT ... SELECT`** a partir da antiga — `INSERT` é aditivo;
3. **repontar a leitura** (`CREATE OR REPLACE VIEW`/`FUNCTION` — aditivos);
4. deixar a antiga **órfã de leitura, sem remover** (`DROP` também é destrutivo) e **registrar
   a dívida**.

Custa uma tabela redundante até uma destrutiva futura, e é barato quando ela é pequena. Na
v5.8.0 foi exatamente isso: `dre_comp_map` nasceu com `sub_chave NOT NULL` (curadoria por
migration, onde todo par tem destino) e o editor precisava do estado "sem destino";
`financeiro.dre_comp_par` nasceu anulável, a leitura repontou, e a antiga ficou como fonte do
seed e alvo do teste de paridade contra os anexos do briefing.

⚠️ Ao repontar por `CREATE OR REPLACE VIEW`, a lista de colunas (nomes, ORDEM e tipos) tem de
ser idêntica, senão o `REPLACE` falha — e **redeclare** `REVOKE`/`GRANT` mesmo sabendo que o
Postgres preserva as ACLs (precedente 0197/0206): o dia em que aquilo virar `DROP`+`CREATE`, o
default privilege do Supabase abre `anon` em silêncio.

### `CHECK` com `CASE` sobre enum: sem `ELSE false` é FAIL-OPEN

Um CHECK que valida "quais campos cada tipo exige" é natural escrever como `CASE tipo WHEN
'a' THEN <predicado> WHEN 'b' THEN … END`. **Sempre fechar em `ELSE false`.**

`CASE` sem `ELSE` devolve **NULL** para um valor que nenhum ramo cobre — e **CHECK que avalia
NULL é considerado SATISFEITO** pelo Postgres (a semântica é "rejeita só quando é
comprovadamente falso"). O resultado: acrescentar um valor ao enum sem escrever o ramo
correspondente faz a constraint **aceitar qualquer combinação** de campos para aquele valor.
A defesa que parecia estar ali some sem erro nenhum.

```sql
CONSTRAINT mov_destino_por_tipo CHECK (
  CASE tipo
    WHEN 'transferencia' THEN area_destino_id IS NOT NULL AND detentor_destino_id IS NOT NULL
    ...
    ELSE false      -- ⬅ tipo novo sem ramo TRAVA o INSERT, em vez de passar batido
  END
)
```

O par que realmente protege é **enum fechado + um ramo por valor + `ELSE false`**. E se o mesmo
contrato viver espelhado no TS (um mapa que decide quais campos o formulário mostra), a paridade
precisa de **teste** lendo o SQL aplicado — comentário "as duas pontas mudam JUNTAS" não reprova
nada. Precedente: v5.6.0, `paridade-sql.test.ts` compara enums, exigência por tipo e mapa de
status derivado contra as migrations `0247`/`0248`.

⚠️ Esse teste lê a migration **por nome de arquivo**. Como migration aplicada é registro
imutável, uma alteração futura do objeto vem numa migration NOVA — e o teste continuaria
aprovando um espelho obsoleto até alguém apontar os caminhos para ela. Deixar o aviso no
próprio teste.

### Migration que muda ESTRUTURA/DADO: prove o invariante ANTES de escrever o SQL

Quando a migration reorganiza dado existente (mover bloco de lugar, fundir agrupadores,
recategorizar), o que autoriza a aplicação é um **invariante**: "tal número não pode mudar".
Três coisas, nesta ordem, e nenhuma delas escreve em produção:

1. **Prove em FORMA FECHADA.** Se a transformação é aritmética, escreva a álgebra. Na v5.7.0:
   `RAIR' = (LL − IMOB) + INV + IMOB = RAIR` ⇒ `ΔREX = 0` — o imobilizado muda de lugar
   *dentro da mesma soma*, e a soma é indiferente à ordem das parcelas.
2. **MEÇA read-only** o estado atual (uma chamada REST por período) e confronte com a
   previsão. Se a álgebra e a medição concordam, o ensaio acabou.
3. **Só então escreva o SQL**, e deixe um script que capture antes/depois e **reprove** se o
   invariante mover (modelo: `scripts/dre-oracle.mjs`).

Isso **dispensa o ensaio em transação revertida** contra produção — que é o reflexo natural
quando não há staging (§1), mas é escrita (ainda que desfeita) para obter uma garantia que
uma leitura já dava. ⚠️ Se o invariante envolve o **período corrente**, ele é alvo móvel (o
previsto amadurece todo dia): só um par antes/depois tirado **no ato da aplicação** prova algo.

### Simule os regexes da migration contra o dado VIVO antes de entregá-la

Migration que faz `UPDATE … WHERE coluna ~ 'regex'` ou `regexp_replace` acerta um conjunto
que **ninguém contou**. Puxe o estado vivo por REST e rode o MESMO regex em script antes de
entregar: quantas linhas casam, quais são, e como cada uma fica depois.

**Custou caro na v5.7.0:** o briefing dizia "os **18** overrides `(-)` perdem o prefixo". São
**12** — os outros 6 eram overrides de *capitalização*, que o próprio briefing mandava manter.
A simulação pegou isso antes de o arquivo ir para o TTY; sem ela, a reconciliação fail-closed
teria abortado a aplicação na frente do humano, ou pior, passado com o conjunto errado.
Vale também para o caminho inverso: confirme que **nenhuma** linha fora do alvo casa.

### `reverter_diario` pressupõe UM toque por linha por lote

O undo em lote (`0206`, ADR-0156) compara, para cada entrada, o estado atual da linha com o
`dados_depois` dela, processando `ORDER BY id` ASC. Isso assume que cada linha foi tocada
**uma vez** no lote — verdade no fluxo normal do editor (um upsert por `categoria_id`), e
**falso numa migration** que atualiza a mesma linha em passos separados (ex.: a fórmula num
passo, o rótulo em outro). Aí a entrada mais antiga guarda um estado INTERMEDIÁRIO, a
comparação falha e a transação inteira aborta **sem reverter nada**.

Consequência prática: **não prometa "reversível pelo painel" no header de uma migration de
estrutura** sem antes conferir se ela toca alguma linha mais de uma vez. O dado continua
recuperável entrada por entrada (DESC de `id`) ou por migration corretiva — mas não pelo
clique único. (Achado ALTO do `revisor-db` na v5.7.0.)

---

## 6. Verificação pós-push

Testar toda RPC nova via REST com a **service role key** antes de considerar pronto:

```bash
curl -s -X POST "https://<project-ref>.supabase.co/rest/v1/rpc/<fn>" \
  -H "apikey: $SVCKEY" -H "Authorization: Bearer $SVCKEY" \
  -H "Content-Type: application/json" -d '{...}'
```

### REST com `service_role` EXECUTA o corpo da RPC — `db query` não substitui isso

A verificação REST com `service_role` **executa de verdade o corpo** da função (o
`service_role` é o ramo *trusted* de `exigir_acesso`) — é isso que pega erro de **runtime**
dentro do corpo. **Introspecção via `npx supabase db query` NÃO substitui essa verificação**:
o `db query` roda num papel sem JWT e não-superusuário, então `exigir_acesso` **nega a
chamada antes do corpo rodar** — e mascara qualquer erro que estivesse lá dentro.

**Custou caro:** `gerencial_historico_lotes` foi para produção com `max(usuario_id)` na
v5.2.1 — o Postgres **não tem `max()`/`min()` para `uuid`** (precisa agregar via `::text`),
mas o smoke feito por `db query` parou no gate de acesso e nunca chegou a executar o corpo; o
erro só apareceu na tela do usuário. Fix na migration 0203. **Regra prática:** para verificar
qualquer agregado dentro de uma RPC gated, execute-a via REST/`service_role`, não só via
introspecção.

---

## 7. RPC que "já existe e aceita o parâmetro certo" pode ter a SEMÂNTICA errada

Reuso é a preferência do projeto ("adotar/estender > construir"), mas **granularidade e
assinatura compatíveis não garantem FILTRO compatível**. Antes de reusar uma RPC para um
número que vai aparecer **lado a lado com outro na mesma tela**, a pergunta certa não é "essa
RPC serve?" — é **"ela aplica o MESMO filtro que o número vizinho?"** E isso se responde com
**uma query de verificação**, não lendo a assinatura da função.

**Custou caro (v5.3.1):** `get_decomposicao_categoria` tinha exatamente o par `p_from`/`p_to`
que a tela de Decomposição precisava — e ainda assim **somava `previsto` junto do
`realizado`** (com competência RETROATIVA, porque título vencido em aberto entra pelo
vencimento) e **ignorava o de-para curado** (`dre_categoria_map`, 20 das 130 categorias
re-parenteadas, mais as excluídas). Medido: R$ 4,3 Mi de "previsto" indevido e −R$ 30 mil de
transferência interna dentro da janela em questão. Reusar sem medir teria produzido duas
somas vizinhas na mesma tela, ambas plausíveis, discordando entre si sem explicação — o pior
erro possível num demonstrativo financeiro.

**Corolário:** quando duas RPCs precisam CONCORDAR entre si, essa igualdade vira **caso de
contrato** (`rpc-contrato.test.ts`), não uma nota de rodapé — senão a próxima "otimização" em
uma delas quebra silenciosamente a outra, e isso só aparece na tela do usuário. Ver skill
`contrato-rpc-front` para o lado do teste de contrato.

---

---

## 8. Série de dado EXTERNO: o período corrente costuma vir PARCIAL

Toda série pública de indicador (CDI/SGS do BACEN, e provavelmente qualquer outra) publica o
**período corrente acumulado até hoje**, não fechado. Ingerir isso sem pensar grava um valor que
não é comparável com os anteriores.

**Custou uma migration corretiva (v5.5.0):** o SGS devolveu ago/2026 = **0,21%** — o acumulado de
sete dias corridos, quando o mês fechado vale ~1,15%. O estrago **não ficou no mês corrente**: a
regra de projeção da métrica repetia a **última taxa conhecida** sobre todos os meses futuros,
então o parcial virou a taxa de *todo o futuro* e o indicador projetado inteiro saiu **cinco vezes
menor** — plausível o bastante para ninguém desconfiar olhando a tela.

**Regras:**
- **Descartar o período ainda aberto na ingestão**, e decidir o "hoje" pelo fuso de **São Paulo**,
  não pelo do runtime: em UTC, entre 21h e a meia-noite do último dia do mês, um mês ainda ABERTO
  é lido como fechado (o erro apareceria uma vez por mês, por poucas horas — indetectável).
- **Filtrar TAMBÉM na leitura.** Só a escrita não basta: o dado ruim já gravado só sairia com
  `DELETE` (destrutivo, humano em TTY). Com o filtro na leitura ele fica inerte e se autocorrige
  quando o período fechar. É a mesma lição da v5.4.5 — **filtro de negócio mora na leitura**.
- **Guardar fração decimal, nunca percentual** (`0.0122`, não `1.22`): um `/100` espalhado pelo
  código é a próxima divergência.
- **Guard de faixa não substitui a constante certa.** A série 4392 é o MESMO CDI, anualizado; um
  teto de plausibilidade pega a troca nos níveis de taxa de hoje, mas não pegaria com CDI anual a
  4% a.a. Quem garante a série é a constante documentada.

## 9. `WITH RECURSIVE` não é inlineada — e isso decide onde ela pode ser usada

O planner do Postgres **nunca** inlineia uma CTE recursiva. Consequência prática: uma view
recursiva joinada dentro de uma RPC de listagem **não recebe pushdown de filtro** — ela é
calculada por inteiro em TODA chamada, mesmo quando o `WHERE` externo restringe a uma linha.

Injetar uma numa RPC **já viva em produção** é, portanto, decisão de latência, não de estilo — e
não há como medi-la antes do push, porque não existe staging (§1) nem Postgres local.

**O padrão que resolve isso sem staging (v5.5.0):** **sequenciar a aplicação**.
1. Aplicar primeiro só o que é **superfície 100% nova** (tabela, view, RPCs novas). Risco zero:
   nenhuma tela consome ainda.
2. **Medir contra produção** via REST/service_role, cronometrando a RPC que percorre a estrutura
   nova, e confrontar com o teto do role (§3).
3. Só então aplicar o `CREATE OR REPLACE` que liga aquilo no caminho vivo — com o número livre
   **daquele momento** e o rollback engatilhado.

O arquivo do passo 3 espera **fora de `supabase/migrations/`** (em `supabase/patches/`, sem
número): o `db push` empurra todo o conjunto pendente da pasta, então deixá-lo lá aplicaria os
dois juntos e anularia o sequenciamento — o mesmo mecanismo da regra de destrutiva em §1.

**Medido na v5.5.0:** a view recursiva sozinha custou 1836 ms frio / 418 ms quente (239
operações); a RPC da Lista foi de 2304 → **2660 ms frio** com ela dentro, contra um teto de
8000 ms. Ou seja: a soma ingênua dos dois superestimava (o planner compartilha trabalho), e a
medição evitou tanto o incidente quanto uma otimização desnecessária.

**Materializar é a saída óbvia e tem um custo escondido:** `MATERIALIZED VIEW` **não aceita**
`CREATE OR REPLACE` (v5.4.5), então toda alteração futura da definição vira `DROP`+`CREATE` —
destrutiva, com humano em TTY. Para métrica recém-nascida isso congela a evolução. Se a
materialização for mesmo necessária, manter a **definição** numa view comum e a materializada
como `SELECT * FROM` ela preserva a alterabilidade por REPLACE.

### 9.1 Árvore de fórmulas: expanda em FOLHAS SIGNADAS (v5.8.0)

Quando uma hierarquia guarda a fórmula de cada agregação como referência a outras chaves
(`dre_bloco.formula`, `dre_comp_bloco.formula`), há uma armadilha de ordem: as fórmulas podem
apontar para as **duas direções**. Um cabeçalho referencia os subgrupos que vêm **depois** dele
(`RB_H@10 = RV@20 + REEMB@30`); um totalizador referencia chaves **anteriores**
(`ROL@50 = RB_H@10 + IMP_H@40`). Não existe, portanto, um passe único por `ordem` que resolva
tudo — e "resolver em 2 ou 3 passes conforme o tipo" é frágil, porque amarra o código à forma
atual da árvore, que é DADO.

**O padrão:** uma view que expande cada chave na sua combinação **signada de FOLHAS** (blocos com
`formula IS NULL`, que somam as próprias categorias). Depois disso, o valor de qualquer bloco é
uma combinação linear das folhas, e a expansão depende só da árvore — não do período.

```sql
WITH RECURSIVE termo(raiz, chave, sinal, profundidade) AS (
  SELECT b.chave, b.chave, 1, 0 FROM <arvore> b
  UNION ALL
  SELECT t.raiz, f.ref, t.sinal * f.sinal, t.profundidade + 1
  FROM termo t
  JOIN <arvore> b ON b.chave = t.chave AND b.formula IS NOT NULL
  CROSS JOIN LATERAL (
    SELECT CASE WHEN e.v LIKE '-%' THEN substr(e.v,2) ELSE e.v END,
           CASE WHEN e.v LIKE '-%' THEN -1 ELSE 1 END
    FROM jsonb_array_elements_text(b.formula) AS e(v)
  ) f(ref, sinal)
  WHERE t.profundidade < 24            -- rede contra laço, NÃO validação
)
SELECT t.raiz, t.chave AS folha, sum(t.sinal)::int AS coeficiente
FROM termo t JOIN <arvore> b ON b.chave = t.chave AND b.formula IS NULL
GROUP BY 1, 2
HAVING sum(t.sinal) <> 0;
```

Dois ganhos que valem o padrão:

- **Subtração vira aritmética, não caso especial.** Um termo negativo de algo que já está somado
  dentro do positivo (`REXG = REX − REEMB`, com REEMB dentro do REX) se encontra no mesmo grupo:
  o coeficiente soma `+1 − 1 = 0` e o `HAVING` o descarta.
- **O oráculo fica estrutural.** Se a soma total (`REX`) expande para coeficiente **+1 em cada
  folha** e o conjunto de folhas é exatamente o conjunto de destinos do de-para, então
  `total ≡ Σ(base)` **por construção** — e isso se prova lendo o CSV do seed, antes de escrever
  SQL, em vez de por conferência numérica que quebra a cada re-upload.

⚠️ **O teto de profundidade é rede contra laço infinito, não validação de corretude.** Um ciclo
passa pelo `CREATE VIEW` sem erro e produz coeficientes **PARCIAIS em silêncio**. A aciclicidade
se valida onde a árvore é ESCRITA — no gerador do seed (DFS com marcação) e, quando existir
editor, na gravação. Ver também: a performance de CTE recursiva é o §9 acima; aqui o volume é a
árvore (dezenas de linhas), não o dado.

## 10. HTTP a partir do banco: `pg_net` é ASSÍNCRONO

O projeto tem `pg_cron` e `pg_net` habilitados, e **nenhuma extensão HTTP síncrona**. `pg_net`
**enfileira** a requisição e a resposta cai em `net._http_response` depois — uma função plpgsql
**não consegue** buscar e parsear no mesmo corpo.

Então "o banco busca o dado externo e grava, sem passar pelo app" **não é executável aqui**, por
mais que soe mais limpo. O padrão que roda em produção desde a `0182` é
**`pg_cron` → `net.http_post` → rota interna do Next**, com a rota autenticando por
`CRON_SECRET` e precisando estar isenta no `src/proxy.ts` (senão o request do cron morre em 401
antes do handler — ADR-0153).

E o agendamento **só entra depois do deploy da rota**: `cron.schedule` apontando para rota
inexistente responde 200, e o job aparece **VERDE** em `cron.job_run_details` sem ter feito nada
(v5.4.4).

---

## Ver também

- **`contrato-rpc-front`** — o lado do app que consome a RPC: helper de tipagem frouxa para
  RPC ainda não coberta por `database.ts`, `parseRpc`/schema Zod e por que RPC do Supabase é
  *thenable* (não Promise — `.catch()` nela estoura em runtime).
- **`ingestao-planilhas`** — o erro de `dim_data` (seção 2 acima) aparece primeiro como falha
  de upload; o parser único de Vendas e o pipeline atômico (`limpar_staging_vendas` →
  `inserir_lote_staging` → `validar_carga_staging` → `promover_carga_vendas`) do lado do
  app.
- **`ui-design-system`** — exibição de `timestamptz` sempre via `fmtDataSP`/`Intl` (nunca
  split de string); o fuso do banco (seção 3 acima) só muda o offset do ISO, não como ele deve
  ser mostrado.
