-- ---------------------------------------------------------------------------
-- 0289 — feat(v6.1.1/M3): área RBAC própria `api-externa` para a gestão da API externa
--        (chaves — inclusive as das RPAs —, log de chave e config de tipo exposto)
--
-- Classificação: ADITIVA (2 INSERT idempotentes + 9 CREATE OR REPLACE de mesma assinatura +
-- REVOKE/GRANT redeclarados).
--
-- DECLARAÇÃO PRÉVIA (regime aditivo / autônomo):
--   • O QUE FAZ:
--     (1) INSERT da área `api-externa` em app.rbac_areas (grupo 'Administração', ordem 56 — livre,
--         conferido no banco em 01/10/2026) — ON CONFLICT DO NOTHING;
--     (2) concede `api-externa` a TODA role que hoje tem `solicitacoes`, EXCETO a role de máquina
--         roles de máquina ('Máquina · %', critério da 0273 — hoje só 'Máquina · verificação' tem
--         `solicitacoes`) (a área é do grupo 'Administração', e rpc-contrato.test.ts exige
--         que essa role tenha exatamente as áreas fora da Administração). Em 01/10/2026: roles
--         'Administrador' e 'Financeiro'. ON CONFLICT DO NOTHING — idempotente, pode ser re-rodado;
--     (3) CREATE OR REPLACE das 9 funções da tela /admin/api-externa com o corpo do catálogo VIVO
--         (pg_get_functiondef em 01/10/2026), trocando SÓ a linha do `app.exigir_acesso`:
--         • 7 exclusivas da API externa (api_chave_listar, api_chave_registrar ×2 — inclusive a
--           sobrecarga legada de 3 args, que segue chamável por REST —, api_chave_revogar,
--           api_log_listar, api_robo_registrar, admin_solic_tipo_api_config):
--           ARRAY['solicitacoes'] → ARRAY['api-externa'];
--         • admin_solic_listar_tipos (COMPARTILHADA com Gerenciar solicitações):
--           ARRAY['solicitacoes'] → ARRAY['solicitacoes', 'api-externa'];
--         • solic_tipos_documentacao (só a página de Documentação):
--           ARRAY['solicitacoes', 'solicitacoes/documentacao'] → ARRAY['api-externa', 'solicitacoes/documentacao'].
--   • POR QUE: decisão do Yan (01/10/2026) — a API deixou de ser só de Solicitações (desde a v6.1.0
--     ela emite as chaves das RPAs de ingestão), então ganha seção própria na sidebar e área própria.
--     A área `solicitacoes/documentacao` continua liberando SÓ a documentação (leitor/integrador).
--   • COMPATÍVEL nos dois sentidos (aplicar ANTES do merge):
--     – código v6.1.0 em produção (guards `solicitacoes`): todo usuário que passa o guard antigo tem
--       role com `solicitacoes`, que recebeu `api-externa` no passo (2) ⇒ as RPCs continuam aceitando.
--       Única brecha: role que ganhar `solicitacoes` pelo editor ENTRE a aplicação e o deploy — o
--       passo (2) é idempotente e pode ser re-rodado no fechamento;
--     – código v6.1.1 (guards `api-externa`): mesma coisa, pelo mesmo backfill.
--   • SEGURANÇA: dono/SECURITY DEFINER/search_path '' /volatilidade/COMMENT preservados pelo REPLACE
--     (mesma assinatura); ACL viva redeclarada (authenticated + service_role; + verificador nas duas
--     compartilhadas que ele já tinha — admin_solic_listar_tipos e solic_tipos_documentacao).
--     Nenhuma função do caminho da própria API (autenticado por chave) é tocada.
--   • NÃO FAZ: nenhum DROP, nenhum UPDATE/DELETE de dado existente; database.ts não muda (assinaturas
--     iguais).
--
-- DOWN: reaplicar os corpos com os arrays antigos (linhas "antes:" abaixo) e
--   DELETE FROM app.rbac_role_permissoes WHERE area = 'api-externa';
--   DELETE FROM app.rbac_areas WHERE area = 'api-externa';   (destrutivos — humano em TTY)
-- ---------------------------------------------------------------------------

BEGIN;

-- (1) Área nova. Paridade exata com AREAS em src/lib/auth/areas.ts (rpc-contrato.test.ts).
INSERT INTO app.rbac_areas (area, rotulo, grupo, ordem) VALUES
  ('api-externa', 'API Externa', 'Administração', 56)
ON CONFLICT (area) DO NOTHING;

-- (2) Ninguém perde acesso no deploy: quem gere a API hoje (via `solicitacoes`) recebe a área nova.
INSERT INTO app.rbac_role_permissoes (role_id, area)
SELECT DISTINCT rp.role_id, 'api-externa'
  FROM app.rbac_role_permissoes rp
  JOIN app.rbac_roles r ON r.id = rp.role_id
 WHERE rp.area = 'solicitacoes'
   AND r.nome NOT LIKE 'Máquina · %'   -- mesmo critério da 0273 para "role de máquina"
ON CONFLICT (role_id, area) DO NOTHING;

-- (3) Funções — corpo do catálogo vivo; só a linha do exigir_acesso muda.

-- public.api_chave_listar()
--   antes: PERFORM app.exigir_acesso(ARRAY['solicitacoes']);
--   agora: PERFORM app.exigir_acesso(ARRAY['api-externa']);
CREATE OR REPLACE FUNCTION public.api_chave_listar()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['api-externa']);
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id',                 c.id,
      'plataforma',         c.plataforma,
      'robo', jsonb_build_object(
        'user_id', u.user_id, 'email', u.email, 'nome', u.nome
      ),
      'ativo',             c.ativo,
      'criado_em',         c.criado_em,
      'revogado_em',       c.revogado_em,
      'ultima_chamada_em', (SELECT max(l.criado_em) FROM app.api_chamada_log l WHERE l.chave_id = c.id),
      'escopo_bases',      to_jsonb(c.escopo_bases)
    ) ORDER BY c.criado_em DESC)
    FROM app.api_chave c
    JOIN app.rbac_usuarios u ON u.user_id = c.robo_user_id
  ), '[]'::jsonb);
END;
$function$;

REVOKE ALL ON FUNCTION public.api_chave_listar() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.api_chave_listar() TO authenticated, service_role;

-- public.api_chave_registrar(text, text, uuid, text[])
--   antes: PERFORM app.exigir_acesso(ARRAY['solicitacoes']);
--   agora: PERFORM app.exigir_acesso(ARRAY['api-externa']);
CREATE OR REPLACE FUNCTION public.api_chave_registrar(p_plataforma text, p_segredo_hash text, p_robo_user_id uuid, p_escopo_bases text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_plataforma text   := btrim(coalesce(p_plataforma, ''));
  v_escopo     text[] := (SELECT coalesce(array_agg(DISTINCT b ORDER BY b), '{}'::text[])
                            FROM unnest(coalesce(p_escopo_bases, '{}'::text[])) b);
  v_id         bigint;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['api-externa']);

  IF v_plataforma = '' THEN
    RAISE EXCEPTION 'PLATAFORMA_OBRIGATORIA: informe a referência da integração' USING ERRCODE = '22023';
  END IF;
  IF coalesce(btrim(p_segredo_hash), '') = '' THEN
    RAISE EXCEPTION 'SEGREDO_OBRIGATORIO: segredo ausente' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM app.api_chave WHERE plataforma = v_plataforma) THEN
    RAISE EXCEPTION 'PLATAFORMA_EM_USO: já existe uma chave com esta referência' USING ERRCODE = '22023';
  END IF;
  -- Escopo fora do contrato falharia no CHECK; aqui o erro ganha nome e diz QUAL base.
  IF NOT (v_escopo <@ ARRAY['demonstrativo-competencia','vendas-produto','lancamentos-movimentacao',
                             'lancamentos-aberto','lancamentos-operacao']::text[]) THEN
    RAISE EXCEPTION 'ESCOPO_INVALIDO: base desconhecida em % (contrato ingestao-v1 §3)', v_escopo
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO app.api_chave (plataforma, segredo_hash, robo_user_id, criado_por, escopo_bases)
  VALUES (v_plataforma, p_segredo_hash, p_robo_user_id, app.uid_jwt(), v_escopo)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'escopo_bases', to_jsonb(v_escopo));
END;
$function$;

REVOKE ALL ON FUNCTION public.api_chave_registrar(text, text, uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.api_chave_registrar(text, text, uuid, text[]) TO authenticated, service_role;

-- public.api_chave_registrar(text, text, uuid)
--   antes: PERFORM app.exigir_acesso(ARRAY['solicitacoes']);
--   agora: PERFORM app.exigir_acesso(ARRAY['api-externa']);
CREATE OR REPLACE FUNCTION public.api_chave_registrar(p_plataforma text, p_segredo_hash text, p_robo_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_plataforma text := btrim(coalesce(p_plataforma, ''));
  v_id         bigint;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['api-externa']);

  IF v_plataforma = '' THEN
    RAISE EXCEPTION 'PLATAFORMA_OBRIGATORIA: informe a referência da integração' USING ERRCODE = '22023';
  END IF;
  IF coalesce(btrim(p_segredo_hash), '') = '' THEN
    RAISE EXCEPTION 'SEGREDO_OBRIGATORIO: segredo ausente' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM app.api_chave WHERE plataforma = v_plataforma) THEN
    RAISE EXCEPTION 'PLATAFORMA_EM_USO: já existe uma chave com esta referência' USING ERRCODE = '22023';
  END IF;

  -- A validação de tipos saiu com a whitelist (Round6): não há mais lista a validar.
  INSERT INTO app.api_chave (plataforma, segredo_hash, robo_user_id, criado_por)
  VALUES (v_plataforma, p_segredo_hash, p_robo_user_id, app.uid_jwt())
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.api_chave_registrar(text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.api_chave_registrar(text, text, uuid) TO authenticated, service_role;

-- public.api_chave_revogar(bigint)
--   antes: PERFORM app.exigir_acesso(ARRAY['solicitacoes']);
--   agora: PERFORM app.exigir_acesso(ARRAY['api-externa']);
CREATE OR REPLACE FUNCTION public.api_chave_revogar(p_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_ativo boolean;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['api-externa']);

  SELECT ativo INTO v_ativo FROM app.api_chave WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NAO_ENCONTRADA: chave inexistente' USING ERRCODE = '22023';
  END IF;
  IF NOT v_ativo THEN
    RAISE EXCEPTION 'JA_REVOGADA: esta chave já está revogada' USING ERRCODE = '22023';
  END IF;

  UPDATE app.api_chave
     SET ativo = false, revogado_em = now(), revogado_por = app.uid_jwt()
   WHERE id = p_id;

  RETURN jsonb_build_object('ok', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.api_chave_revogar(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.api_chave_revogar(bigint) TO authenticated, service_role;

-- public.api_log_listar(bigint, integer)
--   antes: PERFORM app.exigir_acesso(ARRAY['solicitacoes']);
--   agora: PERFORM app.exigir_acesso(ARRAY['api-externa']);
CREATE OR REPLACE FUNCTION public.api_log_listar(p_chave_id bigint, p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['api-externa']);
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'rota', l.rota, 'status', l.status, 'detalhe', l.detalhe, 'criado_em', l.criado_em
    ) ORDER BY l.criado_em DESC)
    FROM (
      SELECT rota, status, detalhe, criado_em
      FROM app.api_chamada_log
      WHERE chave_id = p_chave_id
      ORDER BY criado_em DESC
      LIMIT least(greatest(coalesce(p_limit, 50), 1), 200)
    ) l
  ), '[]'::jsonb);
END;
$function$;

REVOKE ALL ON FUNCTION public.api_log_listar(bigint, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.api_log_listar(bigint, integer) TO authenticated, service_role;

-- public.api_robo_registrar(uuid, text, text)
--   antes: PERFORM app.exigir_acesso(ARRAY['solicitacoes']);
--   agora: PERFORM app.exigir_acesso(ARRAY['api-externa']);
CREATE OR REPLACE FUNCTION public.api_robo_registrar(p_user_id uuid, p_email text, p_nome text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_email text := lower(btrim(coalesce(p_email, '')));
BEGIN
  PERFORM app.exigir_acesso(ARRAY['api-externa']);
  IF v_email = '' THEN
    RAISE EXCEPTION 'EMAIL_OBRIGATORIO: informe o e-mail do robô' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM app.rbac_usuarios WHERE email = v_email) THEN
    RAISE EXCEPTION 'EMAIL_EM_USO: já existe um usuário com este e-mail' USING ERRCODE = '22023';
  END IF;

  INSERT INTO app.rbac_usuarios (user_id, email, nome, role_id, ativo, precisa_trocar_senha, convidado_por)
  VALUES (p_user_id, v_email, nullif(btrim(coalesce(p_nome, '')), ''), NULL, false, false, auth.uid());

  RETURN jsonb_build_object('ok', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.api_robo_registrar(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.api_robo_registrar(uuid, text, text) TO authenticated, service_role;

-- public.admin_solic_tipo_api_config(bigint, boolean)
--   antes: PERFORM app.exigir_acesso(ARRAY['solicitacoes']);
--   agora: PERFORM app.exigir_acesso(ARRAY['api-externa']);
CREATE OR REPLACE FUNCTION public.admin_solic_tipo_api_config(p_tipo_id bigint, p_exposto boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['api-externa']);

  IF NOT EXISTS (SELECT 1 FROM app.solicitacao_tipo WHERE id = p_tipo_id) THEN
    RAISE EXCEPTION 'TIPO_INEXISTENTE' USING ERRCODE = '22023';
  END IF;

  UPDATE app.solicitacao_tipo
     SET exposto_via_api = coalesce(p_exposto, false),
         atualizado_em   = now()
   WHERE id = p_tipo_id;

  RETURN jsonb_build_object('ok', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_solic_tipo_api_config(bigint, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_solic_tipo_api_config(bigint, boolean) TO authenticated, service_role;

-- public.admin_solic_listar_tipos()
--   antes: PERFORM app.exigir_acesso(ARRAY['solicitacoes']);
--   agora: PERFORM app.exigir_acesso(ARRAY['solicitacoes', 'api-externa']);
CREATE OR REPLACE FUNCTION public.admin_solic_listar_tipos()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['solicitacoes', 'api-externa']);
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object(
    'id', t.id, 'nome', t.nome, 'arquivado', t.arquivado,
    'slug', t.slug,
    'exposto_via_api', t.exposto_via_api,
    'n_campos', (SELECT count(*) FROM app.solicitacao_campo c WHERE c.tipo_id = t.id),
    'n_solicitacoes', (SELECT count(*) FROM app.solicitacao s WHERE s.tipo_id = t.id),
    'campos', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id',c.id,'rotulo',c.rotulo,'tipo_campo',c.tipo_campo,'obrigatorio',c.obrigatorio,'opcoes',c.opcoes,'ordem',c.ordem,
        'data_permite_passado',c.data_permite_passado,'data_aviso_dias_futuro',c.data_aviso_dias_futuro,
        'data_aviso_direcao',c.data_aviso_direcao,'chave',c.chave) ORDER BY c.ordem)
      FROM app.solicitacao_campo c WHERE c.tipo_id = t.id), '[]'::jsonb)
  ) ORDER BY t.arquivado, t.nome) FROM app.solicitacao_tipo t), '[]'::jsonb);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_solic_listar_tipos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_solic_listar_tipos() TO authenticated, service_role, verificador;

-- public.solic_tipos_documentacao()
--   antes: PERFORM app.exigir_acesso(ARRAY['solicitacoes', 'solicitacoes/documentacao']);
--   agora: PERFORM app.exigir_acesso(ARRAY['api-externa', 'solicitacoes/documentacao']);
CREATE OR REPLACE FUNCTION public.solic_tipos_documentacao()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['api-externa', 'solicitacoes/documentacao']);
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object(
    'id', t.id, 'nome', t.nome, 'arquivado', t.arquivado,
    'slug', t.slug,
    'exposto_via_api', t.exposto_via_api,
    'n_campos', (SELECT count(*) FROM app.solicitacao_campo c WHERE c.tipo_id = t.id),
    'n_solicitacoes', (SELECT count(*) FROM app.solicitacao s WHERE s.tipo_id = t.id),
    'campos', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id',c.id,'rotulo',c.rotulo,'tipo_campo',c.tipo_campo,'obrigatorio',c.obrigatorio,'opcoes',c.opcoes,'ordem',c.ordem,
        'data_permite_passado',c.data_permite_passado,'data_aviso_dias_futuro',c.data_aviso_dias_futuro,
        'data_aviso_direcao',c.data_aviso_direcao,'chave',c.chave) ORDER BY c.ordem)
      FROM app.solicitacao_campo c WHERE c.tipo_id = t.id), '[]'::jsonb)
  ) ORDER BY t.nome)
  FROM app.solicitacao_tipo t
  WHERE t.exposto_via_api AND NOT t.arquivado), '[]'::jsonb);
END;
$function$;

REVOKE ALL ON FUNCTION public.solic_tipos_documentacao() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.solic_tipos_documentacao() TO authenticated, service_role, verificador;

-- (4) Guard de EFETIVIDADE (revisor-db M2): a transação inteira aborta se a intenção não se
-- cumpriu — sobrecarga nova criada por engano de assinatura, corpo sem a área nova, role de
-- máquina com a área, ou backfill que não alcançou ninguém.
DO $$
DECLARE
  v_sig  text;
  v_proc regprocedure;
  v_n    int;
BEGIN
  FOREACH v_sig IN ARRAY ARRAY[
    'public.api_chave_listar()',
    'public.api_chave_registrar(text, text, uuid, text[])',
    'public.api_chave_registrar(text, text, uuid)',
    'public.api_chave_revogar(bigint)',
    'public.api_log_listar(bigint, integer)',
    'public.api_robo_registrar(uuid, text, text)',
    'public.admin_solic_tipo_api_config(bigint, boolean)',
    'public.admin_solic_listar_tipos()',
    'public.solic_tipos_documentacao()'
  ] LOOP
    v_proc := to_regprocedure(v_sig);
    IF v_proc IS NULL THEN
      RAISE EXCEPTION '0289: função % não encontrada', v_sig;
    END IF;
    IF position('''api-externa''' IN (SELECT prosrc FROM pg_proc WHERE oid = v_proc)) = 0 THEN
      RAISE EXCEPTION '0289: corpo de % não exige api-externa', v_sig;
    END IF;
  END LOOP;

  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'api_chave_registrar';
  IF v_n <> 2 THEN
    RAISE EXCEPTION '0289: api_chave_registrar tem % sobrecargas (esperado 2)', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('api_chave_listar','api_chave_revogar','api_log_listar','api_robo_registrar',
                       'admin_solic_tipo_api_config','admin_solic_listar_tipos','solic_tipos_documentacao');
  IF v_n <> 7 THEN
    RAISE EXCEPTION '0289: % funções para 7 nomes de sobrecarga única (sobrecarga criada por engano?)', v_n;
  END IF;

  IF EXISTS (SELECT 1 FROM app.rbac_role_permissoes rp JOIN app.rbac_roles r ON r.id = rp.role_id
              WHERE rp.area = 'api-externa' AND r.nome LIKE 'Máquina · %') THEN
    RAISE EXCEPTION '0289: role de máquina recebeu api-externa';
  END IF;

  IF EXISTS (SELECT 1 FROM app.rbac_role_permissoes rp JOIN app.rbac_roles r ON r.id = rp.role_id
              WHERE rp.area = 'solicitacoes' AND r.nome NOT LIKE 'Máquina · %')
     AND NOT EXISTS (SELECT 1 FROM app.rbac_role_permissoes WHERE area = 'api-externa') THEN
    RAISE EXCEPTION '0289: backfill de api-externa não alcançou nenhuma role';
  END IF;
END
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
