# Out-briefing — v5.4.0 · API Externa de Solicitações

**Tipo:** MINOR · **PR #191 PRONTO (checklist de merge executado em 2026-07-28, pós-v5.3.3)** ·
base main @ v5.1.11, reconciliada com main @ v5.3.3 no merge · migrations **0210–0214**
(nasceram provisórias 0950–0954, APLICADAS; renumeradas + `migration repair`) · ADRs **0158–0161**
(nasceram 0950–0953) · briefing `Janus_Briefing_v5-4-0_API_Externa_Solicitacoes.pdf`.

## Missões (todas entregues)

| M | Entrega | Migration |
|---|---|---|
| M1 | Fundações no cadastro de tipos: slug estável, **chave estável por campo** (sobrevive ao apaga-e-recria), flags `exposto_via_api`/`exige_referencia_conclusao`, roles permitidas; editor com os controles; retrofit via RPC service-only (8 tipos/53 campos preenchidos) | 0210 |
| M2 | `app.api_chave` (hash sha256; callback URL+segredo de saída; whitelist; robô; revogação irreversível) + `api_chamada_log` + 8 RPCs + tela `/admin/api-externa` (Group neutro, gated `solicitacoes`; segredo exibido UMA vez; criação provisiona o robô no Auth com `ativo=false`) | 0211 |
| M3 | **Validação compartilhada** `app.solic_validar_e_snapshotar` (extraída verbatim, incl. regra de data v4.19) consumida pela RPC humana E pela irmã `criar_solicitacao_externa` (idempotência única por chave + corrida tratada; destinatário do disparo sem fallback, ecoado) + `cancelar_solicitacao_externa` + `solic_tipos_api` + rotas `/api/externo/*` (auth por chave, erros estruturados, 64KB, log) + proxy por prefixo | 0212 |
| M4 | **Outbox at-least-once**: enfileira os 4 eventos NA transação da movimentação (só origem externa); processador com claim `SKIP LOCKED` + backoff exponencial (teto 8 → esgotado) via pg_cron */5 + entrega inline (aguardada) nas rotas externas; `solic_concluir(p_referencia)` obrigatória quando o tipo exige (persiste e viaja no callback); drawer/board pedem o campo; `solic_emails_envolvidos_svc` corrige o fan-out da porta externa | 0213 |
| M5 | Seed do tipo **"Abatimento de créditos"** (9 campos com chaves explícitas; `exige_referencia_conclusao=true`; **roles vazias = inerte até o Yan configurar**) + **documento de contrato** `docs/api-externa-solicitacoes.md` (substitui o handoff como fonte) | 0214 |
| M6 | Versão 5.4.0, CHANGELOG, CHANGELOG_DIRETORIA, ADRs provisórios, este out-briefing, checklist de merge | — |

## Validação

- **Gates:** `tsc` 0 · `eslint` 0 · `vitest` — suíte inteira verde; a suíte nova de contrato da
  API externa rodou **24/24 AO VIVO** contra produção pós-aplicação · `next build` limpo.
- **Paridade UI×API provada por caso** (mesma função valida as duas portas): obrigatório ausente,
  moeda inválida, **data no passado com a regra da v4.19**, seleção fora das opções, destinatário
  inexistente/fora da lista, chave de campo desconhecida, tipo fora da whitelist → TODOS recusados
  com erro estruturado.
- **Idempotência:** retry com a mesma `chave_idempotencia` devolve o MESMO id (`idempotente:true`),
  não duplica solicitação, e-mail nem callback (1 item na outbox).
- **Chave estável:** editar o tipo (re-salvar campos + adicionar campo novo) preserva TODAS as
  chaves preexistentes; o campo novo ganha chave gerada.
- **Outbox:** reivindicar incrementa tentativa com claim atômico; falha reagenda com backoff;
  cancelamento externo enfileira o evento; conclusão exige e propaga a referência.
- **Prova do ciclo ponta-a-ponta — 16/16 (2026-07-21):** executada contra as ROTAS HTTP reais
  (`next dev` da branch + banco de produção; o preview da Vercel tem SSO de Deployment
  Protection e não aceita chamada de máquina sem bypass — funcionalmente equivalente, mesma
  pilha proxy→handler→RPC; o preview fica para o checkpoint visual do Yan). Sequência provada:
  `GET /tipos` (descoberta com chaves/destinos) → `POST` criação 201 com destinatário ecoado →
  **callback `solicitacao.criada` ENTREGUE inline** (recebedor real respondendo 200) → retry
  idempotente (200, mesmo id, 1 só solicitação/callback) → solicitação **aberta para a role
  certa** → concluir SEM referência recusado (`REFERENCIA_OBRIGATORIA`) → concluída COM
  referência persistida → **rota do cron (CRON_SECRET) entrega o callback `concluida` com a
  referência** → cancelamento externo 200 + callback `cancelada` entregue → cancelar de novo
  409 `CONFLITO_ESTADO` → sem chave 401 → campo desconhecido 422 → **chave revogada recusa
  imediatamente** 401 → log com todas as chamadas → fixtures 100% removidas (nomes ZZ_E2E).
- **Pareceres (revisão de contexto separado, pré-gates finais):**
  - **`revisor` (código/app): APROVADO COM RESSALVAS** — 0 CRÍTICO/ALTO. Os 3 MÉDIOS foram
    **endereçados**: (1) narrowing defensivo do retorno das RPCs nas rotas (drift de shape →
    500 explícito, nunca e-mail duplicado/201 indevido em replay); (2) `maxDuration = 60`
    explícito nas rotas de negócio; (3) corte por ORÇAMENTO de tempo no processador da outbox
    (item não processado volta no próximo tick — at-least-once preservado). BAIXOs
    **registrados**: `compararHashConstante` sem consumidor atual (reservada para comparação
    direta futura); segredo de callback não tem caminho de "limpar" na UI (write-only — trocar
    é o caminho); comparação do CRON_SECRET `===` (padrão pré-existente do Monde; hardening
    constant-time já está na fila antiga); `getDestinatarios` falho degrada sem faixa de erro
    no editor (efeito discreto); campos não usados na interface `ChaveResolvida`.
  - **`revisor-db` (migrations): as 5 APROVADAS** — 0 CRÍTICO/ALTO; classificação
    aditiva/warn conferida contra o tokenizer; paridade da validação extraída confirmada
    **linha a linha** contra as defs vivas; REVOKE/GRANT conferidos um a um; coalesce/fail-closed
    ok; fuso preservado. O MÉDIO (falta de sonda automatizada de negação anon/authenticated nas
    9 RPCs service-only) foi **endereçado**: sonda `it.each` adicionada à suíte de contrato
    (33/33 ao vivo). BAIXOs já rastreados no checklist de merge (renumeração/repair; tipo
    homônimo; DOWN da 0213 referencia a 0212; idempotência não revalida payload — mitigada
    pela recomendação do contrato).

## Decisões técnicas registradas

1. **Retrofit via RPC** (`api_retrofit_contratos`, service-only) e não UPDATE na migration: o
   classificador do db-gate marca UPDATE top-level como destrutivo (fail-closed correto); isto é
   dado novo em coluna nova — o gate foi respeitado, não burlado (ADR-0159).
2. **Robô no Auth** (`auth.admin.createUser` + `rbac_usuarios.ativo=false`): exigência de FK; com
   `ativo=false` o `exigir_acesso` nega qualquer sessão dele — não opera a plataforma (ADR-0158).
3. **Resistência a timing por hash-then-lookup** (sha256 índice) — o timing não se relaciona ao
   segredo; `compararHashConstante` disponível para comparações diretas futuras.
4. **Entrega inline apenas nas rotas externas** (aguardada, timeout 5s — nunca fire-and-forget,
   lição v4.25); movimentações humanas ficam com a varredura do cron (≤5 min de latência de
   callback) para não atrasar o atendente.
5. **pg_cron da outbox reusa os secrets do Vault da 0182** (`monde_cron_secret`/`monde_app_url` =
   CRON_SECRET/URL do app) — nomes históricos, sem secret novo para o Yan cadastrar.
6. **`titulo` do POST externo → `descricao`** da solicitação (não há coluna nova; núcleo genérico).

## Pendências nomeadas (operação/decisão do Yan — nenhuma bloqueia o PR)

1. **Tipo homônimo:** já existia um "Abatimento de créditos" humano (id 9; pós-retrofit
   `abatimento_de_creditos_2`). O seed criou o tipo do contrato (id 13, `abatimento_de_creditos`).
   Ficam DOIS tipos com o mesmo nome no editor — decidir: arquivar/renomear o antigo, ou migrar o
   uso humano para o novo. NADA foi alterado no antigo (preservação por padrão).
2. **Configurar as roles permitidas** do tipo do contrato (hoje vazio = integração inerte,
   fail-safe) e **criar a chave TARS** na tela `/admin/api-externa` (o segredo aparece UMA vez —
   repassar ao Vitor junto com `docs/api-externa-solicitacoes.md`).
3. **E-mail “chega à role”:** o fan-out da porta externa usa a mesma camada v4.25 (best-effort,
   depende de `SMTP_*` na Vercel — pendência antiga).
4. Follow-ups v2 registrados nos ADRs: HMAC de callbacks, rate limiting, anexos via API,
   “em nome de”, rotação assistida de segredo, painel de métricas.

## ✅ CHECKLIST DE MERGE — EXECUTADO em 2026-07-28 (pós-v5.3.3)

1. [x] v5.3.0 mergeada na main (o arco fechou em v5.3.3, main @ dbf049c).
2. [x] merge de `main` (v5.3.3) em `feat/v5-4-0-api-externa` (sem force-push); resolvidos
   os 4 conflitos (package.json→5.4.0; CHANGELOG/diretoria intercalados 5.4.0›5.3.3›…;
   WORKING-CONTEXT reescrito). proxy.ts e areas.ts auto-mergearam.
3. [x] Migrations renumeradas **0950–0954 → 0210–0214** (git mv, ordem relativa preservada) e
   histórico remoto realinhado: `migration repair --status reverted 0950…0954` +
   `--status applied 0210…0214` (conteúdo já aplicado; nada foi reaplicado).
4. [x] ADRs renumerados **0950–0953 → 0158–0161** (próximos reais após o 0157 do harness);
   referências cruzadas atualizadas em migrations, CHANGELOG, out-briefing e comentários do código.
5. [x] `src/proxy.ts` conferido pós-merge: a v5.3.3 mexeu no MATCHER (isenção de `fonts/`) e o
   auto-merge preservou ambos — `API_AUTH_PROPRIA`+prefixos intactos (guard mecânico
   `src/proxy.test.ts` da v5.3.3 cobre as bordas).
6. [x] Untracked 0185–0195 removidos ANTES do merge (os arquivos reais vieram da main).
7. [x] Gates completos pós-merge + suíte de contrato ao vivo (ver seção Validação/adendo).
8. [x] PR marcado ready — **merge do Yan é o próximo passo**; no deploy, o cron da outbox para
   de dar 404 e drena qualquer pendência no primeiro tick.

**Nota até o merge:** o job pg_cron `api-outbox-processar` (já agendado) chama a rota em produção,
que só existirá após o deploy do merge → 404 a cada 5 min em `net._http_response` (inofensivo:
a outbox só recebe itens de solicitações EXTERNAS, que só nascem pelas rotas — inexistentes em
produção até o merge; zero dado afetado).

## Arquivos (39 no diff; ver PR #191)

---

## Round 2 (2026-07-28) — decisões do Yan pós-checklist de merge

**Decisão 1 — EXTIRPAR "conclusão exige referência externa"** (era decisão do briefing §1;
revertida pelo Yan: o Janus é dono do formato e a conciliação origem↔lançamento é
responsabilidade da plataforma de origem — registrado como emenda nos ADRs 0159/0161 e como
nota no contrato do integrador, seção 6):
- Migration **0215 (ADITIVA, aplicada)**: `solic_concluir` volta a 1 parâmetro; `solic_json`/
  `admin_solic_listar_tipos`/`solic_tipos_api`/`admin_solic_salvar_tipo` param de emitir/aceitar
  o conceito; callback `solicitacao.concluida` sem campo `referencia`.
- UI: drawer/board concluem em 1 clique (regressão zero vs pré-v5.4.0).
- **PATCH DESTRUTIVO PÓS-MERGE (o Yan aplica em TTY):** dropar as 2 colunas órfãs. SQL pronto
  (guardado FORA de `supabase/migrations/` até a hora — regra da skill banco-e-rpc):
  ```sql
  -- v5.4.x — limpeza pós-extirpação (round 2 da v5.4.0). DESTRUTIVA (DROP COLUMN).
  ALTER TABLE app.solicitacao_tipo DROP COLUMN IF EXISTS exige_referencia_conclusao;
  ALTER TABLE app.solicitacao      DROP COLUMN IF EXISTS referencia_conclusao;
  ```
  Pré-condição já satisfeita pela 0215: nenhuma função lê/escreve essas colunas.

**Decisão 2 — Página única "API externa"** (`/admin/api-externa`): seção nova **Tipos expostos**
(toggle "Exposto via API" + **"Equipes que podem receber via API"** — corrige o rótulo enganoso
"Permissões que podem criar via API"; a semântica é DESTINO do disparo, ADR-0160 — salvando via
RPC dedicada `admin_solic_tipo_api_config`, que não re-grava o formulário) + seção de chaves +
log. Editor de tipos voltou a ser só formulário (nome + campos; chave estável por campo fica).
Pill de gestão renomeada para "API externa".

**Validação do round:** tsc 0 · eslint 0 · **vitest 557/557** (suíte de contrato ao vivo
pós-0215; caso de referência removido, caso de conclusão adaptado) · build limpo ·
**Pareceres do round:** `revisor-db` — **0215 APROVADA** (0 crítico/alto; MÉDIO do DOWN
não-autocontido registrado como divergência de convenção — os corpos vivem na 0210/0212/0213;
BAIXO do comentário da rota tipos CORRIGIDO). `revisor` — **APROVADO C/ RESSALVAS** (ALTO:
tipo arquivado sinalizado só por cor na tabela nova — CORRIGIDO com sufixo textual
"(arquivado)" + truncate efetivo com `block min-w-0`; BAIXOs corrigidos/registrados).
`verificador-visual` automatizado falhou por infra (MCP Playwright não acopla em background —
recorrência da v5.3.3); a verificação visual foi feita pelo orquestrador no Chrome do Yan
(sessão dele, modo leitura): página "API externa" ✓ (título, slugs visíveis, modal com rótulo
correto), editor só-formulário ✓, pill renomeada ✓.

**Achado GRAVE pego pela verificação visual (e resolução):** o tipo do contrato (seed 0214,
id 13) havia sido EXCLUÍDO da produção pela tela de tipos — na tela de produção (sem slug
visível) os dois homônimos eram indistinguíveis, e só o novo (0 solicitações) era excluível;
o Yan confirmou ter excluído achando ser o antigo. O slug canônico ficou livre e o seed
(idempotente) foi RE-EXECUTADO (novo id 39, exposto, 9 campos, exige_referencia=false
conforme o round 2). O tipo humano antigo (id 9, `abatimento_de_creditos_2`, 1 solicitação)
segue ativo — arquivá-lo/renomeá-lo é 1 clique do Yan. A tela nova mostra o slug exatamente
para eliminar essa ambiguidade daqui em diante.

---

## Round 3 (2026-07-29/30) — decisões do Yan

**Decisão 3 — a lista branca de equipes POR TIPO (`api_roles_permitidas`) foi REVOGADA.**
Razão do Yan, endossada: **o fluxo humano nunca restringiu destino por tipo** (na tela, qualquer
tipo vai para qualquer equipe) — manter a API mais estrita que a própria UI é assimetria sem
justificativa, sendo o Janus dono do formato. **Permanece o núcleo do ADR-0160:** `destinatario`
é obrigatório no disparo e validado contra as equipes existentes (inexistente → erro
estruturado, nunca fallback) e é ecoado no ack/callbacks. Migration **0216 (ADITIVA, aplicada)**:
`criar_solicitacao_externa` sem a checagem por tipo (o erro `DESTINATARIO_NAO_PERMITIDO` deixa
de existir — saiu também do mapeamento HTTP e do contrato); `solic_tipos_api.destinos` passa a
listar **todas as equipes**; `admin_solic_tipo_api_config` vira `(p_tipo_id, p_exposto)`;
`admin_solic_listar_tipos`/`admin_solic_salvar_tipo` param de emitir/aceitar o array. Emenda
datada no ADR-0160. A coluna `api_roles_permitidas` fica **órfã** — junta-se às duas da 0215 no
**mesmo patch destrutivo pós-merge** (SQL atualizado abaixo).

**Decisão 4 — a configuração de um tipo é só ligar/desligar.** A tabela "Tipos expostos" perdeu
a coluna de equipes e o modal: a coluna "Exposto" é um controle direto que salva na hora
(Checkbox + spinner na linha + faixa de resultado). Arquivo do modal removido.

**Decisão 5 — documentação DENTRO da plataforma** (`/admin/api-externa/documentacao`, pill
"Documentação"): o contrato inteiro renderizado no DS (não há renderizador de markdown no
projeto — é página real, com sumário e âncoras) e, o mais importante, **a seção 3 é VIVA**: lê o
cadastro real e mostra os tipos hoje expostos com slug e a tabela de campos (chave, rótulo, tipo,
obrigatoriedade, opções) + as equipes válidas. A documentação não desatualiza em relação ao que a
API de fato aceita. O `docs/api-externa-solicitacoes.md` continua como a cópia para o integrador,
apontando para a página como versão viva.

### Patch destrutivo pós-merge — SQL FINAL (as TRÊS colunas órfãs)

```sql
-- v5.4.x — limpeza pós-decisões dos rounds 2 e 3. DESTRUTIVA (DROP COLUMN).
-- Pré-condição verificada: nenhuma função lê/escreve estas colunas após as 0215/0216.
ALTER TABLE app.solicitacao_tipo DROP COLUMN IF EXISTS exige_referencia_conclusao;
ALTER TABLE app.solicitacao_tipo DROP COLUMN IF EXISTS api_roles_permitidas;
ALTER TABLE app.solicitacao      DROP COLUMN IF EXISTS referencia_conclusao;
```

### Validação do round 3
`tsc` 0 · `eslint` 0 · **`vitest` 557/557** (o caso que exigia `DESTINATARIO_NAO_PERMITIDO` virou
o inverso — destino livre ACEITO, com o destinatário resolvido ecoado; a asserção de idempotência
foi reescopada para o par (chave, chave_idempotencia), que é o que ela de fato promete — antes
contava todas as solicitações da chave e ficava acoplada a qualquer caso novo) · `build` limpo ·
smoke pós-push via REST/`service_role` + `pg` com JWT simulado em transação revertida:
`admin_solic_tipo_api_config` responde na assinatura nova de 2 parâmetros e alterna a exposição.

### ⚠️ Estado do CADASTRO em produção (observado no smoke — decisão do Yan pendente)

O tipo semeado pela 0214 (9 campos do handoff) foi **excluído novamente** pelo Yan, e ele
**expôs via API o seu próprio tipo pré-existente**: `id 9`, slug **`abatimento_de_creditos_2`**,
com **3 campos** — `venda_que_originou_o_credito`, `motivo_do_abatimento`,
`venda_em_que_o_credito_sera_utilizado`. Como a descoberta e a página de documentação leem o
cadastro real, o contrato que o TARS veria hoje é **esse**, e ele **não corresponde** aos
requisitos do handoff do Vitor (valor, moeda, categoria, fornecedor, forma de pagamento…). Nada
foi alterado no cadastro pelo Code.

**DECIDIDO pelo Yan (30/07): o contrato é o que está exposto** — o TARS se adapta e manda os 3
campos do tipo 9 (`venda_que_originou_o_credito`, `motivo_do_abatimento`,
`venda_em_que_o_credito_sera_utilizado`), com destinatário livre entre as equipes. O
`docs/api-externa-solicitacoes.md` foi reescrito com ESSE contrato (exemplos de descoberta,
criação e callback usando o slug `abatimento_de_creditos_2` e as 3 chaves reais); a página de
documentação da plataforma já refletia o cadastro sozinha. **A migration 0214 (seed de 9 campos)
fica como registro histórico** — já aplicada, não reexecuta, e o tipo que ela criou não existe
mais; nenhuma ação necessária.

**Cosmético — RESOLVIDO no Round 4 (ver abaixo):** o slug do tipo exposto carrega o sufixo de dedup
(`abatimento_de_creditos_2`), herdado do retrofit quando havia dois homônimos — o canônico
`abatimento_de_creditos` está livre. O slug é imutável por invariante (ADR-0159) para proteger
contratos externos; como NENHUM integrador está ligado ainda, uma correção única antes da
primeira integração seria segura (migration aditiva de 1 linha). Decisão do Yan; sem ela, o
contrato vive com o `_2`, que é apenas feio, não errado.

**Achado cosmético:** a chave gerada para um rótulo muito longo é truncada em 60 caracteres e
pode cortar no meio da palavra (ex.: `..._nome_fantasia_ou_cn`). Funciona (é única e estável),
mas se o rótulo virar contrato externo vale editar a chave. Registrado, sem ação.

---

## Round 4 (2026-07-30/31) — decisões do Yan, com a plataforma já aberta ao público interno

Cinco pedidos, todos entregues. O contexto muda a natureza deles: a plataforma deixou de ser
ambiente de construção e passou a ter público interno real, então "começar limpo" e "quem pediu
tem de conseguir acompanhar" deixaram de ser cosméticos.

### 1+2. Limpeza do histórico e correção dos sufixos `_2` — patch **0220** (DESTRUTIVO, mãos do Yan)

Pedido: *"para começarmos com o histórico limpo quero que você apague todo o histórico de
solicitações com os devidos cuidados, após isso apague os 2 tipos que hoje estão arquivados, eram
apenas teste"* e *"após a limpeza do histórico o caminho fica livre para corrigirmos os sufixos dos
slugs"*.

**Censo conferido na base real (31/07) antes de escrever uma linha:** 26 solicitações · 21 anexos
(metadado) + **20 binários** no bucket `solicitacoes-anexos` (3,2 MB; nenhum arquivo sem metadado,
1 metadado sem arquivo) · 9 registros em `api_chamada_log` (TODOS `401 auth_negada` das minhas
verificações — zero tráfego de integrador, nenhuma chave emitida) · 0 na outbox · 0 chaves de API · 9
tipos (7 ativos, 2 arquivados). O bucket `acervo-documentos` (8 arquivos, outro módulo) **não é
alvo** e é conferido antes/depois.

**O patch está em `supabase/patches/0220_limpeza_historico_e_slugs.sql` — deliberadamente FORA de
`supabase/migrations/`.** Motivo: `db push` empurra todo o conjunto pendente, e a 0217 desta mesma
versão é aditiva e **precisou ser aplicada agora** (a paridade RBAC banco↔app é teste de contrato:
sem a área nova no banco, `npm test` reprova). Se a 0220 estivesse na pasta, teria ido junto, sem
confirmação humana — foi assim que a v5.2.0 dropou bases. Confirmado que o classificador do
db-gate marca o arquivo como **destrutiva** (`top-level destrutivo: DELETE FROM app.api_outbox`);
os DELETEs estão em nível superior de propósito, porque dentro de `DO $$ ... $$` o tokenizador não
os veria e o arquivo passaria por aditivo.

**Como aplicar (2 comandos, na sua mão, nesta ordem):**

```bash
node scripts/limpeza-anexos-solicitacoes.mjs --confirmar   # 20 binários do Storage
git mv supabase/patches/0220_limpeza_historico_e_slugs.sql supabase/migrations/ \
  && npm run db:migrate -- --destrutiva
```

O script de Storage é par obrigatório do SQL: apagar `storage.objects` por SQL removeria o
**registro** e deixaria os **bytes** órfãos no bucket. Ele cruza cada arquivo com
`app.solicitacao_anexo`, **preserva** (fail-closed) o que não souber identificar, roda em dry-run
sem `--confirmar`, e confere a contagem do bucket do Acervo antes e depois. Se rodar DEPOIS do SQL
(metadado já apagado), use `--incluir-orfaos` — que exige `app.solicitacao_anexo` vazia como prova.

**Ordem interna do SQL** (FK e semântica): outbox → `api_chamada_log` → anexo (metadado) →
solicitação → campos + os 2 tipos arquivados → renomeação dos slugs. Guardas com `RAISE EXCEPTION`
**antes** (o mundo ainda é o do censo? existe alguma chave de API? o slug-destino está livre?) e
**depois** (histórico zerado? 7 tipos? nenhum sufixo `_2`? o tipo exposto ficou com o slug
canônico?) — qualquer uma desfaz o arquivo inteiro, porque o push aplica cada migration em
transação.

**Slugs corrigidos:** `abatimento_de_creditos_2` → `abatimento_de_creditos` e `contas_a_pagar_2` →
`contas_a_pagar`. Isso abre **exceção única e datada** à imutabilidade do slug (ADR-0159, emenda):
o slug é o identificador que o integrador manda no payload, e renomear com integração ligada
quebraria o contrato dele em silêncio. Só é seguro porque **`app.api_chave` está vazia** — a guarda
aborta se houver qualquer chave. **Consequência de ordem: aplique o patch ANTES de criar a chave do
TARS.** Se a chave for criada primeiro, a guarda barra (corretamente) e o slug fica com `_2`.

### 3. Documentação da API com permissão própria, na tela inicial do módulo — migration **0217** + UI

Área RBAC nova **`solicitacoes/documentacao`** ("Solicitações (documentação)", grupo Solicitações,
ordem 55), inserida no catálogo pela 0217 e espelhada em `src/lib/auth/areas.ts`. O guard da página
virou `requireArea(['solicitacoes/documentacao', 'solicitacoes'])` — semântica OU: quem tem gestão
continua entrando. No mapeamento rota→áreas, a regra específica de
`/admin/api-externa/documentacao` precisou vir **antes** da genérica `/admin/api-externa` (o
`startsWith` casa a primeira; teste novo cobre exatamente essa ordem). O botão passou a viver **só na tela inicial de
Solicitações**, em condicional separada da de gestão — a pill que existia na tela de administração
foi REMOVIDA a pedido do Yan (31/07): dois caminhos deixavam a permissão própria parecendo
acessório de uma tela de gestão —
quem só integra não precisa de acesso de gestão. **Nenhum role recebe a área automaticamente:** o
Yan concede pelo editor de permissões.

### 4. Ordem na tela "API externa"
**Chaves de API** subiu para cima de **"Tipos Expostos"** (E maiúsculo, como pedido); o skeleton do
`loading.tsx` foi invertido junto, senão a silhueta desmentiria a tela real por um instante.

### 5. Solicitante amarrado a uma pessoa real — migration **0217** (decisão de produto)

Pedido: *"não seria melhor se a solicitação vinda da API necessitasse de um e-mail que já esteja
cadastrado na plataforma para amarramos a um usuário, forçando que para que seja possível disparar
solicitação pela API antes o usuário tenha que ter cadastro na plataforma?"* — e, entre as
variantes, o Yan escolheu **amarrar de verdade: a pessoa é a solicitante**.

`POST /api/externo/solicitacoes` ganhou `solicitante_email` **obrigatório**. A RPC resolve contra
`app.rbac_usuarios` (`lower(btrim(...))`, exigindo `ativo`) e grava esse `user_id` em
`solicitacao.solicitante_id` — **não mais o robô da chave**. Sem e-mail → `SOLICITANTE_OBRIGATORIO`;
sem cadastro ativo → `SOLICITANTE_INVALIDO` (422, sem fallback). O ack ecoa
`solicitante {email, nome}` — o e-mail **como está cadastrado**, não a normalização do payload — e
no reenvio idempotente ecoa o solicitante da solicitação que já existia.

**O ganho não é burocrático:** com o robô como autor, a solicitação não tinha dono humano — não
aparecia em "Minhas solicitações" de ninguém, o e-mail de movimentação ia para um endereço que
ninguém lê e **ninguém conseguia cancelá-la pela tela** (`solic_cancelar` exige
`solicitante_id = uid_jwt()`). Com a amarração, os três comportamentos passam a valer **sem que
nenhuma RPC de UI mude**. A fronteira de confiança não afrouxa: a chave continua sendo a
autorização, e agora há uma **segunda** exigência de identidade.

**Proveniência migrou de "autor" para marcador + selo:** `app.solic_json` passou a emitir
`origem: { plataforma } | null`, e a UI mostra **"via integração X"** no drawer, no board e em
"Minhas solicitações". Sem o selo, um pedido vindo do CRM ficaria indistinguível de um aberto na
tela pela própria pessoa. Emenda no **ADR-0158** (supera o item 3, "autor = usuário-robô").

### Validação do round 4

`npx tsc --noEmit` 0 · `npm run lint` 0 · **0217 aplicada** com backup-gate VERDE (52 tabelas,
restore-test spot ✓ em 3 tabelas) · suítes de contrato **ao vivo** 144/144 —
`contrato-api-externa` (37) rodou de fato (o gate `pronargs=9` só libera com a 0217 aplicada) e
inclui **4 casos novos**: `SOLICITANTE_OBRIGATORIO`, `SOLICITANTE_INVALIDO`, e-mail com
caixa/espaços divergentes, e o caso que **prova** que `solicitante_id` vem do e-mail e não do robô
(usa um SEGUNDO usuário ativo — com o mesmo uid nas duas pontas, como estava, a asserção era
tautológica) · paridade RBAC banco↔app verde com a área nova.

### Pendências do round 4 (mãos do Yan)

1. **Rodar o script de Storage + aplicar o patch 0220 em TTY** (comandos acima), **antes** de criar
   a chave do TARS — a guarda de slug depende disso.
2. **Conceder a área "Solicitações (documentação)"** aos roles que devem ver a documentação (a área
   nasce sem nenhum grant).
3. **Avisar o Vitor da mudança de contrato:** `solicitante_email` é campo novo e obrigatório, e a
   pessoa precisa ter cadastro ativo no Janus antes do primeiro disparo. O
   `docs/api-externa-solicitacoes.md` e a página de documentação da plataforma já estão
   atualizados.
4. O patch das **3 colunas órfãs** (rounds 2 e 3) continua pendente e independente — se preferir
   uma única passada destrutiva, o SQL dele pode ser anexado ao fim do 0220 antes de aplicar.

### Revisão do round 4 — `revisor` + `revisor-db` (achados e desfecho)

**`revisor-db`: 0 CRÍTICO / 0 ALTO.** Confirmou a preservação verbatim do corpo da 0216 na 0217
(linha a linha), os grants service_role-only, a impossibilidade de `origem: {plataforma: null}` (FK
+ `NOT NULL`), a impossibilidade de resolver um robô como solicitante (`ativo=false` por
construção), o escape correto do `LIKE '%\_2'`, e — o que mais importa — que nenhum Zod do projeto
usa `.strict()`, então a chave nova `origem` **não quebra o front da v5.3.4 já em produção**.

**`revisor` (código): 1 CRÍTICO + 2 ALTO + 2 MÉDIO + 3 BAIXO.** Todos endereçados, exceto um
MÉDIO registrado com receita (abaixo).

| Sev | Achado | Desfecho |
|---|---|---|
| CRÍTICO | A área nova não alcançava o DADO: a seção viva da página lia `admin_solic_listar_tipos`, gated na área de **gestão**. Quem tivesse SÓ `solicitacoes/documentacao` passava no guard da página e tomava `PERMISSAO_NEGADA` do banco — seção vazia com aviso de erro, justo para a pessoa que a permissão existe para atender. | **CORRIGIDO** — migration **0219**: RPC-irmã `solic_tipos_documentacao()` com gate nas DUAS áreas e devolvendo **só** tipos expostos/não-arquivados (menor privilégio: afrouxar o gate da de admin daria a quem só documenta a visão do cadastro inteiro, incluindo arquivados e contagens de tipos internos). O gate da de admin ficou intocado. **Provado** com JWT simulado em transação revertida: a irmã responde (1 tipo), a de admin continua negando, a role do usuário volta ao normal no ROLLBACK. |
| ALTO | `docs/api-externa-solicitacoes.md` contraditório: a nota nova dizia que o slug é `abatimento_de_creditos`, mas os TRÊS exemplos JSON ainda usavam `abatimento_de_creditos_2` — quem copiasse o payload tomaria `TIPO_INVALIDO`. | **CORRIGIDO** — os três literais passaram ao slug canônico (a página da plataforma já usava). |
| ALTO | O script de Storage apagava produção com base só num argumento (`--confirmar`): uma sessão de agente ou um CI poderia rodá-lo, e o header do patch dá o comando pronto para colar. | **CORRIGIDO** — gate de TTY igual ao do `db:migrate --destrutiva` (`confirmaDestrutivaEOF` reaproveitada): stdin não-TTY **ABORTA**, e num terminal exige digitar "aplicar". **Provado**: rodei `--confirmar` nesta sessão (não-TTY) e o script abortou sem apagar nada. |
| MÉDIO | A guarda do patch só emitia `NOTICE` das contagens: uma solicitação criada por um colega entre a redação e a execução seria apagada em silêncio. | **CORRIGIDO** — hard stop `IF v_sol > 26` com instrução explícita (conferir o que apareceu; se ainda quiser apagar tudo, ajustar o número — ato consciente de uma linha). |
| MÉDIO | O caso de idempotência reenviava com o MESMO e-mail, então não provava "ecoa o solicitante GRAVADO" (um bug que re-resolvesse o e-mail do retry passaria). | **CORRIGIDO** — caso novo reenvia com e-mail de OUTRA pessoa e exige que o ack e o dono da linha sigam sendo os da criação. |
| BAIXO | Links internos da página de documentação levavam a `/admin/api-externa` (exige gestão) — beco sem saída para o público-alvo da permissão nova. | **CORRIGIDO** — com só a permissão nova, o link de volta aponta para `/solicitacoes` e o aviso "nenhum tipo exposto" virou "peça a quem administra" em vez de mandar a pessoa para uma tela que ela não abre. |
| BAIXO | Guarda de colisão de slug só existia para `abatimento_de_creditos`, não para `contas_a_pagar`. | **CORRIGIDO** — guarda simétrica (troca erro cru de constraint por mensagem que explica). |
| BAIXO | Censo dizia 21 metadados e 20 arquivos sem reconciliar o número. | **CORRIGIDO** — o header explica: 1 metadado já estava órfão, drift anterior a esta versão. |
| MÉDIO (0217, revisor-db) | Ack idempotente podia trazer `solicitante.email = null` (cadastro da pessoa removido de `rbac_usuarios` depois) e o narrowing estrito da rota transformava isso em **500**. | **CORRIGIDO na rota** — `email` passa a ser `string \| null` no ack idempotente (a chave continua obrigatória: ausência ainda é drift → 500). Na criação segue sempre string. |
| MÉDIO (0217, revisor-db) | No ramo de corrida (`unique_violation`) o ack ecoa o `solicitante`/`destinatario` **desta** chamada, não os da linha vencedora. | **REGISTRADO, não corrigido.** Dispara só se o integrador reusar a MESMA chave de idempotência em chamadas concorrentes com payloads diferentes (bug do lado dele); o eco é do dado que ele mesmo mandou (não há vazamento) e a assimetria já existe para `destinatario` desde a 0212. **Receita:** no bloco `EXCEPTION WHEN unique_violation`, trocar o `SELECT s.id, s.status` por um `SELECT` com `LEFT JOIN app.rbac_usuarios` (igual ao ramo idempotente antecipado) e ecoar os valores da linha vencedora — `CREATE OR REPLACE` de assinatura idêntica, migration aditiva de um bloco. |

**BAIXOS do banco registrados sem ação** (nenhum é falha ativa): sem índice funcional em
`lower(email)` de `rbac_usuarios` (13 usuários ativos; RPC service_role sem timeout); a UNIQUE de
`email` é case-sensitive, então "sem duplicata por caixa" é convenção dos caminhos de escrita e não
restrição de banco (um índice único em `lower(email)` seria cinto-e-suspensório); `admin_definir_
usuario_ativo` não distingue robôs (um admin poderia, deliberadamente, reativar um — não alcançável
por integrador); e o subselect por linha de `origem` em `solic_json` (tabela minúscula, e o `CASE`
nem executa em solicitação interna).

**Fora do escopo, corrigido de graça:** `registrarChamada` (`src/lib/api-externa/http.ts`) tinha um
`catch {}` **mudo** — o mesmo padrão que atrasou o diagnóstico da v5.3.4, num log de AUDITORIA,
onde o silêncio é pior porque faz o log parecer completo. Passa a logar a falha, mantendo o
best-effort.

**Verificação visual do round 4: NÃO FEITA.** O `next dev` local caiu no login (sem sessão) e o
agente não digita credenciais. As mudanças visuais são de layout/rótulo/condicional
(pill nova, ordem das seções, título "Tipos Expostos", selo). Vale um olhar seu em
`/solicitacoes` (pill "Documentação da API") e `/admin/api-externa` (ordem + título). O **selo "via
integração X"** não é observável hoje em tela nenhuma: nenhuma solicitação tem `origem_chave_id`
(as de teste foram todas limpas) — ele aparece no primeiro disparo real do TARS.

### Ajustes de 31/07 (pós-revisão, pedidos do Yan)

- **Rota renomeada:** `/admin/chaves-api` → **`/admin/api-externa`**. O nome antigo descrevia UMA das
  tabelas; a página, depois dos rounds 2–4, é a tela da integração (tipos expostos + chaves + log).
  A pasta `src/components/admin/chaves-api/` foi renomeada junto (`api-externa/`), porque no repo ela
  espelha a rota — deixar as duas divergindo é o tipo de detalhe que confunde meses depois. O arquivo
  `chaves-api-content.tsx` manteve o nome: ele é o conteúdo da tabela "Chaves de API", que continua
  se chamando assim. Regras de rota→área em `areas.ts` e os casos de `areas.test.ts` acompanharam
  (inclusive a ordem específico-antes-de-genérico).
- **A página de documentação perdeu a pill de voltar:** ela existe por conta própria e é alcançada
  pela tela inicial do módulo. `ArrowLeft` e os tokens de PILL ficaram órfãos no arquivo e saíram.
- **Rótulos:** pill virou **"Documentação API"**; subtítulo virou "Contrato do integrador
  (autenticação, descoberta, criação, callbacks e erros)". O caminho de navegação citado no
  `docs/api-externa-solicitacoes.md` foi corrigido para **Solicitações → Documentação API**.
- **Renumeração da destrutiva: 0218 → `0220`.** Erro meu de ordem: reservei o 0218 para a limpeza e
  depois apliquei a **0219** (correção do CRÍTICO), deixando o 0218 ABAIXO do topo remoto — o
  `db push` recusa fora de ordem e pede `--include-all`. Renumerar põe o arquivo em ordem e dispensa
  a flag. **Lição durável: não reservar número de migration destrutiva que será aplicada depois de
  uma aditiva da mesma leva — numere na hora de aplicar.**
- **Estado no fim do dia:** o script de Storage **rodou** (bucket `solicitacoes-anexos` em 0
  arquivos, cópia íntegra de 20 arquivos/3,3 MB em `~/wt-finance-backups/2026-07-31-anexos-solicitacoes`,
  assinaturas conferidas), mas o **SQL não** — então as 21 linhas de `app.solicitacao_anexo` apontam
  para binário inexistente e o download de anexo dessas 26 solicitações falha. **O `0220` é a metade
  que fecha esse estado**; rodar `npm run db:migrate -- --destrutiva` no terminal do Yan.

### Endpoint de CONSULTA (31/07) — migration 0221

**Pergunta do Yan:** *"não seria mais fácil para o nosso lado criarmos um endpoint de consulta no
Janus?"*. Resposta: sim, e por um motivo mais forte que conveniência — era **falha de desenho**.

Sem leitura, a integração tinha dependência dura do OUTRO lado: se o integrador não construísse e
hospedasse um receptor de webhook, criava pedidos e nunca sabia o desfecho — risco de lançamento
fora do nosso controle. E a outbox **desiste após 8 tentativas** (`esgotado`): endpoint dele fora do
ar por algumas horas perdia o evento **para sempre**, sem caminho de reconciliação.

**O que entrou:** `public.consultar_solicitacoes_externas(p_chave_id, p_solicitacao_id,
p_referencia_origem)` (leitura pura, STABLE, service_role-only) + `GET /api/externo/solicitacoes/{id}`
+ `GET /api/externo/solicitacoes?referencia_origem=…`. Índice parcial novo
`idx_solicitacao_ref_origem` para a busca pela referência do integrador.

**Decisões de desenho que valem registro:**
- **Escopo no WHERE, não em checagem posterior:** `origem_chave_id = p_chave_id` faz parte da
  consulta. Solicitação de outra chave — ou aberta na TELA por um humano, que tem origem NULL —
  responde 404, e os três casos respondem **igual de propósito**: 404 não distingue "não existe" de
  "não é seu", senão a rota vira oráculo de ids alheios.
- **Busca por `referencia_origem` devolve COLEÇÃO** mesmo com um resultado, porque essa referência
  **não é única** no Janus (só o par chave + `chave_idempotencia` é). Devolver "o primeiro" faria o
  integrador conciliar contra o pedido errado. Sem resultado = `200` com lista vazia (busca sem
  retorno), não 404.
- **Uma RPC, duas rotas:** a RPC devolve sempre array; quem impõe "exatamente uma" é a rota de item.
  Evita duas funções quase iguais.
- **Narrowing próprio** (`src/lib/api-externa/consulta.ts`): item sem `status` reprovaria em silêncio
  como "ainda não decidida" e o integrador esperaria para sempre → drift vira 500 explícito.
- **Fora de escopo, deliberado:** não devolve os valores dos campos (`respostas` — ele acabou de
  enviá-los) e não existe listagem "tudo o que esta chave criou" (seria outra funcionalidade:
  paginação, ordenação, volume).

**Verificação:** 0221 aplicada com backup-gate verde · suíte de contrato ao vivo **44 casos** (7
novos: consulta por id, por referência, escopo negando solicitação sem origem, sem critério, chave
revogada, e o par movimentação→consulta refletindo `cancelada` com `decidido_em`) · **prova HTTP** de
5 cenários contra o dev server com chave e solicitação efêmeras inseridas direto no banco (nenhum
e-mail disparado) e zero resíduo: 200 no item, 200 na coleção, 200 com lista vazia, 422 sem
parâmetro, 404 em id inexistente. Documentado nas DUAS cópias (contrato `.md` e página da
plataforma), com renumeração das seções seguintes.

---

## Round 5 (2026-07-31) — remoção dos callbacks: o Janus não faz chamadas de saída

**Como surgiu:** ao ler a explicação dos campos de callback na tela de chaves, o Yan perguntou *"não
seria mais fácil para o nosso lado criarmos um endpoint de consulta?"* (virou a 0221) e, na sequência,
*"se os callbacks forem desnecessários com o endpoint de consulta vamos removê-los, nós somos donos do
formato, não devemos precisar mandar nada de volta, os outros sistemas que devem nos consultar"*.
Pediu **calma** antes de eu executar — parei as duas frentes que já haviam sido despachadas (nada foi
escrito), expliquei o trade-off, e ele confirmou: *"vamos seguir com a remoção"*.

**O argumento que decidiu.** A máquina de push era a única peça que obrigava o OUTRO lado a construir
e proteger infraestrutura, e a única que nos obrigava a manter fila, cron de 5 min, backoff e um
segredo por chave. Com a consulta existindo, ela adiantava em minutos uma informação já disponível —
ao custo de um modo de falha próprio (`esgotado` = evento perdido). **O preço da remoção, dito antes
de executar:** a pontualidade passa a ser inteiramente responsabilidade da plataforma de origem;
enquanto ela não consultar, ninguém do lado dela sabe, e do nosso lado nada parece errado.

**Migration 0222 (aditiva, aplicada) — 9 funções.** Cinco pararam de enfileirar
(`criar_solicitacao_externa`, `cancelar_solicitacao_externa` e as TRÊS do fluxo humano:
`solic_concluir`, `solic_rejeitar`, `solic_cancelar`); quatro perderam os campos de callback
(`api_chave_listar`, `api_chave_resolver`, e `api_chave_registrar`/`api_chave_atualizar`, que trocaram
de assinatura — 6→4 e 4→2 params, `DROP`+`CREATE`, WARN no classificador).

**Método que vale registrar:** os corpos NÃO foram copiados à mão das migrations antigas. Extraí o
corpo VIVO de produção com `pg_get_functiondef`, removi só as linhas do enfileiramento (e os
comentários que só falavam dele) por script, **conferi o diff linha a linha** (mostrou exatamente 1
`PERFORM` + 1 comentário por função, e nada mais), varri os fragmentos de comentário que ficaram
órfãos, e validei o arquivo inteiro aplicando-o numa transação REVERTIDA antes de aplicar de verdade.
Para uma função de 180 linhas, isso é uma garantia que transcrição manual não dá.

**Patch destrutivo — `supabase/patches/PENDENTE-remover-outbox-e-colunas-orfas.sql`, SEM NÚMERO.** É a
lição de hoje aplicada: numerar na hora de aplicar (`git mv` para o próximo livre real), porque
reservar número para destrutiva que vai depois de uma aditiva foi exatamente o que fez o `db push`
recusar mais cedo. Ele remove a fila (0 linhas), as 3 RPCs, o cron, as 2 colunas de callback **e
aproveita para levar as 3 colunas órfãs dos rounds 2 e 3** (pendência antiga; se preferir separar,
apagar a Parte 2 do arquivo). Guarda 1 ABORTA se a 0222 não estiver aplicada — sem ela, dropar o
enfileirador deixaria as três RPCs humanas chamando função inexistente e a tela quebraria na primeira
conclusão. Também aborta se a fila tiver item pendente ou se existir chave emitida.

**Verificação:** tsc 0 · lint 0 · build limpo · **591/591** (saíram os 6 casos de fila; o de conclusão
foi reescrito e agora confere o par que substitui o callback — movimentação HUMANA na tela, leitura
pela CONSULTA) · suíte de contrato ao vivo rodou (38 casos) · conferido no banco que **nenhuma função
enfileira** e que a única que ainda lê colunas de callback é a própria RPC da fila, que o patch
remove. A microcópia dos modais, que eu havia escrito de manhã dizendo "não existe endpoint de
consulta", foi corrigida antes (commit próprio) — erro meu de texto que envelheceu no mesmo dia.

---

## Round 6 (2026-07-31) — whitelist de tipos por chave removida + "Referência" + comentários

**Pedidos do Yan:** *"retirar a whitelist de tipos da chave de API, cada chave de API deve ter acesso
a todos os tipos expostos, não precisamos de tanta complexidade de restrições"*; na tela de criação,
*"Plataforma" vira "Referência"* e a tela *"só pede Referência, sem descrição ou subtítulo"*; e, no
meio do trabalho, *"aproveite para consertar também os comentários desatualizados das funções"*.

**Por que a whitelist tinha de cair (e é o mesmo erro do Round 3, um nível acima).** Havia duas
listas brancas EM SÉRIE: o tipo precisava estar `exposto_via_api` **e** constar da whitelist da
chave. Isso não é controle fino, é dois lugares para a mesma decisão — e o efeito prático era um
`403 TIPO_NAO_AUTORIZADO` que o integrador não tinha como diagnosticar, para um tipo que a NOSSA
tela mostrava como exposto. Sobra um controle, num lugar, visível: o interruptor de exposição do
tipo. `TIPO_NAO_AUTORIZADO` deixa de existir no contrato.

**A consequência que eu avisei antes de executar:** a whitelist era o **único campo editável** de uma
chave. Sem ela, `api_chave_atualizar` não tinha o que atualizar → **RPC dropada**, modal "Editar
chave" e botão removidos. Uma chave passa a ter dois estados na vida: criada e revogada. Não foi
decisão de escopo minha; foi o que sobrou depois de tirar o campo.

**Migration 0224 (aditiva, aplicada)** — 5 funções reescritas (`solic_tipos_api`,
`criar_solicitacao_externa`, `api_chave_listar`, `api_chave_resolver`, `api_chave_registrar` 4→3
params) + 1 dropada (`api_chave_atualizar`). Mesmo método da 0222: corpo VIVO do
`pg_get_functiondef`, remoção cirúrgica, **diff conferido linha a linha** e validação aplicando numa
transação REVERTIDA. Aproveitei para matar duas variáveis mortas em `criar_solicitacao_externa`
(`v_chave_whitelist` e `v_chave_robo` — este último já não era usado desde o Round 4).

**Comentários desatualizados (pedido no meio do caminho).** Varri **todas** as funções de `app` e
`public` procurando comentário que citasse outbox, callback, whitelist, referência de conclusão,
equipes por tipo ou **ADR em numeração provisória** (0950+, renumerada no merge). Eram 3 linhas — uma
já consertada pela própria 0224. As outras duas entraram nela:
- `consultar_solicitacoes_externas` citava "payload de callback, 0213" (não existe mais).
- `solic_emails_envolvidos` dizia que *o autor-robô fica fora do fan-out porque o recibo da integração
  são os callbacks (ADR-0953)* — **errado em três frentes ao mesmo tempo**: o autor virou uma PESSOA
  ativa no Round 4 (e portanto ENTRA no fan-out), os callbacks morreram no Round 5, e ADR-0953 era a
  numeração provisória do 0161. A lógica (`AND ativo`) não mudou; só a explicação, que agora é
  verdadeira.

**Patch destrutivo pendente:** `supabase/patches/PENDENTE-remover-coluna-whitelist.sql`, **sem número**
(numerar na hora, `git mv` + `--destrutiva`). Dropa só `app.api_chave.whitelist_tipos`. Guarda aborta
se a 0224 não estiver aplicada.

**UI:** modal de criação com **um campo só** ("Referência", sem ajuda embaixo); modal de edição e o
componente da whitelist **apagados**; coluna da whitelist e botão "Editar" fora da tabela; o rótulo
visível "Plataforma" virou "Referência" (a coluna do banco continua `plataforma` — renomear coluna
seria churn destrutivo sem ganho).

**Documentação auditada** (o Yan pediu explicitamente para conferir se cobre o estado atual): 3
correções — o bullet de Conceitos que falava de "lista de tipos autorizados", o texto da Descoberta
("os tipos que a SUA chave pode abrir" → todos os expostos) e a linha `TIPO_NAO_AUTORIZADO` da tabela
de erros. O resto foi conferido item a item contra o produto de hoje (numeração das seções,
referências cruzadas, `TIPO_INVALIDO`, ausência de callback/robô-autor) e estava correto.

### Prova das três RPCs humanas reescritas (rounds 5 e 6)

Os rounds 5 e 6 reescreveram `solic_concluir`, `solic_rejeitar` e `solic_cancelar` — as três do fluxo
que **toda a empresa** usa na tela — só para deixarem de enfileirar callback. A mudança é pequena
(remoção de um `PERFORM`), mas o raio de dano de um erro ali é a tela de Solicitações inteira, e a
suíte só cobria `solic_concluir`. Então exercitei as três contra o banco real, com JWT simulado em
transação **revertida** (role efêmera, a pessoa virando membro da equipe destinatária para ser
atendente, três solicitações-fixture):

| RPC | Resultado |
|---|---|
| `solic_concluir` | `concluida`, `decidido_por` e `decidido_em` preenchidos |
| `solic_rejeitar` | `rejeitada`, justificativa gravada |
| `solic_cancelar` | `cancelada`, autoria e data preenchidas |
| `solic_rejeitar` com justificativa em branco | **recusado** (`JUSTIFICATIVA_OBRIGATORIA`) — a regra sobreviveu |

Depois do `ROLLBACK`: 0 roles ZZ, a role do usuário de teste voltou à original, 0 solicitações na
base. Nenhum resíduo.

**Guarda PERMANENTE nova:** acrescentei à suíte de contrato o caso **`solic_cancelar` pela TELA** —
que é a promessa do Round 4 (a pessoa amarrada como solicitante consegue cancelar; com o robô como
autor era impossível) e **não tinha teste nenhum**. Ele confere `status=cancelada`, que
`decidido_por` é a PESSOA, e que o integrador vê o cancelamento pela consulta. 39 casos na suíte.

**Lacuna que fica registrada:** `solic_rejeitar` continua sem guarda permanente. Um teste dela exigiria
tornar um usuário real membro de uma equipe efêmera (é a única forma de ser atendente) e restaurar
depois — se a suíte falhasse no meio, deixaria um usuário de verdade numa role de teste que o
`afterAll` depois apaga. Julguei o risco maior que o ganho **numa suíte que roda contra produção**, e
preferi registrar do que criar um teste capaz de sujar cadastro real. Cobertura hoje: `concluir` e
`cancelar` no automatizado, `rejeitar` na prova manual acima.
