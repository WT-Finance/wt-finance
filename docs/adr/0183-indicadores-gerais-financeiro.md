# ADR-0183 — Indicadores gerais: recortes da DRE de caixa, contas a receber com a marcação do Financeiro e antecipações registradas no Janus

**Status:** aceito (v6.4.0) · **Data:** 2026-10-15 ·
**Contexto:** versão v6.4.0, "Financeiro · Geral" (Rota A) ·
**Briefing:** `docs/briefings/briefing-v6-4-0-financeiro-geral.md` · **Validação e decisões:**
`docs/briefings/plano-v6-4-0-validacao-briefing.md` · **Contrato técnico:**
`docs/briefings/spec-v6-4-0-contratos.md` · **Medições:** `docs/auditoria/v6-4-0-m-1-api-monde.md`,
`v6-4-0-m0-financeiro-geral.md`, `v6-4-0-m1-export-contas-receber.md` ·
**Migrations:** `0295`, `0296`, `0297` (aditivas, aplicadas em 15/10/2026) e o patch destrutivo
`supabase/patches/contas_receber_checks_ingestao.sql` (**pendente**, aplicação humana em TTY) ·
**Código:** `src/app/financeiro/geral/`, `src/components/financeiro/geral/`, `src/lib/financeiro-geral/`,
`src/lib/ingestao/parsers/contas-receber.ts`, `src/lib/ingestao/foto-prazos.ts`

> Numeração conferida contra `docs/adr/`, `supabase/migrations/` e as branches do remoto em 15/10/2026
> (últimos reais: ADR 0182, migration 0294).

## O problema

A diretoria não tinha, no Janus, uma leitura executiva de cinco assuntos do Financeiro: inadimplência,
antecipações de recebíveis, prejuízos, custos financeiros e prazos médios. Três deles já tinham dado
(a DRE de caixa e o Aberto); dois não:

- **Inadimplência** é uma **marcação de trabalho do Financeiro** (`Conferido = Inadimplente` no relatório
  Contas a receber do Monde). Os lançamentos sozinhos não a revelam — o vencido em aberto é bem maior que o
  marcado, e a distância entre os dois é decisão de cobrança, não dado contábil. Nenhuma tabela do Janus
  guardava isso, e o relatório é uma **posição** (substituída a cada exportação): sem guardar fotos, o
  histórico se perde.
- **Antecipações** viviam numa planilha gerencial, fora do Janus, sem trilha de quem mudou o quê.

Uma página que definisse "custo financeiro" ou "prejuízo" por conta própria produziria **números vizinhos
da DRE que divergem** na primeira remapeação de categoria (o problema que a ADR-0182 já resolveu para
Marketing).

## A decisão

### 1. Custos financeiros e Perdas e prejuízos: recortes da DRE de caixa, lidos do mapa vivo

As RPCs `get_geral_custos_financeiros(p_ano)` e `get_geral_prejuizos(p_ano)` (0297) usam **exatamente** o
predicado do Realizado de `get_dre_mensal` (0207): `fato_fluxo` ⨝ `dre_categoria_map` (`NOT excluida`),
`tipo = 'realizado'`, mês de `data_competencia`. Nenhuma lista de categorias vive no código.

- **Custos financeiros = bloco FIN do mapa vivo.** O FIN é o **resultado financeiro líquido** desde a 0251
  (custos, câmbio e receitas financeiras), e a página o mostra inteiro (decisão do Yan, GATE 0): custos por
  grupo (cartão, antecipação, juros e IOF, tarifas) e, abaixo, câmbio e receitas financeiras, fechando no
  FIN. A Taxa do Cartão entra como custo. Os grupos são uma **partição** das mesmas linhas — uma tabela
  curada `financeiro.geral_fin_grupo` (categoria → grupo, seed por nome) ligada por `LEFT JOIN` com
  `COALESCE(grupo, 'nao_classificado')`, então Σ grupos ≡ FIN **por construção**. Categoria nova no FIN sem
  grupo cai numa **bandeja visível**, nunca some.
- **Prejuízos = tabela curada `financeiro.geral_perda_map`** (categoria → papel `prejuizo` | `reversao`).
  "Prejuízos" é uma **categoria-folha dentro do bloco CUSTO**, não um bloco (M0, Q2); sem bloco próprio, o
  invariante "nenhum recorte por lista em código" manda a tabela curada, com bandeja para categoria de nome
  `%preju%`/`%perda%` ainda não mapeada (molde do `dre_comp_map`). A página mostra o prejuízo **bruto**, a
  **reversão** ao lado (recuperado) e o líquido como contexto (decisão do Yan); "por natureza" saiu (é uma
  categoria só), no lugar vem a série por mês.
- **Paridade provada, não afirmada.** As 13 categorias medidas batem ao centavo com `get_dre_mensal` na M0
  (2024 e 2025 fechados; 2026 jan–out) e de novo no ensaio revertido da 0297 e nos casos de contrato
  (`src/lib/rpc-contrato.test.ts`: FIN, prejuízo, reversão e receita bruta ≡ linhas da DRE; Σ grupos ≡ FIN).
  Se quebrar, a página está errada, nunca a DRE.
- **Receita bruta** (denominador do "% da RB") = blocos `ENT_H + PAG_H + RV`. A fórmula é dado editável da
  DRE: a migration reprova se a premissa não valer na aplicação, e um caso de contrato (`receita_bruta ≡ RB_H`)
  pega a deriva depois.
- **Só o realizado.** A DRE troca realizado por previsto nos meses futuros do ano corrente; a página não
  (mês futuro = 0). A paridade vale por mês já realizado.

### 2. Contas a receber: base de ingestão nova, por upload, com a marcação do Financeiro

A sexta base (`contas-receber`) segue o contrato `docs/contratos/ingestao-v1.md` da v6.0.0 — cru no Storage,
parser no servidor, linha de total do arquivo como checksum, `promover_carga_contas_receber` atômica, card de
upload com instruções, GRANT só para a `promover` na allowlist do `ingestor` — com quatro particularidades:

1. **N arquivos por carga, um por faixa de vencimento.** O Monde limita a pesquisa a **30 mil linhas** e o
   Contas a receber de 2024–2026+ passa disso. O multiarquivo, que era fixo para Vendas, vira uma lista de
   bases (`BASES_MULTIARQUIVO`). **Checksum por arquivo** pela linha de total (`Número` = contagem,
   `Valor Final` = Σ, em centavos, tolerância zero, conferido contra o GRAVADO). **Número repetido entre
   arquivos reprova a carga** — cada arquivo fecha sozinho e só essa guarda vê sobreposição de faixas;
   lacuna de vencimento entre faixas gera aviso. Um arquivo misto (pagar + receber) é reprovado pelo
   próprio total, que vem com sinal.
2. **Lista fechada de 9 colunas gravadas**: `Número`, `Emissão`, `Pessoa`, `Descrição`, `Vencimento`,
   `Liquidação`, `Valor Final`, `Conferido`, `Operação Própria`. `Observações`, `Pendente com:`, `Documento`
   e `Conta (Previsão)` nunca entram em tabela. `Pessoa`, `Descrição` e `Operação Própria` contêm nomes de
   pessoas: ficam só no raw (`raw.contas_receber`, sem acesso direto), nenhuma mensagem de erro as
   reproduz (a RPC de lote cita só posição e nome do campo — `LOTE_LINHA_INVALIDA`), as fotos não as
   guardam e a página só mostra nome no top 10 de inadimplentes, para quem tem `financeiro/geral`.
3. **Inadimplência = só a marcação** `Conferido = Inadimplente` e título em aberto (decisão do Yan, GATE 1).
   O "vencido em aberto" pela data **não** vira número da página. As faixas de atraso (1–30, 31–60, 61–90,
   90+) são sobre os títulos **marcados**; o "a vencer" segue como carteira. `Conferido` tem **domínio
   fechado** (vazio, Sim, Pendente, Enviado para o banco, Inadimplente): valor fora dele reprova a carga,
   nomeando o valor. `Valor Final` é o valor (é o que a linha de total soma); **zero é legítimo** (faturas
   zeradas por compensação), negativo reprova.
4. **Fotos por carga na mesma transação.** A marcação é um estado atual; o histórico só existe se a
   plataforma o guardar. Cada promoção grava `financeiro.contas_receber_foto_carga` (uma linha, com os
   contadores e a data da posição, hoje de São Paulo explícito) e `financeiro.contas_receber_foto` (os
   títulos em aberto ∪ os marcados, inclusive liquidados — é o "recuperado"). A evolução mensal usa a
   última foto de cada mês e **começa na v6.4**: antes disso a página diz "histórico a partir de DD/MM",
   sem fabricar zero.

A posição é uma **base de estoque**: o alarme de "ano fechado alterado" não vale para ela (a carga seguinte
troca o conjunto inteiro, e um título quitado "altera" um ano sem erro nenhum) — `contas-receber` é isenta em
`src/lib/ingestao/alarme.ts`.

### 3. Antecipações: registradas no Janus, fonte única, sob o diário

A planilha gerencial se aposenta; `financeiro.antecipacao` passa a ser a fonte (conta de uma lista curada
`financeiro.antecipacao_conta`, data, valor antecipado, valor líquido, **desconto gerado** = antecipado −
líquido, nunca digitado).

- **CHECKs**: valores > 0, líquido ≤ antecipado, data ≥ 2000-01-01; data futura recusada e mais de 2 casas
  recusado nas RPCs. Sem `UNIQUE (conta, data)` — duas antecipações no mesmo dia e conta são legítimas; a
  proteção contra duplo clique é do front.
- **Sob o diário** (`fn_diario_alteracoes`), com `reverter_diario` para o desfazer. **PK `bigserial`, não
  `GENERATED … IDENTITY`**: o ramo D de `reverter_diario` (0268) só reinsere colunas `is_identity = 'NO'`;
  com IDENTITY o desfazer de uma exclusão devolve a linha com id **novo**, a entrada antiga continua
  "desfazível" e um **segundo desfazer duplicaria o registro** (e inflaria todo total). Com `bigserial` o
  segundo desfazer é recusado — provado em ensaio revertido. Foi um desvio deliberado do contrato da
  spec, achado pelo implementador na 0296.
- **Carga inicial** das 38 linhas da planilha por migration, **antes** do trigger do diário (as linhas da
  carga não geram entrada desfazível), com um guard que **aborta a transação** se a contagem ou qualquer
  total do invariante divergir (antecipado 7.245.412,45 · líquido 7.057.349,44 · desconto 188.063,01 · por
  conta e ano), conferidos contra a **tabela**, não contra as dinâmicas da planilha.
- **Escrita** por `antecipacao_salvar|excluir|desfazer` e leitura da gestão por `antecipacao_listar|historico`,
  todas com `exigir_acesso(['financeiro/geral/gestao'])` inline; as de escrita **nunca** vão ao `verificador`
  nem ao `ingestor`. `salvar`, `excluir` e `desfazer` tomam o mesmo advisory lock (`hashtext`).
- **Sem contagem dupla com os custos.** Custos financeiros usa a **Taxa de Antecipação do Monde** (FIN);
  Antecipações mostra o **volume** do registro, com o desconto só como contexto. O desconto do registro
  (R$ 188.063,01) e a Taxa de Antecipação do Monde (R$ 195.547,26, 2024–2026) divergem por R$ 7.484,25
  (Asaas lança por cobrança, Blimboo por lote; existem "outras contas" fora da planilha) — cruzamento
  informativo, não gate.

### 4. Prazos médios: saldo do Aberto, foto fail-soft na carga

PMR = a receber de clientes (grupo Receita de Vendas do Aberto) ÷ entrada de clientes (`ENT_H`) × 365; PMP =
repasse a pagar ÷ pagamento a fornecedor (`PAG_H`) × 365; folga = PMP − PMR; janela dos 12 meses fechados
anteriores (decisão do Yan, GATE 0; despesas ficam de fora — 27,9 mi vencem além de 365 dias). Não há
histórico de saldo: o Aberto é substituído a cada carga. Então `financeiro.geral_prazo_foto` guarda **uma
foto por carga do Aberto** (núcleo único `financeiro.geral_prazo_calcular()`, usado pela RPC e pela foto),
com uma foto inicial gravada na 0297; a seção nasce curta ("histórico desde DD/MM") e cresce a cada carga.

A captura é um **gancho no TypeScript** (`src/lib/ingestao/foto-prazos.ts`, chamado em `carga.ts`) que, depois
de **aplicar** com sucesso a base `lancamentos-aberto`, chama `registrar_foto_prazos(carga_id)` (GRANT só
`service_role`). É **fail-soft**: falha vira aviso e **nunca desfaz a carga**. É a única mudança no caminho
de outra base e **exceção declarada ao invariante 9** do briefing ("zero mudança fora da página, das bases
novas e do card"). A série começa no dia da aplicação; reconstruí-la desde 25/09 pelos crus do Storage é
follow-up.

### 5. Dois níveis de área, molde do Acervo

- `financeiro/geral` (leitura, "Geral"): Diretoria, Financeiro, Administrador e Máquina · verificação.
- `financeiro/geral/gestao` ("Geral (gestão)", registrar antecipações): Financeiro e Administrador; a role
  de máquina recebe **só a área** (a suíte de contrato exige toda área fora de "Administração"), nunca
  EXECUTE das RPCs de escrita. Gestor fica fora (decisão do Yan).
- As 5 RPCs `get_geral_*` são `SECURITY DEFINER` + `app.exigir_acesso(['financeiro/geral'])` inline,
  `STABLE`; EXECUTE ao `verificador` **por assinatura** (allowlist derivada de `rpc-contrato.test.ts`);
  `anon` e `ingestor` sem. `app.exigir_acesso` não mudou.
- **Quem tem só leitura entra direto na página** (`rotaInicial` / `PRIORIDADE_INICIAL`); o botão de registro
  de antecipações só aparece a quem tem a área de gestão.

## O que foi descartado

- **Contas a receber pela API v3 do Monde.** A M-1 mediu e a API é **viável e mais completa**: dá a natureza
  a pagar/receber, os títulos a vencer, os inadimplentes de anos anteriores e a emissão sem sujeira, e
  fechou ao centavo o oráculo da inadimplência. Ficou **adiada por decisão do Yan** — upload manual nesta
  versão —, porque exigiria decidir o alcance da leitura do `Conferido` (só vencidos a cada foto, ou também a
  vencer em ciclo semanal), disputaria o orçamento da chave compartilhada com o espelho e trocaria o desenho
  da base (sem linha de total, checksum por conciliação). É candidata a versão própria. A lista fechada e a foto por carga valem nos dois caminhos.
- **Reconstruir a posição de recebíveis pela movimentação.** A movimentação mostra o que foi liquidado, não
  o que foi marcado nem o que está em aberto; é o mesmo problema do fluxo de caixa gerencial. Decisão do
  Yan: inadimplência vem da marcação.
- **`GENERATED ALWAYS AS IDENTITY` no registro de antecipações.** Fecha o desfazer de exclusão em falso
  (duplicação no segundo desfazer, acima). `bigserial` é o molde das tabelas sob o diário.
- **Lista de categorias de FIN/prejuízo no código, ou filtro pelo grupo de categoria do Monde.** Diverge da
  DRE na primeira remapeação (ADR-0182, mesmo argumento).
- **Recorte "vencido em aberto" como número de inadimplência.** Distingue-se do marcado, mas o Yan decidiu
  que a página mostra só a marcação.

## Consequências

- **Patch destrutivo dos CHECKs pendente (TTY humano).** Os CHECKs de `base` de `ingestao.carga` e
  `ingestao.promocao` ainda listam 5 bases e ampliar exige `DROP CONSTRAINT` — destrutivo pelo
  classificador do backup-gate, embora nenhuma linha mude. O par `DROP`/`ADD` está em
  `supabase/patches/contas_receber_checks_ingestao.sql` (FORA de `supabase/migrations/`, por precaução do
  `db push`). Até ele, **a carga da base `contas-receber` falha FECHADA** (recusada no `CHECK`, nada gravado,
  as outras cinco bases seguem iguais). Ao aplicar: copiar para `migrations/` com o número real, reapontar
  o `bases-paridade.test.ts` e regenerar o baseline. `api_chave` e `expectativa` ficam com 5 bases
  (exceção declarada em `bases.ts`: sem RPA nem vigia para a base nova).
- **Mudança aditiva do contrato `ingestao-v1`**: base nova `contas-receber` (multiarquivo, checksum por
  arquivo). Nenhum campo existente muda de significado; clientes das cinco bases não sentem.
- **Retenção das fotos pendente (decisão do Yan).** `contas_receber_foto` acumula ~4,85 mil linhas por
  carga (~1,8 milhão por ano com carga diária) e não tem leitor além da última foto de cada mês; limpar é
  `DELETE` destrutivo. Nenhuma limpeza foi ligada.
- **A série de prazos e a evolução de inadimplência começam na v6.4** e crescem a cada carga. Quem lê antes
  vê "histórico a partir de DD/MM", nunca zero fabricado.
- **Acesso e dado pessoal.** `Pessoa` aparece só no top 10, só para `financeiro/geral`. O `verificador` tem
  EXECUTE em `get_geral_recebiveis` (que devolve esses nomes): os casos de contrato **não ecoam nomes**.
- **Desfazer de ação de terceiro** na gestão de antecipações: hoje basta a área de gestão (moldes antigos
  pediam administrador/acessos) — pendência de produto. Sem trava otimista em `antecipacao_salvar`
  (último a gravar vence; o diário permite desfazer).
- **Achado fora do escopo, a investigar à parte:** o relatório de Movimentação omite a despesa paga com
  cartão e as faturas de cartão, o que pode deixar a DRE de caixa — e, por paridade, Custos financeiros e
  Prejuízos — sem essa despesa (set/2026: R$ 560 mil de repasse e R$ 61 mil de categoria). A página herda a
  DRE por desenho; corrigir é na DRE, nunca na página.
- **Nome "Geral" × TopSection "Visão Geral" da DRE** e a posição da subaba (1ª do Financeiro): decisão de
  produto aberta, registrada no out-briefing.

## Quando revisitar

- Se a controladoria quiser outro recorte de custos financeiros ou de prejuízo: a mudança é no mapa da DRE
  ou nas tabelas curadas (e `geral_perda_map` é por migration), nunca uma exceção na página.
- Se o Contas a receber passar a vir da API v3: a base muda de contrato (sem linha de total), mas a lista
  fechada, a marcação como inadimplência e a foto por carga continuam valendo — novo ADR.
- Se a diretoria pedir "vencido em aberto" ou lista operacional de títulos: é decisão de produto e outra
  fonte de leitura.
- Se uma sétima base de posição entrar: nasce isenta do alarme de ano fechado e ampliando o `CHECK` por
  novo patch destrutivo.

## Emenda 1 — v6.5.0 (26/10/2026): a página em cinco seções

Decisões do Yan (briefing `docs/briefings/briefing-v6-5-0-financeiro-geral-v2.md`; medição
`docs/auditoria/v6-5-0-m0-financeiro-geral-v2.md`):

- **Forma nova:** cinco TopSections, nesta ordem — Vendas (casca) · Recebíveis e inadimplência · Perdas e
  prejuízos · Antecipações · Cartões de crédito (casca). Faixa do topo com três indicadores (inadimplência,
  prejuízo do ano corrente, dias sem antecipação), os dois últimos sempre do ano corrente.
- **Custos financeiros e Prazos médios saem**, inclusive a série de prazos: a carga do Aberto deixa de gravar
  a foto; `get_geral_custos_financeiros`, `get_geral_prazos`, `registrar_foto_prazos`,
  `geral_prazo_calcular`, `geral_prazo_foto` e `geral_fin_grupo` caem na destrutiva do GATE 2 (0302), DEPOIS
  do deploy. O export da série fica em `~/projects/arquivo-worktrees-janus/v6-5-0-gate2/`.
- **Recebíveis:** funil em aberto ⊃ vencido ⊃ inadimplente (a marcação continua sendo a definição); Δ contra a
  última foto ANTES da semana da posição; faixas de atraso só sobre os inadimplentes (com "a vencer" quando a
  marcação antecede o vencimento); 10 maiores por devedor; evolução semanal (última foto de cada semana; semana
  sem carga é lacuna).
- **Prejuízos:** só bruto (reversão e líquido saem); por pessoa = `fato_fluxo.pessoa`, uma tabela somando os
  anos selecionados; por setor fica em construção até haver fonte. Nomes de pessoa podem aparecer (decisão do
  Yan no GATE 0).
- **Antecipações:** custo efetivo (R$ de desconto) e custo % ponderado pelo volume, por uma fórmula única; por
  conta (rótulo "Conta", nunca "bandeira"); "maior intervalo do ano" = maior intervalo que TERMINA no ano,
  inclusive o da virada e o em curso.
- **Contrato:** as três RPCs ganharam chaves por `CREATE OR REPLACE` aditivo (0301), sem RPC nova — devolvem
  `json` e o Zod não é estrito, então acrescentar chave não quebra o front no ar. A poda das chaves antigas
  vai na 0302.
- **Retenção das fotos (inv. 8):** a evolução semanal lê o DETALHE por título (`contas_receber_foto`) para o
  vencido; o inadimplente vem de `contas_receber_foto_carga`. Antes de ligar qualquer limpeza do detalhe,
  persistir o agregado semanal (vencido por carga), senão a série perde o vencido. A RPC já trata detalhe
  incompleto como lacuna, nunca zero.
