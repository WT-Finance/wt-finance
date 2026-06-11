-- ---------------------------------------------------------------------------
-- 0125 — feat(v4.14): login por SENHA (com troca obrigatória no 1º acesso) +
-- solicitações de acesso (auto-cadastro moderado pelo admin). ADR-0110/0111.
--
-- ADITIVA E REVERSÍVEL: só adiciona 1 coluna, 1 tabela e RPCs novas (+ CREATE OR
-- REPLACE de get_minhas_permissoes). Não altera nada do enforcement da v4.13 nem
-- quebra a v4.12.1 (freio de emergência intacto). O login por senha é do APP
-- (Supabase Auth signInWithPassword); aqui no banco ficam só o flag de troca, a
-- fila de solicitações e os helpers.
-- ---------------------------------------------------------------------------

-- ── 1. Flag de troca obrigatória de senha ────────────────────────────────────
ALTER TABLE app.rbac_usuarios
  ADD COLUMN IF NOT EXISTS precisa_trocar_senha boolean NOT NULL DEFAULT false;

-- Usuários atuais entraram por magic link e NÃO têm senha. Marca todos para
-- definir senha no próximo acesso (cutover não-quebra: eles entram por um link de
-- acesso gerado pelo admin e caem em /trocar-senha para definir a senha).
UPDATE app.rbac_usuarios SET precisa_trocar_senha = true;

-- ── 2. Fila de solicitações de acesso (auto-cadastro) ────────────────────────
CREATE TABLE IF NOT EXISTS app.rbac_solicitacoes (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email        text NOT NULL,
  nome         text,
  status       text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovada', 'rejeitada')),
  criado_em    timestamptz NOT NULL DEFAULT now(),
  decidido_em  timestamptz,
  decidido_por uuid,
  observacao   text
);
-- No máximo UMA solicitação pendente por e-mail (anti-spam básico).
CREATE UNIQUE INDEX IF NOT EXISTS idx_solic_email_pendente
  ON app.rbac_solicitacoes (lower(email)) WHERE status = 'pendente';

ALTER TABLE app.rbac_solicitacoes ENABLE ROW LEVEL SECURITY;           -- deny-by-default
REVOKE ALL ON TABLE app.rbac_solicitacoes FROM PUBLIC, anon, authenticated;

-- ── 3. get_minhas_permissoes: expõe precisa_trocar_senha ─────────────────────
CREATE OR REPLACE FUNCTION public.get_minhas_permissoes()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_row record;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('registrado', false, 'ativo', false, 'permissoes', '[]'::jsonb, 'precisa_trocar_senha', false);
  END IF;

  SELECT u.user_id, u.email, u.nome, u.ativo, u.role_id, u.precisa_trocar_senha, r.nome AS role_nome
    INTO v_row
  FROM app.rbac_usuarios u
  LEFT JOIN app.rbac_roles r ON r.id = u.role_id
  WHERE u.user_id = v_uid;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('registrado', false, 'ativo', false, 'permissoes', '[]'::jsonb, 'precisa_trocar_senha', false);
  END IF;

  RETURN jsonb_build_object(
    'registrado',           true,
    'user_id',              v_row.user_id,
    'email',                v_row.email,
    'nome',                 v_row.nome,
    'ativo',                v_row.ativo,
    'role_id',              v_row.role_id,
    'role',                 v_row.role_nome,
    'precisa_trocar_senha', v_row.precisa_trocar_senha,
    'permissoes',           CASE WHEN v_row.ativo THEN to_jsonb(app.permissoes_de(v_uid)) ELSE '[]'::jsonb END
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_minhas_permissoes() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_minhas_permissoes() TO authenticated, service_role;

-- ── 4. marcar_senha_trocada: o próprio usuário desliga o flag após trocar ────
CREATE OR REPLACE FUNCTION public.marcar_senha_trocada()
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_NECESSARIA' USING ERRCODE = '42501';
  END IF;
  UPDATE app.rbac_usuarios SET precisa_trocar_senha = false, atualizado_em = now() WHERE user_id = auth.uid();
END;
$$;
REVOKE EXECUTE ON FUNCTION public.marcar_senha_trocada() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.marcar_senha_trocada() TO authenticated, service_role;

-- ── 5. admin_marcar_trocar_senha: admin força a troca (ao resetar a senha) ───
CREATE OR REPLACE FUNCTION public.admin_marcar_trocar_senha(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['admin/acessos']);
  UPDATE app.rbac_usuarios SET precisa_trocar_senha = true, atualizado_em = now() WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'USUARIO_INEXISTENTE' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_marcar_trocar_senha(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_marcar_trocar_senha(uuid) TO authenticated, service_role;

-- ── 6. solicitar_acesso: ENDPOINT PÚBLICO (anon) de auto-cadastro ────────────
-- NÃO chama exigir_acesso (é pré-cadastro). Anti-abuso: e-mail válido, no máx. 1
-- pendente por e-mail (índice parcial), e nada se já houver usuário com o e-mail.
-- Resposta sempre {ok:true} para e-mail válido (anti-enumeração). Nada é criado
-- aqui — só a fila; o usuário só nasce quando o admin APROVA (na server action).
CREATE OR REPLACE FUNCTION public.solicitar_acesso(p_email text, p_nome text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email text := lower(trim(p_email));
BEGIN
  IF v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'E-mail inválido.');
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
$$;
REVOKE EXECUTE ON FUNCTION public.solicitar_acesso(text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.solicitar_acesso(text, text) TO anon, authenticated, service_role;

-- ── 7. admin_listar_solicitacoes ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_listar_solicitacoes()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['admin/acessos']);
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id', s.id, 'email', s.email, 'nome', s.nome, 'status', s.status,
      'criado_em', s.criado_em, 'decidido_em', s.decidido_em
    ) ORDER BY (s.status = 'pendente') DESC, s.criado_em DESC)
    FROM app.rbac_solicitacoes s
  ), '[]'::jsonb);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_listar_solicitacoes() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_listar_solicitacoes() TO authenticated, service_role;

-- ── 8. admin_decidir_solicitacao: muda status (a criação do usuário, quando
-- aprovada, é feita na server action com service role). Idempotente p/ pendente.
CREATE OR REPLACE FUNCTION public.admin_decidir_solicitacao(p_id bigint, p_aprovar boolean, p_obs text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email text;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['admin/acessos']);
  UPDATE app.rbac_solicitacoes
     SET status       = CASE WHEN p_aprovar THEN 'aprovada' ELSE 'rejeitada' END,
         decidido_em  = now(),
         decidido_por = auth.uid(),
         observacao   = nullif(trim(coalesce(p_obs, '')), '')
   WHERE id = p_id AND status = 'pendente'
   RETURNING email INTO v_email;
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'SOLICITACAO_INEXISTENTE_OU_DECIDIDA' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object('ok', true, 'email', v_email);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_decidir_solicitacao(bigint, boolean, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_decidir_solicitacao(bigint, boolean, text) TO authenticated, service_role;

-- ── 9. Seed: role "Administrador" (todas as áreas) + vincular yan ────────────
DO $$
DECLARE
  v_id bigint;
BEGIN
  INSERT INTO app.rbac_roles (nome, descricao)
  VALUES ('Administrador', 'Acesso total + administração de usuários, roles e solicitações de acesso')
  ON CONFLICT (nome) DO NOTHING;

  SELECT id INTO v_id FROM app.rbac_roles WHERE nome = 'Administrador';

  INSERT INTO app.rbac_role_permissoes (role_id, area)
  SELECT v_id, area FROM app.rbac_areas
  ON CONFLICT DO NOTHING;

  UPDATE app.rbac_usuarios SET role_id = v_id, atualizado_em = now()
  WHERE lower(email) = 'yan@welcometrips.com.br';
END;
$$;

NOTIFY pgrst, 'reload schema';
