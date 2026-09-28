-- ---------------------------------------------------------------------------
-- 0275 — feat(v6.0.0/M1-M2): Custom Access Token Hook — o claim `role` das credenciais de máquina
--
-- DECLARAÇÃO PRÉVIA (regime aditivo / autônomo):
--   • O QUE FAZ: cria `public.custom_access_token_hook(event jsonb)`, o hook que o Supabase Auth
--     chama ao emitir um access token. Para um usuário ATIVO cuja role RBAC é de MÁQUINA
--     ("Máquina · verificação" → `verificador`; "Máquina · ingestão" → `ingestor`), o hook troca o
--     claim `role` (que o Auth emite como `authenticated`) pelo papel do Postgres correspondente —
--     é esse claim que o PostgREST usa no `SET ROLE`, e é assim que as allowlists da 0273/0274
--     passam a valer. Para qualquer outro usuário o evento volta INTOCADO.
--   • POR QUE EXISTE (decisão do Yan, 21/09): o projeto já está no regime novo de chaves
--     (`sb_publishable_…`/`sb_secret_…`, JWKS só com ES256 gerido pelo Supabase). Um JWT HS256
--     assinado localmente com o secret legado não é mais aceito pelo gateway ("No suitable key"),
--     então a decisão original do briefing ("JWT de validade longa fixo no .env.local") ficou
--     inviável. O caminho suportado é: usuário de máquina faz LOGIN (e-mail + senha, guardada
--     em .env.local/Vercel) e recebe um token ES256 de 1 h com o `role` trocado por este hook.
--     Revogar continua sendo desativar o usuário (o hook exige `ativo`, e `exigir_acesso` também).
--   • ADITIVA: só CREATE FUNCTION nova + GRANT/REVOKE. Nenhum objeto existente muda.
--     `app.exigir_acesso` NÃO muda.
--   • ATO HUMANO depois de aplicar: registrar o hook no Dashboard → Authentication → Hooks →
--     "Customize Access Token (JWT) Claims" → Postgres → `public.custom_access_token_hook`.
--     Sem o registro a função existe e não faz nada (login devolve `role=authenticated`, e a
--     credencial de máquina recebe PERMISSAO_NEGADA nas RPCs — fail-closed).
--   • SEGURANÇA: `SECURITY DEFINER` (dona `postgres`) para ler `app.rbac_usuarios`/`rbac_roles`
--     sem abrir essas tabelas ao `supabase_auth_admin`; `search_path = ''`; EXECUTE só para
--     `supabase_auth_admin` (é quem o Auth usa para chamar hooks). Mapeamento por CASE com ELSE
--     explícito: role RBAC que não seja de máquina → sem alteração (nunca "cai" num papel).
--   • Reversão (manual): desregistrar o hook no Dashboard; DROP FUNCTION
--     public.custom_access_token_hook(jsonb).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid   uuid;
  v_role  text;
BEGIN
  v_uid := nullif(event->>'user_id', '')::uuid;
  IF v_uid IS NULL THEN
    RETURN event;
  END IF;

  -- Só usuário ATIVO com role RBAC de máquina ganha papel próprio. Pessoa comum: intocado.
  SELECT CASE r.nome
           WHEN 'Máquina · verificação' THEN 'verificador'
           WHEN 'Máquina · ingestão'    THEN 'ingestor'
           ELSE NULL
         END
    INTO v_role
  FROM app.rbac_usuarios u
  JOIN app.rbac_roles r ON r.id = u.role_id
  WHERE u.user_id = v_uid AND u.ativo;

  IF v_role IS NULL THEN
    RETURN event;
  END IF;

  RETURN jsonb_set(event, '{claims,role}', to_jsonb(v_role), true);
END;
$$;

-- Quem chama hooks é o supabase_auth_admin — e só ele.
GRANT USAGE   ON SCHEMA public TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;

COMMENT ON FUNCTION public.custom_access_token_hook(jsonb) IS
  'v6.0.0 (0275): Auth hook — troca o claim role para verificador/ingestor quando o usuário é de máquina e ativo. Registrar em Dashboard → Authentication → Hooks. Ver docs/runbooks/credenciais-maquina-runbook.md.';

NOTIFY pgrst, 'reload schema';
