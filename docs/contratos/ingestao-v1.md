# Contrato de ingestão v1 — Janus recebe o export CRU do Monde

**Status:** congelado em 2026-09-21 (GATE 0 da v6.0.0). Mudança neste documento é **decisão de
produto** e volta ao Chat; o código da v6.0.0 e as RPAs (v6.1+) são construídos contra ele.
**Origem:** §4 do `docs/briefings/briefing-v6-0-0-fundacao-ingestao.md`, com uma alteração decidida
pelo Yan na abertura da versão: o arquivo **não viaja no corpo da requisição** (a Vercel recusa
body acima de 4,5 MB e o export de Movimentação já tem 6 MB); ele sobe direto para o Storage por
**URL assinada** emitida pela rota, e a carga recebe só a referência.

**Errata 1 (2026-09-22, decisão do Yan — GATE 1/M3):** o limite superior da faixa de data do §2.3
passo 5 é o **fim do ano** de `hoje + 5 anos`, não o mesmo dia daqui a cinco anos. O texto original
dizia `hoje + 5 anos` ao pé da letra, e medir isso ao dia recusava nove títulos com vencimento em
2031-09-22 num export de 2026-09-21 — por um único dia de folga, e os aceitaria no dia seguinte.
Guarda cujo veredito depende de QUANDO a carga rodou transforma parcela longa legítima em campo
nulo de forma intermitente. Com o limite no fim do ano a faixa é estável dentro do ano e as
anomalias reais continuam caindo (2049, e as emissões de 2002 e 2004).

**Errata 2 (2026-09-22, decisão do Yan — M4/M5):** duas correções que a construção impôs ao texto
congelado. Nenhuma delas muda o que a RPA vê: a automação não envia o campo novo e continua lendo
este contrato exatamente como está escrito.

**(a) O passo 3 aceita `confirmar` (booleano, default `true`).** Com `false`, o servidor executa os
passos 4 a 8 — sha256, parse, checksums, reconciliação e diff — e **para antes de aplicar**,
devolvendo `200` com `status: "conferida"`; não grava linha em `ingestao.carga` nem consome a chave
de idempotência, porque carga é o que aplica. **Por que existe:** antes desta versão o card de
`/admin/uploads` parseava no navegador e mostrava "a base tem N, o arquivo traz M" **antes** de
qualquer escrita. Esse número é o que pega o arquivo legítimo porém ERRADO — só 2024 em vez de
todos os anos —, que passa por todos os checksums do §4 porque é internamente coerente. Mover o
parse para o servidor sem repor essa etapa removeria uma proteção viva. A RPA nunca envia o campo;
o default mantém o comportamento do §2.3 intacto.

**(b) A URL assinada do §2.1 não vale 15 minutos, e não há como fazê-la valer.** O
`createSignedUploadUrl` do SDK do Supabase **não aceita parâmetro de validade** — quem a define é o
servidor do Storage, hoje em 2 horas. O campo `expira_em` da resposta passa a reportar o valor
**real**, lido do claim `exp` do token emitido, em vez de repetir um número que o sistema não
cumpre. O que protege o caminho não é a janela curta: é o `carga_id` (UUID de servidor) dentro do
próprio caminho do objeto, conferido no passo 3, mais o sha256 declarado e reconferido.

## 0. Vocabulário

| Termo | Significado |
|---|---|
| **base** | uma das cinco fontes de dados: `demonstrativo-competencia`, `vendas-produto`, `lancamentos-movimentacao`, `lancamentos-aberto`, `lancamentos-operacao` |
| **cru** | o arquivo exatamente como o Monde exporta (xlsx; csv só para `lancamentos-operacao`), sem tratamento |
| **carga** | uma execução: 1..N arquivos crus de UMA base → parse → checksums → promoção atômica → linha em `ingestao.carga` |
| **checksum do arquivo** | os totais/subtotais que o próprio export traz (linha de totais, linhas de outline "Grupo de Categoria: … (n, R$ …)", Total Geral) — lidos ANTES de serem descartados e conferidos contra as linhas parseadas |
| **chave do ingestor** | registro em `app.api_chave` com `escopo_bases` (uma chave pode cobrir várias bases) |

## 1. Autenticação e autorização

Toda chamada leva `x-api-key: <segredo>`. O servidor resolve por hash (sha256) em
`app.api_chave` — mesmo mecanismo da API externa de Solicitações (ADR-0172):

- chave ausente → `401 AUTH_AUSENTE`; inválida ou revogada → `401 AUTH_INVALIDA`;
- chave sem a base pedida em `escopo_bases` → `403 ESCOPO_INSUFICIENTE`;
- toda chamada (inclusive as negadas) é registrada em `app.api_chamada_log`.

A promoção no banco roda com a credencial **`ingestor`** (role com `EXECUTE` só nas RPCs de
staging e promoção das cinco bases). Duas alavancas independentes de emergência: **revogar a
chave** (⇒ 401 imediato) e **desativar o usuário `ingestor@janus.interno`** (⇒ `PERMISSAO_NEGADA`
em toda RPC). O card humano de `/admin/uploads` usa o mesmo fluxo com a **sessão do usuário**
(área `admin/uploads`) no lugar da chave.

Headers comuns a todas as chamadas de escrita:

```
x-api-key:               <segredo do ingestor>
x-ingestao-origem:       rpa-pad | rpa-cloud | manual | reprocesso
x-ingestao-idempotencia: <uuid v4>   # mesma chave ⇒ mesma resposta, sem recarregar
```

## 2. Fluxo em três passos

```
(1) POST /api/ingestao/{base}/upload-url      → URLs assinadas, uma por arquivo
(2) PUT  <signed_url>  (corpo = bytes do cru) → o arquivo entra no bucket ingestao-cru
(3) POST /api/ingestao/{base}                 → a carga: parse, checksums, promoção, log
```

### 2.1 `POST /api/ingestao/{base}/upload-url`

Body (JSON):

```json
{ "arquivos": [ { "nome": "25-26.xlsx", "bytes": 3118968, "sha256": "a06e…95dd" } ] }
```

Regras: 1..N arquivos (Vendas aceita um por ano; as outras bases aceitam 1); extensão pela base
(`.xlsx`; `.csv` só em `lancamentos-operacao`); `bytes` ≤ **50 MB** por arquivo e ≤ **200 MB** por
carga (constantes `LIMITE_BYTES_ARQUIVO` / `LIMITE_BYTES_CARGA`); `sha256` do conteúdo que será
enviado, calculado pelo chamador.

Resposta `200`:

```json
{ "carga_id": "3f6c…", "expira_em": "2026-09-21T14:15:00Z",
  "arquivos": [ { "nome": "25-26.xlsx",
                  "path": "vendas-produto/2026/09/3f6c…-1-25-26.xlsx",
                  "signed_url": "https://…/storage/v1/object/upload/sign/ingestao-cru/…?token=…" } ] }
```

O `carga_id` nasce aqui e identifica a carga até o fim (ver **errata 2(b)**: a validade de
**15 minutos** NÃO é implementável — o SDK não aceita esse parâmetro e o Storage define 2 h;
`expira_em` reporta o valor real do token). A URL serve para um único `PUT`. Path canônico: `{base}/{aaaa}/{mm}/{carga_id}-{n}-{nome-normalizado}`, onde `aaaa/mm`
é o momento da emissão (não o período do dado — o nome do arquivo não é fonte de cobertura).

### 2.2 `PUT <signed_url>`

Upload direto no Supabase Storage (bucket **privado** `ingestao-cru`), corpo = bytes do arquivo,
`Content-Type` do xlsx/csv. Sem `x-api-key` aqui: a autorização é o token da própria URL.
Nenhuma leitura pública; o cru só é lido pelo servidor (service_role) e por `admin` pela tela.

### 2.3 `POST /api/ingestao/{base}`

Body (JSON):

```json
{ "carga_id": "3f6c…",
  "arquivos": [ { "path": "vendas-produto/2026/09/3f6c…-1-25-26.xlsx", "nome": "25-26.xlsx", "sha256": "a06e…95dd" } ],
  "extraido_em": "2026-09-21T09:58:00-03:00",
  "observacao": "texto livre opcional",
  "confirmar": true }
```

`confirmar` é opcional e vale `true` por default (**errata 2(a)**) — a RPA não o envia. Com `false`,
o servidor roda os passos 4 a 8 e PARA antes de aplicar, devolvendo `status: "conferida"`.


Fluxo no servidor — **uma transação por carga, ou nada**:

1. autentica; confere `escopo_bases` ∋ `{base}`; resolve `x-ingestao-idempotencia` (repetida ⇒
   devolve a resposta original, HTTP 200, `idempotente: true`);
2. toma o **lock da base** (advisory lock); outra carga em curso ⇒ `409 CARGA_EM_ANDAMENTO`;
3. confere o **grafo de dependência** (§5): pré-requisito do dia ausente ⇒ `409 DEPENDENCIA_AUSENTE`;
4. lê cada objeto do bucket, recalcula o sha256 e compara com o declarado (≠ ⇒ `422 SHA256_DIVERGE`);
5. **parse** com o núcleo `*Rows` da base (o mesmo do card); datas fora de
   `[2015-01-01, 31/12 do ano de (hoje + 5 anos)]` são **rejeitadas e contadas**, nunca
   convertidas (errata 1). **O que "rejeitada" significa na prática:** a LINHA permanece na carga
   e só o CAMPO de data sai `null`, contado em `rejeitadas_por_data` — é o que o §7 quer dizer com
   "a carga aplica e reporta", e é o único comportamento compatível com os checksums do §4, que
   são calculados sobre o arquivo inteiro. Descartar a linha faria a contagem declarada pelo
   próprio export deixar de fechar;
6. extrai os **checksums do arquivo** (§4) e confere contra as linhas parseadas — no servidor **e**
   de novo dentro da RPC de promoção (`RAISE` se não fechar);
7. reconcilia o conjunto (Σ arquivos = linhas parseadas; Vendas: nenhum `Venda Nº` repetido entre
   arquivos);
8. **diff** contra a carga anterior (linhas, soma, por ano; pares novos na bandeja da competência);
9. staging em lotes → `promover_carga_{base}` (atômica; `regenerar_*`/`provisionar_*` dentro);
10. grava a linha em `ingestao.carga` e dispara os alarmes (§6).

Qualquer falha em 4–9 ⇒ `422` com motivo estruturado; **a base anterior fica intacta**; a linha
de carga sai com `status = "rejeitada"` e o cru permanece no bucket para reprocesso.

Resposta `200`:

```json
{ "carga_id": "3f6c…", "base": "vendas-produto", "status": "aplicada", "idempotente": false,
  "arquivos": [ { "nome": "25-26.xlsx", "sha256": "a06e…95dd", "linhas": 24471,
                  "checksums_conferidos": 5, "checksums_falhos": 0 } ],
  "parse": { "linhas": 48862, "rejeitadas_por_data": 5, "pares_novos": 0 },
  "diff":  { "linhas": 210, "soma": 470320.84, "por_ano": { "2023": 0, "2024": 0, "2025": 0, "2026": 210 },
             "anos_fechados_alterados": [] },
  "alarmes": [] }
```

### 2.4 Erros

| HTTP | código | quando |
|---|---|---|
| 401 | `AUTH_AUSENTE` / `AUTH_INVALIDA` | sem chave / chave inválida ou revogada |
| 403 | `ESCOPO_INSUFICIENTE` | chave não cobre a base |
| 404 | `BASE_DESCONHECIDA` | `{base}` fora do enum |
| 409 | `CARGA_EM_ANDAMENTO` | lock da base tomado por outra carga |
| 409 | `DEPENDENCIA_AUSENTE` | grafo (§5): ex. Operação sem Aberto do dia |
| 413 | `ACIMA_DO_LIMITE` | bytes por arquivo/carga |
| 422 | `SHA256_DIVERGE` · `ARQUIVO_AUSENTE` · `FORMATO_INVALIDO` · `ESTRUTURA_INESPERADA` · `CHECKSUM_FALHOU` · `CONJUNTO_NAO_RECONCILIA` · `VENDA_REPETIDA_ENTRE_ARQUIVOS` | rejeições de conteúdo — base intacta, linha `rejeitada` |
| 500 | `ERRO_INTERNO` | nunca silencioso: linha de carga com `status = "erro"` e alarme |

Formato do erro: `{ "ok": false, "erro": { "codigo": "...", "mensagem": "...", "detalhe": {...} } }`
(o mesmo envelope da API externa).

## 3. As bases

| `{base}` | arquivo(s) | destino | grão |
|---|---|---|---|
| `demonstrativo-competencia` | 1 xlsx (export "Demonstrativo de Resultado") | `raw.demonstrativo_competencia` | (tipo, grupo, descrição, ano, mês) |
| `vendas-produto` | N xlsx, um por ano/período ("Vendas por produto") | `raw.vendas_excel` | item de venda |
| `lancamentos-movimentacao` | 1 xlsx ("Lançamentos por categoria — movimentação") | `raw.lancamentos_movimentacao` | lançamento liquidado |
| `lancamentos-aberto` | 1 xlsx ("Lançamentos por categoria — vencimento em aberto") | `raw.titulos_em_aberto` | título em aberto |
| `lancamentos-operacao` | 1 csv ("Análise de Operações", scrape) | `raw.lancamentos_operacao` (nova) → `analytics.fato_lancamento_operacao` | lançamento por operação |

Cada carga **substitui a base inteira** (não é append). Vendas: os N arquivos são unidos no
servidor; a cobertura é derivada do dado (`min/max(data_venda)`), nunca do nome do arquivo.

## 4. Checksums por base (o que o arquivo já traz)

| base | fonte no cru | quantidade | tolerância |
|---|---|---|---|
| `demonstrativo-competencia` | subtotais por nível + Total Geral | 557 | 0,005 (o pivot arredonda na exibição) |
| `vendas-produto` | linha de totais de cada arquivo (linhas + 4 somas) | 5 por arquivo | 0 |
| `lancamentos-movimentacao` | outline `Grupo de Categoria: X (n, R$ v)` e `Categoria: Y (n, R$ v)` + total | 148 + 1 | 0 |
| `lancamentos-aberto` | idem | 95 + 1 | 0 |
| `lancamentos-operacao` | **não há** — cruzamento: todo `Número` sem `Liquidação` existe em Aberto ∪ Movimentação e `Vencimento` coincide | baseline 3 ausentes | acima do baseline = alarme, não bloqueio |

**Checksum falho nunca aplica.** Não há flag de bypass; a via de exceção é corrigir na origem e
reprocessar o cru.

## 5. Ordem de carga (grafo)

```
vendas-produto ─┬─► lancamentos-movimentacao ─┬─► lancamentos-operacao
                └─► lancamentos-aberto ───────┘
demonstrativo-competencia  (independente)
```

`lancamentos-operacao` exige carga **aplicada no dia** de `lancamentos-aberto` (é de onde vem o
`Vencimento`); sem ela ⇒ `409 DEPENDENCIA_AUSENTE`. A lista de operações é **derivada** de
`raw.vendas_excel` (`Produto = 'Contrato de casamento'`), exposta por RPC de leitura para a RPA.

## 6. Log e alarmes

Toda carga (aplicada, rejeitada ou erro) vira uma linha em `ingestao.carga`: `carga_id`, base,
origem, chave ou usuário, `extraido_em`, `recebido_em`, arquivos (jsonb com path + sha256), linhas,
somas, checksums conferidos/falhos, rejeitadas por data, pares novos, diff, status, erro, duração.
Alarmes (e-mail, destinatários em config): checksum falho · ano fechado alterado acima do limiar ·
baseline desviou · par novo na bandeja · carga esperada não chegou até a hora configurada (cadência
diária) · cron sem resultado.

## 7. O que a RPA precisa saber e o Janus não pergunta

- **Cadência:** diária, horário configurado no Janus; a RPA só entrega.
- **Mês corrente parcial** entra na base e é marcado na leitura; a RPA não filtra nada.
- **Datas fora de faixa** são problema da origem: a carga aplica e reporta `rejeitadas_por_data`.
- **Reprocesso**: repetir o passo 3 com `x-ingestao-origem: reprocesso` e os mesmos `path`s.
- **Dado pessoal** (CPF/CNPJ/e-mail em Vendas) fica só no cru do bucket; nunca vai para tabela.

## 8. Fora da v1

Extração automática (as RPAs em si), Pessoas, carga incremental por janela, Vendas via API do
fornecedor, callbacks/webhooks de conclusão (a RPA consulta `GET /api/ingestao/cargas/{carga_id}`
se precisar — leitura, mesma chave).
