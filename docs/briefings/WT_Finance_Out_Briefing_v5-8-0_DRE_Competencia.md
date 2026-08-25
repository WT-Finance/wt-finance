# Out-Briefing v5.8.0 — DRE por Competência

**MINOR** · `0255`/`0256`/`0257` (todas ADITIVAS, aplicadas) · **ADR-0170** · **1044 testes**
Branch `feat/v5-8-0-dre-competencia` · base `420caac` (main na v5.7.2 + pós-merge #244)

---

## 1. O que entrou

A página `/financeiro/dre` passou a ter **duas TopSections**. A nova, **"Regime de
Competência"**, fica **ACIMA** do "Regime de Caixa" e lê o resultado por **data de emissão**,
a partir de uma base de upload própria, com árvore e de-para próprios.

| Missão | Estado |
|---|---|
| **M1 — Base + upload** | ✅ `0255` aplicada; parser, worker, cartão em `/admin/uploads`, 3 Server Actions e o alarme de ingestão |
| **M2 — Árvore + de-para + leitura** | ✅ `0256`/`0257` aplicadas; view, expansão recursiva, RPC no envelope do caixa, 25 testes novos |
| **M3 — TopSection** | ✅ tabela densa reusada por props aditivas; fail-safe; pills independentes |
| **M4 — Fechamento** | ✅ este documento, ADR-0170, CHANGELOGs, bump, WORKING-CONTEXT, PR |

**A base real está carregada em produção:** 3.244 linhas · Σ 568.937,62 · 141 pares ·
cobertura 2024-01 → 2026-08.

## 2. Decisões do Yan nesta sessão (mudaram o briefing)

1. **A seção de Competência vai ACIMA do Regime de Caixa**, aberta. O briefing dizia "abaixo"
   (§1 e M3). Consequência de projeto assumida: a seção nova é a primeira coisa da página,
   então o fail-safe deixou de ser cortesia — sem payload ela **não renderiza**, porque bloco
   quebrado no topo é pior que a ausência dele.
2. **A base da Análise Vertical é a Receita Bruta (`RB_H`), não a ROL.** O briefing pedia
   "÷ ROL" em dois lugares porque foi escrito sobre a v5.7.1; a v5.7.2 — mergeada às 14h10 do
   mesmo dia — trocou a base para a Receita Bruta. Seguir o briefing ao pé da letra colocaria
   **dois denominadores de AV diferentes na mesma página**.

## 3. Divergências briefing × repo, resolvidas por decisão técnica

| Briefing dizia | Repo real | O que foi feito |
|---|---|---|
| "base main @ v5.7.1" | main na v5.7.2 | worktree partiu de `420caac`; ver decisão 2 acima |
| `contar_demonstrativo_competencia` | o padrão da casa é `status_*` (0185/0186) | `status_demonstrativo_competencia` |
| "RPCs no padrão gated" | as RPCs de upload **não** usam `app.exigir_acesso` | upload = REVOKE/GRANT `service_role` + `requireAreaAction` no Server Action; só a RPC de **leitura** leva `app.exigir_acesso(['financeiro/dre'])` |
| "upload via API Route, nunca Server Action" (skill) | as 5 bases vivas usam **Server Action** | seguiu-se o vivo (ver §7) |
| "fórmulas por CHAVE" | `dre_bloco.formula` só SOMA chaves | `dre_comp_bloco.formula` aceita sinal: `["REX","-REEMB"]` |
| anexo da árvore com "27 linhas" | **26 blocos** + cabeçalho | 26 |
| pills independentes por regime | `?ano=` é um parâmetro só, escrito pela própria tabela | prop `paramAno`; competência usa `?anoComp=` |

## 4. A prova (o que sustenta os números)

### 4.1 Oráculo em forma fechada, ANTES de qualquer SQL

Aplicando a lição durável da v5.7.0, a prova saiu dos anexos:

- Expandindo as fórmulas, `REX = RB_H + IMP_H + CUSTO + DESP_H + ONOP_H + INV_H + DL` reduz a
  exatamente **15 baldes-folha**;
- o de-para usa **exatamente esses 15**, nenhum a mais (30 RH · 15 RHB · 15 FIN · 13 RV ·
  12 COM · 12 ADM · 10 ESTR · 8 CUSTO · 6 MKT · 5 REEMB · 4 RNOP · 4 INV · 4 IMP_H · 1 DNOP ·
  1 DL = 141);
- logo **`REX ≡ Σ(base do ano)` ⟺ bandeja vazia** — identidade, não coincidência numérica;
- no **REXG** o coeficiente de REEMB soma `+1 − 1 = 0` e cai fora: a subtração é aritmética de
  coeficientes, não caso especial no código;
- as **3 fusões** são as 3 únicas descrições sob dois pais, e as duas pernas de cada uma caem no
  mesmo destino ⇒ `141 pares − 3 = 138 linhas exibidas`;
- rótulos do anexo: **zero** folha com operador.

Isso virou `src/lib/dre/competencia-estrutura.test.ts` (15 testes), que lê o **SQL aplicado** —
mão humana no seed gerado, ou anexo editado sem regerar, fica vermelho.

### 4.2 Medição do arquivo vivo, antes de escrever a migration

3.244 linhas · 141 pares · Σ 568.937,62 · cobertura 2024-01→2026-08 · `Competência` coerente
com `Ano + Mês Nº` em **3.244/3.244** linhas · 0 linhas com mais de 2 casas decimais ·
`Tipo` ∈ {Receitas (736), Despesas (2.508)}.

### 4.3 Verificação ao vivo via REST/service_role, 3 anos

| Ano | REX | REEMB | REXG | reconciliação |
|---|---|---|---|---|
| 2024 | 208.743,77 | −1.114.947,00 | **1.323.690,77** | fecha |
| 2025 | 439.628,52 | −954.174,41 | 1.393.802,93 | fecha |
| 2026 (jan–ago) | −79.434,67 | −420.205,87 | 340.771,20 | fecha |

REX e REXG(2024) **idênticos ao briefing e ao modelo da gerente**. 164 linhas (138 folhas +
26 blocos), bandeja 0, `relacao` derivada da cobertura (2026 = `corrente`, mês 8).
Números novos que o briefing não tinha: **REXG 2025 = 1.393.802,93** e **REXG 2026 = 340.771,20**.

### 4.4 Bandeja provada e revertida

Par inventado injetado na base (usei `PartnerShip - Cotas`, justamente o item do §5 do
briefing): **aparece na bandeja**, o **REX não se move**, e `base − linhas = bandeja`. Base
restaurada ao original em seguida (3.244 / 568.937,62 / 141 pares / bandeja 0).

### 4.5 Alarme de ingestão, ponta a ponta

Carga em lotes de 500 pelas mesmas RPCs que o cartão usa: **contagem bate, soma bate**.

### 4.6 A seção de caixa está intocada — medido, não afirmado

`git diff origin/main -- src/app/financeiro/dre/page.tsx` remove, no arquivo inteiro,
**exatamente 2 linhas**:

```
-import { hojeSP } from '@/lib/fmt'      (virou `hojeSP, fmtDataSP`)
-    <div>                               (virou `<div className="space-y-6">`)
```

Tudo o mais é acréscimo. O `<TabelaDre>` do caixa, o `<ResumoExecutivo>` e o `<RankingCaixa>`
não tiveram **um caractere** alterado — nem props, nem ordem, nem wrapper. O `space-y-6` no
`<div>` externo não tinha efeito visual enquanto havia um filho só.

Na `tabela-dre.tsx` a garantia é do mesmo tipo, por desenho: as 4 props novas são opcionais e
o default reproduz o caixa, então o caminho dele é o de antes. O ponto que exigiu cuidado foi
`totalModo`, que deixou de ser lido do estado direto (`totalModoEstado`) e passou por
`semPrevisto ? 'realizado' : totalModoEstado` — com `semPrevisto=false` é a identidade.

## 5. Parecer da revisão

### `revisor-db` — `0255`: **APROVADA** · `0256`: **APROVADA** · `0257`: **APROVADA COM RESSALVAS**

**ALTO (corrigido antes de existir call-site):** `dreBandejaSchema.categoria_id` é obrigatório e
a bandeja da competência nunca o emite. Como `bandeja` é campo obrigatório do envelope, um item
sem `categoria_id` derrubaria o `safeParse` do objeto **RAIZ**, `parseRpc` devolveria `null` e a
seção inteira desapareceria com um `console.error` — no **primeiro** par não mapeado, ou seja,
exatamente quando a bandeja precisava aparecer. Nasceu `dreCompBandejaSchema` próprio (com
`chave` textual como identidade) em vez de afrouxar o schema do caixa, que perderia a guarda de
lá.

**MÉDIO (endereçado):** o gerador validava existência de chave mas não **aciclicidade** — um
ciclo passaria pelo `CREATE VIEW` sem erro e o teto de profundidade da CTE produziria
coeficientes PARCIAIS em silêncio. O gerador ganhou detecção de ciclo (DFS com marcação).
**MÉDIO (endereçado):** faltava caso de contrato para a RPC nova — entraram 10.
**BAIXO ×3 (endereçados):** comentário da 0257 prometia campos "declarados como opcionais" que
não existiam no schema (agora existem, e são obrigatórios); regex de chave de fórmula não
aceitava dígito; `IMP_H` é `blocoH` **e** folha da aritmética e isso não estava documentado.

### `revisor` — M1: **APROVADO COM RESSALVAS**

**ALTO (medido, confirmado e corrigido):** o alarme de ingestão comparava centavos por dois
métodos que discordam. `Math.round(v*100)` opera sobre o float JS; o banco recebe a
representação **decimal** no JSON e aplica `::NUMERIC(18,2)`, que arredonda
meio-para-**longe-de-zero**. Medido: divergem em `1.005`, `-1.005`, `-0.125`, `-188.615`;
concordam em `188.615`, `0.125`, `2.675` **por acidente da representação binária** — o acordo é
imprevisível caso a caso. E há um segundo desacordo por REGRA, não por float: `Math.round`
desempata para +∞ e o Postgres para longe de zero, então **todo meio-centavo negativo discorda**
— e esta base é 2.508 despesas × 736 receitas.
Estava **LATENTE**: o arquivo de 25/08 não tem nenhuma linha com mais de 2 casas, e a soma não
muda (568.937,62 antes e depois). Teria virado **alarme falso reprovando um upload legítimo** no
dia em que o export trouxesse um valor de título dividido (`377,23 ÷ 2 = 188,615` é o padrão
documentado nesta família de dados). Nasceu `toCentavos` em `@/lib/carga/coercao`, e o parser
passou a emitir `valor` já em 2 casas — o enviado é idêntico ao gravado.
*(Nota de precisão: o parecer citava `188.615` como caso divergente; medido, esse positivo
específico não diverge. O mecanismo é real e se manifesta pelos negativos.)*

**MÉDIO ×2 (endereçados):** `Tipo` era coluna obrigatória sem validação por linha — em branco
passava com `null`, contra o próprio invariante "nada some em silêncio"; e
`status_demonstrativo_competencia` alimenta um **gate** e era lida por cast direto — ganhou
schema Zod + `parseRpc`, então contrato divergente faz o alarme falhar **fechado**.
**BAIXO ×4 (endereçados):** conferência cruzada da `Competência` tolera 1 dia (a coluna é `Date`
nativo lido em componentes locais — num fuso a oeste de UTC−3 a guarda acusaria um export
perfeito; mês trocado são ≥27 dias, então o poder da guarda fica intacto); guarda de extensão no
parser (arrastar-e-soltar burla o `accept`); limite superior de `ano`; cobertura no cartão em
`MM/AAAA`.
**BAIXO do `revisor-db` na 0255 (endereçado):** o header prometia uma garantia matemática que o
desenho não entrega literalmente; reescrito nomeando o ponto real de risco e o fail-closed.

### Conferência visual

⚠️ **NÃO VERIFICADA nesta sessão.** O `next dev` subiu e passou a ser alcançável pelo Edge
depois de bindar em `0.0.0.0` (o default `localhost` do Next 16 não atravessa a fronteira
Windows→WSL2 — armadilha registrada na v5.6.0 e agora com a causa e a saída nomeadas), mas
**não havia sessão autenticada** em nenhum dos dois hosts, e fazer login é barreira dura: o
gerenciador de senhas do Yan pré-preencheu o campo e clicar "Entrar" seria autenticar como ele.
Segue o modelo que funciona neste projeto (v5.4.1): **entregar → Yan confere no ar → ajustar**.

## 6. Pendências

### Do Yan (checkpoint da versão)

1. **Conferir o Demonstrativo por Competência contra o arquivo do Monde** (Total Geral por ano).
2. **Conferir as 3 linhas fundidas** (`Comissão`, `Reembolso Cliente`, `Reembolso Fornecedor`)
   contra o modelo da gerente.
3. **Alternar as pills de ano nos dois regimes** e confirmar que uma não move a outra.
4. **Conferir o cabeçalho de cobertura** e que a seção de caixa **não mudou em nada**.
5. **Comunicar o peso de critério à liderança** — a página passa a mostrar dois resultados para
   o mesmo mês. Texto pronto no CHANGELOG_DIRETORIA desta versão.
6. **Confirmar com a gerente:** `Reembolso Fornecedor - C` (em RV) × `Reembolso Fornecedor`
   (em REEMB) — tratamentos muito diferentes para nomes quase iguais.
7. Mergear o PR.

### Herdadas que esta versão NÃO resolve

Conferência visual em produção das v5.7.0/.1/.2 · comunicar a mudança de critério da DRE
(v5.7.0) à liderança · conceder a área `financeiro/dre` às roles · CSV da DRE ·
destrutiva `0254` (já aplicada; item de acompanhamento).

### ⚠️ Coordenação com a v5.9.0 (duas versões em voo)

Descoberto no fechamento, conferindo o remoto: existe a branch
`feat/v5-9-0-solicitacoes-aprovada-anexos` (PR #245 draft) com trabalho paralelo.

- **ADR:** ela **já tem `docs/adr/0169-solicitacao-etapa-aprovada-e-historico-nao-derivado.md`
  pushado**. O ADR desta versão nasceu 0169 e foi **renumerado para 0170** — a PR dela veio
  antes, e renumerar o meu não atropela ninguém. `ls docs/adr/` na worktree devolve 0168 como
  máximo porque a branch dela não está mergeada: **conferir numeração de ADR só na própria
  worktree é insuficiente quando há versão paralela em voo** — tem de olhar o remoto.
- **Migrations:** sem colisão. Esta versão usou `0255`–`0257` (aplicadas); a v5.9.0 reservou
  `0258` (na pasta dela) e `0259` (destrutiva, corretamente **ainda não escrita** na pasta).
- 🔵 **Fato que a outra sessão precisa saber:** a branch da v5.9.0 saiu do main na `0254` e
  **não contém** as `0255`–`0257`, que **já estão APLICADAS** em produção. Logo, um
  `npx supabase migration list` rodado lá vai mostrar três migrations "remote-only". Isso não
  quebra o `db push` dela (só a `0258` está pendente), mas é exatamente a classe de coisa que a
  própria v5.9.0 registrou como durável: *numeração entre branches paralelos falha em silêncio*.

### Registradas, fora de escopo

- **Editor da árvore/de-para de competência** — curadoria por migration nesta versão. ⚠️ Quando
  ele existir, **tem de recusar ciclo na gravação**: o teto de profundidade da CTE recursiva é
  rede contra laço infinito, não validação de corretude.
- **Cobertura fora da janela de 3 anos** não é oferecida nas pills (mesma limitação que o caixa
  já tem; hoje a base começa exatamente em 2024).
- Cards de KPI, linhas-chave, mix de receita, ponte competência↔caixa e orçado (§5 do briefing).

## 7. Aprendizado — régua de 5 destinos

1. **Enforcement mecânico (feito):** a aciclicidade da árvore virou validação no gerador do
   seed; a paridade SQL × anexo virou teste que lê o SQL aplicado.
2. **Skill `ingestao-planilhas` — DIVERGÊNCIA DE REDAÇÃO a corrigir:** ela diz "upload via API
   Route (nunca Server Action)", e as **5 bases vivas** usam Server Action. A regra existe para
   proibir enviar o `File`/buffer a uma Server Action; o caminho vivo parseia no Web Worker e
   manda **arrays já parseados**, o que a regra não pretendia proibir. Redação sugerida: *"o
   arquivo nunca vai para o servidor: o parse roda no cliente/Web Worker e só as linhas
   parseadas viajam — por Server Action, em lotes"*. **Vale também acrescentar `toCentavos`
   à skill**, com o motivo (comparar dinheiro entre JS e Postgres).
3. **Core:** nada. Nenhum aprendizado desta versão é transversal a toda sessão.
4. **Skill `banco-e-rpc`:** acrescentar o padrão "expansão da árvore em folhas signadas" como a
   forma de resolver fórmula que aponta para as duas direções da ordem — e a nota de que
   `HAVING sum(sinal) <> 0` transforma subtração em aritmética de coeficientes.
5. **Ritual:** o `/fechamento-versao` §4 ainda cita a remoção das cópias `0950–0954`; conferido
   nesta versão: **não existe nenhum arquivo `095*`**. É letra morta — podar (a fila do
   WORKING-CONTEXT já registrava isso).

**Duráveis desta versão:**

- *(a)* **Prove o invariante em forma fechada a partir do ANEXO, antes do SQL.** Aqui a prova de
  que `REX ≡ Σ base` saiu de contar chaves num CSV — 15 baldes na expansão, 15 baldes no de-para.
  Isso transformou o "oráculo" de uma conferência numérica frágil (que quebra a cada re-upload)
  numa identidade estrutural.
- *(b)* **Não compare dinheiro entre JS e Postgres multiplicando por 100.** `Math.round`
  desempata para +∞, `NUMERIC` desempata para longe de zero, e o float JS pode cair do lado
  errado do meio. Em base majoritariamente negativa, o desacordo é a regra, não a exceção.
- *(c)* **Schema compartilhado entre duas fontes é um apagão à espera de acontecer quando o
  campo obrigatório é a identidade.** O item que falha derruba o parse do envelope, não só a
  linha dele — e no pior momento possível, que é justamente quando o caso raro aparece.
- *(d)* **Migration com seed grande se GERA, não se transcreve.** 141 pares, um deles com vírgula
  dentro do campo. O gerador é também onde as validações moram.
- *(e)* **`accept` de input não cobre arrastar-e-soltar.** Se o parser depende do tipo nativo da
  célula, a extensão precisa de guarda no parser.
- *(f)* **`.passthrough()` do Zod arrasta um índice `unknown` que quebra o estreitamento por
  `'x' in obj` no consumidor.** Tolerância na leitura, tipo explícito na fronteira.
- *(g)* **Next 16 em WSL2 precisa de `-H 0.0.0.0` para o browser do Windows alcançar.** O
  default `localhost` fica invisível de fora da WSL — o que a v5.6.0 registrou como "o Chrome
  não alcança o localhost do WSL2" tem essa causa e essa saída.

## 8. Arquivos

**Migrations:** `supabase/migrations/0255_raw_demonstrativo_competencia.sql`,
`0256_dre_competencia_estrutura.sql` (gerado), `0257_get_dre_competencia_mensal.sql`

**Novos:** `src/lib/carga/parse-demonstrativo-competencia.ts` (+ `.test.ts`) ·
`src/lib/dre/competencia-estrutura.test.ts` · `scripts/gera-seed-dre-competencia.mjs` ·
`docs/adr/0170-dre-por-competencia-arvore-propria.md`

**Alterados:** `src/lib/carga/coercao.ts` (+ `.test.ts`) · `src/lib/carga/parse.worker.ts` ·
`src/lib/schemas-rpc.ts` · `src/lib/dre/schemas.ts` · `src/lib/rpc-contrato.test.ts` ·
`src/app/admin/uploads/page.tsx` · `src/app/admin/uploads/actions.ts` ·
`src/app/financeiro/dre/page.tsx` · `src/components/financeiro/dre/tabela-dre.tsx` ·
`CHANGELOG.md` · `src/data/changelog-diretoria.ts` · `package.json` · `docs/WORKING-CONTEXT.md`

## 9. Gates

`npx tsc --noEmit` 0 · `npm run lint` limpo · `npm run build` limpo · **`npm test` 1044/1044**
(eram 998 na v5.7.2: +46). Migrations aplicadas via `npm run db:migrate -- --aditiva` com
backup-gate **VERDE** (54/54 tabelas, restore-test spot em 3 tabelas). RPC nova verificada
**via REST com service_role**, executando o corpo. Nenhuma migration destrutiva pendente na
pasta.
