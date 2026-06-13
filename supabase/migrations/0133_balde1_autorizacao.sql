-- ---------------------------------------------------------------------------
-- 0133 — v4.17.0 Balde 1: Autorização e superfície de exposição.
--
-- PLANO DA MISSÃO (âncora ratificada 2026-06-13): migration de REVOKE/guard,
-- ADITIVA e retrocompatível com a main viva; NÃO escreve em dados pré-existentes
-- (só altera funções/grants). Backup do dia com restore testado:
-- ~/wt-finance-backups/2026-06-13-pre-v4-17 (feito antes de aplicar).
--
-- Família da migration 0129 (furo de autorização que não levanta erro). Itens:
--   M1         — REVOKE EXECUTE de anon em todas as RPCs (exceto solicitar_acesso),
--                encerrando a janela de compatibilidade da v4.13.
--   fail-open  — exigir_acesso só libera contexto sem claims se for SUPERUSUÁRIO real.
--   anon-OFF   — remove o ramo "anon passa quando enforcement OFF" do exigir_acesso.
--   badge      — solic_minhas_pendencias ganha guard (usuário inativo não conta).
--   config     — app.get_config_numeric: REVOKE de anon/authenticated (server-side).
--   rate-limit — solicitar_acesso (anônima) ganha teto por janela (anti-flood).
-- O kill switch (auth_enforcement_ativo / admin_set_enforcement) PERMANECE como
-- mecanismo de emergência (ver runbook); apenas deixa de reger o caminho anon.
-- ---------------------------------------------------------------------------

-- ── exigir_acesso: fail-open estreitado + anon sempre negado ──
CREATE OR REPLACE FUNCTION app.exigir_acesso(p_areas text[] DEFAULT NULL::text[])
RETURNS void
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_claims text;
  v_role   text;
  v_uid    uuid;
BEGIN
  v_claims := nullif(current_setting('request.jwt.claims', true), '');

  -- Sem contexto PostgREST (claims nulo). Antes liberava QUALQUER conexão (fail-open):
  -- requisição anônima do PostgREST chega sem claims e passava. Agora libera SÓ
  -- superusuário real (migrations/seed/`db query` conectam como postgres); demais
  -- papéis sem claims (inclusive o `authenticator` do PostgREST sem JWT) → barrados.
  IF v_claims IS NULL THEN
    IF coalesce((SELECT r.rolsuper FROM pg_roles r WHERE r.rolname = session_user), false) THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'AUTH_NECESSARIA: contexto sem identidade'
      USING ERRCODE = '42501';
  END IF;

  v_role := v_claims::jsonb ->> 'role';
  IF v_role = 'service_role' THEN
    RETURN;
  END IF;

  v_uid := nullif(v_claims::jsonb ->> 'sub', '')::uuid;

  -- Anônimo (JWT presente sem sub, ou role=anon): SEMPRE negado. Janela de
  -- compatibilidade da v4.13 encerrada — não consulta mais auth_enforcement_ativo().
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_NECESSARIA: acesso anônimo desativado'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM app.rbac_usuarios u WHERE u.user_id = v_uid AND u.ativo) THEN
    RAISE EXCEPTION 'USUARIO_INATIVO: sem cadastro ativo no WT Finance'
      USING ERRCODE = '42501';
  END IF;

  IF p_areas IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM app.rbac_usuarios u
    JOIN app.rbac_role_permissoes rp ON rp.role_id = u.role_id
    WHERE u.user_id = v_uid AND u.ativo AND rp.area = ANY (p_areas)
  ) THEN
    RAISE EXCEPTION 'PERMISSAO_NEGADA: requer uma de [%]', array_to_string(p_areas, ', ')
      USING ERRCODE = '42501';
  END IF;
END;
$function$;

-- ── badge: solic_minhas_pendencias com guard (inativo/anon não obtém contador) ──
-- Convertida para plpgsql só para poder PERFORM o guard antes da contagem.
CREATE OR REPLACE FUNCTION public.solic_minhas_pendencias()
RETURNS integer
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  PERFORM app.exigir_acesso();  -- qualquer autenticado ATIVO; barra inativo/anon
  RETURN (
    SELECT count(*)::int
    FROM app.solicitacao s
    WHERE s.status = 'aberta'
      AND (coalesce(s.destinatario_user_id = app.uid_jwt(), false)
           OR (s.destinatario_role_id IS NOT NULL AND s.destinatario_role_id = app.minha_role_id()))
  );
END;
$function$;

-- ── rate-limit: solicitar_acesso (anônima) com teto por janela ──
CREATE OR REPLACE FUNCTION public.solicitar_acesso(p_email text, p_nome text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_email text := lower(trim(p_email));
BEGIN
  IF v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'E-mail inválido.');
  END IF;

  -- Anti-flood: a RPC é anônima (sem identidade p/ throttle por usuário). Teto por
  -- JANELA bloqueia inundação da fila de moderação. 5 novas solicitações/minuto é
  -- folgado p/ uso legítimo e contém runaway. (v4.17.0/rate-limit.)
  IF (SELECT count(*) FROM app.rbac_solicitacoes WHERE criado_em > now() - interval '1 minute') >= 5 THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Muitas solicitações em pouco tempo. Aguarde um instante e tente novamente.');
  END IF;

  INSERT INTO app.rbac_solicitacoes (email, nome)
  SELECT v_email, nullif(trim(p_nome), '')
  WHERE NOT EXISTS (
          SELECT 1 FROM app.rbac_solicitacoes s
          WHERE lower(s.email) = v_email AND s.status = 'pendente')
    AND NOT EXISTS (
          SELECT 1 FROM app.rbac_usuarios u WHERE lower(u.email) = v_email);

  RETURN jsonb_build_object('ok', true);
END;
$function$;

-- ── M1: REVOKE EXECUTE de anon em TODAS as funções de public/app, exceto a única
--    RPC anônima legítima (solicitar_acesso). Cobre overloads via identity args. ──
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname AS sch, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'app')
      AND p.proname <> 'solicitar_acesso'
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM anon', r.sch, r.proname, r.args);
  END LOOP;
END $$;

-- ── config: app.get_config_numeric não é alcançável por anon via REST (schema app
--    não exposto), mas REVOKE explícito fecha o grant latente (defense-in-depth).
REVOKE EXECUTE ON FUNCTION app.get_config_numeric(text) FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';
