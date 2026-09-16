# Levantamento as-built — Diário de alterações, auditoria e desfazer em lote

| | |
|---|---|
| **Data** | 2026-09-16 |
| **Commit de referência** | `62bd8b9` (`Merge pull request #273 from WT-Finance/feat/v5-11-0-estante-welcome`, 15/09 12:55) |
| **Produção** | v5.11.0 · última migration aplicada: `0271` |
| **Regime** | **SÓ-LEITURA.** Conexão direta (`SUPABASE_DB_URL`) aberta com `SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY`. Nenhuma escrita, nenhuma migration, nenhuma chamada a RPC de escrita, nenhum desfazer executado. |
| **Fonte de verdade** | Catálogo vivo (`pg_get_functiondef`, `pg_trigger`, `pg_proc`, `pg_class`, `pg_constraint`, `information_schema`) + código em disco. As migrations foram lidas como **história**, nunca como definição. |
| **Snapshot dos números** | `2026-09-16 13:30:18Z`, numa transação `READ ONLY REPEATABLE READ` (ver §1.6 — a base é viva e recebeu escritas durante o levantamento). |

## O que NÃO foi coberto, e por quê

1. **Comportamento executado do desfazer.** Nada foi revertido. As afirmações de comportamento vêm
   da leitura do corpo vivo + de **simulação read-only** do guard de conflito contra todos os lotes
   reais (§5.3). A prova executada permanente existe no repo e **não foi rodada** aqui:
   `src/lib/dre/reverter-diario.test.ts`.
2. **Telas de edição que consomem o desfazer** — fora do recorte por decisão do prompt. Entram só
   como inventário de chamadores (§8).
3. **`estante.*`** entrou em produção anteontem (v5.11.0, 15/09) e tem 1–4 linhas de diário. Os
   números dessas duas tabelas são reais mas estatisticamente vazios.
4. **Latência do desfazer** não foi medida (exigiria execução). O teto do papel `authenticated` é
   8 s (skill `banco-e-rpc` §3) e o maior lote real tem 145 entradas — não há medição de quanto
   custa reverter esse lote.

---

## 1. O registro

### 1.1 A tabela

`financeiro.diario_alteracoes` — schema `financeiro`, **não exposto** pelo PostgREST
(`supabase/config.toml:13` → `schemas = ["public", "graphql_public"]`).

| # | Coluna | Tipo | Nulo | Default |
|---|---|---|---|---|
| 1 | `id` | `bigint` | NO | `nextval('financeiro.diario_alteracoes_id_seq')` |
| 2 | `tabela_alvo` | `text` | NO | — |
| 3 | `operacao` | `character(1)` | NO | — |
| 4 | `registro_id` | `text` | NO | — |
| 5 | `dados_antes` | `jsonb` | YES | — |
| 6 | `dados_depois` | `jsonb` | YES | — |
| 7 | `usuario_id` | `uuid` | YES | — |
| 8 | `usuario_nome` | `text` | YES | — |
| 9 | `lote_id` | `bigint` | NO | — |
| 10 | `origem_undo` | `bigint` | YES | — |
| 11 | `criado_em` | `timestamptz` | NO | `now()` |

**Restrições (catálogo):**
- `diario_alteracoes_pkey` — `PRIMARY KEY (id)`
- `diario_alteracoes_operacao_check` — `CHECK (operacao = ANY (ARRAY['I','U','D']))`

**Não há FK alguma** — nem para a tabela alvo (é texto livre `'schema.tabela'`), nem para
`app.rbac_usuarios` (o autor é denormalizado), nem de `origem_undo` para `lote_id`. Isso é
deliberado: retenção total, sobrevive à exclusão do usuário e ao `DROP` da tabela auditada.

**Índices (4):**
- `diario_alteracoes_pkey` — único, `(id)`
- `idx_diario_tabela_criado` — `(tabela_alvo, criado_em DESC)` → o painel de histórico
- `idx_diario_lote` — `(lote_id)` → agrupamento por lote e o desfazer de lote
- `idx_diario_registro` — `(tabela_alvo, registro_id)` → histórico por linha

**Não existe índice em `origem_undo`** nem em `usuario_id`. Consequência: "todas as reversões de
tal usuário" é seq scan. Hoje irrelevante (3,7 MB), citado porque uma replicação com volume maior
sentiria.

**Tamanho em disco:** 3768 kB (total, com índices).

### 1.2 O que exatamente é congelado

**A LINHA INTEIRA, dos dois lados, não as colunas mudadas.** Corpo vivo de
`financeiro.fn_diario_alteracoes()`:

```
INSERT  → v_antes := NULL;           v_depois := to_jsonb(NEW)
UPDATE  → v_antes := to_jsonb(OLD);  v_depois := to_jsonb(NEW)
DELETE  → v_antes := to_jsonb(OLD);  v_depois := NULL
```

Nenhum diff é computado no banco. Um `UPDATE` que muda uma coluna de 15 grava as **15 colunas**
duas vezes. O diff campo-a-campo é construído na aplicação (§6.2) — e é por isso que §6.3 tem um
defeito: o banco não sabe quais campos importam.

| Operação | `dados_antes` | `dados_depois` | Como se distingue |
|---|---|---|---|
| Inserção | `NULL` | linha completa | `operacao = 'I'` |
| Atualização | linha completa (OLD) | linha completa (NEW) | `operacao = 'U'` |
| Exclusão | linha completa (OLD) | `NULL` | `operacao = 'D'` |

`registro_id` sai de `to_jsonb(NEW/OLD)->>'id'` — **texto**, para ser genérico sobre o tipo da PK.
Se a coluna `id` não existir, o gatilho levanta exceção legível em vez de estourar num `NOT NULL`:

```
RAISE EXCEPTION 'diario_alteracoes: tabela %.% sem coluna id — o trigger genérico exige PK "id".'
```

### 1.3 Quem escreve

**Só o gatilho.** Um único gatilho, uma única função de gatilho, replicada em 9 tabelas (§3).

- **Função:** `financeiro.fn_diario_alteracoes()` — `SECURITY DEFINER`, `SET search_path TO ''`,
  dono `postgres`. ACL: `{postgres=X/postgres}` — nenhum papel da API pode executá-la.
- **Momento:** `AFTER INSERT OR UPDATE OR DELETE`, **`FOR EACH ROW`**, em todas as 9.
  `AFTER` de propósito: captura o valor **final**, depois do gatilho `BEFORE` que carimba
  `atualizado_em`. `RETURN NULL` (retorno ignorado em AFTER).
- **`FOR EACH ROW`** é o que faz o lote existir: um `DELETE ... WHERE id = ANY(...)` de 128 linhas
  gera 128 entradas no mesmo lote.

**Nenhuma função de aplicação escreve no diário.** Nem as RPCs de salvar, nem o desfazer: o
desfazer escreve nas **tabelas alvo**, e é o mesmo gatilho que registra isso (§4.6).

**A imutabilidade é estrutural, não convencional** (medido no catálogo):
- `relrowsecurity = true`, `relforcerowsecurity = false`, **0 policies** → deny-all para
  não-donos;
- `relacl = {postgres=arwdDxtm/postgres}` → nenhum GRANT a `anon`, `authenticated` ou
  `service_role`;
- o schema `financeiro` não é exposto pelo PostgREST;
- o gatilho escreve **apesar** da RLS porque é `SECURITY DEFINER` com dono `postgres`.

Não existe caminho de `UPDATE` ou `DELETE` no diário a partir do app. **Nem pelo desfazer.**

### 1.4 Autor

`usuario_id := auth.uid()` e `usuario_nome` por lookup denormalizado:

```sql
SELECT u.nome INTO v_nome FROM app.rbac_usuarios u WHERE u.user_id = v_uid;
```

Sem linha → `NULL`, **sem falhar**. O nome é congelado no momento do fato (retenção total:
sobrevive à exclusão do usuário e a uma troca de nome).

**Sem sessão de usuário → `usuario_id` e `usuario_nome` ficam `NULL`.** `auth.uid()` devolve NULL
quando não há claims JWT: migration rodando como `postgres`, `npm run seed`, `pg_cron`, conexão
direta, ou `service_role` sem JWT de usuário.

**Medido: 100 das 4111 entradas (2,4%) têm `usuario_id IS NULL`**, e as mesmas 100 têm
`usuario_nome IS NULL`. Distribuição:

| Tabela | Entradas sem autor |
|---|---|
| `financeiro.dre_bloco` | 30 |
| `patrimonio.movimentacao` | 45 |
| `financeiro.dre_categoria_map` | 15 |
| `patrimonio.ativo` | 10 |

Zero em `analytics.gerencial_lancamentos` (3922 entradas, **todas** com autor) — porque ali toda
escrita passa por Server Action com cliente de sessão. As 100 sem autor vieram de migration
(§2.3) e do seed de `patrimonio`.

**Isto é um limite conhecido e não contornado:** o diário registra *que* mudou e *o que* mudou,
mas quando a escrita vem de credencial de serviço ele não sabe **quem**. Não há coluna de
"origem da escrita" (migration × tela × cron) — o NULL é o único sinal, e ele é ambíguo entre as
três.

### 1.5 `origem_undo` e o GUC

`origem_undo` é preenchido a partir de um GUC **transacional**:

```sql
v_undo bigint := nullif(current_setting('app.diario_undo_de', true), '')::bigint;
```

Quem o seta são as RPCs de desfazer, com `set_config(..., is_local := true)` — escopo de
transação, então nada vaza para a requisição seguinte. O `true` em `current_setting(..., true)` é
o modo "missing_ok": fora de um desfazer, devolve NULL em vez de erro.

### 1.6 Contagens vivas (snapshot `2026-09-16 13:30:18Z`)

| Medida | Valor |
|---|---|
| Entradas | **4 111** |
| Lotes distintos | **471** |
| Tabelas com dado no diário | **8** (das 9 sob o regime — ver §3.2) |
| Período coberto | `2026-07-23 20:28:52Z` → `2026-09-16 13:29:18Z` (~55 dias) |
| Entradas geradas por desfazer (`origem_undo IS NOT NULL`) | **15** |
| Lotes já desfeitos (`count(DISTINCT origem_undo)`) | **2** |
| Entradas sem autor | **100** |
| Lotes que tocam a mesma linha >1× | **1** (§2.2) |
| Lotes que abrangem mais de uma tabela | **13** |

Por tabela e operação:

| Tabela alvo | I | U | D | Total | Lotes |
|---|---:|---:|---:|---:|---:|
| `analytics.gerencial_lancamentos` | 1873 | 149 | 1900 | 3922 | 424 |
| `patrimonio.movimentacao` | 28 | 1 | 22 | 51 | 31 |
| `financeiro.dre_categoria_map` | 1 | 46 | 0 | 47 | 4 |
| `financeiro.dre_comp_par` | 0 | 37 | 0 | 37 | 4 |
| `financeiro.dre_bloco` | 0 | 29 | 1 | 30 | 3 |
| `patrimonio.ativo` | 10 | 4 | 4 | 18 | 16 |
| `estante.livro` | 1+ | 0 | 0 | ~4 | — |
| `estante.movimentacao` | 2 | 0 | 0 | 2 | 2 |
| `financeiro.dre_comp_bloco` | 0 | 0 | 0 | **0** | 0 |

> ⚠️ **Os números de `estante.*` e os totais gerais foram tirados em momentos diferentes e não
> fecham exatamente entre si.** A tabela acima vem da varredura por tabela/operação (≈13:26Z);
> o snapshot consolidado (4111/471) veio às 13:30Z. **A base é produção viva e recebeu escritas
> durante este levantamento** (4108 → 4111 em quatro minutos). Toda medição pontual aqui é um
> retrato, não um invariante: para a spec vale a **forma** da distribuição
> (`gerencial_lancamentos` é ~95% do volume; um lote anômalo; 2,4% sem autor), não o dígito.

**O perfil do volume é assimétrico e isso é estrutural, não acidente:** `gerencial_lancamentos`
concentra 95% das entradas porque a importação de planilha do Gerencial é um `DELETE` em massa
seguido de `INSERT` em massa — cada re-import grava ~2× o número de linhas da base. A base viva
tem **98 linhas**; o diário tem **3922 entradas** sobre ela.

### 1.7 Retenção

**Não existe expurgo.** Medido:

- nenhuma das **5 tarefas** de `cron.job` toca o diário (são 3 de ingestão Monde, 1 de
  reconciliação encadeada e 1 de CDI mensal — todas `net.http_post` para rotas do Next);
- nenhuma função do catálogo faz `DELETE`/`TRUNCATE` em `financeiro.diario_alteracoes`
  (a varredura de `pg_get_functiondef` por `diario_alteracoes` devolveu 16 funções, todas de
  leitura ou de reversão — §4.1);
- não há coluna de expurgo, nem índice de retenção, nem partição.

`docs/adr/0155-diario-alteracoes-undo-realtime-trava.md:36` declara isso como decisão:
**"Retenção total, sem expurgo (decisão do Yan)"**. Portanto o crescimento é monotônico e
proporcional ao volume de escrita — não ao tamanho da base. É o item de escala nº 1 de uma
replicação.

---

## 2. Lote

### 2.1 O que define um lote

`lote_id := txid_current()` — o **identificador de transação do Postgres**, capturado dentro do
gatilho.

A granularidade real que isso produz: **um lote = uma transação de banco**. Como o PostgREST
envolve cada chamada de RPC numa transação própria, na prática:

- uma chamada de RPC (um salvar, uma exclusão em massa, um import) = **um** lote;
- um clique de UI que dispare duas RPCs = **dois** lotes, sem nada que os ligue;
- uma migration inteira = **um** lote, por mais tabelas que ela toque;
- `npm run seed` = um lote por transação do seed.

Consequências medidas e verificáveis:

1. **O lote NÃO é por tabela.** 13 dos 471 lotes abrangem mais de uma `tabela_alvo`. As RPCs de
   histórico filtram por `tabela_alvo` (§6.1), então um lote multi-tabela **aparece parcialmente
   em cada painel**, com `n_linhas` contando só a parte visível daquele painel. Nenhum painel
   mostra o lote inteiro.
2. **O lote é "uma transação", não "uma intenção do usuário".** Não há campo de intenção, rótulo,
   motivo ou origem. A UI infere a natureza do lote a partir do conjunto de operações
   (`Inclusão`/`Edição`/`Exclusão`/`Alterações`/`Reversão`) — §6.2.
3. **`txid_current()` não é sequencial nem estável a longo prazo.** É um contador de transações do
   cluster: avança com qualquer escrita no banco, não só com as auditadas (por isso os lotes
   observados saltam de 43 618 para 182 206 em ~6 semanas). Sofre wraparound em 2³², e o tipo é
   `bigint` porque `txid_current()` devolve o valor com epoch. **Não é um identificador de
   domínio** — só um agrupador oportunista.
4. **`lote_id` viaja para o front como STRING**, nunca como number. `gerencial_historico_lotes`
   faz `d.lote_id::text AS lote_id`, e o comentário em
   `src/app/financeiro/fluxo-caixa/gerencial/actions.ts:242-244` explica: txid pode passar de 2⁵³
   e `Number()` perderia precisão; o PostgREST casta a string de volta para bigint no servidor.
   **Esta é a única defesa contra um desfazer aplicado no lote errado**, e ela é uma convenção de
   código, não uma restrição de banco.

### 2.2 A consulta central: quantos lotes tocam a mesma linha mais de uma vez

```sql
WITH dup AS (
  SELECT lote_id, tabela_alvo, registro_id, count(*) n
  FROM financeiro.diario_alteracoes GROUP BY 1,2,3 HAVING count(*) > 1)
SELECT count(DISTINCT lote_id) lotes_com_multitoque,
       count(*) linhas_multitoque, max(n) max_toques FROM dup;
```

**Resultado (snapshot 13:30:18Z):**

| lotes com multitoque | linhas multitoque | máximo de toques numa linha |
|---:|---:|---:|
| **1** | **5** | **2** |

**O único lote é `132178`.** Detalhe medido:

| | |
|---|---|
| `lote_id` | **132178** |
| Quando | `2026-08-19 18:03:47.479Z` |
| Autor | **nenhum** (`usuario_id IS NULL`) |
| Tabelas | `financeiro.dre_bloco` **e** `financeiro.dre_categoria_map` (lote multi-tabela) |
| Entradas | **43** — `dre_bloco`: 1 `D` + 27 `U`; `dre_categoria_map`: 15 `U` |
| Linhas distintas | **38** (23 em `dre_bloco` + 15 em `dre_categoria_map`) |
| Linhas tocadas 2× | **5** — `dre_bloco` ids 13, 14, 20, 25, 27, todas com o par `U`,`U` |

> **Nota de método.** Uma primeira contagem minha deu "36 linhas distintas" e divergia do header da
> `0268` ("43 toques para 38 linhas"). A causa era minha: `count(DISTINCT registro_id)` **colide
> ids entre tabelas diferentes** (id 20 existe nas duas). Contado por `(tabela_alvo, registro_id)`,
> são 38 — o header está certo. Numa replicação, a chave da linha auditada é o **par**
> `(tabela_alvo, registro_id)`, nunca `registro_id` sozinho; e é exatamente esse par que o
> `idx_diario_registro` indexa.

### 2.3 De onde veio o lote anômalo

**Da aplicação de uma migration.** As evidências convergem:

- autor NULL (migration roda como `postgres`, sem JWT — §1.4);
- 19/08/2026, tabelas `dre_bloco` + `dre_categoria_map`;
- a forma bate com `supabase/migrations/0251_dre_reestruturacao_resultado_financeiro.sql`
  (v5.7.0): **1 `DELETE` da linha do bloco `RFIN` + ~30 `UPDATE`s** em `dre_bloco` e
  `dre_categoria_map`. O header do arquivo declara "⛔ DESTRUTIVA — DELETE da linha do bloco
  `RFIN`" e o procedimento "COMO APLICAR (Yan, em TTY)";
- o header da `0268` nomeia esse lote diretamente: *"medido em produção em 09/09/2026: um único
  lote viola a premissa — `lote_id = 132178`, a aplicação da 0251, 43 toques para 38 linhas"*.

**A generalização que importa para a spec:** só migration produz multitoque hoje, e a razão é
estrutural, não sorte. As RPCs de salvar **recusam** payload com a mesma linha duas vezes
(`DRE_PAYLOAD_INVALIDO`, guard presente nas duas — `dre_estrutura_salvar` desde a `0268`,
`dre_comp_estrutura_salvar` desde a `0260`), e o import do Gerencial separa `DELETE` e `INSERT`
em transações distintas. Uma migration não passa por nenhuma RPC: ela toca as tabelas
diretamente, num único `BEGIN`, e nada a impede de tocar a mesma linha duas vezes.

Ou seja: **o caminho que gera o caso difícil é exatamente o caminho que nenhuma validação de
aplicação cobre.** Uma replicação que "resolva" o multitoque validando payload na API estará
protegendo o lado que já era seguro.

### 2.4 Distribuição de tamanho

Maior lote: **145 entradas** (`analytics.gerencial_lancamentos`, 04/09, autor Yan, só `I` — um
import de planilha). A cauda alta é toda de `gerencial_lancamentos` e toda de import: 145, 133,
129, 128, 126, 116, 115, 114, 111, 109… alternando lotes de `I` e lotes de `D` (o padrão
"apaga tudo e reinsere" do re-import).

Os lotes de estrutura da DRE são de ordem de grandeza menor (43, 37, 30…) e os de
`patrimonio`/`estante` são quase todos unitários.

---

## 3. Quem está sob o regime

### 3.1 Inventário (catálogo vivo, `pg_trigger`)

**9 tabelas**, todas com o mesmo gatilho `AFTER INSERT OR UPDATE OR DELETE ... FOR EACH ROW`,
todas habilitadas (`tgenabled = 'O'`):

| # | Tabela | Gatilho | Tem histórico/desfazer? |
|---|---|---|---|
| 1 | `analytics.gerencial_lancamentos` | `trg_diario_gerencial_lancamentos` | ✅ `gerencial_*` |
| 2 | `financeiro.dre_bloco` | `trg_diario_dre_bloco` | ✅ `dre_estrutura_*` |
| 3 | `financeiro.dre_categoria_map` | `trg_diario_dre_categoria_map` | ✅ `dre_estrutura_*` |
| 4 | `financeiro.dre_comp_bloco` | `trg_diario_dre_comp_bloco` | ✅ `dre_comp_estrutura_*` |
| 5 | `financeiro.dre_comp_par` | `trg_diario_dre_comp_par` | ✅ `dre_comp_estrutura_*` |
| 6 | `patrimonio.ativo` | `trg_diario_patrimonio_ativo` | ❌ **nenhum** |
| 7 | `patrimonio.movimentacao` | `trg_diario_patrimonio_movimentacao` | ❌ **nenhum** |
| 8 | `estante.livro` | `trg_diario_estante_livro` | ❌ **nenhum** |
| 9 | `estante.movimentacao` | `trg_diario_estante_movimentacao` | ❌ **nenhum** |

**Achado estrutural: o regime tem duas metades.** 5 tabelas têm auditoria e desfazer expostos;
**4 tabelas gravam diário que nenhuma tela lê e que nenhuma RPC reverte.** Para `patrimonio` e
`estante`, o diário é hoje **write-only**: 71 entradas gravadas, zero leitores, zero caminho de
reversão. Não é defeito — é um regime instalado à frente da UI que o consumiria. Mas é o dado
mais importante do §3 para uma spec: **o gatilho e o desfazer são desacoplados e adotados em
ritmos diferentes**.

### 3.2 `financeiro.dre_comp_bloco`: sob o regime, sem nenhum registro

Das 9, **8 têm dado** no diário. `dre_comp_bloco` tem o gatilho instalado e **zero entradas** —
porque a estrutura de competência é curada por migration e o editor só escreve em
`dre_comp_par` (`dre_comp_estrutura_salvar` faz `UPDATE financeiro.dre_comp_par`, nunca toca
`dre_comp_bloco`). É cobertura preventiva correta, e explica por que "tabelas sob o regime" (9) e
"tabelas com histórico" (8) são números diferentes: a diferença não é uma falha de cobertura.

### 3.3 Como a lista é decidida

**Lista aberta, por instalação manual de gatilho, uma migration por tabela.** Não há convenção de
nome, não há "todas as tabelas do schema X", não há tabela de registro. A pertinência ao regime
**é** a existência do gatilho — e o desfazer lê isso do catálogo em tempo de execução (§3.4), o
que torna a lista auto-consistente por construção: não existe uma segunda lista que possa
divergir da primeira.

O único requisito estrutural, declarado no corpo do gatilho: **a tabela precisa de uma coluna
`id`**, e (para ser revertível) esse `id` precisa castar para `bigint` (§4.9).

### 3.4 O que acontece quando a tabela não está na lista

`financeiro.reverter_diario` valida **allowlist estrutural fail-closed**, por entrada, contra o
catálogo:

```sql
v_rel := e.tabela_alvo::regclass;
IF NOT EXISTS (
  SELECT 1 FROM pg_catalog.pg_trigger t
  WHERE t.tgrelid = v_rel
    AND t.tgfoid  = 'financeiro.fn_diario_alteracoes()'::regprocedure
    AND NOT t.tgisinternal
) THEN
  RAISE EXCEPTION 'reverter_diario: a tabela % não está no regime do diário — reversão negada.', e.tabela_alvo;
END IF;
```

Dois efeitos, ambos importantes:

- **A exceção aborta o lote inteiro** (não pula a entrada). Uma tabela fora do regime no meio de
  um lote impede a reversão de tudo.
- **O cast `::regclass` é a defesa contra injeção.** `tabela_alvo` é texto livre que vai para
  `format('%s', v_rel)` em SQL dinâmico. O cast valida o identificador contra o catálogo *antes*:
  nome inexistente ou malicioso falha no cast, nunca vira SQL. A segurança aqui depende de
  `v_rel` (o `regclass`) ser o que entra no `format`, **não** a string original — e no corpo vivo
  é exatamente isso.

**O caminho realista para ver esse erro não é uma tabela nunca-registrada** (ela não teria
entradas), e sim **uma tabela cujo gatilho foi removido depois**: as entradas antigas sobrevivem
(sem FK, §1.1) e viram irrevertíveis em silêncio até alguém tentar. Sair do regime é retroativo.

### 3.5 Tabelas editáveis que deveriam estar e não estão

Pelo critério declarado ("tabela editável por humano pela UI"), estas ficam fora:

| Tabela | Editada por | Tem trilha própria? |
|---|---|---|
| `app.meta_setor` | `metas_upsert` | ✅ `app.meta_setor_historico` — **padrão paralelo** (§7.2) |
| `app.solicitacao` | RPCs de solicitação | ✅ colunas de decisão + projeção (§7.3) |
| `app.solicitacao_tipo` / `_campo` | `admin_solic_salvar_tipo` (`DELETE`+`INSERT` de todos os campos) | ❌ nenhuma |
| `financeiro.dim_conta_bancaria` | contas gerenciáveis (v4.21.0) | ❌ nenhuma |
| `financeiro.saldo_caixa` | edição de saldo | ❌ nenhuma |
| `app.rbac_*` | editor de roles/acessos | ❌ nenhuma |

Duas leituras, e a segunda é a que muda desenho:

1. `app.meta_setor` e `app.solicitacao` resolvem o mesmo problema com **gramáticas diferentes** —
   não estão "faltando", estão em outro regime (§7).
2. **`app.solicitacao_tipo`/`_campo` é o caso que mais pesa.** O editor de tipo faz `DELETE` +
   re-`INSERT` de **todos** os campos a cada edição, com `id` `IDENTITY` (nunca reusado). É
   precisamente o mecanismo que já produziu um defeito de produção (v5.9.1: `campo_id` órfão
   fazendo uma trava abrir onde devia fechar — skill `banco-e-rpc`, "Validar contra o TIPO").
   Uma tabela com esse padrão de escrita é a que mais se beneficiaria de diário, e é a que não
   tem.

---

## 4. Desfazer

### 4.1 Assinaturas e quem pode chamar

**Um núcleo, seis wrappers, três famílias.** 16 funções referenciam o diário no catálogo vivo.

| Função | Args | SECURITY DEFINER | ACL (catálogo) |
|---|---|:---:|---|
| `financeiro.reverter_diario` | `p_diario_ids bigint[]` | ✅ | **`{postgres=X/postgres}`** |
| `financeiro.fn_diario_alteracoes` | *(trigger)* | ✅ | `{postgres=X/postgres}` |
| `public.gerencial_desfazer_lote` | `p_lote bigint` | ✅ | `postgres, service_role, authenticated` |
| `public.gerencial_desfazer_linha` | `p_diario_id bigint` | ✅ | `postgres, service_role, authenticated` |
| `public.dre_estrutura_desfazer_lote` | `p_lote bigint` | ✅ | `postgres, service_role, authenticated` |
| `public.dre_estrutura_desfazer_linha` | `p_diario_id bigint` | ✅ | `postgres, service_role, authenticated` |
| `public.dre_comp_estrutura_desfazer_lote` | `p_lote bigint` | ✅ | `postgres, service_role, authenticated` |
| `public.dre_comp_estrutura_desfazer_linha` | `p_diario_id bigint` | ✅ | `postgres, service_role, authenticated` |
| `public.gerencial_historico_lotes` | `p_limit int, p_offset int` | ✅ | `postgres, service_role, authenticated` |
| `public.gerencial_historico_lote` | `p_lote bigint` | ✅ | `postgres, service_role, authenticated` |
| `public.dre_estrutura_historico_lotes` / `_lote` | idem | ✅ | `postgres, service_role, authenticated` |
| `public.dre_comp_estrutura_historico_lotes` / `_lote` | idem | ✅ | `postgres, service_role, authenticated` |
| `public.dre_estrutura_salvar` / `dre_comp_estrutura_salvar` | `p_maps jsonb, p_token timestamptz` | ✅ | `postgres, service_role, authenticated` |

**O núcleo é inalcançável de fora**, e isso está no catálogo, não só na intenção: `anon` não tem
execute em nada; `authenticated` **não** tem execute em `reverter_diario`; e o schema `financeiro`
não é exposto pelo PostgREST. Só os wrappers `SECURITY DEFINER` o chamam.

**Autorização, por wrapper** (medida no corpo vivo):

| Wrapper | Área exigida | Regra extra |
|---|---|---|
| `gerencial_desfazer_lote` | `financeiro/gerencial` | **`IF v_n > 1 OR v_autor IS DISTINCT FROM auth.uid()` → exige `admin/acessos`** |
| `gerencial_desfazer_linha` | `financeiro/gerencial` | `IF v_autor IS DISTINCT FROM auth.uid()` → `admin/acessos` |
| `dre_estrutura_desfazer_lote` / `_linha` | `financeiro/dre` | `IF v_autor IS DISTINCT FROM auth.uid()` → `admin/acessos` (**sem** regra de massa) |
| `dre_comp_estrutura_desfazer_lote` / `_linha` | `financeiro/dre` | idem |

A assimetria é deliberada e documentada em
`docs/adr/0156-...:62-64`: no Gerencial, lote>1 = import/exclusão em massa (exceção, exige admin);
na estrutura da DRE, **todo** salvar gera lote multi-linha (fluxo normal), então massa própria é
permitida.

Nota de segurança que sustenta as duas: `IS DISTINCT FROM` (não `<>`). Como `usuario_id` é anulável
(§1.4) e `auth.uid()` pode ser NULL, `<>` devolveria NULL e o `IF` **não dispararia** — o
`RAISE` de negação seria pulado. É o precedente de vazamento da v4.16.0 (skill `banco-e-rpc`,
"`coalesce(..., false)`"). Efeito colateral correto: **os 100 lotes sem autor exigem admin por
construção** (`NULL IS DISTINCT FROM uid` = true).

Os dois wrappers da estrutura da DRE adquirem ainda
`PERFORM pg_advisory_xact_lock(hashtext('financeiro.dre_estrutura_salvar'))` — a **mesma** trava
consultiva do salvar, para que um desfazer não corra em paralelo com um salvar (sem ela, o
`UPSERT` do salvar em curso sobrescreveria em silêncio a linha recém-revertida). O Gerencial
**não** tem trava equivalente — ele usa trava otimista por token na própria linha.

### 4.2 Ordem de processamento

**`ORDER BY id DESC`** — confirmado no **corpo vivo**, linha 75 do dump do catálogo:

```sql
FOR e IN
  SELECT * FROM financeiro.diario_alteracoes
  WHERE id = ANY(p_diario_ids)
  ORDER BY id DESC
LOOP
```

Desfaz do toque **mais recente para o mais antigo**. O porquê: numa cadeia de toques na mesma
linha dentro do lote, cada entrada encontra a linha exatamente como *ela* a deixou — o
`dados_depois` dela **é** o estado atual. Em ASC, a entrada mais antiga é conferida primeiro e
seu `dados_depois` guarda um estado **intermediário**, que não bate com o atual → conflito falso.

As três cadeias, como o header da `0268` as enumera:

```
U(A→B), U(B→C):  DESC → C≡C, volta a B; B≡B, volta a A.
I(→B),  U(B→C):  DESC → volta a B; depois DELETE.
U(A→B), D(B→):   DESC → reinsere B; depois volta a A.
```

Note que `id DESC` e não `criado_em DESC`: `criado_em` é `now()`, que é **constante dentro de uma
transação** — todas as entradas de um lote têm o mesmo `criado_em` (visível nos dados: as 10
entradas do lote 135598 compartilham `18:16:17.715Z`). Só a serial `id` ordena dentro do lote.
Um replicador que ordene por timestamp **não** obtém ordenação intra-lote.

### 4.3 Como o conflito é detectado

Contra o **estado atual da linha viva**, comparado com o `dados_depois` da entrada — ambos como
`jsonb`, **subtraindo as colunas voláteis**:

```sql
c_volateis CONSTANT text[] := ARRAY['atualizado_em'];
...
EXECUTE format('SELECT to_jsonb(t) FROM %s t WHERE t.id = $1', v_rel) INTO v_atual USING v_id;
...
ELSIF (v_atual - c_volateis) IS DISTINCT FROM (e.dados_depois - c_volateis) THEN
  RAISE EXCEPTION 'Conflito ao desfazer: a linha % foi alterada por outra pessoa depois ...', v_id;
```

- **Conta como divergência:** qualquer diferença em qualquer coluna que não seja `atualizado_em`.
  É comparação da **linha inteira**, não dos campos que o lote mudou. Uma coluna que o lote nem
  tocou, alterada por outra via, **reprova** a reversão.
- **Coluna ignorada:** exatamente uma, `atualizado_em`, declarada como **constante única no corpo**
  (`c_volateis`) — de propósito, para que a lista de "o que ignorar" não exista implícita e
  repetida nos dois ramos.
- **A comparação é `jsonb`, então é textual-por-tipo-jsonb**, não pelo tipo do Postgres. Numéricos
  com escala diferente (`10.0` × `10.00`) e timestamps com precisão diferente são **distintos**
  em `jsonb` ainda que iguais como `numeric`/`timestamptz`. Nenhuma evidência de que isso morda
  hoje (o `to_jsonb` dos dois lados sai do mesmo mecanismo), mas é fragilidade real de um
  replicador que gere `dados_depois` por outro caminho (ex.: serializador de aplicação).

Por que `atualizado_em` e só ela — a **segunda camada** do defeito, que não se vê raciocinando
sobre ordem: as três reversões deixam o carimbo avançar **de propósito** (o `SET` do ramo `U`
exclui a coluna e o gatilho `BEFORE` carimba `now()`; o `INSERT` do ramo `D` a exclui e o
`DEFAULT` carimba). Logo, no segundo passo de qualquer cadeia, a linha volta ao conteúdo certo
**com carimbo novo** — e comparar a linha inteira acusaria diferença.

**A regra que generaliza:** ao escrever um guard "a linha ainda está como eu a deixei?", pergunte
*o que a minha própria operação vai mudar nessa linha* e tire **só isso** da comparação. O que a
operação não toca fica dentro, senão o guard afrouxa. Medido no catálogo: `patrimonio.ativo` tem
`atualizado_por uuid` e ela **não** está em `c_volateis` — a reversão a restaura do snapshot, e
ela permanece dentro da comparação. Está certo: a reversão não a deixa avançar.

Também fora da comparação, por consequência: **`id` e `criado_em` não estão em `c_volateis`** e
não são voláteis — eles simplesmente não se restauram no ramo `U` (o `SET` os preserva da linha
viva). O corpo vivo carrega um comentário dizendo exatamente isso, para que ninguém funda as duas
listas.

### 4.4 Comportamento por tipo de operação

**Desfazer `I` (inserção) → `DELETE`:**
```
v_atual IS NULL                     → CONTINUE        (já removida por outra via; conta 0, sem erro)
(atual − volateis) ≠ (depois − vol) → RAISE conflito
senão                               → DELETE FROM <rel> WHERE id = $1 ; v_n += 1
```
É o **único ramo com caminho de "nada a fazer"**. Os outros dois tratam ausência/presença
inesperada como conflito.

**Desfazer `U` (atualização) → restaura `dados_antes`, por SQL dinâmico:**
```
v_atual IS NULL                     → RAISE 'a linha % não existe mais (foi excluída depois)'
(atual − volateis) ≠ (depois − vol) → RAISE conflito
senão                               → UPDATE <rel> t SET <lista> FROM jsonb_populate_record(NULL::<rel>, dados_antes) r WHERE t.id = $2
```
A lista de `SET` é montada do `information_schema` em tempo de execução:
```sql
WHERE c.table_schema = v_schema AND c.table_name = v_table
  AND c.column_name NOT IN ('id', 'criado_em', 'atualizado_em')
  AND c.is_generated = 'NEVER' AND c.is_identity = 'NO'
```
Se isso resultar vazio → `RAISE 'nenhuma coluna restaurável em %'`. Ou seja: restaura **todas** as
colunas de negócio, preserva `id`/`criado_em` da linha viva, deixa `atualizado_em` para o gatilho
`BEFORE`, e **ignora colunas geradas e identity por definição**.

**Desfazer `D` (exclusão) → reinsere `dados_antes`:**
```
v_atual IS NOT NULL → RAISE 'já existe uma linha com o id % (recriada depois)'
senão               → INSERT INTO <rel> (<cols>) SELECT <r.cols> FROM jsonb_populate_record(NULL::<rel>, dados_antes) r
```
Lista de colunas do `INSERT` — **diferente** da do `SET`, de propósito:
```sql
WHERE c.column_name <> 'atualizado_em'
  AND c.is_generated = 'NEVER' AND c.is_identity = 'NO'
```
Aqui `id` e `criado_em` **voltam do snapshot** (a linha é historicamente a mesma), e só
`atualizado_em` sai — para que um token de trava otimista antigo não volte a "bater" depois de um
ciclo excluir→desfazer, forçando quem via a linha antiga a recarregar.

### 4.5 Atomicidade

**Tudo-ou-nada, e por um mecanismo que não é código do desfazer.** Nenhuma das RPCs abre `BEGIN`:
elas rodam dentro da transação que o PostgREST abre por requisição. Um `RAISE EXCEPTION` em
qualquer entrada aborta **a transação inteira** — as reversões já aplicadas no mesmo laço somem,
o `set_config` local é descartado, e as entradas de diário que aquelas reversões geraram também
somem (eram escritas na mesma transação). Não existe reversão parcial, e não existe entrada de
diário órfã de uma reversão abortada.

Corolário que uma spec precisa afirmar: **`v_n` (o `revertidos` devolvido) só é observável em caso
de sucesso.** Em conflito, o chamador recebe erro, nunca uma contagem parcial.

### 4.6 O desfazer é registrado no diário?

**Sim, e pelo mesmo gatilho.** O desfazer escreve nas tabelas alvo → o gatilho dispara → novas
entradas. Nada é apagado, nada é marcado como desfeito: o diário é append-only inclusive quanto a
si mesmo.

**Como se distingue de uma alteração comum:** por `origem_undo`, carimbado via GUC transacional
que o wrapper seta antes de chamar o núcleo:

```sql
PERFORM set_config('app.diario_undo_de', p_lote::text, true);  -- is_local := true
SELECT financeiro.reverter_diario(...) INTO v_rev;
```

A leitura expõe isso como `bool_or(d.origem_undo IS NOT NULL) AS is_undo` por lote, e a UI o
rotula **"Reversão"** (§6.2).

**Gramática do registro de um desfazer:** as entradas novas trazem a operação **inversa**, não a
original. Medido nos dois desfazeres reais da base:

| Lote do undo | Reverteu | Entradas geradas | Operação registrada |
|---|---|---:|---|
| `135598` (20/08 18:16) | `135565` | 10 | **`I`** — o lote original era um `DELETE` de 10 linhas; a reversão reinseriu |
| `154212` (26/08 15:18) | `154211` | 5 | **`U`** — reversão de um lote de updates em `dre_comp_par` |

Atenção a um efeito contraintuitivo disso: **`operacoes` no painel descreve o que a reversão
*fez*, não o que ela *desfez*.** Um lote marcado "Reversão" com operações `['I']` desfez uma
exclusão. Quem leia o histórico sem o `is_undo` lê a história ao contrário.

**É possível desfazer um desfazer?** **Sim, por construção e sem caso especial.** O lote do undo é
um lote normal: tem `lote_id` próprio, aparece na listagem, e `desfazer_lote` aceita-o. As
permissões se aplicam como a qualquer lote (o autor do undo é quem o executou, então para ele é
"ação própria"). Não há limite de profundidade, nem detecção de ciclo, nem marca de "já
revertido". Medido: nenhuma entrada da base hoje reverte um lote que já era um undo
(`count(DISTINCT origem_undo)` = 2, ambos lotes comuns) — o caminho existe e nunca foi exercido.

### 4.7 O que o mecanismo não cobre — declarado

| Caso | O que acontece hoje | Evidência |
|---|---|---|
| **PK `IDENTITY` no ramo `D`** | **O `id` NÃO volta.** A lista do `INSERT` filtra `is_identity = 'NO'`, então em `patrimonio.ativo` (`integer` `IDENTITY ALWAYS`) e `patrimonio.movimentacao` (`bigint` `IDENTITY ALWAYS`) a linha restaurada **recebe um id novo**. Referências apontando para o id antigo ficam quebradas. Ver §4.8. | `information_schema`: `identity_generation = 'ALWAYS'` nas duas |
| **FK impedindo reinserção** | O `INSERT` do ramo `D` falha com violação de FK → aborta o lote. Há 5 FKs apontando para tabelas do regime; `estante.movimentacao → estante.livro` é `ON DELETE RESTRICT`, as outras 4 são `NO ACTION`. | `pg_constraint` |
| **Linha excluída por cascata** | Nenhuma FK do regime é `ON DELETE CASCADE`, então não há exclusão em cascata a auditar hoje. **Mas se houvesse**, o gatilho registraria as linhas filhas (é `FOR EACH ROW`, e cascata executa deleções reais) — no **mesmo** lote, já que é a mesma transação. A reversão em DESC reinseriria filho antes de pai se o id do filho fosse maior → violação de FK. **Não há tratamento de ordem topológica.** | `confdeltype` ∈ {`r`,`a`} nas 5 FKs |
| **Sequência não volta** | Reinserir com `id` explícito **não avança** a sequência. Inofensivo ao restaurar ids antigos (a sequência já passou deles), mas um replicador que reinsira ids **acima** do `last_value` cria colisão futura silenciosa. | comportamento do Postgres; defaults `nextval(...)` em 7 das 9 |
| **Coluna gerada** | Excluída das duas listas por `is_generated = 'NEVER'`. Nenhuma das 9 tabelas tem coluna gerada hoje. | `information_schema` |
| **Gatilho de outra natureza disparando de novo** | **Dispara, e é desejado em parte.** Em `analytics.gerencial_lancamentos` a reversão dispara também os 3 gatilhos `AFTER` de `fn_broadcast_gerencial()` (realtime) e o `BEFORE` de `fn_gerencial_lancamentos_atualizado()`. Efeito: a UI de outros usuários recebe o broadcast da reversão como se fosse edição — correto aqui. **Mas nada no mecanismo distingue um gatilho idempotente de um com efeito externo** (e-mail, cobrança). Reverter numa tabela com gatilho de efeito colateral **reexecuta o efeito**. | `pg_trigger` |
| **`registro_id` não-numérico** | `v_id := (e.registro_id)::bigint` → tabela com PK `uuid` ou `text` falha no cast, com erro de cast, não com mensagem de domínio. O comentário no corpo reconhece: *"Tabela futura com PK uuid exigirá revisitar este cast"*. | corpo vivo |
| **Tabela sem coluna `id`** | Barrada **na gravação**, não na reversão: o gatilho levanta exceção legível (§1.2). | corpo vivo |
| **`atualizado_em` sem `DEFAULT`** | Ver §4.8. | `information_schema` |
| **Conflito por terceiro entre leitura e reversão** | O guard compara dentro da transação da reversão, então não há janela TOCTOU *dentro* dela. Mas **não há trava pessimista na linha** no caminho do Gerencial: dois desfazeres concorrentes do mesmo lote serializam pelo lock de linha do `UPDATE`/`DELETE`, e o segundo verá o estado já revertido → **conflito**, não corrupção. As RPCs da DRE evitam isso com `pg_advisory_xact_lock`. | corpo vivo |

### 4.8 Dois achados do catálogo que o código não prevê

Ambos surgiram de cruzar o corpo vivo com `information_schema`, e **nenhum é alcançável hoje**
porque `patrimonio` não tem RPC de desfazer (§3.1). São dívidas armadas, não incidentes.

**(a) `patrimonio.*` perde o `id` ao desfazer uma exclusão.** O ramo `D` exclui colunas
`is_identity = 'YES'` do `INSERT`, e as duas PKs de `patrimonio` são `IDENTITY GENERATED ALWAYS`.
O comentário do corpo vivo afirma o contrário:

> `-- Desfazer DELETE = reinserir o "antes" com o MESMO id (preserva referências), SÓ se ...`

Para 7 das 9 tabelas isso é verdade (PK é `bigint DEFAULT nextval(...)`, que não é identity e
portanto entra na lista). Para as 2 de `patrimonio`, é falso: o id é regenerado, e
`patrimonio.movimentacao.ativo_id → patrimonio.ativo.id` (FK `NO ACTION`) passaria a apontar para
o nada. Há **4 entradas `D` reais** em `patrimonio.ativo` e **22** em `patrimonio.movimentacao`
esperando por isso. O filtro por identity está certo para `GENERATED ALWAYS` (um `INSERT`
explícito exigiria `OVERRIDING SYSTEM VALUE`); o que está errado é a **promessa** de preservar o
id.

**(b) `patrimonio.ativo.atualizado_em` volta NULL, não `now()`.** As duas listas excluem
`atualizado_em` confiando no `DEFAULT now()` para carimbar a restauração — o corpo vivo diz
*"atualizado_em NÃO volta do snapshot (DEFAULT now() carimba a restauração)"*. Medido:
`patrimonio.ativo.atualizado_em` tem **`column_default = NULL`** e a tabela **não tem gatilho
`BEFORE`** de carimbo. Logo o ramo `D` produziria `atualizado_em IS NULL`, e o ramo `U` deixaria
o valor **anterior intocado** — em ambos os casos, um token de trava otimista que a lógica
pretendia invalidar continua válido. Mapa medido:

| Tabela | `atualizado_em` | `DEFAULT` | Gatilho `BEFORE` de carimbo |
|---|---|---|---|
| `analytics.gerencial_lancamentos` | ✅ | `now()` | ✅ `fn_gerencial_lancamentos_atualizado()` |
| `financeiro.dre_bloco` / `dre_categoria_map` / `dre_comp_bloco` / `dre_comp_par` | ✅ | `now()` | ✅ `fn_dre_touch_atualizado_em()` |
| `estante.livro` | ✅ | `now()` | ❌ **nenhum** |
| `patrimonio.ativo` | ✅ | **nenhum** | ❌ **nenhum** |
| `estante.movimentacao` / `patrimonio.movimentacao` | ❌ não existe | — | — |

Duas consequências para a spec: (1) a lista de colunas voláteis é **global** enquanto o carimbo é
**por tabela** — em 3 das 9, `atualizado_em` não avança sozinho num `UPDATE`, então excluí-la da
comparação **afrouxa o guard** nessas tabelas (uma alteração de terceiro que só mexesse no
carimbo passaria batida; inofensivo hoje porque nada escreve só o carimbo); (2) "o DEFAULT
carimba" é premissa **não verificada** por nada — nem lint, nem teste, nem constraint.

### 4.9 Premissas estruturais, consolidadas

Uma tabela só é plenamente reversível se: tem coluna `id`; o `id` casta para `bigint`; o `id`
**não** é `IDENTITY`; tem `atualizado_em` com `DEFAULT now()` ou gatilho de carimbo; não tem
coluna gerada relevante; e não é destino de FK cujo pai possa ter sido excluído no mesmo lote.
**Nada verifica nenhuma dessas seis condições no momento de instalar o gatilho.** A allowlist de
§3.4 verifica pertinência ao regime, não aptidão à reversão.

---

## 5. O defeito conhecido — medido, não presumido

### 5.1 Qual é a ordem de processamento hoje?

**`ORDER BY id DESC`.** Lido no corpo vivo via `pg_get_functiondef` (§4.2), não na migration. A
correção **está aplicada em produção**.

### 5.2 A comparação de conflito ignora alguma coluna? Quais, e como a lista é declarada?

**Sim: uma — `atualizado_em`.** Declarada como constante única no `DECLARE` do corpo vivo:

```sql
c_volateis CONSTANT text[] := ARRAY['atualizado_em'];
```

Usada em dois pontos (ramos `I` e `U`) na forma
`(v_atual - c_volateis) IS DISTINCT FROM (e.dados_depois - c_volateis)`. O ramo `D` não compara
conteúdo (só presença), então não a usa. **Não** é a mesma lista das colunas excluídas do `SET` /
`INSERT` — o corpo vivo tem comentário explícito para não fundirem as três.

**Quanto essa exclusão muda de verdade, medido:** em **64** pares `(lote, linha)` o conteúdo vivo
é **idêntico** ao `dados_depois` **exceto** `atualizado_em`. Sem a subtração, esses 64 seriam
acusados como conflito. Com ela, passam.

### 5.3 Existe algum lote real que o desfazer atual NÃO conseguiria reverter?

**Sim — 184 dos 471 lotes.** E a razão **não é o defeito**: é conflito legítimo.

Simulei o guard em SQL read-only, replicando a lógica do corpo vivo: para cada
`(lote, tabela, linha)` tomei o **último** toque (`DISTINCT ON ... ORDER BY id DESC` — a primeira
entrada que o laço DESC confere), comparei com a linha viva subtraindo `atualizado_em`, e apliquei
os três ramos (`D` conflita se a linha existe; `I` com linha ausente é pulado; `U` com linha
ausente conflita).

| Medida (snapshot 13:30:18Z) | Lotes |
|---|---:|
| Total | **471** |
| Passariam o guard | **287** |
| **Conflitariam** | **184** |
| …dos 287, os que reverteriam **ZERO** linhas (todas as entradas puladas) | **110** |

Duas leituras, e as duas mexem em desenho:

1. **184 lotes (39%) são irrevertíveis**, porque as linhas mudaram depois — o guard funcionando
   como projetado. Em `gerencial_lancamentos`, 247 de 3922 linhas avaliadas conflitam. **Um diário
   de retenção total não é um histórico de reversão de retenção total:** a revertibilidade decai
   com o tempo, e nada na UI indica isso antes do clique.
2. **110 lotes (23%) "revertem" sem reverter nada.** São lotes de `INSERT` cujas linhas já foram
   apagadas por outra via — cada entrada cai no `CONTINUE` do ramo `I`, e a função devolve
   `revertidos: 0` **com sucesso**. É o efeito direto do padrão "apaga tudo e reinsere" do import
   do Gerencial. **O único ramo com caminho de sucesso-vazio é o `I`**, e é justamente o de 46% das
   entradas da base.

**O lote multitoque especificamente (`132178`):** sob DESC, as **5 linhas de toque duplo passam**
(`dre_bloco` 13, 14, 20, 25, 27 não aparecem no conjunto de conflito). O lote, ainda assim,
**conflita em 6 outras linhas** — `dre_bloco` id 5 e `dre_categoria_map` ids 20, 73, 121, 122, 123
—, alteradas por lotes posteriores (21/08 e 24/08). Ou seja: **o defeito está corrigido e o lote
segue irrevertível, por motivo diferente e legítimo.** Confundir as duas coisas levaria a
"reabrir" um defeito já fechado.

**Contraprova do defeito, nos mesmos dados.** Para as 5 linhas de toque duplo, tomei o **primeiro**
toque (o que ASC conferiria primeiro) e apliquei a mesma comparação:

| Linha (`dre_bloco`) | ASC acusaria conflito? | DESC acusa? |
|---|:---:|:---:|
| 13 | **sim** | não |
| 14 | **sim** | não |
| 20 | **sim** | não |
| 25 | **sim** | não |
| 27 | **sim** | não |

**5 de 5 sob ASC, 0 de 5 sob DESC**, sobre dado real e sem escrever nada. A camada (a) — ordem —
fica demonstrada. A camada (b) — coluna volátil — não é demonstrável assim, porque ela só se
manifesta **durante** a cadeia (o carimbo avança no passo anterior); o que se mede estaticamente é
o proxy dos 64 pares de §5.2, e a prova executada é o teste do repo.

### 5.4 Onde está a correção e o que mudou

- **Migration:** `supabase/migrations/0268_reverter_diario_desc_e_guard_caixa.sql` (v5.9.5,
  10/09/2026). Três `CREATE OR REPLACE`, mesmas assinaturas. Os corpos foram extraídos do
  **catálogo vivo**, não das migrations de origem (`0206`/`0208`/`0260`) — o header declara isso.
- **No código vivo:** `financeiro.reverter_diario(bigint[])`, duas mudanças e nada mais —
  (1) `ORDER BY id` → `ORDER BY id DESC`; (2) as duas comparações de conflito passam a subtrair
  `c_volateis`. Allowlist estrutural, ramos I/U/D, `origem_undo`, listas de `SET`/`INSERT` e
  `RETURN v_n` ficaram byte-a-byte.
- **O guard não afrouxou.** Alteração real de conteúdo por terceiro continua reprovando, com as
  mesmas três mensagens. Deixou de reprovar apenas linha idêntica com carimbo novo — que nunca foi
  conflito.
- **Duas mudanças no `0268` são de outra natureza** e não tocam o desfazer:
  `dre_estrutura_salvar` ganhou o guard de payload duplicado que a competência já tinha; e
  `dre_comp_estrutura_salvar` teve **só a justificativa** do guard reescrita — ele dizia proteger o
  desfazer, e depois da correção isso deixou de ser verdade (migration não passa pela RPC de
  salvar, então o guard nunca cobriu o caminho que quebrava o undo).
- **Prova permanente:** `src/lib/dre/reverter-diario.test.ts` (213 linhas) — escreve-e-reverte
  contra produção em `BEGIN … ROLLBACK`, com `lock_timeout`, `SAVEPOINT`, chave sintética
  `ZZ_TESTE_0268` e `describe.skipIf(!SUPABASE_DB_URL)`. **7 casos:** as 3 cadeias (`U→U`, `I→U`,
  `U→D`), conflito real de terceiro, atomicidade (uma linha em conflito não reverte nenhuma),
  caminho normal sem regressão, e um caso de **catálogo vivo** que reprova um `CREATE OR REPLACE`
  escrito a partir da `0206`. **Não foi executado neste levantamento.**
  Cobertura: exercita **uma** tabela (`financeiro.dre_bloco`, linha 28) — as outras 8 do regime
  não têm prova comportamental.

---

## 6. Auditoria derivada

### 6.1 O que lê o diário

Três pares de RPCs de leitura, um por família, **todas filtrando por `tabela_alvo`**:

| Par | Filtro de `tabela_alvo` | Área |
|---|---|---|
| `gerencial_historico_lotes` / `_lote` | `= 'analytics.gerencial_lancamentos'` | `financeiro/gerencial` |
| `dre_estrutura_historico_lotes` / `_lote` | `IN ('financeiro.dre_bloco','financeiro.dre_categoria_map')` | `financeiro/dre` |
| `dre_comp_estrutura_historico_lotes` / `_lote` | `IN ('financeiro.dre_comp_bloco','financeiro.dre_comp_par')` | `financeiro/dre` |

**Os filtros são listas literais no corpo de cada função** — a única parte do mecanismo que
carrega nome de tabela hardcoded (§10). As 4 tabelas de `patrimonio`/`estante` não têm par: seu
diário é ilegível pelo produto.

`_lotes` devolve a **listagem agregada por lote**, mais recentes primeiro:

```sql
d.lote_id::text, min(d.criado_em) AS criado_em,
max(d.usuario_id::text)::uuid AS usuario_id,      -- ver nota abaixo
max(d.usuario_nome) AS usuario_nome,
count(*) AS n_linhas,
array_agg(DISTINCT d.operacao ORDER BY d.operacao) AS operacoes,
bool_or(d.origem_undo IS NOT NULL) AS is_undo
GROUP BY d.lote_id ORDER BY min(d.criado_em) DESC
LIMIT LEAST(p_limit, 500) OFFSET GREATEST(p_offset, 0)
```

Detalhes que importam: `LEAST(p_limit, 500)` (teto de payload — `max_rows` do PostgREST é 1000) e
`GREATEST(p_offset, 0)`. E o `max(usuario_id::text)::uuid` em vez de `max(usuario_id)`: **o
Postgres não tem `max()`/`min()` para `uuid`**. Esse é o defeito de produção da v5.2.1 — a função
foi para produção com `max(usuario_id)` e o smoke por `db query` parou no gate de acesso sem
executar o corpo, então o erro só apareceu na tela do usuário (fix na `0203`).

**Verificado no catálogo vivo: o cast está nas SEIS funções que agregam autor** — as três
`*_historico_lotes` e os três `*_desfazer_lote`. Nenhuma usa a forma crua. O contorno é obrigatório
e fácil de perder de vista numa replicação: `max(uuid)` não existe, e o erro é de **runtime**, não
de compilação — uma função nova que agregue `usuario_id` direto passa por `CREATE`, passa por
introspecção, e só quebra na tela.

`_lote` devolve o **detalhe por entrada**: `id, operacao, registro_id, dados_antes, dados_depois,
usuario_nome, criado_em, origem_undo::text`, ordenado por `id` **ASC**. O par de `jsonb` **completo**
vai para o cliente — o diff é calculado no navegador.

### 6.2 Como uma alteração é apresentada

Componente único e compartilhado: `src/components/financeiro/gerencial/historico-alteracoes.tsx`
(310 linhas), parametrizado por `fetchers` + `camposDiff`. Usado pelo Gerencial e, via
`EstruturaShell`, pelas duas estruturas da DRE.

- **Lote** → rótulo derivado do conjunto de operações
  (`historico-alteracoes.tsx:57-62`):
  `{ I: 'inclusão', U: 'edição', D: 'exclusão' }`; um só tipo → capitalizado; **`is_undo` →
  `'Reversão'` (vence tudo)**; misto → `'Alterações'`.
- **Linha** → `resumoLinha()` (`:67-73`): campo principal por tentativa em cascata
  `d.pessoa ?? d.rotulo ?? d.nome ?? '#<registro_id>'`, mais `valor_final` formatado em BRL se
  existir. Lê de `dados_depois ?? dados_antes`.
- **Campos** → `diffCampos()` (`:80-86`): **só para `operacao === 'U'`**, e só dos campos
  declarados em `camposDiff`, filtrando os que **mudaram**
  (`String(a[campo] ?? '') !== String(b[campo] ?? '')`).

**Portanto: inclusão e exclusão NÃO têm diff.** Uma exclusão mostra só a linha de resumo (pessoa +
valor), embora o `dados_antes` completo esteja no payload. Para o incidente que originou o
mecanismo — alguém apagou toda a base — o painel mostra "Exclusão · 128 linhas" com um resumo por
linha, e o conteúdo apagado fica legível apenas via `dados_antes` cru, que a UI não renderiza.

### 6.3 Onde o rótulo legível é montado

**Na aplicação, integralmente.** O banco devolve `jsonb` cru e `operacao` como `'I'/'U'/'D'`;
nenhuma RPC traduz nada. Os dois catálogos de rótulos vivem no front:

```ts
// historico-alteracoes.tsx:89-97  — Gerencial (default)
CAMPOS_DIFF_GERENCIAL = [tipo→'Tipo', pessoa→'Pessoa', valor_final→'Valor' (R$),
  descricao→'Descrição', conta_previsao→'Conta', vencimento→'Vencimento' (data), destacado→'Destaque']

// estrutura-shell.tsx:33-39  — estrutura da DRE (caixa E competência)
CAMPOS_DIFF_ESTRUTURA = [bloco_chave→'Bloco', ordem→'Ordem', excluida→'Excluída',
  rotulo→'Rótulo', nota_estrela→'Nota']
```

**Achado: o diff da estrutura de COMPETÊNCIA não mostra o campo que muda.**
`estrutura-comp-shell.tsx` reusa `EstruturaShell` passando só `FETCHERS_COMPETENCIA`, portanto
herda `CAMPOS_DIFF_ESTRUTURA`. Mas a coluna de destino em `financeiro.dre_comp_par` é
**`sub_chave`**, não `bloco_chave` — medido no `information_schema`:

```
financeiro.dre_categoria_map → id, categoria_id, bloco_chave, ordem, nota_estrela, excluida, rotulo, atualizado_em
financeiro.dre_comp_par      → id, grupo_arquivo, descricao_arquivo, sub_chave, rotulo_linha, ordem, nota_estrela, excluida, atualizado_em
```

E `dre_comp_estrutura_salvar` faz `SET sub_chave = v_bloco`. Como `diffCampos` filtra por
`String(a['bloco_chave'] ?? '') !== String(b['bloco_chave'] ?? '')` → `'' !== ''` → **false**, o
campo é descartado. Consequência: mover uma linha de competência de um bloco para outro — a
alteração mais comum do editor — aparece no histórico **sem nenhum campo de diff**. Pior, o
resumo da linha também falha: `dre_comp_par` não tem `pessoa`, `rotulo` nem `nome` (tem
`rotulo_linha`), então `resumoLinha` cai no fallback **`#<id>`**. Um lote de competência se
apresenta como "Edição · #130", e nada mais. Existem **37 entradas** de `dre_comp_par` na base
nessa condição, incluindo as 5 de uma reversão real.

Isto é o custo direto de o diário gravar a linha inteira sem saber o que importa (§1.2): o
significado vive num mapa de campos no front, e **nada acopla esse mapa ao schema da tabela**.
Nenhum teste, nenhum lint, nenhum tipo. A divergência é invisível aos gates e só aparece na tela.

---

## 7. Relação com registros de evento de domínio

### 7.1 O inventário

Sim: existem **cinco** outros registros de "o que aconteceu", em **três gramáticas diferentes** do
diário.

| Registro | Forma | Quem escreve | Linhas |
|---|---|---|---:|
| `financeiro.diario_alteracoes` | tabela genérica, linha inteira antes/depois, lote | **gatilho** | 4111 |
| `app.meta_setor_historico` | tabela por entidade, valor novo **+ anterior** | **RPC** (`metas_upsert`) | 106 |
| `app.solicitacao` (colunas) + `public.solic_movimentacoes()` | **projeção** derivada de colunas de decisão | RPC de domínio | 123 solicitações |
| `estante.movimentacao` / `patrimonio.movimentacao` | **razão append-only** de domínio | RPC de domínio | 2 / 6 |
| `app.fatura_email` | log de envio externo | camada de e-mail | 22 |
| `app.api_chamada_log` | log de chamada da API externa | rota da API | 2 |
| `audit.ingestao_log` | log de execução de ingestão | pipeline de ingestão | 10 |

### 7.2 `app.meta_setor_historico` — a mesma pergunta, outra gramática

Colunas: `setor_macro_id, ano, mes, valor_meta, pct_receita, fonte, criado_em, alterado_em,
alterado_por, valor_anterior, pct_receita_anterior, motivo_alteracao`.

Escrito **explicitamente pela RPC**, não por gatilho, e **condicionalmente** (corpo vivo de
`metas_upsert`):

```sql
IF NOT coalesce(v_existe, false)
   OR v_old_valor IS DISTINCT FROM v_valor
   OR v_old_pct   IS DISTINCT FROM v_pct THEN
  INSERT INTO app.meta_setor_historico (..., alterado_por, valor_anterior, pct_receita_anterior, motivo_alteracao)
  VALUES (..., v_quem, v_old_valor, v_old_pct, NULL);
```

| | Diário | `meta_setor_historico` |
|---|---|---|
| Responde | "quem mudou **esta linha**, de quê para quê, e em que ação" | "como **esta meta** evoluiu no tempo" |
| Não responde | "qual a trajetória de um valor de negócio" (exige remontar N entradas) | "o que mais mudou junto" (não há lote) |
| Chave | `(tabela_alvo, registro_id)` | `(setor_macro_id, ano, mes)` |
| Granularidade | linha inteira, dois lados | só as colunas de negócio + anteriores |
| Lote | ✅ `txid_current()` | ❌ inexistente |
| Desfazer | ✅ | ❌ |
| Motivo | ❌ não existe | ✅ `motivo_alteracao` (**gravado sempre como NULL** hoje) |
| Cobre escrita fora da RPC | ✅ (é gatilho) | ❌ um `UPDATE` direto em `app.meta_setor` **não** gera histórico |

**A diferença decisiva é a última.** Gatilho captura *toda* escrita, inclusive migration e seed
(daí os 100 sem autor, §1.4). Trilha escrita pela RPC captura **só o caminho que passa pela RPC** —
e é justamente a migration, o caminho que escapa, que produziu o único lote difícil da base (§2.3).
Uma replicação que escolha "a aplicação registra" está escolhendo não ver as escritas
administrativas.

O inverso também vale: `meta_setor_historico` tem `motivo_alteracao`, e o diário **não tem onde
guardar intenção**. Um gatilho não sabe por que a escrita aconteceu.

### 7.3 `solic_movimentacoes()` — trilha sem tabela

Não é tabela: é **função `STABLE`** que projeta a trilha a partir de colunas de `app.solicitacao`
(`criado_em`/`solicitante_id`, `aprovado_em`/`aprovado_por`, `decidido_em`/`decidido_por` +
`justificativa`), com `UNION ALL` de três ramos — Abertura, Aprovação, Decisão terminal.

Duas notas que o corpo vivo documenta e que importam para a fronteira:

- a Aprovação é derivada de **`aprovado_em`, não do status** — "é por isso que ela continua
  aparecendo depois que a solicitação foi concluída";
- a Decisão terminal traduz status em verbo no banco
  (`concluida→'Conclusão'`, `rejeitada→'Rejeição'`, `cancelada→'Cancelamento'`, `ELSE 'Decisão'`).

Ou seja: aqui o **rótulo legível é montado no banco**, ao contrário do diário, onde é montado no
front (§6.3). Duas convenções opostas no mesmo produto.

**O que ela responde que o diário não:** a sequência canônica do ciclo de vida, em vocabulário de
negócio, sem depender de quantas vezes a linha foi tocada. **O que ela não responde:** qualquer
alteração de conteúdo (mudou a descrição? o anexo? a data-limite?) — nada disso deixa rastro, e
`app.solicitacao` não está sob o diário. Custo real: mudanças de conteúdo de uma solicitação são
**invisíveis** nas duas trilhas.

### 7.4 Sobreposição: as razões de domínio estão DENTRO do diário

O caso mais interessante do produto. `estante.movimentacao` e `patrimonio.movimentacao` são
**razões append-only de domínio** — os comentários vivos das tabelas dizem:

> `estante.movimentacao`: *"Append-only. Só `obs` é editável (diário da 0199). Erro se conserta com
> movimentação NOVA."*
> `patrimonio.movimentacao`: *"Razão APPEND-ONLY. Só obs é editável. A ORIGEM não é gravada: é o
> destino da movimentação anterior do mesmo ativo, derivada na leitura."*

E as duas **também têm o gatilho do diário**. Então um mesmo fato aparece duas vezes, em
gramáticas diferentes:

| | A razão de domínio | O diário sobre a razão |
|---|---|---|
| Uma movimentação registrada | 1 linha nova em `patrimonio.movimentacao` | 1 entrada `I` com a linha inteira |
| Uma correção de `obs` | **nada** (a razão não muda) | 1 entrada `U` com antes/depois |
| Um estorno | **movimentação nova** de sinal contrário | 1 entrada `I` |
| Uma exclusão indevida | a razão **perde** o fato | 1 entrada `D` que **preserva** o fato |

**A divisão de trabalho é limpa e vale copiar:** a razão de domínio responde *"qual é a história do
ativo"* (e por ser append-only, não precisa de undo); o diário responde *"quem mexeu no registro
da história"* — inclusive apagando. O diário é **meta** em relação à razão. É o que permite a
razão ser append-only sem virar imutável na prática: `obs` é editável, e quem a editou fica no
diário.

**Sobreposição com o Gerencial, ao contrário, é total e barulhenta:** `gerencial_lancamentos` não
tem razão de domínio, e o diário faz as duas funções — daí os 3922 registros para 98 linhas vivas.

### 7.5 Operações que cada um ignora

- **O diário registra e a trilha de domínio ignora:** `UPDATE` em coluna que o domínio considera
  imutável; `DELETE` (a razão só perde o fato); toda escrita administrativa (migration, seed,
  `service_role`); e a própria reversão.
- **A trilha de domínio registra e o diário ignora:** o **motivo** (`motivo_alteracao`,
  `motivo_baixa`, `justificativa`); a **intenção** em vocabulário de negócio ("Aprovação",
  "Cancelamento"); o **estado derivado** (a origem de uma movimentação, calculada na leitura);
  e **eventos sem linha** — `app.fatura_email` registra tentativa de envio com `modo`
  (teste/real), `sucesso` e `erro`; `audit.ingestao_log` registra execução com
  `registros_processados`. Nenhum deles é um `INSERT`/`UPDATE`/`DELETE` numa tabela auditada, então
  o diário é estruturalmente cego a eles.

**A fronteira que isto decide para a spec:** o diário é um mecanismo de **integridade de registro**
(quem tocou a linha, o que havia antes, como voltar). Não é um event log de domínio, e tentar
fazê-lo responder "o que aconteceu no negócio" custa exatamente o que custa hoje na competência
(§6.3): perguntar a um registro genérico um significado que ele não guarda.

---

## 8. Chamadores

Nenhuma chamada direta ao núcleo. Nenhuma chamada no seed. Todos os chamadores são **Server
Actions** (`'use server'`), e nenhuma API Route chama desfazer.

| Chamador (caminho:linha) | RPC | Passa | Barreira antes |
|---|---|---|---|
| `src/app/financeiro/fluxo-caixa/gerencial/actions.ts:279` | `gerencial_historico_lotes` | `p_limit`, `p_offset` | `requireAreaAction('financeiro/gerencial')` |
| `…gerencial/actions.ts:293` | `gerencial_historico_lote` | `p_lote` (**string**) | `requireAreaAction('financeiro/gerencial')` |
| `…gerencial/actions.ts:307` | `gerencial_desfazer_lote` | `p_lote` (**string**) | `requireAreaAction('financeiro/gerencial')` |
| `…gerencial/actions.ts:322` | `gerencial_desfazer_linha` | `p_diario_id` (**number**) | `requireAreaAction('financeiro/gerencial')` |
| `src/app/financeiro/dre/estrutura/actions.ts:71` | `dre_estrutura_historico_lotes` | `p_limit`, `p_offset` | `requireAreaAction('financeiro/dre')` |
| `…dre/estrutura/actions.ts:84` | `dre_estrutura_historico_lote` | `p_lote` (**string**) | `requireAreaAction('financeiro/dre')` |
| `…dre/estrutura/actions.ts:95` | `dre_estrutura_desfazer_lote` | `p_lote` (**string**) | `requireAreaAction('financeiro/dre')` |
| `…dre/estrutura/actions.ts:108` | `dre_estrutura_desfazer_linha` | `p_diario_id` (**number**) | `requireAreaAction('financeiro/dre')` |
| `src/app/financeiro/dre/estrutura-competencia/actions.ts:74` | `dre_comp_estrutura_historico_lotes` | `p_limit`, `p_offset` | `requireAreaAction('financeiro/dre')` |
| `…estrutura-competencia/actions.ts:87` | `dre_comp_estrutura_historico_lote` | `p_lote` (**string**) | `requireAreaAction('financeiro/dre')` |
| `…estrutura-competencia/actions.ts:98` | `dre_comp_estrutura_desfazer_lote` | `p_lote` (**string**) | `requireAreaAction('financeiro/dre')` |
| `…estrutura-competencia/actions.ts:111` | `dre_comp_estrutura_desfazer_linha` | `p_diario_id` (**number**) | `requireAreaAction('financeiro/dre')` |

Observações de contrato:

- **`lote_id` sempre string, `diario_id` sempre number.** O lote é txid (pode passar de 2⁵³); o id
  do diário é a serial da tabela (seguro em `number` por muito tempo). Assimetria deliberada, com
  comentário nos dois lados.
- **Nenhum chamador passa array.** O núcleo aceita `bigint[]`, mas os 6 wrappers montam o array
  eles mesmos (`array_agg` filtrado por lote + tabela). A superfície externa é "um lote" ou "uma
  entrada" — **nunca uma seleção arbitrária de entradas**. É o que impede um cliente de pedir a
  reversão de um conjunto que não corresponde a nenhuma ação real.
- **Dupla barreira, de propósito.** `requireAreaAction` é guard de superfície (UX); a autorização
  real é `app.exigir_acesso` **dentro** da RPC, com o cliente de **sessão** (`getServerClient`),
  não `service_role` — declarado em `gerencial/actions.ts:9-11`: *"cliente de SESSÃO … defesa em
  profundidade real. O guard de superfície continua antes, por UX."*
- **Tradução de erro no chamador.** `traduzirDesfazerErro()` converte `PERMISSAO_NEGADA` em texto
  de usuário; as três mensagens de conflito do banco já vêm em português e **passam cruas** para a
  tela.
- **Invalidação de cache** após desfazer: `revalidatePath` das rotas afetadas (Gerencial) /
  `revalidar()` + `router.refresh()` (DRE).
- **Contrato de tipos:** as 12 RPCs estão em `src/types/database.ts:253-297` (arquivo **gerado**),
  e `historicoLotesSchema` / `historicoEntradasSchema` (`src/lib/dre/schemas.ts:274`) validam o
  retorno via `parseRpc` nas duas famílias da DRE. **O Gerencial não valida**: faz cast direto
  (`data as HistoricoLote[] | null`), em `actions.ts:281` e `:295`.

---

## 9. Garantias e limites

Uma garantia por linha, com o que ela **não** cobre.

**Registro**

1. Registra toda escrita `I`/`U`/`D` nas 9 tabelas do regime, por linha — **mas** só nas 9; a
   entrada no regime é manual, uma migration por tabela, e nada audita quem ficou fora (§3.5).
2. Captura a linha **inteira** dos dois lados, então nenhum campo escapa — **mas** não sabe quais
   campos importam, e quem lê precisa de um mapa de campos que nada acopla ao schema (§6.3).
3. Registra o autor via `auth.uid()` + nome denormalizado que sobrevive à exclusão do usuário —
   **mas** fica `NULL` quando a escrita vem de credencial de serviço, migration ou cron (2,4% da
   base), e o `NULL` não distingue qual dos três foi.
4. É append-only por construção (RLS sem policy, ACL só `postgres`, schema não exposto) — **mas**
   o dono do banco (migration, `db query`, backup-gate) pode alterá-lo; a imutabilidade vale contra
   a aplicação, não contra o operador.
5. Retenção total, sem expurgo — **mas** cresce com o volume de escrita, não com o tamanho da base
   (3922 entradas para 98 linhas vivas), e não há partição, índice de retenção nem plano de
   arquivamento.
6. Sobrevive ao `DROP` da tabela auditada (não há FK) — **mas** as entradas viram irrevertíveis em
   silêncio, e nada sinaliza isso até alguém tentar desfazer (§3.4).
7. `AFTER` garante que o snapshot é o valor final, pós-`BEFORE` — **mas** por isso mesmo inclui
   carimbos que a reversão não restaura, o que obrigou a lista de colunas voláteis (§4.3).

**Lote**

8. Agrupa numa unidade tudo que uma transação escreveu, sem o cliente precisar coordenar —
   **mas** a unidade é "transação", não "intenção": um clique que dispare duas RPCs vira dois
   lotes sem nada que os ligue, e uma migration inteira vira um lote só.
9. O lote atravessa tabelas naturalmente (13 lotes reais fazem isso) — **mas** as RPCs de
   histórico filtram por `tabela_alvo`, então **nenhum painel mostra um lote multi-tabela
   inteiro**, e o `n_linhas` exibido é parcial.
10. `txid_current()` é gratuito e não exige coordenação — **mas** não é identificador de domínio:
    salta com escrita não-auditada, sofre wraparound, e passa de 2⁵³ (exige string no front, por
    convenção de código, não por restrição de banco).

**Desfazer**

11. Atomicidade tudo-ou-nada, inclusive das entradas de diário que a reversão gera — **mas** vem
    da transação do PostgREST, não de código próprio: um replicador que chame o núcleo fora de
    transação perde a garantia sem nenhum aviso.
12. Detecta conflito comparando a linha viva com o snapshot e **avisa em vez de forçar** — **mas**
    compara a linha **inteira**, então uma coluna que o lote nem tocou reprova a reversão; e a
    comparação é `jsonb`, sensível a representação (`10.0` ≠ `10.00`).
13. Ignora exatamente a coluna que a própria reversão altera (`atualizado_em`, constante única) —
    **mas** a lista é **global** e o carimbo é **por tabela**: em 3 das 9 o carimbo não avança
    sozinho, e ali a exclusão afrouxa o guard em vez de corrigi-lo (§4.8b).
14. Processa em `id DESC`, então cadeias de toques na mesma linha revertem corretamente (5/5 linhas
    reais passam; sob ASC, 0/5) — **mas** não há ordenação **topológica**: se um lote excluísse pai
    e filho, DESC não garante reinserir pai antes de filho, e a FK abortaria.
15. Reverte qualquer tabela do regime sem código por tabela (SQL dinâmico + `information_schema`) —
    **mas** exige seis premissas não verificadas em nenhum lugar (coluna `id`; castável a `bigint`;
    **não** `IDENTITY`; `atualizado_em` com default ou gatilho; sem coluna gerada relevante; sem FK
    de pai no mesmo lote). Duas tabelas do regime **já violam** a terceira (§4.8a).
16. Reinsere exclusão com o **mesmo id**, preservando referências — **mas** isso é falso para
    `patrimonio.ativo` e `patrimonio.movimentacao` (PK `IDENTITY ALWAYS` é filtrada do `INSERT` →
    id novo), e o comentário do corpo vivo afirma o contrário.
17. Reinserir com id explícito preserva a identidade histórica — **mas** não avança a sequência;
    restaurar ids antigos é inofensivo, restaurar ids acima do `last_value` cria colisão futura
    silenciosa.
18. Allowlist estrutural fail-closed: só reverte tabela com o gatilho anexado, e o `::regclass`
    valida o identificador antes de virar SQL dinâmico — **mas** a allowlist prova pertinência ao
    regime, **não aptidão à reversão** (§4.9); e uma tabela fora dela no meio do lote aborta tudo.
19. Toda reversão é auditada como escrita nova, carimbada com `origem_undo` — **mas** as entradas
    registram a operação **inversa**, então `operacoes` descreve o que a reversão fez, não o que
    desfez: quem lê sem olhar `is_undo` lê a história ao contrário.
20. Desfazer um desfazer funciona sem caso especial — **mas** não há limite de profundidade,
    detecção de ciclo nem marca de "já revertido"; o caminho nunca foi exercido em produção.
21. Autorização em profundidade: guard de superfície + `exigir_acesso` na RPC + cliente de sessão;
    massa e ação de terceiro escalam para admin, com `IS DISTINCT FROM` para NULL não vazar —
    **mas** a regra de massa existe só no Gerencial (assimetria deliberada, ADR-0156), e os 100
    lotes sem autor exigem admin como **efeito colateral** do NULL, não por decisão explícita.
22. O núcleo é inalcançável de fora (sem EXECUTE para `authenticated`, schema não exposto) e a
    superfície só aceita "um lote" ou "uma entrada", nunca conjunto arbitrário — **mas** o
    `p_diario_id` unitário não é validado contra a tabela da família além do filtro `IN (...)`: a
    proteção é o filtro literal em cada wrapper, então **cada wrapper novo tem de repeti-lo
    corretamente**.
23. Desfazer não corre em paralelo com salvar, nas duas estruturas da DRE
    (`pg_advisory_xact_lock`) — **mas** o Gerencial não tem trava equivalente (usa trava otimista
    por linha), então a proteção não é do mecanismo: é de cada família.
24. O guard funciona: 39% dos lotes reais (184/471) são corretamente recusados — **mas** isso
    revela que **a revertibilidade decai com o tempo** e nada na UI a antecipa; e 110 dos 287
    "revertíveis" reverteriam **zero** linhas, devolvendo sucesso com `revertidos: 0`.
25. Reverter dispara os demais gatilhos da tabela, mantendo derivados coerentes (realtime do
    Gerencial) — **mas** nada distingue gatilho idempotente de gatilho com efeito externo:
    numa tabela com efeito colateral, a reversão **reexecuta** o efeito.
26. Existe prova comportamental permanente, contra a base viva, em transação revertida
    (7 casos, incluindo um de catálogo vivo que reprova `REPLACE` da migration errada) — **mas**
    cobre **uma** das 9 tabelas (`financeiro.dre_bloco`), e se auto-pula sem `SUPABASE_DB_URL`,
    ficando **verde por ausência**.

**Auditoria**

27. Histórico legível por área, agrupado por lote, paginado com teto de payload — **mas** só
    para 5 das 9 tabelas; `patrimonio` e `estante` gravam diário que nenhuma tela lê.
28. Diff campo-a-campo com rótulos e formatação de domínio — **mas** só em `operacao = 'U'`:
    **inclusão e exclusão não têm diff**, exatamente o caso que originou o mecanismo (exclusão em
    massa), e o `dados_antes` completo chega ao cliente sem ser renderizado.
29. O componente de histórico é compartilhado entre as três famílias — **mas** o mapa de campos é
    do consumidor, e a competência herda o mapa do caixa: o campo que muda (`sub_chave`) não está
    nele, então o diff sai **vazio** e o resumo cai em `#<id>` (§6.3).

---

## 10. Contaminação de domínio

**Critério: um artefato está limpo se funciona sem conhecer o negócio deste produto.**

### Genérico — copia como está

| Artefato | Por que é limpo |
|---|---|
| `financeiro.diario_alteracoes` (estrutura) | Nenhuma coluna de negócio. `tabela_alvo`/`registro_id`/`jsonb` são universais. Só o **schema** (`financeiro`) é acidente histórico — a tabela não tem nada de financeiro. |
| `financeiro.fn_diario_alteracoes()` | Usa apenas `TG_*`, `to_jsonb`, `txid_current()`, um GUC e um lookup de nome. |
| Lote por `txid_current()` | Ideia inteiramente genérica. |
| `origem_undo` + GUC transacional | Padrão genérico para "esta escrita é consequência daquela ação". |
| `financeiro.reverter_diario(bigint[])` | O algoritmo (DESC, guard, três ramos, SQL dinâmico via `information_schema`, allowlist por gatilho) **não** menciona nenhuma tabela. É o artefato mais reaproveitável do conjunto. |
| Postura de segurança | RLS sem policy + ACL só `postgres` + schema não exposto + `SECURITY DEFINER` + `search_path = ''`. |
| `historico-alteracoes.tsx` (o componente) | Já parametrizado por `fetchers` + `camposDiff`. |

### Carrega vocabulário do produto — parametriza

| Artefato | O que está grudado | Como parametrizar |
|---|---|---|
| 6 RPCs de histórico | **Listas literais de `tabela_alvo`** no corpo (`= 'analytics.gerencial_lancamentos'`, `IN ('financeiro.dre_bloco', …)`) | Um par genérico `historico_lotes(p_tabelas text[], …)`, com a autorização derivada de um mapa tabela→área em vez de hardcoded |
| 6 RPCs de desfazer | Mesmas listas + área RBAC literal (`'financeiro/gerencial'`, `'financeiro/dre'`) + a regra de massa só no Gerencial | Mapa declarativo `tabela → {área, exige_admin_em_massa}`; hoje isso vive triplicado em plpgsql |
| `c_volateis = ARRAY['atualizado_em']` | Nome de coluna da convenção **deste** projeto | Por tabela, derivado do catálogo (quais colunas têm default/gatilho de carimbo) — resolveria §4.8b de passagem |
| `CAMPOS_DIFF_*`, `OP_LABEL`, `resumoLinha` | 100% vocabulário do produto (Pessoa, Valor, Vencimento, Bloco, Rótulo) | Já é prop; o que falta é **derivar/validar contra o schema** em vez de listar à mão |
| Exclusões `'id'`, `'criado_em'`, `'atualizado_em'` | Convenção de nomes deste projeto | Configuração do mecanismo, não literal no corpo |
| Mensagens de conflito | Português, tom de produto | Códigos de erro + tradução na borda (como `PERMISSAO_NEGADA` já é) |

### Redesenha

| O quê | Por quê |
|---|---|
| **A relação regime ⇄ desfazer** | Hoje instalar o gatilho é uma migration e ganhar histórico/desfazer são outras 4 funções copiadas. Resultado medido: 4 das 9 tabelas gravam diário que ninguém lê (§3.1). Uma replicação deve tornar "entrar no regime" **um ato só**, com o histórico caindo de graça. |
| **Aptidão à reversão** | As seis premissas de §4.9 não são verificadas em lugar nenhum, e duas tabelas já violam uma delas. Deveria ser uma checagem no momento de instalar o gatilho (ou um teste que varra o catálogo), não comentário no corpo. |
| **`registro_id::bigint`** | Amarra o mecanismo a PK numérica. `registro_id` já é `text`: bastaria comparar como texto (`t.id::text = $1`) para aceitar `uuid` — a `0206` optou por "erro claro aqui" em vez disso. |
| **O par lote/intenção** | `txid_current()` dá agrupamento grátis e **zero** intenção. Uma replicação deveria carregar um id de ação da aplicação ao lado do txid (e um campo de motivo), que é justamente o que `meta_setor_historico` tem e o diário não (§7.2). |
| **Diff no banco × no front** | Duas convenções opostas no mesmo produto: o diário monta rótulo no front, `solic_movimentacoes` no banco. Escolher uma; se ficar no front, **acoplar o mapa de campos ao schema** (§6.3 é o custo de não fazer). |

---

## 11. Divergências encontradas

| O que a documentação/ADR/comentário diz | O que o código/catálogo faz | Evidência |
|---|---|---|
| **Comentário vivo da tabela:** *"Desenho genérico …; nesta versão anexado só a `analytics.gerencial_lancamentos`"* | Anexado a **9 tabelas** em 5 schemas | `obj_description('financeiro.diario_alteracoes')` × `pg_trigger` (9 gatilhos). O comentário é de `0199` e nunca foi atualizado pelas `0206`/`0247`/`0260`/`0271` |
| **ADR-0155:19:** conflito é `to_jsonb(atual) IS DISTINCT FROM dados_depois` | Compara **subtraindo** `c_volateis`: `(v_atual - c_volateis) IS DISTINCT FROM (e.dados_depois - c_volateis)` | corpo vivo, ramos `I` e `U`. O ADR descreve o comportamento pré-`0268` |
| **ADR-0155:19 e comentário do ramo `D`:** *"reinsere o 'antes' (com o id original)"* / *"reinserir o 'antes' com o MESMO id (preserva referências)"* | Falso para `patrimonio.ativo` e `patrimonio.movimentacao`: PK `IDENTITY ALWAYS` é filtrada do `INSERT` (`is_identity = 'NO'`) → **id novo** | `information_schema.columns.identity_generation = 'ALWAYS'`; corpo vivo do ramo `D` |
| **Comentário do ramo `D`:** *"atualizado_em NÃO volta do snapshot (DEFAULT now() carimba a restauração)"* | `patrimonio.ativo.atualizado_em` **não tem default** e a tabela não tem gatilho de carimbo → volta `NULL` | `information_schema` (`column_default` nulo); `pg_trigger` (só o do diário) |
| **`0199`, seção 3:** *"AFTER … depois do trigger BEFORE que já setou `atualizado_em` (0094)"* — premissa geral do desenho | Só 5 das 9 tabelas têm gatilho `BEFORE` de carimbo (`gerencial_lancamentos` + 4 `dre_*`); `estante.livro`, `patrimonio.ativo` não têm; `estante.movimentacao` e `patrimonio.movimentacao` não têm a coluna | `pg_trigger` + `information_schema` |
| **`0200` (texto da migration):** `max(usuario_id)` cru em `gerencial_historico_lotes` e `gerencial_desfazer_lote` | O catálogo vivo usa `max(usuario_id::text)::uuid` nas **seis** funções que agregam autor — a `0203` é forward-fix sobre a `0200` já aplicada | dump do catálogo vivo, linhas 211, 439, 663, 269, 497, 719. **Sem divergência no comportamento vivo** — registrado porque ler a `0200` como definição atual induz ao erro (é exatamente a armadilha "catálogo vivo × migration de origem") |
| **`historico-alteracoes.tsx:66`:** *"tenta os campos comuns aos dois consumidores atuais (Gerencial: pessoa+valor_final; estrutura da DRE: rotulo/nome)"* | `dre_comp_par` tem `rotulo_linha`, não `rotulo`/`nome` → resumo cai em `#<id>`; e `CAMPOS_DIFF_ESTRUTURA` usa `bloco_chave`, mas a coluna de competência é `sub_chave` → **diff vazio** | `information_schema` (colunas de `dre_comp_par`) × `estrutura-shell.tsx:33-39` × `diffCampos` (`:80-86`) |
| **`0268` (header):** lote `132178` = *"43 toques para 38 linhas"* | **Confere** (1 `D` + 27 `U` em `dre_bloco` + 15 `U` em `dre_categoria_map` = 43; 23 + 15 = 38 linhas). Minha primeira contagem deu 36 por colidir `registro_id` entre tabelas | §2.2 — registrado porque a armadilha de contagem é reutilizável |
| **`0268` (header):** *"Chamadores vivos … `public.gerencial_desfazer_lote` (0203)"* | Correto quanto à função; a `0203` de fato reescreve `gerencial_desfazer_lote`. Sem divergência — anotado porque o par `0200`/`0203` pode induzir a ler o corpo da `0200` como atual | `grep -l "FUNCTION public.gerencial_desfazer_lote" supabase/migrations/` |
| **`0206` (declaração):** *"os wrappers `gerencial_desfazer_lote/linha` … seguem INTOCADOS"* | Verdadeiro na `0206` — mas `gerencial_desfazer_lote` **já havia sido** reescrito pela `0203`, três migrations antes | `0203_fix_historico_max_uuid.sql` |
| **ADR-0155:36:** *"Retenção total, sem expurgo"* | **Confere.** Nenhuma tarefa de `cron.job` toca o diário; nenhuma função faz `DELETE`/`TRUNCATE` nele | 5 jobs em `cron.job` (Monde ×4, CDI ×1); varredura de `pg_get_functiondef` |
| **CLAUDE.md / índice de memória:** *"`reverter_diario` robusto a múltiplos toques — 0268 APLICADA"* | **Confere.** `ORDER BY id DESC` e `c_volateis` estão no corpo vivo | dump do catálogo, linhas 56 e 75 |

---

## Reconstruível

Denso o bastante para virar spec **sem** este repositório:

- **A tabela do diário**, integralmente: 11 colunas com tipos/nulidade/defaults, 2 restrições, 4
  índices (e os dois que **não** existem), postura de segurança completa (RLS sem policy, ACL, não
  exposição do schema), ausência de FK e por quê.
- **O gatilho**, integralmente: função única `SECURITY DEFINER`/`search_path=''`, `AFTER … FOR EACH
  ROW`, os três ramos com o que cada um congela, a derivação de `registro_id`, a exceção de tabela
  sem `id`, o lookup denormalizado do autor e seu modo de falha (NULL sem erro), o GUC de
  `origem_undo`.
- **O lote**: definição por `txid_current()`, a granularidade real que isso produz, as quatro
  consequências (multi-tabela, ausência de intenção, instabilidade do txid, travessia como string).
- **O algoritmo de reversão**, reconstruível linha a linha: `ORDER BY id DESC` e por quê (com as
  três cadeias); allowlist estrutural por `pg_trigger` + `::regclass` como defesa de injeção; a
  comparação de conflito com a constante de voláteis; os três ramos com as **duas listas
  diferentes** de colunas (`SET` exclui `id`/`criado_em`/`atualizado_em`; `INSERT` exclui só
  `atualizado_em`) e o filtro `is_generated`/`is_identity`; atomicidade herdada da transação do
  PostgREST; `v_n` e o `CONTINUE` do ramo `I`.
- **O modelo de autorização**: núcleo sem EXECUTE para papéis de API, 6 wrappers com área + escalada
  a admin, a assimetria da regra de massa e seu porquê, `IS DISTINCT FROM` contra NULL, a trava
  consultiva nas duas famílias da DRE e sua ausência no Gerencial.
- **O regime**: as 9 tabelas, como a lista é decidida (instalação manual, sem convenção de nome),
  o que acontece fora da lista, e as **seis premissas** não verificadas de aptidão à reversão.
- **A auditoria derivada**: as 3 famílias de RPC de leitura com seus filtros literais, a forma
  agregada (`n_linhas`, `operacoes`, `is_undo`, tetos de paginação), o detalhe por entrada, e a
  montagem de rótulo/diff no front com seus dois catálogos de campos e a regra "diff só em `U`".
- **A fronteira com evento de domínio**: as três gramáticas (gatilho genérico × trilha por entidade
  escrita pela RPC × projeção derivada de colunas), qual pergunta cada uma responde e ignora, e o
  arranjo de `patrimonio`/`estante` (razão append-only **dentro** do diário) como o padrão limpo.
- **Os números de forma**: ~95% do volume numa tabela, 1 lote multitoque em 471, 2,4% sem autor,
  39% dos lotes irrevertíveis, 23% revertendo zero.
- **As 29 garantias com limite** do §9 e o mapa de contaminação do §10.

## Faltando

Com a pergunta exata:

1. **Comportamento real do ramo `D` em `patrimonio`.** A leitura do corpo + catálogo diz que o `id`
   é regenerado (§4.8a). → *Confirmado por execução em transação revertida?* Não testável sem
   escrever. Hoje inalcançável (não há RPC de desfazer para `patrimonio`), o que torna a dívida
   armada, não ativa.
2. **Latência.** → *Quanto custa `gerencial_desfazer_lote` no maior lote real (145 entradas), contra
   o teto de 8 s do papel `authenticated`?* Exigiria execução. O SQL dinâmico faz `EXECUTE` por
   entrada, e a consulta ao `information_schema` também é por entrada — sem cache no laço.
3. **A ordem em cascata.** → *Se um lote excluísse pai e filho com FK `ON DELETE CASCADE`, DESC
   reinseriria na ordem certa?* Nenhuma FK do regime é `CASCADE` hoje, então o caso não existe na
   base; a análise de §4.7 é dedutiva, não medida.
4. **Origem das 100 entradas sem autor.** Atribuí 30+15 ao lote `132178` (migration `0251`, com
   forte evidência) e o resto ao seed de `patrimonio`. → *As 45 de `patrimonio.movimentacao` e 10 de
   `patrimonio.ativo` vieram do seed da v5.6.0 ou de aplicação manual?* Não há coluna de origem —
   só o NULL, que é ambíguo entre migration, seed, cron e `service_role`.
5. **`estante.*`.** Entrou em produção em 15/09 com 1–4 linhas de diário. → *O padrão de uso
   confirma a intenção do gatilho, ou `estante` também vai ficar sem histórico/desfazer?* Volume
   insuficiente para medir.
6. **Se a divergência de `sub_chave`/`bloco_chave` (§6.3) é conhecida.** Encontrei o defeito por
   leitura cruzada. → *Está registrado em algum out-briefing da v5.8.x/v5.9.x como dívida
   consciente, ou é achado novo?* Não varri os out-briefings — fora do recorte deste levantamento.

## Garantias com limite conhecido — consolidado

As 29 do §9, na ordem em que uma spec as encontraria:

| # | Garantia | Limite |
|---|---|---|
| 1 | Registra toda escrita I/U/D nas tabelas do regime, por linha | Só nas 9 tabelas; entrada manual; nada audita quem ficou fora |
| 2 | Congela a linha inteira dos dois lados | Não sabe quais campos importam; o mapa de campos não é acoplado ao schema |
| 3 | Registra autor, com nome que sobrevive à exclusão do usuário | `NULL` em credencial de serviço/migration/cron (2,4%), e o NULL não distingue qual |
| 4 | Append-only por construção (RLS, ACL, schema não exposto) | Vale contra a aplicação, não contra o dono do banco |
| 5 | Retenção total, sem expurgo | Cresce com a escrita, não com a base (3922:98); sem partição nem arquivamento |
| 6 | Sobrevive ao `DROP` da tabela auditada | As entradas viram irrevertíveis em silêncio |
| 7 | `AFTER` captura o valor final | Por isso inclui carimbos que a reversão não restaura |
| 8 | Lote grátis, sem coordenação do cliente | É "transação", não "intenção": 2 RPCs = 2 lotes; 1 migration = 1 lote |
| 9 | O lote atravessa tabelas naturalmente | Nenhum painel mostra lote multi-tabela inteiro; `n_linhas` é parcial |
| 10 | `txid_current()` é gratuito | Não é id de domínio: salta, sofre wraparound, passa de 2⁵³ |
| 11 | Atomicidade tudo-ou-nada, inclusive do diário gerado | Vem da transação do PostgREST, não do código: chamar fora dela perde a garantia |
| 12 | Detecta conflito e avisa em vez de forçar | Compara a linha inteira; comparação `jsonb` é sensível a representação |
| 13 | Ignora exatamente a coluna que a própria reversão altera | Lista global, carimbo por tabela: em 3 das 9 **afrouxa** o guard |
| 14 | `id DESC` resolve cadeias na mesma linha (5/5 × 0/5 sob ASC) | Não é ordenação topológica: pai/filho com FK abortaria |
| 15 | Reverte qualquer tabela do regime sem código por tabela | Exige 6 premissas não verificadas; 2 tabelas já violam uma |
| 16 | Reinsere exclusão com o mesmo id, preservando referências | Falso em `patrimonio.*` (`IDENTITY ALWAYS` → id novo); o comentário afirma o contrário |
| 17 | Reinserção preserva a identidade histórica | Não avança a sequência: id acima do `last_value` cria colisão futura |
| 18 | Allowlist fail-closed + `::regclass` contra injeção | Prova pertinência ao regime, não aptidão à reversão; uma tabela fora aborta o lote |
| 19 | Toda reversão é auditada, carimbada com `origem_undo` | Registra a operação **inversa**: sem `is_undo`, a história se lê ao contrário |
| 20 | Desfazer um desfazer funciona sem caso especial | Sem limite de profundidade, sem detecção de ciclo; nunca exercido |
| 21 | Autorização em profundidade, com escalada a admin | Regra de massa só no Gerencial; lotes sem autor exigem admin por efeito colateral do NULL |
| 22 | Núcleo inalcançável; superfície aceita só lote ou entrada | A proteção é o filtro literal em cada wrapper — cada wrapper novo tem de repeti-lo |
| 23 | Desfazer não corre com salvar (advisory lock) | Só nas duas famílias da DRE; o Gerencial não tem equivalente |
| 24 | O guard funciona: 184/471 corretamente recusados | A revertibilidade **decai** e a UI não antecipa; 110/287 revertem zero com sucesso |
| 25 | Reverter dispara os demais gatilhos, mantendo derivados coerentes | Não distingue gatilho idempotente de gatilho com efeito externo |
| 26 | Prova comportamental permanente em transação revertida (7 casos) | Cobre 1 das 9 tabelas; auto-pula sem `SUPABASE_DB_URL` (verde por ausência) |
| 27 | Histórico legível por área, por lote, paginado | Só 5 das 9 tabelas; `patrimonio`/`estante` gravam sem leitor |
| 28 | Diff campo-a-campo com rótulo e formato de domínio | Só em `U`: inclusão e exclusão não têm diff — o caso que originou o mecanismo |
| 29 | Componente de histórico compartilhado | Competência herda o mapa do caixa: diff vazio e resumo `#<id>` |
