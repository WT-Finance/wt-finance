-- ---------------------------------------------------------------------------
-- PATCH DESTRUTIVO — apaga a máquina de callbacks (agora inerte) e as 3 colunas
-- órfãs dos rounds 2 e 3. Decisão do Yan (2026-07-31): "vamos seguir com a
-- remoção" dos callbacks; as colunas órfãs já estavam registradas como pendência
-- desde o round 3.
--
-- ███ SEM NÚMERO DE PROPÓSITO ███
-- Este arquivo NÃO está em `supabase/migrations/` e NÃO tem número — é a lição que
-- custou uma recusa do `db push` hoje: reservei `0218` para a limpeza de histórico,
-- apliquei a `0219` antes, e o 0218 virou um número ABAIXO do topo remoto ("Found
-- local migration files to be inserted before the last migration on remote
-- database"). **Numere na hora de aplicar**, com o próximo livre de verdade (hoje
-- seria `0223`, mas confira `npx supabase migration list` antes).
--
-- COMO APLICAR (no SEU terminal — o wrapper exige TTY, ADR-0131):
--
--   git mv supabase/patches/PENDENTE-remover-outbox-e-colunas-orfas.sql \
--          supabase/migrations/0223_remover_outbox_e_colunas_orfas.sql
--   npm run db:migrate -- --destrutiva
--
-- ORDEM OBRIGATÓRIA: a migration **0222** (aditiva, que fez as 9 funções pararem
-- de usar a fila e os campos de callback) precisa estar aplicada ANTES. A Guarda 1
-- aborta se não estiver — sem ela, dropar `api_outbox_enfileirar` deixaria
-- `solic_concluir`/`solic_rejeitar`/`solic_cancelar` chamando função inexistente, e
-- a tela de Solicitações quebraria em produção na primeira conclusão.
--
-- DECLARAÇÃO PRÉVIA (regime destrutivo / confirmação humana obrigatória):
--   • O QUE APAGA — PARTE 1 (callbacks):
--       - cron job `api-outbox-processar` (*/5, jobid 2) — desagendado
--       - `public.api_outbox_reivindicar(p_limite integer)`
--       - `public.api_outbox_resultado(p_id bigint, p_sucesso boolean, p_erro text)`
--       - `app.api_outbox_enfileirar(p_solicitacao_id bigint, p_evento text, p_extra jsonb)`
--       - `app.api_outbox` (tabela da fila — **0 linhas**, conferido em 31/07:
--         nada de valor se perde; nunca houve integrador real)
--       - `app.api_chave.callback_url` e `app.api_chave.callback_segredo`
--         (**0 chaves emitidas** — nenhum segredo em uso é perdido)
--   • O QUE APAGA — PARTE 2 (colunas órfãs dos rounds 2 e 3, pendência antiga):
--       - `app.solicitacao_tipo.exige_referencia_conclusao` (morta na 0215)
--       - `app.solicitacao_tipo.api_roles_permitidas` (morta na 0216)
--       - `app.solicitacao.referencia_conclusao` (morta na 0215)
--     Estão inertes desde os rounds 2/3: nenhuma função lê ou escreve nelas (a
--     Guarda 1 CONFERE isso no catálogo antes de dropar, em vez de confiar na
--     minha memória). Se você preferir separar, apague esta parte do arquivo — as
--     duas metades são independentes.
--   • O QUE NÃO TOCA: `app.api_chamada_log` (o log de chamadas FICA — é a auditoria
--     da porta de entrada), `app.api_chave` em si, solicitações, tipos, campos,
--     usuários, RBAC, Storage.
--   • NÃO EXISTE DOWN: para voltar, reaplicar 0211/0213 (tabela, RPCs, cron,
--     colunas) e as versões pré-0222 das 9 funções.
-- ---------------------------------------------------------------------------

-- ── Guarda 1 (PRÉ) ────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_dependentes text;
  v_linhas      int;
  v_chaves      int;
  v_orfas       text;
BEGIN
  -- (a) A 0222 já rodou? Nenhuma função além da própria pode citar o enfileirador.
  SELECT string_agg(n.nspname || '.' || p.proname, ', ' ORDER BY p.proname) INTO v_dependentes
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname IN ('app', 'public') AND p.prokind = 'f'
    AND p.proname <> 'api_outbox_enfileirar'
    AND pg_get_functiondef(p.oid) ILIKE '%api_outbox_enfileirar%';
  IF v_dependentes IS NOT NULL THEN
    RAISE EXCEPTION 'ABORTADO: a migration 0222 não foi aplicada — estas funções ainda chamam app.api_outbox_enfileirar e quebrariam ao dropá-la: %. Aplique a 0222 primeiro.', v_dependentes;
  END IF;

  -- (b) A fila está vazia? Item pendente aqui significa evento que nunca será
  -- entregue — o certo é olhar antes de apagar, não descobrir depois.
  SELECT count(*) INTO v_linhas FROM app.api_outbox;
  IF v_linhas > 0 THEN
    RAISE EXCEPTION 'ABORTADO: app.api_outbox tem % linha(s). O censo de 31/07 viu 0. Confira o que apareceu (SELECT id, evento, solicitacao_id, status, tentativas FROM app.api_outbox ORDER BY id) antes de descartar.', v_linhas;
  END IF;

  -- (c) Nenhuma chave emitida? Dropar callback_segredo de uma chave EM USO
  -- quebraria a validação do lado do integrador sem aviso.
  SELECT count(*) INTO v_chaves FROM app.api_chave;
  IF v_chaves > 0 THEN
    RAISE EXCEPTION 'ABORTADO: existem % chave(s) de API. Se alguma usa callback, confirme com o integrador que ele migrou para consulta ANTES de remover as colunas.', v_chaves;
  END IF;

  -- (d) As 3 colunas órfãs (parte 2) estão de fato órfãs no catálogo?
  SELECT string_agg(n.nspname || '.' || p.proname, ', ' ORDER BY p.proname) INTO v_orfas
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname IN ('app', 'public') AND p.prokind = 'f'
    AND (pg_get_functiondef(p.oid) ILIKE '%exige_referencia_conclusao%'
      OR pg_get_functiondef(p.oid) ILIKE '%api_roles_permitidas%'
      OR pg_get_functiondef(p.oid) ILIKE '%referencia_conclusao%');
  IF v_orfas IS NOT NULL THEN
    RAISE EXCEPTION 'ABORTADO: estas funções ainda referenciam as colunas ditas órfãs: %. Reconferir antes de dropar.', v_orfas;
  END IF;

  RAISE NOTICE '[patch] guardas OK → 0222 aplicada, fila vazia, 0 chaves, colunas órfãs confirmadas.';
END $$;

-- ── PARTE 1: a máquina de callbacks ───────────────────────────────────────────
-- O cron sai primeiro: com a rota já removida do código, ele só produziria 404 a
-- cada 5 minutos; e desagendar antes de dropar evita uma execução no meio do push.
SELECT cron.unschedule('api-outbox-processar');

DROP FUNCTION IF EXISTS public.api_outbox_reivindicar(integer);
DROP FUNCTION IF EXISTS public.api_outbox_resultado(bigint, boolean, text);
DROP FUNCTION IF EXISTS app.api_outbox_enfileirar(bigint, text, jsonb);

DROP TABLE IF EXISTS app.api_outbox;

ALTER TABLE app.api_chave
  DROP COLUMN IF EXISTS callback_url,
  DROP COLUMN IF EXISTS callback_segredo;

-- ── PARTE 2: colunas órfãs dos rounds 2 e 3 ───────────────────────────────────
ALTER TABLE app.solicitacao_tipo DROP COLUMN IF EXISTS exige_referencia_conclusao;
ALTER TABLE app.solicitacao_tipo DROP COLUMN IF EXISTS api_roles_permitidas;
ALTER TABLE app.solicitacao      DROP COLUMN IF EXISTS referencia_conclusao;

-- ── Guarda 2 (PÓS) ────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_restos text;
  v_cron   int;
BEGIN
  SELECT string_agg(x, ', ') INTO v_restos FROM (
    SELECT 'tabela app.api_outbox' x WHERE EXISTS (
      SELECT 1 FROM pg_tables WHERE schemaname = 'app' AND tablename = 'api_outbox')
    UNION ALL
    SELECT 'função ' || p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname IN ('app', 'public') AND p.proname LIKE 'api_outbox%'
    UNION ALL
    SELECT 'coluna app.api_chave.' || column_name FROM information_schema.columns
     WHERE table_schema = 'app' AND table_name = 'api_chave' AND column_name LIKE 'callback%'
    UNION ALL
    SELECT 'coluna órfã ' || table_name || '.' || column_name FROM information_schema.columns
     WHERE table_schema = 'app'
       AND column_name IN ('exige_referencia_conclusao', 'api_roles_permitidas', 'referencia_conclusao')
  ) t;
  IF v_restos IS NOT NULL THEN
    RAISE EXCEPTION 'ABORTADO: sobrou o que deveria ter saído → %', v_restos;
  END IF;

  SELECT count(*) INTO v_cron FROM cron.job WHERE jobname = 'api-outbox-processar';
  IF v_cron > 0 THEN
    RAISE EXCEPTION 'ABORTADO: o cron api-outbox-processar continua agendado.';
  END IF;

  RAISE NOTICE '[patch] DEPOIS → fila, RPCs, cron, colunas de callback e as 3 colunas órfãs REMOVIDOS. O log de chamadas (api_chamada_log) permanece.';
END $$;

NOTIFY pgrst, 'reload schema';
