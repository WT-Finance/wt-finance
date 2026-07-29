# Out-Briefing — v5.3.1 · DRE: Resumo Executivo + Decomposição dos Lançamentos

**Tipo:** PATCH · **Base:** `main` @ v5.3.0 (merge `36e609e`) · **Branch:** `feat/v5-3-1-resumo-decomposicao`
**Migration:** aditiva **0209** (`get_decomposicao_bloco`) — ⚠️ **ESCRITA E REVISADA, MAS NÃO APLICADA** (ver §7)
**ADR:** nenhum novo — **emenda ao ADR-0156** com o raciocínio da troca de fonte
**Data:** 2026-07-28

Fecha a adaptação do modelo da controladoria: duas peças na aba `/financeiro/dre`.

---

## 1. Missões implementadas

### M1 — Resumo Executivo

6 linhas-chave × 6 colunas, **dentro do mesmo card** da DRE, abaixo da tabela.

| linha exibida | chave | observação |
|---|---|---|
| Saldo Repasse | `REPASSE` | `tot` |
| Receita Bruta | `RB_H` | ⚠️ é `tipo:'blocoH'`, **não** `'tot'` |
| Receita Op. Líquida | `ROL` | `tot` |
| Lucro Bruto | `LB` | `tot` |
| Lucro Operacional | `LOP` | `tot` |
| Resultado do Exercício | `REX` | `tot` |

**Correção ao briefing:** a chave da Receita Bruta é **`RB_H`** (o briefing a chamava de `RV-bruta`, que não existe), e ela é `blocoH`, não `tot`. Uma implementação que filtrasse `t === 'tot'` para "achar os totalizadores" deixaria a Receita Bruta silenciosamente de fora. O campo `formula` (que distinguiria agregador de folha) **não viaja** no payload de `get_dre_mensal`, então o conjunto de chaves é necessariamente estático no front — documentado no cabeçalho do componente.

**Colunas:** `2024 | 2025 | Δ 24→25 | YTD 25 | YTD 26 | Δ YTD`, rótulos derivados de `anoCorrente` (andam sozinhos em 2027). **Δ em REAIS** (subtração), nunca %. Falta de operando ⇒ travessão, **nunca `0 − X`**.

**Custo de rede: ZERO.** A página já buscava `anosDisponiveis = [corrente-2, corrente-1, corrente]` **incondicionalmente** (`page.tsx`), independente do `?ano=`. O Resumo consome o **mesmo `consolidadoAnos`** que alimenta a visão Consolidado — não há segundo caminho de cálculo, e o `TabelaDre` já recebia esse prop. Nenhuma chamada nova foi acrescentada.

**Ancoragem no ANO CORRENTE:** o Resumo ignora a pill de ano. Verificado ao vivo (§5).

**YTD nunca recalculado:** vem pronto de `porLinha[].ytd` (janela `mesJanela`, ancorada em `hojeSP()` na página). O componente **não contém `Date` nenhum** — recalcular a janela foi exatamente o bug que o Yan pegou na rodada 8 da v5.3.0.

### M2 — Fonte da Decomposição: o "reusa o que já existe" foi MEDIDO e descartado

O briefing preferia zero migration reusando `get_decomposicao_categoria`. **Medi em produção antes de decidir** — e ela não serve:

| desalinhamento | evidência medida (janela 2026-01-01..2026-07-31) |
|---|---|
| **não filtra `tipo`** — soma `realizado` + `previsto` | **699 linhas** de previsto, **R$ 4.327.007,77** em valor absoluto (net −566.853,19), com competência **retroativa até 05/01** (título vencido em aberto: 0187 usa competência = vencimento, sem piso) |
| **ignora `excluida`** | as 2 categorias de transferência interna somam net **−R$ 30.000,00** — ou seja, **não se anulam sozinhas** |
| agrupa pelo **grupo nativo do Monde** | 20/130 categorias são re-parenteadas pelo de-para curado |

`NOT pos_corte` não ajuda: `pos_corte` é o corte de **horizonte** (competência > 31/12/2028), não o discriminador realizado × previsto.

Isso violaria dois invariantes da versão ("sempre REALIZADO" e "reconcilia com a tabela"), então segui o caminho aditivo que a própria M2 prevê.

**Também descartado:** derivar de `get_dre_mensal` (zero migration — ela já vem na leva). Devolve **baldes mensais**: atende as 5 pills alinhadas a mês, mas torna **"Personalizado ao dia" impossível** (não há como recortar sub-mês) e exigiria costurar meses de dois anos na virada. Degradar o Personalizado em silêncio é a classe de defeito que este projeto pune.

**`get_decomposicao_bloco(p_from, p_to)` (0209):** aplica o MESMO filtro (`tipo='realizado'`) e o MESMO de-para (`dre_categoria_map WHERE NOT excluida`) de `get_dre_mensal`, num intervalo livre. Devolve o net **SIGNADO** por bloco e por categoria (`bloco_chave NULL` = não classificada). Signado, e não ABS, porque é o que reconcilia e o que permite derivar o LADO do próprio dado — `dre_bloco` **não tem** coluna de sinal.

### M3 — Visual + lugar

- Card **adaptado, não recriado**: donuts saíram, entraram **barras horizontais** proporcionais ao maior do lado (rótulo à esquerda, valor à direita), mantendo Entradas | Saídas, o top-N e a **drill com voltar**.
- Fatia agregada virou **"Outros (N blocos)"** — o agrupamento agora é por bloco; manter "grupos" descreveria o mecanismo antigo.
- **Rótulos completos sem prefixo contábil** via `rotuloBloco()` (helper puro + 11 testes), que remove `(+)`/`(-)`/`(=)`/`=` iniciais e **preserva o hífen no MEIO** (`Movimentação de Caixa - C` não pode ser mutilado). Não faz title-case: mangularia siglas ("RH") e preposições.
- **Bandeja "Não classificadas"** sempre visível, **fora** do "Outros" (política da plataforma: nada some em silêncio). Hoje está vazia — medi: **zero** categorias sem de-para com movimento e **zero** lançamentos realizados sem categoria. Categoria nova do Monde nasce aqui.
- **Estorno tratado explicitamente:** categoria com sinal OPOSTO ao do bloco existe de verdade (**9 casos** medidos: RH 6/24, RHB 2/12, ESTR 1/9). A noção de **contribuição** (`saida ⇒ −valor`) garante que Σ das categorias seja exatamente a magnitude do bloco; o estorno aparece **entre parênteses** ("reduz o total") sem inventar um terceiro lado.
- **Pills padrão dentro do card** (default "Este ano (YTD)"), injetadas por `slotPills` — o card fica apresentacional e não importa router.
- Título "Decomposição dos Lançamentos", **sem subtítulo**. Card movido para a TopSection **"Regime de Caixa"**; a TopSection própria foi **aposentada sem órfãos** (título/subtítulo, `defaultAberto={false}`, o wrapper de card que causaria card duplo, o parágrafo explicativo e as duas interfaces locais duplicadas saíram junto).
- O aviso de "regime contábil" **já não existia** desde a 0188 — só restava o comentário histórico, atualizado.

### Extra (não pedido, mas é a classe de defeito que o projeto pune)

**Falha ≠ vazio.** A RPC do período falhar e a tela dizer "sem lançamentos no período" seria dado errado parecendo certo. Os dois estados são distintos, e **as pills continuam visíveis nos dois** — sem elas o usuário ficaria preso no período que quebrou.

---

## 2. Reconciliação (provada, não afirmada)

**Raciocínio:** as colunas mensais de `get_dre_mensal` são `Σ valor FILTER (tipo='realizado')` por mês de competência — o previsto do mês corrente viaja em `prev_corrente` e os vencidos em `venc`, **ambos fora de `meses[]`**. A 0209 aplica o mesmo filtro e o mesmo de-para. Logo o net por bloco fecha ao centavo em toda janela alinhada a mês.

**Medição (jan..jul/2026, os 18 blocos analíticos) — delta 0,00 em TODOS:**

| bloco | RPC nova (SQL) | tabela YTD | delta |
|---|---:|---:|---:|
| ENT_H | 18.495.593,42 | 18.495.593,42 | 0,00 |
| PAG_H | −18.292.382,85 | −18.292.382,85 | 0,00 |
| RV | 8.895.749,47 | 8.895.749,47 | 0,00 |
| IMP_H | −2.635.180,55 | −2.635.180,55 | 0,00 |
| CUSTO | −695.376,38 | −695.376,38 | 0,00 |
| ADM | −209.373,56 | −209.373,56 | 0,00 |
| COM | −935.769,60 | −935.769,60 | 0,00 |
| IMOB | −187.258,36 | −187.258,36 | 0,00 |
| FIN | −303.679,25 | −303.679,25 | 0,00 |
| MKT | −410.649,16 | −410.649,16 | 0,00 |
| ESTR | −232.979,55 | −232.979,55 | 0,00 |
| RH | −2.467.411,27 | −2.467.411,27 | 0,00 |
| RHB | −446.838,64 | −446.838,64 | 0,00 |
| RFIN | 58.865,02 | 58.865,02 | 0,00 |
| RNOP | 88.417,55 | 88.417,55 | 0,00 |
| DNOP | −676,07 | −676,07 | 0,00 |
| INV | −166.464,42 | −166.464,42 | 0,00 |
| DIST_LUCROS | −410.483,72 | −410.483,72 | 0,00 |

**Soma dos 18 = R$ 144.102,08**, que é exatamente o **`REX` YTD 26** que o Resumo Executivo exibe na tela (§5) — reconciliação cruzada entre as duas peças novas.

**Resumo × totalizadores da tabela** (conferido na tela, com `?ano=2024`): a coluna "2024" do Resumo == "TOTAL DO ANO" da tabela, linha a linha — Saldo Repasse `(1.504.229,00)`, Receita Bruta `4.244.707,03`, ROL `2.641.771,11`, Lucro Bruto `1.169.226,30`.

**A igualdade deixou de ser anedota:** virou 3 casos vivos em `rpc-contrato.test.ts` — shape, reconciliação contra o **mês fechado anterior** (calculado a partir de `hojeSP()`, então não apodrece), e conservação (`Σ categorias classificadas == Σ blocos`; excluídas fora). Se alguém alterar uma das duas funções e a igualdade cair, estoura no teste, **não na tela do usuário**.

---

## 3. Parecer da revisão

`revisor` e `revisor-db` despachados em paralelo, **antes dos gates**. Ambos: *aprovado com ressalvas*.

### ALTO — endereçados

1. **`revisor`: o Resumo desaparecia no fail-safe da tabela.** `<ResumoExecutivo>` só existia no `return` final; o early-return de `dados === null` o omitia. E o achado é forte porque o ano navegado é **sempre** um dos 3 anos-âncora: bastava a chamada DELE falhar (são independentes no mesmo `allSettled`) para o Resumo sumir **tendo fonte própria intacta** — o inverso do invariante. **Corrigido:** renderizado nos dois ramos (ele já se auto-oculta se nenhum ano-âncora carregar).
2. **`revisor-db`: faltava o caso de contrato da RPC nova.** É convenção explícita do projeto e o único gate que pega drift de schema (o `tsc` não pega — validação é runtime). **Corrigido**, e aproveitei a sugestão de cruzar a reconciliação no próprio teste (§2).

### MÉDIO — endereçados

3. **`revisor-db`: faltava `NOTIFY pgrst, 'reload schema';`** — padrão de todas as migrations irmãs que criam RPC. Sem ele, um reload que não dispare a tempo faz a verificação REST devolver `PGRST202`, que se diagnostica como bug no corpo quando é só cache. **Acrescentado.**
4. **`revisor`: afirmação FALSA no header da 0209.** Eu havia escrito que as RPCs antigas "seguem servindo a área `executiva`" — não é verdade: a `/executiva` consome `get_decomposicao_variacao`, outra função. Elas ficam **órfãs por efeito desta versão**. **Corrigido** — e a justificativa errada era pior que a omissão, porque mandaria a limpeza futura procurar consumidor no lugar errado.

### MÉDIO/BAIXO — registrados com justificativa (não alterados)

5. **Hex crus nas paletas** (`#7E9658` etc.), que o lint não pega porque vão em `style={{}}` e não em classe. São **pré-existentes** e documentados como intencionais (tons intermediários do degradê sem token). Convertê-los para `color-mix` **mudaria cores que o Yan já validou** — é alteração visual sem pedido. Fica como follow-up junto da tokenização do `zinc`.
6. **Bloco com net ~zero é omitido** (épsilon), quando categorias grandes do mesmo bloco se cancelam quase por completo. Não é omissão silenciosa: um bloco de net zero **não tem lado nem comprimento de barra**, a tabela logo acima mostra a mesma linha com travessão, e o payload da RPC continua íntegro (o teste de conservação prova). Documentado em comentário no ponto do filtro.
7. **`PALETA_ENTRADAS` tem 5 tons e `MAX_FATIAS` é 6** → um 6º bloco de Entradas repetiria a cor do 1º. Na estrutura real Entradas tem ~4 blocos analíticos, então não ocorre hoje. Documentado. O comentário **errado** que dizia que o 7º tom de `PALETA_SAIDAS` era "reservado p/ Outros" foi corrigido (é inalcançável; "Outros" tem cor própria).
8. **Casas decimais**: barras em `fmtBRL` (reais) com o valor exato em `title`, drill em `fmtContabil` (centavos). Racional: barra = panorama, drill = detalhe. **Ponto de produto para o checkpoint** — se o Yan preferir centavos na barra, é uma linha.
9. `loading.tsx` e o comentário de `top-section.tsx` ficaram stale por efeito desta mudança — **atualizados** (silhueta nova: tabela → Resumo → Decomposição, seção única).

---

## 4. Gates

| gate | estado |
|---|---|
| `npx tsc --noEmit` | ✅ **0 erros** |
| `npm run lint` (arquivos tocados) | ✅ **limpo** |
| `npm run build` | ✅ **limpo** |
| `npm test` | ⚠️ **493 testes: 490 passam, 3 falham** — os 3 são os casos novos de contrato, pendentes da migration (`PGRST202`) |

- Contagem: 479 pré-existentes (v5.3.0) + **11 novos** de `rotulo-bloco.test.ts` (passam) + **3 novos** de contrato = 493.
- Os 3 casos novos de `rpc-contrato.test.ts` falham **exclusivamente** porque `get_decomposicao_bloco` ainda não existe em produção. Passam assim que a 0209 subir.
- `src/lib/monde/virada-paridade.test.ts` falhou uma vez na suíte completa com `EAUTHQUERY ... secret check timed out` e **passa isolado** — flake de conexão sob carga paralela, sem relação com esta versão.

---

## 5. Conferência visual ao vivo (invariante da versão)

Feita no browser sobre dado real, na parte que não depende da migration:

- ✅ Sidebar em **5.3.1**; **"REGIME DE CAIXA"** é a única seção; a TopSection da Composição **sumiu sem deixar buraco**.
- ✅ Resumo Executivo com cabeçalho em banda, rótulos dinâmicos corretos, formato contábil com parênteses, Δ coloridos por sinal, `tabular-nums`.
- ✅ **Aritmética dos Δ conferida célula a célula**: `3.651.090,06 − (−1.504.229,00) = 5.155.319,06`; `203.210,57 − 2.294.447,98 = (2.091.237,41)` (vermelho); `(523.172,98) − (5.234.740,60) = 4.711.567,62`.
- ✅ **ANCORAGEM CONFIRMADA:** com `?ano=2024` a tabela trocou para 2024 e o Resumo ficou **idêntico** (mesmas colunas, mesmos valores, YTD 26 seguindo em 2026).
- ✅ Resumo aparece nas **duas visões** (Mensal e Consolidado) — compartilham o card.
- ✅ Decomposição: título sem subtítulo, **6 pills dentro do card** com "Este ano (YTD)" ativa, e o **estado de falha honesto** ("Não foi possível carregar a decomposição deste período — tente outro período") com as pills preservadas.
- ✅ Log do servidor: o único erro é o `PGRST202` esperado, tratado — **a página não caiu**.
- ⏳ **Não verificável ainda:** barras, drill "Outros (N blocos)", troca de pills e a reconciliação visual das barras — dependem da 0209.

---

## 6. Arquivos

**Novos:** `supabase/migrations/0209_get_decomposicao_bloco.sql` · `src/components/financeiro/dre/resumo-executivo.tsx` · `src/lib/dre/rotulo-bloco.ts` · `src/lib/dre/rotulo-bloco.test.ts` · este out-briefing

**Renomeado + reescrito:** `src/components/financeiro/composicao-lancamentos.tsx` → `decomposicao-lancamentos.tsx` (via `git mv`, preservando histórico)

**Editados:** `src/app/financeiro/dre/page.tsx` · `src/app/financeiro/dre/loading.tsx` · `src/components/financeiro/dre/tabela-dre.tsx` · `src/components/shared/top-section.tsx` (comentário) · `src/lib/dre/schemas.ts` · `src/lib/rpc-contrato.test.ts` · `CHANGELOG.md` · `src/data/changelog-diretoria.ts` · `package.json` · `docs/adr/0156-*.md` (emenda) · `docs/WORKING-CONTEXT.md`

**Refactor de tipo:** `RegistroAnoLinha`/`ConsolidadoAno` saíram de `tabela-dre.tsx` para `@/lib/dre/schemas` — a partir desta versão há **dois** consumidores do mesmo payload, e tipo duplicado estruturalmente entre componentes é como nasce o drift.

---

## 7. ⚠️ PENDENTE — o que precisa da mão do Yan

### 7.1 Aplicar a migration 0209 (bloqueada por permissão do harness)

`npm run db:migrate -- --aditiva --fora-de-ordem` foi **bloqueado pelo classificador de permissões** do harness. **Não contornei**: aplicar por `db push` cru ou injetar a função via `db query` puraria o backup-gate (ADR-0116) e/ou criaria drift no histórico de migrations.

As **cópias untracked 0950–0954** já estão POSICIONADAS na worktree (extraídas de `origin/feat/v5-4-0-api-externa`) — são necessárias porque elas ocupam o topo do histórico remoto. Rodar da raiz da worktree:

```bash
npm run db:migrate -- --aditiva --fora-de-ordem
```

O wrapper classifica só o conjunto **pendente** (= a 0209), e o `revisor-db` confirmou que ela classifica como **aditiva**.

**Depois de aplicar, verificar VIA REST com service_role** (a introspecção por `db query` **não** executa o corpo — foi assim que `max(uuid)` chegou a produção na v5.2.1):

```bash
curl -s -X POST "$URL/rest/v1/rpc/get_decomposicao_bloco" \
  -H "apikey: $SVCKEY" -H "Authorization: Bearer $SVCKEY" \
  -H "Content-Type: application/json" -d '{"p_from":"2026-06-01","p_to":"2026-06-30"}'
```

Depois: `npx vitest run src/lib/rpc-contrato.test.ts` (os 3 casos novos devem passar) e **remover as cópias 0950–0954 antes do merge**.

### 7.2 Checkpoint do Yan

- Resumo contra a tabela **e contra a planilha da controladoria** (a parte "contra a tabela" já está conferida em §2/§5).
- Trocar as pills da Decomposição (YTD, este mês, últimos 3, personalizado) conferindo a reconciliação das barras — **só possível após 7.1**.
- Conferir os rótulos das barras. **Observação:** 3 dos 18 blocos vêm do seed em **CAIXA ALTA** (`ENTRADA DE CLIENTES`, `PAGAMENTO AO FORNECEDOR`, `IMPOSTOS E DEDUÇÕES DA RECEITA BRUTA`) e 15 em Title Case. Exibo o rótulo **fiel** ao dado (title-case automático mangularia siglas e preposições); se incomodar, o ajuste é **no editor da estrutura**, não em código.
- Decidir sobre §3, item 8 (centavos na barra) e confirmar a posição do botão "Editar estrutura", que agora fica no rodapé do card, **abaixo** do Resumo.

### 7.3 Reconciliar a hora do `CHANGELOG_DIRETORIA`

A entrada nasceu com a hora real de autoria (`2026-07-28T11:58`). Reconciliar ao horário real do merge (`git log --merges`, fuso −03).

---

## 8. Registros para o futuro (não implementados — fora de escopo)

- **`get_decomposicao_grupo`/`get_decomposicao_categoria` ficam ÓRFÃS** por efeito desta versão (o card desta página era o único consumidor vivo). Nenhuma foi removida. DROP futuro exige a verificação de consumidores reais de sempre — app **e** `supabase/seed/` —, que é exatamente onde a v4.17.1 se enganou.
- **`resolverPeriodoCompleto` (`src/lib/periodo.ts`) NÃO ancora em `hojeSP()`** — recebe `new Date()` cru e resolve os presets com `date-fns` no fuso do processo. Se o runtime rodar em UTC, entre ~21h e a meia-noite de SP as pills "Este mês"/"Este ano" podem virar o mês/ano **antes da hora**. É a mesma classe do fix sistêmico 0152/ADR-0125, que cobriu só o lado do Postgres. **Pré-existente e transversal** (Fluxo de Caixa e DRE usam), fora do escopo desta versão — mas é o próximo candidato real de correção de fuso.
- **`pos_corte` não é filtrado** nem pela 0209 nem por `get_dre_mensal` — **simétrico**, então não afeta a reconciliação, e irrelevante hoje (`pos_corte` marca competência > 31/12/2028). Se um dia uma das duas ganhar o filtro, a outra precisa ganhar junto.
- `PeriodoFilterPillsUrl` hand-rola as classes de pill em vez de usar `PILL_FILTRO` de `@/components/shared/botoes` — a dívida das "3 pills de período" segue aberta.
- `mockup-dados.ts` (oráculo congelado da M0 da v5.3.0) não tem nenhum import vivo.

---

## 9. Aprendizado permanente avaliado para o CLAUDE.md

Passa nas três condições (permanente, transversal, custou caro) e foi **adicionado**:

> **Uma RPC que "já existe e aceita o intervalo certo" pode ainda assim ter a SEMÂNTICA errada — meça antes de reusar.** Reuso é a preferência do projeto, mas granularidade e assinatura compatíveis não garantem filtro compatível: `get_decomposicao_categoria` tinha o parâmetro de data certo e mesmo assim somava `previsto` com competência retroativa e ignorava o de-para curado (R$ 4,3 Mi na janela medida). Quando dois números vão ficar **lado a lado na mesma tela**, a pergunta não é "a RPC serve?" e sim "ela aplica o MESMO filtro que o número vizinho?" — e isso se responde com uma query, não lendo a assinatura.

Os demais achados são específicos desta versão e ficam neste out-briefing.
