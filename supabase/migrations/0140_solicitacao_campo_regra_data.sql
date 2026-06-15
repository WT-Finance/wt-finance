-- ---------------------------------------------------------------------------
-- 0140 — feat(v4.19.0/M3): regra de data por campo em app.solicitacao_campo.
--
-- DECLARAÇÃO PRÉVIA (âncora / regime autônomo):
--   • O QUE FAZ:
--     (1) ALTER TABLE app.solicitacao_campo: duas colunas dedicadas para campos
--         do tipo 'data' — data_permite_passado (boolean NOT NULL DEFAULT true) e
--         data_aviso_dias_futuro (int NULL). NÃO reutiliza `opcoes` (cujo CHECK a
--         tranca em tipo_campo='selecao').
--     (2) CREATE OR REPLACE de 4 RPCs (defs vivas vêm da 0128) para CONHECER as
--         colunas novas: solic_tipos_abertura e admin_solic_listar_tipos EMITEM as
--         duas (UI de abertura lê o aviso; construtor do admin repopula);
--         admin_solic_salvar_tipo PERSISTE as duas (lê do payload jsonb por campo);
--         criar_solicitacao bloqueia, no ramo 'data', valor < HOJE quando
--         data_permite_passado = false.
--   • ADITIVA / retrocompatível com a `main` viva:
--       - DEFAULT true em data_permite_passado ⇒ toda linha existente nasce
--         "sem restrição" = comportamento atual idêntico (nenhum bloqueio novo).
--       - data_aviso_dias_futuro é só insumo de UI (servidor NÃO enforça); NULL = sem aviso.
--       - As RPCs só ACRESCENTAM chaves ao JSON; consumidores antigos ignoram.
--       - NÃO escreve/reescreve dados pré-existentes; CREATE OR REPLACE preserva grants.
--   • HOJE = (now() AT TIME ZONE 'America/Sao_Paulo')::date — NUNCA current_date (TZ do servidor).
-- ---------------------------------------------------------------------------

-- 1. Colunas dedicadas (aditivas; default retrocompatível).
ALTER TABLE app.solicitacao_campo
  ADD COLUMN IF NOT EXISTS data_permite_passado   boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS data_aviso_dias_futuro int;

-- 2. solic_tipos_abertura — EMITE as 2 colunas (UI de abertura lê o aviso).
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
          'obrigatorio', c.obrigatorio, 'opcoes', c.opcoes,
          'data_permite_passado', c.data_permite_passado,
          'data_aviso_dias_futuro', c.data_aviso_dias_futuro) ORDER BY c.ordem)
        FROM app.solicitacao_campo c WHERE c.tipo_id = t.id), '[]'::jsonb)
    ) ORDER BY t.nome)
    FROM app.solicitacao_tipo t WHERE NOT t.arquivado), '[]'::jsonb);
END; $$;

-- 3. criar_solicitacao — bloqueio server-side no ramo 'data' (valor < HOJE SP).
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
    SELECT id, rotulo, tipo_campo, obrigatorio, opcoes, ordem, data_permite_passado
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
        IF v_campo.tipo_campo = 'data'
           AND NOT v_campo.data_permite_passado
           AND v_val::date < (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
          RAISE EXCEPTION 'VALOR_INVALIDO: % não admite data no passado', v_campo.rotulo USING ERRCODE='22023';
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

-- 4. admin_solic_listar_tipos — EMITE as 2 colunas (construtor repopula).
CREATE OR REPLACE FUNCTION public.admin_solic_listar_tipos()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['solicitacoes']);
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object(
    'id', t.id, 'nome', t.nome, 'arquivado', t.arquivado,
    'n_campos', (SELECT count(*) FROM app.solicitacao_campo c WHERE c.tipo_id = t.id),
    'n_solicitacoes', (SELECT count(*) FROM app.solicitacao s WHERE s.tipo_id = t.id),
    'campos', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id',c.id,'rotulo',c.rotulo,'tipo_campo',c.tipo_campo,'obrigatorio',c.obrigatorio,'opcoes',c.opcoes,'ordem',c.ordem,
        'data_permite_passado',c.data_permite_passado,'data_aviso_dias_futuro',c.data_aviso_dias_futuro) ORDER BY c.ordem)
      FROM app.solicitacao_campo c WHERE c.tipo_id = t.id), '[]'::jsonb)
  ) ORDER BY t.arquivado, t.nome) FROM app.solicitacao_tipo t), '[]'::jsonb);
END; $$;

-- 5. admin_solic_salvar_tipo — PERSISTE as 2 colunas (lê do payload por campo).
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
    INSERT INTO app.solicitacao_campo (tipo_id, ordem, rotulo, tipo_campo, obrigatorio, opcoes,
                                       data_permite_passado, data_aviso_dias_futuro)
    VALUES (v_id, v_ordem, btrim(v_campo->>'rotulo'), v_tc,
            coalesce((v_campo->>'obrigatorio')::boolean, false),
            CASE WHEN v_tc='selecao' THEN v_campo->'opcoes' ELSE NULL END,
            CASE WHEN v_tc='data' THEN coalesce((v_campo->>'data_permite_passado')::boolean, true) ELSE true END,
            CASE WHEN v_tc='data' THEN nullif(v_campo->>'data_aviso_dias_futuro','')::int ELSE NULL END);
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END; $$;

NOTIFY pgrst, 'reload schema';
