# Levantamento as-built — Usuários, acessos e solicitação de acesso

**Data:** 2026-09-15
**Commit de referência:** `62bd8b9` (`Merge pull request #273 … v5.11.0 estante-welcome`, 2026-09-15 12:55 -03)
**Natureza:** levantamento **somente-leitura**. Nenhuma migration, nenhuma escrita, nenhuma RPC de
escrita, nenhum `db push`. Único arquivo criado é este.

**Fonte de verdade.** Para o banco, o **catálogo vivo de produção** (`pg_proc`, `pg_policy`,
`pg_class`, `information_schema`, `pg_roles`) e o corpo das funções por `pg_get_functiondef` —
nunca a migration de origem. Conexão direta com `SET SESSION CHARACTERISTICS AS TRANSACTION READ
ONLY` (`default_transaction_read_only=on` confirmado na sessão; Postgres 17.6). Para o app, os
arquivos em `src/`. ADRs, skills e comentários foram tratados como hipótese; onde divergiram do
catálogo, a divergência está na §9.

**O que este documento mede.** As barreiras que **existem**, incluindo o que cada uma **não**
cobre. Não há proposta de melhoria em nenhuma seção — medição fica, opinião sai.

## O que NÃO foi coberto, e por quê

| Não coberto | Por quê |
|---|---|
| Configuração de produção do GoTrue (`jwt_expiry` real, rotação de refresh token, política de senha do servidor, `enable_signup`, rate-limit de login) | Não é visível por SQL nem está no repositório. `supabase/config.toml` é **intenção versionada de dev local** — o próprio arquivo declara isso (`config.toml:~/enable_signup`, comentário "aplicar na ativação (Dashboard ou `supabase config push`)"). Só o painel do Supabase responde. |
| Se a troca de senha revoga as outras sessões do mesmo usuário | Comportamento interno do GoTrue; provar exigiria autenticar como um usuário real e trocar a senha dele — escrita e efeito em produção. |
| Regras de rede/WAF/Vercel Firewall à frente do app | Fora do repositório e fora do banco. |
| Conteúdo de `auth.audit_log_entries` | Não inspecionado: é log do GoTrue (eventos de autenticação), não do RBAC da aplicação; a pergunta da §4 é sobre concessão/revogação/negação de **área**, que não passa por lá. |
| Exercício das telas num browser | Levantamento estático + catálogo. A §7 descreve estrutura e fluxo de dados, não o render. |
| Revisão dos 88 corpos de função sem gate, um a um | Foi feita a varredura mecânica (quem é executável por `anon`/`authenticated`) e lidos os 3 que importam. Os demais só têm `EXECUTE` para `service_role`. |

---

## 1. Modelo de autorização

### 1.1 As entidades

Cinco tabelas vivas, todas em `app`. Medidas em produção.

**`app.rbac_areas` — o catálogo de áreas (22 linhas)**

| coluna | tipo | nulo | default |
|---|---|---|---|
| `area` | `text` | NO | — (**PK**) |
| `rotulo` | `text` | NO | — |
| `grupo` | `text` | NO | — |
| `ordem` | `integer` | NO | — |

Restrições: só `rbac_areas_pkey PRIMARY KEY (area)`. **Não há `CHECK` nenhum** — `area` é texto
livre; o conjunto válido é o conteúdo da tabela, não uma regra. `rotulo`/`grupo`/`ordem` são
apresentação (agrupar e ordenar o editor de roles), não autorização.

**`app.rbac_roles` — os papéis (6 linhas)**

`id bigint` PK (identidade), `nome text` NOT NULL **UNIQUE**, `descricao text` nulo,
`criado_em`/`atualizado_em timestamptz` NOT NULL `now()`.

**`app.rbac_role_permissoes` — papel × área (a matriz)**

`role_id bigint` + `area text`, **PK composta (role_id, area)**.
FKs: `role_id → app.rbac_roles(id) ON DELETE CASCADE`;
`area → app.rbac_areas(area) ON UPDATE CASCADE` (sem `ON DELETE` → apagar uma área concedida é
**bloqueado** pela FK; renomear a chave propaga).

**`app.rbac_usuarios` — a identidade da aplicação (37 linhas)**

| coluna | tipo | nulo | default |
|---|---|---|---|
| `user_id` | `uuid` | NO | — (**PK**, FK → `auth.users(id)` **ON DELETE CASCADE**) |
| `email` | `text` | NO | — (**UNIQUE**) |
| `nome` | `text` | YES | — |
| `role_id` | `bigint` | YES | — (FK → `app.rbac_roles(id)`, **sem** `ON DELETE`) |
| `ativo` | `boolean` | NO | `true` |
| `convidado_por` | `uuid` | YES | — |
| `criado_em` | `timestamptz` | NO | `now()` |
| `atualizado_em` | `timestamptz` | NO | `now()` |
| `precisa_trocar_senha` | `boolean` | NO | `false` |
| `onboarding_visto_em` | `timestamptz` | YES | — |

**`app.rbac_solicitacoes` — a fila de pedidos de acesso**

`id bigint` PK, `email text` NOT NULL, `nome text`, `status text` NOT NULL default `'pendente'`
com `CHECK (status IN ('pendente','aprovada','rejeitada'))`, `criado_em`, `decidido_em`,
`decidido_por uuid`, `observacao text`. **Não há UNIQUE em `email`** — a unicidade de pendência é
imposta pelo corpo das RPCs (§6.3), não pelo schema.

**Estado medido (agregado; nenhum dado pessoal reproduzido):** 37 usuários, 36 ativos, 1 inativo,
1 sem `role_id` (é o **mesmo** registro: inativo **e** sem role), 2 com `precisa_trocar_senha`.
37 linhas em `auth.users`, **zero** órfãos em qualquer direção. Todos com provider `email`, todos
com `email_confirmed_at`, 3 nunca logaram, 0 banidos. `app.rbac_solicitacoes`: 32 aprovadas, 1
rejeitada, **0 pendentes**.

Os 6 papéis e o que cada um concede de fato (do catálogo, não da descrição):

| papel (`id`) | nº áreas | tem `admin/acessos`? |
|---|---|---|
| `Financeiro` (1) | 22 (**todas**) | **SIM** |
| `Administrador` (5) | 22 (**todas**) | SIM |
| `Diretoria` (22) | 18 | **NÃO** |
| `Recursos Humanos` (23) | 6 | NÃO |
| `Geral` (24) | 3 | NÃO |
| `Gestor` (25) | 12 | NÃO |

Distribuição: `Geral` 23 usuários, `Gestor` 5, `Financeiro` 4, `Diretoria` 2, `Administrador` 1,
`Recursos Humanos` 1, sem role 1. **Duas roles são administradoras plenas** (`Financeiro` e
`Administrador`, conjuntos idênticos de 22 áreas) e cinco pessoas as detêm. Ver §9.

### 1.2 Tabelas de legado, vazias

`app.usuarios` (0 linhas) e `app.convites` (0 linhas) são o modelo **anterior** ao RBAC: `role text`
com `CHECK (role IN ('financeiro','gestor'))`, `setor_id → analytics.dim_setor_macro`,
`CHECK (chk_setor_role)` amarrando role a setor, e `convites` com `expira_em` default
`now() + 7 days`. O único consumidor de `app.usuarios` no catálogo é `app.current_user_role()`
— que **não tem nenhum chamador** (varredura de corpos em `public` e `app`). Como a tabela está
vazia, essa função retorna sempre `NULL`. São três objetos mortos: a tabela, a de convites e a
função.

### 1.3 O que é dado e o que é código

O catálogo de áreas existe nos **dois**: `app.rbac_areas` (22 linhas) e a tupla
`AREAS` em `src/lib/auth/areas.ts:5-28` (22 entradas), com o espelho de apresentação
`AREA_INFO` em `areas.ts:36-88`.

**Como a paridade é garantida:** por **um** caso de contrato,
`src/lib/rpc-contrato.test.ts:763-768`, que compara

```
areas.map(a => a.area).sort()  ===  [...AREAS].sort()
```

isto é — **só o conjunto de CHAVES**. `rotulo`, `grupo` e `ordem` **não** são comparados por teste
nenhum.

**O que acontece quando diverge:** a divergência de chave reprova o contrato (mas o bloco é
`describe.skipIf(!ON || !ANON)`, `rpc-contrato.test.ts:49` — sem credenciais ele **pula**; a sonda
`src/lib/sonda-skipif-silencioso.test.ts` existe para o pulo não passar por verde). A divergência
de **rótulo** não reprova nada e é **deliberada**: `src/app/admin/acessos/page.tsx:69-86` documenta
a decisão de que **o código manda na EXIBIÇÃO e o banco manda na AUTORIZAÇÃO** —

- `areasRpc.length > 0` → o app mescla `{...a, ...local}`, ou seja o `AREA_INFO` local
  **sobrescreve** rótulo/grupo/ordem do banco (`page.tsx:82-86`);
- área que exista no banco e **não** no código mantém o texto do banco (drift no sentido oposto
  fica visível em vez de sumir da tela);
- se a RPC de áreas falhar, cai inteiro no catálogo local (`page.tsx:86`).

O motivo registrado no próprio comentário: alinhar o rótulo no banco exigiria um `UPDATE` (ato
destrutivo, só humano em TTY), então o rótulo virou cosmético e local. O custo histórico está
citado ali: `financeiro/dre` virou "Demonstrativo de Resultado" no código na v5.3.0 e o editor de
roles seguia dizendo "DRE". **Hoje o banco ainda diz `rotulo = 'DRE'`** para essa área — medido.

### 1.4 Granularidade real

- **Área é PLANA.** `area` é uma chave `text` comparada por **igualdade exata**:
  `rp.area = ANY (p_areas)` em `app.exigir_acesso` (corpo na §2.1) e `rp.area = p_area` em
  `app.tem_area`. **A barra não significa nada para o mecanismo.** `financeiro/acervo/gestao` não
  implica `financeiro/acervo`, e `admin/acessos` não implica `admin/uploads`.
- **A hierarquia é CONVENÇÃO escrita à mão, duas vezes:** (a) no roteamento, como listas OR em
  `areasDaRota()` (`areas.ts:108-157`) — ex.: `/financeiro/acervo` devolve
  `['financeiro/acervo','financeiro/acervo/gestao']`; (b) em cada RPC, no array passado a
  `exigir_acesso`. Nada verifica que as duas escritas concordam. O comentário de `areas.ts:128-132`
  registra o modo de falha real: a regra genérica `/gestao-pessoas` mandava a seção inteira para o
  Inventário, e a Estante nasceria gated pela área errada — corrigido pondo as específicas antes.
- **Ler × escrever dentro da mesma área: não existe distinção genérica.** É modelado como uma
  **segunda área** com sufixo, em quatro módulos: `financeiro/acervo` + `/gestao`,
  `gestao-pessoas/estante` + `/gestao`, `solicitacoes/basico` + `solicitacoes` (o nome sem sufixo
  é o forte, por acidente histórico — `areas.ts:65-69`), e `metas/acompanhamento` + `metas`
  (idem: a chave curta é a de gestão, `areas.ts:54-59`). `gestao-pessoas/inventario` é permissão
  **única** de página, sem dois níveis (`areas.ts:76-79`).
- **Escopo por unidade de negócio: não existe como dimensão.** Não há coluna de setor/BU em
  `rbac_usuarios` nem em `rbac_role_permissoes`. A BU está **dentro do nome da área**
  (`performance/weddings`, `/trips`, `/corporativo`) e é traduzida por
  `app.areas_do_setor(p_setor)` / `areasDoSetor()` (§8.2).

### 1.5 Papel × permissão direta

**Permissões chegam ao usuário SÓ pelo papel.** Não há tabela usuário→área. `rbac_usuarios` tem um
único `role_id`, nulo. A resolução é sempre o mesmo `INNER JOIN`:

```sql
-- app.permissoes_de(p_user uuid) → text[]
SELECT coalesce(array_agg(rp.area ORDER BY rp.area), '{}')
FROM app.rbac_usuarios u
JOIN app.rbac_role_permissoes rp ON rp.role_id = u.role_id
WHERE u.user_id = p_user AND u.ativo
```

Consequências medidas: **um usuário por vez tem exatamente um papel**; `role_id IS NULL` derruba a
linha no `JOIN` e devolve `'{}'` (nenhuma permissão) — é o caso do único usuário sem role; e
`ativo = false` também devolve `'{}'`.

---

## 2. A função central de autorização

### 2.1 `app.exigir_acesso(p_areas text[] DEFAULT NULL)` — corpo vivo

`RETURNS void`, `LANGUAGE plpgsql`, **`STABLE SECURITY DEFINER`**, `SET search_path TO ''`,
owner `postgres`.

A ordem de verificação, do corpo vivo:

1. `v_claims := nullif(current_setting('request.jwt.claims', true), '')`.
2. **`v_claims IS NULL`** (nenhum contexto PostgREST): libera **se e somente se**
   `session_user` for `rolsuper`; senão `RAISE EXCEPTION 'AUTH_NECESSARIA: contexto sem identidade'`.
3. `v_role := claims->>'role'`; se `= 'service_role'` → **`RETURN`** (libera, sem nenhuma outra
   checagem, inclusive de área).
4. `v_uid := nullif(claims->>'sub','')::uuid`; se **`NULL`** →
   `RAISE 'AUTH_NECESSARIA: acesso anônimo desativado'`. O comentário no corpo registra que a
   janela de compatibilidade da v4.13 está encerrada e que a função **não consulta mais**
   `auth_enforcement_ativo()`.
5. Se **não** existe `app.rbac_usuarios` com `user_id = v_uid AND ativo` →
   `RAISE 'USUARIO_INATIVO: sem cadastro ativo no Janus'`.
6. **`p_areas IS NULL` → `RETURN`** (só exige login + cadastro ativo). É o **default do parâmetro**:
   `app.exigir_acesso()` sem argumento significa "qualquer autenticado ativo".
7. Senão, se não existe `rbac_usuarios ⋈ rbac_role_permissoes` com `rp.area = ANY (p_areas)` →
   `RAISE 'PERMISSAO_NEGADA: requer uma de [%]'`.

Todas as recusas usam `USING ERRCODE = '42501'` (`insufficient_privilege`), que o PostgREST
converte em HTTP 4xx (o caso de contrato afirma `>= 400`, `rpc-contrato.test.ts:778-786`).

### 2.2 Negar × devolver vazio × lançar — comportamento REAL, por caminho

A função **não devolve valor**: `RETURNS void`. Ela **interrompe a execução** com `RAISE
EXCEPTION` em toda recusa. O efeito para quem chama é que **o statement inteiro aborta** — a RPC
que a chamou (sempre via `PERFORM`) nunca retorna payload; o cliente recebe erro, não uma lista
vazia. Não existe caminho "devolve vazio" dentro dela, e não há como um chamador ramificar sobre o
resultado.

Matriz medida empiricamente contra produção (chamadas à própria função, que é `STABLE` e não
escreve; `request.jwt.claims` simulado por `set_config`, conexão `READ ONLY`):

| caminho | resultado | erro |
|---|---|---|
| sem claims, `session_user = postgres` (`rolsuper = false`), `p_areas = NULL` | **NEGADO** | `42501 AUTH_NECESSARIA: contexto sem identidade` |
| claims `role=service_role`, `p_areas = ['admin/acessos']` | **PASSOU** | — |
| claims `role=anon`, sem `sub` | NEGADO | `42501 AUTH_NECESSARIA: acesso anônimo desativado` |
| claims `role=authenticated`, sem `sub` | NEGADO | idem |
| claims `{}` (JSON vazio) | NEGADO | idem |
| claims com `sub` = uuid inexistente | NEGADO | `42501 USUARIO_INATIVO` |
| claims com `sub` = usuário **inativo** | NEGADO | `42501 USUARIO_INATIVO` |
| claims com `sub` = usuário ativo, `p_areas = NULL` | **PASSOU** | — |
| claims com `sub` = ativo, área **concedida** | **PASSOU** | — |
| claims com `sub` = ativo, `p_areas = '{}'` (**array vazio**) | NEGADO | `42501 PERMISSAO_NEGADA: requer uma de []` |
| claims com `sub` = ativo, área inexistente no catálogo | NEGADO | `42501 PERMISSAO_NEGADA: requer uma de [nao/existe]` |

Dois pontos que só a medição mostra:

- **Array vazio nega** (não libera). `'{}'` não é `NULL`, então cai no passo 7, e
  `= ANY('{}')` é sempre falso. Fail-closed.
- **Área inexistente nega.** Um erro de digitação no array de uma RPC nova fecha a RPC para todo
  mundo, em vez de abri-la. Fail-closed — mas também significa que **`exigir_acesso` não valida
  que a área existe** em `rbac_areas`: chave inválida é indistinguível de chave não concedida.

### 2.3 Tratamento de credencial privilegiada — os dois caminhos que pulam a verificação

**(a) `role = 'service_role'` no JWT.** Pula tudo, inclusive a checagem de área
(medido: passou pedindo `admin/acessos`). Quem usa: `src/lib/supabase/admin.ts` —
`getAdminClient()`, marcado `import 'server-only'` (linha 1) para falhar o build se entrar em
bundle de cliente, singleton lazy sobre `SUPABASE_SERVICE_ROLE_KEY`. Os usos no app são
deliberadamente estreitos: operações do **Auth** (`createUser`, `updateUserById`, `deleteUser`,
`signOut`) e do **Storage** em `src/app/admin/acessos/actions.ts`,
`src/app/solicitacoes/actions.ts`, `src/app/financeiro/acervo/actions.ts`; e a RPC
`solicitar_acesso_admin` na tela pública (§6). As RPCs `admin_*` de RBAC são chamadas com o
**cliente de sessão**, não com o admin — o banco revalida o chamador (`page.tsx:24-29`,
`actions.ts:116,127,160,194,225,244,257,279,303,321`).

**(b) `session_user` com `rolsuper` e claims nulo.** O comentário no corpo da função diz que isso
libera "migrations/seed/`db query`", que "conectam como `postgres`". **Medido: `postgres` tem
`rolsuper = false`** (tem `rolbypassrls = true`, que é outra coisa). O único papel `rolsuper` da
instância é `supabase_admin`. Portanto essa saída **não se aplica à conexão que o projeto usa** —
e a prova está na primeira linha da matriz acima: conectado como `postgres` sem claims, a função
**nega**. Ver §9.

Papéis relevantes, medidos em `pg_roles`:

| papel | `rolsuper` | `rolbypassrls` | `rolcanlogin` | `statement_timeout` |
|---|---|---|---|---|
| `anon` | false | false | false | `3s` |
| `authenticated` | false | false | false | `8s` |
| `authenticator` | false | false | **true** | `8s` |
| `service_role` | false | **true** | false | `0` (sem limite) |
| `postgres` | **false** | **true** | true | — |
| `supabase_admin` | **true** | true | true | — |

### 2.4 Quantos consumidores tem, e quem deveria chamá-la e não chama

Em `public` há **263 funções**. **175 contêm `exigir_acesso`; 88 não.**

A varredura que importa não é essa, e sim o cruzamento com o privilégio de execução. Das 88 sem
gate, **as que `anon` ou `authenticated` conseguem executar são três**:

| função | `anon` | `authenticated` | o que faz sem gate |
|---|---|---|---|
| `solicitar_acesso(p_email, p_nome)` | **SIM** | sim | insere na fila de pedidos (§6) |
| `get_minhas_permissoes()` | não | **sim** | bootstrap da sessão (§2.5) |
| `marcar_senha_trocada()` | não | **sim** | zera `precisa_trocar_senha` do próprio usuário |

As outras 85 têm `EXECUTE` **apenas para `service_role`** — inclusive toda a família `*__nucleo`
(o núcleo interno; o wrapper externo é que carrega o gate) e todos os `inserir_lote_*`,
`monde_ingest_*`, `cdi_ingest_upsert`, `api_chave_resolver`, `*_solicitacao_externa`. Fora de
`public`, a única função executável por `authenticated` é `app.pode_assinar_area` (usada pela
policy de Realtime, §3.2).

**`public.solicitar_acesso` é a ÚNICA função de `public` executável por `anon`** — medido
diretamente. É toda a superfície pré-autenticação do banco.

**A função que deveria chamar e não chama:** `marcar_senha_trocada()`. Corpo vivo:

```sql
IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_NECESSARIA' USING ERRCODE='42501'; END IF;
UPDATE app.rbac_usuarios SET precisa_trocar_senha = false, atualizado_em = now()
 WHERE user_id = auth.uid();
```

Exige apenas **identidade**, não `exigir_acesso()` — portanto **não verifica `ativo`** e não prova
que a senha mudou (ver §4.2 e a lista final de barreiras). A irmã dela,
`marcar_onboarding_visto()`, faz `PERFORM app.exigir_acesso();` antes do `UPDATE`, e
`onboarding_visto()` também — com o comentário "qualquer autenticado ATIVO; barra inativo/anon".
As três escrevem/leem a mesma tabela; duas usam o gate, uma não.

### 2.5 `get_minhas_permissoes()` — o bootstrap, e por que não tem gate

`STABLE SECURITY DEFINER`, `EXECUTE` para `authenticated` e `service_role` (não `anon` — medido:
`anon` recebe `401 / 42501 permission denied for function get_minhas_permissoes`). Não chama
`exigir_acesso` **porque precisa responder para quem ainda não tem acesso**: é ela que informa ao
app que o usuário está inativo ou não registrado. Fail-closed por **forma do retorno**, não por
exceção:

- `auth.uid() IS NULL` → `{registrado:false, ativo:false, permissoes:[], precisa_trocar_senha:false}`;
- `NOT FOUND` em `rbac_usuarios` → o mesmo envelope;
- encontrado → devolve `email`, `nome`, `role_id`, `role`, `ativo`, `precisa_trocar_senha` e
  `permissoes` = `CASE WHEN v_row.ativo THEN to_jsonb(app.permissoes_de(v_uid)) ELSE '[]' END`.

Isto é: **um usuário inativo recebe seu próprio cadastro de volta, com `permissoes: []`** — por
desenho, para a tela poder dizer "sua conta está inativa". O caso de contrato
`rpc-contrato.test.ts:770-775` fixa esse shape.

### 2.6 Os helpers ao redor

| função | `SECURITY` | o que faz | identidade |
|---|---|---|---|
| `app.uid_jwt()` | DEFINER | `claims->>'sub'` como uuid | JWT |
| `app.permissoes_de(uuid)` | DEFINER | `text[]` das áreas do usuário ativo | parâmetro |
| `app.tem_area(text)` | DEFINER | `boolean` | `app.uid_jwt()` |
| `app.pode_assinar_area(text)` | DEFINER | `boolean` (usada pela policy de Realtime) | **`auth.uid()`** |
| `app.minha_role_id()` | DEFINER | `bigint` | `app.uid_jwt()` |
| `app.areas_do_setor(text)` | **INVOKER**, IMMUTABLE | setor → áreas (§8.2) | nenhuma |
| `app.auth_enforcement_ativo()` | DEFINER | lê `app.config('auth_enforcement')` **OR** `current_setting('app.simular_enforcement')` | nenhuma |
| `app.current_user_role()` | DEFINER | lê `app.usuarios` (**vazia**) → sempre `NULL`; **zero chamadores** | `auth.uid()` |

Duas famílias de identidade coexistem (`app.uid_jwt()` e `auth.uid()`), com o mesmo efeito
prático. `app.pode_assinar_area` é redundante por dentro (filtra `ativo` e depois chama
`permissoes_de`, que já filtra `ativo`).

**O interruptor de enforcement está morto.** `app.config` contém `auth_enforcement = true`
(medido). Mas `exigir_acesso` **não o lê mais** (só o menciona em comentário), e a varredura de
corpos mostra que o **único** objeto que referencia `auth_enforcement_ativo()` é ela mesma. Do lado
do app, `admin_set_enforcement` aparece apenas em `src/types/database.ts:103` (tipo gerado) e em
`src/lib/rpc-contrato.test.ts:2057,2071` — **nenhuma UI, nenhum chamador**. Ou seja: existe uma RPC
gated por `admin/acessos` que grava uma chave de config que ninguém lê. O consumidor vivo de
`app.simular_enforcement` é `public.rbac_verificar_guard(p_area)`, uma sonda
(`set_config('app.simular_enforcement','on',true)` + `exigir_acesso` + `RETURN
'ACESSO_PERMITIDO'`), executável por `authenticated`, usada pelo caso de contrato.

---

## 3. Matriz de camadas — onde a autorização é decidida

### 3.1 Uma linha por camada

| # | camada | o que decide | como obtém a identidade | o que faz ao negar | fail-closed? |
|---|---|---|---|---|---|
| 1 | **Proxy de borda** — `src/proxy.ts` (função `proxy`, `config.matcher` em `proxy.ts:112-114`) | **Só SESSÃO**, nunca área (declarado em `proxy.ts:6-7`: "Permissão de ÁREA não é checada aqui (custo por navegação)") | `createServerClient` sobre os cookies do request + **`supabase.auth.getUser()`**, que valida o JWT no servidor de auth (`proxy.ts:71-72`: "nunca confiar só no cookie") | página → `307` para `/login?next=<path+query>`; caminho sob `/api/` → `401 {"error":"AUTH_NECESSARIA"}` (`proxy.ts:75-85`) | **SIM** para sessão. O matcher é **lista negativa**: um caminho novo está **dentro** por default. Isenções: `_next/`, 6 ícones por nome exato, `logos/`, `fonts/`. **NÃO** cobre área. |
| 2a | **Guard de página** — `requireArea` (`src/lib/auth/sessao.ts:70-79`) | login + `ativo` + (se informado) **alguma** das áreas | `getSessao()` → `auth.getUser()` + RPC `get_minhas_permissoes`, memoizado por request com `React.cache` (`sessao.ts:32`) | `redirect('/login')` se não logado; `redirect('/trocar-senha')` se `precisaTrocarSenha`; `redirect('/sem-acesso')` se sem área ou inativo | SIM **quando chamado**. Não é automático: página sem a chamada não tem camada 2. |
| 2b | **Guard de route handler** — `requireAreaApi` (`sessao.ts:85-98`) | idem | idem | devolve `Response`: `401 AUTH_NECESSARIA`, `403 TROCA_SENHA_OBRIGATORIA`, `403 PERMISSAO_NEGADA` | SIM quando chamado, **e só se o chamador testar o retorno** (`sessao.ts:83`: `if (s instanceof Response) return s`) — o valor é `Sessao | Response`, e ignorá-lo compila. |
| 2c | **Guard de Server Action** — `requireAreaAction` (`sessao.ts:101-108`) | idem | idem | **`throw new Error('AUTH_NECESSARIA' \| 'TROCA_SENHA_OBRIGATORIA' \| 'PERMISSAO_NEGADA')`** | SIM quando chamado (lançar aborta a action). |
| 3 | **Banco — a função do RPC** | `app.exigir_acesso(ARRAY[…])` inline em **175** das 263 funções de `public` (§2.4) | `request.jwt.claims` injetado pelo PostgREST a partir do JWT | `RAISE EXCEPTION … ERRCODE 42501` → HTTP 4xx; **o statement aborta** | **SIM, e é a camada real** (§3.4). |
| 4 | **Política de linha (RLS)** | Praticamente nada (§3.2) | — | — | **Não aplicável** — mas o efeito líquido é fechado, por ausência de `GRANT`. |

Nota sobre a camada 1: **não existe `middleware.ts` no repositório.** O Next 16
(`package.json`, Next 16.3.4) lê a convenção como `proxy.ts`; `src/proxy.ts` exporta `proxy(request)`
e `config`. Comentários em `src/lib/supabase/server.ts:9,37` ainda dizem "middleware" — terminologia
antiga, mesmo mecanismo.

Ainda na camada 1, três isenções deliberadas, todas com a autenticação movida **para dentro do
handler**:

- `PUBLIC_PATHS = {'/login', '/solicitar-acesso'}` e `PUBLIC_PREFIXES = ['/auth/']`
  (`proxy.ts:11-14`). `/trocar-senha` **não** é público — exige sessão, por comentário explícito.
- `API_AUTH_PROPRIA = {'/api/monde/ingest', '/api/cdi/ingest'}` (`proxy.ts:30`), **exportado de
  propósito** para o guard mecânico de `src/proxy.test.ts`, porque esquecer uma entrada aqui
  "não quebra nada em teste e faz o agendamento mensal falhar calado em produção"
  (`proxy.ts:23-29`). Os handlers autenticam por `Authorization: Bearer $CRON_SECRET` **ou**
  caem em `requireAreaApi(['admin/uploads'])`.
- `API_AUTH_PROPRIA_PREFIXOS = ['/api/externo/']` (`proxy.ts:38`) — por **prefixo** e não por path
  exato porque a família tem segmento dinâmico. Autentica por `x-api-key` via
  `autenticarChamada()` (`src/lib/api-externa/http.ts`), resolvida no banco por
  `api_chave_resolver` (`service_role`-only). O integrador nunca loga.

O matcher também é endurecido contra uma classe de fuga já explorada: a exclusão é por **prefixo de
diretório ou nome exato**, **nunca por extensão**, porque "qualquer path terminado em `.png`" fazia
uma rota dinâmica `/api/.../[id]` com id terminado em `.png` escapar da camada 1
(`proxy.ts:98-111`, achado de auto-auditoria).

### 3.2 Cobertura de política de linha

Medido em produção:

- **O banco inteiro tem 4 policies** (`SELECT count(*) FROM pg_policy` = 4).
- Nos schemas da aplicação (`app`, `public`, `analytics`, `raw`, `monde`, `estante`, `patrimonio`,
  `financeiro`), **66 tabelas têm `relrowsecurity = true` e 65 delas têm ZERO policies.**
  `relforcerowsecurity` é `false` em todas.

As 4 policies:

| schema.tabela | nome | papéis | cmd | `USING` |
|---|---|---|---|---|
| `app.rbac_usuarios` | `rbac_usuarios_proprio_registro` | `{authenticated}` | SELECT | `user_id = auth.uid()` |
| `realtime.messages` | `gerencial_broadcast_leitura` | `{authenticated}` | SELECT | `extension='broadcast' AND realtime.topic()='gerencial_lancamentos' AND app.pode_assinar_area('financeiro/gerencial')` |
| `cron.job` | `cron_job_policy` | `{public}` | ALL | `username = CURRENT_USER` (da extensão) |
| `cron.job_run_details` | `cron_job_run_details_policy` | `{public}` | ALL | idem |

**O que protege as 65 sem policy: a ausência de `GRANT`, não a RLS.** RLS ligada com zero policies
já nega tudo para quem não a contorna; e além disso, fora de `storage`/`realtime`/`cron`, **o único
`GRANT` de tabela a `anon` ou `authenticated` em todo o banco é `SELECT` em `app.rbac_usuarios`
para `authenticated`** — medido. Todo o resto dos dados é alcançado exclusivamente por RPC
`SECURITY DEFINER` (que roda como `postgres`, dono das tabelas, e por isso passa pela RLS).

**E essa única policy, mais esse único grant, são inalcançáveis por REST.** Medido contra a API de
produção com a chave `anon`:

```
GET /rest/v1/rbac_usuarios                        → 404 PGRST205 (não existe em public)
GET /rest/v1/rbac_usuarios  (Accept-Profile: app) → 406 PGRST106
   "Only the following schemas are exposed: public, graphql_public"
```

`authenticated` tem `USAGE` em `app`, mas o PostgREST não expõe o schema. A policy
`rbac_usuarios_proprio_registro` e o `GRANT SELECT` só passariam a valer se alguém expusesse `app`.

### 3.3 Concessões aos papéis do banco, por tipo de objeto

| objeto | `anon` | `authenticated` | `service_role` |
|---|---|---|---|
| `USAGE` em `public` | SIM | SIM | SIM |
| `USAGE` em `app` | não | **SIM** (inerte: schema não exposto) | SIM |
| `USAGE` em `analytics`, `raw`, `monde`, `financeiro` | não | não | SIM |
| `USAGE` em `estante`, `patrimonio` | não | não | **não** |
| `USAGE` em `extensions`, `storage` | SIM | SIM | SIM |
| Tabelas (fora de storage/realtime/cron) | nenhuma | **só `SELECT` em `app.rbac_usuarios`** | via `rolbypassrls` |
| Funções de `public` (263) | **1** (`solicitar_acesso`) | **177** (174 gated + 3 sem gate) | praticamente todas |
| Funções de outros schemas | nenhuma | 1 (`app.pode_assinar_area`) | — |
| Buckets de Storage | RLS on, 0 policies | RLS on, 0 policies | acesso via API de Storage |

A conta não fecha em 175 por um caso: das 175 funções com gate, **uma** não é executável por
`authenticated` — `api_retrofit_contratos()`, que carrega `exigir_acesso` **e** só tem `EXECUTE`
para `service_role` (dupla proteção). Daí 174 + 3 = 177.

Os dois buckets (`acervo-documentos` 25 MiB, `solicitacoes-anexos` 10 MiB) são **privados**
(`public = false`) e **`storage.objects` tem RLS ligada com zero policies** — apesar de `anon` e
`authenticated` terem `GRANT` amplo de DML na tabela, o que a RLS sem policy anula. O acesso real é
100% por `service_role` dentro de Server Actions atrás de `requireAreaAction`, entregando **URL
assinada de 60 segundos** (`src/app/financeiro/acervo/actions.ts:126-127`,
`src/app/solicitacoes/actions.ts:195`).

### 3.4 Qual é a barreira real

**A camada 3 — `app.exigir_acesso` dentro de cada RPC.** Justificativa medida, não inferida:

- a camada 1 não olha área;
- a camada 2 existe só onde foi escrita à mão, e não é verificada por máquina;
- a camada 4 é vazia em 65 de 66 tabelas, e a única policy é inalcançável por REST;
- **e nenhum dado é alcançável por tabela**: sem `GRANT`, o único caminho para os dados é a RPC —
  e 175 das 263 RPCs carregam o gate, sendo que das 88 restantes **85 não têm `EXECUTE` para
  `anon`/`authenticated`**.

### 3.5 Uma rota nova que ninguém protegeu explicitamente nasce aberta ou fechada?

**Nasce FECHADA para sessão e ABERTA para área.** Isto é: qualquer usuário **logado e ativo** a
alcança; um anônimo não.

- Fechada para sessão porque o `matcher` é lista negativa (`proxy.ts:112-114`): o caminho novo
  entra por default e o proxy exige sessão.
- Aberta para área porque não há nada que force a camada 2. Não existe verificação mecânica de
  que uma `page.tsx` nova chame `requireArea`, nem `areasDaRota()` é consultada pelo proxy —
  `areasDaRota` é uma tabela de consulta que **as próprias páginas** usam; o default dela é
  `return null` (`areas.ts:156`), e `null` em `temAlguma()` significa **"qualquer logado ativo
  passa"** (`sessao.ts:62`).
- Confirmado na prática: `src/app/financeiro/layout.tsx` e `src/app/performance/layout.tsx` não
  têm guard nenhum (só provider/título); quem protege é cada `page.tsx` filha.
  `src/app/admin/layout.tsx:10` chama `requireArea(null)` — baseline de "qualquer logado ativo"
  para toda `/admin/*`; foi por isso que `src/app/admin/uploads/layout.tsx:7` precisou somar um
  `requireArea('admin/uploads')` por cima.
- E o banco é o backstop: mesmo alcançando a rota, a RPC que ela chamar nega se for gated.

Cobertura atual verificada (sweep completo de `src/app/**`): **as 22 rotas de `src/app/api/**` têm
guard** — `requireAreaApi` com área nomeada, exceto `src/app/api/setores/route.ts:7`, que usa
`requireAreaApi(null)` (qualquer logado ativo) — mais as 5 de autenticação própria (2 de cron, 4 de
`/api/externo/`). Todas as páginas de produto chamam `requireArea` direta ou herdada
(`admin/uploads/page.tsx` herda do layout). As sem guard são as públicas ou os **destinos** dos
redirects — `login`, `solicitar-acesso`, `auth/confirm`, e `page.tsx` raiz, `sem-acesso`,
`trocar-senha`, que usam `getSessao()` direto porque chamar `requireArea` ali faria laço. Server
Actions: o padrão é `requireAreaAction` na primeira linha; as exceções são pré-sessão por desenho
(`login`, `solicitar-acesso`, `auth/confirm`, `trocar-senha` — esta com comentário explicando que
o guard bloquearia por `precisaTrocarSenha`) e **`src/lib/onboarding.ts:12,25`**, o único par de
Server Actions sem nenhum guard de camada 2 — a autorização delas é 100% o backstop do banco, e
lá as RPCs `onboarding_visto`/`marcar_onboarding_visto` **têm** `PERFORM app.exigir_acesso()`
(verificado no catálogo vivo, §2.4).

---

## 4. Ciclo de vida do usuário

### 4.1 Como um usuário passa a existir

**Não há auto-cadastro.** `supabase/config.toml` declara `enable_signup = false` como intenção
versionada (e o comentário registra que o RBAC nega acesso a conta não convidada mesmo com o
signup remoto aberto — defesa em camadas). Existem **dois** caminhos reais, e os dois terminam na
mesma função:

1. **Criação administrativa direta** — `/admin/acessos`, aba Usuários, `modal-convidar.tsx` →
   `criarUsuario({email, nome, roleId})` (`src/app/admin/acessos/actions.ts:74`).
2. **Aprovação de um pedido** — aba Solicitações → `aprovarSolicitacao({id, email, nome, roleId})`
   (`actions.ts:207`), que **chama `criarUsuario` e depois** marca a solicitação
   (`actions.ts:214,225`).

`criarUsuario`, passo a passo, do código:

1. `requireAreaAction('admin/acessos')` (`actions.ts:79`); valida e-mail por regex e `roleId`
   inteiro positivo.
2. Senha provisória: `randomBytes(15).toString('base64url')` (~20 chars),
   `actions.ts:20-24` — "NUNCA persistida em claro".
3. `admin.auth.admin.createUser({ email, password: senha, email_confirm: true })` com
   **service_role** (`actions.ts:97`). **Não há etapa de confirmação de e-mail** — a conta nasce
   confirmada.
4. **Se o e-mail já existe no Auth** (`emailJaRegistrado`, `actions.ts:46-49`): localiza o
   `user_id` paginando `listUsers` (GoTrue não filtra por e-mail — `actions.ts:51-54`) e
   **`updateUserById(userId, { password: senha, email_confirm: true })`** — ou seja, **redefine a
   senha da conta existente** (`actions.ts:100-102`).
5. Vínculo RBAC com o **cliente de sessão**: `admin_registrar_usuario(p_user_id, p_email, p_nome,
   p_role_id)` (`actions.ts:116`). No banco: gate `admin/acessos`, valida que a role existe, e
   `INSERT … ON CONFLICT (user_id) DO UPDATE SET email, nome=coalesce(…), role_id, **ativo = true**,
   atualizado_em = now()`.
6. `admin_marcar_trocar_senha(p_user_id)` (`actions.ts:127`) — liga a obrigação de troca. O retorno
   **é conferido**: se falhar, não aborta, mas enche `avisoParcial` e loga
   (`actions.ts:128-132`). O comentário registra o defeito histórico (v5.10.0/D5-003): o retorno
   era descartado, o SDK do Supabase **não lança**, e o usuário nascia sem a obrigação de trocar
   uma senha já exibida na tela.
7. E-mail da senha provisória, **camada adicional**: `enviarSenhaProvisoria` não lança (devolve
   boolean); SMTP off → `emailEnviado = false` e a senha aparece na tela (`actions.ts:137-143`).

**Não há trigger em `auth.users`** — medido: zero triggers não-internos em `app` e `auth`. A
invariante "toda conta do Auth tem linha em `rbac_usuarios`" é mantida **pela aplicação**, não pelo
banco. Uma conta criada fora do app (painel do Supabase, API direta) fica sem linha RBAC e
`exigir_acesso` a nega com `USUARIO_INATIVO` — fail-closed. Hoje há 0 órfãos nas duas direções.

**Um terceiro escritor da tabela de identidade, fora de `admin/acessos`:**
`public.api_robo_registrar(p_user_id, p_email, p_nome)` é gated por **`ARRAY['solicitacoes']`** —
a área de gestão de Solicitações, **não** `admin/acessos` — e faz
`INSERT INTO app.rbac_usuarios (…, role_id, ativo, precisa_trocar_senha, convidado_por)
VALUES (…, NULL, false, false, auth.uid())`. Cria um usuário-robô **inativo e sem role** (portanto
sem acesso nenhum, por §1.5 e §2.1) para a API externa. É consistente com a única linha inativa
medida na base.

### 4.2 Primeiro acesso

- **Senha provisória**, gerada no servidor, **exibida ao admin na tela** e, se SMTP estiver
  configurado, também enviada por e-mail ao usuário.
- **Troca obrigatória** imposta na **camada 2**, por um portão em **todos os três** guards:
  `requireArea` → `redirect('/trocar-senha')` (`sessao.ts:75`, comentário: "TODA página autenticada
  manda para /trocar-senha (não dá para pular por URL)"); `requireAreaApi` → `403
  TROCA_SENHA_OBRIGATORIA` (`sessao.ts:90-92`); `requireAreaAction` → `throw` (`sessao.ts:104`).
- **O que impede pular:** os guards. `/trocar-senha` não é público (exige sessão, `proxy.ts:12-14`),
  e sua própria action **não** usa `requireAreaAction` — de propósito, porque o guard a bloquearia
  (`src/app/trocar-senha/actions.ts:6-9`); ela checa `auth.getUser()` por dentro
  (`actions.ts:23-25`).
- `trocarSenha`: exige `senha.length >= 8` e `senha === confirmar` (`actions.ts:17-18`), chama
  `auth.updateUser({password})` e, só em caso de sucesso, `marcar_senha_trocada()`
  (`actions.ts:27-33`). **Não** compara com a senha anterior (repetir a provisória é aceito) e
  **não** pede a senha atual. `config.toml` declara `minimum_password_length = 6` e
  `password_requirements = ""` — o app é mais estrito que a intenção declarada do servidor.
- **Confirmação por e-mail: não existe no fluxo de criação** (`email_confirm: true`). O caminho de
  `/auth/confirm` existe para magic link / convite / recovery: `confirmarAcesso` aceita
  `token_hash` + `type` dentre `['magiclink','email','invite','recovery','email_change']` ou um
  `code`, e roda **só no POST** — o GET da página não consome o token, porque bots de preview
  (WhatsApp, antivírus, prefetch) queimavam o token de uso único antes do clique
  (`src/app/auth/confirm/actions.ts:8-12`).
- `nextSeguro()` (`areas.ts:189-196`) sanitiza o destino pós-login contra open-redirect: rejeita
  não-relativo, `//`, `/\`, qualquer `\`, `%2f`/`%5c` e a área `/auth` (case-insensitive). O
  comentário registra que o filtro anterior deixava passar `/\evil.com`.

### 4.3 Alteração de permissões

**Por onde e quem:** `/admin/acessos`, exclusivamente por quem tem a área `admin/acessos` —
cobrada duas vezes, no `requireAreaAction` de cada action e no `exigir_acesso` de cada RPC.

Dois mecanismos distintos:

| ação | RPC | granularidade da escrita |
|---|---|---|
| trocar o papel de **um usuário** | `admin_atribuir_role(p_user_id, p_role_id)` | **uma chamada por linha** da tabela (dropdown `onChange`), com UI otimista revertida em erro |
| editar **o papel** (nome, descrição, conjunto de áreas) | `admin_atualizar_role(p_role_id, p_nome, p_descricao, p_permissoes text[])` | **uma operação, atômica**: o formulário envia o array inteiro; a função faz `DELETE FROM app.rbac_role_permissoes WHERE role_id=…` + `INSERT … SELECT unnest(p_permissoes)` **dentro da mesma função plpgsql**, e o PostgREST roda cada RPC em uma transação |

Validação: no cliente, só "nome não vazio" (`modal-role.tsx:71-74`) — nenhuma validação de área.
No servidor, `NOME_OBRIGATORIO`, `AREAS_INVALIDAS` (área ausente de `app.rbac_areas`) e
**anti-lockout**. O anti-lockout aparece em dois pontos do catálogo vivo:
`admin_atribuir_role` recusa trocar a **própria** role por uma sem `admin/acessos`
(`ANTI_LOCKOUT … ERRCODE 42501`), e `admin_atualizar_role` faz o equivalente ao editar a própria
role. `admin_excluir_role` recusa com `ROLE_EM_USO` se houver usuários, e o cliente já esconde o
botão (`podeExcluir = n_usuarios === 0`).

**Quando passa a valer:**

- **No banco, imediatamente.** `exigir_acesso` e `permissoes_de` leem `rbac_usuarios ⋈
  rbac_role_permissoes` **a cada chamada de RPC**. Nada é cacheado no JWT — o token carrega só
  `sub` e `role`. A próxima RPC já obedece.
- **No app, na próxima requisição.** `getSessao` é `React.cache` (`sessao.ts:32`), portanto
  **uma** resolução por request; as páginas são dinâmicas (leem cookies). Não há invalidação de
  sessão a fazer. As actions chamam `revalidatePath('/admin/acessos')` para a própria tela.
- Na prática: o efeito é imediato para tudo que toque o banco, e "na próxima navegação" para o
  que a UI decidiu por `sessao.permissoes` na render anterior (sidebar, botões).

### 4.4 Desativação e reativação

Este é o ponto mais assimétrico do modelo, e a medição é direta:

- A coluna `ativo` **é honrada de verdade**: `exigir_acesso` passo 5 (`AND u.ativo`),
  `permissoes_de` (`AND u.ativo`), `tem_area`, `minha_role_id`, e
  `get_minhas_permissoes` (`permissoes` = `[]` se inativo). Um usuário desativado perde tudo
  **na próxima RPC**, mesmo com sessão viva — não há janela.
- **Mas nada na aplicação nem no banco desativa alguém.** Varredura do catálogo:
  **zero** funções em `public`/`app` que escrevam `ativo = false` em `app.rbac_usuarios`; e
  **zero** que façam `DELETE FROM app.rbac_usuarios`. A única função que toca `ativo` é
  `admin_registrar_usuario`, e só para pôr **`true`**. Do lado do app, `admin/acessos/actions.ts`
  exporta `criarUsuario`, `resetarSenha`, `atualizarNome`, `aprovarSolicitacao`,
  `rejeitarSolicitacao`, `atribuirRole`, `criarRole`, `atualizarRole`, `excluirRole`,
  `excluirUsuario` — **nenhuma desativa**.
- O único caminho para `ativo = false` é SQL direto / painel do Supabase. O comentário de
  `excluirUsuario` (`actions.ts:330-333`) diz "Diferente de «desativar», é irreversível" — a
  alternativa que a frase pressupõe não está implementada.
- **Reativação existe, por efeito colateral:** `admin_registrar_usuario` tem
  `ON CONFLICT (user_id) DO UPDATE SET … ativo = true …`. Recriar o usuário com o mesmo e-mail
  reativa — e, pelo passo 4 de §4.1, também **redefine a senha**.
- **Exclusão definitiva:** `excluirUsuario(userId)` (`actions.ts:336`) — recusa o próprio usuário
  (`actions.ts:340-342`), faz **revogação ativa de sessão** `auth.admin.signOut(userId)`
  best-effort "para fechar a janela do JWT já emitido" (`actions.ts:345-347`), e então
  `auth.admin.deleteUser(userId)`; a linha em `rbac_usuarios` cai pela FK `ON DELETE CASCADE`.
  Irreversível, com confirmação na UI.

**Imediato × próxima sessão**, resumido: desativação (se feita por SQL) e alteração de papel valem
**imediatamente** no banco; exclusão vale imediatamente e ainda revoga os refresh tokens; o que só
muda "na sessão seguinte" é a parte da UI que foi renderizada com as permissões antigas.

### 4.5 Sessão

- **Onde vive:** cookies `httpOnly` gerenciados pelo `@supabase/ssr`. Três clientes distintos:
  `src/lib/supabase/server.ts` (por request, chave **anon**, roda as RPCs com o JWT do usuário —
  role `authenticated`, `statement_timeout` 8s em vez dos 3s de `anon`),
  `src/lib/supabase/client.ts` (browser) e `src/lib/supabase/admin.ts` (`service_role`,
  `server-only`).
- **Como é validada:** sempre por `supabase.auth.getUser()`, que valida o JWT no servidor de auth —
  tanto no proxy (`proxy.ts:71-72`) quanto em `getSessao` (`sessao.ts:34`). O cookie por si só
  nunca é aceito como prova.
- **Quem pode reescrever o cookie:** **só o proxy.** `proxy.ts:8-9` se declara "o ÚNICO lugar que
  pode regravar cookies de sessão em toda navegação", e `server.ts:31-39` **engole** o erro de
  escrita de cookie (em RSC o Next proíbe), deixando o refresh para o proxy.
- **Tempo de vida:** não determinável a partir do repositório (§"o que não foi coberto").
  `config.toml` declara `jwt_expiry = 3600`, `enable_refresh_token_rotation = true`,
  `refresh_token_reuse_interval = 10` — intenção de dev local. O que se **mede** em produção:
  `auth.sessions` tem **61 sessões** para 37 usuários, a mais antiga criada em **2026-06-25**
  (≈ 82 dias antes desta medição) e a mais recente atualizada em 2026-09-15. Ou seja: os refresh
  tokens vivem por meses, e uma sessão não expira por inatividade em escala de semanas.
- **O que a invalida:** `POST /auth/signout` (`src/app/auth/signout/route.ts`), que exige que o
  header `Origin`, **quando presente**, tenha host igual ao `Host` — senão `403 ORIGEM_INVALIDA`;
  `Origin` ausente é tolerado (form clássico same-origin). **GET nunca desloga.** E
  `auth.admin.signOut(userId)` na exclusão de usuário. Alteração de permissão **não** invalida
  sessão (e não precisa). Desativação **não** invalida a sessão — apenas faz toda RPC falhar.

### 4.6 Registro de auditoria

**Não existe tabela de auditoria de RBAC.** A varredura por tabelas com nome de auditoria/log fora
dos schemas de sistema devolve `app.api_chamada_log` (chamadas da API externa),
`app.meta_setor_historico` (metas), `audit.ingestao_log` (ingestão de dados) e
`financeiro.diario_alteracoes` (diário do Gerencial). Nenhuma delas registra concessão, revogação
ou negação de acesso.

O que efetivamente fica gravado:

| evento | onde fica | o que se sabe depois |
|---|---|---|
| criação de usuário | `rbac_usuarios.convidado_por` (= `auth.uid()` de quem criou), `criado_em` | quem criou e quando |
| troca de papel | `rbac_usuarios.role_id` + `atualizado_em` | o estado atual e a hora da última mudança — **não** o papel anterior, nem quem mudou |
| edição de um papel (conjunto de áreas) | `rbac_roles.atualizado_em` | que mudou e quando — **não** o que mudou, nem quem |
| decisão de um pedido de acesso | `rbac_solicitacoes.status`, `decidido_por`, `decidido_em`, `observacao` | completo |
| liberação da troca de senha | `rbac_usuarios.precisa_trocar_senha`, `atualizado_em` | estado atual |
| onboarding visto | `rbac_usuarios.onboarding_visto_em` | estado atual |
| troca do flag de enforcement | `app.config.atualizado_por` / `atualizado_em` | completo — mas o flag não tem leitor (§2.6) |
| **acesso NEGADO** | **em lugar nenhum do banco** | nada. O `RAISE` de `exigir_acesso` não persiste. No app, sobra `console.error` server-side em `parseRpc` (`src/lib/schemas-rpc.ts:18,24`) e nas actions — log de runtime, não trilha. |

Complemento: `admin_listar_usuarios` expõe `ultimo_login` e `convite_pendente` juntando
`auth.users.last_sign_in_at` — é o único sinal de "quando essa pessoa entrou", e vem do GoTrue,
não de trilha própria.

---

## 5. Degradação por falta de permissão

### 5.1 O mecanismo que produz a degradação

`parseRpc` (`src/lib/schemas-rpc.ts:16-27`) **funde três causas diferentes em `null`**:

```ts
if (res.error) { console.error(`[RPC ${contexto}] …`); return null }
const parsed = schema.safeParse(res.data)
if (!parsed.success) { console.error(`[RPC ${contexto}] shape inesperado …`); return null }
```

`PERMISSAO_NEGADA` vinda do banco, drift de contrato e erro de transporte chegam ao chamador como o
**mesmo `null`**, com o motivo real apenas no log do servidor. O chamador típico faz `?? []` ou
`?? 0`.

O mesmo desenho aparece, deliberado, em `getSessao`: se `get_minhas_permissoes` falhar,
`sessao.ts:40-43` devolve sessão com `logado: true` e **permissões vazias** — comentário: "RPC
falhou (drift/erro): tratar como sem permissões — nunca abrir acesso". Fail-closed, silencioso.

### 5.2 Onde a degradação é anunciada

Quando a página mantém uma flag de erro (`erroCarga = lista === null ? '…' : null`), a
degradação é **anunciada, mas com mensagem genérica** — "não foi possível carregar", nunca "você
não tem permissão":

| local | evidência |
|---|---|
| `src/app/solicitacoes/page.tsx:34-36` | flag `erroCarga` |
| `src/app/admin/api-externa/documentacao/page.tsx:41-45` | idem |
| `src/app/admin/acessos/page.tsx:36-39` | `erroCarga` compondo os 4 `*.error?.message` das RPCs `admin_listar_*` |

O caso de `admin/acessos/page.tsx:31-35` registra por que `solicitacoesRes.error` entrou na
composição: antes era ignorado, e "a lista vazia por falha virava silenciosamente '0 pendentes'"
— com o badge da sidebar vindo de outra RPC, os dois números discordariam sem aviso.

### 5.3 Onde a degradação é silenciosa

**(a) Precedente vivo do modo de falha, documentado no próprio código.**
`src/app/admin/api-externa/documentacao/page.tsx:18-23` relata que `admin_solic_listar_tipos` era
gated na área de **gestão** enquanto a página aceitava a área nova mais fraca: quem tinha só a
permissão nova passava no guard da página e recebia `PERMISSAO_NEGADA` do banco, vendo uma **seção
vazia com aviso genérico**. O conserto (migration 0219) foi trocar a fonte por
`solic_tipos_documentacao`, cujo gate no catálogo vivo é
`ARRAY['solicitacoes', 'solicitacoes/documentacao']` — as duas áreas que a página aceita em
`requireArea(['solicitacoes/documentacao','solicitacoes'])` (`documentacao/page.tsx:27`).
`admin_solic_listar_tipos` **continua** gated só por `ARRAY['solicitacoes']` (medido), o que está
correto para a tela de gestão que o usa. O que fica é o **padrão estrutural de risco**:
**`exigir_acesso` mais estrito que o `requireArea` da página**, que reaparece em qualquer tela nova
que use OR de duas áreas — e cujo sintoma é tela vazia com aviso genérico, não erro de permissão.

**(b) Capacidade escondida dentro de tela já permitida** (o idioma de dois níveis da §1.4). Em
todos, o `requireArea` da página já passou e o botão simplesmente **não aparece**, sem qualquer
menção de permissão:

| local | o que desaparece |
|---|---|
| `src/app/financeiro/acervo/page.tsx:12` (`podeAdicionar`) | botão "Adicionar documento" |
| `src/app/gestao-pessoas/estante/page.tsx:22` (`podeGerir`) | ações de catálogo / devolver por outro |
| `src/app/metas/page.tsx:27` (`podeComparar`) | botão "Modo de Comparação" |
| `src/app/solicitacoes/page.tsx:19-21` (`podeGestao`, `podeVerDocApi`) | "Ver todas", "Gerenciar", link da Documentação |
| `src/app/admin/api-externa/documentacao/page.tsx:31` (`podeGestao`) | links internos para `/admin/api-externa` |
| `src/components/layout/nav-model.ts:120-134` + `src/components/layout/sidebar.tsx:137-138` | o item ou a subaba inteira sai da sidebar |

**(c) Badge de pendências, silencioso por decisão explícita.** `src/app/layout.tsx:41,47` chama
`getPendencias()` e `getAcessosPendentes()` com `.catch(() => null)`;
`src/components/layout/sidebar.tsx:34-45` não renderiza nada com `null` ou `≤ 0`. O comentário
assume: "Falha já vira null no layout (.catch) → o `use` nunca lança". Uma negação de permissão na
RPC do badge é indistinguível de "zero pendentes".

### 5.4 O inverso — onde falta de permissão produz erro visível

**Nenhum vazamento de mensagem crua encontrado.** `requireAreaAction` lança
`Error('PERMISSAO_NEGADA' | 'AUTH_NECESSARIA' | 'TROCA_SENHA_OBRIGATORIA')` (`sessao.ts:101-108`),
e todas as actions varridas têm tabela de tradução com fallback genérico antes de a mensagem chegar
à tela — o molde está em `src/app/admin/acessos/actions.ts:28-34` (`ERROS_BANCO`, com
`PERMISSAO_NEGADA` → "Você não tem permissão para administrar usuários e acessos") e se repete em
`gestao-pessoas/estante/actions.ts:51-71`, `gestao-pessoas/inventario/actions.ts:118`,
`financeiro/acervo/actions.ts:34-35`, `financeiro/dre/estrutura/actions.ts:45`,
`financeiro/dre/estrutura-competencia/actions.ts:48`,
`financeiro/fluxo-caixa/gerencial/actions.ts:237,268`, `admin/api-externa/actions.ts:41-42`,
`admin/solicitacoes/actions.ts:71`, `metas/cadastro/actions.ts:27`, `solicitacoes/actions.ts:341,344`.

O erro visível "de verdade" é o **redirect**: sem área, `requireArea` manda para `/sem-acesso`, que
é uma tela desenhada (§7) e não uma falha. Em route handler, `requireAreaApi` devolve
`{"error":"PERMISSAO_NEGADA"}` com 403 — payload de integração, não texto renderizado.

**Achado incidental, registrado por completude:** `Sessao.isAdmin` (`sessao.ts:21,55`) é calculado
e **não tem nenhum consumidor fora de `sessao.ts`**; as checagens reais usam
`permissoes.includes('admin/acessos')` ou a constante `AREA_ADMIN`.

---

## 6. Fluxo de solicitação de acesso

### 6.1 Superfície pública

**Rota:** `/solicitar-acesso` — pública na camada 1 por entrada explícita em `PUBLIC_PATHS`
(`proxy.ts:14`), com o comentário registrando o contraste: "`/solicitar-acesso` é público
(pré-cadastro, sem sessão). `/trocar-senha` NÃO é público".

**O que o formulário pede:** e-mail e nome (`src/app/solicitar-acesso/actions.ts:31-32`). Nada mais
— nenhuma escolha de área, nenhuma escolha de unidade de negócio, nenhum campo de justificativa.

**O que valida:** e-mail por regex na action (`actions.ts:34`) e **de novo** no corpo da RPC
(`v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'`). Nome é `trim` + `nullif`.

**O que a tela revela a quem não tem conta — nada.**

- **Nomes de área: não.** A tela não lista áreas; a escolha de papel é do aprovador (§6.4).
- **Unidades de negócio: não.**
- **Existência de um e-mail: não.** Duas camadas garantem isso. No banco, o `INSERT … SELECT …
  WHERE NOT EXISTS (pendente com esse e-mail) AND NOT EXISTS (usuário com esse e-mail)` é um
  **no-op silencioso** e a função retorna `{'ok': true}` de qualquer forma; `solicitar_acesso_admin`
  devolve `inserida: false` mas isso nunca chega ao cliente. No app, a action termina **sempre** em
  `redirect('/solicitar-acesso?enviado=1')` (`actions.ts:87`), e todo erro é engolido com
  `console.error` — o comentário chama isso de "Anti-enumeração + best-effort"
  (`actions.ts:82-85`) e "A resposta ao usuário é SEMPRE de sucesso" (`actions.ts:11`).
- **Mensagens que diferenciam "não existe" de "já existe": não.** O único desvio distinguível é
  `?erro=email` para endereço malformado (`actions.ts:35`).
- O mesmo desenho vale no **login**: `entrar` redireciona para `/login?erro=credenciais` em
  qualquer falha, "não revela se o e-mail existe" (`src/app/login/actions.ts:7-8,29`).

### 6.2 Proteções contra abuso

| proteção | existe? | detalhe medido |
|---|---|---|
| **limite de taxa** | **parcial e no caminho errado** | `solicitar_acesso` tem teto: `count(*) FROM app.rbac_solicitacoes WHERE criado_em > now() - interval '1 minute' >= 5` → recusa. **Mas é um teto GLOBAL, não por IP nem por e-mail** — conta todas as solicitações da janela, de qualquer origem. E o caminho que o app usa é `solicitar_acesso_admin`, que **não tem teto nenhum**; a versão com teto só entra como fallback quando a primeira falha (`actions.ts:62`). |
| **verificação humana (CAPTCHA)** | **não** | nenhuma referência no formulário ou na action. |
| **confirmação por e-mail do solicitante** | **não** | o pedido entra na fila sem provar posse do endereço. |
| **duplicidade** | **sim** | dois `NOT EXISTS` no corpo das duas RPCs: não cria segundo pendente para o mesmo e-mail (case-insensitive, `lower()`), e não cria pedido para quem já é usuário. Note que **não há `UNIQUE` em `rbac_solicitacoes.email`** — a garantia é o corpo da função, não o schema, e ela é por status `'pendente'` (um e-mail pode ter vários registros históricos já decididos). |

### 6.3 Armazenamento e transições

**Tabela:** `app.rbac_solicitacoes` (§1.1).

**Estados possíveis:** `'pendente'` (default), `'aprovada'`, `'rejeitada'` — impostos por
`rbac_solicitacoes_status_check`.

**Transições permitidas, e por quê:** somente `pendente → aprovada` e `pendente → rejeitada`. O
mecanismo é a cláusula `WHERE id = p_id AND status = 'pendente'` de
`admin_decidir_solicitacao`, com `RETURNING email INTO v_email` e
`IF v_email IS NULL THEN RAISE 'SOLICITACAO_INEXISTENTE_OU_DECIDIDA'`. Portanto:
**não há re-decisão, não há volta para pendente, não há transição entre aprovada e rejeitada**, e
tentar produz erro em vez de silêncio.

**Quem pode mover:** apenas `admin/acessos`, via `admin_decidir_solicitacao(p_id, p_aprovar, p_obs)`
(gate `ARRAY['admin/acessos']`), que grava `decidido_em = now()`, `decidido_por = auth.uid()` e
`observacao`.

**Quem pode inserir:** `anon` e `authenticated` por `solicitar_acesso`; `service_role` por
`solicitar_acesso_admin`.

### 6.4 Aprovação

**Tela:** `/admin/acessos`, aba Solicitações (`src/components/admin/acessos/aba-solicitacoes.tsx`).
**Quem vê:** quem tem `admin/acessos` — `requireArea('admin/acessos')` em
`src/app/admin/acessos/page.tsx:22`, e cada RPC `admin_listar_*` cobra a mesma área de novo.

**O que o aprovador decide:** **apenas o papel** (`roleId`). Não áreas, não unidade de negócio — a
assinatura é `aprovarSolicitacao({ id, email, nome, roleId })`. A granularidade de área só existe
editando o papel (outra aba).

**O que a aprovação executa,** em ordem (`actions.ts:207-238`):

1. `requireAreaAction('admin/acessos')`;
2. **`criarUsuario(...)`** por inteiro — conta no Auth com senha provisória + `email_confirm: true`,
   `admin_registrar_usuario`, `admin_marcar_trocar_senha`, e-mail da senha (§4.1). Se `criarUsuario`
   falhar, retorna e **não** mexe na solicitação;
3. `admin_decidir_solicitacao(p_id, p_aprovar: true)`. **Não é atômico com o passo 2** — e o código
   trata isso explicitamente: se a RPC devolver erro, o usuário **fica criado** e
   `avisoParcial = 'Usuário criado, mas a solicitação continua pendente — decida-a manualmente.'`
   O comentário em `actions.ts:215-221` registra o defeito histórico (v5.10.0/D5-002): o `{error}`
   era descartado, o SDK não lança, e "a solicitação ficava PENDENTE para sempre e a tela declarava
   sucesso limpo".

### 6.5 Recusa

`rejeitarSolicitacao(id)` (`actions.ts:240-251`) → `admin_decidir_solicitacao(p_id, p_aprovar:
false)`. **O registro permanece** na tabela, com `status = 'rejeitada'`, `decidido_por`,
`decidido_em` e `observacao`. Nada é apagado, nenhuma conta é criada.

**O que o solicitante recebe: nada.** Não existe e-mail de recusa — a varredura de `src/lib/email`
não tem nenhum remetente para esse evento (os únicos do domínio de acesso são
`enviarNotificacaoAcessoSolicitado`, para os admins, e `enviarSenhaProvisoria`, para o aprovado).
O `observacao` fica visível só para os administradores.

### 6.6 Notificações disparadas — só o gancho

| evento | destinatário | gatilho | evidência |
|---|---|---|---|
| **pedido novo criado** | **todos os usuários ativos com a área `admin/acessos`** | só quando o `INSERT` de fato ocorreu (`v_count > 0`), para não avisar em reenvio/duplicata | a lista de destinatários é calculada **no banco**, por `solicitar_acesso_admin`: `SELECT array_agg(DISTINCT lower(u.email)) FROM app.rbac_usuarios u JOIN app.rbac_role_permissoes rp … WHERE u.ativo AND rp.area = 'admin/acessos'`, devolvida em `{'inserida','emails'}`; a action dispara `enviarNotificacaoAcessoSolicitado({paras, emailSolicitante, nomeSolicitante, quando})` com `await` (`actions.ts:73-80`) |
| **pedido aprovado** | o solicitante | dentro de `criarUsuario`, após criar a conta | `enviarSenhaProvisoria({para, nome, senha, tipo:'criacao'})` (`actions.ts:140`), best-effort: devolve boolean, não lança; falha → a senha aparece na tela |
| **senha resetada** | o usuário | `resetarSenha` | `enviarSenhaProvisoria` com o outro `tipo` |
| **pedido rejeitado** | — | — | **nenhum gancho existe** |

O transporte (SMTP, layout, MODO TESTE) é outro módulo — `src/lib/email/`, fora do escopo aqui.
Vale registrar só a fronteira: a lista de destinatários administrativos é **derivada da matriz de
permissão em tempo de execução**, não uma configuração — mudar quem tem `admin/acessos` muda quem é
notificado, sem tocar em nada de e-mail.

### 6.7 Relação com o mecanismo genérico de solicitações do produto

**São independentes.** Não é suposição — é o resultado de duas varreduras:

- **Tabelas disjuntas.** O fluxo de acesso usa `app.rbac_solicitacoes` (7 colunas, status
  tripartite). O produto tem `app.solicitacao`, `app.solicitacao_tipo`, `app.solicitacao_campo`,
  `app.solicitacao_anexo` — com tipos configuráveis, snapshot de campos, anexos em Storage e
  movimentações. Nenhuma FK entre os dois conjuntos.
- **RPCs disjuntas.** Acesso: `solicitar_acesso`, `solicitar_acesso_admin`,
  `admin_decidir_solicitacao`, `admin_listar_solicitacoes`,
  `admin_acesso_solicitacoes_pendentes`. Produto: família `admin_solic_*`,
  `app.solic_validar_e_snapshotar`, `app.pode_ver_solic`, `app.sou_atendente`, `app.solic_json`,
  `criar_solicitacao_externa`, etc.
- **Áreas disjuntas.** Acesso é governado por `admin/acessos`; o produto por
  `solicitacoes/basico`, `solicitacoes` e `solicitacoes/documentacao`.
- **Código disjunto.** `grep -rl` por `rbac_solicitacoes|solicitar_acesso|admin_decidir_solicitacao|admin_acesso_solicitacoes`
  em `src/` devolve exatamente: `src/app/admin/acessos/actions.ts` (+ `.test.ts`),
  `src/app/solicitar-acesso/actions.ts` (+ `.test.ts`), `src/lib/acessos/pendencias.ts`,
  `src/lib/rpc-contrato.test.ts` e `src/types/database.ts` (tipos gerados). **Nenhum arquivo de
  `src/lib/solicitacoes/`** (`abas.ts`, `ciclo-de-vida.ts`, `format.ts`, `rpc.ts`, `schemas.ts`)
  aparece — e o inverso também vale.

O que de fato compartilham: a palavra "solicitação", e o **padrão** do badge na sidebar — dois
módulos distintos (`src/lib/acessos/pendencias.ts` e o equivalente do produto), com a duplicação de
6 linhas assumida por escrito em `pendencias.ts:8-12` ("a duplicação de 6 linhas é mais barata que
expor um tipo interno de outro domínio").

---

## 7. Telas e componentes

Todas as páginas deste domínio são **Server Components** (nenhuma tem `'use client'` na própria
página); a interatividade vive em filhos client.

| tela | arquivo | RSC/Client | o que busca | fundação consumida |
|---|---|---|---|---|
| **Entrada** | `src/app/login/page.tsx` + `actions.ts` | RSC (form nativo, sem client component) | `entrar()` → `auth.signInWithPassword` | `AuthHeader`, `Input` |
| **Troca de senha** | `src/app/trocar-senha/page.tsx` (`getSessao` na linha 18) + `actions.ts` | RSC | `auth.updateUser` + RPC `marcar_senha_trocada` | `AuthHeader`, `Input` |
| **Sem acesso** | `src/app/sem-acesso/page.tsx` (`getSessao` na linha 10) | RSC | `getSessao()`, `rotaInicial()` | `AuthHeader`, `Button` |
| **Pedido de acesso** | `src/app/solicitar-acesso/page.tsx` + `actions.ts` | RSC | action → `solicitar_acesso_admin` (admin client) com fallback `solicitar_acesso` | `AuthHeader`, `Input` |
| **Confirmação de link** | `src/app/auth/confirm/page.tsx` + `actions.ts` | RSC (GET só renderiza; POST confirma) | `verifyOtp` / `exchangeCodeForSession` | `AuthHeader` |
| **Logout** | `src/app/auth/signout/route.ts` | route handler | `auth.signOut()` + checagem de `Origin` | — |
| **Raiz `/`** | `src/app/page.tsx` (linha 9) | RSC | `getSessao()`, `rotaInicial()` → redirect | — |
| **Shell** | `src/app/layout.tsx` (linha 35) | RSC | `getSessao()` + 3 promises não-aguardadas (`getPendencias`, `getAcessosPendentes`, `getOnboardingVisto`) | `AppShell`, `ThemeProvider`, `WelcomeJanusModal` |
| **Administração de usuários** | `src/app/admin/acessos/page.tsx` (+ `loading.tsx`, `actions.ts`) | RSC | `requireArea('admin/acessos')` + `Promise.all` de `admin_listar_usuarios`, `admin_listar_roles`, `admin_listar_areas`, `admin_listar_solicitacoes`, **com o cliente de sessão** | `AcessosContent` (client) |
| **Fila de aprovação** | não é tela própria — é a aba Solicitações de `/admin/acessos` | client | dados já vindos da page | — |

**Componentes exclusivos deste domínio** (grep confirmou zero import de fora da pasta):
`src/components/admin/acessos/acessos-content.tsx`, `aba-usuarios.tsx`, `aba-roles.tsx`,
`aba-solicitacoes.tsx`, `modal-role.tsx`, `modal-convidar.tsx`, `tipos.ts`.
Primitivos compartilhados que eles reusam (vivem fora): `FaixaMensagem`, `ConfirmModal`,
`ModalCentral`, `CardTabela`, as pills de `src/components/shared/`, e `Checkbox`/`Badge`/`Button`/
`Input` de `src/components/ui/`.
`src/components/auth/auth-header.tsx` **não** é exclusivo — as 6 telas públicas o usam, e
`src/app/admin/design-system/page.tsx` também.

### 7.1 Como a matriz de permissões é editada

**É um formulário por PAPEL, com um checkbox por área, agrupado — não uma grade usuário × área.**

- `src/components/admin/acessos/modal-role.tsx:49-57` agrupa o `AreaCatalogo[]` por `grupo`, na
  ordem do catálogo (`ordem`). Os grupos vivos são `Geral`, `Performance`, `Financeiro`,
  `Administração`, `Solicitações`, `Gestão de Pessoas`.
- `togglePermissao` (`modal-role.tsx:62-66`) monta um `string[]` **local**; nada vai ao servidor por
  clique.
- O submit (`modal-role.tsx:68-85`) envia o array **inteiro** de uma vez, via `criarRole` ou
  `atualizarRole`.

**O que valida:** no cliente, só nome não-vazio (`modal-role.tsx:71-74`). No servidor,
`NOME_OBRIGATORIO`, `AREAS_INVALIDAS` (área inexistente em `app.rbac_areas`) e o anti-lockout
(§4.3).

**Como o salvamento é aplicado:** **uma operação de banco por formulário, atômica.**
`admin_atualizar_role` faz `DELETE FROM app.rbac_role_permissoes WHERE role_id = …` seguido de
`INSERT … SELECT unnest(p_permissoes)` **dentro da mesma função plpgsql**; o PostgREST executa cada
RPC em uma transação. Não é uma escrita por checkbox.

**A atribuição de papel a usuário é o outro modelo:** uma chamada `atribuirRole(userId, roleId)`
**por linha** da tabela (dropdown `onChange`, `aba-usuarios.tsx:82`), com estado otimista
(`rolesOtimistas`) revertido em erro. Portanto: **editar um papel é lote atômico; reatribuir
pessoas é N operações independentes**, sem transação em volta.

Detalhe de apresentação relevante para réplica: o catálogo exibido é o **mescla** descrita em §1.3 —
chaves do banco, rótulos do código.

---

## 8. Contaminação de domínio

Critério: **um artefato está limpo se funciona sem conhecer o negócio deste produto.**

### 8.1 Classificação das 22 áreas

| área | classe | por quê |
|---|---|---|
| `admin/acessos` | **ESTRUTURA** | meta-permissão de administrar identidade; qualquer produto tem |
| `admin/design-system` | **ESTRUTURA** | vitrine de componentes, ferramenta de desenvolvimento |
| `admin/uploads` | **ESTRUTURA (com ressalva)** | "importar arquivo" é capacidade genérica; a tela é específica das 5 bases deste produto |
| `executiva` | **NEGÓCIO** | nome da visão agregada da empresa |
| `performance` | **NEGÓCIO** | seção de produto |
| `performance/trips` | **NEGÓCIO** | unidade de negócio (marca "Trips") |
| `performance/weddings` | **NEGÓCIO** | unidade de negócio |
| `performance/corporativo` | **NEGÓCIO** | unidade de negócio |
| `financeiro/fluxo-caixa` | **NEGÓCIO** | domínio financeiro deste produto |
| `financeiro/gerencial` | **NEGÓCIO** | idem |
| `financeiro/faturamento-corp` | **NEGÓCIO** | idem |
| `financeiro/acervo` + `/gestao` | **NEGÓCIO** (mas o **idioma** de dois níveis é estrutura) | biblioteca de documentos deste produto |
| `financeiro/dre` | **NEGÓCIO** | demonstrativo contábil |
| `metas` + `metas/acompanhamento` | **NEGÓCIO** | módulo de metas |
| `solicitacoes/basico` + `solicitacoes` + `/documentacao` | **NEGÓCIO** | módulo de solicitações |
| `gestao-pessoas/inventario` | **NEGÓCIO** | inventário de ativos |
| `gestao-pessoas/estante` + `/gestao` | **NEGÓCIO** | empréstimo de livros |

**Contagem: 3 de estrutura (uma com ressalva), 19 de negócio.** O que é reaproveitável não é a
lista, e sim **dois idiomas** que ela demonstra: o sufixo `/gestao` como segundo nível de uma mesma
área, e o par `x/basico` × `x` para separar uso de administração.

### 8.2 Onde o vocabulário de unidade de negócio entra no modelo de acesso

Em **quatro** pontos, e um deles é dentro do banco:

1. **No nome das áreas** — `performance/weddings|trips|corporativo` (§8.1).
2. **`app.areas_do_setor(p_setor text)`**, `IMMUTABLE`, **`SECURITY INVOKER`**, no catálogo vivo:
   ```sql
   SELECT CASE p_setor
     WHEN 'Weddings'    THEN ARRAY['performance/weddings']
     WHEN 'Lazer'       THEN ARRAY['performance/trips']
     WHEN 'Corporativo' THEN ARRAY['performance/corporativo']
     ELSE ARRAY['executiva', 'performance']   -- 'todos' e desconhecidos: agregados
   END
   ```
   Nomes de marca **hardcoded em SQL**, e com **15 consumidoras** segundo o comentário do caso de
   contrato (`rpc-contrato.test.ts:1894`) — que ainda fixa o retorno para `'Weddings'` e `'todos'`
   justamente para impedir que alargar ali alargue 14 RPCs de uma vez (`rpc-contrato.test.ts:1947-1949`).
   Note a **assimetria de vocabulário**: o setor se chama `'Lazer'`, a área se chama `trips`.
   E o `ELSE` é a cláusula de fallback: setor desconhecido recebe as áreas **agregadas da empresa**.
3. **`areasDoSetor()` em `src/lib/auth/areas.ts:95-102`** — o mesmo `switch`, reescrito em
   TypeScript, com o mesmo `default`. Duas fontes, uma paridade só afirmada em comentário
   ("paridade testada") — o caso de contrato prova o lado SQL, não a igualdade entre os dois.
4. **`areasDaRota()` e `PRIORIDADE_INICIAL`** (`areas.ts:108-172`) — a tabela de rotas do produto e
   a ordem de preferência do redirect inicial. Puro mapa de negócio dentro do módulo de acesso.

Vale registrar que o legado carregava a BU de outra forma, **como coluna**: `app.usuarios.setor_id`
e `app.convites.setor_id`, com FK para `analytics.dim_setor_macro` e um
`CHECK (chk_setor_role)` amarrando `role = 'gestor'` a `setor_id NOT NULL`. Esse desenho foi
abandonado (tabelas vazias) em favor de codificar a BU no **nome da área**.

### 8.3 O que copia, o que parametriza, o que redesenha

**Copiáveis como estão** (não conhecem o negócio):

- Tabelas: `rbac_areas`, `rbac_roles`, `rbac_role_permissoes`, `rbac_usuarios`,
  `rbac_solicitacoes` — nenhuma coluna de domínio.
- Funções: `app.exigir_acesso`, `app.permissoes_de`, `app.tem_area`, `app.uid_jwt`,
  `app.minha_role_id`, `app.pode_assinar_area`.
- Família `admin_*` de RBAC inteira: `admin_listar_{usuarios,roles,areas,solicitacoes}`,
  `admin_{criar,atualizar,excluir}_role`, `admin_atribuir_role`, `admin_registrar_usuario`,
  `admin_atualizar_nome`, `admin_marcar_trocar_senha`, `admin_decidir_solicitacao`,
  `admin_acesso_solicitacoes_pendentes`.
- Ciclo de vida: `get_minhas_permissoes`, `marcar_senha_trocada`, `solicitar_acesso`,
  `solicitar_acesso_admin`, `onboarding_visto`, `marcar_onboarding_visto`.
- App: `src/lib/auth/sessao.ts` inteiro (`Sessao`, `getSessao`, os três guards), `src/proxy.ts`
  (tirando as três listas de isenção), `src/lib/supabase/{server,client,admin}.ts`,
  `nextSeguro()`.
- Telas: login, trocar-senha, sem-acesso, solicitar-acesso, auth/confirm, auth/signout, e
  `admin/acessos` com seus 7 componentes — a tela de acessos é genérica porque o catálogo de áreas
  chega a ela como **dado** (`AreaCatalogo[]`), não como código.

**Precisam de um tipo parametrizado** (a forma serve, o conteúdo é do produto):

- `AREAS` e `Area` (`areas.ts:5-30`) — a tupla `as const` que gera o tipo. Em réplica, o conteúdo
  vira configuração do produto.
- `AREA_INFO` (`areas.ts:36-88`) — rótulo/grupo/ordem por área.
- `areasDaRota()` (`areas.ts:108-157`) — tabela rota → áreas.
- `PRIORIDADE_INICIAL` / `rotaInicial()` (`areas.ts:160-180`).
- `AREA_ADMIN` (`areas.ts:33`) — a constante já é o ponto de parametrização certo; o valor
  `'admin/acessos'` é convenção.
- As três listas de isenção do proxy (`PUBLIC_PATHS`, `PUBLIC_PREFIXES`, `API_AUTH_PROPRIA`,
  `API_AUTH_PROPRIA_PREFIXOS`) e o `matcher`.

**Precisam de redesenho** (a forma atual carrega o negócio ou é convenção sem mecanismo):

- **`app.areas_do_setor`** — nomes de marca em SQL, 15 consumidoras. É o ponto mais contaminado do
  banco, e o mais duplicado (existe também em TS).
- **A hierarquia por prefixo.** A barra em `financeiro/acervo/gestao` é decorativa: `exigir_acesso`
  compara por igualdade. Hoje a "inclusão" é reescrita à mão em dois lugares (lista OR na rota,
  array na RPC) sem nada verificando que concordam. Uma réplica que queira hierarquia de verdade
  precisa de mecanismo (fechamento transitivo, ou área-implica-área como dado), não de convenção
  de nome.
- **O par `ler` × `escrever`.** Modelado como duas áreas com sufixo, em quatro módulos e com
  **duas convenções opostas** (em Acervo e Estante o sufixo `/gestao` é o forte; em Solicitações e
  Metas a chave **curta** é a forte, por acidente histórico documentado em `areas.ts:54-59,65-69`).
  Numa réplica isso é um par `(recurso, ação)`, não dois nomes.
- **Papel único por usuário.** `rbac_usuarios.role_id` é escalar. Um produto que precise de
  composição de papéis muda a tabela e `app.permissoes_de`.
- **Ausência de escopo de tenant/BU como dimensão.** Se a réplica for multi-tenant, a BU precisa
  ser coluna, não substring do nome da área — e `exigir_acesso` passa a ter dois argumentos.

---

## 9. Divergências encontradas

| o que a documentação diz | o que o código/catálogo faz | evidência |
|---|---|---|
| O comentário dentro de `app.exigir_acesso` diz que o caminho sem claims libera "superusuário real (migrations/seed/`db query` conectam como postgres)" | **`postgres` tem `rolsuper = false`.** O único `rolsuper` é `supabase_admin`. A saída **não** se aplica à conexão do projeto: conectado como `postgres` sem claims, a função **nega** com `AUTH_NECESSARIA` | `pg_roles`: `postgres.rolsuper=false`, `rolbypassrls=true`; `supabase_admin.rolsuper=true`. Prova direta na matriz da §2.2, linha 1 |
| `app.rbac_roles.descricao` da role `Financeiro`: "Acesso total as áreas de dados + upload de arquivos" | Tem **22 áreas — todas**, inclusive **`admin/acessos`** e `admin/design-system` e `solicitacoes` (gestão). É uma **segunda role de administrador pleno**, idêntica a `Administrador`; 4 usuários a detêm | `app.rbac_role_permissoes` agregado por role (§1.1) |
| `app.rbac_roles.descricao` da role `Diretoria`: "Acesso total + gerenciamento de usuários e acessos" | Tem 18 áreas e **NÃO tem `admin/acessos`** (nem `admin/design-system`, nem `solicitacoes` gestão, nem `solicitacoes/documentacao`). A descrição promete o que a matriz não concede | idem |
| As roles `Geral` e `Recursos Humanos` têm **a mesma** descrição: "Acesso as solicitações + acervo de documentos" | Concedem conjuntos **diferentes**: `Geral` 3 áreas, `Recursos Humanos` 6 (soma `financeiro/acervo/gestao`, `gestao-pessoas/estante/gestao`, `gestao-pessoas/inventario`) | idem |
| `src/lib/auth/areas.ts:1-2`: "espelho de `app.rbac_areas`. A paridade banco↔app é garantida por teste de contrato" | Verdadeiro **só para as chaves**. O caso de contrato compara `areas.map(a => a.area).sort()` com `[...AREAS].sort()` — `rotulo`, `grupo` e `ordem` não são comparados por teste nenhum | `src/lib/rpc-contrato.test.ts:763-768` |
| `AREA_INFO` declara `'financeiro/dre'` com `rotulo: 'Demonstrativo de Resultado'`; comentários de `areas.ts:57-59,73-75` dizem que "o rótulo vivo vem de `app.rbac_areas`" e que o local é "FALLBACK" | O banco diz `rotulo = 'DRE'`, **e é o código que ganha na tela**: `admin/acessos/page.tsx:82-86` mescla `{...a, ...local}`, o local sobrescrevendo o banco. A relação é o **inverso** do que o comentário de `areas.ts` afirma. (`page.tsx:69-81` documenta a decisão corretamente — a divergência é entre os dois comentários) | `app.rbac_areas` linha `financeiro/dre`; `areas.ts:53`; `src/app/admin/acessos/page.tsx:69-86` |
| O comentário de `excluirUsuario` contrasta a exclusão com «desativar», implicando que desativar existe | **Não existe caminho de desativação.** Zero funções em `public`/`app` escrevem `ativo = false` em `rbac_usuarios`; nenhuma action o faz. A coluna é honrada por 5 funções mas escrita apenas para `true` (`admin_registrar_usuario`) e `false` na inserção de robô (`api_robo_registrar`) | `src/app/admin/acessos/actions.ts:330-333`; varredura de corpos por `ativo\s*=\s*false` sobre `rbac_usuarios` → 0 linhas |
| `app.config` guarda `auth_enforcement = true`, e existe `admin_set_enforcement` gated por `admin/acessos` para trocá-lo | **O flag não tem leitor.** `exigir_acesso` só o cita em comentário ("não consulta mais"); o único objeto que referencia `auth_enforcement_ativo()` é ela mesma. `admin_set_enforcement` não tem chamador no app — só o tipo gerado e um caso de contrato | corpo vivo de `app.exigir_acesso`; varredura `auth_enforcement_ativo` → `{app.auth_enforcement_ativo, app.exigir_acesso}`; `grep` em `src/` → `src/types/database.ts:103`, `src/lib/rpc-contrato.test.ts:2057,2071` |
| `app.current_user_role()` existe como helper de papel | Lê `app.usuarios`, que tem **0 linhas** → retorna sempre `NULL`; e **não tem nenhum chamador**. Junto com `app.usuarios` e `app.convites` (ambas vazias), são objetos mortos do modelo pré-RBAC | corpo vivo; `count(*)` = 0 nas duas tabelas; varredura de chamadores |
| ADR-0109 / `proxy.ts:4-9` descrevem 4 camadas com o banco como "backstop (camadas 3 e 4)" | A camada 4 (RLS) é **praticamente vazia**: 4 policies no banco inteiro, e **65 das 66 tabelas dos schemas do app têm RLS ligada com ZERO policies**. O que protege é a **ausência de `GRANT`** — fora de storage/realtime/cron, o único grant de tabela a `anon`/`authenticated` é `SELECT` em `app.rbac_usuarios` | `count(*) FROM pg_policy` = 4; 65 tabelas com `relrowsecurity` e sem policy; `information_schema.role_table_grants` |
| A policy `rbac_usuarios_proprio_registro` e o `GRANT SELECT` em `app.rbac_usuarios` para `authenticated` sugerem leitura do próprio registro por REST | **Inalcançável**: o PostgREST de produção responde `PGRST106 — "Only the following schemas are exposed: public, graphql_public"`. As duas defesas só passariam a valer se `app` fosse exposto | sonda REST com chave anon, §3.2 |
| `src/lib/supabase/server.ts:9,37` falam de "middleware" cuidando do refresh | Não existe `middleware.ts`; a convenção do Next 16 neste repo é `src/proxy.ts`. Terminologia desatualizada (mecanismo correto) | ausência de `middleware.ts`; `src/proxy.ts:50,97` |
| `supabase/config.toml` declara `minimum_password_length = 6`, `password_requirements = ""` | O app exige **8** e nada mais (`senha.length < 8`). Mais estrito que a intenção do servidor — e o `config.toml` é dev local, não prova produção | `src/app/trocar-senha/actions.ts:17`; `supabase/config.toml` |
| `src/lib/auth/sessao.ts:21,55` mantém `isAdmin` na interface `Sessao` | Campo **sem nenhum consumidor** fora de `sessao.ts`; as checagens reais usam `permissoes.includes('admin/acessos')` / `AREA_ADMIN` | grep `\.isAdmin\b` → só `sessao.ts` |
| `docs/WORKING-CONTEXT.md` (cabeçalho de sessão) diz "Última migration aplicada **0270** · próxima livre: **0271**" | O repositório em `62bd8b9` já tem `0271_estante_estrutura.sql` e `0272_estante_rpcs.sql` (v5.11.0, mergeada em 15/09 12:55), e as áreas `gestao-pessoas/estante*` **estão** em `app.rbac_areas` em produção | `ls supabase/migrations \| tail`; `app.rbac_areas` contém as 3 áreas de Estante |

---

## Reconstruível

Descrito com densidade suficiente para virar spec **sem consultar este repositório**:

1. **O modelo de dados do RBAC inteiro** — 5 tabelas com colunas, tipos, nulidade, defaults, PKs,
   FKs (com `ON DELETE`/`ON UPDATE`) e `CHECK`s, mais as duas tabelas de legado e por que estão
   vazias (§1.1, §1.2).
2. **`app.exigir_acesso`** — ordem de verificação, mensagem e `ERRCODE` de cada recusa, semântica
   de `p_areas` `NULL` × `'{}'` × área inexistente, os dois caminhos de bypass, e a matriz
   empírica de 11 caminhos (§2.1–2.3).
3. **A resolução de permissão** — `permissoes_de` e por que `role_id NULL` e `ativo=false` dão
   `'{}'` (§1.5); e os 7 helpers ao redor, com qual função de identidade cada um usa (§2.6).
4. **As quatro camadas**, com o que cada uma decide, como obtém identidade, o que faz ao negar e se
   é fail-closed; incluindo as três listas de isenção do proxy, com o motivo de cada uma, e a regra
   de que o matcher é lista negativa por prefixo/nome exato e nunca por extensão (§3.1).
5. **Qual é a barreira real e por quê** — o gate na RPC, sustentado pela ausência de `GRANT` de
   tabela, com os números (4 policies, 65 tabelas RLS-sem-policy, 1 função `anon`, 177 funções
   `authenticated`) (§3.2–3.4).
6. **O que uma rota nova herda** — fechada para sessão, aberta para área, com o mecanismo exato que
   produz cada metade (§3.5).
7. **O ciclo de vida completo** — os dois caminhos de criação convergindo em `criarUsuario`, os 7
   passos dela, o comportamento quando o e-mail já existe, o portão triplo de troca de senha, os
   dois mecanismos de alteração de permissão com granularidade de escrita diferente, o anti-lockout,
   a reativação por efeito colateral e a exclusão com revogação de sessão (§4.1–4.4).
8. **O fluxo de solicitação de acesso ponta a ponta** — superfície pública e o que ela não revela,
   as quatro proteções contra abuso (e qual não está no caminho usado), estados e a única transição
   possível com o mecanismo que a impõe, o que a aprovação executa e onde ela não é atômica, o que
   a recusa faz, e os três ganchos de notificação com destinatário derivado da matriz (§6).
9. **A independência entre os dois mecanismos de "solicitação"**, provada por tabelas, RPCs, áreas
   e arquivos disjuntos (§6.7).
10. **Como a matriz de permissões é editada e salva** — formulário por papel, checkbox por área
    agrupado, validação nos dois lados, e a diferença entre lote atômico (editar papel) e N
    operações (reatribuir pessoas) (§7.1).
11. **A classificação de contaminação** — 3 áreas de estrutura × 19 de negócio, os 4 pontos de
    entrada do vocabulário de BU, e as três listas do que copia / parametriza / redesenha (§8).

## Faltando

O que precisaria de segunda passada, com a **pergunta exata** a fazer:

1. **Configuração de produção do GoTrue.** *Pergunta:* no painel do Supabase (Authentication →
   Settings / Providers), quais são os valores reais de `JWT expiry`, rotação e reúso de refresh
   token, `Allow new users to sign up`, `Minimum password length`, `Password requirements` e os
   rate limits de login e de e-mail? — Nenhum deles é observável por SQL, e `config.toml` é
   intenção de dev local. Sem isso, "tempo de vida da sessão" fica com a medição indireta das 61
   sessões / 82 dias.
2. **Efeito da troca de senha sobre as outras sessões.** *Pergunta:* `auth.updateUser({password})`
   revoga os refresh tokens das demais sessões do mesmo usuário nesta configuração? — Determina se
   trocar a senha é um mecanismo de revogação ou só de credencial.
3. **Se o `postgres` do pooler já foi barrado na prática.** *Pergunta:* alguma migration ou script
   de seed chama uma RPC gated (direta ou indiretamente) esperando passar pelo caminho de
   superusuário? — A §9 prova que o caminho não existe para `postgres`; o que não foi varrido é se
   alguém depende dele hoje em `supabase/seed/` e nas 256 migrations.
4. **Quem e quando desativou o único usuário inativo.** *Pergunta:* aquela linha veio de
   `api_robo_registrar` (robô da API externa) ou de um `UPDATE` manual? — Muda se "desativação
   manual" é prática corrente ou se nunca aconteceu. A forma da linha (`ativo=false` **e**
   `role_id IS NULL`) é consistente com o robô, mas não há trilha que prove.
5. **Intenção sobre as duas roles de administrador pleno.** *Pergunta:* a role `Financeiro` deve
   mesmo ter `admin/acessos` (e ser equivalente a `Administrador`), ou isso é acúmulo histórico? —
   **É decisão de produto/segurança, não técnica**; quatro pessoas dependem da resposta.
6. **Destino do flag `auth_enforcement` e dos três objetos mortos.** *Pergunta:* `app.config
   .auth_enforcement` + `admin_set_enforcement` + `app.usuarios` + `app.convites` +
   `app.current_user_role()` devem ser removidos, ou algum deles é rede para um cenário previsto? —
   Também decisão do usuário: remoção é ato destrutivo, e a regra do projeto manda verificar
   consumidores reais em `src/` **e** em `supabase/seed/` antes (esta passada varreu o catálogo e
   `src/`, não o seed).
7. **Se a área `admin/uploads` de `admin/layout.tsx` é o baseline pretendido.** *Pergunta:*
   `requireArea(null)` em `/admin/*` (qualquer logado ativo) é intencional como piso, sabendo que
   uma tela nova sob `/admin` sem guard próprio herda só isso? — A §3.5 mede o fato; a intenção não
   está escrita.

## Barreiras com limite conhecido

Cada proteção que existe, e o que ela **não** cobre.

1. **Proxy de borda (`src/proxy.ts`)** — exige sessão em tudo que não esteja isento.
   *Não cobre:* **área**, por decisão de custo declarada no arquivo. Também não cobre nada sob os
   prefixos isentos (`logos/`, `fonts/`, `_next/`) — se algum dia nascer uma rota ali, ela sai da
   camada 1; e não cobre os 5 caminhos de autenticação própria, cuja proteção é inteiramente o
   handler.
2. **`getUser()` em vez do cookie** — valida o JWT contra o servidor de auth em cada checagem.
   *Não cobre:* mudança de permissão **dentro** do mesmo request (`getSessao` é `React.cache`, uma
   resolução por request), nem o que a UI já renderizou com as permissões anteriores.
3. **`requireArea` / `requireAreaApi` / `requireAreaAction`** — negam por redirect, `Response` e
   `throw`.
   *Não cobre:* **a si mesmos.** Não há verificação mecânica de que uma página, rota ou action nova
   os chame; e `requireAreaApi` devolve `Sessao | Response`, então **ignorar o retorno compila** —
   a proteção depende do chamador testar `instanceof Response`. Também não cobrem
   `src/lib/onboarding.ts`, que não chama guard nenhum.
4. **`app.exigir_acesso` em 175 de 263 funções** — a barreira real.
   *Não cobre:* as 88 sem gate (protegidas por `GRANT`, não por gate — se alguém conceder `EXECUTE`
   a `authenticated` numa delas, a proteção desaparece sem nenhum teste reprovar); não valida que a
   área pedida **exista** (chave digitada errado é indistinguível de não concedida); e **não
   registra a negação** em lugar nenhum.
5. **Bypass de `service_role`** — necessário para o Auth admin, o Storage e a fila de pedidos.
   *Não cobre:* nada. É total e não checa área (medido: passou pedindo `admin/acessos`). Toda a
   contenção é externa — `import 'server-only'` em `admin.ts`, o número pequeno de chamadores, e a
   disciplina de rodar as RPCs `admin_*` com o cliente de **sessão**. Vazar a chave anula as
   camadas 2, 3 e 4 de uma vez.
6. **RLS ligada em 66 tabelas** — nega por ausência de policy.
   *Não cobre:* nada de novo, porque não há `GRANT` para negar; e `relforcerowsecurity = false` em
   todas, então o **dono** (`postgres`) a ignora — que é exatamente como as RPCs `SECURITY DEFINER`
   leem os dados. É defesa redundante, não a defesa.
7. **A policy `rbac_usuarios_proprio_registro` + `GRANT SELECT` em `app.rbac_usuarios`**
   *Não cobre:* nada hoje — `app` não é exposto pelo PostgREST (`PGRST106`, medido). É defesa
   inerte que só acordaria se o schema fosse exposto.
8. **Schemas expostos limitados a `public` e `graphql_public`**
   *Não cobre:* as 263 funções de `public`, que é justamente a superfície. E o limite é
   configuração de painel, não do repositório — não há teste que reprove se alguém expuser `app`.
9. **Anti-enumeração em `/solicitar-acesso` e `/login`** — resposta sempre igual.
   *Não cobre:* canais laterais de tempo (o caminho que insere faz mais trabalho que o no-op), e
   nada impede descobrir por **volume** que o teto global de 5/minuto foi atingido. Também não
   cobre o caminho que o app usa de fato: `solicitar_acesso_admin` **não tem teto**.
10. **Teto de 5 solicitações/minuto em `solicitar_acesso`**
    *Não cobre:* (a) o caminho primário da tela, que é `solicitar_acesso_admin`, sem teto — o
    teto só entra no fallback; (b) atribuição, porque é **global** e não por IP nem por e-mail:
    5 pedidos de qualquer origem numa janela **recusam os pedidos legítimos de todos** naquele
    minuto; (c) ausência de CAPTCHA e de confirmação de posse do e-mail — um endereço de terceiro
    pode ser inscrito na fila.
11. **Dedup de solicitação (dois `NOT EXISTS`)** — evita pendente duplicado e pedido de quem já é
    usuário.
    *Não cobre:* corrida entre duas chamadas simultâneas, porque **não há `UNIQUE` em
    `rbac_solicitacoes.email`** — a garantia é o corpo da função, não o schema.
12. **Transição de estado só a partir de `pendente`** (`WHERE … AND status='pendente'`)
    *Não cobre:* a **atomicidade entre criar o usuário e decidir o pedido** — são duas transações
    (§6.4); a falha do segundo passo deixa usuário criado com pedido pendente, e o código trata
    isso reportando, não desfazendo.
13. **Portão de troca de senha obrigatória** (nos três guards)
    *Não cobre:* a **própria liberação.** `marcar_senha_trocada()` exige só `auth.uid() IS NOT
    NULL` — não chama `exigir_acesso` (logo **não checa `ativo`**) e **não prova que a senha
    mudou**. Um cliente autenticado pode chamá-la direto pelo PostgREST e apagar a obrigação sem
    trocar a senha provisória. Além disso `trocarSenha` não compara com a senha anterior (repetir a
    provisória é aceito) e não pede a senha atual.
14. **Anti-lockout** (`admin_atribuir_role`, `admin_atualizar_role`, `excluirUsuario`)
    *Não cobre:* lockout **coletivo**. Protege o administrador **de si mesmo**, não a organização:
    um admin pode remover `admin/acessos` de todos os **outros**, e nada exige que exista ao menos
    um portador da área. Hoje há duas roles administradoras plenas, o que dilui o risco por
    acidente, não por regra.
15. **`ROLE_EM_USO` em `admin_excluir_role`** — impede apagar papel com usuários.
    *Não cobre:* a FK `rbac_usuarios.role_id → rbac_roles(id)` **não tem `ON DELETE`**, então a
    integridade depende dessa checagem no corpo da função; um `DELETE` por SQL direto seria barrado
    pela FK, mas a mensagem amigável e a regra de negócio vivem só na RPC.
16. **`nextSeguro()`** — bloqueia open-redirect (não-relativo, `//`, `\`, `%2f`/`%5c`, `/auth`).
    *Não cobre:* redirecionamento **interno** para qualquer rota do app; é anti-exfiltração de
    sessão para fora, não controle de destino.
17. **Checagem de `Origin` no logout** — recusa POST cross-site.
    *Não cobre:* requisição **sem** header `Origin`, tolerada de propósito (form clássico
    same-origin). E só existe no logout: as Server Actions dependem da proteção nativa do Next.
18. **`import 'server-only'` em `admin.ts` e `pendencias.ts`** — falha o build se entrar em bundle
    de cliente.
    *Não cobre:* vazamento por outro caminho (log, mensagem de erro, variável de ambiente exposta
    com prefixo `NEXT_PUBLIC_`).
19. **Buckets privados + RLS sem policy + URL assinada de 60s**
    *Não cobre:* a URL assinada em si — ela é **capacidade ao portador**: dentro dos 60 segundos,
    quem tiver o link busca o arquivo sem sessão e sem permissão. E o acesso é feito com
    `service_role`, então a autorização real é o `requireAreaAction` da Server Action que a emitiu.
20. **Desativação honrada por `exigir_acesso`, `permissoes_de`, `tem_area`, `minha_role_id`,
    `get_minhas_permissoes`** — efeito imediato, na próxima RPC, mesmo com sessão viva.
    *Não cobre:* **a ação de desativar**, que não existe em RPC nem em UI (§4.4, §9). A barreira
    está construída e não tem gatilho na aplicação. E desativar **não** encerra a sessão — apenas
    faz toda RPC falhar; a pessoa continua navegando em telas degradadas (§5).
21. **Exclusão de usuário com `signOut(userId)` antes do `deleteUser`** — fecha a janela do JWT
    já emitido.
    *Não cobre:* o `signOut` é **best-effort** (`try/catch` que engole, `actions.ts:347`); se
    falhar, o `deleteUser` segue e a linha RBAC cai por CASCADE — o acesso morre em
    `USUARIO_INATIVO`, mas via caminho diferente do pretendido.
22. **Anti-flood do JWT: `statement_timeout` por papel** (`anon` 3s, `authenticated` 8s,
    `service_role` **0**)
    *Não cobre:* `service_role`, que não tem teto de tempo algum.
23. **Paridade banco↔código do catálogo de áreas** (caso de contrato)
    *Não cobre:* `rotulo`, `grupo`, `ordem` (só chaves são comparadas), e **pula silenciosamente
    sem credenciais** — mitigado, não resolvido, pela sonda `sonda-skipif-silencioso.test.ts`.
24. **Fail-closed de `parseRpc` e de `getSessao`** — erro vira "sem permissão", nunca "com
    permissão".
    *Não cobre:* **distinguir** falta de permissão de drift de contrato ou erro de transporte — os
    três colapsam em `null`, e o motivo fica só no log do servidor. É por isso que a §5 existe: a
    escolha segura na autorização produz a tela ambígua.
