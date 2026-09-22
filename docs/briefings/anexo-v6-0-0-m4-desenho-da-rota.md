# Anexo v6.0.0 / M4 — desenho da rota de ingestão (Frente B)

> **O que é.** O desenho que a M4 implementa, escrito **antes** do código e usado como referência
> única pelas delegações. O contrato externo é `docs/contratos/ingestao-v1.md` (congelado, GATE 0);
> este anexo só diz **como** ele se materializa no repo e **o que fica para as missões seguintes**.
>
> Escrito em 2026-09-22. Migration livre no início da missão: **0276**. ADR livre: **0176**.

---

## 1. O que a M4 entrega, e o que NÃO entrega

**Entrega** (briefing §7/M4): bucket `ingestao-cru`, as duas rotas do contrato
(`POST /api/ingestao/{base}/upload-url` e `POST /api/ingestao/{base}`), o log de carga que as
sustenta, o card de `/admin/uploads` chamando a rota (o cliente deixa de parsear as cinco bases),
e a saída de `lancamentos.ts` + da rota morta `api/admin/upload-lancamentos`.

**Não entrega** (é M5 em diante, de propósito):

| O quê | Onde vai |
|---|---|
| `promover_carga_*` das quatro bases sem pipeline atômico | **M5** |
| `raw.lancamentos_operacao` (tabela nova) e Vendas com N arquivos no banco | **M5** |
| `ingestao.baseline`, alarmes por e-mail, crons no log, tela `/admin/ingestao` | **M6** |
| grafo de dependência (`409 DEPENDENCIA_AUSENTE`) | **M7** |

### 1.1 Três decisões técnicas que esta missão toma (e por quê)

**(a) A tabela `ingestao.carga` nasce na M4, não na M6.** O briefing a lista na Frente E (M6), mas a
rota não consegue honrar o contrato sem ela: `x-ingestao-idempotencia` ("mesma chave ⇒ mesma
resposta, sem recarregar", §2.3 passo 1) exige persistência que sobreviva entre duas requisições,
possivelmente em instâncias serverless diferentes. Fica na M4 **a tabela e a escrita**; ficam na M6
`ingestao.baseline`, os alarmes, os crons e a tela. É migration **aditiva**.

**O passo 1 do contrato é, por decisão, SEM ESTADO.** O `carga_id` é emitido pela rota
`/upload-url` e já viaja **dentro do caminho do objeto** (`{base}/{aaaa}/{mm}/{carga_id}-{n}-{nome}`);
é o caminho, conferido no passo 3, que amarra os arquivos à carga — não uma linha no banco. A linha
nasce no **passo 3**, quando tudo já é conhecido: os sha256, a origem e o `extraido_em`, que o
contrato §2.3 só recebe ali. Abrir a linha no passo 1 deixaria `extraido_em` sem onde ser gravado e
faria de todo upload abandonado uma linha de carga fantasma. Por isso `ingestao_carga_abrir` recebe
o `carga_id` como primeiro parâmetro, em vez de inventá-lo.

**(b) A aplicação, na M4, continua sendo o pipeline que já existe** (`truncar_*` +
`inserir_lote_*` + `regenerar_*`/`provisionar_*` para quatro bases; `limpar_staging_vendas` →
`inserir_lote_staging` → `validar_carga_staging` → `promover_carga_vendas` para Vendas), **rodando
com `service_role`** — exatamente o que as Server Actions faziam, só que agora no servidor, atrás
de uma rota, a partir do cru. A M4 move o *caminho*; a M5 troca o *aplicador* por
`promover_carga_{base}` atômica e **é lá que a credencial `ingestor` do contrato §1 passa a ser a
que aplica** (a allowlist da role hoje só cobre o pipeline de Vendas — a 0274 nega `truncar_*` de
propósito, e o GATE 2 prova essa negação). Consequência honesta: **a janela de base vazia que o
briefing §2.2 descreve continua existindo nas quatro bases até a M5.** Não é regressão — é o
estado de hoje, preservado.

**(c) O card confirma sobre uma CONFERÊNCIA do servidor** (campo `confirmar` no corpo do passo 3,
default `true`). Ver §5. É a única adição desta missão ao contrato, e está proposta como **errata
2** para o Yan decidir; a RPA nunca envia o campo e vê o contrato exatamente como está escrito.

---

## 2. Módulos novos

Todos em `src/lib/ingestao/`, ao lado dos parsers da M3.

### `matriz.ts` — bytes → `Matriz` (isomórfico, sem `node:fs`)

```ts
export type FormatoArquivo = 'xlsx' | 'csv'
export function formatoPeloNome(nome: string): FormatoArquivo | null
export function lerMatriz(bytes: Uint8Array, formato: FormatoArquivo): Matriz
```

É o **único** lugar que chama `XLSX.read`/`sheet_to_json` no caminho de ingestão. As opções são as
da skill `ingestao-planilhas` §3, e não são negociáveis: `cellDates: true` no xlsx; `raw: true`
nos dois ramos; `defval: null`; BOM removido antes de ler CSV como string. `fixtures-oraculo.ts`
passa a delegar para cá — um leitor só, para o oráculo provar o que a rota executa.

### `storage.ts` — bucket, caminho, URL assinada (`server-only`)

```ts
export const BUCKET_INGESTAO = 'ingestao-cru'
export const LIMITE_BYTES_ARQUIVO = 52_428_800      // 50 MB  (contrato §2.1)
export const LIMITE_BYTES_CARGA  = 209_715_200      // 200 MB (contrato §2.1)
export function caminhoCru(base, cargaId, n, nomeOriginal, agora): string
export function ehCaminhoDaCarga(path, base, cargaId): boolean
export async function urlAssinadaDeUpload(path): Promise<{ signedUrl, token, expiraEm }>
export async function baixarCru(path): Promise<Uint8Array>
export async function removerCru(paths: readonly string[]): Promise<void>
export function sha256Hex(bytes: Uint8Array): string
```

- Caminho canônico do contrato §2.1: `{base}/{aaaa}/{mm}/{cargaId}-{n}-{nome}`, com `aaaa/mm` do
  **momento da emissão** (o nome do arquivo não é fonte de cobertura — o "2026" do export contém
  2024–2026).
- O nome passa por `sanitizarNomeArquivo` (`src/lib/storage/nome-arquivo.ts`). **Chave de Storage
  é ASCII-only** — acento volta `400 InvalidKey`, e a falha é determinística por nome (v5.4.3).
- `ehCaminhoDaCarga` é guarda de autorização, não de higiene: o passo 3 recebe `path` do chamador
  e ele **tem** de pertencer à base e ao `carga_id` daquela carga; sem isso a rota lê objeto
  arbitrário do bucket.
- `expiraEm` é lido do claim `exp` do próprio token assinado, não presumido. **Divergência com o
  contrato §2.1** ("a URL vale 15 minutos"): `createSignedUploadUrl` do supabase-js **não aceita
  validade** — quem a define é o servidor do Storage (2 h). Reportar o valor real é o
  comportamento honesto; a janela de 15 min não é implementável hoje. Registrado para o Yan.

### `aplicar.ts` — aplicação por base (`server-only`)

```ts
export interface ResultadoAplicacao { linhas: number; avisos: string[] }
export async function aplicarCarga(base: BaseIngestao, linhas: unknown[]): Promise<ResultadoAplicacao>
```

Um aplicador por base, **com a sequência exata que a Server Action correspondente executava hoje**
— incluindo o que é fácil perder de vista: `loadMetas(false)` entre `validar_carga_staging` e
`promover_carga_vendas`; `provisionar_dre_comp_par` depois da conferência do Demonstrativo;
`regenerar_fluxo_caixa` no fim de Movimentação **e** de Aberto; `regenerar_dim_operacao_weddings`
no fim de Operação. Erro de qualquer etapa sobe como `CargaRejeitada` com a mensagem original.

Cada aplicador traz o **adaptador `*Cru` → payload da RPC** (as RPCs de hoje esperam a forma
antiga). Três adaptações que mudam dado e por isso ficam escritas:

| base | adaptação | nota |
|---|---|---|
| Vendas | `data_inicio` → `data_inicio_evento`; `contrato`/`taxa_servico` 0/1 → boolean; `valor_total`/`receitas` viajam como **string** (o staging faz `::numeric`) | `intermediario` **não tem coluna** em `raw.vendas_excel_staging` e é descartado na M4 — a coluna nasce na M5 (decisão 7 do briefing) |
| Demonstrativo / Movimentação / Aberto | `arquivo_origem` anexado por linha | é o que a action fazia |
| Operação | sem `raw` própria; vai direto a `inserir_lote_lancamentos` | a `raw.lancamentos_operacao` é M5 |

### `carga.ts` — o fluxo do contrato §2.3 (`server-only`)

```ts
export async function processarCarga(entrada: EntradaCarga): Promise<ResultadoCarga>
```

Passos 4 a 9, nesta ordem, sem pular nenhum: baixa cada objeto → **recalcula o sha256 e compara
com o declarado** (≠ ⇒ `SHA256_DIVERGE`) → `lerMatriz` → parser da base → checksums do arquivo
conferidos → reconciliação do conjunto (Σ arquivos = linhas; Vendas: nenhum `Venda Nº` repetido
entre arquivos) → **diff contra a base viva** (linhas, soma, por ano) → aplicação (só se
`confirmar`).

O **diff** é medido contra o estado atual da base (as RPCs `status_*`/`get_upload_status` que o
card já lia), não contra a linha da carga anterior: é o número que o humano compara ("a base tem
48.652, o arquivo traz 48.862") e é o que existe na M4.

### `log.ts` — a linha de `ingestao.carga` (`server-only`)

Envelopa as RPCs da 0276. Falha ao gravar o log **não** derruba uma carga já aplicada (o dado está
no banco; perder o log não desfaz nada) — mas nunca em silêncio: `console.error` e `alarmes[]` na
resposta, no molde do `registrarChamada` da API externa.

---

## 3. Migration 0276 (aditiva)

`supabase/migrations/0276_ingestao_carga_e_bucket.sql`:

1. `CREATE SCHEMA IF NOT EXISTS ingestao` — postura dos demais schemas: `REVOKE ALL` de
   `PUBLIC`/`anon`/`authenticated`, RLS ligada na tabela, sem policy (deny-by-default).
2. `ingestao.carga` — uma linha por execução, com as colunas do contrato §6:
   `carga_id uuid PK`, `base text`, `origem text`, `chave_id int`, `usuario_id uuid`,
   `idempotencia uuid`, `extraido_em timestamptz`, `recebido_em timestamptz`,
   `concluido_em timestamptz`, `arquivos jsonb`, `linhas int`, `somas jsonb`,
   `checksums_conferidos int`, `checksums_falhos int`, `rejeitadas_por_data int`,
   `pares_novos int`, `diff jsonb`, `status text`, `erro text`, `duracao_ms int`,
   `resposta jsonb`, `observacao text`.
   `status ∈ {aberta, aplicada, rejeitada, erro}` por `CHECK`; `base` com `CHECK` contra as cinco
   do contrato (a paridade com `bases.ts` entra em `bases-paridade.test.ts`);
   `UNIQUE (idempotencia)` parcial (`WHERE idempotencia IS NOT NULL`).
3. Bucket privado `ingestao-cru` em `storage.buckets` (idempotente, `ON CONFLICT DO NOTHING`),
   `public=false`, `file_size_limit = 52428800`, mime de xlsx + csv. **Sem policy em
   `storage.objects`** — leitura e escrita só por `service_role`/URL assinada, igual a
   `acervo-documentos` (0165) e `solicitacoes-anexos` (0127).
4. RPCs `SECURITY DEFINER`, `SET search_path TO ''`, **`service_role`-only**
   (`REVOKE ALL FROM PUBLIC, anon, authenticated`; `GRANT EXECUTE TO service_role`):
   `ingestao_carga_abrir`, `ingestao_carga_concluir`, `ingestao_carga_obter`,
   `ingestao_carga_ultima`.
   **Por que sem `app.exigir_acesso` inline:** esta superfície não tem sessão de usuário — é a
   rota que autoriza (chave de API pelo `escopo_bases`, ou `requireAreaApi('admin/uploads')`),
   exatamente como `api_chave_resolver`/`api_chamada_registrar` da API externa (0211/ADR-0172).
   Nenhuma delas é alcançável por `authenticated`. Quando a tela `/admin/ingestao` nascer (M6),
   ela ganha uma RPC de **leitura** própria, aí sim com `exigir_acesso` inline.
5. `NOTIFY pgrst, 'reload schema'`.

Depois do push: verificação **via REST com `service_role`** (`db query` não executa o corpo) e
`npx supabase gen types typescript --linked` para regenerar `src/types/database.ts` (ADR-0173).

---

## 4. Rotas

`src/app/api/ingestao/[base]/upload-url/route.ts` e `src/app/api/ingestao/[base]/route.ts`, ambas
com `export const runtime = 'nodejs'` — **parse de arquivo no servidor é API Route, nunca Server
Action** (skill `ingestao-planilhas` §1).

**Autenticação, duas portas para a mesma rota:**

| chamador | como | autorização |
|---|---|---|
| RPA | `x-api-key` | `autenticarChamada` (`src/lib/api-externa/http.ts`) + `escopo_bases ∋ base` ⇒ senão `403 ESCOPO_INSUFICIENTE`. Toda chamada, inclusive negada, vai para `api_chamada_log` |
| card | sessão | `requireAreaApi('admin/uploads')` |

Sem chave **e** sem sessão ⇒ `401 AUTH_AUSENTE`. `/api/ingestao/` entra em
`API_AUTH_PROPRIA_PREFIXOS` do `src/proxy.ts` (o guard mecânico de `proxy.test.ts` cobre a
entrada), pelo mesmo motivo de `/api/externo/`: a rota autentica sozinha e precisa poder devolver
o erro do contrato em vez do 401 genérico do proxy.

Erros: os códigos do contrato §2.4, no envelope
`{ ok:false, erro:{ codigo, mensagem, detalhe? } }`. `500` nunca silencioso — linha de carga com
`status='erro'`.

**`409 CARGA_EM_ANDAMENTO`:** `pg_advisory_xact_lock` é por transação e a rota não tem uma
transação longa; o lock da base na M4 é a própria linha de `ingestao.carga` — uma carga `aberta`
e recente na mesma base ⇒ 409. O lock de verdade nasce dentro do `promover_carga_*` (M5).

---

## 5. O card de `/admin/uploads`

Fluxo novo das **cinco** bases do contrato (Pessoas fica como está — ver §6):

```
1. seleciona o arquivo  → sha256 no navegador (Web Crypto), sem parsear
2. POST .../upload-url  → carga_id + URL assinada
3. PUT  <signed_url>    → o cru entra no bucket (barra de progresso real, por bytes)
4. POST /api/ingestao/{base}  { confirmar: false }  → CONFERÊNCIA: parse, checksums, diff
5. modal antes/depois com o diff do servidor → o humano confirma
6. POST /api/ingestao/{base}  { confirmar: true }   → aplica; a resposta do contrato vai à tela
```

**Por que o passo 4 existe.** Hoje o card parseia no cliente e mostra `antes → depois` **antes** de
qualquer escrita; é um gate humano real — pega o arquivo legítimo porém ERRADO (só 2024 em vez de
todos os anos), que passa por todos os checksums porque é internamente coerente. Mover o parse
para o servidor sem repor esse gate **removeria uma proteção viva sem ninguém ter pedido**. O
campo `confirmar` (default `true`) é a forma mínima de repor: a RPA não o envia e continua vendo o
contrato tal como congelado; o card envia `false` primeiro. A conferência **não** grava linha de
carga nem consome a chave de idempotência — carga é o que aplica.

Proposto como **errata 2** do contrato. Se o Yan preferir o contrato literal, o caminho é remover
o campo e o passo 4 — e aí o gate humano some, o que precisa ser uma escolha dita, não um efeito
colateral.

Resposta exibida no card: linhas, `rejeitadas_por_data`, checksums conferidos/falhos, diff por ano
e os avisos que as RPCs já devolviam (`operacao_propria`, pares novos, contas novas).

## 6. Pessoas, e o grep do `parseArquivoEmWorker`

O briefing pede, na M4, que `parseArquivoEmWorker` saia e o grep fique vazio (invariante 3). Só
que **Pessoas não é base do contrato** (decisão 11: "Pessoas fica fora — parada, viva") e o card
dela continua de pé, parseando no cliente. As duas coisas não cabem juntas.

Resolução da M4: o worker perde os **cinco** parsers do contrato e fica com **um só**, o de
Pessoas. Grep vazio para as cinco bases; `parse.worker.ts` e `parse-em-worker.ts` sobrevivem por
causa de uma base fora do escopo. Fechar isso de verdade é decisão do Yan — aposentar o card de
Pessoas (parada desde 30/06) ou portá-la numa versão seguinte. Registrado como divergência
briefing×repo.

Removidos nesta missão, com grep de chamador no ato: `src/lib/carga/lancamentos.ts` e
`src/app/api/admin/upload-lancamentos/route.ts`. Os cinco parsers de cliente
(`parse-vendas-produto`, `parse-lancamentos`, `parse-lancamentos-movimentacao`,
`parse-titulos-em-aberto`, `parse-demonstrativo-competencia` e o núcleo `vendas-parser`) **ficam**
enquanto tiverem consumidor; a poda deles é da M10, onde vale o ritual de citar o commit que
removeu a última referência.
