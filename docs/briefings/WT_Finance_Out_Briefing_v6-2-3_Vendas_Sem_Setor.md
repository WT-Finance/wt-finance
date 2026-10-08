# Out-briefing — v6.2.3 · Vendas por Produto: venda sem Setor deixa de derrubar a carga

Patch pedido pelo Yan em 08/10/2026 (rota C com gates; sem briefing — o pedido foi explícito: "permitir
que ignore vendas sem setor, pois ela permanecerá assim apenas por um tempo curto e se resolverá
posteriormente"). Branch `fix/v6-2-3-vendas-sem-setor`, **PR #297**. **Migration 0291 (aditiva, APLICADA 08/10).**
Sem ADR, sem RPC nova (assinatura de `validar_carga_staging` inalterada → `database.ts` não muda).

## 1. Resumo

O Monde deixa, em casos raros, a venda ser lançada **sem Setor** até a forma de pagamento ser informada.
O parser já aceitava a célula vazia (só exige a COLUNA no cabeçalho); quem recusava era a guarda de
dimensões de `public.validar_carga_staging()` (0132, ajustada na 0284): setor nulo ⇒ `setor_macro` nulo ⇒
passa no `IS DISTINCT FROM 'Welcome'` ⇒ não existe em `analytics.dim_setor` ⇒ **a carga inteira** era
recusada com "setor=«∅»". Reproduzido contra produção em transação revertida (§4).

Correção — "ignorar" de forma coerente, não só afrouxar a guarda:

1. **A linha sem setor fica no cru** (`raw.vendas_excel`): o checksum do arquivo continua fechando.
2. **Sai da leitura** — `analytics.vendas_excel_para_fato` passa a filtrar
   `setor_macro IS NOT NULL AND setor_macro IS DISTINCT FROM 'Welcome'`. Por ela, some também do
   transform e dos seis leitores de Weddings/Vendas em Aberto. Volta sozinha na primeira carga em que o
   setor vier (a promoção é substituição completa).
3. **Não é silencioso** — aviso não-bloqueante com a contagem e os números de venda: na **conferência**
   (parse, `avisoLinhasSemSetor`, antes do humano confirmar) e na **aplicação** (`validar_carga_staging`,
   chave nova `sem_setor`). Chega a `alarmes[]` da resposta, ao modal do card e ao log da carga.
4. **Caso-limite fechado** — carga em que NENHUMA linha passa no predicado (coluna Setor vazia no export
   inteiro, ou arquivo só-Welcome) **reprova**. Sem isso, a promoção esvaziaria `fato_venda` (achado ALTO
   do `revisor-db`, §7).

Na base viva de 08/10 há **zero** linhas com setor nulo (49.521): nenhum número de hoje mudou com a 0291.

## 2. Decisões técnicas

- **Por que tirar da VIEW e não só afrouxar a guarda.** Afrouxar só a guarda deixaria a venda entrar em
  `analytics.fato_venda` (que não olha setor) como **cabeçalho sem itens** — o INNER JOIN de
  `fato_venda_item` com `dim_setor` a descarta. Contaria como venda (e como contrato, se o produto fosse
  "Contrato de casamento") sem valor nenhum. Pela view ela some de todos os leitores de uma vez.
- **Inversão deliberada da regra "NULL passa" da 0277/0283.** Lá o `IS DISTINCT FROM` existia para a
  linha sem setor NÃO sumir em silêncio. Agora ela sai de propósito, e com aviso. COMMENTs da view e da
  função atualizados para não contradizer o catálogo.
- **Corpo de partida = catálogo vivo.** Dump READ ONLY de 08/10: a função viva era byte a byte a da 0284;
  a view tinha as 25 colunas de `raw.vendas_excel`, dono `postgres`, ACL vazia — o `OR REPLACE` da view
  preserva tudo isso e os dependentes (`vw_vendas_agregadas`).
- **Aviso sem duplicar.** Na aplicação quem avisa é o SQL; na conferência (sem staging) é o parse — o
  ramo de conferência de `carga.ts` acrescenta o aviso só ali. Mesma contagem e mesmas vendas nos dois
  (venda sem número conta como «∅»); o texto muda só no tempo verbal ("ficarão" × "ficaram").
- **Venda mista** (itens com e sem setor na mesma venda): não observada, não medida. Só os itens sem
  setor saem; a venda entra com os demais (valor subestimado enquanto durar). O aviso fala em LINHAS por isso.

## 3. Arquivos

- `supabase/migrations/0291_ingestao_vendas_ignora_sem_setor.sql` — nova (view + função + COMMENTs).
- `supabase/baseline/schema-v6.json` — regenerado: exatamente 3 diferenças (hash da view, hash da
  função, `ultima_migration` 0291).
- `src/lib/ingestao/parsers/vendas-produto.ts` — `vendasDistintasQueEntramNoFato` espelha o predicado;
  `avisoLinhasSemSetor` novo.
- `src/lib/ingestao/carga.ts` — aviso na conferência; comentário do "depois" corrigido.
- `src/lib/ingestao/aplicar.ts`, `src/lib/schemas-rpc.ts` (`sem_setor` `.optional()`) — comentários/schema.
- Testes: `src/lib/ingestao/oraculo-vendas.test.ts` (predicado com setor nulo SAI; parse com setor vazio,
  nulo e NBSP; aviso; **paridade SQL×TS** lendo a 0291), `src/lib/rpc-contrato.test.ts` (shape com
  `sem_setor`), `src/lib/ingestao/sonda-leitores-vendas-excel.test.ts` (justificativas da lista fechada).
- Harness: skills `ingestao-planilhas` §8 e `banco-e-rpc` §5, checklist do `revisor-db` (D-12).
- `CHANGELOG.md`, `src/data/changelog-diretoria.ts`, `package.json`/`package-lock.json` (6.2.3),
  `docs/WORKING-CONTEXT.md`.

## 4. Gates e prova

- **Ensaio da 0291 em transação revertida contra produção** (skill `banco-e-rpc` §6, precedente 0285;
  script pontual, não commitado; chave `ZZ_TESTE_0291`; `lock_timeout` 3s; nenhum COMMIT). Staging =
  cópia da base viva + 2 linhas de uma venda sem setor:
  - função **antiga**: `ok:false`, "2 venda(s) com setor/setor_micro fora das dimensões … setor=«∅»" —
    o sintoma relatado;
  - função **nova**: `ok:true`, aviso "2 linha(s) sem Setor no Monde, de 1 venda(s) … ZZ_TESTE_0291";
  - **controle**: setor inexistente na dimensão continua reprovando;
  - **todas as 49.523 linhas sem setor**: reprova ("Nenhuma das 49523 linha(s) …");
  - **só Welcome**: reprova;
  - view 49.307 linhas antes e depois; após o ROLLBACK, catálogo e staging de volta ao original, resíduo 0.
- **Aplicação:** `npm run db:migrate -- --aditiva` — backup-gate VERDE (81/81 tabelas, restore-test 3/3).
  Pós-push: view e função novas no catálogo; REST `service_role` 200 (early return com staging vazia —
  os ramos novos foram provados no ensaio).
- **Gates completos na worktree:** `npm run build` ✓ · `npx tsc --noEmit` ✓ · `npm run lint` ✓ ·
  `npm test`: **1.971 verdes**, 6 pulados, 1 suíte vermelha = `oraculo-demonstrativo` por
  `demonstrativo-cru.xlsx` ausente (**B-38**, pré-existente, idêntico às v6.2.0–v6.2.2). Oráculo de Vendas
  com `REQUIRE_FIXTURES=1` verde (fixtures de `~/projects/arquivo-worktrees-janus/fixtures-ingestao/`):
  continua fechando 29.458 vendas distintas — as fixtures não têm venda sem setor.
  Um caso de `rpc-contrato` (`get_repasse_mensal`) deu timeout numa rodada e passou isolado (latência da
  RPC viva, sem relação).
- **Visual:** N/A — nenhuma tela mudou; o aviso aparece pelo canal já existente (`alarmes[]` → modal/
  mensagem de sucesso do card).

## 5. Não verificado pela sessão

- **A carga real com a venda sem setor.** A sessão não tem o arquivo que quebrou. A prova final é o Yan
  re-subir o export (ou esperar a próxima RPA) e ver a carga passar com o aviso nomeando a venda.

## 6. Pendências — o que só o Yan tem

- 🔴 **Mergear o PR** e confirmar a leitura de produto abaixo.
- **Confirmar a leitura de produto do "ignorar":** enquanto a venda estiver sem setor ela **some** de
  `fato_venda`, de Weddings (operações, carteira, convidados), de Vendas em Aberto/Rateio e do "depois"
  do diff — o vendedor não é creditado por ela até a carga em que o setor vier. Foi o pedido ao pé da letra.
- **Decisão de produto em aberto — limiar.** Hoje só "TODAS as linhas sem setor" reprova; um export com,
  digamos, 80% sem setor passa só com aviso. Quer um limiar percentual que reprove?
- **Decisão de produto em aberto — alarme de venda presa.** O único rastro durável do aviso é o
  `alarmes[]` do log da carga; a RPA diária imprime só `alarmes=N`. Uma venda parada sem setor por
  semanas não gera e-mail. Quer alarme (ex.: venda sem setor há mais de N cargas)?

## 7. Parecer da revisão

**`revisor`** — APROVADO COM RESSALVAS, sem CRÍTICO/ALTO.
- MÉDIO · aviso só existia na APLICAÇÃO, não na conferência → **corrigido** (`avisoLinhasSemSetor` no
  ramo de conferência).
- MÉDIO · venda sem setor some sem alarme durável → **registrado** (§6, decisão de produto).
- MÉDIO · `sem_setor` sem caso em `rpc-contrato.test.ts` → **corrigido**.
- MÉDIO · baseline vai divergir → **feito** após a aplicação (3 diferenças, lidas antes de aceitar).
- BAIXO · sem teste de paridade SQL×TS → **corrigido** (teste estático lendo a 0291: predicado da view +
  4 ocorrências na função).
- BAIXO · teste cobria só `setor: ''` → **corrigido** (nulo e NBSP/tab).
- BAIXO · venda mista → **registrado** (§2) e texto do aviso passou a falar em linhas.
- BAIXO · `left(…, 300)` sem reticências → mantido (mesmo padrão da guarda existente; contagem vem antes).
- BAIXO · comentários velhos (`schemas-rpc.ts`, sonda, `aplicar.ts`) → **corrigidos**; skills/revisor-db
  → **atualizados** (D-12).

**`revisor-db`** — CORREÇÕES NECESSÁRIAS → re-revisão: **nenhum CRÍTICO/ALTO remanescente**.
- ALTO · guarda fail-open para arquivo inteiro sem setor (promoção esvaziaria `fato_venda`) →
  **corrigido** antes da aplicação (guarda "nenhuma linha passa ⇒ reprova", cobre também só-Welcome) e
  provado no ensaio revertido.
- MÉDIO · smoke REST não exercita o código novo → **feito** o ensaio em transação revertida (§4).
- MÉDIO · lock do `OR REPLACE` da view atrás de uma promoção → registrado no header; aplicação ocorreu
  sem carga em andamento (staging vazia).
- BAIXO · contagem do aviso ≠ lista com `venda_numero` nulo → **corrigido** (mesmo `coalesce`).
- BAIXO · COMMENT da view com justificativa enganosa do `IS DISTINCT FROM` → **corrigido**.
- BAIXO · limiar percentual → **registrado** (§6, produto).

**Desvio de ordem, registrado:** a regra é `revisor-db` ANTES de aplicar. A 1ª revisão foi antes; a
correção do ALTO foi provada no ensaio revertido (todos os cenários, inclusive o do ALTO) e a 0291 foi
aplicada; a **re-revisão da correção veio depois da aplicação**. Ela não achou nada — se tivesse achado, o
caminho seria uma 0292 aditiva.

Classificação ADITIVA confirmada; OR REPLACE preserva dono/ACL/dependentes; predicado idêntico nas 4
ocorrências; checksum de `promover_carga_vendas` e `ingestao_soma_por_ano` sem efeito colateral.

## Advisor

Orquestrador: 2 consultas. (1) Antes de escrever — endossou o desenho (view + guarda + aviso + contador)
e acrescentou COMMENTs, lista de vendas no aviso, ambiente da worktree (`.env.local`/fixtures) e o registro
da consequência de produto; mudou o rumo em escopo, não em direção. (2) Antes de declarar concluído —
pediu o nº do PR nos docs, o registro do desvio de ordem da re-revisão e a re-execução dos testes após o
bump; não mudou o rumo. Subagentes (`revisor`, `revisor-db`): 0. Custo: pendência do Yan (`/usage`).
