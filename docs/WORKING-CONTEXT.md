# WORKING-CONTEXT — Janus

Última atualização: 2026-08-10 (fechamento da v5.6.0) · produção na **v5.5.1** (#224, 12h17) · **v5.6.0 — Inventário de Ativos — FECHADA e aguardando merge** (PR aberto; migrations `0247`/`0248` **já aplicadas** em 10/08, base vazia de propósito) · *Metas por subsetor de Weddings* em **STAND-BY** (liberou o número 5.4.4; migrations 0233–0235 aplicadas, código na branch, **não mergear**).

⚠️ **A URL de produção é `https://wt-janus.vercel.app`** — é o que está no Vault (`monde_app_url`) e o que todo cron chama. `wt-finance.vercel.app` é alias antigo do pré-rebranding; ele ainda responde, e por isso é armadilha: uma verificação feita contra ele passa e não prova nada sobre o que o cron faz. Dois docs citavam o antigo e foram corrigidos no pós-merge da v5.5.0.

> Verdade atual do projeto em UMA página. Toda sessão nova lê este arquivo antes de
> explorar o repositório (o hook `contexto-sessao` o injeta automaticamente; se o hook
> faltar, ler manualmente). Atualizado como parte do out-briefing de TODA versão/patch (DoD).
> Manter curto: o que mudou de verdade, não histórico — histórico é o CHANGELOG.

## Verdade atual

- **v5.6.0 — Gestão de Pessoas: Inventário de Ativos. FECHADA, aguardando merge.**
  Seção NOVA de sidebar (a primeira de 1º nível desde a v4.x) + módulo novo. Cadastro de
  equipamentos com ficha patrimonial e **razão append-only** de movimentações. Migrations
  **`0247`/`0248` APLICADAS** em 10/08; **ADR-0167**; **879 testes**; `revisor` e `revisor-db`
  com **0 CRÍTICO e 0 ALTO**.
  ⚠️ **A base está VAZIA de propósito** (0 ativos / 0 movimentações / 0 detentores; seed com 6
  categorias e 7 áreas) e a sequência foi reiniciada: **o primeiro ativo real será o WG-0001**.
  A área `gestao-pessoas/inventario` foi concedida no seed **só a quem já tinha `admin/acessos`** —
  o resto sai pelo editor de roles.
  **Duráveis desta versão:**
  *(a)* **`CHECK` com `CASE` sobre enum sem `ELSE false` é FAIL-OPEN.** `CASE` sem `ELSE` devolve
  NULL para valor não previsto, e **CHECK que avalia NULL é considerado SATISFEITO** — acrescentar
  um valor ao enum sem o ramo faria a constraint aceitar qualquer combinação. Foi para a skill
  `banco-e-rpc` **e** para o checklist do `revisor-db` (nota D-12).
  *(b)* **Contrato duplicado entre SQL e TS não se protege com comentário.** "As duas pontas mudam
  JUNTAS" estava escrito nos dois arquivos e nada reprovava. Virou `paridade-sql.test.ts`, que lê o
  SQL aplicado. ⚠️ Ele aponta para a migration **por nome**: alteração futura do CHECK vem em
  migration nova e o teste seguiria aprovando espelho obsoleto — o aviso está no topo dele.
  *(c)* **Checklist de regressão de navegação em prosa envelhece.** O modelo de navegação saiu de
  dentro do `sidebar.tsx` para `nav-model.ts` (puro) e a varredura virou `nav-model.test.ts`, que
  lê o inventário de rotas **do disco**: rota órfã da sidebar, href para rota inexistente, colisão
  de prefixo, e a paridade **"quem VÊ o item ALCANÇA a rota"**.
  *(d)* **Modal de formulário reusado precisa de `key` que MUDE** (contador de gerações) — o
  `useState` com initializer só roda na montagem, e a peça seguinte nascia com o código da anterior.
  *(e)* **Guard de resposta atrasada compara com o último PEDIDO, não com o estado atual** — a
  versão "intuitiva" (comparar com o detalhe já carregado) está **invertida** e descarta a resposta
  certa. As duas foram pegas na auto-auditoria, antes do commit; foram para `react-padroes`.
  *(f)* **Export para Excel pt-BR** = BOM UTF-8 + `;` + decimal com vírgula + CRLF, mais guarda de
  fórmula (`=`/`+`/`@` em célula de texto) e "valor ausente ≠ 0". Foi para `ingestao-planilhas`
  (o caminho de volta da mesma skill).
  *(g)* **RPC de listagem com teto de linhas não serve para o que precisa ser completo** — o
  histórico de um ativo vem de `detalhe_ativo` (e ganha leitura numa transação só, de graça); a
  aba do razão AVISA quando bate o teto, em vez de truncar calada.
  Out-briefing: `WT_Finance_Out_Briefing_v5-6-0_Inventario_Ativos.md`.
  **Pendente Yan:** mergear · cadastrar 3–5 ativos reais e movimentar · testar a retroativa ·
  conferir os dois CSVs no Excel · liberar a área para quem precisa · **print das quatro telas**
  (a conferência visual autenticada ficou NÃO VERIFICADA — sem MCP Playwright nesta sessão e o
  Chrome do Windows não alcança o `localhost` do WSL2; o guard da rota FOI verificado por `curl`).
- **v5.5.1 (#224, mergeada 10/08 às 12h17) — ajustes de apresentação + "Margem Teórica (a.a.)".**
  Migration **`0246`** aplicada. Três pedidos do Yan depois de ver a v5.5.0 no ar: o gráfico virou
  **"Rendimento Potencial do Caixa Livre"** (sem o total "na janela", sem subtítulo, linha do saldo
  real em PRETO, igual à do "Resultado mensal"); "Rend. Float" virou **"Rend. Teórico"** e as duas
  colunas teóricas foram para o FIM da tabela; e entrou a **"Margem Teórica (a.a.)"** =
  `(resultado + rend_float) ÷ faturamento`, anualizada pela régua LINEAR da Margem (a.a.).
  **Duráveis:**
  *(a)* ⚠️ **A coluna nova CONTRARIA a Decisão 5 do ADR-0166** (que proibia somar float a
  resultado/margem/faturamento). Registrada como **EMENDA DATADA** no ADR, não como exceção
  silenciosa: a proibição segue como regra geral e passa a existir **uma exceção NOMEADA** —
  rótulo "Teórica", tooltip declarando o componente não-contábil, colunas contábeis intactas ao
  lado. O que continua proibido é embutir float num número que se APRESENTE como contábil.
  *(b)* **Percentual que o cliente também poderia derivar deve ser arredondado UMA VEZ, no SQL.**
  `ROUND()` do Postgres é meio-para-longe-de-zero e `Math.round` do JS é meio-para-cima: nos
  NEGATIVOS os dois discordam na 1ª casa, e a coluna exibiria número diferente do que o `ORDER BY`
  usa. Por isso `margem_teorica_pct` viaja pronto no payload, e o cliente só anualiza.
  *(c)* **A Lista TRANSBORDA na horizontal com 12 colunas — e isso é ACEITO** (decisão do Yan).
  Medido: faltavam 62px. A alternativa foi construída e FUNCIONAVA (data curta `20/07/26` com o
  rótulo virando "Data" + os três "?" fundidos num tooltip único ⇒ transbordamento ZERO), e foi
  descartada depois de vista na tela: **legibilidade venceu a ausência da barra**. Fica valendo
  `ScrollAutoHide` com as duas teóricas atrás da rolagem.
  *(d)* **Quando o valor de uma coluna encurta, quem passa a mandar na largura é o RÓTULO.**
  Com `20/07/26` na célula, "Data do Evento" seguia custando 124px de cabeçalho para ~60px de
  conteúdo — encurtar o valor sem encurtar o título não devolvia largura nenhuma.
  Out-briefing: o da v5.5.0 (`WT_Finance_Out_Briefing_v5-5-0_Rendimento_Float.md`) segue válido;
  esta versão é patch e vive no CHANGELOG + na emenda do ADR-0166.
- **v5.5.0 (#222, mergeada 10/08 às 10h49) — Weddings: Rendimento potencial do float.** Mede quanto o
  caixa recebido antecipadamente de cada operação renderia a **100% do CDI**, em regime
  **composto** (`saldo_virtual(t) = saldo_virtual(t−1) × (1 + i_t) + fluxo_t`; indicador =
  virtual − real), **simétrico** (saldo negativo gera custo teórico, sem ramo especial) e
  **projetado** (efetivados por liquidação, previstos por vencimento — a régua da 0141).
  Taxa alimentada sozinha da **API SGS do BACEN, série 4391**. Três pontos de UI: coluna
  "Rend. Float" na Lista, bloco no drawer, gráfico de duas curvas no card de Fluxo de Caixa.
  **ADR-0166**; migrations **`0238`–`0243` APLICADAS**; **753 testes**.
  **Duráveis desta versão:**
  *(a)* **Série de taxa pública publica o MÊS CORRENTE PARCIAL — e o carry-forward espalha isso
  pelo futuro inteiro.** O SGS devolveu ago/2026 = 0,21% (acumulado de 7 dias). Como a projeção
  repete a última taxa conhecida sobre todos os meses à frente, o rendimento projetado saía
  **cinco vezes menor**, e plausível. Corrigido nas DUAS pontas: a ingestão não grava mês aberto
  (lendo o mês pelo fuso de **SP** — em UTC, na última noite do mês, um mês aberto viraria
  fechado) e a **leitura** não aceita mês aberto (`0240`). Só a escrita não bastava: a linha
  parcial já estava gravada e apagá-la seria destrutivo.
  *(b)* **`WITH RECURSIVE` NUNCA é inlineada pelo planner** ⇒ sem pushdown de filtro: uma view
  recursiva injetada numa RPC viva recomputa por inteiro a cada chamada, mesmo com filtro
  estreito. Achado ALTO do `revisor-db`.
  *(c)* **Sequenciar a aplicação resolve o "não dá para medir antes do push"** sem staging:
  aplicar primeiro o que é superfície 100% nova (risco zero), MEDIR contra produção, e só então
  ligar no caminho vivo. Medido: a Lista foi de 2304 → **2660 ms frio** (teto do role = 8000),
  então materializar **não** era necessário — e materializar teria custado caro, porque
  MATERIALIZED VIEW não aceita `CREATE OR REPLACE` e congelaria a métrica atrás de uma destrutiva.
  *(d)* **`pg_net` é ASSÍNCRONO e não há extensão HTTP síncrona no projeto** ⇒ "o banco busca e
  grava no mesmo corpo" não é executável aqui; vale `pg_cron` → `net.http_post` → rota interna.
  *(e)* **Arredondar as partes e o total independentemente** faz a soma não fechar por 1 centavo
  onde os três aparecem juntos na tela (`0242`).
  *(f)* **`Area` de faixa no Recharts** (`dataKey` devolvendo um par) entra no tooltip como ARRAY
  e imprime `R$ NaN`; **`tooltipType="none"` não basta** — é preciso filtrar o payload.
  *(g)* **Chave de ordenação da Lista atravessa QUATRO camadas** — cabeçalho → querystring →
  **enum Zod da rota** → `CASE` do SQL — e as pontas falham de formas OPOSTAS: faltar no SQL
  ordena por outra coisa em SILÊNCIO; faltar no enum devolve **400 e derruba a tela**. `rend_float`
  entrou em três e não no enum; passou por tsc/lint/build/744 testes porque a verificação foi por
  **REST direto contra a RPC**, que pula justamente essa camada. CRÍTICO do `revisor`. Agora há
  guard mecânico (`src/lib/weddings/ordenacao-operacoes.test.ts`) que lê o `CASE` da migration e
  compara com o enum nas **duas** direções — **visto reprovando** o defeito.
  *(h)* **`GREATEST`/`LEAST` do Postgres IGNORAM NULL** (`GREATEST(NULL,0)` = `0`), e `SUM` também.
  As duas coisas juntas transformavam "não sei" em "zero": com a tabela de taxas vazia o indicador
  saía `0.00` em vez de NULL, e a coluna exibiria **"R$ 0,00" para o portfólio inteiro**. ALTO do
  `revisor`; corrigido na `0243` com `CASE` explícito — **não confiar em propagação de NULL** num
  agregado.
  *(i)* ✅ **A conferência visual autônoma FUNCIONA pelo MCP do Chrome** (`claude-in-chrome`),
  onde o Playwright não sobe em background. Estreia nesta versão, e **pegou 2 defeitos** que
  tsc/lint/build/744 testes deixaram passar (o NaN do tooltip e "Custo teórico R$ 0,00" em
  vermelho). **Limite duro:** o agente NÃO faz login — a sessão tem de já existir no Chrome.
  ✅ **PÓS-MERGE CONCLUÍDO (07/08).** `0244` (agendamento) e `0245` (faixa de plausibilidade)
  aplicadas. O job **`cdi-ingest-mensal` está ATIVO** em `cron.job`, `0 9 3 * *` (dia 3, 06:00 SP).
  Ordem respeitada: merge → deploy no ar → **disparo manual em produção** (HTTP 200,
  `mes_max: 2026-07-01`, o mês FECHADO) → idempotência (2ª chamada `novas: 0, alteradas: 0`) →
  só então agendar. **A série foi RECONCILIADA mês a mês contra a API do BACEN: 24 meses
  conferidos, 0 divergências.**
  ⚠️ **A verificação por pouco não valeu nada:** o 1º disparo foi contra `wt-finance.vercel.app`
  (a URL que os docs citavam), e o Vault aponta para **`wt-janus.vercel.app`**. O alias antigo
  responde 200, então o teste "passava" sem provar nada sobre o host que o cron chama. Só a
  comparação explícita `vault.monde_app_url = <host testado>` pegou — e ela deu **false**.
  Refeito contra o host certo: 200. **Sempre conferir a URL que o cron MONTA, não a que você acha
  que é** (a v5.4.4 já mandava fazer isso; aqui a regra pagou pela segunda vez).
  **A `0245` é hardening ADITIVO no lugar do `DROP CONSTRAINT` que o `revisor-db` propôs:** uma
  restrição NOVA de ±5% a.m. convive com a frouxa de ±100%, e o INSERT satisfaz as duas ⇒ mesmo
  limite efetivo, sem destrutiva e sem humano em TTY.
  **PENDENTE do Yan:** validar a premissa da taxa futura · **em 03/09 conferir
  `cron.job_run_details`** (1º ciclo real) e que a linha de ago/26 foi substituída pelo valor
  fechado · decidir sobre o fundo do bloco no drawer (estética).
  **Resíduo declarado:** a linha de ago/2026 com a taxa PARCIAL segue gravada em `dim_taxa_cdi`,
  **inerte** pelo filtro da 0240; é substituída pelo valor fechado na 1ª ingestão de setembro.
  Out-briefing: `docs/briefings/WT_Finance_Out_Briefing_v5-5-0_Rendimento_Float.md`.
- Versão em produção (main): **`5.4.5`** (#220 mergeado 05/08 às 21h09). **O espelho retinha
  venda que a origem já não reconhecia.** O `transformSale` filtrava `status='active'` **na
  escrita** e descartava a venda sem item ativo; como o UPSERT só escreve sobre o universo que
  pediu, ela ficava **invisível para a escrita** e a linha velha sobrevivia congelada. Medido nos
  12 meses: **24 vendas, R$ 896.718,90 de faturamento, R$ 282.422,05 de receita**; jul/2026 com
  **25,19% da receita** inflada. **`0237` APLICADA e os 12 meses REPROCESSADOS** (autorizado pelo
  Yan): faturamento **−R$ 864.917,26**, receita **−R$ 267.370,33**. **ADR-0165**; 711 testes.
  **Duráveis desta versão:**
  *(a)* **O filtro de negócio mora na LEITURA.** A mv já filtrava `status='active'` desde a 0179 e
  era **código morto** havia 6 versões (47.182 itens, todos ativos). Gravar o cancelado bastou —
  a venda 100%-cancelada contribui zero **sozinha**. A falha deixou de ser possível, em vez de
  detectável.
  *(b)* **MATERIALIZED VIEW NÃO ACEITA `CREATE OR REPLACE`.** Alterar a `mv_vendas_diarias` exige
  `DROP`+`CREATE` ⇒ classificador diz **destrutiva** ⇒ agente não aplica; e `mv_vendas_diarias_compat`
  **depende** dela (`pg_depend`), então o `CASCADE` derruba a fonte de Metas e Performance. Foi o
  que evitou seguir o desenho literal do briefing.
  *(c)* **`vendas − vendas_que_contam` é métrica INVERTIDA para detectar venda retida** — dá zero
  justamente quando o defeito existe (a retida tem itens *ativos* velhos). Um teste sobre ela
  passa com o defeito e reprova depois da correção. **O detector é o tripwire**, por mês verificado.
  *(d)* **Reprocessar um mês em dev ESCREVE em produção** (mesmo banco): "provar sem aplicar" exige
  dry-run rodando as duas versões do código sobre o mesmo input — foi assim que se provou
  **776 vendas idênticas, 0 mudam** (a versão não altera cálculo nenhum).
  *(e)* **Não é "tudo cai":** dez/2025 e fev/2026 tiveram receita **subindo** (a venda retida lá
  tinha receita negativa). Correção acerta o número, não o reduz por definição.
  **Estado do espelho:** 193 vendas e 529 itens preservados como **cancelados** — ficam para
  auditoria e não somam. O cartão de `admin/uploads` mostra "Vendas que contam" + "+N canceladas".
  **PENDENTE do Yan:** conferência visual do cartão · **comunicar à diretoria** (julho cai ~R$ 296
  mil de receita; dez/2025 e fev/2026 sobem — e a v5.4.4 tinha feito julho **subir**; a mensagem é
  *"os números ficaram certos"*, não *"caíram"*) ·
  **enviar a pauta ao provedor do Monde** (§8 de `docs/briefings/briefing-v5-4-5-espelho-fiel.md`,
  ainda não enviada — 7 pedidos com o número medido de cada um; o 8.1, filtro por data de
  ALTERAÇÃO, dispensaria a varredura diária inteira).
  **Resíduo declarado:** venda que **mude** para Welcome/sem-setor depois de espelhada ainda
  ficaria retida (zero casos medidos) — tratá-la exigiria a mudança destrutiva de *(b)*.
  Out-briefing: `docs/briefings/WT_Finance_Out_Briefing_v5-4-5_Espelho_Fiel.md`.
- A v5.4.4 (#217 mergeado 04/08 às 16h31) foi a **irmã desta**, e atacou o MESMO mecanismo pelo
  lado oposto: lá o espelho **perdia** venda (subnotificava, 42 vendas / R$ 392.070,01); aqui ele
  **retinha** venda morta (supernotificava). Juntas fecham a assimetria — a sincronização passou a
  buscar o que faltava **e** largar o que morreu.
  **O espelho do Monde perdia venda lançada com atraso, e Metas/Performance subestimavam
  faturamento.** A API filtra a listagem por DATA DA VENDA e a janela do incremental (`hoje−2d`)
  anda para frente sobre um eixo que a origem escreve para trás ⇒ venda registrada com atraso
  **nunca** entrava, e nunca mais entraria. Medido contra a API: **42 vendas, R$ 392.070,01**;
  37 de 38 registradas >2 dias após a data da venda, atraso mediano 4, **máximo 32**.
  Corrigido com **janela curta + varredura diária** (incremental `hoje−7d` + `mode=reconciliacao`,
  1 mês/invocação ciclando 3 meses por cursor) — **auto-curativa**, não depende de acertar
  tamanho de janela. **Recuperadas no run de verificação: 38 vendas de jul/2026
  (R$ 383.600,25) + 1 de jun**; espelho de julho 713→751. Idempotência provada (2ª passada: 0
  inseridas de 775). **ADR-0164**; migration **0232 APLICADA**.
  **Duráveis desta versão:** *(a)* `monde_ingest_limpar_staging` dá TRUNCATE em staging
  **COMPARTILHADA** no início de toda janela — duas ingestões sobrepostas apagam as linhas uma da
  outra (perda silenciosa). Race **pré-existente**; agora há lock durável em `monde.ingest_control`
  com TTL e **release que compara o dono** (release incondicional deixaria um `finally` distraído
  soltar lock de processo vivo). Advisory lock não serve: a janela atravessa várias chamadas HTTP
  sobre conexões pooladas. **TTL tem de ficar > 2× o `maxDuration` da rota.** *(b)* **Tripwire por
  contagem crua contra a API é impossível** — a API conta o que a transformação exclui por regra
  (jul/2026: 8 Welcome + 12 sem setor + 9 sem item ativo, de 775), então acende todo mês para
  sempre. Virou subproduto da reconciliação, que já tem o detalhe e portanto a contagem exata.
  *(c)* `ultima_sincronizacao` agora é **só do incremental** — `ultimo_promover` avançava com a
  reconciliação e mascararia por ~45 min um incremental morto. *(d)* **Migration que agenda cron
  para um modo que o código ainda não tem responde 200 e fica VERDE** em `cron.job_run_details`
  sem fazer nada — agendamento só depois do deploy.
  *(e)* **APLICAR MIGRATION DE BRANCH NÃO MERGEADA TRAVA O `db push` DE TODA OUTRA BRANCH.** A
  `0232` foi aplicada daqui e ficou aplicada-sem-arquivo-no-main; a sessão paralela bateu em
  `LegacyDbPushMissingLocalError` e só destravou trazendo os arquivos (PR #215). **Quem aplica
  migration antes do merge assume essa dívida** — o certo é avisar as sessões paralelas na hora,
  ou mergear o arquivo primeiro.
  ✅ **`0236` APLICADA no pós-merge (04/08).** As 3 entradas (`monde-reconciliacao-1/2/3`,
  06:05/06:20/06:35 UTC = 03:05/03:20/03:35 SP) estão `active` em `cron.job`, chamando
  `mode=reconciliacao` com `timeout_milliseconds` 320000; o `*/15` do incremental ficou intocado
  (timeout 120000). Ordem respeitada: **primeiro provei o deploy em produção** (`mode=auditoria`
  → 200 com o shape novo; `mode=reconciliacao` → 200, idempotente, tripwire apurado), **depois**
  agendei — agendar antes é o CRÍTICO que o revisor-db barrou. A URL que o cron monta foi conferida
  literal contra a que eu chamei à mão. **1º ciclo real: 06:05 UTC de 05/08** — conferir
  `cron.job_run_details`.
  ⚠️ **A 1ª tentativa de aplicar a `0236` FALHOU** por erro meu: citei a expressão de cron do
  incremental dentro de um comentário `/* */`, e a sequência que fecha bloco encerrou o comentário
  no meio — o resto virou SQL (`syntax error at or near "15"`). **Rollback foi limpo** (a transação
  do `db push` desfez tudo: nenhum job criado, nada no histórico). Regra: **nunca citar expressão
  de cron dentro de comentário de bloco** — o DOWN da 0236 usa `--` por isso.
  Ainda pendente do Yan: conferência visual do cartão novo em `/admin/uploads` (hoje deve estar
  **vermelho**, e está certo — ver abaixo) e decidir sobre as vendas "sobrando".
  **Achado registrado e NÃO corrigido:** **5 vendas em jul/2026 e 5 em jun/2026 continuam no
  espelho tendo deixado de ser espelháveis** (perderam o último item ativo depois de ingeridas; o
  UPSERT nunca remove). É o que mantém o tripwire aceso. Remover é destrutivo e faria faturamento
  de mês fechado CAIR — decisão do Yan.
  ⚠️ **O header da `0232` diz "v5.4.5" e cita a "0233" — as duas referências estão velhas de
  propósito.** Esta versão nasceu como 5.4.5 e foi renumerada para **5.4.4** DEPOIS de a migration
  ser aplicada; o agendamento virou **0236**. O arquivo **não foi editado**: o banco guarda os
  `statements` em `supabase_migrations.schema_migrations` (14 para a 0232, conferido), então mexer
  no arquivo o faria divergir do histórico. Migration aplicada é registro, não rascunho.
  Out-briefing: `docs/briefings/WT_Finance_Out_Briefing_v5-4-4_Reconciliacao_Espelho_Monde.md`.
- ⚠️ **BANCO À FRENTE DO CÓDIGO: migrations `0233`–`0235` estão APLICADAS em produção e o main
  só tem os ARQUIVOS delas** (trazidos pelo PR #215). Vieram da versão *Metas por subsetor de
  Weddings*, que entrou em
  **STAND-BY** (o eixo de subsetor segue dependendo do upload manual; repontar ao Monde exige um
  de-para de produto que ainda não existe). O código da feature está na branch
  `feat/v5-4-4-metas-subsetor-weddings` (**não mergear**), com out-briefing completo.
  **Sem estes arquivos aqui, o próximo `db push` de QUALQUER branch quebra** com
  `LegacyDbPushMissingLocalError` — foi exatamente o que aconteceu com a `0232`, que estava
  aplicada e só existia numa branch não mergeada.
  **O que está no banco, inerte:** `app.meta_subsetor` e `app.meta_subsetor_historico` (vazias);
  `metas_subsetor_listar`, `metas_subsetor_upsert` e `metas_sumario_subsetor` (sem call-site
  publicado); e a chave `produtos_nao_classificados` no payload de
  `get_sumario_subsetor__nucleo` (aditiva — os 3 consumidores da Performance fazem cast solto e
  ignoram chave desconhecida).
  **A `0235` é conserto de INCIDENTE, não parte da feature:** a `0234` fez `metas_upsert` recusar
  Weddings, o que só faz sentido com o front da feature. Com o front vigente — que envia TODOS os
  setores e cujo lote inteiro morre no `RAISE` — o **Cadastro de Metas parou de salvar em
  produção**, inclusive Trips e Corporativo quando havia célula de Weddings suja. A `0235` removeu
  a trava; verificado por REST sem escrever nada.
  ⚠️ **`ADR-0163` está RESERVADO** pela branch em stand-by — não reutilizar o número.
  📄 **Consolidado dos achados (LER antes de retomar ou de tocar o Scope B):**
  `docs/investigacoes/2026-08-04-metas-subsetor-e-de-para-monde.md` — o de-para Monde→subsetor
  medido (7 `product_kind`; repontar hoje casaria só **46%** do faturamento; 4 regras de kind cobrem
  57% e a curadoria real são ~22 descrições), o post-mortem do incidente (**migration aditiva no
  schema pode ser incompatível com o front NO AR**), a divergência de fonte que variou de 0,00 para
  40% no mesmo dia, e as 6 decisões de produto já tomadas.
- A v5.4.3 (#211 mergeado 04/08 às 13h08) foi um PATCH de dois defeitos
  relatados pelo Yan a partir de um erro real em produção. **Sem migration, sem ADR.**
  (1) **Anexo com acento no nome não subia.** A chave do objeto no Storage era montada com o nome
  CRU (`tmp/<uuid>/${file.name}`) e o `isValidKey` do Supabase Storage usa `\w` **sem a flag `u`**
  — só `[A-Za-z0-9_]`. O `ã` de "Nota Fiscal - Bruna e João.pdf" era o **único** caractere ilegal
  (espaço, `-` e `.` são aceitos) ⇒ `400 InvalidKey`, com a mensagem crua vazando para a tela.
  **Determinístico POR NOME**, e é isso que fazia parecer intermitência: os dois anexos que o
  usuário subiu antes eram ASCII puro. Falha igual em NFC e NFD (no macOS o combinante U+0303
  também está fora do `\w`).
  **A correção já existia no repo, no lugar errado:** o Acervo tinha `sanitizarNomeArquivo` desde
  a v4.34.0 e o docstring **documentava a divergência** — *"Diferente de Solicitações … usa o nome
  cru"* — sobre uma premissa **falsa** (restrição de MIME não tem relação com validade de chave).
  Promovido a `lib/storage/nome-arquivo.ts` sem mudança de comportamento; as duas pontas
  consomem. Custo zero ao usuário: `nome_arquivo` sempre guardou o nome original e é dele que a
  UI tira o rótulo. O `move` para `sol/…` ficou seguro pela correção na origem.
  (2) **Erro do modal de nova solicitação nascia fora da vista:** a faixa era o 1º elemento do
  corpo rolável e o botão "Enviar solicitação" o último — quem clicava não via a mensagem e o
  modal parecia travado. Barra de ação **e** faixa foram para o **`rodape` FIXO do
  `ModalCentral`** (prop que já existia; `editor-dre` e `revisar-envio-modal` já a usavam) = DS
  §4.1. **Mover só a faixa não resolveria:** o corpo rola, e inserir a faixa acima do botão num
  container rolado até o fim **empurraria o botão para fora do viewport**. No rodapé fixo o painel
  tem altura fixa e o corpo é `flex-1 min-h-0` ⇒ o rodapé crescer só **encolhe o corpo**, o botão
  não se mexe. De carona, o botão passou a ficar **sempre visível**.
  **Duráveis:** chave de Storage aceita **só ASCII** — nome vindo do usuário nunca vai cru para
  chave (candidato a lint `wt/*` quando aparecer um 3º call-site de `.upload()`; hoje são 2, os
  dois pelo helper); **`.env.local` é gitignored e NÃO vem no `git worktree add`** — o 1º
  `npm run build` da worktree falha no prerender de `/_not-found` por env ausente (candidato a
  passo do `/nova-versao`) — **e sem `.env.local` a suíte parece verde tendo pulado os 112 casos
  de contrato contra o banco real**, que se auto-skipam sem credencial: 570+112-skip virou
  **682 passando** depois de copiar o env, e o nº de testes é a única pista disso;
  num modal `alturaFixa`, conteúdo que cresce no **rodapé** encolhe o
  corpo em vez de deslocar o botão — é o que torna o rodapé fixo a resposta certa para
  "mensagem perto do botão".
  **Provado contra produção** (não só teste): chave com `ã` ⇒ `400 InvalidKey` com **exatamente**
  a mensagem do print; a chave que o helper gera ⇒ `200`, e o `move` para `sol/…` ⇒ `200`.
  Diagnósticos removidos, prefixos conferidos vazios. Medido em `app.solicitacao_anexo`:
  **`nao_ascii = 0`** em 3 anexos ⇒ nenhuma chave acentuada jamais entrou, o bloqueio **sempre foi
  total**; sem migração de dados. **13 testes** novos que replicam o `isValidKey` real.
  Gates: `tsc` limpo, lint limpo, **682 testes** (zero skip), build OK.
  Out-briefing: `docs/briefings/WT_Finance_Out_Briefing_v5-4-3_Anexo_Acento_Erro_Modal.md`.
  **PENDENTE do Yan:** (1) **conferência visual do modal EM PRODUÇÃO, agora que está no ar** — não
  consegui (mesma limitação de sempre: tela autenticada, `307 → /login`, MCP Playwright não sobe em
  background): erro com o modal rolado ao topo **e** ao fim (o botão não deve se deslocar), o
  `border-t` novo do rodapé, um tipo com muitos campos dinâmicos, e anexar de fato um arquivo com
  acento conferindo que o rótulo exibido **mantém** o acento — este último é a **prova de ponta a
  ponta do fix**, e o caminho mais direto é reabrir o pedido que falhou com o mesmo PDF do
  "João"; (2) **decidir se despacha `revisor` e `verificador-visual`** — não foram despachados (as
  instruções da sessão proibiam subagente sem pedido explícito, o que colide com o DoD; a
  auto-auditoria adversarial foi feita pelo orquestrador, que é barreira dura). Sem migration/RPC,
  `revisor-db` não se aplica.
- A v5.4.2 (#209 mergeado 03/08 às 17h22) foi **Weddings: margem
  anualizada + Fluxo de Caixa unificado**, e o padrão do slider estendido ao **Fluxo de Caixa do
  Financeiro**.
  Migrations **0228 e 0229** já APLICADAS e verificadas (as duas aditivas); **ADR-0162**.
  (1) Coluna **"Margem (a.a.)"** na Lista de Operações: anualização **LINEAR**
  (`margem × 12 / duração_meses`), nunca composta — 17,5% em 30,4 meses valem **6,9% a.a.**
  `Duração = data_evento − data_venda_contrato` em meses de **30,44 dias**, a MESMA régua nas três
  pontas (display, cálculo, ORDER BY do SQL). Ciclo curto é **sinal, não cap** (o valor vai cru; o
  **"?"** do cabeçalho explica). Cor = **mesma faixa da "Margem"** (decisão do Yan; medido: 33% das
  operações caem em banda diferente nas duas colunas).
  (2) **Fluxo de Caixa** virou **um card só** com **slider de janela entre os gráficos** (limite
  **36 meses para cada lado**): a RPC devolve a janela larga (37+36) **uma vez** e o cliente
  **fatia** — arrastar não refetcha. **Acumulado REINICIA na borda esquerda** e a referência de
  saídas é recalculada na janela (as duas coisas **juntas**, testado como igualdade). TopSection
  própria "Fluxo de Caixa": filtro no topo → card de totais → card dos gráficos.
  (3) **O mesmo slider entrou no gráfico mensal do FINANCEIRO** (sem acumulado, título do card
  mantido). Lá a migration **0229** foi necessária de verdade: a janela daquela RPC é
  **hardcoded no corpo** (23+18 → 36+36), ao contrário da de Weddings. **Nenhum número muda**
  (cada mês é agregado do próprio mês) — provado por cross-check contra
  `get_fluxo_caixa_kpis_b`. Helper próprio (`lib/fluxo/janela-mensal`, 17 testes) porque
  recortar aqui **não rebaseia** nada. Trilho NEUTRO (a tela já tem o slider do Projetado);
  paleta `--positive`/`--negative` preservada.
  (4) **Bug SISTÊMICO corrigido:** filtro que navega no lugar fazia a página **saltar ao topo**
  (`router.push` sem `{ scroll: false }`) — 8 call-sites em Weddings, Financeiro, Metas e
  Solicitações. O padrão já estava documentado na skill `react-padroes` e **perdia de 7 a 2**:
  caso exemplar de que prosa não segura, candidato a regra de lint (D5).
  **Duráveis desta versão:** a janela do `get_acumulado_weddings` **sempre foi parâmetro do
  chamador** (0141 clampa em 120/60) — o briefing pedia migration para alargá-la e **não
  precisava**; em troca, coluna derivada **ordenável** numa lista paginada no SERVIDOR **exige**
  chave de ordenação em SQL, porque a whitelist termina em `ELSE 'd_data_evento'` (**fallback
  silencioso**); `total_saidas` da RPC **muda com a janela buscada**, então referência de gráfico
  fatiado tem de ser recalculada no cliente; **item de flex encolhe abaixo do próprio conteúdo** e
  valor de 8 dígitos invade o vizinho (`shrink-0`) — passava por tsc/lint/build/testes verdes;
  **o `Tooltip` do DS abria só no HOVER** (agora abre no foco também) e `<span>` como gatilho
  não entra no tab-order — dica de cabeçalho ficava invisível para teclado.
  Out-briefing: `docs/briefings/WT_Finance_Out_Briefing_v5-4-2_Weddings_Margem_Fluxo.md`.
  **PENDENTE do Yan:** (1) **conferência visual da tela real** — não consegui (tela autenticada,
  MCP Playwright não sobe em background, `BYPASS_AUTH` é resíduo morto): conferir o balão do "?" da
  coluna nova, o card único dentro da TopSection e o gráfico mensal do Financeiro com o slider;
  (2) **anomalia de DADO** exposta pela coluna nova — *"Darlene e Adnan - DDMMAA"* com
  `margem_liquida_pct` = **782%** (única acima de 100%; nome parece template inacabado), hoje no
  topo ao ordenar por "Margem (a.a.)"; (3) **2 call-sites do "?" ainda inacessíveis por teclado**
  (`faturamento-corp`, `posicao-projetado`) — `<span>` → `<button>`, uma linha em cada, com a
  metade do primitivo já pronta.
  **REVISÃO FEITA:** `revisor` **APROVADO COM RESSALVAS** (1 ALTO — a acessibilidade do "?" —
  e 1 MÉDIO — a skill do DS ensinava o eixo TROCADO do gutter do `ScrollAutoHide` —, ambos
  CORRIGIDOS; 3 BAIXO registrados) e `revisor-db` **APROVADA** nas duas migrations (0 CRÍTICO /
  0 ALTO; o MÉDIO virou caso de contrato permanente da ordenação, **visto reprovando** com 97
  quebras). A **0229 entrou depois da 1ª rodada**, então o `revisor-db` foi despachado de novo:
  **APROVADA COM RESSALVAS** — ele tentou refutar o "nenhum número muda" e não conseguiu, e o
  MÉDIO dele era justo (eu havia feito o guard permanente para a 0228 e **não espelhei para a
  irmã**): a janela agora tem caso de contrato próprio (largura ≥36/≥36, continuidade e
  cross-check com `get_fluxo_caixa_kpis_b`). Parecer integral no §6 do out-briefing. **669 testes.**
  **Pendência deliberada de a11y:** os outros 2 call-sites do "?" (`faturamento-corp`,
  `posicao-projetado`) ainda usam `<span>` — uma linha em cada, a metade do primitivo já pronta.
- A v5.4.1 (#207 mergeado 03/08 às 14h50) foi o **DRE: refino visual.**
  PATCH de apresentação: **nenhum número mudou**. Sem migration, sem ADR. (1) O **Resumo Executivo** passou a usar a gramática da tabela do
  mesmo card — cabeçalho 10px/caps, box, `ConteudoContabil` com "R$" esmaecido e negativo entre
  parênteses, linhas na cor de `blocoH` (`--band`, NÃO a banda escura dos totalizadores), rótulos em
  caixa alta com o prefixo contábil em coluna própria; o subtítulo virou o **"?"** ao lado do título.
  (2) **"Editar estrutura"** subiu para entre a tabela e o Resumo, **nos dois ramos de render**.
  (3) **Selo de última atualização** no alto do card, lendo `status_lancamentos_movimentacao` (0185)
  pelo admin client server-side — **sem migration** e sem abrir GRANT a `authenticated`. (4) A
  **Decomposição** ganhou pills abaixo do título, **cor plana** (as paletas de 5/7 tons saíram; só
  "Outros" e "Não classificadas" mantêm cor própria) e **drill inline sob a própria barra**, com a
  cortina do TopSection.
  **Rodada de ajustes (03/08, o Yan viu a tela):** o Resumo virou **card próprio** (some a
  duplicação nos dois ramos da `TabelaDre`, e a prop `anoCorrente` saiu dela); linhas do Resumo
  passaram para `--band-soft` (subgrupos) e **toda** célula ganhou cor por sinal; rótulos de
  variação alinhados à convenção do Consolidado (`Δ 24·25`, `Δ YTD 25·26`, e `Δ% 25·26` →
  **`Δ% YTD 25·26`** na tabela); na Decomposição o "‹ voltar" saiu e os dois **Totais ficaram fixos
  e alinhados na mesma linha**, com scroll próprio por lado (coluna flex `h-full max-h-[420px]` +
  grid `items-stretch` + `ScrollAutoHide`). ⚠️ **O `420px` é o número mais arbitrário da entrega** —
  candidato natural a ajuste depois da conferência visual.
  **Duráveis desta versão:** *(a)* `ConteudoContabil`/`corPorSinal` agora moram em
  `dre/celula-contabil.tsx` — **nunca copiar cor de célula entre componentes deste card**: os tons
  base dão 3,88–4,31:1 sobre as bandas claras e reprovam AA, e só `corPorSinal` sabe escolher os
  `-deep`; *(b)* **conteúdo dentro de cortina `grid-template-rows` tem de ficar MONTADO nos dois
  estados** (com `inert` no fechado) — desmontar no fechamento faz a cortina colapsar caixa vazia,
  abre animado e pisca ao fechar; *(c)* `UltimaAtualizacao` ganhou `vigiarAtraso` (default `true`):
  a régua de 45min é do **cron do Monde** e não vale para fonte de cadência humana.
  Out-briefing: `docs/briefings/WT_Finance_Out_Briefing_v5-4-1_DRE_Refino_Visual.md`.
  **Conferência visual: FEITA pelo Yan**, em 3 rodadas de screenshots antes do merge (a sessão não
  conseguiu fazê-la — background, o MCP Playwright não sobe e `/financeiro/dre` responde
  `307 → /login`). Ela produziu 9 ajustes, todos já no ar. Modelo que funcionou e vale repetir
  enquanto a verificação visual autônoma não existir: **entregar, mandar print, ajustar**.
  ⚠️ **`BYPASS_AUTH=true` existe no `.env.local` mas NENHUM código em `src/` a lê** — resíduo morto,
  não libera nem protege nada. Não contar com ela para verificação.
- A v5.4.0 (#191 mergeado 31/07 às 17h14) entregou a **API Externa do módulo de
  Solicitações**. Plataformas internas criam, consultam e cancelam solicitações por **chave de API**.
  O contrato é **PULL-ONLY**: o Janus não faz nenhuma chamada de saída — quem quer saber o desfecho
  consulta (`GET /api/externo/solicitacoes/{id}` ou `?referencia_origem=`). O disparo exige
  **`solicitante_email`** de pessoa cadastrada e ATIVA, que vira a solicitante de verdade (vê em
  "Minhas solicitações", recebe e-mails, cancela pela tela) — a procedência aparece no selo "via
  integração X". **Superfície de restrição mínima:** a chave existe e está ativa, e o tipo está
  `exposto_via_api` — não há lista de equipes por tipo nem de tipos por chave. Seis rounds de
  decisões do Yan pós-implementação extirparam, nesta ordem: referência de conclusão (R2), equipes
  por tipo (R3), robô como autor (R4), callbacks de saída (R5) e whitelist de tipos por chave (R6).
  Migrations 0210–0225 aplicadas. Out-briefing:
  `docs/briefings/WT_Finance_Out_Briefing_v5-4-0_API_Externa.md` (as seções de round 2 a 6 são a
  história das decisões).
  **PENDENTE do Yan:** (1) ~~patch destrutivo da coluna de whitelist~~ — **APLICADO** (arquivado como
  migration `0226`; a limpeza da chave TARS virou a `0227`, e `supabase/patches/` não existe mais);
  (2) criar a chave da integração na tela `/admin/api-externa` (o segredo é exibido UMA vez) e
  entregar `docs/api-externa-solicitacoes.md` ao Vitor, avisando dos dois pontos que mudaram o
  contrato: `solicitante_email` obrigatório e pull-only; (3) conferência VISUAL de
  `/admin/api-externa` — não consegui fazer (o dev server cai no login e o agente não digita
  credenciais) e a leva mudou bastante a tela.
- A v5.3.5 (#203 mergeado 31/07 às 10h56) corrigiu o fluxo público de solicitação de acesso: o
  `/solicitar-acesso` (linkado do login) **não gravava a pendência desde 13/07 14h13** e o usuário
  via tela de sucesso mesmo assim. **NÃO era banco:** o commit `8863a69` trocou
  `(supabase.rpc as ...)(...)` por `const rpc = supabase.rpc` + `rpc(...)` — **parênteses em torno de
  acesso a membro preservam o `this`; a ATRIBUIÇÃO destaca.** `SupabaseClient.rpc` é método de
  protótipo (corpo de `class` = sempre strict) que faz `return this.rest.rpc(...)` →
  `TypeError: ... (reading 'rest')`, engolido pelo
  `catch` anti-enumeração (ADR-0110). O fallback legado usava a MESMA referência quebrada.
  Provado por 5 evidências: log da Vercel (18 POSTs, 100% falhando), fonte do supabase-js, o padrão
  de TODOS os outros call-sites (`.bind`/`.call`), a base (8 pedidos, zero pendentes, mais recente
  13/07 **11h26**) e o diff datado. Corrigido com `.bind(supabase)`; erro do fallback (que era
  DESCARTADO) agora loga `PEDIDO PERDIDO`. Guard novo: 1º teste de Server Action do repo, com dublê
  de `rpc` como método de PROTÓTIPO (um `vi.fn()` solto passaria com o bug) — 7 de 8 casos reprovam
  o código antigo. 549 testes. Out-briefing:
  `docs/briefings/WT_Finance_Out_Briefing_v5-3-5_Solicitar_Acesso.md`.
  Worktree e branch já limpas (`/pos-merge` executado). **PENDENTE:** submeter um pedido real e ver
  a pendência aparecer em Usuários & Acessos (prova de ponta a ponta — não verificável do dev).
  **Pedidos de 13/07 a 31/07 são IRRECUPERÁVEIS: nada foi gravado, quem tentou precisa pedir de
  novo — vale avisar quem estava esperando.**
  **D5:** a regra de lint que pegaria esta classe de bug está BLOQUEADA pelo `protecao-config`
  (`eslint.config.*`); diff pronto no §7 do out-briefing para o Yan aplicar.

- A v5.3.4 (#201 mergeado 30/07 às 12h46) corrigiu o e-mail intermitente das Solicitações: os e-mails de
  notificação das Solicitações chegavam de forma **intermitente**. Causa-raiz **provada** por log de
  produção (`3/5 enviados`): o fan-out fazia `Promise.allSettled` sobre TODOS os destinatários com
  transporter **sem pool** = uma conexão SMTP por destinatário ao mesmo tempo, e o **Office 365
  recusa acima de 3 simultâneas por mailbox** (`432 4.3.2`). Quem ficava sem e-mail variava a cada
  disparo. Corrigido com `enviarFanOut` compartilhado (concorrência ≤ **`MAX_CONEXOES_SMTP` = 2**,
  abaixo de 3 de propósito) + retry só de falha **transitória** (nunca 5xx nem `EAUTH`). O `catch {}`
  **mudo** de `notificarMovimentacao` passou a logar — foi o silêncio que atrasou o diagnóstico.
  Guard novo mede o **pico de envios simultâneos** e foi visto **reprovando** o código antigo.
  Skill `email` corrigida (a orientação antiga, "`allSettled` em paralelo", **induzia ao bug**).
  Sem migration, sem UI. 541 testes. Out-briefing:
  `docs/briefings/WT_Finance_Out_Briefing_v5-3-4_Email_Intermitente.md`. Worktree e branch já
  limpas (`/pos-merge` executado).
  **Pós-merge:** o Yan relatou que "parece estar funcionando" (30/07, pouco depois do merge) — o
  sintoma cessou. A prova DURA segue valendo quando houver oportunidade: uma movimentação com role
  de 5+ membros e o log mostrando `5/5` (ou nenhuma linha de falha). **Ainda aberto:** o limite de
  **30 msgs/min** do Office 365 — role com 30+ membros ativos encosta nele, e a saída seria de
  PRODUTO (um e-mail com todos em cópia em vez de N), decisão do Yan.
- A v5.3.3 (#199 mergeado 28/07 às 17h18) foi o patch de Rota C que
  isentou `fonts/` no matcher do `src/proxy.ts` (por PREFIXO de diretório, nunca por extensão — a
  lição S11): as telas SEM sessão voltaram a renderizar Avenir, onde o proxy respondia `307`/HTML
  do login no lugar do `.otf` e o browser caía em fonte de sistema. **As telas afetadas eram 3:
  `/login`, `/solicitar-acesso`, `/auth/confirm`** — `/trocar-senha` exige sessão e nunca esteve no
  escopo (o registro da v5.3.2 supunha que estava). Guard mecânico novo em `src/proxy.test.ts`
  (32 casos) fixa as duas bordas do matcher; 525 testes. Out-briefing:
  `docs/briefings/WT_Finance_Out_Briefing_v5-3-3_Fontes_Avenir.md`. Worktree e branch já limpas
  (`/pos-merge` executado).
- **O HARNESS NOVO REGE desde a v5.3.2** (#197 mergeado 28/07 às 16h26) — a v5.3.3 foi o primeiro
  patch nativo dele e o ritual ganhou a rota C (ADR-0157, sem migrations, nada muda nas telas): CLAUDE.md **518 → 162
  linhas** (core) + **9 skills internas** + **3 rituais** (`/nova-versao`, `/fechamento-versao`,
  `/pos-merge`) + agentes com "Skills a ler" + **`verificador-visual`** (MCP Playwright em
  `.mcp.json`) + 2 skills externas vendoradas + permissões da terceira camada APLICADAS pelo Yan
  no settings global. Provas: inventário sem órfãos (`docs/harness/inventario-claude-md.md`),
  sonda de disparo (`docs/harness/sonda-disparo.md`), baseline −45,6% na porção do projeto.
  Out-briefing: `docs/briefings/WT_Finance_Out_Briefing_v5-3-2_Reformulacao_Harness.md` (a seção
  "o que muda para a próxima sessão" é leitura obrigatória da 1ª sessão nativa). Nenhuma versão em
  curso: todas as worktrees de versão foram limpas (a da v5.4.0 saiu no `/pos-merge` de 31/07).
- A v5.3.1 fechou a adaptação do modelo da controladoria na DRE: Resumo Executivo (ancorado no
  ANO CORRENTE — não acompanha a pill de ano, é intencional) + Decomposição por BLOCO da
  estrutura viva (pills próprias dentro do card). Migration 0209 aplicada e verificada; 493
  testes verdes.
- Último ADR registrado: **`0166`** (v5.5.0: Rendimento potencial do float — conta virtual
  composta, simétrica e projetada; 100% do CDI da série 4391 do SGS; mês corrente e futuros com a
  última taxa FECHADA; ingestão sem modo de backfill e auto-curativa; teórico nunca se mistura com
  contábil). **Próximo livre: `0167`.** ⚠️ O `0163` segue reservado pela versão em stand-by.
  Antes dele o **`0165`** (v5.4.5: o espelho espelha — filtro de negócio na leitura;
  mv não aceita `CREATE OR REPLACE`; o detector é o tripwire, não contagem do banco; emenda a
  0149/0164). Antes dele o **`0164`** (v5.4.4: reconciliação do espelho Monde — janela curta +
  varredura diária, lock durável, tripwire por apuração exata; emenda a 0149/0151).
  Antes deles o **`0162`** (v5.4.2: Margem a.a. LINEAR como definição de métrica +
  janela larga fatiada no cliente + reinício do acumulado na borda).
  Antes dele o `0161` (v5.4.0: 0158 categoria de confiança da API externa ·
  0159 chave estável de campo · 0160 destinatário sem fallback · 0161 outbox).
  Os rounds 2–4 entraram como **emendas datadas** nesses ADRs, não como ADRs novos (0158: o autor
  deixou de ser o robô; 0159: exceção única à imutabilidade do slug).
- Última migration APLICADA: **`0235`** (versão em stand-by — conserto do incidente do
  `metas_upsert`; ver o bloco dela acima). Antes dela **`0233`/`0234`** (mesma versão, objetos
  inertes) e **`0232`** (v5.4.4 desta entrega: detector `monde_vendas_ausentes`, lock
  `monde_ingest_claim`/`release(p_dono)` e `monde_ingest_status` estendido — ADITIVA, verificada
  por **21 checagens via REST/service_role** executando o corpo. **NÃO agenda nada**: o
  `cron.schedule` é a **`0236`**, aplicada no pós-merge).
  ⚠️ **`0230` e `0231` NÃO EXISTEM e nunca existirão** — foram reservadas pela versão em stand-by
  e ela mesma as renumerou para 0233/0234 quando duas sessões colidiram. Buraco permanente na
  sequência, como já há em 0024/0025, 0044–0051, 0089 e 0218.
  **Última migration APLICADA de todas: `0246`** (v5.5.1 — chave de ordenação `margem_teorica_aa` + `margem_teorica_pct` no payload da Lista). Antes dela a **`0245`** (faixa de plausibilidade ±5% a.m. como CHECK ADITIVO, ao lado do frouxo de ±100%). Antes dela a **`0244`** (agendamento mensal do CDI — `cdi-ingest-mensal`, dia 3 às 06:00 SP, ATIVO). Antes delas a **`0243`** (v5.5.0 — sem nenhuma taxa fechada o indicador é
  NULL, não zero; `GREATEST`/`LEAST`/`SUM` ignoram NULL e transformavam "não sei" em "zero").
  Antes dela a **`0242`** (o total do float passou a ser a soma exata das partes) e a **`0241`** (coluna `rend_float` na Lista, aplicada só DEPOIS de
  a latência ser medida), a **`0240`** (a leitura ignora mês de CDI ainda aberto), a **`0239`**
  (`cdi_ingest_upsert`) e a **`0238`** (`dim_taxa_cdi` + a view da conta virtual + as 2 RPCs).
  **Próxima livre: `0247`.**
  Antes delas a **`0237`** (v5.4.5: `monde_ingest_status` separa
  `vendas_que_contam` de `vendas` e expõe `itens_cancelados` — ADITIVA, `CREATE OR REPLACE` de
  função, verificada executando via REST. Necessária porque a venda cancelada passou a
  PERMANECER no espelho e os contadores crus inflariam o cartão). Antes dela a **`0236`**
  (agendamento da reconciliação, pós-merge da v5.4.4). (a numeração corrente está no bloco da v5.5.0 acima).
  Antes dela a **`0229`** (v5.4.2: janela do `get_fluxo_caixa_mensal_v3__nucleo`
  alargada de 23+18 para **36+36 meses** — ADITIVA, `CREATE OR REPLACE` de função SEM
  parâmetros. Diferente da RPC de Weddings, a janela dela é **hardcoded no corpo**, então o
  slider do Financeiro não teria o que fatiar sem isso. **Nenhum número muda:** cada mês é
  agregado do próprio mês, sem acumulado — provado por cross-check contra
  `get_fluxo_caixa_kpis_b`, que lê a mesma view por range explícito, 4/4 campos em todos os
  meses amostrados). (numeração histórica) — as `0233`–`0236` estão aplicadas;
  ver a nota no topo de §Verdade atual. E a **`0232`** está aplicada mas seu arquivo vive na
  branch da reconciliação do espelho Monde, ainda não mergeada.
  Antes dela a **`0228`** (v5.4.2: chave de ordenação `d_margem_aa` em
  `get_operacoes_weddings__nucleo` — ADITIVA, `CREATE OR REPLACE` com assinatura idêntica e shape do
  retorno inalterado; a chave NÃO entra no payload. Verificada via REST: ordenação monotônica nas
  duas direções, `NULLS LAST` honrado e **as 13 chaves de ordenação × 2 direções seguem
  funcionando** — 26 combinações, zero quebras).
  Antes dela a **`0227`** (limpeza da chave TARS revogada, aplicada pelo Yan em TTY e
  arquivada como migration). Antes dela a **`0226`** (DROP da coluna inerte
  `app.api_chave.whitelist_tipos` — a última pendência de banco da v5.4.0; `supabase/patches/`
  ficou vazia e não existe mais). Antes delas a **`0225`** (só comentário: conserta um fragmento pendurado em
  `solic_concluir`, achado do revisor-db — zero mudança executável). Antes dela a **`0224`** (v5.4.0/Round6: a WHITELIST de tipos por chave foi removida —
  toda chave alcança todo tipo exposto; `TIPO_NAO_AUTORIZADO` deixou de existir; `api_chave_atualizar`
  DROPADA porque a whitelist era o único campo editável de uma chave. De carona, os 3 comentários
  desatualizados dentro de funções foram consertados. Emenda no ADR-0158, item 2 revogado). Antes dela
  a **`0223`** (o patch DESTRUTIVO do Round5, aplicado pelo Yan em 31/07:
  dropou a fila `app.api_outbox`, as 3 RPCs dela, o cron `api-outbox-processar`, as colunas
  `callback_url`/`callback_segredo` da chave E as 3 colunas órfãs dos rounds 2/3 — conferido depois:
  tudo em 0, `api_chamada_log` e o cron do Monde intactos). Antes dela a **`0222`** (v5.4.0/Round5: os CALLBACKS foram removidos — 9 funções
  pararam de usar a fila e os campos de callback; o Janus não faz mais chamadas de saída, o
  integrador CONSULTA. ADR-0161 **superado por inteiro**. O `DROP` dos objetos inertes é o patch
  `supabase/patches/PENDENTE-remover-outbox-e-colunas-orfas.sql`, SEM número de propósito: numerar
  na hora de aplicar). Antes dela a **`0221`** (v5.4.0/Round4: `consultar_solicitacoes_externas` +
  `GET /api/externo/solicitacoes/{id}` e `?referencia_origem=` — o contrato virou autossuficiente
  (criar → consultar → cancelar) e o callback deixou de ser pré-requisito; a desistência da outbox
  após 8 tentativas deixou de ser perda de informação. Emenda no ADR-0161). Antes dela a **`0219`** (v5.4.0/Round4: `solic_tipos_documentacao`, RPC-irmã
  enxuta que a permissão NOVA alcança — correção do CRÍTICO da revisão; a de admin seguia gated só
  na gestão e a seção viva da página vinha vazia para quem tinha só a permissão nova). Antes dela a
  **0217** (mesmo round: área RBAC `solicitacoes/documentacao` + `criar_solicitacao_externa` com
  `p_solicitante_email` obrigatório + `solic_json` com a chave `origem`); 0210–0214 renumeradas +
  `migration repair`; 0215/0216 (rounds 2 e 3). Não existe 0218:
  o arquivo da limpeza nasceu com esse número e foi renumerado para 0220 (que o Yan já aplicou) —
  ver a armadilha registrada abaixo.
- ✅ **Limpeza de histórico APLICADA (31/07, mão do Yan): `0220` no ar.** Histórico zerado e
  verificado por mim depois: `solicitacao`/`solicitacao_anexo`/`api_chamada_log`/`api_outbox` em 0,
  os 2 tipos arquivados de teste excluídos (7 ativos, 42 campos, zero campo órfão), slugs canônicos
  (`abatimento_de_creditos`, `contas_a_pagar` — nenhum `_2`, nenhuma duplicata), bucket
  `solicitacoes-anexos` vazio com **zero órfão nos dois sentidos** e `acervo-documentos` intacto (8).
  A cópia dos 20 binários (3,3 MB, assinaturas conferidas) está em
  `~/wt-finance-backups/2026-07-31-anexos-solicitacoes` e é a ÚNICA (o backup-gate não cobre
  Storage) — decidir guardar ou descartar. **As sequências não reiniciaram:** a próxima solicitação
  será #107, o que é o comportamento seguro (id nunca se repete em relação ao que já circulou por
  e-mail); reiniciar é uma linha, mas é decisão de produto.
  **Percalço com lição:** o arquivo nasceu `0218` em `supabase/patches/` e o `db push` RECUSOU
  ("Found local migration files to be inserted before the last migration on remote database") porque
  a `0219` foi aplicada antes — renumerado para `0220`. **Não reservar número de destrutiva que será
  aplicada depois de uma aditiva da mesma leva.** E, entre o script de Storage e o SQL, a base ficou
  num **estado misto visível ao usuário** (anexo listado sem binário): rodar os dois na mesma janela.
- **Rota renomeada (31/07): `/admin/chaves-api` → `/admin/api-externa`** (a pasta de componentes
  acompanhou). A documentação da API é alcançada pela **tela inicial do módulo** (pill "Documentação
  API", área própria `solicitacoes/documentacao`) — a pill de voltar saiu da página, que existe por
  conta própria.
- **v5.4.0 (PR #191) — round 4 entregue:** com a plataforma aberta ao público interno, o Yan pediu
  (1) histórico de Solicitações apagado + os 2 tipos arquivados de teste, (2) sufixos `_2` dos
  slugs corrigidos, (3) documentação da API com **permissão própria** e botão na tela inicial do
  módulo, (4) Chaves de API acima de "Tipos Expostos", (5) **solicitante amarrado**: o disparo
  exige `solicitante_email` de pessoa cadastrada e ATIVA, e essa pessoa vira a solicitante (vê em
  "Minhas solicitações", recebe e-mails, cancela pela tela); a procedência virou o selo "via
  integração X" (`solic_json.origem`). Tudo isso está no ar (0217 + 0219),
  e (1)/(2) foram aplicadas pelo Yan em 31/07 (0220). O round ganhou ainda o **endpoint de consulta**
  (0221) e a correção da microcópia da chave, que ainda dizia que o robô era o autor.
  **Pendências do Yan:** criar a chave da integração (segredo exibido 1×) e entregar
  `docs/api-externa-solicitacoes.md` ao Vitor **avisando dos dois campos novos: `solicitante_email`
  obrigatório e as rotas de consulta** · patch das 3 colunas órfãs (SQL neste out-briefing) ·
  **merge**. Já FEITO pelo Yan: a limpeza de histórico (0220), o patch de remoção do outbox +
  colunas órfãs (0223) e a concessão da área "Solicitações (documentação)" (2 roles). **Não há mais
  pendência de banco nesta versão** — o que falta é criar a chave, entregar o contrato ao Vitor e
  mergear.
- **A superfície de restrição da API é MÍNIMA desde o Round 6:** a chave existe e está ativa, e o tipo
  está `exposto_via_api`. Nada de lista de equipes por tipo (caiu no Round 3), nada de lista de tipos
  por chave (Round 6). Uma chave tem dois estados na vida: criada e revogada — não há "editar chave",
  e a tela de criação pede um campo só ("Referência"; a coluna do banco continua `plataforma`).
- **O contrato da API é PULL-ONLY desde o Round 5 (31/07):** criar → consultar → cancelar. O Janus
  não notifica ninguém; o integrador descobre o desfecho consultando
  (`GET /api/externo/solicitacoes/{id}` ou `?referencia_origem=`). **Consequência a comunicar ao
  Vitor:** a pontualidade é responsabilidade do TARS — enquanto ele não consultar, ninguém do lado
  dele sabe. Se algum integrador futuro precisar de reação em segundos, o caminho é reintroduzir push
  para ele, não presumir que a consulta cobre.
- **Vercel (infra, standing):** deploy de repo privado de org exige plano Pro — pendência de
  billing do Yan, herdada da v5.2.0.

## Bloqueios vigentes

- **Validação do allow em sessão CLI interativa** (residual da v5.3.2): confirmar que `npm run
  lint` e `db:migrate -- --aditiva` passam SEM consulta ao classificador na primeira sessão
  interativa do Yan (validação headless já exercitada no pós-merge; se não valer no interativo,
  suspeito registrado: issue #18846 do Claude Code).
- **Licença da Avenir LT Std × exposição pública dos `.otf` (BAIXO, achado do revisor na v5.3.3):**
  com a isenção do matcher, os 5 `.otf` passaram a ser baixáveis por visitante anônimo — antes só
  com sessão, e por acidente. Não é falha de autenticação (fonte usada em página pública é sempre
  alcançável pelo browser); é **conferir os termos da licença comercial** (ADR-0039). Se o Welcome
  Group quiser limitar, o caminho é subsetting/`woff2` com `Access-Control`/referrer, não voltar a
  quebrar a fonte no login. **Decisão do Yan.**
- **Conceder a área `financeiro/dre` às roles** no editor de acessos (herdado da v5.3.0). Sem
  isso a aba do Demonstrativo existe mas só admin a enxerga.
- **Conferir o Resumo Executivo contra a planilha da controladoria** (do Yan; contra a tabela já
  está provado).
- **Decisões de produto abertas na DRE:** centavos na barra;
  3 blocos do seed em CAIXA ALTA (ajuste é no editor da estrutura, não em código); vencidos em
  aberto no Total do ano; convenção do Δ% do Consolidado (denominador em módulo).
- **Órfão de documentação:** commit `b869bb9` (relatório delta DRE×Monde + errata) vive só em
  `origin/docs/investigacao-dre-competencia-monde` e na worktree `investigacao-dre-monde`.
  Decidir: PR próprio ou descarte. **Não remover essa worktree antes de decidir.**
- **Faturamento roda em MODO TESTE** — flip de produção é decisão do Yan (dupla trava construída).
- **Virada Monde APLICADA (v5.1.4):** 7 funções PURA-mv no espelho; upload ainda é a única fonte
  de `get_mix_produto`/`get_cagr` e das telas de Weddings. **NÃO parar o upload** (Scope B resolve).
- ~~**`SMTP_*` na Vercel**~~ — **RESOLVIDO na prática (provado na v5.3.4):** o log de produção
  `[email] notificação de solicitação: 3/5 enviados` só existe com SMTP configurado (sem as
  variáveis, `getConfigSmtp()` devolve `null` e nada é tentado). Segue valendo o cuidado geral: a
  camada de e-mail é fallback-safe e **degrada** — por isso o caller agora loga (v5.3.4).
- **% Rec no Cadastro de Metas** — alvos nascem vazios; cards mostram "—" até o Yan digitar.
- Favicon/símbolo Janus adiado (reprovado no gate de legibilidade 16/32px).

## Filas ativas (próximos passos já decididos)

- ~~**PODAR o passo 4 do `/nova-versao`**~~ — **FEITO**: o `/nova-versao` já não menciona as
  cópias `0950–0954`, e a v5.5.0 confirmou que a pasta `supabase/migrations/` não tem nenhuma
  `095*`. ⚠️ **O `/fechamento-versao` AINDA cita a remoção delas** (§4, "enquanto a renumeração
  pós-v5.3 não sai") — é o último resíduo, e é letra morta pelo mesmo motivo. Podar lá também.
- **`financeiro/posicao-projetado.tsx` pode migrar** para o primitivo
  `components/shared/slider-horizonte.tsx` (extraído na v5.4.2 com a geometria dele —
  trilho neutro, régua de riscos, `posTick` compensando a meia-largura do thumb). Hoje há
  duas cópias da mesma geometria; migração incremental, quando aquela tela for tocada.
- **Piloto do harness novo (prova 3):** a v5.3.3 já rodou **nativa** (`/nova-versao` +
  `/fechamento-versao`) e o harness se sustentou de ponta a ponta na Rota C — o ritual ganhou a
  rota explícita (patch sem briefing, sem plan mode, passo das cópias 0950–0954 condicionado a
  tocar banco). Falta a prova numa versão **de produto** (Rota A, com briefing e várias missões);
  rollback trivial segue sendo revert do CLAUDE.md/skills.
- **Ambiente (recomendações da v5.3.2, ação do Yan):** desativar o plugin **superpowers
  duplicado** (projeto v5.1.0; o global 6.2.0 fica) — ele induz disparo-em-bloco das skills;
  limpar allows amplos/efêmeros do `.claude/settings.local.json` (`Bash(npx supabase *)`,
  `Bash(node *)`, PIDs).
- **v5.4.0 (PR #191): checklist de merge EXECUTADO** (renumeração `0210–0214`/ADRs `0158–0161` +
  `migration repair` + proxy.ts conferido + gates), seguido de **4 rounds de decisões do Yan** —
  ver a seção do round 4 no out-briefing para a lista exata de pendências dele. A whitelist de
  equipes por tipo e a referência de conclusão foram EXTIRPADAS (rounds 2 e 3); o round 4 amarrou o
  solicitante a uma pessoa real e limpou o histórico.
- **Fuso das pills de período (candidato REAL):** `resolverPeriodoCompleto` (`src/lib/periodo.ts`)
  não ancora em `hojeSP()` — runtime em UTC vira "Este mês/ano" antes da hora (~21h SP).
  Transversal (Fluxo de Caixa e DRE).
- **Limpeza de RPC órfã:** `get_decomposicao_grupo`/`get_decomposicao_categoria` sem consumidor
  vivo desde a v5.3.1. DROP exige verificação de consumidores reais (app E `supabase/seed/`).
- **v5.3.x refino da DRE:** drag-and-drop no editor; guarda de saída; divisão ver/editar da
  permissão; mover `historico-alteracoes` para `shared/`; Consolidado — conjunto de linhas vem
  do ano da URL (produto).
- **Monde — Scope B (aposentar o upload):** **DOIS relatórios, complementares — ler os dois.**
  *(a)* `docs/investigacoes/2026-08-04-scope-b-item-level-e-pessoas.md`: item-level **é**
  repontável (a premissa do "subconjunto do Excel" foi REFUTADA — a regra é `status='active'`,
  espelho ≡ raw-ativo em 28.450/28.450 vendas ao centavo). **Duas exceções:** `get_prejuizos` não
  tem paridade (a receita por item do espelho é ALOCAÇÃO do `total_revenue`, então perda dentro de
  venda lucrativa some) e `get_pipeline_weddings` precisa de um de-para `operation_id → nome` que a
  API só cobre em 17%. **Pessoas NÃO troca de fonte:** `people` expõe 5 dos 17 campos e **nenhum**
  de endereço/fiscal. **Desbloqueio: pedido ao provedor de RECEITA POR PRODUTO.**
  *(b)* `docs/investigacoes/2026-08-04-metas-subsetor-e-de-para-monde.md` §4: o **de-para de
  produto MEDIDO** — repontar hoje casaria só **46%** do faturamento de Weddings; 4 regras de kind
  cobrem 57% e a curadoria real são ~22 descrições. **Ler antes de estimar.**
  ⚠️ **Os dois números parecem discordar e não discordam — medem coisas diferentes.** O "46%/57%"
  de (b) é cobertura por **`product_kind` SOZINHO**, e por kind só dá para resolver os 5 tipos que
  mapeiam 1:1; em Weddings, `others` concentra R$ 23,9 Mi (~42%) e o kind não diz qual categoria é.
  O `CASE` de (a) usa **kind + a descrição** (`btrim(produto)`), e para `others`/`operations` a
  descrição **já é** a categoria do Excel — casado item a item em 9.419 pares. Ou seja: por kind
  não fecha (b está certo); por kind+descrição fecha (a está certo). Quem for repontar precisa das
  duas pernas.
- ~~**Saúde da sincronização Monde:** detectar falha SILENCIOSA (200 sem vendas)~~ — **coberto em
  parte pela v5.4.4:** o tripwire mensal (apuração exata por mês reconciliado) pega espelho
  divergindo da API. **Continua descoberto:** mês fora da janela de 3 meses da reconciliação.
- restore-test COMPLETO do backup-gate (follow-up ADR-0116) · `CRON_SECRET` constant-time (BAIXO).
- Casos de contrato pendentes: `solicitar_acesso_admin`, `monde_ingest_status`.
- Tokenização do `zinc` (os hex das paletas da Decomposição saíram na v5.4.1 — o arquivo não tem
  mais nenhum). **Proposta de lint parada em D5:** `wt/no-cor-hardcoded` só inspeciona CLASSE, então
  hex em `style={{}}` passa batido; estender a regra exige mexer em `eslint-rules/`, que o
  `protecao-config` bloqueia — diff proposto na §10 do out-briefing da v5.4.1.
- Consolidação das 3 pills de período (`PeriodoFilterPillsUrl` → `PILL_FILTRO`).
- Metas por Vendedor — próxima capacidade planejada (escopo a confirmar).
- Dependabot: 19 vulnerabilidades no default branch (10 high) — triagem pendente.

## Cuidados desta fase (o que uma sessão nova precisa saber AGORA)

- **O harness novo REGE a partir do merge da v5.3.2:** CLAUDE.md é core (162 linhas); o
  situacional está nas **skills** (`.claude/skills/` — ler a do domínio ANTES de implementar);
  procedimentos são **rituais** (`/nova-versao`, `/fechamento-versao`, `/pos-merge`). Delegação
  a subagente leva o campo **"Skills a ler"**. Gates escalonados: tsc+lint por missão;
  build+test por fase/fechamento. Fronteira de fase = estado em disco + `/clear`.
- **Terceira camada CONFIGURADA:** o settings global do Yan agora tem `allow` estreito (gates,
  git/gh, 2 invocações aditivas do db:migrate, `mcp__playwright`) e `deny` do `db push` cru.
  Bloqueio inesperado → **protocolo D5** (5 passos, no core). A validação a quente está pendente
  da 1ª sessão CLI (ver Bloqueios).
- **Hooks ATIVOS** (protecao-config 6 alvos incl. settings global / gate-stop /
  contexto-sessao) — detalhes no core §Salvaguardas.
- **Versão que toca UI:** despachar `verificador-visual` após gates e revisores (`next dev` é
  do orquestrador; tela autenticada exige credencial de teste na delegação). ⚠️ **O MCP Playwright
  não sobe em sessão de background/headless** (v5.3.3): o agente volta com **NÃO VERIFICADO** por
  falta das ferramentas `browser_*` — comportamento correto dele, não fabricar é o certo. Saída
  usada e provada na v5.3.3: o orquestrador roda um script headless com o **Chromium que o próprio
  MCP já instalou** (`~/.cache/ms-playwright/chromium-*/chrome-linux64/chrome` + `playwright-core`
  do cache do npx), medindo status/`content-type` de rede, console, `document.fonts.check()`,
  largura comparada com o fallback, anel de foco por Tab e screenshot. Fora do repo, sem tocar
  `node_modules`. Em sessão interativa, preferir o agente.
  ✅ **CAMINHO NOVO E PROVADO (v5.5.0): o MCP do Chrome (`claude-in-chrome`) FUNCIONA em
  background e alcança tela AUTENTICADA.** O orquestrador sobe o `next dev`, abre
  `localhost:3000` no Chrome real do usuário e navega, tira screenshot, faz zoom, arrasta slider
  e passa o mouse para abrir tooltip. Estreou na v5.5.0 e **pegou 2 defeitos** que
  tsc/lint/build/744 testes deixaram passar — um deles só aparece no hover (tooltip imprimindo
  `R$ NaN`). **Limite duro: o agente NÃO faz login** — clicar "Entrar" com a senha preenchida
  pelo gerenciador seria autenticar como o usuário, e isso é barreira dura; a sessão tem de já
  existir no Chrome. Isto **substitui** o `verificador-visual` em background, que seguiria
  voltando NÃO VERIFICADO; declarar a troca no out-briefing.
- **Protocolo de revisão:** `revisor` (sempre) e `revisor-db` (se migration/RPC) ANTES dos
  gates. Na v5.3.1 cada um pegou um ALTO real; na v5.3.2 o verificador-visual pegou o ALTO das
  fontes Avenir na estreia.
- **RPC que já existe pode ter a SEMÂNTICA errada — MEÇA antes de reusar** (skill banco-e-rpc);
  dois números lado a lado na mesma tela = caso de contrato.
- **A DRE tem DOIS recortes independentes na mesma seção** (o `?ano=` da tabela e as pills da
  Decomposição) — é de propósito. **Estrutura da DRE é DADO** (`dre_bloco`/`dre_categoria_map`;
  Receita Bruta é `RB_H`/`tipo:'blocoH'`, não `'tot'`). **Diário/undo é genérico** (molde
  `dre_estrutura_*`, 0206).
- `monde.*` é a fonte viva das telas executivas/Metas; Weddings/mix/CAGR ainda vêm do upload.

---
Regra de manutenção: item resolvido SAI (não é log). Aprendizado permanente NÃO fica
aqui — vai para o CLAUDE.md/skills pela régua de 5 destinos (core §Manutenção).
