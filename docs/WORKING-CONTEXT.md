# WORKING-CONTEXT — Janus

Última atualização: 2026-08-03 · produção na **v5.4.1** (DRE: refino visual — #207 mergeada às 14h50). A **v5.4.2** (Weddings: margem anualizada + fluxo de caixa unificado) está **FECHADA e aguardando merge** — rebase em cima da v5.4.1 já feito.

> Verdade atual do projeto em UMA página. Toda sessão nova lê este arquivo antes de
> explorar o repositório (o hook `contexto-sessao` o injeta automaticamente; se o hook
> faltar, ler manualmente). Atualizado como parte do out-briefing de TODA versão/patch (DoD).
> Manter curto: o que mudou de verdade, não histórico — histórico é o CHANGELOG.

## Verdade atual

- **v5.4.2 FECHADA, aguardando merge (PR #209 draft)** — **Weddings: margem anualizada + Fluxo
  de Caixa unificado**, e o padrão do slider estendido ao **Fluxo de Caixa do Financeiro**.
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
  coluna nova e o card único dentro da TopSection; (2) **anomalia de DADO** exposta pela coluna
  nova — *"Darlene e Adnan - DDMMAA"* com `margem_liquida_pct` = **782%** (única acima de 100%;
  nome parece template inacabado), hoje no topo ao ordenar por "Margem (a.a.)"; (3) **mergear**.
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
- Versão em produção (main): **`5.4.1`** (#207 mergeado 03/08 às 14h50) — **DRE: refino visual.**
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
- Último ADR registrado: **`0162`** (v5.4.2: Margem a.a. LINEAR como definição de métrica +
  janela larga fatiada no cliente + reinício do acumulado na borda). **Próximo livre: 0163.**
  Antes dele o `0161` (v5.4.0: 0158 categoria de confiança da API externa ·
  0159 chave estável de campo · 0160 destinatário sem fallback · 0161 outbox).
  Os rounds 2–4 entraram como **emendas datadas** nesses ADRs, não como ADRs novos (0158: o autor
  deixou de ser o robô; 0159: exceção única à imutabilidade do slug).
- Última migration APLICADA: **`0229`** (v5.4.2: janela do `get_fluxo_caixa_mensal_v3__nucleo`
  alargada de 23+18 para **36+36 meses** — ADITIVA, `CREATE OR REPLACE` de função SEM
  parâmetros. Diferente da RPC de Weddings, a janela dela é **hardcoded no corpo**, então o
  slider do Financeiro não teria o que fatiar sem isso. **Nenhum número muda:** cada mês é
  agregado do próprio mês, sem acumulado — provado por cross-check contra
  `get_fluxo_caixa_kpis_b`, que lê a mesma view por range explícito, 4/4 campos em todos os
  meses amostrados). **Próxima migration livre: `0230`.**
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

- **PODAR o passo 4 do `/nova-versao` — a condição se cumpriu.** O bloco das cópias
  provisórias `0950–0954` traz o comentário `REMOVER na renumeração pós-v5.3`: elas foram
  renumeradas para `0210–0214` no merge da v5.4.0, e a v5.4.2 confirmou que a pasta
  `supabase/migrations/` não tem nenhuma `095*`. O passo inteiro é letra morta e hoje só
  gasta contexto de toda sessão que abre versão.
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
- **Monde — Scope B (aposentar o upload):** fato/mv item-level + repontar as 6 funções restantes.
- **Saúde da sincronização Monde:** detectar falha SILENCIOSA (200 sem vendas).
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
