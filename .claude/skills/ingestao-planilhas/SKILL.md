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

## 3. Célula de planilha: ler o valor NATIVO — vale para data E para dinheiro

Ao ler qualquer célula tipada de um Excel, use:

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

### O mesmo vale para DINHEIRO — e custou mais caro ainda (v5.5.2)

A regra acima nasceu para datas, mas o argumento é idêntico para número: reformatar para
texto **reintroduz uma ambiguidade que o Excel já tinha resolvido**. A célula numérica
`-40.933` (R$ 40,93, ponto decimal) vira a string `"-40.933"`, que casa o padrão de milhar
BR do `toNum` (`^-?\d{1,3}(\.\d{3})+$`) e é lida como **−40933** — ×1000 silencioso.

O gatilho é **exatamente 3 casas decimais** com 1–3 dígitos inteiros; com 4 casas
(`-30.4322`) ou 4+ dígitos inteiros (`1234.567`) o padrão não casa e o valor sempre passou.
Por isso o defeito é esparso e plausível, nunca visível em massa. Três casas nascem de
**divisão de título** (parcelamento, rateio, câmbio): `377,23 ÷ 2 = 188,615`.

Os dois parsers do Fluxo/DRE pediam `raw: false` **explicitamente** ao `sheet_to_json` e
ficaram anos assim; os demais omitem a opção e o default do SheetJS (`raw: true`) já os
protegia. **O modo seguro é não escrever a opção.**

### CSV é uma SEGUNDA porta para o mesmo estrago, e maior

`XLSX.read(texto, { type: 'string', raw: false })` faz o SheetJS rodar um heurístico
**americano** sobre o texto **antes** de qualquer coerção nossa. Isso não atinge só valores de
3 casas — destrói **todo** valor BR com vírgula decimal: `"40,93"` → **4093**, `"0,05"` → **5**,
`"-26,39"` → **−2639**, `"-1.234,56"` → **−1,23456**.

**No ramo CSV use sempre `read(..., { raw: true })`**, para a string sobreviver e a regra BR do
`toNum` valer — inclusive para datas, onde a leitura americana do SheetJS é justamente a
armadilha da ADR-0099. Estava vivo em **oito** parsers na v5.5.2, três em bases financeiras que
aceitam `.csv` pela UI (Vendas, Rateio, Faturamento Corp).

Ali a ambiguidade de `"-40.933"` é irredutível: sem tipo, não há o que consultar.

**A sonda mecânica** (`parse-fluxo-caixa-valor-nativo.test.ts`) vigia as duas portas em
`src/lib/carga/`, `src/lib/rateio/`, `src/lib/faturamento/` e `src/lib/gerencial/`. Ela extrai
os argumentos por **parênteses balanceados** e aceita parâmetro de tipo — a 1ª versão usava
janela de caracteres e não casava `sheet_to_json<unknown[]>(...)`, ficando cega justamente para
os arquivos que devia vigiar.

**Leitura dupla não é imunidade — vale só para a coluna que a usa.** O `gerencial/parser.ts`
fazia leitura dupla desde a v4.9 e por isso foi tratado como seguro; mas a versão nativa
alimentava **só `Vencimento`**, e `Valor Final` seguia pela string de exibição, com o mesmo
risco. Corrigido na v5.5.2. Ao citar leitura dupla como proteção, diga **de qual coluna**.

**Um teste de parser que monta a matriz na mão NÃO cobre isto.** O defeito mora na
extração (a opção do `sheet_to_json`), então toda prova que chama `parseXxxRows(matriz)`
passa por cima dele — foi o que aconteceu com 753 testes verdes. Guard de ingestão precisa
montar um arquivo de verdade e entrar por `parseXxxFile()`.

Custou caríssimo: distorceu a DRE e o Fluxo a ponto de **inverter o sinal do resultado de
2024 e de 2025**, e a auditoria de paridade da v5.3.0 chegou a carimbar o delta como
"re-lançamento retroativo no Monde". Investigação completa em
`docs/investigacoes/2026-08-10-coercao-milhar-dre-fluxo.md`.

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

---

## 7. O caminho de VOLTA: exportar CSV que abre certo no Excel pt-BR

O espelho da ingestão. "Abre no Excel" e "abre **certo** no Excel pt-BR" são coisas diferentes, e
a diferença são quatro detalhes — nenhum deles aparece em gate nenhum, só na planilha de quem
recebeu o arquivo. Receita canônica em `src/lib/patrimonio/csv.ts` (v5.6.0):

1. **BOM UTF-8** (`'﻿'`) no início. Sem ele o Excel do Windows lê como ANSI e "Informática"
   chega "InformÃ¡tica".
2. **Separador `;`**, não vírgula — é o separador de listas do Excel pt-BR.
3. **Decimal com VÍRGULA** (`v.toFixed(2).replace('.', ',')`). Com ponto, o Excel pt-BR entra o
   valor como **texto** (ou pior: `4321.99` virando `432199`).
4. **CRLF** (`\r\n`) no fim da linha.

E duas regras de conteúdo:

- **Célula de TEXTO que começa com `=`, `+`, `@` ou tab é FÓRMULA para o Excel.** Descrição e
  observação são digitadas pelo usuário: `=cmd|...` num CSV é execução remota clássica. Prefixar
  com apóstrofo desarma sem mudar o que se lê na célula. **Não aplicar a número** — o `-` de um
  negativo legítimo passa pela célula numérica.
- **Valor ausente sai VAZIO, nunca `0`.** "Não sei quanto custou" e "custou zero" são fatos
  diferentes, e a diferença tem de sobreviver à planilha (o mesmo cuidado que a coerção de
  entrada tem com célula vazia, na seção 4).

Escapar com aspas quando a célula contém `;`, `"` ou quebra de linha (aspas internas dobradas) —
uma descrição com ponto e vírgula, sem isso, **parte a linha numa coluna extra** e desalinha a
planilha inteira. O teste que pega isso compara a **contagem de campos** do cabeçalho com a da
linha, não o texto.

Manter o gerador **puro** (sem DOM) e isolar o download (`Blob` + `<a download>` + `revokeObjectURL`)
numa função separada: é o que permite testar o arquivo caractere a caractere em ambiente `node`.

## Ver também

- **`banco-e-rpc`** — RPCs do pipeline de carga (assinatura, RBAC, orçamento de tempo),
  o range fixo de `dim_data` e a recuperação sem re-upload, e o schema de staging.
- **`ui-design-system`** — como exibir a data já coerida (`fmtDataSP`/`Intl`, nunca split
  de string); esta skill cobre só a leitura do valor cru vindo da planilha.
