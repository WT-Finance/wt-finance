# Investigação — Ingestão (insumo da v6) · Parte 2: viabilidade de um caminho servidor a servidor

**Data:** 2026-09-21 · **Natureza:** só leitura (código em `origin/main` `59a986a`, catálogo do
banco via `npx supabase db query --linked` — pg_catalog, `cron.*`, `net._http_response`,
`monde.ingest_control`, `financeiro.dre_comp_map/par`; nenhuma escrita no repo além deste arquivo,
nenhuma escrita no banco, nenhuma chamada à API do Monde). **Formato:** medida + evidência.
Sem recomendação. Complementa `docs/investigacao-v6-ingestao.md` (parte 1).

Convenção: `caminho:linha` para código/doc; `query → resultado` para catálogo. "Corpo vivo" =
`pg_get_functiondef` lido do banco, não a migration.

---

## A. Os parsers são reutilizáveis fora do navegador?

### A1. Imports e dependência de browser

| Arquivo | Imports | Toca DOM/File/FileReader/Worker/window? | Veredito |
|---|---|---|---|
| `src/lib/carga/vendas-parser.ts` (núcleo) | `./coercao` (`toNum`) — linha 19 | Não. Exporta `normalizeHeader`, `toIsoDate`, `parseVendasRows(aoa, nomeArquivo)` (75, 91, 136) | **PURO** |
| `src/lib/carga/parse-vendas-produto.ts` | `'use client'` (1); `./vendas-parser` (10); `@e965/xlsx` por `import()` dinâmico (19) | Sim: assinatura `file: File` (16); `file.name` (20), `file.text()` (24), `file.arrayBuffer()` (31) | **DEPENDE-DE-BROWSER** (só pela interface `File`; nenhuma API de DOM além dela) |
| `src/lib/carga/parse-lancamentos.ts` | `./lancamentos` (tipo), `./coercao`, `./colunas-obrigatorias` (1-3); `@e965/xlsx` dinâmico (16) | Sim: `file: File` (13); `file.name`/`text()`/`arrayBuffer()` (17-25). **Não tem função `*Rows` separada** — o laço de linhas vive dentro da função de `File` (37-62) | **DEPENDE-DE-BROWSER** |
| `src/lib/carga/lancamentos.ts` (irmão servidor) | `@e965/xlsx` estático (1), `@/lib/supabase/admin` (2), `./coercao` (3) | Não usa `File`: `parseCsvBuffer(buffer: Buffer)` (34) e `carregarLancamentos(buffer: Buffer, modo)` (93) | **PURO/Node** — importa `getAdminClient` (server-only). É o parser da rota `api/admin/upload-lancamentos` (§B3) e **duplica** a lógica de `parse-lancamentos.ts` (mesmas 3 colunas obrigatórias, `lancamentos.ts:32`) |
| `src/lib/carga/parse-lancamentos-movimentacao.ts` | `./coercao`, `./vendas-parser` (`normalizeHeader`), `./colunas-obrigatorias` (15-17); `@e965/xlsx` dinâmico (164) | `parseLancamentosMovimentacaoRows(aoa, nome)` (84) é puro; `parseLancamentosMovimentacaoFile(file: File)` (160-161) usa `file.name/text()/arrayBuffer()` | núcleo **PURO**; invólucro **DEPENDE-DE-BROWSER** |
| `src/lib/carga/parse-titulos-em-aberto.ts` | idem (18-20); `@e965/xlsx` dinâmico (161) | `parseTitulosEmAbertoRows` (83) puro; `parseTitulosEmAbertoFile(file: File)` (157-158) | núcleo **PURO**; invólucro **DEPENDE-DE-BROWSER** |
| `src/lib/carga/parse-pessoas.ts` | `./coercao` (`toStr`), `./vendas-parser`, `./colunas-obrigatorias` (15-17); `@e965/xlsx` dinâmico (85) | `parsePessoasFile(file: File)` (81-82); **sem `*Rows`** — o laço vive na função de `File` (98-120) | **DEPENDE-DE-BROWSER** |
| `src/lib/carga/parse-demonstrativo-competencia.ts` | `./coercao` (`toNum,toIsoDate,toStr,toCentavos`), `./vendas-parser`, `./colunas-obrigatorias` (44-46); `@e965/xlsx` dinâmico (239) | `parseDemonstrativoCompetenciaRows(aoa, nome)` (126) e `somaCentavos` (99) puros; `parseDemonstrativoCompetenciaFile(file: File)` (222-223) checa `file.name` (228) e lê `arrayBuffer()` (240) | núcleo **PURO**; invólucro **DEPENDE-DE-BROWSER** |
| `src/lib/carga/parse-em-worker.ts` | `type ParseKind` de `./parse.worker` | Sim: `typeof Worker` (14), `new Worker(new URL(...), {type:'module'})` (18), `postMessage` (39) | **DEPENDE-DE-BROWSER** (é a orquestração do worker) |
| `src/lib/carga/parse.worker.ts` | os 6 `parse*File` (8-13) | Sim: `self` como `DedicatedWorkerGlobalScope` (39), `onmessage`/`postMessage` (41-50) | **DEPENDE-DE-BROWSER** |

Nenhum parser usa `window`, `document` ou `FileReader`. A única dependência de browser dos
invólucros `*File` é a interface `File` (`name`, `text()`, `arrayBuffer()`), e `Blob`/`File`
existem no runtime Node ≥ 20 (a rota `api/admin/upload-lancamentos/route.ts:22,34` já testa
`file instanceof Blob`/`File` no servidor).

### A2. Assinatura de entrada e a chamada `XLSX.read`

| Parser | Entrada | `XLSX.read` (transcrição) | `sheet_to_json` |
|---|---|---|---|
| `parse-vendas-produto.ts` | `File` | CSV: `XLSX.read(text, { type: 'string', cellDates: true, raw: true })` (29) · XLSX: `XLSX.read(buffer, { type: 'array', cellDates: true, raw: false })` (32) | `sheet_to_json<unknown[]>(sheet, { header: 1, defval: null })` (36) — **sem `raw`** (default `true`) |
| `parse-lancamentos.ts` | `File` | CSV: `read(text, { type: 'string', cellDates: true, raw: true })` (22) · XLSX: `read(buffer, { type: 'array', cellDates: true, raw: false })` (25) | `sheet_to_json<Record<string,unknown>>(sheet, { defval: null })` (29) — objetos por cabeçalho, sem `raw` |
| `lancamentos.ts` (servidor) | `Buffer` | `XLSX.read(buffer.toString('utf-8'), { type: 'string', cellDates: true, raw: true })` (37) — **só CSV**, mesmo que a rota aceite `.xlsx` (`route.ts:36`) | `sheet_to_json<Record<string,unknown>>(sheet, { defval: null })` (39) |
| `parse-lancamentos-movimentacao.ts` | `File` → `*Rows(aoa)` | CSV: `read(text, { type: 'string', cellDates: true, raw: true })` (174) · XLSX: `read(buffer, { type: 'array', cellDates: true, raw: false })` (177) | `sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true })` (189) |
| `parse-titulos-em-aberto.ts` | `File` → `*Rows(aoa)` | CSV: idem (170) · XLSX: idem `raw: false` (173) | `sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true })` (182) |
| `parse-pessoas.ts` | `File` | CSV: idem (91) · XLSX: idem `raw: false` (94) | `sheet_to_json<Record<string,unknown>>(sheet, { defval: null })` (98) |
| `parse-demonstrativo-competencia.ts` | `File` (só `.xlsx`, 228-236) → `*Rows(aoa)` | `XLSX.read(buffer, { type: 'array', cellDates: true })` (244) — sem `raw`; comentário na 241-243 diz que a opção "é ignorada ali" | `sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true })` (251) |

Medida, sem juízo: 5 dos 6 parsers de UI mantêm `raw: false` na chamada `XLSX.read` do ramo
`.xlsx`; o 6º (competência) omite a opção e documenta que ela não tem efeito no `read`. O `raw`
que a v5.5.2 corrigiu é o do `sheet_to_json`.

### A3. O que `parseArquivoEmWorker` faz além de chamar o parser

Transcrição de `src/lib/carga/parse-em-worker.ts:9-41`: recebe `(kind, file, fallback)`; se
`typeof Worker === 'undefined'` chama `fallback(file)` (14); tenta `new Worker(...)` e em exceção
chama `fallback` (16-21); devolve `Promise` que resolve no primeiro `onmessage` com `e.data` (33),
ou, em `onerror`, chama `fallback(file)` (35-39); `terminate()` em ambos os caminhos; envia
`postMessage({ kind, file })` (40). O worker (`parse.worker.ts:41-50`) só faz `PARSERS[kind](file)`
e devolve o resultado ou `{ error }`.

**Lógica de negócio que existe só na página, fora do parser** (`src/app/admin/uploads/page.tsx`):
- Vendas: `totalLinhas` é o nº de **vendas únicas** (`new Set(res.map(r => r.venda_numero))`,
  linhas 525-527), não de linhas — só para o modal antes/depois.
- Competência: `somaCentavos(rows)` é calculada na página **antes** do envio (650) e passada ao
  `finalizar` como oráculo; a função vive no parser (`parse-demonstrativo-competencia.ts:99`), a
  decisão de medir antes vive na página.
- O nome do arquivo é passado a `inserirLoteDemonstrativoCompetenciaAction(..., nome)` (655) para
  `arquivo_origem`; nas outras bases o `arquivo_origem` vai dentro de cada linha parseada
  (`vendas-parser.ts:155`).
- O restante é orquestração: `getXxxStatusAction` → modal de confirmação → lotes
  (`BATCH` por base, `page.tsx:101-166`) → `finalizarXxxAction`.

### A4. Testes dos parsers

| Arquivo de teste | casos (`it`/`test`) | chama `parse*File` (caminho ARQUIVO)? | chama `parse*Rows` (matriz)? |
|---|---|---|---|
| `vendas-parser.test.ts` | 15 | não | sim (`parseVendasRows`, 14 chamadas) |
| `parse-vendas-produto.test.ts` | 4 | **não** — testa só `normalizeHeader` e `toIsoDate` (linhas 2, 8, 17) | não |
| `parse-fluxo-caixa-onda1.test.ts` | 12 | não | sim (Movimentação + Títulos) |
| `parse-fluxo-caixa-valor-nativo.test.ts` | 8 | **sim** (`parseLancamentosMovimentacaoFile`, `parseTitulosEmAbertoFile`; monta `.xlsx` real) | 1 |
| `parse-pessoas.test.ts` | 3 | **sim** (`parsePessoasFile`) | — (não existe `*Rows`) |
| `parse-demonstrativo-competencia.test.ts` | 16 | **sim** (8 chamadas) | sim (5) |
| `coercao.test.ts` / `colunas-obrigatorias.test.ts` | 16 / 7 | — | — |

**Sem nenhum teste:** `parse-lancamentos.ts` (`parseLancamentosFile`) e `lancamentos.ts`
(`carregarLancamentos`/`parseCsvBuffer`) — grep de ambos os nomes em `src/**/*.test.ts` → 0
arquivos. `parseVendasProdutoFile` também não tem teste pelo caminho ARQUIVO (só o núcleo
`parseVendasRows`).

---

## B. Existe precedente de chamador máquina autenticado?

### B1. API externa de Solicitações (v5.4.0, as-built ADR-0172)

| Item | Medida | Evidência |
|---|---|---|
| Rotas | `GET /api/externo/tipos` · `GET,POST /api/externo/solicitacoes` · `GET /api/externo/solicitacoes/[id]` · `POST /api/externo/solicitacoes/[id]/cancelar`; todas `runtime = 'nodejs'`, `maxDuration = 60` | `src/app/api/externo/**/route.ts` (grep de `export async function`) |
| Autenticação | header `x-api-key`; `autenticarChamada(req)` faz `hashSegredo` (sha256) e resolve por igualdade de hash via RPC `api_chave_resolver` (service_role); ausente → `401 AUTH_AUSENTE`, inválida/revogada → `401 AUTH_INVALIDA` | `src/lib/api-externa/http.ts:59-65`; `docs/adr/0172-...md:28-38`; chave em `app.api_chave.segredo_hash` (`0211_api_chaves.sql`) |
| Onde valida | dentro de cada `route.ts` — o middleware é **isento** por prefixo `API_AUTH_PROPRIA_PREFIXOS = ['/api/externo/']` | `src/proxy.ts:38`; ADR-0172:40-43 |
| Autorização | "a chave **é** a autorização — não há RBAC humano no caminho"; alcance por tipo (`exposto_via_api`), não por chave; whitelist por chave removida (0224/0226) | ADR-0172:45-53 |
| Rate limit | **não existe** — grep `rate|throttle|429` em `src/app/api/externo`, `src/lib/api-externa/*.ts`, `0211_api_chaves.sql` → 0 ocorrências. Há teto de **corpo** (`lerBodyLimitado`, 65.536 bytes → `413`) | `http.ts:79-92` |
| Log de chamada | `app.api_chamada_log (id, chave_id, rota, status, detalhe, criado_em)`, gravado por `registrarChamada` (best-effort, inclusive auth negada com `chave_id NULL`); leitura por `api_log_listar(p_chave_id, p_limit ≤ 200)` | `http.ts:194-210`; `0211_api_chaves.sql:293-310`; catálogo: `n_live_tup = 2` |
| Idempotência | par `(chave, chave_idempotencia)` único em `app.solicitacao`; reenvio devolve o mesmo id (200 em vez de 201) | ADR-0172:86-90 |

### B2. Como as Server Actions de `/admin/uploads` autenticam

Cada action começa com `await requireAreaAction('admin/uploads')` **antes** do `try`
(`src/app/admin/uploads/actions.ts:23,45,113,150,222,246,...`). Transcrição do guard
(`src/lib/auth/sessao.ts:101-108`):

```ts
export async function requireAreaAction(areas: Area[] | Area | null): Promise<Sessao> {
  const sessao = await getSessao()
  if (!sessao.logado) throw new Error('AUTH_NECESSARIA')
  if (sessao.precisaTrocarSenha) throw new Error('TROCA_SENHA_OBRIGATORIA')
  const lista = areas === null ? null : Array.isArray(areas) ? areas : [areas]
  if (!temAlguma(sessao, lista)) throw new Error('PERMISSAO_NEGADA')
  return sessao
}
```

Sessão = cookie do Supabase Auth (JWT) lido por `getSessao()`; área RBAC = `admin/uploads`.
Depois do guard, as RPCs de carga rodam via `getAdminClient()` (service_role) — o
`app.exigir_acesso` **não** participa das RPCs de upload (`truncar_*`, `inserir_lote_*`,
`promover_*` são `service_role`-only, sem `exigir_acesso` no corpo — §C1/C2). A única RPC do
fluxo com `exigir_acesso` é `provisionar_dre_comp_par` (`PERFORM app.exigir_acesso(ARRAY['financeiro/dre'])`,
corpo vivo).

### B3. Rotas em `src/app/api/` — método e auth

| Rota | Métodos | Auth | Aceita arquivo? |
|---|---|---|---|
| `admin/upload-lancamentos` | POST | `requireAreaApi('admin/uploads')` (sessão) | **SIM** — `request.formData()`, campo `file` (`Blob`), `modo=preview|executar`, teto 50 MB, `.csv`/`.xlsx`; chama `carregarLancamentos(Buffer)` (`route.ts:7-44`) |
| `gerencial/import` | POST | `requireAreaApi('financeiro/gerencial')` + exige `sessao.userId` | **SIM** — `formData()`, `file`, teto 10 MB, `parseGerencialExcel(arrayBuffer)` (`route.ts:61-77`) |
| `monde/ingest` | GET, POST | `Authorization: Bearer $CRON_SECRET` **ou** `requireAreaApi(['admin/uploads'])`; isenta do middleware em `API_AUTH_PROPRIA` | não (query string) |
| `cdi/ingest` | GET, POST | idem (`CRON_SECRET` ou sessão `admin/uploads`) | não |
| `externo/tipos`, `externo/solicitacoes`, `externo/solicitacoes/[id]`, `externo/solicitacoes/[id]/cancelar` | GET / GET,POST / GET / POST | `x-api-key` (§B1) | não (JSON ≤ 64 KiB; "SEM anexos", `solicitacoes/route.ts:3`) |
| `dashboard/executiva/kpis`, `dashboard/kpi-historico`, `dashboard/performance/{cagr,mix-produto,mix-setor,prejuizos,tendencia-margem}`, `dashboard/weddings/{carteira,operacao/[id],operacoes,pipeline,proximos,sumario-subsetor}`, `setores` | GET | `requireAreaApi(<área>)` (sessão) | não |

Duas rotas aceitam `multipart/form-data` com arquivo; ambas exigem **sessão de usuário**
(cookie), nenhuma aceita chave de máquina. A rota `admin/upload-lancamentos` é o caminho
servidor da base Lançamentos por Operação; a UI de `/admin/uploads` **não a usa** (a página chama
Server Actions, `page.tsx:29-45`; grep de `upload-lancamentos` em `src/app/admin` → 0).

### B4. Supabase Storage

| Bucket | Onde nasce | Política | Uso no código |
|---|---|---|---|
| `solicitacoes-anexos` | `0127_solicitacoes_schema.sql:113-121` — `public=false`, `file_size_limit=10 MiB`, MIME: pdf, png, jpeg, webp, xlsx, csv | sem policy em `storage.objects` → deny-by-default; upload/leitura server-side via service_role, signed URL 60 s | `src/app/solicitacoes/actions.ts:20,112,124,181,195,249,265,294` |
| `acervo-documentos` | `0165_acervo_documentos.sql:50-56` — `public=false`, 25 MiB, `allowed_mime_types = NULL` | idem, signed URL 60 s | `src/app/financeiro/acervo/actions.ts:20,76,91,98` |

Nenhum bucket ligado a upload de planilha de ingestão. Nenhuma outra chamada `storage.from(`
em `src/` fora desses dois arquivos.

---

## C. O que falta para as 4 cargas não atômicas virarem staging+swap

### C1. Anatomia do `promover_*` (corpo vivo)

**`public.promover_carga_vendas()`** (plpgsql, `SECURITY DEFINER`, `search_path=''`):
1. `PERFORM pg_advisory_xact_lock(4017001)` — lock transacional; o 2º `promover` espera.
2. `count(*)` da staging; `= 0` → `RAISE EXCEPTION`.
3. Range de `data_venda` × `min/max(analytics.dim_data)`; fora → `RAISE EXCEPTION`.
4. `TRUNCATE analytics.fato_venda_item, analytics.fato_venda, analytics.dim_produto,
   analytics.dim_pagante, analytics.dim_vendedor, raw.vendas_excel RESTART IDENTITY CASCADE;`
5. `INSERT INTO raw.vendas_excel (...22 colunas...) SELECT ... FROM raw.vendas_excel_staging;`
6. `v_result := public.transform_raw_to_analytics();` → `PERFORM public.regenerar_dim_operacao_weddings();`
   → `PERFORM public.refresh_all_materialized_views();`
7. `TRUNCATE raw.vendas_excel_staging RESTART IDENTITY;` → `RETURN v_result` (`vendas_count`,
   `fato_venda_item_count`).

Padrão: **TRUNCATE + INSERT…SELECT dentro do corpo de UMA função** (= uma transação), não
`ALTER TABLE RENAME`, não `DELETE`. Erro em qualquer passo → rollback de tudo, inclusive do
TRUNCATE. Lock: advisory transacional, compartilhado com `limpar_staging_vendas` e
`inserir_lote_staging` (mesma chave, `0135`).

**`public.promover_carga_pessoas()`**: `count(*)` da staging (`= 0` → exceção) →
`TRUNCATE raw.pessoas` → `INSERT INTO raw.pessoas (17 colunas) SELECT ... FROM raw.pessoas_staging`
→ `TRUNCATE raw.pessoas_staging` → `RETURN {pessoas_count}`. **Sem advisory lock**, sem
validação de conteúdo além de "não vazia".

### C2. As quatro cargas não atômicas — corpo vivo do `truncar_*` e fronteira de transação

| Base | `truncar_*` (corpo vivo, íntegro) | Passo seguinte | Mesma transação? |
|---|---|---|---|
| Lançamentos por Operação | `truncar_lancamentos()`: `TRUNCATE analytics.fato_lancamento_operacao;` | `inserir_lote_lancamentos` ×N; depois `regenerar_dim_operacao_weddings` (wrapper público → `analytics.regenerar_dim_operacao_weddings()`, que faz `TRUNCATE analytics.dim_operacao_weddings` + `INSERT … SELECT` lendo `fato_lancamento_operacao` **e** `raw.vendas_excel`) | **Não.** `truncar` é chamado em `inserirLoteLancamentosAction(lote, isFirst=true)` (`actions.ts:49-51`), cada lote é uma chamada de Server Action separada (`page.tsx:603-608`), e `regenerar` roda em `finalizarLancamentosAction` (`actions.ts:70`) — outra requisição. Cada RPC pelo PostgREST é sua própria transação. |
| Lançamentos por Movimentação | `truncar_lancamentos_movimentacao()`: `TRUNCATE raw.lancamentos_movimentacao RESTART IDENTITY;` | `inserir_lote_lancamentos_movimentacao` ×N; `regenerar_fluxo_caixa` | **Não.** `truncar` em `inserirLoteLancamentosMovimentacaoAction` (`actions.ts:307-309`); `regenerar` em `finalizarLancamentosMovimentacaoAction` → `regenerarFluxoCaixa` (`actions.ts:322-328, 390`). |
| Títulos em Aberto | `truncar_titulos_em_aberto()`: `TRUNCATE raw.titulos_em_aberto RESTART IDENTITY;` | idem; `regenerar_fluxo_caixa` | **Não.** (`actions.ts:363-365, 378-384`). |
| Competência | `truncar_demonstrativo_competencia()`: `TRUNCATE raw.demonstrativo_competencia RESTART IDENTITY;` | `inserir_lote_demonstrativo_competencia` ×N; `status_demonstrativo_competencia` (alarme); `provisionar_dre_comp_par` | **Não.** `truncar` em `inserirLoteDemonstrativoCompetenciaAction` (`actions.ts:494-496`); alarme + `provisionar` em `finalizarDemonstrativoCompetenciaAction` (`actions.ts:516-580`). Não há `regenerar`: a leitura é a view `financeiro.vw_dre_competencia`. |

`regenerar_fluxo_caixa()` (corpo vivo): sincroniza `dim_conta_bancaria` e `dim_categoria`
(`INSERT … ON CONFLICT`), depois `TRUNCATE financeiro.fato_fluxo RESTART IDENTITY` e três
`INSERT … SELECT` (realizado, previsto por movimentação futura, previsto por título). É uma
transação **própria**, separada dos lotes.

Consequência medida (não juízo): nas 4 bases, entre o `truncar` (1ª chamada) e o último lote a
tabela viva está parcialmente preenchida e visível a qualquer leitor; um lote com erro deixa a
base **parcial** (a action retorna `{ error }` e a página para, `page.tsx:604-606`). Em Vendas e
Pessoas isso não ocorre porque a viva só muda dentro do `promover`.

### C3. Lançamentos por Operação: colunas do arquivo × tabela

`analytics.fato_lancamento_operacao` tem **14 colunas** (catálogo): `id, lancamento_n, venda_n,
pessoa, descricao, liquidacao_dt, vencimento_dt, valor, tipo, operacao, status, data_final,
mes_ano, importado_em`. `inserir_lote_lancamentos` grava 12 delas (todas menos `id` e
`importado_em`, que têm default) — corpo vivo.

O parser lê **12 cabeçalhos** do arquivo (`parse-lancamentos.ts:40-62`): `Operacao`, `Valor`,
`Tipo` (obrigatórios, `lancamentos.ts:32`), `Lançamento.N.`, `Venda.N.`, `Pessoa`, `Descrição`,
`Liquidação`, `Vencimento`, `Status`, `Data_Final`, `Mes_Ano`. Mapeamento 1:1 para as 12 colunas
gravadas. Transformações no parser: `valor = Math.abs(toNum(row['Valor']))` (55); linha com
`Operacao` vazia, `Valor` nulo ou `Tipo ∉ {Entrada, Saída}` é **descartada em silêncio** (41-47).
Colunas do arquivo além dessas 12 não são lidas (o parser indexa por nome, `sheet_to_json` sem
`header: 1`), então **não há coluna descartada por falta de destino na tabela**; o que se perde
são linhas, não colunas. Não existe tabela `raw` para esta base; `arquivo_origem` não é gravado.

---

## D. Log e rastro de carga

### D1. Tabelas de histórico/log no catálogo e cobertura do diário

Varredura de `pg_class` (relkind r/v/m, fora de schemas de sistema) por nome
`~* 'log|audit|carga|ingest|diario|historico|tripwire|controle|control'`:

| Tabela | Colunas | `n_live_tup` | O que guarda |
|---|---|---|---|
| `audit.ingestao_log` | `id, fonte, iniciado_em, finalizado_em, status, registros_processados, erro_mensagem` | 10 | "uma linha por execução do script seed" (`0005_audit_tables.sql:4`); escrita por `registrar_ingestao_log` (`0008:205`). Nenhum consumidor em `src/` além do tipo gerado (`database.ts:794`). **Os uploads de `/admin/uploads` não escrevem nela.** |
| `app.api_chamada_log` | `id, chave_id, rota, status, detalhe, criado_em` | 2 | chamadas da API externa (§B1) |
| `app.meta_setor_historico` | `..., valor_anterior, motivo_alteracao, alterado_por, ...` | 106 | histórico de metas — não é ingestão |
| `financeiro.diario_alteracoes` | `id, tabela_alvo, operacao, registro_id, dados_antes, dados_depois, usuario_id, usuario_nome, lote_id, origem_undo, criado_em` | 4.384 | diário linha a linha das tabelas sob trigger `fn_diario_alteracoes` (abaixo) |
| `monde.ingest_control` | `chave, valor, atualizado_em` | 7 | cursores e marcas da ingestão Monde (§D3) |

**Tabelas sob o trigger do diário** (`pg_trigger`, função `financeiro.fn_diario_alteracoes`):
`analytics.gerencial_lancamentos`, `estante.livro`, `estante.movimentacao`, `financeiro.dre_bloco`,
`financeiro.dre_categoria_map`, `financeiro.dre_comp_bloco`, `financeiro.dre_comp_par`,
`patrimonio.ativo`, `patrimonio.movimentacao`. **Nenhuma tabela `raw.*`, nenhuma
`analytics.fato_*`, nenhuma `monde.*`** tem trigger de diário (a lista completa de triggers
não-internos nos schemas `raw, analytics, financeiro, monde, app, estante, patrimonio, dim` tem
16 entradas, todas nas 9 tabelas acima).

Não existe tabela que registre **quem** subiu **qual arquivo**, **quando**, com **quantas linhas**
para os 6 cards. O rastro por base é: `arquivo_origem` + `carregado_em` por linha
(`raw.vendas_excel`, `raw.lancamentos_movimentacao`, `raw.titulos_em_aberto`,
`raw.demonstrativo_competencia`); só `carregado_em` em `raw.pessoas`; só `importado_em` em
`analytics.fato_lancamento_operacao`. Nenhuma guarda o usuário.

### D2. `status_*` / `get_upload_status`: estado atual ou histórico?

Todos devolvem **estado atual**, sem histórico (corpos vivos):
- `get_upload_status()`: `count(*)` e `max(criado_em)` de `analytics.fato_venda`; `count(*)` e
  `max(importado_em)` de `analytics.fato_lancamento_operacao`.
- `status_pessoas()`, `status_lancamentos_movimentacao()`, `status_titulos_em_aberto()`:
  `count(*)` + `max(carregado_em)` da raw correspondente.
- `status_demonstrativo_competencia()`: `count`, `soma_centavos`, `pares`, `cobertura_de/ate`,
  `max(carregado_em)` (`0255:134-146`).
- `monde_ingest_status()`: contagens de `monde.venda`/`venda_item`, `max(sincronizado_em)`, e as
  chaves `ultimo_incremental`, `ultima_reconciliacao`, `reconciliacao_cursor`, `ingest_em_curso`,
  `tripwire` de `monde.ingest_control` — o `tripwire` é o único valor que carrega histórico por
  mês (JSON com 3 meses).

### D3. Os 5 jobs de cron — onde fica o resultado

| Job | schedule | execuções em `cron.job_run_details` | falhas | último status |
|---|---|---|---|---|
| `monde-ingest-incremental` | `*/15 * * * *` | 6.589 (15/07 → 21/09 15:15 UTC) | 0 | `succeeded / 1 row` |
| `monde-reconciliacao-1/2/3` | `5 6`, `20 6`, `35 6 * * *` | 48 cada (05/08 → 21/09) | 0 | `succeeded / 1 row` |
| `cdi-ingest-mensal` | `0 9 3 * *` | 1 (03/09) | 0 | `succeeded / 1 row` |

O que `cron.job_run_details` registra é o resultado do **`SELECT net.http_post(...)`**, que é
**assíncrono**: `succeeded / 1 row` significa "a requisição foi enfileirada", não "a rota
respondeu 200". Camadas onde o resultado real aparece:

| Camada | O que guarda | Retenção / medida |
|---|---|---|
| `cron.job_run_details` | status do enfileiramento | 6.589 linhas desde 15/07; `cron.log_run = on`, `cron.log_statement = on` |
| `net._http_response` | `status_code`, `error_msg`, `created` da resposta HTTP da rota | **`pg_net.ttl = 6 hours`**: hoje há 24 linhas, de 09:30 a 15:15 UTC, 0 com `status_code <> 200`, 0 com `error_msg` |
| `monde.ingest_control` | `ultimo_incremental = 2026-09-14..2026-09-21` (15:15:41 UTC), `ultimo_promover`, `ultima_reconciliacao`, `reconciliacao_cursor = 2026-08`, `tripwire` (JSON por mês, `acendeu:false`), `ultima_remocao` (13/08), `backfill_cursor = 2026-07` | 7 chaves; sobrescritas a cada rodada — só o **último** valor |
| Vercel (stdout) | `console.log('[monde-ingest] …')` por passo e `console.error('[monde-ingest] ERRO: …')` (`route.ts:97,318`); a resposta JSON leva o `log[]` | logs da função, fora do banco |
| Card "Sincronização Monde" | `monde_ingest_status` → frescor + tripwire | estado atual |

**Se `monde-ingest-incremental` falhar às 3h:** `cron.job_run_details` continua `succeeded`
(o `http_post` enfileirou); `net._http_response` guarda `status_code`/`error_msg` daquela chamada
por até 6 h (apagada antes do horário comercial); `monde.ingest_control.ultimo_incremental` **não
avança** (é escrito pelo `ingestWindow` só ao terminar) — o card mostra a última sincronização
com atraso, e o tripwire da reconciliação das 06:05-06:35 acusa se o mês fechar diferente. Não há
tabela de erro por execução e não há e-mail/alerta.

---

## E. Oráculo da v5.8.0

### E1. Localização e natureza da asserção

Dois arquivos:

**(a) `src/lib/rpc-contrato.test.ts:1555-1620`** — contrato REST contra a **base viva**
(`describe.skipIf(!ON)`, pulado sem `.env.local`), anos `[2024, 2025, 2026]`. A asserção é
**RELACIONAL**, não literal. Transcrição:

```ts
it('ORÁCULO: REX ≡ soma de todas as linhas classificadas do ano, ao centavo', async () => {
  for (const ano of ANOS) {
    const d = dreCompMensalSchema.parse(await rpc('get_dre_competencia_mensal', { p_ano: ano }))
    const rex = d.linhas.find(l => l.t !== 'cat' && l.chave === 'REX')
    expect(rex, `${ano}: linha REX ausente`).toBeDefined()
    expect(cent(rex!.total), `${ano}: REX × soma da base`).toBe(d.reconciliacao.linhas_centavos)
  }
})
it('completude: base = linhas + bandeja + excluídas (nada some em silêncio)', ...
    expect(r.base_centavos).toBe(r.linhas_centavos + r.bandeja_centavos + r.excluidas_centavos)
    expect(r.fecha).toBe(true)
it('REXG = REX − REEMB ...', ...
    expect(cent(rexg!.total)).toBe(cent(rex!.total) - cent(reemb!.total))
```

Comentário do próprio arquivo (1556-1560): "O oráculo NÃO crava número: a fonte é um upload que
o Yan re-gera, e teste que crava número de dado editável nasce falso-vermelho".

**(b) `src/lib/dre/competencia-estrutura.test.ts`** — oráculo **estrutural**, sem banco: lê
`supabase/migrations/0256_dre_competencia_estrutura.sql` e os anexos
`docs/briefings/anexo-v5-8-0-{arvore,depara}-competencia.csv` (24-26) e prova que `REX` expande
para coeficiente +1 em cada folha (199-206), que `REXG` cancela `REEMB` (209-221) e que todas as
folhas são usadas pelo de-para. **Nenhum número de dinheiro** aparece (comentário 17-21).

**Nenhum dos dois contém `208.743,77`** (grep de `208.743|208743` em `src/**/*.test.ts` → 0).
O valor literal, se existir, está fora da suíte (out-briefing/relatório), não em asserção.

### E2. Seed de `dre_comp_map` — os 141 pares

Fonte: `INSERT INTO financeiro.dre_comp_map (...) VALUES` em
`supabase/migrations/0256_dre_competencia_estrutura.sql:136-…` (gerado por
`scripts/gera-seed-dre-competencia.mjs` a partir de `docs/briefings/anexo-v5-8-0-depara-competencia.csv`).
Contagens conferidas: **141 linhas no seed**, **141 em `financeiro.dre_comp_map` vivo**, **141 em
`financeiro.dre_comp_par`** (tabela editável, 0 com `sub_chave IS NULL`); `diff` seed × vivo do
`dre_comp_map` (grupo|descrição|sub_chave) → **idêntico**. Lista ao fim do arquivo (§ Anexo).

---

## F. Vendas por Produto: Excel × API, campo a campo

### F1. Colunas que o parser lê e destino em `raw.vendas_excel`

`COL_MAP` (`src/lib/carga/vendas-parser.ts:45-66`), casamento tolerante por `normalizeHeader`;
**nenhuma coluna é obrigatória** (`page.tsx:106`: "parser tolerante"). Destino: `inserir_lote_staging`
→ `raw.vendas_excel_staging` → `promover_carga_vendas` copia 22 colunas para `raw.vendas_excel`.

| Cabeçalho Excel | campo parser | coluna `raw.vendas_excel` | coerção | consumido por `transform_raw_to_analytics`? |
|---|---|---|---|---|
| Venda Nº | `venda_numero` | `venda_numero text` | `toStr` | sim (`fato_venda`, chave) |
| Data Venda | `data_venda` | `data_venda date` | `toIsoDate` | sim |
| Vendedor | `vendedor` | `vendedor text` | `toStr` | sim (`dim_vendedor`, `UPPER(TRIM)`) |
| Pagante | `pagante` | `pagante text` | `toStr` | sim (`dim_pagante`) |
| Setor Macro | `setor_macro` | `setor_macro text` | `toStr` | não (o item usa `setor`/`setor_micro`) |
| Setor | `setor` | `setor text` | `toStr` | sim (`dim_setor`) |
| Setor Micro | `setor_micro` | `setor_micro text` | `toStr` | sim (`dim_setor_micro`) |
| Produto | `produto` | `produto text` | `toStr` | sim (`dim_produto`) |
| Valor Total | `valor_total` | `valor_total numeric(14,2)` | `toNum` → `String` (cast no SQL) | sim (`fato_venda_item`) |
| Receitas | `receitas` | `receitas numeric(14,2)` | idem | sim |
| Contrato | `contrato` | `contrato boolean` | `toBoolean` (sim/não/1/0/s/n) | sim (`fato_venda`; **linha com NULL é descartada**, `WHERE r.contrato IS NOT NULL`) |
| Taxa de Serviço | `taxa_servico` | `taxa_servico boolean` | `toBoolean` | sim (idem, `IS NOT NULL`) |
| Semana | `semana` | `semana integer` | `Math.round(Number)` | não |
| Mês | `mes` | `mes text` | `toStr` | não |
| Data Início / Data de Início | `data_inicio_evento` | `data_inicio_evento date` | `toIsoDate` | não pelo transform; **sim** por `regenerar_dim_operacao_weddings` (data do evento) |
| Fornecedor | `fornecedor` | `fornecedor text` | `toStr` | não pelo transform; **sim** por `regenerar_dim_operacao_weddings` (hotel) |
| Passageiros | `passageiros` | `passageiros text` | `toStr` | não |
| Contr./ Voucher | `tipo_contrato` | `tipo_contrato text` | `toStr` | não |
| Operação Própria | `operacao_propria` | `operacao_propria text` | `toStr` | não pelo transform; **sim** por `regenerar_dim_operacao_weddings` (chave da operação) e por `validar_carga_staging` (aviso de queda) |
| — (sem cabeçalho no `COL_MAP`) | — | `situacao text` | — | coluna existe na tabela e no `INSERT` do `promover`, mas o parser **não a produz** (`VendaProdutoRaw` não tem `situacao`; grep em `vendas-parser.ts` → 0) → grava `NULL` |

Colunas de controle: `arquivo_origem`, `linha_origem` (parser), `id`, `carregado_em` (default).

### F2. Equivalência com a API do Monde (`zSaleDetail`/`zProduct` + `raw` dos 12 buckets)

Legenda: **EQUIVALENTE** = campo com o mesmo significado, direto; **DERIVÁVEL** = obtém-se por
regra já escrita no repo ou por campo do `raw`; **AUSENTE** = não há campo nem regra. Fontes:
`schemas.ts`, `transform.ts`, `sectors.ts`, chaves do `raw` medidas na parte 1 (§1.4) e a
investigação `docs/investigacoes/2026-08-04-scope-b-item-level-e-pessoas.md`.

| Coluna do Excel / raw | Na API | Classificação | Evidência |
|---|---|---|---|
| `venda_numero` | `sale_number` (lista e detalhe) | **EQUIVALENTE** | `schemas.ts:22,69`; `transform.ts:169` |
| `data_venda` | `sale_date` | **EQUIVALENTE** | `schemas.ts:24,70`; `transform.ts:171` |
| `vendedor` | `travel_agent_name`; em Weddings, custom_field "Vendedor(a) Responsável - Grupo" com fallback | **EQUIVALENTE** (regra já implementada) | `transform.ts:109-113` |
| `pagante` | `payer_name` | **EQUIVALENTE** | `schemas.ts:72`; `transform.ts:176` |
| `setor` (micro) | custom_field `Setor` | **EQUIVALENTE** | `transform.ts:79,96` (`setor_micro` do espelho) |
| `setor_macro` | derivado de `Setor` por `setorMacro()` | **DERIVÁVEL** (mapa em `sectors.ts`) | `transform.ts:100` |
| `setor_micro` | idem `setor` | **EQUIVALENTE** — o espelho grava um só valor (`setor_micro`); o Excel tem `setor` e `setor_micro` como duas colunas; a investigação mediu 0/28.463 vendas com itens em mais de um setor macro | scope-b §4.9 (linha 247) |
| `produto` | `products[].description` (`product_kind` + descrição) | **DERIVÁVEL** — para `hotels` a descrição é categoria do quarto, não o produto; o `CASE` de 6 linhas por `product_kind` + `btrim(description)` reproduz a categoria do Excel (paridade 28.421 vendas) | scope-b §4.3 (linhas 134-165) |
| `valor_total` | `products[].total_amount` | **EQUIVALENTE** (por item) | `transform.ts:160`; ADR-0149:70 |
| `receitas` (por item) | **não existe** — `total_revenue` é por VENDA; o espelho **aloca** proporcionalmente | **AUSENTE** no grão de item; **DERIVÁVEL por alocação** no agregado (bate ao centavo por venda, não por produto) | `transform.ts:127-153`; scope-b §4.6 (linhas 209-243): melhor reconstrução bate em 26,8% das vendas |
| `contrato` | sem sinal direto; hoje sintetizado `false` | **DERIVÁVEL pelo produto**: "tem item `CONTRATO DE CASAMENTO%`" acerta 28.413/28.421 (99,97%) — regra identificada, **não implementada** (`transform.ts:125` grava `false`) | scope-b §5.2 (295-300); backlog B-25 |
| `taxa_servico` | sintetizado por `agency_service_fee > 0` | **DERIVÁVEL pelo produto**: "tem item `TAXA DE SERVIÇO`" acerta 28.418/28.421 (99,99%); a heurística atual erra 100% dos positivos | `transform.ts:122`; scope-b §5.2 |
| `semana` | — | **DERIVÁVEL** de `sale_date` (não consumido por nada no transform) | F1 |
| `mes` | — | **DERIVÁVEL** de `sale_date` | F1 |
| `data_inicio_evento` | `products[].data_inicio` do item "Contrato de casamento" | **EQUIVALENTE** — 239/239 idêntico medido | `transform.ts:162`; scope-b linha 311 |
| `fornecedor` | `products[].supplier_name` | **EQUIVALENTE** (por item) | `transform.ts:157` |
| `passageiros` | `products[].passengers.length` | **EQUIVALENTE** (contagem; o Excel traz texto) | `transform.ts:164` |
| `tipo_contrato` ("Contr./ Voucher") | não há campo tipado; no `raw` do produto há `document`, `booking_number`, `vendor_reservation_url` (chaves medidas, parte 1 §1.4) | **AUSENTE** (sem regra escrita; não há medição de equivalência) | parte 1 §1.4 |
| `operacao_propria` | `raw.operation_id` presente em 95,9% das vendas de Weddings, mas o **nome** da operação só em `raw.operation.name` (125 vendas) ou no produto-operação — 51 de 303 operações nomeadas (16,8%) | **DERIVÁVEL parcialmente** (16,8% dos nomes); hoje o espelho usa o campo para um booleano por `raw.intermediary` (`transform.ts:123-124`), que a investigação mede como errado | briefing v5.4.5 §8.4 (linhas 121-125); scope-b §5.1 (linha 277) |
| `situacao` | `status` da venda (`closed`/`opened`) e `products[].status` | **EQUIVALENTE em forma** — mas a coluna não é produzida pelo parser do Excel hoje (F1), então não há valor do lado Excel para comparar | `0178:40,70` |
| `arquivo_origem`, `linha_origem` | `raw_hash`, `sale_id` | não comparáveis (controle) | — |

Contagem: 22 colunas do `raw.vendas_excel` menos 4 de controle = 18 de negócio → **10
EQUIVALENTES**, **6 DERIVÁVEIS** (2 delas — `contrato`, `taxa_servico` — com regra medida e
não implementada; 1 — `operacao_propria` — só 16,8%), **2 AUSENTES** (`receitas` por item,
`tipo_contrato`). A que sustenta `get_prejuizos`, margem por produto e receita por subsetor é a
`receitas` por item (scope-b §4.6-4.7).

---

## Anexo — os 141 pares do seed de `financeiro.dre_comp_map` (0256), ordem `grupo_arquivo, descricao_arquivo`

Conferido idêntico ao catálogo vivo em 2026-09-21.

| # | grupo_arquivo | descricao_arquivo | sub_chave |
|---|---|---|---|
| 1 | Custo dos Serviços Prestados | Assessoria Local | `CUSTO` |
| 2 | Custo dos Serviços Prestados | Custo com Viagem | `CUSTO` |
| 3 | Custo dos Serviços Prestados | Diferença Apuração de Baixas D | `FIN` |
| 4 | Custo dos Serviços Prestados | Diferença Taxa de Cambio Dia D | `FIN` |
| 5 | Custo dos Serviços Prestados | Material de apoio - Eventos | `CUSTO` |
| 6 | Custo dos Serviços Prestados | Pagamento ao Fornecedor - Operação propria | `RV` |
| 7 | Custo dos Serviços Prestados | Plantão de Atendimento | `CUSTO` |
| 8 | Custo dos Serviços Prestados | Prejuízos | `COM` |
| 9 | Custo dos Serviços Prestados | Prestador de Serviço - PJ | `CUSTO` |
| 10 | Custo dos Serviços Prestados | Seguro de Responsabilidade Civil | `CUSTO` |
| 11 | Custo dos Serviços Prestados | Tarifa de Remessa | `FIN` |
| 12 | Descontos da venda | Desconto | `REEMB` |
| 13 | Descontos da venda | Reembolso Cliente | `REEMB` |
| 14 | Descontos da venda | Reembolso Fornecedor | `REEMB` |
| 15 | Descontos da venda | Taxa CC DU | `RV` |
| 16 | Descontos da venda | Taxa CC RAV | `RV` |
| 17 | Despesas Administrativas | Bens não Ativos | `ADM` |
| 18 | Despesas Administrativas | Consultorias e Assessorias | `ADM` |
| 19 | Despesas Administrativas | Copa e Cozinha | `ADM` |
| 20 | Despesas Administrativas | Despesas com Cartório | `ADM` |
| 21 | Despesas Administrativas | Honorários Advocatícios | `ADM` |
| 22 | Despesas Administrativas | Honorários Contábeis | `ADM` |
| 23 | Despesas Administrativas | Licença de Software (ADM) | `ADM` |
| 24 | Despesas Administrativas | Material de Escritório | `ADM` |
| 25 | Despesas Administrativas | Material de Informática | `ADM` |
| 26 | Despesas Administrativas | Material de Limpeza e Higiene | `ADM` |
| 27 | Despesas Administrativas | Prestadores de Serviço - PJ - (ADM) | `ADM` |
| 28 | Despesas Administrativas | Taxas de Licenciamento e Funcionamento | `ADM` |
| 29 | Despesas Comerciais | Comissão Terceiros | `COM` |
| 30 | Despesas Comerciais | Cortesia | `COM` |
| 31 | Despesas Comerciais | FamTour | `COM` |
| 32 | Despesas Comerciais | Feiras, Eventos e Divulgações | `COM` |
| 33 | Despesas Comerciais | Licença de Software (Comercial) | `COM` |
| 34 | Despesas Comerciais | Material Gráfico | `COM` |
| 35 | Despesas Comerciais | Presentes | `COM` |
| 36 | Despesas Comerciais | Relacionamento (Clientes ou Fornecedores) | `COM` |
| 37 | Despesas Comerciais | Transporte e Envio | `COM` |
| 38 | Despesas Financeiras | Anuidade de Cartões | `FIN` |
| 39 | Despesas Financeiras | Aplicações e Investimentos D | `FIN` |
| 40 | Despesas Financeiras | IOF | `FIN` |
| 41 | Despesas Financeiras | Juros e Multa | `FIN` |
| 42 | Despesas Financeiras | Taxa de Antecipação | `FIN` |
| 43 | Despesas Financeiras | Taxa do Cartão de Crédito/Débito | `FIN` |
| 44 | Despesas Financeiras | Taxas e Tarifas Bancárias | `FIN` |
| 45 | Despesas Marketing | Agência de Marketing / Terceiros de MKT | `MKT` |
| 46 | Despesas Marketing | Anúncios | `MKT` |
| 47 | Despesas Marketing | Endomarketing | `RHB` |
| 48 | Despesas Marketing | Licença de Software (MKT) | `MKT` |
| 49 | Despesas Marketing | Marcas e Patentes | `MKT` |
| 50 | Despesas Marketing | Material gráfico MKT | `MKT` |
| 51 | Despesas Marketing | TravelBack | `MKT` |
| 52 | Despesas Operacionais de Estrutura | Aluguel | `ESTR` |
| 53 | Despesas Operacionais de Estrutura | Condomínio | `ESTR` |
| 54 | Despesas Operacionais de Estrutura | Energia | `ESTR` |
| 55 | Despesas Operacionais de Estrutura | Estacionamento (Vaga Diretoria) | `ESTR` |
| 56 | Despesas Operacionais de Estrutura | Fundo de Reserva - Condomínio D | `ESTR` |
| 57 | Despesas Operacionais de Estrutura | Internet | `ESTR` |
| 58 | Despesas Operacionais de Estrutura | Limpeza e Manutenção Predial | `ESTR` |
| 59 | Despesas Operacionais de Estrutura | Manutenção e Conservação de Equipamentos | `ESTR` |
| 60 | Despesas Operacionais de Estrutura | Telefonia | `ESTR` |
| 61 | Despesas Operacionais de RH Benefícios | Aniversário de Empresa | `RHB` |
| 62 | Despesas Operacionais de RH Benefícios | Beneficio Extra (categorias Caju) | `RHB` |
| 63 | Despesas Operacionais de RH Benefícios | Benefício Extra (Home Office) | `RHB` |
| 64 | Despesas Operacionais de RH Benefícios | Benefício Extra (Saldo Livre) | `RHB` |
| 65 | Despesas Operacionais de RH Benefícios | Benefício Extra (VC) | `RHB` |
| 66 | Despesas Operacionais de RH Benefícios | Cursos e Treinamentos | `RHB` |
| 67 | Despesas Operacionais de RH Benefícios | Estacionamento Vaga Rotativa | `RHB` |
| 68 | Despesas Operacionais de RH Benefícios | Gympass | `RHB` |
| 69 | Despesas Operacionais de RH Benefícios | PLR - Participação nos Lucros e Resultados | `RHB` |
| 70 | Despesas Operacionais de RH Benefícios | Plano de Saúde | `RHB` |
| 71 | Despesas Operacionais de RH Benefícios | Previdência Privada - Sócios | `RHB` |
| 72 | Despesas Operacionais de RH Benefícios | Seguro de Vida | `RHB` |
| 73 | Despesas Operacionais de RH | 13° Salário Sócios | `RH` |
| 74 | Despesas Operacionais de RH | 13º Salário | `RH` |
| 75 | Despesas Operacionais de RH | Adiantamento Salarial | `RH` |
| 76 | Despesas Operacionais de RH | Auxilio Alimentação | `RH` |
| 77 | Despesas Operacionais de RH | Benefício (VR) | `RH` |
| 78 | Despesas Operacionais de RH | Benefícios Previdenciários | `RH` |
| 79 | Despesas Operacionais de RH | Comissão de Vendas | `COM` |
| 80 | Despesas Operacionais de RH | Distribuição de Lucros | `DL` |
| 81 | Despesas Operacionais de RH | Empréstimo D | `RH` |
| 82 | Despesas Operacionais de RH | Estágio | `RH` |
| 83 | Despesas Operacionais de RH | FGTS | `RH` |
| 84 | Despesas Operacionais de RH | Ferramentas de RH | `RH` |
| 85 | Despesas Operacionais de RH | Férias | `RH` |
| 86 | Despesas Operacionais de RH | GRCSU - Contribuição Sindical | `RH` |
| 87 | Despesas Operacionais de RH | INSS - Instituto Nacional do Seguro Social | `RH` |
| 88 | Despesas Operacionais de RH | IRRF - Imposto de Renda Retido na Fonte | `RH` |
| 89 | Despesas Operacionais de RH | Integração DSR | `RH` |
| 90 | Despesas Operacionais de RH | Premiação | `COM` |
| 91 | Despesas Operacionais de RH | Prestadores de Serviço - PJ - (RH) | `RH` |
| 92 | Despesas Operacionais de RH | Pró-Labore | `RH` |
| 93 | Despesas Operacionais de RH | Rescisões | `RH` |
| 94 | Despesas Operacionais de RH | Salário Maternidade | `RH` |
| 95 | Despesas Operacionais de RH | Salário | `RH` |
| 96 | Despesas Operacionais de RH | Saúde Ocupacional | `RH` |
| 97 | Despesas Operacionais de RH | Uniforme | `RH` |
| 98 | Despesas Operacionais de RH | Vale Transporte | `RH` |
| 99 | Despesas com Investimentos e Empréstimos | Empréstimos | `INV` |
| 100 | Despesas com Investimentos e Empréstimos | Máquinas e Equipamentos | `INV` |
| 101 | Despesas com Investimentos e Empréstimos | Móveis e Utensílios | `INV` |
| 102 | Despesas com Investimentos e Empréstimos | Reforma | `INV` |
| 103 | Despesas com Investimentos e Empréstimos | Welcome Labs | `CUSTO` |
| 104 | Despesas não Operacionais | Ações Judiciais e Extrajudiciais - D | `DNOP` |
| 105 | Impostos e Deduções da Receita Bruta | DAS | `IMP_H` |
| 106 | Impostos e Deduções da Receita Bruta | Descontos Concedidos | `IMP_H` |
| 107 | Impostos e Deduções da Receita Bruta | ISS - RPA | `IMP_H` |
| 108 | Impostos e Deduções da Receita Bruta | Reembolso / Carta de Crédito | `IMP_H` |
| 109 | Receita de Vendas | Carta de Crédito | `RV` |
| 110 | Receita de Vendas | Comissão | `RV` |
| 111 | Receita de Vendas | Diferença Apuração de Baixas C | `FIN` |
| 112 | Receita de Vendas | Diferença Taxa de Câmbio Dia C | `FIN` |
| 113 | Receita de Vendas | Incentivo | `RV` |
| 114 | Receita de Vendas | Reembolso Fornecedor - C | `RV` |
| 115 | Receita de Vendas | Reversão de Perdas Financeiras | `COM` |
| 116 | Receitas Não Operacionais | Adiantamento 13º Salário | `RH` |
| 117 | Receitas Não Operacionais | Adiantamento Férias | `RH` |
| 118 | Receitas Não Operacionais | Adiantamento de Salário | `RH` |
| 119 | Receitas Não Operacionais | Ações Judiciais e Extrajudiciais - C | `RNOP` |
| 120 | Receitas Não Operacionais | Desconto INSS | `RH` |
| 121 | Receitas Não Operacionais | Desconto IRRF | `RH` |
| 122 | Receitas Não Operacionais | Desconto de Salário | `RH` |
| 123 | Receitas Não Operacionais | Devolução de Empréstimo | `RH` |
| 124 | Receitas Não Operacionais | Empréstimo C | `RNOP` |
| 125 | Receitas Não Operacionais | Fundo de Reserva - Condomínio C | `ESTR` |
| 126 | Receitas Não Operacionais | Reembolso - Custo com Viagem - C | `CUSTO` |
| 127 | Receitas Não Operacionais | Reembolso GymPass | `RHB` |
| 128 | Receitas Não Operacionais | Reembolso Interno | `RNOP` |
| 129 | Receitas Não Operacionais | Reembolso Plano de Saúde | `RHB` |
| 130 | Receitas Não Operacionais | Reembolso | `RNOP` |
| 131 | Receitas da venda | Comissão | `RV` |
| 132 | Receitas da venda | Operação própria | `RV` |
| 133 | Receitas da venda | Over | `RV` |
| 134 | Receitas da venda | Reembolso Cliente | `REEMB` |
| 135 | Receitas da venda | Reembolso Fornecedor | `REEMB` |
| 136 | Receitas da venda | Taxa DU | `RV` |
| 137 | Receitas da venda | Taxa RAV | `RV` |
| 138 | Receitas da venda | Taxa de Serviço | `RV` |
| 139 | Receitas e Rendimentos Financeiros | Acréscimos Cobrados | `FIN` |
| 140 | Receitas e Rendimentos Financeiros | Aplicações e Investimentos C | `FIN` |
| 141 | Receitas e Rendimentos Financeiros | Desconto Obtido | `FIN` |
