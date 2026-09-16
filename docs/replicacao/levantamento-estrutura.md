# Levantamento as-built — Estrutura configurável com editor auditado

**Data:** 2026-09-16 · **Commit de referência:** `59a986a` (merge do PR #274, pós-merge v5.11.0)
**Regime:** só-leitura. Nenhum objeto foi criado, alterado ou removido. A conexão ao banco de
produção foi aberta com `SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY` (confirmado:
`SHOW transaction_read_only` → `on`) e os corpos vivos foram lidos por `pg_get_functiondef` /
`pg_get_viewdef`.

**Vocabulário.** Este documento descreve a mecânica em termos genéricos e usa os nomes reais só
nas evidências:

| Genérico | Nome real (família Caixa) | Nome real (família Competência) |
|---|---|---|
| **nó** | linha de `financeiro.dre_bloco` | linha de `financeiro.dre_comp_bloco` |
| **nó-fórmula** (agregador) | `formula IS NOT NULL` | `formula IS NOT NULL` |
| **nó-folha** (recebe origem) | `formula IS NULL` | `formula IS NULL` |
| **chave** do nó | `chave` (`'ENT_H'`, `'ROL'`…) | `chave` |
| **termo de origem** | `dim_categoria.id` (inteiro) | par de texto `(grupo, descrição)` do arquivo |
| **mapeamento** origem→destino | `financeiro.dre_categoria_map` | `financeiro.dre_comp_par` |
| **destino** | `bloco_chave` | `sub_chave` |
| **linha exibida** | uma por termo mapeado | uma por `(destino, rótulo)` — pode fundir 2 termos |
| **bandeja** | termo sem linha no mapeamento | linha com destino nulo |
| **exclusão lógica** | `excluida` | `excluida` |
| **diário** | `financeiro.diario_alteracoes` + `reverter_diario` | idem (mesma infraestrutura) |

**O que NÃO foi coberto, e por quê**

1. **O significado contábil de qualquer linha** — fora do recorte por decisão do prompt.
2. **A ingestão das bases** (`financeiro.fato_fluxo`, `raw.demonstrativo_competencia`) — fora do
   recorte; entra só como "a origem dos termos".
3. **O mecanismo genérico do diário** (`fn_diario_alteracoes`, `reverter_diario`, migrations
   0199/0206/0268) — já levantado antes; aqui entra só a integração.
4. **Exercício do editor em navegador** — o levantamento é estático (código + catálogo). Nenhuma
   afirmação deste documento depende de ter clicado na tela; onde o comportamento de tela importa,
   a evidência é o `diario_alteracoes` de produção, que registra o que o editor de fato gravou.
5. **Telas de relatório além do que depende da estrutura** — a tabela densa, o Resumo Executivo e
   as cascatas entram só onde consomem a estrutura.

---

## 1. O modelo da árvore

### 1.1 As tabelas

Quatro tabelas vivas (mais uma órfã). Todas em `financeiro`, todas com RLS habilitada e
`REVOKE ALL … FROM PUBLIC, anon, authenticated` — **nenhum papel da aplicação toca a tabela
diretamente**; todo acesso passa por RPC `SECURITY DEFINER`.

**Nós — família Caixa** (`financeiro.dre_bloco`, `supabase/migrations/0204_dre_estrutura_viva.sql:20-30`):

| coluna | tipo | nulo? | padrão | papel |
|---|---|---|---|---|
| `id` | bigint | não | sequence | PK exigida pelo trigger genérico do diário |
| `chave` | text | não | — | **identidade estável**, UNIQUE, âncora das fórmulas |
| `rotulo` | text | não | — | texto exibido |
| `tipo` | text | não | — | `CHECK (tipo IN ('blocoH','sub','tot'))` — **apresentação** |
| `ordem` | int | não | — | posição na renderização |
| `formula` | jsonb | **sim** | — | array de chaves; `NULL` = folha |
| `nota_estrela` | boolean | não | `false` | marcação de exibição |
| `atualizado_em` | timestamptz | não | `now()` | insumo do token da trava |

**Nós — família Competência** (`financeiro.dre_comp_bloco`, `0256_dre_competencia_estrutura.sql:53-61`):
a mesma forma **menos `nota_estrela`** — a coluna não existe (conferido no catálogo vivo), e a RPC
de leitura emite `'nota_estrela', false` fixo (`0260:202`).

**Mapeamento — família Caixa** (`financeiro.dre_categoria_map`, `0204:36-50`):

| coluna | tipo | nulo? | papel |
|---|---|---|---|
| `id` | bigint | não | PK do diário |
| `categoria_id` | int | não | **chave simples**, UNIQUE, FK → `financeiro.dim_categoria(id)` |
| `bloco_chave` | text | **sim** | destino, FK → `dre_bloco(chave)` |
| `ordem` | int | não | ordem **dentro** do destino |
| `nota_estrela` | boolean | não | marcação |
| `excluida` | boolean | não | exclusão lógica |
| `rotulo` | text | **sim** | override de exibição; `NULL` = usa o nome da origem |
| `atualizado_em` | timestamptz | não | insumo do token |

**Mapeamento — família Competência** (`financeiro.dre_comp_par`, `0260_dre_comp_estrutura_editavel.sql:48-64`):
`(grupo_arquivo, descricao_arquivo)` **compostos e UNIQUE**, `sub_chave` anulável (FK → `dre_comp_bloco`),
`rotulo_linha` **NOT NULL** (não é override: é o rótulo, sempre), `ordem`, `nota_estrela`,
`excluida`, `atualizado_em`.

**Índices vivos:** `dre_categoria_map (bloco_chave, ordem)` (`0204:52`), `dre_comp_bloco (ordem)`
(`0256:63`), `dre_comp_par (sub_chave)` (`0260:66`), mais os UNIQUE/PK.

**A tabela órfã.** `financeiro.dre_comp_map` (`0256:65-82`) ainda existe com 141 linhas, mas
**nada a lê desde a 0260** — a view e as RPCs repontaram para `dre_comp_par`. Não foi removida
porque `DROP` é destrutivo e exige humano em TTY (`0260:36-39`); a 0270 (limpeza de órfãos da
v5.10.0) não a tocou. Ela **não tem trigger de diário** — é o único artefato de estrutura fora do
regime de auditoria.

### 1.2 Os tipos de nó — dois eixos ortogonais, e é isso que confunde

Há **duas classificações independentes**, e o modelo trata as duas como coisas diferentes:

- **Eixo de apresentação** — `tipo ∈ {blocoH, sub, tot}`: cabeçalho de grupo, subgrupo,
  totalizador. Governa banda, peso e cor na tabela. **Não entra em cálculo nenhum**
  (`0254:28-30`: "`tipo` e `ordem` não entram no cálculo de `get_dre_mensal`").
- **Eixo aritmético** — `formula IS NULL` ou não: **folha** (soma os termos de origem mapeados
  nela) ou **nó-fórmula** (combinação signada de outras chaves). É o único eixo que o motor lê.

A prova de que são ortogonais é `IMP_H` na família Competência: `tipo='blocoH'` (cabeçalho) com
`formula NULL` (folha) e 4 termos de origem mapeados diretamente nele — "cabeçalho na apresentação
e FOLHA na aritmética", deliberado (`0256:40-46`). Na família Caixa, `ENT_H`, `PAG_H` e `IMP_H` têm
a mesma natureza híbrida (catálogo vivo: `formula = null`, 2 / 1 / 4 folhas respectivamente).

A distinção que o **motor** enxerga é, portanto, binária: **folha × fórmula**. A tripla
`blocoH/sub/tot` é vocabulário de tela.

### 1.3 Como a hierarquia é representada

**Não há coluna de pai.** A hierarquia existe em duas representações que não se falam:

1. **Aritmética** — o grafo das fórmulas, ancorado por **chave**, nunca por posição
   (`0204:22`: "id ESTÁVEL do bloco … âncora das fórmulas"; ADR-0156). Um nó-fórmula lista as
   chaves que consome. Não existe `pai_id`.
2. **Visual** — a `ordem` linear. O que faz um subgrupo "parecer" estar dentro de um cabeçalho é
   apenas ele vir depois, com `tipo` diferente. Nada no banco amarra um ao outro.

**As duas podem divergir, e divergem.** Na família Caixa, o cabeçalho `DESP_H` (ordem 100) tem
fórmula `["ADM","COM","FIN","MKT","ESTR","RH","RHB"]`, mas o totalizador `LOP` (ordem 200)
**não consome `DESP_H`** — ele re-enumera os mesmos sete subgrupos mais `LB`
(`["LB","ADM","COM","FIN","MKT","ESTR","RH","RHB"]`, catálogo vivo). O mesmo padrão em
`ROL = [REPASSE, RV, IMP_H]` (e não `[RB_H, IMP_H]`), `LL = [LOP, RNOP, DNOP]` (e não
`[LOP, ONOP_H]`) e `RAIR = [LL, INV, IMOB]` (e não `[LL, INV_H]`). Ou seja: na família Caixa os
cabeçalhos agregadores são **linhas de exibição paralelas**, não caminho de cálculo — e a migration
0251 precisou alterar `DESP_H` e `LOP` **juntas** exatamente por isso (`0251:82-92`: "as DUAS listas
mudam JUNTAS … Remover RFIN e IMOB de uma só faria o cabeçalho de despesas contradizer o próprio
totalizador").

Na família Competência a decisão é a oposta: `ROL = [RB_H, IMP_H]` e `LOP = [LB, DESP_H]` —
o totalizador **consome** o cabeçalho. Consequência mecânica: em Competência um nó-fórmula
referencia chaves de `ordem` **maior** (`RB_H@10` consome `RV@20`), o que quebra qualquer avaliação
em passe único por ordem. Isso é o que forçou o motor recursivo (§2.3).

### 1.4 Ordem: como é mantida, o que a recalcula, o que acontece com empate

- **Ordem de nó** (`dre_bloco.ordem` / `dre_comp_bloco.ordem`): valores esparsos de 10 em 10, semeados
  por migration, **jamais alterados pela aplicação**. Só migration mexe (0251 moveu `FIN`→190 e
  `IMOB`→265; 0254 moveu `RV`→40 e `RB_H`→50).
- **Ordem de linha dentro do destino** (`dre_categoria_map.ordem` / `dre_comp_par.ordem`):
  **recalculada inteiramente no cliente, por posição no array**, no momento de montar o payload:
  `ordem: (idx + 1) * 10` (`src/components/financeiro/dre/editor-dre.tsx:166`). O banco só grava o
  que chegou (`0208:94`, `0260:326`).
- **Empate.** Não há `UNIQUE` em nenhuma das colunas `ordem`. Empate é resolvido pelo `ORDER BY` de
  forma arbitrária e silenciosa — risco reconhecido: as migrations 0251 e 0254 carregam uma
  reconciliação fail-closed que aborta a transação se houver ordem duplicada entre nós
  (`0251:218-224`, `0254:102-106`). **Não existe guarda equivalente no caminho do editor.**
  Medido hoje: zero empates entre nós nas duas famílias, e zero empates entre linhas exibidas
  dentro de um mesmo destino.

### 1.5 A chave de um nó

Definida **por quem escreve a migration**. Nada a gera, nada a valida em runtime além das FKs.
É `TEXT NOT NULL UNIQUE` e é referenciada por: a FK do mapeamento, cada fórmula que a cita e a
chave de linha do cliente (`src/lib/dre/identidade.ts`). **Nenhuma RPC permite alterá-la.**

Se ela mudasse: o `UPDATE` violaria a FK do mapeamento (rede real), mas as fórmulas que a citam
**não são protegidas por FK** — são texto dentro de um `jsonb`. Uma renomeação de chave deixaria
toda fórmula que a cita apontando para o vazio, e o comportamento resultante é **fail-open
silencioso** na família Caixa (§2.4).

### 1.6 Quantos nós existem hoje

Medido no catálogo vivo em 2026-09-16:

| | Caixa | Competência |
|---|---|---|
| nós totais | **28** | **26** |
| `blocoH` | 6 | 5 |
| `sub` | 14 | 14 |
| `tot` | 8 | 7 |
| nós-fórmula | 11 | 11 |
| nós-folha | 17 | 15 |
| linhas de mapeamento | **134** | **141** |
| — classificadas | 132 | 141 |
| — excluídas logicamente | 2 | 0 |
| — na bandeja | 0 | 0 |
| **linhas exibidas** | 132 | **138** (3 fusões) |
| catálogo de origem | 134 termos (`dim_categoria`) | 141 pares distintos na base |
| override de rótulo | 6 | n/a (rótulo é sempre próprio) |

> **Aviso de método.** Estas contagens são retrato de um instante, não invariante. O ADR-0156
> registra "29 blocos … 133 maps"; a 0251 mediu "29 blocos · 134 maps" em 19/08; hoje são 28 e 134.
> A estrutura é dado vivo — **toda contagem em prosa deriva**. Ver §13.

---

## 2. Fórmulas e totalização

### 2.1 Como um nó sabe o que somar

Duas regras, e só duas:

- **`formula IS NULL`** → o nó soma os **termos de origem** mapeados nele (e não excluídos).
- **`formula IS NOT NULL`** → o nó é a combinação signada das **chaves** listadas. Não soma termo
  de origem nenhum — e as duas RPCs de salvar **recusam** mapear um termo para um nó-fórmula
  (`0208:84-88`, `0260:318-322`: "linha de fórmula … não recebe categorias"). Medido: zero
  violações vivas.

Não há convenção de hierarquia, não há código imperativo por nó, não há `pai_id`. **Tudo é a
lista de chaves.**

### 2.2 A linguagem de fórmula

É uma linguagem de **uma linha**: um array JSON de chaves.

**Família Caixa** — array de chaves puras, todas somadas: `["ENT_H","PAG_H"]`. Não há operador.
**O sinal vive no dado** (despesa é valor negativo). Sem subtração possível.

**Família Competência** — mesmo array, com **prefixo `-` opcional por termo**:
`REXG = ["REX","-REEMB"]` (`0256:128`). Chave sem prefixo soma, com `-` subtrai. Foi introduzido
porque `REXG` precisa remover um bloco que já está somado dentro de `REX` — uma operação que o
modelo puramente aditivo não expressa (`0256:25-31`).

Sintaxe efetiva: `^-?[A-Za-z_][A-Za-z0-9_]*$` por termo (a regex do gerador,
`scripts/gera-seed-dre-competencia.mjs:54`, com a nota de que aceitar dígito importa — "uma chave
futura tipo `RH2` era silenciosamente partida pela regex antiga").

**Referência é sempre por chave**, nunca por posição ou id.

**Onde é avaliada: no banco, nas duas famílias.** O cliente nunca avalia fórmula.

### 2.3 Os dois motores de avaliação

**Caixa — passe único por `ordem`** (`0207_get_dre_mensal.sql:128-148`):

1. materializa os nós-folha somando os termos mapeados (passo 2, `0207:100-126`);
2. percorre `SELECT chave, formula FROM dre_bloco WHERE formula IS NOT NULL ORDER BY ordem` e,
   para cada um, soma os insumos já materializados.

Funciona **porque** vale um invariante não declarado no schema: *todo nó-fórmula só consome
nós-fórmula de ordem estritamente menor*. Verificado no catálogo vivo hoje: **zero violações**.
O invariante é vigiado por um teste de contrato contra a base viva
(`src/lib/rpc-contrato.test.ts:1389-1410`, "fórmula só consome fórmula de ordem ANTERIOR") — **não**
por constraint nem por código.

**Competência — expansão recursiva em folhas signadas** (`financeiro.vw_dre_comp_expansao`,
`0257:68-97`). Uma CTE `WITH RECURSIVE` substitui cada nó-fórmula pelos seus termos, propagando o
sinal, até restarem só folhas; agrupa por `(raiz, folha)` somando os sinais, e descarta coeficiente
zero com `HAVING sum(t.sinal) <> 0`. O valor de qualquer nó passa a ser uma combinação linear das
folhas, independente de `ordem`.

O ganho é concreto e mensurável: em `REXG = REX − REEMB`, os dois caminhos de `REEMB` se encontram
na expansão e o coeficiente **cancela para zero**. Medido na view viva hoje:

```
REX  → ADM:1 COM:1 CUSTO:1 DL:1 DNOP:1 ESTR:1 FIN:1 IMP_H:1 INV:1 MKT:1 REEMB:1 RH:1 RHB:1 RNOP:1 RV:1
REXG → ADM:1 COM:1 CUSTO:1 DL:1 DNOP:1 ESTR:1 FIN:1 IMP_H:1 INV:1 MKT:1        RH:1 RHB:1 RNOP:1 RV:1
```

`REEMB` simplesmente **não aparece** em `REXG`. "A subtração vira ARITMÉTICA de coeficientes, não
um caso especial no código" (`0257:35-36`).

A recursão tem **teto de profundidade 24** (`0257:86`) — explicitamente declarado como rede contra
laço infinito no servidor, **não** como validação de corretude (`0257:38-42`).

### 2.4 Validação: o que acontece, e em que momento

Esta é a tabela mais importante do bloco.

| Defeito | Ao salvar pelo editor | Ao ler | Onde é de fato pego |
|---|---|---|---|
| **ciclo** na fórmula | **impossível de introduzir** — o editor não edita fórmula | **fail-open silencioso**: a recursão para no teto 24 e o `HAVING` emite coeficientes PARCIAIS, sem `RAISE` (`0257:38-42`, `gera-seed:81-85`) | só no **gerador do seed**, por DFS três-cores (`gera-seed:86-98`), e num teste estático (`competencia-estrutura.test.ts:184`) |
| **referência a chave inexistente** | idem, impossível | Caixa: **fail-open silencioso** — o `LEFT JOIN … WHERE chave IN (…)` (`0207:139`) simplesmente não casa e o insumo entra como **zero**. Competência: o `JOIN` da expansão descarta o termo, idem | gerador (`gera-seed:69`) e teste de contrato contra a base viva (`rpc-contrato.test.ts:1389`) |
| **fórmula malformada** (não-array, termo inválido) | impossível | não há parser: `jsonb_array_elements_text` erraria em tempo de execução se não fosse array | gerador (`gera-seed:73`) |
| **referência adiante** (Caixa) | impossível | **fail-open silencioso**: insumo ainda não computado entra como zero (`0207:26-28`, verbatim: "fórmula que referencie chave ainda não computada soma 0 naquele insumo") | teste de contrato (`rpc-contrato.test.ts:1389-1410`) |
| **termo mapeado num nó-fórmula** | **RAISE `DRE_BLOCO_INVALIDO`** (`0208:87`, `0260:321`) | — | banco, no salvar |
| **estado incoerente** (excluído E com destino) | **RAISE `DRE_ESTADO_INVALIDO`** + `CHECK` de tabela | — | banco, nas duas camadas |
| **termo de origem inexistente** | **RAISE `DRE_CATEGORIA_INVALIDA`** | — | banco |
| **mesma linha duas vezes no lote** | **RAISE `DRE_PAYLOAD_INVALIDO`** — só na Competência (`0260:275-282`) e, desde a v5.9.5, também no Caixa (0268) | — | banco |
| **ordem duplicada** | **nada** | ordenação arbitrária, silenciosa | só nas reconciliações fail-closed das migrations 0251/0254 |

**A leitura é integralmente tolerante e o salvar é integralmente estrito.** Tudo que diz respeito à
*árvore* (ciclo, referência, forma da fórmula) é validado **em tempo de geração do seed**, num
script Node fora do banco, e nunca em runtime. Tudo que diz respeito ao *mapeamento* é validado no
banco, no ato da gravação. Isso não é acidente: hoje a árvore só muda por migration, então o
gerador *é* o caminho de escrita. A dívida está declarada: "**Quando esse editor existir, ele tem
de recusar ciclo na gravação**" (`0257:41`).

### 2.5 Nó referenciado por fórmula que é removido ou desativado

- **Removido.** Nada impede — não há FK de fórmula para chave (é texto em `jsonb`). O resultado é
  o fail-open da tabela acima: o insumo vira zero e **o número muda sem erro**. A migration 0251,
  que removeu o nó `RFIN`, precisou fazer o trabalho à mão: primeiro mover os termos, depois
  reescrever **as duas** fórmulas que o citavam, e só então `DELETE` — com uma reconciliação
  fail-closed para provar que fechou (`0251:60-162`).
- **Desativado.** Não existe "desativar nó". A exclusão lógica (`excluida`) é do **mapeamento**,
  nunca do nó.

---

## 3. Mapeamento origem → destino

### 3.1 A chave, e por que ela é o que é

**Caixa — chave simples.** `categoria_id INT UNIQUE REFERENCES dim_categoria(id)`. A origem já é um
catálogo de banco com id próprio e nome UNIQUE. O seed casou por **nome** no instante do apply e
gravou o **id** — "robusto a rename futuro" (`0205:22-23`).

**Competência — chave composta.** `UNIQUE (grupo_arquivo, descricao_arquivo)`. A origem é um arquivo
de planilha; não há id. A razão da composição é medida, não presumida: **exatamente 3 descrições
existem sob dois pais diferentes** no arquivo — `Comissão`, `Reembolso Cliente` e
`Reembolso Fornecedor` —, então chavear só por descrição colidiria (`0256:33-38`).

Confirmado no dado vivo hoje:

```
REEMB · Reembolso Cliente    ← "Descontos da venda / Reembolso Cliente"    ++ "Receitas da venda / Reembolso Cliente"
REEMB · Reembolso Fornecedor ← "Descontos da venda / Reembolso Fornecedor" ++ "Receitas da venda / Reembolso Fornecedor"
RV    · Comissão             ← "Receita de Vendas / Comissão"              ++ "Receitas da venda / Comissão"
```

### 3.2 Fusão

**Sim, dois termos de origem caem na mesma linha exibida** — e isso é decidido **pelos dois**:
mesmo destino **e** mesmo rótulo.

```sql
-- 0260:553-557 (a RPC de leitura da Competência)
destino AS (
  SELECT p.sub_chave, p.rotulo_linha, min(p.ordem) AS ordem
  FROM financeiro.dre_comp_par p
  WHERE p.sub_chave IS NOT NULL AND NOT p.excluida
  GROUP BY 1, 2
)
```

A fusão acontece **na leitura**, por `GROUP BY (sub_chave, rotulo_linha)`, nunca na chave
(`0256:36-37`: "A FUSÃO dessas linhas acontece no DESTINO … nunca na chave"). A `ordem` da linha
exibida é `min(ordem)` das pernas — e por isso o gerador do seed calcula a ordem **por destino, não
por par**, para as duas pernas receberem o mesmo valor (`gera-seed:111-126`).

**Medido hoje: 141 pares ⇒ 138 linhas exibidas.** Três fusões, duas pernas cada.

**Na família Caixa não há fusão.** `categoria_id` é UNIQUE no mapeamento e cada termo vira uma
linha. Dois termos com o mesmo rótulo de override apareceriam como duas linhas homônimas.

### 3.3 Exclusão lógica × remoção

**As duas existem, e fazem coisas diferentes.**

| | Exclusão lógica (`excluida = true`) | Remoção (linha some do mapeamento) |
|---|---|---|
| Caixa | estado válido exige `bloco_chave IS NULL` (CHECK `dre_map_estado`) | a linha deixa de existir → o termo **cai na bandeja** |
| Competência | estado válido exige `sub_chave IS NULL` (CHECK `dre_comp_par_estado`) | não acontece: o editor só faz `UPDATE`, nunca `DELETE` (`0260:239-242`) |
| Na leitura | a linha **não aparece** e **não entra em nenhum total** | idem, mas aparece na bandeja |
| Na reconciliação | **continua contabilizada**, num total próprio `excluidas_centavos` (só Competência) | contabilizada em `bandeja_centavos` (só Competência) |
| Reversível? | sim, pelo editor (card "Excluídas" → reincluir) | Caixa: sim, reclassificando da bandeja |

O ponto que vale copiar: **exclusão lógica é diferente de "não existe"**. Na Competência a
reconciliação soma as três fatias e exige que fechem contra a base — excluir uma linha **não a tira
da prova de completude** (`0256:75-78`, verbatim: "Linha excluída NÃO desaparece da reconciliação").

**Assimetria real entre as famílias no CHECK de estado:**

```sql
-- Caixa (0204:47-49) — TRÊS estados? não: DOIS.
CHECK ( (excluida AND bloco_chave IS NULL) OR (NOT excluida AND bloco_chave IS NOT NULL) )
-- Competência (0260:63) — TRÊS estados de verdade.
CHECK ( NOT (excluida AND sub_chave IS NOT NULL) )
```

O CHECK do Caixa **proíbe** a combinação `(sem destino, não excluída)`. Ou seja: na família Caixa a
bandeja **não é representável como linha** — um termo não classificado simplesmente não tem linha, e
a bandeja é derivada por `NOT EXISTS` contra o catálogo de origem (`0204:118-124`). Na Competência,
`(NULL, não-excluída)` é um estado legítimo e a bandeja é `sub_chave IS NULL`. O comentário da 0260
diz "Espelha `dre_map_estado` da 0204" (`0260:61`) — não espelha; é deliberadamente mais permissivo,
e o próprio comentário enumera os três estados logo abaixo.

### 3.4 Termo de origem novo, nunca mapeado

**Caixa — automático por construção.** Um termo novo no catálogo de origem não tem linha no
mapeamento, então o `NOT EXISTS` o coloca na bandeja na próxima leitura. Não há passo de
provisionamento, e não pode haver ambiguidade: a bandeja é uma consulta, não uma coluna
(`0204:33-35`).

**Competência — precisa de provisionamento, e ele existe.**
`public.provisionar_dre_comp_par()` (`0260:112-139`) insere, com destino `NULL`, todo par presente
na base e ausente da tabela. É **idempotente** (`NOT EXISTS`) e é chamada em dois pontos:
no finalizar do upload (como `service_role`, autor nulo — evento de sistema) e **pela própria
página do editor antes de ler** (`src/app/financeiro/dre/estrutura-competencia/page.tsx:47-50`),
para o diário atribuir a inserção a quem abriu a tela.

Por que o editor precisa disso: ele identifica cada linha por `id`, e um par sem linha **não tem
id**. A RPC de leitura do editor lê só `dre_comp_par` — sem `UNION` contra a base — deliberadamente,
porque "inventá-lo seria fabricar identidade" (`0260:154-161`). A cegueira é resolvida na origem,
provisionando, e não com leitura tolerante — "a leitura tolerante mostraria o par e não deixaria
mexer nele".

A RPC de **leitura do demonstrativo**, essa sim, é tolerante nos dois casos: o `LEFT JOIN` da view
faz um par sem linha nenhuma cair na bandeja mesmo assim (`0260:492-498`).

---

## 4. A bandeja do que não mapeia

### 4.1 Existe, e aparece em três lugares

1. **Demonstrativo, visão Mensal** — faixa âmbar "Não classificadas (n)" com a legenda
   *"categorias do Monde sem bloco na estrutura — nada some em silêncio"*
   (`src/components/financeiro/dre/tabela-dre.tsx:2764-2789`). Uma linha por órfã, com os mesmos
   valores mensais das demais, fundo `bg-warning-bg` sem cor por sinal, e Análise Vertical em
   travessão por decisão.
2. **Demonstrativo, visão Consolidado** — `tabela-dre.tsx:1806-1820`.
3. **Editor**, nas duas famílias — `BandejaCard` (`editor-dre.tsx:379-410`): contagem, legenda
   *"categorias novas do Monde aparecem aqui — nada some em silêncio"*, e por item um botão
   "Classificar…". Some da tela quando vazia.

Para quem: **para todo mundo que tem a área** `financeiro/dre`. Não há filtro adicional (§7.1).

Cada item da bandeja carrega, além do rótulo, o **grupo nativo da origem** (`grupo_monde`) — a
dica de para onde ele provavelmente vai.

### 4.2 Reconciliação de completude

**Só a família Competência tem verificação mecânica.** A RPC devolve, em **centavos inteiros**:

```sql
-- 0260:621-628 e :646-652
base      = Σ de tudo na base do ano
linhas    = Σ das classificadas e não excluídas
bandeja   = Σ das sem destino e não excluídas
excluidas = Σ das excluídas
'fecha'   = (base = linhas + bandeja + excluidas)     ← booleano no payload
```

As três fatias são **disjuntas e exaustivas por construção**, porque o CHECK de estado impede
`(destino, excluída)`. Centavos inteiros porque "comparar dinheiro em ponto flutuante é onde a
v5.5.1 apanhou" (`0257:58-59`). O invariante é travado por teste de contrato contra a base viva
(`rpc-contrato.test.ts:1584`).

**A família Caixa não tem esse campo.** Conferido no corpo vivo de `get_dre_mensal`
(`pg_get_functiondef`): nenhuma ocorrência de `reconciliacao`. A completude do Caixa é garantida
**estruturalmente** — toda categoria de origem ou tem linha no mapeamento ou aparece na bandeja,
e o `UNION ALL` da leitura emite as duas — mas **não é medida nem afirmada no payload**. Quem quiser
conferir soma na mão.

### 4.3 O que acontece se a bandeja for ignorada

**O número exibido fica incompleto, e avisado.** O termo não classificado não entra em nenhum
total da árvore — nem numa folha, nem num nó-fórmula, nem no resultado final. Mas:

- ele **aparece na tela**, na faixa âmbar, com os seus valores;
- na Competência, ele aparece **também** no `reconciliacao.bandeja_centavos`, e o booleano `fecha`
  continua verdadeiro (a bandeja é uma das três fatias — o total não "não fecha" por ela existir).

Ou seja: a bandeja **não é um alarme**, é uma prestação de contas. Ela garante que nada some; não
garante que alguém olhe. Hoje as duas bandejas estão vazias.

A mesma política se repete na RPC de decomposição: `bloco_chave IS NULL` vem no payload de propósito
— "nada some em silêncio, mesma política da bandeja da tabela" (`0209:64-68`).

---

## 5. O motor de leitura

### 5.1 As funções

| | Caixa | Competência |
|---|---|---|
| assinatura | `public.get_dre_mensal(p_ano int) → json` | `public.get_dre_competencia_mensal(p_ano int) → json` |
| segurança | `SECURITY DEFINER`, `search_path=''`, `app.exigir_acesso(ARRAY['financeiro/dre'])` na 1ª linha | idem |
| volatilidade viva | `VOLATILE` (cria temp tables) | `VOLATILE` |
| estratégia | 2 temp tables + laço `FOR` sobre nós-fórmula | CTEs sobre a view de expansão |
| linhas do corpo vivo | 210 | 158 |

### 5.2 O contrato — e é ele o ativo mais valioso do desenho

**As duas famílias devolvem o MESMO envelope.** `ano`, `hoje`, `relacao`, `mes_corrente`,
`token_estrutura`, `linhas[]`, `bandeja[]`, e por linha as mesmas chaves `t`, `chave`, `rotulo`,
`estrela`, `meses[12]`, `prev_corrente`, `venc`, `total` (`0257:9-12`).

O que isso comprou, medido:

- **um único componente de tabela densa** serve aos dois regimes, com o tipo `DreMensalLike`
  (`src/lib/dre/schemas.ts:125-133`);
- **um único editor** (`editor-dre.tsx`, 773 linhas) serve às duas famílias, parametrizado por dois
  props injetados pelos shells (`estrutura-shell.tsx`, `estrutura-comp-shell.tsx`) — o shell da
  Competência "não reimplementa nada";
- a **ponte entre os dois regimes** (ADR-0171) é derivada no cliente a partir dos dois payloads,
  sem RPC nova, e fecha ao centavo por construção.

A Competência preenche `prev_corrente = NULL` e `venc = 0` em toda linha só para manter o formato
(`0257:44-47`), e acrescenta campos próprios (`anos`, `cobertura_de/ate`, `carregado_em`,
`reconciliacao`) que são **declarados no schema Zod**, não deixados passar por `passthrough` — "campo
que o schema não declara vira `undefined` mudo três camadas depois" (`0257:254-256`).

**A diferença que não foi varrida para debaixo do tapete:** os itens da bandeja da Competência não
têm `categoria_id` (não existe categoria de banco); a identidade é o par de texto, em `chave`. Por
isso existem **dois schemas de bandeja separados** — reusar o do Caixa faria o `safeParse` do
envelope inteiro falhar no primeiro par não mapeado, "apagando a seção em silêncio justamente quando
a bandeja tinha algo a dizer" (`0257:14-20`).

### 5.3 Onde cada número é computado

**No banco:** valor de cada folha, valor de cada nó-fórmula, `total` do ano, `venc`,
`prev_corrente`, `reconciliacao`, e o `Record<id, total>` que o editor da Competência usa para
mostrar o efeito de um movimento antes de salvar.

**No cliente:** tudo que é derivado.

| derivado | onde | denominador / regra |
|---|---|---|
| YTD | `src/app/financeiro/dre/page.tsx:230,269` | `meses.slice(0, mesJanela)` — `mesJanela` ancorado em **hoje**, nunca no ano exibido |
| Análise Vertical | `src/lib/dre/av.ts` | **`RB_H`** (`CHAVE_BASE_AV`, `av.ts:51`) do mesmo período e recorte; rejeita base ausente, não-finita ou `< 0,005` → coluna em travessão; só aplicada **abaixo** da linha-base |
| variação Δ% | `tabela-dre.tsx:565-569` | `((b−a)/Math.abs(a))*100`, `null` se `|a| < 0,005`. Denominador em **módulo** de propósito |
| proporção sobre a base | `src/lib/dre/proporcao-grupos.ts:110-153` | numerador e denominador cortados pela **mesma** janela |
| cascatas / ponte | `folhas.ts`, `ponte-regimes.ts`, `decomposicao-variacao.ts` | soma por folha em **centavos inteiros**; bandeja e excluídas ficam de fora, identidade por construção |

### 5.4 Arredondamento

**Acontece só na borda de exibição, e partes e total são arredondados INDEPENDENTEMENTE.**

- dinheiro: `Intl.NumberFormat('pt-BR', {min/max FractionDigits: 2})`
  (`src/components/financeiro/dre/fmt-contabil.ts:8`); `|v| < 0,005` vira travessão;
- Análise Vertical: `Intl` com **1 casa** (`av.ts:111-114`);
- Δ%: `Intl` 1 casa com `signDisplay:'exceptZero'`.

**O caso em que a soma das partes exibidas não bate com o total exibido existe, é conhecido, e é
deliberado.** `src/lib/dre/av.ts:37-44`, verbatim: *"Na EXIBIÇÃO com 1 casa a soma da coluna pode
fechar com ±0,1 p.p. … e não se maquia"*. Há teste que trava tanto a aditividade exata **antes** do
arredondamento quanto a divergência aceita **depois** (`av.test.ts:103-128` e `:129`).

O "Total do ano" tem dois caminhos: no modo *tudo* usa o `total` do payload sem recomputar; no modo
*realizado* recompõe no cliente (`tabela-dre.tsx:589-600`).

**Divergência medida na aritmética de centavos** (§13, item 5): `proporcao-grupos.ts:97` converte com
`Math.round(v*100)` sob o comentário *"a mesma aritmética de `folhas.ts`"*, enquanto `folhas.ts:66`
usa `toCentavos` de `@/lib/carga/coercao` **precisamente porque** `Math.round(v*100)` erra em valores
como 1.005 (dito em `folhas.ts:42-45`). Numerador e denominador da mesma razão usam conversões
diferentes.

### 5.5 Custo

**Nada é materializado.** As duas RPCs recomputam tudo a cada carregamento.

- Caixa: 1 varredura indexada do fato no ano + 1 do balde de vencidos + avaliação dos nós-fórmula,
  em duas temp tables `ON COMMIT DROP`, numa transação única — o que dá consistência de leitura
  contra edição concorrente (`0207:10-12`, `:30-33`).
- Competência: a base já chega **no grão da apresentação** (um registro por par × mês), então
  "não há fato a materializar e não existe deriva possível entre base e leitura" (`0256:280-281`).
  A única "materialização" é a view de expansão, que depende só da árvore e não do ano.

Orçamento declarado: folga dentro dos 8 s de `statement_timeout` do papel `authenticated`.

---

## 6. Rótulos

### 6.1 A regra: quem carrega o operador

Existe, é de uma frase, e vale nas duas famílias:

> **Agregação carrega operador `(+)` / `(-)` / `(+/-)` / `(=)`; folha NUNCA carrega.**

Aqui "agregação" é **o nó** (qualquer `tipo`: cabeçalho, subgrupo, totalizador) e "folha" é a
**linha de origem mapeada**. O operador diz o **papel** da linha, não o sinal do valor.

A razão está escrita, e é a melhor frase do levantamento
(`src/lib/rpc-contrato.test.ts:1336-1345`, verbatim):

> *"O sinal de uma folha é do VALOR (parênteses na célula), não do rótulo — repetido no texto ele
> vira ruído que ainda por cima MENTE quando o valor daquele período sai com o sinal contrário."*

Corolário registrado na 0254: quando um nó muda de papel, o prefixo muda junto. `RB_H` era `(+)`
como cabeçalho e virou `(=)` ao ser promovido a totalizador — *"o prefixo diz o PAPEL da linha, e o
papel dela é resultado, não entrada"* (`0254:23-26`).

### 6.2 Onde a regra é imposta

**Em lugar nenhum do banco.** Não há `CHECK`, não há trigger, não há validação na RPC de salvar.
Conferido no catálogo: as constraints de `dre_categoria_map` são PK, UNIQUE, duas FKs e
`dre_map_estado` — nada sobre rótulo.

Ela é imposta em **quatro** lugares, todos fora do caminho de gravação:

1. **Reconciliação fail-closed das migrations**, nas duas direções — aborta a transação se um nó
   ficar sem operador **ou** se uma folha ficar com um (`0251:200-216`, `0254:94-100`). A segunda
   direção é a que pega o defeito que a versão veio corrigir: "as 12 categorias que herdaram
   `(-) …` do modelo da controladoria".
2. **Gerador do seed da Competência** — recusa emitir SQL se violar (`gera-seed:60` e `:108`).
3. **Teste de contrato contra a base viva**, nas duas direções (`rpc-contrato.test.ts:1359-1378`).
4. **Teste estático sobre o SQL da migration** da Competência
   (`competencia-estrutura.test.ts:140-151`).

Medido hoje no dado vivo: **zero violações** nas duas famílias, nas duas direções.

Existe ainda uma camada de **exibição** que desfaz o prefixo onde ele viraria ruído:
`src/lib/dre/rotulo-bloco.ts` remove o prefixo contábil e converte CAIXA ALTA preservando siglas,
para os cards e cascatas.

### 6.3 A divergência com o modelo de referência, e como foi resolvida

O modelo de origem (a planilha da controladoria) **carregava o prefixo `(-)` em 18 rótulos de
folha** — porque numa planilha o prefixo é a única pista de que a linha é despesa. Ao virar dado,
isso passou a mentir: a mesma folha pode sair positiva num período (estorno) e o rótulo continuaria
dizendo `(-)`.

A resolução foi um `UPDATE` genérico, não uma lista:

```sql
-- 0251:152-156
UPDATE financeiro.dre_categoria_map m
SET rotulo = NULLIF(regexp_replace(m.rotulo, '^\(\s*[-+=]\s*\)\s+', ''), dc.categoria)
FROM financeiro.dim_categoria dc
WHERE dc.id = m.categoria_id AND m.rotulo ~ '^\(\s*[-+=]\s*\)\s+';
```

Dois movimentos num só: tira o prefixo **e**, se o que sobra é exatamente o nome da origem, zera o
override com `NULLIF` — porque `rotulo = NULL` já significa "use o nome da origem". Dos 18 overrides,
**12 eram só prefixo** e sumiram; os 6 restantes eram de capitalização e ficaram (medido hoje: 6
overrides vivos).

---

## 7. O editor

### 7.1 Quem pode editar, e por qual barreira

**Uma área RBAC, `financeiro/dre`, em três camadas concêntricas:**

1. página — `await requireArea('financeiro/dre')`
   (`src/app/financeiro/dre/estrutura/page.tsx:37`, `estrutura-competencia/page.tsx:34`);
2. Server Action — `await requireAreaAction('financeiro/dre')` em cada uma das 10 actions;
3. banco — `PERFORM app.exigir_acesso(ARRAY['financeiro/dre'])` na primeira linha de cada RPC.

**Não existe distinção entre ver e editar, e não pode existir neste modelo de RBAC.** Conferido no
catálogo: `app.rbac_areas` tem as colunas `(area, rotulo, grupo, ordem)` — **nenhuma coluna de verbo
ou nível** —, e `app.exigir_acesso` testa apenas pertencimento da área às permissões do papel do
usuário. Quem vê o demonstrativo pode editar a estrutura. (`service_role` passa direto; conexão sem
claims só passa se for superusuário real.)

A única gradação existe no **desfazer**: reverter ação de terceiro exige, além de `financeiro/dre`,
a área `admin/acessos` (`0206:192`, `0260:414-416`).

### 7.2 O payload carrega só o diff

```ts
// src/components/financeiro/dre/editor-dre.tsx:156-170
const mudou = !base || base.blocoChave !== estado.blocoChave
  || base.ordem !== estado.ordem || base.excluida !== estado.excluida
if (mudou) pend.push({ categoria_id, bloco_chave, ordem, excluida })
```

O editor captura um **baseline** no carregamento e envia só o que divergiu dele. O item tem
**quatro campos e mais nada** (`SalvarMapItem`, `src/lib/dre/schemas.ts:255-260`) —
`{ categoria_id, bloco_chave, ordem, excluida }`. Rótulo, `nota_estrela`, tipo, fórmula e ordem de
nó **não viajam**.

Como o salvar decide o que atualizar:

- **Caixa** — `INSERT … ON CONFLICT (categoria_id) DO UPDATE … WHERE (bloco_chave, ordem, excluida)
  IS DISTINCT FROM (…)` (`0208:90-98`). Upsert: classificar um órfão **insere**.
- **Competência** — `UPDATE … WHERE id = v_id AND (sub_chave, ordem, excluida) IS DISTINCT FROM (…)`
  (`0260:324-330`). Só update, nunca insert — "não há como o editor inventar um par que não esteja
  na base. Isso também fecha a porta para um par entrar no de-para sem existir no arquivo, que era
  possível no caixa" (`0260:240-242`).

Nos dois casos o **no-op é pulado** pelo `IS DISTINCT FROM`: sem `UPDATE` não há `atualizado_em`
novo, logo **não há entrada de diário**. O histórico registra só o que de fato mudou.

### 7.3 Trava de concorrência: otimista **e** pessimista, juntas

**Otimista.** O token é `greatest(max(atualizado_em))` das duas tabelas da família — um único
timestamp para a estrutura inteira, porque a estrutura é **global** (uma oficial, não por usuário).
Viaja no payload de leitura, volta como `p_token`, e é **obrigatório**:

```sql
-- 0208:61-63 · idêntico em 0260:293-295
IF p_token IS NULL OR p_token IS DISTINCT FROM v_token THEN
  RAISE EXCEPTION 'DRE_CONFLITO: a estrutura mudou desde o carregamento. Recarregue e refaça as alterações.';
END IF;
```

**Pessimista.** Um `pg_advisory_xact_lock(hashtext('financeiro.dre_estrutura_salvar'))` serializa
os salvamentos **antes** da checagem do token (`0208:54`). Sem ele, dois salvares simultâneos
passariam ambos pela checagem — TOCTOU. Cada família tem **chave de trava própria**, porque
serializar uma contra a outra só criaria contenção sem motivo (`0260:284-286`).

**O que acontece quando duas pessoas salvam:** a segunda espera a trava, relê o token, vê que mudou
e recebe `DRE_CONFLITO`. Nada é gravado parcialmente — o laço inteiro roda numa transação.

Detalhe fino do desenho: a RPC devolve o token novo, mas **o editor não o usa** — ele chama
`router.refresh()` e re-hidrata comparando a prop com o snapshot local, sem `useEffect`
(`editor-dre.tsx:564-571,685`).

Detalhe fino do comportamento: a própria reversão avança `atualizado_em`, então **um desfazer
invalida a sessão de edição de todo mundo**, de propósito (`0206:81,101`).

### 7.4 Guards de payload

| guard | Caixa | Competência | onde |
|---|---|---|---|
| payload é array | ✅ | ✅ | `0208:43-45`, `0260:263-265` |
| teto de 1000 itens | ✅ | ✅ | `0208:48-50`, `0260:266-268` |
| **mesma linha duas vezes no lote** | ✅ (desde 0268/v5.9.5) | ✅ (nasceu com ele) | `0260:275-282` |
| origem existe | ✅ | ✅ | `0208:71-73`, `0260:303-306` |
| estado coerente (XOR) | ✅ | ✅ | `0208:76-80`, `0260:309-313` |
| destino existe **e é folha** | ✅ | ✅ | `0208:84-88`, `0260:318-322` |
| ciclo | n/a (fórmula não é editável) | n/a | — |
| ordem duplicada | ❌ | ❌ | — |
| **validação Zod da ENTRADA** | ❌ | ❌ | ver abaixo |

O guard de duplicidade merece destaque porque a razão dele não é a óbvia: ele **protege o
desfazer**. `reverter_diario` pressupunha um toque por linha por lote, e tocar a mesma linha duas
vezes na mesma transação fazia o undo em lote abortar sem reverter nada (`0260:270-274`). Nasceu na
Competência e retroagiu ao Caixa na v5.9.5.

**A entrada das Server Actions não é validada por Zod.** `salvarEstrutura` recebe `SalvarMapItem[]`
e repassa cru como `p_maps` (`src/app/financeiro/dre/estrutura/actions.ts:56`). O projeto aplica
`parseRpc`/Zod rigorosamente na **saída** de toda RPC, mas na entrada a contenção é 100% SQL. Ela é
boa e suficiente para a integridade do banco — mas é uma assimetria em relação ao padrão da casa.

**No cliente quase não há guard.** O editor restringe pela *affordance*: o seletor de destino só
oferece nós-folha (`blocos.filter(b => b.formula === null …)`, `editor-dre.tsx:220-223`); movimentos
de ordem checam borda; handlers fazem lookup defensivo e retornam em silêncio. Ciclo, duplicidade e
referência inexistente **não são checados no cliente** — são impossíveis pela UI ou barrados no SQL.
Há proteção contra perda de trabalho (`beforeunload` com pendências, e confirmação antes de
descartar).

### 7.5 O que o editor NÃO permite — e esta é a descoberta central

**Nenhum dos dois editores toca a árvore. Nem um pouco.**

| operação | permitida? | evidência |
|---|---|---|
| criar nó | **não** | nenhum botão; `CardBloco` e `FaixaAncora` são somente-leitura |
| remover nó | **não** | idem |
| mudar chave do nó | **não** | a chave nem é exibida na tela |
| mudar fórmula | **não** | aparece só como texto legível, sem input |
| mudar rótulo do nó | **não** | renderizado como texto |
| mudar tipo do nó | **não** | nenhuma affordance |
| mudar ordem do nó | **não** | só a ordem **dentro** do nó |
| mudar rótulo da linha | **não** | o override existe no schema mas não viaja no payload |
| mudar `nota_estrela` | **não** | declarado no cabeçalho do editor e confirmado pelo payload |
| mover linha entre nós | **sim** | |
| reordenar linha dentro do nó | **sim** | |
| excluir logicamente / reincluir | **sim** | |
| classificar da bandeja | **sim** | |

**Confirmação independente, por três caminhos:**

1. **Grep em `src/`**: `dre_bloco` e `dre_comp_bloco` não aparecem em nenhum caminho de escrita —
   só em comentários, num teste e no gerador do seed.
2. **Contrato do payload**: `SalvarMapItem` tem quatro campos, e os quatro são do mapeamento.
3. **Diário de produção** — a prova definitiva. Todo lote que tocou `dre_bloco` tem `usuario_nome`
   **nulo** (aplicação por migration, sem sessão):
   | lote | tabela | op | n | o que mudou | quando | quem |
   |---|---|---|---|---|---|---|
   | 132178 | `dre_bloco` | D | 1 | o nó `RFIN` | 19/08 | **null** (migration 0251) |
   | 132178 | `dre_bloco` | U | 27 | 4 fórmulas, 21 rótulos, 2 ordens | 19/08 | **null** |
   | 147212 | `dre_bloco` | U | 2 | 1 rótulo, 2 ordens, 1 tipo | 24/08 | **null** (migration 0254) |
   | 55361 / 96333 / 132178 / 138489 | `dre_categoria_map` | I/U | 1/5/15/26 | mapeamento | 27/07…21/08 | Yan, **Carine**, null, Yan |
   | 154211…154737 | `dre_comp_par` | U | 5/5/14/13 | mapeamento | 26/08 | Yan |

   Humanos (Yan, Carine) **só** aparecem em tabelas de mapeamento. `dre_comp_bloco` tem **zero**
   entradas de diário — a árvore de Competência nunca foi tocada depois do seed.

**Essa limitação é deliberada, e está escrita.** O briefing da v5.7.0 lista como fronteira explícita:
*"edição de blocos/fórmulas no editor (segue v1 só de de-para)"*. E o out-briefing da v5.8.0 registra
a condição para levantá-la: *"o dia em que a árvore virar editável, a gravação tem de recusar
ciclo"*.

Consequência colateral registrada: **desclassificar uma linha de volta para a bandeja não é possível
em nenhuma das duas famílias** — o salvar aceita `(destino, não-excluída)` ou `(sem destino,
excluída)`, e o estado `(sem destino, não-excluída)` não é alcançável pelo payload, apesar de ser
representável na tabela da Competência.

### 7.6 Recontagem de ordem, e o efeito colateral que ela produz

A recontagem é **inteiramente do cliente**, por posição no array, no momento de montar o diff:
`ordem: (idx + 1) * 10` (`editor-dre.tsx:166`). Uma linha recém-excluída entra com `ordem: 0`; uma
excluída preserva a ordem original.

O risco tem nome no próprio código, e o autor guardou **metade** dele
(`editor-dre.tsx:150-152`, verbatim): *"A ordem de uma categoria ATIVA é reindexada pela posição
corrente no array do bloco (mesma convenção do seed: 10, 20, 30…); a de uma EXCLUÍDA preserva a
ordem original (senão toda excluída pré-existente viraria **pendência fantasma**)."* A exceção foi
prevista para as excluídas; a mesma armadilha nas **ativas** — quando o seed grava uma ordem que não
é ponto fixo de `(idx+1)*10` — não foi.

O efeito colateral é mensurável e vale para a spec: **mover uma linha renumera todas as que vêm
depois dela, e essas renumerações entram no mesmo lote**. Pior: quando a ordem gravada não é um
ponto fixo da fórmula `(idx+1)*10`, a simples **abertura** do editor produz pendências que o usuário
não criou, e o primeiro salvamento as grava.

Isso não é teoria — **aconteceu, e está no diário**. O seed da Competência gravou ordens duplicadas
nas três fusões (as duas pernas recebem a mesma ordem, de propósito: `REEMB` tinha `10,20,20,30,30`).
O editor, que lista uma linha por par, recalculou por posição. Resultado do primeiro lote:

```
lote 154211 — Yan, 26/08 15:18 — 5 entradas
  id 129  Carta de Crédito       RV → ADM      ordem 10 → 130    ← o movimento que o usuário fez
  id 130  Comissão               RV → RV       ordem 20 → 10     ← colateral legítimo (fechou o buraco)
  id  77  Reembolso Cliente      REEMB → REEMB ordem 20 → 30     ← REEMB não foi tocado pelo usuário
  id  78  Reembolso Fornecedor   REEMB → REEMB ordem 30 → 40     ← idem
  id  79  Reembolso Fornecedor   REEMB → REEMB ordem 30 → 50     ← idem
```

Três das cinco entradas são de um nó que o usuário não abriu. E o lote 154213 (14 entradas) mudou
**exclusivamente ordem**, sem uma única mudança de destino ou exclusão.

**Hoje o estado está no ponto fixo**: medido, as 141 linhas da Competência e as 132 do Caixa têm
`ordem` exatamente igual a `(posição)*10` dentro do seu destino — **zero divergências**. O mecanismo
disparou uma vez, absorveu a diferença e se estabilizou. Mas ele redispara a cada seed novo que não
respeite a fórmula do cliente.

---

## 8. Duas instâncias, ou dois motores?

### 8.1 Comparação lado a lado

| dimensão | **Caixa** | **Competência** |
|---|---|---|
| tabela de nós | `financeiro.dre_bloco` | `financeiro.dre_comp_bloco` |
| tabela de mapeamento | `financeiro.dre_categoria_map` | `financeiro.dre_comp_par` (+ `dre_comp_map` órfã) |
| coluna de destino | `bloco_chave` | `sub_chave` |
| coluna de rótulo de linha | `rotulo` (**override**, anulável) | `rotulo_linha` (**sempre**, NOT NULL) |
| `nota_estrela` no nó | sim | **não existe** (RPC emite `false` fixo) |
| chave do mapeamento | **simples**: `categoria_id` | **composta**: `(grupo, descrição)` |
| catálogo de origem | tabela própria (`dim_categoria`) | a própria tabela de mapeamento |
| origem do dado | `financeiro.fato_fluxo` | `raw.demonstrativo_competencia` (full-swap no upload) |
| **fórmula** | array de chaves, **só soma** | array de chaves **com sinal** (`"-REEMB"`) |
| **cabeçalho consumido pelo total?** | **não** — totais re-enumeram os subgrupos | **sim** — `ROL = [RB_H, IMP_H]` |
| **motor de avaliação** | passe único `ORDER BY ordem`, 2 temp tables | **view recursiva** de expansão em folhas signadas, teto 24 |
| invariante que o motor exige | fórmula só consome fórmula de ordem menor | nenhum (independe de ordem) |
| função de leitura | `get_dre_mensal(int)` — 210 linhas vivas | `get_dre_competencia_mensal(int)` — 158 |
| envelope de resposta | **idêntico** | **idêntico** + `anos`, `cobertura_*`, `carregado_em`, `reconciliacao` |
| **reconciliação mecânica** | **não existe** | `base = linhas + bandeja + excluídas`, em centavos, com booleano `fecha` |
| `previsto` / `vencido` | sim (colunas `prev_corrente`, `venc`) | não (campos presentes, sempre `NULL`/`0`) |
| `relacao`/`mes_corrente` deriva de | **data de hoje** | **cobertura da base** |
| função de leitura do editor | `dre_estrutura()` | `dre_comp_estrutura(p_ano)` — inclui `totais` por linha |
| provisionamento de origem nova | **desnecessário** (bandeja por `NOT EXISTS`) | `provisionar_dre_comp_par()`, idempotente, chamado ao abrir o editor |
| função de salvar | `dre_estrutura_salvar(jsonb, timestamptz)` — **UPSERT** | `dre_comp_estrutura_salvar(...)` — **UPDATE puro** |
| CHECK de estado | proíbe `(sem destino, não excluída)` | **permite** (é a bandeja) |
| guard de duplicidade no lote | sim (retro, 0268) | sim (nativo) |
| chave do advisory lock | `'financeiro.dre_estrutura_salvar'` | `'financeiro.dre_comp_estrutura_salvar'` |
| bandeja | derivada por `NOT EXISTS` contra `dim_categoria` | `sub_chave IS NULL` (editor) **∪** par sem linha (leitura) |
| fusão de linhas | **não existe** | sim, por `GROUP BY (destino, rótulo)` |
| histórico / desfazer | 4 RPCs `dre_estrutura_*` (0206) | 4 RPCs `dre_comp_estrutura_*` (0260) — espelhos |
| tabelas sob o diário | as 2 | as 2 vivas (a órfã fica de fora) |
| **editor** | **o mesmo componente**, 773 linhas, parametrizado por 2 props | idem |
| Server Actions | 5 | 5, espelhos exatos |

### 8.2 O que é divergente por natureza, e o que é divergente por data

**Divergente por natureza do problema — copiaria em qualquer replicação:**

1. **A espécie da chave de origem.** Uma origem que já é catálogo de banco dá chave simples e um id;
   uma origem que é arquivo dá chave composta de texto. Isso arrasta tudo o mais: a existência de
   provisionamento, a forma da bandeja, a possibilidade de fusão, o conteúdo da bandeja no payload.
   Declarado em ADR-0170 §1.
2. **Fórmula com sinal.** Não é refinamento: é um requisito que o modelo aditivo não expressa
   (`REXG = REX − REEMB`, com `REEMB` dentro de `REX`).
3. **Direção das referências de fórmula.** Caixa: totais re-enumeram subgrupos, cabeçalhos são
   paralelos. Competência: totais consomem cabeçalhos. **Essa escolha é a que decide o motor** —
   a segunda forma torna impossível o passe único e exige a expansão recursiva.
4. **Existência de previsto/vencido.** Regime de caixa tem projeção; o de competência não.

**Divergente por terem sido escritas em momentos diferentes — convergiria numa replicação:**

1. **A reconciliação mecânica.** Não há nada no regime de caixa que impeça
   `base = linhas + bandeja + excluídas`; ela simplesmente não foi escrita em 2026-07 e foi escrita
   em 2026-08. É a melhoria mais barata e mais valiosa das duas.
2. **O guard de payload duplicado.** Nasceu na Competência e retroagiu ao Caixa um mês depois
   (0268). Prova de que era ausência, não decisão.
3. **`nota_estrela` faltando na árvore de Competência.** A RPC emite `false` fixo para manter o
   contrato. É lacuna, não desenho.
4. **UPSERT × UPDATE puro.** O UPDATE puro é estritamente melhor (impede inventar origem) e a 0260
   diz isso explicitamente. O UPSERT do Caixa é o desenho antigo.
5. **A tabela órfã.** Consequência de "`DROP` exige humano", não de arquitetura.
6. **Nomes de coluna** (`bloco_chave` × `sub_chave`, `rotulo` × `rotulo_linha`) — puro acidente
   histórico, e cada divergência dessas é um lugar onde o editor compartilhado precisa de um
   adaptador.

**Há registro arquitetural declarando a divergência deliberada, e ele confere com o corpo vivo.**
ADR-0170 §1, verbatim:

> *"As duas árvores divergem de verdade: competência não tem REPASSE nem IMOBILIZADO, e tem ONOP_H,
> LL, DL e REXG que o caixa não tem. E as CHAVES de mapeamento são de espécies diferentes … Forçar
> uma tabela só criaria uma que serve mal aos dois. **O que se aceita:** duas curadorias a manter.
> **Convergência é decisão futura, deliberadamente não tomada agora.**"*

Conferido contra o catálogo vivo, chave a chave. **Exclusivas do Caixa:** `DIST_LUCROS`, `ENT_H`,
`IMOB`, `PAG_H`, `REPASSE`. **Exclusivas da Competência:** `DL`, `REEMB`, `REXG`. Logo: a parte do
ADR sobre `REPASSE`, `IMOBILIZADO`, `DL` e `REXG` está correta; **`ONOP_H` e `LL` existem nas duas
árvores** e sempre existiram — estão no seed original do Caixa (`0205:48,51`), escrito um mês antes
do ADR. Os dois exemplos estão errados; a tese (as árvores divergem de verdade) se sustenta com
sobra pelos outros seis. O comentário de `COMMENT ON FUNCTION` reafirma a decisão e continua
correto: *"os dois regimes convivem por decisão (ADR-0170) e NÃO se unificam"* (`0269:136-139`).

### 8.3 A resposta

**São dois motores com um contrato comum.** O que é genuinamente compartilhado é a **camada de
apresentação e de edição** — um envelope, um componente de tabela, um editor, um par de schemas Zod,
um módulo de identidade de linha. O que é duplicado é o **motor**: duas tabelas de nós, duas de
mapeamento, duas funções de leitura, duas de salvar, dois conjuntos de RPCs de histórico.

A duplicação **não é do modelo conceitual** — ele é rigorosamente o mesmo nos dois lados: nó com
chave estável, fórmula por chave, folha que soma origem, exclusão lógica, bandeja, token global,
advisory lock, diário. É duplicação de **implementação** de um único modelo.

Para uma replicação, isso é a informação mais útil do levantamento: **existe um motor só, e ele foi
escrito duas vezes.** O que a segunda escrita acrescentou (sinal na fórmula, expansão recursiva,
reconciliação, UPDATE puro, guard de duplicidade) é o que vale copiar; o que a primeira tem de
próprio (previsto/vencido, override de rótulo, catálogo de origem separado) é conector, não motor.

---

## 9. Efeito da edição sobre o passado

**A pergunta mais importante, e a resposta é inequívoca.**

### 9.1 Sim — a estrutura nova recalcula todo o passado

As duas funções de leitura recebem `p_ano` e fazem `JOIN` com a tabela de mapeamento **corrente**.
Não há filtro temporal em lugar nenhum do caminho. Editar a estrutura hoje muda o que 2024 mostra
amanhã.

### 9.2 É deliberado, e há registro explícito da decisão

**ADR-0168:98-101**, verbatim:

> *"**A mudança é RETROATIVA a todos os anos exibidos.** A estrutura é dado lido a cada consulta,
> não um reprocessamento: no instante em que a migration entrou, 2024 e 2025 passaram a ser
> apresentados pelo critério novo. Isso é desejável (comparabilidade), mas significa que **qualquer
> material impresso antes de 19/08/2026 mostra o critério antigo**."*

E o briefing da v5.7.0, como invariante inegociável:

> *"A mudança é **retroativa a todos os anos exibidos** (estrutura viva não reprocessa) — a saída
> inclui o **quadro de-para por ano** (LOP/LL/RAIR antes×depois) pronto para a comunicação de
> mudança de critério à liderança."*

**Como se explica a quem vê um número mudar:** a resposta da casa é um **quadro antes×depois por
ano**, produzido no ato da mudança, mais uma comunicação à liderança. O quadro da v5.7.0 está no
cabeçalho da própria migration (`0251:39-45`):

```
ano   ROL              IMOB           LOP antes → depois            RAIR          REX
2024  8.445.067,04     (20.912,64)    1.345.435,68 → 1.366.348,32   1.166.913,02  293.853,61
2025  10.032.946,54    (99.342,56)      692.722,91 →   792.065,47     993.514,58  248.434,54
2026* 7.331.991,77    (236.572,23)   (1.538.932,99) → (1.302.360,76) (1.703.591,25) (2.496.722,68)
```

Com a álgebra que autoriza a mudança impressa acima dele: `RAIR' = (LL − IMOB) + INV + IMOB = RAIR`
— **RAIR e REX não mudam um centavo em ano nenhum**, e é isso que o oráculo confere (§11).

**A comunicação prometida ainda não foi feita.** O out-briefing da v5.8.0 lista como pendência
herdada: *"comunicar a mudança de critério da DRE (v5.7.0) à liderança"*; o `WORKING-CONTEXT`
repete. A mudança de 19/08/2026 está em produção e não foi comunicada.

### 9.3 Não existe nenhuma noção de versão ou vigência

Varredura no catálogo vivo por qualquer coluna com nome de período no schema `financeiro`
(`vigen|versao|valido|vale_de|vale_ate|desde|ate_`): **vazio**. Varredura em `docs/` por
`vigênc|vigenc|versão da estrutura`: nada sobre a estrutura da DRE. As oito colunas de `dre_bloco` e
as oito de `dre_categoria_map` estão listadas em §1.1 — não há `valido_de`, não há `versao`, não há
`substituido_por`.

**O que acontece quando a organização muda de critério no meio do ano:** todo o histórico passa a ser
apresentado pelo critério novo, imediatamente, sem aviso na tela. As séries ficam comparáveis entre
si e **incomparáveis com qualquer material impresso antes**. Não há como reproduzir a visão antiga
a não ser reconstruindo a estrutura antiga — o que o diário torna tecnicamente possível (§10) mas
ninguém oferece como funcionalidade.

**Há uma consequência de segunda ordem, medida e registrada, e ela é mais sutil.** A visão
Consolidado monta o *conjunto de linhas* a partir do ano da URL, e aplica esse conjunto a todos os
anos comparados:

> *"Marcar só 2024 mostra a estrutura de 2026 com os valores de 2024 (conta que só existia em 2024
> não aparece; conta de 2026 ausente em 2024 aparece com travessão) … **Resolver exigiria a página
> passar também a estrutura do ano de referência.**"* (out-briefing v5.3.0)

Ou seja: a ausência de vigência não afeta só os números — afeta **quais linhas existem**.

### 9.4 Houve episódio real? Sim, pelo menos três

1. **19/08/2026 — mudança de critério deliberada.** A migration 0251 moveu o imobilizado para
   abaixo da linha. `LOP` e `LL` de 2024 e 2025 mudaram (+20.912,64 e +99.342,56 respectivamente).
   `RAIR` e `REX` não mudaram — por álgebra, e confirmado pelo oráculo, cuja saída `✅ ORACLE OK`
   está registrada no out-briefing. **O que foi feito:** provar o invariante antes e depois, publicar
   o quadro antes×depois por ano, e abrir a pendência de comunicar à liderança (ainda aberta).

2. **27/07/2026 — edição rotineira mexeu em total histórico.** O out-briefing da v5.3.0 registra,
   verbatim:
   > *"(Uma versão anterior deste documento trazia um snapshot mais antigo destes mesmos campos —
   > colhido **antes de o Yan classificar a categoria órfã hoje às 09:44, o que reparenteou uma
   > categoria e mexeu nos totais a jusante**. Os invariantes acima seguiram valendo nos dois
   > instantes; é por isso que eles, e não os valores, são o critério.)"*

   **A lição operacional está aí:** a defesa contra "o número mudou" não é congelar o número — é
   ter **invariantes** que valham nos dois instantes.

3. **Deriva contínua do seed.** A 0251 teve de anotar "Estado vivo conferido em 19/08 (**NÃO o seed
   0205, que já divergiu**)", porque entre julho e agosto o editor havia classificado um órfão e
   migrado uma categoria de um nó para outro. O ADR-0170 normaliza: a divergência entre seed e
   estrutura viva *"é o comportamento esperado, não um defeito"*.

---

## 10. Auditoria e desfazer

### 10.1 O que está sob o diário, e o que não está

Levantado no catálogo vivo (`pg_trigger` com `fn_diario_alteracoes`):

| tabela | sob o diário? |
|---|---|
| `financeiro.dre_bloco` | ✅ |
| `financeiro.dre_categoria_map` | ✅ |
| `financeiro.dre_comp_bloco` | ✅ |
| `financeiro.dre_comp_par` | ✅ |
| **`financeiro.dre_comp_map`** (órfã) | ❌ |
| `raw.demonstrativo_competencia` (base) | ❌ — full-swap no upload |
| `financeiro.fato_fluxo` (base) | ❌ |

Nas quatro tabelas vivas o trigger é anexado **depois** do seed, para o seed não poluir o histórico
(`0205:234-239`, `0260:83-99`). Cada tabela tem também um `BEFORE UPDATE` que carimba
`atualizado_em` — a coluna que alimenta o token.

O desfazer é **fail-closed por allowlist estrutural**: `reverter_diario` recusa qualquer tabela que
não tenha o trigger anexado (`0206:51`). Logo `dre_comp_map` e as bases são irreversíveis pelo painel
por construção, não por omissão.

### 10.2 O que o histórico mostra — e o que não mostra

**Mostra:** por lote (uma transação = um lote), quem, quando, quantas linhas, quais operações
(`I`/`U`/`D`), se o próprio lote é um desfazer; e por entrada, a linha **inteira** antes e depois
(`to_jsonb(NEW)`), com o id do registro.

**Não mostra:**

- **a intenção.** Uma entrada de `ordem: 20 → 30` é indistinguível entre "o usuário reordenou" e
  "o usuário moveu outra linha e esta foi renumerada por tabela". Medido no lote 154211: 3 de 5
  entradas eram de um nó que o usuário não abriu (§7.6);
- **o efeito no número.** O diário guarda o estado da linha de configuração, não o resultado que ela
  produz. Não há como responder "quanto o LOP de 2024 mudou por causa deste lote" olhando o
  histórico;
- **o autor, quando a mudança vem de migration.** `usuario_nome` fica nulo — correto (é evento de
  sistema), mas significa que **as mudanças de árvore, que são as mais consequentes, são as
  anônimas**;
- **a estrutura como um todo num instante.** É preciso rebobinar entrada a entrada.

### 10.3 A trava do editor e a do desfazer são a mesma — e conversam

**São literalmente a mesma chave de advisory lock.** Caixa:
`pg_advisory_xact_lock(hashtext('financeiro.dre_estrutura_salvar'))` aparece no salvar (`0208:54`),
no desfazer-lote (`0206:184`) e no desfazer-linha (`0206:213`). Competência: mesma receita com a
chave própria (`0260:286,407,436`).

O token otimista é o mesmo objeto nos dois caminhos: `greatest(max(atualizado_em))` das duas tabelas
da família. E há um efeito de acoplamento **deliberado**: a reversão avança `atualizado_em` pelo
`BEFORE UPDATE`, então *"token antigo não volta a 'bater'"* (`0206:81,101`) — **desfazer invalida a
sessão de edição de todo mundo**.

Permissões: reverter o **próprio** lote é permitido a quem tem `financeiro/dre`, porque salvar em
lote é o fluxo normal do editor; reverter lote de **terceiro** exige `admin/acessos`.

### 10.4 O episódio que quebrou o desfazer — e está medido em produção

`reverter_diario` pressupunha **no máximo um toque por linha por lote**. A migration 0251 violou
isso. Medição direta no diário de produção, hoje:

```
lote_id 132178 · financeiro.dre_bloco · registros 13, 14, 20, 25, 27 → 2 toques cada
```

Cinco nós tocados duas vezes no mesmo lote (a migration mudou fórmula **e** rótulo **e** ordem de
alguns nós em `UPDATE`s separados). O resultado era que o "desfazer em lote" **abortava a transação
inteira sem reverter nada**. É o **único** lote em toda a base a violar a premissa.

A correção veio na 0268 (v5.9.5), em duas camadas: percorrer `ORDER BY id DESC` (para cada entrada
encontrar a linha como a deixou) **e** comparar ignorando colunas voláteis — porque `atualizado_em`
avança a cada reversão e a comparação da linha inteira acusava diferença falsa.

A 0254, escrita entre o defeito e a correção, adotou a disciplina como regra de escrita:
*"UM UPDATE POR LINHA (lição da v5.7.0) … aqui os dois UPDATEs tocam linhas DIFERENTES, cada uma uma
única vez — então este lote É reversível pelo painel"* (`0254:32-36`).

E a advertência que ficou: a 0251 ficou *tecnicamente* revertível e **não deve ser revertida** —
reverter seria uma decisão de produto nova, não uma correção.

---

## 11. Prova de correção

### 11.1 O oráculo aritmético

**Existe, e é de um tipo específico: oráculo de invariante sob mudança, não de valor absoluto.**

`scripts/dre-oracle.mjs` (103 linhas). Chama `get_dre_mensal(ano)` por REST com `service_role`,
para 2024, 2025 e 2026, **antes** e **depois** de uma migration destrutiva de estrutura, e reprova
se `RAIR` ou `REX` mudarem:

```js
const INVARIANTES = ['RAIR', 'REX']                                  // :37
const marca = INVARIANTES.includes(k) ? (Math.abs(delta) < 0.005 ? '  ✅' : '  ❌ REPROVA') : ''
process.exit(falhas.length === 0 ? 0 : 1)
```

As outras sete chaves (`ROL, IMOB, FIN, DESP_H, LOP, LL, INV_H`) são **exibidas mas não reprovam** —
espera-se que mudem. Limiar: meio centavo, "o mesmo limiar de zero contábil usado na tela".

**Onde vive e como é executado:** no repositório, mas **fora de todo automatismo**. Não há npm
script (`package.json` tem apenas `dev/build/lint/test/seed/db:migrate/db:gate`); roda-se à mão com
`set -a; . .env.local; set +a; node scripts/dre-oracle.mjs`. Está declarado como exceção no
`knip.json` para não ser marcado como código morto. Os retratos vão para o `.gitignore` porque são
dado financeiro real.

**Por que não automatizado**, verbatim (`dre-oracle.mjs:12-16`):

> *"a migration é destrutiva e aplicada à mão, em produção, sem staging. O invariante que a autoriza
> — 'o resultado final não muda um centavo' — precisa ser conferível no ATO … **2026 anda todo dia**
> …, então só um par antes/depois tirado com minutos de diferença prova alguma coisa ali."*

**Quando quebra:** imprime `❌ ORACLE REPROVA em: <ano>/<chave>` e sai com código 1. Quem lê o
código de saída é o humano que está aplicando a migration. Não há CI, não há hook.

**A Competência tem um oráculo de outra natureza**, e melhor: a reconciliação
`base = linhas + bandeja + excluídas` viaja **dentro do payload**, em centavos, com booleano `fecha`,
a cada leitura. É contínuo, não pontual.

### 11.2 Os testes, e exatamente o que travam

| onde | contra o quê | o que trava |
|---|---|---|
| `src/lib/dre/competencia-estrutura.test.ts` | **SQL da migration 0256 + os dois CSV curados** — sem banco, sem rede | **forma e álgebra, zero valores de dinheiro**: paridade SQL×anexo; todo destino existe; par único; **regra de rótulos nas duas direções**; as 3 fusões (141 pares ⇒ 138 linhas); **aciclicidade**; `REX` = soma de tudo com coeficiente +1 em cada folha; **`REXG = REX − REEMB` por cancelamento**; cadeia `ROL→LB→LOP→LL→RAIR→REX` |
| `src/lib/rpc-contrato.test.ts` | **a base VIVA, por REST** (`skipIf` quando offline) | shape dos envelopes; XOR excluída/destino; **toda chave de fórmula existe**; **fórmula só consome fórmula de ordem anterior**; token errado → `DRE_CONFLITO` sem efeito; **rótulos nas duas direções**; `RB_H` é `tot` e é `REPASSE+RV`; reconciliação da Competência; **editor e demonstrativo concordam sobre o que está classificado**; ponte entre regimes fecha ao centavo |
| `src/lib/dre/reverter-diario.test.ts` | banco | cadeias `U→U`, `I→U`, `U→D`; conflito real; atomicidade; **guard de duplicidade nas duas RPCs de salvar** |
| `av.test.ts`, `folhas.test.ts`, `identidade.test.ts`, `proporcao-grupos.test.ts`, `rotulo-bloco.test.ts`, `ponte-regimes.test.ts` | módulos puros | aditividade exata **antes** do arredondamento e a divergência aceita **depois**; centavos inteiros; as duas espécies de chave de linha |

**A decisão de método mais transferível** está no cabeçalho do teste estático
(`competencia-estrutura.test.ts:17-21`), verbatim:

> *"**POR QUE NENHUM NÚMERO DE DINHEIRO APARECE AQUI:** a base é um upload que o Yan re-gera, e teste
> puro que crava número de fonte editável nasce falso-vermelho (lição da v5.7.2)."*

**Lacuna medida:** o teste de paridade confere o **SQL da migration** contra os anexos curados
(`readFileSync('supabase/migrations/0256_…')`), **não a tabela viva**. Depois que o editor é usado,
o dado vivo diverge do seed — e nada trava essa deriva. É consistente com a filosofia (a deriva é
esperada), mas significa que **a curadoria viva não tem oráculo próprio** além dos invariantes de
forma que o teste de contrato verifica contra a base.

### 11.3 "O oráculo batia e a explicação estava errada" — sim, há um caso registrado

O caso é da v5.7.1, e a essência é esta:

O card "Maiores variações" e o Demonstrativo mostravam, lado a lado, o "acumulado do ano" da mesma
categoria — e discordavam. O card cortava o ano anterior por **dia-do-ano** (`doy <= dia de hoje`);
o Demonstrativo cortava por **meses inteiros**. Medido em 24/08/2026, em "Pagamento ao Fornecedor":

- ano corrente: divergência **0,00** — *"batiam, porque os dois cortam em 'hoje'"*;
- ano anterior: divergência **638.959,48** — *"que são exatamente 25 a 31/08/2025"*.

O invariante aritmético estava satisfeito no ano corrente; a **explicação** ("os dois somam a mesma
coisa") estava errada, e só o ano anterior revelou. A decisão foi a janela do Demonstrativo vencer
(migration 0253); a prova pós-fix foi *"126 categorias no ranking · 0 divergências numéricas"*; e o
caso virou teste de contrato permanente. Registrou-se também o que se perdeu: o corte por dia-do-ano
comparava o mesmo **número de dias** decorridos — era mais rigoroso.

**A lição para a spec:** dois números vizinhos na mesma tela que deveriam concordar são um **caso de
contrato**, não uma coincidência a conferir uma vez.

---

## 12. Contaminação de domínio

**Critério: um artefato está limpo se funciona sem conhecer o negócio deste produto.**

### 12.1 A separação

**MOTOR — copia inteiro, zero conhecimento de negócio:**

- as duas tabelas de nós (chave, rótulo, tipo, ordem, fórmula, carimbo);
- a tabela de mapeamento (origem, destino, ordem, exclusão lógica, rótulo, carimbo) com o CHECK de
  estado;
- o gatilho de `atualizado_em` e o token `greatest(max(...))`;
- a view de **expansão recursiva em folhas signadas** — é álgebra pura, nada sabe de contabilidade;
- o esqueleto das RPCs de leitura: materializar folhas, expandir fórmulas, emitir linhas na ordem,
  emitir bandeja, emitir reconciliação;
- a RPC de salvar em lote inteira: array, teto, guard de duplicidade, advisory lock, checagem de
  token, XOR de estado, "destino tem de ser folha", `IS DISTINCT FROM` para pular no-op;
- as 4 RPCs de histórico/desfazer e a integração com o diário genérico;
- o editor: baseline, diff de quatro campos, recontagem por posição, bandeja, card de excluídas,
  modal de mover, guarda de `beforeunload`;
- o gerador de seed com validação de existência, aciclicidade por DFS e unicidade de par.

**CONFIGURAÇÃO — dado do cliente, nunca código:**

- as 28 + 26 linhas de árvore (chaves, rótulos, tipos, ordens, fórmulas);
- as 134 + 141 linhas de mapeamento;
- os dois CSV curados que geram o seed;
- a escolha de qual chave é a base da Análise Vertical (`RB_H`).

**CONECTOR — depende da origem dos dados, reescreve-se por instalação:**

- `dim_categoria` e `financeiro.fato_fluxo` (origem 1); `raw.demonstrativo_competencia` (origem 2);
- a view que junta base × mapeamento (`vw_dre_competencia`) — é o adaptador, e é `LEFT JOIN`
  **de propósito**;
- `provisionar_dre_comp_par()` — provisionamento é conector, porque só existe quando a origem não
  é um catálogo com id;
- a semântica de `realizado`/`previsto`/`vencido` e o conceito de "mês híbrido";
- `relacao`/`mes_corrente` (hoje × cobertura da base).

### 12.2 Onde o domínio vazou para dentro do motor

Cinco vazamentos reais, todos superficiais e todos renomeáveis:

1. **Nomes de tabela, coluna e função.** `dre_*`, `bloco_chave`, `sub_chave`, `categoria_id`,
   `dre_categoria_map`, `get_dre_mensal`. O caso mais caro é **`categoria_id` no payload de salvar
   da Competência**, onde ele não é categoria nenhuma — é o `id` da linha de de-para. A 0260 explica
   e mantém o nome para reusar o editor (`0260:148-151`). Numa replicação: `no_id`, `termo_id`,
   `destino`, `mapa`.
2. **Os tipos de nó `blocoH`/`sub`/`tot`.** São vocabulário de demonstrativo. O motor não os lê —
   só a tela. Genérico: `cabecalho`/`secao`/`total`, ou simplesmente `nivel`.
3. **A regra de rótulo com operador `(+)/(-)/(+/-)/(=)`.** É convenção contábil pura. A **mecânica**
   ("agregador carrega marcador de papel, folha nunca") é genérica; o alfabeto de marcadores é
   configuração.
4. **`prev_corrente` e `venc` no envelope.** São "previsto" e "vencido" — conceitos de fluxo de
   caixa, presentes como `NULL`/`0` num regime que não os tem, só para o contrato ser um só.
   Numa replicação: um objeto `extras` tipado por instância.
5. **A base da Análise Vertical fixada em `RB_H`** no código do cliente (`av.ts:51`). É uma chave de
   negócio num módulo de motor. Deveria ser uma linha de configuração da árvore
   (`nó.e_base_de_proporcao`).

### 12.3 O que precisaria mudar para classificar outra coisa que não valores financeiros

Surpreendentemente pouco — **o modelo é aditivo sobre uma medida numérica, e só**:

1. **Renomear** os cinco vazamentos acima.
2. **Trocar a medida.** Hoje o motor assume **uma** medida numérica por termo × período
   (`valor`), somável, com sinal no dado. Para contar unidades, horas ou pontos, basta trocar o
   tipo — mas para **duas ou mais medidas simultâneas** (ex.: valor *e* quantidade) seria preciso
   generalizar `meses numeric[12]` para um vetor por medida, o que atinge o envelope, a tabela e
   todos os derivados.
3. **Generalizar o eixo temporal.** O motor tem **12 meses fixos** cravados em toda parte
   (`generate_series(1,12)`, `numeric[12]`, `meses[12]` no schema Zod). Trimestre, semana ou
   "sem eixo" exigiriam um parâmetro de granularidade.
4. **Tornar a base da proporção configuração**, não constante de código.
5. **Definir o conector**: uma tabela ou view que entregue `(termo_de_origem, periodo, medida)` e
   um catálogo de termos de origem (ou o provisionamento que o substitui).

**O que NÃO precisaria mudar:** o grafo por chave, a expansão signada, a bandeja, a exclusão lógica,
a fusão por destino+rótulo, o token global, o advisory lock, a reconciliação, o diário, o desfazer,
o editor inteiro. É por isso que faz sentido chamá-lo de motor.

---

## 13. Divergências encontradas

| # | o que a documentação/ADR diz | o que o código/catálogo faz | evidência |
|---|---|---|---|
| 1 | `WORKING-CONTEXT.md`: *"Receita Bruta é `RB_H`/`tipo:'blocoH'`, **não** `'tot'`"* | `RB_H` é **`tot`**, ordem 50, rótulo `(=) RECEITA BRUTA DE VENDAS` | catálogo vivo; migration `0254:45-49`; teste `rpc-contrato.test.ts:1470`. A frase congelou no estado pré-v5.7.1 — e é a primeira coisa que uma sessão nova lê |
| 2 | Cabeçalho da `0251:56-57`: *"esta migration entra no histórico como um lote grande e **REVERSÍVEL** pelo painel"* | o lote 132178 tocou 5 nós **duas vezes** e, até a 0268, o desfazer abortava sem reverter nada | medido no diário vivo: `lote_id 132178`, registros 13/14/20/25/27 com 2 toques cada. ADR-0168 já marca o header como errado; **o arquivo nunca foi corrigido nem anotado** |
| 3 | ADR-0156: *"29 blocos + 133 maps + 2 excluídas"*; `0251:51`: *"29 blocos · 134 maps"* | **28 nós · 134 mapeamentos · 2 excluídas · bandeja 0** | catálogo vivo. Não é erro de ninguém: é estrutura viva derivando. **Toda contagem citada em prosa sobre estas tabelas é retrato, não invariante** |
| 4 | `0260:61`: *"Espelha `dre_map_estado` da 0204"* | o CHECK da Competência é **deliberadamente mais permissivo** — admite `(sem destino, não excluída)`, que o do Caixa proíbe | `0204:47-49` × `0260:63`. O próprio comentário enumera os três estados logo abaixo; "espelha" é frouxo, não falso |
| 5 | `proporcao-grupos.ts:94`: *"a mesma aritmética de `folhas.ts`"* | usa `Math.round(v*100)`; `folhas.ts:66` usa `toCentavos` **precisamente porque** `Math.round(v*100)` erra em 1.005 | `proporcao-grupos.ts:97` × `folhas.ts:42-45,66`. Numerador e denominador da mesma razão convertem diferente |
| 6 | ADR-0170 §1: *"competência … tem **ONOP_H, LL**, DL e REXG que o caixa não tem"* | `ONOP_H` e `LL` existem **nas duas** árvores, e já estavam no seed original do Caixa, um mês antes do ADR | catálogo vivo (exclusivas do Caixa: `DIST_LUCROS, ENT_H, IMOB, PAG_H, REPASSE`; da Competência: `DL, REEMB, REXG`) + `0205:48,51`. A tese do ADR se sustenta; dois dos quatro exemplos, não |
| 7 | `0260:493-498`: *"a bandeja tem DUAS fontes … par com linha e `sub_chave IS NULL` **UNIÃO** par da base sem linha nenhuma"* | não há `UNION`: as duas fontes chegam pelo mesmo `LEFT JOIN` da view, que produz `sub_chave NULL` nos dois casos | `0260:559-564` (corpo vivo). Comportamento correto; a palavra "união" descreve o efeito, não o mecanismo |
| 8 | `0257:38-42`: *"esta versão NÃO tem editor da árvore de competência. **Quando esse editor existir, ele tem de recusar ciclo na gravação**"* | continua verdadeiro e continua sem cobertura: a 0260 criou editor **do mapeamento**, não da árvore — mas anexou triggers de diário e touch a `dre_comp_bloco` e a incluiu no token, como se escrita fosse prevista | `0260:87-96`; diário vivo de `dre_comp_bloco`: **zero entradas**. Não é divergência de hoje — é uma **armadilha armada** para quem levantar a limitação |
| 9 | O projeto valida entrada de RPC com Zod (`parseRpc`) como padrão | as duas Server Actions de salvar repassam `p_maps` **cru**, sem validação de runtime na camada de aplicação | `estrutura/actions.ts:56`, `estrutura-competencia/actions.ts:59`. A contenção no SQL é boa; a assimetria com o padrão da casa é real |
| 10 | Documentação e ADRs descrevem a regra de rótulo como regra do sistema | **não há `CHECK`, trigger ou validação em RPC** que a imponha; ela vive só em migrations de reconciliação, no gerador do seed e em testes | constraints de `dre_categoria_map` no catálogo: PK, UNIQUE, 2 FKs, `dre_map_estado`. Nada sobre rótulo |

---

## Reconstruível

Denso o bastante para virar spec sem o repositório.

1. **O modelo de dados completo das quatro tabelas** — colunas, tipos, nulidade, padrões, UNIQUE,
   FKs, CHECKs, índices, RLS e a política de `REVOKE ALL` + acesso só por RPC `SECURITY DEFINER`
   (§1.1, §1.4).
2. **Os dois eixos ortogonais de tipagem de nó** — apresentação (`blocoH/sub/tot`) × aritmética
   (folha × fórmula) — e o fato de que só o segundo entra em cálculo (§1.2).
3. **A linguagem de fórmula nas duas variantes** — array de chaves puro e array de chaves com
   prefixo de sinal — com a razão concreta do sinal (§2.2).
4. **Os dois algoritmos de avaliação**, completos: passe único por ordem (com o invariante que ele
   exige e o fail-open quando é violado) e a CTE recursiva de expansão em folhas signadas, com
   `HAVING sum(sinal) <> 0` e teto de profundidade (§2.3).
5. **A matriz de validação** — que defeito é pego, onde e quando; e a assimetria estrutural
   "árvore validada em tempo de geração, mapeamento validado em tempo de gravação" (§2.4).
6. **A mecânica de fusão** por `GROUP BY (destino, rótulo)` com `min(ordem)`, e a regra de que a
   ordem tem de ser calculada por destino, não por par (§3.2).
7. **Os três estados do mapeamento** e os dois formatos de CHECK, com a consequência de cada um
   sobre a representabilidade da bandeja (§3.3).
8. **A reconciliação de completude** em centavos inteiros, com as três fatias disjuntas e o booleano
   `fecha` no payload (§4.2).
9. **O envelope de resposta comum** e tudo que ele comprou — tabela única, editor único, ponte entre
   regimes (§5.2).
10. **A trava dupla** — token otimista global + advisory lock por família, na ordem certa (lock
    antes da leitura do token), incluindo o comportamento do desfazer sobre o token (§7.3, §10.3).
11. **O protocolo de salvar em lote**: diff de quatro campos, teto, guard de duplicidade,
    `IS DISTINCT FROM` para pular no-op, uma transação = um lote de diário (§7.2, §7.4).
12. **A regra de rótulo** com a razão por trás e as quatro camadas onde é imposta (§6).
13. **A política de "nada some em silêncio"** — bandeja em três lugares, `LEFT JOIN` de propósito,
    bandeja no payload da decomposição (§4).
14. **O padrão de migration de reestruturação**: álgebra do invariante no cabeçalho, quadro
    antes×depois por ano, um `UPDATE` por linha, reconciliação fail-closed no fim, oráculo externo
    no ato (§9.2, §11.1).
15. **A integração com o diário**: allowlist estrutural, triggers depois do seed, permissão graduada
    para reverter ação de terceiro, e a premissa de um toque por linha por lote — com o defeito real
    que ela produziu e as duas camadas da correção (§10).

## Faltando

Com a pergunta exata.

1. **Não sei se a bandeja ou o botão "Editar estrutura" já ficaram visíveis para alguém que não
   deveria editar.** O modelo de RBAC não permite separar ver de editar (§7.1), e o
   `WORKING-CONTEXT` diz que a área não está concedida a nenhum papel hoje. **Pergunta:** a área
   `financeiro/dre` está hoje em `app.rbac_role_permissoes` para algum papel além do de
   administrador? (Não consultei — a resposta é dado de pessoas, e o levantamento não precisava
   dela.)
2. **Não sei quanto tempo as duas leituras levam em produção.** Não executei nenhuma RPC. **Pergunta:**
   qual o p95 de `get_dre_mensal` e `get_dre_competencia_mensal` hoje, e quanto do orçamento de 8 s
   sobra?
3. **Não sei se o lote 154213** (14 entradas, exclusivamente ordem) **foi uma reordenação
   intencional ou renumeração colateral.** O diário não distingue intenção (§10.2). **Pergunta para
   quem editou:** em 26/08 às 15:18 você reordenou 14 linhas de propósito, ou só moveu uma e o resto
   foi arrasto?
4. **Não sei se existe cópia impressa ou exportada da DRE anterior a 19/08/2026** circulando.
   O ADR-0168 avisa que qualquer material impresso antes mostra o critério antigo. **Pergunta:**
   há relatório entregue à liderança com números pré-0251 que precise de errata?
5. **Não consegui determinar se a família Caixa tem algum consumidor da estrutura fora do que
   mapeei.** Verifiquei `get_dre_mensal` e `get_decomposicao_bloco`; não varri policies e triggers de
   outros schemas em busca de referência a `dre_bloco`/`dre_categoria_map`. **Pergunta:** existe
   alguma RPC, policy ou trigger fora de `financeiro`/`public` que leia as tabelas de estrutura?

## Decisões embutidas

Cada tensão que o modelo resolveu de um jeito e não de outro.

**1. A estrutura vale para todo o histórico, sem versão nem vigência.**
*Compra:* comparabilidade perfeita entre anos, um único conjunto de linhas, motor simples, edição
com efeito imediato, zero reprocessamento.
*Custa:* qualquer número já comunicado pode mudar sem aviso; não há como reproduzir a visão de uma
data; a mudança de critério vira um evento de comunicação humana, com quadro antes×depois e uma
pendência que hoje está aberta há quase um mês; e o problema vaza para *quais linhas existem* na
visão comparativa, não só para os valores.

**2. A fusão é decidida pelo par (destino, rótulo), não pela chave de origem nem só pelo destino.**
*Compra:* dois termos de origem que são a mesma coisa do ponto de vista do leitor viram uma linha
só, sem inventar uma terceira entidade "linha canônica"; e a chave de origem continua fiel ao
arquivo.
*Custa:* o rótulo vira **chave funcional** — renomear um lado quebra a fusão em duas linhas, em
silêncio; a `ordem` da linha exibida tem de ser `min()` das pernas e o seed precisa calculá-la por
destino; e **o editor lista as pernas separadamente enquanto o demonstrativo as funde**, então mover
uma perna parte em duas o que a tela mostra como uma linha só.

**3. Exclusão lógica em vez de remoção.**
*Compra:* reversibilidade pelo próprio editor; a linha excluída continua contabilizada na prova de
completude, então "excluir" não é "sumir"; e na Competência o `UPDATE` puro impede inventar origem.
*Custa:* um estado a mais para representar, um CHECK para mantê-lo coerente, e — pelo formato
escolhido do CHECK na família Caixa — a bandeja **não é representável como linha**, o que obrigou
duas mecânicas de bandeja diferentes nas duas famílias (`NOT EXISTS` × `destino IS NULL`).

**4. O editor não toca a árvore.**
*Compra:* ciclo e referência quebrada são **impossíveis por construção**, não por validação; a
validação pesada mora num gerador offline; o editor é pequeno, um só serve às duas famílias, e o
payload tem quatro campos.
*Custa:* toda mudança de critério é uma migration escrita à mão, destrutiva, aplicada em produção
sem staging, com confirmação humana em TTY — o caminho mais caro e mais arriscado do projeto. E as
mudanças mais consequentes do sistema são exatamente as que ficam **anônimas** no diário.

**5. Trava otimista global, não por linha.**
*Compra:* uma edição de estrutura é atômica de verdade — ninguém salva metade; e o token é um único
timestamp trivial de propagar.
*Custa:* qualquer salvamento invalida a sessão de edição de **todo mundo**, ainda que tenham mexido
em nós disjuntos; e o desfazer também invalida, de propósito. Com dois editores ativos, o segundo
sempre refaz o trabalho.

**6. A ordem é recalculada por posição no cliente, e só o diff viaja.**
*Compra:* payload minúsculo, no-op não vira ruído no histórico, e a lógica de ordenação fica num
lugar só.
*Custa:* mover uma linha renumera todas as seguintes e essas renumerações entram no mesmo lote,
apagando a intenção no histórico; e se a ordem gravada não for um ponto fixo de `(idx+1)*10`, a
simples **abertura** do editor gera pendências que o usuário não criou — o que aconteceu, está no
diário de 26/08, e reacontece a cada seed novo.

**7. Fail-open na leitura, fail-closed na escrita.**
*Compra:* a tela nunca quebra por dado de configuração torto; uma chave inexistente não derruba o
demonstrativo inteiro.
*Custa:* referência quebrada, ciclo e referência adiante produzem **número errado em silêncio**, sem
`RAISE` e sem marca na tela. A única defesa é um teste de contrato contra a base viva — que só roda
quando alguém o roda.

**8. A prova de correção é de invariante, não de valor.**
*Compra:* o oráculo continua válido enquanto a base anda (o ano corrente muda todo dia); testes
estáticos não nascem falso-vermelhos; e a defesa contra "o número mudou" é algo que vale nos dois
instantes.
*Custa:* nada prova que o **valor** está certo — só que a mudança preservou o que deveria preservar.
Um erro presente desde o seed passa por todos os oráculos. E o oráculo mais forte é um script manual,
sem npm script e sem CI, cujo código de saída só existe se um humano o rodar no ato.

**9. Um único contrato de resposta para dois motores diferentes.**
*Compra:* uma tabela, um editor, um conjunto de schemas, e a ponte entre regimes derivada de graça
no cliente.
*Custa:* campos que não fazem sentido num dos lados viajam mesmo assim (`prev_corrente`, `venc`);
um campo genuinamente diferente (a bandeja sem `categoria_id`) obrigou **dois schemas separados**
para o `safeParse` não apagar a seção inteira em silêncio; e um nome do domínio de um lado
(`categoria_id`) atravessa para o outro, onde significa outra coisa.
