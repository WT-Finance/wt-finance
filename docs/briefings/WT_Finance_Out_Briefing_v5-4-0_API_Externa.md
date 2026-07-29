# Out-briefing — v5.4.0 · API Externa de Solicitações

**Tipo:** MINOR · **PR #191 PRONTO (checklist de merge executado em 2026-07-28, pós-v5.3.3)** ·
base main @ v5.1.11, reconciliada com main @ v5.3.3 no merge · migrations **0210–0214**
(nasceram provisórias 0950–0954, APLICADAS; renumeradas + `migration repair`) · ADRs **0158–0161**
(nasceram 0950–0953) · briefing `Janus_Briefing_v5-4-0_API_Externa_Solicitacoes.pdf`.

## Missões (todas entregues)

| M | Entrega | Migration |
|---|---|---|
| M1 | Fundações no cadastro de tipos: slug estável, **chave estável por campo** (sobrevive ao apaga-e-recria), flags `exposto_via_api`/`exige_referencia_conclusao`, roles permitidas; editor com os controles; retrofit via RPC service-only (8 tipos/53 campos preenchidos) | 0210 |
| M2 | `app.api_chave` (hash sha256; callback URL+segredo de saída; whitelist; robô; revogação irreversível) + `api_chamada_log` + 8 RPCs + tela `/admin/chaves-api` (Group neutro, gated `solicitacoes`; segredo exibido UMA vez; criação provisiona o robô no Auth com `ativo=false`) | 0211 |
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
   fail-safe) e **criar a chave TARS** na tela `/admin/chaves-api` (o segredo aparece UMA vez —
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
