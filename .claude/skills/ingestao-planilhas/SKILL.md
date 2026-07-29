---
name: ingestao-planilhas
description: Ingestão de planilhas/Excel no Janus — upload via API Route (nunca Server Action), parse no cliente em Web Worker, leitura de datas pelo Date nativo da célula (cellDates/raw: true), coerção canônica única em @/lib/carga/coercao.ts (toNum/toIsoDate — o lint wt/no-coercao-reimpl bloqueia reimplementação), parser único de Vendas e pipeline atômico de carga. Use ao mexer em upload, parser, importação, ou coerção de número/data vindos de arquivo ou input do usuário.
---

# Ingestão de planilhas (Janus)

Esta skill cobre o caminho completo de um arquivo Excel/CSV entrando no Janus: onde o
parse roda, como uma célula vira número/data sem perder precisão, e como a carga chega
ao banco sem corromper a base em caso de erro. As quatro áreas (upload, parse, coerção,
pipeline) formam uma cadeia — um erro em qualquer uma delas costuma parecer um bug de
"dado errado" em produção, não um erro de build, porque nada aqui é pego por `tsc`/lint
sozinho (exceto a coerção, que tem lint dedicado — ver abaixo).

## 1. Upload/parse de arquivo → API Route, nunca Server Action

Bibliotecas de parse de planilha (`@e965/xlsx`) falham quando rodam dentro do contexto
de React Server Components — o runtime de Server Action não é Node puro o bastante para
elas. A regra é: qualquer rota que receba e processe um arquivo de upload é uma **API
Route** (`export const runtime = 'nodejs'`), nunca uma Server Action.

Isso isola o parse do contexto RSC e garante um runtime Node completo. Foi descoberto na
v4.7 (PEND-001) quando uma Server Action de upload quebrava silenciosamente. Ao criar uma
rota de upload nova, comece por uma API Route — não tente Server Action "para simplificar"
e migrar depois se falhar.

## 2. Parse pesado no cliente → Web Worker, nunca a main thread

Quando o parse acontece no navegador (ex.: `/admin/uploads`, que parseia client-side antes
de enviar ao servidor), `XLSX.read` + `sheet_to_json` + o parser da base (~45 mil linhas)
são síncronos e pesados. Rodar isso na main thread **trava a aba inteira** — a página
"não responde" e até o spinner de carregamento congela, porque o spinner também é DOM/JS
na mesma thread bloqueada.

A saída é rodar o parse num Web Worker: `src/lib/carga/parse.worker.ts` reaproveita os
parsers isomórficos existentes (um por base) e é chamado via `parseArquivoEmWorker()`
(`src/lib/carga/parse-em-worker.ts`), que tem **fallback para a main thread** se o worker
não carregar (ex.: ambiente sem suporte). Ao instanciar o worker, a sintaxe que builda
certo no Next 16/Turbopack é:

```ts
new Worker(new URL('./parse.worker.ts', import.meta.url), { type: 'module' })
```

Upload novo com volume relevante (milhares de linhas) nasce usando
`parseArquivoEmWorker`, não chamando o parser direto no componente. Custou caro: a
travada foi reportada por usuário real no upload de Vendas (v4.20.2) antes de virar
regra — o parse funcionava perfeitamente em dev com arquivos pequenos e só quebrou com
volume de produção.

## 3. Datas de planilha: ler o `Date` nativo da célula, nunca a string formatada

Ao ler datas de uma célula Excel, use:

```ts
XLSX.read(buffer, { cellDates: true });
XLSX.utils.sheet_to_json(sheet, { raw: true });
```

`cellDates: true` faz a lib devolver um `Date` JS nativo para células de data. `raw: true`
preserva esse valor nativo em vez de reformatá-lo para a string de exibição da célula
(que costuma vir em formato americano `mm-dd-yy` na origem).

O motivo de nunca confiar em heurística de string (`DD/MM` vs `MM/DD`) é que ela **erra
silenciosamente**: quando ambos os componentes são ≤ 12 (ex.: `03/07`), qualquer
suposição de ordem "acerta por acaso" em boa parte dos casos e só se revela errada nas
datas em que dia e mês divergem visivelmente — momento em que já pode haver meses de
dado importado com data invertida. O `Date` nativo da célula é inequívoco porque o Excel
já resolveu a ambiguidade internamente; delegue a ele. Heurística de string só entra como
fallback para células que cheguem genuinamente como texto (não como data formatada).

Custou caro: a importação da base Gerencial inverteu dia/mês (ADR-0099, v4.9) e o bug
ficou mascarado por semanas porque a maioria dos dias no mês é > 12 e acertava por
coincidência — só uma auditoria de dados achou a inconsistência.

## 4. Coerção de célula: UM módulo só, e o lint segura isso

Todo valor de célula (número, data, string) vindo de upload — ou de qualquer input do
usuário que precise virar número — passa por `@/lib/carga/coercao.ts`:
`toNum(value)`, `toIsoDate(value)`, `toStr(value)`.

**Por que não escrever um `toNum` local:** a versão ingênua
(`Number(String(v).replace(',', '.'))`) devolve `NaN`/`null` para número BR com
separador de milhar — `8.840,00` ou `1.234,56` — porque o `.` de milhar não é removido,
só o `,` decimal é trocado. Isso é **perda silenciosa de dado**, da mesma classe do bug
de saldo da v4.23.1 (ver `docs/` ou o out-briefing daquela versão).

O `toNum` canônico:
- Desambigua ponto de milhar (grupos de 3 dígitos) vs. ponto decimal americano
  (≤ 2 dígitos à direita).
- Trata prefixo `R$` e espaços.
- Converte **negativo entre parênteses** — convenção contábil `(1.000)` → `-1000`
  (v4.27, vale para a plataforma inteira; essa regra só passou a valer para entradas
  `(x)`, que antes davam `null`).

O `toIsoDate` canônico lê o `Date` nativo sem deslocamento de fuso, aceita
`DD/MM/YYYY` sem inverter a ordem, e rejeita o serial `0` do Excel (que representa
"nenhuma data", não uma data real). Não repita essa lógica de fuso aqui — a exibição de
timestamptz (fuso de São Paulo) é assunto da skill `ui-design-system`; esta skill cobre
só a leitura/coerção do valor cru vindo da planilha.

**O lint `wt/no-coercao-reimpl` (AST, v4.27/ADR-0130) bloqueia reimplementação fora
deste arquivo.** Ele pega:
- `parseFloat` fora de `coercao.ts`.
- `.replace` de separador decimal/milhar quando o resultado alimenta `Number`/`parseFloat`
  ou uma função tipada `: number` (a direção "texto → número"). O guard isenta a direção
  inversa — sanitizador de `<input>` e `.toFixed().replace(...)` para exibição, que vão de
  número para string.
- Definir função/const com **nome de coerção** — regex
  `/^(to|para|parse).*(num|valor|money|reais|float|decimal)/i` — fora dos arquivos
  isentos (`coercao.ts`, `**/*.test.ts`, `src/lib/email/**`).

Se a coerção existente não cobre um caso novo, a saída é **estender** `toNum`/`toIsoDate`
dentro de `coercao.ts`, nunca criar um segundo parser em outro arquivo. Ao estender,
prove que os casos atuais continuam corretos — `coercao.test.ts` precisa passar sem
alteração (é o "oráculo congelado": a suíte que já existe é a prova de que a extensão não
regrediu nada que já funcionava). Há também `coercao-lint.sonda.test.ts`, uma sonda que
verifica que o próprio lint continua pegando os padrões proibidos.

**Caso especial em Vendas:** `valor_total` e `receitas` viajam como **string numérica**
(`const n = toNum(v); n === null ? null : String(n)`), não como `number`, porque o
staging do banco faz `::numeric` na chegada. Não "corrija" isso para `number` achando que
está mais correto — o cast fica no SQL, de propósito.

## 5. Parser único de Vendas + pipeline atômico de carga

A ingestão de Vendas tem **um parser só**: `@/lib/carga/vendas-parser.ts` — isomórfico
(sem `'use client'`), reaproveitado tanto no worker do cliente quanto em qualquer outro
caminho que precise ler a planilha. Não crie um segundo parser "mais simples" para um
caminho novo: dois parsers divergentes já regrediram silenciosamente a plataforma nos
tempos da v4.9.x (o caminho via servidor não populava a coluna `operacao_propria`, e o
bug só apareceu quando alguém comparou os dois caminhos). Paridade de colunas é garantida
pelo parser único **e** reforçada pelo lado SQL do staging (migration 0118).

A carga em si segue um **pipeline atômico** (ADR-0111, v4.15.0):

```
limpar_staging_vendas → inserir_lote_staging → validar_carga_staging → promover_carga_vendas
```

Essas RPCs rodam via `getAdminClient` (service role, sem o timeout de 3s do `anon`) e o
swap para a tabela final acontece numa transação — se qualquer etapa falhar, o `ROLLBACK`
preserva a base como estava antes da carga. Antes disso, uma carga com erro podia deixar
a tabela de vendas vazia em produção; o pipeline atômico fechou esse buraco. O detalhe das
RPCs do pipeline (assinatura, orçamento de tempo, RBAC) é da skill `banco-e-rpc` — aqui
importa saber que o caminho existe e que ele é o único vivo.

RPCs do caminho destrutivo antigo (`truncate_dynamic_tables`, `inserir_lote_raw`)
**permanecem no banco só porque `npm run seed` ainda as usa** — não são consumidor de
nenhuma request viva da aplicação. Não as trate como órfãs/candidatas a `DROP` sem
conferir o `seed` primeiro (precedente: a v4.17.1 quase as removeu por engano). A trinca
de recuperação (`transform_raw_to_analytics` → `regenerar_dim_operacao_weddings` →
`refresh_all_materialized_views`) segue intacta e serve para recompor as tabelas
analíticas sem precisar re-subir o arquivo original.

## 6. Sintoma cruzado: `dim_data` com range fixo

Se uma carga de Vendas abortar com um erro de foreign key em `fato_venda_data_venda_fkey`,
a causa não está no parser nem na coerção — é que `dim_data` tem um range de datas fixo
no banco, e a planilha trouxe uma data fora dele. O procedimento de correção (estender
`dim_data`, recuperar sem re-upload) é detalhado na skill `banco-e-rpc`; aqui basta saber
reconhecer o sintoma: erro de FK ligado a data, não a formato de célula.

## Ver também

- **`banco-e-rpc`** — RPCs do pipeline de carga (assinatura, RBAC, orçamento de tempo),
  o range fixo de `dim_data` e a recuperação sem re-upload, e o schema de staging.
- **`ui-design-system`** — como exibir a data já coerida (`fmtDataSP`/`Intl`, nunca split
  de string); esta skill cobre só a leitura do valor cru vindo da planilha.
