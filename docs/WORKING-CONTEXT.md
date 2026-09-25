# WORKING-CONTEXT — Janus

> **O que é este arquivo.** O estado **agora**: o que está em voo, o que está bloqueado, o que uma
> sessão nova precisa saber antes de tocar em qualquer coisa. O hook `contexto-sessao` o injeta no
> começo de toda sessão.
>
> **Regra de manutenção: item resolvido SAI.** Isto não é log. O histórico por versão vive no git e
> nos out-briefings de `docs/briefings/`; o aprendizado permanente vai para `CLAUDE.md` ou para uma
> skill, pela régua de 5 destinos. Como o sistema funciona é `docs/estado-do-projeto.md`; o que
> ficou para a v6 é `docs/backlog-v6.md`.

Última atualização: 2026-09-25 (fim da M8 — fronteira da Fase 4).

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
| M5 atomicidade | **feito** (`7fb7097`) — 0277/0278 aplicadas 22/09; desenho em `docs/briefings/anexo-v6-0-0-m5-desenho-da-atomicidade.md` |
| M6 log, alarmes, vigia, tela | **feito** — 0280/0281 aplicadas 24/09; desenho em `docs/briefings/anexo-v6-0-0-m6-desenho-log-e-alarmes.md` |
| M6b retenção do cru | **feito** — 0282 aplicada 24/09; desenho em `docs/briefings/anexo-v6-0-0-m6b-retencao-do-cru.md` |
| M7 grafo + Welcome + leitura | **feito** — 0283 aplicada 25/09; desenho e provas em `docs/briefings/anexo-v6-0-0-m7-desenho-grafo-e-leitura.md` |
| M8 baseline de schema | **feito** (`438f7d2`) — `supabase/baseline/schema-v6.json` + teste de drift, sem migration; provas e parecer em `docs/briefings/anexo-v6-0-0-m8-baseline-de-schema.md` |
| M9–M11 | pendentes — roteiro no plano |

**Decisões do Yan em 24/09, depois da M6 — errata 3 do contrato (`docs/contratos/ingestao-v1.md`):**
1. **Reprocesso = carga NOVA com cópia dos arquivos** (errata 3(a)); o que a tela já faz. Afeta a RPA.
2. **Arquivo que nunca virou carga é apagado em 7 dias** (conferência cancelada, reprocesso não
   confirmado).
3. **Retenção do cru: 3 meses** (o dado no banco não expira). Medido antes de decidir: um conjunto das
   5 bases tem ~20 MB → ~1 GB/ano no ritmo semanal de hoje, ~7 GB/ano com a RPA diária; o custo não
   pesou, e o Yan não vê motivo para guardar o arquivo por muito tempo. Vai para o ADR no fechamento.

**Pré-condições da M9 (deploy intermediário + 5 cargas reais) — quase todas atos do Yan:**
1. `SUPABASE_INGESTOR_SENHA` no ambiente da Vercel — sem ela a carga LANÇA por desenho (fail-closed
   da M5); a M9 é a primeira vez que o caminho real roda em produção.
2. O "deploy intermediário" é merge do Yan (a sessão não deploya) — ou preview da branch com as envs
   de preview; decisão dele.
3. Ordem no mesmo dia: Lançamentos por Vencimento (em aberto) ANTES de Lançamentos por Operação (409).
4. Depois de ligar vigia/crons: `npm run db:baseline` e commitar (o `active` está no retrato).
5. O diff do backup-gate (61 → 79 tabelas) decidido no máximo antes da M10.

**M8 FECHADA (25/09) — baseline de schema e drift. Fronteira da Fase 4.**

- `supabase/baseline/schema-v6.json`: retrato do catálogo de produção nas partes do projeto — 79
  tabelas (colunas, constraints, índices, policies, triggers, ACL), 19 views, 330 funções por
  assinatura (hash do corpo, SECURITY DEFINER, `proconfig`, ACL), as roles `verificador`/`ingestor`
  (allowlist efetiva) e `anon`/`authenticated`/`service_role`/`authenticator` (configuração, onde
  vivem `statement_timeout` e fuso), `pg_default_acl`, `cron.job` (hash do comando, nunca o texto) e
  extensões. Metadado `ultima_migration` = 0283. Reprodutível (gerado duas vezes = byte-idêntico).
- Módulo único `scripts/schema-baseline/snapshot.mjs` gera E compara; `npm run db:baseline` regenera;
  `src/lib/schema-baseline.test.ts` reprova qualquer diferença nomeando-a. Provado ponta a ponta: com
  o arquivo adulterado (coluna removida + cron invertido) o teste nomeou exatamente as duas.
- **Convenção nova (skill `banco-e-rpc` §6, `/fechamento-versao` passo 5, checklist do `revisor-db`):
  migration aplicada — ou cron ligado/desligado — ⇒ `npm run db:baseline` no mesmo commit.**
  **Na M9: depois de ativar o vigia/crons, regenerar o baseline** (o `active` está no retrato).
- **Divergência do briefing (D12):** o briefing pede `supabase db dump --schema-only` → `.sql`. Não
  roda nesta máquina (o dump usa um container e o socket do Docker está negado; não há `pg_dump`
  local), e comparar SQL exigiria parsear texto. O baseline é JSON das mesmas queries de catálogo das
  sondas. Se quiser o `.sql` como companheiro legível: `sudo usermod -aG docker $USER` (relogin) e
  `npx supabase db dump --linked -f supabase/baseline/schema-v6.sql` (o dump já é só de schema por padrão — o `--schema-only` do briefing não existe nesta CLI).

> 🔴 **CHECKPOINT DO YAN — o backup-gate não cobre 18 das 79 tabelas (achado da M8).**
> `scripts/db-gate/lib.mjs:35` fixa `SCHEMAS = ['analytics','app','audit','dim','financeiro','raw']`
> (14/06, ADR-0116), de antes de existirem `estante` (2 tabelas — Estante Welcome), `patrimonio` (5 —
> Inventário), `ingestao` (6 — o log de cargas da v6) e `monde` (5 — o espelho). E a checagem de
> completude (`tabelasVivas()`) lê a MESMA lista, então é circular: "61 vivas / 61 no manifest" nunca
> fica vermelho por schema novo. Toda migration desde a v5.1.2 foi aplicada sem backup dessas tabelas.
> **Diff proposto (não aplicado — mexer na rede de recuperação é decisão sua):**
> ```js
> // scripts/db-gate/lib.mjs
> import { SCHEMAS_PROJETO } from '../schema-baseline/snapshot.mjs'
> export const SCHEMAS = SCHEMAS_PROJETO   // fonte única com o baseline; public não tem tabela
> ```
> Efeito: export e completude passam a cobrir as 79; o backup ganha o espelho Monde (~80 mil linhas,
> export um pouco mais lento). Com a fonte única, um schema novo precisa ser declarado uma vez só — e
> o teste de drift já reprova schema não declarado.

**M7 FECHADA (25/09) — grafo de carga, Welcome em todos os leitores, leitura** (desenho e provas:
`docs/briefings/anexo-v6-0-0-m7-desenho-grafo-e-leitura.md`).

- **Grafo** (`src/lib/ingestao/grafo.ts`): Lançamentos por Operação exige carga de Aberto
  **aplicada no dia** (data SP de `concluido_em` = `hojeSP()`), senão `409 DEPENDENCIA_AUSENTE`. O
  check roda antes de `abrirCarga`: não grava linha, não consome idempotência, não alarma; vale na
  conferência; leitura falhando ⇒ 500 (fail-closed). As outras arestas do §5 são ordem declarada.
  **Consequência operacional para a M9: subir Aberto ANTES de Operação no mesmo dia.**
- 🔴 **A M5 tinha deixado um buraco no invariante 1, fechado pela 0283 antes de ele custar número.**
  O filtro Welcome vivia só no `transform`; **seis** leitores liam `raw.vendas_excel` direto (Weddings:
  `regenerar_dim_operacao_weddings`, `contar_convidados_operacao`, os três `get_*weddings__nucleo`; e
  `vw_vendas_agregadas`, que alimenta Vendas em Aberto/prejuízo/receita negativa). Medido no cru de
  21/09: 5 linhas Welcome em 4 operações que existem fora de Welcome (2 casamentos) e 141 vendas — a
  carga de Vendas da M9 teria mudado número em Weddings. **0283 aplicada** (gate verde; `revisor-db`
  aprovou; 13 trocas conferidas contra o corpo vivo); ensaio em transação revertida: linha Welcome
  sintética não mexe em nenhum dos seis, o controle Trips mexe em todos. Sonda de catálogo nova
  (`sonda-leitores-vendas-excel.test.ts`) reprova qualquer leitor futuro fora da lista fechada.
- **Leitura:** "· parcial" no mês que a última carga do Demonstrativo cobriu só em parte (regra pela
  COBERTURA da base, não pelo calendário — export de 21/09 olhado em 01/10 continua com setembro
  parcial), na tabela densa e no YTD do Resumo, **só na competência**; nenhum valor mudou. Selos de
  carga novos em `/financeiro/fluxo-caixa` (Movimentação + Em aberto), `/performance*` (Vendas) e
  `/performance/weddings` (Vendas + Operações), lidos de `ingestao_carga_ultima` — **vazios até a M9**.

> ✅ **Decidido pelo Yan em 25/09:** (1) o caixa da DRE fica só com `·REAL`/`·PREV` — sem
> "· parcial"; (2) o carimbo mantém "Última atualização em DD/MM/AAAA HH:MM" (não o texto do
> briefing); (3) a "lista de operações exposta por RPC para a RPA" (contrato §5) NÃO se constrói na
> v6 — vira errata 4 na v6.1, junto da RPA de Operação.
>
> 🔴 **Ainda aberto (default adotado, não bloqueia):** (4) **caso residual da idempotência × grafo:** o replay por `carga_id` já vem
> antes do grafo (corrigido na auto-auditoria), mas a MESMA chave `x-ingestao-idempotencia` com
> `carga_id` NOVO num dia sem Aberto ainda leva 409 — fechar pede uma RPC de leitura por chave
> (aditiva, pequena; candidata a errata 4b). Default: registrar, não construir.

**M6b FECHADA (24/09) — limpeza do cru** (desenho e o que foi provado:
`docs/briefings/anexo-v6-0-0-m6b-retencao-do-cru.md`). Migration **0282** aplicada (gate verde,
`revisor-db` aprovou): log `ingestao.retencao`, inventário e registro service_role-only, cron
`ingestao-retencao` diário 07:30 UTC **nascido INATIVO**. Regra pura em `src/lib/ingestao/retencao.ts`
(3 meses de calendário para todo cru; 7 dias para o que nenhuma carga cita), rota
`/api/ingestao/retencao` (**GET sempre simula; apagar exige POST** — achado ALTO do `revisor`),
cartão "Limpeza do armazenamento" na tela, e o reprocesso de carga expirada explica o motivo.
Travas: só o bucket da ingestão, só paths do inventário, teto de 500 por rodada, recusa com zero
cargas, e o log registra só o que o Storage CONFIRMOU ter apagado. Suíte **1.595/94, zero falha**.
**Ativação na M9**, como `postgres`: `SELECT cron.alter_job((SELECT jobid FROM cron.job WHERE jobname
= 'ingestao-retencao'), active := true);` — ANTES, `POST /api/ingestao/retencao?simular=1` e conferir
a lista. A primeira exclusão real serão as 2 cópias órfãs de 24/09 (a partir de 01/10).

**M6 FECHADA (24/09).** A ingestão passou a ter memória e alarme. Migrations **0280** (log de
execução `ingestao.execucao`, incidentes `ingestao.alarme`, cadência `ingestao.expectativa`, cron
`ingestao-vigia` nascido INATIVO, 10 RPCs) e **0281** (o painel diz QUEM fez cada carga) aplicadas
sob o backup-gate (verde), as duas revisadas pelo `revisor-db` antes. Tela nova **`/admin/ingestao`**
(área `admin/uploads`); rota nova **`/api/ingestao/vigia`**; as rotas do Monde (incremental e
reconciliação) e do CDI gravam cada execução — sem mudar a resposta HTTP delas, e o log nunca lança.
Suíte: **1.560 testes, 93 arquivos, zero falha**; `tsc`, `lint`, `build` verdes.

**Tudo que depende do deploy nasceu DESLIGADO**: o cron do vigia (`active=false`) e as 9
expectativas (`ativo=false`). A rota do vigia só existe em produção depois do merge; ligar antes
faria o cron bater 404 a cada 15 min e aparecer VERDE em `cron.job_run_details` — a mesma armadilha
que esta missão existe para detectar. Ativação é a M9, nesta ordem: `ingestao_vigia_definir(true)`;
depois cada processo com `ingestao_expectativa_definir('<processo>', true)` só DEPOIS da 1ª execução
registrada dele (sem isso ele alarma na hora — foi o que a prova 2 mostrou de propósito); as bases só
quando a RPA existir (decisão 3, e a tolerância é obrigatória). Os alarmes de CARGA (rejeitada, ano
fechado alterado, par novo na bandeja) já valem desde a aplicação.

**Provado ao vivo em 24/09** (evidência — o `revisor-db` pediu que a prova do ALTO ficasse em disco):
- **O vigia liga e desliga o `pg_cron` de verdade** (o ALTO da 0280, não verificável no papel):
  `POST /rest/v1/rpc/ingestao_vigia_definir {"p_ativo": true}` com service_role → HTTP 200
  `{"ativo": true}` e `cron.job.active = true` (job 10, dono `postgres` = dono da função); em seguida
  `{"p_ativo": false}` → 200 e `active = false`. Estado final = inicial.
- **Prova 1 — carga com CHECKSUM FALSO (a do anexo §8):** export mínimo de Lançamentos, estrutura
  válida, TOTAL do arquivo adulterado (-301 no lugar de -300), em Lançamentos em Aberto pela rota real
  com sessão. Conferência PRIMEIRO (422 `CHECKSUM_FALHOU`, "1 de 3 conferências não fecharam", nada
  aplica) — só então `confirmar: true` → 422 `CHECKSUM_FALHOU`, linha `rejeitada` (carga
  `181c056a-…`), ZERO linha em `ingestao.promocao`, alarme `checksum_falho` aberto → notificado →
  resolvido. E-mail em MODO TESTE para `yan@welcometrips.com.br`, "checksum não fechou".
  Uma segunda prova, com arquivo que NÃO é planilha (carga `c633873f-…`, "Quem: Yan"), exercitou o
  outro ramo: 422 `FORMATO_INVALIDO`, mesmo alarme, e-mail SEM a palavra "checksum".
  (Minha primeira versão desta prova usou só o arquivo mal formado — divergia do anexo, que pede
  checksum falso; a auto-auditoria pegou.)
- **Prova 2 — vigia:** `cdi-mensal` ligado sem execução nenhuma → rodada 1 abre UM incidente e
  notifica; rodada 2 não manda outro; desligar → rodada 3 RESOLVE. Três execuções `ok` do próprio
  vigia no log.
- **Reprocesso pela tela:** copia o cru para um `carga_id` novo, roda só a conferência e mostra o erro
  real no modal. A cópia fica no bucket como objeto sem linha de carga (esperado — ver abaixo).

Defeitos que a revisão e as provas pegaram ANTES do commit (valem como lição):
- A tela chaveava os rótulos de alarme por nomes com HÍFEN (`checksum-falho`), copiados de um
  comentário errado da 0280; o código grava com SUBLINHADO. Nenhum alarme teria rótulo. Agora o mapa
  é `Record<TipoAlarmeIngestao, …>` — o `tsc` reprova divergência.
- Desligar uma expectativa em alarme deixava o incidente aberto PARA SEMPRE (o teste afirmava o
  defeito). Agora resolve.
- Toda rejeição 422 vira alarme `checksum_falho`, mas o e-mail dizia "o checksum não fechou" até para
  arquivo mal formado. Agora o texto segue o `codigo` da rejeição.
- O e-mail de processo que NUNCA rodou afirmava "sem resultado há 50.400 minutos" — o número é a
  tolerância (piso), não fato. Agora diz "nunca registrou execução OK" e fala em dias.
- `concluirCarga` (M4) podia lançar DEPOIS da promoção e regravar como `erro` uma carga aplicada.
  Agora nunca lança. O `dispararAlarmeDeEvento` ganhou o mesmo `catch`.
- A tela afirmava "(modo teste)" fixo no texto — mentiria no dia da virada para o e-mail real.

Registrado para o out-briefing (não bloqueia):
- O teste de contrato do painel roda pela conexão direta com claim `service_role`, NÃO pela
  credencial `verificador`: dar `admin/uploads` a uma credencial de máquina só para o teste alargaria
  a postura dela (o painel expõe nome/e-mail de quem carregou).
- `admin/uploads` passa a ver o NOME (`plataforma`) das chaves de `app.api_chave` que fizeram carga —
  a tabela é compartilhada com a API de Solicitações (BAIXO do `revisor-db`).
- A tolerância digitada na tela é o texto de `interval` do Postgres, em inglês ("45 minutes");
  "45 minutos" é recusado com erro. Mudar a tolerância de uma expectativa ATIVA exige desligar e
  religar. A tela não mostra quem alterou uma expectativa (o dado já vem do painel).
- Chave do incidente de "ano fechado alterado": o anexo §4 diz `base + ano`; a 0280 usa
  `base:ano:carga_id`. **Não é decisão**: alarme de evento é resolvido logo após notificar, então as
  duas chaves produzem exatamente os mesmos e-mails. Fica só como nota de divergência de texto.
- Sem teste da leitura de `pares_novos` em `aplicarDemonstrativo` nem de orquestração ponta a ponta de
  `processarCarga` (os alarmes são provados nas funções puras e ao vivo).

**M5 FECHADA (22/09).** As cinco bases têm carga atômica: `limpar_staging_{base}` →
`inserir_lote_staging_{base}` → `validar_carga_{base}` → `promover_carga_{base}(checksums, carga_id)`,
com TRUNCATE + INSERT + regeneração **dentro de uma transação**. A janela em que a base ficava vazia
ou parcial deixou de existir. Migrations **0277/0278** aplicadas sob o backup-gate (verde).
Suíte na fronteira da M5: **1.472 testes, 88 arquivos, zero falha** (numeração atual: ver "Verdade atual").

**O checksum do export agora é conferido DENTRO do banco**, contra o que ficou gravado — o que cobre
o trecho entre o parse e a tabela (serialização, cast, arredondamento de `NUMERIC(18,2)`, lote
perdido), que a conferência do servidor não alcança. O que cada base consegue reconferir foi medido,
não presumido: Demonstrativo reagrupa os 557 por soma mas **nunca declara contagem** (é o formato do
arquivo); Movimentação e Aberto conferem soma *e* contagem; Vendas confere 2 dos 4 campos somados
(os outros dois não têm coluna de destino); Operação não tem checksum monetário. A resposta distingue
"conferido" de "não conferível" — "conferi 0 de 557" não pode ter a mesma cara que "557 de 557".

**Ensaio em transação revertida contra produção** (a prova que o briefing pede para a M5), executado
em 22/09 no Demonstrativo: checksum errado (−3.234,00 no lugar de −3.234,56) levantou
`CHECKSUM_FALHOU` nomeando o que não fechou e por quanto; checksum certo aplicou; **base intacta,
3.334 linhas antes e depois**.

> 🔴 **O ensaio existe como execução documentada, não como teste commitado — e isso é decisão sua.**
> Torná-lo permanente significa acrescentar um arquivo a `ESCREVEM_E_REVERTEM_HOJE`
> (`src/lib/sonda-teste-escreve-banco.test.ts`), que é **lista fechada de propósito**: o comentário
> dela manda, a cada entrada nova, atualizar a contagem na skill `banco-e-rpc` §6 e **avaliar o
> gatilho do ambiente de teste próprio** — gatilho que já está tocado e já é uma decisão sua em
> aberto. Acrescentar um quinto caso por conta própria seria furar a disciplina que a própria sonda
> existe para segurar. O ensaio está em condições de virar teste em minutos, assim que você decidir.

**O filtro Welcome foi ANTECIPADO da M7 para cá, e o motivo é número em tela.** O filtro
`Setor Macro != "Welcome"` nunca existiu em código: vivia no script R, e o card antigo subia o
arquivo já tratado. Com o cru, aplicar Vendas somaria **141 vendas e R$ 470.320,84** ao `fato_venda`,
sem erro nenhum. Agora vive numa view nomeada (`analytics.vendas_excel_para_fato`) que o
`transform_raw_to_analytics` lê nas cinco leituras, com `IS DISTINCT FROM` — nunca `<>`, porque
`setor_macro` é anulável e `<>` excluiria em silêncio toda linha sem setor macro.

Medido contra a tabela viva imediatamente antes do push, e de novo depois: `raw.vendas_excel` com
48.652 linhas, **zero** de Welcome, zero com `setor_macro` nulo, 29.458 vendas distintas = exatamente
o `fato_venda`. A view é no-op sobre o dado de hoje.

**`situacao` de Vendas passa a ser GRAVADA (decisão do Yan, 22/09) — e é exceção declarada ao
invariante 1.** A coluna existe desde a 0038, criada exatamente para a tela "Vendas em Aberto", mas
o parser de cliente que ficou vivo nunca a populou; e `vw_vendas_agregadas` (0040) /
`get_vendas_em_aberto` (0114) filtram `situacao = 'Aberta'` ESTRITO. A tela existia e não mostrava
nada, sem ninguém ter como saber pela tela. Medido nos anexos: 411 "Aberta" e 48.451 "Fechada" em
48.865 linhas — os dois únicos valores, ambos dentro do CHECK da 0038. **Depois da primeira carga
de Vendas, "Vendas em Aberto" deixa de ser lista vazia.** Some-se às exceções visíveis já
declaradas (sufixo "parcial", carimbo de data, `Intermediário` preenchido).

Três coisas que a M5 corrigiu antes de aplicar, e que valem para quem seguir:

- **`p_checksums = []` promovia a base inteira devolvendo sucesso.** Um checksum AUSENTE não é
  "falho", mas o efeito prático é idêntico: base substituída sem nenhuma verificação. O invariante 5
  tinha uma porta dos fundos.
- **`EXCEPTION WHEN OTHERS` é quase sempre amplo demais.** O que se queria tolerar era só o erro de
  permissão; o amplo engoliria um bug real como se fosse aviso intermitente. Virou
  `WHEN insufficient_privilege` — e o ensaio provou o catch funcionando, porque pela conexão direta
  não há identidade JWT e `exigir_acesso` levanta justamente 42501.
- **Staging nova pode exigir coluna que o caminho anterior não precisava.** O parse de Operação nunca
  preenchia `arquivo_origem` (a base gravava direto no fato, que não tem essa coluna); com a staging,
  que a exige `NOT NULL`, toda carga dessa base falharia.

✅ **A CREDENCIAL `ingestor` PASSOU A APLICAR (22/09) — a promessa central da versão, cumprida.**
Decisão do Yan: separar o núcleo, mantendo a credencial estreita. A migration **0279** criou
`provisionar_dre_comp_par__nucleo()` (service_role-only), transformou a função pública em wrapper
que preserva o guard `financeiro/dre` para a tela, e concedeu as **21 assinaturas** que o derivador
oficial produziu. `aplicar.ts` deixou de usar `getAdminClient()`.

**Provado assumindo a identidade real**, em transação revertida contra produção (`SET LOCAL ROLE
ingestor` + claims do JWT): a credencial limpa a staging, insere, **recusa o checksum errado por
CHECKSUM — não por permissão** — e **aplica** com o certo (`{"avisos":[],"linhas":2,
"pares_novos":2,"checksums_conferidos":1}`); base intacta, 3.334 antes e depois. Na mesma sessão,
um `SELECT` direto em `raw.*` volta `permission denied for schema raw` — a credencial alcança as
RPCs e **nada além delas**.

O `avisos: []` com `pares_novos: 2` é a prova de que a separação funcionou: a função interna rodou
de verdade, sem aviso de permissão. O `EXCEPTION` que existia para tolerar aquele erro foi
**removido** — catch para um erro que não pode mais acontecer é ruído que engana quem lê depois, e
falha real da função interna deve derrubar a promoção.

**Fail-closed:** sem `SUPABASE_INGESTOR_SENHA` no ambiente, a carga LANÇA com mensagem operacional.
Cair de volta no `service_role` desfaria a versão inteira em silêncio, no momento em que a proteção
mais importa.

> ⚠️ **Risco registrado para a missão de corte / GATE 3:** o caminho LEGADO (`truncar_* +
> regenerar_fluxo_caixa` direto) ainda está vivo e **não toma** a chave de advisory lock compartilhada
> nova (`4017050`), que Movimentação e Aberto passam a tomar antes de reconstruir `fato_fluxo`.
> Enquanto os dois caminhos coexistirem, a exclusão mútua que ela promete pode ser furada por um
> chamador que não sabe dela.

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

> ✅ **As decisões abertas pela M4 foram TODAS respondidas em 22/09** e já estão implementadas:
> 1. **Errata 2 do contrato — ACEITA.** Registrada em `docs/contratos/ingestao-v1.md`, com o §2.1
>    e o §2.3 alinhados para o documento não se contradizer. Cobre (a) o campo `confirmar`
>    (default `true`), que repõe o gate humano do "antes → depois", e (b) a validade real da URL
>    assinada — o SDK não aceita o parâmetro, e o que protege o caminho é o `carga_id` dentro do
>    path mais o sha256 reconferido, não a janela curta.
> 3. ~~`situacao` de Vendas~~ — **DECIDIDA em 22/09: passa a ser gravada.** Ver abaixo.

**O card foi exercitado AO VIVO (22/09), com sessão real**, até o modal e sem aplicar:
Demonstrativo (1 arquivo) e Vendas (3 arquivos). O fluxo inteiro funcionou — sha256 no navegador,
URL assinada, `PUT` no Storage, conferência no servidor, modal com os números dela. As outras três
bases percorrem o MESMO caminho (o card é dirigido por configuração) e foram provadas no servidor.

A tela pegou dois números mentirosos que nenhum gate acusaria, os dois já corrigidos (`8e25c26`):
- **"Σ do arquivo: R$ 0,00"** — o modal exibia o `diff.soma` (a diferença) sob o rótulo "Σ do
  arquivo"; recarregando o mesmo arquivo a diferença é zero, e a tela dizia que o arquivo estava
  vazio — na base que se confere por SOMA. Agora lê "Σ do arquivo: R$ 508.964,10 · diferença
  contra a base atual: R$ 0,00".
- **"vai APAGAR os 29.458 e carregar 48.862 novos"** — o antes/depois do modal ainda comparava
  venda distinta com linha de item (o `diff` já tinha sido corrigido; o modal não usava o `diff`).
  Agora lê 29.458 → 29.599.

> **Lição que vale além desta versão: a mesma confusão de grandeza reapareceu em TRÊS lugares**
> (o diff, o título do modal e o rótulo da Σ), e cada um foi pego por um método diferente — o
> smoke de servidor, a leitura do código e a tela ao vivo. Corrigir a primeira ocorrência não
> encontra as outras: quando duas grandezas parecidas convivem, procure TODOS os pontos onde uma
> é exibida no lugar da outra.

> ⚠️ **A conferência cancelada deixa o cru no bucket sem linha de carga** (por desenho: o arquivo
> fica para reprocesso, e a conferência não loga), e o reprocesso da M6 também (a cópia sob o
> `carga_id` novo, se o operador não confirmar). São objetos órfãos. Correção do registro: esta nota
> dizia que retenção e limpeza eram "da M6" — o briefing NÃO pede limpeza automática; pede
> **retenção DECLARADA no ADR** (proposta: 24 meses, revisar), que é item do fechamento (M11). Limpeza
> de órfãos fica como decisão sua no out-briefing. Os 8 objetos das provas da M4 foram removidos; os
> da prova da M6 (cargas `c633873f-…` e `181c056a-…` e a cópia do reprocesso) ficaram, como exemplo
> real — e a limpeza abaixo vai recolhê-los.

> **A carga real das cinco bases continua sendo a M9**, com checkpoint seu — hoje nada foi
> aplicado.

> ⚠️ **`SUPABASE_INGESTOR_SENHA` ainda não está no ambiente da Vercel.** Não bloqueia a M4 (a
> aplicação roda com `service_role`, como as Server Actions já faziam), mas bloqueia a M5, que é
> quando a credencial `ingestor` passa a ser quem aplica.

> ⚠️ **Intermitência vista uma vez, não reproduzida — registrada de propósito.** Em 22/09, numa de
> três execuções da suíte cheia, `src/lib/ingestao/oraculo-operacao.test.ts` reprovou em "a lista de
> operações derivada de Vendas cobre a lista curada à mão"; as outras duas execuções e a execução
> ISOLADA do arquivo passaram (16/16). Não diagnostiquei — o oráculo só lê fixture, então a hipótese
> mais provável é contenção de recurso na suíte paralela, que ficou mais pesada com o teste novo que
> abre conexão de banco. **Não tratar como ruído:** teste que falha uma vez em três é exatamente o
> que esconde defeito real, e a versão inteira depende desses oráculos. Quem vir de novo, anote a
> mensagem completa antes de re-rodar.

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
| Produção | **v5.12.0** (PR #275, mergeado 24/09 às 15:44 — sem migration; o `main` segue na 0272). Esta branch ainda não trouxe o `main`: no fechamento, conflito esperado em `WORKING-CONTEXT.md`, skill `banco-e-rpc`, `CHANGELOG.md`, `changelog-diretoria.ts` e `package.json` — nenhum em código da ingestão |
| Última migration aplicada | **0283** (v6.0.0/M7a — Welcome em todos os leitores de Vendas) · próxima livre: **0284** |
| Último ADR | **0175** (v6.0.0 — separação credencial de verificação × aplicação) · próximo livre: **0176** |
| Suíte | **1.657 testes**, 99 arquivos, zero falha, zero `skip` (25/09, fim da M8) |

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
