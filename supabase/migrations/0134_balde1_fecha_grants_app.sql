-- ---------------------------------------------------------------------------
-- 0134 — v4.17.0 Balde 1 (correção da 0133): fecha o grant de anon nas funções
-- do schema `app`.
--
-- PLANO/ÂNCORA (2026-06-13): migration de REVOKE/GRANT, aditiva, NÃO escreve em
-- dados. Backup do dia com restore testado feito antes da 0133.
--
-- Por quê: o `REVOKE ... FROM anon` da 0133 foi NO-OP para as 8 funções de `app`
-- (areas_do_setor, auth_enforcement_ativo, current_user_role, current_user_setor_id,
-- exigir_acesso, get_config_numeric, is_financeiro, permissoes_de) porque nelas o
-- EXECUTE vem via grant a PUBLIC, não um grant anon-específico — então revogar de
-- anon não removia nada (as RPCs de `public`, com grant anon-específico, fecharam ok).
-- O schema `app` NÃO é exposto pelo PostgREST (config.toml = public/graphql_public),
-- logo anon nunca alcançou essas funções por REST — isto é defense-in-depth, fechando
-- o grant fantasma. Cobre o item `config` (get_config_numeric) do briefing de fato.
--
-- Seguro: as 8 são owned por `postgres` e chamadas só de dentro de wrappers
-- SECURITY DEFINER (rodam como o owner postgres, que ignora grants) ou são
-- inalcançáveis por REST. Mantemos EXECUTE para service_role explicitamente.
-- ---------------------------------------------------------------------------

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'app'
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION app.%I(%s) FROM PUBLIC, anon, authenticated', r.proname, r.args);
    EXECUTE format('GRANT  EXECUTE ON FUNCTION app.%I(%s) TO service_role', r.proname, r.args);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
