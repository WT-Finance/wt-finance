-- ---------------------------------------------------------------------------
-- 0280 — feat(v6.0.0/M6): log de execução dos processos agendados, alarme deduplicado
--        por incidente, expectativas (config) com liga/desliga por RPC, painel de leitura
--        da tela e o cron `ingestao-vigia` (inativo) — anexo v6.0.0/M6 §3
--
-- DECLARAÇÃO PRÉVIA (regime aditivo / autônomo):
--   • O QUE FAZ: TRÊS tabelas novas no schema `ingestao` (já existente, 0276) —
--     `ingestao.execucao` (uma linha por execução de processo agendado: monde-incremental,
--     monde-reconciliacao, cdi-mensal, ingestao-vigia — anexo §3), `ingestao.alarme` (um
--     INCIDENTE por (tipo, chave), nunca um disparo — é o que impede o alarme de virar spam
--     quando um processo fica fora do ar por horas) e `ingestao.expectativa` (config: quais
--     processos/bases têm expectativa de cadência, com que tolerância, mais `alterado_em`/
--     `alterado_por` — nasce com TODAS as linhas `ativo = false`, decisão do Yan/anexo §2 item 3
--     e §6); SETE RPCs `SECURITY DEFINER` novas SEM sessão de usuário, service_role-only
--     (`ingestao_execucao_abrir/concluir`, `ingestao_alarme_abrir/resolver/marcar_notificado`,
--     `ingestao_soma_por_ano`, e `ingestao_vigia_estado` — esta ÚLTIMA acrescentada neste
--     complemento, é o que o VIGIA lê para decidir se algo está atrasado; ver o bloco dedicado
--     mais abaixo sobre por que `ingestao_painel()` NÃO serve para isso) mais TRÊS RPCs de
--     LEITURA/CONFIGURAÇÃO expostas à TELA `/admin/ingestao`
--     (`app.exigir_acesso(ARRAY['admin/uploads'])` inline, GRANT a `authenticated`+`service_role`):
--     `ingestao_painel()` (leitura — inclui agora o estado do cron do vigia),
--     `ingestao_expectativa_definir` e `ingestao_vigia_definir` — é ASSIM que a decisão 3 do
--     anexo ("liga-se por configuração, sem código novo") se cumpre: sem elas, ligar a
--     expectativa ou o cron exigiria `UPDATE`/`cron.alter_job` direto no banco, isto é, uma
--     MIGRATION NOVA — e uma migration com `UPDATE` em dado existente é DESTRUTIVA pelo gate
--     (confirmação humana em TTY), o oposto de "sem código novo"; e o cron `ingestao-vigia`
--     (`*/15`, molde da 0182), criado **INATIVO** por `cron.alter_job(..., active := false)` na
--     mesma instrução que o agenda.
--   • `ingestao.baseline` NÃO é criada (decisão 2 do Yan, anexo §2) — a "sujeira conhecida"
--     continua aparecendo no resultado de cada carga (`avisos`/`cruzamento` em
--     `promover_carga_operacao`, 0278), só não dispara e-mail. Fora de escopo desta migration.
--   • POR QUE OS CRONS NÃO GRAVAM EM `ingestao.carga` (anexo §3, "Por que os crons NÃO
--     gravam..."): o `CHECK` de `base` daquela tabela lista as CINCO bases de upload — um
--     cron não é nenhuma delas, e alargar aquele CHECK é `DROP CONSTRAINT` + `ADD CONSTRAINT`
--     (destrutiva); as colunas de `ingestao.carga` são de ARQUIVO (sha256, checksums, diff) e
--     uma execução de cron não tem nenhuma; e a cadência é outra (o incremental roda 96x/dia,
--     a carga de arquivo, uma). Por isso uma tabela IRMÃ (`ingestao.execucao`) — a junção para
--     a tela é a RPC de leitura (`ingestao_painel`), não uma tabela única.
--   • DEDUPLICAÇÃO DE INCIDENTE GARANTIDA PELO BANCO, não pelo código que chama (anexo §3,
--     achado ALTO da 0276 não se repete aqui): `ingestao_alarme_abrir` é UM `INSERT ...
--     ON CONFLICT (tipo, chave) WHERE resolvido_em IS NULL DO NOTHING` — nenhum
--     `check-then-insert` (a corrida da 0276 nasceu de dois SELECTs antes do INSERT; aqui há
--     só a instrução atômica). `FOUND` depois do INSERT diz se ESTA chamada abriu o incidente
--     (novo=true) ou se um já estava aberto (novo=false, devolve o existente) — é esse booleano
--     que decide se o chamador manda e-mail. Duas chamadas concorrentes para o MESMO (tipo,
--     chave): o índice único parcial `idx_ingestao_alarme_aberto_unico` é o único árbitro;
--     só uma das duas insere, a outra recebe FOUND=false e relê a linha vencedora.
--   • ALARME DE ESTADO × ALARME DE EVENTO — distinção que este complemento introduz, porque o
--     desenho original não a separava e ela decide o formato da `chave` e o que o painel lê.
--     ESTADO (`processo_sem_resultado`, `carga_esperada_nao_chegou`): a condição PERSISTE — o incidente
--     fica aberto enquanto o processo continuar sem resultado, e o vigia mesmo o resolve
--     (`ingestao_alarme_resolver`) quando a condição some; `chave` é só o processo/base
--     (ex.: `'monde-incremental'`), porque É a MESMA condição continuando. EVENTO
--     (`checksum_falho`, `par_novo_bandeja`, `ano_fechado_alterado`): cada OCORRÊNCIA é um fato
--     novo — se a `chave` fosse só `'movimentacao:2024'`, duas cargas seguidas mexendo em 2024
--     cairiam no MESMO incidente aberto (o índice único as dedup por desenho) e a SEGUNDA não
--     notificaria — a deduplicação engoliria exatamente o que o alarme existe para avisar. Por
--     isso a `chave` de um alarme de EVENTO inclui o `carga_id` (ex.:
--     `'movimentacao:2024:<carga_id>'`), e quem chama (`carga.ts`) RESOLVE o incidente logo
--     depois de notificar — ele vira registro de um evento passado, não um estado pendente.
--     Nenhuma mudança de schema decorre disto: o índice único parcial sobre `resolvido_em IS
--     NULL` continua servindo os DOIS casos (é o `carga_id` dentro da chave, não o índice, que
--     separa duas cargas diferentes tocando o mesmo ano). A CONSEQUÊNCIA que muda é a leitura:
--     um alarme de EVENTO passa por "aberto" só entre `ingestao_alarme_abrir` e o `resolver` que
--     vem logo depois — se `ingestao_painel()` só devolvesse `alarmes_abertos`
--     (`resolvido_em IS NULL`), todo alarme de evento SUMIRIA da tela no instante em que fosse
--     enviado, e a tela é justamente onde alguém confere o que aconteceu. Por isso
--     `ingestao_painel()` agora devolve TAMBÉM `alarmes_recentes` (últimos 50, abertos e
--     resolvidos, mais recentes primeiro) — `alarmes_abertos` continua existindo, é o que a
--     tela destaca no topo (na prática, quase sempre só alarme de ESTADO).
--   • `status = 'pulado'` é STATUS PRÓPRIO em `ingestao.execucao`, de propósito (anexo §3): o
--     incremental do Monde devolve "PULADO (lock ocupado)" quando outra ingestão está em
--     curso — é um cron SAUDÁVEL que esperou a vez. Contá-lo como falha faria o vigia alarmar
--     exatamente quando o sistema está trabalhando; por isso o vigia (rota futura, M9) trata
--     `ok` e `pulado` como "processo respondeu dentro da janela", só a AUSÊNCIA de qualquer um
--     dos dois dentro da tolerância é alarme.
--   • TOLERÂNCIA POR PROCESSO — a regra usada, e por quê, está no INSERT de seed abaixo
--     (comentário por linha). Resumo: 3× a cadência para os dois processos de ~15 min
--     (monde-incremental, ingestao-vigia); cadência diária + folga para a reconciliação
--     (3 disparos/dia, maior intervalo saudável entre dois "ok" ~23h30: 06:35 → 06:05 do dia seguinte); maior mês do
--     calendário + folga para o CDI mensal (auto-curativo por desenho, contrato §8 da skill
--     banco-e-rpc). As CINCO bases nascem com `tolerancia NULL` — só ganham um valor quando a
--     RPA existir (decisão 3) — e o CHECK `ingestao_expectativa_tolerancia_se_ativo` impede
--     alguém ligar `ativo=true` sem antes preencher uma tolerância (nasce false em toda linha,
--     então o CHECK não bloqueia esta migration; passa a valer no dia em que alguém tentar
--     ativar uma linha sem tolerância).
--   • `ingestao.alarme.tipo` NÃO tem CHECK fechado — decisão desta migration, registrada para
--     o revisor-db confirmar: os cinco tipos do anexo §4 (checksum_falho, ano_fechado_alterado,
--     par_novo_bandeja, processo_sem_resultado, carga_esperada_nao_chegou) são a lista de HOJE, mas um
--     enum fechado aqui faria qualquer tipo novo (esperado — a decisão 3 liga "carga esperada
--     não chegou" só quando a RPA existir, e o alarme de baseline pode voltar em versão futura)
--     exigir DROP CONSTRAINT + ADD CONSTRAINT (destrutiva, TTY) só para nascer. `processo` e
--     `tipo`/`alvo` de `expectativa`, ao contrário, SÃO fechados por CHECK: mudam junto de uma
--     migration nova de qualquer forma (novo processo = novo cron = nova migration), então
--     fechá-los não cria fricção futura desproporcional.
--   • `ingestao_execucao_abrir` valida `p_processo` contra a MESMA lista de 4 do CHECK da
--     tabela (raise nomeado `PROCESSO_INVALIDO`, em vez de deixar estourar `check_violation`
--     cru) — mesmo padrão de `ingestao_carga_abrir`/`BASE_INVALIDA` (0276).
--   • `ingestao_soma_por_ano(base)` lê a BASE VIVA, que para Demonstrativo/Movimentação/Aberto
--     é a própria `raw.*` (a promoção é TRUNCATE + INSERT…SELECT direto, sem colapso nem
--     descarte) mas para Vendas e Operação é a tabela `analytics.*` — NUNCA o raw — porque
--     nessas duas a "base" e o "arquivo" contam grandezas DIFERENTES (achado que apareceu em
--     três lugares na M4, skill banco-e-rpc): em Vendas, `raw.vendas_excel` tem uma linha por
--     ITEM vendido (e ainda inclui as linhas de Setor Macro = Welcome, que a view
--     `analytics.vendas_excel_para_fato`/0277 exclui), enquanto a base conta VENDA distinta
--     (`analytics.fato_venda`, uma linha por `venda_numero`) — por isso `linhas` aqui é
--     `count(DISTINCT fv.id)`, não `count(*)` do raw. Em Operação, `promover_carga_operacao`
--     (0278) DESCARTA linha de placeholder do scrape (valor/operação/tipo inutilizável) ao
--     gravar `analytics.fato_lancamento_operacao` — contar o raw contaria linha que a base
--     nunca teve. A coluna de ano usada é a mesma que a promoção grava: `ano` (Demonstrativo),
--     `data_movimentacao` (Movimentação), `vencimento` (Aberto), `data_venda` (Vendas, via
--     `fato_venda`), `data_final` (Operação, via `fato_lancamento_operacao` — é
--     `coalesce(liquidacao, vencimento)` já resolvido na promoção, anexo §6).
--   • `ingestao_painel()` NÃO SERVE PARA O VIGIA LER, e é POR ISSO que este complemento
--     acrescenta `ingestao_vigia_estado()` — achado do coordenador antes de o defeito existir de
--     verdade: `ingestao_painel()` devolve as últimas 100 EXECUÇÕES NO TOTAL (não por processo).
--     `monde-incremental` roda 96x/dia — 100 linhas cobrem só ~25h — enquanto a TOLERÂNCIA de
--     `monde-reconciliacao` é 30h; um vigia que procurasse a última reconciliação dentro das 100
--     linhas do painel deixaria de achá-la depois de ~1 dia e abriria "processo sem resultado"
--     contra um processo SAUDÁVEL (o mesmo vale para as 50 cargas do painel contra uma base
--     mensal). `ingestao_painel()` é recorte PARA TELA (paginação por linhas mais recentes,
--     sempre); `ingestao_vigia_estado()` é AGREGAÇÃO POR ALVO sobre a tabela inteira (MAX
--     condicionado, não LIMIT) — os dois nunca deveriam ter sido a mesma função, e não são.
--     O índice que a agregação por processo precisa (`ingestao.execucao (processo, status,
--     concluido_em DESC)`) JÁ EXISTE — `idx_ingestao_execucao_processo_status_concluido`,
--     criado na seção 1 desta MESMA migration, antes deste complemento tocá-la; nenhum índice
--     novo é necessário. O equivalente para base (`ingestao.carga (base, status,
--     concluido_em DESC)`) também já existe, desde a 0276 (`idx_ingestao_carga_base_status_concluido`).
--   • `ingestao_vigia_estado()` compara `ultimo_sinal_em` contra `agora` — o `now()` do BANCO,
--     não o relógio do processo que chama (a rota da Vercel). Dois relógios num cálculo de
--     tolerância são fonte de alarme falso que ninguém consegue reproduzir depois — por isso
--     `agora` viaja DENTRO da resposta desta RPC, e quem compara usa exclusivamente esse valor.
--   • `pendentes_notificacao` (em `ingestao_vigia_estado()`) é o que torna o alarme resistente a
--     falha TRANSITÓRIA de SMTP: se o envio falhar, `ingestao_alarme_marcar_notificado` nunca é
--     chamada, `notificado_em` fica NULL, e o incidente aparece aqui na próxima rodada do vigia
--     para nova tentativa — em vez de o aviso se perder silenciosamente. É por QUALQUER tipo de
--     alarme (`notificado_em IS NULL`), independente de `resolvido_em`: um alarme de EVENTO cujo
--     e-mail falhou pode já estar resolvido pelo chamador (ver o bloco estado×evento) sem nunca
--     ter notificado ninguém, e é exatamente esse caso que precisa reaparecer aqui.
--   • TRÊS RPCs desta migration levam `app.exigir_acesso` no corpo (as outras sete são RPC de
--     CARGA/INFRA sem sessão de usuário, mesma classe das RPCs da 0276/0278: quem chama é a
--     rota `/api/ingestao/*`/o vigia, sempre com `service_role`, protegidas só por GRANT) —
--     todas as três de LEITURA/CONFIGURAÇÃO da TELA `/admin/ingestao` (anexo §7), área
--     `admin/uploads`, as mesmas pessoas que já carregam planilha: `ingestao_painel()` (leitura,
--     agora também devolve `vigia_cron_ativo`), `ingestao_expectativa_definir` (liga/desliga uma
--     expectativa e, opcionalmente, ajusta a tolerância) e `ingestao_vigia_definir` (liga/desliga
--     o cron do vigia).
--   • O CRON `ingestao-vigia` NASCE INATIVO (anexo §3/§6): a rota que ele chama
--     (`/api/ingestao/vigia`, nome espelhando `/api/ingestao/{base}`) só existe em produção
--     depois do deploy desta versão — ativo antes disso, ele bateria 404 a cada 15 minutos e o
--     job apareceria VERDE em `cron.job_run_details` sem ter feito nada (o mesmo padrão de
--     falha silenciosa que a v5.4.4 documentou, e que a M6 existe para detectar). `SELECT
--     cron.alter_job(cron.schedule(...), active := false)` — uma única instrução, sem `UPDATE`
--     nem `ALTER TABLE` (confirmado contra `scripts/db-gate/classificar.mjs`: nem `cron.schedule`
--     nem `cron.alter_job` aparecem nos padrões DESTRUTIVO/WARN; "alter_job" não casa
--     `\bALTER\s+TABLE\b` — é um identificador com underscore, sem espaço depois de "alter", e
--     nenhum `UPDATE`/`DROP`/`TRUNCATE`/`DELETE FROM` top-level aparece em nenhuma das
--     instruções desta migration).
--   • LIGAR/DESLIGAR PASSA A SER CHAMADA DE RPC, NÃO MIGRATION (correção deste complemento — a
--     versão anterior desta migration deixava a ativação como `UPDATE` manual e
--     `cron.alter_job` direto, o que um humano só aplicaria via migration NOVA, e migration com
--     `UPDATE` em dado existente é DESTRUTIVA pelo gate — o OPOSTO do que a decisão 3 do anexo
--     pede: "liga-se por configuração, sem código novo"). Agora:
--       SELECT ingestao_vigia_definir(true);                                   -- liga o vigia
--       SELECT ingestao_expectativa_definir('monde-incremental', true);        -- liga 1 processo
--     (chamadas via REST/service_role, ou pela própria TELA depois do deploy — nenhuma migration
--     nova é necessária para ligar nada).
--   • `ingestao_vigia_definir` CHAMA `cron.alter_job` — a MESMA função que a seção 6 desta
--     migration já chama, só que agora de DENTRO de uma função `SECURITY DEFINER` (não mais no
--     nível superior da migration). Isto muda QUEM é o "usuário atual" na hora da checagem de
--     posse do pg_cron? A resposta é NÃO, e é por isso que a função foi escrita para funcionar:
--     `SECURITY DEFINER` troca o usuário EFETIVO (`GetUserId()`, é o que qualquer checagem de
--     posse dentro de uma extensão C consulta) para o DONO da função durante a execução —
--     exatamente o mecanismo que faz `acervo_criar`/`provisionar_dre_comp_par__nucleo`/etc.
--     alcançarem tabela que `authenticated` não alcançaria direto. O dono desta função é
--     `postgres` (quem aplica a migration), e o job `ingestao-vigia` foi CRIADO por `postgres`
--     (é quem roda a migration) — então `cron.job.username = 'postgres'` e, dentro da função,
--     o usuário efetivo também é `postgres`: posse bate. O README do pg_cron documenta que
--     `alter_job`/`unschedule` só são permitidos ao DONO do job ou a um superusuário — aqui é o
--     caminho do dono, não o de superusuário, e por isso a nota do memo do projeto ("a conexão
--     `postgres` do Supabase NÃO é superusuário", `rolsuper=false`) NÃO bloqueia este caminho:
--     não é preciso ser superusuário quando se É o dono.
--     ⚠️ **NÃO VERIFICADO CONTRA PRODUÇÃO** — este agente é editor puro, sem acesso a
--     banco/servidor; o raciocínio acima é PostgreSQL/pg_cron padrão (mesmo mecanismo de
--     `SECURITY DEFINER` usado em toda a base), mas não foi confirmado ao vivo. Por isso a
--     função NÃO confia cegamente no sucesso silencioso de `cron.alter_job` (que devolve void):
--     ela RELÊ `cron.job.active` depois da chamada e levanta `VIGIA_ALTERACAO_NAO_APLICADA` se o
--     estado lido não bater com o pedido — e se a checagem de posse do pg_cron negar a chamada,
--     o próprio pg_cron já levanta erro CRU antes disso. Em nenhum dos dois casos a função
--     reporta sucesso sem ter medido o efeito. **Verificar via REST/service_role antes de
--     confiar em produção** (skill banco-e-rpc §6) é item para o `revisor-db`/orquestrador.
--   • `ingestao_expectativa_definir` grava QUEM e QUANDO alterou (`alterado_em`/`alterado_por`,
--     colunas NOVAS em `ingestao.expectativa` — ligar/desligar um detector de falha é ação que
--     precisa de rastro). `alterado_por = auth.uid()` (NULL quando chamado por `service_role`,
--     que não tem JWT — mesmo comportamento de `auth.uid()` em qualquer RPC deste projeto).
--     `alvo` GANHOU `UNIQUE` PRÓPRIO (substituindo o `UNIQUE(tipo, alvo)` da versão anterior
--     desta migration, ainda não aplicada): os nomes de processo e de base não se sobrepõem
--     hoje (conferido contra as duas listas do CHECK `ingestao_expectativa_alvo_valido`), e a
--     RPC recebe só `p_alvo` (sem `p_tipo`, por pedido explícito) — `UNIQUE(alvo)` faz a busca
--     por `alvo` sozinho ser garantida pelo SCHEMA, não por convenção.
--   • ORDEM DE ATIVAÇÃO COMPLETA (anexo §6), agora só por RPC (nenhuma migration nova para
--     ligar): (1) tabelas/RPCs/tela/alarmes de carga já valem ao aplicar esta migration;
--     (2) as rotas do Monde/CDI passam a gravar em `ingestao.execucao` só depois do deploy (M9,
--     fora do escopo desta migration — é `src/`); (3) `SELECT ingestao_vigia_definir(true);`,
--     depois do deploy; (4) `SELECT ingestao_expectativa_definir('<processo>', true);` para cada
--     processo, depois do deploy E depois da primeira execução registrada de cada um; (5) `SELECT
--     ingestao_expectativa_definir('<base>', true, '<tolerância>'::interval);` para cada base,
--     só quando a RPA existir (decisão 3) — aqui a tolerância É obrigatória no primeiro `ativo=
--     true` (CHECK `ingestao_expectativa_tolerancia_se_ativo`).
--   • ADITIVA / RETROCOMPATÍVEL: só `CREATE TABLE`, `CREATE INDEX`, `CREATE OR REPLACE
--     FUNCTION` (todas de nome NOVO), `INSERT` de seed (nas 9 linhas de `ingestao.expectativa`,
--     todas com `ativo = false`), `GRANT`/`REVOKE`, `cron.schedule`/`cron.alter_job` (o job
--     nasce desagendado por padrão — `cron.unschedule` guardado por `EXISTS`, idempotente ao
--     reaplicar). Nenhum `DROP`, nenhum `TRUNCATE` de tabela viva, nenhum `UPDATE`/`DELETE` de
--     dado pré-existente. Nenhuma tabela pré-existente é tocada.
--   • Reversão (manual, destrutiva):
--       SELECT cron.unschedule('ingestao-vigia');
--       DROP FUNCTION public.ingestao_vigia_definir(boolean);
--       DROP FUNCTION public.ingestao_expectativa_definir(text, boolean, interval);
--       DROP FUNCTION public.ingestao_painel();
--       DROP FUNCTION public.ingestao_vigia_estado();
--       DROP FUNCTION public.ingestao_soma_por_ano(text);
--       DROP FUNCTION public.ingestao_alarme_marcar_notificado(uuid);
--       DROP FUNCTION public.ingestao_alarme_resolver(text, text);
--       DROP FUNCTION public.ingestao_alarme_abrir(text, text, jsonb);
--       DROP FUNCTION public.ingestao_execucao_concluir(uuid, text, jsonb, text);
--       DROP FUNCTION public.ingestao_execucao_abrir(text);
--       DROP TABLE ingestao.expectativa;
--       DROP TABLE ingestao.alarme;
--       DROP TABLE ingestao.execucao;
-- ---------------------------------------------------------------------------

-- ═════════════════════════════════════════════════════════════════════════════════════
-- 1. ingestao.execucao — uma linha por execução de processo agendado (anexo §3)
-- ═════════════════════════════════════════════════════════════════════════════════════

CREATE TABLE ingestao.execucao (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  processo     text        NOT NULL,
  iniciado_em  timestamptz NOT NULL DEFAULT now(),
  concluido_em timestamptz,
  status       text        NOT NULL DEFAULT 'em_curso',
  resultado    jsonb,
  erro         text,
  duracao_ms   integer,

  CONSTRAINT ingestao_execucao_processo_valido CHECK (
    processo IN ('monde-incremental', 'monde-reconciliacao', 'cdi-mensal', 'ingestao-vigia')
  ),
  -- 'pulado' é status PRÓPRIO, de propósito (ver header): lock ocupado é cron SAUDÁVEL,
  -- não falha — contá-lo como 'erro' faria o vigia alarmar quando o sistema está trabalhando.
  CONSTRAINT ingestao_execucao_status_valido CHECK (
    status IN ('em_curso', 'ok', 'pulado', 'erro')
  )
);

COMMENT ON TABLE ingestao.execucao IS
  'v6.0.0/M6: uma linha por execução de processo agendado (monde-incremental, monde-reconciliacao, cdi-mensal, ingestao-vigia) — o log que faltava (anexo §1: cron.job_run_details só mede o enfileiramento do net.http_post, nunca a resposta HTTP real). status=em_curso nasce em ingestao_execucao_abrir; ingestao_execucao_concluir grava o resultado final. Tabela IRMÃ de ingestao.carga (0276), não fundida: colunas e cadência são outras (anexo §3).';

-- Caminho quente do vigia: "existe execução ok/pulado deste processo dentro da tolerância?".
CREATE INDEX idx_ingestao_execucao_processo_status_concluido
  ON ingestao.execucao (processo, status, concluido_em DESC);

-- Caminho quente do painel: últimas execuções, mais recentes primeiro.
CREATE INDEX idx_ingestao_execucao_iniciado_em
  ON ingestao.execucao (iniciado_em DESC);

ALTER TABLE ingestao.execucao ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ingestao.execucao FROM PUBLIC, anon, authenticated;

-- ═════════════════════════════════════════════════════════════════════════════════════
-- 2. ingestao.alarme — um INCIDENTE por (tipo, chave), nunca um disparo (anexo §3/§4)
-- ═════════════════════════════════════════════════════════════════════════════════════

CREATE TABLE ingestao.alarme (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo          text        NOT NULL,
  chave         text        NOT NULL,
  aberto_em     timestamptz NOT NULL DEFAULT now(),
  resolvido_em  timestamptz,
  notificado_em timestamptz,
  detalhe       jsonb
);

COMMENT ON TABLE ingestao.alarme IS
  'v6.0.0/M6: um INCIDENTE por (tipo, chave) — não um disparo. tipo SEM CHECK fechado de propósito (ver header: a lista de tipos de hoje — checksum_falho, ano_fechado_alterado, par_novo_bandeja, processo_sem_resultado, carga_esperada_nao_chegou, anexo §4 — cresce sem exigir migration destrutiva). chave identifica O QUE está em alarme: para alarme de ESTADO (processo_sem_resultado, carga_esperada_nao_chegou) é o processo/base; para alarme de EVENTO (checksum_falho, ano_fechado_alterado, par_novo_bandeja) inclui o carga_id, porque cada carga é um fato novo (ver header — distinção estado×evento). idx_ingestao_alarme_aberto_unico (tipo, chave) WHERE resolvido_em IS NULL é o que impede duplicar incidente sob concorrência e o que evita o alarme virar spam (um processo fora do ar por um dia gera UM incidente, não 96 e-mails) — para alarme de evento, o chamador RESOLVE logo depois de notificar (ver ingestao_alarme_resolver), então o registro não fica pendurado como se a condição ainda estivesse ativa.';

-- Dedup do incidente (anexo §3): sustenta o ON CONFLICT de ingestao_alarme_abrir — atômico,
-- sem check-then-insert (achado ALTO da 0276 não se repete aqui). PARCIAL sobre
-- `resolvido_em IS NULL` de propósito (ver header — estado×evento): um alarme de EVENTO é
-- resolvido pelo chamador logo após notificar, então a MESMA (tipo, chave) nunca fica "aberta"
-- de fato — é o `carga_id` dentro da chave, não o índice, que separa duas cargas diferentes
-- mexendo no mesmo ano; para alarme de ESTADO, o índice parcial é o que impede duplicar
-- enquanto a condição persiste.
CREATE UNIQUE INDEX idx_ingestao_alarme_aberto_unico
  ON ingestao.alarme (tipo, chave)
  WHERE resolvido_em IS NULL;

-- Caminho quente do painel: alarmes abertos, mais recentes primeiro.
CREATE INDEX idx_ingestao_alarme_abertos
  ON ingestao.alarme (aberto_em DESC)
  WHERE resolvido_em IS NULL;

-- Histórico do painel (`alarmes_recentes`: abertos E resolvidos, mais recentes primeiro). O
-- índice parcial acima não serve essa consulta, que inclui os resolvidos (BAIXO do revisor-db).
CREATE INDEX idx_ingestao_alarme_aberto_em
  ON ingestao.alarme (aberto_em DESC);

ALTER TABLE ingestao.alarme ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ingestao.alarme FROM PUBLIC, anon, authenticated;

-- ═════════════════════════════════════════════════════════════════════════════════════
-- 3. ingestao.expectativa — configuração de cadência esperada (anexo §3) — TUDO ativo=false
-- ═════════════════════════════════════════════════════════════════════════════════════

CREATE TABLE ingestao.expectativa (
  id           bigserial   PRIMARY KEY,
  tipo         text        NOT NULL,
  alvo         text        NOT NULL,
  tolerancia   interval,
  ativo        boolean     NOT NULL DEFAULT false,
  descricao    text,
  criado_em    timestamptz NOT NULL DEFAULT now(),
  alterado_em  timestamptz,
  alterado_por uuid        REFERENCES auth.users(id),

  CONSTRAINT ingestao_expectativa_tipo_valido CHECK (tipo IN ('processo', 'base')),
  -- Fechado por CASE + ELSE false (skill banco-e-rpc: CASE sem ELSE é FAIL-OPEN sob CHECK —
  -- um `alvo` fora das duas listas passaria batido sem este ramo). `alvo` de 'processo' espelha
  -- o CHECK de ingestao.execucao.processo; `alvo` de 'base' espelha BASES_INGESTAO
  -- (src/lib/ingestao/bases.ts), MESMA lista que os CHECKs de ingestao.carga (0276) e
  -- ingestao.promocao (0277) já repetem.
  CONSTRAINT ingestao_expectativa_alvo_valido CHECK (
    CASE tipo
      WHEN 'processo' THEN alvo IN (
        'monde-incremental', 'monde-reconciliacao', 'cdi-mensal', 'ingestao-vigia'
      )
      WHEN 'base' THEN alvo IN (
        'demonstrativo-competencia', 'vendas-produto', 'lancamentos-movimentacao',
        'lancamentos-aberto', 'lancamentos-operacao'
      )
      ELSE false
    END
  ),
  -- Ninguém liga `ativo=true` sem antes preencher uma tolerância. Não bloqueia ESTA migration
  -- (todas as 9 linhas nascem ativo=false) — passa a valer no dia em que `ingestao_expectativa_definir`
  -- (seção 7) tentar ativar uma linha sem tolerância definida (erro NOMEADO antes de chegar aqui;
  -- este CHECK é a rede de trás, não a mensagem que o chamador vê primeiro).
  CONSTRAINT ingestao_expectativa_tolerancia_se_ativo CHECK ((NOT ativo) OR (tolerancia IS NOT NULL)),
  -- UNIQUE em `alvo` SOZINHO, não (tipo, alvo): as duas listas do CHECK acima não se sobrepõem
  -- (nenhum nome de processo é também nome de base), e `ingestao_expectativa_definir` recebe só
  -- `p_alvo` (sem `p_tipo`, por pedido explícito) — esta constraint faz a busca por `alvo`
  -- sozinho ser garantida pelo SCHEMA, não por convenção entre as duas listas.
  CONSTRAINT ingestao_expectativa_alvo_unico UNIQUE (alvo)
);

COMMENT ON TABLE ingestao.expectativa IS
  'v6.0.0/M6: configuração de cadência esperada por processo/base — o vigia (rota futura, M9) alarma "processo/base sem resultado" só para linhas com ativo=true. TODAS as 9 linhas de seed desta migration nascem ativo=false (anexo §2 decisão 3 e §6): as expectativas de PROCESSO ligam depois do deploy e da primeira execução registrada de cada um; as de BASE, só quando a RPA de upload existir. Liga/desliga por RPC (ingestao_expectativa_definir, seção 7), nunca por migration — alterado_em/alterado_por registram quem mexeu.';

ALTER TABLE ingestao.expectativa ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ingestao.expectativa FROM PUBLIC, anon, authenticated;

-- Seed: uma linha por processo agendado + uma por base de upload, TODAS ativo=false.
INSERT INTO ingestao.expectativa (tipo, alvo, tolerancia, ativo, descricao) VALUES
  ('processo', 'monde-incremental', interval '45 minutes', false,
   'Sincronização incremental do Monde, a cada 15 min (cron monde-ingest-incremental, migration 0182). Tolerância = 3x a cadência (2 ciclos perdidos + 1 de folga) — "pulado" (lock ocupado) já conta como saudável, então só uma sequência de falhas reais de fato ultrapassa isto.'),
  ('processo', 'monde-reconciliacao', interval '30 hours', false,
   'Reconciliação do espelho Monde, 3 disparos/dia às 06:05/06:20/06:35 UTC (cron monde-reconciliacao-1/2/3, migration 0236). No regime saudável o maior intervalo entre dois "ok" é de até ~23h30 (06:35 de hoje → 06:05 de amanhã: só o último disparo do dia sucede hoje, só o primeiro sucede amanhã); tolerância = 24h de cadência + 6h de folga.'),
  ('processo', 'cdi-mensal', interval '35 days', false,
   'Ingestão mensal do CDI, dia 3 de cada mês às 09:00 UTC (cron cdi-ingest-mensal, migration 0244). Auto-curativa por desenho (a janela da rota é a série inteira — skill banco-e-rpc §8); tolerância = maior mês do calendário (31d) + 4d de folga.'),
  ('processo', 'ingestao-vigia', interval '45 minutes', false,
   'O próprio vigia, a cada 15 min (cron ingestao-vigia, esta migration). Mesma regra do incremental do Monde (3x a cadência) — "quem vigia o vigia" fica na tela (anexo §4: última verificação), não neste alarme, mas a linha existe para o dia em que outro processo passar a checar o vigia.'),
  ('base', 'demonstrativo-competencia', NULL, false,
   'Ativa quando a RPA de upload existir (anexo §2 decisão 3, §6) — tolerância a definir naquele momento, conforme a cadência real da RPA.'),
  ('base', 'vendas-produto', NULL, false,
   'Ativa quando a RPA de upload existir (anexo §2 decisão 3, §6) — tolerância a definir naquele momento, conforme a cadência real da RPA.'),
  ('base', 'lancamentos-movimentacao', NULL, false,
   'Ativa quando a RPA de upload existir (anexo §2 decisão 3, §6) — tolerância a definir naquele momento, conforme a cadência real da RPA.'),
  ('base', 'lancamentos-aberto', NULL, false,
   'Ativa quando a RPA de upload existir (anexo §2 decisão 3, §6) — tolerância a definir naquele momento, conforme a cadência real da RPA.'),
  ('base', 'lancamentos-operacao', NULL, false,
   'Ativa quando a RPA de upload existir (anexo §2 decisão 3, §6) — tolerância a definir naquele momento, conforme a cadência real da RPA.');

-- ═════════════════════════════════════════════════════════════════════════════════════
-- 4. RPCs de escrita/infra — SECURITY DEFINER, service_role-ONLY (sem exigir_acesso: esta
--    superfície não tem sessão de usuário — quem chama é a rota de cron/vigia ou a rota de
--    carga, sempre com service_role, mesma classe das RPCs da 0276/0278).
-- ═════════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.ingestao_execucao_abrir(p_processo text)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_processo IS NULL OR NOT (p_processo = ANY (ARRAY[
       'monde-incremental', 'monde-reconciliacao', 'cdi-mensal', 'ingestao-vigia'
     ]::text[])) THEN
    RAISE EXCEPTION 'PROCESSO_INVALIDO: % não é um processo agendado conhecido (anexo v6.0.0/M6 §3)', p_processo
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO ingestao.execucao (processo, status)
  VALUES (p_processo, 'em_curso')
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.ingestao_execucao_abrir(text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.ingestao_execucao_abrir(text) TO service_role;
COMMENT ON FUNCTION public.ingestao_execucao_abrir(text) IS
  'v6.0.0/M6: abre uma execução (status=em_curso) para um processo agendado conhecido (monde-incremental, monde-reconciliacao, cdi-mensal, ingestao-vigia) e devolve o id (uuid) para a chamada seguinte a ingestao_execucao_concluir. SEM exigir_acesso no corpo POR DESENHO: chamada pela rota do cron/vigia (service_role), sem sessão de usuário; protegida só por GRANT, service_role-only.';

CREATE OR REPLACE FUNCTION public.ingestao_execucao_concluir(
  p_id        uuid,
  p_status    text,
  p_resultado jsonb DEFAULT NULL,
  p_erro      text  DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row ingestao.execucao;
BEGIN
  -- Só status FINAIS: 'em_curso' é o estado inicial, e aceitá-lo aqui permitiria "concluir"
  -- uma execução de volta para em_curso carimbando concluido_em — mesmo raciocínio de
  -- STATUS_INVALIDO em ingestao_carga_concluir (0276).
  IF p_status IS NULL OR NOT (p_status = ANY (ARRAY['ok', 'pulado', 'erro']::text[])) THEN
    RAISE EXCEPTION 'STATUS_INVALIDO: % não é um status FINAL de execução (ok, pulado, erro)', p_status
      USING ERRCODE = '22023';
  END IF;

  -- duracao_ms é CALCULADO aqui (now() - iniciado_em), nunca recebido do chamador: fonte
  -- única, sem risco de o relógio do processo chamador divergir do relógio do banco.
  UPDATE ingestao.execucao SET
    status       = p_status,
    resultado    = p_resultado,
    erro         = p_erro,
    concluido_em = now(),
    duracao_ms   = round(extract(epoch FROM (now() - iniciado_em)) * 1000)::int
  WHERE id = p_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'EXECUCAO_NAO_ENCONTRADA: execução % não existe', p_id USING ERRCODE = '22023';
  END IF;

  RETURN jsonb_build_object(
    'id', v_row.id, 'processo', v_row.processo, 'status', v_row.status,
    'iniciado_em', v_row.iniciado_em, 'concluido_em', v_row.concluido_em,
    'duracao_ms', v_row.duracao_ms, 'resultado', v_row.resultado, 'erro', v_row.erro
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.ingestao_execucao_concluir(uuid, text, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.ingestao_execucao_concluir(uuid, text, jsonb, text) TO service_role;
COMMENT ON FUNCTION public.ingestao_execucao_concluir(uuid, text, jsonb, text) IS
  'v6.0.0/M6: grava o resultado final de uma execução (status ok/pulado/erro, resultado jsonb, erro, duracao_ms calculado no banco). Concluir id inexistente levanta EXECUCAO_NAO_ENCONTRADA, nunca silêncio. SEM exigir_acesso no corpo POR DESENHO: chamada pela rota do cron/vigia (service_role); protegida só por GRANT, service_role-only.';

-- Abre (ou devolve, se já aberto) o INCIDENTE (tipo, chave). Devolve 'novo' — é o booleano
-- que o chamador usa para decidir se manda e-mail (só quando novo=true).
CREATE OR REPLACE FUNCTION public.ingestao_alarme_abrir(
  p_tipo    text,
  p_chave   text,
  p_detalhe jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row  ingestao.alarme;
  v_novo boolean := false;
BEGIN
  IF coalesce(btrim(p_tipo), '') = '' THEN
    RAISE EXCEPTION 'TIPO_OBRIGATORIO: ingestao_alarme_abrir exige tipo' USING ERRCODE = '22023';
  END IF;
  IF coalesce(btrim(p_chave), '') = '' THEN
    RAISE EXCEPTION 'CHAVE_OBRIGATORIA: ingestao_alarme_abrir exige chave' USING ERRCODE = '22023';
  END IF;

  -- ⚠️ UMA instrução, atômica — nunca "SELECT p/ ver se existe, senão INSERT" (foi exatamente
  -- essa forma que deixou a 0276 com corrida sob concorrência real, achado ALTO do
  -- revisor-db). O índice único parcial idx_ingestao_alarme_aberto_unico É o árbitro: sob duas
  -- chamadas concorrentes para o MESMO (tipo, chave), só uma insere; a outra recebe FOUND=false
  -- (nenhuma linha afetada pelo INSERT) e relê a linha que a vencedora acabou de commitar.
  INSERT INTO ingestao.alarme (tipo, chave, detalhe)
  VALUES (btrim(p_tipo), btrim(p_chave), p_detalhe)
  ON CONFLICT (tipo, chave) WHERE resolvido_em IS NULL DO NOTHING
  RETURNING * INTO v_row;

  IF FOUND THEN
    v_novo := true;
  ELSE
    SELECT * INTO v_row FROM ingestao.alarme
     WHERE tipo = btrim(p_tipo) AND chave = btrim(p_chave) AND resolvido_em IS NULL
     ORDER BY aberto_em DESC
     LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'novo', v_novo, 'id', v_row.id, 'tipo', v_row.tipo, 'chave', v_row.chave,
    'aberto_em', v_row.aberto_em, 'resolvido_em', v_row.resolvido_em,
    'notificado_em', v_row.notificado_em, 'detalhe', v_row.detalhe
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.ingestao_alarme_abrir(text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.ingestao_alarme_abrir(text, text, jsonb) TO service_role;
COMMENT ON FUNCTION public.ingestao_alarme_abrir(text, text, jsonb) IS
  'v6.0.0/M6: abre um incidente (tipo, chave) ou devolve o já aberto, sem duplicar — dedup ATÔMICA por INSERT...ON CONFLICT contra o índice único parcial (nunca check-then-insert, achado ALTO da 0276 não se repete). "novo"=true é o sinal para o chamador enviar e-mail; "novo"=false significa que já existia (não reenviar). SEM exigir_acesso no corpo POR DESENHO: chamada por carga.ts/pelo vigia (service_role); protegida só por GRANT, service_role-only.';

CREATE OR REPLACE FUNCTION public.ingestao_alarme_resolver(p_tipo text, p_chave text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row ingestao.alarme;
BEGIN
  -- Tolerante: resolver um incidente que já não está aberto (ou nunca existiu) NÃO é erro —
  -- é o caso comum de "o vigia checou de novo e está tudo bem", chamado toda vez que a
  -- condição volta a ficar saudável. UPDATE com WHERE resolvido_em IS NULL toma o lock de
  -- linha; sob concorrência, só uma chamada resolve, a outra vê 0 linhas.
  UPDATE ingestao.alarme
     SET resolvido_em = now()
   WHERE tipo = btrim(p_tipo) AND chave = btrim(p_chave) AND resolvido_em IS NULL
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('resolvido', false);
  END IF;

  RETURN jsonb_build_object(
    'resolvido', true, 'id', v_row.id, 'tipo', v_row.tipo, 'chave', v_row.chave,
    'aberto_em', v_row.aberto_em, 'resolvido_em', v_row.resolvido_em
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.ingestao_alarme_resolver(text, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.ingestao_alarme_resolver(text, text) TO service_role;
COMMENT ON FUNCTION public.ingestao_alarme_resolver(text, text) IS
  'v6.0.0/M6: fecha o incidente aberto de (tipo, chave), se existir — tolerante (resolvido=false, sem RAISE, quando não há incidente aberto). SEM exigir_acesso no corpo POR DESENHO: chamada pelo vigia (service_role); protegida só por GRANT, service_role-only.';

CREATE OR REPLACE FUNCTION public.ingestao_alarme_marcar_notificado(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row ingestao.alarme;
BEGIN
  -- coalesce(notificado_em, now()): idempotente — marcar de novo um alarme já notificado
  -- preserva o carimbo ORIGINAL (primeiro envio), não o sobrescreve a cada tentativa.
  UPDATE ingestao.alarme
     SET notificado_em = coalesce(notificado_em, now())
   WHERE id = p_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ALARME_NAO_ENCONTRADO: alarme % não existe', p_id USING ERRCODE = '22023';
  END IF;

  RETURN jsonb_build_object(
    'id', v_row.id, 'tipo', v_row.tipo, 'chave', v_row.chave, 'notificado_em', v_row.notificado_em
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.ingestao_alarme_marcar_notificado(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.ingestao_alarme_marcar_notificado(uuid) TO service_role;
COMMENT ON FUNCTION public.ingestao_alarme_marcar_notificado(uuid) IS
  'v6.0.0/M6: registra que o e-mail deste incidente foi enviado (idempotente: preserva o carimbo do primeiro envio). alarme_id inexistente levanta ALARME_NAO_ENCONTRADO. SEM exigir_acesso no corpo POR DESENHO: chamada pelo enviador de e-mail (service_role), depois de ingestao_alarme_abrir devolver novo=true; protegida só por GRANT, service_role-only.';

-- Soma por ano da base VIVA — insumo do alarme "ano fechado alterado" (anexo §4). Ver header
-- desta migration para a explicação de por que Vendas/Operação leem analytics.*, não raw.*.
CREATE OR REPLACE FUNCTION public.ingestao_soma_por_ano(p_base text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF p_base IS NULL OR NOT (p_base = ANY (ARRAY[
       'demonstrativo-competencia', 'vendas-produto', 'lancamentos-movimentacao',
       'lancamentos-aberto', 'lancamentos-operacao'
     ]::text[])) THEN
    RAISE EXCEPTION 'BASE_INVALIDA: % não é uma base de ingestão conhecida (contrato ingestao-v1 §3)', p_base
      USING ERRCODE = '22023';
  END IF;

  IF p_base = 'demonstrativo-competencia' THEN
    SELECT coalesce(jsonb_object_agg(s.ano::text, jsonb_build_object('linhas', s.linhas, 'centavos', s.centavos)), '{}'::jsonb)
      INTO v_result
    FROM (
      SELECT ano, count(*) AS linhas, coalesce(round(sum(valor) * 100), 0)::bigint AS centavos
      FROM raw.demonstrativo_competencia
      GROUP BY ano
    ) s;

  ELSIF p_base = 'lancamentos-movimentacao' THEN
    SELECT coalesce(jsonb_object_agg(s.ano::text, jsonb_build_object('linhas', s.linhas, 'centavos', s.centavos)), '{}'::jsonb)
      INTO v_result
    FROM (
      SELECT date_part('year', data_movimentacao)::int AS ano,
             count(*) AS linhas, coalesce(round(sum(valor) * 100), 0)::bigint AS centavos
      FROM raw.lancamentos_movimentacao
      WHERE data_movimentacao IS NOT NULL
      GROUP BY 1
    ) s;

  ELSIF p_base = 'lancamentos-aberto' THEN
    SELECT coalesce(jsonb_object_agg(s.ano::text, jsonb_build_object('linhas', s.linhas, 'centavos', s.centavos)), '{}'::jsonb)
      INTO v_result
    FROM (
      SELECT date_part('year', vencimento)::int AS ano,
             count(*) AS linhas, coalesce(round(sum(valor) * 100), 0)::bigint AS centavos
      FROM raw.titulos_em_aberto
      WHERE vencimento IS NOT NULL
      GROUP BY 1
    ) s;

  ELSIF p_base = 'vendas-produto' THEN
    -- Base VIVA = analytics.fato_venda (uma linha por venda_numero, já sem Welcome) +
    -- fato_venda_item (valor_total por item). "linhas" = venda DISTINTA, não linha de item —
    -- ver header ("a base conta venda distinta, o parser conta linha de item").
    SELECT coalesce(jsonb_object_agg(s.ano::text, jsonb_build_object('linhas', s.linhas, 'centavos', s.centavos)), '{}'::jsonb)
      INTO v_result
    FROM (
      SELECT date_part('year', fv.data_venda)::int AS ano,
             count(DISTINCT fv.id) AS linhas,
             coalesce(round(sum(fi.valor_total) * 100), 0)::bigint AS centavos
      FROM analytics.fato_venda fv
      JOIN analytics.fato_venda_item fi ON fi.fato_venda_id = fv.id
      GROUP BY 1
    ) s;

  ELSE -- 'lancamentos-operacao'
    -- Base VIVA = analytics.fato_lancamento_operacao (placeholder do scrape já descartado na
    -- promoção, 0278). data_final = coalesce(liquidacao, vencimento), já resolvido lá.
    SELECT coalesce(jsonb_object_agg(s.ano::text, jsonb_build_object('linhas', s.linhas, 'centavos', s.centavos)), '{}'::jsonb)
      INTO v_result
    FROM (
      SELECT date_part('year', data_final)::int AS ano,
             count(*) AS linhas, coalesce(round(sum(valor) * 100), 0)::bigint AS centavos
      FROM analytics.fato_lancamento_operacao
      WHERE data_final IS NOT NULL
      GROUP BY 1
    ) s;
  END IF;

  RETURN v_result;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.ingestao_soma_por_ano(text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.ingestao_soma_por_ano(text) TO service_role;
COMMENT ON FUNCTION public.ingestao_soma_por_ano(text) IS
  'v6.0.0/M6: {ano: {linhas, centavos}} da base VIVA (raw.* para Demonstrativo/Movimentação/Aberto; analytics.fato_venda+item e analytics.fato_lancamento_operacao para Vendas/Operação, que sofrem colapso/descarte na promoção — ver header da migration) — insumo do alarme "ano fechado alterado" (anexo §4): comparar, ano a ano, o antes e o depois de uma carga. SEM exigir_acesso no corpo POR DESENHO: chamada por carga.ts depois de promover (service_role); protegida só por GRANT, service_role-only.';

-- O VIGIA LÊ ISTO, NÃO ingestao_painel() (ver header — "ingestao_painel() NÃO SERVE PARA O
-- VIGIA LER"): agregação POR ALVO sobre a tabela inteira (MAX condicionado, sem LIMIT), nunca
-- um recorte por linhas mais recentes. Índices já existentes de outras migrations sustentam as
-- duas agregações: idx_ingestao_execucao_processo_status_concluido (seção 1 desta migration,
-- acima) e idx_ingestao_carga_base_status_concluido (0276) — nenhum índice novo é criado aqui.
CREATE OR REPLACE FUNCTION public.ingestao_vigia_estado()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    -- O vigia compara ultimo_sinal_em/aberto_em contra ESTE valor, nunca contra o relógio da
    -- rota da Vercel que o chama — dois relógios num cálculo de tolerância é fonte de alarme
    -- falso irreproduzível.
    'agora', now(),
    'expectativas', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'alvo', x.alvo,
        'tipo', x.tipo,
        'ativo', x.ativo,
        -- Segundos (numeric), não o `interval` cru — o TypeScript não precisa parsear
        -- "HH:MM:SS"/"P...T..." nem confiar no formato de saída do driver.
        'tolerancia_segundos', extract(epoch FROM x.tolerancia),
        -- Processo: última execução ok OU pulado (pulado é saudável — ver o bloco 'status =
        -- pulado' acima). Base: última carga aplicada. NULL = nunca houve sinal (estado
        -- inicial legítimo, não erro). Cada subconsulta é uma busca indexada (ver comentário
        -- acima dos índices), não uma varredura — 9 linhas em ingestao.expectativa hoje.
        'ultimo_sinal_em', CASE x.tipo
          WHEN 'processo' THEN (
            SELECT max(e.concluido_em) FROM ingestao.execucao e
             WHERE e.processo = x.alvo AND e.status IN ('ok', 'pulado')
          )
          WHEN 'base' THEN (
            SELECT max(c.concluido_em) FROM ingestao.carga c
             WHERE c.base = x.alvo AND c.status = 'aplicada'
          )
        END
      ) ORDER BY x.tipo, x.alvo)
      FROM ingestao.expectativa x
    ), '[]'::jsonb),
    -- Topo do que o vigia trata como "já sei disso" — incidente aberto, de qualquer tipo.
    'alarmes_abertos', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', a.id, 'tipo', a.tipo, 'chave', a.chave, 'aberto_em', a.aberto_em,
        'notificado_em', a.notificado_em, 'detalhe', a.detalhe
      ) ORDER BY a.aberto_em DESC)
      FROM ingestao.alarme a
      WHERE a.resolvido_em IS NULL
    ), '[]'::jsonb),
    -- Resistência a falha TRANSITÓRIA de SMTP: se o e-mail de um incidente falhou,
    -- ingestao_alarme_marcar_notificado nunca roda, notificado_em fica NULL, e o incidente
    -- aparece aqui para nova tentativa — independente de já estar resolvido (um alarme de
    -- EVENTO pode ter sido resolvido pelo chamador sem nunca ter notificado ninguém, se o
    -- e-mail falhou entre abrir e notificar; ESSE caso precisa reaparecer aqui também).
    'pendentes_notificacao', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', a.id, 'tipo', a.tipo, 'chave', a.chave, 'aberto_em', a.aberto_em,
        'resolvido_em', a.resolvido_em, 'detalhe', a.detalhe
      ) ORDER BY a.aberto_em DESC)
      FROM ingestao.alarme a
      WHERE a.notificado_em IS NULL
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.ingestao_vigia_estado() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.ingestao_vigia_estado() TO service_role;
COMMENT ON FUNCTION public.ingestao_vigia_estado() IS
  'v6.0.0/M6: o sinal que o VIGIA lê para decidir alarme de ESTADO — uma entrada por linha de ingestao.expectativa (alvo, tipo, ativo, tolerancia_segundos, ultimo_sinal_em: última execução ok/pulado para processo, última carga aplicada para base; agregação por alvo sobre a tabela INTEIRA, nunca um recorte), mais agora (now() do banco, para o vigia nunca comparar contra o próprio relógio), alarmes_abertos e pendentes_notificacao (notificado_em IS NULL, de qualquer tipo — é o que torna o envio resistente a falha transitória de SMTP). NÃO é ingestao_painel(): aquela devolve um recorte por LINHAS mais recentes (últimas 50/100 no TOTAL), que ficaria mais curto que a tolerância de processos/bases de cadência menor que a do incremental (achado do coordenador antes de o defeito existir). SEM exigir_acesso no corpo POR DESENHO: o vigia roda com a chave de cron/service_role, sem sessão de usuário; protegida só por GRANT, service_role-only.';

-- ═════════════════════════════════════════════════════════════════════════════════════
-- 5. ingestao_painel() — a PRIMEIRA RPC desta frente exposta a usuário humano: LEITURA para
--    a tela /admin/ingestao (anexo §7). app.exigir_acesso INLINE (padrão de RPC nova, skill
--    banco-e-rpc §4), GRANT a authenticated.
-- ═════════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.ingestao_painel()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['admin/uploads']);

  SELECT jsonb_build_object(
    'cargas', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'carga_id', c.carga_id, 'base', c.base, 'origem', c.origem, 'status', c.status,
        'linhas', c.linhas, 'checksums_conferidos', c.checksums_conferidos,
        'checksums_falhos', c.checksums_falhos, 'rejeitadas_por_data', c.rejeitadas_por_data,
        'pares_novos', c.pares_novos, 'diff', c.diff, 'recebido_em', c.recebido_em,
        'concluido_em', c.concluido_em, 'erro', c.erro
      ) ORDER BY c.recebido_em DESC)
      FROM (SELECT * FROM ingestao.carga ORDER BY recebido_em DESC LIMIT 50) c
    ), '[]'::jsonb),
    'execucoes', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', e.id, 'processo', e.processo, 'status', e.status,
        'iniciado_em', e.iniciado_em, 'concluido_em', e.concluido_em,
        'duracao_ms', e.duracao_ms, 'erro', e.erro
      ) ORDER BY e.iniciado_em DESC)
      FROM (SELECT * FROM ingestao.execucao ORDER BY iniciado_em DESC LIMIT 100) e
    ), '[]'::jsonb),
    -- Alarmes ABERTOS — o que a tela destaca no topo (só alarme de ESTADO fica aqui por muito
    -- tempo; alarme de EVENTO passa por aqui só entre abrir e o chamador resolver, ver header).
    'alarmes_abertos', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', a.id, 'tipo', a.tipo, 'chave', a.chave, 'aberto_em', a.aberto_em,
        'notificado_em', a.notificado_em, 'detalhe', a.detalhe
      ) ORDER BY a.aberto_em DESC)
      FROM ingestao.alarme a
      WHERE a.resolvido_em IS NULL
    ), '[]'::jsonb),
    -- Alarmes RECENTES — abertos E resolvidos, últimos 50 por aberto_em (ver header: alarme de
    -- EVENTO é resolvido pelo chamador logo após notificar, então SOME de alarmes_abertos no
    -- instante em que é enviado; sem esta lista a tela nunca mostraria "checksum falhou ontem
    -- às 14h", que é justamente o que ela existe para conferir).
    'alarmes_recentes', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', a.id, 'tipo', a.tipo, 'chave', a.chave, 'aberto_em', a.aberto_em,
        'resolvido_em', a.resolvido_em, 'notificado_em', a.notificado_em, 'detalhe', a.detalhe
      ) ORDER BY a.aberto_em DESC)
      FROM (SELECT * FROM ingestao.alarme ORDER BY aberto_em DESC LIMIT 50) a
    ), '[]'::jsonb),
    'expectativas', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'tipo', x.tipo, 'alvo', x.alvo, 'tolerancia', x.tolerancia,
        'ativo', x.ativo, 'descricao', x.descricao,
        'alterado_em', x.alterado_em, 'alterado_por', x.alterado_por
      ) ORDER BY x.tipo, x.alvo)
      FROM ingestao.expectativa x
    ), '[]'::jsonb),
    -- "O vigia vigia a si mesmo, até onde dá" (anexo §4): última execução CONCLUÍDA dele
    -- mesmo, para a tela mostrar "última verificação: há N minutos". NULL até o cron ativar
    -- e rodar pela 1ª vez (M9) — estado inicial legítimo, não erro.
    'vigia_ultima_verificacao', (
      SELECT max(concluido_em) FROM ingestao.execucao WHERE processo = 'ingestao-vigia'
    ),
    -- Estado do CRON em si (não da última execução) — a tela precisa distinguir "vigia
    -- desligado" (nunca vai gerar vigia_ultima_verificacao nova) de "vigia ligado, só não
    -- rodou ainda". NULL só se o job não existir (não deveria acontecer pós-0280).
    'vigia_cron_ativo', (
      SELECT active FROM cron.job WHERE jobname = 'ingestao-vigia'
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.ingestao_painel() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.ingestao_painel() TO authenticated, service_role;
COMMENT ON FUNCTION public.ingestao_painel() IS
  'v6.0.0/M6: últimas 50 cargas, últimas 100 execuções, alarmes abertos (topo) + últimos 50 alarmes recentes (abertos e resolvidos — alarme de EVENTO passa por "aberto" só até o chamador notificar+resolver, então só aparece na tela via alarmes_recentes), expectativas (com alterado_em/alterado_por) e o estado do vigia (última verificação + se o cron está ativo) — tudo que a tela /admin/ingestao (anexo §7) precisa numa chamada. app.exigir_acesso(ARRAY[''admin/uploads'']) inline (padrão de RPC nova, skill banco-e-rpc §4) — as mesmas pessoas que carregam planilha são as que precisam ver o log. GRANT a authenticated e service_role.';

-- ═════════════════════════════════════════════════════════════════════════════════════
-- 6. cron `ingestao-vigia` — molde da 0182 (Vault: monde_app_url/monde_cron_secret,
--    REUSADOS — nenhum segredo novo). NASCE INATIVO (ver header — comando de ativação lá).
-- ═════════════════════════════════════════════════════════════════════════════════════

-- Idempotente ao reaplicar.
SELECT cron.unschedule('ingestao-vigia')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ingestao-vigia');

-- `cron.alter_job(cron.schedule(...), active := false)` numa única instrução: o job nasce
-- desagendado por padrão nunca chega a existir "ativo" nem por um instante entre as duas
-- chamadas, porque são a MESMA chamada SQL.
SELECT cron.alter_job(
  cron.schedule(
    'ingestao-vigia',
    '*/15 * * * *',
    $cron$
      SELECT net.http_post(
        url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'monde_app_url')
               || '/api/ingestao/vigia',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'monde_cron_secret'),
          'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 120000
      );
    $cron$
  ),
  active := false
);

-- ⚠️ O bloco abaixo usa comentário de LINHA (`--`), não `/* */`, de propósito (precedente da
-- 0236: citar uma expressão de cron dentro de comentário de BLOCO fecha o comentário no meio
-- e o resto do arquivo vira SQL solto).
-- DOWN (reversão) — remove só o agendamento:
--   SELECT cron.unschedule('ingestao-vigia');
-- ATIVAÇÃO NORMAL (depois do deploy, M9): SELECT ingestao_vigia_definir(true); (seção 7 abaixo).
-- ATIVAÇÃO MANUAL DE EMERGÊNCIA, se a RPC não estiver disponível por algum motivo:
--   SELECT cron.alter_job(
--     (SELECT jobid FROM cron.job WHERE jobname = 'ingestao-vigia'), active := true
--   );

-- ═════════════════════════════════════════════════════════════════════════════════════
-- 7. Config por RPC — LIGA/DESLIGA sem migration nova (anexo §2 decisão 3: "liga-se por
--    configuração, sem código novo"). Mesma postura de ingestao_painel(): app.exigir_acesso
--    INLINE, GRANT a authenticated + service_role — chamadas pela TELA /admin/ingestao.
-- ═════════════════════════════════════════════════════════════════════════════════════

-- Liga/desliga UMA expectativa (por alvo, UNIQUE — ver a tabela na seção 3) e, opcionalmente,
-- ajusta a tolerância. Registra quem/quando (alterado_em/alterado_por).
CREATE OR REPLACE FUNCTION public.ingestao_expectativa_definir(
  p_alvo       text,
  p_ativo      boolean,
  p_tolerancia interval DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row              ingestao.expectativa;
  v_tolerancia_atual interval;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['admin/uploads']);

  IF coalesce(btrim(p_alvo), '') = '' THEN
    RAISE EXCEPTION 'ALVO_OBRIGATORIO: ingestao_expectativa_definir exige alvo' USING ERRCODE = '22023';
  END IF;
  IF p_ativo IS NULL THEN
    RAISE EXCEPTION 'ATIVO_OBRIGATORIO: ingestao_expectativa_definir exige ativo (true|false)' USING ERRCODE = '22023';
  END IF;

  -- Erro NOMEADO antes do UPDATE, em vez de deixar o CHECK ingestao_expectativa_tolerancia_se_ativo
  -- estourar cru: ligar (p_ativo=true) sem informar p_tolerancia só é possível se JÁ existir uma
  -- tolerância gravada — senão TOLERANCIA_OBRIGATORIA, com o nome do alvo.
  IF p_ativo AND p_tolerancia IS NULL THEN
    SELECT tolerancia INTO v_tolerancia_atual FROM ingestao.expectativa WHERE alvo = btrim(p_alvo);
    IF NOT FOUND THEN
      RAISE EXCEPTION 'EXPECTATIVA_NAO_ENCONTRADA: nenhuma expectativa para o alvo %', p_alvo USING ERRCODE = '22023';
    END IF;
    IF v_tolerancia_atual IS NULL THEN
      RAISE EXCEPTION 'TOLERANCIA_OBRIGATORIA: % não pode ser ativado sem uma tolerância — informe p_tolerancia', p_alvo
        USING ERRCODE = '22023';
    END IF;
  END IF;

  UPDATE ingestao.expectativa SET
    ativo        = p_ativo,
    tolerancia   = coalesce(p_tolerancia, tolerancia),
    alterado_em  = now(),
    alterado_por = auth.uid()
  WHERE alvo = btrim(p_alvo)
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'EXPECTATIVA_NAO_ENCONTRADA: nenhuma expectativa para o alvo %', p_alvo USING ERRCODE = '22023';
  END IF;

  RETURN jsonb_build_object(
    'tipo', v_row.tipo, 'alvo', v_row.alvo, 'tolerancia', v_row.tolerancia,
    'ativo', v_row.ativo, 'descricao', v_row.descricao,
    'alterado_em', v_row.alterado_em, 'alterado_por', v_row.alterado_por
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.ingestao_expectativa_definir(text, boolean, interval) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.ingestao_expectativa_definir(text, boolean, interval) TO authenticated, service_role;
COMMENT ON FUNCTION public.ingestao_expectativa_definir(text, boolean, interval) IS
  'v6.0.0/M6: liga/desliga a expectativa de um alvo (processo ou base) e, opcionalmente, ajusta a tolerância — é o mecanismo de "liga-se por configuração, sem código novo" (anexo §2 decisão 3): nenhuma migration nova é necessária para ativar um processo/base. TOLERANCIA_OBRIGATORIA se tentar ativar sem tolerância definida (nem no payload, nem já gravada); EXPECTATIVA_NAO_ENCONTRADA se o alvo não existir. Grava alterado_em/alterado_por (auth.uid(), NULL se chamado por service_role) — ligar/desligar um detector de falha precisa de rastro. app.exigir_acesso(ARRAY[''admin/uploads'']) inline, GRANT a authenticated e service_role — chamada pela tela /admin/ingestao.';

-- Liga/desliga o CRON do vigia. Ver header desta migration para a análise de por que uma
-- função SECURITY DEFINER (owner postgres) consegue chamar cron.alter_job sobre o job
-- ingestao-vigia (também criado por postgres, seção 6) mesmo sem `postgres` ser superusuário
-- no Supabase — e por que esta função NÃO confia cegamente no resultado.
CREATE OR REPLACE FUNCTION public.ingestao_vigia_definir(p_ativo boolean)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_jobid bigint;
  v_ativo boolean;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['admin/uploads']);

  IF p_ativo IS NULL THEN
    RAISE EXCEPTION 'ATIVO_OBRIGATORIO: ingestao_vigia_definir exige ativo (true|false)' USING ERRCODE = '22023';
  END IF;

  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'ingestao-vigia';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VIGIA_CRON_NAO_ENCONTRADO: o job ingestao-vigia não existe em cron.job (esperado desde a migration 0280)'
      USING ERRCODE = '22023';
  END IF;

  -- cron.alter_job devolve void — se a checagem de posse do pg_cron negar a chamada (não
  -- deveria: o dono do job é postgres, mesmo dono desta função SECURITY DEFINER — ver header),
  -- o erro sobe CRU aqui, sem chegar à linha seguinte.
  PERFORM cron.alter_job(v_jobid, active := p_ativo);

  -- ⚠️ NÃO confiar em sucesso silencioso: relê cron.job.active depois da chamada. Se por
  -- qualquer motivo não coberto pelo raciocínio do header o estado não bateu, falha ALTO com
  -- um erro nomeado — nunca reporta êxito sem ter medido o efeito.
  SELECT active INTO v_ativo FROM cron.job WHERE jobid = v_jobid;
  IF v_ativo IS DISTINCT FROM p_ativo THEN
    RAISE EXCEPTION 'VIGIA_ALTERACAO_NAO_APLICADA: cron.alter_job não gravou o estado pedido (pedido=%, lido=%)', p_ativo, v_ativo
      USING ERRCODE = '55000';
  END IF;

  RETURN jsonb_build_object('processo', 'ingestao-vigia', 'ativo', v_ativo);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.ingestao_vigia_definir(boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.ingestao_vigia_definir(boolean) TO authenticated, service_role;
COMMENT ON FUNCTION public.ingestao_vigia_definir(boolean) IS
  'v6.0.0/M6: liga/desliga o cron ingestao-vigia via cron.alter_job (job criado pela migration 0280, mesmo dono — postgres — desta função SECURITY DEFINER; ver header para a análise de posse do pg_cron sob SECURITY DEFINER, NÃO verificada ao vivo). Relê cron.job.active após a chamada e levanta VIGIA_ALTERACAO_NAO_APLICADA se o estado não bateu, em vez de confiar cegamente no retorno void de cron.alter_job. VIGIA_CRON_NAO_ENCONTRADO se o job não existir. app.exigir_acesso(ARRAY[''admin/uploads'']) inline, GRANT a authenticated e service_role — chamada pela tela /admin/ingestao.';

NOTIFY pgrst, 'reload schema';
