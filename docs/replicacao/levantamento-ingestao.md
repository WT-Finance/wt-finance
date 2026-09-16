# Levantamento as-built — Ingestão de planilha

**Data:** 2026-09-16
**Commit de referência:** `59a986a2717dcd4b9c58bc6c016f5b417dbee998` (merge do PR #274, pós-merge da v5.11.0)
**Natureza:** levantamento só-leitura. Nenhum arquivo do produto foi alterado; nenhuma migration,
RPC de escrita ou upload foi executado. As consultas ao banco correram em conexão com
`SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY` (padrão de `src/lib/rpc-contrato.test.ts:1917`).

**Régua:** medição fica, opinião sai. Toda afirmação carrega `caminho:linha`, a consulta de catálogo,
ou a medição executada. Onde não foi possível determinar, está escrito **NÃO DETERMINADO** — não há
preenchimento por inferência.

## O que NÃO foi coberto, e por quê

| Fora | Razão |
|---|---|
| Espelho do sistema de origem (`monde.*`, `monde_ingest_*`) | Ingestão por API com staging/promoção — outro mecanismo, levantamento próprio |
| Anexos de Solicitação e Acervo (`app.solicitacao_anexo`, `app.acervo_documento`) | Arquivo é **armazenado**, não parseado; não vira base consultável. Citados no §1 só para não deixar `type="file"` sem explicação |
| O que acontece com o dado depois de carregado (DRE, Fluxo, relatórios) | Já levantado em outro lugar |
| Execução da suíte (`npm test`) e de qualquer gate | Levantamento é só-leitura; a cobertura foi medida por leitura dos testes, não por rodá-los |
| Comportamento sob concorrência real (dois uploads simultâneos) | Exigiria escrita em produção. A análise de trava é **estática**, a partir do corpo das funções |
| Se algum consumidor de `analytics.fato_lancamento_operacao` depende de MV que só `refresh_all_materialized_views()` atualiza | Orçamento; ver §6, item em aberto |

---

## 1. Inventário das bases

Uma base entra no produto por arquivo enviado por pessoa em **três** superfícies, não uma. O padrão
não é comum: há **quatro** formas de gravar diferentes.

| # | Base | Tela | Parser | Atravessa a rede | Destino | Padrão de gravação | Lote | Volume (linhas)¹ | Formato |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Vendas por Produto | `/admin/uploads` | `parse-vendas-produto.ts` → `vendas-parser.ts` | linhas parseadas | `raw.vendas_excel_staging` → `raw.vendas_excel` + `analytics.fato_venda*` + dims + MVs | **staging + swap atômico** | 1000 | 48.453 | `.xlsx,.csv` |
| 2 | Lançamentos por Operação | `/admin/uploads` | `parse-lancamentos.ts` | linhas parseadas | `analytics.fato_lancamento_operacao` | truncate + insert **direto na tabela viva** | 1000 | 41.282 | `.xlsx,.csv` |
| 3 | Lançamentos por Movimentação | `/admin/uploads` | `parse-lancamentos-movimentacao.ts` | linhas parseadas | `raw.lancamentos_movimentacao` → `financeiro.fato_fluxo` | truncate + insert direto | 500 | 120.939 | `.xlsx,.csv` |
| 4 | Lançamentos por Vencimento (em aberto) | `/admin/uploads` | `parse-titulos-em-aberto.ts` | linhas parseadas | `raw.titulos_em_aberto` → `financeiro.fato_fluxo` | truncate + insert direto | 500 | 36.349 | `.xlsx,.csv` |
| 5 | Pessoas | `/admin/uploads` | `parse-pessoas.ts` | linhas parseadas | `raw.pessoas_staging` → `raw.pessoas` | **staging + swap atômico** | 500 | 64.104 | `.xlsx,.csv` |
| 6 | Demonstrativo de Resultado (Competência) | `/admin/uploads` | `parse-demonstrativo-competencia.ts` | linhas parseadas | `raw.demonstrativo_competencia` → view `financeiro.vw_dre_competencia` | truncate + insert direto | 500 | 3.320 | **só `.xlsx`** |
| 7 | Importação Gerencial | `/financeiro/fluxo-caixa/gerencial` | `gerencial/parser.ts` | **o `File` (bytes)** | `analytics.gerencial_lancamentos` | **diff incremental por fatia do originador** | — (1 chamada) | 117 | `.xlsx,.xls` |
| 8 | Cadastro de Clientes Corporativos | `/financeiro/faturamento-corp` (aba Cadastro) | `faturamento/parse-clientes-corp.ts` | linhas parseadas | `app.cliente_corporativo` | **substituição da fatia `origem='planilha'`** | — (tudo de vez) | 240 | `.xlsx,.xls,.csv` |

¹ Estimativa de `pg_class.reltuples` lida no catálogo vivo em 16/09/2026 — não é `count(*)`.
`financeiro.fato_fluxo` (derivada de 3 e 4) tem 157.288.

**Superfícies que leem arquivo mas não viram base** (mapeadas para fechar o inventário):
`src/components/financeiro/faturamento-corp.tsx` (emissão — só os nomes distintos viajam, para
cruzamento; a escrita é por fatura escolhida, não carga) e
`src/components/financeiro/calculadora-rateio.tsx` (declarado read-only em `:3-8`; a tela informa
"O arquivo não é enviado nem armazenado", `:158`).

### As divergências — o achado mais útil deste bloco

1. **Três mecanismos de gravação, não um.** Full-swap (1–6), diff por fatia (7), substituição de
   fatia por origem (8). Um replicador que assumir "substituição total" acerta 6 de 8.
2. **Duas das seis bases de `/admin/uploads` têm pipeline atômico; quatro não têm.** Vendas e Pessoas
   passam por staging e um swap em transação única. Lançamentos, Movimentação, Títulos e Competência
   fazem `TRUNCATE` numa transação e `INSERT` em N transações seguintes (§4).
3. **A base 7 é a única em que o arquivo atravessa a rede** — e por isso é a única API Route, conforme
   a regra do projeto (skill `ingestao-planilhas` §1). É também a única **incremental**, a única com
   **preview de linhas**, e a única sob o **diário de alterações**.
4. **A base 8 não tem preview, nem aviso, nem lote, nem limite de tamanho** — importa ao selecionar o
   arquivo (`src/components/financeiro/cadastro-clientes.tsx:221-232`) e envia o array inteiro numa
   chamada (`cadastro-actions.ts:36`).
5. **A base 6 é a única com alarme de contagem e soma** (§5).
6. **Rota órfã:** `src/app/api/admin/upload-lancamentos/route.ts` existe, está protegida por
   `requireAreaApi('admin/uploads')` (`:9`) e tem limite de 50 MB (`:5,30`), mas **nenhum ponto de
   `src/` a chama** (grep). O caminho vivo da base 2 é a Server Action. Além disso a rota aceita
   `.xlsx` (`:36`) enquanto `carregarLancamentos` → `parseCsvBuffer` sempre decodifica o buffer como
   texto UTF-8 (`src/lib/carga/lancamentos.ts:37`) — o contrato promete um formato que a
   implementação não atende. Consumidor vivo de `carregarLancamentos`: só `supabase/seed/seed.ts`.

---

## 2. O parser

### Camada e biblioteca

Biblioteca única: `@e965/xlsx`. A camada **não é uniforme**:

| Camada | Parsers | Observação |
|---|---|---|
| Cliente / Web Worker (import dinâmico) | 1–6, 8, rateio, faturamento | `parse.worker.ts` registra 6 kinds; `parse-em-worker.ts:9-40` despacha com fallback para a main thread |
| Servidor, import **estático** | `src/lib/gerencial/parser.ts:7` | Única que recebe o arquivo; roda em API Route `runtime='nodejs'` (`route.ts:6`) |
| Servidor, import estático | `src/lib/carga/lancamentos.ts:1` | Só CSV; alcançável pela rota órfã e pelo seed |

O parse pesado no cliente roda em Web Worker — regra nascida da travada de ~45 mil linhas na v4.20.2.

### Leitura de valor numérico — medido nesta sessão

Este é o ponto de maior custo histórico, então foi **medido**, não lido. Construí um `.xlsx` com a
célula numérica `-40.933` formatada para exibição BR e um CSV com `-40,933` / `1.234,56`, e li com
todas as combinações de opção:

| Entrada | `read.raw` | `sheet_to_json.raw` | Resultado |
|---|---|---|---|
| `.xlsx` | `false`, `true` ou omitido | omitido ou `true` | `-40.933` (**number**), data como `Date` |
| `.xlsx` | qualquer | **`false`** | `"-40.93"` (**string**), data `"3/7/25"` (americana) |
| CSV | **`true`** | — | `"-40,933"`, `"07/03/2025"` (strings preservadas) |
| CSV | **`false`** | — | **`-40933`** (×1000), `1.234,56` → **`1.23456`**, `07/03/2025` → **3 de julho** |

Três conclusões com número:

1. **`raw` não é opção de `XLSX.read` para `.xlsx`.** Os `raw:false` que aparecem no ramo binário de
   8 parsers (`parse-vendas-produto.ts:32`, `parse-lancamentos.ts:25`, `parse-pessoas.ts:94`,
   `parse-lancamentos-movimentacao.ts:177`, `parse-titulos-em-aberto.ts:173`,
   `parse-faturamento.ts:57`, `parse-clientes-corp.ts:83`, `rateio/parse-fatura.ts:37`) são
   **inertes** — resíduo, não defeito. `parse-demonstrativo-competencia.ts:241-243` é o único que já
   removeu o resíduo e documenta por quê.
2. **Quem corrompe é `sheet_to_json({raw:false})`** — devolve a string de exibição, e a data no
   formato americano (exatamente a armadilha da ADR-0099).
3. **No ramo CSV, `read({raw:false})` é a porta maior** — destrói todo valor BR com vírgula decimal.
   **Todos os 9 ramos CSV vivos usam `raw:true`**, com razão escrita no próprio código
   (ex.: `parse-vendas-produto.ts:26-28`).

Estado atual de `sheet_to_json` por parser: `raw:true` explícito em
`parse-lancamentos-movimentacao.ts:189`, `parse-titulos-em-aberto.ts:182`,
`parse-demonstrativo-competencia.ts:251`; **omitido** (default `true`) nos demais; `raw:false` **só**
em `gerencial/parser.ts:109`, e ali é metade de uma leitura dupla deliberada (abaixo).

**A exceção — leitura dupla no Gerencial.** `src/lib/gerencial/parser.ts` lê a mesma planilha duas
vezes: `rows` com `raw:false, dateNF:'yyyy-mm-dd'` (`:108-112`, string de exibição, usada para tipo,
pessoa, descrição, conta) e `rowsRaw` com `raw:true` (`:121-124`, valor nativo), casadas por índice de
linha. Desde a v5.5.2 **duas** colunas consultam a versão nativa com fallback para a string:
`Valor Final` (`:166-167`) e `Vencimento` (`:171-172`). Até então só `Vencimento` era protegida — é o
precedente de que leitura dupla vale **pela coluna que a usa**, não pelo arquivo.

### Cabeçalho — quatro estratégias diferentes

Nenhum parser casa por interseção de sinônimos. Todos partem de um **mapa literal**; o que varia é a
normalização:

| Estratégia | Parsers | Trecho |
|---|---|---|
| Mapa literal + `normalizeHeader` (NFD, remove diacrítico, minúsculas, colapsa espaço) | Vendas, Movimentação, Títulos, Competência, Pessoas, Faturamento, Clientes Corp | `vendas-parser.ts:75-82` |
| Mapa literal **exato, sem normalização** | `parse-lancamentos.ts:39-61`, `lancamentos.ts:45-49` | `row['Operacao']` — "Operação" acentuado **não casa** |
| `findCol` case-insensitive + trim, **sem remover acento** | `gerencial/parser.ts:132-134` | `'Descrição'` e `'Descricao'` são tentados como alternativas explícitas (`:140`) |
| `indexOf` por nome exato (posição) | `rateio/parse-fatura.ts:45-46` | Deliberado: "a ordem/presença das OUTRAS colunas varia" (`:10-11`) |

Coluna **extra**: tolerada em todos. Quatro parsers emitem `console.warn` das não-mapeadas
(`vendas-parser.ts:146`); `parse-pessoas.ts` não avisa.

### Datas

`toIsoDate` canônico (`src/lib/carga/coercao.ts:56-74`): usa ano/mês/dia **locais** do `Date` nativo
(nunca `toISOString`, que deslocaria o dia em fuso negativo), aceita `YYYY-MM-DD` e `DD/MM/YYYY` sem
inverter, rejeita `y < 1900` (serial 0 do Excel = "sem data") e dia `'00'`; qualquer outra coisa → `null`.

**Duas exceções vivas:**
- `vendas-parser.ts:91-109` define **seu próprio `toIsoDate`**, com o mesmo nome e mais fraco: não
  checa `Number.isNaN(getTime())`, não rejeita `y < 1900`, e para string que não casa `DD/MM/YYYY`
  faz **passthrough bruto** (`return s`, `:106`) — texto arbitrário numa célula de data vira valor
  gravado. O lint `wt/no-coercao-reimpl` não o pega porque sua regex de nome cobre
  `num|valor|money|reais|float|decimal`, não data.
- `gerencial/parser.ts:40-88` tem `parseVencimento` dedicada: aceita `Date`, serial do Excel, ISO,
  `DD/MM|DD-MM|DD.MM` com ano de 2 ou 4 dígitos, usa US quando o 1º campo > 12 e **default BR** no caso
  ambíguo.

### Coerção numérica — `src/lib/carga/coercao.ts`

`toNum` (`:21-46`): number nativo passa direto; string tem `R$`/espaços removidos; parênteses viram
negativo (convenção contábil, ADR-0130); depois desambigua — `/,\d{1,2}$/` → BR decimal;
vírgula fora desse padrão → US milhar; `^-?\d{1,3}(\.\d{3})+$` → BR milhar puro; senão ponto é decimal
US. **É essa terceira regra que o `raw:false` ativava por engano** sobre `"-40.933"`.

`toCentavos` (`:100-119`): centavos inteiros pela **mesma regra do Postgres** ao gravar
`NUMERIC(x,2)` — meio-para-longe-de-zero sobre a representação **decimal em string**, nunca sobre o
float. Medido nesta sessão contra `Math.round(v*100)/100`: divergem em `1.005` (1,00 × 1,01) e
`-1.005` (−1,00 × −1,01); concordam em `188.615`, `2.675`, `0.125`, `8.845`, `1234.565`. O acordo
depende de que lado do meio a representação binária caiu — é imprevisível caso a caso.

**Quem usa `toCentavos`:** só `parse-demonstrativo-competencia.ts:174` (a base cujo valor é comparado
com o banco). **`gerencial/parser.ts:203` usa `Math.round(valor * 100) / 100`** — a regra que
`toCentavos` existe para evitar. Hoje é inócuo (aquele valor não é confrontado com soma do banco, e
`valor < 0` é descartado em `:190-193`), mas é uma segunda regra de arredondamento viva na camada.

### Linhas ignoradas e valor inesperado

Não há filtro de rodapé, total ou cabeçalho repetido em **nenhum** parser. O que existe:

| Situação | Comportamento | Onde |
|---|---|---|
| Linha 100% vazia | Pulada, em todos | `vendas-parser.ts:152` |
| Chave nula | Descarte **silencioso**, sem contagem | `parse-lancamentos.ts:41,44,47`; `parse-lancamentos-movimentacao.ts:136,138` |
| Tipo/valor/vencimento inválido | Descarte **com aviso nomeando a linha e o valor cru** | `gerencial/parser.ts:183-199`, helper `diag()` em `:157` |
| Linha com conteúdo que não fecha registro | **Derruba o parse inteiro**, nomeando as linhas | `parse-demonstrativo-competencia.ts:182-216` |
| Campo ausente | Vira `null` e a linha **entra assim** | `parse-faturamento.ts:71` |

São quatro políticas diferentes para o mesmo evento. `parse-demonstrativo-competencia` é a mais
estrita e a mais recente — a direção em que a camada vinha andando.

---

## 3. Validação

**Presença de coluna obrigatória** é a única validação de esquema na fronteira. Helper único:
`src/lib/carga/colunas-obrigatorias.ts` — set-membership sobre os headers, **nunca** sobre o conteúdo
da célula (`:8-11`: "uma base como Pessoas tem a maioria das células vazia, e isso é esperado"). A
mensagem **nomeia** as faltantes: `"Sua planilha precisa conter as colunas: X, Y."` (`:29-31`).

Usam o helper (7): `parse-pessoas.ts:103`, `parse-demonstrativo-competencia.ts:134`,
`parse-clientes-corp.ts:92`, `parse-faturamento.ts:65`, `parse-titulos-em-aberto.ts:91`,
`parse-lancamentos.ts:34`, `parse-lancamentos-movimentacao.ts:92`. Validam à mão, nomeando:
`gerencial/parser.ts:143-149` (e ainda lista as colunas encontradas) e `lancamentos.ts:45-49`.

**Contrato próprio:** `rateio/parse-fatura.ts` devolve `{ linhas: [], faltando }` em vez de `{ error }` (`:45-50`) — a tela decide o que fazer.

**Não valida nada: Vendas.** `vendas-parser.ts` não chama o helper; `obrigatorias: []` no card, com o
comentário honesto "parser tolerante (mapeia o que estiver presente) — nenhuma exigida hoje"
(`src/app/admin/uploads/page.tsx:106`). `parseVendasRows` empurra qualquer linha não-vazia mesmo que
**nenhuma** coluna tenha casado (`vendas-parser.ts:150-181`); o único portão é `linhas.length === 0`
(`parse-vendas-produto.ts:40`).

Não há validação por esquema (Zod) do **conteúdo** das linhas em nenhum parser. Zod aparece só na
leitura do status (`parseRpc` em `actions.ts:453-461`), não na entrada do arquivo.

### Casos de borda

| Caso | Comportamento |
|---|---|
| Arquivo vazio | Erro nomeado: "Arquivo vazio ou sem dados" (`parse-pessoas.ts:99`); "Planilha está vazia" (`gerencial/parser.ts:126`); "Arquivo Excel vazio (sem abas)" (`:100-102`) |
| Uma linha só (só cabeçalho) | `aoa.length < 2` → erro (`parse-vendas-produto.ts:37`) |
| Coluna obrigatória ausente | Erro nomeando a coluna — **exceto em Vendas**, que não tem obrigatórias |
| Texto e número na mesma coluna | `toNum` aceita ambos (number nativo passa direto; string segue a regra BR/US). Sem erro, sem aviso |
| **Arquivo de outra base na tela errada** | Detectado **só** nas bases com coluna obrigatória. **Em Vendas, não é detectado**: uma planilha de Pessoas com ≥1 linha não-vazia é aceita como "sucesso" com praticamente todo campo nulo |

---

## 4. Gravação

### O padrão, por base

| Base | Padrão | Atômico? | Trava | Migration vigente |
|---|---|---|---|---|
| Vendas | full-swap via staging | **sim** | `pg_advisory_xact_lock(4017001)` nos 3 passos | 0135 |
| Pessoas | full-swap via staging | **sim** | **nenhuma** | 0160 |
| Lançamentos por Operação | truncate + insert direto | **não** | nenhuma | 0027 |
| Movimentação | truncate + insert direto | **não** | nenhuma | 0185 |
| Títulos em Aberto | truncate + insert direto | **não** | nenhuma | 0186 |
| Competência | truncate + insert direto | **não** | nenhuma | 0255 |
| Gerencial | diff por fatia, 1 chamada | atômico por construção | nenhuma (filtro `originador_id`) | 0154 |
| Clientes Corp | fatia `origem='planilha'`, 1 chamada | atômico por construção | nenhuma | 0164 |

### A sequência exata, e em que transação

**Vendas (o caminho fail-safe).** `limpar_staging_vendas` → N× `inserir_lote_staging` →
`validar_carga_staging` → `promover_carga_vendas` (`actions.ts:109-193`). Cada chamada é sua própria
transação, mas **a base viva só muda dentro de `promover_carga_vendas`**, que é uma função plpgsql
única — logo, uma transação. Verificado no catálogo vivo: ela toma `pg_advisory_xact_lock(4017001)`,
aborta se a staging estiver vazia, aborta se houver data fora de `analytics.dim_data`, faz
`TRUNCATE analytics.fato_venda_item, fato_venda, dim_produto, dim_pagante, dim_vendedor,
raw.vendas_excel RESTART IDENTITY CASCADE`, insere da staging, e então chama
`transform_raw_to_analytics()`, `regenerar_dim_operacao_weddings()` e
`refresh_all_materialized_views()` — tudo na mesma transação. Falha em qualquer ponto → `ROLLBACK`, e
a base fica como estava. É o que as mensagens "A base atual foi preservada" (`actions.ts:158,163,174`)
afirmam, e é verdade.

**As quatro bases sem staging.** O padrão é `if (isFirst) truncar_*()` e depois
`inserir_lote_*(p_linhas)` (ex.: `actions.ts:363-371` para Títulos). Verifiquei no catálogo que
`truncar_titulos_em_aberto`, `truncar_lancamentos_movimentacao`,
`truncar_demonstrativo_competencia` e `truncar_lancamentos` são `TRUNCATE` nus — **sem trava** — e que
`inserir_lote_titulos_em_aberto`, `inserir_lote_demonstrativo_competencia` e
`inserir_lote_lancamentos_movimentacao` são `INSERT ... SELECT FROM jsonb_array_elements(p_linhas)`
puros, sem truncate e sem trava.

**Consequência, que é o achado estrutural do levantamento:** entre o `TRUNCATE` (transação 1) e o
último lote (transação N+1) a tabela fica **vazia ou parcial para qualquer leitor**. Se um lote falhar
no meio — rede, timeout, aba fechada — a base **não** volta ao estado anterior: fica truncada e
parcialmente populada, sem rollback possível, porque cada lote já comitou. Por isso as mensagens de
erro dessas bases **não** dizem "base preservada" (contraste: `actions.ts:55` × `:158`). Não há
mecanismo de recuperação automática nem RPC de desfazer para elas.

### Lote, payload e arquivo grande

Lote por base: 1000 (Vendas, Lançamentos), 500 (Movimentação, Títulos, Pessoas, Competência) —
`page.tsx:104,112,120,128,136,144`, com o comentário "Tamanho de lote validado para esta base — não
unificar (cabe em <3s)" (`:81`). Cada lote é uma Server Action, sujeita ao
`bodySizeLimit: '25mb'` (`next.config.ts:21`) — o teto vale **por lote, não pelo arquivo**.
Clientes Corp envia **tudo numa chamada** (`cadastro-actions.ts:36`), portanto é a única cujo arquivo
inteiro tem de caber nos 25 MB de payload.

Arquivo maior que o limite: nas 6 bases de `/admin/uploads` **não existe limite de arquivo** (§8);
o que estoura primeiro é a memória do Worker ou o payload de um lote.

### Idempotência

Para as bases full-swap, recarregar o mesmo arquivo converge para o mesmo **conteúdo de linhas**
(`RESTART IDENTITY` zera as sequences). Três ressalvas medidas:

- `carregado_em`/`criado_em` mudam a cada carga (é o que alimenta a "última atualização").
- `regenerar_fluxo_caixa` faz **auto-sync aditivo** de `financeiro.dim_conta_bancaria`
  (`ON CONFLICT DO NOTHING`, preserva classificação manual) e de `financeiro.dim_categoria`
  (`ON CONFLICT DO UPDATE`). **Nenhum dos dois remove.** Uma conta ou categoria que saiu do arquivo
  permanece na dimensão — o estado das dimensões derivadas é acumulativo, não idempotente.
- `app.cliente_corporativo.criado_em` não é estável: o `DELETE`+`INSERT` da fatia reseta o `now()`.

Gerencial é idempotente por construção: reimportar o mesmo arquivo produz diff vazio.

### Diário de alterações — medido no catálogo

Consultei `pg_trigger` em todos os schemas de dados. Os gatilhos `fn_diario_alteracoes` existem em:
`analytics.gerencial_lancamentos`, `estante.livro`, `estante.movimentacao`, `financeiro.dre_bloco`,
`financeiro.dre_categoria_map`, `financeiro.dre_comp_bloco`, `financeiro.dre_comp_par`,
`patrimonio.ativo`, `patrimonio.movimentacao`.

Portanto: **das 8 bases carregadas por arquivo, exatamente uma está sob o diário** — a do Gerencial
(que também tem `trg_broadcast_gerencial_*` para realtime e as RPCs `gerencial_desfazer_lote` /
`gerencial_historico_lote`). `raw.vendas_excel`, `raw.pessoas`, `raw.lancamentos_movimentacao`,
`raw.titulos_em_aberto`, `raw.demonstrativo_competencia`, `analytics.fato_venda*`,
`analytics.fato_lancamento_operacao`, `financeiro.fato_fluxo` e `app.cliente_corporativo` **não têm
gatilho algum**.

**A razão é escrita.** ADR-0155 nasceu de "um usuário apagou toda a Base de Dados do Fluxo de Caixa
Gerencial sem reversão possível" e escopa o padrão a **tabelas editáveis** linha a linha
(`docs/adr/0155-diario-alteracoes-undo-realtime-trava.md:5,35`) — não a bases de upload full-swap,
cuja reversão pretendida é re-subir o arquivo. Nuance verificada: na base 6, a parte **bruta**
(`raw.demonstrativo_competencia`) não é auditada, mas a estrutura **editável** que ela alimenta
(`dre_comp_bloco`, `dre_comp_par`) é.

---

## 5. Alarme de completude

**Existe em exatamente uma base de oito: Demonstrativo de Competência.**

`finalizarDemonstrativoCompetenciaAction` (`actions.ts:516-540`) confronta o que o arquivo tinha com o
que a base gravou, em duas grandezas:

- contagem: `status.total !== totalEnviadas`
- soma: `status.soma_centavos !== somaCentavosArquivo`

A soma do arquivo vem de `somaCentavos()` (`parse-demonstrativo-competencia.ts:99`), medida no cliente
**antes do envio** (`page.tsx:650`); a do banco vem de `status_demonstrativo_competencia()`, que no
catálogo é `COALESCE(round(sum(valor) * 100), 0)::BIGINT` sobre `NUMERIC(18,2)`. **A comparação é
entre inteiros nas duas pontas** — "bate" quer dizer bate ao centavo, e é por isso que o parser emite
o valor já arredondado por `toCentavos` (§2).

Divergindo, devolve erro e o card **não declara sucesso**:

> "A carga NÃO fecha com o arquivo: {o arquivo tinha N linha(s) e a base gravou M} e {a soma do
> arquivo é X e a da base é Y}. A base ficou com o conteúdo enviado, mas confira o arquivo e
> recarregue antes de usar os números."

**É bloqueante do sucesso, não da gravação** — a própria mensagem diz que o dado já está lá. Não há
rollback. É um alarme *post-hoc*, coerente com o fato de a base não ter staging.

As outras sete bases **não têm conferência alguma** de contagem ou soma entre arquivo e banco. O mais
próximo disso é `validar_carga_staging` (Vendas), que roda **antes** de promover e é bloqueante de
verdade, mas checa **domínio** (staging vazia, data fora de `dim_data`, setor fora da dimensão), não
fechamento numérico contra o arquivo; e emite um aviso não-bloqueante de queda de `operacao_propria`.

### Pré-visualização

`ModalConfirmacaoUpload` (`src/components/admin/modal-confirmacao-upload.tsx`) é o único preview das
6 bases de `/admin/uploads`, e mostra **apenas duas contagens** — quantos registros existem e quantos
entram. **Nunca uma amostra de linhas, nunca uma soma.** Para Vendas, `totalDepois` é o número de
vendas **únicas**, não de linhas (`page.tsx:526`).

O preview mais rico da plataforma é o do Gerencial (`import-drawer.tsx:187-299`): quatro baldes
navegáveis (Adicionar / Atualizar / Manter / Remover) com cada linha (Tipo, Pessoa, Valor, Conta,
Vencimento), toggle "manter duplicadas", e a possibilidade de **desmarcar** linhas a remover. Também
não mostra soma.

O card da base 6 exibe `Σ` e a cobertura temporal **da base atual** (`page.tsx:325-328`) — é status,
não preview do arquivo.

### Aviso de que a carga apaga a anterior

Existe e é explícito, em duas camadas, para as 6 bases de `/admin/uploads`:

- Descrição fixa do card: *"Substitui toda a base de X. Importe sempre o arquivo completo."*
  (`page.tsx:99-149`).
- Modal de confirmação: *"Esta importação vai **APAGAR** os N registros atuais de «X» e carregar M
  novos. Esta ação não pode ser desfeita."* (`modal-confirmacao-upload.tsx:31-37`).

Gerencial tem aviso **próprio e diferente**, porque a substituição é parcial:
*"Ao importar a planilha, todos os lançamentos da importação anterior são substituídos. A importação
sincroniza apenas as suas linhas — lançamentos de outros usuários não são tocados. Lançamentos
adicionados manualmente não são excluídos."* (`import-drawer.tsx:167-171`).

**Clientes Corporativos não tem aviso nenhum antes** — só um banner depois do fato
(`cadastro-clientes.tsx:263-274`).

---

## 6. Ordem entre bases dependentes

**Regeneração de derivados:**

| Carga | Regenera |
|---|---|
| Vendas | `transform_raw_to_analytics()`, `regenerar_dim_operacao_weddings()`, `refresh_all_materialized_views()` — tudo **dentro** de `promover_carga_vendas` |
| Lançamentos por Operação | `regenerar_dim_operacao_weddings()` (**não** chama `refresh_all_materialized_views`) |
| Movimentação **e** Títulos | `regenerar_fluxo_caixa()` — a **mesma** função, no finalizar de ambas |
| Competência | `provisionar_dre_comp_par()` (não-bloqueante); leitura é view, sem fato a materializar |
| Pessoas, Gerencial, Clientes Corp | nada |

**O acoplamento real está em `regenerar_fluxo_caixa`.** Li sua definição no catálogo: ela reconstrói
`financeiro.fato_fluxo` a partir de `raw.lancamentos_movimentacao` **UNION** `raw.titulos_em_aberto` —
sempre as duas. Como é chamada no finalizar de qualquer uma delas (`actions.ts:328,384`), subir só
uma já regenera o fato inteiro usando a outra **no estado em que estiver**. A ordem não corrompe (o
rebuild é TRUNCATE + reconstrução determinística), mas entre as duas cargas o fato mistura uma base
nova com uma antiga — e nada na tela diz isso.

**Onde a ordem está escrita: em lugar nenhum.** Nem na tela, nem no código, nem em documento. Os três
artefatos mais próximos são todos indiretos: (a) o range fixo de `analytics.dim_data`, que só se
manifesta **reativamente** como erro de FK/validação quando a planilha traz data fora dele;
(b) `supabase/migrations/0160_base_pessoas.sql:15` e `actions.ts:198`, que falam de atomicidade
("o Faturamento depende, a base não pode ficar vazia no meio"), não de sequência; (c)
`page.tsx:464-466`, que é regra para o **desenvolvedor** que adiciona um card, não para o operador.

**Incidente por ordem invertida: nenhum registrado.** A varredura de ADRs, out-briefings e CHANGELOG
não encontrou nenhum.

**Em aberto:** `refresh_all_materialized_views()` é chamado no fluxo de Vendas mas **não** no de
Lançamentos por Operação. Se algum consumidor de `analytics.fato_lancamento_operacao` for servido por
MV, ele fica stale após uma carga dessa base. **NÃO DETERMINADO** — exigiria mapear as MVs contra
essa tabela.

---

## 7. Registro e observabilidade

**Não existe log de execução de carga.** Não há tabela de histórico de upload; a varredura de
`pg_class` por nomes com `log|hist|audit|diario|carga|upload` devolveu apenas
`financeiro.diario_alteracoes` (que cobre tabelas editáveis) e `app.api_chamada_log` (API externa).

O que existe é **status derivado da própria tabela de destino**, uma RPC por base
(`get_upload_status`, `status_titulos_em_aberto`, `status_pessoas`,
`status_lancamentos_movimentacao`, `status_demonstrativo_competencia`). Li as definições: todas são
`count(*)` + `max(carregado_em)` (ou `max(criado_em)`), e a da competência ainda traz
`soma_centavos`, `pares`, `cobertura_de`, `cobertura_ate`.

Respondendo à pergunta do briefing — "quando esta base foi carregada pela última vez, por quem, com
quantas linhas":

| | Recuperável? |
|---|---|
| Quando | **Sim** — `max(carregado_em)`, exibido no card |
| Com quantas linhas | **Sim**, com ressalva: é a contagem **da tabela**, não do arquivo. Linhas descartadas pelo parser nunca chegaram e não aparecem em lugar nenhum |
| **Por quem** | **Não.** Nenhuma tabela de destino tem coluna de autor, e não há log. Única exceção: Gerencial, que grava `originador_id`/`originador_nome`/`importado_lote_id` (0154) — mas via API Route com service_role o `usuario_id` do diário fica nulo |
| Qual arquivo | Parcialmente: `arquivo_origem` é gravado linha a linha em Vendas, Movimentação, Títulos e Competência |

Retenção: nenhuma política — o "histórico" é sobrescrito a cada carga, por construção.

**Safra na tela que consome:** só uma tela declara. `src/app/financeiro/dre/page.tsx:369-370` mostra
*"Competência · Última atualização em {carregado_em}"* (e um equivalente para Caixa em `:379`).
A varredura de `src/app` e `src/components` por `ultima_atualizacao|carregado_em|Última atualização`
não encontrou nenhuma outra tela de consumo declarando a safra da base — as demais ocorrências são a
própria tela de upload (`page.tsx:322`) e o frescor do espelho Monde, que é outro mecanismo.
A **cobertura temporal** (período coberto) só existe para a base de competência.

---

## 8. Permissão

| Base | Camada 1 (página) | Camada 2 (action/rota) | Camada 3 (RPC) |
|---|---|---|---|
| 1–6 (`/admin/uploads`) | `requireArea('admin/uploads')` em `layout.tsx:7` | `requireAreaAction('admin/uploads')` em toda action | **não** — as RPCs têm só `REVOKE FROM PUBLIC` + `GRANT TO service_role` |
| 7 (Gerencial) | `requireArea('financeiro/gerencial')` | `requireAreaApi('financeiro/gerencial')` (`route.ts:63`) | **sim** — `app.exigir_acesso(['financeiro/gerencial'])` inline |
| 8 (Clientes Corp) | `requireArea('financeiro/faturamento-corp')` | `requireAreaAction(...)` (`cadastro-actions.ts:34`) | parcial |
| Rota órfã | — | `requireAreaApi('admin/uploads')` (`route.ts:9`) | — |

**Carregar é a mesma permissão que ler?** Depende da base:
- Bases 1–6: **não.** Carregar exige `admin/uploads`; ler o que elas alimentam é Performance, DRE,
  Fluxo, Metas — áreas distintas. São permissões independentes.
- Base 7: **sim** — `financeiro/gerencial` carrega e lê.
- Base 8: **sim** — `financeiro/faturamento-corp` carrega e lê (mesma aba, mesma tabela).
- Caso híbrido documentado: `buscar_pessoas` (consumo cruzado da base 5 pelo Faturamento) exige
  `app.exigir_acesso(ARRAY['admin/uploads','financeiro/faturamento-corp'])` — duas áreas unidas por OR
  na própria RPC, porque essa é `GRANT ... authenticated`.

**Divergência de convenção registrada:** as RPCs do pipeline de Vendas e Pessoas não têm
`app.exigir_acesso` inline, ao contrário do que o CLAUDE.md pede para RPC nova. Funciona porque a
chave `service_role` nunca sai do servidor e as duas camadas de app barram antes — mas a defesa é de
2 camadas, não 3, e a garantia deixa de valer se alguma dessas RPCs ganhar `GRANT ... authenticated`.

**Limite de tamanho de arquivo** (pertence aqui e ao §2, porque é a primeira barreira):

| Onde | Limite | Antes do parse? |
|---|---|---|
| `/admin/uploads` (bases 1–6) | **nenhum** | — |
| Cadastro Clientes Corp | **nenhum** | — |
| `api/gerencial/import` | 10 MB (`route.ts:74`) | **sim**, antes de `arrayBuffer()` |
| `import-drawer.tsx:104` (cliente) | 10 MB | sim |
| `api/admin/upload-lancamentos` (órfã) | 50 MB (`route.ts:5,30`) | sim |
| `faturamento-corp.tsx:187`, `calculadora-rateio.tsx:61` | 10 MB | sim |
| Global de Server Actions | `bodySizeLimit: '25mb'` | por **lote**, não pelo arquivo |

Ou seja: a tela que substitui bases inteiras é justamente a que não tem teto de entrada.

---

## 9. Prova

### A distinção que decide o valor do verde

A suíte é **mista de propósito**, e a distinção está consciente no projeto — foi a lição da v5.5.2.

**Partem do ARQUIVO** (constroem um workbook e entram por `parseXxxFile`):
`parse-fluxo-caixa-valor-nativo.test.ts` (6 casos; helper `arquivoXlsx` em `:36-41` com
`aoa_to_sheet` + `XLSX.write({type:'array', bookType:'xlsx'})`, e 2 casos CSV via `new File(...)`),
`parse-pessoas.test.ts`, `parse-clientes-corp.test.ts`,
`parse-demonstrativo-competencia.test.ts` (parte dos casos).

**Partem da MATRIZ** (`parseXxxRows(linhas)`): `parse-fluxo-caixa-onda1.test.ts`,
`vendas-parser.test.ts` (15 casos), e a parte de validação pura de
`parse-demonstrativo-competencia.test.ts`.

**Sondas estáticas** (leem o código-fonte, não executam): a de `parse-fluxo-caixa-valor-nativo.test.ts:167-224`
e `coercao-lint.sonda.test.ts`.

**Unidade pura**, sem arquivo nem linhas: `coercao.test.ts` (16 casos + `it.each` de 15), incluindo o
"oráculo congelado" contra o `toNum` legado e a bateria `toCentavos` × `Math.round`;
`colunas-obrigatorias.test.ts` (7).

### Os três buracos medidos

1. **`parseVendasProdutoFile` — a função de entrada da maior base — não é chamada por nenhum teste.**
   `parse-vendas-produto.test.ts` importa só `normalizeHeader` e `toIsoDate`. O parse ponta a ponta de
   Vendas (casamento de cabeçalho no runtime, coerção, extração) está sem cobertura em qualquer nível,
   e a cobertura por matriz de `vendas-parser.test.ts` é, **por construção**, cega ao defeito de
   extração — exatamente a classe do ×1000.
2. **Nenhum teste das Server Actions de upload nem da API Route.** Não existe
   `src/app/admin/uploads/actions.test.ts`. Lote, truncate, pipeline e alarme não têm teste em JS.
3. **A comparação do alarme não é testada.** `somaCentavos` (a metade do arquivo) é testada em
   `parse-demonstrativo-competencia.test.ts:230-262`; a comparação em `actions.ts:526-533` não tem
   teste algum.

### Fixtures

**Não existe nenhum `.xlsx`/`.xls` versionado no repositório.** Os três `.csv` em `docs/briefings/`
são anexos de documentação e nenhum teste os lê. Todo teste "de arquivo" monta o workbook em memória —
o que exercita a extração de verdade, mas **nunca** um export real do Monde (múltiplas abas,
formatação, célula mesclada, BOM real de CSV).

### Sondas

- `parse-fluxo-caixa-valor-nativo.test.ts:167-224` varre recursivamente `src/lib/carga`,
  `src/lib/rateio`, `src/lib/faturamento` e `src/lib/gerencial`, extrai os argumentos de
  `sheet_to_json(...)` e `XLSX.read(...)` por **parênteses balanceados** com suporte a parâmetro de
  tipo (`:188-201`). Tem caso positivo real: exige que a lista de infratores seja exatamente
  `['parser.ts']` — a exceção declarada da leitura dupla (`:214`) — e vazia no ramo CSV (`:223`).
  A 1ª versão usava janela de caracteres e ficava cega para `sheet_to_json<unknown[]>(...)`.
- `coercao-lint.sonda.test.ts` roda `RuleTester` sobre 8 snippets válidos e 6 inválidos, provando que
  a regra `wt/no-coercao-reimpl` ainda dispara. Não varre o repositório — isso é o `npm run lint`.

### Construído × provado

| Capacidade | Como está provada |
|---|---|
| Parse `.xlsx` (extração binária) | **arquivo** para Movimentação, Títulos, Pessoas, Competência, Clientes Corp · **só matriz** para Vendas · **nada** para `parseVendasProdutoFile` |
| Parse `.csv` (ramo `raw:true`) | **arquivo** só para Movimentação · demais ramos CSV só pela **sonda estática** |
| Casamento de cabeçalho | **matriz** + **arquivo** nas bases que testam; só unidade em Vendas |
| Coluna obrigatória ausente | **arquivo** (Pessoas, Clientes Corp) e **matriz** (Fluxo Onda 1, Competência) |
| Coerção de número BR | **unidade pura** (`coercao.test.ts`), não por base via arquivo |
| Coerção de data | **unidade pura** + **arquivo** |
| Regra de arredondamento `toCentavos` | **unidade pura**, com a comparação explícita contra `Math.round` |
| Defeito ×1000 (nativo × exibição) | **arquivo** para Movimentação, Títulos, Competência · **sonda** cobre a fonte dos 4 diretórios · **sem guarda de arquivo** para Vendas, Pessoas, Clientes Corp |
| Pipeline atômico (staging→promover) | **apenas lido** — nenhum teste JS |
| Substituição total / truncate | **apenas lido** |
| Alarme de contagem e soma | metade (soma do arquivo) por unidade; **a comparação, não provada** |
| Permissão (RBAC do upload) | **apenas lido** |
| Limite de tamanho | **apenas lido** (e inexistente nas 6 bases principais) |
| Observado em produção | Vendas, Movimentação, Títulos, Competência, Gerencial — todas em uso corrente (volumes do §1) |

---

## 10. Incidentes conhecidos

**1. ADR-0099 / v4.9 — inversão dia↔mês (Gerencial).**
Sintoma: vencimentos de 28/05–12/06 não apareciam em junho. Causa: `sheet_to_json({raw:false})`
devolvia a data como string no formato de exibição americano, e o parser assumia DD/MM quando ambos
os componentes eram ≤ 12. Dias > 12 acertavam por coincidência, mascarando o defeito por semanas.
Correção: ler o `Date` nativo (`cellDates:true` + `raw` seguro), string só como reserva.
Guarda: convenção em ADR-0099 + skill §3 — **sem lint dedicado**.

**2. v4.23.1 — saldo corrompido por `parseNum` local.**
Sintoma: saldos ×100. Causa: um `parseNum` local removia todo ponto como se fosse milhar.
Correção: convergência ao `toNum` canônico. Guarda: motivou o ADR-0130.

**3. ADR-0130 / v4.27.0 — duas reimplementações vivas de coerção.**
Sintoma: `toNumStr` em `vendas-parser.ts` e `parseValorMonetario` em `gerencial/parser.ts` conviviam
com o `toNum` canônico; sem dado corrompido, mas dívida latente. Correção: convergência + extensão
(negativo entre parênteses). Guarda: lint AST `wt/no-coercao-reimpl` com três sinais
(`parseFloat`, `.replace` de separador na direção texto→número, nome de função por regex) + a sonda
`coercao-lint.sonda.test.ts`. Isenções reais confirmadas em `eslint.config.mjs:94-106`:
`src/lib/carga/coercao.ts`, `**/*.test.ts`, `src/lib/email/**`.

**4. v5.5.2 — o ×1000 silencioso. O mais caro da camada.**
Sintoma: Endomarketing 2025 5,4× maior na DRE e, sobretudo, **o sinal do Resultado do Exercício
invertido em 2024 (−6,29 Mi exibido contra +82,8 mil real) e em 2025**. Causa-raiz: dois parsers
pediam `raw:false` ao `sheet_to_json`, descartando o número nativo; a string `"-40.933"` (R$ 40,93)
casava o ramo de milhar BR do `toNum` e virava −40933. Gatilho: exatamente 3 casas decimais com 1–3
dígitos inteiros — o que nasce de divisão de título (`377,23 ÷ 2 = 188,615`), logo esparso e plausível.
Alcance: 33 linhas confirmadas (R$ 7,52 Mi), até 1.073 indeterminadas. A auditoria de paridade da
v5.3.0 chegou a carimbar o delta como "re-lançamento retroativo no Monde".
Segunda porta, achada pelo revisor: o ramo CSV, maior, que destrói **todo** valor BR com vírgula.
Correção: leitura dupla nos dois parsers do Fluxo/DRE e `raw:true` no ramo CSV de oito parsers.
Guarda: a sonda de `parse-fluxo-caixa-valor-nativo.test.ts`, que prova pelo caminho do **arquivo** —
753 testes verdes passavam por cima do defeito testando só a matriz.
Nuance que ficou como regra: **leitura dupla não é imunidade do parser, vale só pela coluna que a
usa** — o Gerencial fazia leitura dupla desde a v4.9, mas só para `Vencimento`.

**5. ADR-0029 / v4.11 — uploads sem autenticação.** Registrado e conscientemente mantido à época.
**Hoje o texto está desatualizado**: todas as superfícies de carga passam por `requireArea*` (§8).

**6. Achado incorreto na investigação da v5.5.2.** `docs/investigacoes/2026-08-10-coercao-milhar-dre-fluxo.md`
§7 afirma que a base "Lançamentos por Operação" está morta e que subir o arquivo quebraria em runtime.
É falso: `truncar_lancamentos`/`inserir_lote_lancamentos` escrevem em
`analytics.fato_lancamento_operacao`, que nunca foi dropada — `0192_drop_bases_antigas_fluxo.sql:17-18`
diz explicitamente que ela "permanece viva". A confusão foi com o par homônimo
`truncar_lancamentos_financeiro`/`inserir_lote_lancamentos_financeiro`, esses sim dropados na 0192.
O card está vivo e funcional (41.282 linhas no catálogo).

---

## 11. Contaminação de domínio

Critério: um artefato está limpo se funciona sem conhecer o negócio deste produto.

**Motor (limpo, replicável como está):**
- `src/lib/carga/coercao.ts` — `toNum`/`toIsoDate`/`toStr`/`toCentavos`. Sabe de BR/US, de convenção
  contábil e de `NUMERIC(x,2)` do Postgres; não sabe nada de Welcome, Monde ou DRE.
- `src/lib/carga/colunas-obrigatorias.ts` — set-membership sobre rótulos.
- `src/lib/carga/parse-em-worker.ts` e `parse.worker.ts` — despacho genérico com fallback; **quase**
  limpos: `parse.worker.ts:15-31` traz um registry com os 6 nomes de base (configuração embutida no
  motor).
- `src/components/admin/modal-confirmacao-upload.tsx` — recebe rótulo e duas contagens.
- `src/lib/patrimonio/csv.ts` — o caminho de volta (BOM, `;`, decimal com vírgula, CRLF, desarme de
  fórmula, vazio ≠ zero).

**Configuração (o que muda por base, hoje espalhado):** os `COL_MAP` e `REQUISITOS` de cada parser;
o array `BASES` em `page.tsx:99-149` (rótulo, descrição, lote, unidade, obrigatórias, `accept`). É
configuração *declarada*, mas convive no mesmo arquivo que o motor de cada parser — cada parser é
hoje "motor + configuração" num arquivo só, o que explica as quatro estratégias de cabeçalho
divergentes do §2.

**Conector (formato específico do export, intransferível):** `parseVencimento` do Gerencial; a
conferência cruzada `Competência` × `Ano+Mês Nº` de `parse-demonstrativo-competencia.ts:191-204`;
a lista de contas-cartão hardcoded em `regenerar_fluxo_caixa`; o mapeamento
`ENVIAR PARA → destinatarios` de `parse-clientes-corp.ts`; a canonização de conta
(`canonizar-conta.ts`, com aliases "Banco Itau"→Itaú).

**Impuro por acidente, não por necessidade:** o `toIsoDate` de `vendas-parser.ts:91` (motor duplicado
e enfraquecido dentro de um conector) e o `Math.round(valor*100)/100` de `gerencial/parser.ts:203`
(segunda regra de arredondamento dentro de um conector).

---

## 12. Divergências encontradas

| O que a documentação/skill diz | O que o código faz | Evidência |
|---|---|---|
| "As **5** bases vivas de `/admin/uploads`" (skill §1) | São **6** desde a v5.8.0 | `page.tsx:47-49` (`BaseKey`), `BASES` em `:99-149` |
| "o modo seguro é não escrever a opção `raw`" (skill §3) | Correto, e nenhum parser vivo passa `raw:false` a `sheet_to_json` — exceto a leitura dupla deliberada | `gerencial/parser.ts:109` (documentado), sonda em `:214` |
| "no ramo CSV use sempre `raw:true`" (skill §3) | Cumprido em **9 de 9** ramos CSV | `parse-vendas-produto.ts:29`, `parse-lancamentos.ts:22`, `parse-pessoas.ts:91`, `parse-lancamentos-movimentacao.ts:174`, `parse-titulos-em-aberto.ts:170`, `parse-faturamento.ts:54`, `parse-clientes-corp.ts:80`, `rateio/parse-fatura.ts:34`, `lancamentos.ts:37` |
| Os `raw:false` no ramo binário parecem perigosos | São **inertes** — `raw` não é opção de `read` para `.xlsx` (medido nesta sessão) | `parse-demonstrativo-competencia.ts:241-243` já documenta |
| "casamento de cabeçalho insensível a acento/caixa/espaço fecha a porta" (`vendas-parser.ts:10-14`) | Verdade para o **casamento**; mas a porta que ficou aberta é outra: Vendas não valida coluna obrigatória alguma | `vendas-parser.ts:150-181`, `page.tsx:106` |
| ADR-0029: "as rotas de upload não têm autenticação" | Todas passam por `requireArea*` desde a v4.13 | `layout.tsx:7`, `actions.ts` (toda action), `route.ts:9,63` |
| ADR-0029: "ingestão atômica (ADR-0104) impede que uma carga deixe a base vazia" | Vale só para **Vendas** (e depois Pessoas). Quatro bases seguem sem staging | catálogo: `truncar_*` + `inserir_lote_*` sem swap |
| `next.config.ts:18-20`: "o upload via API Route tem limite próprio (50MB vendas / 10MB gerencial)" | Não existe mais `/api/admin/upload-vendas`; Vendas é Server Action desde a v4.15.0 | `actions.ts:109`; grep sem resultado para a rota |
| Investigação v5.5.2 §7: base "Lançamentos por Operação" está morta | Viva e funcional | `0192_drop_bases_antigas_fluxo.sql:17-18`; 41.282 linhas no catálogo |
| Skill §5: RPCs do caminho antigo permanecem só porque o seed as usa | Confirmado — `truncate_dynamic_tables` e `inserir_lote_raw` seguem no catálogo, usadas por `supabase/seed/seed.ts` | catálogo de funções |

Observação de fronteira (fora do recorte, medida no caminho): `modal-confirmacao-upload.tsx` usa cores
hardcoded (`bg-white`, `text-zinc-900`, `border-zinc-200`) em vez de tokens do design system.

---

## 13. Revalidação das 14 afirmações

**Placar: 2 confirmadas · 9 parciais · 3 refutadas.**

| # | Afirmação (resumida) | Veredito | Evidência e formulação correta |
|---|---|---|---|
| 1 | Lê o valor nativo quando a célula é numérica, e cai para o texto como reserva | **PARCIAL** | O valor nativo é lido — sim, em todos. Mas "cai para o texto como reserva" descreve **um único parser**: só `gerencial/parser.ts:166-173` faz leitura dupla com fallback. Nos outros 10 há **uma leitura só** (`raw` omitido ou `true`), e não existe reserva porque não é preciso haver. Correto: *"o valor nativo é a única leitura; o padrão de nativo-com-reserva-textual existe apenas no parser do Gerencial, que precisa da string para os campos de texto"*. |
| 2 | Existe opção que aplica heurística de locale e corrompe vírgula decimal; está desligada de propósito, com razão escrita | **CONFIRMA** | Medido nesta sessão: `sheet_to_json({raw:false})` devolve `"-40.93"` e a data `"3/7/25"`; no ramo CSV `read({raw:false})` transforma `-40,933` em **−40933** e lê `07/03/2025` como 3 de julho. O valor seguro é `raw:true` (ou omitir), e está assim em 9/9 ramos CSV, com razão escrita no código (`parse-vendas-produto.ts:26-28`) e na investigação de 2026-08-10. Ajuste de vocabulário: a opção segura é **ligada** (`true`), não desligada. |
| 3 | Cabeçalho casa por normalização e interseção, nunca por mapa literal nem posição | **REFUTA** | **Todos** partem de mapa literal. Quatro estratégias convivem: mapa + `normalizeHeader` (7 parsers); mapa **exato sem normalização** (`parse-lancamentos.ts:39-61`); `findCol` sem remover acento (`gerencial/parser.ts:132-134`); **`indexOf` por nome exato** (`rateio/parse-fatura.ts:45-46`). Correto: *"mapa literal, com normalização em 7 dos 11; não há casamento por interseção de sinônimos, e um parser casa por posição"*. |
| 4 | Colunas obrigatórias validadas por presença, com mensagem que nomeia a faltante | **PARCIAL** | Verdade em 7 parsers pelo helper comum, mensagem `"Sua planilha precisa conter as colunas: X, Y."` (`colunas-obrigatorias.ts:29-31`), e em 2 por checagem manual que também nomeia. **Falso para Vendas**, que não tem coluna obrigatória alguma (`page.tsx:106`) — a maior base é a desprotegida. |
| 5 | Gravação é substituição total, com aviso explícito antes de confirmar | **PARCIAL** | Verdade para as 6 bases de `/admin/uploads`: aviso no card (*"Substitui toda a base…"*) e modal (*"vai APAGAR os N registros… não pode ser desfeita"*). **Falso para 2 de 8**: Gerencial é diff incremental por fatia (aviso próprio e diferente) e Clientes Corp substitui só `origem='planilha'` **sem aviso nenhum antes**. |
| 6 | Existe conferência de contagem e de soma entre arquivo e gravado, exibida na carga | **PARCIAL** | Existe em **1 de 8** bases: `actions.ts:516-540`, comparando contagem e soma em centavos inteiros. As outras sete não têm. E é *post-hoc*: bloqueia a declaração de sucesso, não a gravação — a própria mensagem diz "A base ficou com o conteúdo enviado". |
| 7 | A pré-visualização mostra contagem e soma, não apenas amostra de linhas | **REFUTA** | O preview das 6 bases mostra **só duas contagens**, nunca soma e nunca amostra (`modal-confirmacao-upload.tsx:31-37`). O preview mais rico (Gerencial) mostra **exatamente o contrário**: as linhas, em 4 baldes, sem soma. Nenhuma tela mostra "contagem e soma" como preview. |
| 8 | Há base que precisa ser carregada antes de outra, e a ordem está escrita na tela | **PARCIAL** | O **acoplamento existe** e é maior do que "ordem": `regenerar_fluxo_caixa` reconstrói `financeiro.fato_fluxo` a partir de Movimentação **e** Títulos, e roda no finalizar de qualquer uma — subir uma regenera o fato com a outra no estado em que estiver. Mas **a ordem não está escrita em lugar nenhum**: nem na tela, nem no código, nem em documento. Nenhum incidente por ordem invertida registrado. |
| 9 | Já houve defeito real por heurística de locale, com efeito de sinal ou ordem de grandeza, que sobreviveu à suíte | **CONFIRMA** | v5.5.2: `raw:false` → `"-40.933"` lido como −40933 (×1000), **invertendo o sinal do Resultado do Exercício de 2024 e 2025**; 33 linhas confirmadas (R$ 7,52 Mi), até 1.073 indeterminadas; **753 testes verdes** não o pegaram porque testavam a matriz, não o arquivo. |
| 10 | A suíte tem ao menos um caso que parte do arquivo (bytes) | **CONFIRMA**, com ressalva | Cinco arquivos de teste entram por `parseXxxFile` com workbook serializado (`parse-fluxo-caixa-valor-nativo.test.ts:36-41` e outros). Ressalvas: **nenhum fixture real versionado** (todo workbook é montado em memória, nunca um export do ERP), e **a maior base não tem teste de arquivo** — `parseVendasProdutoFile` não é chamada por teste algum. |
| 11 | As tabelas de destino não estão sob o diário de alterações | **PARCIAL** | Verdade para **7 de 8**: `pg_trigger` não devolve gatilho algum em `raw.vendas_excel`, `raw.pessoas`, `raw.lancamentos_movimentacao`, `raw.titulos_em_aberto`, `raw.demonstrativo_competencia`, `analytics.fato_lancamento_operacao`, `financeiro.fato_fluxo`, `app.cliente_corporativo`. **Falso para `analytics.gerencial_lancamentos`**, que tem `trg_diario_gerencial_lancamentos` + broadcast + RPCs de desfazer lote. Razão escrita do escopo: ADR-0155 limita o diário a **tabelas editáveis** linha a linha. |
| 12 | Recarregar o mesmo arquivo produz exatamente o mesmo estado | **PARCIAL** | Verdade para as **linhas** das bases full-swap (`RESTART IDENTITY`). Falso para o estado completo: (a) `carregado_em`/`criado_em` mudam; (b) `regenerar_fluxo_caixa` faz auto-sync **aditivo** de `dim_conta_bancaria` e `dim_categoria` e **nunca remove** — conta que saiu do arquivo permanece na dimensão; (c) `app.cliente_corporativo.criado_em` é resetado a cada reimportação. Gerencial é o único idempotente por construção (diff vazio). |
| 13 | A tela que consome a base declara quando foi carregada e qual período cobre | **PARCIAL** | Verdade para **uma** base: a DRE mostra *"Competência · Última atualização em …"* (`dre/page.tsx:369-370`), e a cobertura temporal existe só para ela. A varredura de `src/app` + `src/components` não achou nenhuma outra tela de consumo declarando safra. |
| 14 | Existe limite de tamanho de arquivo, aplicado antes de qualquer trabalho caro | **PARCIAL** | Onde existe, é aplicado antes do parse (`route.ts:74` antes de `arrayBuffer()`; `route.ts:30` antes de `carregarLancamentos`). Mas **não existe nas 6 bases de `/admin/uploads` nem no Cadastro de Clientes Corp** — justamente as telas que substituem bases inteiras. O `bodySizeLimit: '25mb'` limita o **lote**, não o arquivo. |

---

## Reconstruível

Com este documento e sem acesso ao repositório, dá para reconstruir:

- O contrato de leitura de célula: biblioteca, opções seguras por ramo (binário × texto), e **por quê**
   — com a medição que prova cada corrupção.
- As regras de coerção: `toNum` (BR/US, parênteses, `R$`), `toIsoDate` (nativo local, serial 0, dia 00),
  `toCentavos` (meio-para-longe-de-zero sobre a representação decimal) e o motivo de não usar
  `Math.round(v*100)`.
- O fluxo de tela: status → seleção → parse no Worker → modal com duas contagens → lotes → finalizar.
- Os dois pipelines de gravação: staging + swap atômico com advisory lock (Vendas) e truncate + insert
  em transações separadas (as outras quatro), com a janela de inconsistência de cada um.
- O alarme de fechamento: onde medir a soma, em que unidade, e o que fazer ao divergir.
- O modelo de permissão em 2 ou 3 camadas, e onde cada uma mora.
- A política de teste que dá valor ao verde: entrar pelo arquivo, não pela matriz.

## Faltando

Perguntas que este levantamento não conseguiu responder, na forma exata em que precisam ser feitas:

1. **Alguma materialized view depende de `analytics.fato_lancamento_operacao`?** Se sim, a carga dessa
   base a deixa stale, porque `refresh_all_materialized_views()` não é chamado nesse fluxo (só no de
   Vendas). Exige mapear as MVs contra a tabela.
2. **Qual o volume máximo real de arquivo que já passou por `/admin/uploads`?** Sem log de carga e sem
   limite de tamanho, não há como saber onde o Worker começa a falhar — e portanto qual teto seria
   honesto.
3. **A rota `/api/admin/upload-lancamentos` deve ser removida ou consertada?** É órfã, mas promete
   `.xlsx` e entrega só CSV. Decisão de produto, não técnica. (Há uma branch não-mergeada de nome
   próximo — `fix/upload-lancamentos-vercel-limit`, citada em `docs/WORKING-CONTEXT.md:136` — a
   conferir antes de tocar.)
4. **Quantas linhas o parser descarta em silêncio numa carga real?** As bases 2–4 descartam linha sem
   chave sem contar nem avisar. Não há instrumentação para responder sem reprocessar um arquivo real.
5. **Vendas deveria exigir colunas obrigatórias?** Hoje não exige nenhuma, e isso é deliberado
   ("parser tolerante"). Saber se a tolerância ainda vale a pena é decisão de produto.

## Decisões embutidas

Tensões que foram resolvidas de um jeito e não de outro. Cada uma compra algo e custa algo — e quem
replicar precisa decidir de novo, não herdar por inércia.

| Decisão | Compra | Custa |
|---|---|---|
| **Parsear no cliente e enviar só linhas** (5 de 6 bases) | Servidor não precisa da biblioteca de planilha; sem o problema de runtime do RSC; a UI não trava (Worker) | O limite de tamanho some (não há um `File` no servidor para medir); a soma do cliente vira parte do contrato de correção |
| **Ler o valor nativo da célula, nunca a string de exibição** | Elimina a ambiguidade de locale na origem — o Excel já a resolveu | Célula genuinamente textual precisa de caminho próprio; a opção certa é invisível e um `raw:false` inocente reintroduz o defeito |
| **Um único módulo de coerção, com lint que bloqueia reimplementação** | Uma regra, um oráculo, uma correção | O lint só vê nomes numéricos: `toIsoDate` duplicado em `vendas-parser.ts` passou |
| **Staging + swap atômico só em 2 das 6 bases** | Custo de implementação menor nas outras quatro | Nelas, falha no meio deixa a base truncada/parcial — sem preservação e sem desfazer |
| **Substituição total como padrão** | Modelo mental simples: a verdade é o último arquivo; recarregar conserta | Nenhum histórico; nada a auditar; a correção de um erro exige ter o arquivo |
| **Diário de alterações só em tabelas editáveis** (ADR-0155) | Evita inflar a auditoria com carga em massa, que é reversível re-subindo | Uma carga errada não deixa rastro de quem a fez |
| **Alarme de fechamento em uma base só** | A base cujo número vira DRE é conferida ao centavo | As outras sete carregam sem prova de que o que entrou é o que ficou |
| **Preview por contagem, não por amostra** | Modal uniforme, barato, serve às 6 bases | Não pega base trocada nem coluna deslocada — só ordem de grandeza |
| **Vendas tolerante, sem coluna obrigatória** | Export do ERP muda de grafia sem derrubar a ingestão | Arquivo da base errada é aceito como sucesso com campos nulos |
| **Gerencial incremental por fatia** | Dois usuários importam sem se atropelar; há desfazer | Segundo mecanismo inteiro para manter — e é o que mais diverge do resto |
