-- ---------------------------------------------------------------------------
-- 0128 — feat(v4.16.0): Módulo de Solicitações — RPCs. ADR-0112.
--
-- Toda escrita/leitura passa por estas RPCs SECURITY DEFINER (tabelas 0127 são
-- RLS-fechadas). Padrão: exigir_acesso() no topo (login+ativo), depois a lógica de
-- ciclo de vida / visibilidade filtra por auth.uid() e pela área 'solicitacoes'.
-- O SERVIDOR é a fonte de verdade: validação dinâmica dos campos, XOR do destinatário
-- e transições ilegais são bloqueadas aqui, não só no cliente.
-- GRANT EXECUTE explícito (default privileges revogam anon/authenticated — 0122/0124).
-- ---------------------------------------------------------------------------

-- ── Helpers ───────────────────────────────────────────────────────────────────

-- uid do chamador a partir do JWT (NULL em conexão direta / service_role).
CREATE OR REPLACE FUNCTION app.uid_jwt()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid;
$$;

-- caller tem a área? (false se anônimo/sem role).
CREATE OR REPLACE FUNCTION app.tem_area(p_area text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM app.rbac_usuarios u
    JOIN app.rbac_role_permissoes rp ON rp.role_id = u.role_id
    WHERE u.user_id = app.uid_jwt() AND u.ativo AND rp.area = p_area
  );
$$;

-- role_id ativo do caller (NULL se sem cadastro ativo).
CREATE OR REPLACE FUNCTION app.minha_role_id()
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT role_id FROM app.rbac_usuarios WHERE user_id = app.uid_jwt() AND ativo;
$$;

-- caller pode VER a solicitação? solicitante OU atendente elegível OU gestão.
CREATE OR REPLACE FUNCTION app.pode_ver_solic(p_sol app.solicitacao)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT app.tem_area('solicitacoes')
      OR p_sol.solicitante_id = app.uid_jwt()
      OR p_sol.destinatario_user_id = app.uid_jwt()
      OR (p_sol.destinatario_role_id IS NOT NULL AND p_sol.destinatario_role_id = app.minha_role_id());
$$;

-- caller é atendente elegível (destinatário direto ou via role)?
CREATE OR REPLACE FUNCTION app.sou_atendente(p_sol app.solicitacao)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p_sol.destinatario_user_id = app.uid_jwt()
      OR (p_sol.destinatario_role_id IS NOT NULL AND p_sol.destinatario_role_id = app.minha_role_id());
$$;

-- resumo (rótulo→valor dos primeiros campos preenchidos) para listas/board.
CREATE OR REPLACE FUNCTION app.solic_json(p_sol app.solicitacao)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'id', p_sol.id,
    'tipo_id', p_sol.tipo_id,
    'tipo_nome', (SELECT nome FROM app.solicitacao_tipo WHERE id = p_sol.tipo_id),
    'solicitante_email', (SELECT email FROM app.rbac_usuarios WHERE user_id = p_sol.solicitante_id),
    'destinatario', CASE
      WHEN p_sol.destinatario_user_id IS NOT NULL
        THEN jsonb_build_object('tipo','usuario','rotulo',(SELECT email FROM app.rbac_usuarios WHERE user_id = p_sol.destinatario_user_id))
      ELSE jsonb_build_object('tipo','role','rotulo',(SELECT nome FROM app.rbac_roles WHERE id = p_sol.destinatario_role_id))
    END,
    'data_limite', p_sol.data_limite,
    'descricao', p_sol.descricao,
    'status', p_sol.status,
    'respostas', p_sol.respostas,
    'decidido_em', p_sol.decidido_em,
    'decidido_por_email', (SELECT email FROM app.rbac_usuarios WHERE user_id = p_sol.decidido_por),
    'justificativa', p_sol.justificativa,
    'criado_em', p_sol.criado_em,
    'anexos', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id',a.id,'campo_id',a.campo_id,'nome',a.nome_arquivo,'mime',a.mime,'tamanho',a.tamanho_bytes) ORDER BY a.id)
      FROM app.solicitacao_anexo a WHERE a.solicitacao_id = p_sol.id), '[]'::jsonb)
  );
$$;

REVOKE EXECUTE ON FUNCTION app.uid_jwt(), app.tem_area(text), app.minha_role_id(),
  app.pode_ver_solic(app.solicitacao), app.sou_atendente(app.solicitacao), app.solic_json(app.solicitacao)
  FROM PUBLIC;

-- ── Abertura: tipos e destinatários ───────────────────────────────────────────

-- Tipos NÃO arquivados + seus campos, para o modal de abertura (qualquer autenticado).
CREATE OR REPLACE FUNCTION public.solic_tipos_abertura()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app.exigir_acesso();
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id', t.id, 'nome', t.nome,
      'campos', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'id', c.id, 'rotulo', c.rotulo, 'tipo_campo', c.tipo_campo,
          'obrigatorio', c.obrigatorio, 'opcoes', c.opcoes) ORDER BY c.ordem)
        FROM app.solicitacao_campo c WHERE c.tipo_id = t.id), '[]'::jsonb)
    ) ORDER BY t.nome)
    FROM app.solicitacao_tipo t WHERE NOT t.arquivado), '[]'::jsonb);
END; $$;

-- Destinatários elegíveis: usuários ativos (e-mail) + roles (nome). PII: só e-mail.
CREATE OR REPLACE FUNCTION public.solic_destinatarios()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app.exigir_acesso();
  RETURN jsonb_build_object(
    'usuarios', coalesce((SELECT jsonb_agg(jsonb_build_object('user_id',user_id,'email',email) ORDER BY email)
                          FROM app.rbac_usuarios WHERE ativo), '[]'::jsonb),
    'roles',    coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'nome',nome) ORDER BY nome)
                          FROM app.rbac_roles), '[]'::jsonb)
  );
END; $$;

-- ── Criar solicitação (validação dinâmica server-side; XOR; snapshot imutável) ──
CREATE OR REPLACE FUNCTION public.criar_solicitacao(
  p_tipo_id bigint,
  p_destinatario_user_id uuid,
  p_destinatario_role_id bigint,
  p_data_limite date,
  p_descricao text,
  p_respostas jsonb,   -- objeto { "<campo_id>": valor }
  p_anexos jsonb       -- array [{campo_id, storage_path, nome_arquivo, mime, tamanho_bytes}]
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid    uuid;
  v_campo  record;
  v_val    text;
  v_snap   jsonb := '[]'::jsonb;
  v_id     bigint;
  v_anexo  jsonb;
  v_tem_anexo boolean;
BEGIN
  PERFORM app.exigir_acesso();
  v_uid := app.uid_jwt();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_NECESSARIA' USING ERRCODE='42501'; END IF;

  -- Tipo existe e não arquivado.
  IF NOT EXISTS (SELECT 1 FROM app.solicitacao_tipo WHERE id = p_tipo_id AND NOT arquivado) THEN
    RAISE EXCEPTION 'TIPO_INVALIDO: tipo inexistente ou arquivado' USING ERRCODE='22023';
  END IF;

  -- XOR destinatário + alvo válido/ativo.
  IF (p_destinatario_user_id IS NOT NULL)::int + (p_destinatario_role_id IS NOT NULL)::int <> 1 THEN
    RAISE EXCEPTION 'DESTINATARIO_XOR: informe exatamente um usuário OU uma permissão' USING ERRCODE='22023';
  END IF;
  IF p_destinatario_user_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM app.rbac_usuarios WHERE user_id = p_destinatario_user_id AND ativo) THEN
    RAISE EXCEPTION 'DESTINATARIO_INVALIDO: usuário inexistente/inativo' USING ERRCODE='22023';
  END IF;
  IF p_destinatario_role_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM app.rbac_roles WHERE id = p_destinatario_role_id) THEN
    RAISE EXCEPTION 'DESTINATARIO_INVALIDO: permissão inexistente' USING ERRCODE='22023';
  END IF;
  IF p_data_limite IS NULL THEN
    RAISE EXCEPTION 'DATA_LIMITE_OBRIGATORIA' USING ERRCODE='22023';
  END IF;

  -- Validação dinâmica + snapshot (ordem do admin).
  FOR v_campo IN
    SELECT id, rotulo, tipo_campo, obrigatorio, opcoes, ordem
    FROM app.solicitacao_campo WHERE tipo_id = p_tipo_id ORDER BY ordem
  LOOP
    v_val := p_respostas ->> v_campo.id::text;
    v_tem_anexo := EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(p_anexos,'[]'::jsonb)) e
                           WHERE (e->>'campo_id')::bigint = v_campo.id);

    IF v_campo.tipo_campo = 'anexo' THEN
      IF v_campo.obrigatorio AND NOT v_tem_anexo THEN
        RAISE EXCEPTION 'CAMPO_OBRIGATORIO: %', v_campo.rotulo USING ERRCODE='22023';
      END IF;
    ELSE
      IF v_campo.obrigatorio AND (v_val IS NULL OR length(btrim(v_val)) = 0) THEN
        RAISE EXCEPTION 'CAMPO_OBRIGATORIO: %', v_campo.rotulo USING ERRCODE='22023';
      END IF;
      IF v_val IS NOT NULL AND length(btrim(v_val)) > 0 THEN
        IF v_campo.tipo_campo IN ('numero','moeda') AND v_val !~ '^-?[0-9]+([.,][0-9]+)?$' THEN
          RAISE EXCEPTION 'VALOR_INVALIDO: % deve ser numérico', v_campo.rotulo USING ERRCODE='22023';
        END IF;
        IF v_campo.tipo_campo = 'data' AND NOT (v_val ~ '^\d{4}-\d{2}-\d{2}$') THEN
          RAISE EXCEPTION 'VALOR_INVALIDO: % deve ser data (AAAA-MM-DD)', v_campo.rotulo USING ERRCODE='22023';
        END IF;
        IF v_campo.tipo_campo = 'selecao'
           AND NOT (v_campo.opcoes @> to_jsonb(v_val)) THEN
          RAISE EXCEPTION 'VALOR_INVALIDO: opção inexistente em %', v_campo.rotulo USING ERRCODE='22023';
        END IF;
      END IF;
    END IF;

    v_snap := v_snap || jsonb_build_object(
      'campo_id', v_campo.id, 'rotulo', v_campo.rotulo, 'tipo_campo', v_campo.tipo_campo,
      'obrigatorio', v_campo.obrigatorio, 'opcoes', v_campo.opcoes,
      'valor', CASE WHEN v_campo.tipo_campo='anexo' THEN NULL ELSE v_val END);
  END LOOP;

  INSERT INTO app.solicitacao (tipo_id, solicitante_id, destinatario_user_id, destinatario_role_id,
                               data_limite, descricao, respostas, status)
  VALUES (p_tipo_id, v_uid, p_destinatario_user_id, p_destinatario_role_id,
          p_data_limite, nullif(btrim(coalesce(p_descricao,'')), ''), v_snap, 'aberta')
  RETURNING id INTO v_id;

  -- Anexos (metadados; binário já no Storage via service role na action).
  FOR v_anexo IN SELECT * FROM jsonb_array_elements(coalesce(p_anexos,'[]'::jsonb))
  LOOP
    INSERT INTO app.solicitacao_anexo (solicitacao_id, campo_id, storage_path, nome_arquivo, mime, tamanho_bytes, criado_por)
    VALUES (v_id, nullif(v_anexo->>'campo_id','')::bigint, v_anexo->>'storage_path',
            v_anexo->>'nome_arquivo', v_anexo->>'mime', (v_anexo->>'tamanho_bytes')::bigint, v_uid);
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END; $$;

-- ── Transições de ciclo de vida (matriz §2.2; ilegais bloqueadas) ──────────────
CREATE OR REPLACE FUNCTION public.solic_concluir(p_id bigint)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_sol app.solicitacao;
BEGIN
  PERFORM app.exigir_acesso();
  SELECT * INTO v_sol FROM app.solicitacao WHERE id = p_id;
  IF NOT FOUND OR NOT app.pode_ver_solic(v_sol) THEN RAISE EXCEPTION 'NAO_ENCONTRADA' USING ERRCODE='42501'; END IF;
  IF v_sol.status <> 'aberta' THEN RAISE EXCEPTION 'TRANSICAO_ILEGAL: solicitação não está aberta' USING ERRCODE='22023'; END IF;
  IF NOT (app.sou_atendente(v_sol) OR v_sol.solicitante_id = app.uid_jwt()) THEN
    RAISE EXCEPTION 'PERMISSAO_NEGADA: só o atendente ou o solicitante pode concluir' USING ERRCODE='42501'; END IF;
  UPDATE app.solicitacao SET status='concluida', decidido_por=app.uid_jwt(), decidido_em=now() WHERE id=p_id;
  RETURN jsonb_build_object('ok', true);
END; $$;

CREATE OR REPLACE FUNCTION public.solic_rejeitar(p_id bigint, p_justificativa text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_sol app.solicitacao;
BEGIN
  PERFORM app.exigir_acesso();
  SELECT * INTO v_sol FROM app.solicitacao WHERE id = p_id;
  IF NOT FOUND OR NOT app.pode_ver_solic(v_sol) THEN RAISE EXCEPTION 'NAO_ENCONTRADA' USING ERRCODE='42501'; END IF;
  IF v_sol.status <> 'aberta' THEN RAISE EXCEPTION 'TRANSICAO_ILEGAL: solicitação não está aberta' USING ERRCODE='22023'; END IF;
  IF NOT app.sou_atendente(v_sol) THEN
    RAISE EXCEPTION 'PERMISSAO_NEGADA: só o atendente pode rejeitar' USING ERRCODE='42501'; END IF;
  IF p_justificativa IS NULL OR length(btrim(p_justificativa)) = 0 THEN
    RAISE EXCEPTION 'JUSTIFICATIVA_OBRIGATORIA' USING ERRCODE='22023'; END IF;
  UPDATE app.solicitacao SET status='rejeitada', justificativa=btrim(p_justificativa),
    decidido_por=app.uid_jwt(), decidido_em=now() WHERE id=p_id;
  RETURN jsonb_build_object('ok', true);
END; $$;

CREATE OR REPLACE FUNCTION public.solic_cancelar(p_id bigint)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_sol app.solicitacao;
BEGIN
  PERFORM app.exigir_acesso();
  SELECT * INTO v_sol FROM app.solicitacao WHERE id = p_id;
  IF NOT FOUND OR NOT app.pode_ver_solic(v_sol) THEN RAISE EXCEPTION 'NAO_ENCONTRADA' USING ERRCODE='42501'; END IF;
  IF v_sol.status <> 'aberta' THEN RAISE EXCEPTION 'TRANSICAO_ILEGAL: solicitação não está aberta' USING ERRCODE='22023'; END IF;
  IF v_sol.solicitante_id <> app.uid_jwt() THEN
    RAISE EXCEPTION 'PERMISSAO_NEGADA: só o solicitante pode cancelar' USING ERRCODE='42501'; END IF;
  UPDATE app.solicitacao SET status='cancelada', decidido_por=app.uid_jwt(), decidido_em=now() WHERE id=p_id;
  RETURN jsonb_build_object('ok', true);
END; $$;

-- ── Leitura: minhas, caixa de entrada/board, detalhe, contagem ─────────────────
CREATE OR REPLACE FUNCTION public.solic_minhas()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app.exigir_acesso();
  RETURN coalesce((SELECT jsonb_agg(app.solic_json(s) ORDER BY s.criado_em DESC)
    FROM app.solicitacao s WHERE s.solicitante_id = app.uid_jwt()), '[]'::jsonb);
END; $$;

-- p_escopo: 'mim_e_role' (padrão) | 'so_mim' | 'todas' (requer área solicitacoes).
CREATE OR REPLACE FUNCTION public.solic_caixa(p_escopo text DEFAULT 'mim_e_role')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_uid uuid; v_role bigint;
BEGIN
  PERFORM app.exigir_acesso();
  v_uid := app.uid_jwt(); v_role := app.minha_role_id();
  IF p_escopo = 'todas' AND NOT app.tem_area('solicitacoes') THEN
    RAISE EXCEPTION 'PERMISSAO_NEGADA: visão de gestão requer a área solicitacoes' USING ERRCODE='42501';
  END IF;
  RETURN coalesce((SELECT jsonb_agg(app.solic_json(s) ORDER BY s.data_limite ASC, s.criado_em ASC)
    FROM app.solicitacao s
    WHERE CASE
      WHEN p_escopo = 'todas'   THEN true
      WHEN p_escopo = 'so_mim'  THEN s.destinatario_user_id = v_uid
      ELSE s.destinatario_user_id = v_uid OR (s.destinatario_role_id IS NOT NULL AND s.destinatario_role_id = v_role)
    END), '[]'::jsonb);
END; $$;

CREATE OR REPLACE FUNCTION public.solic_detalhe(p_id bigint)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_sol app.solicitacao;
BEGIN
  PERFORM app.exigir_acesso();
  SELECT * INTO v_sol FROM app.solicitacao WHERE id = p_id;
  IF NOT FOUND OR NOT app.pode_ver_solic(v_sol) THEN RAISE EXCEPTION 'NAO_ENCONTRADA' USING ERRCODE='42501'; END IF;
  RETURN app.solic_json(v_sol);
END; $$;

-- Contagem para o badge: abertas atribuídas a mim/minha role.
CREATE OR REPLACE FUNCTION public.solic_minhas_pendencias()
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT (SELECT count(*)::int FROM app.solicitacao s
          WHERE s.status = 'aberta'
            AND (s.destinatario_user_id = app.uid_jwt()
                 OR (s.destinatario_role_id IS NOT NULL AND s.destinatario_role_id = app.minha_role_id())));
$$;

-- Anexo: caminho assinável (a action gera a signed URL). Checa visibilidade.
CREATE OR REPLACE FUNCTION public.solic_anexo_path(p_anexo_id bigint)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_sol app.solicitacao; v_path text; v_solid bigint;
BEGIN
  PERFORM app.exigir_acesso();
  SELECT a.storage_path, a.solicitacao_id INTO v_path, v_solid
  FROM app.solicitacao_anexo a WHERE a.id = p_anexo_id;
  IF v_solid IS NULL THEN RAISE EXCEPTION 'NAO_ENCONTRADA' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_sol FROM app.solicitacao WHERE id = v_solid;
  IF NOT app.pode_ver_solic(v_sol) THEN RAISE EXCEPTION 'NAO_ENCONTRADA' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('storage_path', v_path);
END; $$;

-- ── Admin de tipos (área 'solicitacoes') ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_solic_listar_tipos()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['solicitacoes']);
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object(
    'id', t.id, 'nome', t.nome, 'arquivado', t.arquivado,
    'n_campos', (SELECT count(*) FROM app.solicitacao_campo c WHERE c.tipo_id = t.id),
    'n_solicitacoes', (SELECT count(*) FROM app.solicitacao s WHERE s.tipo_id = t.id),
    'campos', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id',c.id,'rotulo',c.rotulo,'tipo_campo',c.tipo_campo,'obrigatorio',c.obrigatorio,'opcoes',c.opcoes,'ordem',c.ordem) ORDER BY c.ordem)
      FROM app.solicitacao_campo c WHERE c.tipo_id = t.id), '[]'::jsonb)
  ) ORDER BY t.arquivado, t.nome) FROM app.solicitacao_tipo t), '[]'::jsonb);
END; $$;

-- Cria/edita tipo + REPLACE dos campos (não toca solicitações já abertas — snapshot).
CREATE OR REPLACE FUNCTION public.admin_solic_salvar_tipo(p_id bigint, p_nome text, p_campos jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_id bigint; v_campo jsonb; v_ordem int := 0; v_tc text;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['solicitacoes']);
  IF p_nome IS NULL OR length(btrim(p_nome)) = 0 THEN RAISE EXCEPTION 'NOME_OBRIGATORIO' USING ERRCODE='22023'; END IF;

  IF p_id IS NULL THEN
    INSERT INTO app.solicitacao_tipo (nome, criado_por) VALUES (btrim(p_nome), app.uid_jwt()) RETURNING id INTO v_id;
  ELSE
    UPDATE app.solicitacao_tipo SET nome = btrim(p_nome), atualizado_em = now() WHERE id = p_id RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'TIPO_INEXISTENTE' USING ERRCODE='22023'; END IF;
    DELETE FROM app.solicitacao_campo WHERE tipo_id = v_id;
  END IF;

  FOR v_campo IN SELECT * FROM jsonb_array_elements(coalesce(p_campos,'[]'::jsonb))
  LOOP
    v_ordem := v_ordem + 1;
    v_tc := v_campo->>'tipo_campo';
    IF v_tc NOT IN ('texto_curto','texto_longo','numero','moeda','data','selecao','anexo') THEN
      RAISE EXCEPTION 'TIPO_CAMPO_INVALIDO: %', v_tc USING ERRCODE='22023'; END IF;
    IF coalesce(btrim(v_campo->>'rotulo'),'') = '' THEN RAISE EXCEPTION 'ROTULO_OBRIGATORIO' USING ERRCODE='22023'; END IF;
    IF v_tc = 'selecao' AND (v_campo->'opcoes' IS NULL OR jsonb_typeof(v_campo->'opcoes') <> 'array' OR jsonb_array_length(v_campo->'opcoes') = 0) THEN
      RAISE EXCEPTION 'OPCOES_OBRIGATORIAS: campo seleção precisa de opções' USING ERRCODE='22023'; END IF;
    INSERT INTO app.solicitacao_campo (tipo_id, ordem, rotulo, tipo_campo, obrigatorio, opcoes)
    VALUES (v_id, v_ordem, btrim(v_campo->>'rotulo'), v_tc,
            coalesce((v_campo->>'obrigatorio')::boolean, false),
            CASE WHEN v_tc='selecao' THEN v_campo->'opcoes' ELSE NULL END);
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_solic_arquivar_tipo(p_id bigint, p_arquivar boolean)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['solicitacoes']);
  UPDATE app.solicitacao_tipo SET arquivado = p_arquivar, atualizado_em = now() WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'TIPO_INEXISTENTE' USING ERRCODE='22023'; END IF;
  RETURN jsonb_build_object('ok', true);
END; $$;

-- Exclusão dura SÓ se nenhum vínculo; senão, orienta arquivar.
CREATE OR REPLACE FUNCTION public.admin_solic_excluir_tipo(p_id bigint)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['solicitacoes']);
  IF EXISTS (SELECT 1 FROM app.solicitacao WHERE tipo_id = p_id) THEN
    RAISE EXCEPTION 'TIPO_EM_USO: tipo com solicitações não pode ser excluído — arquive-o' USING ERRCODE='22023';
  END IF;
  DELETE FROM app.solicitacao_tipo WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'TIPO_INEXISTENTE' USING ERRCODE='22023'; END IF;
  RETURN jsonb_build_object('ok', true);
END; $$;

-- ── Grants explícitos (default privileges revogam anon/authenticated) ──────────
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.solic_tipos_abertura()', 'public.solic_destinatarios()',
    'public.criar_solicitacao(bigint,uuid,bigint,date,text,jsonb,jsonb)',
    'public.solic_concluir(bigint)', 'public.solic_rejeitar(bigint,text)', 'public.solic_cancelar(bigint)',
    'public.solic_minhas()', 'public.solic_caixa(text)', 'public.solic_detalhe(bigint)',
    'public.solic_minhas_pendencias()', 'public.solic_anexo_path(bigint)',
    'public.admin_solic_listar_tipos()', 'public.admin_solic_salvar_tipo(bigint,text,jsonb)',
    'public.admin_solic_arquivar_tipo(bigint,boolean)', 'public.admin_solic_excluir_tipo(bigint)'
  ]
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon;', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role;', fn);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
