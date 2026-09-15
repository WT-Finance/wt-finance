# Levantamento as-built — Exposição a integrador externo

- **Data:** 2026-09-15
- **Commit de referência:** `62bd8b9` (merge do PR #273, v5.11.0, 15/09/2026 12:55 −03)
- **Método:** leitura do código vivo em `src/`, `supabase/migrations/` e consulta ao catálogo de
  **produção** por conexão direta somente-leitura (`SET SESSION CHARACTERISTICS AS TRANSACTION
  READ ONLY`), via `pg_get_functiondef`, `pg_indexes`, `pg_constraint`, `pg_proc`, `pg_policies`,
  `pg_roles`, `cron.job` e contagens nas tabelas `app.api_chave` / `app.api_chamada_log` /
  `app.solicitacao`.
- **Escrita neste levantamento:** nenhuma. Nenhum endpoint externo foi chamado com credencial
  real — a única chave viva é irrecuperável por construção (só o resumo está no banco).

## O que NÃO foi coberto, e por quê

| Fora | Motivo |
|---|---|
| O motor de Solicitações (tipos, campos, validação, snapshot, ciclo de vida, anexos, visibilidade) | Já levantado em módulo anterior. Aqui só o que muda de leitura vista do lado do transporte (§3, §7, §12). |
| Configuração de borda da Vercel (WAF, Firewall, limites de plano, região de função) | Não vive no repositório e não há CLI da Vercel instalado nesta máquina. `vercel.json` traz só `crons`; nenhuma regra de firewall versionada. **Consequência:** onde este documento diz "não existe limite de taxa", a afirmação vale para o repositório e o banco — uma regra de plataforma configurada pelo painel não seria visível daqui. |
| Comportamento sob carga / concorrência real | Nunca houve carga: 0 solicitações criadas por esta porta em produção (§0). A corrida de idempotência é descrita pelo mecanismo (índice único + captura de `unique_violation`), não por observação. |
| Logs de plataforma (Vercel Runtime Logs) | Sem acesso nesta sessão. O `console.error` das falhas best-effort (e-mail, auditoria) só é legível lá — ver §6. |

---

## 0. Advertência que orienta a leitura inteira

**Esta camada está construída e praticamente nunca foi exercitada.** Medição em 15/09/2026:

| Medida | Valor | Como foi medido |
|---|---|---|
| Chaves de API existentes | **1** (`plataforma = 'TARS'`, id 48, ativa, criada em 2026-07-31T20:39:34Z) | `select … from app.api_chave` |
| Chaves revogadas | 0 (a chave revogada anterior, id 47, foi apagada pela migration `0227_limpar_chave_tars.sql`) | idem + cabeçalho da migration |
| Linhas em `app.api_chamada_log` | **2** — ambas `status 401`, `detalhe 'auth_negada'`, `chave_id NULL`, em 2026-07-31T18:27Z e 2026-09-10T17:42Z | `select … from app.api_chamada_log` |
| Sequência do log | `last_value = 64` — ou seja, **62 linhas nasceram e foram apagadas** (limpeza de fixture da suíte + `0227`) | `app.api_chamada_log_id_seq` |
| Solicitações com `origem_chave_id IS NOT NULL` | **0** | `select count(*) from app.solicitacao where origem_chave_id is not null` |
| Tipos expostos via API | **1** — `abatimento_de_creditos` ("Abatimento de créditos") de 7 tipos cadastrados | `select … from app.solicitacao_tipo` |
| Último acesso do usuário-robô ao Auth | `last_sign_in_at = NULL` | `select … from auth.users` |

Nenhuma chamada **autenticada** jamais chegou desta porta em produção: as duas únicas linhas de log
são rejeições de autenticação (`chave_id NULL`). Toda afirmação abaixo marcada **[código]** vale por
leitura do código ou do catálogo; **[medido]** vale por observação do estado de produção; **[teste]**
vale por cobertura automatizada contra o banco de produção. Nada aqui é **[produção]** — nenhum
integrador real já usou esta superfície. O inventário explícito está em §11.

---

## 1. Credencial

### 1.1 Modelo

Tabela `app.api_chave` (migration `0211_api_chaves.sql`; colunas conferidas em
`pg_attribute`) — **[código]**:

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| `id` | `bigint` | não | identidade |
| `plataforma` | `text` | não | — (**UNIQUE**) |
| `segredo_hash` | `text` | não | — |
| `robo_user_id` | `uuid` | não | — (FK → `app.rbac_usuarios.user_id`) |
| `ativo` | `boolean` | não | `true` |
| `criado_em` | `timestamptz` | não | `now()` |
| `criado_por` | `uuid` | sim | — |
| `revogado_em` | `timestamptz` | sim | — |
| `revogado_por` | `uuid` | sim | — |

Os `attnum` 4, 5 e 6 estão vagos no catálogo: são as colunas `callback_url`, `callback_segredo` e
`whitelist_tipos`, dropadas por `0223` e `0226` — o buraco na numeração é a prova física da
remoção. **[medido]**

Índices: `api_chave_pkey`, `api_chave_plataforma_key` (UNIQUE em `plataforma`) e
`idx_api_chave_segredo_hash_ativo` — **índice parcial** `btree (segredo_hash) WHERE ativo`. É por ele
que a resolução acontece; a cláusula parcial significa que **chave revogada nem entra no índice**.
**[código]**

RLS está **ligada** nas duas tabelas (`relrowsecurity = true`) e **não há nenhuma policy**
(`pg_policies` devolve 0 linhas). Não há `GRANT` para `anon`, `authenticated` nem `service_role` —
só o dono `postgres` aparece no `relacl`. Consequência: **as tabelas são inalcançáveis por
PostgREST em qualquer papel**; todo acesso passa por função `SECURITY DEFINER`. **[medido]**

### 1.2 Estados e transições

Uma chave tem **dois estados na vida**: criada e revogada. Não existe "editar" nem "reativar" —
`api_chave_atualizar` foi dropada na `0224` e não existe no catálogo hoje
(`select proname from pg_proc where proname='api_chave_atualizar'` → 0 linhas). **[medido]**

```
(não existe) --criarChaveApi--> ativo=true, revogado_em=NULL
                                      |
                                      | api_chave_revogar
                                      v
                                ativo=false, revogado_em=now(), revogado_por=uid
                                      |
                                      X  (sem caminho de volta pela aplicação)
```

O **único** caminho de volta é `UPDATE app.api_chave SET ativo = true` por SQL direto — que a suíte
de contrato usa como fixture (`src/lib/api-externa/contrato-api-externa.test.ts:573,580`), e que
nenhuma função exposta oferece. É irreversibilidade **por ausência de superfície**, não por
constraint. **[código]**

### 1.3 Geração e armazenamento do segredo

`src/lib/api-externa/segredo.ts` — **[código]**:

- Formato: prefixo fixo `jns_` + `randomBytes(20).toString('hex')` → 40 caracteres hexadecimais,
  **44 caracteres no total**, 160 bits de entropia (`segredo.ts:18-24`).
- Armazenamento: **só o resumo**. `hashSegredo` = `createHash('sha256').update(s,'utf8').digest('hex')`
  (`segredo.ts:27-29`). **Sem sal, sem alongamento de chave (KDF), sem trabalho** — é um SHA-256
  simples. Isso é aceitável **apenas** porque o segredo é aleatório de 160 bits e não escolhido por
  humano: não há dicionário a percorrer. Se um dia a plataforma aceitar segredo fornecido pelo
  integrador, este desenho passa a ser vulnerável a tabela pré-computada.
- **Não há prefixo pesquisável.** O `jns_` é literal e igual em todas as chaves; a coluna guarda o
  SHA-256 do segredo *inteiro*, prefixo incluído. Não existe coluna de "últimos 4", "dica" ou
  identificador parcial — **não dá para dizer, olhando o banco, qual segredo pertence a qual
  chave** senão pelo `id`/`plataforma`. Um segredo vazado encontrado num log de terceiro só pode
  ser atribuído a uma chave recalculando o SHA-256 e comparando.
- **Exibição única.** `criarChaveApi` devolve `{ ok:true, segredo, plataforma }`
  (`src/app/admin/api-externa/actions.ts:120`) e o modal mostra o valor em claro uma vez, com botão
  de copiar (`src/components/admin/api-externa/modal-criar-chave.tsx:49,55-66`). Fechou o modal,
  acabou: não há "ver de novo" nem "redefinir". Perdeu → revoga e cria outra.

### 1.4 Quem cria e revoga, por qual barreira

Três barreiras em série, **todas** para a mesma área RBAC `solicitacoes`: **[código]**

1. **Rota/página** — `requireArea('solicitacoes')` em `src/app/admin/api-externa/page.tsx:25`.
2. **Server Action** — `requireAreaAction('solicitacoes')` em `actions.ts:75` (criar) e `:124`
   (revogar).
3. **Banco** — `PERFORM app.exigir_acesso(ARRAY['solicitacoes'])` dentro de
   `api_chave_registrar`, `api_chave_revogar`, `api_robo_registrar`, `api_chave_listar`,
   `api_log_listar` e `admin_solic_tipo_api_config` (todas `SECURITY DEFINER`, `search_path=''`,
   conferidas por `pg_get_functiondef`).

A terceira é a que vale: as Server Actions chamam as RPCs com o **cliente de sessão**
(`rpcSessao`, `actions.ts:21-24`), não com o service role, justamente para que o banco revalide o
chamador. O `getAdminClient()` (service role) só é usado no Auth — criar e apagar o usuário-robô
(`actions.ts:84,100,115`). **[código]**

ACL das RPCs administrativas (`aclexplode(p.proacl)`): `postgres`, `service_role` **e**
`authenticated` para `api_chave_listar`, `api_chave_revogar`, `api_log_listar`; apenas `postgres` e
`service_role` para `api_chave_resolver` e `api_chamada_registrar`. `anon` não tem `EXECUTE` em
nenhuma delas. **[medido]**

### 1.5 Rotação, validade, escopo, alcance por recurso

- **Rotação: não existe.** Nenhuma RPC gera segredo novo para uma chave existente. A rotação
  operacional é: criar chave nova → trocar no integrador → revogar a antiga. Mas o
  `plataforma` é **UNIQUE**, então a chave nova precisa de outro nome (`'TARS'` e `'TARS 2'`), ou
  a antiga precisa ser **apagada** do banco — que foi exatamente o que a
  `0227_limpar_chave_tars.sql` teve de fazer, por migration destrutiva com confirmação humana,
  para liberar o nome. **A rotação sem janela de sobreposição não é suportada por desenho.**
- **Validade: não existe.** Não há `expira_em`. Uma chave vive até ser revogada à mão.
- **Escopo por integrador: não existe.** A whitelist de tipos por chave foi removida (`0224`
  aditiva + `0226` destrutiva). O comentário vive no próprio corpo de `solic_tipos_api`: *"A chave
  ainda é validada (precisa existir e estar ativa) — o que saiu foi a restrição POR TIPO: toda
  chave alcança todo tipo exposto."* **Toda chave ativa alcança todos os tipos expostos e todas as
  equipes cadastradas.** O único controle de alcance que resta é o interruptor
  `app.solicitacao_tipo.exposto_via_api`, que é **global, não por chave**.
- **Alcance por recurso (leitura/cancelamento):** existe e é forte — `origem_chave_id = p_chave_id`
  no `WHERE` de `consultar_solicitacoes_externas` e de `cancelar_solicitacao_externa`. Uma chave
  só enxerga e só cancela o que ela própria criou. **[código, teste]**

### 1.6 O que a revogação faz imediatamente, e o que não faz

`api_chave_revogar` (corpo conferido no catálogo) faz **exatamente três coisas**: `ativo=false`,
`revogado_em=now()`, `revogado_por=app.uid_jwt()`. **[código]**

**Imediato:** a próxima chamada falha. `api_chave_resolver` filtra `WHERE segredo_hash = $1 AND
ativo` e devolve `NULL`; `autenticarChamada` traduz `NULL` em `401 AUTH_INVALIDA`
(`http.ts:66-70`). As três RPCs de negócio repetem a checagem por conta própria (`PERFORM 1 FROM
app.api_chave WHERE id = p_chave_id AND ativo` → `CHAVE_INVALIDA`, `ERRCODE 42501`), então nem um
`chave_id` obtido antes da revogação serve. Não há cache em lugar nenhum — cada chamada re-resolve
contra o banco. **Não há janela.** **[código, teste]**

**O que a revogação NÃO faz:**

1. **Não cancela nada.** As solicitações já criadas por aquela chave continuam abertas e seguem o
   fluxo humano normalmente.
2. **Não apaga o log**, nem o vínculo: `api_chamada_log.chave_id` tem FK para `api_chave(id)` sem
   `ON DELETE`, então a chave revogada continua existindo e sustentando o histórico.
3. **Não desativa o usuário-robô** — ele já nasce `ativo=false` (§7), então não há o que desativar.
4. **Não libera o nome.** `plataforma` é UNIQUE e a linha revogada continua ocupando-o. Ver §1.5.
5. **Não avisa ninguém.** Não há e-mail, alerta ou webhook de revogação — nem para o integrador
   (que não é chamado por nada, §8), nem para administradores.
6. **Não torna as solicitações daquela chave invisíveis nem inconsultáveis para sempre** — se a
   chave fosse reativada por SQL direto, a consulta voltaria a enxergá-las.

---

## 2. Autenticação da chamada

### 2.1 Onde viaja e como é resolvida

- **Cabeçalho:** `x-api-key`, nome exato, lido com `req.headers.get('x-api-key')` e `.trim()`
  (`src/lib/api-externa/http.ts:60`). Não há suporte a `Authorization: Bearer`, nem a
  parâmetro de query, nem a corpo. Cabeçalho ausente ou vazio → `401 AUTH_AUSENTE`
  (`http.ts:61-63`).
- **Resolução:** SHA-256 do token → `api_chave_resolver(p_segredo_hash)` via
  `chamarRpcExterna` (`http.ts:65-67`), que usa `getAdminClient()` — **cliente `service_role`**
  (`http.ts:16-19`). Ou seja: a decisão de autenticação é tomada com a credencial mais poderosa
  do sistema. Não é um defeito por si (a RPC é `STABLE`, só lê e só devolve `id`/`plataforma`/
  `robo_user_id`), mas é a peça que faz a superfície inteira depender de `SUPABASE_SERVICE_ROLE_KEY`
  estar presente no ambiente da função.
- **Camada onde a decisão é tomada:** dentro de **cada `route.ts`**, na primeira linha do handler.
  Não há middleware, não há wrapper, não há decorator. Os quatro handlers começam com
  `const auth = await autenticarChamada(req); if (!auth.ok) { … }` —
  `solicitacoes/route.ts:135,174`; `solicitacoes/[id]/route.ts:20`;
  `solicitacoes/[id]/cancelar/route.ts:67`; `tipos/route.ts:15`. **É convenção, não enforcement.**

### 2.2 Resistência a análise de tempo

Não há comparação byte-a-byte de segredo em código. O que existe é uma **busca por igualdade de
resumo** num índice B-tree (`WHERE segredo_hash = $1 AND ativo`). O comentário longo em
`http.ts:43-58` explica o raciocínio: o vetor clássico de tempo explora a diferença entre uma
comparação "quase certa" e uma "totalmente errada", e o SHA-256 não é invertível — o efeito
avalanche faz um bit diferente produzir um resumo completamente diferente, de modo que o tempo da
consulta não carrega informação sobre os bytes do segredo original.

`compararHashConstante` (`segredo.ts:38-43`, `timingSafeEqual` com guard de tamanho) **existe e não
é chamada por ninguém neste caminho** — foi escrita para o cenário oposto (dois resumos já
resolvidos comparados em código). Confirmado por `grep`: o único consumidor de `segredo.ts` fora
de `http.ts` é `actions.ts`, que importa `gerarSegredo` e `hashSegredo`. **[código]**

**O que este desenho não cobre:** o tempo de resposta ainda distingue, em princípio, "cabeçalho
ausente" (rejeição local, sem ida ao banco) de "cabeçalho presente e errado" (uma ida ao banco).
Isso não vaza nada sobre o segredo, mas confirma a existência da porta a um sondador.

### 2.3 Resposta a credencial inválida

**Não distingue.** Chave inexistente, chave revogada e resumo que não bate produzem exatamente a
mesma resposta — `401` com `{"ok":false,"erro":{"codigo":"AUTH_INVALIDA","mensagem":"Chave de API
inválida ou revogada."}}` — porque `api_chave_resolver` devolve `NULL` nos três casos e
`autenticarChamada` colapsa `error || !chave` num único ramo (`http.ts:67-70`). A mensagem em si
menciona as duas possibilidades, o que é uma escolha de clareza operacional para o integrador, não
um vazamento. **[código]**

A distinção é ausente também um nível abaixo: quando a rota já autenticou mas a RPC de negócio
rejeita a chave (corrida entre a resolução e a chamada — revogação no meio), o prefixo
`CHAVE_INVALIDA` também vira `401` em `traduzirErroRpc` (`http.ts:136-138`).

### 2.4 Relação com a camada de borda que exige sessão

`src/proxy.ts` é a camada 1 do enforcement (ADR-0109): sessão obrigatória em tudo que não for
público; API sem sessão → `401 {"error":"AUTH_NECESSARIA"}` (`proxy.ts:75-78`).

A família externa é isentada **por prefixo**, não por caminho exato:

```ts
// src/proxy.ts:38
const API_AUTH_PROPRIA_PREFIXOS = ['/api/externo/']

// src/proxy.ts:40-43
function temAuthPropria(pathname: string): boolean {
  if (API_AUTH_PROPRIA.has(pathname)) return true
  return API_AUTH_PROPRIA_PREFIXOS.some(p => pathname.startsWith(p))
}
```

O motivo está no comentário `proxy.ts:32-37`: `/api/externo/solicitacoes/[id]/cancelar` tem segmento
dinâmico, então um conjunto de caminhos exatos (o molde usado pelas rotas de cron,
`API_AUTH_PROPRIA`, `proxy.ts:30`) não cobriria a família.

### 2.5 O que acontece com uma rota nova nesta família

**Nasce isenta e desprotegida.** Esta é a consequência mais importante de §2 para uma replicação.

Uma rota nova em `src/app/api/externo/**` recebe automaticamente a isenção do prefixo (a camada de
sessão a deixa passar) e **só fica protegida se quem a escreveu lembrar de chamar
`autenticarChamada` na primeira linha**. Não há nada que force isso:

- `autenticarChamada` não é um wrapper que embrulha o handler — é uma função que o handler pode ou
  não chamar.
- `API_AUTH_PROPRIA_PREFIXOS` **não é exportado** (`proxy.ts:38`, `const` de módulo), ao contrário
  de `API_AUTH_PROPRIA`, que é exportado justamente *"para o guard mecânico de `proxy.test.ts`"*
  (`proxy.ts:27-29`) e tem asserção em `src/lib/cdi/serie-sgs.test.ts:134-135`.
- Nenhum teste varre `src/app/api/externo/**` cobrando a presença da autenticação. `grep` por
  `externo` em `src/proxy.test.ts` não devolve nada. **[medido]**

O contraste é gritante e deliberado no caso do cron: lá a lição ("esquecer a linha não quebra nada
em teste e faz o agendamento falhar calado em produção — exatamente o bug de 2 anos atrás",
`proxy.ts:23-29`) virou enforcement mecânico. Aqui a assimetria é ao contrário: esquecer
`autenticarChamada` numa rota nova **abre** a porta em vez de fechá-la, e nada avisa.

**Fail-open, e sem sonda.** Registrado como a primeira "barreira com limite conhecido".

---

## 3. Superfície e contrato

### 3.1 Inventário de endpoints

Quatro arquivos, **cinco endpoints**. Todos com `export const runtime = 'nodejs'`.

| # | Verbo · caminho | O que faz | Exige | Devolve | `maxDuration` |
|---|---|---|---|---|---|
| 1 | `GET /api/externo/tipos` | Descoberta do contrato: todos os tipos expostos, com campos e destinos | `x-api-key` | `200 {ok, tipos[]}` | não declarado |
| 2 | `POST /api/externo/solicitacoes` | Cria uma solicitação | `x-api-key` + corpo JSON | `201` (nova) / `200` (idempotente) | **60** |
| 3 | `GET /api/externo/solicitacoes?referencia_origem=…` | Busca pela referência **do integrador** | `x-api-key` + query | `200 {ok, solicitacoes[]}` | (mesmo arquivo do #2: **60**) |
| 4 | `GET /api/externo/solicitacoes/{id}` | Consulta **uma** solicitação desta chave | `x-api-key` | `200 {ok, solicitacao}` / `404` | não declarado |
| 5 | `POST /api/externo/solicitacoes/{id}/cancelar` | Cancela uma solicitação desta chave | `x-api-key` | `200 {ok, id, status}` | **60** |

Não há `PUT`, `PATCH`, `DELETE`, `HEAD` nem `OPTIONS` em lugar nenhum — verbo não implementado
recebe `405` do próprio Next. **[código]**

**Nota sobre `maxDuration`:** os endpoints 2, 3 e 5 declaram 60 s; os endpoints 1 e 4 não declaram
nada e caem no padrão da plataforma. Como o papel `service_role` roda com `statement_timeout = 0`
(medido em `pg_roles.rolconfig` — sem limite de banco, diferente de `anon` 3 s e `authenticated`
8 s), **o único teto de tempo nesta superfície é o da plataforma de execução**, não o do banco. Uma
consulta patológica não é interrompida pelo Postgres.

### 3.2 Envelope

**Sucesso:** não há envelope único. Cada endpoint tem sua forma, todas com `ok: true` na raiz:

```jsonc
// GET /tipos
{ "ok": true, "tipos": [ { "slug", "nome", "destinos":[{id,nome}], "campos":[{…}] } ] }
// POST /solicitacoes
{ "ok": true, "id": 123, "status": "aberta",
  "destinatario": {"id":4,"nome":"Financeiro"},
  "solicitante": {"email":"…","nome":"…"},
  "idempotente": false }
// GET /solicitacoes/{id}
{ "ok": true, "solicitacao": { … } }
// GET /solicitacoes?referencia_origem=
{ "ok": true, "solicitacoes": [ { … } ] }
// POST /solicitacoes/{id}/cancelar
{ "ok": true, "id": 123, "status": "cancelada" }
```

Não há metadados (nenhum `meta`, `paginacao`, `request_id`, `versao`). **[código]**

**Erro:** envelope único, produzido por `respostaErro` (`http.ts:39-41`):

```json
{ "ok": false, "erro": { "codigo": "…", "mensagem": "…" } }
```

**Exceção importante:** um erro produzido **antes** do handler não tem essa forma. O proxy, quando
nega, devolve `{"error":"AUTH_NECESSARIA"}` (`proxy.ts:77`) — chave `error`, não `erro`, e sem
`ok`/`codigo`. Isso não acontece hoje sob `/api/externo/` (o prefixo está isento), mas é a forma
que o integrador receberia se a isenção fosse removida. E um 500 não tratado do Next devolve HTML.

### 3.3 Códigos e mapeamento

Dois tradutores em série. Primeiro a rota, para erros de forma; depois `traduzirErroRpc`
(`http.ts:131-153`) para os erros do banco, que chegam como `PREFIXO: detalhe`.

| Código | HTTP | Onde nasce |
|---|---|---|
| `AUTH_AUSENTE` | 401 | `http.ts:62` — cabeçalho ausente |
| `AUTH_INVALIDA` | 401 | `http.ts:69` — resumo não resolve |
| `CHAVE_INVALIDA`, `AUTH_*` | 401 | `http.ts:136-138` — prefixo vindo da RPC |
| `JSON_INVALIDO` | 400 | `http.ts:89,95,100` — corpo ilegível, vazio ou malformado |
| `NAO_ENCONTRADA` | 404 | rota (`id` não-inteiro/≤0) e `http.ts:139-141` |
| `CONFLITO_ESTADO` | 409 | `http.ts:142-144` — cancelar já encerrada |
| `PAYLOAD_EXCEDE_LIMITE` | 413 | `http.ts:82,92`; e `http.ts:145-147` para prefixos `PAYLOAD*` que não sejam `PAYLOAD_INVALIDO` |
| `PAYLOAD_INVALIDO` | 422 | rota (Zod, `solicitacoes/route.ts:201`) e whitelist 422 |
| `CONSULTA_INVALIDA` | 422 | `solicitacoes/route.ts:145` e whitelist |
| `IDEMPOTENCIA_OBRIGATORIA`, `TIPO_INVALIDO`, `DESTINATARIO_OBRIGATORIO`, `DESTINATARIO_INVALIDO`, `DATA_LIMITE_OBRIGATORIA`, `CAMPO_DESCONHECIDO`, `TIPO_EXIGE_ANEXO`, `CAMPO_OBRIGATORIO`, `VALOR_INVALIDO`, `SOLICITANTE_OBRIGATORIO`, `SOLICITANTE_INVALIDO` | 422 | whitelist `PREFIXOS_VALIDACAO_422`, `http.ts:108-123` |
| `ERRO_INTERNO` | 500 | ramo final de `traduzirErroRpc` (`http.ts:152`) e falha de narrowing de shape |

Duas decisões de desenho que custam ao integrador, e por isso merecem ser explícitas:

1. **A lista de 422 é whitelist, não "tudo que sobrou"** (`http.ts:105-107`). Um prefixo
   desconhecido — RPC renomeada, erro de infraestrutura, drift — cai em `500 ERRO_INTERNO` com
   mensagem genérica. **Custo para quem integra:** um erro de validação novo, introduzido no banco
   e não acrescentado à lista em TypeScript, chega ao integrador como `500` (retentável, backoff)
   em vez de `422` (definitivo, não retente). Ele vai retentar para sempre um pedido que nunca vai
   passar. **Benefício:** nenhum detalhe interno (nome de tabela, coluna, stack) vaza.
2. **Drift de shape do retorno da RPC vira `500` explícito, nunca degradação silenciosa.** Os três
   narrowings defensivos (`comoResultadoCriacao`, `solicitacoes/route.ts:67-86`;
   `comoResultadoCancelamento`, `cancelar/route.ts:22-27`; `comoListaConsulta`,
   `src/lib/api-externa/consulta.ts`) reprovam a resposta em vez de repassá-la. O comentário em
   `solicitacoes/route.ts:61-65` nomeia o risco concreto: `idempotente: undefined` faria a rota
   reenviar e-mail em replay e responder `201` sempre, quebrando o contrato.

### 3.4 Nomes de campo, nulos, datas e números

- **Nomenclatura:** `snake_case`, **em português**, sem exceção — `chave_idempotencia`,
  `data_limite`, `referencia_origem`, `solicitante_email`, `destinatario`. O código de erro também é
  português em caixa alta (`DESTINATARIO_INVALIDO`). Isso vale para chaves do integrador **e** para
  chaves de campo do tipo (`venda_que_originou_o_credito`).
- **Nulos:** presentes e significativos. `SolicitacaoExterna` (`consulta.ts:12-25`) declara
  `string | null` em `tipo`, `titulo`, `data_limite`, `criado_em`, `decidido_em`, `justificativa`,
  `referencia_origem`, `chave_idempotencia` e nos dois campos de `solicitante`. O narrowing
  **converte `undefined` em `null`** (`consulta.ts:27-29`), então a chave sempre existe — o
  integrador nunca precisa distinguir "ausente" de "nulo".
  - Um `null` em particular tem história: `solicitante.email` no **ack idempotente** pode vir nulo
    quando o cadastro da pessoa foi removido entre a criação e o reenvio (`LEFT JOIN
    app.rbac_usuarios` em `criar_solicitacao_externa`). Documentado em
    `solicitacoes/route.ts:51-56`. Na **criação** é sempre string.
- **Datas:** dois formatos distintos e não intercambiáveis.
  - `data_limite` — `date` no banco, serializa como `"2026-08-15"`. Na entrada, validado por regex
    `/^\d{4}-\d{2}-\d{2}$/` (`solicitacoes/route.ts:36`).
  - `criado_em` / `decidido_em` — `timestamptz`, serializados por `jsonb_build_object` **com o fuso
    da sessão**. Como `service_role` tem `TimeZone=America/Sao_Paulo` no `rolconfig` (medido em
    `pg_roles`; aplicado por requisição pelo PostgREST), sai `"2026-07-31T14:03:00-03:00"`.
    **Esta é uma dependência escondida e frágil:** medi que a minha própria sessão `postgres`, sem
    esse `rolconfig`, serializa `"…+00:00"`. Uma replicação que rode a mesma função sob um papel sem
    `TimeZone` configurado **muda o formato do campo sem erro nenhum**.
- **Números:** não há campo numérico no envelope além de `id` e `destinatario.id` (inteiros JSON).
  Valores de campo do tipo viajam como **texto** e são validados pelo motor conforme `tipo_campo`
  (`moeda` aceita vírgula ou ponto decimal). Na entrada, a rota aceita `string | number` e **coage
  a string** antes de mandar ao banco (`solicitacoes/route.ts:28`), explicitamente para tolerar o
  JSON de um integrador que mande número cru.

### 3.5 Tamanho, tempo, compressão, tipo de mídia

- **Tamanho de corpo: 64 KiB (65 536 bytes)**, imposto por `lerBodyLimitado`
  (`http.ts:79-102`). Duas verificações: `content-length` declarado (rejeição barata, `http.ts:80-83`)
  e `Buffer.byteLength(texto,'utf8')` depois da leitura (`http.ts:91-93`) — a segunda é a que vale,
  e é ela que pega um corpo comprimido cujo `content-length` (tamanho comprimido) cabia no limite.
  Acima → `413 PAYLOAD_EXCEDE_LIMITE`.
  - **O limite só existe no endpoint 2.** `POST /solicitacoes/{id}/cancelar` **nunca lê o corpo**
    (`cancelar/route.ts` não importa `lerBodyLimitado`), então um corpo de qualquer tamanho enviado
    a ele não é rejeitado por esta camada — só pelos limites da plataforma de execução.
- **Tempo:** ver §3.1. 60 s nos três endpoints que declaram; padrão da plataforma nos outros dois;
  **sem teto no banco** (`statement_timeout=0` para `service_role`).
- **Compressão:** não há tratamento explícito. `req.text()` entrega o corpo já descomprimido pela
  plataforma. Nenhuma resposta declara `Content-Encoding` no código da aplicação.
- **Tipo de mídia:** **não é verificado**. A rota nunca lê `content-type`; qualquer valor (ou a
  ausência) é aceito, desde que o corpo seja JSON analisável. A resposta sai como
  `application/json` via `Response.json()`.

### 3.6 Política de origem cruzada

**Não existe.** `grep` por `Access-Control`, `cors` e `OPTIONS` em `src/`, `next.config.ts` e
`vercel.json` devolve **zero ocorrências**. **[medido]**

Consequência prática: um navegador **não consegue** chamar esta API de outra origem — sem
`Access-Control-Allow-Origin`, a resposta é bloqueada pelo navegador, e o preflight `OPTIONS` (que um
cabeçalho não-simples como `x-api-key` sempre dispara) bate num verbo não implementado e recebe
`405`. **Esta API é servidor-para-servidor por construção, não por declaração.** É o padrão correto
para uma credencial de portador que não deve estar num navegador — mas é uma propriedade emergente,
não uma decisão escrita em lugar nenhum, e um `OPTIONS` acrescentado por engano a qualquer rota
desta família a desfaria.

Os cabeçalhos de segurança de `next.config.ts` (`Strict-Transport-Security`, `X-Frame-Options:
SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`) aplicam-se a `/:path*` —
portanto também às respostas desta API, onde a maioria é inócua. **Não há CSP** (decisão registrada
no comentário do próprio arquivo).

### 3.7 Paginação, filtro, ordenação

- **Paginação: não existe** em nenhum endpoint.
- **Filtro:** exatamente dois, mutuamente suficientes — `p_solicitacao_id` **ou**
  `p_referencia_origem` em `consultar_solicitacoes_externas`. **Um deles é obrigatório**: a RPC
  levanta `CONSULTA_INVALIDA` se os dois forem nulos, e o comentário diz por quê — *"sem isso a
  chamada viraria 'liste tudo o que essa chave já criou', que é outra funcionalidade (paginação,
  ordenação, volume) e não foi pedida"*. **Não há "listar tudo".**
- **Ordenação:** fixa, `ORDER BY s.id DESC` dentro da RPC. Não parametrizável.
- **Sem limite de linhas.** A busca por `referencia_origem` não aplica `LIMIT`. Como
  `referencia_origem` **não é única** (só o par `origem_chave_id` + `chave_idempotencia` é), um
  integrador que reuse a mesma referência em N pedidos recebe as N linhas num único corpo, sem teto.
  Com 64 KiB de entrada e resposta sem limite, **a resposta pode ser muito maior que a requisição**.
- O `GET` por `referencia_origem` devolve **coleção mesmo com um resultado**, deliberadamente
  (`solicitacoes/route.ts:126-133`): esconder a multiplicidade atrás de "o primeiro" faria o
  integrador conciliar contra a solicitação errada. Sem resultado → `200` com lista vazia, não
  `404`: é busca sem retorno, não recurso inexistente.
- O `GET` por `{id}` faz o oposto: lista vazia → `404 NAO_ENCONTRADA`, **igual** para "não existe",
  "é de outra chave" e "foi aberta na tela por um humano" — para a resposta não virar oráculo de
  existência de ids alheios (`solicitacoes/[id]/route.ts:53-62`).

---

## 4. Idempotência e corrida

### 4.1 Onde viaja, obrigatoriedade, janela

- **Viaja no corpo**, não em cabeçalho: campo `chave_idempotencia`, `z.string().min(1)`
  (`solicitacoes/route.ts:32`). **Não existe** `Idempotency-Key`.
- **Obrigatória**, em duas camadas: Zod na rota (`422 PAYLOAD_INVALIDO`) e
  `IDEMPOTENCIA_OBRIGATORIA` na RPC, que também rejeita string só de espaços
  (`coalesce(btrim(…),'')=''`). **[código, teste]**
- **Janela: infinita.** Não há expiração, TTL, coluna de data de consumo nem limpeza. O par
  `(origem_chave_id, chave_idempotencia)` é único **para sempre** na tabela `app.solicitacao`, que
  nunca é purgada. Reenviar a mesma chave dez anos depois continua devolvendo a mesma solicitação.
  **Consequência para quem integra:** a chave de idempotência precisa ser única **na história**,
  não na janela. A documentação recomenda o id do registro de origem — o que é seguro se esse id
  nunca for reciclado no sistema de origem, e é uma armadilha se for.
- **Só na criação.** `POST …/cancelar` não tem idempotência de protocolo — mas é naturalmente
  idempotente por estado: o segundo cancelamento recebe `409 CONFLITO_ESTADO: cancelada`.

### 4.2 O que o reenvio devolve, exatamente

Caminho **(c)** de `criar_solicitacao_externa` (corpo conferido no catálogo): antes de validar
qualquer coisa do pedido, a RPC procura o par `(origem_chave_id, chave_idempotencia)`. Se acha,
devolve imediatamente:

```json
{ "ok": true, "id": 123, "status": "<status ATUAL>",
  "destinatario": { "id": 4, "nome": "<nome atual da role>" },
  "solicitante":  { "email": "<do registro>", "nome": "<do registro>" },
  "idempotente": true }
```

HTTP `200` (contra `201` na criação) — decidido na rota por `resultado.idempotente`
(`solicitacoes/route.ts:234`).

**Ecoa a linha gravada, não revalida o conteúdo atual.** Isto é explícito e importante:

- O `status` devolvido é o **atual**, não o da criação. Um reenvio de uma solicitação já concluída
  devolve `"status":"concluida"` com `idempotente:true` — o reenvio funciona, de fato, como uma
  consulta barata.
- O payload da segunda chamada **não é olhado**. Tipo, destinatário, campos, data-limite: nada é
  comparado. Se o integrador reenviar a mesma chave com conteúdo diferente, recebe `200` de sucesso
  e **o conteúdo diferente é silenciosamente descartado**. Não há `409` de "chave reusada com
  payload divergente". **Custo para quem integra:** um erro de programação que reuse a chave entre
  dois pedidos diferentes vira uma perda silenciosa do segundo pedido, com resposta de sucesso.
- O solicitante ecoado é o **da linha gravada**, nunca o e-mail desta chamada — coberto por teste
  (`contrato-api-externa.test.ts:482`, *"reenvio idempotente com e-mail DIFERENTE ecoa o solicitante
  ORIGINAL e não troca o dono"*).
- **Nenhum e-mail é reenviado** no replay: a rota só notifica quando `!resultado.idempotente`
  (`solicitacoes/route.ts:230-232`).

### 4.3 Como a corrida é resolvida

**Duas defesas, em série** — e a segunda é a que realmente vale:

1. **Consulta prévia** (caminho c). Resolve o caso comum: reenvio depois que a primeira chamada já
   comitou. Sozinha, **não resolve corrida** — duas chamadas simultâneas podem passar as duas.
2. **Restrição no banco + captura de violação.** O índice
   `idx_solicitacao_idempotencia_uniq` — `CREATE UNIQUE INDEX … ON app.solicitacao (origem_chave_id,
   chave_idempotencia) WHERE (origem_chave_id IS NOT NULL AND chave_idempotencia IS NOT NULL)`
   (conferido em `pg_indexes`) — garante que só uma das duas insira. A perdedora recebe
   `unique_violation` e o bloco `EXCEPTION WHEN unique_violation THEN` re-lê a linha da vencedora e
   devolve o mesmo ack, com `idempotente:true`.

**Não há bloqueio explícito** (`SELECT … FOR UPDATE`, `pg_advisory_lock`). É otimista puro:
tenta inserir, captura o conflito. **[código]**

Duas consequências finas do ramo `EXCEPTION`: ele devolve o `destinatario` **resolvido nesta
chamada** (`v_role_id`) e o `solicitante` **resolvido nesta chamada**, não os da linha vencedora —
diferente do caminho (c), que lê da linha gravada. Numa corrida real entre duas chamadas com
payloads diferentes, o ack da perdedora descreve o pedido *dela*, com o `id` do pedido da
*vencedora*. É um caso estreito (mesma chave de idempotência, payloads diferentes, simultâneos) e
sem consequência no dado gravado — mas uma replicação que copie este desenho deve saber que existe.
A rota, além disso, **não envia e-mail** nesse ramo, porque `idempotente` vem `true`. Correto.

### 4.4 Referência do lado do integrador

`referencia_origem` — `text`, opcional (`solicitacoes/route.ts:37`), gravada em
`app.solicitacao.referencia_origem` e ecoada em toda consulta.

- **Para quê:** para o integrador não precisar guardar o `id` do Janus. É o segundo eixo de busca
  (§3.7).
- **É única?** **Não.** Só existe índice **não-único** `idx_solicitacao_ref_origem` em
  `(origem_chave_id, referencia_origem)` (conferido em `pg_indexes`). A não-unicidade é deliberada
  e é a razão de a busca devolver coleção (§3.7).
- **Não tem validação de formato** — qualquer texto serve, inclusive vazio (que vira `''`, não
  `NULL`, já que a rota faz `p.referencia_origem ?? null` e só um ausente vira nulo).

---

## 5. Evolução do contrato

### 5.1 Versionamento

**Não existe — em lugar nenhum.** `grep` por `v1`/`version` em `src/app/api/externo/` devolve zero.
Não há versão no caminho (`/api/externo/…`, não `/api/v1/externo/…`), nem em cabeçalho
(`Accept`/`X-API-Version` não são lidos), nem no corpo, nem no envelope de resposta. **[medido]**

Consequências:

- **Não é possível servir duas versões ao mesmo tempo.** Toda mudança é simultânea para todos os
  integradores. Com um integrador cadastrado e zero tráfego, isso ainda não custou nada; com dois,
  custa.
- **Não há política declarada para mudança que quebra.** O que existe é uma **postura** escrita em
  prosa, em dois lugares: *"O Janus é o dono do formato; a plataforma de origem se adapta a este
  contrato"* (`docs/api-externa-solicitacoes.md:6-7`) e *"mudanças ADITIVAS (campo novo opcional)
  não quebram a integração; o `GET /tipos` sempre reflete o vigente"* (`:283-284`). Não há SLA, não
  há prazo de aviso, não há canal de anúncio, não há registro de mudanças voltado ao integrador.
- O único mecanismo de comunicação de quebra já usado foi **um aviso em caixa dentro do próprio
  documento** — o bloco da v5.9.0 (`docs/api-externa-solicitacoes.md:19-35`), que avisa da chegada
  do estado `aprovada` e instrui a tratar `status` como lista **aberta**. Funciona se o integrador
  reler o documento. Não há como saber se releu.

### 5.2 A documentação é escrita à mão ou gerada?

**Escrita à mão, e em duas cópias independentes.** Este é o achado mais consequente de §5.

| Artefato | Natureza | Derivado do catálogo? |
|---|---|---|
| `docs/api-externa-solicitacoes.md` (284 linhas) | Markdown, para compartilhar com o integrador | **Não.** Inclusive o exemplo de `GET /tipos` é um JSON colado, com nota dizendo que é *"o estado real em 31/07/2026"* (`:64`) |
| `/admin/api-externa/documentacao` → `src/components/admin/api-externa/documentacao-content.tsx` (541 linhas) | JSX, para o leitor interno | **Parcialmente.** Só a seção "Tipos expostos agora" é viva |
| `GET /api/externo/tipos` | Resposta do servidor | **Sim** — é a única fonte gerada |

A parte viva da tela interna vem de `solic_tipos_documentacao` + `solic_destinatarios`
(`src/app/admin/api-externa/documentacao/page.tsx:87-93`), filtrando `exposto_via_api && !arquivado`
— o **mesmo** filtro de `solic_tipos_api` (conferido nos dois corpos). Slugs, rótulos, tipos de
campo e equipes válidas, portanto, não podem divergir.

**Todo o resto das 541 linhas é prosa e exemplos JSON escritos à mão** — autenticação, envelope,
tabela de erros, regras de idempotência, exemplos de requisição e resposta. Os literais
`JSON_CRIAR_RESPOSTA`, o exemplo de consulta e a tabela `CONFLITO_ESTADO`
(`documentacao-content.tsx:86,94,110,123`) são strings no código-fonte, sem nenhum vínculo com o
que o servidor devolve.

**Onde já divergiu:** o histórico é, até aqui, bom — `git log` mostra os dois artefatos mudando
**juntos** nos cinco commits que os tocaram (`721579a`, `1f9faba`, `3826144`, `f0a8dc6`, `7a8c510`),
e a atualização da v5.9.0 (estado `aprovada`) entrou nos dois. As divergências que encontrei são
menores e estão em §12 — mas todas são do tipo que só existe porque a prosa é escrita à mão, e a
disciplina que as manteve pequenas é **humana**, sustentada pelo mesmo autor em seis meses. Nada
mecânico defende essas duas cópias.

### 5.3 Como uma mudança no motor chega — ou não chega — ao integrador

| Mudança no motor | Chega? | Como |
|---|---|---|
| **Campo novo num tipo exposto** | **Sim, sozinha** | `solic_tipos_api` lê `app.solicitacao_campo` na hora. O `GET /tipos` reflete no mesmo instante. Se o campo novo for **obrigatório**, todo `POST` que não o traga passa a receber `422 CAMPO_OBRIGATORIO` — **quebra silenciosa e imediata**, sem aviso, sem versão. |
| **Campo removido / renomeado** | Parcialmente | O `GET /tipos` reflete. Mas o editor faz `DELETE … FROM app.solicitacao_campo` e recria (§12, D5): a `chave` só sobrevive porque a tela a reenvia. Um `POST` com a chave antiga vira `422 CAMPO_DESCONHECIDO`. |
| **Tipo novo exposto** | Sim, sozinha | Aparece no `GET /tipos` assim que o interruptor é ligado. |
| **Tipo deixa de ser exposto** | Sim, brutalmente | Some do `GET /tipos` e todo `POST` para ele vira `422 TIPO_INVALIDO` na chamada seguinte. Não há período de graça. As solicitações já criadas continuam consultáveis (a consulta não filtra por `exposto_via_api`). |
| **Estado novo no ciclo de vida** | **Não, automaticamente** | Foi o caso de `aprovada` (v5.9.0). Nenhum endpoint anuncia o conjunto de estados; `status` é `text` no envelope. A `CHECK` do banco conhece os cinco valores (`solicitacao_status_check`, conferida em `pg_constraint`), mas **essa lista não é exposta por nenhuma rota**. O integrador só descobre lendo o documento. |
| **Equipe nova / renomeada** | Sim | `solic_tipos_api` monta `destinos` de `app.rbac_roles` sem filtro. O documento avisa para preferir o `id` ao nome, porque o nome pode ser renomeado. |
| **Campo novo no envelope de consulta** | Sim | `comoItem` (`consulta.ts`) constrói o objeto por campos conhecidos — um campo novo na RPC **não** chega ao integrador até `SolicitacaoExterna` ser estendida. Aditivo e seguro. |

O padrão é claro: **o que é cadastro flui sozinho; o que é código não flui.** E o que flui sozinho
flui *sem aviso* — o mesmo mecanismo que torna a descoberta sempre verdadeira torna uma mudança de
cadastro uma quebra instantânea do integrador.

---

## 6. Observabilidade e limites

### 6.1 Registro de chamadas

**Existe.** `app.api_chamada_log`, escrita por `registrarChamada` (`http.ts:200-211`) via RPC
`api_chamada_registrar` (`SECURITY DEFINER`, `service_role`-only).

**O que grava (cinco colunas, e só):**

| Coluna | Conteúdo | Observação |
|---|---|---|
| `chave_id` | id da chave, ou **`NULL`** | `NULL` é legítimo: chamada rejeitada na autenticação ainda é auditada |
| `rota` | string **literal constante** por arquivo (`const ROTA`) | Ex.: `'/api/externo/solicitacoes/[id]'` — o **padrão**, com colchetes; **não o caminho real** |
| `status` | HTTP devolvido | |
| `detalhe` | texto opcional | `'auth_negada'`, `'body_invalido'`, `'id_invalido'`, a mensagem crua da RPC, ou a mensagem de validação |
| `criado_em` | `now()` | |

**Por quanto tempo:** **para sempre.** Não há purga, não há trigger (`pg_trigger` sem triggers não
internos nas duas tabelas), não há job de retenção (`cron.job` tem 5 jobs, todos de ingestão Monde
e CDI — nenhum de limpeza). **[medido]**

**É best-effort, e isso é deliberado:** falha de escrita não derruba a resposta ao integrador —
`console.error` e segue (`http.ts:204-210`). O comentário registra a lição: *"num log de AUDITORIA o
silêncio é pior: perder a linha sem sinal nenhum faz o log parecer completo"*. O `console.error`, no
entanto, só é legível nos logs da plataforma de execução — não há alerta.

### 6.2 O que NÃO é gravado, e que se desejaria ter num incidente

Esta é a lista que mais importa para uma replicação. **Nada abaixo é registrado:**

1. **O método HTTP.** A `rota` é constante por arquivo, e `/api/externo/solicitacoes` serve `GET`
   **e** `POST`. Num log com duas linhas dessa rota e status 200, **não há como saber qual foi
   criação e qual foi consulta.**
2. **O `{id}` real.** A rota literal grava `[id]`. Um `404` no log não diz *qual* id foi pedido.
3. **Endereço de origem da requisição.** Nenhum `x-forwarded-for`, nenhum IP. Num incidente de
   credencial vazada, **não há como saber de onde as chamadas vieram** — que é justamente a
   primeira pergunta.
4. **Identificação do cliente.** Nenhum `user-agent`.
5. **Qualquer coisa do corpo.** Nem a `chave_idempotencia`, nem a `referencia_origem`, nem o `tipo`.
   Correlacionar uma linha de log a uma solicitação só é possível por horário aproximado.
6. **O `id` da solicitação criada ou tocada.** O ack devolve `id` ao integrador; o log não o guarda.
7. **Latência.** Sem duração, sem carimbo de início.
8. **Identificador de correlação.** Não há `request_id` na resposta nem no log — o integrador não
   tem nada para citar ao abrir um chamado.
9. **Qual chave inválida foi tentada.** Na rejeição de autenticação, `chave_id` é `NULL` **e o
   resumo do token tentado não é guardado**. Não dá para distinguir "um integrador com a chave
   velha" de "alguém sondando". As duas linhas vivas em produção são exatamente isso, e **não é
   possível saber o que eram.**
10. **Chamadas que morreram antes do handler** — rota inexistente sob `/api/externo/` (404 do
    Next), verbo não implementado (405), corpo recusado pela plataforma, exceção não tratada. Todas
    **invisíveis** neste log.

`ultima_chamada_em`, exibido na tela de chaves, é `max(criado_em)` **filtrado por `chave_id`**
(`api_chave_listar`) — portanto conta só chamadas **autenticadas**. Uma chave cujo segredo o
integrador errou o mês inteiro aparece como "nunca chamada".

### 6.3 Limite de taxa

**Não existe.** Nenhum — nem por chave, nem por origem, nem global. `grep` por `ratelimit`,
`rate-limit`, `throttle` e `upstash` em `src/`, `package.json` e na documentação devolve **três
ocorrências, todas irrelevantes** (um throttle de cliente num modal de faturamento, um comentário
sobre o rate-limit *da API do Monde*, e um comentário sobre SMTP). **[medido]**

Também não há contador, janela deslizante ou coluna de uso na tabela de chaves. Nada no repositório
impõe limite algum; a única contenção seria configuração de plataforma fora do repositório (ver "O
que não foi coberto").

**O que isso expõe concretamente:** um segredo vazado permite a um terceiro (a) criar solicitações
ilimitadas para qualquer equipe, em qualquer tipo exposto, em nome de qualquer pessoa **cadastrada
e ativa** na plataforma cujo e-mail ele conheça — e cada criação **dispara e-mail real** para os
envolvidos (§8.3); (b) cancelar qualquer solicitação criada por aquela chave; (c) enumerar
solicitações por `referencia_origem` daquela chave. O teto de dano por unidade de tempo é o da rede.

### 6.4 Alarme em falha repetida

**Não existe.** Nenhum alerta, nenhum e-mail, nenhum limiar. As falhas best-effort
(`[api-externa] notificação #… falhou`, `[api-externa] auditoria não registrada …`) vão para
`console.error` e param nos logs da plataforma — e o gate `gate-stop` do harness proíbe
`console.log` em `src/`, mas `console.error` é o canal aceito e **não tem consumidor configurado**.

A única forma de descobrir que a integração está falhando é **um humano abrir
`/admin/api-externa`, clicar em "Ver log" numa chave e olhar as últimas 50 linhas.** Não há push,
não há resumo, não há e-mail diário.

### 6.5 Estado medido

Já em §0. Em resumo: **2 linhas de log, ambas `401`, ambas sem chave identificada**; sequência em 64
(62 linhas apagadas por limpeza de fixture e pela `0227`); zero chamadas autenticadas registradas
em produção. A distribuição por resultado é, literalmente, 100 % `401`.

---

## 7. Identidade de máquina

### 7.1 Como nasce

Existe, sim, um "registro de pessoa" para a máquina — **um por chave**, criado em três passos por
`criarChaveApi` (`src/app/admin/api-externa/actions.ts:72-121`):

1. **`auth.users`** — `admin.auth.admin.createUser({ email, password: senhaRoboAleatoria(),
   email_confirm: true })` (`:84-86`), com o **cliente service role**. E-mail derivado do nome da
   chave: `integracao-${slugPlataforma(plataforma)}@janus.internal` (`:80`). A senha é
   `randomBytes(24).toString('base64url')` (`:68-70`) — **gerada, usada uma vez e descartada**;
   nunca é exibida, gravada nem recuperável.
2. **`app.rbac_usuarios`** — `api_robo_registrar` (RPC gated por `exigir_acesso(['solicitacoes'])`),
   com **`ativo = false`, `role_id = NULL`, `precisa_trocar_senha = false`** (corpo conferido no
   catálogo).
3. **`app.api_chave`** — `api_chave_registrar`, com `robo_user_id` apontando para o uuid do passo 1
   e `criado_por = app.uid_jwt()` (o humano).

Se 2 ou 3 falharem, o usuário do Auth é apagado em melhor esforço (`:100`, `:115`). A linha de
`rbac_usuarios` sai junto por `CASCADE`.

**Barreira de criação:** a mesma área `solicitacoes` (§1.4) — e note que o passo 1 usa o **service
role**, que não passa por `exigir_acesso`; a proteção do passo 1 é inteiramente o
`requireAreaAction('solicitacoes')` da Server Action. Quem alcança a Action alcança o
`admin.auth.admin.createUser`.

Estado medido: o robô `integracao-tars@janus.internal` existe, `ativo=false`, `role_id=NULL`,
`email_confirmed_at` preenchido, **`last_sign_in_at = NULL`**, `banned_until = NULL`. **[medido]**

### 7.2 Onde o ator não humano aparece em coluna de decisão

**Em uma, e ela é visível na interface.** `cancelar_solicitacao_externa` grava:

```sql
UPDATE app.solicitacao
   SET status = 'cancelada', decidido_por = v_robo_user_id, decidido_em = now()
 WHERE id = p_solicitacao_id;
```

`v_robo_user_id` é o `robo_user_id` da chave. Ou seja: **um cancelamento pela API deixa o
usuário-robô na coluna `decidido_por`**.

Na criação é o oposto, e foi decisão de produto explícita (Round 4, `0217`): `solicitante_id` recebe
o **uuid da pessoa real** resolvida por `p_solicitante_email`, nunca o robô. A procedência não se
perde — `app.solic_json` emite `origem: { plataforma }` quando `origem_chave_id IS NOT NULL`, e a
interface mostra o selo **"via integração X"** em três telas (`board-solicitacoes.tsx:174`,
`minhas-solicitacoes.tsx:131`, `drawer-solicitacao.tsx:295`).

**Como a interface apresenta o ator de máquina na decisão: cruamente.** `solic_json` emite
`decidido_por_email` como `(SELECT email FROM app.rbac_usuarios WHERE user_id = p_sol.decidido_por)`
e a tela renderiza:

```tsx
// src/components/solicitacoes/drawer-solicitacao.tsx:374
<p>{STATUS_LABEL[sol.status]} por {sol.decidido_por_email ?? '—'} em {fmtDataHoraSP(sol.decidido_em)}.</p>
```

Um cancelamento pela API produz, portanto, a linha **"Cancelada por integracao-tars@janus.internal
em …"**. O endereço de máquina aparece no lugar onde todas as outras linhas mostram uma pessoa, sem
selo, sem rótulo "integração", sem o nome amigável "Integração TARS" (que existe em
`rbac_usuarios.nome` e não é usado aqui). O tratamento especial de proveniência que a plataforma
construiu — o selo — está no **solicitante**, não no **decisor**. **[código]** — e, sendo zero os
cancelamentos por API em produção, **nunca foi visto por ninguém**.

### 7.3 O que impede essa identidade de entrar pela tela

Quatro travas, de força bem diferente: **[código, medido]**

1. **`ativo = false` em `app.rbac_usuarios`** — a trava real. `app.exigir_acesso` levanta
   `USUARIO_INATIVO` para qualquer uid sem cadastro ativo (corpo conferido no catálogo), **antes**
   de olhar áreas. Toda RPC gated recusa. A camada de aplicação repete: `sessao.ativo` falso →
   `/sem-acesso` (`src/lib/auth/sessao.ts:45,61,68`), e as permissões são zeradas (`:45`).
2. **`role_id = NULL`** — mesmo se `ativo` virasse `true`, o `JOIN app.rbac_role_permissoes` não
   encontraria nenhuma área. Segunda trava, independente.
3. **Senha descartada** — existe no Auth, mas nunca saiu do processo que a gerou.
4. **Domínio `@janus.internal` não é roteável** — um "esqueci a senha" / magic link para esse
   endereço não tem para onde ir. Trava de fato, mas **não declarada nem verificada em lugar
   nenhum**: depende de o domínio nunca passar a existir, e de o e-mail ser sempre derivado do nome
   da chave por `slugPlataforma` (`actions.ts:56-63`, que já força ASCII e kebab-case).

**O que essas travas NÃO cobrem:** a conta **existe e está confirmada** no provedor de
autenticação (`email_confirmed_at` preenchido, `banned_until` nulo). Ela **pode autenticar** no
Auth — o que ela não consegue é passar em `exigir_acesso` depois. A defesa é de **autorização**,
não de **autenticação**. Um caminho da aplicação que confiasse só em "tem sessão válida" sem
consultar `ativo` (o que o `proxy.ts` faz, por desenho: ele só checa `getUser()`, e a área fica
para a camada 2) deixaria o robô passar pela camada 1. Hoje toda página tem guard de camada 2 e o
banco é backstop, mas a ausência de `banned_until` é uma defesa de graça que não foi usada.

### 7.4 Quantas identidades de máquina existem

**Uma por chave**, sem reuso — e sem limpeza. Revogar a chave **não** desativa nem apaga o robô (ele
já nasce inativo). Apagar o robô exigiu migration destrutiva com confirmação humana (`0227`).
Hoje: **1 chave, 1 robô, 36 usuários ativos** no total. **[medido]**

---

## 8. Postura de integração

**Postura declarada:** *"a plataforma é dona do formato; o integrador consulta; não há chamada de
saída, nem retorno de chamada, nem fila de saída."*

**Veredito: CONFIRMADA, e com prova física de remoção.**

### 8.1 Evidência de ausência

| Peça | Estado | Evidência |
|---|---|---|
| Tabela de fila `app.api_outbox` | **não existe** | `select to_regclass('app.api_outbox')` → `NULL` |
| RPCs de fila (`api_outbox_reivindicar`, `api_outbox_resultado`, `app.api_outbox_enfileirar`) | **não existem** | `select proname from pg_proc where proname like 'api_outbox%'` → 0 linhas |
| Cron `api-outbox-processar` (era `jobid 2`) | **desagendado** | `cron.job` tem 5 jobs — ids 1, 6, 7, 8, 9; **o 2 não está lá** |
| Colunas `callback_url` / `callback_segredo` | **dropadas** | `attnum` 4 e 5 vagos em `app.api_chave` |
| Rota `/api/externo/outbox/processar` | **não existe** | `find src/app/api` — só 4 arquivos sob `externo/` |
| `src/lib/api-externa/outbox.ts` | **não existe** | `ls src/lib/api-externa/` — 5 arquivos, nenhum outbox |
| `fetch` ou `net.http_post` no caminho externo | **nenhum** | `grep` em `src/lib/api-externa/` e `src/app/api/externo/` → só o `fetch` do arquivo de teste, contra o próprio PostgREST |

**O que sobrou da máquina removida:** literalmente nada de estrutura. Sobraram apenas os
**comentários** nas rotas (`solicitacoes/route.ts:9-11`, `cancelar/route.ts:7-9`: *"sobra só o
e-mail best-effort — a entrega inline de callback saiu no Round5"*) e o `maxDuration = 60`
dimensionado para um orçamento que já não existe. **[medido]**

A remoção está documentada nas migrations `0222` (aditiva: 9 funções reescritas para parar de
enfileirar, corpos extraídos de produção por `pg_get_functiondef` e editados cirurgicamente) e
`0223` (destrutiva: apaga a máquina já inerte, com censo de 0 linhas na fila e 0 chaves emitidas).

### 8.2 A nuance que importa para uma replicação

**A ausência de chamada de saída é uma decisão de produto, não uma limitação de plataforma.** O
`pg_net` está instalado e em uso ativo: cinco jobs de cron fazem `net.http_post` hoje
(ingestão Monde ×4, CDI ×1), lendo segredos do `vault`. A capacidade de empurrar está ali, montada e
funcionando. **Foi escolhido não usá-la aqui** — decisão do Yan em 31/07/2026, citada verbatim no
cabeçalho da `0222`: *"somos donos do formato, não devemos precisar mandar nada de volta, os outros
sistemas que devem nos consultar"*.

O preço está registrado no mesmo lugar e vale repetir: **a pontualidade passa a ser inteiramente
responsabilidade da plataforma de origem — enquanto ela não consultar, ninguém do lado dela sabe.**
Em troca, o modo de falha que o push criava (fila desiste após 8 tentativas → evento perdido para
sempre) deixou de existir: não há entrega para falhar.

### 8.3 A exceção honesta: e-mail

Há **uma** chamada de rede partindo da plataforma no caminho desta API — e ela não vai para o
integrador. Criação e cancelamento disparam `enviarNotificacaoSolicitacao`
(`solicitacoes/route.ts:110-117`, `cancelar/route.ts:45-52`), que envia **e-mail real por SMTP** aos
envolvidos humanos, resolvidos por `solic_emails_envolvidos_svc` (variante `service_role`, migration
`0213`, criada porque esta porta não tem sessão de usuário e a RPC gated sempre negaria —
`http.ts:179-191`).

Três propriedades: é **best-effort** (nunca afeta a resposta HTTP, `try/catch` com `console.error`);
**não é reenviado em replay idempotente** (`solicitacoes/route.ts:230`); e é **uma ação externa
irreversível disparada por uma requisição autenticada só por chave de portador**. Para efeito de
replicação: quem tiver a chave consegue fazer a plataforma **mandar e-mail em nome dela**, para
endereços que ele não escolhe mas cujo disparo ele controla — sem limite de taxa (§6.3).

### 8.4 Como o integrador descobre que algo mudou

**Só perguntando.** Dois endpoints, e apenas eles:

- `GET /api/externo/solicitacoes/{id}` — precisa ter guardado o `id` do Janus.
- `GET /api/externo/solicitacoes?referencia_origem=…` — precisa ter mandado a referência na criação.

**Granularidade:** por item ou por referência, **nunca em lote e nunca por "o que mudou desde X"**.
Não há `?desde=`, não há `updated_after`, não há cursor, não há listagem — a RPC **recusa** a
consulta sem critério (`CONSULTA_INVALIDA`), com a justificativa escrita no corpo (§3.7). Um
integrador com 500 pedidos em voo que queira saber o estado de todos faz **500 requisições**, uma
por pedido, a cada ciclo de consulta.

**Cadência:** escolha inteira do integrador, sem piso nem teto imposto (não há limite de taxa, §6.3;
não há recomendação no documento além de *"consulte quando quiser, quantas vezes quiser"*,
`docs/api-externa-solicitacoes.md:167-168`). Não há `ETag`, `Last-Modified` nem `304` — toda consulta
é uma leitura completa.

---

## 9. Telas de administração

Duas páginas, ambas fora da barra de navegação (alcançadas por link a partir de
`/admin/solicitacoes`).

### 9.1 `/admin/api-externa` — "API externa"

`src/app/admin/api-externa/page.tsx` · guard `requireArea('solicitacoes')` (`:25`) ·
`dynamic = 'force-dynamic'`. Duas seções mais três modais.

**Tabela "Chaves de API"** (`chaves-api-content.tsx:119-160`) — quatro colunas:

| Coluna | Conteúdo |
|---|---|
| Referência | `plataforma`, com o nome/e-mail do robô abaixo e "Criada em …" |
| Status | selo **Ativa** / **Revogada** (+ data da revogação) |
| Última chamada | `max(api_chamada_log.criado_em)` **da chave** — só chamadas autenticadas (§6.2) |
| Ações | ícone "Ver log" e ícone "Revogar" (desabilitado se já revogada) |

**Não há coluna de uso** além do último carimbo: nem contagem, nem taxa de erro, nem tendência. Não
há botão de editar — a chave tem dois estados de vida (§1.2).

**Modal "Nova chave"** (`modal-criar-chave.tsx`) — **um único campo, "Referência"**. Em sucesso,
exibe o segredo em claro com botão de copiar, uma única vez.

**Modal "Log de chamadas"** (`modal-log-chave.tsx`) — quatro colunas (Rota, Status, Detalhe,
Quando), **"Últimas chamadas registradas para esta chave (máx. 50)"**. Sem filtro, sem paginação,
sem exportação, sem intervalo de datas. `api_log_listar` aceita `p_limit` e o limita a `[1, 200]`,
mas a interface sempre pede 50 (`src/lib/api-externa/rpc.ts:55`). **O histórico além das 50 últimas
linhas está no banco e é inalcançável pela tela.**

**Seção "Tipos Expostos"** (`tipos-expostos.tsx`) — tabela Nome · Slug · caixa de seleção
"Exposto", um `admin_solic_tipo_api_config(tipo_id, exposto)` por clique. **É o único controle de
alcance que resta** (§1.5) — e um clique aqui muda o contrato de **todas** as chaves ao mesmo tempo,
sem confirmação e sem aviso a ninguém.

### 9.2 `/admin/api-externa/documentacao` — "Documentação da API externa"

`src/app/admin/api-externa/documentacao/page.tsx` · guard
`requireArea(['solicitacoes/documentacao', 'solicitacoes'])` (`:82`) — **área própria**, com
semântica OU: quem tem só a permissão de documentação entra e vê o contrato sem alcançar a gestão de
chaves; `podeGestao` (`:85`) controla os links internos. `src/lib/auth/areas.test.ts:45-46,70` prova
que a rota mais específica não é engolida pela genérica.

O que exibe: o contrato completo para o leitor interno — conceitos, autenticação, descoberta,
criação, consulta, idempotência, cancelamento e a tabela de erros. **541 linhas de JSX escritas à
mão**, com os exemplos JSON como literais no fonte.

**Derivada do catálogo vivo?** **Só a seção "Tipos expostos agora"**, que lê
`solic_tipos_documentacao` (tipos expostos e não arquivados — o mesmo filtro de `solic_tipos_api`,
por decisão registrada na `0219`, que corrigiu um achado CRÍTICO: a fonte anterior era gated na área
de gestão e negava justamente a quem a permissão nova existia para servir) e `solic_destinatarios`
(equipes válidas). O resto é prosa. Ver §5.2 e §12.

---

## 10. Contaminação de domínio

**Critério: um artefato está limpo se funciona sem conhecer o negócio deste produto.**

### 10.1 Genérico

| Artefato | Por que é limpo |
|---|---|
| `src/lib/api-externa/segredo.ts` (43 linhas) | Gera, resume e compara segredo. **Zero menção a solicitação.** Copiável inteiro. |
| `autenticarChamada` + `ChaveResolvida` (`http.ts:21-72`) | Cabeçalho → resumo → RPC de resolução → objeto de chave. O único acoplamento é o **nome** `api_chave_resolver` e o campo `robo_user_id` no tipo — que, note-se, **é lido e nunca usado** por nenhuma rota. |
| `respostaErro` / envelope de erro (`http.ts:39-41`) | Genérico. |
| `lerBodyLimitado` (`http.ts:79-102`) | Genérico. Teto parametrizado. |
| `registrarChamada` + `app.api_chamada_log` + `api_chamada_registrar` + `api_log_listar` | Genéricos — `(chave, rota, status, detalhe)` não sabe o que é uma solicitação. |
| `app.api_chave` + `api_chave_registrar` / `_resolver` / `_revogar` / `_listar` | Genéricos. |
| `api_robo_registrar` e o padrão de identidade de máquina | Genérico, exceto por gatear em `exigir_acesso(['solicitacoes'])`. |
| `API_AUTH_PROPRIA_PREFIXOS` no proxy | Genérico (um prefixo). |
| O padrão de idempotência | **O mecanismo** (índice único parcial + captura de `unique_violation` + consulta prévia) é genérico; a **coluna** vive na tabela de domínio. |
| `traduzirErroRpc` (`http.ts:131-153`) | A **forma** (`PREFIXO: detalhe` → HTTP) é genérica; a **whitelist** de 13 prefixos é 100 % domínio. |

### 10.2 Específico do recurso exposto

- As quatro rotas inteiras (`src/app/api/externo/**`) — esquema Zod, nomes de RPC, narrowings,
  notificação por e-mail.
- `src/lib/api-externa/consulta.ts` — `SolicitacaoExterna` é o recurso.
- `getEmailsEnvolvidosSvc` (`http.ts:155-191`) — solicitação, tipo, autor, atribuído.
- `PREFIXOS_VALIDACAO_422` — 13 prefixos, todos de solicitação.
- As cinco RPCs de negócio.
- `app.solicitacao_tipo.exposto_via_api` — o interruptor de alcance mora na tabela de domínio.
- `app.solicitacao.origem_chave_id` / `chave_idempotencia` / `referencia_origem` + os dois índices.
- Toda a interface de administração e as duas documentações.
- **A área RBAC `solicitacoes`** — a barreira de quem administra chaves é a área do **domínio**,
  não uma área de "integrações".

**Fronteira medida:** de **389 linhas** de TypeScript em `src/lib/api-externa/` (excluída a suíte:
`consulta.ts` 71 + `http.ts` 211 + `rpc.ts` 64 + `segredo.ts` 43), **~145 são genéricas** (`segredo.ts` inteiro + as partes de `http.ts` acima) e o resto é domínio.
A separação é **razoavelmente limpa dentro de `http.ts`**, onde as peças genéricas estão agrupadas
no topo e as de domínio no fundo, mas **o arquivo não está dividido** — não há
`src/lib/api-externa/nucleo/` versus `.../solicitacoes/`.

### 10.3 O que teria de mudar para servir um segundo recurso

Hoje esta camada serve **um** recurso, por **um** tipo de solicitação, para **uma** chave. Para
servir um segundo recurso — digamos, "lançamentos" — seria preciso:

1. **Separar o genérico do domínio.** Extrair de `http.ts` a autenticação, o envelope, a leitura de
   corpo e o registro de chamadas; deixar `traduzirErroRpc` receber a whitelist de prefixos como
   parâmetro, em vez de fechá-la no módulo.
2. **Dar escopo à chave.** Hoje a chave **não tem escopo nenhum** — a whitelist por chave foi
   removida de propósito (§1.5), e a decisão foi correta enquanto o alcance é "um tipo de
   solicitação". Com dois recursos, uma chave ativa alcançaria os dois automaticamente, o que quase
   certamente não é o desejado. Isso significa **reintroduzir** uma coluna de escopo — exatamente o
   que `0224`/`0226` apagaram. Vale ler o motivo de então (duas listas brancas em série produziam um
   `403` difícil de diagnosticar para um tipo que a tela mostrava como exposto) antes de repetir a
   forma; o problema era a **redundância** entre dois controles, não o escopo em si.
3. **Generalizar o interruptor de exposição.** `exposto_via_api` é uma coluna booleana na tabela de
   tipos de solicitação. Um segundo recurso precisa do seu próprio, e a tela "Tipos Expostos" vira
   "Recursos Expostos".
4. **Resolver o log.** `rota` como texto livre já aguenta, mas as lacunas de §6.2 (método, id,
   origem) ficam piores com dois recursos: hoje ainda dá para adivinhar pelo horário; com dois
   recursos e volume real, não dá.
5. **Decidir o versionamento (§5.1).** Servir dois recursos com o único documento à mão de hoje, sem
   versão, é insustentável. Este é o momento natural para gerar a documentação da descoberta, em vez
   de manter a terceira cópia escrita à mão.
6. **Generalizar a identidade de máquina.** O e-mail do robô é
   `integracao-<slug>@janus.internal` derivado do nome da chave, e o `api_robo_registrar` gateia em
   `exigir_acesso(['solicitacoes'])` — o nome da área do domínio está dentro da função genérica.

**Veredito:** a camada é **fatorável**, não fatorada. O trabalho é real mas contido — a maior parte
é mover código que já está isolado dentro de um arquivo, e a decisão de produto difícil é o item 2.

---

## 11. Construído × provado

Coluna "Provado como": **[produção]** = observado funcionando com tráfego real; **[teste]** =
coberto por teste automatizado, com a natureza do teste declarada; **[código]** = apenas lido.

| Capacidade | Construído | Provado como |
|---|---|---|
| Criar chave (3 passos: Auth + RBAC + chave) | sim | **[produção]** — a chave `TARS` existe, com robô e `criado_por` preenchidos (única capacidade desta camada com uso real medido) |
| Exibir o segredo uma vez e nunca mais | sim | **[código]** — sem teste |
| Revogar chave | sim | **[produção, parcial]** — a chave id 47 foi revogada em 31/07 (censo da `0227`), depois apagada. Também **[teste]**: a suíte revoga por SQL e prova `CHAVE_INVALIDA` na consulta (`:568-583`) |
| Recusar chave revogada / inexistente | sim | **[teste]** — no nível da **RPC**, não do HTTP |
| **Autenticação por `x-api-key` (o cabeçalho, o `trim`, o SHA-256, o 401)** | sim | **[código] apenas** — nenhum teste exercita `autenticarChamada` |
| **Isenção do proxy para `/api/externo/`** | sim | **[código] apenas** — `grep externo src/proxy.test.ts` → nada |
| **Teto de 64 KiB do corpo** | sim | **[código] apenas** |
| **Análise Zod do payload e a mensagem que nomeia o campo** | sim | **[código] apenas** — o comentário `solicitacoes/route.ts:189-195` cita uma *"prova HTTP do round 4"* feita à mão, não automatizada |
| **Tradução erro-de-RPC → HTTP (`traduzirErroRpc`)** | sim | **[código] apenas** — nenhum teste cobre a whitelist de 422 nem o ramo 500 |
| **`201` na criação × `200` no replay** | sim | **[código] apenas** — a suíte prova a idempotência **na RPC** (mesmo `id`, `idempotente:true`, sem duplicar, `:459-497`), **nunca o código HTTP** |
| **Narrowings defensivos (drift → 500)** | sim | **[código] apenas** |
| **`registrarChamada` / log de auditoria** | sim | **[código] apenas** — e as 2 linhas vivas em produção são 401 sem chave |
| Criação de solicitação (validação, destinatário, solicitante, campos) | sim | **[teste]** — 12 casos via RPC |
| Solicitante amarrado a pessoa ativa; robô nunca é autor | sim | **[teste]** — 4 casos, inclusive um com **dois** usuários distintos para não ser tautológico (`:272`) |
| Idempotência: mesmo `id`, sem duplicar, ecoando o solicitante original | sim | **[teste]** — `:459`, `:482` |
| **Corrida concorrente resolvida pelo `unique_violation`** | sim | **[código] apenas** — nenhum teste dispara duas chamadas simultâneas; o índice único existe **[medido]** |
| Consulta por id e por `referencia_origem`; escopo por chave; `404` indistinguível | sim | **[teste]** — 5 casos, inclusive o que prova que a consulta não enxerga solicitação aberta na tela (`:538`) |
| Cancelamento escopado; `CONFLITO_ESTADO`; `NAO_ENCONTRADA` | sim | **[teste]** — 4 casos |
| Descoberta (`solic_tipos_api`): tipos expostos, sem campo anexo | sim | **[teste]** — `:618`, e o negativo `:417` |
| Paridade de validação com o formulário humano | sim | **[teste]** — 4 casos + **[medido]**: `solic_validar_e_snapshotar` tem exatamente 2 chamadores no catálogo (`criar_solicitacao` e `criar_solicitacao_externa`) |
| Estabilidade de `chave` de campo na edição do tipo | sim | **[teste]** — `:641` |
| RPCs `service_role`-only recusam `anon` | sim | **[teste]** — bloco `:810` |
| **E-mail de notificação (criação / cancelamento)** | sim | **[código] apenas** — nenhum teste; e zero envios reais por esta porta |
| **Selo "via integração X" na interface** | sim | **[teste, indireto]** — `:286-287` prova que `origem_chave_id` é gravado; a renderização nunca foi vista com dado real |
| **Robô na coluna `decidido_por` após cancelamento pela API** | sim | **[código] apenas** — e nunca visto por ninguém (§7.2) |
| Limite de taxa | **não** | — |
| Versionamento | **não** | — |
| Rotação de segredo | **não** | — |
| Alerta / alarme | **não** | — |
| Chamada de saída / retorno de chamada / fila | **removidos** | **[medido]** — ausência confirmada no catálogo (§8.1) |

### 11.1 O que os testes automatizados cobrem de fato

Um arquivo: `src/lib/api-externa/contrato-api-externa.test.ts`, **822 linhas** — 33 casos no bloco
principal, mais um bloco-gate que prova que o pulo é intencional e um bloco de negação para `anon`.

**Contra o quê:** **PRODUÇÃO**, sem mediação. Duas conexões:

1. **REST/PostgREST com `SUPABASE_SERVICE_ROLE_KEY`** — `fetch` para
   `${HOST}/rest/v1/rpc/${fn}` (`:98`). É assim que todos os casos de comportamento chamam as RPCs.
2. **`pg` direto via `SUPABASE_DB_URL`** — para montar e limpar a fixture, porque não há RPC de
   escrita alcançável sem sessão para as tabelas de configuração.

**Fixtures:** `INSERT` real na tabela `app.api_chave` (`:222`), roles, tipo e campos com prefixo
`ZZ_TESTE_API_V540`, criados em `beforeAll` e apagados em `afterAll` (`:230-232`). **Comitados** —
esta suíte é a **exceção conhecida e registrada** à convenção do projeto de que teste que escreve no
banco tem de rodar em transação revertida (documentada em
`src/lib/sonda-teste-escreve-banco.test.ts`, §"EXCEÇÃO CONHECIDA"): as RPCs são chamadas por HTTP e
leem numa conexão diferente do PostgREST, então a fixture precisa estar visível.

**Guardas de execução:** `describe.skipIf(!ON || !RPC_PRONTA)`. `ON` exige as três variáveis de
ambiente; `RPC_PRONTA` sonda o **catálogo** (`pg_proc`) confirmando `criar_solicitacao_externa` com
`pronargs = 9`, `solic_concluir` com `pronargs = 1` e a existência de
`consultar_solicitacoes_externas` — porque uma chamada REST com corpo vazio devolveria 404 tanto
para "função não existe" quanto para "assinatura não bate", e isso seria falso-negativo. Há um
`describe` separado (`:787`) que **prova que o pulo é intencional e não silencioso**.

**O buraco, dito de uma vez:** **a suíte testa as RPCs, não a API.** Zero casos exercitam um
`route.ts`, e nenhum passa por `x-api-key`. Tudo em §2 e §3 — o cabeçalho, o 401, o teto de corpo,
a análise Zod, o mapeamento para HTTP, o `201`/`200`, os narrowings, o log — está **coberto zero**.
O que essa suíte prova, prova muito bem, e prova contra o banco de verdade; ela só prova **a
camada de baixo**. A camada de transporte — que é exatamente o objeto deste levantamento — é a
menos provada de todas, e é a única exposta a terceiros.

---

## 12. Divergências encontradas

| # | O que a documentação diz | O que o código / catálogo faz | Evidência |
|---|---|---|---|
| D1 | *"Todas as chamadas são registradas em log."* | **Best-effort.** Falha de escrita só produz `console.error`; a resposta segue normal. Uma exceção não tratada antes da chamada não deixa linha. `404` de rota inexistente, `405` de verbo e corpo recusado pela plataforma são invisíveis. | `docs/api-externa-solicitacoes.md:57` × `src/lib/api-externa/http.ts:200-211` |
| D2 | *"Limite de payload: **64 KB** por requisição"* (seção 2, sem qualificar o endpoint) | **64 KiB** (65 536 bytes), e **só no `POST /solicitacoes`**. `POST …/cancelar` nunca lê o corpo — não há teto desta camada nele. | `docs/api-externa-solicitacoes.md:58` × `http.ts:79` e `cancelar/route.ts` (não importa `lerBodyLimitado`) |
| D3 | *"`campos` é um objeto `{chave: valor}` com **valores string**"* | Aceita `string` **ou** `number` e coage a string. O integrador que confiar na doc estará estringindo à toa; e um `boolean` ou `null` — que a doc também não menciona — é rejeitado com `PAYLOAD_INVALIDO`. | `docs/api-externa-solicitacoes.md:151` × `solicitacoes/route.ts:28,35` |
| D4 | O exemplo do `GET /tipos` mostra `destinos` **dentro de cada tipo**, sugerindo destinos por tipo (a prosa duas linhas abaixo diz o contrário) | `solic_tipos_api` calcula a **mesma lista global** de `app.rbac_roles`, sem filtro, e a repete em cada tipo. A forma do JSON contradiz a prosa. | `docs/api-externa-solicitacoes.md:73-77,98-100` × corpo de `solic_tipos_api` |
| D5 | *"`solicitacao_campo.chave` … gerados na criação e **imutáveis depois**"* (ADR-0172); *"o Janus **garante** que edições no cadastro … não mudam slugs/chaves existentes"* (doc do integrador) | O **slug** é de fato imutável (`admin_solic_salvar_tipo` ignora `slug` no `UPDATE`, com comentário explícito). A **chave de campo** não é protegida pelo banco: a RPC faz `DELETE FROM app.solicitacao_campo WHERE tipo_id = v_id` e recria, preservando a chave **só quando o payload a reenvia** — senão gera de novo a partir do rótulo. A garantia mora na tela e num teste, não numa constraint. | `docs/adr/0172-…` e `docs/api-externa-solicitacoes.md:95-97` × corpo de `admin_solic_salvar_tipo`; teste em `contrato-api-externa.test.ts:641` |
| D6 | ADR-0172: *"a fonte de verdade é o código e as migrations vivas (**0210–0229**)"* | `0228` e `0229` são de outro domínio (Weddings e Fluxo de Caixa); `0218` nunca existiu (renumeração). O intervalo real é 0210–0227, com 0218 vago — e a própria lista de Referências do ADR está correta. | `docs/adr/0172-…:21-22` × `ls supabase/migrations/` |
| D7 | Nenhum documento menciona limite de taxa — nem para dizer que não há. A seção *"Fora desta versão"* lista seis ausências e não inclui esta. | Não existe limite algum, em nenhum lugar. | `docs/api-externa-solicitacoes.md:273-278` × `grep` por `ratelimit\|throttle` |
| D8 | Nenhum documento menciona política de origem cruzada. | Não há CORS nem `OPTIONS`. É a postura certa, mas não está escrita — e nada impede que um `OPTIONS` acrescentado por engano a desfaça. | `grep Access-Control` → 0 |
| D9 | O exemplo de consulta mostra `"criado_em": "2026-07-31T14:03:00-03:00"` como se o deslocamento fosse propriedade do contrato. | O deslocamento vem do `rolconfig` `TimeZone=America/Sao_Paulo` do papel `service_role`, aplicado por requisição pelo PostgREST. **Medi** que a mesma expressão numa sessão sem esse `rolconfig` serializa `+00:00`. Um papel mal configurado muda o formato sem erro. | `docs/api-externa-solicitacoes.md:190` × `pg_roles.rolconfig` |
| D10 | ADR-0172: *"Revogação … é **irreversível**"* | Irreversível **pela superfície exposta** (nenhuma RPC reativa). No banco é um `UPDATE … SET ativo = true` — que a própria suíte executa como fixture. Não há constraint nem trigger impedindo. | `docs/adr/0172-…` × `contrato-api-externa.test.ts:573,580`; `pg_trigger` sem triggers |

**Nada foi encontrado divergindo em:** os códigos de erro e seus HTTP (a tabela da seção 8 do
documento bate campo a campo com `traduzirErroRpc` e com as rotas), a regra de idempotência, o
escopo por chave, o `404` indistinguível, a coleção do `referencia_origem`, a obrigatoriedade do
`solicitante_email`, a ausência de fallback de destinatário, o estado `aprovada` cancelável, e a
paridade de validação com o formulário humano.

---

## Reconstruível

Denso o bastante para virar spec sem este repositório:

1. **Modelo de credencial completo** — tabela (9 colunas, 3 vagas por remoção), o índice parcial
   `btree(segredo_hash) WHERE ativo`, RLS ligada sem policy e sem grant (acesso só por
   `SECURITY DEFINER`), formato do segredo (`jns_` + 40 hex = 160 bits), SHA-256 sem sal nem KDF,
   exibição única, dois estados de vida, `plataforma` UNIQUE, e o corpo exato das quatro RPCs.
2. **Autenticação completa** — cabeçalho `x-api-key`, `trim`, resumo, busca por igualdade em índice,
   `service_role` como credencial de resolução, decisão dentro de cada handler, 401 indistinguível,
   e o raciocínio sobre tempo (incluindo por que `compararHashConstante` não é usada aqui).
3. **Superfície e contrato inteiros** — 5 endpoints, verbos, exigências, envelopes de sucesso e erro
   campo a campo, os 21 códigos com HTTP e ponto de origem, nomenclatura, tratamento de nulos, os dois
   formatos de data, coerção de número, teto de 64 KiB em dois níveis, `maxDuration` por rota,
   ausência de CORS e de tipo de mídia verificado, ausência de paginação, filtro por dois eixos,
   ordenação fixa.
4. **Idempotência inteira** — onde viaja, obrigatoriedade em duas camadas, janela infinita, o que o
   replay devolve exatamente (incluindo que não revalida e que descarta o payload novo em silêncio),
   e a corrida resolvida por índice único parcial + captura de `unique_violation`, com o
   comportamento fino do ramo `EXCEPTION`.
5. **Postura de integração** — confirmada com prova de ausência item a item, mais a nuance de que
   `pg_net` existe e é usado em outro lugar, mais a exceção honesta do e-mail.
6. **Identidade de máquina** — os três passos de criação, `ativo=false` + `role_id=NULL` como travas
   de autorização (não de autenticação), o e-mail derivado não-roteável, a senha descartada, e a
   única coluna de decisão onde a máquina aparece (com a renderização crua na interface).
7. **Observabilidade** — as 5 colunas do log, a lista de 10 coisas que ele não guarda, a retenção
   infinita sem purga, a inexistência de limite de taxa e de alarme, e o que a tela mostra (50
   últimas, sem filtro).
8. **Evolução** — ausência total de versionamento, a documentação em duas cópias à mão mais uma
   fonte gerada, e a matriz de sete mudanças do motor com "chega / não chega / como".
9. **Contaminação** — o inventário linha a linha do que é genérico e do que é domínio, e os seis
   passos concretos para servir um segundo recurso.

## Faltando

Cada item com a pergunta exata a fazer.

1. **Existe alguma proteção de borda na Vercel** (Firewall/WAF, BotID, limite de taxa do plano,
   proteção de deployment) aplicada a `/api/externo/*`? → *"Abra Vercel → Projeto → Firewall e
   Settings → Deployment Protection e diga se há alguma regra que alcance `/api/externo`. Há regra
   de limite de taxa configurada pelo painel?"* **Bloqueia a afirmação "não existe limite de taxa"
   de ser absoluta** — hoje ela vale para repositório e banco.
2. **Qual é o `maxDuration` efetivo de `GET /api/externo/tipos` e `GET /api/externo/solicitacoes/{id}`?**
   → *"Os dois não declaram `maxDuration`. Qual é o padrão do plano atual?"* Importa porque o banco
   não tem teto (`statement_timeout=0` em `service_role`).
3. **A chave `TARS` já foi entregue ao integrador?** → *"O segredo da chave id 48 (criada em
   31/07/2026 às 20:39) chegou a ser compartilhado com a equipe do TARS/CRM? Se sim, quando, por
   qual canal, e ele ainda é o segredo em uso do lado deles?"* A chave está ativa há 6 semanas com
   zero chamadas autenticadas — ou não foi entregue, ou foi entregue e não usada, e as duas
   situações pedem ações diferentes.
4. **As duas linhas `401` de produção (31/07 18:27 e 10/09 17:42) — o que eram?** → *"Foram testes
   manuais seus, ou tentativa do integrador com credencial errada, ou sondagem de terceiro?"* O log
   **não é capaz de responder** (§6.2, item 9); só a memória humana pode.
5. **Há algum registro do que foi verificado à mão na "prova HTTP do round 4"?**
   (`solicitacoes/route.ts:192`) → *"Existe transcrição, coleção de requisições ou anotação dessa
   prova?"* Se existir, converte várias linhas de §11 de **[código]** para **[produção, manual]**.
6. **A retenção infinita do log é intencional?** → *"O `app.api_chamada_log` nunca é purgado e nada
   o limita. Isso é decisão ou omissão? Qual retenção você quer?"* — decisão de produto.
7. **O e-mail do robô em `decidido_por` (§7.2) é aceitável?** → *"Um cancelamento pela API vai
   mostrar 'Cancelada por integracao-tars@janus.internal' no drawer. Aceitável, ou quer selo 'via
   integração X' também na linha de decisão?"* — decisão de produto; nunca foi visto porque nunca
   aconteceu.
8. **Qual é a política pretendida para mudança que quebra?** → *"Com dois integradores, como uma
   mudança incompatível é anunciada e com quanto de antecedência?"* Hoje não há nenhuma.
9. **`.env.local` desta máquina aponta para a produção real?** Todas as medições de estado saíram do
   `SUPABASE_DB_URL` desse arquivo. As contagens batem com a narrativa das migrations (`0227`
   descrevia a chave 47 revogada com 0 chamadas; hoje ela não existe e a 48 está ativa), o que é
   forte indício — mas não é confirmação formal.

## Barreiras com limite conhecido

Cada proteção desta camada e o que ela **não** cobre.

| Barreira | Cobre | **Não cobre** |
|---|---|---|
| **Segredo só em resumo SHA-256** | Vazamento do banco não revela segredos utilizáveis | Sem sal e sem KDF — só é seguro porque o segredo é aleatório de 160 bits. Se algum dia o segredo for fornecido ou derivado de nome, tabela pré-computada quebra. E sem prefixo pesquisável, **um segredo encontrado num log de terceiro não pode ser atribuído a uma chave** sem recalcular o resumo. |
| **Busca por igualdade de resumo em índice** | Ataque de tempo contra o segredo | Não esconde a existência da porta: cabeçalho ausente rejeita sem tocar o banco; cabeçalho errado toca. |
| **Índice parcial `WHERE ativo` + checagem repetida em cada RPC** | Revogação vale na chamada seguinte, sem janela e sem cache | Não cancela nada do que já foi criado; não libera o nome (UNIQUE); não avisa ninguém; e é reversível por `UPDATE` direto (D10). |
| **401 indistinguível** | Não diz se a chave existe ou foi revogada | Não é sondagem-proof: **não há limite de taxa**, então tentativas ilimitadas são gratuitas. |
| **Isenção do proxy por prefixo `/api/externo/`** | Deixa a família autenticar por chave em vez de sessão | **Fail-open.** Rota nova sob o prefixo nasce isenta e só fica protegida se lembrarem de chamar `autenticarChamada`. `API_AUTH_PROPRIA_PREFIXOS` não é exportado e não tem sonda — ao contrário de `API_AUTH_PROPRIA`, que tem. **A barreira mais frágil desta camada.** |
| **Autenticação na primeira linha de cada handler** | Os 4 handlers de hoje | É convenção, não enforcement: nenhum wrapper, nenhum lint, nenhum teste que varra `src/app/api/externo/**`. |
| **Teto de 64 KiB em dois níveis** | Corpo grande no `POST /solicitacoes`, inclusive comprimido | Não vale para `POST …/cancelar` (que não lê corpo) nem para as respostas — a busca por `referencia_origem` **não tem `LIMIT`**. |
| **`traduzirErroRpc` com whitelist de 422** | Nunca vaza detalhe interno; nunca marca 422 por engano | Erro de validação **novo** no banco, não acrescentado à lista em TypeScript, chega como `500` — e o integrador retenta para sempre um pedido que nunca vai passar. |
| **Narrowings defensivos (drift → 500)** | Degradação silenciosa por mudança de shape | Só a **forma**: um campo com a forma certa e valor errado passa incólume. |
| **Idempotência por índice único parcial + captura de `unique_violation`** | Duplicata, inclusive em corrida simultânea, sem bloqueio | **Não valida o payload do reenvio.** Chave reusada com conteúdo diferente responde `200` de sucesso e **descarta o pedido novo em silêncio**. Janela infinita: a chave tem de ser única na história, não no dia. |
| **Escopo `origem_chave_id = p_chave_id`** | Chave A não lê nem cancela o que a chave B criou; solicitação da tela é invisível | Dentro da própria chave **não há escopo nenhum**: todos os tipos expostos, todas as equipes, qualquer pessoa ativa como solicitante. |
| **`404` indistinguível na consulta por id** | Não vira oráculo de existência de ids alheios | A busca por `referencia_origem` não tem o mesmo cuidado — ela é escopada, mas confirma quantos pedidos daquela chave carregam aquela referência. |
| **`exposto_via_api` como único interruptor** | Tipo não exposto é inalcançável (`TIPO_INVALIDO`), inclusive na descoberta | É **global**, não por chave: um clique muda o contrato de todas as chaves ao mesmo tempo, sem confirmação, sem aviso e sem período de graça. |
| **`TIPO_EXIGE_ANEXO` + campo `anexo` omitido da descoberta** | Tipo que exige anexo não entra pela API meio-preenchido | Tipo com anexo **opcional** é criável via API e chega sem o anexo — a RPC só barra o obrigatório. |
| **Solicitante tem de ser pessoa cadastrada e ativa** | Solicitação órfã, sem dono humano, sem quem cancele pela tela | Qualquer e-mail ativo serve: **a chave pode abrir pedido em nome de qualquer pessoa da plataforma**, sem consentimento dela — e ela recebe o e-mail. |
| **Robô `ativo=false` + `role_id=NULL`** | Robô nunca passa em `exigir_acesso`, em nenhuma RPC nem página | Barreira de **autorização**, não de autenticação: a conta existe e está confirmada no Auth (`banned_until` nulo). O que protege a *autenticação* é a senha descartada e o domínio não-roteável — nenhum dos dois declarado ou verificado. |
| **Guard triplo (página + action + banco) na administração** | Quem não tem a área `solicitacoes` não cria nem revoga chave | O passo 1 da criação (`admin.auth.admin.createUser`) usa **service role** e não passa por `exigir_acesso` — sua única proteção é o `requireAreaAction` da Server Action. |
| **Log de auditoria best-effort** | Registra as 4 rotas com quem, quando, resultado; falha nunca derruba a resposta | Não guarda método, id real, IP, cliente, corpo, latência nem identificador de correlação (§6.2). Numa credencial vazada, **não responde "de onde veio"**. Nunca purgado. Visível só nas 50 últimas linhas pela tela. |
| **Ausência de chamada de saída** | Elimina o modo de falha do push (fila que desiste → evento perdido) e não exige nada da rede do integrador | Transfere a pontualidade **inteira** para o integrador; sem lote, sem "o que mudou desde X", sem cursor: N pedidos em voo = N requisições por ciclo. |
| **`GET /tipos` como fonte viva do contrato** | Slug, rótulo, tipo de campo e equipes nunca divergem do cadastro | **Não descreve nada mais:** não expõe os estados possíveis (que a `CHECK` do banco conhece), o envelope, os códigos de erro nem as regras de idempotência. Esses três só existem em prosa escrita à mão, em duas cópias. |
| **Cabeçalhos de segurança de `next.config.ts`** | HSTS, `nosniff`, anti-enquadramento, `Referrer-Policy` em `/:path*` | Não há CSP (decisão registrada). Nenhum deles tem efeito sobre um cliente servidor-para-servidor. |
| **Ausência de CORS** | Torna a API inutilizável a partir de um navegador de outra origem — o que é correto para credencial de portador | É **propriedade emergente**, não decisão escrita. Nenhum teste a protege; um `OPTIONS` acrescentado por engano a qualquer rota desta família a desfaz. |
