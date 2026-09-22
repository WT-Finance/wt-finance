# WORKING-CONTEXT — Janus

> **O que é este arquivo.** O estado **agora**: o que está em voo, o que está bloqueado, o que uma
> sessão nova precisa saber antes de tocar em qualquer coisa. O hook `contexto-sessao` o injeta no
> começo de toda sessão.
>
> **Regra de manutenção: item resolvido SAI.** Isto não é log. O histórico por versão vive no git e
> nos out-briefings de `docs/briefings/`; o aprendizado permanente vai para `CLAUDE.md` ou para uma
> skill, pela régua de 5 destinos. Como o sistema funciona é `docs/estado-do-projeto.md`; o que
> ficou para a v6 é `docs/backlog-v6.md`.

Última atualização: 2026-09-22 (fronteira da M4).

---

## Em voo — v6.0.0 "Fundação da ingestão" (MAJOR, frente única)

Branch `feat/v6-0-0-fundacao-ingestao`, worktree `.claude/worktrees/feat-v6-0-0-fundacao-ingestao`.
Briefing `docs/briefings/briefing-v6-0-0-fundacao-ingestao.md`; plano aprovado em 21/09 (validação
briefing×repo com 11 divergências registradas — ver o plano da sessão e o out-briefing futuro).
Contrato **congelado** (GATE 0): `docs/contratos/ingestao-v1.md` — com a decisão do Yan de
entregar o arquivo por **signed upload URL** (a Vercel recusa body > 4,5 MB; Movimentação tem 6 MB).

| Missão | Estado |
|---|---|
| M0 contrato + anexos | feito (`889db93`) — fixtures gitignoradas com sha256 em `scripts/ingestao/fixtures-manifest.json`; scripts R em `docs/legado/scripts-r/` |
| M1 `verificador` | **aplicada** (0273, 21/09 19:13 UTC, gate verde) — 54 EXECUTE só leitura; usuário `verificador@janus.interno` criado (`sub 14b24718-85cf-4d68-b396-fd7c9f299caa`) |
| M2 `ingestor` + escopo | **aplicada** (0274, 21/09, gate verde; commit `c98ad14`) — 4 EXECUTE (pipeline de Vendas); usuário `ingestor@janus.interno` criado (`sub 952c5e70-555e-410b-a67f-26ce6e1833ae`); chave existente da API externa ficou com escopo vazio |
| 0275 hook de credencial | **aplicada e registrada** (22/09) — identidade de máquina = login + hook (o JWT HS256 do briefing ficou inviável no regime novo de chaves; ADR-0175 §5) |
| M3 parsers/oráculos | **feito** (`49c8c83` + `3cec38d`) — GATE 1 verde nas 5 bases |
| M4 Storage + rota | **feito** (`8d83fa7`→`8dc5285`) — 0276 aplicada 22/09; desenho em `docs/briefings/anexo-v6-0-0-m4-desenho-da-rota.md` |
| M5–M11 | pendentes — roteiro no plano |

**M4 FECHADA (22/09).** As duas rotas do contrato existem (`/api/ingestao/{base}/upload-url` e
`/api/ingestao/{base}`), o bucket privado `ingestao-cru` nasceu, o card de `/admin/uploads` sobe
o **cru** das cinco bases e o cliente deixou de parsear. Migration **0276** aplicada sob o
backup-gate (veredito verde, 56/56 tabelas). Suíte: **1.455 testes, 88 arquivos, zero falha**.
Próxima migration livre: **0277**. ADR livre: **0176**.

Pipeline exercitado contra a infraestrutura REAL pela **conferência** (`confirmar:false`, que faz
os passos 4–8 do contrato sem aplicar nem gravar linha de carga) — URL assinada, `PUT` no bucket,
parse, checksums e diff, com os anexos de 21/09:

| Base | Linhas | Checksums | Diff | Datas rejeitadas |
|---|---|---|---|---|
| Demonstrativo | 3.334 | 557, zero falho | 0 | 0 |
| Aberto | 36.176 | 96, zero falho | 0 | 7 |
| Operação | 41.750 | cruzamento | 0 | **41** |
| Vendas | 48.862 | 4 por arquivo, zero falho | 141 | 15 |

O cruzamento de Vencimento **reproduziu o baseline da M3 sem ter sido ajustado para isso**:
1 ausente em 4.006 sem liquidação (a M3 mediu 4.005 de 4.006). O ausente é o `Número` literal
**"NA"** — resíduo do NA do R virando texto no CSV do scrape.

Cinco coisas que a realidade corrigiu nesta missão, e que valem para quem seguir:

- **Coluna que ninguém lê e coluna que alguém lê parecem iguais no código.**
  `fato_lancamento_operacao.mes_ano` não tem leitor; `status`, ao lado, é somado em
  `SUM(CASE WHEN status = 'Entrada' …)` por quatro RPCs de Weddings. Deixá-lo nulo não dá erro:
  dá **zero** em quatro colunas que a diretoria lê. Antes de decidir que um campo "não precisa
  ser gravado", grepe o nome dele nos corpos de função, não só na aplicação.
- **`data_final` é uma dependência em cascata.** Ela vem de `coalesce(liquidacao, vencimento)`,
  e o `vencimento` do scrape vem de um CRUZAMENTO com outras duas bases. Sem o cruzamento, a
  cascata inteira (data final → `mes_ano` → `status` → somas de previsto) cai em silêncio.
- **Diff só vale se comparar a MESMA grandeza dos dois lados.** `get_upload_status().vendas` conta
  `fato_venda` (venda distinta) e o parser conta linha de item; Operação grava menos do que lê
  (descarta placeholder do scrape). Os dois davam um "antes → depois" mentiroso no gate humano.
- **Empate sem desempate em `DISTINCT ON` é não-determinismo silencioso** — a linha escolhida fica
  a critério do plano, que muda com VACUUM/ANALYZE. Medido: zero ambiguidade nos anexos de hoje;
  o desempate está lá porque nada no schema a impede amanhã.
- **`check-then-insert` não é idempotência.** Sob READ COMMITTED as duas chamadas concorrentes
  inserem, e a segunda vira 500 — exatamente no caso que a idempotência existe para atender.

> 🔴 **Três decisões suas, abertas pela M4** (detalhe no out-briefing da versão):
> 1. **Errata 2 do contrato** — o campo `confirmar` (default `true`) no passo 3, que só o card
>    usa. Ele repõe o gate humano do "antes → depois" que existia antes de o parse sair do
>    cliente; a RPA nunca o envia e continua vendo o contrato como congelado. Aceitar como errata
>    ou remover (e aí o gate humano some, o que precisa ser escolha dita).
> 2. **A URL assinada não vale 15 minutos** (contrato §2.1). `createSignedUploadUrl` do supabase-js
>    **não aceita** validade — quem a define é o servidor do Storage, hoje 2 h. O código reporta o
>    `exp` real do token em vez de mentir. Errata ou outra forma de limitar.
> 3. **`situacao` de Vendas continua nula de propósito.** O parser da M3 lê a coluna (medido:
>    411 "Aberta" em 48.865 linhas), mas `vw_vendas_agregadas` (0040) e `get_vendas_em_aberto`
>    (0114) filtram `situacao = 'Aberta'` ESTRITO — preencher agora acende uma tela que hoje está
>    apagada. Pode ser defeito pré-existente (a coluna nasceu em 0038 para essa tela), mas ligar
>    tela é decisão de produto. Virar é uma linha em `aplicar.ts`, com teste que segura a mudança.

> ⚠️ **A metade da prova da M4 que depende do navegador NÃO foi exercitada por mim.** O briefing
> pede "upload manual do cru pelo card funciona nas 5"; o Chrome desta máquina não tem sessão do
> Janus e **o agente não faz login** (limite documentado). O que provei é o pipeline de servidor
> inteiro, pela conferência. Para fechar a metade que falta: `npm run dev`, abrir
> `localhost:3000/admin/uploads` logado, e subir os crus de `tests/fixtures/ingestao/`. A carga
> real das cinco bases é a **M9**, com checkpoint seu.

> ⚠️ **`SUPABASE_INGESTOR_SENHA` ainda não está no ambiente da Vercel.** Não bloqueia a M4 (a
> aplicação roda com `service_role`, como as Server Actions já faziam), mas bloqueia a M5, que é
> quando a credencial `ingestor` passa a ser quem aplica.

**Divergências briefing×repo registradas na M4** (somam-se às 11 da abertura):
- **`src/lib/carga/lancamentos.ts` NÃO saiu.** O briefing o dava como removível; `supabase/seed/seed.ts`
  chama `carregarLancamentos` de verdade e `parse-lancamentos.ts` importa um tipo de lá. É o
  precedente da v4.17.1 outra vez. Saiu só a rota morta `api/admin/upload-lancamentos`.
- **`parseArquivoEmWorker` não ficou com grep vazio.** Pessoas está fora do contrato (decisão 11)
  e o card dela continua de pé; o worker caiu de cinco parsers para um. Fechar de verdade exige
  aposentar o card de Pessoas ou portá-la — decisão sua.
- **`ingestao.carga` nasceu na M4, não na M6**: sem persistência não há como honrar
  `x-ingestao-idempotencia`. M6 fica com baseline, alarmes, crons e tela.
- **A aplicação na M4 ainda é `truncar_* + inserir_lote_* + regenerar_*` com `service_role`** — a
  M4 move o caminho, não o pipeline. **A janela de base vazia das quatro bases continua existindo
  até a M5**, exatamente como hoje. A mensagem de erro passa a dizer quando a base ficou
  incompleta, em vez de só "erro ao inserir lote".
- **Acessibilidade**: a zona de drop virou alcançável por teclado (Enter/Espaço); o
  `role="dialog"`/foco/Escape do **modal compartilhado** fica registrado e não foi mexido — é
  pré-existente e o componente é usado por outros fluxos.

**GATE 1 FECHADO (22/09) — as cinco bases têm parser de servidor e oráculo verde** contra os
anexos reais de 21/09, e os scripts R podem ser aposentados (invariante 10). Parsers em
`src/lib/ingestao/parsers/`, oráculos em `src/lib/ingestao/oraculo-*.test.ts`. Números medidos:

| Base | Linhas | Células comparadas | Checksums | Divergências |
|---|---|---|---|---|
| Demonstrativo | 3.334 | 26.672 | 557 (556 subtotais + Total Geral) | **zero** |
| Movimentação | 94.667 | 1.230.671 | 149 (15 grupos + 133 categorias + total) | 56 células de data (55 linhas, 30 no ano 1900) |
| Aberto | 36.176 | — | 96 (15 + 80 + total) | 7 células de data |
| Vendas | 48.862 (tratado cobre 48.652) | 1.021.692 | 5 por arquivo × 3 | `Intermediário` (por construção) + 10 de data |
| Operação | 41.750 | — | cruzamento: 4.005 de 4.006 | 1 (lançamento 203048) |

Quatro coisas que a realidade corrigiu e que valem para quem seguir:
- **O subtotal declarado pelo export é o arredondamento da soma dos valores EXATOS.** O cru traz
  mais de 2 casas (o total de Movimentação é 717.710,7392): somar linha a linha já arredondado
  erra de 1 a 6 centavos por grupo e o checksum nunca fecha. `AcumuladorBruto` soma em inteiros e
  arredonda uma vez; a linha gravada continua com 2 casas, que é o que `NUMERIC(18,2)` guarda.
- **Guarda de faixa de data ancorada no DIA é intermitente.** Ver a decisão 🔴 aberta abaixo.
- **O cruzamento de Operação cobre melhor que o previsto:** falta 1 número, não os 3 do baseline.
- **`semana` e `mes` de Vendas não têm consumidor** (enumerado: `setor_macro` é lida CRUA por
  `vw_vendas_agregadas`, `setor_micro` é chave do JOIN do transform, `contrato` filtra ~15 RPCs,
  `taxa_servico` é copiada para o fato). Seguem calculadas para o oráculo provar as 21 colunas; a
  poda tem lugar na destrutiva do GATE 3.

**Suíte: 1.348 testes, 83 arquivos, zero skip** (eram 1.275 na fronteira da Fase 1).

**Faixa de data — DECIDIDA em 22/09 (fica ancorada no fim do ano).** Virou a **errata 1** do
contrato (`docs/contratos/ingestao-v1.md`): o limite superior é 31/12 do ano de `hoje + 5 anos`,
não o mesmo dia daqui a cinco anos. Ao pé da letra, o texto original recusava nove vencimentos
legítimos de 2031-09-22 por um dia e os aceitaria no seguinte — guarda cujo veredito depende de
quando a carga rodou. A mesma errata escreve o que "rejeitada" significa: a linha PERMANECE e só
o campo de data sai `null`, contado em `rejeitadas_por_data`, que é o único comportamento
compatível com os checksums do §4.

**Credenciais de máquina PRONTAS (22/09):** hook `custom_access_token_hook` (0275) registrado no
Dashboard pelo Yan; login de `verificador@janus.interno`/`ingestor@janus.interno` devolve token com
`role=verificador`/`role=ingestor`; senhas em `SUPABASE_VERIFICADOR_SENHA`/`SUPABASE_INGESTOR_SENHA`
no `.env.local`. **Suíte com as credenciais: 1.275 casos, 79 arquivos, 0 pulados** (≥ 1.247 da
v5.11.0). GATE 2 transcrito em `docs/briefings/anexo-v6-0-0-gate2-transcricao.md`. O `ingestor`
ainda precisa da senha no ambiente da Vercel (M4, quando a rota nascer).

Decisões técnicas da v6.0.0 que divergem do briefing (registradas no ADR-0175 e no plano):
allowlist do `ingestor` inclui `limpar_staging_*`/`inserir_lote_staging_*`/`validar_carga_*` (sem
staging não há carga em lotes nem promoção atômica); a allowlist do `verificador` **não** tem
RPC de escrita nenhuma (achado ALTO do `revisor-db` — os guards da DRE foram para transação
revertida em `reverter-diario.test.ts`); `admin_listar_areas`/`admin_acesso_solicitacoes_pendentes`
viraram prova negativa (GATE 2). Próximas: migration livre **0276**, ADR livre **0176**.

> 🔴 **Pendência do Yan, uma só, herdada da v5.11.0:** decidir se `PRIORIDADE_INICIAL`
> (`src/lib/auth/areas.ts`) passa a incluir as áreas da Estante. Hoje um colaborador cujo **único**
> acesso fosse `gestao-pessoas/estante` veria o item na sidebar mas cairia em `/sem-acesso` ao abrir
> `/`. O buraco é **pré-existente** — Inventário, Acervo e `solicitacoes/basico` têm o mesmo —, mas a
> Estante é o primeiro módulo com cara de "única área do colaborador comum". Mexer ali altera o
> redirect inicial de TODA a plataforma, por isso ficou para decisão, não para autonomia.

> 🔴 **Decisão aberta: ambiente de teste próprio.** O gatilho da skill `banco-e-rpc` §6 foi
> **tocado** na v5.11.0 — são agora **quatro** arquivos de teste que escrevem em produção (três em
> transação revertida + a exceção commitada da API externa). O caso novo reforça o argumento a
> favor do ambiente próprio em vez de enfraquecê-lo: as travas de permissão da Estante só são
> testáveis por conexão direta assumindo identidade JWT, porque o `service_role` faz bypass do
> `exigir_acesso`. Um ambiente com usuários controlados resolveria sem tocar produção.

> **A role `verificador` foi adiada para a v6** por bloqueio operacional. (Ela chegou a ser
> planejada como v5.11.0 — há um `docs/briefings/briefing-v5-11-0-role-verificador.md` **untracked
> na raiz** com esse nome; o número v5.11.0 foi para a Estante Welcome, então aquele briefing está
> com nome defasado e precisa ser renumerado quando for retomado.) O risco
> de varredura de produção com `service_role` fica **aceito por decisão do Yan** até lá — o item
> segue em `docs/backlog-v6.md`. O que **não** dependia da role já foi feito na v5.10.3: o script de
> varredura com a chave de serviço saiu do repositório, a conexão direta de leitura trava em
> `READ ONLY` e a sonda mantém o inventário de `SUPABASE_DB_URL` fechado, por conexão.

**O `npm audit` do repositório está em ZERO vulnerabilidades** — as três últimas versões foram
patches de segurança encadeados: v5.9.7 (`next`), v5.10.1 (`vitest`/`esbuild`) e v5.10.2
(`nodemailer`). Não há dívida de CVE aberta.

---

## Verdade atual

| | |
|---|---|
| Produção | **v5.11.0** (PR #273, mergeado 15/09 às 12:55) |
| Última migration aplicada | **0276** (v6.0.0/M4 — `ingestao.carga` + bucket) · próxima livre: **0277** |
| Último ADR | **0175** (v6.0.0 — separação credencial de verificação × aplicação) · próximo livre: **0176** |
| Suíte | **1.455 testes**, 88 arquivos, zero `skip` silencioso |

A v5 está encerrada: auditada, triada e limpa. O que ficou para a v6 está em `docs/backlog-v6.md` (30 itens); como o sistema funciona, em `docs/estado-do-projeto.md`.

---

## ⚠️ Incidente aberto — 306.261 linhas a repovoar

Em 10/09/2026 uma varredura REST minha chamou todas as RPCs sem argumento obrigatório para
conferir quais devolviam 500. Entre elas havia funções de **TRUNCATE**, e produção foi zerada em
10 tabelas: `raw.lancamentos_movimentacao` (92.506), `analytics.fato_venda_item` (48.147),
`raw.vendas_excel` (48.147), `analytics.fato_lancamento_operacao` (41.091),
`raw.titulos_em_aberto` (36.756), `analytics.fato_venda` (29.106), `analytics.dim_pagante`
(7.033), `raw.demonstrativo_competencia` (3.294), `analytics.dim_produto` (117),
`analytics.dim_vendedor` (64).

O backup está íntegro e o script de restore está pronto e **não executado**
(`supabase/patches/RESTORE-incidente-varredura-rest.mjs`, backup `2026-09-10-pre-migration-221044`).
Decisão do Yan: **repovoar pelo upload manual**, não pelo restore.

> 🔴 **Ordem obrigatória do repovoamento: Lançamentos por Operação PRIMEIRO.** As 238 linhas
> sobreviventes de `analytics.dim_operacao_weddings` são regeneradas a partir da tabela de fatos;
> subir qualquer outra base antes faz a regeneração rodar contra fato vazio e apagá-las.

**A lição, já promovida à skill `banco-e-rpc`:** num banco onde a RPC é a superfície de escrita,
disparar uma função sem saber o que ela faz é executar comando arbitrário — não é leitura. O corpo
de todas elas estava no catálogo que eu mesmo havia exportado.

---

## Pendências do Yan

> **Fechado na v5.10.0, não reabrir** (detalhe no out-briefing
> `docs/briefings/WT_Finance_Out_Briefing_v5-10-0_Limpeza_Fechamento_V5.md`): os **atos humanos 1 e
> 2** — a terceira camada de permissões existe e está no repositório (9 `deny` no settings global,
> 23 `allow` + o hook `protecao-git-add` no do projeto, bateria de 31 casos) · o
> `.claude/settings.json` da raiz, que estava com **JSON inválido desde 28/07** · as **conferências
> visuais** represadas da v5.3.x à v5.9.5 · as duas **comunicações à liderança** (critério da DRE de
> 19/08 e o tripwire da v5.4.5).
>
> **Ato 3 (E5): nada a aplicar** — `superpowers@superpowers-marketplace` 5.1.0 já está `✘ disabled`
> e não carrega desde 28/07. O custo always-on é de ~688 tokens; o que dói é o disparo em bloco
> (~50 mil somando as 14 skills), e isso é **mandato do plugin**, não duplicação. Vira **decisão de
> custo** sua: medir numa sessão nova e, se o bloco disparar, pagar ou
> `claude plugin disable superpowers@claude-plugins-official`. **Não remova a marketplace** — o
> `episodic-memory` vem dela e está habilitado. Enquanto a decisão não sai,
> `docs/harness/sonda-disparo.md` fica.

**Lição que vale guardar:** config só vale depois de `JSON.parse` **mais** exercício ao vivo. Um
settings que não parseia não avisa — ele simplesmente não vale, e leva junto os hooks declarados
nele. Foi o que aconteceu na raiz por seis semanas.

**Decisões abertas:**
- Commit órfão `b869bb9` (relatório delta DRE×Monde + errata), só em
  `origin/docs/investigacao-dre-competencia-monde`: PR próprio ou descarte?
- Conceder a área `financeiro/dre` às roles no editor de acessos — sem isso, só admin vê a aba.
- Conferir o Resumo Executivo contra a planilha da controladoria.
- Licença da **Avenir LT Std**: os 5 `.otf` são baixáveis por visitante anônimo desde a isenção do
  matcher. Não é falha de auth (fonte de página pública sempre é alcançável) — é conferir os termos
  da licença comercial (ADR-0039). Limitar exige subsetting/`woff2`, não voltar a quebrar a fonte no
  login.
- Produto, na DRE: centavos na barra; 3 blocos do seed em CAIXA ALTA (ajuste é no editor da
  estrutura, não em código); vencidos em aberto no Total do ano; convenção do Δ% do Consolidado.
- **Faturamento roda em MODO TESTE.** O flip para produção é decisão sua (dupla trava construída).
- Metas por Vendedor — próxima capacidade planejada, escopo a confirmar.
- **% Rec no Cadastro de Metas:** alvos nascem vazios e os cards mostram "—" até serem digitados.

**Higiene de repositório — PODADA em 10/09** (autorizada pelo Yan): saíram **120 branches remotas**
e **33 locais**, todas já mergeadas no `main`; remoto foi de 137 para 17 refs, local de 41 para 8.
Removidas também as worktrees `docs+pos-merge-v5-9-6` e `fix+v5-9-7-next-cve` (zero commits fora do
`main`). Nenhum commit se perdeu: tudo o que saiu já estava no `main`.

O que **sobrou de propósito** e por quê:

| ref | por que ficou |
|---|---|
| `docs/investigacao-dre-competencia-monde` | guarda o commit órfão `b869bb9` — **decisão sua**: PR próprio ou descarte |
| `docs/pauta-provedor-monde` | pauta a levar ao provedor do Monde; desbloqueia o Scope B |
| `feat/v5-4-4-metas-subsetor-weddings` | é o PR #213, fechado no Bloco 5. A **worktree local ficou**: tem 16 commits fora do `main`, e a regra da casa é não remover worktree com trabalho não-mergeado. As RPCs que ela chamava já não existem (0270), então a branch não aplica — mas a decisão de descartá-la é sua |
| `fix/v5-4-4-agendamento-pos-merge`, `fix/upload-lancamentos-vercel-limit`, `fix/kpi-color-dropdown-label` | não-mergeadas; conferir se têm algo vivo antes de apagar |
| `test/rebrand-janus-sidebar` | superada pela v4.40.0, mas não-mergeada — descarte é decisão sua |
| `feat/v3-5-m1/m2/m3`, `feature/v3-4-6`, `feat/v4-2`, `revert/v4-auth-para-v3-3` | de maio, era v3/v4; candidatas óbvias a descarte |
| `vercel/install-vercel-speed-insights-9x2sex`, `worktree-docs+investigacao-coercao-milhar` | resíduo de bot e de nomenclatura antiga |

🔴 **O checkout raiz continua atrasado — precisa de `git pull --ff-only`, agora até a v5.10.3
(`main@ec112be`).** Não dá para fazer daqui: a sessão é isolada na worktree e o harness recusa
`git -C` apontando para o checkout compartilhado (protocolo D5 — não se contorna). Comandos prontos,
para rodar **da raiz**:

```bash
cd /home/yan-wt/projects/wt-finance
git pull --ff-only
git worktree remove .claude/worktrees/feat-v5-10-3-role-verificador --force
git worktree prune
git branch -d feat/v5-10-3-role-verificador
```

⚠️ Se o `pull` abortar por colisão de untracked em `docs/briefings/briefing-v5-10-3-*.md`, é o
modo de falha conhecido (o briefing untracked da raiz virou rastreado no merge): conferir que são
idênticos com `git show origin/main:<caminho> | diff - <caminho>`, **mover** para fora do repo — e
só então puxar. Nunca `reset`.

---

## Bloqueios vigentes

- **Validação do `allow` em sessão CLI interativa** (residual da v5.3.2): confirmar que
  `npm run lint` e `db:migrate -- --aditiva` passam sem consulta ao classificador na primeira
  sessão interativa. A validação headless já foi exercitada.
- **Sem CI.** Os gates são disciplina local (item B-16 do backlog v6).
- **Dependabot:** 7 alertas no branch default (1 high, 5 moderate, 1 low) — triagem pendente. A
  rotina está declarada em `docs/estado-do-projeto.md` §10.

---

## Dívidas técnicas conhecidas (fora do backlog v6)

- **`financeiro.dre_comp_map` está órfã de leitura** desde a `0260`: o de-para vivo é
  `dre_comp_par`. Não foi removida porque `DROP` é destrutivo, e ela ainda é fonte do seed inicial
  e alvo do teste de paridade contra os anexos. Removê-la numa destrutiva futura.
- **`resolverPeriodoCompleto`** (`src/lib/periodo.ts`) não ancora em `hojeSP()`: com runtime em UTC,
  "Este mês/ano" vira antes da hora (~21h SP). Transversal — Fluxo de Caixa e DRE.
- **`financeiro/posicao-projetado.tsx`** pode migrar para o primitivo
  `components/shared/slider-horizonte.tsx` (extraído na v5.4.2 com a mesma geometria). Hoje são
  duas cópias; migração incremental, quando a tela for tocada.
- Consolidação das 3 pills de período (`PeriodoFilterPillsUrl` → `PILL_FILTRO`).
- Casos de contrato faltando: `solicitar_acesso_admin`, `monde_ingest_status`.
- Restore-test **completo** do backup-gate (follow-up do ADR-0116) · `CRON_SECRET` constant-time.
- **Saúde da sincronização do Monde:** o tripwire mensal da v5.4.4 pega espelho divergindo da API,
  mas **mês fora da janela de 3 meses da reconciliação continua descoberto**.

---

## Scope B (aposentar o upload de Vendas) — leia os dois relatórios

Está inteiro no backlog v6 (**B-25/26/27**), mas o resumo evita redescobrir:

- `docs/investigacoes/2026-08-04-scope-b-item-level-e-pessoas.md` — item-level **é** repontável (a
  premissa do "subconjunto do Excel" foi refutada: a regra é `status='active'`, e espelho ≡
  raw-ativo em 28.450/28.450 vendas ao centavo). **Duas exceções:** `get_prejuizos` não tem paridade
  (a receita por item do espelho é *alocação* do `total_revenue`, então perda dentro de venda
  lucrativa some) e `get_pipeline_weddings` precisa de um de-para `operation_id → nome` que a API só
  cobre em 17%. **Pessoas não troca de fonte:** `people` expõe 5 dos 17 campos e nenhum de
  endereço/fiscal.
- `docs/investigacoes/2026-08-04-metas-subsetor-e-de-para-monde.md` §4 — o de-para de produto
  **medido**: repontar hoje casaria só 46% do faturamento de Weddings; 4 regras de `kind` cobrem
  57%, e a curadoria real são ~22 descrições.

⚠️ **Os dois números parecem discordar e não discordam — medem coisas diferentes.** Os 46%/57% são
cobertura por `product_kind` **sozinho**, e por kind só se resolvem os 5 tipos que mapeiam 1:1 — em
Weddings, `others` concentra R$ 23,9 Mi (~42%) e o kind não diz qual categoria é. O `CASE` do outro
relatório usa **kind + descrição**, e para `others`/`operations` a descrição **já é** a categoria do
Excel, casando item a item em 9.419 pares. Quem for repontar precisa das duas pernas.

**Desbloqueio:** pedir **receita por produto** ao provedor do Monde.

**Enquanto isso: NÃO parar o upload.** `monde.*` é a fonte viva das telas executivas e de Metas,
mas Weddings, `get_mix_produto` e `get_cagr` ainda vêm do upload.

---

## Cuidados que uma sessão nova precisa saber AGORA

- **Verificação visual em background: use o MCP do Chrome (`claude-in-chrome`), não o
  `verificador-visual`.** O MCP do Playwright **não sobe** em sessão de background/headless — o
  agente volta com "NÃO VERIFICADO" por falta das ferramentas `browser_*`, e não fabricar é o
  comportamento certo dele. O caminho provado (estreou na v5.5.0 e pegou 2 defeitos que
  tsc/lint/build/744 testes deixaram passar, um deles só visível no hover): o orquestrador sobe o
  `next dev`, abre `localhost:3000` no Chrome real e navega, faz zoom, arrasta slider e passa o
  mouse. **Limite duro: o agente não faz login** — a sessão tem de já existir no Chrome. Em sessão
  interativa, preferir o agente `verificador-visual`.
- **`revisor` sempre, `revisor-db` se houver migration ou RPC**, antes dos gates de fechamento.
  Não é formalidade: cada um já pegou um ALTO real.
- **RPC que já existe pode ter a semântica errada — MEÇA antes de reusar.** Dois números lado a
  lado na mesma tela são um caso de contrato.
- **`src/types/database.ts` é GERADO** (ADR-0173). RPC nova ou alterada ⇒ regenerar e commitar
  junto do bump. Não crie helper de tipagem frouxa novo; os que existem são legado vivo.
- **A DRE tem dois recortes independentes na mesma seção** (o `?ano=` da tabela e as pills da
  Decomposição) — é de propósito. **A estrutura da DRE é DADO** (`dre_bloco`/`dre_categoria_map`;
  Receita Bruta é `RB_H`/`tipo:'blocoH'`, não `'tot'`), e o diário/undo é genérico (molde
  `dre_estrutura_*`, migration 0206).
- ✅ **A terceira camada está ATIVA desde 13/09** (v5.10.0): 9 `deny` no `~/.claude/settings.json`
  global (incluindo `supabase db push` cru, que fura o backup-gate) e 23 `allow` + os hooks no
  `.claude/settings.json` do projeto, que é **versionado** — e por isso vale em toda worktree, ao
  contrário do `settings.local.json`, que é git-ignored e por diretório (foi essa diferença que
  negou dois comandos legítimos em 10/09). `deny` vence `allow` em qualquer nível, e hook
  `PreToolUse` roda **antes** do fluxo de permissão. Bloqueio inesperado → **protocolo D5**.
- **Hooks ativos:** `protecao-config` (6 alvos, incluindo o settings global), **`protecao-git-add`**
  (stage cego), `gate-stop`, `contexto-sessao`.
