# Briefing v5.9.1 — Anexos: excluir o arquivo errado, e o bloco livre vira "Outros anexos"

**Rota A (produto).** Patch de ajuste sobre a v5.9.0, pedido pelo Yan em 27/08/2026 depois de
ver a versão em produção. As 4 decisões abaixo foram fechadas no chat — **não rediscutir**.

## Objetivo

Dois ajustes no módulo de Solicitações:

1. **Excluir anexo.** Hoje não existe: quem anexa o arquivo errado convive com ele para sempre.
2. **Desfazer a ambiguidade dos dois blocos de anexo.** O bloco livre da v5.9.0 e os campos de
   anexo do tipo aparecem juntos, sem deixar claro qual usar.

---

## O que JÁ funciona (não reimplementar)

- **O campo de anexo do tipo já aceita N arquivos.** Ele lista todos (`arquivos.map`) e o
  `ControleAnexar` já permite acrescentar mais. A parte "permitir a inclusão de outros arquivos"
  do pedido original **já está pronta desde a v5.9.0** — o que falta é só clareza de rótulo.
- **`respostaSchema` já expõe `obrigatorio`**, então o cliente sabe quais campos exigem anexo
  sem nenhuma mudança de contrato.
- **`app.solicitacao_anexo.criado_por`** já existe (desde a `0127`) — quem anexou está gravado;
  só não é exposto ao front.

## Decisões firmes

| # | Decisão | Consequência |
|---|---|---|
| E1 | Os dois blocos **continuam**; o livre passa a se chamar **"Outros anexos"** | Mudança de uma palavra. Deixa o livre explicitamente COMPLEMENTAR, não alternativo |
| E2 | **Só quem anexou** pode excluir | Precisa expor `criado_por` ao front (hoje não é exposto) |
| E3 | Exclusão **apaga de vez** — metadado E binário no Storage | Sem soft-delete, sem coluna nova, sem filtro em toda leitura |
| E4 | **Bloquear** a exclusão do ÚLTIMO anexo de campo **obrigatório** | O fluxo do arquivo trocado vira "anexa o certo → apaga o errado". Campo obrigatório nunca fica vazio |

### O ponto que E4 resolve

A obrigatoriedade do campo de anexo é validada **só na abertura** (`criar_solicitacao` /
`0212`), e nunca revalidada depois — ela é gate de ENTRADA, não invariante permanente. Então
excluir não violaria nada no banco; deixaria a solicitação num estado que não teria sido aceito
na abertura. E4 escolhe **preservar o invariante mesmo sem o banco exigir**, e de graça: o
usuário anexa o substituto antes de apagar o errado, que é a ordem natural de quem está
corrigindo um upload.

---

## Banco — migration `0264` (ADITIVA)

⚠️ **Conferir o número livre no BANCO e nas worktrees irmãs imediatamente antes de aplicar.** A
v5.9.0 renumerou três vezes por causa disso (`0256`→`0258`→`0261`) — a última aplicada é a
`0263`, mas isso se confere, não se presume.

### `public.solic_anexo_excluir(p_anexo_id bigint) RETURNS jsonb` — RPC nova

Ordem das validações (a mais barata e a mais restritiva primeiro):

1. `PERFORM app.exigir_acesso()`;
2. carrega o anexo e a solicitação; `NOT FOUND` ou `NOT app.pode_ver_solic(v_sol)` →
   `NAO_ENCONTRADA` (42501) — não revelar existência do que não se pode ver;
3. `v_sol.status NOT IN ('aberta','aprovada')` → `TRANSICAO_ILEGAL` (solicitação encerrada é
   imutável — invariante da v5.9.0, vale para exclusão também);
4. **E2:** `coalesce(v_anexo.criado_por = app.uid_jwt(), false)` falso → `PERMISSAO_NEGADA`.
   O `coalesce` é obrigatório: `criado_por` é anulável (anexo antigo pode não ter autor), e
   `NULL` num `IF NOT (...)` não dispara o RAISE — é a classe do vazamento da `0129`;
5. **E4:** se `campo_id` não é nulo, o campo é `obrigatorio` e este é o **último** anexo daquele
   campo naquela solicitação → `ANEXO_OBRIGATORIO_UNICO`;
6. `DELETE FROM app.solicitacao_anexo WHERE id = p_anexo_id`;
7. `RETURN jsonb_build_object('ok', true, 'storage_path', <path>)` — a action precisa do caminho
   para apagar o binário, e o `DELETE` já levou a linha. Usar `RETURNING` ou capturar antes.

`SECURITY DEFINER` + `app.exigir_acesso` inline + `REVOKE`/`GRANT` explícitos. **Verificar via
REST com `service_role` depois de aplicar** — `db query` não executa o corpo.

> **Classificação:** `DELETE` dentro do CORPO de um `CREATE FUNCTION` **não** torna a migration
> destrutiva — o tokenizer do db-gate casa só o nível top-level (skill `banco-e-rpc` §1).
> Confirmar rodando `classificarSql` antes de aplicar; se vier `destrutiva`, é humano em TTY.

### `CREATE OR REPLACE app.solic_json` — expõe `sou_autor` por anexo

Cada item de `anexos` ganha `'sou_autor', coalesce(a.criado_por = app.uid_jwt(), false)`.
Mesmo padrão de `sou_solicitante`/`sou_atendente`: **afordância de UI**, com a autorização real
no banco. Boolean estrito, nunca nulo.

⚠️ **Extrair o corpo do CATÁLOGO VIVO** (`pg_get_functiondef`), não da migration de origem. Esta
função já mordeu a v5.9.0: ela divergia da `0130` (ganhou `origem` na `0217`) e reescrevê-la
pelo arquivo antigo teria apagado a chave em silêncio. Hoje a versão viva é a da `0263`… que
não a redefine — então é a da `0261`. **Confira no catálogo.**

---

## Front

- **`schemas.ts`** — `anexoSchema` ganha `sou_autor: z.boolean().optional()` (`.optional()`
  porque a RPC antiga não emite durante o rollout — lição v4.12.1/ADR-0118).
- **`actions.ts`** — `excluirAnexo(anexoId)`: chama a RPC, e com o `storage_path` retornado
  remove o binário via `getAdminClient()`. Se o Storage falhar, o metadado já saiu — logar e
  seguir (o inverso, apagar o binário antes, deixaria um anexo listado que não baixa).
  `traduzir()` ganha `ANEXO_OBRIGATORIO_UNICO`.
- **`drawer-solicitacao.tsx`** — `BotaoAnexo` ganha um botão de excluir, com `ConfirmModal`
  (exclusão é irreversível). Ele aparece quando:
  `a.sou_autor && emAndamento(sol.status) && !(campo obrigatório && arquivos.length === 1)`.
  No caso bloqueado, **não esconder sem explicação**: desabilitar com `title` dizendo que o
  campo é obrigatório e é preciso anexar o substituto antes.
  Rótulo do bloco livre: **"Anexos" → "Outros anexos"** (E1).
- ⚠️ `BotaoAnexo` está definido DENTRO do drawer. Se ganhar props e complexidade, o React
  Compiler pode acusar `static-components` — foi o que aconteceu com `ControleAnexar` na
  v5.9.0. Se o lint reclamar, **içar ao módulo** (skill `react-padroes` §1c), nunca silenciar.

## Testes

- `ciclo-de-vida.test.ts` (ou arquivo irmão): a RPC recusa anexo de terceiro, recusa em
  solicitação encerrada, recusa o último de campo obrigatório, e **aceita** o último de campo
  NÃO-obrigatório. Apontar o `SQL_*` para a `0264` — a lição da v5.9.0 é que teste de paridade
  amarrado à migration errada aprova corpo morto.
- `rpc-contrato.test.ts`: `sou_autor` nas três formas (ausente / false / true).

## Invariantes (inegociáveis)

1. **Solicitação encerrada é imutável** — não aceita anexo novo nem exclusão.
2. **Só quem anexou exclui** (E2), com `coalesce` null-safe no predicado.
3. **Campo obrigatório nunca fica sem anexo** (E4).
4. **Exclusão remove metadado E binário** — anexo listado que não baixa é pior que nenhum.
5. RLS deny-by-default preservado; acesso só via RPC `SECURITY DEFINER`; bucket segue privado.

## Missões

1. **M1** — migration `0264` (RPC nova + `CREATE OR REPLACE solic_json`), revisada por
   `revisor-db` ANTES de aplicar.
2. **M2** — contrato (`schemas.ts`) e `actions.ts`.
3. **M3** — drawer: botão de excluir com confirmação, estado bloqueado explicado, rótulo novo.
4. **M4** — testes.
5. **M5** — `/fechamento-versao` (CHANGELOG × 2, version bump 5.9.1, out-briefing, PR).
   **Sem ADR novo:** isto ajusta o que o ADR-0169 já decide; vira **Emenda 2** nele.

**Gates:** `npx tsc --noEmit` + `npm run lint` por missão; `build` + `test` no fechamento.

## Checkpoint humano

- **Conferência visual** ao final: excluir um anexo próprio, ver o botão ausente/desabilitado
  num anexo de terceiro e num campo obrigatório com um só arquivo.
- A conferência visual da **v5.9.0** segue pendente e pode ser feita na mesma passada.
