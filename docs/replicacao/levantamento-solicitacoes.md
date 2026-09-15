# Levantamento as-built — Motor de Solicitações

> **Data:** 2026-09-15 · **Commit de referência:** `62bd8b9` (merge do PR #273, v5.11.0)
> **Regime:** só-leitura. Conexão direta a produção travada em
> `SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY`; nenhuma escrita, nenhuma migration.
> **Regra de verdade:** código e catálogo vivos. Banco lido por `pg_get_functiondef` e
> `pg_catalog`, nunca pela migration de origem. Toda afirmação carrega evidência
> (`caminho:linha` ou a consulta).

## O que NÃO foi coberto, e por quê

| Fora | Motivo |
|---|---|
| Fluxo de **pedido de acesso** (`solicitar_acesso`, `app.rbac_solicitacoes`, `/solicitar-acesso`, `admin_decidir_solicitacao`, `admin_listar_solicitacoes`, `admin_acesso_solicitacoes_pendentes`) | Recorte explícito: é outro mecanismo, já levantado. A colisão de nome é só nome — não compartilha tabela, RPC nem tela com o motor. |
| **Transporte** da API externa: autenticação por chave, formato dos endpoints, versionamento, ciclo de vida da chave, limite de payload, `app.api_chave`, `app.api_chamada` | Recorte explícito. Entra aqui só a fatia que é propriedade do **tipo** (§9). |
| Comportamento em navegador (render real, foco, teclado) | Levantamento estático; nenhum servidor foi subido. Telas descritas pelo código (§7). |
| **Volumetria de e-mail efetivamente entregue** | O envio é best-effort e não deixa registro em tabela — só `console.error` em falha. Não há como medir taxa de entrega pelo banco. |

---

## 1. Modelo de dados

Quatro tabelas, todas no schema `app`. **Nenhuma tem policy de RLS e nenhuma tem `GRANT`
para `anon` ou `authenticated`** — `relrowsecurity = true` com zero linhas em `pg_policies`,
e `information_schema.role_table_grants` só lista `postgres`. Consequência estrutural: as
tabelas são **inalcançáveis pelo PostgREST**. Todo acesso, de leitura e de escrita, passa
por RPC `SECURITY DEFINER`. Isso é o alicerce de tudo o que vem depois — não há "e se
alguém consultar a tabela direto": não dá.

Nenhuma das quatro tem trigger (`pg_trigger` sem linhas não-internas). Não há coluna de
`atualizado_em` em `solicitacao` — o histórico é reconstruído das colunas de decisão (§4).

### 1.1 `app.solicitacao` — a solicitação (121 linhas)

| # | Coluna | Tipo | Nulo | Default |
|---|---|---|---|---|
| 1 | `id` | `bigint` | não | identidade (`solicitacao_id_seq`) |
| 2 | `tipo_id` | `bigint` | não | — |
| 3 | `solicitante_id` | `uuid` | não | — |
| 4 | `destinatario_user_id` | `uuid` | sim | — |
| 5 | `destinatario_role_id` | `bigint` | sim | — |
| 6 | `data_limite` | `date` | **não** | — |
| 7 | `descricao` | `text` | sim | — |
| 8 | `respostas` | `jsonb` | não | `'[]'::jsonb` |
| 9 | `status` | `text` | não | `'aberta'` |
| 10 | `decidido_por` | `uuid` | sim | — |
| 11 | `decidido_em` | `timestamptz` | sim | — |
| 12 | `justificativa` | `text` | sim | — |
| 13 | `criado_em` | `timestamptz` | não | `now()` |
| 14 | `origem_chave_id` | `bigint` | sim | — |
| 15 | `chave_idempotencia` | `text` | sim | — |
| 16 | `referencia_origem` | `text` | sim | — |
| 17 | *(dropada)* | — | — | resquício de `ALTER TABLE ... DROP COLUMN`; `attisdropped=true` |
| 18 | `aprovado_por` | `uuid` | sim | — |
| 19 | `aprovado_em` | `timestamptz` | sim | — |

**Restrições CHECK** — são a máquina de estados declarada em forma de invariante:

```
solicitacao_status_check        status IN ('aberta','aprovada','concluida','rejeitada','cancelada')
solicitacao_destinatario_xor    (destinatario_user_id IS NOT NULL)::int
                              + (destinatario_role_id IS NOT NULL)::int = 1
solicitacao_terminal_decidido   status IN ('aberta','aprovada')
                                OR (decidido_por IS NOT NULL AND decidido_em IS NOT NULL)
solicitacao_aprovada_registrada status <> 'aprovada'
                                OR (aprovado_por IS NOT NULL AND aprovado_em IS NOT NULL)
solicitacao_justificativa_rejeitada
                                status <> 'rejeitada'
                                OR (justificativa IS NOT NULL AND length(btrim(justificativa)) > 0)
```

Ler o `terminal_decidido` ao contrário dá a definição de "estado vivo": os estados que o
CHECK **dispensa** de decisão terminal são exatamente `aberta` e `aprovada`. É por isso que
o TypeScript consegue derivar `STATUS_EM_ANDAMENTO` do texto do CHECK sem duplicar a lista
(`src/lib/solicitacoes/ciclo-de-vida.test.ts:78-86`).

**FKs:** `tipo_id → app.solicitacao_tipo(id)` (sem `ON DELETE` — é o que faz o tipo com
solicitações ser indeletável, §2); `solicitante_id`, `destinatario_user_id`, `decidido_por`,
`aprovado_por → auth.users(id)`; `destinatario_role_id → app.rbac_roles(id)`;
`origem_chave_id → app.api_chave(id)`.

**Índices:** `(solicitante_id, status)`; `(destinatario_user_id, status) WHERE NOT NULL`;
`(destinatario_role_id, status) WHERE NOT NULL`; `(tipo_id, status, data_limite)`;
`UNIQUE (origem_chave_id, chave_idempotencia) WHERE ambos NOT NULL`;
`(origem_chave_id, referencia_origem) WHERE ambos NOT NULL`. Os três primeiros são as
três perguntas de visibilidade (§5) viradas em índice parcial.

**Quem escreve:** só seis RPCs, todas `SECURITY DEFINER`. `criar_solicitacao` e
`criar_solicitacao_externa` (INSERT); `solic_aprovar`, `solic_concluir`, `solic_rejeitar`,
`solic_cancelar`, `cancelar_solicitacao_externa` (UPDATE de status). **Nenhuma RPC faz
DELETE de solicitação** — não existe caminho de exclusão em lugar nenhum do sistema.

### 1.2 `app.solicitacao_tipo` — o tipo (7 linhas)

`id`, `nome text NOT NULL`, `arquivado boolean NOT NULL DEFAULT false`, `criado_por uuid`,
`criado_em timestamptz NOT NULL DEFAULT now()`, `atualizado_em timestamptz NOT NULL
DEFAULT now()`, `slug text` (`UNIQUE WHERE slug IS NOT NULL`), `exposto_via_api boolean
NOT NULL DEFAULT false`.

O que **não** existe é tão informativo quanto o que existe: não há coluna de área, de
atendente, de prazo padrão, de prefixo de numeração, de visibilidade, nem de "tipo de
sistema". Um tipo é **nome + campos + slug + um booleano de exposição**, e nada mais.
Atendente e prazo são propriedade **da solicitação**, não do tipo (§2, §5).

**Quem escreve:** `admin_solic_salvar_tipo` (INSERT/UPDATE), `admin_solic_arquivar_tipo`
(UPDATE de `arquivado`), `admin_solic_tipo_api_config` (UPDATE de `exposto_via_api`),
`admin_solic_excluir_tipo` (DELETE, condicionado).

### 1.3 `app.solicitacao_campo` — a definição de campo (44 linhas)

`id`, `tipo_id bigint NOT NULL` (FK **`ON DELETE CASCADE`**), `ordem int NOT NULL`,
`rotulo text NOT NULL`, `tipo_campo text NOT NULL`, `obrigatorio boolean NOT NULL DEFAULT
false`, `opcoes jsonb`, `data_permite_passado boolean NOT NULL DEFAULT true`,
`data_aviso_dias_futuro int`, `data_aviso_direcao text NOT NULL DEFAULT 'acima'`,
`chave text` (`UNIQUE (tipo_id, chave) WHERE chave IS NOT NULL`).

```
solicitacao_campo_tipo_campo_check     tipo_campo IN ('texto_curto','texto_longo','numero',
                                                      'moeda','data','selecao','anexo')
solicitacao_campo_selecao_opcoes       (tipo_campo = 'selecao' AND opcoes IS NOT NULL
                                        AND jsonb_typeof(opcoes)='array'
                                        AND jsonb_array_length(opcoes) > 0)
                                       OR tipo_campo <> 'selecao'
solicitacao_campo_data_aviso_direcao   data_aviso_direcao IN ('acima','abaixo')
```

**Sete tipos de campo, e não há campo condicional.** Nenhuma coluna referencia outro campo;
`admin_solic_salvar_tipo` não lê nada parecido com uma condição; o motor de render
(`src/components/solicitacoes/campos-dinamicos.tsx:35`) faz um `.map` plano sobre a lista.
Um formulário é uma lista linear — todos os campos sempre visíveis, sempre na ordem
`ordem`. **Ordem é posição inteira reatribuída do zero a cada save** (§2.1), não um valor
que o admin digita.

O único parâmetro por campo além de rótulo/tipo/obrigatoriedade/opções é a **regra de data**
(três colunas, todas só relevantes quando `tipo_campo='data'`): `data_permite_passado` é
**bloqueante e validada no servidor**; `data_aviso_dias_futuro` + `data_aviso_direcao`
formam um **aviso não-bloqueante que só existe no cliente** — nenhuma linha de SQL as lê
para validar (§3.4).

`chave` é o identificador **estável** do campo — o contrato com a API externa. Existe
porque `id` não é estável: ver §1.5.

**Quem escreve:** só `admin_solic_salvar_tipo`, e só por `DELETE` + `INSERT` em bloco.

### 1.4 `app.solicitacao_anexo` — o anexo (102 linhas)

`id`, `solicitacao_id bigint NOT NULL` (FK **`ON DELETE CASCADE`**), `campo_id bigint`
(**sem FK — deliberado**, §1.5), `storage_path text NOT NULL UNIQUE`, `nome_arquivo text
NOT NULL`, `mime text NOT NULL`, `tamanho_bytes bigint NOT NULL`, `criado_por uuid`
(FK `auth.users`, **anulável**), `criado_em timestamptz NOT NULL DEFAULT now()`.

Índice `(solicitacao_id)`. `storage_path` é único: o mesmo objeto não pode ser registrado
duas vezes.

`criado_por` ser anulável é a razão de todo predicado de autoria no SQL usar
`coalesce(..., false)` — em Postgres `NULL = uid` é `NULL`, `NOT NULL` é `NULL`, e um
`IF NOT (...) THEN RAISE` **não dispara** com `NULL`. Sem o coalesce, um anexo sem autor
seria excluível por qualquer um que enxergasse a solicitação. Medido hoje: **0 anexos com
`criado_por` nulo** — a trava é preventiva, não corretiva.

**Quem escreve:** `criar_solicitacao` e `solic_anexar` (INSERT), `solic_anexo_excluir`
(DELETE), `solic_promover_anexos` (UPDATE de `storage_path`).

### 1.5 Como o tipo define o formulário, e como os valores são guardados

**Definição:** tabela de campos (`solicitacao_campo`), uma linha por campo, ligada ao tipo,
ordenada por `ordem`. Não é documento JSON.

**Valores preenchidos:** **nem coluna por campo, nem tabela de pares — um documento
estruturado**. `solicitacao.respostas` é um **array JSONB** cujos elementos têm a forma:

```json
{ "campo_id": 123, "rotulo": "Valor do pagamento", "tipo_campo": "moeda",
  "obrigatorio": true, "opcoes": null, "valor": "8840,00" }
```

Um elemento **por campo do tipo**, na ordem `ordem`, **inclusive os não preenchidos**
(`valor: null`). Campo de anexo entra com `valor` sempre `null` — o arquivo vive em
`solicitacao_anexo`, o elemento do array registra que o campo existia e era obrigatório.
Construído por `app.solic_validar_e_snapshotar` (§3.2). Medido: **955 pares campo-valor
em 121 solicitações**.

**O snapshot: o que congela, por quê, e o que sobrevive à edição do tipo.**

Congela seis coisas: `campo_id`, `rotulo`, `tipo_campo`, `obrigatorio`, `opcoes`, `valor`.
Não congela: `ordem` (é a posição no array), `chave`, `data_permite_passado`,
`data_aviso_dias_futuro`, `data_aviso_direcao`.

O porquê é mecânico, e é a decisão mais consequente do modelo inteiro. `admin_solic_salvar_tipo`
**não faz UPDATE dos campos — faz `DELETE FROM app.solicitacao_campo WHERE tipo_id = v_id`
seguido de INSERT do lote inteiro**. Toda edição de tipo, mesmo trocar uma vírgula num
rótulo, destrói as linhas de campo e cria linhas novas com **`id` novo**. Logo:

- `respostas[].campo_id` de uma solicitação antiga **aponta para uma linha que não existe
  mais**. Não é bug: é por isso que o snapshot carrega `rotulo`, `tipo_campo` e `opcoes` —
  ele se lê **sozinho**, sem nunca voltar a `solicitacao_campo`. A tela renderiza o
  histórico com o rótulo da época, não com o rótulo de hoje.
- `solicitacao_anexo.campo_id` **não tem FK** exatamente por isso. Uma FK obrigaria
  `ON DELETE CASCADE` (apagaria anexos históricos a cada edição de tipo) ou `RESTRICT`
  (tornaria o tipo ineditável). A ausência de FK é a terceira opção: o ponteiro vira
  histórico e se aceita que penda.

**Medido em produção (a consequência, não a teoria):** dos 955 pares campo-valor, **171
(17,9%) apontam para um `campo_id` que não existe mais**, espalhados por **33 das 121
solicitações (27%)**. Dos 89 anexos com `campo_id`, **9 apontam para campo removido**.
Toda essa massa continua renderizando corretamente — a prova viva de que o snapshot é
autossuficiente.

**O que acontece com uma solicitação já criada quando o tipo é editado depois:** nada, na
prática visível — ela segue exibindo os rótulos, tipos e opções de quando foi aberta. O que
muda de fato é que `campo_id` deixa de resolver e que qualquer regra que consulte
`solicitacao_campo` a partir de uma solicitação antiga passa a não achar nada (o motor
atual não faz isso em lugar nenhum; ver §11, item 4, para a regra que fazia e foi removida).

### 1.6 Contagens vivas (2026-09-15, agregados; nenhum dado pessoal)

| Tabela | Linhas |
|---|---|
| `app.solicitacao` | **121** |
| `app.solicitacao_tipo` | **7** |
| `app.solicitacao_campo` | **44** |
| `app.solicitacao_anexo` | **102** |

**Por tipo** (todos ativos; nenhum arquivado hoje):

| id | Nome | slug | Exposto API | Campos | Solicitações |
|---|---|---|---|---|---|
| 7 | Contas a pagar | `contas_a_pagar` | não | 11 | 26 |
| 8 | Pagamentos fora do prazo | `pagamentos_fora_do_prazo` | não | 9 | 38 |
| 9 | Abatimento de créditos | `abatimento_de_creditos` | **sim** | 4 | 23 |
| 10 | Registro de prejuízos | `registro_de_prejuizos` | não | 4 | 5 |
| 11 | Compras e reparos | `compras_e_reparos` | não | 3 | 10 |
| 12 | Atualização cadastral | `atualizacao_cadastral` | não | 2 | **0** |
| 42 | Lançamentos do cartão Clara | `lancamento_clara` | não | 11 | 19 |

**Por estado:**

| Status | Total | De origem externa | Para role | Para usuário |
|---|---|---|---|---|
| `concluida` | 81 | 0 | 75 | 6 |
| `rejeitada` | 19 | 0 | 19 | 0 |
| `aberta` | 8 | 0 | 5 | 3 |
| `cancelada` | 8 | 0 | 3 | 5 |
| `aprovada` | 5 | 0 | 4 | 1 |

**Dois fatos que valem para o desenho da réplica:** (a) **nenhuma das 121 solicitações veio
da API externa** — o caminho externo está construído, exposto num tipo e nunca exercitado em
produção; (b) **86% vão para uma role, não para uma pessoa** — o destino normal é uma
equipe, e o destino individual é a exceção.

**Campos por tipo de campo:** `texto_curto` 20 (14 obrigatórios), `texto_longo` 7 (6),
`moeda` 5 (5), `anexo` 4 (3), `selecao` 4 (4), `data` 3 (3), `numero` 1 (1). **Dos 44
campos, 36 são obrigatórios** — o formulário típico deste produto é quase todo obrigatório.

**Anexos:** 89 vinculados a campo, 13 livres; 0 sem autor. Tamanho de 7 KB a 2,44 MB,
média 180 KB. Três MIMEs em uso: `application/pdf` (51), `image/png` (38), `image/jpeg` (13).

---

## 2. Configuração de tipo

**Onde e por quem.** Tela `/admin/solicitacoes`
(`src/app/admin/solicitacoes/page.tsx:18`), guardada por `requireArea('solicitacoes')` e
revalidada no banco por `PERFORM app.exigir_acesso(ARRAY['solicitacoes'])` dentro de cada
RPC `admin_solic_*`. **Área `solicitacoes` = gestão** — hoje 2 roles, 5 usuários ativos.
A configuração de **exposição via API** mora em outra tela, `/admin/api-externa`
(`src/components/admin/api-externa/tipos-expostos.tsx`), embora a RPC de salvar o tipo
também saiba recebê-la (`p_config`) — o editor apenas não a envia
(`src/app/admin/solicitacoes/actions.ts:29-31`).

**Propriedades que um tipo carrega:** nome, lista ordenada de campos, slug, exposto-via-api,
arquivado, criado_por/criado_em/atualizado_em. **Só isso.** Não carrega área exigida, nem
atendentes, nem prazo, nem regra de numeração, nem visibilidade. Quem atende e em quanto
tempo é escolhido **por solicitação**, no momento da abertura, pelo solicitante (§5.3).

**O que a edição valida** (`public.admin_solic_salvar_tipo`, corpo vivo):

1. `app.exigir_acesso(ARRAY['solicitacoes'])`.
2. `p_nome` não vazio após `btrim` → senão `NOME_OBRIGATORIO`.
3. Por campo: `tipo_campo` ∈ os 7 → senão `TIPO_CAMPO_INVALIDO`; `rotulo` não vazio →
   senão `ROTULO_OBRIGATORIO`; se `selecao`, `opcoes` precisa ser array não-vazio → senão
   `OPCOES_OBRIGATORIAS`.
4. `chave`: se o payload traz uma, normaliza (`lower`+`btrim`) e exige
   `^[a-z0-9_]{1,60}$` → senão `CHAVE_INVALIDA`. Se não traz, gera de `app.slugificar(rotulo)`.

**O que NÃO valida:** nada impede zero campos (tipo sem campos é legal), nem rótulos
duplicados no mesmo tipo, nem opções duplicadas dentro de um `selecao`, nem número máximo
de campos. Nomes de tipo duplicados são permitidos (só o `slug` é único, e ele desambigua
com sufixo).

### 2.1 A mecânica do save: apaga-e-recria, e a chave que sobrevive a ele

Na **criação** (`p_id IS NULL`): gera `slug` de `app.slugificar(nome)`, desambigua com
`_2`, `_3`… até não colidir, e grava. **O slug nunca muda depois** — no ramo de edição o
UPDATE sequer lê `p_config->>'slug'`; o comentário no corpo diz isso explicitamente.

Na **edição**: atualiza `nome`, `atualizado_em`, opcionalmente `exposto_via_api`
(só se `p_config ? 'exposto_via_api'`), depois **`DELETE FROM app.solicitacao_campo WHERE
tipo_id = v_id`** e reinsere a lista inteira com `ordem` recontada de 1 em diante.

Esse apaga-e-recria é o que torna a `chave` necessária, e o algoritmo dela é sutil o
bastante para merecer reconstrução exata:

- **Antes** do DELETE, captura `v_chaves_previas` = todas as chaves vigentes do tipo.
- Campo que **traz** chave no payload (campo preexistente; a UI a reexibe read-only e a
  reenvia — `src/components/admin/solicitacoes/editor-tipo.tsx:173`): valida o formato e
  desambigua **só contra o lote atual** (`v_chaves_usadas`). Reafirmar a própria chave não
  gera sufixo — que é o caso comum, e o ponto todo.
- Campo **sem** chave (campo novo): gera de `slugificar(rotulo)` e desambigua contra o lote
  atual **e contra `v_chaves_previas`** — para que um campo novo nunca herde por acaso o
  identificador de um campo que acabou de ser removido nesta mesma edição. Herdar
  silenciosamente mudaria o significado de uma chave já publicada ao integrador.

`app.slugificar(text)` (`IMMUTABLE`): translitera acentuação PT-BR e `ç`/`ñ`, minúsculas,
`[^a-z0-9]+` → `_`, trunca em 60, tira `_` das pontas; string vazia vira `'campo'`.

**O editor no cliente** (`editor-tipo.tsx`) oferece: adicionar campo, remover campo,
reordenar com ↑/↓ (`mover`, linhas 106, 377-389), editar rótulo/tipo/obrigatório, e
gerenciar opções de `selecao` (com a última opção não-removível, linha 295). Ao trocar o
tipo de um campo para `selecao` ele semeia `['']`; ao sair de `selecao`, zera `opcoes`
(linhas 90-101). A `chave` aparece read-only quando existe (linha 268).

### 2.2 Arquivar × excluir, e o tipo com solicitações em aberto

**Arquivar** (`admin_solic_arquivar_tipo`) é um simples `UPDATE ... SET arquivado`. **Não
há nenhuma verificação de solicitações em aberto** — arquivar um tipo com solicitações
vivas é permitido e não faz nada com elas. O efeito é exclusivamente de **abertura**:

- `solic_tipos_abertura` (o que alimenta o modal de criação) filtra `WHERE NOT t.arquivado`;
- `criar_solicitacao` recusa com `TIPO_INVALIDO` se o tipo estiver arquivado;
- `criar_solicitacao_externa` idem, e `solic_tipos_api`/`solic_tipos_documentacao` também
  filtram `NOT arquivado`.

Tudo o mais continua: a solicitação em aberto de um tipo arquivado permanece visível, no
board, na caixa de quem atende, e **todas as transições continuam funcionando** — nenhuma
RPC de transição consulta `arquivado`. Um tipo arquivado é um tipo que não recebe pedido
novo, não um tipo desligado. `admin_solic_listar_tipos` os lista (ordenados `arquivado, nome`)
e a UI oferece desarquivar. **Hoje: zero tipos arquivados.**

**Excluir** (`admin_solic_excluir_tipo`) recusa com `TIPO_EM_USO` se existir qualquer
solicitação com aquele `tipo_id` — o guard explícito vem **antes** do DELETE, e a FK sem
`ON DELETE` seria a segunda barreira se ele falhasse. A UI desabilita o botão quando
`n_solicitacoes > 0` e explica no `title`
(`src/components/admin/solicitacoes/tipos-content.tsx:179-181`), com modal de confirmação
(não `window.confirm`). O DELETE do tipo leva os campos junto via `ON DELETE CASCADE`.

**Tipo de sistema: não existe.** Nenhuma coluna, nenhum grep em `src/`, nenhuma referência
a slug fixo no catálogo vivo (consulta em `pg_proc.prosrc` por `contas_a_pagar|clara|
abatimento|prejuizo` nas funções `%solic%`: **0 linhas**). Todo tipo é editável e, se não
tiver solicitações, deletável — inclusive o exposto via API.

---

## 3. Validação

### 3.1 A pergunta central: onde a validação vive, e se há mais de uma verdade

**Para os campos dinâmicos há exatamente uma verdade, e ela está no banco.** O cliente
**não valida campo dinâmico nenhum** — nem obrigatoriedade, nem formato numérico, nem
pertinência à lista de opções. `campos-dinamicos.tsx` renderiza um `*` vermelho ao lado do
rótulo obrigatório (linha 41) e **nenhum `required`**; `modal-nova-solicitacao.tsx:64-84`
valida somente tipo, data-limite, destinatário e o estado dos uploads em voo. Não há
segundo validador para divergir.

As duas portas de **criação** (tela e API) chamam a **mesma função**,
`app.solic_validar_e_snapshotar` — a compartilhamento é explícito no corpo de
`criar_solicitacao` ("Mudar regra = mudar as DUAS portas de uma vez"). Onde as portas
diferem é **em volta** dela, não dentro (§3.5).

O que o cliente duplica é a validação de **arquivo**, e aí há três camadas — duas que
recusam e uma que só sugere (§6.1).

### 3.2 A validação no servidor, campo a campo

`app.solic_validar_e_snapshotar(p_tipo_id, p_respostas, p_anexos)` — `SECURITY DEFINER`,
`search_path = ''`. Itera `SELECT ... FROM app.solicitacao_campo WHERE tipo_id = p_tipo_id
ORDER BY ordem` e, para cada campo:

| Regra | Condição | Erro (`ERRCODE`) |
|---|---|---|
| Obrigatório (anexo) | `obrigatorio` e nenhum elemento de `p_anexos` com aquele `campo_id` | `CAMPO_OBRIGATORIO: <rotulo>` (`22023`) |
| Obrigatório (demais) | `obrigatorio` e valor nulo ou `btrim` vazio | `CAMPO_OBRIGATORIO: <rotulo>` |
| `numero`/`moeda` | valor não casa `^-?[0-9]+([.,][0-9]+)?$` | `VALOR_INVALIDO: % deve ser numérico` |
| `data` | valor não casa `^\d{4}-\d{2}-\d{2}$` | `VALOR_INVALIDO: % deve ser data (AAAA-MM-DD)` |
| `data` no passado | `NOT data_permite_passado` e `valor::date < (now() AT TIME ZONE 'America/Sao_Paulo')::date` | `VALOR_INVALIDO: % não admite data no passado` |
| `selecao` | `NOT (opcoes @> to_jsonb(valor))` | `VALOR_INVALIDO: opção inexistente em %` |

Três detalhes que uma reimplementação erra se não os notar:

1. **As regras de formato só rodam em valor não-vazio.** Campo opcional em branco atravessa
   sem validação — só a obrigatoriedade olha o vazio.
2. **`numero` e `moeda` aceitam vírgula OU ponto** como separador, e um único separador. A
   desambiguação BR/US acontece **na leitura**, não na gravação: o valor é guardado como a
   string que veio, e `fmtValor` (`src/lib/solicitacoes/format.ts:73-78`) aplica `toNum` do
   módulo canônico de coerção na hora de exibir. O banco nunca vê um número.
3. **"Hoje" é o dia em São Paulo, não `current_date`.** O fuso está literal no corpo da
   função.

Depois de validar, o mesmo laço acumula o elemento do snapshot. **Validar e snapshotar são
a mesma passagem** — não há janela em que um valor válido deixe de ser congelado.

### 3.3 O caso de borda que decide o desenho: campo que o tipo não conhece

O laço percorre **os campos do tipo**, não as chaves do payload. Um `campo_id` presente em
`p_respostas` que não pertença ao tipo é **silenciosamente descartado**: nunca é lido, nunca
entra no snapshot, nunca gera erro. Pelo caminho da tela isso é inalcançável na prática (o
modal só renderiza os campos que a RPC devolveu, e troca de tipo limpa os valores —
`modal-nova-solicitacao.tsx:39-43`), mas é o comportamento de um POST forjado.

O caminho externo faz o **oposto**: `criar_solicitacao_externa` traduz chave→`campo_id`
com uma busca por chave e levanta `CAMPO_DESCONHECIDO: <chave>` se não achar. **A API é
mais estrita que a tela neste ponto** — é a única assimetria real de validação entre as
duas portas.

### 3.4 As bordas restantes

- **Campo obrigatório vazio:** `CAMPO_OBRIGATORIO`, traduzido na action para "Preencha
  todos os campos obrigatórios." (`src/app/solicitacoes/actions.ts:332`). A mensagem do
  banco nomeia o campo; a tradução da UI **descarta o nome** e mostra o texto genérico.
- **Valor fora da lista:** `opcoes @> to_jsonb(valor)` — contenção de JSONB, comparação
  exata, sensível a caixa e a espaços (o valor não sofre `btrim` antes da checagem, só a
  checagem de vazio o faz).
- **Tipo de dado errado:** só `numero`, `moeda` e `data` têm formato. `texto_curto` e
  `texto_longo` aceitam qualquer string, sem limite de tamanho — não há `varchar(n)` nem
  CHECK de comprimento em lugar nenhum.
- **Campo novo adicionado depois da abertura:** não retroage. O snapshot da solicitação
  antiga não ganha o elemento; a tela mostra o que foi respondido.
- **Campo que não existe mais no tipo:** o snapshot continua exibindo (§1.5).
- **A regra de aviso de data (`data_aviso_dias_futuro`/`data_aviso_direcao`) não existe no
  servidor.** Nenhuma função do catálogo a lê. É calculada e exibida só em
  `campos-dinamicos.tsx:53-76`, como um parágrafo de atenção, e some se o usuário abrir o
  formulário com JavaScript desligado ou postar direto. Já o `data_permite_passado` tem os
  dois lados: `min` no `<input type="date">` (cosmético) e o `RAISE` no servidor (a barreira).

### 3.5 Há teste que prove a paridade?

Há um teste de paridade, mas ele prova **um par diferente** do que a pergunta sugere:
`src/lib/solicitacoes/ciclo-de-vida.test.ts` prova que a união de literais TypeScript
(`STATUS_SOLIC`, `STATUS_EM_ANDAMENTO`) espelha os CHECKs e as travas das RPCs — porque
`tsc` não pega essa divergência (os pontos que decidem por status usam `switch` com
`default`, então um estado novo é tratado em silêncio como "aberta" ou "encerrada" e o
build passa verde).

Duas limitações que importam para quem for replicar:

1. **O teste lê arquivos de migration, não o catálogo vivo.** `sqlLimpo(...)` abre
   `supabase/migrations/0261…`, `0265…`, e `sqlLimpoEm` tenta dois caminhos para a `0262`.
   O próprio arquivo avisa (linhas 22-26): migration aplicada é registro imutável, então
   uma alteração futura virá numa migration nova e o teste seguirá aprovando um espelho
   obsoleto. É espelho de **texto de arquivo**, não do que está implantado.
2. **Não existe teste de paridade da validação de campo** — nem poderia haver muito o que
   comparar, já que o cliente não valida campo dinâmico.

`src/lib/rpc-contrato.test.ts:296-310` roda **contra produção** validando o *shape* do
retorno de 7 RPCs do módulo contra os schemas Zod, mas como service_role (uid nulo) as
listas voltam vazias — daí a fixture `SOLIC_JSON_FIXTURE` (linha 366) capturada de um
`solic_json` real, que é o que de fato exercita o item.

---

## 4. Ciclo de vida

### 4.1 Os cinco estados

| Estado | Significado |
|---|---|
| `aberta` | Pedido feito, aguardando o atendente. Estado inicial de toda solicitação, das duas portas. |
| `aprovada` | **Etapa intermediária e opcional.** Autorizado, ainda não executado ("aprovo o pagamento hoje, pago amanhã"). Continua viva: aceita anexo, continua vencendo, continua contando como pendência. |
| `concluida` | Desfecho positivo. |
| `rejeitada` | Desfecho negativo pelo atendente. Exige justificativa (CHECK + RPC). |
| `cancelada` | Desistência do solicitante (ou da integração que a criou). |

`aberta` e `aprovada` são os estados **vivos**; os outros três são **encerrados e
imutáveis** — nem transição, nem anexo novo, nem exclusão de anexo.

### 4.2 Transições: quem pode, e onde a regra é imposta

| Transição | RPC | Origem aceita | Quem pode |
|---|---|---|---|
| — → `aberta` | `criar_solicitacao` / `criar_solicitacao_externa` | — | qualquer autenticado ativo / chave ativa |
| `aberta` → `aprovada` | `solic_aprovar` | **só `aberta`** | **só o atendente** |
| `aberta`/`aprovada` → `concluida` | `solic_concluir` | `aberta`, `aprovada` | atendente **ou** solicitante |
| `aberta`/`aprovada` → `rejeitada` | `solic_rejeitar` | `aberta`, `aprovada` | **só o atendente** (+ justificativa não-vazia) |
| `aberta`/`aprovada` → `cancelada` | `solic_cancelar` | `aberta`, `aprovada` | **só o solicitante** |
| `aberta`/`aprovada` → `cancelada` | `cancelar_solicitacao_externa` | `aberta`, `aprovada` | a chave que a criou |

**Não existe:** reabrir, desaprovar, reatribuir, mudar data-limite, mudar tipo, editar
resposta, ou excluir solicitação. Nenhuma RPC faz nada disso. O estado encerrado é final.

**Como a máquina de estados é imposta — a resposta honesta é: em três lugares, e nenhum
deles é uma tabela de transições.**

1. **Os CHECKs** (§1.1) garantem as *invariantes de linha* — que `rejeitada` tem
   justificativa, que `aprovada` tem autor e instante, que estado terminal tem decisão. Eles
   não conhecem transição, só estado final válido.
2. **Cada RPC de transição** carrega a própria trava, em duas linhas idênticas repetidas:
   uma checagem de origem (`IF v_sol.status NOT IN ('aberta','aprovada')` — ou
   `<> 'aberta'` em `solic_aprovar`) e uma de papel (`app.sou_atendente` e/ou
   `solicitante_id = app.uid_jwt()`). **É condicional espalhado, não máquina declarada.**
3. **O teste `ciclo-de-vida.test.ts:88-95`** é o que amarra o espalhamento: varre
   `/v_sol\.status NOT IN \(([^)]+)\)/g` na migration e exige que **toda** trava encontrada
   seja exatamente `STATUS_EM_ANDAMENTO`, com no mínimo 4 ocorrências. É essa varredura que
   faz o papel de "declaração única" — a declaração vive no TypeScript e o teste obriga o
   SQL a concordar.

A UI espelha o mesmo conjunto em `drawer-solicitacao.tsx:171-177`: `podeAprovar = status
=== 'aberta' && sou_atendente`, `podeConcluir = emAnd && (sou_atendente || sou_solicitante)`,
`podeRejeitar = emAnd && sou_atendente`, `podeCancelar = emAnd && sou_solicitante` — quarto
espelho, este puramente de afordância.

### 4.3 O que acontece a uma solicitação em voo

- **O tipo muda:** nada (§1.5, §2.2). O snapshot a sustenta; arquivar não a atinge.
- **O atendente sai.** Depende de qual atendente:
  - *Destino = role* (86% dos casos): nada quebra. Quem herdar a role atende. Se a role
    ficar sem membros, ninguém pode aprovar/rejeitar/concluir e a solicitação fica presa,
    visível só ao solicitante e à gestão — mas o **solicitante ainda pode concluir ou
    cancelar**, o que é a válvula de escape.
  - *Destino = usuário*: se o usuário for desativado, `app.minha_role_id()` e as checagens
    de `app.rbac_usuarios ... AND ativo` deixam de valer para ele, e `app.exigir_acesso`
    o barra logo na porta com `USUARIO_INATIVO`. A solicitação fica sem atendente possível;
    de novo, o solicitante pode concluir ou cancelar. **Não há reatribuição.**
- **O solicitante é desativado:** a solicitação continua. Ele para de conseguir entrar
  (`exigir_acesso` levanta `USUARIO_INATIVO`) e **para de receber e-mail**, porque
  `solic_emails_envolvidos` só inclui o autor `AND ativo`. O atendente segue podendo
  concluir ou rejeitar normalmente.
- **A role destinatária é excluída:** impedido pela FK `destinatario_role_id →
  app.rbac_roles(id)` sem `ON DELETE`.

### 4.4 Movimentações: uma projeção, não um log

**Não existe tabela de eventos.** `public.solic_movimentacoes()` (gated por
`exigir_acesso(ARRAY['solicitacoes'])` — gestão-only) monta a lista com `UNION ALL` de três
ramos sobre as próprias colunas de `app.solicitacao`:

| Ramo | Origem | Ação | Ator | Instante | Detalhe |
|---|---|---|---|---|---|
| (a) Abertura | sempre | `'Abertura'` | `solicitante_id` | `criado_em` | `NULL` |
| (b) Aprovação | `WHERE aprovado_em IS NOT NULL` | `'Aprovação'` | `aprovado_por` | `aprovado_em` | `NULL` |
| (c) Decisão terminal | `WHERE status NOT IN ('aberta','aprovada') AND decidido_em IS NOT NULL` | `'Conclusão'`/`'Rejeição'`/`'Cancelamento'` por `CASE status` | `decidido_por` | `decidido_em` | `justificativa` |

Ordenado por `em DESC, solicitacao_id DESC`. O ator é resolvido para
`coalesce(nome, email)` e pode vir `NULL` se o usuário sumiu do cadastro.

**A decisão fina que sustenta isso:** o ramo (b) filtra por `aprovado_em IS NOT NULL`, não
por `status = 'aprovada'`. É o que faz a linha de Aprovação **sobreviver à conclusão** —
uma solicitação aprovada e depois concluída mostra as três movimentações, em vez de o
presente apagar o passado. Igualmente, `solic_aprovar` **não toca `decidido_por`/
`decidido_em`** (o teste em `ciclo-de-vida.test.ts:104` proíbe explicitamente), preservando
dois pares independentes de ator+instante na mesma linha. Pelo mesmo motivo, esta projeção
consegue **no máximo três eventos por solicitação**: a linha física só tem espaço para dois
pares de decisão.

**O que não fica registrado:** anexar, excluir anexo, e qualquer tentativa recusada. Não há
timestamp de "quando o anexo entrou" na projeção (a tabela de anexo tem `criado_em`, mas
`solic_movimentacoes` não a consulta).

**Comentário visível ao solicitante × interno: não existe a distinção.** Só há um campo de
texto livre no ciclo, `justificativa`, obrigatório na rejeição, **visível a todos** que
enxergam a solicitação (`solic_json` o emite sempre) e ao e-mail de notificação. Não há
thread de comentários, nem nota interna.

### 4.5 Prazo, vencimento, reabertura, cancelamento

**`data_limite` é `NOT NULL` e obrigatória nas duas portas** — não há prazo default nem
derivado do tipo. A UI sugere em texto de ajuda "Prazo padrão de 3 dias"
(`modal-nova-solicitacao.tsx:133`) mas **não preenche nada**: é orientação, não default.

**Vencimento é derivado, nunca persistido.** `vencida(dataLimite, status)`
(`src/lib/solicitacoes/format.ts:57-59`) = `emAndamento(status) && dataLimite < hojeSP()`,
com `hojeSP()` via `Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' })`.
Consequências: **`aprovada` continua vencendo** (o prazo corre até o desfecho, não até a
autorização) e **encerrada nunca vence** (o prazo parou de correr). Não há job, notificação
de vencimento, nem escalonamento — o vencimento existe só como cor vermelha no card e como
ordenação que **não** é usada (a lista ordena por `criado_em DESC`, não por urgência;
`format.ts:96-103` documenta que isso foi pedido explícito e o que se perdeu com a troca).

**Reabertura: não existe.** **Cancelamento** é exclusivo do solicitante (ou da chave de
origem), vale nos dois estados vivos, e a UI pede confirmação em modal.

---

## 5. Visibilidade por linha

### 5.1 As duas funções que decidem tudo

Ambas em `app`, `STABLE SECURITY DEFINER`, `search_path = ''`, recebendo a **linha inteira**
(`app.solicitacao`) como parâmetro — o que permite chamá-las dentro de um `SELECT` sem
refazer o `SELECT` da linha.

```sql
CREATE OR REPLACE FUNCTION app.pode_ver_solic(p_sol app.solicitacao) RETURNS boolean AS $$
  SELECT app.tem_area('solicitacoes')
      OR coalesce(p_sol.solicitante_id       = app.uid_jwt(),      false)
      OR coalesce(p_sol.destinatario_user_id = app.uid_jwt(),      false)
      OR coalesce(p_sol.destinatario_role_id = app.minha_role_id(), false);
$$;

CREATE OR REPLACE FUNCTION app.sou_atendente(p_sol app.solicitacao) RETURNS boolean AS $$
  SELECT coalesce(p_sol.destinatario_user_id = app.uid_jwt(),      false)
      OR coalesce(p_sol.destinatario_role_id = app.minha_role_id(), false);
$$;
```

**Quatro caminhos para ver, dois para atender, e nenhum outro.** `sou_atendente` é
literalmente `pode_ver_solic` menos a área de gestão e menos a autoria.

**O `coalesce(..., false)` não é decorativo.** Numa solicitação atribuída a uma *role*,
`destinatario_user_id` é `NULL`; `NULL = uid` é `NULL`; e `NULL OR false` é `NULL`, que num
`IF NOT (...) THEN RAISE` **não dispara**. Sem o coalesce, a negação seria pulada e a
permissão vazaria. O corpo vivo de `solic_anexar` documenta que essa foi exatamente a falha
corrigida, e que a proteção mora **dentro** de `sou_atendente`, não nos chamadores.

Dependências: `app.uid_jwt()` extrai `sub` de `request.jwt.claims`;
`app.minha_role_id()` = `SELECT role_id FROM app.rbac_usuarios WHERE user_id = app.uid_jwt()
AND ativo` — **um usuário tem exatamente uma role**, o que é o que permite comparar com
`=` em vez de `IN`; `app.tem_area(p_area)` = existe permissão daquela área na role do
usuário **ativo**.

### 5.2 Os papéis efetivos

| Papel | Como se qualifica | Vê | Pode fazer |
|---|---|---|---|
| **Solicitante** | `solicitante_id = uid` | a própria solicitação | criar; anexar (livre); excluir o próprio anexo livre; **concluir**; **cancelar** |
| **Atendente** | `destinatario_user_id = uid` **ou** `destinatario_role_id = minha_role_id()` | a solicitação atribuída a si ou à sua role | **aprovar** (só de `aberta`); **rejeitar** (com justificativa); **concluir**; anexar (livre); excluir o próprio anexo livre |
| **Gestão** | tem a área `solicitacoes` | **todas** as solicitações do sistema | administrar tipos; ver a auditoria de movimentações; **nenhuma transição** |
| **Básico** | tem a área `solicitacoes/basico` | entra na tela `/solicitacoes` | o que os papéis acima lhe derem na linha |

O ponto contraintuitivo: **a gestão vê tudo e não age em nada**. `solic_aprovar`,
`solic_rejeitar` e `solic_cancelar` passam por `pode_ver_solic` (que o gestor satisfaz) e
então exigem `sou_atendente`/autoria (que ele não satisfaz). Na tela, o gestor abre o drawer
e **nenhum botão de ação aparece**, porque `sou_solicitante` e `sou_atendente` vêm `false`
no JSON. Supervisão é leitura.

Hoje: `solicitacoes/basico` em 6 roles / 36 usuários ativos (**todas as 6 roles do sistema**
— o backfill original ainda cobre 100%); `solicitacoes` em 2 roles / 5 usuários;
`solicitacoes/documentacao` em 3 roles / 10 usuários.

### 5.3 Como o atendente é atribuído

**Manual, por solicitação, escolhido pelo solicitante no momento da abertura.** Não há
atribuição por tipo, nem por área, nem regra automática, nem fila, nem round-robin, nem
reatribuição posterior.

O modal oferece um par de pills "Grupo | Usuário" (`modal-nova-solicitacao.tsx:146-147`) e
uma lista vinda de `solic_destinatarios()`, que devolve **todos os usuários ativos** e
**todas as roles** — sem filtro por tipo, por área ou por afinidade. O CHECK
`solicitacao_destinatario_xor` garante exatamente um dos dois. O caminho externo é mais
restrito: **sempre role**, nunca usuário (§9.2).

### 5.4 Onde a decisão é aplicada

Nos três lugares, em camadas que não se substituem:

1. **Na consulta (filtro):** `solic_caixa` e `solic_minhas` filtram no `WHERE` — nunca
   devolvem linha que o caller não deva ver. `solic_caixa(p_escopo)` tem três escopos:
   `'so_mim'` (`destinatario_user_id = uid`), `'mim_e_role'` (default: usuário **ou** role),
   e `'todas'` (sem filtro, **precedido de um `RAISE` se `NOT app.tem_area('solicitacoes')`**).
2. **Na função (recusa):** `solic_detalhe`, `solic_anexo_path`, `solic_anexar`,
   `solic_anexo_excluir`, `solic_emails_envolvidos` e as quatro transições fazem
   `IF NOT FOUND OR NOT app.pode_ver_solic(v_sol) THEN RAISE 'NAO_ENCONTRADA'`. **Mesma
   mensagem para "não existe" e "não pode ver"** — a RPC não vira oráculo de existência de
   solicitação alheia. Erros de permissão usam `ERRCODE '42501'`; erros de regra, `'22023'`.
3. **Na tela (esconde):** `src/app/solicitacoes/page.tsx:13` exige
   `['solicitacoes/basico','solicitacoes']` para entrar; a linha 22 rebaixa
   `escopo='todas'` para `'mim_e_role'` quando o usuário não tem gestão (antes de chamar a
   RPC, que recusaria de todo jeito); os botões de gestão só renderizam com `podeGestao`
   (`solicitacoes-content.tsx:102`); os botões de ação só com `sou_*`.

**Uma nota factual sobre a espessura dessa camada.** Cinco RPCs do módulo têm apenas
`PERFORM app.exigir_acesso()` sem lista de áreas — `solic_minhas`, `solic_caixa` (nos dois
escopos não-gestão), `solic_detalhe`, `solic_tipos_abertura`, `solic_destinatarios`,
`solic_minhas_pendencias`. Isso significa "qualquer usuário autenticado e ativo", **sem
exigir `solicitacoes/basico`**. As que retornam dado por linha continuam self-scoped (não
vazam solicitação alheia). As duas de **metadados**, porém, não são self-scoped por
natureza: `solic_destinatarios()` devolve o e-mail de **todos os 36 usuários ativos** e o
nome de todas as roles, e `solic_tipos_abertura()` devolve o catálogo inteiro de tipos com
seus campos e opções — para qualquer autenticado ativo que chame a RPC diretamente, mesmo
sem nenhuma área de Solicitações. O gate de área existe só na página
(`requireArea`, camada 3 acima). Isto está registrado como fronteira aceita em
`docs/adr/0121-solicitacoes-permissao-basica-e-gestao.md:33`.

### 5.5 O caso de borda que importa

**Quem perde a área, ou deixa de ser atendente, perde a visão na hora — porque não há nada
persistido.** As três funções são `STABLE` e leem o estado **atual** de `app.rbac_usuarios`
e `app.rbac_role_permissoes` a cada chamada; nenhuma cópia do vínculo é gravada em
`app.solicitacao`. Concretamente:

- **Gestor que perde a área `solicitacoes`:** para de ver as solicitações de terceiros no
  mesmo instante, inclusive as encerradas e as que já tinha aberto na tela (o próximo
  `router.refresh()` as remove). Mantém só as próprias e as da sua role.
- **Usuário que troca de role:** para de ver todo o backlog da role antiga e passa a ver o
  da nova — **inclusive solicitações encerradas há meses, que ele nunca atendeu**. A
  visibilidade é da role, não do histórico de quem atendeu. Uma solicitação que ele próprio
  rejeitou meses atrás some da sua caixa se ele mudar de role (ele permanece em
  `decidido_por`, mas nenhuma função olha para essa coluna ao decidir visibilidade).
- **Usuário desativado:** perde tudo na porta, em `app.exigir_acesso` (`USUARIO_INATIVO`),
  antes de qualquer checagem de linha.
- **O solicitante nunca perde a própria solicitação** — `solicitante_id` é gravado na linha
  e não depende de vínculo nenhum. É o único laço permanente do modelo.

---

## 6. Anexos

### 6.1 Onde os arquivos vivem, e as restrições

Bucket **privado** do Supabase Storage, `solicitacoes-anexos` (criado em 2026-06-12).
Configuração lida do catálogo (`storage.buckets`): `public = false`,
`file_size_limit = 10485760` (10 MiB), `allowed_mime_types` =

```
application/pdf, image/png, image/jpeg, image/webp,
application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, text/csv
```

**`storage.objects` não tem nenhuma policy** (consulta em `pg_policies`: 0 linhas) — o
bucket é inalcançável por `anon`/`authenticated`. Toda leitura e escrita passa por
`service_role`, no servidor.

**Três camadas de restrição, e só duas recusam:**

| Camada | Onde | O que faz |
|---|---|---|
| Bucket | `storage.buckets` | recusa > 10 MiB e MIME fora da lista de 6 — **barreira final** |
| Server Action | `src/app/solicitacoes/actions.ts:21-25,149-150` | `MIME_OK` (os mesmos 6) e `MAX_BYTES = 10*1024*1024` (idêntico ao bucket) — recusa antes de gastar rede |
| Cliente | `campos-dinamicos.tsx:94` | atributo `accept=".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.csv,application/pdf,image/*"` — **sugestão do seletor de arquivos, não validação** |

As duas que recusam concordam exatamente. A do cliente é **mais larga** (`image/*` deixa o
usuário escolher um GIF ou um SVG), e o resultado é uma mensagem de erro clara vinda do
servidor: `Tipo não permitido: image/gif. Aceitos: PDF, imagem, planilha.` Não é falha de
segurança; é assimetria de UX.

**Quantidade: não há limite em lugar nenhum.** Nem por campo, nem por solicitação, nem no
cliente, nem no servidor, nem no bucket. O `<input type="file" multiple>` aceita seleção
múltipla e o estado é uma lista por campo. Medido: 102 anexos em 121 solicitações.

**Chave do objeto:** `sol/<solicitacao_id>/<uuid v4>/<nome sanitizado>`. O nome é passado
por `sanitizarNomeArquivo` porque o Storage valida a chave com um regex cujo `\w` é ASCII
puro — um acento derruba o upload com `400 InvalidKey`, determinístico por nome (o que fazia
parecer intermitência). O **nome original** é preservado em `solicitacao_anexo.nome_arquivo`,
que é o que a UI exibe. Confirmado no formato real dos 102 caminhos em produção.

### 6.2 O vínculo, e a dança do `tmp/`

Na **abertura** o `id` da solicitação ainda não existe quando o arquivo sobe. Então:

1. `uploadAnexo` grava em `tmp/<uuid>/<arquivo>` e devolve o metadado ao cliente.
2. O cliente acumula os metadados e chama `criarSolicitacao`, que passa `p_anexos` à RPC;
   `criar_solicitacao` insere as linhas de `solicitacao_anexo` **com o `campo_id`** dentro
   da mesma transação do INSERT da solicitação.
3. A action então move cada objeto de `tmp/<uuid>/…` para `sol/<id>/<uuid>/…` com
   `service_role` e chama `solic_promover_anexos(p_solicitacao_id, p_de_para)` para
   atualizar os `storage_path` dos que moveram (`actions.ts:118-136`).

Passos 3 é **best-effort**: o que não mover fica em `tmp/` e continua funcionando (o
`storage_path` no banco ainda aponta para lá). `solic_promover_anexos` é **solicitante-only**
e faz o UPDATE por casamento `de → para` restrito àquela solicitação.

No anexo **pós-abertura** o `id` já é conhecido, o objeto vai direto ao destino e não há
promoção — o que também é a razão de `solic_promover_anexos` não servir ao atendente.

**Se a RPC de criação falhar**, a action remove os objetos já subidos
(`actions.ts:111-113`), para não deixar órfão.

### 6.3 Anexo da abertura × anexo livre — a regra mais afiada do módulo

`campo_id NOT NULL` = veio da abertura, preso ao campo do tipo. `campo_id NULL` = anexo
**livre**, exibido no bloco "Outros anexos" do drawer. Hoje: **89 de campo, 13 livres**.

- **`solic_anexar` recusa qualquer `campo_id`**: `ANEXO_SO_LIVRE`. O INSERT grava `NULL`
  literal (`VALUES (p_id, NULL, ...)`), para que não exista caminho que escape do `RAISE`.
  *O campo de anexo do tipo guarda apenas o que foi submetido na abertura e nunca mais
  recebe nada.*
- **`solic_anexo_excluir` recusa qualquer `campo_id NOT NULL`**: `ANEXO_DA_ABERTURA`.
  *O que veio na abertura não se apaga.*

As duas juntas tornam o anexo de campo **imutável após a criação**, nos dois sentidos. A
consequência elegante: como o campo é imutável, não existe invariante de obrigatoriedade a
proteger durante a exclusão — a trava é anterior a ela. (Isso substituiu uma regra anterior,
mais frágil, que bloqueava só o último anexo de campo obrigatório; ver §11.)

**Exclusão de anexo livre: só quem anexou.** Nem o atendente, nem a gestão, nem o
solicitante-se-não-foi-ele. O predicado é
`IF NOT coalesce(v_anexo.criado_por = app.uid_jwt(), false) THEN RAISE 'PERMISSAO_NEGADA'`.
A UI expõe isso como afordância via `sou_autor` em `solic_json`
(`drawer-solicitacao.tsx:354`), mas a barreira é a do banco.

**Quem pode anexar:** `solicitante OR sou_atendente` — "os dois lados anexam (o solicitante
complementa; o atendente devolve o comprovante)". A gestão, que passa em `pode_ver_solic`,
**não** passa nessa segunda checagem.

**Solicitação encerrada não aceita nem anexo nem exclusão** (`status NOT IN
('aberta','aprovada')` nas duas RPCs): a imutabilidade do encerrado vale nos dois sentidos.

### 6.4 Como o download é autorizado, e por quanto tempo

Dois passos, com duas credenciais diferentes — e essa separação é o desenho:

1. `solic_anexo_path(p_anexo_id)`, com o **cliente de sessão** (`authenticated`): acha o
   anexo, carrega a solicitação, aplica `app.pode_ver_solic` e devolve só o `storage_path`.
   Se não pode ver, `NAO_ENCONTRADA` — mesma mensagem que para anexo inexistente.
2. `getAdminClient().storage.from(BUCKET).createSignedUrl(path, 60)` com **service_role**
   (`actions.ts:195`).

**Quem decide é o banco, com a identidade do usuário. Quem lê o byte é o service_role, e
só depois do "sim".** O `storage_path` nunca é exposto na leitura normal — `anexoSchema`
(`src/lib/solicitacoes/schemas.ts:57-69`) não tem esse campo —, então o UUID aleatório do
caminho não é adivinhável por quem só viu a lista de anexos.

**Validade: 60 segundos.** Depois disso a URL simplesmente para de funcionar (403 do
Storage) e o usuário clica de novo, refazendo os dois passos — incluindo a reavaliação da
permissão. Não há cache de URL em lugar nenhum.

### 6.5 O que acontece com os arquivos quando a solicitação some

**Uma solicitação nunca é excluída nem cancelada-com-limpeza.** Cancelar só muda `status`;
os anexos ficam, visíveis e baixáveis, para todos que ainda enxergam a linha.

O único caminho em que metadados de anexo somem em massa é o `ON DELETE CASCADE` de
`solicitacao_anexo.solicitacao_id` — que só dispararia num `DELETE FROM app.solicitacao`
manual, por `postgres`. **O CASCADE limpa o banco e não toca no Storage**: os binários
ficariam órfãos no bucket, e teriam de ser removidos à parte.

Na exclusão de um anexo individual a ordem é **deliberada**: o metadado sai primeiro (a RPC
faz o `DELETE ... RETURNING storage_path`), o binário depois (a action). Se o Storage
falhar, sobra um arquivo órfão **invisível** — chato e inofensivo. O inverso deixaria um
anexo **listado na tela que não baixa**, que é pior. A action trata o erro corretamente
sabendo que **o SDK do Storage não lança** — resolve com `{ data, error }` —, então checa
`rmErr` explicitamente além do `try/catch`, que fica só para exceção de rede
(`actions.ts:288-300`).

Duas Server Actions de limpeza existem e são interessantes pelo que evitam:
`descartarAnexos(solicitacaoId, storagePaths)` recebe caminhos **do cliente** e apaga com
`service_role` — o que, ingênuo, seria uma primitiva de deleção arbitrária. As duas amarras
são: o caller precisa poder agir naquela solicitação, e todo caminho precisa começar com
`sol/<id>/` (`actions.ts:239-250`). O mesmo filtro de prefixo se repete no rollback de
`anexarEmSolicitacao` (linha 263), declaradamente como defesa em profundidade.

---

## 7. Telas

### 7.1 Inventário

| Rota | Arquivo | Servidor/Cliente | O que busca | Gate |
|---|---|---|---|---|
| `/solicitacoes` | `src/app/solicitacoes/page.tsx` | **RSC**, `dynamic = 'force-dynamic'` | `solic_minhas` **ou** `solic_caixa(escopo)` (só a da view atual), `solic_minhas_pendencias`, `solic_tipos_abertura`, `solic_destinatarios` — em `Promise.all` | `requireArea(['solicitacoes/basico','solicitacoes'])` |
| `/admin/solicitacoes` | `src/app/admin/solicitacoes/page.tsx` | **RSC**, force-dynamic | `admin_solic_listar_tipos` | `requireArea('solicitacoes')` |
| `/admin/solicitacoes/movimentacoes` | `.../movimentacoes/page.tsx` | **RSC**, force-dynamic | `solic_movimentacoes` | `requireArea('solicitacoes')` |

As três páginas têm `loading.tsx` irmão (skeleton). A camada de leitura é
`src/lib/solicitacoes/rpc.ts` — `import 'server-only'`, cliente de **sessão**, cada leitura
passando por `parseRpc(schema, res, fn)` (Zod). `getPendencias` é envolvido em `cache()` do
React para deduplicar a chamada que layout e page fazem em paralelo. `null` de qualquer RPC
significa falha (as listas fazem `coalesce` para `'[]'` no SQL, então `null` nunca é
"vazio") e vira uma faixa de erro na tela (`page.tsx:34-36`).

### 7.2 Componentes

**Deste domínio** (`src/components/solicitacoes/`): `solicitacoes-content.tsx` (casca
client: abas, escopo, orquestração do drawer/modal), `board-solicitacoes.tsx` (a lista de
gestão), `minhas-solicitacoes.tsx` (a lista do solicitante), `drawer-solicitacao.tsx` (o
detalhe, 455 linhas — a maior peça), `modal-nova-solicitacao.tsx` (criação),
`campos-dinamicos.tsx` (o motor de render do formulário), `movimentacoes-content.tsx` (a
auditoria). Admin: `src/components/admin/solicitacoes/tipos-content.tsx` e `editor-tipo.tsx`.

**Da fundação** (não deste domínio): `ModalCentral`, `FaixaMensagem`, `ScrollAutoHide`,
`CardTabela`, `Badge`, `Checkbox`, `Input`/`Select`/`Textarea` (`@/components/ui/field`),
`GatilhoAjuda`, e as constantes de pill em `@/components/shared/botoes`
(`PILL`, `PILL_NEUTRO`, `PILL_PRIMARIA`, `PILL_GESTAO`, `PILL_PERIGO`).

### 7.3 Criação

Modal client com altura fixa e corpo rolável; a barra de ação e a faixa de erro vivem no
**rodapé fixo**, fora da região que rola — porque com o erro no topo do corpo, quem clicava
"Enviar" lá embaixo não via a mensagem e o modal parecia não responder
(`modal-nova-solicitacao.tsx:86-97`). Trocar o tipo com campos preenchidos pede confirmação
e limpa tudo (linhas 39-43). O botão fica desabilitado enquanto há upload em voo, e o clique
com anexo em erro produz mensagem em vez de silêncio.

### 7.4 Lista do solicitante × lista de gestão

`MinhasSolicitacoes` recebe o retorno de `solic_minhas` (tudo que o usuário abriu, qualquer
estado, `ORDER BY criado_em DESC` no SQL). `BoardSolicitacoes` recebe `solic_caixa` e
organiza em **colunas por tipo**, dentro de uma aba de status.

**Como filtra:** três abas de status — `abertas` (`status === 'aberta'`), `aprovadas`
(`=== 'aprovada'`), `encerradas` (`!emAndamento(status)`) — definidas em
`src/lib/solicitacoes/abas.ts:12-18`, cada uma com **predicado próprio e explícito**. O
comentário registra por que: o predicado antigo de "encerradas" era o *complemento* de
`'aberta'`, o que empurraria um estado novo direto para lá sem erro nenhum. Mais a busca
por número (`#1068` ou `1068`, ancorada em `^#?(\d+)$` para não pescar dígitos no meio de um
e-mail) ou por e-mail do solicitante (`format.ts:110-128`). Ordem e busca moram na lib, não
no componente, porque **as duas visões precisam ordenar e buscar igual** e duas cópias
divergiriam no primeiro ajuste.

**Filtragem por permissão × por escolha: as duas, em eixos diferentes.** O **escopo**
(`so_mim` | `mim_e_role` | `todas`) é permissão — vive na URL, é reescrito pela page se o
usuário não tiver gestão, e o `'todas'` é recusado pela própria RPC. As **abas de status** e
a **busca** são escolha do usuário, puramente client-side sobre a lista já recebida. O modo
`'todas'` mostra uma faixa âmbar de "Modo supervisão" (`board-solicitacoes.tsx:73-79`).

**Como pagina: não pagina.** Não há `LIMIT`, `OFFSET`, cursor ou scroll infinito em nenhuma
RPC nem em nenhum componente. A lista inteira do escopo viaja em um JSONB e é filtrada na
memória do browser. Com 121 solicitações isso é irrelevante; é uma decisão que tem prazo de
validade e nenhum mecanismo avisa quando ele vencer.

### 7.5 Detalhe

`DrawerSolicitacao` é aberto por **id**, não por objeto: `solicitacoes-content.tsx:37-38`
guarda `abertaId` e **deriva** `aberta = lista.find(...)`. Guardar o objeto congelava o
retrato do clique — uma ação que não fecha o drawer (anexar, excluir anexo) chama
`router.refresh()`, o RSC devolve lista nova, e o drawer seguia exibindo a cópia velha. O
drawer é reaproveitado pela página de Movimentações, que busca o objeto por uma Server
Action dedicada (`detalheSolicitacao`, gated por `requireAreaAction('solicitacoes')`).

Mostra: cabeçalho com tipo e `#id`, badge de status, badge `via integração <plataforma>`
quando `origem` não é nulo, as respostas do **snapshot** com `fmtValor`, os anexos de campo,
o bloco "Outros anexos" (que aparece mesmo vazio) e a barra de ações condicional. Rejeitar
abre um modal que exige justificativa; cancelar pede confirmação.

### 7.6 Administração de tipos

`tipos-content.tsx`: tabela com nome, nº de campos, nº de solicitações e três ações em ícone
por linha — Editar, Arquivar/Desarquivar, Excluir (desabilitado com `title` explicativo
quando `n_solicitacoes > 0`), com modal de confirmação para exclusão.
`editor-tipo.tsx`: modal com nome + construtor de campos, cada linha com `_key` estável
independente do índice (que muda ao reordenar), setas ↑/↓ desabilitadas nos extremos, e o
editor de opções para `selecao`.

---

## 8. Notificações — só o gancho

Um único evento-fonte: **movimentação de solicitação**. Cinco valores:
`'criada' | 'aprovada' | 'concluida' | 'rejeitada' | 'cancelada'`
(`src/lib/email/template.ts:166`). Não há notificação de vencimento, de anexo novo, nem de
lembrete.

**Gatilho:** sempre uma Server Action, **depois** da RPC ter retornado sem erro — nunca
dentro da transação, nunca antes de persistir. `criarSolicitacao` → `'criada'`;
`aprovarSolicitacao` → `'aprovada'`; `concluirSolicitacao` → `'concluida'`;
`rejeitarSolicitacao` → `'rejeitada'` (passando a justificativa);
`cancelarSolicitacao` → `'cancelada'`. A rota externa dispara o mesmo para criação e
cancelamento, pela variante service-role.

**Como o destinatário é derivado:** `solic_emails_envolvidos(p_id)` (gated por
`pode_ver_solic`) monta um `UNION` **DISTINCT** de três fontes, e só desta solicitação —
nunca um diretório:

1. o **autor**, se `ativo`;
2. o **destinatário usuário**, se houver (**sem** exigir `ativo`);
3. **todos os membros `ativo`s da role destinatária**, se o destino for role.

A assimetria do `ativo` é real e visível no corpo: o autor e os membros da role têm
`AND ativo`; o destinatário-usuário nomeado, não. Quem age também recebe — é um e-mail
factual único para todos os envolvidos, não uma notificação personalizada.

`solic_emails_envolvidos_svc` é a irmã **sem** `exigir_acesso`, concedida só a
`service_role`, para o caminho externo (onde não há usuário na sessão). Mesma lógica de
fan-out.

**Duas propriedades que atravessam o gancho.** (a) **Nunca lança e nunca bloqueia:** SMTP
fora do ar, RPC de fan-out falhando ou zero envolvidos não derrubam a movimentação; a falha
é logada (o `catch` mudo já custou um diagnóstico lento). (b) **O instante vem da RPC de
transição, não do contexto:** `solic_emails_envolvidos` só conhece `criado_em` e
`decidido_em`, e aprovar **não toca** `decidido_em` — então `solic_aprovar` devolve o
`aprovado_em` que acabou de gravar e a action o passa como override. Sem isso o e-mail de
aprovação sairia **sem data e sem erro nenhum** (o template trata `quando` ausente como
string vazia).

O transporte (nodemailer, teto de 3 conexões SMTP simultâneas do Office 365, layout, logo
por CID) é outro módulo — `src/lib/email/`.

---

## 9. Fronteira com a API externa (só a fatia do tipo)

### 9.1 Como um tipo é marcado como exposto

Coluna **`app.solicitacao_tipo.exposto_via_api boolean NOT NULL DEFAULT false`**. Dois
caminhos de escrita, ambos gated por `exigir_acesso(ARRAY['solicitacoes'])`:

- `admin_solic_tipo_api_config(p_tipo_id, p_exposto)` — o caminho real, um toggle direto
  numa checkbox de `/admin/api-externa` → "Tipos Expostos", salvo na hora (sem modal: não
  há mais nada a escolher além de ligar/desligar).
- `admin_solic_salvar_tipo(..., p_config)` — lê `p_config->>'exposto_via_api'` se a chave
  estiver presente, senão **preserva o valor vigente**. O editor de tipos deliberadamente
  não manda `p_config`, então salvar um tipo nunca altera sua exposição por acidente.

**O que a marcação muda, exatamente quatro coisas:**

1. `solic_tipos_api(p_chave_id)` (o catálogo que o integrador consulta) filtra
   `WHERE NOT t.arquivado AND t.exposto_via_api`.
2. `solic_tipos_documentacao()` (a tela interna de documentação, gated por `solicitacoes`
   **ou** `solicitacoes/documentacao`) filtra igual.
3. `criar_solicitacao_externa` resolve o tipo por
   `WHERE slug = p_tipo_slug AND NOT arquivado AND exposto_via_api`; qualquer falha dá o
   mesmo `TIPO_INVALIDO: tipo inexistente, arquivado ou não exposto via API` — **uma
   mensagem para os três casos**, para não virar oráculo do catálogo interno.
4. Nada mais. **Não muda nada no comportamento interno do motor:** o tipo continua
   aparecendo no modal de abertura humano, continua editável, continua arquivável. Expor é
   aditivo.

**Não há alcance por chave.** Toda chave ativa alcança **todo** tipo exposto — a whitelist
de tipos por chave foi removida. Igualmente, `solic_tipos_api` devolve como `destinos`
**todas** as roles cadastradas, sem filtro por tipo.

Uma propriedade do catálogo externo que não é do transporte: ele **omite os campos de
anexo** (`WHERE c.tipo_campo <> 'anexo'`) e, dos campos que devolve, emite `chave`, `rotulo`,
`tipo_campo`, `obrigatorio`, `opcoes` e `data_permite_passado` — mas **não** `id`. O
integrador nunca vê o `id` do campo; ele fala por `chave`, que é o único identificador
estável (§2.1).

Hoje: **1 de 7 tipos exposto** (`abatimento_de_creditos`).

### 9.2 Por onde uma solicitação externa entra no ciclo de vida

`public.criar_solicitacao_externa(...)` — `SECURITY DEFINER`, concedida **só a
`service_role`** (nem `authenticated`). A sequência, na ordem do corpo:

1. Chave existe e `ativo` → senão `CHAVE_INVALIDA` (42501). **Nada mais é lido da chave.**
2. `chave_idempotencia` não vazia → senão `IDEMPOTENCIA_OBRIGATORIA`.
3. **Reenvio idempotente:** se já existe linha para `(origem_chave_id, chave_idempotencia)`,
   devolve o ack da **existente** — sem criar nada e **sem revalidar o payload atual**. O
   ack ecoa o solicitante *da linha gravada*, nunca o e-mail desta chamada (que pode nem
   bater, num reenvio tardio).
4. Tipo por **slug**, não arquivado, exposto (§9.1).
5. **Destinatário obrigatório**, id numérico **ou** nome de role (case-insensitive, `btrim`),
   validado contra `app.rbac_roles`. **Sem fallback para um destino default.**
6. **Solicitante obrigatório:** `p_solicitante_email` precisa ser o e-mail de um usuário
   **já cadastrado e ativo** (comparação `lower(email)`); esse usuário vira o
   `solicitante_id` de verdade.
7. `data_limite` obrigatória.
8. **Recusa tipos com campo `anexo` obrigatório**: `TIPO_EXIGE_ANEXO`.
9. Traduz `campos` (chaveado por `chave`) para `respostas` (chaveado por `campo_id`),
   levantando `CAMPO_DESCONHECIDO` em chave não encontrada.
10. Chama **`app.solic_validar_e_snapshotar`** — a mesma função da porta humana.
11. INSERT com `status = 'aberta'`, gravando `origem_chave_id`, `chave_idempotencia`,
    `referencia_origem`, `descricao = p_titulo`, `destinatario_role_id`, e
    `destinatario_user_id = NULL`. O `unique_violation` do índice de idempotência é
    capturado e devolve o ack da linha vencedora — a corrida é resolvida, não propagada.

**Respondendo diretamente às três perguntas:**

- **Estado inicial:** `'aberta'` — **o mesmo** da porta humana. Não há estado próprio de
  origem externa.
- **Autor:** uma **pessoa real e ativa** da plataforma, resolvida do `solicitante_email`.
  O robô da chave **não** é o autor. Consequência: a solicitação aparece em "Minhas
  solicitações" dessa pessoa, ela recebe os e-mails de movimentação, e ela pode
  **cancelá-la pela tela** — é o mesmo `solic_cancelar` de sempre.
- **Pula validação?** Não. Usa a mesma função e é **mais estrita em três pontos**: exige
  idempotência, recusa chave de campo desconhecida (a porta humana descarta em silêncio,
  §3.3), e recusa de saída tipos com anexo obrigatório.

### 9.3 O que só existe para origem externa

**Três colunas** (`origem_chave_id`, `chave_idempotencia`, `referencia_origem`), todas
anuláveis e todas nulas nos 121 registros de hoje — e **um comportamento**: `origem` no
`solic_json`, que emite `{ plataforma }` quando `origem_chave_id` não é nulo e `NULL`
quando é. É o que produz o badge "via integração X" no drawer.

Além disso, `cancelar_solicitacao_externa` grava `decidido_por = <robô da chave>`, que é o
**único** lugar do sistema onde um ator não-humano aparece numa coluna de decisão — e, por
tabela, na projeção de Movimentações.

**Nenhum estado novo, nenhum campo de formulário novo, nenhuma transição nova.** Uma
solicitação externa é uma solicitação normal com três colunas de proveniência preenchidas.
Depois de criada, o motor não a distingue em nada: as transições, a visibilidade, os anexos
e os e-mails são exatamente os mesmos.

---

## 10. Contaminação de domínio

Critério: um artefato está limpo se funciona sem conhecer o negócio deste produto.

### 10.1 Os tipos existentes: estrutura × negócio

**Todos os 7 são 100% negócio, e nenhum é estrutura.** São linhas de dados, criadas pela
gestão pela tela, sem nenhuma diferença mecânica entre elas. Contas a pagar, Pagamentos fora
do prazo, Abatimento de créditos, Registro de prejuízos, Compras e reparos, Atualização
cadastral, Lançamentos do cartão Clara — todos vocabulário financeiro do Welcome Group, e
nenhum deles é referenciado por nome ou slug em nenhuma função do catálogo (consulta em
`pg_proc.prosrc`: **0 linhas**) nem em `src/`. O motor **não sabe que eles existem**.

A única referência a um slug real no código é `abatimento_de_creditos` em
`src/components/admin/api-externa/documentacao-content.tsx:56,73,95,110` — como **exemplo
em um bloco de JSON de documentação**, texto exibido ao integrador. Não é lógica.

Isso é o achado mais favorável à replicação: **a separação motor/conteúdo já está feita, e
os dados provam.**

### 10.2 Onde o vocabulário do produto entra no motor

Não nos nomes de tipo, mas em quatro lugares mais fundos:

| Onde | O quê | Evidência |
|---|---|---|
| **Tipo de campo `moeda`** | É um tipo de campo de primeira classe, num CHECK do banco, e a exibição é `toLocaleString('pt-BR', { style:'currency', currency:'BRL' })` — **BRL cravado** | `format.ts:77`; `solicitacao_campo_tipo_campo_check` |
| **Prefixo `R$`** | Literal no input de moeda | `campos-dinamicos.tsx:82` |
| **Fuso `America/Sao_Paulo`** | No **servidor** (validação de data no passado) e no **cliente** (`hojeSP`) e no e-mail (`to_char(... AT TIME ZONE 'America/Sao_Paulo')`) | corpo de `solic_validar_e_snapshotar`; `format.ts:47`; corpo de `solic_emails_envolvidos` |
| **Formato de data BR** | `DD/MM/AAAA` na tela, `'DD/MM/YYYY" às "HH24:MI'` no e-mail | `format.ts:62-66`; corpo de `solic_emails_envolvidos` |
| **Nomes de estado e ação em PT** | `'aberta'`, `'aprovada'`, … são os valores **persistidos**; `'Abertura'`, `'Aprovação'`, `'Conclusão'`, `'Rejeição'`, `'Cancelamento'` são rótulos **gerados no SQL** dentro de `solic_movimentacoes` | CHECK de status; corpo de `solic_movimentacoes` |
| **Mensagens de erro em PT** | Toda a família `CAMPO_OBRIGATORIO: <rotulo>`, `VALOR_INVALIDO: % deve ser numérico`, etc., em português, no corpo das RPCs | `solic_validar_e_snapshotar` e demais |
| **Vocabulário de RBAC do host** | `app.rbac_usuarios`, `app.rbac_roles`, `app.rbac_role_permissoes`, `app.tem_area`, `app.exigir_acesso`, `auth.users` — o motor depende diretamente do modelo de acesso do Janus, inclusive da premissa **uma role por usuário** | `pode_ver_solic`, `minha_role_id` |
| **Áreas nomeadas** | As strings `'solicitacoes'`, `'solicitacoes/basico'`, `'solicitacoes/documentacao'` estão literais em RPCs e páginas | `solic_movimentacoes`, `admin_solic_*`, `page.tsx:13` |

### 10.3 O que copia, o que parametriza, o que redesenha

**Copia como está** (não conhece o negócio):

- As quatro tabelas, com CHECKs, FKs e índices — trocando só os nomes das áreas.
- `app.solic_validar_e_snapshotar` inteira, menos o literal do fuso.
- `app.pode_ver_solic` e `app.sou_atendente` — **se** o RBAC de destino também for
  "uma role por usuário" (§10.3, redesenho).
- `app.slugificar`, ajustando a tabela de transliteração ao idioma de destino.
- A mecânica de anexo: bucket privado + zero policies + `path` pela RPC de sessão +
  signed URL curta por service_role. É o padrão, não o conteúdo.
- A dança `tmp/` → `sol/<id>/` e a regra "metadado sai antes do binário".
- A projeção `solic_movimentacoes` e a decisão de derivar a Aprovação de `aprovado_em`.
- O contrato da porta externa: idempotência por `(chave, idempotência)`, tradução
  chave→campo_id, snapshot compartilhado.
- O padrão de erro: `PREFIXO: detalhe` com `ERRCODE` 42501/22023, e mesma mensagem para
  "não existe" e "não pode ver".

**Precisa de parametrização:**

- **Moeda:** hoje um `tipo_campo` com BRL cravado em dois lugares. Um motor genérico
  precisaria de `moeda` com código de moeda por campo (ou por instalação), ou de reduzir
  `moeda` a `numero` + máscara de apresentação.
- **Fuso e locale:** três pontos (validação no servidor, `hojeSP` no cliente, formatação do
  e-mail). Vira configuração de instalação; o cuidado é que o servidor e o cliente
  **precisam concordar**, senão o `min` do input e o `RAISE` discordam na virada do dia.
- **Nomes de área/permissão:** as três strings literais.
- **Os cinco estados e os cinco rótulos de ação:** hoje são PT-BR persistidos.
  Recomendação factual: o valor persistido vira identificador estável (em inglês ou
  numérico) e o rótulo vira tradução; hoje **o rótulo de ação é gerado no SQL**, o que
  força a internacionalização a descer até a RPC.
- **Mensagens de erro:** hoje o prefixo é estável e o sufixo é PT; a tradução para o usuário
  já é feita por mapa no cliente (`actions.ts:330-355`), então basta o prefixo — mas o
  sufixo com nome de campo é descartado pela tradução atual e reapareceria em outro idioma.

**Precisa de redesenho:**

- **O acoplamento ao RBAC do host.** `app.minha_role_id()` devolve **uma** role. Um produto
  com múltiplos papéis por usuário quebra a comparação `destinatario_role_id =
  minha_role_id()` — vira `IN (SELECT ...)`, o que muda o plano de execução dos três
  índices parciais.
- **Ausência de paginação** (§7.4): copiar como está importa um teto silencioso.
- **`tipo_campo` como CHECK de texto no banco.** Adicionar um tipo de campo hoje é uma
  migration destrutiva (`DROP CONSTRAINT`) + a união de literais no TypeScript + o motor de
  render + a tradução no snapshot. Se a réplica precisar de tipos de campo extensíveis
  (multi-seleção, e-mail, telefone, referência a outra entidade), o CHECK vira catálogo.
- **A ausência de campo condicional** (§1.3): se a réplica precisar, não há onde encaixar —
  o snapshot teria de congelar também a condição avaliada, e a obrigatoriedade deixaria de
  ser um booleano.
- **A ausência de comentário/thread** (§4.4): hoje só `justificativa`. Um motor de
  solicitações com conversa precisa de uma tabela nova e da distinção visível/interno, que
  não existe em lugar nenhum.
- **A projeção de movimentações tem teto de três eventos** por solicitação, porque deriva de
  duas colunas de decisão. Qualquer evento novo (anexou, reatribuiu, comentou) exige tabela
  de eventos de verdade — a projeção não estende.

---

## 11. Divergências encontradas

| # | O que a documentação diz | O que o código/catálogo faz | Evidência |
|---|---|---|---|
| 1 | "A validação é **idêntica** à do formulário humano do Janus: o que a tela recusa, a API recusa" — e, duas linhas acima, "Chave desconhecida → erro `CAMPO_DESCONHECIDO` (**nada é ignorado silenciosamente**)" (`docs/api-externa-solicitacoes.md:152-154`) | A **função de validação** é a mesma (`app.solic_validar_e_snapshotar`), mas os **chamadores** diferem e a API é mais estrita em 3 pontos: exige `chave_idempotencia`; levanta `CAMPO_DESCONHECIDO`; recusa de saída tipo com campo `anexo` obrigatório (`TIPO_EXIGE_ANEXO`), que na tela é o caso normal. A frase sobre `CAMPO_DESCONHECIDO` é verdadeira **só da API** — a tela **descarta chave desconhecida em silêncio**, porque o laço itera os campos do tipo, não as chaves do payload. "Idêntica" vale numa direção e falha na outra. | corpos vivos de `criar_solicitacao_externa`, `criar_solicitacao` e `app.solic_validar_e_snapshotar` |
| 2 | ADR-0169 Emenda 2: "a obrigatoriedade do campo de anexo passou a **ler do snapshot `respostas`**, não de `solicitacao_campo`" (`docs/adr/0169:158-179`) | Essa leitura **não existe mais no corpo vivo**. A migration 0265 substituiu a regra por outra, anterior e mais simples — `campo_id IS NOT NULL` → `ANEXO_DA_ABERTURA` —, e com o campo inteiro imutável não há invariante de obrigatoriedade a proteger durante a exclusão. A própria ADR registra a substituição mais adiante (`:140-145`), mas a Emenda 2 permanece como se descrevesse o estado atual. | corpo vivo de `solic_anexo_excluir` (sem qualquer leitura de `respostas`) |
| 3 | ADR-0112:22-23 e o comentário de `movimentacoes/page.tsx:9-10`: a lista de movimentações é "Abertura (solicitante/criado_em) e a decisão terminal" — **duas** origens | São **três** ramos desde a v5.9.0: a Aprovação, derivada de `aprovado_em IS NOT NULL`, é um `UNION ALL` próprio. O comentário na própria página que consome a RPC está desatualizado; o subtítulo da tela (`page.tsx:27`) também lista só "abertura, conclusão, rejeição, cancelamento", omitindo aprovação. | corpo vivo de `solic_movimentacoes` (3 `UNION ALL`); `src/app/admin/solicitacoes/movimentacoes/page.tsx:9-10,27` |
| 4 | `docs/estado-do-projeto.md:114-117` e ADR-0169:155-156: "**9 de 68** anexos órfãos"; "dos **72 anexos vivos**, 68 têm campo, 4 são livres" | Hoje: **102 anexos**, 89 com campo (dos quais **9 órfãos** — os mesmos 9, nenhum novo) e **13 livres**. Os números da documentação eram corretos quando escritos; o texto não se marca como instantâneo, e a proporção de anexo livre mais que triplicou. Evolução, não erro — mas quem ler para replicar dimensiona errado. | consulta de contagem; §1.6 |
| 5 | ADR-0120:17-23: "confirmado em produção: ids `[5,7,8]`, count 3, max 8" | Hoje: **121 linhas**, `min(id)=436`, `max(id)=1996`. A afirmação de desenho (o número exibido é o `id` literal, com lacunas aceitas) **continua verdadeira e agora tem massa**: 121 registros num intervalo de 1.561 — a numeração é esparsíssima, o que a documentação previu e autorizou. | consulta `min/max/count`; §1.6 |
| 6 | `docs/estado-do-projeto.md:119-121`: "`/solicitacoes` é de **qualquer autenticado** (`solicitacoes/basico`)" | A **página** exige `requireArea(['solicitacoes/basico','solicitacoes'])` — não é qualquer autenticado. O que é "qualquer autenticado ativo" são as **RPCs** (`exigir_acesso()` sem áreas), que é uma afirmação diferente e está correta em ADR-0121:33. Hoje as duas coincidem na prática porque **todas as 6 roles têm `solicitacoes/basico`**, mas a frase descreve o gate errado. | `src/app/solicitacoes/page.tsx:13`; corpos de `solic_minhas`/`solic_caixa`; consulta de roles |
| 7 | ADR-0118:21: o `min` do `<input type="date">` é "espelho cosmético"; ADR-0118:16-17 trata `data_aviso_dias_futuro` como "aviso client-side" | **Confere, e vale registrar o alcance**: `data_aviso_dias_futuro` e `data_aviso_direcao` **não são lidas por nenhuma função do banco** — são colunas persistidas cujo único consumidor é `campos-dinamicos.tsx:53-76`. São configuração de tipo que o servidor guarda e ignora. Não é divergência; é um fato que uma replicação que só ler o SQL não descobre. | busca em `pg_proc.prosrc`; `campos-dinamicos.tsx:53-76` |
| 8 | `docs/backlog-v6.md:32` (B-19): "hoje há **19 RPCs** com prefixo `solic_*`" | **Confere exatamente** — 19 em `public`. (Somando `app.solic_json` e `app.solic_validar_e_snapshotar` seriam 21 objetos com o prefixo, mas a contagem de `public` é a que o item cita.) | `count(*) from pg_proc ... proname like 'solic\_%'` |
| 9 | ADR-0113:15-17: bucket com `file_size_limit=10485760` e 6 MIMEs; ADR-0113:18-26: sem policies em `storage.objects` | **Confere integralmente** no catálogo vivo, inclusive a lista de MIMEs na mesma ordem. O que a documentação não menciona é que o `accept` do cliente é **mais largo** (`image/*`), então o usuário consegue selecionar um GIF e recebe erro do servidor. | `storage.buckets`; `pg_policies` (0 linhas); `campos-dinamicos.tsx:94` vs `actions.ts:21-25` |
| 10 | `docs/adr/0112:56`: "editar/arquivar um tipo **não altera** solicitações já abertas" | **Confere na experiência, com um mecanismo que a frase não revela**: o tipo não é alterado — ele é **destruído e recriado** a cada save (`DELETE FROM app.solicitacao_campo`), e 17,9% dos ponteiros `campo_id` do snapshot já apontam para o vazio. A imunidade vem do snapshot ser autossuficiente, não de o tipo ser preservado. | corpo vivo de `admin_solic_salvar_tipo`; consulta de órfãos; §1.5 |
| 11 | ADR-0121:27: "migration faz backfill: concede `solicitacoes/basico` a **TODOS** os roles no deploy" | **Confere e permanece verdadeiro hoje**: 6 de 6 roles têm a área, 0 sem. Mas o backfill foi um evento de deploy, não uma regra — **uma role criada depois não a recebe automaticamente**, e nenhum mecanismo garante a cobertura. Que ainda esteja em 100% é coincidência de nenhuma role nova ter surgido. | consulta de roles com/sem a área |
| 12 | ADR-0121:33: "RPCs básicas permanecem em `exigir_acesso()` (login+ativo). **Os dados que retornam são self-scoped** (do próprio chamador); não há vazamento cross-user." | Verdadeiro para as RPCs **de linha** (`solic_minhas`, `solic_caixa` nos escopos não-gestão, `solic_detalhe`, `solic_minhas_pendencias`) — todas filtram por `uid_jwt()`/`minha_role_id()`. **Não é verdadeiro para as duas de metadado**, que passam pelo mesmo gate frouxo e não são self-scoped por natureza: `solic_destinatarios()` devolve o e-mail de **todos os 36 usuários ativos** e o nome de todas as roles; `solic_tipos_abertura()` devolve o catálogo inteiro de tipos com campos e opções. Qualquer autenticado ativo — inclusive sem nenhuma área de Solicitações — obtém as duas chamando a RPC direto, porque o gate de área vive só na página. A ADR generaliza "self-scoped" para um conjunto que inclui duas funções que não o são. | corpos vivos de `solic_destinatarios` e `solic_tipos_abertura` (`PERFORM app.exigir_acesso();` sem lista de áreas); `src/app/solicitacoes/page.tsx:13` |

---

## Reconstruível

Denso o bastante para virar spec sem este repositório:

1. **O modelo de dados inteiro** — as 4 tabelas com colunas, tipos, nulidade, defaults, os 5
   CHECKs transcritos, as 8 FKs com seus `ON DELETE`, os 8 índices (incluindo os parciais e
   o único de idempotência), e a decisão de **RLS ligada com zero policies + zero grants**
   como forma de selar as tabelas atrás das RPCs.
2. **O snapshot** — forma exata do elemento, o que entra e o que fica de fora, o mecanismo
   `DELETE`+`INSERT` que o torna necessário, a ausência deliberada de FK em
   `solicitacao_anexo.campo_id`, e a medição que prova que funciona (171/955 órfãos).
3. **A validação de campo** — as 6 regras transcritas com seus erros e `ERRCODE`, as três
   sutilezas (só valida não-vazio; aceita `,` ou `.`; "hoje" é SP), e a certeza de que não há
   segundo validador para os campos dinâmicos.
4. **O ciclo de vida** — os 5 estados, as 6 transições com origem e papel, a ausência
   completa de reabrir/reatribuir/editar/excluir, e as três camadas que impõem (CHECK +
   condicional por RPC + teste de varredura).
5. **A visibilidade por linha** — as duas funções transcritas na íntegra, os 4 caminhos de
   leitura e 2 de atendimento, o motivo do `coalesce(...,false)`, os três escopos de
   `solic_caixa`, e o comportamento na perda de área/role (nada persistido → efeito imediato).
6. **Os anexos** — as três camadas de restrição com os números reais, o formato da chave, a
   dança `tmp/`→`sol/<id>/`, o par `path`-por-sessão + signed-URL-por-service-role com
   **60 s**, a regra "abertura é imutável, livre é do autor", e a ordem metadado-antes-de-binário.
7. **A fatia externa do tipo** — a coluna, os dois caminhos de escrita, os exatos 4 efeitos
   da marcação, a sequência de 11 passos de `criar_solicitacao_externa`, e a resposta às
   três perguntas (mesmo estado inicial, autor é pessoa real, validação compartilhada e mais
   estrita).
8. **O gancho de notificação** — os 5 eventos, o momento do disparo, as 3 fontes do fan-out
   com a assimetria do `ativo`, e as duas propriedades (nunca bloqueia; o instante vem da RPC).
9. **A separação motor/conteúdo** — provada por medição, não por leitura: nenhum slug de
   tipo aparece em nenhuma função nem em `src/`.

## Faltando

O que precisa de segunda passada, com a pergunta exata:

1. **Comportamento real de render e teclado.** Nada foi navegado. *Pergunta: o drawer, o
   modal e o editor de tipos são operáveis por teclado (foco preso no modal, Esc, Tab entre
   as pills de destinatário), e o board se comporta em largura de celular?* Exige subir a
   aplicação — e há pendência declarada de conferência visual de v5.9.0/v5.9.1 em produção.
2. **O e-mail renderizado.** Só o gancho foi levantado (recorte). *Pergunta: o e-mail de
   `'aprovada'` sai com data preenchida em produção, e com que cor de badge no Outlook real?*
   O caminho do override foi lido no código, mas não observado num envio.
3. **A coluna dropada `attnum 17` de `app.solicitacao`.** O catálogo só guarda o placeholder.
   *Pergunta: que coluna era, e a remoção deixou consumidor órfão?* O contexto sugere
   fortemente o callback de saída removido junto com o outbox, mas isso é inferência a partir
   de comentários, não medição — o catálogo não guarda o nome.
4. **Tipos arquivados na prática.** Zero hoje, então o caminho "arquivar tipo com
   solicitações em aberto" está descrito **pelo código**, nunca observado. *Pergunta: uma
   solicitação aberta de tipo arquivado realmente completa todas as transições?* Exigiria
   escrita — fora do regime deste levantamento.
5. **A porta externa nunca exercitada em produção.** 0 de 121. *Pergunta: o caminho externo
   completo (criar → aparecer em "Minhas" da pessoa → notificar → cancelar pela tela) funciona
   fim-a-fim contra produção?* Existe um teste de contrato com fixture commitada, mas o
   número em produção é zero.
6. **Volume de e-mail entregue.** Não há tabela de log. *Pergunta: qual a taxa real de
   entrega do fan-out, dado o teto de 3 conexões SMTP simultâneas do Office 365?* Não
   respondível pelo banco.

## Decisões embutidas

Cada ponto em que o modelo resolveu uma tensão de um jeito e não de outro.

**1. Snapshot autossuficiente × referência viva ao tipo.**
*Escolha:* congelar rótulo, tipo, obrigatoriedade e opções dentro de `respostas`, e deixar
`campo_id` pendurar.
*Compra:* o histórico nunca mente — uma solicitação de 2026 exibe os rótulos de 2026 mesmo
depois de o tipo ser reescrito dez vezes; e o tipo fica **livremente editável**, sem
migração de dados nem versionamento de formulário.
*Custa:* 17,9% dos ponteiros já apontam para o vazio; qualquer regra futura que precise
cruzar solicitação antiga com definição atual de campo **não tem por onde** (foi exatamente
o que aconteceu com a validação de obrigatoriedade de anexo, §11 item 2); e o `respostas`
duplica metadado em cada linha, então renomear um rótulo não retroage nem quando você
queria que retroagisse.

**2. `DELETE`+`INSERT` dos campos × `UPDATE` diferencial.**
*Escolha:* a cada save, apagar todos os campos do tipo e reinserir o lote.
*Compra:* a RPC é curta e obviamente correta — sem diff, sem reconciliação, sem estado
intermediário; reordenar é só recontar `ordem`.
*Custa:* `id` de campo deixa de ser estável, o que obrigou a inventar a `chave` (com todo o
algoritmo de dedup contra o lote atual **e** contra as chaves prévias) e a abrir mão da FK
em `solicitacao_anexo.campo_id`. Uma escolha de simplicidade que custou dois mecanismos de
compensação.

**3. Movimentações como projeção × tabela de eventos.**
*Escolha:* derivar a auditoria das colunas da própria linha com três `UNION ALL`.
*Compra:* zero custo de escrita, impossibilidade estrutural de divergir do estado (o
histórico **é** o estado, reinterpretado), e nenhuma tabela para crescer sem fim.
*Custa:* teto de **três eventos por solicitação** — anexar, excluir anexo e tentativas
recusadas não deixam rastro nenhum; e qualquer evento novo exige uma coluna nova na tabela
principal ou o redesenho inteiro. Foi o que já forçou `aprovado_por`/`aprovado_em` a serem
colunas próprias em vez de estado derivado.

**4. Aprovação derivada de `aprovado_em`, não de `status = 'aprovada'`.**
*Escolha:* o ramo (b) da projeção filtra pelo instante, não pelo estado.
*Compra:* a linha de Aprovação **sobrevive à conclusão** — o presente não apaga o passado, e
uma solicitação concluída mostra três movimentações com atores e instantes distintos.
*Custa:* dois pares de (ator, instante) na mesma linha, e a obrigação de `solic_aprovar`
**não tocar** `decidido_*` — uma disciplina que só um teste segura (`ciclo-de-vida.test.ts:104`),
porque nada no schema a impõe.

**5. Gestão vê tudo e não age em nada.**
*Escolha:* `pode_ver_solic` inclui `tem_area('solicitacoes')`; nenhuma RPC de transição o
inclui.
*Compra:* supervisão sem poder de intervenção — o gestor audita sem poder aprovar o próprio
pedido nem decidir pelo atendente, e a responsabilidade fica onde o fluxo a colocou.
*Custa:* solicitação travada (role sem membros, atendente desativado) **não tem escape pela
gestão** — só o solicitante pode concluir ou cancelar, e se ele também estiver inativo, a
linha fica parada para sempre. Não existe reatribuir.

**6. Anexo da abertura imutável × anexo livre do autor.**
*Escolha:* dois regimes por `campo_id` nulo ou não; o de campo não recebe nem perde nada
depois da criação.
*Compra:* elimina a pergunta "qual dos dois lugares eu uso para anexar?" (há um só) e mata a
classe inteira de invariantes de obrigatoriedade durante a exclusão — a trava é anterior a
elas.
*Custa:* um erro na abertura (anexou o PDF errado num campo obrigatório) é **irreversível
pela tela** — não há substituir, e cancelar-e-reabrir perde o histórico. É rigidez comprada
com simplicidade.

**7. `exigir_acesso()` sem áreas nas RPCs básicas.**
*Escolha:* as RPCs self-scoped exigem só sessão ativa; o gate de área vive na página.
*Compra:* dados self-scoped não precisam de permissão (a própria consulta já filtra), e não
há risco de um usuário legítimo ser barrado por configuração de RBAC incompleta.
*Custa:* as duas RPCs de **metadado** não são self-scoped por natureza —
`solic_destinatarios()` entrega o diretório de 36 e-mails ativos e `solic_tipos_abertura()`
o catálogo inteiro de tipos e campos, a qualquer autenticado ativo que chame a RPC direto.
Registrado como fronteira aceita em ADR-0121:33.

**8. `id` cru como número de protocolo.**
*Escolha:* exibir `app.solicitacao.id` literal, com lacunas.
*Compra:* zero infraestrutura — nenhuma sequência paralela, nenhuma coluna, nenhuma
contenção de concorrência, e o número é imediatamente pesquisável (a busca casa por
substring).
*Custa:* a numeração é esparsíssima (121 registros entre 436 e 1996) e **vaza volumetria
de outras tabelas** se a sequência for compartilhada. Um usuário que abre a #1996 depois da
#1972 infere que 23 outras coisas aconteceram no meio.

**9. Sem paginação, sem limite de anexo por solicitação.**
*Escolha:* carregar a lista inteira do escopo num JSONB e filtrar no browser; não contar
anexos.
*Compra:* filtro e busca instantâneos, sem round-trip; código de lista trivial; e nenhuma
decisão arbitrária sobre "quantos anexos são demais".
*Custa:* um teto silencioso nos dois eixos. Com 121 solicitações e 102 anexos não dói; nada
no sistema avisa quando doer, e o modo supervisão (`escopo='todas'`) é justamente o que
cresce mais rápido.

**10. Fan-out de e-mail best-effort, nunca bloqueante.**
*Escolha:* notificar **depois** de persistir, num `try/catch` que nunca relança.
*Compra:* SMTP fora do ar jamais impede alguém de concluir uma solicitação — a
movimentação é o fato, o e-mail é o aviso.
*Custa:* não há garantia de entrega nem registro dela. Uma notificação perdida é invisível
exceto no log do servidor, e ninguém é reavisado. Foi o que exigiu a correção do `catch`
mudo, e o que faz o instante da aprovação precisar viajar de volta pela RPC (§8) — porque
sair sem data também era silencioso.
