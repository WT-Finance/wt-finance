# v6.5.1 — M0: medição para a DRE de caixa por centro de custo (GATE 0)

Data: 06/11/2026. Leitura pura: catálogo vivo por `npx supabase@2.122.1 db query --linked` (SELECT), `get_dre_mensal(2026)`
por REST com a credencial do `verificador`, código da `main` (44bd93a2) e as fixtures de 06/11 da §12 do briefing.
Nada foi escrito no banco. Sem nome de pessoa física: contas de cartão por portador aparecem só como classe.

## 0. Numeração e anexos

- **Migrations:** banco na **0303** (aplicada em 05/11 pelo Yan; o briefing a dava como "reservada"). Livre **0304**. Nenhuma
  worktree ativa tem migration ≥ 0304. **ADR livre: 0184.**
- **Anexos da §12:** 4 de 5 localizados em `Downloads` e conferidos pelo conteúdo (não pelo nome — os sufixos `_785564`/`_100c44`
  eram do upload no Chat):

  | Arquivo do briefing | Arquivo local | Conferência |
  |---|---|---|
  | `Lancamentos_por_centro_custo_2026_785564.xlsx` | `Lancamentos_por_centro_custo_2026.xlsx` (06/11 13:05) | 4 grupos abertos; Corp 2.980 · CSC 1.849 · Trips 5.505 · Weddings 10.810; Σ `Valor Centro Custo` −578.668,68 ✅ |
  | `Lancamentos_por_categoria_2026_100c44.xlsx` | `Lancamentos_por_categoria_2026.xlsx` (06/11 13:06) | 36.285 linhas, Σ −578.439,47 ✅ |
  | `antecipacoes-2026-11-06.xlsx` | idem | 44 linhas, 16 de 2026; Σ antecipado 2026 3.845.087,25; taxa 84.004,38 ✅ |
  | `DRE_caixa_por_centro_de_custo_2026_v06-11.xlsx` | idem | abas Sobre, Consolidado, Pressão de caixa, Todos os centros, Trips, Weddings, Corp, CSC, Antecipações, Qualidade, Lançamentos, Base ✅ |
  | `Lancamentos_por_centro_custo_2026.xlsx` (20/10, **grupos recolhidos**) | — | ❌ **não existe mais**: o export de 06/11 foi salvo com o mesmo nome e o sobrescreveu (decisão D4) |

## Q1 — A base de movimentação guarda Número, Conta e Vencimento?

**Sim, por linha.** `raw.lancamentos_movimentacao` (0185:19-37; nenhuma migration posterior a altera):
`numero text`, `venda_no bigint`, `emissao`, `vencimento`, `liquidacao`, `data_movimentacao date`, `pessoa`, `descricao`,
`descricao_categoria`, `valor numeric`, `categoria text` (**nome**, não id), `grupo_categoria text`, `conta text` (livre).

Preenchimento vivo, movimentação ≥ 2026-01-01 (carga de 06/11 às 08:58 SP, 1 arquivo):

| linhas | com `numero` | com `vencimento` | com `conta` | `numero` com hífen | Σ valor | movimentação |
|---|---|---|---|---|---|---|
| 36.232 | 36.232 | 36.229 | 36.232 | 271 | −556.895,06 | 01/01 a 23/11 |

- **O Número é TEXTO e às vezes tem sufixo de parcela** (`218937-2`). Os dois exports usam a mesma forma: na fixture, 234 Números
  com hífen na base por categoria casam **exatamente** com o export de centro (0 casam só pelo prefixo). **A chave da junção é o
  texto inteiro**; `numero` nunca vira inteiro.
- **Cobertura na fixture:** 36.285 linhas / 18.934 Números da base por categoria → **100% acham rateio** (0 sem centro).
- **A DRE lê o tratado, não o raw:** `financeiro.fato_fluxo` (0187:30-49), reconstruído (TRUNCATE + INSERT) dentro da
  `promover_carga_movimentacao`. Tem `numero` (texto), `vencimento`, `data_movimentacao`, `categoria_id`, `conta_bancaria_id`, `tipo`
  (`realizado`/`previsto`), `data_competencia`. A RPC por centro pode juntar por `fato_fluxo.numero`; a conta vem de
  `conta_bancaria_id → dim_conta_bancaria`. **O `id` do fato muda a cada carga:** a identificação das antecipações usa
  número/data/valor, nunca `fato_fluxo.id`.

## Q2 — Fonte, predicado e categorias fora da árvore do Realizado

- `get_dre_mensal(p_ano int) RETURNS json` — definição única em **0207_get_dre_mensal.sql:36** (0269 só COMMENT; 0273 GRANT ao
  `verificador`). `SECURITY DEFINER`, `app.exigir_acesso(ARRAY['financeiro/dre'])` (0207:47).
- **Fonte e predicado:** `financeiro.fato_fluxo` com `tipo = 'realizado'`, mês = `extract(month FROM data_competencia)`
  (0207:65-75). Para realizado, `data_competencia = data_movimentacao`, e o tipo é **decidido na carga** (`data_movimentacao <= hoje
  SP`, 0187:139-152), não na leitura. Junção com `dre_categoria_map` por **`categoria_id`** com `NOT excluida` (0207:105-126);
  o `categoria_id` do fato vem da junção por **nome** com `dim_categoria` (0187:149).
- **Shape** (medido em 2026): `{ano, hoje, relacao, mes_corrente, token_estrutura, linhas[159], bandeja[]}`; linha =
  `{t, chave, rotulo, estrela, meses[12], prev_corrente, venc, total}`; `t ∈ blocoH(6) · sub(13) · tot(8) · cat(132)`.
  **No ano corrente `meses[m]` é realizado até o mês corrente e previsto depois, e `total = Σ meses + prev_corrente`.**
  A paridade da §6 inv. 1 compara `meses[0..mês corrente]`, **nunca `total`**.
- **Último totalizador:** **REX "(=) RESULTADO DO EXERCÍCIO"** = RAIR + DIST_LUCROS; RAIR = LL + INV (0205:56; 0300).
  Inclui Investimentos/Empréstimos e Distribuição de Lucros (decisão D1).
- **Excluídas da árvore (vivo):** só `409 Movimentação de Caixa - C` e `410 Movimentação de Caixa - D` (`excluida = true`).
  **Bandeja vazia** em 2026.
- **Paridade fixture × banco, mês a mês (REX realizado × Σ do export de 06/11):**

  | mês | export | REX banco | Δ | causa |
  |---|---|---|---|---|
  | jan–jun, set | — | — | **0,00** | — |
  | jul | −9.148,02 | 20.851,98 | +30.000,00 | Movimentação de Caixa - D (excluída) |
  | ago | 97.936,63 | 127.936,63 | +30.000,00 | Movimentação de Caixa - D (excluída) |
  | out | −83.395,65 | −83.570,73 | −175,08 | carga viva (08:58) × export (13:06) |
  | nov | −162.670,44 | −150.491,12 | +12.179,32 | idem (mês corrente) |

  Em jul há ainda 1.362,39 trocados entre "Pagamento ao fornecedor" e "- Operação própria", com Δ líquido zero (reclassificação no
  Monde entre a carga e o export). **A regra "mesma fonte, mesmo mapa" é confirmada: fora a categoria excluída, a soma do arquivo é
  o REX ao centavo nos meses estáveis.**
- **Efeito no oráculo (inv. 5):** as 6 linhas de Movimentação de Caixa (C +30.000 em jun e set; D −30.000 em jun, jul, ago e set;
  Σ −60.000) são **100% CSC**. Fora da árvore, o oráculo por centro fica:

  | Centro | Resultado operacional | C | D | Taxa | Resultado de caixa |
  |---|---|---|---|---|---|
  | CSC | **−4.011.516,46** (era −4.071.516,46) | 2.997.477,10 | −2.649.407,30 | −53.249,47 | **−3.716.696,13** (era −3.776.696,13) |
  | Total | **−805.651,05** | 3.263.673,22 | −2.915.550,23 | −60.911,41 | **−518.439,47** |

  Trips, Weddings e Corp não mudam. C, D e taxa não mudam: nos meses com antecipação, +60 mil num CSC de −4 mi não muda quem está
  negativo (jan, fev e abr são anteriores a jun; mai, set e out já são 100% CSC). **A confirmar recalculando o protótipo na M3.**

## Q3 — Onde está a taxa de antecipação hoje

- **`categoria_id 38` "Taxa de Antecipação" → bloco `FIN` "(+/-) Resultado Financeiro"** (vivo; seed 0205:119). Σ 2026 realizado
  **−60.911,41** = a taxa Monde do oráculo.
- **Não há outra categoria de antecipação** (vivo: só a 38 casa `%antecip%`). "Antecipação de recebíveis - C/D" do briefing não são
  categorias do Monde: são as **linhas sintéticas** do bloco novo da visão por centro (§2.3), calculadas a partir do registro.
- `dre_categoria_map` (baseline L12307): `categoria_id UNIQUE`, `bloco_chave` (NULL ⇔ `excluida`, CHECK `dre_map_estado`),
  `ordem`, `rotulo`, `nota_estrela`. A estrutura dos blocos (`dre_bloco`, `formula jsonb`) é editável no editor; a RPC por centro
  lê os dois ao vivo (inv. 2).

## Q4 — As contas do registro casam com as da base?

- **O registro não guarda a conta em texto:** `financeiro.antecipacao.conta_id smallint` → `financeiro.antecipacao_conta`
  (`1 Asaas`, `2 Blimboo`; 0296:100-134). Não há CHECK de nome nem UNIQUE(conta, data).
- **Base (vivo, `dim_conta_bancaria`):** `7 Blimboo` (gateway) · `8 ASAAS` (gateway) · `54 CC ASAAS` (**cartão de crédito**) ·
  `20 "ASAAS, <portador>, WISE"` (conta composta, tipo outro). Movimento 2026: ASAAS 10.478 linhas; Blimboo 12.045; CC ASAAS 9.
- **Normalização por maiúscula NÃO basta:** `asaas` casaria `CC ASAAS` (cartão) e a conta composta. **Não existe de-para no código.**
  Proposta: de-para **fechado e nomeado** `antecipacao_conta.id → dim_conta_bancaria.id` (1→8, 2→7), com teste; conta nova no
  registro sem de-para = antecipação não identificada (aparece na nota de cobertura), nunca casamento por aproximação (decisão D3).
- **Candidatos da regra (§3.3):** as linhas positivas do **grupo do Monde "Receita de Vendas"** nas duas contas caem quase todas em
  **"Entrada de clientes" (bloco ENT_H)** (10.685 linhas, R$ 20,86 mi), mais Comissão e Reembolso Fornecedor - C (RV) e uma em FIN.
  A regra se escreve pelo **grupo do Monde**, não pelo bloco da DRE — o deslocamento move linhas de ENT_H também.

## Q5 — A página e a tabela

- Rota `src/app/financeiro/dre/page.tsx` (RSC, `requireArea('financeiro/dre')` L80). "Regime de Caixa" é um `<TopSection>` (L511-535)
  com `<TabelaDre>` + `<RankingCaixa>`. `get_dre_mensal` é chamado para 5 anos num `Promise.allSettled` **com índices posicionais**
  (L116-157): chamada nova só no fim.
- `src/components/financeiro/dre/tabela-dre.tsx` (cliente, ~1,8 mil linhas): estados visão `mensal|consolidado`, modo
  `realizado|tudo`, anos, abertos, tela cheia, exportar. Pills: visão, ano (`AnoPills`), Realizado | Realizado + Previsto,
  Expandir/Recolher, tela cheia, Exportar.
- **A tabela NÃO é genérica nas colunas:** colunas são meses (`construirValores`, `idxPrevistoDe`, `totalDoAno`) ou anos
  (`montarColunasCons`) em `src/lib/dre/colunas-tabela.ts`. Linhas, identidade (`chaveDeLinha`), AV, expansão e formatação são
  reaproveitáveis; **"Lado a lado" (colunas por centro) pede um tipo novo de coluna**. É a maior mudança do front e o maior risco
  para a visão Empresa (inv. 9) — a M1 deve decidir entre estender a `TabelaDre` ou um componente irmão que reuse linhas/AV.
- **Exportar:** cliente, sem API — `montarExportacaoDre` (`src/lib/dre/exportar.ts`, AOA puro, sempre 2 abas).
- **Carimbo:** já há duas linhas `UltimaAtualizacao` (Competência; Caixa via `buscarUltimaCargaMovimentacao`). "Centro de custo"
  e "Antecipações" pedem leituras próprias; o registro de antecipações só é lido por RPCs das áreas `financeiro/geral*` e
  `financeiro/fluxo-caixa`, então a página DRE precisa de RPC própria sob `financeiro/dre`.
- **AV:** `src/lib/dre/av.ts` (base `RB_H`); `deltaYtd` está em `colunas-tabela.ts:246`. AV por centro usa o `RB_H` do centro;
  o CSC quase não tem receita (decisão do GATE 1, já prevista).

## Q6 — Um arquivo ou N por carga

- O export de 06/11 só traz movimentação de **2026** (jan a nov): o relatório sai filtrado por período de movimentação.
  Como a versão é **só 2026**, **um arquivo por carga** basta. Se o Monde deixa ou não filtrar por ano, o código não responde;
  a cobertura de anos é derivada do dado (inv. 12). Multiarquivo (`BASES_MULTIARQUIVO`, `src/lib/ingestao/bases.ts:37`) fica para quando
  houver 2027.
- **Checksum:** o parser de categoria (`lancamentos-categoria.ts:86`, `RE_OUTLINE`) só casa `Grupo de Categoria`/`Categoria` com nome
  não vazio; o outline `Centro de Custo :  WG - Corp (2980, R$ 1.325.290,56)` (dois espaços, e "Sem centro" com nome vazio) **pede parser
  próprio**. O estado `-`/`+` da coluna A **não é lido em nenhuma base hoje**; grupo recolhido só reprova indiretamente (linhas faltam →
  outline ≠ apurado). Para a base nova: **rejeitar explicitamente `+`** e, além disso, exigir que o apurado bata com cada outline
  (um grupo recolhido com n = 0 passaria só pelo checksum).
- **A base nova é mais que "raw + rateio + promover":** o pipeline de base tem 4 RPCs (`limpar_staging_*`, `inserir_lote_staging_*`,
  `validar_carga_*`, `promover_carga_*`; `src/lib/ingestao/rpcs-ingestor.ts:39-78`), e as funções compartilhadas por base
  (`ingestao_carga_abrir`, `ingestao_carga_ultima`, `ingestao_soma_por_ano` — 0295) e as listas de bases (`bases.ts`, grafo, rota,
  `instrucoes-upload.ts`) ganham a base. **Os `CHECK (base IN …)` de `ingestao.carga` e `ingestao.promocao` precisam ser ampliados =
  `DROP/ADD CONSTRAINT` = DESTRUTIVA por classificação** (precedente 0298: patch em `supabase/patches/`, aplicado pelo Yan em TTY;
  até lá a carga da base nova **falha fechada** e nada mais muda). Decisão D2.
- **Grants do `ingestor`:** as **4** RPCs da base (não "só a promover"); allowlist derivada de `rpcs-ingestor.ts`, prova em
  `credencial-ingestor.test.ts`.

## Q7 — Lista fechada da base nova

- Precedente: Contas a receber (v6.4.0) — teste de runtime sobre a saída do parser (`parsers/contas-receber.test.ts:72-90`: só as
  colunas listadas viram campo; sentinelas das demais não aparecem em `JSON.stringify`). A base de movimentação **não** tem lista
  fechada (grava `pessoa` e `descricao`).
- **Proposta de colunas gravadas** (o que a DRE e o checksum usam): `Número`, `Movimentação`, `Vencimento`, `Centro de Custo`,
  `% Centro Custo`, `Valor Movimentação` (sinal), `Valor Centro Custo` (checksum do outline); `Emissão` opcional (diagnóstico).
  **Fora:** `Pessoa`, `Descrição`, `Valor Lançamento`. A coluna "Pessoa" tem cabeçalho na A e dado na B — a descoberta posicional
  do parser de categoria (`resolverColunas`, L100-148) já resolve esse deslocamento; o parser novo só precisa **não emitir** o campo.
- Fixture: 21.145 linhas de detalhe; 362 sem `%` (lançamentos de valor líquido zero — §3.2 do briefing) e 8 com `% = 0`.

## Achados fora das perguntas

1. **Defasagem da base viva:** a carga de movimentação viva é de 06/11 08:58 SP; o export de 06/11 13:06 difere em out/nov.
   Confirma o §3.2: as duas bases precisam ser do mesmo dia, e a nota de cobertura é o que mostra a diferença.
2. **O tipo congela na carga:** movimentação com data futura entra como previsto até a próxima carga (0187). O realizado do mês corrente
   por centro herda isso igual à visão Empresa — paridade preservada por construção.
3. **ADR-0183 (L197-200)** registra que a Movimentação omite despesa paga em cartão/faturas. Não afeta a paridade (as duas visões leem a
   mesma fonte), mas afeta a leitura "quem cobre quem".

## Decisões para o Yan (GATE 0)

| # | Decisão | Proposta |
|---|---|---|
| **D1** | O último totalizador (REX) inclui Investimentos/Empréstimos e Distribuição de Lucros. O rótulo "(=) Resultado operacional de caixa" vale para ele? | Manter REX (paridade com a Empresa e com o protótipo, que soma tudo); rótulo à escolha do Yan |
| **D2** | A base nova exige um patch **destrutivo** (ampliar os `CHECK` de base), rodado por ele em TTY | Aceitar; tudo o mais aditivo; carga falha fechada até o patch |
| **D3** | De-para de conta registro → base | Fechado: Asaas → `ASAAS` (8), Blimboo → `Blimboo` (7); `CC ASAAS` e a conta composta fora |
| **D4** | A fixture negativa de 20/10 (grupos recolhidos) foi sobrescrita | Se ainda estiver no Chat, reenviar; senão, fixture negativa **derivada** do export de 06/11 (grupo com `+` e sem detalhe), declarada como sintética |
| **D5** | Oráculo ajustado pela Movimentação de Caixa (CSC +60.000; total de caixa −518.439,47) | Aceitar; reconferir no protótipo na M3 |
| **D6** | Lista fechada da base nova (Q7) | Como proposto; `Descrição` também fora |
| **D7** | Classificação PATCH × MINOR | Registrada: PATCH por decisão do Yan, apesar de base nova e patch destrutivo |

### Decidido pelo Yan em 06/11/2026 (GATE 0 encerrado — não re-propor)

| # | Decisão |
|---|---|
| D1 | A árvore por centro vai até o **REX**; o total se chama **"(=) Resultado operacional de caixa"** nas visões por centro. |
| D2 | **Aceito o patch destrutivo** dos `CHECK` de base (`supabase/patches/`, aplicado pelo Yan em TTY); a carga da base nova falha fechada até lá. |
| D3 | **De-para fixo e nomeado**: Asaas → `ASAAS` (8), Blimboo → `Blimboo` (7). `CC ASAAS` e a conta composta ficam fora; conta sem de-para = antecipação não identificada, mostrada na nota. |
| D4 | **Fixture negativa sintética** derivada do export de 06/11 (grupo com `+` e sem detalhe), declarada como sintética no teste e no out-briefing. |
| D5 | **Oráculo ajustado** pela Movimentação de Caixa excluída (CSC −4.011.516,46 / −3.716.696,13; total de caixa −518.439,47); reconferir no protótipo na M3. |
| D6 | **Lista fechada**: Número, Movimentação, Vencimento, Centro de Custo, % Centro Custo, Valor Movimentação, Valor Centro Custo, Emissão. Fora: Pessoa, Descrição, Valor Lançamento. |
| D7 | **Mantida v6.5.1 (PATCH)**; a divergência do critério (base nova + destrutiva = MINOR nas v6.3.0/v6.4.0) vai registrada no out-briefing. |
