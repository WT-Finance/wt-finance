-- ---------------------------------------------------------------------------
-- PATCH DESTRUTIVO — apaga a coluna `app.api_chave.whitelist_tipos`, agora inerte.
-- Decisão do Yan (2026-07-31): "cada chave de API deve ter acesso a todos os tipos
-- expostos, não precisamos de tanta complexidade de restrições".
--
-- ███ SEM NÚMERO DE PROPÓSITO ███ — mesma lição do patch anterior: numerar na hora
-- de aplicar, com o próximo livre de verdade (`npx supabase migration list`).
-- Reservar número para destrutiva que vai depois de uma aditiva foi o que fez o
-- `db push` recusar mais cedo hoje.
--
-- COMO APLICAR (no SEU terminal — o wrapper exige TTY, ADR-0131):
--
--   git mv supabase/patches/PENDENTE-remover-coluna-whitelist.sql \
--          supabase/migrations/<próximo>_remover_coluna_whitelist.sql
--   npm run db:migrate -- --destrutiva
--
-- ORDEM: a **0224** (aditiva, que fez as 6 funções pararem de usar a coluna e dropou
-- `api_chave_atualizar`) precisa estar aplicada ANTES. A guarda abaixo aborta se não
-- estiver — dropar a coluna com uma função ainda lendo-a quebraria a criação de
-- solicitação via API na primeira chamada.
--
-- DECLARAÇÃO PRÉVIA (regime destrutivo / confirmação humana obrigatória):
--   • O QUE APAGA: `app.api_chave.whitelist_tipos` (bigint[]) — e nada mais.
--   • POR QUE É SEGURO: `app.api_chave` está VAZIA (0 chaves emitidas). Mesmo se
--     houvesse, o conteúdo da coluna já não é lido por função nenhuma desde a 0224.
--   • O QUE NÃO TOCA: o resto de `app.api_chave` (referência/plataforma, hash do
--     segredo, robô, ativo, datas de criação/revogação), o log de chamadas, e o
--     controle que RESTA — `solicitacao_tipo.exposto_via_api`, que é o único lugar
--     onde se decide o que a API alcança.
--   • DOWN: `ALTER TABLE app.api_chave ADD COLUMN whitelist_tipos bigint[] NOT NULL
--     DEFAULT '{}'::bigint[];` + reaplicar as versões pré-0224 das 6 funções. O
--     CONTEÚDO das listas não volta (mas não havia nenhuma).
-- ---------------------------------------------------------------------------

-- ── Guarda 1 (PRÉ) ────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_dependentes text;
  v_chaves      int;
BEGIN
  SELECT string_agg(n.nspname || '.' || p.proname, ', ' ORDER BY p.proname) INTO v_dependentes
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname IN ('app', 'public') AND p.prokind = 'f'
    AND pg_get_functiondef(p.oid) ILIKE '%whitelist_tipos%';
  IF v_dependentes IS NOT NULL THEN
    RAISE EXCEPTION 'ABORTADO: a migration 0224 não foi aplicada — estas funções ainda leem whitelist_tipos e quebrariam: %.', v_dependentes;
  END IF;

  SELECT count(*) INTO v_chaves FROM app.api_chave;
  IF v_chaves > 0 THEN
    RAISE NOTICE '[patch] AVISO: existem % chave(s). A coluna já não é lida por ninguém desde a 0224, então a remoção é segura — mas confira se alguma dependia de restrição por tipo antes de seguir.', v_chaves;
  END IF;

  RAISE NOTICE '[patch] guardas OK → nenhuma função lê whitelist_tipos.';
END $$;

ALTER TABLE app.api_chave DROP COLUMN IF EXISTS whitelist_tipos;

-- ── Guarda 2 (PÓS) ────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'app' AND table_name = 'api_chave' AND column_name = 'whitelist_tipos'
  ) THEN
    RAISE EXCEPTION 'ABORTADO: a coluna whitelist_tipos continua lá.';
  END IF;
  RAISE NOTICE '[patch] DEPOIS → coluna removida. O controle do que a API alcança é só solicitacao_tipo.exposto_via_api.';
END $$;

NOTIFY pgrst, 'reload schema';
