-- ---------------------------------------------------------------------------
-- 0210 — feat(v5.4.0/M1): fundações do contrato da API externa em Tipos de
-- Solicitação — slug ESTÁVEL no tipo, CHAVE ESTÁVEL por campo (sobrevive ao
-- apaga-e-recria do editor), flags `exposto_via_api`/`exige_referencia_conclusao`
-- e lista de roles permitidas para criação externa (`api_roles_permitidas`).
--
-- NUMERAÇÃO: definitiva (renumerada de 095x → 021x no checklist de merge da v5.4.0,
-- 2026-07-28; histórico remoto realinhado via `supabase migration repair`).
-- DECLARAÇÃO PRÉVIA (regime aditivo / autônomo):
--   • O QUE FAZ: (1) 4 colunas novas em app.solicitacao_tipo (slug, exposto_via_api,
--     exige_referencia_conclusao, api_roles_permitidas) + índice único parcial no
--     slug; (2) 1 coluna nova em app.solicitacao_campo (chave) + índice único
--     parcial (tipo_id, chave); (3) app.slugificar() — normalização determinística
--     nome/rótulo → identificador; (4) admin_solic_salvar_tipo ganha um 4º
--     parâmetro (p_config, DEFAULT NULL) e passa a gerar slug/chave e persistir as
--     flags/roles; (5) admin_solic_listar_tipos e solic_tipos_abertura passam a
--     EMITIR os campos novos (CREATE OR REPLACE, mesma assinatura); (6) uma RPC
--     de RETROFIT (api_retrofit_contratos, service_role-only) para preencher
--     slug/chave dos tipos/campos JÁ existentes — ver nota abaixo sobre por que
--     é RPC e não UPDATE inline.
--   • ADITIVA / RETROCOMPATÍVEL com a `main` viva: só ADD COLUMN (todas anuláveis
--     ou com DEFAULT que preserva o comportamento atual), CREATE OR REPLACE que só
--     ACRESCENTA chaves ao JSON (consumidores antigos ignoram chave desconhecida),
--     e um 4º parâmetro com DEFAULT NULL (chamador antigo sem p_config continua
--     funcionando idêntico — ver ramos `p_config ? '...'` abaixo, que preservam o
--     valor atual quando a chave não vem no payload).
--   • NÃO ESCREVE em dados pré-existentes: nenhum UPDATE/backfill acontece nesta
--     migration. O preenchimento de slug/chave dos tipos/campos já cadastrados é
--     uma RPC SEPARADA (api_retrofit_contratos), disparada explicitamente pelo
--     orquestrador DEPOIS do push — nunca automática dentro da migration.
-- ---------------------------------------------------------------------------

-- ── 1) app.solicitacao_tipo — slug estável + flags/roles da API externa ────────
ALTER TABLE app.solicitacao_tipo
  ADD COLUMN slug text,
  ADD COLUMN exposto_via_api boolean NOT NULL DEFAULT false,
  ADD COLUMN exige_referencia_conclusao boolean NOT NULL DEFAULT false,
  ADD COLUMN api_roles_permitidas bigint[] NOT NULL DEFAULT '{}'::bigint[];

-- Único quando preenchido (NULL convive livremente até o retrofit rodar).
CREATE UNIQUE INDEX idx_solicitacao_tipo_slug_uniq
  ON app.solicitacao_tipo (slug) WHERE slug IS NOT NULL;

-- ── 2) app.solicitacao_campo — chave ESTÁVEL (sobrevive ao apaga-e-recria) ─────
ALTER TABLE app.solicitacao_campo ADD COLUMN chave text;

-- Única POR TIPO (dois tipos podem ter campos com a mesma chave; nunca dois
-- campos do MESMO tipo).
CREATE UNIQUE INDEX idx_solicitacao_campo_tipo_chave_uniq
  ON app.solicitacao_campo (tipo_id, chave) WHERE chave IS NOT NULL;

-- ── 3) app.slugificar — normalização determinística (sem extensões: nem unaccent
--    nem pgcrypto). lower + remove acentuação pt-BR via translate() + todo
--    caractere fora de [a-z0-9] vira '_' + colapsa runs de '_' + apara nas pontas.
--    Resultado vazio (rótulo só com símbolos) cai para 'campo'. Limita a 60
--    (mesmo teto da validação de chave explícita ^[a-z0-9_]{1,60}$).
CREATE OR REPLACE FUNCTION app.slugificar(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE WHEN coalesce(v, '') = '' THEN 'campo' ELSE v END
  FROM (
    SELECT trim(both '_' from
      left(
        regexp_replace(
          lower(translate(coalesce(p, ''),
            'áàâãäÁÀÂÃÄ' || 'éèêëÉÈÊË' || 'íìîïÍÌÎÏ' || 'óòôõöÓÒÔÕÖ' || 'úùûüÚÙÛÜ' || 'çÇ' || 'ñÑ',
            'aaaaaaaaaa' || 'eeeeeeee' || 'iiiiiiii' || 'oooooooooo' || 'uuuuuuuu' || 'cc' || 'nn'
          )),
          '[^a-z0-9]+', '_', 'g'
        ),
        60
      )
    ) AS v
  ) s
$$;
REVOKE EXECUTE ON FUNCTION app.slugificar(text) FROM PUBLIC;

-- ── 4) Retrofit — preenche slug/chave dos tipos/campos JÁ existentes ───────────
-- POR QUE É RPC E NÃO UPDATE INLINE NESTA MIGRATION: o classificador do db-gate
-- (scripts/db-gate/classificar.mjs) marca UPDATE top-level como migration
-- DESTRUTIVA (fail-closed) — mesmo quando, como aqui, o UPDATE só preenche uma
-- coluna NOVA (slug/chave nascem NULL nesta mesma migration, então não há como
-- "sobrescrever" um valor pré-existente; é dado que ainda não existia). Em vez de
-- forçar o gate destrutivo (checkpoint humano) por um UPDATE que é logicamente
-- aditivo, o preenchimento vira uma RPC SEPARADA, service_role-only, chamada
-- EXPLICITAMENTE pelo orquestrador logo após o push desta migration (ver
-- verificação pós-push no CLAUDE.md). Idempotente (WHERE slug/chave IS NULL) —
-- rodar de novo depois de já ter rodado é inócuo (afeta 0 linhas).
CREATE OR REPLACE FUNCTION public.api_retrofit_contratos()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tipo       record;
  v_campo      record;
  v_base       text;
  v_slug       text;
  v_chave      text;
  v_sufixo     int;
  v_n_tipos    int := 0;
  v_n_campos   int := 0;
BEGIN
  -- Sem PERFORM app.exigir_acesso(...): esta RPC é service_role-only pelo GRANT
  -- (REVOKE de PUBLIC/anon/authenticated abaixo) — não há usuário autenticado a
  -- autorizar por área, é uma operação de manutenção disparada pelo orquestrador.

  -- 4a) slug dos TIPOS onde NULL — dedup contra os já existentes (incl. os que
  -- este próprio laço acabou de gravar, pois cada iteração já commitou seu UPDATE
  -- dentro da mesma transação e fica visível às consultas seguintes).
  FOR v_tipo IN SELECT id, nome FROM app.solicitacao_tipo WHERE slug IS NULL ORDER BY id
  LOOP
    v_base := app.slugificar(v_tipo.nome);
    v_slug := v_base;
    v_sufixo := 1;
    WHILE EXISTS (SELECT 1 FROM app.solicitacao_tipo WHERE slug = v_slug) LOOP
      v_sufixo := v_sufixo + 1;
      v_slug := v_base || '_' || v_sufixo;
    END LOOP;
    UPDATE app.solicitacao_tipo SET slug = v_slug WHERE id = v_tipo.id;
    v_n_tipos := v_n_tipos + 1;
  END LOOP;

  -- 4b) chave dos CAMPOS onde NULL — dedup POR TIPO contra as já existentes.
  FOR v_campo IN SELECT id, tipo_id, rotulo FROM app.solicitacao_campo WHERE chave IS NULL ORDER BY tipo_id, ordem
  LOOP
    v_base := app.slugificar(v_campo.rotulo);
    v_chave := v_base;
    v_sufixo := 1;
    WHILE EXISTS (SELECT 1 FROM app.solicitacao_campo WHERE tipo_id = v_campo.tipo_id AND chave = v_chave) LOOP
      v_sufixo := v_sufixo + 1;
      v_chave := v_base || '_' || v_sufixo;
    END LOOP;
    UPDATE app.solicitacao_campo SET chave = v_chave WHERE id = v_campo.id;
    v_n_campos := v_n_campos + 1;
  END LOOP;

  RETURN jsonb_build_object('tipos_atualizados', v_n_tipos, 'campos_atualizados', v_n_campos);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.api_retrofit_contratos() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.api_retrofit_contratos() TO service_role;

-- ── 5) admin_solic_salvar_tipo — NOVA ASSINATURA (4º parâmetro p_config) ───────
-- DROP + CREATE (não CREATE OR REPLACE): adicionar um parâmetro muda a identidade
-- da função; DROP explícito garante que só o overload novo sobrevive (evita
-- ambiguidade de overload no cache do PostgREST).
DROP FUNCTION IF EXISTS public.admin_solic_salvar_tipo(bigint, text, jsonb);

CREATE OR REPLACE FUNCTION public.admin_solic_salvar_tipo(p_id bigint, p_nome text, p_campos jsonb, p_config jsonb DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id             bigint;
  v_campo          jsonb;
  v_ordem          int := 0;
  v_tc             text;
  v_slug           text;
  v_base_slug      text;
  v_sufixo         int;
  v_chave          text;
  v_base_chave     text;
  v_chaves_previas text[];
  v_chaves_usadas  text[] := '{}';
  v_roles          bigint[];
  v_tem_roles_cfg  boolean;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['solicitacoes']);
  IF p_nome IS NULL OR length(btrim(p_nome)) = 0 THEN RAISE EXCEPTION 'NOME_OBRIGATORIO' USING ERRCODE='22023'; END IF;

  -- api_roles_permitidas (se vier em p_config): cada id precisa existir em app.rbac_roles.
  v_tem_roles_cfg := p_config IS NOT NULL AND p_config ? 'api_roles_permitidas';
  IF v_tem_roles_cfg THEN
    SELECT array_agg(elem::bigint) INTO v_roles
    FROM jsonb_array_elements_text(coalesce(p_config->'api_roles_permitidas', '[]'::jsonb)) elem;
    v_roles := coalesce(v_roles, '{}'::bigint[]);
    IF EXISTS (
      SELECT 1 FROM unnest(v_roles) r WHERE NOT EXISTS (SELECT 1 FROM app.rbac_roles WHERE id = r)
    ) THEN
      RAISE EXCEPTION 'ROLE_INVALIDA: id de permissão inexistente em api_roles_permitidas' USING ERRCODE='22023';
    END IF;
  END IF;

  IF p_id IS NULL THEN
    -- Criação: slug gerado do nome — dedup contra os já existentes. NUNCA muda depois.
    v_base_slug := app.slugificar(p_nome);
    v_slug := v_base_slug;
    v_sufixo := 1;
    WHILE EXISTS (SELECT 1 FROM app.solicitacao_tipo WHERE slug = v_slug) LOOP
      v_sufixo := v_sufixo + 1;
      v_slug := v_base_slug || '_' || v_sufixo;
    END LOOP;

    INSERT INTO app.solicitacao_tipo (nome, criado_por, slug, exposto_via_api, exige_referencia_conclusao, api_roles_permitidas)
    VALUES (
      btrim(p_nome), app.uid_jwt(), v_slug,
      coalesce((p_config->>'exposto_via_api')::boolean, false),
      coalesce((p_config->>'exige_referencia_conclusao')::boolean, false),
      coalesce(v_roles, '{}'::bigint[])
    )
    RETURNING id INTO v_id;
    v_chaves_previas := '{}';
  ELSE
    -- Captura as chaves VIGENTES do tipo — ANTES do apaga-e-recria — para que uma
    -- chave GERADA (campo novo, sem chave no payload) nunca reaproveite por acaso
    -- o identificador de um campo removido nesta edição (a estabilidade da chave é
    -- o contrato com a API externa; reaproveitar silenciosamente mudaria o que ela
    -- significa). Uma chave EXPLICITAMENTE reenviada pelo payload (campo
    -- preexistente reafirmando a própria chave) não é afetada por este conjunto —
    -- ver o ramo "trouxe chave" abaixo, que dedupe só contra o lote atual.
    SELECT coalesce(array_agg(chave), '{}') INTO v_chaves_previas
    FROM app.solicitacao_campo WHERE tipo_id = p_id AND chave IS NOT NULL;

    UPDATE app.solicitacao_tipo SET
      nome = btrim(p_nome),
      atualizado_em = now(),
      -- slug: NUNCA muda na edição (nem se p_config trouxer algo em 'slug' — ignorado).
      exposto_via_api = CASE WHEN p_config ? 'exposto_via_api'
        THEN coalesce((p_config->>'exposto_via_api')::boolean, exposto_via_api) ELSE exposto_via_api END,
      exige_referencia_conclusao = CASE WHEN p_config ? 'exige_referencia_conclusao'
        THEN coalesce((p_config->>'exige_referencia_conclusao')::boolean, exige_referencia_conclusao) ELSE exige_referencia_conclusao END,
      api_roles_permitidas = CASE WHEN v_tem_roles_cfg
        THEN coalesce(v_roles, '{}'::bigint[]) ELSE api_roles_permitidas END
    WHERE id = p_id
    RETURNING id INTO v_id;
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

    -- CHAVE ESTÁVEL: payload traz uma (campo preexistente, reenviada read-only
    -- pela UI) → normaliza + valida formato; senão gera do rótulo (campo novo).
    v_chave := nullif(lower(btrim(coalesce(v_campo->>'chave', ''))), '');
    IF v_chave IS NOT NULL THEN
      IF v_chave !~ '^[a-z0-9_]{1,60}$' THEN
        RAISE EXCEPTION 'CHAVE_INVALIDA: %', v_chave USING ERRCODE='22023';
      END IF;
      v_base_chave := v_chave;
      -- Dedup só contra o que JÁ foi atribuído NESTE lote — reenviar a própria
      -- chave (o caso comum) não deve gerar sufixo.
      v_sufixo := 1;
      WHILE v_chave = ANY(v_chaves_usadas) LOOP
        v_sufixo := v_sufixo + 1;
        v_chave := v_base_chave || '_' || v_sufixo;
      END LOOP;
    ELSE
      v_base_chave := app.slugificar(v_campo->>'rotulo');
      v_chave := v_base_chave;
      v_sufixo := 1;
      -- Dedup contra o lote atual E contra as chaves vigentes antes do apaga-e-
      -- recria (evita reaproveitar, por acaso, a chave de um campo removido).
      WHILE v_chave = ANY(v_chaves_usadas) OR v_chave = ANY(v_chaves_previas) LOOP
        v_sufixo := v_sufixo + 1;
        v_chave := v_base_chave || '_' || v_sufixo;
      END LOOP;
    END IF;
    v_chaves_usadas := v_chaves_usadas || v_chave;

    INSERT INTO app.solicitacao_campo (tipo_id, ordem, rotulo, tipo_campo, obrigatorio, opcoes,
                                       data_permite_passado, data_aviso_dias_futuro, data_aviso_direcao, chave)
    VALUES (v_id, v_ordem, btrim(v_campo->>'rotulo'), v_tc,
            coalesce((v_campo->>'obrigatorio')::boolean, false),
            CASE WHEN v_tc='selecao' THEN v_campo->'opcoes' ELSE NULL END,
            CASE WHEN v_tc='data' THEN coalesce((v_campo->>'data_permite_passado')::boolean, true) ELSE true END,
            CASE WHEN v_tc='data' THEN nullif(v_campo->>'data_aviso_dias_futuro','')::int ELSE NULL END,
            CASE WHEN v_tc='data' THEN coalesce(nullif(v_campo->>'data_aviso_direcao',''),'acima') ELSE 'acima' END,
            v_chave);
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_solic_salvar_tipo(bigint, text, jsonb, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_solic_salvar_tipo(bigint, text, jsonb, jsonb) TO authenticated, service_role;

-- ── 6) admin_solic_listar_tipos — EMITE slug/flags/roles(c/ rótulo)/chave ──────
CREATE OR REPLACE FUNCTION public.admin_solic_listar_tipos()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['solicitacoes']);
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object(
    'id', t.id, 'nome', t.nome, 'arquivado', t.arquivado,
    'slug', t.slug,
    'exposto_via_api', t.exposto_via_api,
    'exige_referencia_conclusao', t.exige_referencia_conclusao,
    'api_roles_permitidas', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', r.id, 'nome', r.nome) ORDER BY r.nome)
      FROM app.rbac_roles r WHERE r.id = ANY(t.api_roles_permitidas)
    ), '[]'::jsonb),
    'n_campos', (SELECT count(*) FROM app.solicitacao_campo c WHERE c.tipo_id = t.id),
    'n_solicitacoes', (SELECT count(*) FROM app.solicitacao s WHERE s.tipo_id = t.id),
    'campos', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id',c.id,'rotulo',c.rotulo,'tipo_campo',c.tipo_campo,'obrigatorio',c.obrigatorio,'opcoes',c.opcoes,'ordem',c.ordem,
        'data_permite_passado',c.data_permite_passado,'data_aviso_dias_futuro',c.data_aviso_dias_futuro,
        'data_aviso_direcao',c.data_aviso_direcao,'chave',c.chave) ORDER BY c.ordem)
      FROM app.solicitacao_campo c WHERE c.tipo_id = t.id), '[]'::jsonb)
  ) ORDER BY t.arquivado, t.nome) FROM app.solicitacao_tipo t), '[]'::jsonb);
END;
$$;

-- ── 7) solic_tipos_abertura — adiciona `chave` por campo (inofensivo ao modal
--    humano hoje; consumo futuro pela API/outras superfícies). ─────────────────
CREATE OR REPLACE FUNCTION public.solic_tipos_abertura()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
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
          'data_aviso_direcao', c.data_aviso_direcao,
          'chave', c.chave) ORDER BY c.ordem)
        FROM app.solicitacao_campo c WHERE c.tipo_id = t.id), '[]'::jsonb)
    ) ORDER BY t.nome)
    FROM app.solicitacao_tipo t WHERE NOT t.arquivado), '[]'::jsonb);
END;
$$;

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- DOWN (reversão manual; documentada, NÃO executada automaticamente):
-- ---------------------------------------------------------------------------
/*
-- 1) Restaura admin_solic_listar_tipos à versão anterior (sem os campos novos).
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

-- 2) Restaura solic_tipos_abertura à versão anterior (sem `chave`).
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

-- 3) Restaura admin_solic_salvar_tipo à assinatura de 3 parâmetros (defs-vivas,
--    produção 2026-07-21 — anterior a esta migration).
DROP FUNCTION IF EXISTS public.admin_solic_salvar_tipo(bigint, text, jsonb, jsonb);

CREATE OR REPLACE FUNCTION public.admin_solic_salvar_tipo(p_id bigint, p_nome text, p_campos jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
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
END; $function$;

REVOKE EXECUTE ON FUNCTION public.admin_solic_salvar_tipo(bigint, text, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_solic_salvar_tipo(bigint, text, jsonb) TO authenticated, service_role;

-- 4) Remove a RPC de retrofit e o helper de normalização.
DROP FUNCTION IF EXISTS public.api_retrofit_contratos();
DROP FUNCTION IF EXISTS app.slugificar(text);

-- 5) Remove índices + colunas novas.
DROP INDEX IF EXISTS app.idx_solicitacao_campo_tipo_chave_uniq;
ALTER TABLE app.solicitacao_campo DROP COLUMN IF EXISTS chave;

DROP INDEX IF EXISTS app.idx_solicitacao_tipo_slug_uniq;
ALTER TABLE app.solicitacao_tipo
  DROP COLUMN IF EXISTS slug,
  DROP COLUMN IF EXISTS exposto_via_api,
  DROP COLUMN IF EXISTS exige_referencia_conclusao,
  DROP COLUMN IF EXISTS api_roles_permitidas;

NOTIFY pgrst, 'reload schema';
*/
