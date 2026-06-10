-- ---------------------------------------------------------------------------
-- 0119 — feat(v4.13/M1): núcleo do RBAC dinâmico (ADR-0107) + guard central
-- (ADR-0108) + RPCs de administração com anti-lockout.
--
-- Aditiva e retrocompatível (S5): nada aqui altera comportamento da main.
-- As tabelas legadas da v4-1 (app.usuarios, app.convites) ficam INTOCADAS
-- (vazias; trancadas por RLS na 0120). O modelo novo usa prefixo rbac_.
-- ---------------------------------------------------------------------------

-- ── 1. Catálogo de áreas (unidade de permissão; espelhado em src/lib/auth/areas.ts)
CREATE TABLE app.rbac_areas (
  area   text PRIMARY KEY,
  rotulo text NOT NULL,
  grupo  text NOT NULL,
  ordem  int  NOT NULL
);

INSERT INTO app.rbac_areas (area, rotulo, grupo, ordem) VALUES
  ('executiva',                'Executiva',                'Geral',       10),
  ('performance',              'Performance — Geral',      'Performance', 20),
  ('performance/trips',        'Performance — Trips',      'Performance', 21),
  ('performance/weddings',     'Performance — Weddings',   'Performance', 22),
  ('performance/corporativo',  'Performance — Corporativo','Performance', 23),
  ('financeiro/fluxo-caixa',   'Fluxo de Caixa',           'Financeiro',  30),
  ('financeiro/gerencial',     'Fluxo de Caixa Gerencial', 'Financeiro',  31),
  ('metas',                    'Metas',                    'Geral',       40),
  ('admin/uploads',            'Upload de Arquivos',       'Administração', 50),
  ('admin/design-system',      'Design System',            'Administração', 51),
  ('admin/acessos',            'Usuários & Acessos',       'Administração', 52);

-- ── 2. Roles dinâmicas e permissões
CREATE TABLE app.rbac_roles (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome          text NOT NULL UNIQUE,
  descricao     text,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app.rbac_role_permissoes (
  role_id bigint NOT NULL REFERENCES app.rbac_roles(id) ON DELETE CASCADE,
  area    text   NOT NULL REFERENCES app.rbac_areas(area) ON UPDATE CASCADE,
  PRIMARY KEY (role_id, area)
);

CREATE TABLE app.rbac_usuarios (
  user_id       uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email         text NOT NULL UNIQUE,
  nome          text,
  role_id       bigint REFERENCES app.rbac_roles(id),
  ativo         boolean NOT NULL DEFAULT true,
  convidado_por uuid,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_rbac_usuarios_role ON app.rbac_usuarios(role_id);
CREATE INDEX idx_rbac_role_permissoes_area ON app.rbac_role_permissoes(area);

-- ── 3. Flag de enforcement (kill switch — ADR-0108) em app.config
INSERT INTO app.config (id, chave, valor, categoria, descricao)
SELECT (SELECT coalesce(max(id), 0) + 1 FROM app.config),
       'auth_enforcement', 'false'::jsonb, 'auth',
       'ON: acesso anônimo (sem JWT) negado em todas as RPCs guardadas. OFF: janela de compatibilidade pré-ativação (main sem auth segue funcionando). Emergência: voltar a false.'
ON CONFLICT (chave) DO NOTHING;

-- ── 4. Helpers de autorização (schema app; não expostos pela API)

CREATE OR REPLACE FUNCTION app.auth_enforcement_ativo()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce((SELECT valor::text = 'true' FROM app.config WHERE chave = 'auth_enforcement'), false)
      OR coalesce(current_setting('app.simular_enforcement', true), '') = 'on'
$$;

-- Setor (valor do banco: Weddings/Lazer/Corporativo/todos) → áreas que o liberam.
CREATE OR REPLACE FUNCTION app.areas_do_setor(p_setor text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE p_setor
    WHEN 'Weddings'    THEN ARRAY['performance/weddings']
    WHEN 'Lazer'       THEN ARRAY['performance/trips']
    WHEN 'Corporativo' THEN ARRAY['performance/corporativo']
    ELSE ARRAY['executiva', 'performance']   -- 'todos' e desconhecidos: agregados
  END
$$;

CREATE OR REPLACE FUNCTION app.permissoes_de(p_user uuid)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(array_agg(rp.area ORDER BY rp.area), '{}')
  FROM app.rbac_usuarios u
  JOIN app.rbac_role_permissoes rp ON rp.role_id = u.role_id
  WHERE u.user_id = p_user AND u.ativo
$$;

-- O guard central (ADR-0108). p_areas NULL = exige apenas login ativo.
-- Chamado por TODOS os wrappers de RPC de leitura (0121).
CREATE OR REPLACE FUNCTION app.exigir_acesso(p_areas text[] DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_claims text;
  v_role   text;
  v_uid    uuid;
BEGIN
  v_claims := nullif(current_setting('request.jwt.claims', true), '');

  -- Conexão direta (postgres / seed / supabase db query): sem contexto PostgREST.
  IF v_claims IS NULL THEN
    RETURN;
  END IF;

  v_role := v_claims::jsonb ->> 'role';
  IF v_role = 'service_role' THEN
    RETURN;
  END IF;

  v_uid := nullif(v_claims::jsonb ->> 'sub', '')::uuid;

  -- Anônimo: janela de compatibilidade enquanto o enforcement está OFF (S5).
  IF v_uid IS NULL THEN
    IF app.auth_enforcement_ativo() THEN
      RAISE EXCEPTION 'AUTH_NECESSARIA: acesso anônimo desativado'
        USING ERRCODE = '42501';
    END IF;
    RETURN;
  END IF;

  -- Usuário autenticado: SEMPRE validado (flag ligada ou não).
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
$$;

-- ── 5. RPCs expostas (schema public)

-- Identidade + permissões do usuário logado (sidebar, guards do app).
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
    RETURN jsonb_build_object('registrado', false, 'ativo', false, 'permissoes', '[]'::jsonb);
  END IF;

  SELECT u.user_id, u.email, u.nome, u.ativo, u.role_id, r.nome AS role_nome
    INTO v_row
  FROM app.rbac_usuarios u
  LEFT JOIN app.rbac_roles r ON r.id = u.role_id
  WHERE u.user_id = v_uid;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('registrado', false, 'ativo', false, 'permissoes', '[]'::jsonb);
  END IF;

  RETURN jsonb_build_object(
    'registrado', true,
    'user_id',    v_row.user_id,
    'email',      v_row.email,
    'nome',       v_row.nome,
    'ativo',      v_row.ativo,
    'role_id',    v_row.role_id,
    'role',       v_row.role_nome,
    'permissoes', CASE WHEN v_row.ativo THEN to_jsonb(app.permissoes_de(v_uid)) ELSE '[]'::jsonb END
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_minhas_permissoes() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_minhas_permissoes() TO authenticated, service_role;

-- Testa o caminho NEGADO do guard sem ligar a flag global (S11): força o
-- enforcement via GUC local da transação e roda o guard. Não lê dado algum.
CREATE OR REPLACE FUNCTION public.rbac_verificar_guard(p_area text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM set_config('app.simular_enforcement', 'on', true);
  PERFORM app.exigir_acesso(CASE WHEN p_area IS NULL THEN NULL ELSE ARRAY[p_area] END);
  RETURN 'ACESSO_PERMITIDO';
END;
$$;
REVOKE EXECUTE ON FUNCTION public.rbac_verificar_guard(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rbac_verificar_guard(text) TO anon, authenticated, service_role;

-- ── 6. RPCs de administração (todas exigem admin/acessos; anti-lockout embutido)

CREATE OR REPLACE FUNCTION public.admin_listar_areas()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['admin/acessos']);
  RETURN (
    SELECT jsonb_agg(jsonb_build_object('area', area, 'rotulo', rotulo, 'grupo', grupo, 'ordem', ordem) ORDER BY ordem)
    FROM app.rbac_areas
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_listar_areas() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_listar_areas() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_listar_roles()
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
      'id', r.id, 'nome', r.nome, 'descricao', r.descricao,
      'permissoes', coalesce((SELECT jsonb_agg(rp.area ORDER BY rp.area) FROM app.rbac_role_permissoes rp WHERE rp.role_id = r.id), '[]'::jsonb),
      'n_usuarios', (SELECT count(*) FROM app.rbac_usuarios u WHERE u.role_id = r.id)
    ) ORDER BY r.nome)
    FROM app.rbac_roles r
  ), '[]'::jsonb);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_listar_roles() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_listar_roles() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_listar_usuarios()
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
      'user_id', u.user_id, 'email', u.email, 'nome', u.nome,
      'role_id', u.role_id, 'role', r.nome, 'ativo', u.ativo,
      'criado_em', u.criado_em,
      'ultimo_login', au.last_sign_in_at,
      'convite_pendente', (au.last_sign_in_at IS NULL)
    ) ORDER BY u.email)
    FROM app.rbac_usuarios u
    LEFT JOIN app.rbac_roles r ON r.id = u.role_id
    LEFT JOIN auth.users au ON au.id = u.user_id
  ), '[]'::jsonb);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_listar_usuarios() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_listar_usuarios() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_criar_role(p_nome text, p_descricao text, p_permissoes text[])
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id bigint;
  v_invalidas text[];
BEGIN
  PERFORM app.exigir_acesso(ARRAY['admin/acessos']);
  IF coalesce(trim(p_nome), '') = '' THEN
    RAISE EXCEPTION 'NOME_OBRIGATORIO' USING ERRCODE = '22023';
  END IF;
  SELECT array_agg(a) INTO v_invalidas
  FROM unnest(coalesce(p_permissoes, '{}')) a
  WHERE NOT EXISTS (SELECT 1 FROM app.rbac_areas ra WHERE ra.area = a);
  IF v_invalidas IS NOT NULL THEN
    RAISE EXCEPTION 'AREAS_INVALIDAS: %', array_to_string(v_invalidas, ', ') USING ERRCODE = '22023';
  END IF;

  INSERT INTO app.rbac_roles (nome, descricao) VALUES (trim(p_nome), nullif(trim(p_descricao), ''))
  RETURNING id INTO v_id;
  INSERT INTO app.rbac_role_permissoes (role_id, area)
  SELECT v_id, unnest(coalesce(p_permissoes, '{}'));

  RETURN jsonb_build_object('id', v_id);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_criar_role(text, text, text[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_criar_role(text, text, text[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_atualizar_role(p_role_id bigint, p_nome text, p_descricao text, p_permissoes text[])
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_invalidas text[];
BEGIN
  PERFORM app.exigir_acesso(ARRAY['admin/acessos']);
  v_uid := auth.uid();

  IF NOT EXISTS (SELECT 1 FROM app.rbac_roles WHERE id = p_role_id) THEN
    RAISE EXCEPTION 'ROLE_INEXISTENTE' USING ERRCODE = '22023';
  END IF;
  SELECT array_agg(a) INTO v_invalidas
  FROM unnest(coalesce(p_permissoes, '{}')) a
  WHERE NOT EXISTS (SELECT 1 FROM app.rbac_areas ra WHERE ra.area = a);
  IF v_invalidas IS NOT NULL THEN
    RAISE EXCEPTION 'AREAS_INVALIDAS: %', array_to_string(v_invalidas, ', ') USING ERRCODE = '22023';
  END IF;

  -- Anti-lockout (S3): quem edita a PRÓPRIA role não pode remover admin/acessos dela.
  IF v_uid IS NOT NULL
     AND EXISTS (SELECT 1 FROM app.rbac_usuarios u WHERE u.user_id = v_uid AND u.role_id = p_role_id)
     AND NOT ('admin/acessos' = ANY (coalesce(p_permissoes, '{}'))) THEN
    RAISE EXCEPTION 'ANTI_LOCKOUT: você não pode remover admin/acessos da sua própria role'
      USING ERRCODE = '42501';
  END IF;

  UPDATE app.rbac_roles
     SET nome = coalesce(nullif(trim(p_nome), ''), nome),
         descricao = nullif(trim(coalesce(p_descricao, '')), ''),
         atualizado_em = now()
   WHERE id = p_role_id;

  DELETE FROM app.rbac_role_permissoes WHERE role_id = p_role_id;
  INSERT INTO app.rbac_role_permissoes (role_id, area)
  SELECT p_role_id, unnest(coalesce(p_permissoes, '{}'));

  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_atualizar_role(bigint, text, text, text[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_atualizar_role(bigint, text, text, text[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_excluir_role(p_role_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_n int;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['admin/acessos']);
  SELECT count(*) INTO v_n FROM app.rbac_usuarios WHERE role_id = p_role_id;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'ROLE_EM_USO: % usuário(s) com esta role', v_n USING ERRCODE = '22023';
  END IF;
  DELETE FROM app.rbac_roles WHERE id = p_role_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_excluir_role(bigint) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_excluir_role(bigint) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_atribuir_role(p_user_id uuid, p_role_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['admin/acessos']);
  v_uid := auth.uid();

  IF NOT EXISTS (SELECT 1 FROM app.rbac_roles WHERE id = p_role_id) THEN
    RAISE EXCEPTION 'ROLE_INEXISTENTE' USING ERRCODE = '22023';
  END IF;

  -- Anti-lockout (S3): não pode trocar a PRÓPRIA role para uma sem admin/acessos.
  IF v_uid IS NOT NULL AND p_user_id = v_uid
     AND NOT EXISTS (SELECT 1 FROM app.rbac_role_permissoes WHERE role_id = p_role_id AND area = 'admin/acessos') THEN
    RAISE EXCEPTION 'ANTI_LOCKOUT: você não pode tirar de si mesmo o acesso de administração'
      USING ERRCODE = '42501';
  END IF;

  UPDATE app.rbac_usuarios SET role_id = p_role_id, atualizado_em = now() WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'USUARIO_INEXISTENTE' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_atribuir_role(uuid, bigint) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_atribuir_role(uuid, bigint) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_definir_usuario_ativo(p_user_id uuid, p_ativo boolean)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['admin/acessos']);
  v_uid := auth.uid();

  -- Anti-lockout (S3): não pode desativar a si mesmo.
  IF v_uid IS NOT NULL AND p_user_id = v_uid AND NOT p_ativo THEN
    RAISE EXCEPTION 'ANTI_LOCKOUT: você não pode desativar a si mesmo' USING ERRCODE = '42501';
  END IF;

  UPDATE app.rbac_usuarios SET ativo = p_ativo, atualizado_em = now() WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'USUARIO_INEXISTENTE' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_definir_usuario_ativo(uuid, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_definir_usuario_ativo(uuid, boolean) TO authenticated, service_role;

-- Registra (ou re-registra) o vínculo RBAC de um usuário convidado. Chamada pelo
-- fluxo de convite DEPOIS do auth.admin.inviteUserByEmail/createUser.
CREATE OR REPLACE FUNCTION public.admin_registrar_usuario(p_user_id uuid, p_email text, p_nome text, p_role_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['admin/acessos']);
  IF NOT EXISTS (SELECT 1 FROM app.rbac_roles WHERE id = p_role_id) THEN
    RAISE EXCEPTION 'ROLE_INEXISTENTE' USING ERRCODE = '22023';
  END IF;
  INSERT INTO app.rbac_usuarios (user_id, email, nome, role_id, convidado_por)
  VALUES (p_user_id, lower(trim(p_email)), nullif(trim(coalesce(p_nome, '')), ''), p_role_id, auth.uid())
  ON CONFLICT (user_id) DO UPDATE
    SET email = excluded.email,
        nome = coalesce(excluded.nome, app.rbac_usuarios.nome),
        role_id = excluded.role_id,
        ativo = true,
        atualizado_em = now();
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_registrar_usuario(uuid, text, text, bigint) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_registrar_usuario(uuid, text, text, bigint) TO authenticated, service_role;

-- Liga/desliga o enforcement global (ADR-0108). Também operável por SQL direto
-- em emergência (runbook S3).
CREATE OR REPLACE FUNCTION public.admin_set_enforcement(p_ativo boolean)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['admin/acessos']);
  UPDATE app.config
     SET valor = to_jsonb(p_ativo), atualizado_em = now(),
         atualizado_por = coalesce(auth.uid()::text, 'sql-direto')
   WHERE chave = 'auth_enforcement';
  RETURN jsonb_build_object('ok', true, 'auth_enforcement', p_ativo);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_set_enforcement(boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_set_enforcement(boolean) TO authenticated, service_role;

-- ── 7. Seed: role Financeiro (acesso total) + vínculo do usuário existente
DO $$
DECLARE
  v_role_id bigint;
BEGIN
  INSERT INTO app.rbac_roles (nome, descricao)
  VALUES ('Financeiro', 'Acesso total: todas as áreas e administração de usuários e roles')
  RETURNING id INTO v_role_id;

  INSERT INTO app.rbac_role_permissoes (role_id, area)
  SELECT v_role_id, area FROM app.rbac_areas;

  -- yan@ já existe em auth.users (desde mai/2026); vincula com segurança.
  INSERT INTO app.rbac_usuarios (user_id, email, nome, role_id)
  SELECT u.id, lower(u.email), 'Yan', v_role_id
  FROM auth.users u
  WHERE lower(u.email) = 'yan@welcometrips.com.br'
  ON CONFLICT (user_id) DO UPDATE SET role_id = excluded.role_id, ativo = true;
END;
$$;
NOTIFY pgrst, 'reload schema';
