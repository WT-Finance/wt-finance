# Out-Briefing — v5.3.0 · DRE Gerencial · Onda 2 (estrutura viva + tabela + editor)

**Branch:** `feat/v5-3-0-dre-onda2` · **PR:** #193 (draft) · **Base:** main @ v5.2.1
**Migrations:** 0204–0208 (aditivas, **APLICADAS** em produção sob backup-gate verde em 25/07)
**ADR:** 0156 · **Briefing:** `Janus_Briefing_v5-3-0_DRE_Onda2.pdf` · **Investigação:** `docs/relatorios/Relatorio_DRE_FluxoCaixa_Onda2_2026-07-24.md`

---

## O que foi entregue (por missão)

### M0 — Gate de mockup (3 rodadas de design com o Yan) ✅
Dois mockups interativos no repo (tabela + editor) sobre dados REAIS (fixture do objeto `D`
da controladoria, base 15/07/2026), iterados em 3 rodadas até o desenho final:
**rodada 1** (régua contábil + faixa de natureza) → **rodada 2** (banda cinza `--band`/
`--band-soft`, cor por SINAL nos valores, previsto recolhível, DRE promovida à aba
definitiva, editor em página própria) → **rodada 3** (resultado em banda ESCURA
`--action-primary` com tons `-soft`, previsto em escala ÂMBAR por nível, chevron à direita,
box 80vh, cabeçalhos "Realizado|Previsto", limpeza de poluição visual com conferência ao
vivo no browser). Tokens novos: `--band`, `--band-soft`, `--warning-deep` (AA medido).
**Achado do oráculo do M0:** `REX = RAIR + DIST_LUCROS` — a linha "Distribuição de Lucros"
não tem chave no struct original (alimentada por NOME); sem chave própria o REX erraria
R$ 376.455,16/ano. A M1 semeou a linha COM chave.

### M1 — Estrutura viva (0204 + 0205) ✅
`financeiro.dre_bloco` (29 blocos; `formula` jsonb por CHAVES — grafo, nunca posição) +
`financeiro.dre_categoria_map` (de-para curado por `categoria_id`; estado `excluida` XOR
bloco; `rotulo` de exibição para os 18 prefixos contábeis "(-)"). Seed do struct provado
com **reconciliação fail-closed** — passou em produção: `29 blocos, 133 maps (2 excluídas)`.
Bandeja = dim sem map (1 hoje: Estacionamento Vaga Rotativa). Trava otimista + RLS
deny-by-default + `dre_estrutura()` (leitura).

### M2 — Diário/undo generalizado (0206) ✅
`financeiro.reverter_diario(bigint[])` **mantém a assinatura** e vira genérico: cada entrada
do diário já carrega `tabela_alvo`; restauração dinâmica (`jsonb_populate_record` +
`information_schema`) com **allowlist estrutural** (só tabela com o trigger do diário);
semântica da 0200 preservada byte-a-byte. **Gerencial intacto** (wrappers não mudaram;
testes verdes; smoke REST executado: `gerencial_historico_lotes` → 200 com lotes).
Histórico/undo da estrutura (`dre_estrutura_historico_lotes/lote`, `dre_estrutura_desfazer_
lote/linha`); desfazer em massa PRÓPRIO permitido na estrutura (todo salvar é um lote —
divergência deliberada do Gerencial, documentada no ADR). Painel `historico-alteracoes.tsx`
**prop-izado** (fetchers/camposDiff/título opcionais; defaults = Gerencial).

### M3 — `get_dre_mensal(p_ano)` (0207) ✅
Uma chamada → um JSON (~160 linhas × 12 meses) montado da estrutura viva em **transação
única**. Mês corrente híbrido (realizado ≤ hoje + `prev_corrente`); vencidos (previsto ≤
hoje) fora das colunas, em `venc` por linha (refino futuro decide o Total); fórmulas em
ordem do grafo; fuso SP por rolconfig. Zod + 7 casos vivos em `rpc-contrato.test.ts`
(shape, invariantes, `REPASSE = ENT_H + PAG_H` ao centavo no payload real, trava com
`DRE_CONFLITO`, execução inofensiva dos desfazeres).

### M4 — Tabela real ✅
`/financeiro/dre` lê a RPC por ano (`?ano=`, pills com `useTransition` preservando os
demais params), colunas híbridas dinâmicas pelo `mes_corrente` real, fail-safe (RPC falhou
→ aviso discreto, página viva, pills funcionais), bandeja real, Total do payload. Composição
mantida em TopSection colapsado. Mockup da tabela removido.

### M5 — Editor real (0208) ✅
`/financeiro/dre/estrutura`: salvar em lote (padrão Metas — baseline/pendentes → 1 RPC →
`router.refresh()` re-hidrata por comparação de token "ajustada na render"), trava otimista
global (token + `pg_advisory_xact_lock` compartilhado com o desfazer — TOCTOU fechado),
no-op pulado (diário sem ruído), `beforeunload`, painel de histórico da estrutura na
página, efeitos do MoverModal com totais reais do ano corrente. Mockup do editor removido.

### M6 — Fechamento ✅
Versão 5.3.0 (bumpada na M0 a pedido do Yan) · CHANGELOG.md · CHANGELOG_DIRETORIA (hora
real de autoria 2026-07-25T15:29; **reconciliar ao horário do merge**) · ADR-0156 · DS doc
(§Tabela hierárquica da DRE) · CLAUDE.md (aprendizado permanente: cabeçalho sticky de 2
linhas × células `rowSpan`) · esta verificação registrada:

**Rename de categoria no Monde:** `dim_categoria` upserta por NOME (`ON CONFLICT
(categoria)` — 0058/0069/0187) ⇒ rename cria **id novo** ⇒ sem map ⇒ **cai na bandeja**
(visível; nada é mismapeado em silêncio). A antiga fica zerada até o editor arrumar.
Comportamento seguro por construção.

---

### Rodadas de refino visual pós-implementação (checkpoint aberto do Yan)
**Rodada 4:** formato contábil com centavos (gastos seguem entre parênteses) + densidade
menor; gutter das barras; cinza do cabeçalho preenchendo o box; CONTA/TOTAL DO ANO
alinhados com os meses (as `th` `rowSpan={2}` centralizam por padrão — `align-bottom` +
`pb` casa a base com a dos meses).
**Rodada 5:** R$ discreto no padrão contábil do DS (layout do `<ValorContabil>`, com os
parênteses da DRE); busca e "esconder zerados" REMOVIDOS (com todo o código que só existia
para eles); "Editar estrutura" para o rodapé; data-base fora; título do card; setas de
expansão à direita; **colunas dos ANOS SEGUINTES** e **modo do Total do ano**
(realizado × realizado+previsto); barras que não se tocam.
- **Anos seguintes SEM migration:** a própria `get_dre_mensal(p_ano)` já devolve o ano
  futuro inteiro (`relacao='futuro'`); a página busca ano+1/ano+2 **em paralelo** com a
  principal e passa só os totais por linha. Custo medido em produção (aquecido): 216–481ms
  de wall-clock para as 3 chamadas — as duas extras não movem o tempo percebido (a de 2026
  sozinha leva ~460ms). Ano que falhar some da lista (a coluna não aparece).
- **Barras que se cruzam viraram PADRÃO do DS** (não remendo local): `scrollbar-math` ganhou
  folga assimétrica (`folgaFim`, default = `folga` → eixo único inalterado) e o
  `<ScrollAutoHide>` encurta cada trilho pela espessura do outro (`THUMB_CRUZ`) quando
  `eixo="both"` — 3 casos de teste novos; documentado em `docs/design-system.md`
  §Barras de rolagem. Toda tabela de dois eixos herda de graça.

**Rodada 6:** seta do Total do ano alinhada à do Previsto; coluna do Total em **âmbar**
quando o modo é "Realizado + previsto" (diferencia os dois modos à primeira vista); a
visão **salta** para as colunas recém-expandidas (`scrollIntoView` com `block:'nearest'` —
sem ele o scroll VERTICAL da página saltaria junto —, respeitando `prefers-reduced-motion`,
e com **rede contra o no-op silencioso do `behavior:'smooth'`**, ver abaixo); coluna do
previsto do mês corrente só existe no
modo "Realizado + previsto"; sidebar passa a dizer **"Demonstrativo de Resultado"**; e a
visão **CONSOLIDADO** (ano-a-ano: ano anterior cheio, YTD × YTD, Δ%, previsto, vencidos,
total e os anos seguintes) ao lado da "Mensal".
- **`behavior:'smooth'` é NO-OP SILENCIOSO quando o navegador desliga o scroll suave**
  (flag do Chrome, automação, alguns modos de acessibilidade): não rola e não cai para
  instantâneo — não há erro, a coluna revelada só não aparece. Pego na conferência visual
  desta rodada, ao vivo: `scrollTo({behavior:'smooth'})` era no-op *page-wide* (inclusive no
  `<main>`) enquanto `scrollLeft = n` funcionava. `useScrollAoAbrir` passou a guardar a
  posição antes e, se ~150ms depois nada se moveu, refazer em `'auto'`. Registrado como
  padrão no DS §Barras de rolagem — vale para qualquer scroll programático futuro. É a mesma
  classe do `-[--token]`: degradação sem erro de build/tsc/lint, só visível a olho.
- **Consolidado SEM migration:** tudo deriva do que já existe — a página busca também
  `ano-1` (5ª chamada paralela) e monta, por linha, o ano cheio + o YTD na MESMA janela do
  ano exibido; o resto (YTD atual, previsto = total − YTD, `venc`, total, anos seguintes)
  sai do payload principal no cliente. **Invariantes provados** (é o que vale — os números
  em si andam a cada sincronização do Monde e a cada edição da estrutura): **TOTAL = YTD +
  PREV fecha ao centavo**, e o **YTD do ano exibido é o MESMO número do modo "Realizado" do
  Total do ano** (consistência cruzada entre as duas features). Conferido contra produção
  via REST/service_role em 27/07 ~13h20, para o Resultado do Exercício (`REX`):
  YTD25 −793.628,79 × YTD26 **144.102,08** (Δ% +118,2%), previsto −2.623.539,83, vencidos
  −600.661,61, total −2.479.437,75 → 144.102,08 − 2.623.539,83 = −2.479.437,75 ✔.
  *(Uma versão anterior deste documento trazia um snapshot mais antigo destes mesmos campos —
  colhido antes de o Yan classificar a categoria órfã hoje às 09:44, o que reparenteou uma
  categoria e mexeu nos totais a jusante. Os invariantes acima seguiram valendo nos dois
  instantes; é por isso que eles, e não os valores, são o critério.)* Custo: 239ms de
  wall-clock para as 4 chamadas da DRE (aquecido).
- **⚠️ Convenção do Δ% — confirmar no checkpoint (é decisão de produto).** A variação usa
  **denominador em módulo**: `(atual − base) / |base|`. Consequência: sair de um PREJUÍZO de
  793.628,79 para um LUCRO de 144.102,08 aparece como **+118,2%** (melhora = positivo). Com o
  denominador COM sinal, a mesma linha apareceria como −118,2%. O módulo é o que faz o sinal
  ler como "melhorou/piorou" em vez de acompanhar a aritmética crua — e mantém coerência nas
  linhas de despesa (despesa que cresce fica negativa). Se a planilha da controladoria usar a
  outra convenção, é troca de uma linha (`fmtDeltaPct`).

**Rodada 7 (última):** as pills de ano do **Consolidado** viraram **seleção múltipla** (caixas
cumulativas, não navegação): cada ano marcado acrescenta `[ano cheio | YTD | Δ% para o próximo
selecionado]`, e o MAIOR marcado é a referência — só ele ganha `PREV`/`VENCIDOS`/anos seguintes, e
**só quando é de fato o ano corrente** (num ano fechado `total − ytd` é realizado de ago..dez, não
previsão; rotulá-lo "previsto" seria mentira). Mínimo de um marcado; a última pill não desmarca e
diz por quê. Tudo client-side — a página passou a buscar todos os anos da janela navegável na mesma
leva. Com os três: `2024 | YTD 24 | Δ% 24·25 | 2025 | YTD 25 | Δ% 25·26 | YTD 26 | PREV 26 |
VENCIDOS | TOTAL 2026 | 2027 | 2028` (conferido ao vivo; Δ% 24·25 = +84,0% para −4.953.303,89 →
−793.628,79). Mais: seta dos anos seguintes na mesma **âmbar** da do previsto; toolbar em **duas
linhas à esquerda** (visão em cima; anos + modo embaixo) sem os rótulos "Visão:"/"Total do ano:",
com `title` em cada pill; o **salto animado também ao FECHAR** (previsto → volta ao início do ano;
anos seguintes → vai ao fim, onde o Total do ano passa a terminar a tabela); o modo **"Realizado"
agora esconde TODO o previsto** — meses futuros e anos seguintes junto com os dois toggles, não só
a coluna do mês corrente; e "Demonstrativo de Resultado" entre Acervo de Documentos e Fluxo de Caixa
na sidebar.
- **Armadilha de runtime que o `tsc` NÃO pega:** `rpcDre` devolve o *thenable* do Supabase (um
  builder com `.then`), **não** uma Promise — encadear `.catch()` nele estoura
  `rpcDre(...).catch is not a function` em runtime, sem erro de compilação. O tratamento de falha
  vai no `status` de cada item do `Promise.allSettled`. **Pego no smoke visual** (a página quebrou
  inteira), não nos gates — mais uma para a lista de degradações que só o olho pega.
- **Ao FECHAR um grupo de colunas, a coluna-alvo já saiu do DOM** (`ref.current === null` quando o
  efeito roda), então não dá para achar o container rolável a partir dela. O hook de scroll passou a
  usar uma **âncora na própria `<table>`**, que sobrevive às duas transições.
- **Achado registrado, não implementado (é produto):** na visão Consolidado o *conjunto de linhas*
  continua vindo do ano da URL — os valores é que vêm por chave de cada ano marcado. Marcar só 2024
  mostra a **estrutura de 2026** com os valores de 2024 (conta que só existia em 2024 não aparece;
  conta de 2026 ausente em 2024 aparece com travessão). É o comportamento de sempre do comparativo,
  mas a seleção múltipla o tornou mais visível. Resolver exigiria a página passar também a estrutura
  do ano de referência.

**Fora do escopo da DRE, pedido na mesma sessão:** máscara de moeda no campo Valor da **nova linha**
da Base de Dados do Fluxo de Caixa Gerencial — era o único campo de dinheiro da tela ainda em
`type="number"` cru (digitar não formatava; "1.234,56" era rejeitado pelo browser em silêncio).
Passou a usar o **mesmo `mascaraMoeda`** que a edição inline daquela mesma coluna já usava; reuso,
não máscara nova. Efeito colateral bom: antes, limpar o campo dava `Number('') === 0` e a guarda
`valor_final == null` não pegava — dava para salvar um lançamento de zero sem querer.

### Pendência pequena para o Yan (precisa de TTY)
O rótulo da área mudou para "Demonstrativo de Resultado" no app (sidebar + `AREA_INFO`),
mas o **editor de roles lê o rótulo do BANCO** (`app.rbac_areas.rotulo`, com o local só
como fallback) — lá ainda está "DRE". Alinhar exige um `UPDATE` em dado pré-existente, que
o classificador do db-gate marca como **destrutiva** (aborta sem TTY, por construção). O
teste de paridade compara só as CHAVES de área, então nada quebra — é cosmético no editor
de roles. SQL para rodar num terminal quando quiser:
```sql
UPDATE app.rbac_areas SET rotulo = 'Demonstrativo de Resultado' WHERE area = 'financeiro/dre';
```

## Auditoria de PARIDADE (motor × dashboard da controladoria)

Oráculo congelado: fixture do objeto `D` (base 15/07/2026), mantida em
`src/components/financeiro/dre/mockup-dados.ts` (nada no app a importa desde a M4/M5).
Comparação: 12 chaves (ENT_H, PAG_H, REPASSE, RV, IMP_H, ROL, CUSTO, LB, LOP, LL, RAIR,
REX) × meses fechados.

- **2026 jan–jun (72 comparações):** 14 células divergem, TODAS explicadas por **6
  re-edições retroativas reais no Monde pós-15/07** — e fecham aritmeticamente:
  REX jan Δ −40.892,07 = exatamente o Endomarketing re-lançado (−5.368,64 → −46.260,71);
  REX jun Δ +2,72 = a soma dos 5 microajustes de junho (Entrada de Clientes +853,27,
  Dif. Apuração −823,47, Taxa Cartão −29,78, Aplicações +2,30, Pag. Fornecedor +0,40).
- **2025 completo (144 comparações):** 46 células divergem por re-lançamentos retroativos
  em 6 categorias (Endomarketing — jul −4.781 → −758.487; Copa e Cozinha; Reembolso
  Fornecedor-C +97.936,97 em mar/abr = exatamente o delta do RV; Diferença Taxa de Câmbio D
  −26.367,61/mês = exatamente o delta do CUSTO; Desconto Obtido; Pag. Fornecedor −0,01).
  Mesma classe do relatório de divergência de receita (edição retroativa no Monde).
- **Consistência interna do payload VIVO: 100%** (todo bloco = Σ das suas categorias,
  incluindo `prev_corrente`, verificado em produção). `REPASSE = ENT_H + PAG_H` ao centavo
  nos 12 meses vivos (também coberto por teste de contrato permanente).
- **Flag `x` do struct:** confirmada COSMÉTICA (nota da controladoria) — as 4 categorias
  marcadas têm valores zerados também no fato dos períodos comparados.

**Conclusão: o MOTOR é exato; toda divergência é dado-fonte re-editado após o congelamento
do oráculo.**

## Verificação REST (EXECUTANDO, lição da v5.2.1)

Todas as 7 RPCs novas exercitadas via REST/service_role com efeito zero:
`get_dre_mensal` (2026: 160 linhas, corrente/mes 7; 2025: fechado) · `dre_estrutura`
(29/133/1 + token) · `dre_estrutura_salvar` (lote vazio → `gravadas: 0`; token errado →
`DRE_CONFLITO`, nada muda) · `dre_estrutura_historico_lotes` (vazio — o seed não poluiu o
diário) · `dre_estrutura_historico_lote(1)` → `[]` · `dre_estrutura_desfazer_lote/linha(1)`
→ erro amigável "inexistente" (corpo executa até o guard) · smoke Gerencial:
`gerencial_historico_lotes` → 200 com lotes.

## Parecer das revisões

- **revisor-db (0204–0208, ANTES da aplicação):** "seguro aplicar"; 1 **ALTO** (0207:
  `venc` de bloco sem `COALESCE` → quebraria o parse se um bloco esvaziasse) **corrigido
  antes do push**, junto com os 2 MÉDIOs (advisory lock também nos desfazeres; ADR-0156
  criado nesta M6) e os BAIXOs (REVOKE redeclarado, cap de payload 1000, DROP defensivo
  das temp tables).
- **revisor (front M1–M5):** 2 **ALTOs corrigidos** — (1) desfazer pelo histórico descartava
  pendências não salvas do editor em silêncio (interação NOVA entre o padrão Metas e o painel
  de undo; guarda `antesDeDesfazer` no painel + ConfirmModal de descarte no shell); (2)
  `loading.tsx` da DRE com silhueta antiga + ausente na rota do editor (ambos refeitos).
  3 MÉDIOs corrigidos (log da rejeição no fetch da estrutura; `fmt` do `nota_estrela` no
  diff; `venc` documentado como decisão adiada). 2 BAIXOs: comentário do teste de contrato
  ajustado; mover o painel para `shared/` registrado como follow-up.
- Rodadas anteriores (M0): 2 pareceres com ALTOs endereçados (sombra do cabeçalho
  `rowSpan`; contraste `--warning` como tinta).

## Gates (DoD)

`npm run build` ✅ · `npx tsc --noEmit` 0 ✅ · `npm run lint` ✅ · `npm test` **476** ✅
(469 pré-existentes + 7 contratos DRE ao vivo) · migrations aplicadas via backup-gate ✅ ·
RPCs verificadas via REST ✅ · smoke Gerencial ✅.

## Pendências / follow-ups

1. **Vencidos em aberto no Total do ano** (decisão adiada pelo Yan ao refino final): o dado
   já viaja por linha (`venc`) — somar no Total, coluna própria, ou manter é só front.
2. **Cópias untracked 0950–0954** na pasta local durante o checkpoint — **remover antes do
   merge** (até a v5.4.0 renumerá-las).
3. Checkpoint do Yan (briefing): conferir totalizadores vs controladoria (auditoria acima),
   testar o editor (mover → efeito → salvar → desfazer pelo histórico; classificar a órfã),
   Composição colapsada intacta, smoke do undo do Gerencial na UI, conceder `financeiro/dre`
   às roles.
4. Futuro (fronteira): satélites da DRE (comparativo anual, YTD/Δ%, 2027/2028, exportação),
   drag-and-drop, guarda de saída por link, divisão ver/editar, renumeração pós-v5.3;
   mover `historico-alteracoes.tsx` de `gerencial/` para `shared/` (hoje serve dois domínios —
   BAIXO do revisor).
5. `.next/types` velho referencia rota deletada após `git rm` — `rm -rf .next` resolve
   (aconteceu no dev local; build limpo regenera).

## Arquivos principais

Migrations 0204–0208 · `src/lib/dre/{rpc-dre,schemas}.ts` ·
`src/components/financeiro/dre/{tabela-dre,editor-dre,estrutura-shell}.tsx` ·
`src/app/financeiro/dre/{page,estrutura/page,estrutura/actions}.tsx|ts` ·
`src/components/financeiro/gerencial/historico-alteracoes.tsx` (prop-izado) ·
`src/components/financeiro/dre/mockup-dados.ts` (oráculo congelado) ·
`docs/adr/0156-*.md` · CHANGELOG.md · `src/data/changelog-diretoria.ts` ·
`docs/design-system.md` · CLAUDE.md · este out-briefing.
