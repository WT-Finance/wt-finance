-- 0270 — v5.10.0 / Bloco 5: a ÚNICA migration DESTRUTIVA da versão
--
-- ⚠️ ESTE ARQUIVO NÃO ESTÁ EM `supabase/migrations/` DE PROPÓSITO.
-- `db push` empurra TODO o conjunto pendente da pasta. Deixar uma destrutiva estacionada
-- lá significa que QUALQUER push posterior — de qualquer branch, por qualquer motivo — a
-- leva junto. Foi assim que a v5.2.0 dropou bases por arrasto. O arquivo mora em
-- `supabase/patches/` e só é MOVIDO para `supabase/migrations/` no instante da aplicação,
-- pelo Yan, em TTY. O comando exato está no fim deste cabeçalho.
--
-- DECLARAÇÃO: DESTRUTIVA. **TREZE funções**, duas tabelas e uma constraint saem do banco.
-- (2 do D2-001 + 4 do D2-002 + 2 do D2-003 + 1 do D2-004 + 1 do D2-005 + 3 do D2-007 = 13.
--  A 1ª versão deste header dizia "nove" — erro de contagem pego pelo `revisor-db`. Corrigido
--  porque este parágrafo é o resumo que o Yan lê no TTY antes de confirmar.)
-- Confirmação humana em TTY é obrigatória — o wrapper `npm run db:migrate --destrutiva`
-- aborta em stdin não-TTY (ADR-0131), e o agente não a aplica por construção.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- PRÉ-CONDIÇÃO DO BLOCO 4, CUMPRIDA: o código sem referência a estes objetos JÁ ESTÁ EM
-- PRODUÇÃO — PR #263 mergeado em 2026-09-10T21:22Z (merge 9717334) e deployado pela Vercel.
-- ═══════════════════════════════════════════════════════════════════════════════════════
--
-- RECONTAGEM DO MAPA (exigida porque o commit f43d493 apagou 6 scripts de `supabase/seed/`,
-- e RPC cujo único chamador fosse um deles viraria órfã só agora).
-- Resultado, registrado por honestidade: **nenhum dos 6 seeds citava qualquer alvo** —
-- a recontagem era a precaução certa e voltou limpa; o conjunto de órfãos não mudou.
-- Consulta reproduzível: `supabase/patches/bloco5-recontagem.sql`, que varre as QUATRO
-- superfícies do banco — corpo de outra função, POLICY, TRIGGER e CHECK. As duas do meio
-- são a lição dos falsos positivos D2-008/D2-009, em que o mapa da Fase 1 deu como órfãs
-- uma função usada em policy e três usadas em trigger.
--
-- Saída da recontagem (10/09/2026, pós-0269): órfãos em todas as quatro superfícies, com
-- uma única referência esperada — `get_fluxo_caixa_kpis_diario` → `..._diario__nucleo`,
-- que é o par que cai junto.
--
-- SOBRE O QUE O GREP EM `src/` AINDA ENCONTRA: o único hit de quase todos estes nomes é
-- `src/types/database.ts` — que desde a v5.10.0 é ESPELHO GERADO do banco (ADR-0173), não
-- consumidor. Nenhum call-site. Depois de aplicar esta migration é preciso REGENERAR o
-- arquivo (passo 5 da seção 5 do ritual `/fechamento-versao`) para o espelho voltar a
-- dizer a verdade. Está no roteiro pós-aplicação, no fim.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- O QUE **NÃO** ENTRA, e por quê
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- `public.get_decomposicao_bloco` (0209) estava na lista COM CONDIÇÃO: "se o mapa recontado
-- confirmar zero chamadores". **O mapa NÃO confirma.** No catálogo ela é órfã, mas no
-- repositório tem consumidor VIVO: `src/lib/rpc-contrato.test.ts:1055` e `:1069` a chamam
-- por REST em dois casos de contrato, e `decomposicaoBlocoSchema` (`src/lib/dre/schemas.ts:183`)
-- valida o retorno. Dropar agora quebraria `npm test` contra produção no minuto seguinte.
-- É o mesmo acoplamento já registrado em D1-007. A ordem correta é a do Bloco 4 aplicada de
-- novo: remover os dois casos + o schema → mergear → deployar → só então dropar. Fica para
-- um patch próprio, e a nota do D1-007 no relatório triado já o antecipava.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- COMO APLICAR (Yan, em TTY — o agente não aplica destrutiva)
-- ═══════════════════════════════════════════════════════════════════════════════════════
--   cd /home/yan-wt/projects/wt-finance
--   git checkout chore/v5-10-0-limpeza-fechamento-v5 && git pull --ff-only
--   mv supabase/patches/0270_v5_10_0_drop_objetos_orfaos.sql supabase/migrations/
--   npx supabase migration list          # conferir que 0270 é a ÚNICA pendente
--   npm run db:migrate -- --destrutiva   # backup-gate + restore-test + confirmação em TTY
--
-- Se a lista mostrar QUALQUER outra migration pendente além da 0270, PARE: `db push`
-- levaria as duas.
--
-- COMO REVERTER, se for preciso: o corpo de cada uma das 13 funções está em
-- `docs/auditoria-v5/_insumos/catalogo-funcoes-def.txt` — snapshot de `pg_get_functiondef`
-- tirado do CATÁLOGO VIVO em 10/09/2026, antes deste DROP. É a fonte certa, não a migration
-- de origem: a de origem pode ter sido superada por um `CREATE OR REPLACE` posterior (a
-- lição do `app.solic_json`). As tabelas de D2-007 estão vazias, então reverter é só
-- recriar a estrutura (migrations 0233-0235/0238).

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- D2-001 — KPIs diários do Fluxo de Caixa: wrapper + núcleo, nunca ligados à tela
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- A tela viva é `get_fluxo_caixa_kpis_b(p_from text, p_to text)`, chamada em
-- `src/app/financeiro/fluxo-caixa/page.tsx:136` e coberta por caso de contrato
-- (`rpc-contrato.test.ts:225,242`). O par `_diario` não tem argumentos e não tem chamador:
--   $ grep -rn "get_fluxo_caixa_kpis" src --include=*.ts --include=*.tsx | grep -v types/database.ts
--   -> só as 4 linhas do `_b`; nenhuma do `_diario`
-- Verificado por REST antes do DROP: `_b` com args devolve 200 (o caminho vivo segue de pé)
-- e `_diario` também responde 200 — existe, e é o que este DROP remove.
-- O wrapper sai antes do núcleo porque é ele que o cita.
DROP FUNCTION IF EXISTS public.get_fluxo_caixa_kpis_diario();
DROP FUNCTION IF EXISTS public.get_fluxo_caixa_kpis_diario__nucleo();

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- D2-002 — as 4 `__nucleo` do Gerencial que o wrapper homônimo NÃO chama
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- O padrão `__nucleo` do retrofit 0121 é legítimo quando o wrapper DELEGA (é o caso de
-- `get_operacoes_weddings`, que faz `RETURN ..._nucleo(...)`). Nestes quatro o wrapper
-- duplica a lógica e nunca chama o núcleo — então o núcleo é código morto no banco.
-- RECONFIRMADO NO ATO que não há chamada por SQL dinâmico, que é o único jeito de a
-- referência escapar do grep de corpo (`supabase/patches/bloco5-precondicoes.sql`, (a)):
--   get_gerencial_lancamentos            EXECUTE=false  format()=false  chama__nucleo=false
--   get_gerencial_lancamentos_planilha   EXECUTE=false  format()=false  chama__nucleo=false
--   get_gerencial_projecao_diaria        EXECUTE=false  format()=false  chama__nucleo=false
--   get_gerencial_saldos                 EXECUTE=false  format()=false  chama__nucleo=false
-- E os quatro WRAPPERS seguem 200 por REST — é o caminho vivo, e ele não passa daqui.
-- Assinaturas lidas do catálogo no ato (`pg_get_function_identity_arguments`), não
-- deduzidas: `..._projecao_diaria__nucleo` tem UM argumento (`p_dias integer`), e a
-- primeira versão deste arquivo escreveu dois. Com `IF EXISTS`, assinatura errada é
-- NO-OP SILENCIOSO — a função sobrevive e a migration "passa". O guard no fim do arquivo
-- existe por causa disso.
DROP FUNCTION IF EXISTS public.get_gerencial_lancamentos__nucleo(integer);
DROP FUNCTION IF EXISTS public.get_gerencial_lancamentos_planilha__nucleo();
DROP FUNCTION IF EXISTS public.get_gerencial_projecao_diaria__nucleo(integer);
DROP FUNCTION IF EXISTS public.get_gerencial_saldos__nucleo();

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- D2-003 — helpers de perfil superados pelo RBAC dinâmico
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- `app.current_user_setor_id` NUNCA teve referência em `src/` (`git log -S` no caminho
-- `src` não retorna nenhum commit): nasceu interna e ficou sem uso.
-- `public.get_my_profile` foi do tempo do login por magic link (introduzida em 33454c1);
-- hoje o caminho vivo é `get_minhas_permissoes`, que responde 200 por REST. O único hit em
-- `src/` é o espelho gerado `src/types/database.ts`.
-- ⚠️⚠️ ATENÇÃO — `get_my_profile()` NÃO é um órfão comum: o ADR-0107 RESERVOU a remoção
-- dela para uma decisão do usuário. Texto literal (`docs/adr/0107-rbac-dinamico-por-area.md:49-52`):
--
--     "`app.usuarios`, `app.convites` e `get_my_profile()` ficam **intocados** (vazios,
--      inofensivos, trancados por RLS/REVOKE no ADR-0108) — preservar em vez de remover,
--      por política do projeto. Documentados como legado; remoção pode ser decidida pelo
--      usuário em versão futura."
--
-- Achado ALTO do `revisor-db`, e ele tem razão em levantar: a minha primeira versão deste
-- comentário tratou os ADRs só pela pergunta "é procedimento executável?" (a lição do
-- `getPool`) e, com isso, passou por cima do CONTEÚDO da decisão. Pela régua do core —
-- "decisão de produto é do usuário; na dúvida, é produto" — isto é produto.
--
-- POR QUE ENTRA MESMO ASSIM: a reserva do ADR-0107 é uma decisão guardada PARA o usuário,
-- e o Yan a exerceu ao listar `public.get_my_profile` nominalmente no escopo do Bloco 5.
-- Ou seja, a versão futura que o ADR previa é esta. O que faltava era o registro explícito,
-- que fica aqui e na Decisão 3 do ADR-0173.
-- ⚠️ Se o Yan NÃO tinha o ADR-0107 em mente ao listar o item, basta remover esta única
-- linha de DROP antes de mover o arquivo — nada mais no arquivo depende dela.
--
-- `app.usuarios` e `app.convites`, citadas no mesmo parágrafo do ADR, seguem INTOCADAS:
-- não estão no escopo do D2-003 nem em nenhum outro item da triagem.
--
-- ADR-0106 também cita a função, como registro histórico. ADR não sai (regra 4 do briefing).
DROP FUNCTION IF EXISTS app.current_user_setor_id();
DROP FUNCTION IF EXISTS public.get_my_profile();

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- D2-004 — predicado de área substituído pelo guard canônico
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- `app.is_financeiro` nunca teve referência em `src/` e nenhuma função a chama. O que
-- ocupou o lugar dela é `app.exigir_acesso(ARRAY['financeiro/...'])`, inline em cada RPC.
DROP FUNCTION IF EXISTS app.is_financeiro();

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- D2-005 — leitor unitário de config que ninguém usa
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- CONDIÇÃO DA TRIAGEM CUMPRIDA (`bloco5-precondicoes.sql`, (b)): as três funções que
-- precisam de config leem `app.config` DIRETO, nenhuma passa por aqui —
--   app.auth_enforcement_ativo, public.admin_set_enforcement, public.get_dashboard_config__nucleo
-- Ou seja, a existência de leitura direta é justamente o que prova que este helper está
-- fora do caminho. Nunca teve referência em `src/`.
-- ⚠️ ADR-0010 documenta `app.get_config_numeric(p_chave)` como o caminho SQL de leitura
-- unitária. O ADR fica (regra 4), mas a convenção que ele descreve já não é a praticada —
-- o ADR-0173 registra a divergência e o que passou a valer.
DROP FUNCTION IF EXISTS app.get_config_numeric(text);

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- D2-007 — meta por subsetor: a branch stand-by foi descartada (decisão do Yan)
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- As três RPCs e as duas tabelas nasceram na `feat/v5-4-4-metas-subsetor-weddings`
-- (PR #213, nunca mergeado). O código nunca existiu em `main` — o único hit em `src/` é o
-- espelho gerado. Decisão da triagem: dropar e fechar o PR #213.
-- `get_sumario_subsetor` FICA: é outra função, viva na Performance de Weddings, e responde
-- 200 por REST — conferido no ato, para não confundir os nomes parecidos.
--
-- ⚠️ ESTA É ESTRUTURALMENTE DIFERENTE DAS OUTRAS (achado colateral do `revisor-db`, sem
-- risco, mas registrado porque contradiz a moldura do resto do bloco): `metas_sumario_subsetor`
-- (que sai) e `get_sumario_subsetor` (que fica) são dois wrappers FINOS, com áreas de RBAC
-- diferentes, sobre o MESMO núcleo `public.get_sumario_subsetor__nucleo(date, date)`. Não é
-- o padrão "reimplementação isolada e nunca usada" das outras — é reuso real. O núcleo
-- compartilhado NÃO está na lista de DROP, exatamente por isso; e o guard de efetividade no
-- fim reprova se `get_sumario_subsetor` sumir.
DROP FUNCTION IF EXISTS public.metas_subsetor_listar(integer);
DROP FUNCTION IF EXISTS public.metas_subsetor_upsert(jsonb);
DROP FUNCTION IF EXISTS public.metas_sumario_subsetor(date, date);

-- As tabelas saem DEPOIS das funções que as manipulavam, e SEM CASCADE de propósito: se
-- algo inesperado depender delas, o DROP tem de falhar alto, não arrastar em silêncio.
-- PROVA NO ATO (`bloco5-precondicoes.sql`, (c), 10/09/2026):
--   app.meta_subsetor              0 linhas
--   app.meta_subsetor_historico    0 linhas
--   FKs apontando para elas        0
--   policies                       nenhuma
--   triggers                       nenhum
-- O `SELECT ... 0` abaixo é cinto: se alguém inserir dado entre a prova e a aplicação, a
-- migration ABORTA em vez de apagar dado real.
DO $$
DECLARE v_n bigint;
BEGIN
  SELECT (SELECT count(*) FROM app.meta_subsetor)
       + (SELECT count(*) FROM app.meta_subsetor_historico) INTO v_n;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'ABORTADO: app.meta_subsetor/_historico tem % linha(s) — a prova de vazio '
                    'foi feita em 10/09/2026 e deixou de valer. Reavalie antes de dropar.', v_n;
  END IF;
END $$;

DROP TABLE IF EXISTS app.meta_subsetor_historico;
DROP TABLE IF EXISTS app.meta_subsetor;

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- D2-013 — constraint redundante na taxa do CDI
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- `analytics.dim_taxa_cdi.taxa` tem DUAS CHECK sobrepostas, lidas do catálogo no ato
-- (`bloco5-precondicoes.sql`, (d)):
--   dim_taxa_cdi_taxa_mensal_plausivel   CHECK (taxa > -0.05 AND taxa < 0.05)   <- FICA (±5%)
--   dim_taxa_cdi_taxa_plausivel          CHECK (taxa > -1    AND taxa < 1)      <- SAI (±100%)
-- Como as duas são AND, a de ±100% nunca acrescenta proteção enquanto a de ±5% existir:
-- todo valor que passa na estreita passa na larga. Sai a larga; a estreita continua sendo
-- a que barra taxa implausível.
ALTER TABLE analytics.dim_taxa_cdi DROP CONSTRAINT IF EXISTS dim_taxa_cdi_taxa_plausivel;

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- GUARD DE EFETIVIDADE — todo `IF EXISTS` acima é potencialmente um NO-OP SILENCIOSO
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- `DROP FUNCTION IF EXISTS f(tipos_errados)` não acha a função, não erra, e a deixa viva.
-- A migration "passaria" e o objeto continuaria lá — exatamente o modo de falha que a
-- primeira versão deste arquivo tinha (`..._projecao_diaria__nucleo` com 2 args em vez de
-- 1). Este bloco fecha a porta: se QUALQUER alvo sobreviveu, a transação inteira aborta.
DO $$
DECLARE v_resto text;
BEGIN
  SELECT string_agg(n.nspname || '.' || p.proname || '(' ||
                    pg_get_function_identity_arguments(p.oid) || ')', ', ' ORDER BY 1)
    INTO v_resto
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE (n.nspname, p.proname) IN (
           ('public','get_fluxo_caixa_kpis_diario'),('public','get_fluxo_caixa_kpis_diario__nucleo'),
           ('public','get_gerencial_lancamentos__nucleo'),('public','get_gerencial_lancamentos_planilha__nucleo'),
           ('public','get_gerencial_projecao_diaria__nucleo'),('public','get_gerencial_saldos__nucleo'),
           ('app','current_user_setor_id'),('public','get_my_profile'),('app','is_financeiro'),
           ('app','get_config_numeric'),('public','metas_subsetor_listar'),
           ('public','metas_subsetor_upsert'),('public','metas_sumario_subsetor'));
  IF v_resto IS NOT NULL THEN
    RAISE EXCEPTION 'ABORTADO: DROP nao teve efeito em: %. Quase sempre e assinatura '
                    'divergente do catalogo — o IF EXISTS engole o erro em silencio.', v_resto;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
              WHERE n.nspname = 'app' AND c.relname IN ('meta_subsetor','meta_subsetor_historico')) THEN
    RAISE EXCEPTION 'ABORTADO: app.meta_subsetor/_historico ainda existe apos o DROP.';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint
              WHERE conrelid = 'analytics.dim_taxa_cdi'::regclass
                AND conname  = 'dim_taxa_cdi_taxa_plausivel') THEN
    RAISE EXCEPTION 'ABORTADO: a constraint de +-100%% sobreviveu ao DROP.';
  END IF;

  -- E o contrapeso: o que tinha de FICAR ficou.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'analytics.dim_taxa_cdi'::regclass
                    AND conname  = 'dim_taxa_cdi_taxa_mensal_plausivel') THEN
    RAISE EXCEPTION 'ABORTADO: a constraint de +-5%% (a que PROTEGE) sumiu — dropei a errada.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'public' AND p.proname = 'get_sumario_subsetor') THEN
    RAISE EXCEPTION 'ABORTADO: public.get_sumario_subsetor sumiu — ela FICA (nome parecido '
                    'com metas_sumario_subsetor, que e a que sai).';
  END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- DEPOIS DE APLICAR (roteiro de verificação — a migration não fecha sozinha)
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 1. REST: os caminhos VIVOS seguem 200 (é o que prova que nada quebrou):
--      get_fluxo_caixa_kpis_b(p_from,p_to) · get_gerencial_lancamentos · get_gerencial_saldos
--      get_gerencial_projecao_diaria · get_gerencial_lancamentos_planilha
--      get_sumario_subsetor · get_minhas_permissoes · get_dashboard_config
--    Script pronto: `node docs/auditoria-v5/_insumos/bloco5-verifica-pos-drop.mjs`
-- 2. REST: os alvos devolvem 404/PGRST202 (sumiram mesmo).
-- 3. REGENERAR o espelho de tipos, que ficou stale com o DROP:
--      npx supabase gen types typescript --linked > src/types/database.ts
--    e commitar junto — passo 5 da seção 5 do `/fechamento-versao`.
-- 4. `npm test` — a suíte tem de seguir verde; se algum caso quebrar, é consumidor que a
--    recontagem não viu, e a migration precisa ser revista, não o teste.
-- 5. Fechar o PR #213 (stand-by), cujas RPCs acabaram de sair do banco.
