-- ---------------------------------------------------------------------------
-- 0171 — feat(v4.37.1): direção do aviso de data por campo (acima/abaixo de X dias).
--
-- DECLARAÇÃO PRÉVIA (regime aditivo / autônomo):
--   • O QUE FAZ:
--     (1) ALTER TABLE app.solicitacao_campo: coluna dedicada data_aviso_direcao
--         (text NOT NULL DEFAULT 'acima', CHECK IN ('acima','abaixo')). Diz se o aviso
--         de data (data_aviso_dias_futuro) dispara quando a data está ACIMA (a mais de X
--         dias — comportamento atual) ou ABAIXO (a menos de X dias — prazo curto) do limite.
--     (2) CREATE OR REPLACE de 3 RPCs (defs vivas vêm da 0140) p/ conhecer a coluna:
--         solic_tipos_abertura e admin_solic_listar_tipos EMITEM a coluna; admin_solic_salvar_tipo
--         PERSISTE (lê do payload jsonb por campo). criar_solicitacao NÃO muda — o aviso é
--         insumo de UI (o servidor NÃO enforça direção nem dias; só bloqueia passado via 0140).
--   • ADITIVA / retrocompatível com a `main` viva:
--       - DEFAULT 'acima' ⇒ toda linha existente nasce com o comportamento ATUAL idêntico
--         (o aviso continua disparando "a mais de X dias"); nenhum tipo já configurado muda.
--       - As RPCs só ACRESCENTAM uma chave ao JSON; consumidores antigos ignoram.
--       - NÃO escreve/reescreve dados pré-existentes; CREATE OR REPLACE preserva grants.
-- ---------------------------------------------------------------------------

-- 1. Coluna dedicada (aditiva; default retrocompatível = 'acima').
ALTER TABLE app.solicitacao_campo
  ADD COLUMN IF NOT EXISTS data_aviso_direcao text NOT NULL DEFAULT 'acima'
    CHECK (data_aviso_direcao IN ('acima','abaixo'));

-- 2. solic_tipos_abertura — EMITE a coluna nova (UI de abertura lê a direção do aviso).
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
          'data_aviso_dias_futuro', c.data_aviso_dias_futuro,
          'data_aviso_direcao', c.data_aviso_direcao) ORDER BY c.ordem)
        FROM app.solicitacao_campo c WHERE c.tipo_id = t.id), '[]'::jsonb)
    ) ORDER BY t.nome)
    FROM app.solicitacao_tipo t WHERE NOT t.arquivado), '[]'::jsonb);
END; $$;

-- 3. admin_solic_listar_tipos — EMITE a coluna nova (construtor do admin repopula).
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
        'data_permite_passado',c.data_permite_passado,'data_aviso_dias_futuro',c.data_aviso_dias_futuro,
        'data_aviso_direcao',c.data_aviso_direcao) ORDER BY c.ordem)
      FROM app.solicitacao_campo c WHERE c.tipo_id = t.id), '[]'::jsonb)
  ) ORDER BY t.arquivado, t.nome) FROM app.solicitacao_tipo t), '[]'::jsonb);
END; $$;

-- 4. admin_solic_salvar_tipo — PERSISTE a coluna nova (lê do payload por campo; default 'acima').
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
                                       data_permite_passado, data_aviso_dias_futuro, data_aviso_direcao)
    VALUES (v_id, v_ordem, btrim(v_campo->>'rotulo'), v_tc,
            coalesce((v_campo->>'obrigatorio')::boolean, false),
            CASE WHEN v_tc='selecao' THEN v_campo->'opcoes' ELSE NULL END,
            CASE WHEN v_tc='data' THEN coalesce((v_campo->>'data_permite_passado')::boolean, true) ELSE true END,
            CASE WHEN v_tc='data' THEN nullif(v_campo->>'data_aviso_dias_futuro','')::int ELSE NULL END,
            CASE WHEN v_tc='data' THEN coalesce(nullif(v_campo->>'data_aviso_direcao',''),'acima') ELSE 'acima' END);
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END; $$;

NOTIFY pgrst, 'reload schema';
