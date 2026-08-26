# Changelog

Todas as mudanças notáveis neste projeto serão documentadas aqui.  
Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/).  
A partir de v4.4.0 este projeto adota [Versionamento Semântico](https://semver.org/lang/pt-BR/) (ADR-0084).

---

## [5.8.0] — 2026-08-26

MINOR · **DRE por Competência: segunda TopSection em `/financeiro/dre`, com base, árvore, leitura e EDITOR próprios**. Migrations `0255`/`0256`/`0257`/`0260` (todas ADITIVAS) · **ADR-0170** · **1056 testes**.

### Adicionado

- **Editor da estrutura do regime de competência** (`/financeiro/dre/estrutura-competencia`), atrás do botão "Editar estrutura" da TopSection nova — irmã do editor que já existia no regime de caixa, com o **mesmo** editor, o **mesmo** painel de histórico e o **mesmo** desfazer. Os títulos das duas páginas passaram a dizer de qual regime são: "Estrutura do Demonstrativo de Resultado **por Fluxo de Caixa**" e "**por Competência**". Migration `0260`: `financeiro.dre_comp_par` (o de-para EDITÁVEL, com destino anulável e o mesmo CHECK de estado do caixa) + 7 RPCs.
  ⚠️ O briefing dizia "sem editor nesta versão; curadoria por migration" — pedido do Yan com o PR já aberto. A curadoria por migration segue sendo a origem do **seed**; daqui para frente a estrutura viva é editável, como já acontece no caixa.
  ⚠️ **Por que uma tabela nova e não um `ALTER` na `dre_comp_map`:** o editor precisa do estado "sem destino", e a `dre_comp_map` nasceu com `sub_chave NOT NULL`. O caminho óbvio — `ALTER TABLE ... DROP NOT NULL` — seria classificado como **DESTRUTIVO** pelo backup-gate (o regex casa `ALTER TABLE … DROP`), exigindo TTY humano. O regex está certo em ser conservador; quem mudou foi o desenho. A `dre_comp_map` ficou órfã de leitura sem ser removida — dívida registrada.
- **Provisionamento automático do de-para:** ao finalizar o upload **e** ao abrir o editor, todo par presente na base sem linha no de-para entra com destino em branco. É isso que faz "par novo cai na bandeja" valer também **dentro do editor**, e não só na leitura — o card do upload avisa quantos pares novos entraram.
- **Nova TopSection "Regime de Competência" em `/financeiro/dre`, ACIMA do "Regime de Caixa".** Fato gerador: data de **emissão** (o de caixa é movimentação/vencimento). A mesma página passa a responder as duas perguntas — "quanto andou na conta" e "quanto foi reconhecido pela emissão". Mesma permissão da página (`financeiro/dre`).
- **Base de upload nova:** cartão "Demonstrativo de Resultado (Competência)" em `/admin/uploads`, alimentado pelo export "Demonstrativo de Resultado" do Monde já tratado pelo script R (8 colunas tidy). Full-swap, `accept=".xlsx"` (o parser depende do valor NATIVO da célula, que o CSV não tem). Migration `0255`: `raw.demonstrativo_competencia` + `truncar_/inserir_lote_/status_demonstrativo_competencia`.
- **ALARME DE INGESTÃO — peça que não existia em nenhum upload do repo.** O `finalizar` confronta **contagem e soma do ARQUIVO** (medidas pelo parser, no cliente) com **contagem e soma GRAVADAS** (medidas pelo banco). Divergência devolve erro e o card **não** declara sucesso. Comparação em **centavos inteiros** nas duas pontas. É a lição da v5.5.2 aplicada na fundação, não em retrofit: lá um ×1000 silencioso atravessou 753 testes e só apareceu meses depois, na DRE.
- **Árvore e de-para PRÓPRIOS** (migration `0256`): `financeiro.dre_comp_bloco` (26 blocos) e `financeiro.dre_comp_map` (141 pares, chave COMPOSTA `(grupo, descrição)`), mais a view `financeiro.vw_dre_competencia`. As árvores divergem de verdade — competência não tem REPASSE nem IMOBILIZADO, e tem ONOP_H, LL, DL e REXG que o caixa não tem — e as chaves são de espécies diferentes (o caixa chaveia por `dim_categoria.id`, a competência pelo par de TEXTO do arquivo).
- **`get_dre_competencia_mensal(ano)`** (migration `0257`), no MESMO envelope de `get_dre_mensal` — a tabela densa, as pills de ano, a Análise Vertical e o "Ver em tela cheia" servem aos dois regimes sem adaptação.
- **`RESULTADO GERENCIAL (ex-Reembolsos)` = REX − REEMB**, como última linha da tabela em formato de totalizador (não é card nem destaque nesta versão). Reembolsos (Desconto, Reembolso Cliente, Reembolso Fornecedor) são subgrupo da Receita Bruta: passagem de dinheiro, não resultado.
- **`toCentavos`** em `@/lib/carga/coercao` — dinheiro em centavos inteiros pela regra DECIMAL do Postgres (meio-para-longe-de-zero).

### Alterado

- **`TabelaDre` ficou parametrizada por REGIME**, por props ADITIVAS com default (`titulo`, `subtitulo`, `paramAno`, `semPrevisto`). O call-site do regime de caixa **não mudou uma linha**, então o render dele é idêntico por construção — e não por conferência. `semPrevisto` trava o modo em "Realizado" e esconde as pills; todo o resto (coluna ·PREV, VENCIDOS, anos seguintes) cai fora por consequência, porque a tabela já derivava tudo do modo.
- **Cada regime navega o SEU parâmetro de URL** — `?ano=` (caixa) e `?anoComp=` (competência). Um parâmetro só faria a pill de um regime mover o outro.
- `accept` do cartão de upload virou campo de configuração por base; o default preserva `.xlsx,.csv` das 5 bases existentes.
- **A linha de contexto sob o título do card de competência SAIU** ("fato gerador: data de emissão · base carregada em … · cobertura …") — decisão do Yan. O selo de última atualização no canto superior direito fica: é o padrão da casa e o card do caixa tem igual. Efeito colateral bem-vindo: a prop `subtitulo` saiu junto (sem chamador, era código morto) e o `CabecalhoCard` voltou ao alinhamento original, o que **dissolve** o achado ALTO do `revisor` no M3.

### Corrigido

- **O alarme de ingestão comparava centavos por dois métodos que discordam** (achado ALTO do `revisor`, medido e confirmado). `Math.round(v*100)` opera sobre o float JS; o banco recebe a representação DECIMAL no JSON e aplica `::NUMERIC(18,2)`, que arredonda meio-para-**longe-de-zero**. As duas regras divergem em **todo meio-centavo negativo** — e esta base é 2.508 despesas × 736 receitas. Estava **LATENTE** (o arquivo de 25/08 não tem nenhuma linha com mais de 2 casas, e a soma não muda: 568.937,62 antes e depois); teria virado alarme falso reprovando um upload legítimo no dia em que o export trouxesse um valor de título dividido.
- **A bandeja da competência teria apagado a seção inteira em silêncio** (achado ALTO do `revisor-db`, corrigido antes de existir call-site). `dreBandejaSchema` exige `categoria_id`, que a competência não tem; `bandeja` é campo obrigatório do envelope, então um item sem ele derrubaria o `safeParse` do objeto RAIZ, `parseRpc` devolveria `null` e a seção desapareceria deixando só um `console.error` — no PRIMEIRO par não mapeado, ou seja, exatamente quando a bandeja precisava aparecer. Agora há `dreCompBandejaSchema` próprio, com `chave` textual como identidade.

### Prova

- **Oráculo em forma fechada, sem banco:** expandindo as fórmulas da árvore, `REX` tem coeficiente **+1 em cada uma das 15 folhas**, e as 15 folhas são exatamente os destinos que o de-para usa — logo `REX ≡ Σ(base do ano)` por CONSTRUÇÃO, não por coincidência numérica. No REXG o coeficiente de REEMB cancela para 0. 15 testes em `src/lib/dre/competencia-estrutura.test.ts`, que leem o SQL APLICADO (mão humana no seed gerado fica vermelha).
- **Medido ao vivo (REST/service_role), 3 anos:** REX = 208.743,77 / 439.628,52 / −79.434,67 e **REXG 2024 = 1.323.690,77** — idênticos ao briefing e ao modelo da gerente. 164 linhas (138 folhas + 26 blocos), bandeja 0, reconciliação `base = linhas + bandeja + excluídas` fechando.
- **Bandeja provada e revertida:** par inventado injetado na base aparece na bandeja, o REX **não se move** e `base − linhas = bandeja`. Base restaurada ao original.
- A migration `0256` é **arquivo gerado** por `scripts/gera-seed-dre-competencia.mjs` a partir dos anexos CSV do briefing; o gerador valida referência de fórmula, **aciclicidade**, par não repetido e a regra de rótulos antes de emitir.

### Fora desta versão (registrado)

Cards de KPI e tabela de linhas-chave da competência; mix de receita; ponte competência↔caixa; orçado; editor da árvore/de-para de competência.

---

## [5.7.2] — 2026-08-25

PATCH · **DRE: base da Análise Vertical vira a Receita Bruta e novos defaults; busca e ordenação em Solicitações; colunas ordenáveis no Gerencial**. Sem migration · sem ADR.

### Alterado

- **A Análise Vertical passou a ser calculada sobre a RECEITA BRUTA DE VENDAS**, não mais sobre a Receita Operacional Líquida. A ROL já é líquida de impostos e deduções — usá-la como denominador fazia toda linha acima dela passar de 100% e media "% da receita" contra um número que já tinha subtrações dentro. **As linhas ACIMA da Receita Bruta ficam travadas em travessão**: Entrada de Clientes, Pagamento ao Fornecedor, Saldo Repasse e Receita de Vendas (com as categorias delas) são as PARCELAS que formam a base, não parte dela — exibir "Entrada de Clientes = 285% da Receita Bruta" convidaria a uma leitura de composição que não existe. A base mostra 100,0%; a AV existe dela para baixo. Conferido no payload vivo: o corte cai na linha 13 de 160.
- **Novos defaults na página do Demonstrativo:** o card da DRE abre em **Consolidado + Realizado** (era Mensal + Realizado+Previsto, a combinação mais densa que existe — 13 colunas de mês com projeção misturada), e o **Resumo Executivo** abre com os **dois anos mais recentes** (era todos os carregados, que abriam 7 colunas). Os dois cards passam a nascer falando do mesmo par de anos.
- **Solicitações — ordenação por data de CRIAÇÃO, mais recentes no topo**, em todas as listas e nas duas visões (Caixa de entrada e Minhas solicitações), inclusive nas que antes não eram ordenadas (Concluídas, Canceladas).
  ⚖️ **O que se perde:** as abertas eram ordenadas por data-limite ASC, o que punha a mais urgente no topo — era triagem. A urgência deixa de ordenar e passa a viver só na cor (o card já pinta o vencimento em vermelho quando vencida). Pedido explícito ("sempre ordenadas por data de criação").

### Adicionado

- **Campo de busca em Solicitações**, na faixa de pills das duas visões: filtra por **número** (`#1068` ou `1068`, inclusive parcial) **ou e-mail do solicitante**. Mensagem de vazio distingue "nenhum resultado para esta busca" de "não há solicitações" — dizer o segundo com um filtro ativo seria dado errado parecendo certo.
- **Colunas ordenáveis na base de dados do Fluxo de Caixa Gerencial** — Tipo, Pessoa, Valor, Descrição, Conta, Vencimento e Originador. Gatilho é `<button>` dentro da `<th>` com `aria-sort`; clique alterna a direção; nulos sempre no fim, em qualquer direção. **A tabela abre ordenada por Vencimento, do mais recente ao mais antigo.** A coluna Conta ordena pela MESMA `canonizarConta` que o filtro dela usa — senão ordenação e filtro discordariam.

### Interno

- `maisRecentePrimeiro` e `casaBuscaSolicitacao` moram em `src/lib/solicitacoes/format.ts`, não em cada componente de lista: as duas visões da mesma página precisam ordenar e buscar igual, e duas cópias divergiriam no primeiro ajuste.
- **Regressão pega e coberta por teste:** a primeira versão do matcher extraía os dígitos de QUALQUER termo, então buscar `ana2024@x.com` trazia de brinde a solicitação `#2024`. A busca por número só acontece quando o termo inteiro é uma referência numérica (`^#?\d+$`).
- `indiceBaseAv` no módulo de AV: a separação acima/abaixo da base é POSICIONAL de propósito — "acima da Receita Bruta" é uma afirmação sobre a ordem do demonstrativo, e o payload já vem em `ordem` ASC. Base ausente ⇒ ninguém tem AV.
- Testes da AV deixaram de cravar valores vivos: a estrutura é dado editável e os números andam (entre a v5.7.0 e a v5.7.2 a Receita de Vendas de 2025 mudou 104.481,59 por re-parentagem no editor, com o REX intacto — qualquer categoria que troque de bloco dentro do que compõe o REX o deixa invariante). Quem confronta o vivo é o caso de contrato.
- **998 testes** (v5.7.1: 989).

## [5.7.1] — 2026-08-24

PATCH · **DRE: "Maiores variações" reconcilia com o Demonstrativo, Receita Bruta vira linha de resultado e a Decomposição sai da página**. Migrations `0253` (aditiva, aplicada) e uma **destrutiva pendente de aplicação** em `supabase/patches/` · sem ADR.

### Corrigido

- **"Maiores variações" e o Demonstrativo mostravam números diferentes para a mesma categoria, lado a lado na mesma página.** O card cortava o ano ANTERIOR pelo mesmo **dia-do-ano**, enquanto o Demonstrativo (e o Resumo Executivo, e o Consolidado) usam YTD por **mês inteiro**. Medido em 24/08, "Pagamento ao Fornecedor": card −15.518.502,72 × DRE YTD 25 −16.157.462,20 — **638.959,48 de diferença**, que eram 25 a 31/08/2025. A `0253` alinha o card à janela do Demonstrativo. Provado: **as 126 categorias do ranking batem ao centavo com o YTD da DRE nos dois anos**, e o invariante virou caso de contrato permanente.
  ⚖️ **O que se perde, dito em voz alta:** o corte por dia-do-ano comparava o mesmo número de dias decorridos, o que era mais rigoroso. Com a janela por mês, o mês corrente compara um mês parcial contra o mês inteiro do ano anterior — a mesma assimetria que o YTD do Demonstrativo já tinha. Dois números que se contradizem na mesma tela custam mais confiança do que um viés conhecido e **rotulado**.

### Alterado

- **Cabeçalhos do card viraram "YTD 2025" / "YTD 2026"** — a coluna nunca foi o ano cheio, e um "2025" ao lado de um demonstrativo que também tem uma coluna "2025" (essa sim do ano inteiro) convidava a comparar coisas diferentes.
- **Receita de Vendas subiu para antes da Receita Bruta de Vendas**, e a **Receita Bruta virou linha de RESULTADO** (`tipo='tot'`, prefixo `(=)`). Ela sempre foi um subtotal (`Saldo Repasse + Receita de Vendas`), mas estava tipada como cabeçalho de grupo e desenhada **acima** de uma das parcelas que soma. Não muda um centavo — `tipo` e `ordem` não entram no cálculo. *(Migration destrutiva; aplicação em TTY.)*
- **A Decomposição dos Lançamentos saiu da página do Demonstrativo**, por decisão de produto — mas **não foi apagada**: componente, schema e a RPC `get_decomposicao_bloco` (0209) seguem no lugar, como código morto proposital, e o caminho de volta está documentado no topo de `page.tsx`. O `?preset=&from=&to=` ficou órfão: a página hoje só lê `?ano=`.

### Interno

- Caso de contrato novo (`rpc-contrato.test.ts`): **toda categoria do ranking bate ao centavo com o YTD da DRE nos dois anos**, casando por NOME REAL do Monde (6 categorias têm override só de capitalização — casar por rótulo daria falso negativo) e ignorando as 2 excluídas do de-para.
- Guarda permanente da estrutura nova (RB_H é `tot`, abre com `(=)`, continua sendo `REPASSE + RV`; RV antes de RB_H). Nasce vermelha até a destrutiva ser aplicada.
- A destrutiva faz **um UPDATE por linha** — aplicação direta da lição da v5.7.0: `reverter_diario` pressupõe um toque por linha por lote, e a `0251` violou isso. Este lote É reversível pelo painel.
- **989 testes** (v5.7.0: 986).

## [5.7.0] — 2026-08-19

MINOR · **DRE: Resultado Financeiro unificado, Imobilizado abaixo da linha, rótulos padronizados e Análise Vertical**. Migrations `0251` (destrutiva, aplicada em TTY) e `0252` (aditiva) · **ADR-0168**.

### Alterado

- **Mudança de CRITÉRIO no demonstrativo (decisão da controladoria, ADR-0168).** (a) As receitas financeiras (`RFIN`) foram absorvidas pelas despesas financeiras, que viram **"(+/-) Resultado Financeiro"** e passam a ser lidas líquidas — o bloco `RFIN` deixou de existir; (b) o **Imobilizado** saiu das despesas operacionais e passou a compor o grupo de investimentos, como subgrupo próprio (`INV_H` agora é "(+/-) INVESTIMENTOS, IMOBILIZADO E EMPRÉSTIMOS"). **O Resultado do Exercício não muda um centavo** — o imobilizado troca de lugar dentro da mesma soma. Medido antes×depois em produção: `ΔRAIR = ΔREX = 0,00` em 2024, 2025 e 2026; o Lucro Operacional sobe exatamente o valor do imobilizado (20.912,64 / 99.342,56 / 236.572,23). **Retroativo a todos os anos exibidos** — a estrutura é dado lido a cada consulta, não reprocessamento.
- **Rótulos padronizados.** Cabeçalho, subgrupo e totalizador carregam operador `(+)`/`(-)`/`(+/-)`/`(=)`; **categoria-folha nunca carrega** (o sinal da folha é do valor, não do rótulo — e o rótulo mente quando o valor do período vem com o sinal contrário). Os 5 `=` soltos entraram na fôrma, o `(+ / -)` do `ONOP_H` foi normalizado, 14 subgrupos ganharam operador e **12** overrides de categoria perderam o prefixo (o briefing dizia 18 — os outros 6 são de capitalização e ficam).
- **Ordem dos cards da página** (`/financeiro/dre`): Resumo Executivo → Demonstrativo → Maiores variações → Decomposição. O Resumo subiu para o topo (antes obrigava a rolar o demonstrativo inteiro para chegar ao resumo dele).
- **"Maiores variações" migrou** da página de Fluxo de Caixa para a DRE: compara categorias no YTD contra o mesmo período do ano anterior, que é leitura de demonstrativo e não de liquidez.

### Adicionado

- **Análise Vertical (AV)** — % de cada linha sobre a **ROL do mesmo período**, sinal algébrico preservado. Uma coluna ao lado do "Total do ano" na visão Mensal (e uma por ano seguinte, quando abertos), e uma por ano marcado na Consolidado. Módulo puro `src/lib/dre/av.ts` derivado do payload existente — **zero RPC, zero mudança de contrato**. Guardas: base ≤ 0/ausente ⇒ coluna inteira em travessão; bandeja sempre travessão; `NaN`/`∞` impossíveis por construção. Nas linhas de resultado a AV vem em negrito e colorida por sinal; nas demais, neutra e sem peso.
- **Botão "Ver em tela cheia"** na barra de ações da DRE (Fullscreen API sobre o card inteiro, para a toolbar acompanhar).
- **Pills de ano no Resumo Executivo**, com seleção aditiva e independente da pill da tabela. Sai a ancoragem fixa no ano corrente. Colunas em dois grupos, cada um com o seu Δ em reais: ano cheio dos anos **fechados** (no corrente o total incluiria previsto) e YTD de todos os marcados.
- **`scripts/dre-oracle.mjs`** — captura o retrato de antes/depois por REST e **reprova** se RAIR ou REX moverem um centavo. Existe porque o ano corrente é alvo móvel: só um par tirado no ato prova alguma coisa nele.

### Corrigido

- **`rotuloBloco()` não reconhecia o prefixo duplo.** A regex aceitava UM caractere de sinal entre parênteses, então nem `(+/-)` nem o `(+ / -)` que estava gravado no `ONOP_H` eram removidos — o prefixo vazava inteiro para os rótulos da Decomposição. Defeito pré-existente e silencioso que a padronização tornaria visível em três linhas, incluindo o Resultado Financeiro.
- **`get_fluxo_ranking` aceitava só as áreas do Fluxo de Caixa e da Executiva** (`0252`). Com o card migrado para a DRE, quem tivesse apenas `financeiro/dre` receberia negação e o fail-safe anunciaria "sem movimentações para ranquear" — sem ACESSO lido como sem DADO.

### Interno

- **Guardas mecânicas permanentes** em `rpc-contrato.test.ts`, lendo o estado VIVO da estrutura: as duas direções da regra de rótulo, a camada firme da v5.7.0, e o **grafo de fórmulas** (fórmula só pode consumir fórmula anterior — violar isso não dá erro, o insumo entra como ZERO em silêncio). As cinco primeiras nasceram VERMELHAS de propósito e viraram verdes na aplicação da `0251` — guarda que nunca foi vista falhando não prova nada.
- A coluna de AV entra na aritmética das colunas presas à direita (`fixasDaLinha`): cada ano seguinte deixou de ser uma coluna e virou um bloco valor+AV. Largura declarada é a fonte única do `right` cumulativo — coluna fixa fora dessa conta senta por cima da vizinha sem que gate nenhum acuse.
- `AnoPills` exportado e reusado pelo Resumo Executivo (duas cópias de pill divergiriam em cor, foco e `aria` no primeiro ajuste).
- **986 testes** (baseline da v5.6.4: 932).

## [5.6.4] — 2026-08-14

PATCH · **Metas: período contíguo no Personalizado + carrossel mês/trimestre/ano no Modo TV**. Sem migration · sem ADR.

### Adicionado

- **Comparativo — "Personalizado" agora seleciona um PERÍODO contíguo de meses** (ex.: jan até abr): o primeiro clique marca o início, o segundo o final (ordem indiferente; um clique a mais recomeça; dois cliques no mesmo mês = mês único, o comportamento anterior). Range pode cruzar a virada de ano; teto de 12 meses. O **YoY continua automático**, deslocando o MESMO range para os anos anteriores ("jan–abr/26" × "jan–abr/25" × "jan–abr/24"); colunas Previsto × Realizado e anel mostram o agregado do período; a "Meta de Assessorias" (Weddings) fica proporcional (14 × nº de meses).
- **Modo TV com carrossel mês → trimestre → ano:** o telão passa a rotacionar os três recortes a cada 12s com animação de carrossel (slides sempre montados com `inert` — sem piscar; curva canônica do DS; `motion-reduce` respeitado; dots de posição). `?periodo=` do link "Modo TV" vira o slide inicial. Legenda ajustada: *"A seta indica o valor esperado para hoje, considerando o período já decorrido."*

### Interno

- Módulo `comparativo` generalizado de mês para período (`PeriodoRef`; presets degeneram em período de 1 mês — paridade v5.6.1 preservada e coberta pelo caso de contrato). Dados por **janela composta** (1 `get_executiva_kpis` por período/ano, não N por mês). Contrato novo: janela composta ≡ soma das janelas mensais (aditividade do faturamento).
- TV: os 3 recortes carregados em paralelo no RSC pela MESMA `carregarAcompanhamento` da `/metas` (fonte única — os números de cada slide batem com a página no preset correspondente).

## [5.6.3] — 2026-08-13

PATCH · **Espelho Monde auto-curativo para venda retida** (rota 2 do tripwire da v5.4.5). Migration `0250` (aditiva, aplicada) · sem ADR.

### Corrigido

- **Venda espelhada que deixa de ser espelhável não fica mais congelada somando.** Caso medido: venda 73580 (ago/26, R$ 7.372,92) reclassificada de Corporativo para "Welcome" na origem DEPOIS de espelhada — a exclusão de escopo é aplicada na escrita e o upsert nunca mais a tocava. A reconciliação diária agora **cura o mês**: remove do espelho, com auditoria, o que ficou fora do conjunto que a rodada provou espelhável (`monde_ingest_remover_vendas`, migration `0250`). A 73580 se cura na primeira rodada pós-deploy e o tripwire volta a `sobrando: 0`.

### Segurança da cura (fail-closed, cintos duplos app+SQL)

- A cura só roda com a apuração ÍNTEGRA (`podeCurar`): rodada vazia da API bloqueia (curar contra o vazio apagaria um mês novo inteiro — e a recontagem apagaria o próprio alarme); erro de detalhe/transform bloqueia; venda sem `sale_id` na listagem bloqueia; **paridade contagem×ids** bloqueia (detalhe sem `sale_id` tiraria a venda do conjunto e a linha antiga viraria candidata); conta que não fecha bloqueia.
- Na própria RPC: conjunto provado vazio nunca autoriza; só a janela do mês; `sale_id` nulo nunca é candidata; **teto de 20 remoções por rodada** (listagem truncada viraria remoção em massa) — acima do teto, nada é removido e o tripwire acusa.
- Toda remoção é auditada: detalhe (número/setor/valor) no log da rodada e em `ingest_control.ultima_remocao`; campo `removidas` na apuração do tripwire.

### Interno

- `IngestResult.espelhaveis_ids` (helper `idsEspelhaveis` testado); fórmula `conta_fecha` unificada (`contaFecha`) entre a guarda da cura e o tripwire; 16 testes novos no módulo monde.
- Revisão: 3 CRÍTICOs pegos e corrigidos ANTES da aplicação (`uuid[]`×`text[]` na assinatura — a RPC compilaria e falharia em toda chamada real, engolida pelo try/catch; cura contra rodada vazia; paridade ids). Verificação REST pós-push provou os dois cintos ao vivo sem remover nada (263 candidatas de ago/26 bloqueadas pelo teto).

## [5.6.2] — 2026-08-13

PATCH · **Metas: "Meta de Assessorias" no Comparativo (Weddings)**. Migration `0249` (aditiva, aplicada) · sem ADR.

### Adicionado

- Com **Weddings** selecionado no Comparativo, o card do anel encolhe o anel (168→132px) e ganha embaixo a **barra de progresso "Meta de Assessorias"**: contratos de casamento vendidos no **mês em foco** contra a meta mensal **fixa em 14** (`META_ASSESSORIAS_MENSAL` — trocar é editar 1 linha).
- **Fonte = espelho da API Monde** (RPC nova `get_contratos_casamento_mes`, migration `0249`): conta por descrição (`TRIM ILIKE 'contrato de casamento%'`, itens ativos, só Weddings; inclui a variante "- venda online", exclui "Atualização de Contrato de Casamento" — decisão de produto). Regra validada contra o dado vivo (2025 = 87 contratos, idêntico à medição direta; 1 item = 1 venda).
- Fail-safe: falha/negação da RPC **omite a barra** (nunca "0 de 14" falso — zero só quando a contagem respondeu zero). Nos demais setores nada muda.
- Contrato: schema no bloco F7 (`safeParse` contra a RPC viva) + invariantes próprias (shape inteiro ≥ 0; mês ⊆ ano).

## [5.6.1] — 2026-08-11

PATCH · **Metas: seção "Comparativo"** — meta × realizado entre meses e anos na página de Acompanhamento. Sem migration · sem ADR.

### Adicionado

- **TopSection "Comparativo"** em `/metas`, abaixo da Visão geral: pills de setor (Group/Trips/Weddings/Corporativo, pill ativa sólida na cor de marca — mesmo padrão do gráfico de ritmo) e presets de período **Este mês / Último mês / Personalizado**.
- **YoY automático em todos os modos:** o mês em foco é comparado com o mesmo mês dos dois anos anteriores ("Ano sobre Ano", barras só do realizado, fiel à referência).
- **Personalizado — escolha do mês em foco**: popover com grade por ano (2024 → hoje), seleção ÚNICA, meses futuros desabilitados; o mês escolhido vira o foco e o YoY continua automático em volta dele. Rolagem interna não fecha o popover; foco gerido (move ao abrir, Tab preso, devolve ao gatilho).
- **Três visuais:** colunas **Previsto × Realizado** do mês em foco (previsto em tom neutro de referência, realizado na cor de marca; mês parcial sinalizado no rótulo); **barras horizontais** do realizado por mês da comparação; **anel `AnelKpi`** (primitivo novo em `@/components/charts`, SVG puro sem Recharts) com a meta do PRÓPRIO mês em foco — coincide com o "Previsto" das colunas por construção. Mês sem meta cadastrada omite previsto/anel (nunca placeholder).
- **Caso de contrato de paridade** em `rpc-contrato.test.ts`: a composição do Comparativo reproduz os números dos MetaCards ao centavo, nos 4 painéis, contra as RPCs vivas (jul/26).

### Interno

- Dados client-side sob demanda (`metas_listar` por ano + `get_executiva_kpis` por mês selecionado, em paralelo): trocar setor/período **não recarrega a página**; loading derivado de chave com guard de resposta atrasada (compara com o último pedido); dados anteriores ficam visíveis com opacidade durante o refetch.
- `PAINEIS`/`MetaRow`/`metasDoSetor` extraídos de `carregar-acompanhamento.ts` para o módulo client-safe `src/lib/metas/paineis.ts` (verbatim, zero mudança de comportamento); `rpc-metas.ts` aceita o browser client (type-only).
- Módulo puro `src/lib/metas/comparativo.ts` (molde do `ritmo.ts`): resolução de meses por preset, dedup/clamp do personalizado, montagem do payload — 18 testes.

## [5.6.0] — 2026-08-10

MINOR · **Gestão de Pessoas: Inventário de Ativos** — seção nova de sidebar e módulo novo. Migrations `0247`/`0248` (aditivas, aplicadas) · **ADR-0167**.

### Adicionado — o inventário

- **Seção nova na sidebar, "Gestão de Pessoas"** (ícone crachá), com o sub-item **Inventário de Ativos**. Rota `/gestao-pessoas/inventario`, área de permissão própria `gestao-pessoas/inventario` — **única de página**: quem edita a página cadastra e movimenta.
- **Cadastro de máquinas e equipamentos** com ficha patrimonial documental: código (sequência `WG-0001` server-side, com override manual), categoria, descrição, nº de série, fornecedor, data e valor de aquisição, nota fiscal, estado de conservação, observações.
- **Razão append-only de movimentações**, com oito tipos (cadastro, transferência, devolução ao estoque, envio e retorno de manutenção, empréstimo, baixa, reativação) e campos condicionais por tipo.
- **Três abas**: Visão geral (contagens, custo histórico de aquisição, barras por categoria e por área, últimas movimentações), Ativos (tabela densa com busca e filtros) e Movimentações (o razão inteiro).
- **Ficha em drawer** com timeline do histórico, origem→destino e marcador de registro retroativo.
- **"Duplicar ativo"** e **"Salvar e cadastrar outro"** (retêm categoria, área, pessoa, fornecedor e valor; código, série e nota ficam em branco) — o parque inteiro será digitado numa sentada.
- **Export CSV** das duas abas, no dialeto do Excel pt-BR (BOM UTF-8, separador `;`, decimal com vírgula, CRLF), exportando as linhas exibidas com os filtros atuais.

### Decidido — o modelo (ADR-0167)

- **Localização e status são DERIVADOS da última movimentação**, nunca colunas em `patrimonio.ativo`. Uma coluna espelho divergiria da cadeia na primeira movimentação retroativa — que é requisito, não exceção.
- **A origem não é armazenada:** é o destino da anterior na cadeia, montada na leitura. Gravada como snapshot, uma retroativa a faria mentir.
- **`atualizar_ativo` RECUSA localização** (`LOCALIZACAO_IMUTAVEL`); no formulário de edição os campos de área e detentor **não são renderizados**. É "movimentação ≠ correção de cadastro" virando código.
- **Um ativo pode nascer em estoque** (decisão do Yan no checkpoint): cadastro **com** detentor → em uso; **sem** detentor → em estoque, derivado do mesmo registro. O `cadastro` é o único tipo que ramifica.
- **"Custo histórico de aquisição"**, nunca "valor imobilizado": sem depreciação, e nenhum número desta tela entra em DRE ou Fluxo de Caixa. **Ativo sem valor não vira zero** — fica fora do somatório e sai com célula vazia no CSV.
- **Detentor é tabela** (agregação "o que a Maria tem?"), **local e terceiro são texto livre** com datalist — assimetria deliberada. Detentor **sem vínculo** com usuário da plataforma.
- **Área = departamento administrativo**, NÃO os setores Trips/Weddings/Corporativo.

### Adicionado — redes que passam a reprovar sozinhas

- **Varredura de navegação mecânica** (`nav-model.test.ts`, 56 casos). A invariante da seção nova pedia "checklist de regressão em cada rota"; o modelo de navegação saiu de dentro do `sidebar.tsx` para um módulo puro (`nav-model.ts`) e a varredura virou teste: lê o inventário de rotas **do disco** e reprova rota protegida órfã da sidebar, href apontando para rota inexistente, colisão de prefixo entre seções, e divergência entre **quem vê o item e quem alcança a rota**.
- **Paridade SQL↔TS** (`paridade-sql.test.ts`, 18 casos). O contrato "tipo → destino/status" existe no banco (CHECK + função) e no cliente (que decide quais campos o modal mostra). Antes, "as duas pontas mudam JUNTAS" era comentário. Agora o teste lê o SQL aplicado e compara enums, exigência de cada campo nos 8 tipos e o mapa de status.
- **Contrato do resumo × lista** (`rpc-contrato.test.ts`): a faixa de contagens e a tabela aparecem na mesma tela e derivam o estado por caminhos SQL diferentes; a igualdade virou caso de contrato, inclusive "as cinco situações fecham o total".

### Verificado

- **71 checagens ponta a ponta via REST + `service_role`** (o único caminho que executa o corpo da RPC): nomes de parâmetro de toda server action, schemas Zod contra retorno **populado**, os 8 tipos em sequência com o status conferido a cada passo, retroativa entrando no meio da cadeia sem mexer no estado atual, travas de baixa/reativação, CHECK por tipo, e `resumo` batendo com a lista ao centavo. Dados de teste removidos; base de volta a 0/0/0 com a sequência reiniciada.
- **879 testes** · build, `tsc` e lint limpos · `revisor` e `revisor-db` com **0 CRÍTICO e 0 ALTO**.
- ✅ **Resolve a falha de gate declarada na v5.5.2**: o caso "catálogo de áreas: banco ↔ app idênticos" do `rpc-contrato.test.ts` falhava em `main` porque `gestao-pessoas/inventario` já existia em `app.rbac_areas` (migration `0247`) e ainda não no código. Esta versão declara a área nas duas pontas — os 879 testes passam.

---

## [5.5.2] — 2026-08-10

PATCH · **Correção de um bug de ingestão que multiplicava por 1000 todo valor com 3 casas decimais** — distorcia a DRE e o Fluxo de Caixa a ponto de **inverter o sinal do resultado de 2024 e de 2025**. Sem migration · sem ADR (a regra durável foi para a skill `ingestao-planilhas` e para uma sonda mecânica).

### Corrigido — o valor da célula volta a ser o valor da célula

- `parse-lancamentos-movimentacao.ts` e `parse-titulos-em-aberto.ts` liam a planilha com **`sheet_to_json({ raw: false })`**, o que **descarta o valor nativo da célula** e entrega a string de exibição. A célula numérica `-40.933` (R$ 40,93, ponto decimal) chegava ao `toNum` como `"-40.933"`, casava o padrão de **milhar BR** `^-?\d{1,3}(\.\d{3})+$` e virava **−40933**.
- Passaram a `raw: true` — o valor nativo, que o `toNum` devolve por passthrough. **O `toNum` NÃO foi tocado:** para uma *string*, `"1.234"` é ambíguo de propósito e `coercao.test.ts` consagra a leitura BR. O defeito era o parser **destruir a informação que já tinha** antes de perguntar.
### Corrigido — o ramo CSV, que era PIOR (achado do `revisor`)

- Com `XLSX.read(texto, { type: 'string', raw: false })` o SheetJS roda um heurístico **americano** sobre o texto **antes** de qualquer coerção nossa. Isso não afeta só valores de 3 casas: destrói **todo** valor BR com vírgula decimal. Medido: `"40,93"` → **4093** · `"0,05"` → **5** · `"-26,39"` → **−2639** · `"-1.234,56"` → **−1,23456**.
- Estava **vivo em oito parsers**, três deles em bases financeiras que aceitam `.csv` pela UI: **Vendas** (`parse-vendas-produto`, a base de receita), **Rateio** (`rateio/parse-fatura`) e **Faturamento Corp** (`faturamento/parse-faturamento`) — mais `parse-pessoas`, `faturamento/parse-clientes-corp`, `parse-contas-pagar-receber`, `parse-lancamentos` e `lancamentos`.
- **Todos os ramos CSV passaram a `raw: true`.** Para CSV isso é correto sempre: preservar o texto e deixar `toNum`/`toIsoDate` aplicarem a regra BR — inclusive para datas, onde a leitura americana do SheetJS é a armadilha da ADR-0099.
- **Errata:** a primeira redação deste patch dizia "só estes dois parsers eram afetados". Isso valia para a opção do `sheet_to_json` — e **não** para a do `XLSX.read` no ramo CSV, que é outra porta para o mesmo estrago. Corrigido aqui.

### Corrigido — `gerencial/parser.ts`: a leitura dupla protegia data, não dinheiro

- O parser do Gerencial faz leitura dupla desde a v4.9 (`raw:false` para exibição + `raw:true` paralela), mas usava a versão nativa **só para `Vencimento`**. `Valor Final` seguia pela string de exibição e tinha o mesmo risco de ×1000.
- Passou a usar o número nativo quando a célula é numérica, com fallback para a string (célula de texto tipo `"R$ 8.840,00"` continua pela regra BR). Estritamente melhor: nenhum caso piora.
- O Gerencial **não** aceita `.csv` (`accept=".xlsx,.xls"`), então nunca esteve exposto ao estrago maior acima.

### O gatilho, e por que passou despercebido

- Dispara com **exatamente 3 casas decimais** e 1–3 dígitos na parte inteira. Com 4 casas (`-30.4322`) ou 4+ dígitos inteiros (`1234.567`) o padrão não casa e o valor sempre passou correto — por isso o defeito é **esparso e plausível**, nunca um erro visível em massa.
- Três casas nascem de **divisão de título** no Monde (parcelamento, rateio, câmbio): `377,23 ÷ 2 = 188,615`.
- **A suíte tinha cobertura farta dos parsers e não pegou:** toda ela chama `parseXxxRows(matriz)`, que recebe a matriz **já extraída**. O defeito morava na extração. O guard novo precisou montar um `.xlsx` de verdade e passar por `parseXxxFile()`.

### Verificação

- **59.139 linhas reais reparseadas** (os dois exports do Monde), campo a campo, antes × depois: **exatamente 1 campo mudou** — o `valor` da linha corrompida (−40933 → −40,933). Datas, textos e todo o resto **byte-idênticos**; a base "em aberto" inteiramente inalterada.
- Soma da base de movimentação: 394.492,15 → **435.384,22**, delta **+40.892,07** — ao centavo o mesmo valor que a auditoria de paridade da v5.3.0 havia atribuído a *"Endomarketing re-lançado no Monde"*. **Não era re-lançamento na origem: era este bug.**
- Guard **visto reprovando** o defeito (as provas falham com `raw: false` reintroduzido).
- Gates: `tsc` · `lint` · `build` · **762 de 763 testes** — a única falha é a paridade de áreas RBAC, alheia a este patch (ver abaixo). O `.env.local` foi copiado para o worktree, então os testes de contrato contra o banco rodam de verdade (0 skipped).

### Adicionado — guards

- `src/lib/carga/parse-fluxo-caixa-valor-nativo.test.ts`: 7 provas pelo caminho do **arquivo** (`parseXxxFile`), varrendo a faixa inteira do gatilho, o caminho de texto/CSV e a **limitação conhecida** (em CSV puro `-40.933` é irredutivelmente ambíguo — fixada em teste para ser explícita, não surpresa).
- **Sonda mecânica** de duas regras, varrendo recursivamente `src/lib/carga/`, `src/lib/rateio/`, `src/lib/faturamento/` e `src/lib/gerencial/`: (1) nenhum `sheet_to_json` com `raw: false` — exceção única e declarada no `gerencial/parser.ts`, cuja leitura `raw:false` serve às colunas de texto e cujas duas colunas sensíveis vêm da leitura nativa; (2) nenhum ramo CSV com `raw: false` no `XLSX.read`.
- A extração é por **parênteses balanceados**, não por janela de N caracteres, e aceita **parâmetro de tipo** entre o nome e o parêntese. As duas coisas importam: a 1ª versão da sonda usava uma janela de 300 chars (frágil, apontado pelo `revisor`) e não casava `sheet_to_json<unknown[]>(...)` — ou seja, estava **cega justamente para os arquivos que devia vigiar**. Pego ao escrevê-la.

### Parecer da revisão

- `revisor` (despachado a pedido do Yan): **1 CRÍTICO, 1 ALTO, 3 MÉDIO, 3 BAIXO**. O CRÍTICO (ramo CSV vivo em outros parsers) e o ALTO (`gerencial` protegia só data) foram **verificados por medição e corrigidos nesta versão** — as duas seções acima. Dos MÉDIO, a fragilidade da sonda foi corrigida; a restrição do `accept=".csv"` na UI e o alarme de ingestão ficam como follow-up declarado. Os BAIXO (resíduo inerte de `raw:false` no ramo binário, emenda ao ADR-0099) estão registrados, não endereçados.
- `revisor-db` e `verificador-visual` **não se aplicam**: sem migration/RPC e sem mudança de UI.

### Gate com falha declarada, alheia a este patch

- `src/lib/rpc-contrato.test.ts` › "catálogo de áreas: banco ↔ app idênticos" **falha**, porque a área `gestao-pessoas/inventario` já existe em `app.rbac_areas` na produção compartilhada (migration da **v5.6.0**, em curso em outra branch) e ainda não existe no código. **Falha idêntica em `origin/main`** — verificado: este patch não toca `src/lib/auth/areas.ts`, e o commit-base também não tem a área. Some quando a v5.6.0 mergear. Os outros **762** testes passam.

### ⚠️ A correção NÃO conserta os dados já em produção

O patch corrige a **próxima** ingestão. A base viva segue com os valores inflados até o **re-upload** dos dois arquivos em `/admin/uploads` — o upload é full-swap (`truncar` → `inserir_lote` → `regenerar_fluxo_caixa`), então a reingestão resolve tudo **sem migration destrutiva**. É também a única forma de fechar o número exato: o arquivo carregado em 04/08 (116.713 linhas, 2023–2027) não está em disco, e o levantamento da investigação é um **piso**, não um total.

Detalhe completo: `docs/investigacoes/2026-08-10-coercao-milhar-dre-fluxo.md`.

---

## [5.5.1] — 2026-08-10

PATCH · **Ajustes de apresentação do float, pedidos pelo Yan depois de ver a v5.5.0 no ar** + uma métrica nova. Migration `0246` (aditiva, aplicada) · **emenda ao ADR-0166**.

### Alterado — gráfico e nomes

- O gráfico do card de Fluxo de Caixa passou a se chamar **"Rendimento Potencial do Caixa Livre"**; saíram o total "R$ X na janela" ao lado do título e o subtítulo explicativo.
- A **linha do saldo real ficou PRETA**, a mesma cor da linha "Resultado mensal" do gráfico Mensal logo acima — os dois são a leitura do caixa real, e cores diferentes para a mesma natureza de número dentro do mesmo card faziam parecerem coisas distintas.
- Na Lista de Operações, **"Rend. Float" virou "Rend. Teórico"**, e as duas colunas teóricas foram para o **fim** da tabela, depois das contábeis — as três margens passam a ser lidas em sequência.

### Adicionado — "Margem Teórica (a.a.)"

- Margem anualizada considerando **o Resultado Previsto mais o rendimento potencial do caixa livre**: `(resultado + rend_float) ÷ faturamento`, anualizada pela mesma régua LINEAR da "Margem (a.a.)". Ordenável no servidor (chave `margem_teorica_aa`, migration `0246`) e incluída no Exportar.
- ⚠️ **Isto contraria a Decisão 5 do ADR-0166** ("nenhuma célula soma o float a resultado, margem ou faturamento") e é **mudança de produto deliberada**, registrada como emenda datada ao ADR — não como exceção silenciosa. O que sobrevive da invariante: a palavra "Teórica" no nome e o tooltip dizem que o número embute um componente não-contábil, e as colunas contábeis seguem intactas ao lado para comparação.
- O percentual **viaja pronto no payload** em vez de ser derivado no cliente: `ROUND()` do Postgres é meio-para-longe-de-zero e `Math.round` do JS é meio-para-cima, e nos valores negativos — que esta métrica produz de verdade — os dois discordam na 1ª casa. Arredondando uma vez só, no SQL, a coluna exibe exatamente o número que o `ORDER BY` usa.

### Decidido — a tabela rola na horizontal, e está tudo bem

- **Com 12 colunas a Lista transborda**, e isso foi **aceito**: as duas colunas teóricas ficam atrás da rolagem do `ScrollAutoHide`, que já existia. Medido: faltavam 62px.
- As alternativas foram construídas e **descartadas pelo Yan** depois de vistas na tela: encurtar a data para `20/07/26` (com o rótulo virando "Data") e fundir os três "?" num tooltip único zeravam o transbordamento — a tabela passava a caber exatamente —, mas ao custo de uma data menos legível e de perder a dica ancorada em cada coluna. **Legibilidade venceu a ausência da barra.** As colunas de texto voltaram às larguras originais (Operação 150px, Hotel 100px) pelo mesmo motivo: sem a meta de caber, truncar o nome do casal mais cedo seria custo sem contrapartida.

---

## [5.5.0] — 2026-08-10

MINOR · **Weddings passa a medir o valor financeiro do próprio modelo de recebimento.** Migrations `0238`–`0243` (aditivas, aplicadas) · **ADR-0166**.

### Adicionado — Rendimento potencial do float

- **A métrica.** Quanto o caixa recebido antecipadamente de cada operação renderia se aplicado a **100% do CDI**, em regime **composto**, mês a mês: `saldo_virtual(t) = saldo_virtual(t−1) × (1 + i_t) + fluxo_t`, e o indicador é `saldo_virtual_final − saldo_real_final`. **Simétrico por construção** — saldo negativo rende negativamente, o custo teórico de ter de captar; sai da fórmula, sem ramo especial.
- **PROJETADO**, na mesma base do Resultado Previsto: efetivados pela liquidação, previstos pelo vencimento (`COALESCE(liquidacao_dt, vencimento_dt)` — a mesma régua da `0141`).
- **Três pontos de UI:** coluna **"Rend. Float"** na Lista de Operações (ordenável no servidor, no Exportar), bloco no **drawer** da operação (saldo médio, meses positivos, rendimento e custo teóricos, total) e **gráfico** de duas curvas dentro do card de Fluxo de Caixa. Sem KPI agregado nesta versão — a visão de portfólio emerge do gráfico com o filtro "Todas".
- **Taxa alimentada sozinha**, da API SGS do BACEN (série **4391**, CDI acumulado no mês), com agendamento mensal por `pg_cron`. A rotina **não tem modo de backfill**: a janela é sempre a série inteira, então a carga inicial e o tique mensal são a mesma chamada — e a rotina fica **auto-curativa**, um mês que falhe é preenchido no seguinte.

### Corrigido — dois defeitos achados na própria versão, medindo contra produção

- **O SGS publica o mês CORRENTE parcial, e isso contaminava TODO o futuro.** Em 07/08 a série devolveu ago/2026 = **0,21%** (o acumulado de 7 dias corridos). Como a regra de projeção repete a última taxa conhecida sobre os meses à frente, o rendimento projetado inteiro passou a ser calculado a 0,21% a.m. em vez de ~1,15% — **cinco vezes menor, e plausível o bastante para não levantar suspeita na tela**. Corrigido nas duas pontas (`0240`): a ingestão não grava mês aberto, e a **leitura não aceita** mês aberto. Só a escrita não bastaria — a linha parcial já estava gravada, e removê-la seria destrutivo; inerte pelo filtro, ela se autocorrige quando setembro fechar.
- **O total do float não fechava com a soma das partes por 1 centavo** (`0242`). As três colunas eram arredondadas em separado, e o bloco do drawer mostra as três lado a lado — o usuário soma com os olhos.

### Notas técnicas

- **`WITH RECURSIVE` não é inlineada pelo planner**, então a view do float recomputa por inteiro a cada chamada da RPC da Lista, sem pushdown de filtro. A aplicação foi **sequenciada** por causa disso: objetos novos primeiro (superfície 100% nova, risco zero), **medição contra produção**, e só então o join na RPC viva. Medido em 239 operações: a Lista foi de **2304 → 2660 ms frio** (teto do role `authenticated` = 8000 ms) — materializar não foi necessário.
- **Materializar foi descartado com motivo:** `MATERIALIZED VIEW` não aceita `CREATE OR REPLACE`, então toda alteração futura da métrica viraria `DROP`+`CREATE` destrutivo.
- **`pg_net` é assíncrono e não há extensão HTTP síncrona no projeto**, então a preferência do briefing (o banco buscar e gravar no mesmo corpo) não é executável — vale o padrão já provado: `pg_cron` → `net.http_post` → rota interna.
- Token novo **`--teorico`** (5,4:1 sobre branco). `--setor-weddings` dá 3,72:1 e reprova AA.
- **A revisão bloqueou o fechamento duas vezes, com razão.** (1) `'rend_float'` faltava no **enum Zod da API Route** — a chave entrou no `CASE` do SQL e no cabeçalho clicável, mas não na camada de validação, então clicar para ordenar pela própria coluna da versão devolvia **400** e a Lista virava uma linha de erro. Escapou porque a ordenação foi verificada via REST direto contra a RPC, que pula essa camada. Virou **guard mecânico** que compara o enum com o `CASE` da migration nas duas direções, visto reprovando o defeito. (2) Com a tabela de taxas **vazia**, o indicador saía `0.00` em vez de `NULL`: **`GREATEST`/`LEAST` ignoram NULL** (`GREATEST(NULL,0)` = `0`) e `SUM` também — juntos transformavam "não sei" em "zero", e a coluna exibiria "R$ 0,00" para o portfólio inteiro (`0243`).
- **753 testes.** O agendamento do cron ficou **fora** de `supabase/migrations/` de propósito: agendar antes do deploy responde 200 e fica verde sem fazer nada.

---

## [5.4.5] — 2026-08-05

PATCH · **O espelho do Monde retinha venda que a origem já não reconhecia — e isso inflava faturamento e receita.** Migration `0237` (aditiva, aplicada) · **ADR-0165**.

### Corrigido — venda cancelada na origem continuava somando

- **O filtro de negócio estava na ESCRITA, e o schema queria ele na leitura.** `transformSale` filtrava `status === 'active'` **antes de gravar** e descartava a venda inteira quando não sobrava item ativo. Como o UPSERT só escreve sobre o universo que pediu, venda que **saía** desse universo ficava **invisível para a escrita**: não podia ser atualizada nem removida, e a linha velha sobrevivia **congelada** com os valores de antes do cancelamento.
- **A prova de que o desenho pretendido era outro:** `monde.venda_item` **tem** coluna `status`/`canceled_at` e a `mv_vendas_diarias` **já filtrava** `WHERE i.status='active'` desde a 0179 — mas a tabela tinha **47.182 itens, todos ativos**. O filtro era **código morto** havia 6 versões.
- **Medido em 05/08 contra a API, venda a venda, nos 12 meses:** **24 vendas retidas, R$ 896.718,90 de faturamento e R$ 282.422,05 de receita**, em 8 dos 12 meses. jul/2026 era o pior: **25,19% da receita do mês**, quase tudo numa venda só (a `73083` valia R$ 293.721,82 no espelho e −R$ 687,96 na API, com o único produto cancelado em 24/07). Baseline em `docs/investigacoes/2026-08-05-v5-4-5-baseline-vendas-retidas.md`.
- **E crescia sozinho:** entre 04 e 05/08, julho foi de 5 para 6 vendas retidas e junho idem. Não era passivo estático.
- **A correção:** o espelho passa a gravar **todos** os produtos com o `status` real, e a mv (que já filtra) ignora a venda 100%-cancelada **sozinha**. O filtro morto virou o mecanismo vivo. A falha deixa de ser possível, em vez de detectável.

### Resultado — aplicado e verificado nos 12 meses

| | faturamento | receita |
|---|---|---|
| **total 12 meses** | **−R$ 864.917,26** | **−R$ 267.370,33** |
| jul/2026 | −R$ 450.349,65 | **−R$ 295.801,06** |
| jun/2026 | −R$ 304.883,69 | −R$ 10.939,18 |
| **dez/2025** | −R$ 40.000,00 | **+R$ 44.877,47** |

- ⚠️ **NÃO é "tudo cai".** Em **dez/2025** e **fev/2026** a receita **SOBE** — a venda retida lá tinha receita negativa. A correção **acerta** o número; não o reduz por definição.
- As 24 vendas tinham `raw_hash` divergente ⇒ o UPSERT as regravou **sozinho**. **Nenhum DML**, nenhuma linha apagada.
- **Tripwire APAGADO** nos meses reconciliados; `sem_item_ativo` foi a **zero** — a exclusão que criava o furo deixou de existir.

### Alterado — o cartão distingue o que está espelhado do que conta

- Como a venda cancelada **permanece** no espelho (para auditoria), os contadores crus do `monde_ingest_status` passariam a incluir o que a mv ignora. A **`0237`** acrescenta `vendas_que_contam` e `itens_cancelados`; o cartão de `admin/uploads` mostra **"Vendas que contam"** e, só quando há diferença, a linha "+N canceladas no espelho". Hoje: **193 vendas e 529 itens** preservados como cancelados — informação honesta, não defeito.

### Notas técnicas

- **A materialized view NÃO foi tocada, e isso foi decisão de risco.** O desenho original do briefing pedia alterá-la; validando contra o repo, mv **não aceita `CREATE OR REPLACE`** — exigiria `DROP`+`CREATE`, classificado **destrutivo**, e o `CASCADE` derrubaria a `mv_vendas_diarias_compat` de que **Metas e Performance dependem**. O filtro que já existia resolveu.
- **Não-regressão provada contra dado REAL:** rodando o `transformSale` antigo e o novo sobre o mesmo input de julho — **776 vendas idênticas, 0 mudam**. A versão não altera cálculo nenhum; o efeito é permitir que o UPSERT sobrescreva a linha velha.
- **Resíduo declarado:** venda que **mude** para Welcome/sem-setor depois de espelhada ainda ficaria retida (zero casos medidos; tratá-la exigiria a mudança destrutiva acima). Coberta pelo tripwire.
- **O detector tem de ser o tripwire.** Uma métrica tentadora — `vendas − vendas_que_contam` — está **invertida**: dá zero justamente quando o defeito existe, porque a venda retida tem itens *ativos* no espelho. Um teste sobre ela passaria com o defeito presente e reprovaria depois da correção. O caso de contrato usa o tripwire, por mês verificado.

## [5.4.4] — 2026-08-04

PATCH · **O espelho do Monde perdia venda lançada com atraso — Metas e Performance subestimavam faturamento.** Migration `0232` (aditiva, aplicada) · `0233` pendente de pós-merge · **ADR-0164**.

### Corrigido — venda registrada com atraso nunca entrava no espelho

- **A API do Monde filtra a listagem por DATA DA VENDA, e a janela do incremental anda para frente.** O modo `incremental` de `/api/monde/ingest` — o que o `pg_cron` chama a cada 15 min desde a v5.1.4 — pedia `hoje−2d..hoje`. Venda **registrada com atraso** com data retroativa entra na API depois que a janela já passou por aquele dia, e **o incremental nunca volta lá**. Não era janela pequena demais: era uma janela que anda para frente sobre um eixo que a origem escreve para trás.
- **Medido contra a API, venda a venda, antes de qualquer correção:** **42 vendas fora do espelho, R$ 392.070,01 de faturamento** e R$ 47.806,35 de receita (2025-07-30 → 2026-07-31), **38 delas em jul/2026**. Nenhuma excluída legitimamente — todas com setor válido e item ativo, nenhuma do setor Welcome. **37 de 38** foram registradas mais de 2 dias após a data da venda: atraso mediano **4 dias**, **máximo 32** (venda 73422, data 03/07, registrada 03/08).
- **Isso era subestimação de faturamento em produção**, não risco teórico: o espelho é a fonte de `get_executiva_kpis`, `metas_ritmo_diario`, `get_tendencia_margem`, `get_decomposicao_variacao`, `get_historico_12m_setores`, `get_mix_setor` e `get_historico_mensal` desde a virada da v5.1.4. Quem evidenciava o furo era a comparação contra o upload — que vai ficar dormente e esfriar.
- **A correção não foi alargar a janela.** 32 dias é o atraso *observado*, não um teto garantido, e puxar 35 dias 96×/dia é caro para cobrir cauda. Ficou **janela curta e barata + varredura larga diária**: o incremental passou a `hoje−7d` (o atraso mediano é 4) e entrou o **`mode=reconciliacao`**, que reprocessa **um mês inteiro por invocação**, ciclando os 3 últimos meses por cursor, 3 disparos/dia. A propriedade que importa é que a reconciliação é **auto-curativa** — não depende de acertar o tamanho de janela nenhuma.
- **Resultado medido no run de verificação:** jul/2026 foi de **713 para 751 vendas** no espelho (**+38**, R$ 383.600,25 de faturamento e R$ 45.126,31 de receita), mais 1 venda em jun/2026. **Idempotência provada:** a 2ª passada sobre o mesmo mês inseriu **0** de 775 lidas.

### Corrigido — race de perda silenciosa na staging compartilhada (pré-existente)

- **`monde_ingest_limpar_staging` dá `TRUNCATE` em tabelas de staging COMPARTILHADAS no início de toda janela.** Duas ingestões sobrepostas fazem uma apagar as linhas da outra em pleno vôo, e as vendas lidas da API nunca são promovidas. A race **já existia** (um ciclo que passe de 15 min se sobrepõe ao tick seguinte); a reconciliação diária a tornaria rotina.
- **Lock durável** (`monde_ingest_claim`/`monde_ingest_release`, linha em `monde.ingest_control` com TTL) em todo modo que toca a staging. `pg_advisory_lock` não serve: a janela atravessa várias chamadas HTTP sobre conexões pooladas. O **release compara o dono** — sem isso, um `finally` que não cheque o retorno do `claim()` libera o lock de um processo vivo. Token por execução.
- No incremental, lock ocupado responde **200 com `pulado: 'lock'`** e **não** grava o marcador de sincronização: pular não é sincronizar.

### Adicionado — detector e tripwire, sempre contra a API

- **`mode=auditoria&from&to`** (só leitura): lista a API e responde quais vendas faltam no espelho. É o teste de aceitação da versão. A referência é a **API**, nunca o upload — um monitor ancorado no upload morre junto com ele.
- **Tripwire mensal** exposto em `monde_ingest_status` e num cartão read-only **"Sincronização Monde"** em `admin/uploads` (superfície nova: as 5 bases de lá são todas de planilha).
- ⚠️ **A especificação original do tripwire não fechava, e isso foi medido.** Comparar contagem do espelho × `total` da API acende **todo mês, para sempre**: a API conta vendas que a transformação exclui por regra — em jul/2026, **8 Welcome + 12 sem setor + 9 sem item ativo, de 775**. Rodado uma vez, acendeu nos 12 meses. Alarme sempre aceso não é alarme. O tripwire virou **subproduto da reconciliação**, que já baixa o detalhe de cada venda e portanto sabe a contagem exata de espelháveis — **zero chamada extra à API**. Grava por mês `api · lidas · sem_sale_id · espelhaveis · excluidas{por motivo} · erros · espelho · sobrando · conta_fecha`, e o alarme é `erros>0 || sobrando>0 || sem_sale_id>0 || !conta_fecha`. **Mês que a reconciliação ainda não visitou aparece como não verificado e nunca acende.**
- `conta_fecha` é a checagem de integridade `lidas == espelháveis + Σexcluídas + erros` — é ela que dá sentido ao resto. Verdadeira nos 3 meses medidos.

### Alterado — `ultima_sincronizacao` passa a ser só do incremental

- `monde_ingest_promover` grava `ultimo_promover` sempre que promove algo, e a `0183` incluía essa chave no selo. Com a reconciliação diária, o selo passaria a avançar por conta dela e **mascararia por ~45 min um incremental morto** — justo o alarme de `sync-atraso.ts`. Estreitado para `ultimo_incremental`. **O rótulo de `/metas` não muda de valor — muda de garantia.** A reconciliação ganhou campo próprio (`ultima_reconciliacao`).
- Efeito colateral honesto: `backfill`/`window` manual não reseta mais o relógio do alarme. É a leitura correta (o alarme mede a saúde do cron automático), mas confunde quem olhar `/metas` logo após um backfill manual durante incidente.

### Registrado, não corrigido

- **5 vendas em jul/2026 e 5 em jun/2026 continuam no espelho tendo deixado de ser espelháveis** — perderam o último item ativo depois de ingeridas, e o UPSERT nunca remove. Achado desta versão, medido no campo `sobrando` do tripwire (é o que o mantém aceso hoje). **Remover é escrita destrutiva em dado e faria faturamento de mês fechado cair** — decisão do Yan, fora deste hotfix.
- **Vendas que a API lista sem `sale_id`**: a ingestão não as alcança (precisa do id para o detalhe). Zero nos meses medidos; o campo existe para o dia em que não for.

### Notas de aplicação

- **`0232` já aplicada** (backup-gate verde; restore-test em 3 tabelas com count+checksum idênticos). 21 verificações via REST/service_role, executando o corpo das RPCs — inclusive a prova de que um dono não solta o lock de outro.
- **`0236` (as 3 entradas de `cron.schedule` da reconciliação) ficou FORA da `0232` de propósito e foi aplicada no PÓS-MERGE**, porque o cron chama a URL de produção (do Vault) e agendar antes do deploy faria os jobs responderem 200 e ficarem **verdes** sem reconciliar nada — fabricando a falha silenciosa que esta versão existe para caçar. Ordem cumprida: deploy provado em produção (`mode=auditoria` e `mode=reconciliacao`, os dois 200) **e depois** o agendamento. As 3 entradas estão `active`; 1º ciclo real em 06:05 UTC de 05/08.
- **Numeração torta, e de propósito.** Esta versão nasceu **5.4.5** (a v5.4.4 *Metas por subsetor* estava em curso em paralelo e havia reservado 0230/0231 + ADR-0163). Aquela versão então entrou em **stand-by**, liberou o número **5.4.4** e renumerou as migrations dela para **0233/0234/0235** — já aplicadas. Resultado: versão **5.4.4**, **ADR-0164** (o 0163 segue reservado, com arquivo na branch parada), migration aplicada **0232** (não renumerada — já estava no histórico do banco) e agendamento na **0236**. **`0230`/`0231` nunca existiram.**
- ⚠️ O arquivo da `0232` diz "v5.4.5" no header e cita a "0233": as duas referências ficaram velhas e **não foram corrigidas**, porque `supabase_migrations.schema_migrations` guarda os `statements` de cada migration aplicada e editar o arquivo o faria divergir do histórico.
- **Dívida registrada:** a `0232` foi aplicada de uma branch não mergeada e, por isso, o `db push` da sessão paralela quebrou com `LegacyDbPushMissingLocalError` até ela trazer os arquivos para o `main` (PR #215). **Aplicar migration antes do merge trava toda outra branch.**

## [5.4.3] — 2026-08-04

PATCH · **Solicitações: anexo com acento no nome voltava a falhar, e o erro do modal aparecia fora da vista.** Sem migration, sem ADR.

- **Anexo com acento no nome não subia.** A chave do objeto no Storage era montada com o nome CRU do arquivo (`tmp/<uuid>/${file.name}`), e o Supabase Storage valida a chave com um regex cujo `\w` — **sem a flag `u`** — é só `[A-Za-z0-9_]`. Qualquer acento devolvia `400 InvalidKey`, e a mensagem vazava crua para a tela: `Falha no upload: Invalid key: tmp/2bb4b2…`. O caso relatado foi **"Nota Fiscal - Bruna e João.pdf"**, onde o **`ã` era o único caractere ilegal** — espaço, `-` e `.` são todos aceitos pelo Storage.
- **A falha é determinística POR NOME DE ARQUIVO, e é isso que a fazia parecer intermitente.** O mesmo usuário havia aberto duas solicitações com anexos semelhantes minutos antes: aqueles nomes eram ASCII puro. Nada tinha a ver com sessão, permissão, MIME ou tamanho — cada um desses tem mensagem própria (`Tipo não permitido: …`, `Arquivo acima de 10 MB.`), e colisão de nome é impossível pelo `randomUUID()`. Vale nos dois sistemas operacionais: no macOS o nome chega em **NFD** (`a` + U+0303) e o combinante também está fora do `\w`.
- **A correção já existia no repo, no lugar errado.** O Acervo tinha `sanitizarNomeArquivo` desde a v4.34.0, e o docstring dele **documentava a divergência**: *"Diferente de Solicitações (bucket restrito a poucos MIME, usa o nome cru)"*. A premissa era falsa — **restrição de MIME não tem relação nenhuma com validade de chave**. O helper foi promovido a `lib/storage/nome-arquivo.ts` **sem mudança de comportamento** e agora serve às duas pontas; a cópia local do Acervo saiu.
- **Custo zero para o usuário porque o nome original já era preservado à parte.** `nome_arquivo` (metadado) sempre recebeu `file.name` intacto e é dele que a UI tira o rótulo — sanitizar afeta só a chave interna. Efeito colateral único e cosmético: o nome com que o browser salva ao abrir a signed URL (resolvível com `?download=` se algum dia incomodar).
- **Nenhuma migração de dados foi necessária, e isso foi medido, não suposto.** `app.solicitacao_anexo` tem 3 anexos, **`nao_ascii = 0`** — nenhuma chave acentuada jamais entrou na base, o que confirma que o bloqueio sempre foi total (nunca "às vezes funcionava"). Os 2 paths com caractere fora do conjunto sanitizado têm apenas **espaço**, que o Storage aceita; seguem sendo lidos verbatim.
- **Provado ponta a ponta contra o Storage de produção**, não só por teste unitário: a chave com `ã` devolve `400 InvalidKey` com exatamente a mensagem do print; a chave que o helper gera (`Nota_Fiscal_-_Bruna_e_Joao.pdf`) sobe **200** e o **`move` para `sol/…`** — o 2º passo real da criação — também devolve **200**. Objetos de diagnóstico removidos e prefixos conferidos vazios.
- **13 testes novos** em `lib/storage/nome-arquivo.test.ts`, ancorados no que importa: o teste **replica o `isValidKey` do storage-api** e afirma que qualquer entrada hostil (acento NFC e NFD, `ç`, `#`, `%`, travessão `–`, `[`, emoji, CJK, 300 chars, string vazia) produz uma chave que o Storage aceita. Sem isso o teste viraria asserção de string e deixaria de proteger contra a regressão real.
- **Nomes que quebravam pela mesma armadilha** e agora passam: `Orçamento`, `Comissão`, `#`, `%` — e um traiçoeiro, o **travessão `–` (U+2013)** que o Word/Excel gera por autocorreção no lugar do hífen e é visualmente quase idêntico ao `-` permitido.

### Corrigido — erro do modal de nova solicitação nascia fora do campo de visão

- **A faixa de erro ficava no TOPO do corpo rolável enquanto "Enviar solicitação" ficava embaixo.** Quem clicava no botão não via a mensagem ("Informe a data-limite.", "Escolha um destinatário.") e o modal parecia simplesmente não responder. Erro de validação do cliente e erro devolvido pela RPC passam os dois pelo mesmo `setErro`, então os dois estavam afetados.
- **A barra de ação e a faixa de erro passaram para o `rodape` FIXO do `ModalCentral`** — prop que já existia e que este modal não usava (o `editor-dre` e o `revisar-envio-modal` já a usam). É o padrão do DS §4.1: barra de ação fora da região rolável.
- **Mover só a faixa para o fim do corpo não resolveria**, e essa foi a razão de mexer na barra de ação junto: o corpo **rola**, então erro e botão ainda poderiam estar os dois fora da vista, e inserir a faixa acima do botão num container rolado até o fim **empurraria o botão para fora do viewport**. No rodapé fixo o painel tem altura fixa (`alturaFixa`/`h-[85vh]`) e o corpo é `flex-1 min-h-0`: o rodapé crescer só **encolhe o corpo** — o botão não se mexe e o erro nasce colado nele. O `role="alert"` que a `FaixaMensagem` já traz cobre o anúncio por leitor de tela.
- Ordem do DOM preservada (corpo antes do rodapé), então o foco inicial do `ModalCentral` continua caindo no Select "Tipo" e o tab-order não mudou.

## [5.4.2] — 2026-08-03

PATCH · **Weddings: margem anualizada na Lista de Operações + Fluxo de Caixa unificado com janela ajustável.** Migration **0228** (aditiva), **ADR-0162**.

- **Coluna "Margem (a.a.)" na Lista de Operações.** A margem absoluta distorce a comparação entre ciclos diferentes: 17,5% em 30,4 meses valem **6,9% a.a.**, não 17,5%. A anualização é **LINEAR** (`margem × 12 / duração_meses`), nunca composta — "margem por ano de operação ocupada"; a composta pressuporia reinvestimento a cada ciclo, que não existe num casamento. `Duração = data_evento − data_venda_contrato`, em meses de **30,44 dias** — a MESMA definição que a coluna "Duração" já exibia e que o banco usa para ordenar; as três pontas dividem pelo mesmo 30,44 de propósito. Duração ausente/zero/negativa e margem não-finita ⇒ **travessão**, nunca `Infinity`/`NaN`. Fórmula em módulo próprio e testável (`lib/weddings/margem-anualizada.ts`, **24 testes** de fronteira) porque é **definição de métrica**, não detalhe de componente — e porque o vitest só coleta `src/**/*.test.ts`, nunca `.tsx`.
- **Ciclo curto é sinal, não cap.** Anualizar ciclo curto é frágil por construção (3,9 meses a 32,5% ⇒ 100% a.a.); o valor vai **cru**, sem teto, e a fragilidade é explicada pela ajuda **"?"** do cabeçalho (padrão da casa: `CabecalhoAjuda`/`posicao-projetado`). Dois detalhes do balão que já custaram caro: `!whitespace-normal` (sem o important, texto longo vira uma linha invisível gigante e cria scroll horizontal) e `!left-auto right-0` (é a última coluna; ancorado à esquerda abriria fora da borda).
- **Cor da coluna nova = a mesma regra de faixa da "Margem"** (decisão do Yan). Medido em produção: **79 das 237 operações (33%)** caem em banda diferente nas duas colunas — 25 vermelhas no a.a. com Margem verde (o efeito pretendido) e 10 no inverso (ciclo curto). "Operação / Casal" → **"Operação"** e "Resultado Previsto" → **"Resultado Prev."** cedem largura; o Exportar leva a coluna nova como **número cru**.
- **A migration 0228 existe por um motivo que o briefing não previu.** A lista **pagina no servidor** e a whitelist de `ORDER BY` da RPC termina em `ELSE 'd_data_evento'` — um **fallback silencioso**. Ordenar só no cliente reordenaria apenas as 10 linhas visíveis enquanto o cabeçalho anuncia ordenação global, e pedir `margem_aa` sem tocar o SQL ordenaria por data do evento sem avisar. A 0228 acrescenta a chave `d_margem_aa` usando **a mesma expressão** de `d_margem_liquida` no numerador; se as duas divergirem, a lista ordena por um número diferente do que exibe. `d_margem_aa` **não entra no payload** — nenhum schema Zod muda. Verificado via REST/`service_role`: ordenação monotônica nas duas direções, `NULLS LAST` honrado, e **as 13 chaves de ordenação × 2 direções seguem funcionando** (26 combinações, zero quebras — o corpo da função foi transcrito sem dano).
- **Fluxo de Caixa: um card só, com slider de janela entre os dois gráficos.** O slider é o eixo de tempo compartilhado — os dois obedecem sempre à mesma janela. A RPC devolve uma **janela larga (37 atrás + 36 à frente) uma vez** e o cliente **fatia**: arrastar é instantâneo, sem refetch. **Não precisou de migration** — a janela sempre foi parâmetro do chamador e a 0141 já clampava em 120/60; o briefing supunha que a RPC teria de ser alargada. Payload medido: **3,9 KB → 6,6 KB**. Limite de **36 meses para cada lado**; o 37º mês do passado é a margem técnica do rebase, não uma posição alcançável.
- **O acumulado REINICIA na borda esquerda da janela** — entradas, saídas **e** a referência de saídas, juntos: com o acumulado reiniciando, uma referência absoluta sairia de escala e achataria o gráfico. A referência passa a ser o total previsto **dentro da janela** ("…na janela"). O invariante é testado: `totalSaidasJanela` == acumulado de saídas do último mês visível. Medição que justifica: o `total_saidas` da própria RPC **muda com a janela buscada** (R$ 50,5 Mi em 24+18 → R$ 63,7 Mi em 48+36) — usá-lo inflaria o benchmark junto com uma decisão de fetch. Matemática em `lib/weddings/janela-fluxo.ts` (**25 testes**).
- **Defeito latente corrigido de carona:** o gráfico mensal antigo derivava o valor do mês por diferença de acumulados com `prev = {0,0}` no índice 0 — a **primeira barra visível absorvia toda a história anterior à janela**. A margem de um mês do rebase elimina isso: todo mês visível tem um mês anterior real.
- **TopSection própria "Fluxo de Caixa"**, na ordem pedida: filtro por operação no **topo dela** (vale para os dois cards, então não pertence ao cabeçalho de um gráfico) → **card de totais** → card único dos gráficos. Os totais saíram do cabeçalho do gráfico mensal. "Total a receber/a pagar" é **compromisso total** do escopo filtrado, **não** recorte da janela — a RPC os calcula sem filtro de data, e foi medido: **idênticos** em 24+18 e 48+36.
- **Slider no padrão do Fluxo de Caixa do Financeiro** (pedido do Yan), extraído para o primitivo `components/shared/slider-horizonte.tsx`: rótulo "Horizonte de tempo:", trilho **neutro** (`--text-secondary`, não `--brand` — é controle de leitura), régua de riscos com marcos semestrais e `posTick` compensando a meia-largura do thumb (sem isso a régua sai de fase com o valor nos extremos). `financeiro/posicao-projetado.tsx` pode migrar para o primitivo quando aquela tela for tocada.
- **Removidos:** `weddings/fluxo-caixa-mensal.tsx` e `weddings/acumulado-receb-pag-chart.tsx` (viraram o card único; consumidores verificados em `src/` e `supabase/` antes de remover) e a rota de preview do gate, que cumpriu o papel.
- **Achado da conferência visual:** os dois totais **se sobrepunham** — item de flex encolhe abaixo do próprio conteúdo por default e o valor de 8 dígitos invadia o vizinho. Corrigido com `shrink-0`. `tsc`, lint, build e 644 testes passavam **com o defeito presente**.
- **Bug corrigido, reportado com a tela na mão:** marcar uma operação no filtro fazia a página **saltar para o topo**. O App Router rola para o topo em toda navegação por default e o `dropdown-operacao` fazia `router.push(url)` sem `{ scroll: false }` — numa interação de múltipla escolha, isso arranca o usuário do controle a cada clique. **O defeito era do padrão e foi corrigido por inteiro neste patch** (a pedido do Yan): os outros 7 filtros que navegam no lugar — `periodo-pills-url`, `periodo-filter-url`, `setor-filter`, `metas-periodo-pills`, `cadastro-grade` e dois em `solicitacoes-content` — ganharam o mesmo `scroll: false`. O padrão correto já existia em `periodo-filter-pills-url` e na tabela da DRE, então sete lugares apenas não o seguiam. Critério: só recebe `scroll: false` quem navega para o **mesmo `pathname`** (filtro); os dois drill-downs para `/performance?setor=` e o guard do preview ficaram de fora, com motivo registrado no out-briefing. O `tsc` pegou a primeira tentativa, que pôs o objeto de opções no `startTransition` em vez do `push`.
- **Ajustes de apresentação pedidos depois de ver a tela:** títulos dos dois gráficos de volta ao nível hierárquico de quando eram cards separados, encurtados para **"Mensal"** e **"Acumulado"**; rótulo da janela em **"N meses passados + N meses futuros"**; slider sem o rótulo "Horizonte de tempo:", extremos dizendo só "N meses", **trilho dourado** (virou a prop `corTrilho` do primitivo, com o neutro como default para não contaminar um call-site futuro do Financeiro) e **28px de respiro** de cada lado; **"Inverter saídas" removido** — as saídas vão sempre para cima, e por consequência o eixo Y do gráfico mensal deixou de mostrar valor absoluto (com as barras descendo o sinal vinha da direção; agora a metade negativa só tem a linha de resultado, e "R$ 1,5 Mi" abaixo do zero seria leitura errada). O **slider ficou instantâneo** com `isAnimationActive={false}` nas 5 séries: o atraso era a animação default de 1500ms do Recharts reanimando os dois gráficos, não o cálculo. No card de totais, o **filtro passou para dentro dele**, a frase explicativa saiu, e os dois valores dividem em metades iguais o espaço não ocupado pelo filtro — a régua vertical cai no meio desse espaço.
- **O mesmo padrão de slider foi para o Fluxo de Caixa do FINANCEIRO** (gráfico mensal), sem gráfico de acumulado e mantendo o título do card. Aqui a **migration 0229** foi necessária de verdade: a janela daquela RPC é **hardcoded no corpo** (23 meses atrás + 18 à frente), ao contrário da de Weddings — sem alargar para 36+36 (73 meses) o slider não teria o que recortar. **Nenhum número existente muda**: cada mês é agregado do próprio mês, sem acumulado nem baseline. Provado por **cross-check independente** contra `get_fluxo_caixa_kpis_b`, que lê a MESMA view por range explícito — 4/4 campos batendo em todos os meses amostrados. Recorte no cliente por `lib/fluxo/janela-mensal` (**17 testes**), helper separado do de Weddings de propósito: reusar aquele obrigaria esta série a fingir que tem acumulado e `eh_futuro`. O "hoje" vem do **servidor**, não do relógio do cliente. Trilho **neutro** (não dourado) porque a tela já tem o slider de "Horizonte de tempo" do Fluxo Projetado; paleta `--positive`/`--negative` preservada. 65 dos 73 meses têm movimento — os 8 de 2029 vêm vazios porque `fato_fluxo` corta previsto em 2028.
- **Acessibilidade (achado ALTO da revisão):** o `Tooltip` do DS abria **só no hover**, então a ajuda "?" era invisível para quem navega por teclado — e ela é a única explicação de por que "Margem (a.a.)" pode discordar de "Margem". O primitivo passou a abrir **no foco** (`group-focus-within`, aditivo, vale para todos os call-sites) e o gatilho virou `<button>` com `aria-label`. Verificado no **CSS gerado pelo build**, não só no fonte.
- **Caso de contrato novo (achado MÉDIO da revisão de banco):** a prova de que a ordenação por `margem_aa` funciona era **manual**. Virou guard permanente em `rpc-contrato.test.ts` — monotonicidade nas duas direções com a MESMA função que a tela usa, `NULLS LAST` e paginação. **Visto reprovando:** 97 quebras quando a RPC ordena por `data_evento`, exatamente o fallback silencioso do `ELSE`.
- De carona, um comentário que mentia em `types/api.ts`: dizia que a RPC "ainda NÃO emite" `total_a_receber`/`total_a_pagar`, quando emite desde a 0106.

---

## [5.4.1] — 2026-08-03

PATCH · **DRE: refino visual do Resumo Executivo e da Decomposição dos Lançamentos.** Sem migrations, sem ADR. **Nenhum número muda** — a versão inteira é apresentação.

- **Resumo Executivo com a gramática da tabela.** O Resumo é uma visualização das linhas-chave da tabela logo acima, no MESMO card, mas desenhava-se com outra régua — e diferença de ESTILO entre dois blocos que mostram os mesmos números é lida como divergência de DADO. Passa a usar o cabeçalho da tabela (10px/caixa alta/`tracking .09em`), o mesmo box, a mesma altura de linha e o mesmo `ConteudoContabil` (o "R$" esmaecido à esquerda, número tabular à direita, negativos entre parênteses). As linhas ganham a cor dos **grupos de categoria** (`blocoH` = `--band`), **não** a banda escura dos totalizadores: seis bandas escuras seguidas viravam parede e a banda perdia a função de contraste (decisão do Yan). Rótulos em caixa alta com o **prefixo contábil em coluna própria** (`(=)`/`(+)`, alinhados verticalmente). O título sobe para a hierarquia do título da DRE e **perde o subtítulo**; a ressalva de que o Resumo ancora no ano corrente e ignora a pill de ano virou o **"?"** ao lado, no idioma de ajuda já usado em `posicao-projetado`/`repasse-mensal`.
- **Achado de acessibilidade corrigido na passagem.** Mover as linhas para a banda clara sem trocar a tinta teria criado uma regressão silenciosa de contraste: os tons base dão **3,88–4,31:1** sobre `--band` e reprovam AA — a tabela usa os `-deep` (7–10:1) exatamente por isso, e o Resumo não usava. As colunas de Δ passam a resolver a cor por `corPorSinal('blocoH', …)`, a régua compartilhada. As 4 colunas de valor absoluto seguem **neutras de propósito** (as 6 linhas são todas "quanto maior melhor"; o sinal só informa na variação).
- **`ConteudoContabil` e `corPorSinal` viraram módulo compartilhado** (`dre/celula-contabil.tsx`), extraídos de `tabela-dre.tsx` sem mudança de comportamento. Duas cópias da mesma gramática dentro do mesmo card envelheceriam em ritmos diferentes.
- **"Editar estrutura" subiu para entre a tabela e o Resumo.** A ação edita a estrutura da TABELA, mas fechava o card, depois do Resumo — a distância até o que ela governa crescia junto com o Resumo. Movida nos **dois** ramos de render (o normal e o fail-safe), que sem isso passariam a divergir na ordem; gating por permissão e destino do link intactos.
- **Selo de última atualização** no canto superior direito do card, com a data do último upload de **Lançamentos por Movimentação** — a base que alimenta o demonstrativo (`financeiro.fato_fluxo`). **Sem migration:** `status_lancamentos_movimentacao` (0185) já devolve `max(carregado_em)` de `raw.lancamentos_movimentacao`, exatamente a semântica pedida. Ela tem `GRANT` só para `service_role`, então a leitura é **server-side pelo admin client**, dentro da página que já executou `requireArea('financeiro/dre')` — abrir `GRANT` para `authenticated` exporia a contagem da raw a todo usuário logado, mais superfície do que um selo pede (mesmo padrão de `lib/metas/ultima-sincronizacao`). Reusa o componente `UltimaAtualizacao` de Metas com a **vigília de atraso desligada**: os 45min embutidos ali são a régua do cron do Monde, e para uma fonte de cadência humana o alerta ficaria vermelho quase sempre — alerta permanente não é alerta, é ruído. Timestamp nulo ⇒ o selo **não aparece** (nunca "sem data"). Em largura estreita quebra para baixo do título, acima da toolbar.
- **Decomposição dos Lançamentos:** pills descem para a linha abaixo do título; **cor plana** — `PALETA_ENTRADAS`/`PALETA_SAIDAS` (5 e 7 tons, com hex intermediários hardcoded) saem, e cada lado usa a única cor que já era a do seu próprio título (`fluxoColors`), com duas exceções por decisão do Yan: "Outros (N blocos)" segue no neutro morno (é agregado, não um bloco) e "Não classificadas" no `warning`. O **drill abre logo abaixo da própria barra**, não mais depois do Total — que continua sendo o último elemento do painel. Cortina e chevron **reusados**: `grid-template-rows` `0fr↔1fr` em 450ms `cubic-bezier(.32,.72,0,1)` do TopSection, com `inert` no estado fechado; o SVG desenhado à mão sai em favor do `ChevronLeft` do lucide.
- **Detalhe que só a implementação revela:** o drill é computado para TODA barra, não só para a aberta. Com o conteúdo montado apenas quando ativo, ele sumia no mesmo render em que a cortina começava a fechar, e o fechamento colapsava uma caixa vazia — abria bonito e piscava ao fechar. É a mesma escolha do TopSection, que mantém o conteúdo montado. Custo: um filter+sort por barra, memoizado.
- **Não implementado por já existir:** o briefing pedia que as barras-filhas fossem proporcionais ao maior filho. `montarDrill` já devolvia `maior` e a largura já era calculada sobre ele desde a v5.3.1.

**Rodada de ajustes (03/08, depois de o Yan ver a tela):**

- **`Δ% 25·26` virou `Δ% YTD 25·26`** na visão Consolidado (e segue o padrão nos demais pares de anos). A variação sempre foi entre os **YTDs**, mas o rótulo não dizia — e a coluna vizinha à esquerda é justamente um **ano cheio**, o que tornava a leitura errada a mais natural.
- **O Resumo Executivo virou CARD PRÓPRIO**, irmão do card da DRE em vez de um bloco dentro dele. De carona some uma duplicação estrutural: ele nunca dependeu de `dados` (o ano navegado), só de `consolidadoAnos` — morando dentro da `TabelaDre` precisava ser renderizado nos **dois** ramos de render, e a prop `anoCorrente` existia só para atravessá-la. Agora a página o monta direto e a `TabelaDre` perdeu a prop.
- **Rótulos de variação do Resumo alinhados à convenção do Consolidado:** `Δ 24→25` → `Δ 24·25` e `Δ YTD` → `Δ YTD 25·26` (o "Δ YTD" sozinho não dizia quais anos comparava).
- **Linhas do Resumo passam de `--band` para `--band-soft`** — o cinza claro dos **subgrupos**, não o dos grupos. O box já é `--band`; com as linhas na mesma cor, cabeçalho e corpo viravam um bloco só.
- **Toda célula de valor do Resumo ganhou cor por sinal** (verde/vermelho), não só as duas colunas de Δ. Sobre banda clara isso exige os tons `-deep`, que `corPorSinal('sub', …)` entrega — os tons base reprovariam AA, a mesma armadilha de antes.
- **Decomposição — o "‹ voltar" saiu:** desde que a expansão passou a ser inline sob a própria barra, a barra (que tem chevron e `aria-expanded`) já fecha o drill; o botão era um segundo caminho para a mesma ação.
- **Decomposição — Total fixo e alinhado entre os dois lados, com scroll por lado.** Cada lado virou coluna flex de altura travada (`h-full max-h-[420px]`, grid com `items-stretch`): só a **lista** rola, via `ScrollAutoHide` (que já se dimensiona por cadeia flex e dá barra própria a cada lado); título e Total ficam fora da região rolável. O teto comum é o que põe os dois Totais na **mesma linha horizontal**, tenha o lado 3 barras ou 8 — o lado mais curto fica com espaço vazio antes do Total, e é assim que o alinhamento acontece. Gutter `pr-3.5` na lista pela mesma razão da tabela: o thumb é `absolute right-1` e sem folga flutuaria sobre os valores.
- **Mais respiro entre as pills de filtro e o conteúdo** da Decomposição (`mb-5` → `mb-8`).
- **Números do Resumo maiores e em negrito** — a `<table>` passou a rodar em `text-[13px]` e as células de valor ganharam `font-semibold`, que é exatamente a régua da tabela da DRE (13px na `<table>`, `font-semibold` nos valores de linha de subgrupo). Ficavam em 11px e peso normal, mais discretos que os próprios rótulos; num resumo executivo os números **são** o conteúdo. Cabeçalho (10px) e rótulo da conta (11px) cravam o próprio tamanho e não se moveram.
- **Respiro para a barra de rolagem horizontal do Resumo.** O thumb do `ScrollAutoHide` é `absolute bottom-1` com `h-1.5`, medido do próprio wrapper — sem folga ele encostava na última linha. Entraram os **dois** gutters que a tabela da DRE já usa: `pb-1.5` por fora (encolhe o wrapper e afasta a barra da borda do box, sem tocar no componente compartilhado) e `pb-3.5` no viewport (respiro dentro da área rolável, sobre o qual o thumb flutua). Ambos mostram o `bg-band` do box, então a tabela termina numa moldura contínua.

## [5.4.0] — 2026-07-31

MINOR · **API Externa do módulo de Solicitações (núcleo genérico + admin de chaves).** Plataformas internas passam a criar e cancelar solicitações no Janus via **chave de API**, e a receber **callbacks de status** — categoria NOVA de confiança (escrita autorizada por chave, sem requireArea humano; ADR-0158 provisório). O Janus é o dono do formato: o **cadastro de tipos gera o contrato** — slug estável no tipo, **CHAVE ESTÁVEL por campo** (sobrevive ao apaga-e-recria do editor; corrige a fragilidade dos IDs recriados — ADR-0159), flags `exposto_via_api`/`exige_referencia_conclusao` e lista de roles permitidas; retrofit dos tipos existentes via RPC service-only (migration segue aditiva). **Chaves por plataforma** (`/admin/api-externa`): segredo só como hash sha256 (exibido uma única vez), whitelist de tipos, usuário-robô como autor (proveniência), revogação irreversível, log de chamadas. **Validação COMPARTILHADA** (`app.solic_validar_e_snapshotar`, extraída verbatim — incl. regra de data v4.19): a UI e a API recusam exatamente o mesmo; RPC-irmã `criar_solicitacao_externa` (idempotência obrigatória com índice único e proteção de corrida; destinatário do disparo validado SEM fallback e ecoado — ADR-0160) + `cancelar_solicitacao_externa` (só da própria chave, só aberta; conflito reportado). Rotas `/api/externo/{tipos, solicitacoes, solicitacoes/{id}/cancelar, outbox/processar}` com auth própria (API_AUTH_PROPRIA por prefixo), erros estruturados e limite de payload. **Outbox de callbacks at-least-once** (ADR-0161): 4 eventos enfileirados NA transação da movimentação (só origem externa), entrega com retry/backoff (pg_cron 5min + inline nas rotas), movimentação JAMAIS quebra por entrega. Seed do primeiro tipo exposto ("Abatimento de créditos", TARS/CRM) com roles vazias (inerte até configuração) + **documento de contrato do integrador** (`docs/api-externa-solicitacoes.md`). **Round 2 (28/07, decisões do Yan):** o conceito "conclusão exige referência externa" foi EXTIRPADO (migration 0215 remove o comportamento; concluir volta a 1 clique em todos os tipos; a conciliação origem↔lançamento é responsabilidade da plataforma de origem — emendas nos ADRs 0159/0161; o DROP das colunas órfãs é patch destrutivo pós-merge) e a configuração da integração foi CENTRALIZADA: a tela de chaves virou **"API externa"** (tipos expostos + "Equipes que podem receber via API" — rótulo corrigido — + chaves + log; RPC dedicada `admin_solic_tipo_api_config` salva a config sem re-gravar o formulário) e o editor de tipos voltou a ser só formulário (nome + campos, com a chave estável por campo). **Round 3 (29–30/07, decisões do Yan):** a lista branca de **equipes por tipo foi REVOGADA** (migration 0216 — o fluxo humano nunca restringiu destino por tipo; `destinatario` segue obrigatório e validado contra as equipes existentes, e a descoberta passa a listar todas elas; `DESTINATARIO_NAO_PERMITIDO` deixa de existir); a configuração de um tipo virou **só ligar/desligar a exposição** (controle direto na tabela, sem modal); e a **documentação da API passou a viver na própria plataforma** (`/admin/api-externa/documentacao`), com a seção de tipos/campos **gerada do cadastro real** — a documentação não desatualiza em relação ao que a API aceita. **Round 4 (30–31/07, decisões do Yan — plataforma aberta ao público interno da empresa):** (a) o disparo pela API passou a **exigir `solicitante_email` de pessoa já cadastrada e ATIVA** no Janus, e essa pessoa vira o **solicitante de verdade** — vê em "Minhas solicitações", recebe os e-mails e **pode cancelar pela tela** (com o robô como autor, ninguém conseguia acompanhar nem cancelar; sem cadastro ativo → `422 SOLICITANTE_INVALIDO`, sem fallback), e a procedência passou a aparecer num selo **"via integração X"** no drawer/board/"Minhas solicitações" (`app.solic_json` ganhou a chave `origem`) — migration **0217**, emenda no ADR-0158; (b) a **documentação da API ganhou permissão própria** ("Solicitações (documentação)", área RBAC nova) e o botão para ela passou a viver **só na tela inicial do módulo de Solicitações** (a pill que existia na tela de administração foi removida a pedido do Yan — dois caminhos deixavam a permissão nova parecendo acessório de uma tela de gestão): quem só precisa integrar não precisa mais de acesso de gestão; (c) na tela "API externa", **Chaves de API subiu para cima de "Tipos Expostos"**; (d) **limpeza do histórico** (26 solicitações, 21 anexos + os 20 binários no Storage, 9 registros de log de chamada, todos de verificação — nenhuma chamada de integrador real existe) e exclusão dos **2 tipos arquivados** que eram teste, liberando a **correção dos sufixos `_2` dos slugs** (`abatimento_de_creditos`, `contas_a_pagar`) — exceção única e datada à imutabilidade do slug, segura só porque nenhuma chave de API existe ainda (emenda no ADR-0159). Por ser **destrutiva**, essa limpeza é o patch **0220**, que fica FORA de `supabase/migrations/` (`supabase/patches/`) até o Yan aplicá-la em TTY: um arquivo destrutivo parado na pasta é arrastado pelo primeiro `db push` aditivo — foi assim que a v5.2.0 dropou bases. Ajustes finais de 31/07 (pedidos do Yan): a rota da tela virou **`/admin/api-externa`** (era `/admin/chaves-api` — o nome antigo descrevia uma das tabelas, não a página, que hoje tem tipos expostos, chaves e log; a pasta de componentes acompanhou, por convenção do repo), a página de documentação **perdeu o botão de voltar** (ela existe por conta própria, alcançada pela tela do módulo), a pill virou **"Documentação API"** e o subtítulo da página passou a usar parênteses. Correções da revisão do round 4: migration **0219** (`solic_tipos_documentacao`) — a área nova não alcançava o DADO que a página mostra (a seção viva lia a RPC de gestão, então quem tivesse só a permissão nova entrava e via erro; a irmã enxuta aceita as duas áreas e devolve só tipos expostos) — e, no script de Storage, **gate de TTY** (aborta em sessão não-interativa, igual ao `db:migrate --destrutiva`) + **cópia local obrigatória antes de apagar**, porque o backup-gate não cobre binário de Storage. **Endpoint de CONSULTA (migration 0221, decisão do Yan em 31/07):** `GET /api/externo/solicitacoes/{id}` e `GET /api/externo/solicitacoes?referencia_origem=…` (busca pelo id do próprio integrador). O motivo é uma falha de desenho, não conveniência: sem leitura, a integração dependia do outro lado hospedar um webhook — e a fila **desiste após 8 tentativas**, então um endpoint dele fora do ar por horas perdia o evento **para sempre**, sem reconciliação possível. Agora o contrato é autossuficiente (criar → consultar → cancelar) e o callback voltou a ser otimização de tempo real, não pré-requisito; a desistência da fila deixou de ser perda de informação e passou a ser perda de pontualidade (emenda no ADR-0161). Escopo idêntico ao do cancelamento — solicitação de outra chave, ou aberta na tela por um humano, responde 404 sem distinguir &ldquo;não existe&rdquo; de &ldquo;não é seu&rdquo;. A busca por `referencia_origem` devolve COLEÇÃO porque essa referência não é única no Janus (só o par chave+`chave_idempotencia` é): devolver &ldquo;o primeiro&rdquo; faria o integrador conciliar contra o pedido errado. **Round 5 (31/07, decisão do Yan): os CALLBACKS foram REMOVIDOS** — *"nós somos donos do formato, não devemos precisar mandar nada de volta, os outros sistemas que devem nos consultar"*. Com a consulta existindo, a máquina de push servia só para adiantar em minutos uma informação já disponível, ao custo de um modo de falha próprio e de obrigar o integrador a hospedar e proteger um receptor de webhook. Saíram: a fila `app.api_outbox`, as 3 RPCs dela, o cron de 5 minutos, as colunas `callback_url`/`callback_segredo` da chave, a rota `/api/externo/outbox/processar`, a entrega inline nas rotas de escrita, os dois campos nos modais e a seção de Callbacks das duas cópias da documentação. **Cinco funções pararam de enfileirar** — três do fluxo HUMANO (`solic_concluir`, `solic_rejeitar`, `solic_cancelar`), onde a única mudança foi deixar de chamar o enfileirador; os corpos vieram do `pg_get_functiondef` VIVO com remoção cirúrgica das linhas do outbox, conferida linha a linha (migration **0222**). O ADR-0161 ficou **superado por inteiro**, com o preço registrado: a pontualidade passa a ser responsabilidade da plataforma de origem. O `DROP` dos objetos agora inertes é patch destrutivo separado (TTY do Yan), com guarda que aborta se a 0222 não estiver aplicada. **Round 6 (31/07, decisão do Yan): a WHITELIST de tipos por chave foi removida** — *"cada chave de API deve ter acesso a todos os tipos expostos, não precisamos de tanta complexidade de restrições"*. É a mesma correção do Round 3 um nível acima: duas listas brancas em série (tipo exposto E tipo na lista da chave) davam impressão de controle fino e produziam um **403 difícil de diagnosticar** para um tipo que a nossa própria tela mostrava como exposto. Fica **um controle só, visível numa tela**: `exposto_via_api`. `TIPO_NAO_AUTORIZADO` **deixa de existir** no contrato. Consequência não óbvia: a whitelist era o ÚNICO campo editável de uma chave, então `api_chave_atualizar` foi **dropada** e o modal "Editar chave" saiu — uma chave passa a ter dois estados na vida, criada e revogada. A tela de criação ficou com **um único campo, "Referência"**, sem texto de ajuda (pedido do Yan). Migration **0224**, aditiva, com os corpos das 6 funções vindos do `pg_get_functiondef` VIVO e diff conferido; a coluna fica inerte até um patch destrutivo separado. **De carona, os comentários desatualizados DENTRO das funções foram consertados** (varredura em todas as funções de `app`/`public`: 3 linhas, uma delas errada em três frentes ao mesmo tempo — dizia que o autor era o robô, citava callbacks e usava a numeração provisória de ADR). Emenda no ADR-0158 (item 2 revogado). Migrations **0210–0217, 0219, 0221, 0222 e 0224** (as 0210–0214 nasceram na faixa provisória 0950–0954, em paralelo ao arco Fluxo de Caixa; renumeradas + `migration repair` no checklist de merge pós-v5.3.3) — todas aditivas, aplicadas com backup-gate; a **0220 é o patch destrutivo**, fora da pasta de migrations e nas mãos do Yan. Suíte de contrato ao vivo.
## [5.3.5] — 2026-07-31

PATCH · **Fluxo público de solicitação de acesso não criava a pendência** (Rota C — bug relatado em
produção). Sem migrations. Nenhuma rota de página ou API muda de comportamento.

- **Sintoma relatado:** quem pedia acesso pela tela de login recebia a confirmação "pedido enviado",
  mas nenhuma solicitação aparecia para aprovação em Usuários & Acessos.
- **Causa-raiz — `this` perdido, não banco:** o commit `8863a69` (13/07, 14h13) refatorou a action
  para reusar a referência da RPC no fallback e, ao fazer isso, trocou
  `await (supabase.rpc as unknown as AdminRpc)('solicitar_acesso_admin', ...)` por
  `const rpc = supabase.rpc as unknown as AdminRpc` + `await rpc(...)`. **Parênteses em torno de um
  acesso a membro preservam o `this`; atribuir o método a uma variável o DESTACA.**
  `SupabaseClient.rpc` é método de **protótipo** e faz `return this.rest.rpc(...)` — destacado, o
  `this` é `undefined` (porque `rpc` vive num corpo de `class`, que é **sempre** strict, e não por
  causa do módulo chamador) e a chamada estoura
  `TypeError: Cannot read properties of undefined (reading 'rest')`. O `catch` anti-enumeração
  (ADR-0110) engolia o erro e a tela seguia dizendo sucesso. O fallback legado usava a **mesma**
  referência quebrada, então os dois caminhos morriam juntos.
- **Evidências (5, independentes):** (1) log de runtime da Vercel com o `TypeError` exato em **100%**
  dos `POST /solicitar-acesso` — 18 tentativas só na janela de retenção; (2) a fonte do
  `@supabase/supabase-js` instalado (`rpc(fn, …) { return this.rest.rpc(…) }`), que explica o nome
  da propriedade no erro; (3) **todos** os outros call-sites de RPC do repo bindam o `this`
  (`.bind(sb)` em 6 arquivos, `.call(db, …)` em `rpc-dre`/`rpc-fluxo`/`rpc-metas`) — este era o
  único fora do padrão; (4) a base: 8 pedidos, todos `aprovada`, **zero pendentes**, `criado_em`
  mais recente **13/07 11h26** — nada criado após a regressão; (5) o diff datado do commit.
- **Correção:** `const rpc = (supabase.rpc as unknown as AdminRpc).bind(supabase)` — o mesmo padrão
  já usado em `src/app/admin/uploads/actions.ts`. Uma linha.
- **Segundo buraco silencioso fechado:** o erro do fallback legado era **descartado**
  (`await rpc('solicitar_acesso', …)` sem checar `error`). Se os dois caminhos falhassem, o pedido
  sumia sem **uma linha** de log. Agora cada caminho loga, e a falha dupla grita
  `PEDIDO PERDIDO`. A resposta ao usuário continua sempre de sucesso (anti-enumeração intocada).
- **Guard mecânico novo** (`src/app/solicitar-acesso/actions.test.ts`, 8 casos — primeiro teste de
  Server Action do repo): o dublê do cliente é uma **classe** cujo `rpc` é método de protótipo que
  toca `this.rest`, replicando a armadilha — um `vi.fn()` solto passaria com o bug e seria teatro.
  Cobre o caminho feliz, normalização do e-mail, notificação só em pedido novo, fallback legado,
  falha dupla, e-mail inválido e falha do SMTP. Verificado que **7 dos 8 reprovam** com o código
  antigo (o 8º é o de e-mail inválido, que nunca toca o banco).
- **Impacto:** 18 dias (13/07 14h13 → 31/07) de pedidos de acesso perdidos silenciosamente.
  Quem tentou nesse período **precisa pedir de novo** — não há como recuperar o que não foi gravado.

## [5.3.4] — 2026-07-30

PATCH · **E-mail intermitente nas notificações de Solicitações** (Rota C — bug relatado em
produção). Sem migrations. Nenhuma rota de página ou API muda de comportamento.

- **Sintoma relatado:** os envolvidos numa solicitação recebiam a notificação "às vezes sim, às
  vezes não" — e quem ficava sem variava a cada disparo.
- **Causa-raiz:** o fan-out de `enviarNotificacaoSolicitacao` (`src/lib/email/index.ts`) fazia
  `Promise.allSettled` sobre **todos** os destinatários com um transporter nodemailer **sem pool** —
  uma conexão SMTP por destinatário **ao mesmo tempo**. O SMTP AUTH do Office 365 aceita no máximo
  **3 conexões simultâneas por mailbox** (a 4ª recebe `432 4.3.2 STOREDRV.ClientSubmit; sender
  thread limit exceeded`) e 30 mensagens/min. Com 4+ envolvidos, o excedente era recusado; como é
  uma corrida de conexões, o conjunto de perdedores mudava a cada envio. **Evidência:** log de
  produção `[email] notificação de solicitação: 3/5 enviados (falhas best-effort)` — exatamente o
  teto de 3.
- **Correção:** fan-out compartilhado `enviarFanOut` com **concorrência limitada**
  (`MAX_CONEXOES_SMTP = 2`, deliberadamente abaixo de 3 para deixar folga na cota da mailbox aos
  envios de outras requisições — senha provisória e fatura) + **retry com backoff linear** para
  falha **transitória** (4xx do SMTP e erros de rede: `ETIMEDOUT`, `ESOCKETTIMEDOUT`,
  `ECONNECTION`, `ESOCKET`, `ECONNRESET`, `ECONNREFUSED`, `EHOSTUNREACH`, `ENOTFOUND`, `EDNS`).
  Erro **permanente** (5xx, caixa inexistente) e `EAUTH` **não** são retentados — insistir com
  credencial errada arrisca bloquear a conta. A semântica **best-effort** e a invariante
  **fallback-safe** (nunca lança) não mudam; muda só o ritmo.
- **Orçamento de tempo total de 15s no fan-out** (achado ALTO da revisão): o chamador é uma Server
  Action e o usuário espera a movimentação — sem teto, um SMTP pendurado levaria a action a ~99s
  com 5 destinatários e o usuário veria erro numa movimentação **já persistida**. O orçamento é
  gate de **entrada**: nunca abandona envio em voo (abandonar é a falha da v4.25.1 — a função
  serverless congela no meio), só deixa de **começar** trabalho novo depois do prazo.
- **Trade-off duplicata × perda documentado no ponto de uso:** o SMTP não tem chave de
  idempotência, então um erro de socket após o `250 OK` pode gerar uma cópia a mais. Para
  notificação interna best-effort, receber duas vezes é preferível a não receber. A decisão se
  **inverte** para e-mail irreversível de cliente (lá vale a idempotência do `registrar_email`).
- **`enviarNotificacaoAcessoSolicitado` corrigida junto:** os dois fan-outs duplicavam o mesmo
  bloco e tinham o mesmo defeito; agora compartilham o helper (a camada de transporte não se
  duplica — skill `email`).
- **Falha deixou de ser invisível:** o `catch {}` de `notificarMovimentacao`
  (`src/app/solicitacoes/actions.ts`) era **mudo** — engolia inclusive falha da RPC de
  destinatários. Passa a logar as três situações distinguíveis (RPC sem contexto, zero envolvidos,
  envio parcial), e o log de falha por destinatário traz o código SMTP na frente. Foi o silêncio
  que atrasou o diagnóstico.
- **Guard mecânico novo** (`src/lib/email/email.test.ts`, 16 casos): mede o **pico de envios
  simultâneos em voo** (falha se passar de `MAX_CONEXOES_SMTP`), fixa a classificação
  transitório × permanente (432 retenta; 550 e `EAUTH` não), o teto de tentativas e a preservação
  do best-effort. Verificado que o guard **reprova** com o fan-out paralelo antigo
  (`expected 6 to be less than or equal to 2`).
- **Precedente no repo:** o envio em lote de faturas já era serializado com intervalo entre
  disparos (`revisar-envio-modal.tsx`) — o fan-out das notificações era a exceção, não a regra.

## [5.3.3] — 2026-07-28

PATCH · **Fontes Avenir nas telas não-autenticadas** (Rota C — correção do achado ALTO registrado
no out-briefing da v5.3.2 §4). Sem migrations. Nenhuma rota de página ou API muda de comportamento.

- **Causa-raiz:** o `matcher` do `src/proxy.ts` (camada 1 do enforcement, ADR-0109) não isentava
  `/fonts/`. Um `/fonts/avenir/*.otf` pedido por tela SEM sessão recebia `307` com o HTML do login;
  o browser abortava o decode (`OTS parsing error`) e a tipografia caía para fonte de sistema.
  Telas COM sessão nunca foram afetadas — o proxy só redireciona quando não há usuário.
- **Correção:** `fonts/` entrou no negative lookahead do matcher **por prefixo de diretório** (a
  mesma forma do `logos/` que já existia) e deliberadamente **não** por extensão `.otf` — isenção
  por extensão foi o que furou a camada 1 na auto-auditoria S11 (rota dinâmica `/api/.../[id]` com
  id terminado em `.png` escapava do proxy).
- **Escopo real das telas afetadas — corrige o registro da v5.3.2:** são `/login`,
  `/solicitar-acesso` e `/auth/confirm`. **Não** `/trocar-senha`, que exige sessão
  (`src/app/trocar-senha/page.tsx:19-20`) e portanto nunca esteve no escopo do bug.
- **Guard mecânico novo** (`src/proxy.test.ts`, 32 casos): fixa as duas bordas do matcher — as
  fontes reais de `public/fonts/avenir` isentas (nome cru e percent-encoded, lidas do disco) e as
  superfícies reais sempre passando pelo proxy, incluindo as armadilhas `/api/uploads/abc.png`
  (lição S11), `/api/algo/fonts/x.otf`, `/fonts` sem barra final e `/FONTS/`. Verificado que o
  teste REPROVA com o matcher antigo.
- **Medições do fechamento:** as 5 `.otf` passaram de `307` para `200 font/otf`, byte a byte
  idênticas aos arquivos de `public/` (magic OpenType `OTTO`); nas três telas
  `document.fonts.check('1em "Avenir LT Std"') = true`, largura de referência 726,86px em Avenir
  contra 796,44px do fallback Arial, e **0** `OTS parsing error` no console; páginas protegidas
  seguem `307 → /login` com `next=` preservado, APIs seguem `401 AUTH_NECESSARIA`, e travessia
  (`..`, `%2e%2e`) sob o prefixo isento continua barrada.

---

## [5.3.2] — 2026-07-28

PATCH · **Reformulação do harness** (ADR-0157). Sem migrations; nada muda nas telas — muda como o
projeto se constrói. Primeiro briefing no formato novo (`.md` único commitado; par docx+prompt extinto).

- **F1 — Permissões (terceira camada):** handoff formal do bloco `allow`/`deny` para o
  `~/.claude/settings.json` do usuário (aplicado pelo Yan) — allow estreito para a suíte de gates,
  git/gh e as 2 invocações de `db:migrate -- --aditiva`; `deny` para `npx supabase db push` cru
  (protege o backup-gate). Sintaxe validada contra a doc oficial (`cmd *` = prefixo com fronteira
  de palavra; deny vence allow em qualquer escopo; allow explícito dispensa o classificador do
  modo auto — o mecanismo que faltou no incidente da v5.3.1). Protocolo D5 (harness barrou passo
  autorizado: não contornar → completar → deixar pronto → sinalizar → declarar não-verificado)
  agora é doutrina no core. `.gitignore`: `.claude/settings.local.json`, correção do token colado
  `.agentsskills/` (linha 51) e ruído untracked (`agent/`, `brag-output/`, symlinks de skills de
  vídeo, `.playwright-mcp/`).
- **F2 — CLAUDE.md core + skills:** o CLAUDE.md foi reescrito de **518 → 162 linhas** (8 seções;
  teto 180), e o conhecimento situacional migrou para **9 skills internas** em `.claude/skills/`
  (banco-e-rpc, contrato-rpc-front, ui-design-system, tabela-densa, graficos, react-padroes,
  email, ingestao-planilhas e orquestracao — a Carta do Orquestrador). Migração provada por
  **inventário sem órfãos** (`docs/harness/inventario-claude-md.md`): 100% das 518 linhas com
  destino explícito; 1 única deleção deliberada (o `/compact` estratégico → substituído por
  `/clear` + re-ancoragem em disco, D-05); precedentes "custou caro" preservados. Startup medido:
  porção do projeto **59,7k → 32,5k tokens** (−45,6%).
- **F3 — Rituais invocáveis:** `/nova-versao` (worktree + ambiente + cópias 0950–0954 marcadas +
  briefing no 1º commit + carta + plan mode; `disable-model-invocation`), `/fechamento-versao`
  (o DoD integral como procedimento, incluindo o item D-12 "convenção de banco mudou → skill E
  revisor-db") e `/pos-merge` (pull ff-only, remoção segura, reconciliação da data do changelog).
  Testados ponta a ponta em ambiente descartável.
- **F4 — Agentes:** os 4 agentes ganham o campo **"Skills a ler"** na delegação (o agente lê no
  próprio contexto; nunca conteúdo colado); `implementador` perdeu o canon duplicado ("Contexto
  técnico") e ganhou rastreabilidade no retorno; `revisor` agora revisa CONTRA as skills do escopo
  e roda o checklist `web-design-guidelines` quando toca UI; `revisor-db` mantém checklist inline
  (D-12, deliberado). **Novo agente `verificador-visual`** (Sonnet; Read + MCP Playwright;
  read-only; não sobe servidor): conferência visual pós-gates — no teste de estreia contra o
  `/login` em dev já devolveu um **achado ALTO real** (fontes Avenir intercetadas pelo proxy de
  auth com 307 → fallback silencioso de tipografia em telas não-autenticadas; registrado como
  pendência, fora do escopo).
- **F5 — Skills externas + MCP:** `web-artifacts-builder` (anthropics/skills@b29e7cf) e
  `web-design-guidelines` (vercel-labs/web-interface-guidelines@4e799d4, com regra de precedência:
  o DS do Janus vence em tokens/cores/primitivos) vendoradas; `skill-creator` e `frontend-design`
  já ativas como plugins oficiais. **MCP Playwright** em `.mcp.json` (escopo de projeto):
  `@playwright/mcp` chromium headless validado no WSL2 (handshake JSON-RPC, 24 tools, navegação e
  screenshot reais contra `next dev`).
- **F6 — Verificação:** sonda de disparo das skills (`docs/harness/sonda-disparo.md`) e baseline
  de tokens registrados no out-briefing.

---

## [5.3.1] — 2026-07-28

PATCH · **DRE: Resumo Executivo + a Decomposição dos Lançamentos passa a seguir a estrutura oficial.** Fecha a adaptação do modelo da controladoria. Migration **aditiva 0209** (`get_decomposicao_bloco`); sem ADR novo — o raciocínio da troca de fonte foi registrado como **emenda ao ADR-0156**.

- **M1 — Resumo Executivo:** 6 linhas-chave (Saldo Repasse, Receita Bruta, Receita Op. Líquida, Lucro Bruto, Lucro Operacional, Resultado do Exercício) × 6 colunas — `ano-2 | ano-1 | Δ | YTD ano-1 | YTD corrente | Δ YTD` —, dentro do **mesmo card** da DRE, abaixo da tabela, com cabeçalho em banda, formato contábil e cor por sinal nos Δ. **Δ em REAIS** (o Δ% já é da visão Consolidado). Casado pelas **CHAVES** dos totalizadores, nunca por nome ou posição — inclusive `RB_H` (Receita Bruta), que é `tipo:'blocoH'` e NÃO `'tot'`: filtrar por `t==='tot'` a deixaria de fora. **Custo zero de rede:** a página já buscava `[corrente-2, corrente-1, corrente]` incondicionalmente, e o Resumo reusa o MESMO `consolidadoAnos` que alimenta o Consolidado — sem segundo caminho de cálculo.
- **M1 — ancoragem no ANO CORRENTE (decisão do Yan):** o Resumo **não acompanha a pill de ano** da tabela; com `?ano=2025` ele segue em `2024 | 2025 | YTD 25 | YTD 26`. É o retrato de agora, independente da navegação — registrado em comentário e anunciado na própria tela ("retrato do ano corrente — não acompanha o ano selecionado acima") para não ser lido como bug. O YTD vem **pronto** de `porLinha[].ytd` (janela `mesJanela`, ancorada em `hojeSP()`): o componente não contém `Date` nenhum, porque recalcular a janela foi exatamente o bug da v5.3.0.
- **M2 — fonte nova (0209), com o "reusa o que existe" MEDIDO e descartado:** a preferência era zero migration reusando `get_decomposicao_categoria`. Medição em produção mostrou que ela **não filtra `tipo`** (soma previsto junto — **699 linhas / R$ 4.327.007,77** em valor absoluto na janela YTD/2026, com competência retroativa de título vencido em aberto) e **ignora `excluida`** (as 2 transferências internas somam net −R$ 30.000,00, não se anulam). Isso quebraria os dois invariantes da versão. Também descartado derivar de `get_dre_mensal`: baldes mensais atendem 5 das 6 pills, mas tornariam "Personalizado ao dia" impossível. `get_decomposicao_bloco(p_from, p_to)` aplica o MESMO filtro (`tipo='realizado'`) e o MESMO de-para (`WHERE NOT excluida`) de `get_dre_mensal`, devolvendo o net **SIGNADO** por bloco e por categoria (com `bloco_chave NULL` = não classificada).
- **M2 — reconciliação PROVADA, não afirmada:** delta **0,00 nos 18 blocos analíticos** em jan..jul/2026, conferido bloco a bloco contra as colunas da tabela. A igualdade virou **caso vivo em `rpc-contrato.test.ts`** (3 casos: shape, reconciliação contra o mês fechado anterior, e conservação Σ categorias == Σ blocos + excluídas fora) — se alguém alterar uma das duas funções e a igualdade cair, estoura no teste e não na tela.
- **M3 — barras horizontais por bloco:** o card existente foi adaptado (não recriado) — donuts saíram, entraram barras proporcionais ao maior do lado (rótulo à esquerda, valor à direita), mantendo os dois lados Entradas | Saídas, o top-N e a **drill "Outros (N blocos)" com voltar**. Rótulos no formato completo do `dre_bloco`, **sem o prefixo contábil** (helper `rotuloBloco`, com teste — inclui o caso do hífen no MEIO, `Movimentação de Caixa - C`, que não pode ser mutilado). Bandeja **"Não classificadas"** sempre visível e fora do "Outros" (nada some em silêncio). **Estorno** — categoria com sinal oposto ao do bloco, 9 casos reais em RH/RHB/ESTR — aparece entre parênteses via a noção de *contribuição* (`saida ⇒ −valor`), de modo que Σ das categorias é exatamente a magnitude do bloco.
- **M3 — lugar:** pills de período padrão **dentro do card** (default "Este ano (YTD)", independentes do `?ano=` da tabela), título "Decomposição dos Lançamentos" sem subtítulo, e o card mudou para a TopSection **"Regime de Caixa"**. A TopSection própria da Composição foi **aposentada** sem órfãos (título/subtítulo, `defaultAberto={false}`, wrapper de card duplo, parágrafo explicativo e as duas interfaces locais duplicadas saíram junto). O aviso de "regime contábil" já não existia desde a 0188 — só o comentário histórico, atualizado.
- **Estados de falha distintos (não pedido, mas é a classe de defeito que o projeto pune):** RPC do período falhou ≠ período sem lançamento. Dizer "sem lançamentos" numa falha seria dado errado parecendo certo; as pills continuam visíveis nos dois casos, senão o usuário fica preso no período que quebrou.
- **Parecer da revisão** (`revisor` + `revisor-db`, antes dos gates) — 2 ALTO endereçados: (1) o Resumo desaparecia no fail-safe `dados === null` da tabela, embora tenha fonte própria — e como o ano navegado é sempre um dos 3 anos-âncora, bastava a chamada dele falhar; agora ele é renderizado nos dois ramos; (2) faltava o caso de contrato da RPC nova (convenção do projeto — é o único gate que pega drift de schema em runtime). MÉDIOs: `NOTIFY pgrst, 'reload schema'` acrescentado (padrão de toda migration irmã) e a afirmação **falsa** no header da 0209 de que as RPCs antigas "seguem servindo a área executiva" corrigida — elas ficam **órfãs** por efeito desta versão (nenhuma foi removida; DROP futuro exige a verificação de consumidores reais de sempre).
- Tipos `RegistroAnoLinha`/`ConsolidadoAno` **movidos** de `tabela-dre.tsx` para `@/lib/dre/schemas` — a partir desta versão há dois consumidores do mesmo payload, e tipo duplicado estruturalmente entre componentes é como nasce o drift. `loading.tsx` da rota atualizado para a silhueta nova (tabela → Resumo → Decomposição, seção única).

---

## [5.3.0] — 2026-07-27

MINOR · **DRE por Fluxo de Caixa (Onda 2): a estrutura da controladoria vira produto — tabela mensal híbrida + estrutura VIVA editável + diário/undo generalizado.** Migrations **aditivas 0204–0208** (ADR-0156), aplicadas sob backup-gate verde; RPCs verificadas EXECUTANDO via REST/service_role.

- **M0 — Gate de mockup (3 rodadas de design com o Yan):** a tabela e o editor nasceram como mockups interativos sobre dados reais (fixture do objeto `D` da controladoria) e iteraram até o desenho final: bandas cinza (`--band`/`--band-soft`, tokens novos), linhas de resultado em banda ESCURA (`--action-primary`) com valores nos tons `-soft`, cor por SINAL nos valores, previsto em escala ÂMBAR (par âmbar por nível via `color-mix`), previsto RECOLHÍVEL horizontalmente, chevron à direita, box-em-card. Token novo `--warning-deep` (#8A6413 — o `--warning` reprova AA como tinta; regra no DS §Feedback). O oráculo da fixture pegou `REX = RAIR + DIST_LUCROS` (a linha não tinha chave no struct original — sem ela o REX erraria R$ 376 mil/ano).
- **M1 — Estrutura viva (0204/0205):** `financeiro.dre_bloco` (29 blocos; fórmulas por CHAVE em jsonb — grafo, nunca posição) + `financeiro.dre_categoria_map` (de-para CURADO por `categoria_id`; 20/130 categorias são re-parenteadas vs o grupo Monde). Seed do struct provado com reconciliação **fail-closed** (29/133/2 — passou em produção). Estado `excluida` explícito (Movimentação de Caixa C/D, netam a zero); bandeja "Não classificadas" = dim sem map (categoria nova do Monde aparece sozinha — nada some em silêncio). Trava otimista (`atualizado_em` + BEFORE UPDATE) e RLS deny-by-default.
- **M2 — Diário/undo GENERALIZADO (0206):** `financeiro.reverter_diario` mantém a assinatura e vira genérico (restauração dinâmica via `jsonb_populate_record`; allowlist estrutural = só tabela com o trigger do diário; semântica da 0200 preservada byte-a-byte) — Gerencial INTACTO (wrappers não mudaram; smoke REST verde). Histórico/undo da estrutura (`dre_estrutura_historico_*`/`dre_estrutura_desfazer_*`); desfazer em massa PRÓPRIO é permitido na estrutura (todo salvar é um lote — divergência deliberada do Gerencial, ADR-0156). Painel de histórico prop-izado (fetchers/camposDiff/título) com defaults = Gerencial.
- **M3 — `get_dre_mensal(p_ano)` (0207):** uma chamada → um JSON (~160 linhas × 12 meses) montado da estrutura viva em transação única. Mês corrente híbrido automático (realizado ≤ hoje + `prev_corrente` do resto); vencidos (previsto ≤ hoje) fora das colunas, viajando em `venc` por linha (decisão do Total adiada ao refino). Fórmulas avaliadas em ordem do grafo. Contrato vivo em `rpc-contrato.test.ts` (7 casos, incl. `REPASSE = ENT_H + PAG_H` checado ao centavo na resposta real e mutação inofensiva da trava).
- **M4 — Tabela real:** `/financeiro/dre` lê a RPC por ano (`?ano=`, pills com `useTransition`), colunas híbridas dinâmicas pelo `mes_corrente` real, fail-safe (RPC falhou → aviso, página viva), bandeja real. Composição dos Lançamentos mantida em TopSection colapsado (prop nova `defaultAberto`).
- **M5 — Editor real (0208):** `/financeiro/dre/estrutura` — salvar em lote (padrão Metas: baseline/pendentes → 1 RPC → refresh re-hidrata), trava otimista global (token + `pg_advisory_xact_lock` compartilhado com o desfazer), no-op não polui o diário, `beforeunload`, painel de histórico da estrutura na página.
- **Refinos de checkpoint (rodadas 4–5, conferidos ao vivo no browser):** formato contábil com **R$ discreto** no padrão do DS (ADR-0124) e centavos, mantendo os gastos entre parênteses; densidade menor; toolbar enxuta (busca e "esconder zerados" saíram, com todo o código morto junto; "Editar estrutura" foi para o rodapé; título "Demonstrativo de Resultado por Fluxo de Caixa" no card); setas de expansão à direita do rótulo; **colunas dos anos seguintes** (2027/2028) atrás de um toggle em "Total do ano" — sem migration, a própria RPC devolve ano futuro e a página busca em paralelo (216–481ms de wall-clock para as 3 chamadas, medido); **modo do Total do ano** ("Realizado" × "Realizado + previsto").
- **Plataforma — barras de rolagem de dois eixos (DS):** com `eixo="both"` os thumbs se encontravam no canto inferior direito. `scrollbar-math` ganhou folga **assimétrica** (`folgaFim`, default = `folga` → eixo único inalterado) e o `<ScrollAutoHide>` encurta cada trilho pela espessura do outro (`THUMB_CRUZ`); o arraste usa a mesma folga. 3 testes novos; documentado no DS. **Toda tabela de dois eixos herda.**
- **Auditoria de paridade** (motor × dashboard da controladoria, meses fechados): 2026 jan–jun fecha ao centavo descontadas 6 re-edições retroativas REAIS do Monde (jan: Δ −40.892,07 = exatamente o Endomarketing re-lançado; jun: Δ 2,72 = a soma dos 5 microajustes); 2025 tem drift por re-lançamentos retroativos (6 categorias nomeadas). Motor exato; consistência interna viva (todo bloco = Σ das categorias) verificada no payload de produção.

- **Refinos de checkpoint (rodadas 6–10, conferidos ao vivo no browser):**
  - **Visão CONSOLIDADO (ano-a-ano) ao lado da Mensal, SEM migration** — pills de ano viram **seleção múltipla** (cumulativa, mínimo de um): cada ano marcado acrescenta `[ano cheio | YTD | Δ% para o próximo marcado]`, e o MAIOR marcado é a referência, que ganha `PREV`/`VENCIDOS`/`TOTAL`/anos-seguintes **só quando é de fato o ano corrente** (num ano fechado `total − ytd` é realizado de ago..dez, não projeção). A página busca todos os anos da janela navegável na mesma leva (~240ms aquecido). Invariantes provados via REST: **TOTAL = YTD + PREV ao centavo** e **YTD ≡ o total do modo "Realizado"**. Δ% usa denominador em MÓDULO (prejuízo→lucro lê como +118,2%, não −118,2%) — convenção a confirmar no checkpoint.
  - **🐛 BUG DE CÁLCULO (pego pelo Yan):** a janela do YTD vinha do **ano exibido** (`mes_corrente ?? 12`) — com `?ano=<ano fechado>` ela virava 12 e o YTD de TODO ano passava a ser o ano inteiro: "YTD 25" ficava **idêntico** a "2025" e "YTD 26" somava dezembro de um ano não terminado. Números plausíveis, silenciosamente errados; **nenhum gate pega** (não é erro de tipo, lint nem contrato — é definição errada). A âncora passou a ser `hojeSP()`: "year to date" é jan..mês-corrente do **calendário** e não muda porque se está olhando outro ano.
  - **Colunas de TOTAL fixas à direita** (e 2027/2028, quando abertas), espelhando a coluna Conta à esquerda: larguras viraram constantes e o `right` de cada uma é cumulativo a partir delas. Duas armadilhas do sticky tratadas — em `border-separate` o fundo tem de estar na CÉLULA e translúcido deixa o conteúdo rolante aparecer por baixo (os dois fundos com alfa viraram `color-mix` sem canal alfa); e `relative` + `sticky` escrevem a mesma propriedade, com o vencedor decidido pela ordem no CSS gerado, não pela ordem das classes. Escala de z documentada: corpo normal < corpo fixo (10) < thead (20) < th fixa (30). **Efeito colateral corrigido:** com os anos seguintes pinados, o "salto" ao abri-los perdeu sentido e o `scrollIntoView` sobre elemento pinado parava num ponto arbitrário do meio da tabela — o salto deles foi removido (o do previsto, cujas colunas ainda rolam, permanece).
  - **Rótulos de grupo ("Realizado"/"Previsto") fixos DENTRO do próprio grupo:** o `sticky` vai no CONTEÚDO, nunca na `th` — a `th` **é** o grupo, e por ser o bloco que contém o rótulo ela também o delimita de graça (o rótulo nunca invade o vizinho e some junto com o seu). O `right` é a largura das colunas fixas mais uma folga, para estacionar à esquerda delas em vez de deslizar por baixo.
  - **VENCIDOS ganha natureza própria:** sai do grupo "Previsto" e passa a ocupar uma faixa entre Realizado e Previsto, com divisória dos dois lados e **escala vermelha** própria (mesmo mecanismo do âmbar, trocando `--warning` por `--danger`; rótulo em `--negative`, que dá 4,3:1 sobre a banda onde o `--danger` daria 3,6:1). Vencido não é projeção nem realizado — é prazo estourado.
  - **Modo "Realizado" agora esconde TODO o previsto** (meses futuros e anos seguintes, com os toggles), não só a coluna do mês corrente; o total vira **"Total previsto"** no modo com projeção; previsto **recolhido** mostra só o previsto do mês corrente; rótulos do mês híbrido por extenso (`JUL·REAL`/`JUL·PREV`).
  - **Toolbar e navegação:** duas linhas à esquerda (visão em cima; anos + modo embaixo) sem os rótulos textuais, com `title` em cada pill; "Expandir tudo"/"Recolher tudo" na linha das pills; barra recolhível vira **"Regime de Caixa"**; sidebar diz **"Demonstrativo de Resultado"**, entre Acervo de Documentos e Fluxo de Caixa.
  - **Editor da estrutura com identidade própria:** sai o `TopSection`, entram H1 "Estrutura do Demonstrativo de Resultado" + subtítulo + badge **"Administração"** (padrão do `admin/layout.tsx`, que a rota não herda por não estar sob `/admin`); "Voltar" em âmbar de gestão; card titulado "Editor de Estrutura"; painel vira "Histórico de alterações". O **corpo do editor perdeu valores, badges e a chave técnica do bloco** — ele é de reordenar/reclassificar; os números ficam nos modais de mover/excluir, onde são o efeito que justifica a ação.
  - **Rótulo de área agora vem do CÓDIGO, não do banco** (`/admin/acessos`): as duas fontes são espelhos, mas o teste de paridade compara só as CHAVES — renomear uma área no código deixava o editor de roles preso ao nome antigo, e alinhar exigia um `UPDATE` (destrutivo pelo classificador, só com humano em TTY). O banco segue sendo a fonte da AUTORIZAÇÃO; o rótulo é cosmético. **Fecha a pendência de TTY** que a versão carregava.
  - **Plataforma — `behavior:'smooth'` é NO-OP SILENCIOSO** quando o navegador desliga o scroll suave (flag do Chrome, automação, alguns modos de acessibilidade): não rola e **não cai para instantâneo**, sem erro. Todo scroll programático suave passa a conferir a posição e refazer em `'auto'` se nada se moveu (~150ms). Registrado no DS §Barras de rolagem — mesma classe do `-[--token]`: degradação sem erro de build/tsc/lint.
  - **Plataforma — sidebar:** o rótulo do sub-item quebrava em duas linhas **só no estado ativo** (que troca o peso para `font-semibold` e alarga o texto); faltava o `truncate` que o item de 1º nível já tinha.
  - **Gerencial — máscara de moeda** no campo Valor da nova linha da Base de Dados (era o último campo de dinheiro em `type="number"` cru; reusa o `mascaraMoeda` que a edição inline daquela coluna já usava). De quebra, campo vazio deixou de virar `0` e a guarda passou a barrar o salvamento de um lançamento zerado.

**Nota operacional:** provisórias 0950–0954 (v5.4.0) seguem no topo do remoto — as cópias untracked ficam na pasta durante todo o checkpoint e saem antes do merge. Verificação de rename registrada: `dim_categoria` upserta por NOME → rename no Monde = id novo = cai na bandeja (seguro por construção; ADR-0156).

---

## [5.2.1] — 2026-07-23

PATCH · **Colaboração segura na Base de Dados do Fluxo de Caixa Gerencial + acabamentos.** Motivado por incidente real (um usuário apagou toda a Base de Dados sem reversão possível) e pelo risco de edições simultâneas se atropelarem sem ninguém ver. Tudo é **camada em volta** — quem só edita a Base continua trabalhando exatamente como antes. Migrations **aditivas** 0199–0202 (ADR-0155):

- **M1 — Acabamentos:** o rótulo **"sem data"** dos saldos foi extinto (data nula → placeholder neutro "—" clicável, sem alerta); o staleness discreto só aparece quando há `data_saldo`. **Máscara de moeda pt-BR em tempo real** nas duas superfícies de saldo (cards do Gerencial e modal "Editar saldos" do Projetado) — helper único `InputMoeda`/`fmt.mascaraMoeda` ("dígitos como centavos": digitar `122829,13` → `R$ 122.829,13`), `inputMode` numérico p/ mobile, colar funciona. De quebra, **dedupe** de `hojeSP`/`diasDesde`/`rotuloStaleness` para a fonte única `@/lib/fmt` (resolve o follow-up da v5.2.0).
- **M2 — Diário de alterações (0199):** tabela genérica `financeiro.diario_alteracoes` **append-only e imutável** + função de trigger **genérica** anexada a `analytics.gerencial_lancamentos`. Registra antes/depois (jsonb), autor (`auth.uid()` + nome denormalizado) e lote (`txid`). RLS nega escrita direta — só o trigger escreve; leitura só via RPC.
- **M3 — Histórico + desfazer (0200):** painel colapsável "Histórico de alterações" na Base de Dados — ações **agrupadas por lote** (quem/quando/N linhas/operação), expandir → antes/depois; **Desfazer por lote e por linha**. RPCs de reversão aplicam o inverso em transação **com verificação de conflito** (linha mudou depois → avisa, **não força**); o undo é **auditado** (gera nova entrada com `origem_undo`). Permissões: ação própria unitária = área `financeiro/gerencial`; de terceiros ou **restauração em massa** = só admin. Confirmação forte para exclusão em massa **e** restauração em massa.
- **M4 — Tempo real (0201):** mudança de **outro** usuário aparece para os demais em segundos (aviso discreto "Fulano alterou N linhas" + recarregamento); a própria mudança não gera aviso. Via **Supabase Realtime por _broadcast_** (trigger `SECURITY DEFINER` + policy em `realtime.messages` reusando o RBAC) — **não** `postgres_changes`, que reabriria acesso direto à tabela fechado na 0120/ADR-0108. **Fail-safe:** Realtime indisponível não quebra a página. (A autorização de canal privado no projeto hospedado é toggle de dashboard — verificação de checkpoint.)
- **M5 — Trava otimista (0202):** o salvar passa a conferir a versão carregada (token = `atualizado_em`, coluna já existente e mantida por trigger); se a linha mudou por baixo, erro amigável + recarrega, **jamais sobrescrita silenciosa**. Vale para edição unitária e em lote (a exclusão em massa envia o mapa de versões).

**Nota operacional (herdada da v5.2.0):** as provisórias 0950–0954 da v5.4.0 ocupam o topo do histórico remoto — as aditivas da v5.2.1 aplicam-se com `npm run db:migrate -- --aditiva --fora-de-ordem` + a dança das cópias untracked, removidas antes do merge. Migrations **não** aplicadas nesta sessão (aplicação e verificação via REST no checkpoint). ADR-0155; sem quebra de auth. **Ajuste no backup-gate:** o classificador passou a reconhecer `CREATE TRIGGER` como **aditivo** — a lista de eventos (`AFTER … UPDATE …`) era falso-positivo do detector de `UPDATE`/`DELETE` top-level, que marcava 0199/0201 como destrutivas; `DROP TRIGGER` segue destrutivo (sonda em `scripts/db-gate/classificar.test.mjs`). **Fix pós-aplicação (0203):** o histórico quebrava com `function max(uuid) does not exist` (Postgres não agrega `uuid`) → `max(usuario_id::text)::uuid`; escapou porque a introspecção via `db query` para no `exigir_acesso` antes do corpo (lição no CLAUDE.md §Verificação pós-push). **Ajustes de checkpoint (client-only):** refresh NÃO-destrutivo (preserva a seleção + congela o token da trava em linhas em edição); `ListDrawer` via `createPortal` (corrige o drawer "Gerenciar contas" vazando dentro do TopSection); máscara de moeda pt-BR + remoção das setas de spinner na coluna Valor (edição e filtro); data removida dos cards de saldo; indicador de "salvo" da coluna Valor sem saltar; respiro das barras de rolagem (Base de Dados/Histórico); ícone de importação concluída minimalista.

## [5.2.0] — 2026-07-17

MINOR · **Fluxo de Caixa · Onda 1 — o realizado passa a ser medido pela DATA DE MOVIMENTAÇÃO (não mais liquidação) e a página é reformada (Projetado/Realizado).** Absorve a Onda 1 do modelo "DRE por Fluxo de Caixa" da controladoria (regime de caixa, 2 exports diários do Monde). **Os números da Visão Geral mudam por DEFINIÇÃO, não por bug** — há reconciliação explicável contra o dashboard da controladoria (o repasse mensal bate ao centavo nos meses fechados; o delta residual é só a diferença de data-base, já que o modelo é diário). **Cirurgia por etapas, convivência antes de morte** (ADR-0154):

- **Bases novas (M1, migrations 0185/0186):** `raw.lancamentos_movimentacao` (realizado, com `data_movimentacao`) e `raw.titulos_em_aberto` (previsto), por upload full-swap (parsers `normalizeHeader`+interseção). Os 2 cards de Upload novos substituem "Lançamentos por Categoria" e "CAP/CAR".
- **Fato + roteamento (M2, 0187):** `financeiro.fato_fluxo` (NOVO) + `regenerar_fluxo_caixa()` — realizado = movimentação ≤ hoje; movimentações futuras → previsto; em aberto → previsto por vencimento; **corte 31/12/2028** (além dele, bloco meta); entidades internas incluídas. `fato_lancamentos`/`regenerar_financeiro_lancamentos` v1 ficam intactos (convivência).
- **Repoint dos consumidores (M3, 0188):** as 8+ RPCs/views da Visão Geral e do Calendário passam a ler `fato_fluxo` preservando o formato. **Abordagem B (cartões) preservada naturalmente** — no eixo movimentação o cartão já vem datado na data da fatura, sem a substituição-fatura antiga.
- **Reforma da página (M4, 0190/0191):** `/financeiro/fluxo-caixa` reorganizada em **Fluxo Projetado** (Saldo de caixa com drill por conta + A Receber/A Pagar/NCG 10 dias; Calendário de Liquidez | **Runway semanal de 13 semanas** [novo]; **Horizonte previsto lançado** [novo, com corte 2028]) e **Fluxo Realizado** (Entradas/Saídas/Resultado; Fluxo Mensal + Acumulado; **Saldo de repasse BRUTO + margem mensal** [novo]; **Pioraram/Melhoraram o caixa** [novo, variação por categoria]). Seção "Fluxo de Caixa Gerencial" **removida da página** (dedupe — a rota própria `/financeiro/fluxo-caixa/gerencial` permanece).
- **Saldo por data (M5, 0189):** `gerencial_saldos` ganha `data_saldo` (a data a que o saldo se refere), com edição na tela e indicador de "quão velho" está o saldo (staleness).
- **Repasse = BRUTO** (decisão de produto) — a leitura líquida do reembolso fica registrada no ADR-0154 como discussão futura.
- **`0192` DESTRUTIVA (preparada, aplicada por humano em TTY):** DROP das bases/RPCs antigas do Fluxo de Caixa após a validação. Seed e código de upload antigos migrados às bases novas.
- **Refinos do checkpoint (rounds pré-merge, migrations 0194–0198):** Projetado com **card ÚNICO de posição** — Saldo de Caixa (editável, saldo + data por conta) | A receber · A pagar · NCG com **horizonte ajustável** (Dias/Meses/Sempre por slider); **Runway de Caixa** ("Tempo de vida" em meses = recebíveis em aberto ÷ saída média, com IC 95% e cenário com/sem antecipação); Projeção Semanal só com a linha do saldo + tabela das próximas semanas. Realizado com **card principal** (pills + KPIs + saldo de repasse, todos por período), **Tendência da Margem de Repasse** em card próprio e **Maiores variações** (ex-ranking) em card único ordenável. Nova aba **DRE** (`/financeiro/dre`, área RBAC própria) com a Composição dos Lançamentos. Correção plataforma-wide do arredondamento de barras que descem.
- Comparativos multi-ano (margem do ano anterior, ranking, histórico) populam com o upload de produção (histórico 2024+, já carregado). ADR-0154; migrations 0185–0198; sem quebra de auth.

## [5.1.11] — 2026-07-15

PATCH · **Sinal de saúde da sincronização no rótulo "Última atualização".** O rótulo passa a ficar **vermelho** (com ícone de alerta no lugar do relógio) quando a última sincronização com o Monde não avança há mais de **45 min** (3 ticks do cron de 15 min) — sinaliza que a integração pode ter parado de transmitir, **sem depender de alguém reparar no horário**. O atraso é avaliado no cliente contra o horário atual e re-checado a cada 30 s, então o rótulo cruza para vermelho sozinho ao passar do limite e volta ao neutro quando a sincronização é retomada (via o auto-refresh de 5 min). Aplica-se aos 3 lugares onde o rótulo aparece: Acompanhamento (`/metas`), Comparação (`/metas/comparacao`) e Modo de Exibição/TV (`/metas/tv`). Novo componente compartilhado `UltimaAtualizacao` + helper puro testável `sincronizacaoAtrasada` (`src/lib/metas/sync-atraso.ts`). **Cobre a falha DURA** (API fora do ar / cron parado / RPC de carga falhando → a rota devolve 500 e não grava o marcador → `ultima_sincronizacao` congela e cruza o limite). **Não cobre a falha SILENCIOSA** (API responde 200 mas sem vendas → o marcador continua avançando; indistinguível de janela quieta pelo rótulo). **Sem migration, sem ADR.**

## [5.1.10] — 2026-07-15

PATCH · **Sombra dos cards nas seções recolhíveis.** A janela de revelação do `TopSection` (a "linha-cortina" da v5.1.9) usa `overflow-hidden` — necessário para o clip vertical da animação —, mas isso cortava também a **sombra dos cards encostados nas bordas laterais** da seção (mais visível no hover dos cards clicáveis, cuja sombra sangra ~10px). Correção: o clip é estendido 16px para cada lado (`-mx-4`, entrando na `px-8` do `<main>` sem gerar barra de rolagem horizontal) e o conteúdo é re-padronizado de volta (`px-4`), de modo que **o conteúdo continua alinhado à barra** mas a região de clip passa a acomodar a sombra com folga (~6px sobre os ~10px de sangramento); a linha-cortina foi reancorada (`inset-x-7`) para manter a mesma posição visual. Como o `TopSection` é o componente único de barra recolhível, a correção vale para **toda a plataforma** (Performance, Weddings, Fluxo de Caixa, Gerencial, Metas). Idioma registrado no Design System (`docs/design-system.md` §Seções recolhíveis). Corrige a regressão introduzida na v5.1.9 (4º round). **Sem migration, sem ADR.**

## [5.1.9] — 2026-07-15

PATCH · **Ajustes de UI e de permissões (Metas, Faturamento, sidebar, Administração).** (1) **Auto-refresh na Comparação Upload×Monde** (`/metas/comparacao`) — como no Acompanhamento/TV (v5.1.6), a tela converge ao dado do Monde sem reload (5 min). (2) **Tabela de Cadastro de Clientes (Faturamento Corp) mais responsiva** — as colunas Empresa e Forma pgto encolhem em telas menores (`md:`) para reduzir o transbordo. (3) **Botão "Modo de Comparação"** (âmbar de gestão, ícone `GitCompare`) no Acompanhamento, à esquerda do "Modo de Exibição", visível só a quem tem a área de Cadastro de Metas (`metas`) — substitui o link discreto "Comparação (Monde)". (4) **Rótulos das áreas de Metas renomeados** para **"Metas/Cadastro"** (chave `metas`) e **"Metas/Acompanhamento"** (chave `metas/acompanhamento`) — só o RÓTULO de exibição no modal de Usuários e Acessos; CHAVES/permissões/guards/RPCs **INTOCADOS** (migration **0184**, DESTRUTIVA por classificação = UPDATE de rótulo, aplicada por humano em TTY; precedente 0168). (5) **Faixa "Administração" → badge âmbar** no canto superior direito das telas `/admin/*` (ícone `VenetianMask`, tokens de gestão), no lugar da faixa branca full-bleed — o conteúdo sobe (sem espaço sobrando). (6) **Sidebar reordenada:** Executiva › Performance › Metas › Financeiro › Solicitações › Upload de Arquivos › Usuários e Acessos › Design System (Metas subiu acima de Financeiro; Solicitações acima de Upload). (7) **Aviso "em construção":** link novo "Metas", cores dos links uniformizadas (antes Weddings=dourado × Financeiro=cinza), e ícone triangular de alerta na sidebar nos itens atrás do gate de preview (Executiva e Performance/Geral). Migration **0184 DESTRUTIVA** (só rótulo) — **sem ADR** (ajuste de UI/rótulo). **Refinos (2º round):** badge "Administração" alinhada à altura do título (`absolute`, sem gap); tela de Upload perde o botão de refresh manual (o status já recarrega no mount/pós-upload) e o subtítulo vira "Importe planilhas para atualizar a base de dados da plataforma"; a Comparação recebe título "Comparação - Upload manual | API Monde", subtítulo descritivo e passa a exibir "Última atualização em …" (frescor do Monde) no lugar de "Período analisado"; tabela de Cadastro ganha `min-w` (para os cabeçalhos não se sobreporem em telas menores; rola na horizontal abaixo do limite). **Refinos (3º round):** "Resultado Prev." (Próximos Casamentos a Entregar) e "Faturamento" (Mix por Produto) adotam o **formato contábil** (`ValorContabil` — "R$" à esquerda, número à direita com centavos; colunas alargadas p/ não gerar scroll horizontal, table-fixed); **Mix por Produto passa a mostrar 6 linhas** (era 5); a **setinha de ordenação** da Lista de Operações (Weddings) adota os **ícones lucide** (ArrowUp/ArrowDown ativo, ArrowUpDown cinza no inativo) do mesmo padrão da tabela de Movimentações das Solicitações. **TopSection com "linha-cortina" (4º round, aprovado em mockup interativo):** o padrão plataforma-wide de barra recolhível ganha animação — a barra fica fixa e o conteúdo sai por baixo dela, revelado de cima para baixo, com a linha separadora presa à borda inferior descendo à frente ao abrir e subindo ao fechar (450ms, curva fluida escolhida pelo Yan); substitui o `<details>` sem animação; conteúdo fechado fica `inert` (fora do tab-order/leitor de tela, como antes). **Refinos (5º round):** animação da cortina calibrada para **450ms**; ícone de relógio no "Última atualização em" da Comparação (paridade com o Acompanhamento); padrões novos **registrados no Design System** (`docs/design-system.md`: §Seções recolhíveis/linha-cortina + §Badge de seção Administração; catálogo da página DS corrigido); páginas de **Performance ganham título "Performance dos Setores"** + subtítulo no layout do segmento (persistente nas 4 telas; skeleton do segmento perde o título-fantasma p/ não duplicar).

## [5.1.8] — 2026-07-15

PATCH · **"Última atualização" passa a mostrar a última SINCRONIZAÇÃO com o Monde, não o último dado mudado.** Desde a v5.1.5 o rótulo lia `ultima_sync` = `MAX(sincronizado_em)` = a última vez que uma venda de fato **mudou** — que **congela** em janelas sem venda nova (o cron roda às 12:00 mas, sem venda nova desde 11:45, o rótulo seguia "11:45"). O esperado é mostrar **quando sincronizamos** (dado conferido como atual), avançando a cada pull (~15min). **Migration aditiva 0183:** `monde_ingest_status` ganha `ultima_sincronizacao` = `max(atualizado_em)` de `monde.ingest_control` (avança a cada rodada do cron, mesmo sem mudança) — campos existentes intocados, `ultima_sync` segue exposto (retrocompatível). O rótulo (`carregarAcompanhamento`, fonte única de `/metas` e `/metas/tv`) passa a ler `ultima_sincronizacao`, com **fallback** a `ultima_sync`. Precisou de migration (não só código) porque o timestamp de sincronização vive em `ingest_control` no formato-texto do Postgres, que o formatador do app não parseia — a RPC passa a expô-lo como ISO limpo (formatação via Intl, sem munging de data no cliente). **SEM ADR** (refinamento do rótulo).

## [5.1.7] — 2026-07-15

PATCH · **Correção: o cron do Monde estava bloqueado pelo middleware (401), não pelo secret.** A rota `/api/monde/ingest` foi desenhada (v5.1.2) para autenticar por `CRON_SECRET` **no handler**, mas o `proxy.ts` (middleware, camada 1 de auth — ADR-0109) exige sessão em toda rota não-pública e **cobria essa rota**: o request do `pg_cron` (que envia só `Authorization: Bearer <CRON_SECRET>`, **sem cookie de sessão**) morria com `{"error":"AUTH_NECESSARIA"}` **antes** de chegar ao handler — a checagem do `CRON_SECRET` nunca rodava. **Bug latente desde a v5.1.2** (o Cron da Vercel teria o mesmo destino; diagnóstico: o corpo do 401 era JSON do app — `proxy.ts:48` — não HTML de Deployment Protection do Vercel). **Fix:** isenta `/api/monde/ingest` do portão de **sessão** do `proxy.ts` (conjunto `API_AUTH_PROPRIA`) — a rota **continua protegida pelo próprio handler**: `CRON_SECRET` OU sessão admin (`requireAreaApi(['admin/uploads'])`, que re-valida a sessão independentemente; o middleware apenas duplicava). **Sem migration** · **ADR-0153** (emenda o ADR-0109). Após o deploy, a ingestão de 15min do Monde volta a rodar (o `CRON_SECRET` Vercel=Vault já foi acertado) e a tela (auto-refresh da v5.1.6) passa a refletir dado atual.

## [5.1.6] — 2026-07-15

PATCH · **Auto-refresh da tela de Metas e do Modo TV.** Após a virada (v5.1.4/v5.1.5), o dado das Metas fica fresco no banco pelo cron do Monde (~15min), mas `/metas` e `/metas/tv` são Server Components (retrato do instante do render) — sem auto-refresh no cliente, a tela (sobretudo a **TV da sala comercial**) só refletia o dado novo num recarregamento manual, tornando a atualização automática sem valor prático. Reintroduz um componente client isolado (`MetasAutoRefresh`) que chama `router.refresh()` num intervalo: re-executa o Server Component (re-`carregarAcompanhamento`) e re-hidrata **sem full reload** — números **e** "Última atualização" avançam sozinhos, preservando scroll/seleção. Montado nos dois modos: **Modo TV a cada 60s** (parede) e **`/metas` a cada 5min** (tela interativa). **Correção de premissa:** a v5.1.4 removera o antecessor `TvAutoRefresh` supondo que "o pull de 15min o substitui" — mas o pull atualiza o **banco**, não a **tela** (ADR-0152 emenda o ADR-0148). **NÃO** é tempo-real de ingestão (a tela converge ao banco; reagir no instante da venda seria Supabase Realtime/SSE, fora deste patch). **Sem migration** · **ADR-0152**.

## [5.1.5] — 2026-07-15

PATCH · **"Última atualização" reflete o Monde (a fonte viva), não o upload.** Após a virada (v5.1.4), os números de Metas/Performance passaram a vir do espelho Monde (~15min), mas o rótulo "Última atualização em…" / "Atualizado em…" (em `/metas` **e** no Modo TV `/metas/tv`) continuava lendo `MAX(criado_em)` de `analytics.fato_venda` via `get_upload_status` — i.e., a data do **upload manual de Excel** (hoje fallback dormente), que congela e passa a mentir pós-virada. Corrige na **fonte única** `carregarAcompanhamento`: o timestamp agora vem de `monde_ingest_status.ultima_sync` (`MAX(sincronizado_em)` do espelho Monde) — resolve `/metas` **e** `/metas/tv` de uma vez, mesmo dado. **Sem migration** (a RPC `monde_ingest_status` já existia — 0178) · sem ADR · `fail-safe` preservado (erro → a linha some, nunca quebra). **Observação operacional levantada nesta análise (fora do código, ação do Yan):** o `pg_cron` de 15min está recebendo **HTTP 401** em `/api/monde/ingest` (o `CRON_SECRET` da Vercel ≠ `monde_cron_secret` do Vault) — a ingestão do Monde está **parada desde 14/07 22:03 UTC**; enquanto os secrets não forem reconciliados, o novo rótulo exibirá essa defasagem honestamente. **Também corrige o CLAUDE.md** (§Modelos por camada): o modelo do orquestrador **não é predefinido** em `.claude/settings.json` (que versiona só `hooks`) — decisão pendente da v5.1.3 resolvida (Opus recomendado, escolhido por sessão, não um default cravado).

## [5.1.4] — 2026-07-14

PATCH · **A VIRADA — a fonte de produção das vendas passa a ser o Monde (repoint REVERSÍVEL).** Passo 2 da integração Monde (v5.1.2 ingeriu o espelho; diagnóstico provou receita idêntica ~99% ao centavo). **Migrations 0181 (flip, reversível up/down) + 0182 (agendamento) · ADR-0151 · migrations NÃO aplicadas pelo Code — o flip é gate do Yan (comunicação à diretoria antes).** (1) **Repoint, não promoção:** as 7 funções PURA-mv (`get_executiva_kpis__nucleo`, `metas_ritmo_diario`, `get_tendencia_margem__nucleo`, `get_decomposicao_variacao__nucleo`, `get_historico_12m_setores__nucleo`, `get_mix_setor__nucleo`, `get_historico_mensal__nucleo`) passam a ler `monde.mv_vendas_diarias` via **views-compat** (`monde.mv_vendas_diarias_compat` c/ `setor_macro_id` + `monde.mv_vendas_mensais`) — troca de ponteiro; o fato do upload (`analytics.fato_venda/item`, `raw.vendas_excel`) **INTOCADO**. `get_mix_produto`/`get_cagr` (MISTAS — leem o fato direto) **seguem no upload** (virá-las exige alimentar o fato = escopo futuro). (2) **Reversível:** DOWN explícito na 0181 (repoint de volta a `analytics.*` + DROP das views); rollback = migration de volta, **nunca restauração de dado**. **Metas ≡ Performance** por construção (mesma `get_executiva_kpis`) — **provado por teste** (`virada-paridade.test.ts`: repoint em transação → `get_executiva_kpis` == `monde.mv_vendas_diarias`, Group + 3 setores, ROLLBACK). (3) **Agendamento migra p/ o Supabase** (`pg_cron`+`pg_net` ~15min, 0182, secrets no **Vault**) → `/api/monde/ingest?mode=incremental` (idempotente); Cron da Vercel fica dormente/redundante. (4) **Auto-refresh do Modo TV removido** (`TvAutoRefresh`) — o pull de 15min o torna desnecessário. (5) **Upload = fallback dormente** (funcional e intocado; reverter a 0181 reativa). **Definição inalterada:** receita/faturamento/margem calculados igual; alvos de 14% válidos; muda a ORIGEM, não a metodologia. Base main @ v5.1.3.

## [5.1.3] — 2026-07-14

PATCH · **Upgrade do harness (processo de desenvolvimento) — não toca produto, banco nem UI.** Instala em `.claude/`/`CLAUDE.md` quatro capacidades destiladas do repositório ECC (vencedor do hackathon Anthropic, fev/2026), adaptadas ao método já validado do Janus, **sem instalar nada do ECC** (plugin/npm/marketplace). **ADR-0150** (ADR de PROCESSO) · **sem migration**. (1) **Revisão de contexto separado** — dois subagentes read-only por capability (`revisor` sempre; `revisor-db` quando há migration/RPC) revisam a implementação ANTES dos gates e da auto-auditoria, sem o viés de ancoragem de quem escreveu; **complementam, não substituem**, a auto-auditoria adversarial. (2) **Hooks determinísticos** (`.claude/hooks/*.mjs`, registrados em `.claude/settings.json` — arquivo novo, contendo só a chave `hooks`): `protecao-config` (PreToolUse — bloqueia edição de config de gate: `eslint.config.*`/`tsconfig*.json`/`.prettierrc*`/`eslint-rules/`/`.claude/`; escape `WT_PERMITIR_CONFIG=1`), `gate-stop` (Stop — varre `console.log` residual e o shorthand Tailwind inválido `-[--token]` nos `.ts/.tsx` de `src/`), `contexto-sessao` (SessionStart — injeta o `WORKING-CONTEXT`). Escape geral `WT_DESLIGAR_HOOKS=1`. Testados por invocação direta (payload sintético via stdin); só disparam sozinhos a partir da PRÓXIMA sessão (bootstrapping — o Claude Code lê `settings.json` no início). (3) **Memória de sessão versionada** `docs/WORKING-CONTEXT.md` — a "verdade atual" do projeto em uma página (versão, última migration, último ADR, bloqueios, filas), atualizada em todo out-briefing (DoD). (4) **CLAUDE.md** registra o protocolo de revisão, os hooks, pesquisar-antes-de-codar e a compactação estratégica. Os agentes de `.claude/agents/` passam a 4: os 2 novos (`revisor`/`revisor-db`) nascem read-only por capability; os 2 existentes (`explorador`/`implementador`) foram inspecionados e já tinham `tools` mínimos (sem mudança).

## [5.1.2] — 2026-07-14

PATCH · **Ingestão da API do Monde (paralela) — alimentar as Metas.** O Janus passa a LER a API do Monde e espelhar as vendas numa estrutura PARALELA (schema `monde`), sem tocar a base do upload. **Esta versão NÃO vira a fonte** — entrega a ingestão + a tela de comparação; a virada é o passo 2 (runbook a parte). **Migrations ADITIVAS 0178–0180** (schema espelho novo, fora do TRUNCATE do upload) · **ADR-0149**. Decisão-mãe (investigação): consumir `sales` cru — paridade provada **ao centavo por venda**. **Exclusões:** setor **Welcome** fora (emissões internas de colaboradores); produtos **cancelados** fora da projeção (mas `status`/`canceled_at` guardados p/ auditoria). Vendedor de Weddings vem do custom_field "Vendedor(a) Responsável - Grupo". **Idempotência** por `venda_numero`+`raw_hash` (UPSERT; re-rodar nunca duplica). Cliente **server-only** (chave de serviço `MONDE_API_KEY`, nunca no cliente/repo/log), parser **Zod tolerante** (API caindo/mudando não quebra o painel; upload é fallback). **Vercel Cron** diário (`0 9 * * *`; sub-diário `*/15` é Pro-only e reprova o deploy em Hobby — fica p/ o passo 2) + modo **backfill** resumível por mês. Tela `/metas/comparacao` (guard forte, **só-leitura, sem virada**) — upload × Monde mês a mês (Group + setores) com Δ. **Produção intocada:** `get_executiva_kpis`/`metas_ritmo_diario` seguem em `analytics.mv_vendas_diarias`; `/metas` e `/performance` idênticas. **Correção de premissa do briefing** (auto-auditoria vs. código real): a transform de produção NÃO descarta linha por falta de `contrato`/`taxa_servico` (migration 0011 faz `COALESCE(...false)`) e `operacao_propria` nem é coluna do fato — logo a síntese dos 3 flags é **completude/auditoria** (raw guardado p/ reprocessar), não altera nenhum total.

## [5.1.1] — 2026-07-14

PATCH · **Correções de rolagem e ajustes de Solicitações.** (1) **Modal de Nova Solicitação consertado**: o conteúdo vazava do painel sem barra de rolagem — regressão da migração das barras (v5.0.0): o viewport do `<ScrollAutoHide>` usava `h-full` (porcentagem), que não resolve em ancestral de altura INDEFINIDA (`max-h-[85vh]` do `ModalCentral`); o viewport passa a dimensionar por **cadeia flex** (`flex-1 min-h-0`), válida p/ altura definida OU max-h. O modal também ganha **altura fixa** (`alturaFixa`) — não "pula" quando o Tipo troca os campos. (2) **Acervo**: respiro entre os botões de ação e a barra flutuante (`pr-5`). (3) **Painéis de Solicitações em colunas** (caixa de entrada e Minhas solicitações): cada coluna com **barra própria** e **header fixo** (`max-h` viewport-relativo) — registrado no DS como padrão de painel em colunas. (4) **"?" na Data limite** da Nova Solicitação com a dica "prazo padrão de 3 dias" (padrão do Faturamento) — o balão abre à esquerda (`!left-auto right-0`) p/ não ser recortado pelo viewport rolável do modal. (5) **Nova Solicitação — texto**: subtítulo passa a "Abra um pedido para um usuário ou para um grupo de usuários" (sem ponto final, como os demais); o modo de destinatário «Permissão» vira **«Grupo»** (rótulo do toggle + placeholder + `aria-label`), coerente com "grupo de usuários" — só rótulo de UI, o modo interno segue `role`. (6) **Colunas de Solicitações — polimento**: padding do viewport `pl-1 pr-4 pt-2 pb-2` — `pt-2` dá respiro no topo p/ o `box-shadow` de realce do hover (`.card-clicavel-neutra`) do 1º card não ser cortado pelo `overflow`, e `pr-4` abre goteira p/ o thumb vertical (`right-1 w-1.5`) não ficar em cima do card. (7) **Largura total das páginas**: removido o cap `max-w-7xl`/`max-w-5xl mx-auto` de TODOS os containers-raiz (16 páginas/conteúdos + 10 skeletons `loading.tsx`) — as telas passam a usar toda a largura do `<main>`; convenção atualizada em CLAUDE.md, DS page e `docs/design-system.md`. (8) **Respiro horizontal vira FONTE ÚNICA no `<main>`**: o `<main>` do AppShell ganha `px-8` e o `px-4`/`px-6` próprio dos 24 containers-raiz (+ prop `container` dos skeletons; `SkeletonPagina.container` agora opcional) é removido — mais respiro conteúdo↔sidebar e **afinar o gap lateral = mudar só o `px` do `<main>`**. (9) **Painel de Solicitações preenche a altura disponível**: cadeia flex (página `h-full flex-col` → tabpanel `flex-1 min-h-0` → board/grid `flex-1 min-h-0` → coluna `flex-col min-h-0` → `<ScrollAutoHide>` `flex-1`), no lugar do `max-h-[calc(100vh-24rem)]` fixo que deixava espaço vazio embaixo e era frágil; as colunas vão até o rodapé do `<main>` e rolam por dentro. Provado por medição DOM (gap abaixo das colunas = 0px; coluna longa rola internamente). SEM migration.

## [5.1.0] — 2026-07-13

MINOR · **Modo TV — Metas na parede do comercial.** Nova rota irmã `/metas/tv`: uma pele de exibição do Acompanhamento em tela cheia (16:9, tema claro, **zero interação**) para deixar as metas do comercial numa TV. Group + 3 setores numa só tela, com a barra na cor do setor, a seta do esperado e o "% da meta" colorido pela mesma régua do app. Botão **"Modo de Exibição"** no cabeçalho do Acompanhamento abre a rota (a sidebar fica intocada). Auto-refresh ~10min (interim, a ser substituído pelo tempo-real da API). **FONTE ÚNICA**: reusa a MESMA orquestração da v5.0 (`carregarAcompanhamento` extraída), sem terceiro caminho de dados. **SEM migration** · ADR-0148.

## [5.0.1] — 2026-07-13

PATCH · **Aviso por e-mail de nova solicitação de acesso.** Quando alguém pede acesso pela tela de login (`/solicitar-acesso`), quem administra **Usuários & Acessos** passa a receber um e-mail (identidade interna Janus) com os dados do solicitante e um botão para revisar/aprovar — antes ninguém era avisado. Só dispara em **pedido novo** (não em reenvios). Nova RPC `solicitar_acesso_admin` (**service_role-only** — não abre diretório de e-mails a anônimo); envio **best-effort** (nunca bloqueia o pedido); anti-enumeração preservada. **Migration 0177 (aditiva)** · ADR-0147.

## [5.0.0] — 2026-07-08

MAJOR · **Metas por Setor — a abertura da major 5.** O acompanhamento de metas comerciais de faturamento (VT) por setor entra na plataforma, substituindo o dashboard provisório. **Migration 0175 (aditiva)** · ADR-0146. Base v4.40.1.

- **Banco (M1):** `app.meta_setor` ganha `pct_receita` (alvo de % Rec) e o histórico é ATIVADO (auditoria de quem/quando/valor anterior). Área RBAC `metas/acompanhamento` (leitura) ao lado da `metas` (edição). RPCs inline `metas_listar`/`metas_ritmo_diario`/`metas_upsert`. **Fonte única PROVADA por teste**: a série de `metas_ritmo_diario` soma exatamente o faturamento de `get_executiva_kpis` (mesma `mv_vendas_diarias`).
- **Ritmo (M1):** módulo puro `src/lib/metas/ritmo.ts` — meta do período = soma das metas mensais tocadas, **pró-rata por dias** nos meses parciais; "hoje" = data da última venda carregada; régua com constantes nomeadas; alvo de % Rec ponderado por VT. 10 testes.
- **Primitivos (M2):** `<MetaProgressBar>` (barra de meta com tick + tooltip escuro); `<NavGroup>` genérico na sidebar (Performance/Financeiro/Metas); `kpi-principal-drawer` realocado de `weddings/`→`performance/`. *(Consolidação das 3 pills de período deferida — a variante de Weddings é Context, migrar arriscaria regressão; Metas reusa a base.)*
- **Acompanhamento (M3):** `/metas` — card Group (Faturamento + `% da meta`/`% do esperado` + barra + Receita | Margem) + 3 cards setoriais (barra na cor do setor). **Sem YoY na superfície** (Metas mede entrega da meta, não variação anual); Margem = delta em p.p. contra o alvo. Gráfico "Ritmo do período". Group computado. Tema group.
- **Cadastro (M4):** `/metas/cadastro` — grade anual 12×3 (Faturamento + % Rec) com Group computado ao vivo, **edição local + salvar em lote** (contador de pendências + botão Salvar + guarda de saída), "aplicar ao ano" no % Rec, Total em contábil pleno e auditoria da última alteração.
- **Aposentadoria (M5):** dashboard v1 legado removido (provado órfão); migration destrutiva 0176 (DROP das 4 RPCs órfãs) preparada, **pendente de aplicação humana** (`get_historico_mensal` preservada — consumida pela Executiva).

## [4.40.1] — 2026-07-08

PATCH · **Título do modal de boas-vindas na fonte da identidade.** "Welcome to Janus" sai da serifa (Georgia) para a **Avenir LT Std 85 Heavy** — o mesmo estilo do antigo wordmark (caixa alta + tracking, via CSS; o texto verbatim permanece) — no **cinza da marca** (`--text-muted` #75777B) em vez de preto. Mockup B aprovado pelo Yan. Sem migration.

## [4.40.0] — 2026-07-07

MINOR · **Rebranding Janus — o fechamento da v4.** A plataforma interna assume a identidade **Janus**; o cliente externo continua vendo só **Welcome** (e-mail de fatura 100% intocado — provado por diff). Absorve o teste aprovado `test/rebrand-janus-sidebar` (PR #166, fechado sem merge). **Migration 0174 (aditiva)** · ADR-0145.

- **Sidebar Janus sobre tokens (M1):** logo no header (caixa 168×48, máscara CSS — asset nunca editado, cor no componente) com o "version X.X.X" centralizado logo abaixo (o byline "by WELCOME" do teste saiu no checkpoint), selo Welcome vertical no rodapé (box 46/4/12/branco/borda). REGRA ÚNICA de cor: `var(--brand)` — neutro no repouso, override setorial via `[data-theme]` (tokens, não os hex baked do teste). Ramo legado do `WelcomeGroupLogo` removido; fallback de erro → "Janus" (sonda `Image()`).
- **Superfícies restantes (M2):** wordmark JANUS nos headers desktop/mobile e telas de auth; textos "WT Finance"→"Janus" (/sem-acesso, /auth/confirm, design-system). Repo/`package.json` não renomeados.
- **Saneamento `--brand` (M3):** o default do `:root` (#BD965C, resquício) vira o **neutro do Grupo** (#75777B/-soft/-deep) — o dourado é SÓ de Weddings (ADR-0103), vivo no override; fim do flash dourado pré-hidratação nas telas group. Overrides setoriais e Weddings intactos; inventário completo no out-briefing; docs vivas corrigidas.
- **E-mails internos (M4):** senha provisória + notificação de solicitação ganham cabeçalho **lockup duplo [JANUS] | [WELCOME GROUP]** (tabela Outlook-safe, divisor 1px, alturas ópticas casadas) e textos Janus (`APP_NOME_INTERNO`; `APP_NOME` congelado para a fatura). **Fatura intocada** (`templateFaturaEmail`/`fatura.ts`/`fatura.test.ts` sem diff).
- **Modal "Welcome to Janus" (M5):** 1× por usuário, controlado no **banco** (migration 0174: `onboarding_visto_em` + RPCs inline; nunca localStorage). Texto verbatim, lockup duplo (empilha no mobile), título serif (stack Georgia; Trajan futura = 1 linha), "Começar" grava. Promise fora do caminho bloqueante (Suspense+`use`); **fail-safe**: consulta falhou → não exibe.
- **Histórico colapsado por major (M6):** majors anteriores dobram num grupo expansível ("Versões N.x — N versões"); major atual mostra as ~5 recentes + expansor. Regra derivada de `APP_VERSION` (sem hardcode) — na v5.0.0 a v4 dobra sozinha. Nada apagado.
- **Favicon + title (M0, gate DECIDIDO):** a régua comparativa (16/32/48/180) foi apresentada e o corte do símbolo bifronte **não ficou legível em 16/32** — decisão do Yan: **manter os ícones atuais**. O `title` da aba muda para **"Janus · Welcome Group"** (e a `description` acompanha o posicionamento da plataforma).

## [4.39.0] — 2026-07-07

MINOR · **Performance e navegabilidade (loading states + caminho crítico).** A plataforma não mandava nenhum byte até todo o trabalho do servidor terminar e não tinha nenhum `loading.tsx` — parecia travada ao navegar. Ataca a **percepção** e o **caminho crítico serial**, **sem migration** e **sem tocar em auth** (P2c fica para depois da virada) nem em contrato de dados. ADR-0144.

- **`loading.tsx` com skeleton por segmento (M1):** módulo `src/components/shared/skeletons.tsx` (silhuetas reutilizáveis — header/filtros/KPIs/gráficos/tabela; tom neutro `zinc` + `animate-pulse`, sem CLS) + `loading.tsx` nas rotas pesadas (Performance ×4 via um único arquivo, Fluxo de Caixa, Gerencial, Solicitações, Admin·Solicitações+Movimentações, Admin·Acessos, Acervo, Faturamento). O App Router mostra o skeleton **imediatamente** ao navegar; a **sidebar nunca entra no skeleton** (o `loading.tsx` só substitui o `<main>`); cada um usa o **mesmo container** da sua página (sem salto).
- **`useTransition`/`isPending` nos filtros (M2):** os 4 filtros de período/setor que navegam via `router.push` (Fluxo de Caixa, Performance, Executiva) envolvem o push em `startTransition` e mostram **espera visível** (pills esmaecidas + `aria-busy`; selects desabilitados) — o clique nunca "morre". **Semântica idêntica** (mesma URL/params).
- **Badge de pendências fora do caminho bloqueante (M3):** o layout deixa de fazer `await getPendencias()` (era um hop serial que atrasava o 1º byte) e passa a **transmitir a promise** para a Sidebar, consumida via **Suspense + `use()`** — o badge streama e aparece ao resolver; a **falha do badge é inofensiva** (`.catch(() => null)` → o layout nunca espera nem quebra). −1 hop serial em toda navegação.
- **Fluxo de Caixa em 1 estágio de RPCs (M4):** os 2 blocos seriais (8 + 3 gerenciais) viram **um único `Promise.allSettled`** (gerenciais por spread condicional — só para quem tem a área; sem dependência de dados). Mesmos contratos, mesmos resultados; a seção gerencial indisponível continua não derrubando a página. 1 estágio serial a menos na página mais pesada.
- **Bundle (M5):** os 2 drawers com Recharts (`KpiPrincipalDrawer`, `DrilldownDrawer`) carregam via `next/dynamic(ssr:false)` (fallback leve no 1º clique) e o `@e965/xlsx` (chunk de ~472 KB) sai do import estático de `lista-operacoes.tsx` para `await import(...)` **dentro** do handler de Download — recharts (drawers) e xlsx saem do first-load de Performance/Weddings, carregando **sob demanda**. Drawers e download idênticos ao usuário.

## [4.38.0] — 2026-07-06

MINOR · **Faturamento Corporativo — melhorias de interface (resultado em modal, re-hidratação, Revisar envio final).** Pacote de UI pós-Faturamento-completo, aprovado por mockup. **Lógica de emissão/envio inalterada** — muda a apresentação + registro/leitura.

- **Resultado da emissão sai dos painéis inline e vira DOIS MODAIS sob demanda.** A barra de ações ganha "dois momentos": cada `Emitir X` vira `Ver resultado · X` (largura fixa por botão — não "pula" na troca de texto) quando há resultado no banco; `Enviar e-mails` fixo à direita (sem contador). O **modal de boletos** mostra Pessoa · Fatura Nº · Valor (contábil) · **Juros · Multa aplicados** · Status (emitido/já emitido/falhou + motivo); juros/multa do cadastro em negrito, padrão discreto, desconhecido `—`. O **modal de notas** traz "Atualizar status" dentro. A coluna E-mail por-linha some (o envio vive no lote).
- **Re-hidratação:** ao carregar/cruzar a planilha, a tela consulta o banco e repõe os status (boleto/nota/e-mail) **sem reemitir** — a tela lembra o que já foi feito mesmo após recarregar; o `invoice_id` re-hidratado faz o "Atualizar status" da nota funcionar pós-reload.
- **Migration 0172 (aditiva):** colunas `juros_aplicado`/`multa_aplicada` em `app.fatura_emissao` (gravadas na emissão nova; registros antigos ficam `NULL` → exibem `—`, sem inventar valor retroativo) + RPCs de leitura `resultado_boletos`/`resultado_notas` (incluem os que falharam).
- **Revisar envio (lote) na forma final:** anexos como badges clicáveis (Boleto ↗ / Nota fiscal ↗), status como **mensagens puras em 4 cores** (Pronto / Sem destinatário / Nota fiscal pendente / Já enviado) e coluna **Enviar** com checkbox (marcar "Nota fiscal pendente" = enviar só o boleto; marcar "Já enviado" = reenvio; "Sem destinatário" desabilitado até corrigir; o cabeçalho marca só os Prontos). Cabeçalho e rodapé fixos ao rolar; contador "N marcados" só no rodapé.

### Ajustes de interface (rodada pós-mockup, mesmo PR)

- **Nota fiscal em erro não fica mais "processando" para sempre.** A classificação do status da NF virou **fonte única** (`src/lib/faturamento/status-nota.ts`) com **fail-safe INVERTIDO**: só um allowlist POSITIVO de estados de andamento (SCHEDULED/SYNCHRONIZED/PENDING/PROCESSING/IN_PROCESS + vazio) exibe spinner "processando"; AUTHORIZED = autorizada (verde); CANCEL* = cancelada; **qualquer outro (ERROR e desconhecidos) = falhou** (vermelho, `AlertTriangle`, sem spinner, com motivo). Antes, um status de erro desconhecido caía no default "processando" e girava eternamente. A mesma classificação serve a tabela de revisão e os dois modais. Um aviso de autorização congelado deixa de mascarar uma nota que um refresh posterior autorizou.
- **Migration 0173 (aditiva):** `atualizar_status_nota` passa a `erro = COALESCE(p_dados->>'erro', erro)` — o refresh de status não apaga mais o motivo capturado na emissão (única coluna que faltava COALESCE; as demais já tinham).
- **Anexos "Outros" no Revisar envio:** upload por-linha na coluna Anexos → anexados ao e-mail daquela fatura, além do boleto/nota. Decodificados e anexados **no ponto único da camada** (`src/lib/email/fatura.ts`); anexo inválido/vazio/acima de 15 MB **falha o envio com motivo** (nunca e-mail incompleto). `anexos.outros` registra a contagem em `fatura_email`.
- **Barra de ações:** removida a linha de resumo de e-mail (o estado vive no modal "Revisar e-mails"); botões à direita, na mesma linha. **Legendas ao pé da tabela** substituídas por um **"?" com tooltip** nos cabeçalhos Status / Boleto / Nota fiscal.
- **"Atualizar status"** saiu do cabeçalho da coluna (↻) e virou **botão bordado à direita, sempre visível** (desabilitado quando não há nota com status a acompanhar).
- **Coluna Valor da revisão** em formato **contábil** (`ValorContabil`); **coluna Boleto alargada** (o "ver boleto" não quebra linha); nos modais de resultado, a **coluna Pessoa trunca** com reticências + `title`.
- **Barra de rolagem horizontal fantasma na tabela de revisão — corrigida.** A causa era o **tooltip "?" do cabeçalho**: o primitivo `Tooltip` aplica `whitespace-nowrap` no balão e o texto longo da dica (invisível, `visibility:hidden`) virava uma linha gigante que transbordava ~313px à direita, criando barra horizontal com "espaço vazio" (medido em repro isolado). Forçado o wrap do balão com `!whitespace-normal`. Também removido o `min-width` da tabela (padrão canônico — cabe sempre no container; Pessoa encolhe e quebra com `break-words`).
- **Modais com tamanho fixo** (`alturaFixa` → `h-[85vh]`) — não "pulam" conforme o nº de linhas; o "Revisar e-mails" ganhou título/subtítulo ("Revisar e-mails antes do envio" / "Revise as informações antes do envio dos e-mails, edite destinatários e inclua anexos") e os modais de resultado, subtítulo ("Confira o status das emissões … através da API do Asaas") + chip de ambiente.

### Outros ajustes de interface (mesmo PR)

- **Acervo de Documentos:** só a **lista rola** — título e busca ficam fixos no topo (página em altura cheia; a lista num scroll interno com `scrollbar-gutter:stable`, seguindo a lição do `<main>` do AppShell). A linha **deixa de ser inteira clicável**: o download acontece só pelo **botão de download**, que ganhou realce (sombreado) no hover, como o botão da lixeira.
- **Padronização da largura das telas de upload:** Calculadora de Rateio e Upload de Arquivos passam a usar a **largura cheia** (`max-w-7xl`), igual ao Faturamento Corporativo — antes eram `max-w-2xl` (mais estreitas).
- **Upload de Arquivos:** removido o botão desabilitado "Selecione um arquivo para importar" (era inerte — a seleção acontece na própria zona de arrastar/clicar).

ADR-0143 (emenda ao registro/leitura do Faturamento). Sem mudança na lógica de emissão, no throttle do lote nem na dupla-trava do modo real.

## [4.37.2] — 2026-07-06

PATCH · **Ajustes visuais/de texto.** Sem migration.
- **Editor de tipos de Solicitação — layout do aviso de data:** o seletor de direção (v4.37.1) esticava em largura cheia (herdava `w-full` de `CAMPO`), empurrando o campo de dias e o rótulo para fora do modal (rolagem horizontal). O seletor e o input passam a ter **largura fixa** (wrappers `w-32`/`w-28`, o `w-full` interno preenche o wrapper — sem conflito de utilitárias), com `flex-wrap` de segurança; o rótulo virou só "dias" (a direção já vem do seletor "a mais de / a menos de").
- **Subtítulo do Acervo de Documentos:** "Biblioteca de documentos, modelos, manuais e referências"
- **Subtítulo do Faturamento Corporativo:** "Emita boletos e notas fiscais, dispare e-mails e gerencie o cadastro dos clientes corporativos"

## [4.37.1] — 2026-07-06

PATCH · **Solicitações — aviso de data por campo ganha direção (a mais de / a menos de X dias).** No editor de tipos, o campo de data podia avisar apenas quando a data estava **a mais de** X dias no futuro. Agora um seletor **"a mais de / a menos de"** permite escolher o sentido — avisar quando a data está longe demais **ou** perto demais (prazo curto). **Migration 0171 (aditiva):** coluna `data_aviso_direcao` (default `'acima'`) + as 3 RPCs (`solic_tipos_abertura`, `admin_solic_listar_tipos`, `admin_solic_salvar_tipo`). **Retrocompatível:** todos os tipos já existentes nascem em `'acima'` — comportamento idêntico ao atual; só novos/editados escolhem o sentido. O aviso segue sendo só de UI (não bloqueia o envio). Estende ADR-0118.

## [4.37.0] — 2026-07-06

MINOR · **Faturamento Corporativo — a Emissão consome o Cadastro (Visão B parcial, 2 campos).** Primeira evolução deliberada Visão A → Visão B, limitada a dois campos **estruturados** do Cadastro de Clientes. **Sem migration** (as RPCs existentes cobrem) · **ADR-0142** (emenda ao invariante "a Emissão não lê o cadastro" da Fase 3). **Nada retroage** (só emissões novas); a OBS em texto livre segue **não interpretada**.

- **Juros/multa por cliente no boleto:** o boleto passa a usar `pct_multa` → `fine` (multa, cobrança única no atraso) e `pct_juros` → `interest` (juros ao mês) do cadastro. Contrato **estrito** (`"1%"|"2%"|"5%"|"10%"`); **qualquer outra coisa** (vazio, formato diferente, cliente fora do cadastro) → **default 2%/2%**, silencioso. **A emissão nunca falha por juros/multa** (fail-safe), e a consulta ao cadastro é read-only e tolerante a falha (RPC caiu → defaults). **M0 (sandbox):** confirmado que o Asaas aceita multa de 10% (`fine:{value:10}`).
- **Fallback de e-mail fiscal (NF):** ao emitir a nota, se o cliente **não tem e-mail no Asaas**, a cadeia agora tenta `raw.pessoas` (só e-mail válido e único; string com `;` é inválida e é ignorada) e, por fim, o **Cadastro de Clientes** (primeiro destinatário válido). O e-mail só **completa a lacuna** — nunca sobrescreve — e vira o e-mail fiscal permanente do cliente no Asaas. Resolve o caso de NF recusada por "e-mail do cliente incompleto".
- **Sem UI nova** nesta versão (os valores aplicados ficam visíveis no próprio Asaas); mostrar juros/multa na tela e registrá-los em `fatura_emissao` são melhorias posteriores. A **virada** para produção (Asaas + e-mail) continua sendo decisão consciente do Yan.

## [4.36.0] — 2026-07-03

MINOR · **Faturamento Corporativo — Fase 4b: revisão do envio + disparo em lote + a virada (construída, não acionada).** Segunda metade da Fase 4 — a **operação** sobre o pipeline da 4a: o modal **"Revisar envio"**, o disparo em **lote** e a **capacidade** da virada para produção. Com isto o Faturamento fica completo — da planilha ao e-mail — em **modo teste**. **ADR-0141 · sem migration** (as RPCs da 4a + `buscar_cliente_corporativo` cobrem). **A virada para o modo real é decisão consciente do Yan (junto com o Asaas); `EMAIL_MODO` segue `teste` → o modo real permanece inalcançável nesta entrega.**

- **Checkpoint de layout do e-mail (M0):** o template da fatura foi revisado no cliente-alvo e ajustado (aprovado): sem botão "Acessar o boleto" (o boleto vai como anexo), corpo enxuto ("Segue em anexo a fatura … juntamente com boleto e nota fiscal" — só "boleto" quando sem nota) e "Caso tenham dúvidas" no mesmo bloco.
- **Modal "Revisar envio" (tabela):** pills de filtro **Todos/Atenção/Prontos/Enviados** com contagem; colunas **Pessoa · Nº · Anexos · Destinatários · Status**. A célula de **destinatários é editável e efêmera** (vale só para este envio — sem gravar no Cadastro), com validação **ao vivo** (trecho inválido em vermelho). O **Status** classifica cada fatura em **Pronto / Atenção (com motivo) / Enviado**, com ações como links: **enviar só o boleto** (quando a nota está pendente), **reenviar** (deliberado) e **ver boleto**.
- **Disparo em blocos, orquestrado pelo cliente:** um e-mail por vez, com **~2,1s de intervalo** (≤30/min por construção), **barra de progresso** e log por fatura. O **snapshot** de destinatários é **congelado** no clique e **re-validado no servidor** (o cliente nunca é fonte de verdade). **Resume por idempotência:** fechar e reabrir o modal re-monta os já enviados (via `email_existentes`) e continua dos restantes, sem duplicar.
- **A virada (construída, não acionada):** quando o modo for `real`, a UI exigirá digitar **ENVIAR** e o servidor exigirá uma **confirmação explícita** (dupla trava, no molde do "EMITIR" de produção do Asaas). Testes cobrem a **recusa** do modo real sem confirmação. **Nada é enviado em real nesta versão.**
- **Fonte única da validação de e-mail:** `splitDestinatarios`/`emailValido` extraídos para um módulo **isomórfico** (`src/lib/email/destinatarios`), reusado no servidor e na célula editável do cliente (sem duplicar a regra). `enviarEmailFatura` ganhou opções aditivas (override de destinatários, "só boleto", reenvio, confirmação real), preservando o botão por-linha da 4a.

## [4.35.0] — 2026-07-03

MINOR · **Faturamento Corporativo — Fase 4a: pipeline de envio de e-mail de fatura (MODO TESTE).** Primeira metade da Fase 4 (a última antes da produção): a camada que envia o e-mail da fatura com **boleto e nota anexados**, isolada e em modo teste. **E-mail SAI DE VERDADE — não há sandbox; o modo real é INALCANÇÁVEL nesta versão, por construção.** **ADR-0140 · migration 0169 (aditiva).**

- **Envio por fatura (uma por vez, botão na tela de Emissão):** nas faturas com boleto emitido, um botão “Enviar e-mail (teste)” dispara o envio. **Tudo é derivado no servidor** (o cliente só manda o nº da fatura): boleto (obrigatório) + nota (só quando **AUTORIZADA**; nota pendente → fatura não enviável), cliente/destinatários do Cadastro (só **ativo**), split dos destinatários (`;` + validação), idempotência. **Um e-mail POR FATURA** (conserta o agrupamento por-cliente do script legado, que perdia anexos em cliente multi-fatura).
- **MODO TESTE (o “sandbox do e-mail”) — invariante:** como o e-mail sai de verdade, em modo teste **TODOS** os e-mails vão para `EMAIL_TESTE_DESTINO` (override no **ponto único**, dentro da camada), com o destinatário **REAL** visível no assunto e no corpo. Sem `EMAIL_TESTE_DESTINO` → envio **recusado (fail-closed)**. O modo real é recusado no servidor (`emailAmbiente() != 'teste'`); a virada é a Fase 4b.
- **Anexos:** boleto (sempre) + nota (quando autorizada), baixados server-side dos PDFs do Asaas com timeout; **falha de download = o e-mail FALHA com motivo** (nunca e-mail incompleto). **Corpo condicional** (menciona a nota só quando anexada) + assunto `Fatura Welcome Trips – {cliente} – Nº {ref}` + layout/assinatura da plataforma.
- **Registro e idempotência POR MODO:** `app.fatura_email` (append-only, **sem UNIQUE** — reenvio deliberado é da 4b) registra cada tentativa (destinatários **reais E efetivos**, anexos, modo, sucesso/erro, quem/quando). `email_existentes(refs, modo)` pula os já enviados **naquele modo** — enviada em teste não conta como enviada em real.
- **Migration 0169 (aditiva):** `app.fatura_email` (RLS deny-by-default) + RPCs no padrão inline `registrar_email`/`email_existentes`/`buscar_docs_fatura` (esta lê as URLs de boleto/nota para anexar; o schema `app` não é acessível via `.from()`). Camada `src/lib/email/fatura.ts` (fallback-safe, **nunca lança**) reusa o transport único de `src/lib/email`; helper `emailAmbiente` fail-safe.
- **Fase 4b (próxima):** tela **editável** de revisão do envio, cruzamento em massa, disparo em blocos com progresso, reenvio explícito, “enviar só boleto”, e a **VIRADA** para o modo real (dupla trava).

## [4.34.1] — 2026-07-02

PATCH · **Correção visual do cabeçalho fixo (sticky) das tabelas com scroll interno.** Sem migration. Nas tabelas de **Cadastro de Clientes** (Faturamento) e **Base de Dados** (Fluxo de Caixa Gerencial), ao rolar, linhas de dados **vazavam** através do cabeçalho fixo. Causa-raiz: em `border-collapse` (default), fundo e borda **não acompanham o sticky** de forma confiável. Correção: tabela em **`border-separate border-spacing-0`** + fundo opaco nas **células** do cabeçalho (`[&_th]:bg-white`, `z-20`) + **toda borda horizontal movida para as células** (divisórias do cabeçalho por `first/last-child th`; linhas do corpo por `[&>td]:border-b` — borda de `<tr>` não renderiza em separate). As duas tabelas passam a viver dentro de um **Card** (fundo branco — não ficam mais coladas no fundo cru da página). Receita registrada no CLAUDE.md e no Design System §7.

Refinos aprovados por mockup (mesmas duas tabelas):
- **Sombra sob o cabeçalho ao rolar** — só aparece com a lista rolada (estado `rolado` via `onScroll`), reforçando o "flutuando sobre as linhas".
- **Fim da rolagem horizontal** — sem `min-w`; colunas de baixo uso compactadas e colunas de texto (Contato/Destinatários/Observações; Descrição/Conta/Originador) **flexíveis com truncate** (o conteúdo completo permanece no tooltip e na edição inline).
- **Tom no cabeçalho** — fundo `zinc-50` distingue o cabeçalho do corpo.
- **Cantos do cabeçalho arredondados** — as células de canto da 1ª linha do `thead` ganham `rounded-tl-lg`/`rounded-tr-lg` p/ o header cinza acompanhar o Card (antes pontudo).
- **Faturamento Corporativo mais largo** — as **duas abas** (Emissão e Cadastro) passam a `max-w-7xl` (largura única, **sem salto** ao alternar) aproveitando o espaço lateral; % Juros/% Multa/Forma pgto relaxadas para não truncar valores comuns; coluna **Situação** alargada (`w-[92px]`) para o filtro não sobrepor o texto.
- **Badge de ambiente** — o **sandbox** passa a **âmbar** (tokens `--gestao`, os mesmos dos botões de permissão específica), destacando o modo teste; a **produção** fica **neutra** (a trava real de emissão em produção continua sendo a confirmação "digite EMITIR" no modal, inalterada).

## [4.34.0] — 2026-07-01

MINOR · **Acervo de Documentos (Financeiro) — capacidade nova.** Página `/financeiro/acervo`: biblioteca de documentos do financeiro em formato de glossário A–Z, com busca client-side e download por link temporário. **ADR-0139 · migration 0165 (aditiva, aplicada — backup-gate verde).**

- **Página nova sob RBAC próprio em DOIS níveis:** `financeiro/acervo` (ver a biblioteca) e `financeiro/acervo/gestao` (adicionar documentos — inclui a visão); guards de leitura fazem OR das duas. Botão "Adicionar" (âmbar, família de tokens `--gestao`) só aparece para quem tem a área de gestão. Grant inicial apertado (só roles com `admin/acessos`, mesmo padrão da 0161) — o admin libera outros roles pelo editor de Usuários e Acessos. Subitem novo na sidebar de Financeiro (`NavSubItem.areasAny`, campo novo, espelha o `areasAny` de `NavItem`).
- **Glossário A–Z:** documentos agrupados pela letra inicial do título, ordem alfabética pt-BR acento-insensível, `#` por último. Busca por título/descrição/nome do arquivo (acento-insensível). Item mostra título > descrição > nome original do arquivo.
- **Upload:** modal pede título + descrição (obrigatórios, validados em 3 camadas: client/action/RPC) + arquivo de **qualquer tipo**, máx. 25 MiB (client + action + `file_size_limit` do bucket). Binário sobe via service role a um bucket privado dedicado (`acervo-documentos`, sem policies em `storage.objects`); metadados persistem via RPC com o cliente de sessão (JWT real passa no gate). Nome do arquivo **sanitizado** no path do Storage (diacríticos removidos + whitelist de caracteres); nome original preservado como metadado de exibição/download. Cleanup best-effort do binário se a RPC falhar.
- **Download por signed URL de 60s** (popup-safe — janela aberta antes do `await`, redirecionada depois).
- **Migration 0165 (aditiva):** tabela `app.acervo_documento` (RLS deny-by-default) + bucket privado `acervo-documentos` (25 MiB, qualquer MIME) + as duas áreas RBAC + 3 RPCs no **padrão inline** (`exigir_acesso` como 1ª linha do corpo, sem o wrapper `__nucleo` da 0121 — retrofit legado, não mais o molde de RPC nova): `acervo_listar` (whitelist explícita, nunca expõe `storage_path`/`criado_por`), `acervo_criar` (só gestão), `acervo_doc_path` (devolve o path para a Action gerar a signed URL).
- Verificação: REST smoke (listar `[]`; anon negado nas 3 RPCs; validação sem persistir) + round-trip E2E em produção (upload → criar → listar → doc_path → signed URL → download com conteúdo idêntico → limpeza total). Auto-auditoria adversarial: 3 correções aplicadas (`areasAny` na sidebar, fixture real + bloco anon-negado em `rpc-contrato.test.ts`, try/catch com cleanup na action de upload); risco aceito e documentado no ADR-0139 (`acervo_doc_path` devolve `storage_path` ao caller autenticado — mesmo desenho do precedente `solic_anexo_path`/ADR-0113).
- **Exclusão de documento (migration 0166, aditiva):** botão de excluir ao lado do download em cada item, visível a quem tem a MESMA área de gestão (`financeiro/acervo/gestao`) — quem pode adicionar também pode excluir. Confirmação obrigatória antes de excluir (`ConfirmModal`, mesmo padrão de `aba-solicitacoes.tsx`). RPC `acervo_excluir` (padrão inline igual às demais) apaga a linha e devolve o `storage_path`; o binário no Storage é removido **depois**, best-effort, pela Server Action — uma falha nesse passo só deixa um objeto órfão inofensivo (nunca listado, nunca baixável). Caso novo em `rpc-contrato.test.ts` (anon negado).

## [4.33.2] — 2026-07-02

PATCH · **Refino de tabelas (transversal) + padrão de cabeçalho no Design System.** Só apresentação/UI + **1 migration destrutiva de rótulo** (`0168`, aplicação humana). A lógica de emissão e os dados não mudam.

- **Cabeçalho de tabela padronizado (toda a plataforma):** removida a caixa alta (`uppercase`/`tracking-wide`) dos cabeçalhos que divergiam (Emissão do Faturamento, Calculadora de Rateio, drawer de import do Gerencial, Composição de lançamentos), alinhando ao padrão único da Lista de Operações — **sem caixa alta, sem negrito, `font-medium` + cor terciária**. Registrado no **Design System §7** como padrão (inclui o padrão de scroll interno com cabeçalho fixo).
- **Emissão (Faturamento):** botões “Emitir boletos”/“Emitir notas fiscais” alinhados **à direita**, na mesma linha dos resumos; coluna **Status** e largura mínima da tabela reduzidas para **eliminar a barra de rolagem horizontal** na revisão.
- **Scroll interno com cabeçalho fixo:** nas tabelas do **Cadastro de Clientes** (Faturamento) e da **Base de Dados** do Fluxo de Caixa Gerencial, a rolagem passa a ser **interna à tabela** (`overflow-auto`, altura máxima) mantendo o **cabeçalho fixo** (`sticky`) ao rolar as linhas.
- **Permissões (rótulos):** “Performance — X” → **“Performance/X”**; “Fluxo de Caixa Gerencial” → **“Gerencial”** (só o texto exibido no modal de Usuários e Acessos). Migration **`0168`** (UPDATE em `app.rbac_areas.rotulo` — destrutiva por classificação, **aplicação humana**). O rótulo do Acervo de Documentos fica na branch v4.34.0.

## [4.33.1] — 2026-07-01

PATCH · **Faturamento Corporativo — refinamento de UX da tela de Emissão** (só apresentação). **SEM migration.** **ADR-0138.** A lógica de emissão (Server Actions, camada Asaas, idempotência, falha parcial, assincronia da NF, confirmação de produção) é **byte-idêntica** — provado por `git diff` (só `faturamento-corp.tsx` mudou; aba Cadastro e camada intocadas).

- **Tabela de revisão em dois momentos:** antes de emitir, a coluna **Cruzamento** mostra só o status (Pronta / Faltam dados fiscais / Não identificado); depois, o **resultado fica co-locado na coluna do próprio documento** — boleto na coluna Boleto (emitido + “ver boleto” / falhou / pulado), nota na coluna Nota (autorizada + “ver nota” / processando / falhou). Não-identificado de alto valor **destacado** (não some no rodapé). Valores à direita, tabulares; densidade menor; colunas de referência (Vencimento, Fatura Nº) mantidas.
- **Nota fiscal com rótulo curto + valor avulso inline:** o seletor mostra Normal / Avulsa / Não emitir; o valor avulso fica **na mesma linha** (altura constante, sem “pulo”); a explicação vive na legenda ao pé da tabela.
- **Ordem da tela = fluxo real:** upload → revisão (com os botões ao pé) → **resultado abaixo, só depois de emitir** (antes os painéis apareciam acima, invertidos).
- **Painel de resultado enxuto:** cartões de contagem (número em destaque) + **erros agrupados por motivo** (cada motivo uma vez, ex.: “Endereço do cliente incompleto · 6 faturas”) com **“Ver detalhes”** que expande as faturas afetadas (Pessoa · Fatura Nº · Valor), acessível (`aria-expanded`).
- **PT-BR em tudo:** removido o “NF synchronized” (status da NF mapeado para PT-BR — processando / autorizada / falhou / cancelada).
- **Controles mais claros na revisão:** o boleto virou um seletor **Emitir / Não emitir** (espelhando o da nota); a **nota fiscal já vem “Normal” por padrão** nas faturas prontas para NF; a coluna **“Cruzamento” passou a se chamar “Status”**; o botão **Atualizar status** (↻) migrou para o **cabeçalho da coluna Nota fiscal** (onde as linhas de status vivem), como ícone único; as larguras de coluna foram ajustadas (`table-fixed`) para o texto da coluna Nota **não escapar** da tabela; os botões **“Emitir boletos” / “Emitir notas fiscais”** ficam **lado a lado**, sem número no rótulo (o de boleto ganhou ícone).
- **Aba Cadastro de Clientes:** a coluna **OBS** virou **Observações**; o filtro de **origem** (Toda/Planilha/Manual) foi **removido**; a tabela abre já filtrando por **Ativos** (situação padrão); o **resumo (contagens) e os botões de ação** (Nova linha / Importar / Apagar) passam a ficar **na mesma linha** — resumo à esquerda, botões à direita.

## [4.33.0] — 2026-07-01

MINOR · **Faturamento Corporativo — Fase 3 (Cadastro de Clientes).** Traz a planilha paralela de clientes corporativos (241 clientes: situação, dias, regras, % juros/multa, destinatários) para a plataforma como **cadastro gerenciável** — rumo à base central de clientes. **ADR-0137 · migration 0164 (escrita aditiva).** Reusa a mecânica do Fluxo de Caixa Gerencial.

- **Estrutura de abas:** Faturamento Corporativo ganha duas abas — **Emissão** (Fases 1a/1b/2, **preservada byte-idêntica** — a emissão de boletos/notas segue idêntica) e **Cadastro de Clientes** (novo).
- **Cadastro gerenciável** (`app.cliente_corporativo`, RLS deny-by-default): tabela editável inline, filtro de origem (Toda/Planilha/Manual) + situação, Nova linha (manual), Importar, Apagar — reusando o padrão do Gerencial. **Import substitui só os de origem planilha e mantém os manuais**; reporta colisões com manuais e nomes repetidos na planilha (não quebra). **Nome único** (normalizado: trim + minúsculo + colapso de espaços) impede duplicados.
- **Cadastro é REFERÊNCIA (Visão A):** as regras (obs, juros/multa, dias) ficam registradas e legíveis; a plataforma **NÃO** as aplica automaticamente no faturamento (evolução futura). A Emissão não consome o cadastro nesta fase.
- **Destinatários como texto:** guarda a string concatenada ("email1; email2") do "ENVIAR PARA" (ignora as colunas EMAIL 1-6); o split é da Fase 4 (envio). Parser client-side (`parse-clientes-corp`, obrigatória EMPRESA).
- **Migration 0164 (aditiva):** `app.cliente_corporativo` + RPCs `SECURITY DEFINER` (importar/inserir/atualizar/excluir/apagar/listar) + `buscar_cliente_corporativo` (lookup read-only, scaffolding para a Fase 4). Auto-auditoria adversarial.

## [4.32.0] — 2026-07-01

MINOR · **Faturamento Corporativo — Fase 2 (emissão de NOTAS FISCAIS / NFS-e no SANDBOX).** Documento fiscal — irreversível, mesmo rigor do boleto. Diferença estrutural: a NF é **assíncrona** (solicitada → processando → autorizada em minutos). **ADR-0136 · migration 0163 (escrita aditiva).**

- **NF opcional por fatura, a partir da revisão:** controles na tela por linha — **Não emitir / Normal (valor = boleto) / Avulsa (valor próprio)**. Boleto segue sempre a base (Fase 1); a NF é um opcional por cima. Só faturas **prontas-NF** (CPF/CNPJ + **endereço + CEP**) habilitam a NF. O Asaas exige o **e-mail do tomador**: a plataforma completa o e-mail da base no cadastro do Asaas e, de forma permissiva, deixa o Asaas validar na emissão (o cadastro do Asaas pode já ter o e-mail). A **data de emissão** da nota é sempre **hoje** (o Asaas recusa data anterior à atual).
- **Idempotência com `-AVULSA`:** antes de criar, consulta o registro (`nota_existentes`) e o Asaas (`GET /invoices?externalReference=`). NF normal usa a `Fatura Cliente Nº`; NF avulsa usa `<ref>-AVULSA` — chaves separadas que não colidem. Reprocessar a mesma planilha não duplica (normal e avulsa tratadas em separado).
- **Assíncrona + refresh de status:** `createInvoice` + `authorizeInvoice` não deixam a nota pronta; a UI mostra “processando”. Um botão **Atualizar status** consulta o Asaas e, quando **AUTHORIZED**, grava número/PDF e mostra o link **“ver nota”** (abre o `pdfUrl`).
- **`ensureCustomer` estendido:** a NF exige endereço no cliente — o cadastro existente sem endereço é completado (PUT) com os dados da base de pessoas antes de emitir. O caminho do boleto (Fase 1) fica inalterado.
- **Campos fiscais fixos da Welcome** (do script legado): descrição de serviço, código municipal 9.02, ISS 5%, `deductions = value`, `effectiveDate` (Emissão → hoje). Vínculo **soft** ao boleto (`payment` XOR `customer`).
- **Migration 0163 (aditiva):** `app.fatura_nota` (`external_reference` UNIQUE com `-AVULSA`, modo, valor, status que evolui, pdf/xml/number, ambiente, quem/quando; RLS deny-by-default) + RPCs `registrar_nota` (UPSERT que não sobrescreve nota criada), `atualizar_status_nota` (refresh) e `nota_existentes`. Confirmação explícita, falha parcial e rastreabilidade como a Fase 1. Auto-auditoria adversarial. **Pendência (Fase 4):** entrega elaborada do PDF (download/anexo) — a Fase 2 entrega o link.

## [4.31.0] — 2026-06-30

MINOR · **Faturamento Corporativo — Fase 1b (emissão de boletos no SANDBOX + registro).** A funcionalidade mais sensível da plataforma — emite boletos de verdade via Asaas, ação irreversível sobre dinheiro. Toda esta entrega roda contra o **SANDBOX**. **ADR-0135 · migration 0162 (primeira de escrita-no-mundo).**

- **Emissão a partir da revisão (1a):** na tela de revisão, marca-se as faturas **prontas** e clica-se em **Emitir**. Por fatura: `ensure_customer` (acha por CPF/CNPJ → usa; por nome → completa; senão cria, com endereço da base de pessoas) → **idempotência dupla** → `criar_boleto` (BOLETO, multa 2% / juros 2%, descrição padrão) → **registro**.
- **Idempotência DUPLA:** (1) consulta `app.fatura_emissao_existentes` (nosso registro) e **pula** refs já emitidas; (2) `GET /payments?externalReference=<Fatura Cliente Nº>` no Asaas **antes** de criar. Rodar a mesma planilha 2× **não duplica** — provado no banco (reprocesso de sucesso retorna `id: null` e não sobrescreve).
- **Falha parcial: continuar e reportar.** Cada fatura é uma transação independente — uma falha não aborta as outras. Resultado: "M emitidos, J falharam (motivo), K pulados", com link do boleto por linha.
- **SANDBOX-first + ambiente sempre visível:** `ASAAS_BASE_URL` default = sandbox; produção só por env consciente (`api.asaas.com`). Badge de ambiente **sempre na tela**; produção exige **confirmação reforçada** (digitar "EMITIR"). A UI nunca decide nem mente o ambiente — vem do servidor.
- **Chave server-only:** camada `src/lib/asaas/` com `import 'server-only'` (build falha se vazar ao cliente); `ASAAS_API_KEY`/`ASAAS_BASE_URL` 100% do env (padrão SMTP). Sem chave → emissão indisponível com aviso claro, nunca quebra.
- **Migration 0162 (aditiva, escrita-no-mundo):** `app.fatura_emissao` (`fatura_cliente_no` UNIQUE = 2ª trava de idempotência; cobrado + retorno Asaas + ambiente + quem/quando + erro; RLS deny-by-default) + RPCs `registrar_emissao` (UPSERT idempotente, nunca sobrescreve sucesso) e `fatura_emissao_existentes` — ambas `SECURITY DEFINER` + `exigir_acesso('financeiro/faturamento-corp')`. Só boletos (NF/e-mail/download = fase 2). Auto-auditoria adversarial reforçada.

## [4.30.0] — 2026-06-30

MINOR · READ-ONLY: **Faturamento Corporativo — Fase 1a (pipeline + revisão, SEM Asaas).** Primeira metade da Fase 1 do Faturamento, deliberadamente sem emissão. **ADR-0134.** Aba nova em Financeiro sob a área RBAC própria e apertada `financeiro/faturamento-corp`.

- **Pipeline + tela de revisão:** importa a planilha crua de faturamento → cruza cada cliente (coluna `Pessoa`, trimada) com a base de pessoas via `buscar_pessoas` (v4.29.0) → classifica cada fatura (**pronta** / **faltam dados fiscais** / **não identificado**) → tela de revisão com resumo, status por linha e toggle "Emitir". **A fase TERMINA na revisão — nada é emitido.**
- **ZERO Asaas, ZERO escrita-no-mundo:** nenhuma chamada externa, nenhuma chave de API, nenhuma migration de escrita, nenhum botão que dispare. O cruzamento é read-only; a crua é processada no cliente (não persiste). A emissão de boletos (irreversível) é a Fase 1b.
- **Migration 0161 (aditiva):** área RBAC `financeiro/faturamento-corp` (grupo Financeiro), concedida só aos administradores; gate de `buscar_pessoas` estendido para o novo consumidor. **`Fatura Cliente Nº` preservado como TEXT** (será o `externalReference`/idempotência da 1b). UI no padrão (dropzone + spinner 2 fases, verde Corporativo). Auto-auditoria adversarial (4 céticos) verde.

## [4.29.0] — 2026-06-26

MINOR: **Base de Pessoas (Monde) + aviso de colunas obrigatórias na Atualização de Dados.** **Migration 0160 (aditiva) · ADR-0133.** Pré-requisito do Faturamento.

- **Base de Pessoas (nova):** ingere a `pessoas.xlsx` (cadastro fiscal do Monde, ~64k) como base persistida em `admin/uploads`. `raw.pessoas` com todos os campos **TEXT** — documentos (`cnpj`/`cpf`/`cep`/inscrições) preservam zero à esquerda (nunca numérico); `nome` com **TRIM**. Carga **full-replace atômica** (staging → validar → promover swap numa transação; aborta se vazia → base nunca fica vazia), parse client-side em **Web Worker** (lotes de 500). Validação = **17 colunas presentes no cabeçalho** (não exige célula preenchida — a maioria vem vazia, e isso é esperado). RPC read-only `buscar_pessoas` (lookup por nome, para o Faturamento).
- **Aviso de colunas obrigatórias (transversal, 5 bases):** helper compartilhado `validarColunasObrigatorias` — cada importação avisa claramente as colunas obrigatórias antes de processar, com mensagem amigável. **Não-regressão garantida:** o aviso ESPELHA o que cada parser já exigia (lista derivada do código), sem mudar o que cada base aceita/rejeita; Vendas segue tolerante. Auto-auditoria adversarial (4 céticos) verde, com foco na não-regressão das 4 bases existentes.

## [4.28.0] — 2026-06-24

MINOR: **Calculadora de Rateio (Financeiro) — capacidade nova, READ-ONLY.** Aba nova no sidebar de Financeiro (sob a permissão `financeiro/gerencial`): importa uma **fatura xlsx**, cruza cada `Venda Nº` com a base de vendas (`analytics.vw_vendas_agregadas`), busca o **Setor Macro** e **rateia o valor por setor** (proporcional, linha a linha, com sinal). Só exibe — **não grava nada**.

- **Migration 0159 (aditiva):** RPC `public.cruzar_vendas_setor(text[])` `SECURITY DEFINER` read-only sobre a view (`analytics` não é exposto pela API), com `exigir_acesso('financeiro/gerencial')` + `GRANT authenticated`. **ADR-0132.**
- **Invariante:** o setor lógico usa o valor REAL da base (**`Lazer`**); a conversão **`Lazer`→`Trips` é só na exibição** — cruzar por "Trips" jogaria toda venda de lazer em "Não identificado".
- **Fechamento de conta:** `Corporativo + Trips + Weddings + Não identificado = total da fatura` (partição por construção; "Não identificado" sempre visível com valor).
- Parse client-side com `@e965/xlsx` (fatura ~41 linhas, sem Web Worker; o arquivo não sobe ao servidor — só os números distintos viajam); coerção canônica (`toNum`); detecção de coluna por nome exato `Venda Nº`/`Valor`. Reusa primitivos/cores do DS (`SETOR_COLORS`). Auto-auditoria adversarial (6 céticos) verde nos 6 invariantes.

## [4.27.4] — 2026-06-25

PATCH: **Botão "Acessar a plataforma" do e-mail de acesso/senha — render correto no Outlook.** O e-mail de senha provisória (criação/reset) renderizava o CTA como "texto com fundo preto apertado" no Outlook, porque o `padding` estava no `<a>` (que o Outlook ignora). Movido o `padding` para a **célula `<td>`** (`bgcolor` + `padding:14px 34px` + `border-radius:12px`), igual ao botão do e-mail de Solicitações (v4.25.1) — botão retangular de verdade. **SEM migration, sem ADR.** Só `src/lib/email/template.ts`.

## [4.27.3] — 2026-06-24

PATCH: **Responsividade ao clique — INP do card de KPI principal (Weddings).** O clique no card de KPI principal de `/performance/weddings` (abre o drawer rico) media **INP ≈ 1840ms**. Aplicado o **lever nº1**: abrir o `KpiPrincipalDrawer` dentro de `useTransition` (`weddings-kpis-section`), tirando o mount síncrono do overlay (`fixed inset-0` + `overflow:hidden` → reflow) do frame de resposta ao input. **Muda QUANDO renderiza, não O QUE — visualmente idêntico.** Escopo estreito (só o card de Weddings, pior caminho medido). **SEM migration, sem ADR.** A medição INP antes/depois (navegador real) decide se a fase 2 (levers 2–3) é necessária — `<200ms` fecha o patch. Diagnóstico prévio (workflow adversarial) **refutou** a hipótese de re-render dos gráficos da página.

## [4.27.2] — 2026-06-24

PATCH: **Higiene de lint — zera os 12 achados react-hooks pré-existentes.** Eram do bump do `eslint-plugin-react-hooks@7.1.1` (ruleset do React Compiler), idênticos no `main`; `npm run lint` volta a ficar **100% verde**. **SEM migration, sem ADR.** Comportamento observável preservado (conferência visual do Yan nos 2 itens de risco — renderização idêntica confirmada).

- **2 triviais** (`no-unused-vars`): remove `_name` (arg não-usado do formatter Recharts) e `isHoje` (const morta).
- **8 seguros:** `set-state-in-effect` de fetch (`weddings-mix`, `calendario-liquidez`, `kpi-principal-drawer`) → `loading` **derivado** de uma chave "última carregada" (sem `setLoading` síncrono no efeito; durante refetch segue mostrando os dados anteriores); init de mount do `kpi-principal-drawer` → **initializer** de `useState`; popover de período (`periodo-filter` + `-pills-url`) → inputs semeados no **handler de abrir**; carga de status do upload → **IIFE async** (setState após `await`); `immutability` da projeção agregada → soma acumulada por **prefix-sum** (sem reassignar `let`).
- **2 com checkpoint** (`static-components`, `sumario-subsetor`): o `Wrapper` definido no render (que remontava a subárvore a cada render) foi **hasteado para o módulo** (`semBox` por prop). Conteúdo stateless → saída idêntica; **conferido visualmente** nos dois drawers de Weddings que o usam.

## [4.27.1] — 2026-06-23

PATCH: **Backup-gate — EOF aborta migration destrutiva (fail-open) + heurístico com tokenizer.** Tooling de infra (`scripts/db-gate/`). **SEM migration de schema, sem mudança no app.** **ADR-0131** (estende 0116/0119).

- **M1 — EOF-abortar (segurança):** a confirmação de migration destrutiva passa a ser **do wrapper** (`migrate.mjs`), com **default ABORTAR** em stdin não-TTY/EOF (headless/pipe/CI). Antes o ramo destrutivo delegava ao prompt do `db push` (`stdio:'inherit'`), cujo default headless **prossegue** = fail-open; a segurança dependia do harness externo. Agora o EOF é barrado pelo **próprio código**, antes do gate. TTY → prompt explícito; aditiva → auto-confirma (inalterado). Provado live: `--destrutiva </dev/null` aborta (exit 1) sem rodar o gate.
- **M2 — heurístico com TOKENIZER (top-level):** a classificação de "destrutiva" deixa de ser uma regex sobre o texto cru e passa por um **tokenizer** (`scripts/db-gate/classificar.mjs`) que excisa comentários, strings e corpos dollar-quoted (`$$…$$`, `$tag$…$tag$`, tags custom/aninhadas) e casa só o **top-level**. Fim dos falsos-positivos de DML no corpo de função: `0150`/`0153`/`0156` → aditiva, `0154` → warn (troca de assinatura); `0149` (UPDATE top-level real) e DROP/TRUNCATE/`ALTER…DROP` reais **seguem barrados**. **Falha fechada** (→ destrutiva) em corpo/comentário não fechado — nunca esconde um DROP top-level.
- **Sonda** `scripts/db-gate/classificar.test.mjs` (30 casos, em `npm test`): 0149..0158 reais + adversarial (`DROP TABLE` top-level junto de `$$` com DML dentro → destrutiva) + fail-closed + os 3 caminhos do EOF. `vitest.config` passou a incluir `scripts/**/*.test.mjs`.

## [4.27.0] — 2026-06-23

MINOR: **Coerção numérica — convergência ao canônico + guard-rail (lint).** Sem migration, sem frente de dado (o traçado provou integridade: `raw.vendas_excel` = R$ 182,6 mi, batendo com `mv_vendas_diarias`). **ADR-0130** (operacionaliza a regra do `coercao.ts`; cita ADR-0099 e o bug v4.23.1). Irmã das guard-rails de cor (v4.26) e de var (v4.17).

- **M1 — Vendas:** `vendas-parser.ts:toNumStr` (o **único `parseFloat`** do app) → `toNum` canônico de `@/lib/carga/coercao`, mantendo o retorno `string|null` (paridade do staging `::numeric`). O caminho vivo entrega número nativo → saída idêntica; ganha robustez no caso de string BR com milhar, que o `toNumStr` ingênuo (`Number(String(v).replace(',','.'))`) corrompia (`"8.840,00"` → `8.84`).
- **M2 — `toNum` estendido + Gerencial converge:** o `toNum` passa a tratar **negativo entre parênteses** (`"(1.000)"` → `-1000`), convenção contábil, **preservando toda a lógica atual** (o invólucro é detectado antes da desambiguação BR/US; `coercao.test.ts` existente passa sem alteração, casos do parêntese entram como adição). `gerencial/parser.ts` converge ao `toNum` e o **`parseValorMonetario` é removido** (2º parser de dinheiro). Não-regressão provada por **oráculo congelado** (`parseValorMonetarioLegado`): concorda com o parser antigo em todo formato real de moeda. **Mudança semântica do parêntese vale platform-wide** (só afeta entradas `(x)`, que antes davam `null`).
- **M3 — Lint `wt/no-coercao-reimpl` (AST) + sonda:** regra `error` em `src/**/*.{ts,tsx}` que mira **(1)** `parseFloat`; **(2)** `.replace` de separador na **direção número** (alimenta `Number`/`parseFloat` ou em função `:number` — o guard evita o sanitizador de `<input>` e o `toFixed().replace`); **(3)** definir função/const com nome de coerção, exceto formatadores (`BRL`/`format`). Isenta `coercao.ts`/`**/*.test.ts`/`src/lib/email/**` via `files:` override. **Sonda** (`RuleTester` + vitest, 14 casos) prova o disparo no padrão do bug e o silêncio nos benignos. Ligada **só depois** de M1/M2 (2 violações zeradas) → lint verde.

## [4.26.0] — 2026-06-23

MINOR: **Base do Design System — consolidação, guard-rails e biblioteca de primitivos.** Sem migration (frontend/tooling). **ADR-0129** (operacionaliza o 0103). Empreitada em duas fases (A: base anti-regressão → checkpoint → B: primitivos). Invariante: **consolidar a referência, não mudar o pixel.**

### Fase A — base anti-regressão
- **Cor de setor 4→1**: `tokens.css --setor-*` vira a fonte única; os 3 gráficos hardcoded (historico-12m, RitmoDiario, HistoricoMensal) e `mix-setor-chart`/`mix-setor-table` passam a referenciar `SETOR_COLORS` (config). O DB `dim_setor_macro.cor_hex` deixa de renderizar (valores idênticos → pixel intacto).
- **`@theme` expõe** positive/negative/neutral, action-*, gestao*, setor-*, subsetor-*, chart-* como utilitárias. **Micro-texto** `--text-2xs` (11px)/`--text-3xs` (10px). **Removido o `--primary` azul legado** (`#2563eb`): ênfase → `--brand-deep`, série principal → `--brand`.
- **~126 cores cruas → tokens** (emerald/green→success, red→danger, amber/yellow→warning, blue de plataforma→action-*/focus-ring); auth `#1A1814`→`var(--text-primary)` (correção: o token é `#2D2A26`). ZINC intocado (follow-up).
- **Guard-rails (ADR-0129):** lint **`wt/no-cor-hardcoded`** (cor crua do Tailwind + hex em classe = erro; zinc permitido; `src/lib/email` isento) + `tokens.test.ts` (protege a fonte da verdade). Reforço no CLAUDE.md.

### Fase B — biblioteca de primitivos
- **Primitivos canônicos** em `src/components/ui/`: `Button` (variantes sólido/contorno/ghost/ícone/ícone-borda/livre), `Input`/`Select`/`Textarea` (envolvem `CAMPO`/`CAMPO_COMPACTO`), `Badge` (success/danger/warning/brand/gestao/neutro/count), `Tabs` (ARIA tablist), `Tooltip` (dica de UI). Cores via token, foco `.foco-neutro`.
- **Dedups (byte-equivalentes):** `PILL_BASE` local (5×) → `PILL_FILTRO*` em `shared/botoes`; `ICON_BTN`/`ICON_NEUTRO`/`ICON_PERIGO` (2 arq.) → `<Button variant="icone-borda">`; badge de contagem (2×) → `<Badge variant="count">`; campos `CAMPO`/`CAMPO_COMPACTO` → `<Input>`/`<Select>`/`<Textarea>`. Micro-texto `text-[11px]`/`text-[10px]` → `text-2xs`/`text-3xs` (px, byte-equivalente).
- **Cheiros:** `FaixaMensagem` e `botoes.ts` movidos `admin/acessos/` → `shared/`. Página `/admin/design-system` e `docs/design-system.md` ressincronizados (`--text-primary #2D2A26`, temas Trips/Corp corretos, primitivos novos).
- One-offs heterogêneos e o tema de tabs do gerencial ficam como estão (não exato-casamento — go-forward usa os primitivos).

## [4.25.1] — 2026-06-23

PATCH: **Refino visual do e-mail de notificação de Solicitações** (introduzido na v4.25.0) + **faixa "Administração" colada ao topo**. Migration aditiva (0158, `CREATE OR REPLACE`). Refina ADR-0128 — sem ADR novo.

- **`solic_emails_envolvidos` agora devolve NOMES e DATAS** (0158): `autor_rotulo` e `atribuido_rotulo` = nome do usuário (`coalesce(nullif(btrim(nome),''), email)`) ou nome da role — não mais e-mails crus (que renderizavam como links `mailto:` azuis); `criado_em_fmt`/`decidido_em_fmt` = `'DD/MM/AAAA às HH:MM'` no fuso de São Paulo (`to_char(... AT TIME ZONE 'America/Sao_Paulo')`). Mantém o gate `pode_ver_solic` e o oráculo de existência fechado (RAISE único `NAO_ENCONTRADA`/42501) herdados da 0157.
- **Layout do e-mail revisto** (`template.ts`): removida a saudação "Olá,"; **data/hora da movimentação** sob o título ("Solicitação criada · 23/06/2026 às 10:04"); **badge de status colorido por movimentação** (criada=dourado `#BD965C`, concluída=verde `#5F7A3D`, rejeitada=vermelho `#A35442`, **cancelada=cinza `#75777B`** — variante nova) com faixa lateral; **botão real** "Acessar a plataforma" com padding na **célula** da tabela (corrige o "tarjado apertado"); "Atribuída a **{nome}**, por **{nome}**" em negrito, **sem a palavra "permissão"**.
- **Badges da página Movimentações** (`movimentacoes-content.tsx`) **alinhadas à mesma paleta** de status para coerência visual com o e-mail: Abertura→dourado, Conclusão→verde, Rejeição→vermelho, **Cancelamento→cinza** (era âmbar/warning).
- **Camada/contrato ajustados** ao novo shape: `emailsEnvolvidosSchema` (Zod), `enviarNotificacaoSolicitacao`/`templateNotificacaoSolicitacao` (param `quando`, sem `atribuidoTipo`), `notificarMovimentacao` (deriva `quando` de criado/decidido). Testes de e-mail atualizados (cancelada cinza, sem "permissão", data no corpo).
- **Cantos arredondados** do card de status, do botão e da caixa de justificativa do e-mail (8px → 12px).
- **Faixa "Administração" alinhada ao topo da tela** (`admin/layout.tsx`): `-mt-8` cancela o `padding-top` do `<main>` do AppShell, removendo o gap vertical estranho acima da faixa. Vale para todas as páginas `/admin/*` (Usuários e Acessos, Solicitações, Design System, Upload de Arquivos). Respiro inferior preservado.

## [4.25.0] — 2026-06-22

MINOR: **Notificações por e-mail nas movimentações de Solicitações (tarefas).** Migration aditiva (0156 + 0157). ADR-0128.

- **RPC `solic_emails_envolvidos`** (0156/0157, `SECURITY DEFINER`, gated por `app.pode_ver_solic`): dada uma solicitação, resolve os e-mails dos envolvidos (autor + destinatário usuário OU todos os membros **ativos** da role) + contexto. **Não vaza diretório** (só os e-mails daquela solicitação, só a quem a vê); born-hardened (anon nunca). 0157 colapsa o erro de "não existe"/"não pode ver" (fecha o oráculo de existência — auto-auditoria adversarial).
- **`enviarNotificacaoSolicitacao`** (`src/lib/email/`): e-mail único factual para **todos os envolvidos** (quem age também recebe), parametrizado por criada/concluída/rejeitada/cancelada (justificativa só na rejeição); **fan-out best-effort** (`Promise.allSettled`, a falha de um não derruba os outros), **nunca lança**. Reusa transporter/logo/`getAppBaseUrl` da v4.24 (template Outlook-safe). Link → caixa `/solicitacoes`.
- **Plugado nas 4 movimentações** (`solicitacoes/actions.ts`) **após** a persistência, em try/catch **fallback-safe** — o e-mail jamais quebra a movimentação.
- **+10 testes** (template ×4 movimentações + fan-out best-effort/dedupe/never-throws). Verificação adversarial no banco (gate `pode_ver_solic`, fan-out de role, oráculo fechado).

## [4.24.2] — 2026-06-22

PATCH: **Revisão visual do e-mail de senha (layout, logo, responsividade).** Sem migration, sem ADR.

- **Logo transparente e centralizado** (`logo.ts`): o `welcome-group.png` tinha fundo preto baked-in (`hasAlpha:false`) → caixa preta no Outlook. Agora rasterizado do `welcome-group.svg` (vetor, sem fundo) via `sharp` → PNG transparente; centralizado por tabela (`align`).
- **Botão "Acessar a plataforma" real** (`template.ts`): reconstruído como **célula de tabela** (`bgcolor` + link) — o Outlook ignora `background` em `<a>` inline (antes aparecia como texto cru).
- **Layout em tabelas + inline**, hierarquia e espaçamento revistos, **divisória cinza** (era dourada), **sem negrito** em "definir uma nova senha no primeiro acesso".
- **Responsivo:** cartão fluido (`width:100%`/`max-width:480px`) + `<style>` media query (≤480px reduz respiro lateral e a fonte da senha); `word-break` na senha.

## [4.24.1] — 2026-06-22

PATCH: **Refinos visuais (cosmético).** Sem migration, sem ADR.

- **E-mail de senha:** logo Welcome Group no topo (embutido via CID — attachment, compatível com Outlook; substitui o título tipográfico "WT FINANCE") + botão "Acessar a plataforma" (URL de `APP_BASE_URL`/`VERCEL_PROJECT_PRODUCTION_URL`, nunca hardcoded; omitido se ausente). `src/lib/email/{logo,config,template,index}.ts` + `email.test.ts`.
- **Projeção do Gerencial** (`visualizacao-agregada-tab.tsx`): cores de valor positivo/negativo de `--positive-deep`/`--negative-deep` (quase pretos) → tokens base `--positive`/`--negative` — nítidos e legíveis sobre branco E sobre as faixas claras (`bg-success-bg`/`bg-danger-bg`). Só a cor muda; a matemática é idêntica.
- **TopSection** (`top-section.tsx`): cantos `rounded-xl` (= raio dos cards) + `overflow-hidden` — propaga a todas as telas que usam a barra de seção.
- **Verdes/hover da identidade:** hover da caixa de solicitação (`.card-clicavel-neutra`) com `--action-soft-border` (cinza suave) em vez do `--action-primary` (charcoal); bolinha de concluir (`board-solicitacoes`) e toast de sucesso (`FaixaMensagem`) alinhados ao token `success` (= badge "Ativo"), não emerald.

## [4.24.0] — 2026-06-22

MINOR: **Envio da senha provisória por e-mail no fluxo de acesso (criação + reset administrativo).** Sem migration. ADR-0127.

- **Camada de e-mail reutilizável** (`src/lib/email/`, server-only): `config.ts` lê `SMTP_*` de `process.env` (fallback-safe — retorna `null` sem config, nunca lança); `template.ts` gera o e-mail de senha provisória (criação/reset, identidade sóbria, estilos inline, sem imagem externa); `index.ts` `enviarSenhaProvisoria()` usa `nodemailer` com timeout curto (~10s) e **retorna `boolean`, nunca lança**. Dep nova: `nodemailer`. Chaves `SMTP_*` no `.env.example` (só as chaves).
- **Plugada na criação e no reset** (`actions.ts`): `criarUsuario`/`resetarSenha` chamam a camada em try/catch e estendem o retorno com `emailEnviado`. As 3 UIs (`modal-convidar`, `aba-usuarios`, `aba-solicitacoes`) exibem a senha **sempre** + aviso (enviada por e-mail | envio falhou — copie e repasse). O destinatário do reset vem do registro do Auth, não de input do cliente.
- **Fallback-safe (invariante central):** SMTP indisponível/erro/config ausente → criar e resetar continuam e a senha segue exibida (copiável). **Zero hardcode** de credencial/remetente — só `.env.local`/Vercel. As `SMTP_*` precisam estar também na Vercel: runbook `docs/runbooks/v4-24-email-runbook.md`.
- **Teste** `email.test.ts`: template criação×reset, escape de HTML do nome, config fallback, envio fallback/sucesso/erro (SMTP mockado).

## [4.23.3] — 2026-06-19

Patch: **Ajustes finos do drawer de importação + persistência dos filtros do Fluxo de Caixa Gerencial.** Sem migration.

- **Negritos do texto do drawer normalizados** (`import-drawer.tsx`): a 2ª parte em negrito usava `font-semibold` + cor `--text-secondary` (vinha dos `*…*` do prompt); agora é `<strong>` igual à 1ª (mesmo peso e cor `--text-muted`).
- **Linhas duplicadas listáveis** (`import-types.ts` + drawer): além de informar a contagem, o aviso de duplicatas vira **expansível** e mostra **quais** linhas duplicam, no mesmo formato de tabela das outras listas (acordeão, 1 aberta por vez). O diff passou a devolver `duplicatasLinhas` (as ocorrências repetidas).
- **Números dos grupos do preview menos desproporcionais** (`import-drawer.tsx`): as contagens de "A adicionar/atualizar/manter/remover" caíram de `text-lg` para `text-sm` — proporcionais ao rótulo.
- **Filtros da Base de Dados persistem ao trocar de aba** (`gerencial-section.tsx`): as abas "Visualização Agregada" e "Base de Dados" ficam ambas montadas (alternadas por `hidden`); ir para a Agregada e voltar não zera mais os filtros de coluna nem as pills.

## [4.23.2] — 2026-06-19

Patch: **Ajustes de UI do Fluxo de Caixa Gerencial + correção do salto de layout ao recolher seção (plataforma inteira).** Sem migration.

- **Box "Contas" recolhível** (`contas-cards.tsx`): chevron ao lado do título "CONTAS" (igual à barra `TopSection`), recolhe/expande a grade de cards. Padrão = aberto; "Gerenciar contas" continua no cabeçalho.
- **Salto de layout ao recolher seção — corrigido na plataforma inteira** (`app-shell.tsx`): o `<main>` (único scroll container) ganhou `scrollbar-gutter: stable`. A goteira da barra de rolagem fica reservada sempre, então o conteúdo centralizado (`mx-auto`) não desloca lateralmente quando a barra some/aparece — ao recolher/expandir um `TopSection` (Gerencial, Weddings, etc.) ou trocar para uma página mais curta. Convenção registrada no CLAUDE.md (§ Convenções de código) para não recorrer.
- **Popover "Personalizado" de vencimento** (`base-dados-tab.tsx`): passou a ser **clampado ao viewport** (horizontal + abre para cima se não couber abaixo) — não escapa mais das bordas; e ficou **mais largo** (340px, estendendo para a esquerda) para os dois campos de data não ficarem apertados/cortados.

Patch: **Ajustes do Fluxo de Caixa Gerencial — correção crítica do saldo, refino da base de dados, da projeção e do drawer de importação.** Migration 0155 (aditiva).

### Correção crítica (item 11)
- **Saldo dos cards parava de mostrar os centavos e corrompia ao editar.** O card exibia `fmtBRL` (0 casas → "105.993" em vez de "105.993,35"); ao clicar, semeava o input com `String(105993.35)`="105993.35" e o `parseNum` LOCAL tratava o ponto como milhar → salvava **10599335** (10 milhões). Corrigido: exibe `fmtBRL2` (centavos), parse pelo `toNum` **canônico** (`@/lib/carga/coercao`) e semeia o input em vírgula-decimal 2 casas (`toFixed(2)`) — round-trip à prova de ruído de float. Entrada inválida (ex.: "abc") reverte em vez de zerar o saldo.

### Base de Dados (itens 1–3)
- Removidas as **pills de tipo** (Todos/A receber/A pagar) e a **busca por pessoa** do topo — redundantes com os filtros nas colunas Tipo e Pessoa.
- As **badges de Tipo** ganharam cor: **A pagar** vermelho, **A receber** verde (mesma semântica do valor; tokens do DS).
- O botão de exclusão virou **largura fixa** à direita de Importar, alternando o rótulo: **"Apagar todos"** ou **"Apagar selecionados"**. **"Apagar todos"** (nada selecionado) **respeita o filtro de origem** — Toda origem = base inteira; Planilha/Manual = só aquela origem. Trocar o filtro de origem **reseta a seleção**. Exclusão sempre sob confirmação.

### Projeção Diária (itens 9–10)
- Nova linha-âncora **"Saldo inicial"** no topo (acima de hoje): A Receber/A Pagar/Resultado em traço (—) e as colunas de saldo mostrando a abertura de Itaú, Consolidado e Consol.+reserva.
- Colunas renomeadas: **"Resultado do Dia"** e **"(Final)"** nas três colunas de saldo (Saldo Itaú (Final), Consolidado (Final), Consol.+reserva (Final)) — distinguindo do "Saldo inicial".

### Drawer de importação (itens 4–8)
- Coluna **Valor** compacta + tabelas `table-fixed` → sem rolagem horizontal (a última coluna não é mais cortada).
- O controle **"Manter duplicadas"** só aparece **quando há duplicatas na planilha**, e informa quantas foram detectadas.
- Título **"Importar lançamentos"** / subtítulo "Importa a planilha de lançamentos curada manualmente".
- As **instruções** (substituição da importação anterior + manuais preservados) aparecem desde o início (etapa de upload), não só no preview.
- **Lançamento manual nasce destacado** (lata-de-tinta ligada) — migration 0155 (`create_gerencial_lancamento` carimba `destacado` para origem manual).

## [4.23.0] — 2026-06-18

Minor: **Importação do Fluxo de Caixa Gerencial sincroniza por fatia do originador, com dedup e preview navegável.** Migration 0154 (aditiva). ADR-0126.

### Sincronização por fatia (ADR-0126)
- A importação deixou de sincronizar contra **todas** as linhas `origem='planilha'` e passa a sincronizar **apenas a fatia do próprio importador** (linhas cujo `originador = ele`). Antes, dois importadores apagavam as linhas um do outro: cada `batch_gerencial_import` removia toda linha de planilha ausente da sua planilha, inclusive as do colega. **Invariante:** importar como A nunca adiciona/altera/remove linha de outro originador — provado com teste vivo de duas fatias (B byte-idêntico mesmo com os ids de B injetados adversarialmente em remover/atualizar).
- **Dupla barreira:** a rota escopa a fatia por `sessao.userId` (linha do colega nunca entra no diff) e o `DELETE`/`UPDATE` do `batch_gerencial_import` reforça com `AND originador_id = p_originador_id` (backstop no banco). Linhas antigas sem originador (NULL) não pertencem à fatia de ninguém → nunca removidas pela sincronização.
- A sincronização opera por **contagem** de linhas idênticas, não por presença: 2 na planilha + 2 na fatia = mantém 2; planilha cai para 1 → remove 1; sobe para 3 → adiciona 1.

### Coluna Originador (M1)
- Nova coluna **Originador** (só leitura) na base, após Vencimento, com filtro por nome. `analytics.gerencial_lancamentos` ganhou `originador_id`/`originador_nome` (migration 0154, aditiva, backfill NULL → "—"). A importação e o "+ Nova linha" carimbam o usuário da sessão.

### Dedup por linha idêntica + toggle (M3)
- Identidade de **6 campos normalizados** (tipo, pessoa, valor, descrição, conta, vencimento; trim/caixa/acento — reusa `normalizarChaveConta`). Toggle **"Manter duplicadas"** no preview: desligado (padrão) colapsa idênticas dentro da planilha; ligado mantém as duas (duplicatas reais).

### Preview navegável (M4)
- Preview com 4 grupos (**adicionar/atualizar/manter/remover**) expansíveis em formato de tabela, acordeão (1 por vez); **"a remover" aberto por padrão** com **proteção pontual por linha** (desmarcar = não remover neste commit; reaparece na próxima importação, não vira manual). Os outros 3 grupos são só leitura.

### Notas
- **Agregada intocada:** esta versão mexe na ingestão; as 3 projeções sobre saldo inicial e o cálculo do fluxo não mudam.
- Endurecimentos da auto-auditoria: chave de centavos consistente (arredonda antes de formatar), `tipo` normalizado na chave lógica, contagem honesta de `atualizados` (`GET DIAGNOSTICS`).

## [4.22.4] — 2026-06-18

Patch: **drawer "Gerenciar contas" — reordenação por arrastar-soltar + confirmação do "adicionar" abaixo da tabela.** Migration 0153 (RPC de reordenação).

- **Reordenar contas (drag-and-drop):** cada linha ganhou um **puxador** (`GripVertical`) na borda esquerda — arraste para reordenar. A ordem das linhas define a **ordem dos cards na Visualização Agregada**, persistida atomicamente via RPC `reordenar_gerencial_contas` (DnD nativo HTML5; reorder otimista + `router.refresh`).
- **Botões do "adicionar" abaixo da tabela:** ao adicionar uma conta, os botões **Salvar/Cancelar** passaram para o **canto inferior direito, abaixo da tabela** — antes os ícones ✓/✕ ficavam espremidos na coluna estreita de ações, sobrepondo-se ao seletor de Papel.

## [4.22.3] — 2026-06-18

Patch: **selos das contas no rodapé do card + cores por papel; correção das datas do changelog da diretoria.** Sem migration.

### Cartões de contas (Fluxo de Caixa Gerencial)
- Os selos do card foram para o **rodapé, à esquerda**, na ordem **papel → "Consolidado"**: "Consolidado" deixou o canto superior direito e passou a acompanhar "Principal"/"Rendimento" embaixo (`mt-auto`).
- Cores por **token** do design system: **"Principal"** usa o âmbar de gestão (mesmo trio dos botões de Solicitações — `--gestao-soft`/`--gestao`/`--gestao-fg`); **"Rendimento"** usa verde (`--success-bg`/`--success`/`--positive-deep`); "Consolidado" segue neutro (zinc).
- Subtítulo do drawer "Gerenciar contas" enxugado para "Configure limite, consolidação e papel de cada conta" (sem ponto final).

### Correção das datas do `CHANGELOG_DIRETORIA`
- As datas/horas de **v4.11.0 a v4.22.2** estavam **aproximadas/redondas** (digitadas à mão antes do merge e nunca reconciliadas). Corrigidas para o **horário real do merge** (de `git log --merges`, fuso −03). As de v4.0.0–v4.10.1 já estavam corretas. Convenção reforçada no `CLAUDE.md` e no header do arquivo: a `data` vem do git, nunca uma hora redonda chutada.

## [4.22.2] — 2026-06-17

Patch: **Correção de fuso horário em TODA a plataforma — "hoje"/"este mês" agora em São Paulo.** Migration 0152 (aditiva). ADR-0125.

- **Causa-raiz:** a sessão do banco roda em UTC, então `CURRENT_DATE`/`now()::date`/`date_trunc('month', CURRENT_DATE)` em ~15 RPCs + 1 view usavam o "hoje" de UTC — adiantado em um dia a partir das ~21h de São Paulo. Afetava calendário de liquidez ("é hoje"), próximos lançamentos/casamentos, KPIs do mês/ano corrente, idade de vendas em aberto, cortes de mês de Weddings/Performance, classificação "a vencer", além da projeção do Gerencial (já corrigida pontualmente na 0151).
- **Fix sistêmico:** `ALTER ROLE anon|authenticated|service_role SET timezone = 'America/Sao_Paulo'`. O PostgREST aplica o `rolconfig` do papel por requisição (mesmo mecanismo do `statement_timeout`), então `CURRENT_DATE`/`now()` passam a refletir SP em **todas** as RPCs — atuais e futuras. **Reversível** (`RESET timezone`); o papel `postgres` (migrations/seed) **não** foi alterado.
- **Sem regressão** (auditado): `timestamptz` continua o mesmo instante (o app já converte por `Intl`); `to_char`/texto de coluna DATE é independente de fuso. Auditoria das definições vivas + revisão adversarial em 3 dimensões → zero regressão.

## [4.22.1] — 2026-06-17

Patch: **Fluxo de Caixa Gerencial — ajustes de UX nos cards de saldo e na projeção diária + correção de fuso no "hoje".** Migration 0151 (aditiva).

- **Cards de saldo:** o cabeçalho "Contas" e o botão "Gerenciar contas" passaram para **dentro** do box dos cards; cada card ganhou a legenda **"Saldo"** (cinza discreto, `--text-subtle`) acima do valor.
- **Projeção diária — data inicial:** seletor de **data inicial** no topo do box, com padrão **dinâmico = hoje** (a 1ª data vinda do servidor; acompanha a virada do dia). O saldo acumulado continua correndo desde hoje — a seleção apenas **fatia a janela exibida**.
- **Projeção diária — horizonte:** dropdown **15 (padrão) / 30 dias**. As páginas passam a buscar uma janela de 60 dias; a UI fatia por data inicial + horizonte (sem nova chamada ao servidor).
- **Cor condicional:** os 3 saldos da projeção passam a ter **texto** verde (≥ 0) / vermelho (< 0), somado ao fundo de faixa; A Receber (verde), A Pagar (vermelho) e Resultado (por sinal) seguem como antes — todo valor monetário fica colorido.
- **Correção de fuso — "hoje" da projeção (migration 0151):** a projeção usava `CURRENT_DATE`, avaliado em **UTC** pela sessão do banco — no fim da tarde de São Paulo (UTC−3) isso já era o dia seguinte, então a projeção (e o seletor de data inicial) começava em "amanhã". Agora a RPC `get_gerencial_projecao_diaria` deriva o dia corrente de `America/Sao_Paulo` (`(now() AT TIME ZONE 'America/Sao_Paulo')::date`). `CREATE OR REPLACE`, aditiva.

## [4.22.0] — 2026-06-17

Versão MINOR: **Fluxo de Caixa Gerencial — refinamentos de UX, formato contábil e normalização de contas.** Migrations 0149 (normalização de `conta_previsao`) e 0150 (destaque persistente). ADR-0124. **Modelo da agregada INTOCADO** — `conta_previsao` continua irrelevante para a projeção (verificado por checksum antes/depois).

### Saldos em cards + painel de gestão (M1)
- Os saldos iniciais das contas saíram da tabela de gestão e viraram **cards** sempre visíveis na Visualização Agregada (`contas-cards.tsx`), com edição **inline apenas do saldo** (caminho otimista `updateConta` + `router.refresh`) e selo informativo do papel/consolidado.
- "Gerenciar contas" virou um **painel** (botão engrenagem → `ListDrawer`) com a configuração estrutural — limite, consolidado, papel e CRUD — **sem** a coluna de saldo (que agora vive nos cards).

### Nomenclatura + badges por token (M2)
- Papéis renomeados na UI: **"isolada" → "Principal"**, **"reserva" → "Rendimento"** (`PAPEL_LABEL` em `tipos.ts`; a chave do banco — `isolada`/`reserva` — permanece). Badges usam **tokens do design system** (`--action-soft` para Principal, neutro zinc para Rendimento), sem hex.

### Formato contábil (M3)
- Novo componente único `@/components/shared/valor-contabil` (`<ValorContabil>`): **"R$" ancorado à esquerda** e **número à direita** (extremos opostos), **com centavos** e `tabular-nums` — dígitos alinhados entre linhas. Aplicado na projeção agregada e na base. Documentado no Design System (§7) e no CLAUDE.md.

### Cores na célula (M4)
- A faixa de cor passou a preencher o **fundo da célula** (`<td>`) do saldo (corrige a v4.21, que só pintava o texto): Principal com limite = 3 faixas (`--danger`/`--warning`/`--success`); Principal sem limite, Consolidado e Consol.+Rendimento = 2 faixas. Os **fluxos** (A Receber/A Pagar/Resultado) mantêm cor só no número.

### Base: layout, responsividade e filtros (M5)
- Linha sem quebra; Pessoa/Descrição encurtadas + `truncate` com nome completo no hover (`title`); Valor à direita em formato contábil; **origem** deixou de ser coluna e virou **ícone discreto** na célula Pessoa; `table-fixed` + `min-w` com rolagem horizontal em telas estreitas.
- **Filtros por coluna** client-side (Pessoa, Valor ≥, Descrição, Conta, Vencimento), aditivos à busca geral e às pills de Tipo/Origem. Seleção/exclusão em massa preservada.

### Normalização de `conta_previsao` (M6)
- A Conta de cada lançamento virou **seleção** (contas reais + "Outras"), encerrando o texto livre. Importação **tolerante**: `lower`/`unaccent`/`trim` + aliases (`Banco Itau` → Itaú, `ASAAS` → Asaas); nulos/órfãos → "Outras". `@/lib/gerencial/normalizar-conta` (isomórfico, espelha o SQL) na API Route de import; `chaveDuplicata` **não** usa `conta_previsao`, então a divergência cru→canônico converge em `aAtualizar` (sem duplicar).
- **Migration 0149:** backfill de `conta_previsao` das **108 linhas** reais (re-verificado em produção: `Banco Itau`×42 → Itaú, `ASAAS`×33 → Asaas, `Blimboo`×13, NULL×18 + `Caixa Economica`×1 + `USD 4.680`×1 → "Outras"). **Não** toca a projeção (`get_gerencial_projecao_diaria` ignora `conta_previsao`).

### Fechamento (M7)
- 4.22.0; este CHANGELOG; CHANGELOG_DIRETORIA (negócio); ADR-0124; Design System §7 (formato contábil); CLAUDE.md (convenção `<ValorContabil>`); out-briefing.

### Refinamentos pós-revisão (patch, pré-merge)
- **Destaque persistente de lançamento (migration 0150):** ícone de lata de tinta por linha pinta o fundo de amarelo, salvo no banco (coluna `destacado`; toggle via `update_gerencial_lancamento`). ADITIVA/retrocompatível; **não** toca a projeção.
- **Base — cores por tipo:** valor de *A pagar* em vermelho, *A receber* em verde.
- **Base — ações reordenadas:** ícone de origem (planilha/manual) movido para a direita, junto de destaque e excluir (origem · destaque · lixeira); some o ícone de origem prefixando a Pessoa.
- **Base — filtro de Tipo** funcional na linha de filtros (select Todos/A receber/A pagar) e **filtro de Vencimento por período** num botão "Personalizado" (popover Início/Fim), no lugar dos dois campos empilhados que quebravam o layout.
- **Base — botão "Salvar"** da nova linha não sobrepõe mais o seletor de data (coluna de ações alargada).
- **Drawer "Gerenciar contas":** subtítulo explicativo + tabela `table-fixed` (coluna Conta flexível/truncada) — fim da rolagem horizontal.

## [4.21.0] — 2026-06-16

Versão MINOR: **Fluxo de Caixa Gerencial — contas gerenciáveis, agregada configurável, cores por faixa + hardening (M2).** Migrations 0146 (aditiva), 0147 (hardening de RPCs), 0148 (RPC nova). ADR-0123.

### Contas viram entidade gerenciável (M1)
- `analytics.gerencial_saldos` estendida com `limite` (crédito), `consolidado` (booleano) e `papel` (`isolada`/`reserva`, exclusivos via índice único parcial). Grants `INSERT/DELETE` novos.
- CRUD de conta: `create_gerencial_conta` / `update_gerencial_conta` (atributos + rename + papel exclusivo) / `delete_gerencial_conta`. UI: gerenciador de contas na Visualização Agregada (saldo/limite inline, checkbox consolidado, select de papel, adicionar/remover).
- Backfill das 4 contas atuais preserva o comportamento (Itaú=isolada+consolidado+limite 200k; Asaas/Blimboo=consolidado; Clara=reserva).

### Agregada data-driven + 3 projeções configuráveis (M3)
- Removidos os nomes de conta hardcoded (`Itaú/Asaas/Blimboo/Clara`). As 3 colunas saem das contas: **Saldo [isolada]** = saldo da isolada + resultado do dia; **Consolidado** = soma das contas marcadas + resultado; **Consol.+[reserva]** = consolidado + reserva + resultado. Cabeçalhos dinâmicos seguem os papéis; coluna some se o papel não estiver atribuído.
- Decisão de modelo: a agregada **não** distribui por conta (`conta_previsao` irrelevante); 3 bases de saldo sobre o **mesmo** resultado diário.

### Cores por faixa de saldo (M4)
- Coluna **isolada** (tem limite): 3 faixas via tokens semânticos — `< −limite` vermelho (`--danger`), `[−limite, 0)` amarelo (`--warning`), `≥ 0` verde (`--success`). **Consolidado** e **Consol.+reserva**: 2 faixas (vermelho/verde). A faixa amarela é função do `limite` da conta (não hardcodado).

### Seleção e exclusão em massa (M5)
- Checkbox por linha + "selecionar todos os visíveis" + **"Apagar selecionados (N)"** com confirmação. **Aviso extra** quando a seleção inclui linhas `origem='planilha'` (curadas — serão re-trazidas pelo próximo import). RPC `delete_gerencial_lancamentos_bulk`. Ícone de origem (planilha/manual) na base.

### Hardening — fim do service role no gerencial (M2)
- Todas as RPCs do gerencial (`get_gerencial_*`, CRUD de lançamento/conta, `batch_gerencial_import`) passam a chamar `app.exigir_acesso(['financeiro/gerencial'])` + `GRANT authenticated` — a negação vale **no nível da RPC**, não só na página. Página standalone, seção embutida do Fluxo de Caixa, actions e a API Route de import migradas de `getAdminClient` (service role) para o **cliente de sessão** (`getServerClient`). Defesa em profundidade real (achado da auditoria 2026-06-13/M2).

## [4.20.2] — 2026-06-16

Patch: **desempenho do upload — parse em Web Worker + barra de progresso.** Sem migration. Sem mudança de banco.

### A tela não trava mais ao importar
- O parse do Excel (`XLSX.read` + `sheet_to_json` + `parseXxxRows`, ~45k linhas) era **síncrono na main thread** → o navegador mostrava "não está respondendo" e o spinner congelava durante a fase "Lendo planilha".
- **Fix:** o parse roda agora num **Web Worker** (`src/lib/carga/parse.worker.ts`), fora da main thread — a UI fica fluida, o spinner anima e some o "não responde". Reaproveita os 4 parsers isomórficos (zero duplicação de lógica); vale para as **4 bases**. Helper `parseArquivoEmWorker` com **fallback** para o parse na main thread se o worker não carregar (a importação nunca quebra por causa do worker).

### Barra de progresso no envio
- O envio em lotes (`inserir_lote_*`) agora mostra **"Enviando… X%"** com barra de progresso e, ao terminar os lotes, **"Processando no servidor…"** (validação + promote). Antes era só um spinner com "Importando N linhas…".

## [4.20.1] — 2026-06-16

Patch: **correção da importação de Vendas (timeout) e da "última atualização" das cargas.** Migration 0145 (aditiva). ADR-0122.

### Importação de Vendas por Produto voltou a funcionar (timeout)
- `promover_carga_vendas` (TRUNCATE + copia staging→raw 45k + transform + dims + refresh de 4 MVs, numa transação) estourava `57014 canceling statement due to statement timeout`. **Causa:** o `service_role` estava com `rolconfig` **sem `statement_timeout`** → o PostgREST aplicava o **default do banco (120s)** às requisições dele, e o promote passa disso. (O `CLAUDE.md` documentava "service_role = sem limite" — havia derivado.)
- **Fix:** migration `ALTER ROLE service_role SET statement_timeout = 0` (restaura o comportamento documentado; admin-only, runaway limitado pelo timeout da função serverless). O timer é armado no statement externo do PostgREST e **não** pode ser desarmado de dentro da função (testado) — a alavanca é o nível do role.

### "Última atualização" agora aparece em todas as bases de importação
- Antes, só **Vendas** mostrava a data; **Lançamentos por Operação** descartava `ultima_atualizacao` no `getLancamentosStatusAction` (mostrava "Nunca"/valor velho, embora `MAX(importado_em)` estivesse fresco no banco), e **Lançamentos por Categoria** + **Fluxo de Caixa** fixavam `null`.
- **Fix:** `getLancamentosStatusAction` passa a expor `ultima_atualizacao` de `get_upload_status`; duas RPCs novas — `status_lancamentos_financeiro` e `status_fluxo_caixa_titulos` (count + `MAX(carregado_em)` das tabelas raw) — alimentam as outras duas. As 4 bases agora exibem a data/hora correta.

## [4.20.0] — 2026-06-15

Versão MINOR: **número de referência por solicitação, auditoria de movimentações navegável e permissão de Solicitações em dois níveis.** Migrations 0143 (aditiva) e 0144 (catálogo — UPDATE cosmético, com confirmação). ADRs 0120 e 0121.

### Solicitações — número de referência (#id) (M1)
- Cada solicitação passa a exibir seu **número** (`#id`, a PK `app.solicitacao.id`) em 3 pontos que não o mostravam: card da **caixa-de-entrada** (gestão), card de **"Minhas solicitações"** e **cabeçalho do drawer** (subtítulo `Solicitação #id`).
- **Apenas exibição** — o `id` já vinha em todos os payloads. **Sem RPC, sem migration.** Número **cru** (sequencial, com lacunas — como nota fiscal/pedido): não renumera nem materializa coluna contígua.

### Movimentações — reformulação da auditoria (M2, M3, M4)
- **Visual (M2):** colunas reordenadas para **Usuário · Ação · Solicitação · Quando**; coluna **Detalhe removida**; Solicitação mostra **só o número** (`#id`), não o tipo; nomes de ação em **particípio** (aberta/concluída/rejeitada/cancelada); **badges em tokens semânticos** (não hex): concluída=`success` (verde), rejeitada=`danger` (vermelho), cancelada=`warning` (âmbar, distinto do `--gestao`), aberta=neutra.
- **Busca e ordenação (M3):** **busca única client-side** sobre **todas as colunas** + **ordenação por cabeçalho de coluna** (Quando desc por padrão), ambas sobre a lista já carregada (`getMovimentacoes`). `Array.sort` estável preserva a ordem da RPC em empates. **Sem RPC nova, sem paginação.**
- **Linha clicável (M4):** clicar (ou Enter/Espaço) numa linha chama `detalheSolicitacao` (**server action** — `rpc.ts` é server-only) → `getDetalhe` → abre o **`DrawerSolicitacao`** reaproveitável. A **justificativa de rejeição** (que saiu da coluna Detalhe) aparece no drawer. Autorização já resolvida: página gestão-only + `solic_detalhe`/`pode_ver_solic` (gestor vê qualquer).

### Ferramenta — backup-gate worktree-aware (M5)
- `REPO` no `scripts/db-gate/` deixa de ser hardcoded para a raiz do `main` e resolve o **checkout atual** via `git rev-parse --show-toplevel` (fallback `process.cwd()`); fonte **única** em `lib.mjs` (`gate.mjs`/`migrate.mjs` importam). Rodado de uma worktree, o `db push` agora corre da worktree (enxerga a migration local) e continua funcionando do `main`. **Não afeta o backup-gate** (fala com produção via `SUPABASE_DB_URL`, independente do `REPO`) — só conserta a `cwd` do export/push.

### Solicitações — permissão em dois níveis (ajuste pré-merge, ADR-0121, migration 0143)
- A página `/solicitacoes` (caixa de entrada + minhas) deixa de ser aberta a **qualquer autenticado** e passa a exigir a permissão **"Solicitações"** (área nova `solicitacoes/basico`). Os botões âmbar (Ver todas, Gerenciar solicitações, **Movimentações**) e as rotas `/admin/solicitacoes/*` continuam exigindo **"Solicitações (gestão)"** (área `solicitacoes`, **inalterada**). A gestão **inclui** a básica (guard com OR; item da sidebar via `areasAny`).
- **Migration 0143 (aditiva):** cria a área `solicitacoes/basico` ("Solicitações", grupo Geral) e a **concede a todos os roles** (backfill não-quebra — ninguém perde o acesso de hoje; o admin remove depois). **Nenhum guard de gestão mudou** → conceder a básica a todos **não vaza** gestão (grants de `solicitacoes` seguem só no role de gestão). Aplicada (gate VERDE, 38/38, restore-test 4/4) e verificada via pooler.
- O nome interno `solicitacoes` permanece = gestão (histórico); a básica nasceu com sufixo `/basico`. Decisão de não inverter para não reescrever ~10 funções `SECURITY DEFINER` (risco na camada de segurança). As RPCs básicas (dados self-scoped do próprio usuário) seguem em `exigir_acesso()` (login+ativo); o gate da feature é a página. Detalhe e fronteira aceita no ADR-0121.
- **Migration 0144 (catálogo):** os dois níveis ganham um **grupo próprio "Solicitações"** em `app.rbac_areas` (`UPDATE` de `grupo`/`ordem` — sem mexer em grants/permissões) para aparecerem **lado a lado** no editor de permissões (antes a básica caía em "Geral" e a gestão em "Administração", separadas). Aplicada com backup-gate VERDE + confirmação humana (é `UPDATE`).

### Ajustes visuais
- Removido o ponto final dos subtítulos de página (Solicitações, Design System, Movimentações e a tela de login) — consistência (os demais já não tinham).

## [4.19.1] — 2026-06-15

Patch: **auditoria de movimentações das solicitações.** Migration 0142 (aditiva). Sem mudança de domínio.

### Solicitações — lista de movimentações (auditoria)
- Novo botão âmbar **"Movimentações"** na página de Solicitações (gestão-only, ao lado de "Ver todas"/"Gerenciar solicitações") → nova página `/admin/solicitacoes/movimentacoes`.
- **Lista única de auditoria** mostrando o que cada usuário fez em cada solicitação: **Abertura** (solicitante + `criado_em`), **Conclusão / Rejeição / Cancelamento** (quem decidiu + `decidido_em`, com a justificativa da rejeição), ordenada do mais recente. Colunas: Quando (fuso SP) · Ação · Solicitação · Quem · Detalhe.
- **Derivada das colunas existentes** de `app.solicitacao` (sem tabela de eventos nova — `solicitacao_evento` segue fora); realiza o "relatório futuro" previsto no ADR-0117. RPC `solic_movimentacoes()` (migration 0142, `SECURITY DEFINER` + `exigir_acesso(['solicitacoes'])`, gestão-only). Gate de área = `requireArea('solicitacoes')` na página + `exigir_acesso` na RPC (o proxy só exige sessão).

## [4.19.0] — 2026-06-14

Versão MINOR: **regra de data configurável por campo, refinos de Solicitações e multi-seleção de operações em Weddings.** Migrations 0140 (aditiva) e 0141 (levemente destrutiva, DROP+CREATE de função, com confirmação humana). ADR-0118.

### Solicitações — regra de data por campo (M3, M4)
- Um campo do tipo **data** num tipo de solicitação pode agora **proibir datas anteriores a hoje** (bloqueio) e **avisar** quando a data está a mais de N dias no futuro (aviso não-bloqueante).
- **Bloqueio é server-side** (`criar_solicitacao`), com HOJE calculado no fuso de **São Paulo** (`America/Sao_Paulo`, nunca `current_date` do servidor); o `min` do campo no preenchimento é só o espelho do cliente. O aviso é puramente client-side (deixa enviar).
- Armazenamento em colunas dedicadas (`data_permite_passado`, `data_aviso_dias_futuro`) em `app.solicitacao_campo` — **não** reusa `opcoes`. A regra **não** entra no snapshot imutável da solicitação (é portão de open-time). Migration 0140 aditiva (4 RPCs conhecem as colunas).

### Solicitações — refinos visuais (M1, M2)
- **Drawer de detalhe** redisposto em 3 zonas: cabeçalho (status + limite, vermelho se vencida), faixa de metadados (destinatário/solicitante/aberta em — com hora no fuso SP) e campos com hierarquia rótulo→valor em grade de dois; anexos em bloco próprio com ícone por tipo de arquivo.
- **Tabela de tipos**: ações da linha em **ícone** (Editar / Arquivar-Desarquivar / Excluir, padrão de Usuários); **Excluir desabilitado com tooltip** quando o tipo já tem solicitações (a regra de só-excluir-tipo-virgem fica visível na UI).

### Weddings — multi-seleção no filtro de operações (M5, M6)
- O filtro "Filtrar gráficos por operação" passou a aceitar **múltiplas operações** (soma agregada do subconjunto); "Todas as operações" é mutuamente exclusiva e o rótulo do gatilho vira contador. Estado na URL (`operacao` como lista).
- **Fronteira:** só os 2 gráficos da seção "Visão Analítica por Operação" (Fluxo de Caixa Mensal e Acumulado de Recebimentos e Pagamentos) reagem; KPIs/Mix/Carteira/Próximos seguem por período/setor.
- RPC `get_acumulado_weddings`: 3º parâmetro `text → text[]` (`operacao = ANY(p_operacoes)`); migration 0141 DROP+CREATE de núcleo e wrapper, GRANTs realinhados (`authenticated`/`service_role`, nunca `anon`). Retorno inalterado.

## [4.18.0] — 2026-06-14

Versão MINOR: **reformulação do módulo de Solicitações + refino de Usuários/Acessos** (triagem dos ajustes pós-produção). Migrations 0138/0139 (aditivas, via backup-gate). Sem mudança no Fluxo de Caixa (dormente).

### Usuários e Acessos (M1, M4)
- **Editar nome de usuário** (capacidade nova): RPC `admin_atualizar_nome` (migration 0138, SECURITY DEFINER + `exigir_acesso`; nome vazio rejeitado) + ação + modal de edição. Reflete na tabela e na sidebar.
- Tabela redisposta: **badges semânticas** (verde `success` Ativo / âmbar `warning` Pendente; "Aguardando 1º acesso" → **Pendente**); **Último acesso com data+hora** no fuso de São Paulo; **ações da linha em ícone** (Editar / Redefinir senha / Excluir).
- **Ação primária na linha das pills** (à direita): "Criar usuário" e "Nova permissão" saem de dentro do box.
- Aba "Solicitações" → **"Solicitações de acesso"**; histórico mais informativo (badge vira texto: "Aprovada/Rejeitada em DD/MM/AAAA às HH:MM por <quem>" + motivo se rejeitada) via `admin_listar_solicitacoes` estendida (migration 0139).

### Solicitações (M6, M7)
- **Caixa de entrada** (destinatário): colunas por **TIPO**; filtro de status **Abertas / Concluídas** (substitui os filtros de visão antigos — o usuário sempre vê mim + minha permissão); **Concluídas** inclui as canceladas-pelo-originador com a marca "Cancelada pelo solicitante" (dado permanece `status=cancelada`). Controles de gestão em **âmbar, só admin**: "Ver todas" (supervisão) e "Gerenciar solicitações". Abas reordenadas (Caixa primeiro + default); "Nova solicitação" na linha das abas.
- **Minhas solicitações** (originador): colunas por **STATUS** (Abertas / Concluídas / Rejeitadas) sob o filtro **Ativas / Canceladas**; a coluna Concluídas mostra **quem concluiu e quando** (insumo do relatório futuro).

### Fuso e Design System (M2, M3, M5)
- **Datas no fuso de São Paulo** (`fmtDataSP`/`fmtDataHoraSP` via `Intl` + `timeZone`); `fmtDataHora` corrigido (não mostra mais hora UTC para timestamptz; ingênuo do CHANGELOG inalterado).
- **Token de ação administrativa** `--gestao` (âmbar, distinto do `--warning`) + `PILL_GESTAO`, documentado no Design System e na extensão do ADR-0103.
- Sidebar: badge de pendências em **vermelho**; "Tipos de solicitação" sai da sidebar (acessível por "Gerenciar solicitações").

### Banco
- Migration **0138** (`admin_atualizar_nome`) e **0139** (`admin_listar_solicitacoes` + decisor/motivo). Aditivas, aplicadas via `db:migrate`.

### ADRs
- **0117** — Solicitações: eixo de coluna por contexto (Caixa por tipo, Minhas por status) + token de gestão (ext. ADR-0103) + fuso SP nas datas.

## [4.17.1] — 2026-06-13

Versão PATCH: **aposentadoria da fase 2 da F2-real** (executada após a 2ª carga real de Vendas confirmada por Yan). Remoção de código morto + uma RPC órfã. Migration 0137 (drop de função órfã, sem tocar dados).

### Removido
- **Rota servidor vestigial `/api/admin/upload-vendas`** e a lib `src/lib/carga/vendas.ts` (`carregarVendas`/`ResultadoCargaVendas`) — caminho morto desde a v4.15.0 (a UI usa o pipeline atômico via Server Actions; zero chamadores).
- **Rota órfã `/api/admin/upload-status`** — duplicata da Server Action `getLancamentosStatusAction` (a RPC `get_upload_status` permanece, usada por 3 chamadores vivos).
- **Código de auth morto:** Server Actions órfãs `gerarLinkAcesso` (gerador de magic link sob demanda, fora da UI no modelo v4.14 de senha provisória) e `definirAtivo`, o helper `origemRequest`, e o tipo `ResultadoLink`.
- **RPC órfã `admin_definir_usuario_ativo`** (migration 0137, DROP) — sem chamador após remover `definirAtivo`; era a capacidade de (des)ativar usuário no banco, fora da UI desde a v4.14.1. Reversível (corpo preservado na 0119).

### Mantido (decisão v4.17.1, divergindo do briefing após verificação adversarial)
- `truncate_dynamic_tables` e `inserir_lote_raw` **não foram dropadas**: a auditoria adversarial achou que `npm run seed` (`supabase/seed/seed.ts`) ainda as consome. A exposição de segurança de `truncate_dynamic_tables` já fora fechada na v4.17.0/M1 (REVOKE anon). Migrar o seed ao pipeline atômico ficou para depois (mais risco que valor agora).
- Recovery trio (`transform_raw_to_analytics`/`regenerar_dim_operacao_weddings`/`refresh_all_materialized_views`) intacta.

### Banco
- Migration **0137** — `DROP FUNCTION admin_definir_usuario_ativo(uuid, boolean)`. Aplicada.

## [4.17.0] — 2026-06-13

Versão MINOR: **saneamento técnico** (triagem da auditoria de 2026-06-13). Absorve a fase 2 da F2-real. Migrations 0133–0136 (aditivas, retrocompatíveis; backup do dia com restore testado). Sem mudança de produto.

### Segurança (Balde 1)
- **Janela anônima encerrada (ADR-0114):** `exigir_acesso` com fail-open estreitado (contexto sem JWT só passa para superusuário real) e ramo anon removido; **REVOKE de `anon`** em todas as RPCs exceto `solicitar_acesso` (auto-cadastro, agora com rate-limit 5/min). Guard baseline em `/admin`, `server-only` no cliente service-role, guard no contador de pendências. Auditoria adversarial 7/7.

### Dados / carga (Balde 2 + 3)
- **Coerção numérica/data unificada:** módulo único `coercao.ts` (toNum/toIsoDate/toStr) elimina o `toNum` ingênuo que descartava valores BR com milhar (`8.840,00`); testes de tabela.
- **Carga de Vendas:** advisory lock serializa o pipeline (uploads concorrentes não se cruzam); **export da Lista de Operações sem o teto de 200** (paginava só a 1ª página); aviso não-bloqueante quando `operacao_propria` despenca vs a base atual (detecta a origem parar de exportar a coluna).
- **Anexos de solicitação promovidos** para o prefixo definitivo `sol/<id>/` após criar (antes ficavam em `tmp/`); `tmp/` passa a conter só órfãos. Auditoria de isolamento 8/8.

### Gates / contratos (Balde 4)
- Regra ESLint que reprova o shorthand `[--token]` do Tailwind (guarda da convenção da v4.16.1); 3 schemas Zod a mais na lista viva de contrato; cobertura do item real de `solic_json` (não só listas vazias); gate de contrato **online obrigatório** em CI (`REQUIRE_CONTRACT=1`).

### Banco
- Migrations **0133** (exigir_acesso + REVOKE anon + badge + rate-limit), **0134** (fecha grants anon de `app`), **0135** (advisory lock + aviso op_propria), **0136** (promoção de anexos). Todas aplicadas.

### Não entrou
- **M8** (tipagem do `database.ts`/`BoundRpc`) deferido pelo teto de reversibilidade (ADR-0115) — vira P-refactor; nada dos Baldes 1–4 foi desfeito.
- **Aposentadoria da fase 2** (remover rota/RPCs vestigiais) não entrou: o gatilho (2 cargas reais sem incidente) não foi atingido — só 1 carga até aqui.
- Fluxo de Caixa e o tema dos R$ 17,97M permanecem fora (decisões de produto).

## [4.16.2] — 2026-06-13

Versão PATCH: três quick-wins priorizados da auditoria técnica (relatório `docs/auditoria/`). Sem mudança funcional visível.

### Segurança
- **`next` 16.2.4 → 16.2.9** (e `eslint-config-next` idem): resolve 13 advisories HIGH do Next, entre eles bypass de Middleware/Proxy via segment-prefetch e injeção de parâmetro de rota dinâmica — relevante porque o `proxy.ts` é a camada 1 do enforcement de auth. Patch dentro do minor (sem quebra).

### Dados
- **Guarda contra descarte silencioso na carga de Vendas** (migration 0132): `validar_carga_staging` passou a reprovar a carga, **antes do swap**, quando há `setor`/`setor_micro` que não existe nas dimensões — exatamente as linhas que o `INNER JOIN` do transform descartaria sem erro nem rollback. Não altera o contrato (só acrescenta ao array `erros` e zera `ok`).

### Interface
- **Sidebar rolável** com **barra de rolagem flutuante em overlay**: a barra nativa é escondida (não reserva largura, então o conteúdo **não desloca**) e um indicador fino flutua sobre o conteúdo, aparecendo ao rolar/passar o ponteiro e **sumindo sozinho** quando não há interação (respeita `prefers-reduced-motion`). Acomoda o crescimento de abas sem cortar o rodapé (usuário/sair).
- **Grupos com subabas (Performance e Financeiro) nascem recolhidos** a cada abertura/recarga do site (sem persistência); a subaba ativa continua visível quando o grupo está recolhido. Expandir/recolher segue funcionando e sobrevive à navegação dentro da sessão.

### Documentação
- Registrada convenção permanente (CLAUDE.md): token CSS em classe Tailwind é `[var(--token)]`, nunca `[--token]` (forma v3 que o Tailwind 4 compila para CSS inválido) — guarda contra a regressão corrigida na v4.16.1.

### Banco
- Migration **0132** (CREATE OR REPLACE de `validar_carga_staging`, validation-only, reversível pela definição da 0116). Aplicada; verificada (lógica + regressão de staging vazia).

## [4.16.1] — 2026-06-13

Versão PATCH: **revisão de design/UX/desempenho** das telas internas (Solicitações, Usuários e Acessos, Design System) — padronização de coerência entre telas a partir de uma auditoria multi-lente. Sem migration (UI-only; rollback = reverter deployment).

### Corrigido
- **Shorthand de CSS var do Tailwind v4 (app-wide):** `text-[--token]` (sintaxe v3) compilava para `color:--token` (CSS inválido) e a cor do token era **silenciosamente descartada** — raiz da incoerência visual. 81 ocorrências em 26 arquivos migradas para `[var(--token)]`. Commit isolado (revertível à parte).
- **Esc fechava modal e drawer juntos:** pilha global de overlays (`@/lib/ui/overlay-stack`) faz o Esc fechar só o overlay do topo.
- `fmtValor` de moeda lia `12.345` (milhar pt-BR) como `R$ 12,35`; datas em tabelas de Acessos podiam deslocar o dia.
- Badge "Rejeitada" em Acessos era cinza (vermelho no módulo de Solicitações) — unificado.

### Melhorado
- **Respiro vertical único:** o `<main>` do AppShell concentra o padding topo/base (`py-8`); páginas não definem `py` próprio (corrige telas "grudadas" no topo). Documentado no Design System §12.
- **Coerência de plataforma:** tabelas de Acessos → `CardTabela` (table-fixed/colgroup, cabeçalho padrão); pills locais → padrão `botoes.ts`; faixas de erro → `FaixaMensagem`; modais artesanais → `ModalCentral`; `window.confirm` destrutivos → `ConfirmModal`/`ModalCentral`; classes de input duplicadas → `CAMPO`/`CAMPO_COMPACTO`.
- **Acessibilidade:** cards/linhas clicáveis operáveis por teclado (role/tabIndex/onKeyDown + foco neutro); foco inicial/restaurado em modais e drawer; `aria-label`/`title` em senha provisória e textos truncados; pills de visão com semântica de tabs.
- **Desempenho:** página de Solicitações busca só a lista da view atual (não as duas); `getPendencias` com `React.cache()` (dedup layout+page); demos de gráfico do DS sem animação no mount.

### Banco
- Nenhuma migration. Mudanças exclusivamente de UI/apresentação.

## [4.16.0] — 2026-06-12

Versão MINOR: **Módulo de Solicitações** — pedidos internos ao financeiro (lançamentos avulsos, pagamentos de emergência etc.) com tipos configuráveis, anexos e acompanhamento. Substitui (em convivência) o formulário externo + Planner. ADRs 0112 (campos dinâmicos) e 0113 (anexos/storage).

### Adicionado
- **Abertura por qualquer usuário** (`/solicitacoes`, aba nova na sidebar com badge de pendências): escolhe tipo, destinatário (usuário **ou** permissão), data-limite, descrição e os campos dinâmicos do tipo. **7 tipos de campo** (texto curto/longo, número, moeda, data, seleção, anexo) com validação **server-side**.
- **Caixa de entrada (board estilo Planner):** colunas por tipo, cards por data-limite (vencida destacada), círculo conclui, concluídas recolhidas; sub-filtro mim/permissão e, para gestão, "Todas".
- **Ciclo de vida:** Aberta → Concluída (atendente ou solicitante) / Rejeitada (atendente, justificativa obrigatória) / Cancelada (solicitante). Estados terminais; transições ilegais bloqueadas **no banco**.
- **Anexos** (PDF/imagem/planilha ≤10 MB): bucket privado, upload validado no servidor, download por **signed URL** que respeita a visibilidade.
- **Admin de tipos** (`/admin/solicitacoes`, área `solicitacoes`): construtor de campos (ordenar, obrigatório, opções de seleção); tipo em uso só **arquiva** (não exclui), preservando histórico; tipo virgem é excluível.

### Segurança / dados
- Tabelas `app.solicitacao_tipo/campo/solicitacao/anexo` **RLS deny-by-default**; todo acesso por RPC `SECURITY DEFINER` com `exigir_acesso` + filtro por `auth.uid()`/área (visibilidade §2.3 valendo no banco). Respostas gravadas como **snapshot imutável** (editar/arquivar o tipo não altera solicitações abertas). Auditoria adversarial 25/25 (ciclo de vida + visibilidade + validação, 3 perfis + anon).

### Banco
- Migrations **0127** (schema+RLS+área+bucket), **0128** (RPCs), **0129** (fix de visibilidade NULL-safe — achado da auto-auditoria), **0130** (flags de papel para a UI). Aplicadas; backup pré-v4.16 com restore testado.

## [4.15.0] — 2026-06-12

Versão MINOR: **F2-real, fase 1** — o caminho real de upload de Vendas (Server Actions de `/admin/uploads`) passa a usar o **pipeline atômico** de carga (staging → validação → swap). Carga com erro não esvazia mais a base. ADR-0111. Sem migration (o pipeline 0116/0118 já estava em produção desde a v4.12/v4.12.1).

### Corrigido / Melhorado
- **Upload de Vendas atômico (fecha o F2 para a UI).** `inserirLoteVendasAction`/`finalizarVendasAction` deixam de rodar `truncate_dynamic_tables` antes do transform; passam por `limpar_staging_vendas` → `inserir_lote_staging` → `validar_carga_staging` → `promover_carga_vendas` (transação única; ROLLBACK preserva a base). **Assinaturas e UX inalteradas** no fluxo de sucesso. Falha de validação/promoção retorna erro explícito ("base preservada"), nunca tela vazia.
- **Contrato Zod** das RPCs do pipeline (`cargaValidacaoSchema`/`cargaPromocaoSchema`) validado por `parseRpc` no finalizar; testes de contrato (`validar_carga_staging` live; estruturais de `promover`); teste de segurança anon-negado estendido às RPCs de staging.

### Coexistência / rollback
- O caminho antigo (`truncate_dynamic_tables`, `inserir_lote_raw`, `transform_…` soltos) **permanece intacto** no banco — rollback = reverter as Actions (promover deployment anterior na Vercel), sem migration de desfazer.
- **Fora do escopo (fase 2):** aposentar a rota vestigial `upload-vendas`, as RPCs antigas de carga e as RPCs órfãs de desativar usuário — só após ≥2 cargas reais validadas sem incidente.

### Notas
- Sem migration nesta versão. Backup lógico completo pré-v4.15 em `~/wt-finance-backups/2026-06-12-pre-v4-15/` (âncora de reversibilidade). Runbook: `docs/runbooks/v4-15-upload-vendas-runbook.md`.

## [4.14.3] — 2026-06-12

Versão PATCH: **documentação viva** do Design System (`/admin/design-system`) atualizada para refletir a família de tokens neutros de plataforma das v4.14.1/v4.14.2. Nenhum código de produto muda; sem migration.

### Documentação
- **§1 Paleta:** adicionados os 6 tokens neutros de plataforma (`--action-primary`, `--action-primary-fg`, `--action-soft`, `--action-soft-border`, `--action-soft-fg`, `--focus-ring`) + nota explicando que o swatch `--brand` mostra o hex literal mas, no tema `group` da própria página, `var(--brand)` resolve neutro.
- **§10 Componentes:** corrigido o caminho de `PeriodoFilterPillsUrl` (`shared/`, não `layout/`); listados `PeriodoPillsUrl`, `AuthHeader`, `Checkbox` (`ui/checkbox`), `ModalCentral` e `botoes.ts`.
- **§11 Plataforma (auth/admin) — nova:** regra setor × plataforma do ADR-0103 (extensão v4.14.1) e o porquê dos tokens dedicados (evitar flash dourado pré-hidratação), com **demos ao vivo** (componente `plataforma-showcase.tsx`) de hierarquia de botões (primária bege / secundária cinza / destrutiva), pill neutra, foco `:focus-visible`, Checkbox e CTA sólido.
- **CLAUDE.md:** ratificados dois aprendizados — out-briefing é parte do DoD (não pós-entrega); addendum pós-merge vira patch novo.

## [4.14.2] — 2026-06-11

Versão PATCH: continuação dos refinamentos de plataforma da 4.14.1 — Design System no menu, nomenclatura mais clara na administração e botões de acessos alinhados às pills de período do Financeiro. ADR-0103 (extensão).

### Adicionado
- **Design System como aba na sidebar** (`/admin/design-system`, ícone Palette), **abaixo de "Usuários e Acessos"**, visível só para quem tiver a permissão `admin/design-system`. A página já era protegida pelo guard; agora tem entrada no menu.

### Corrigido / Melhorado
- **Renomes:** "Usuários & Acessos" → **"Usuários e Acessos"** (sidebar, título e rótulo da área — app + banco via migration **0126**); aba e termos **"Roles" → "Permissões"** em toda a tela de acessos (a chave de área/role no código não muda).
- **Botões da página de acessos no formato das pills de período** (`rounded-full`, borda fina, `px-3 py-1`), com hierarquia: **primária e aba ativa em bege suave neutro** (`--action-soft`/`-border`/`-fg`, espelhando o ativo do tema group); **secundária** cinza contornada; **destrutiva** em tom de perigo. Cor sempre neutra do Group, via tokens dedicados (sem `var(--brand)`). Estilos centralizados em `botoes.ts`.
- **Anel de foco das telas de plataforma só em `:focus-visible`** (teclado): clicar com o mouse numa aba/pill/botão não deixa mais o "sombreado"; inputs de texto seguem mostrando o anel ao clicar.

### Banco
- Migration **0126** (cosmética, já aplicada): rótulo da área `admin/acessos` em `app.rbac_areas` → "Usuários e Acessos". Não altera chaves, permissões nem guards.

## [4.14.1] — 2026-06-11

Versão PATCH: refino visual e de UX das telas de plataforma (login, trocar-senha, solicitar-acesso, sem-acesso, admin/acessos), que nasceram fora da identidade visual. ADR-0103 estendido.

### Corrigido / Melhorado
- **Identidade neutra do Group nas telas de plataforma.** Eliminado o dourado de Weddings (`#BD965C`) hardcoded nessas telas; agora usam tokens neutros dedicados (`--action-primary` #3F4144, `--focus-ring`) e a utilitária `.foco-neutro`, independentes de `[data-theme]` (sem flash dourado pré-hidratação). Abas de setor seguem com suas cores.
- **Telas públicas:** cabeçalho institucional único (logo + wordmark) padronizado nas quatro telas via novo `AuthHeader`; labels em caixa normal (fim do UPPERCASE); banner de erro via tokens `--danger`. No login: link **"Solicitar acesso"** e o texto do esqueci-a-senha movido para **dentro do card**, centralizado; microcopy "Voltar ao login".
- **/admin/acessos:** tabela de usuários no padrão CardTabela (headers caixa normal, `colgroup`, "Último acesso" em `DD/MM/AAAA` sem truncar); ações de linha reduzidas a **Senha** e **Excluir**; **Excluir** agora pede **confirmação** (modal) e **revoga a sessão** do usuário (`auth.admin.signOut`) — herdando o que o "Desativar" fazia; pills no padrão preenchido neutro; checkboxes do design system (componente novo `ui/checkbox`); removido o destaque dourado do chip "Usuários & Acessos".

### Notas
- As RPCs de desativar permanecem no banco (saíram só da UI). Selects nativos mantidos (sem Radix no projeto), com foco neutralizado.

## [4.14.0] — 2026-06-10

Versão MINOR: **login por e-mail + senha** (substitui o magic link como método primário) com troca obrigatória no 1º acesso, e **solicitações de acesso** moderadas pelo admin. Reduz o atrito do login sem depender de SMTP. ADR-0110.

### Adicionado
- **Login por senha** (`/login` → `signInWithPassword`). O magic link sai da tela de login e passa a ser **recuperação/anti-lockout** (rota `/auth/confirm` + botão "Link" no admin).
- **Criação de usuário com senha provisória** (admin): a senha é **exibida na tela (copiável)**, não por e-mail — sem dependência de SMTP. A pessoa é obrigada a trocar no 1º acesso (`/trocar-senha`).
- **Reset de senha pelo admin** ("Resetar senha"): nova provisória + troca obrigatória. Cobre "esqueci a senha".
- **Solicitação de acesso pública** (`/solicitar-acesso`, link "Ainda não tenho conta") + **aba Solicitações** em `/admin/acessos` (aprovar = cria usuário com senha provisória; rejeitar). Nada é criado sem aprovação.
- **Excluir usuário** já existia (v4.13.1); mantido.
- Role **Administrador** (todas as áreas) atribuída ao usuário inicial.

### Segurança
- **Troca obrigatória é portão forte:** com `precisa_trocar_senha` ligada, toda rota autenticada redireciona para `/trocar-senha` (páginas), 403 (APIs) ou bloqueia (actions).
- **`solicitar_acesso`** é o único endpoint público novo (anon): valida e-mail, no máx. 1 pendente por e-mail, nada criado até aprovação. Senha mínima elevada para 8; provisória ≥16.
- Migration **0125** (aditiva): coluna `precisa_trocar_senha`, tabela `app.rbac_solicitacoes` (RLS deny), RPCs (`solicitar_acesso`, `admin_listar_solicitacoes`, `admin_decidir_solicitacao`, `admin_marcar_trocar_senha`, `marcar_senha_trocada`), seed da role Administrador.

### Reversibilidade
- Tudo aditivo. Freio de emergência inalterado: kill switch (`admin_set_enforcement(false)`) + revert do deploy na Vercel (para v4.13.1 = volta ao magic link; para v4.12.1 = app público). Ver runbook.

## [4.13.1] — 2026-06-10

Versão PATCH: robustez do convite/login (pós-ativação da v4.13). Corrige links de acesso que chegavam "inválidos" e fecha lacunas da UI de administração.

### Corrigido
- **Magic link consumido por preview de link** (`/auth/confirm`): a confirmação passa a ser **em dois passos** — o GET só renderiza um botão; o `verifyOtp` roda no **POST** do clique. Bots de pré-visualização (WhatsApp/e-mail/antivírus) fazem só GET e não queimam mais o token de uso único. (Era a causa de "link inválido ao clicar".)

### Adicionado
- **"Link de acesso" por usuário** na tela Usuários & Acessos: re-gera um magic link sob demanda (campo copiável) — resolve o caso de o convite ter expirado/sido consumido e o link não poder ser recuperado.
- **"Excluir" usuário** (irreversível, com confirmação e proteção anti-lockout — não exclui a si mesmo), ao lado de "Desativar" (reversível).

### Alterado
- Validade do link de acesso de **1h → 24h** (config Supabase `mailer_otp_exp`), dando folga para o convidado abrir o link.

### Operação
- O e-mail nativo do Supabase tem limite baixo (2/h) e **SMTP próprio segue pendente** — para convidar em lote, usar o link copiável (não depende de e-mail).

## [4.13.0] — 2026-06-10

Versão MINOR: **autenticação e autorização**. O dashboard deixa de ser público — login obrigatório por **magic link**, cadastro **só por convite**, e permissões **RBAC dinâmicas por área de navegação** (em Performance, granular por setor). Enforcement em 4 camadas com janela de compatibilidade para a `main` seguir funcionando até o merge. ADRs 0106–0109.

### Adicionado
- **Login por magic link** (`/login`, `/auth/confirm` server-side aceitando `token_hash` e `code` PKCE, `/auth/signout`), anti-enumeração, sem signup público. (ADR-0106)
- **RBAC dinâmico** (migration 0119): roles criáveis com qualquer combinação de **11 áreas** de permissão; tabelas `app.rbac_*`; RPCs `admin_*` com anti-lockout; `get_minhas_permissoes`. Seed: role **Financeiro** (acesso total) + `yan@welcometrips.com.br`. (ADR-0107)
- **UI de administração** (`/admin/acessos`): convidar usuário (com link de convite copiável), atribuir role, desativar/reativar; criar/editar roles com matriz de permissões. Quem administra é uma permissão (`admin/acessos`).
- **Sessão SSR** (`@supabase/ssr`): `proxy.ts` (sessão obrigatória em tudo fora de `/login` e `/auth/*`), `getServerClient` por-request (RPCs correm como `authenticated`), guards `requireArea`/`requireAreaApi`/`requireAreaAction`. (ADR-0109)
- **Página standalone do Fluxo de Caixa Gerencial** (`/financeiro/fluxo-caixa/gerencial`) como porta de entrada de quem só tem essa área.
- Testes do mapa de áreas (`areas.test.ts`) + contrato RBAC no `rpc-contrato.test.ts` (paridade catálogo banco↔app, caminho negado, revogações). Suíte 68 → 84.

### Segurança
- **Enforcement em 4 camadas** (ADR-0108): proxy de sessão → guards de área (12 páginas, 23 rotas de API, 3 grupos de server actions) → guards nas RPCs do banco (44 wrappers `SECURITY DEFINER` por área, migration 0121) → **RLS deny-by-default** em todas as 33 tabelas dos 6 schemas (0120) com remoção das policies permissivas herdadas (0123).
- **Correção crítica de exposição** (migration 0122): todas as 72 funções `public` tinham `EXECUTE` para `anon` por *default privileges* do Postgres — incluindo `truncate_dynamic_tables`/`promover_carga_vendas`. Revogadas; `ALTER DEFAULT PRIVILEGES` impede recorrência.
- **Kill switch** (`app.config.auth_enforcement`): liga/desliga o enforcement anônimo no banco sem deploy — base do procedimento de emergência e da compatibilidade com a `main` (S5).

### Notas de ativação (pós-merge)
- Ligar o enforcement (`admin_set_enforcement(true)`), fechar o signup público do GoTrue e convidar os usuários reais — passo a passo no runbook `docs/runbooks/v4-13-auth-runbook.md`.

## [4.12.1] — 2026-06-09

Versão PATCH (saneamento técnico pós-v4.12): unificação dos parsers de Vendas e expansão da validação de contrato (Zod) às RPCs críticas restantes. Sem mudança de comportamento visível — reforça a resiliência da ingestão e a detecção de divergência de dados.

### Corrigido
- **Parser único de Vendas** (M1): a importação de Vendas passa a ter um único parser (`src/lib/carga/vendas-parser.ts`, isomórfico), consumido pela UI (`/admin/uploads`) e pela API Route (`upload-vendas`). A via servidor tinha parser próprio que **não** populava `operacao_propria` — uma carga por ela regrediria silenciosamente a correção da v4.9.x (convidados zerados, datas de evento ausentes, faturamento das operações errado). Casamento de cabeçalho tolerante a acento/caixa/espaço + aviso de coluna não-mapeada, agora nos dois caminhos.
- **`operacao_propria` no pipeline atômico** (M1, migration 0118): `inserir_lote_staging` e `promover_carga_vendas` (introduzidas na 0116) passam a gravar `operacao_propria` — a coluna existia na staging mas nunca era preenchida. Sem isso, unificar só o parser não fecharia a porta.

### Alterado
- **Validação de shape (Zod) nas RPCs críticas** (M2, F7): padrão `parseRpc` estendido de 1 para 8 RPCs — `get_executiva_kpis`, `get_tendencia_margem`, `get_ranking_vendedores_range`, `get_vendas_em_aberto`, `get_vendas_receita_negativa`, `get_operacoes_weddings`, `get_carteira_weddings` (além da semente `get_mix_produto`). Divergência de contrato → log + degradação para estado de erro (nunca quebra a tela em silêncio).

### Testes
- +12 testes do parser unificado (acento, `Data Início`/`Data de Início`, `Date` nativo, coluna não-mapeada, paridade de saída, mapeamento de `operacao_propria`). Suíte: 35 → 47.

---

## [4.12.0] — 2026-06-08

Versão MINOR de saneamento técnico (pós-auditoria v4.11): ingestão de dados resistente a falha, rede de testes automatizados, confiabilidade do dado exibido e fim do fan-out no ranking. F1 (auth) ficou fora por decisão (ver ADR-0029).

### Adicionado
- **Rede de testes (Vitest)** (M2, ADR-0105): unit dos helpers puros (`fmt`, `periodo`, `decomposicao-variacao`, `normalizeHeader`/`toIsoDate`) + contrato das RPCs críticas via REST (shape + invariantes: soma do Mix ≈ 100, margem ≈ receita/faturamento, vendas ≤ limite). Gate novo `npm test`.
- **Ingestão atômica de Vendas** (M1, ADR-0104, migration 0116): carga em staging → pré-validação (range de datas vs `dim_data`, contagem) → swap numa única transação (`promover_carga_vendas`). Falha → rollback → a base nunca fica vazia (corrige F2).
- **`get_ranking_vendedores_range`** (M4, migration 0117): ranking por intervalo agregado no banco.
- **Estado de erro discreto** (`ErroCarregamento`) e helpers `unwrapRpc`/`parseRpc` (Zod) para distinguir falha de RPC de período vazio.

### Alterado
- **Top Vendedores em 1 chamada** (M4, F3): fim do fan-out mensal (até 36 chamadas).
- **erro ≠ vazio** (M3, F5): ~28 desembrulhos de RPC migrados para `unwrapRpc` (erro logado com contexto, não mais silencioso); KPI principal mostra estado de erro em vez de skeleton eterno.
- **Datas locais** (M3, F6): `parseLocalDate` (parse de `YYYY-MM-DD` sem deslocamento de fuso) em `kpi-principal-drawer`, `proximos-casamentos`, `lista-operacoes`.
- **Truncamento sinalizado** (M3, F8): drawers de Vendas em Aberto/Receita Negativa mostram "mostrando X de N".
- **Headers de segurança** (M1, F10): HSTS, X-Frame-Options, nosniff, Referrer-Policy; `bodySizeLimit` 200mb→25mb.
- **React Compiler** (M5, F9, escopado): zerado em `weddings-kpis-section`, `sidebar`, `design-system` (baseline ~25→13; restante = follow-up).
- **Validação de shape (Zod)** (M5, F7): padrão `parseRpc` + `get_mix_produto` (semente; demais RPCs críticas = incremental).
- Flags `MOSTRAR_*` mantidas e documentadas (F12); `docs/changelog.md`/`bugs-resolvidos.md` congelados — `CHANGELOG.md` (raiz) canônico (F13).

### Registro
- **ADR-0104** (ingestão atômica), **ADR-0105** (estratégia de testes), nota de reavaliação no **ADR-0029** (auth admin mantida conscientemente; F1 fora do escopo).

## [4.11.0] — 2026-06-05

Versão MINOR: dois acabamentos — (1) padrão unificado de **card-tabela** nas três abas; (2) **histórico de versões** clicável para a diretoria. Sem migration. ADR-0103 estendido (regra de cor de cash-flow), não criado novo.

### Adicionado
- **Histórico de versões para a diretoria** (M2/M3): o `version X.Y.Z` da sidebar vira clicável (hover sublinha, sem mudar cor) e abre um **modal central** (`ModalCentral`) rolável com o histórico em **linguagem de negócio** — entradas por versão/patch (mais recente no topo), tipo com ícone/cor (Novidade/Correção/Melhoria), descrição e data exata. Fonte: `src/data/changelog-diretoria.ts` (`CHANGELOG_DIRETORIA`), populado **retroativo desde a v4.0** (19 entradas).
- **`CardTabela`** (`@/components/shared/card-tabela`, M1): componente base do padrão de card-tabela + utilitária `.card-tabela-vermais` (Ver mais neutro → cor da aba no hover) + constante `CARD_TABELA_TH`.

### Alterado
- **Padrão unificado de card-tabela** (M1): aplicado a Próximos Casamentos, Mix por Produto, Top Vendedores, Vendas em Aberto e Receita Negativa (Weddings + Trips/Corp). Título único sem subtítulo na página (subtítulo só no drawer); coluna `#` só em rankings; rótulo "no período selecionado" só onde o filtro se aplica; cabeçalho caixa-normal ~11px terciária; `table-fixed` + `colgroup`; Resultado Previsto (operação individual) via `fmtBRL2`. Top Vendedores ganha "no período selecionado". Documentado em `/admin/design-system`.
- **CLAUDE.md** (M4): workflow + DoD ganham o ritual de gerar a entrada no `CHANGELOG_DIRETORIA` a cada versão/patch (linguagem de negócio).

### Registro
- **ADR-0103 estendido** (M4): formaliza que o cash-flow tem **dois contextos de cor deliberados** (identidade turquesa/mostarda nos cards de página de Weddings vs semântica `--positive`/`--negative` no drawer de operação) — **regra, não dívida**. Encerra a pendência antiga.

## [4.10.1] — 2026-06-05

Versão PATCH: alinha o layout de **Trips e Corporativo** ao padrão de Weddings — uma única seção "Visão Geral" (recolhível) com card KPI principal único e clicável, no lugar dos KPIs soltos.

### Alterado
- **Layout Trips/Corp no padrão Weddings:** `PerformanceContent` reorganizado em uma única `TopSection "Visão Geral"` contendo, nesta ordem: pills de período → **card KPI principal único** (Faturamento | Receita Bruta | Margem, clicável, abre o drawer rico por setor) → **Mix por Produto** ("no período selecionado") **|** **Top Vendedores** → **Vendas em Aberto** **|** **Vendas com Receita Negativa**.
- **Card KPI unificado:** os 6 KPIs soltos deram lugar a um único card clicável (mesmo visual do card de topo de Weddings). `KpiColuna` extraído para componente compartilhado (`@/components/shared/kpi-coluna`); novo `KpiPrincipalCard` genérico por setor.
- **Vendas com Receita Negativa** (Trips/Corp): passa a usar o card de Weddings (conceito "receita bruta negativa"), alimentado pela nova RPC `get_vendas_receita_negativa(p_setor, …)` (migration 0115). Antes a tela mostrava Prejuízos (margem negativa).

### Removido (código preservado)
- Seções **Mix por Setor**, **Tendência de Margem** e **Prejuízos (margem negativa)** saíram da visão de Trips/Corp, atrás da flag `MOSTRAR_SECOES_LEGADAS` (recuperáveis). A Tendência de Margem segue acessível dentro do drawer rico (card KPI → "Ver mais").

## [4.10.0] — 2026-06-04

Versão MINOR: **ativa as abas Trips e Corporativo** (a infra já existia — RPCs por setor, tokens de cor, PerformanceContent) e **padroniza o sistema de cores** de toda a plataforma sob a paleta canônica (ADR-0103, extensão do 0095).

### Adicionado
- **Abas Trips e Corporativo ativas** (M8): removido o gate `?preview=1`; `/performance/trips` (setor Lazer) e `/performance/corporativo` renderizam a Visão Geral padrão.
- **Drawer rico parametrizável por setor** (M2): Faturamento/Receita de Trips/Corp abrem o `KpiPrincipalDrawer` (Indicadores + Comparação Ano Anterior + Tendência de Margem), com as seções de subsetor **podadas** quando setor ≠ Weddings. Weddings mantém os subsetores.
- **Pills de período** no PerformanceContent (M3), no lugar do dropdown; pill ativa na cor da aba.
- **Top Vendedores** no PerformanceContent (M5): Faturamento + Receita por vendedor (5 + "Ver mais"), agregado pelo período via `get_ranking_vendedores` (mensal) somado pelos meses do intervalo.
- **Vendas em Aberto** por setor (M6): nova RPC `get_vendas_em_aberto(p_setor, …)` (migration 0114) generalizando a lógica weddings; Receita Negativa já presente como Prejuízos (`get_prejuizos` por setor).

### Alterado
- **Sistema de cores canônico** (M1, ADR-0103): cor por contexto semântico, sempre via token. **Margem** em `--brand-deep` (elimina o indigo `#6366f1`). **Fallback de subsetor** central (`--brand`, fim do `#BA7517` hardcoded). **Mix por Produto** com tokens de texto (fim dos cinzas Tailwind crus). **Cash-flow:** semântica `--positive`/`--negative` no drawer de operação e no Financeiro; os **cards de cash-flow de Weddings** (Fluxo de Caixa Mensal, Acumulado de Recebimentos e Pagamentos) mantêm a **identidade visual** turquesa/mostarda (decisão de id visual — ver "Telas").
- **Afordância de clique** (M4): card clicável usa `.card-clicavel` — hover assume a cor da aba; fim do azul hardcoded.
- **CAGR ocultado** de Trips/Corp via flag (M7), código mantido (pendência futura).
- **Fluxo de Caixa Mensal de Weddings:** rótulos dos totais não liquidados "A RECEBER"/"A PAGAR" → "Total a receber"/"Total a pagar" (caixa normal, não mais uppercase).

### Telas que mudaram de cor (intencional)
- Weddings — **Tendência de Margem** no drawer simples (indigo `#6366f1` → `--brand-deep` oliva).
- Financeiro — gráfico de fluxo acumulado: tokenização do ponto negativo (`#B85C5C`→`--danger`, **sem mudança visual**).
- Mix por Produto — textos de valor passam de cinza Tailwind para tokens (variação mínima).
- (Os cards de cash-flow de Weddings **não** mudam de cor — decisão de manter a identidade turquesa/mostarda.)

---

## [4.9.2] — 2026-06-04

Patch de integridade de dados sobre a v4.9.1. Re-baseia faturamento/receita/hotel das operações Weddings na Operação Própria, removendo contaminação do vínculo por `venda_n`. ADR-0102.

### Corrigido
- **Faturamento/receita/hotel/contrato/subsetor de operações Weddings contaminados pelo `venda_n`** — esses dados de Vendas eram derivados do join por `venda_n` (digitado nos Lançamentos), que apontava para vendas de outros casamentos. Caso confirmado: *W - Darlene e Adnan* exibia R$ 375.523 que eram **100% da W - Daniella e Augusto** (e a Daniella era contada duas vezes). Agora vêm da soma por **Operação Própria** (faturamento real da Darlene: R$ 8.999). Das 231 operações casadas, 214 ficam idênticas; mudam só as ~17 contaminadas; total Weddings ajusta de R$ 44,38 Mi → R$ 44,14 Mi (remoção das duplas contagens).
- A correção abrange **a dim** (`regenerar_dim_operacao_weddings`, migration 0112: faturamento/receita/hotel) **e as RPCs** (migration 0113), pois a Lista de Operações e o drawer **recalculavam** faturamento/receita/subsetor/contrato por `venda_n` em vez de ler a dim. Com isso, o `venda_n` deixa de alimentar qualquer dado de Vendas na área Weddings — alinhando ao mapa de fontes: Hotel/Data/Duração/Contrato/Conv./Faturamento ← Vendas; Resultado Previsto ← Lançamentos; Margem = Resultado Previsto ÷ Faturamento.

### Pendências sinalizadas
- **Curadoria ERP:** corrigir os `venda_n` trocados nos Lançamentos (44374/44025/49444) e alinhar nomes de operação defasados (*Camila e Bruno* "SET"≠"SEP"; *Thelma* "DDMMAA") — estas ficam com faturamento 0 / "sem data" na Lista até o alinhamento.

---

## [4.9.1] — 2026-06-04

Patch de integridade de dados sobre a v4.9. Corrige a ingestão da coluna Operação Própria e a data do evento na Carteira e na Lista de Operações. ADR-0101.

### Corrigido
- **Parser de Vendas por Produto descartava a coluna "Operação Própria"** — o arquivo do ERP traz o cabeçalho como `Operação Propria` (sem acento em "Própria") e o parser casava `Operação Própria` ao pé da letra. Agora o casamento de cabeçalhos é **tolerante a acento/caixa/espaço** (corrige também `Mes`→`Mês`), e colunas não-mapeadas são avisadas no console em vez de sumirem em silêncio.
- **3 casamentos apareciam no ano errado** na Carteira: Vendas × Entrega e na Lista de Operações. A `data_evento` era derivada pelo `venda_n` (digitado no Lançamentos), que apontava para o contrato de outro casamento de nome parecido (ex.: *Paula e Fernando* ligada à venda da *Paula e Bruno*). Agora `data_evento` vem **sempre da `Data Início` da linha `Contrato de casamento` da base de Vendas, casada pela Operação Própria** — as 3 voltam a 2027.

### Alterado
- **Carteira: Vendas × Entrega** passa a ser construída **somente da base VendasPorProduto** (`get_carteira_weddings`): cada casamento = 1 linha `Contrato de casamento`; linha = ano de Data Venda, coluna = ano de Data Início; faturamento/receita = soma dos produtos da operação. Não depende mais de `dim_operacao_weddings`.
- **`regenerar_dim_operacao_weddings`** deriva `data_evento` e `data_venda_contrato` da Operação Própria (linha `Contrato de casamento`), sem fallback por `venda_n`. Operação com nome defasado no Lançamentos fica "sem data" honesto até alinhamento no ERP.

### Pendências sinalizadas
- `faturamento`/`receita`/`hotel` da dim ainda derivam do `venda_n` (mesma contaminação) — follow-up para re-basear na Operação Própria.

---

## [4.9.0] — 2026-06-03

Versão de **integridade de dados**: corrige três bugs de DADO que uma camada de transformação mascarava (Carteira, Convidados, Gerencial), adiciona uma coluna que elimina um join frágil, e leva ajustes visuais conectados (Weddings/Financeiro). ADRs 0097–0100.

### Corrigido
- **Carteira inventava o ano do evento** quando a Data Início era nula — o ETL caía num fallback que parseava o NOME da operação ("…11MAY27" → 2027). Agora `data_evento` usa **somente a Data Início real** do contrato; ausência → **"sem data"** honesto (detector de cadastro incompleto). Função órfã `extrair_data_evento` removida. (M1, migration 0105, ADR-0097)
- **Importação Gerencial invertia dia/mês** — o parser lia a data como **string** no formato de exibição da célula (americano `mm-dd-yy`) e a heurística DD/MM a invertia em junho. Passa a ler o **valor `Date` nativo** do Excel (inequívoco), com a heurística de string só como fallback. Após o re-import, os ~143 registros invertidos são limpos e a Visualização Agregada reflete junho. (M4, ADR-0099)
- **Contagem de convidados** dependia de um join frágil Vendas×Lançamentos. Passa a usar **filtro direto** por `operacao_propria` nas Diárias de Hospedagem (split de Passageiros por vírgula + normalização + DISTINCT + COUNT). (M3, migration 0109 — aplicada após o re-upload, ADR-0098)

### Adicionado
- **Coluna "Operação Própria"** em Vendas por Produto (vinda do ERP): vincula diárias à operação sem cruzar bases. Parser passa a ler a coluna; `raw.vendas_excel` ganha `operacao_propria`. Bundle: corrige também o header da **Data Início** (`'Data de Início'` → `'Data Início'`), que não era ingerido — após o re-upload, a Carteira (M1) volta a ter datas reais. (M2, migration 0107, ADR-0098)
- **Entradas/saídas não liquidadas** no canto do gráfico "Fluxo de Caixa Mensal de Weddings": dois KPIs discretos com o total a receber e a pagar pendentes, independente da data de vencimento. (M5, migration 0106)

### Alterado
- **Resultado Previsto unificado** = `entradas_total − saidas_total` na tabela Lista de Operações **e** no drawer (mesma fórmula explícita, exposta por `get_operacoes_weddings`). Nota: `resultado_caixa` já era coluna gerada igual a essa fórmula, então os **valores exibidos não mudaram**; a unificação agora é explícita no código. Rodapé do Fluxo de Caixa do drawer (Resultado de Caixa / Resultado Previsto / NCG) re-alinhado. (M6, migration 0108)
- **2 casas decimais** em todo valor monetário de **contexto de operação individual** (Lista de Operações e drawer), via helpers centrais `fmtBRL2`/`numBRL2`. Valores agregados e eixos de gráfico permanecem abreviados ("R$ 1,8 Mi"). Convenção documentada em `/admin/design-system`. (M8, ADR-0100)
- **Composição dos Lançamentos** (Fluxo de Caixa Gerencial) em **largura total**: dois donuts maiores (Entradas/Saídas) acima e tabela de decomposição em duas colunas abaixo (Grupo · % · Valor + Total + "Outros"). Drill preservado. (M7)

### Removido (da visualização; mantido no código)
- **Posição por Conta** (Fluxo de Caixa Gerencial) ocultada via flag `MOSTRAR_POSICAO_POR_CONTA` (componente e RPC preservados para revisão futura). (M7)

---

## [4.8.2] — 2026-06-02

Patch de refinamento visual (Weddings). Sem capacidade nova, sem migration.

### Alterado
- **Drawer "Análise Histórica":** pills de período grudadas ao cabeçalho (sem fresta); subtítulo "Indicadores" acima dos KPIs; "Não Classif." removido dos gráficos de Faturamento/Receita por Subsetor e da legenda; gráficos "Comparação Ano Anterior" e "Tendência de Margem" alinhados verticalmente (eixos Y de mesma largura); na Comparação, as linhas do período atual param no mês corrente (não se estendem até o fim do ano).
- **Drawer da Lista de Operações:** Duração, Tipo de Contrato e Convidados agora em dourado (como os demais); Fluxo de Caixa reorganizado — "A receber" abaixo de "Recebido", "A pagar" abaixo de "Pago", e a linha de baixo com **Resultado de Caixa**, **Resultado Previsto** (entradas − saídas totais) e **NCG**.
- **Próximos Casamentos a Entregar:** coluna "Data do Evento" → "Data" no formato "17 de jun de 2026"; tabela do card sem rolagem horizontal em telas menores (`table-fixed` + truncate, mantendo as 4 colunas — Data/Casal/Hotel/Resultado); pills do drawer agora flutuantes (sticky, sem fresta).
- **Carteira: Vendas × Entregas:** removidos os filtros Faturamento e Receita Bruta — exibe apenas Casamentos (sem seletor); RPC chamada 1× (antes 3×).
- **Lista de Operações — alinhamento das colunas:** Duração à **direita**; Contrato e Conv. **centralizados**; Faturamento e Resultado Previsto em **formato contábil** ("R$" à esquerda, valor à direita).
- **Duração** (Lista de Operações e drawer) passa a ser exibida em **meses com 1 casa** ("3,7 meses") em vez de dias.
- **Eixo Y sem quebra** nos gráficos de Weddings (Fluxo de Caixa Mensal e Acumulado); `fmtAxisBRL` passou a formato compacto (1 casa em Mi / 0 em k).
- **Cards de subsetor:** Receita/Margem alinham entre cards em telas menores (`flex flex-col h-full` + rodapé `mt-auto`); o valor principal não quebra mais em 2 linhas no layout de 5 colunas (`whitespace-nowrap` + fonte reduzida em `lg`).

### Corrigido
- Ordenar a Lista de Operações por **Duração, Contrato ou Convidados** retornava **HTTP 400** — o `z.enum` de `ordenar_por` na API route não incluía `duracao`/`tipo_contrato`/`convidados` (a RPC já suportava). Adicionados ao enum.

### Removido (da visualização; mantido no código)
- Cards "Vendas em Aberto" e "Vendas com Receita Negativa" ocultos via flag `MOSTRAR_VENDAS_DIAGNOSTICO` (componentes preservados para retorno futuro).

---

## [4.8.1] — 2026-06-01

Patch de refinamento visual sobre a v4.8 — drawers de Weddings, padrão de gráficos e cards clicáveis. Sem capacidade nova (refina dentro dos ADRs 0095 e 0096).

### Alterado
- **Drawer "Análise Histórica":** eixo Y sem quebra de linha em Faturamento/Receita por Subsetor e na Comparação Ano Anterior; **Comparação Ano Anterior** agora plota **4 linhas** (Faturamento + Receita, atual sólido / ano anterior tracejado; cor distingue métrica, traço distingue período) e o título perde "(Faturamento)"; pills sticky grudadas ao cabeçalho (sem fresta); tooltip de subsetor com nome à esquerda / valor à direita.
- **Drawer da Lista de Operações:** **Caixa Acumulado** agora mostra **duas linhas separadas** — Entradas (verde) e Saídas (vermelho) — cada uma com trecho efetivo sólido + projetado tracejado e marcador "hoje"; largura igualada à do drawer principal; KPIs 3×2 sem bordas pretas (divisórias finas); mais espaçamento entre seções.
- **Tooltip primitivo** (`CustomTooltip`): valores com `tabular-nums` (dígitos alinhados em todos os gráficos que o usam).

### Adicionado
- **Afordância de card clicável:** hover na cor da aba (borda + sombra + CTA "Ver mais" → `var(--brand)`). Utilitária `.card-clicavel`/`.card-clicavel-cta`; aplicada ao card KPI de Weddings (dourado), documentada na `/admin/design-system`. Vira convenção (abas futuras herdam pela var de tema).
- Token `--text-secondary` (#4B4F54) que estava documentado mas ausente em `tokens.css`/`globals.css`.

### Banco
- Migration **0104** — `get_operacao_weddings`: `acumulado_mensal` reescrito para `entrada_efetiva`/`entrada_projetada`/`saida_efetiva`/`saida_projetada` (entradas e saídas separadas), em vez de saldo único.

---

## [4.8.0] — 2026-06-01

Consolidação da área de dados + padrão de gráficos + reformulações Weddings. Dois temas paralelos independentes + faxina.

### Adicionado
- **Padrão de gráficos do design system** (ADR-0095): primitivos reutilizáveis em `@/components/charts` (tema Recharts central, grade/eixos/linha-do-zero, `ChartLegend`, `CustomTooltip` estendido, `fillMonths` para eixo temporal contínuo) + formatadores de eixo em `fmt.ts` (`fmtAxisBRL`/`fmtAxisPct`/`fmtAxisMes`) + cores de setor/subsetor consolidadas em `config.ts`. Documentado na `/admin/design-system` (§8) com showcase e convenção sólido/tracejado. Migração dos gráficos legados é incremental.
- **Lançamentos por Categoria** e **Fluxo de Caixa (CAP/CAR)** no menu unificado `/admin/uploads` (antes em página separada), reusando parsers e RPCs existentes.

### Alterado
- **Área de upload unificada** (ADR-0094): aviso forte (modal com contagem antes/depois) em **todas** as 4 bases; texto explicativo por base ("substitui toda a base; importe sempre o arquivo completo"); página dirigida por configuração. `/admin/uploads/financeiro` agora redireciona para `/admin/uploads`.
- **Drawer da Lista de Operações de Weddings** reformulado (ADR-0096): cabeçalho empilhado sem badge; Informações Gerais 3×2 (Duração/Tipo de Contrato/Convidados + Faturamento/Receita Bruta/Margem Bruta); Fluxo de Caixa com NCG (A pagar − A receber, sem rótulo); Composição por Subsetor (tabela completa); Caixa Acumulado Efetivo (sólido) + Projetado (tracejado) com marcador "hoje". **Removida a Equação Financeira** (Custos Internos não confiáveis), a Receita por Subsetor antiga e o Detalhamento dos Lançamentos.
- **Drawer "Análise Histórica" de Weddings** (polish): legenda dos subsetores entre os dois gráficos stacked; gráfico de Receita com escala Y independente; faixa de KPIs 3×2 sem vazio à direita; eixos sem quebra (primitivos do padrão de gráficos).

### Removido
- **Base morta "Vendas por Forma de Pagamento"** (`raw.vendas_pagamento`: 0 linhas, 0 consumidores) — código (parser/action/tipos/card) + tabela + RPCs.
- Action órfão `fetchWeddingsComposicao` (sem callers).
- RPCs órfãs `truncar/inserir_lote/contar_contas_pagar_receber` (tabela dropada na v4.2).

### Banco
- Migration **0102** — dropa `raw.vendas_pagamento` + suas RPCs (M3) e as RPCs órfãs de `contas_pagar_receber` (faxina #4).
- Migration **0103** — estende `get_operacao_weddings` (tipo_contrato, convidados, data_venda_contrato, decomposição no formato SumarioSubsetor, caixa acumulado efetivo/projetado contínuo).

### Notas
- Faxina #1 (`get_fluxo_caixa_kpis_b`): investigação mostrou que `_b` (KPIs de período da Visão Geral) e `_diario` (posição atual + 10 dias) **não são equivalentes** e ambas são usadas pela página. Decisão: **manter as duas**, não dropar `_b`.
- Carga incremental e DRE permanecem fora de escopo (reservadas; a dor de atualização será resolvida por RPA).

---

## [4.7.1] — 2026-05-31

Patch com dois ajustes pedidos pela diretoria na aba Weddings.

### Alterado
- **Lista de Operações:** removidas as colunas Rec. Bruta, Mg. Bruta e Custos; Rec. Líq. renomeada para **Resultado Previsto** e Mg. Líq. para **Margem** (12 → 9 colunas; aplicado em cabeçalhos, células, export Excel, colSpan e skeleton)
- **Card KPI Comercial:** passa a exibir o **nº de Contratos de Casamento vendidos** no período (em vez de faturamento), com YoY da contagem; Receita e Margem mantidas

### Banco
- Migration 0099 — `get_sumario_subsetor` estendida com `n_contratos` por subsetor (`COUNT(DISTINCT venda) FILTER produto = 'Contrato de Casamento'`)

---

## [4.7.0] — 2026-05-29

### Adicionado
- Drawer "Análise Histórica" de Weddings: KPIs em faixa 3×2 no topo + dois gráficos stacked por subsetor (Faturamento e Receita, mesma escala Y) + Composição por Subsetor sem box (ADR-0092)
- Composição dos Lançamentos com dois donuts (Entradas/Saídas) + agregação "Outros" + drill-down por categoria em lista (ADR-0093)
- API Route `/api/gerencial/import` (runtime nodejs) para importação de planilha — resolve PEND-001 (ADR-0091)
- RPC `get_weddings_historico_subsetor` (migration 0097) — série mensal por subsetor
- RPC `get_decomposicao_categoria` + correção de `get_decomposicao_grupo` (migration 0098)
- ADR-0091 (importação via API Route) + ADR-0092 (drawer Análise Histórica) + ADR-0093 (Composição donuts)

### Alterado
- Pills do drawer Weddings: Este ano / Últ. 3m / Últ. 6m / Últ. 12m / Personalizado (month picker, trava futuro); pills sticky
- Composição por Subsetor removida da vista principal de Weddings (agora vive só no drawer)
- Calendário de Liquidez: novo formato de dia com labels "A receber"/"A pagar"/"Saldo", sem sinais +/−; valor do Saldo em destaque
- Projeção diária do Gerencial fixa em 15 dias

### Corrigido
- PEND-001: importação de planilha Gerencial — `@e965/xlsx` isolado do contexto RSC via API Route
- Parser de importação robusto: valores monetários formatados (`R$ 1,000.00` US e BR), datas `DD/MM/YYYY` brasileiras, tipo case-insensitive
- Bug de agregação na Composição dos Lançamentos: grupos de categoria duplicados (uma linha por mês) → agregação correta por grupo no período

---

## [4.6.1] — 2026-05-28

### Adicionado
- Logos SVG Welcome Group e Welcome Weddings (alta resolução, @2x, @3x)
- Ícones do browser: `favicon.ico`, `icon.svg` com dark mode (`@media (prefers-color-scheme: dark)`), `apple-icon.png` (180×180), ícones PWA `icon0.png` (192×192) e `icon1.png` (512×512)
- Layout admin compartilhado (`src/app/admin/layout.tsx`) adicionado neste patch

### Corrigido
- Logo sidebar: `object-cover` → `object-contain` + `origin-left` corrige corte à esquerda no SVG
- Sidebar usa logos `.svg` em vez de `.png` (qualidade superior)
- `layout.tsx`: removidas referências manuais a `/apple-touch-icon.png` e `/favicon.ico` (Next.js auto-detecta os arquivos em `src/app/`)
- `icon.svg`: dark mode usa branco (`#FFFFFF`) em vez de dourado
- Link Weddings em `em-construcao.tsx` restaurado com cor `text-[#BD965C]`

### Pendência técnica registrada
- **Importação de planilha Gerencial (PEND-001)**: importação via Excel não funciona em produção — erro "An error occurred in the Server Components render" ao chamar `computeImportDiff` como Server Action. Parsing no browser funciona (`parseGerencialExcel`), dados chegam ao servidor, mas a execução da Server Action causa falha no re-render do Server Component. `ImportDrawer` foi isolado com `next/dynamic ssr:false` mas o erro persiste. Ver seção de investigação no out-briefing.

---

## [4.6.0] — 2026-05-28

### Adicionado
- Fluxo de Caixa Gerencial — terceira seção da sub-aba, com Visualização Agregada e Base de Dados
- Importação de planilha Excel de curadoria com mesclagem inteligente e preview de diff
- CRUD inline de lançamentos gerenciais (edição, adição e remoção de linhas)
- Saldos iniciais editáveis por conta (Itaú, Asaas, Blimboo, Clara)
- Projeção diária acumulada espelhando cálculo da planilha de curadoria
- Tokens semânticos de gráfico: `--chart-axis-tick`, `--chart-grid`, `--chart-success`, `--chart-warning`, `--chart-danger`, `--chart-neutral`, `--chart-info`
- Layout admin compartilhado em `src/app/admin/layout.tsx`
- ADR-0089 — Fluxo de Caixa Gerencial
- ADR-0090 — Tokens semânticos de gráfico
- `aria-label` em inputs date dos filtros de período

### Alterado
- 25+ hex hardcoded em componentes Recharts substituídos por `var(--chart-*)`
- Subtítulo diferenciador na Section "Fluxo de Caixa Diário": *Baseado em lançamentos de Contas a Pagar/a Receber*
- Migrado `xlsx` para `@e965/xlsx` (fork ativamente mantido, sem vulnerabilidades)

### Removido
- Vista admin `/admin/contas-bancarias` (não utilizada na prática)
- 6 RPCs órfãs: `get_fluxo_caixa_mensal`, `get_fluxo_caixa_mensal_b`, `get_historico_12m`, `get_proximos_vencimentos`, `get_proximos_vencimentos_v2`, `get_config_numeric`

### Corrigido
- Vulnerabilidades npm via `npm audit fix` (`brace-expansion`, `ws`, `next`)
- `labelFormatter` em `CustomTooltip` tipado corretamente para compatibilidade com Recharts

---

## [4.5.0] — 2026-05-28

### Adicionado
- Tokens CSS semânticos para cores de subsetores Weddings (`--subsetor-comercial`, `--subsetor-planejamento`, `--subsetor-producao`, `--subsetor-hospedagens`, `--subsetor-extras`)
- Página `/admin/design-system` — catálogo visual de tokens e componentes
- Filtros de tipo (Todos / A pagar / A receber) em Próximos Lançamentos com pills sticky no drawer
- Parâmetro `p_tipo` na RPC `get_proximos_lancamentos` (migration 0091)
- YoY nos cards de subsetor Weddings — aguarda extensão da RPC `get_sumario_subsetor` (pendência M3b)
- Relatório de audit completo em `docs/audits/2026-05-28-audit-completo-v4-5.md`
- ADR-0087 — Tokens semânticos consolidados
- ADR-0088 — Filtros sticky e padrão tabular em Próximos Lançamentos

### Alterado
- Próximos Lançamentos reformulado em formato tabular com 3 colunas (ícone+data | pessoa/descrição | valor)
- Card principal KPIs Weddings: padding compactado (sem vazio excessivo abaixo de "Ver mais ›")
- Cards Weddings: removido indicador MoM — exibido apenas YoY
- "Composição do Período" renomeada para "Composição dos Lançamentos" com subtítulo "no período selecionado"
- Cores de subsetores migradas de hex hardcoded para tokens semânticos `var(--subsetor-*)`
- Nota retroativa adicionada ao ADR-0071/0081 sobre uso de `var(--danger)` em pontos de gráfico negativos

### Corrigido
- Função `calcularDuracao` em Lista de Operações Weddings: timezone-safe + silencia durações negativas
- Import não usado em `periodo-filter.tsx`
- Card residual com `border border-[--border]` migrado para `shadow-sm`

### Removido
- RPC `get_sparklines` — morta no frontend desde v3.9 (migration 0090)
- Migration 0089 (`get_kpi_weddings_drawer`) descartada definitivamente — drawer KPI usa RPCs existentes

### Pendências registradas para v4.6+
- YoY nos cards de subsetor (aguarda extensão da RPC `get_sumario_subsetor`)
- Middleware de proteção `/admin/*` (atualmente depende de proteção upstream)
- 7 RPCs órfãs no banco
- Vulnerabilidades npm (next, xlsx — sem fix oficial disponível)
- Ver relatório completo em `docs/audits/2026-05-28-audit-completo-v4-5.md`

---

## [4.4.0] — 2026-05-27

### Adicionado
- ADR-0084: modelo de versionamento X.Y.Z formal
- ADR-0085: padrão único de Card no design system (sem sombra, border-radius 12px)
- ADR-0086: drawer rico para KPI principal Weddings
- CHANGELOG.md na raiz do repositório
- Sidebar exibe versão completa MAJOR.MINOR.PATCH
- KPIs Weddings reformulados: 1 card principal + 5 subsetores (Layout A)
- Drawer rico no card principal Weddings (gráfico, YoY, tendências, métricas, composição)
- Vista admin `/admin/contas-bancarias` para classificação de dim_conta_bancaria
- CalendárioLiquidez redesenhado: heatmap com intensidade proporcional ao saldo
- Tabela Próximos Lançamentos redesenhada: formato minimalista com paleta dessaturada
- Drawer Próximos Casamentos: pills 3m/6m/12m + subtítulo

### Alterado
- Padrão visual de Card unificado em todo o produto (sem sombra, rounded-xl)
- Sidebar mostra 'version 4.4.0' com 3 níveis (era major.minor)
- Gráficos Fluxo Mensal e Acumulado com eixo X alinhado verticalmente

### Corrigido
- Fundo vermelho removido das linhas da tabela Vendas com Receita Negativa
- RPC `get_proximos_lancamentos_10d` substituída por `get_proximos_lancamentos(p_dias)`
- UNIQUE constraint adicionada em `analytics.dim_produto_subsetor.produto_normalizado`

### Removido
- RPC `get_proximos_lancamentos_10d` (inerte após migração para versão paramétrica)

---

## Referência histórica (versões pré-convenção)

*Versões anteriores a 4.4.0 não seguiam a convenção X.Y.Z formal. Reclassificadas retroativamente como referência — ver ADR-0084.*

| Versão | Data aprox. | Principais mudanças |
|---|---|---|
| 4.3.0 | Maio 2026 | Reformulação visual Fluxo de Caixa; CalendárioLiquidez; ProximosLancamentos lateral |
| 4.2.0 | Mai 2026 | Feedback gestora Weddings; Composição por Subsetor; Vendas por Produto drag-and-drop |
| 4.1.0 | Abr 2026 | Fluxo de Caixa Abordagem B (regime caixa-banco); TopSection accordion |
| 4.0.0 | Mar 2026 | Aba Financeiro completa com Fluxo de Caixa v1 |
