-- ---------------------------------------------------------------------------
-- 0215 — feat(v5.4.0/Round2): EXTIRPA o conceito "conclusão exige referência
-- externa" (introduzido pela 0213/ADR-0161) e centraliza a configuração de API
-- de um tipo (exposto_via_api/api_roles_permitidas) numa RPC própria
-- (admin_solic_tipo_api_config), usada pela nova página "API externa" — o
-- editor de tipos (admin_solic_salvar_tipo) volta a ser SÓ nome+campos.
--
-- DECISÃO DE PRODUTO DO YAN (2026-07-28), pós-implementação da v5.4.0: o
-- Janus é o dono do formato; conciliação origem↔lançamento é responsabilidade
-- da PLATAFORMA DE ORIGEM, não uma trava do Janus na conclusão. O comportamento
-- "exige referência para concluir" morre agora; o DROP das colunas órfãs
-- (`app.solicitacao_tipo.exige_referencia_conclusao`,
-- `app.solicitacao.referencia_conclusao`) fica para um PATCH DESTRUTIVO
-- separado, pós-merge (skill banco-e-rpc: destrutiva não fica na pasta antes
-- da hora) — as colunas ficam ÓRFÃS e INERTES nesta migration (nenhum código
-- as lê nem escreve mais a partir daqui).
--
-- DECLARAÇÃO PRÉVIA (regime aditivo / autônomo):
--   • O QUE FAZ: (1) `solic_concluir` volta à assinatura de 1 parâmetro (DROP
--     da versão de 2 parâmetros da 0213 + CREATE da versão de 1) — deixa de
--     checar/exigir referência e de gravar `referencia_conclusao`; o
--     enfileiramento de `solicitacao.concluida` permanece, mas o payload
--     perde a chave `referencia`; (2) `app.solic_json` (CREATE OR REPLACE,
--     mesma assinatura) deixa de emitir `exige_referencia_conclusao`/
--     `referencia_conclusao` — os consumidores Zod usam `.optional()` nessas
--     duas chaves, então a REMOÇÃO da chave não quebra o parse; (3)
--     `admin_solic_salvar_tipo` (CREATE OR REPLACE, mesma assinatura de 4
--     parâmetros) para de reconhecer `exige_referencia_conclusao` em
--     `p_config` — só `exposto_via_api`/`api_roles_permitidas` continuam
--     configuráveis por ali; (4) `admin_solic_listar_tipos` (CREATE OR
--     REPLACE) para de emitir `exige_referencia_conclusao`; (5)
--     `solic_tipos_api` (CREATE OR REPLACE) idem, na descoberta externa; (6)
--     RPC NOVA `admin_solic_tipo_api_config` — atualiza SÓ
--     `exposto_via_api`/`api_roles_permitidas` de um tipo (é a RPC da nova
--     seção "Tipos expostos" de /admin/api-externa; não toca nome/campos/slug).
--   • ADITIVA / RETROCOMPATÍVEL com a `main` viva: os únicos `DROP FUNCTION`
--     são trocas de ASSINATURA (`solic_concluir`: 2 parâmetros → 1) — o
--     classificador do db-gate marca isso como WARN, não destrutivo (nenhum
--     dado é removido). Todo `CREATE OR REPLACE` restante preserva a
--     assinatura; a única mudança observável é a REMOÇÃO de duas chaves de
--     JSON que já eram `.optional()` do lado do consumidor. NENHUM `DROP
--     COLUMN`/`ALTER ... DROP` acontece aqui — as colunas ficam intocadas
--     (órfãs) até o patch destrutivo separado.
--   • NÃO ESCREVE em dados pré-existentes: nenhum UPDATE/backfill em linha já
--     existente.
-- ---------------------------------------------------------------------------

-- ── 1) solic_concluir — volta à assinatura de 1 parâmetro ──────────────────────
-- DROP + CREATE: remover um parâmetro muda a identidade da função (mesmo
-- padrão de admin_solic_salvar_tipo/solic_concluir nas 0210/0213). O
-- classificador do db-gate marca este DROP como WARN (troca de assinatura),
-- não destrutivo — aceito: nenhum dado é removido, e a UI (ENTREGA 2 desta
-- mesma missão) passa a chamar só com p_id.
DROP FUNCTION IF EXISTS public.solic_concluir(bigint, text);

CREATE OR REPLACE FUNCTION public.solic_concluir(p_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_sol app.solicitacao;
BEGIN
  PERFORM app.exigir_acesso();
  SELECT * INTO v_sol FROM app.solicitacao WHERE id = p_id;
  IF NOT FOUND OR NOT app.pode_ver_solic(v_sol) THEN RAISE EXCEPTION 'NAO_ENCONTRADA' USING ERRCODE='42501'; END IF;
  IF v_sol.status <> 'aberta' THEN RAISE EXCEPTION 'TRANSICAO_ILEGAL: solicitação não está aberta' USING ERRCODE='22023'; END IF;
  IF NOT (app.sou_atendente(v_sol) OR v_sol.solicitante_id = app.uid_jwt()) THEN
    RAISE EXCEPTION 'PERMISSAO_NEGADA: só o atendente ou o solicitante pode concluir' USING ERRCODE='42501'; END IF;

  UPDATE app.solicitacao SET status='concluida', decidido_por=app.uid_jwt(), decidido_em=now() WHERE id=p_id;

  -- Enfileira o callback DE CONCLUSÃO — api_outbox_enfileirar já é no-op para
  -- solicitação de origem INTERNA (a maioria; a UI humana não sente nada disto).
  -- v5.4.0/Round2 (2026-07-28, decisão do Yan): o payload NÃO carrega mais a
  -- chave 'referencia' — o conceito de referência externa obrigatória na
  -- conclusão foi EXTIRPADO (ver Emenda no ADR-0161).
  PERFORM app.api_outbox_enfileirar(p_id, 'solicitacao.concluida', '{}'::jsonb);

  RETURN jsonb_build_object('ok', true);
END; $function$;
REVOKE EXECUTE ON FUNCTION public.solic_concluir(bigint) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.solic_concluir(bigint) TO authenticated, service_role;

-- ── 2) app.solic_json — deixa de emitir exige_referencia_conclusao/referencia_conclusao ─
-- Consumida por solic_caixa/solic_minhas/solic_detalhe — REMOÇÃO de chave
-- (não adição): os dois campos já eram `.optional()` no Zod do app, então a
-- ausência não quebra o parse.
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
    'sou_solicitante', coalesce(p_sol.solicitante_id = app.uid_jwt(), false),
    'sou_atendente', app.sou_atendente(p_sol),
    'anexos', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id',a.id,'campo_id',a.campo_id,'nome',a.nome_arquivo,'mime',a.mime,'tamanho',a.tamanho_bytes) ORDER BY a.id)
      FROM app.solicitacao_anexo a WHERE a.solicitacao_id = p_sol.id), '[]'::jsonb)
  );
$$;
REVOKE EXECUTE ON FUNCTION app.solic_json(app.solicitacao) FROM PUBLIC;

-- ── 3) admin_solic_salvar_tipo — para de reconhecer exige_referencia_conclusao ─
-- Mesma assinatura de 4 parâmetros (p_id, p_nome, p_campos, p_config) da 0210;
-- p_config passa a reconhecer SÓ exposto_via_api/api_roles_permitidas — a
-- coluna exige_referencia_conclusao fica ÓRFÃ (nunca mais lida/escrita aqui).
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

    INSERT INTO app.solicitacao_tipo (nome, criado_por, slug, exposto_via_api, api_roles_permitidas)
    VALUES (
      btrim(p_nome), app.uid_jwt(), v_slug,
      coalesce((p_config->>'exposto_via_api')::boolean, false),
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

-- ── 4) admin_solic_listar_tipos — para de emitir exige_referencia_conclusao ────
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

-- ── 5) solic_tipos_api — descoberta externa para de emitir exige_referencia_conclusao ─
CREATE OR REPLACE FUNCTION public.solic_tipos_api(p_chave_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_whitelist bigint[];
BEGIN
  SELECT whitelist_tipos INTO v_whitelist FROM app.api_chave WHERE id = p_chave_id AND ativo;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CHAVE_INVALIDA' USING ERRCODE = '42501';
  END IF;

  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'slug', t.slug,
      'nome', t.nome,
      'destinos', coalesce((
        SELECT jsonb_agg(jsonb_build_object('id', r.id, 'nome', r.nome) ORDER BY r.nome)
        FROM app.rbac_roles r WHERE r.id = ANY (t.api_roles_permitidas)
      ), '[]'::jsonb),
      'campos', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'chave', c.chave, 'rotulo', c.rotulo, 'tipo_campo', c.tipo_campo,
          'obrigatorio', c.obrigatorio, 'opcoes', c.opcoes,
          'data_permite_passado', c.data_permite_passado
        ) ORDER BY c.ordem)
        FROM app.solicitacao_campo c
        WHERE c.tipo_id = t.id AND c.tipo_campo <> 'anexo'
      ), '[]'::jsonb)
    ) ORDER BY t.nome)
    FROM app.solicitacao_tipo t
    WHERE NOT t.arquivado AND t.exposto_via_api AND t.id = ANY (v_whitelist)
  ), '[]'::jsonb);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.solic_tipos_api(bigint) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.solic_tipos_api(bigint) TO service_role;

-- ── 6) admin_solic_tipo_api_config — RPC NOVA: config de API de UM tipo ────────
-- A página "API externa" (/admin/api-externa, seção "Tipos expostos") chama
-- esta RPC para salvar exposto_via_api/api_roles_permitidas SEM re-gravar o
-- formulário do tipo (nome/campos) — antes disso vivia dentro de
-- admin_solic_salvar_tipo (p_config), que a partir desta migration só é
-- chamada pelo editor com p_config OMITIDO (DEFAULT NULL preserva o valor
-- atual — ver os ramos `p_config ? '...'` no item 3 acima).
CREATE OR REPLACE FUNCTION public.admin_solic_tipo_api_config(p_tipo_id bigint, p_exposto boolean, p_roles bigint[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_roles bigint[] := coalesce(p_roles, '{}'::bigint[]);
BEGIN
  PERFORM app.exigir_acesso(ARRAY['solicitacoes']);

  IF NOT EXISTS (SELECT 1 FROM app.solicitacao_tipo WHERE id = p_tipo_id) THEN
    RAISE EXCEPTION 'TIPO_INEXISTENTE' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM unnest(v_roles) r WHERE NOT EXISTS (SELECT 1 FROM app.rbac_roles WHERE id = r)
  ) THEN
    RAISE EXCEPTION 'ROLE_INVALIDA: id de permissão inexistente em api_roles_permitidas' USING ERRCODE = '22023';
  END IF;

  UPDATE app.solicitacao_tipo
     SET exposto_via_api      = coalesce(p_exposto, false),
         api_roles_permitidas = v_roles,
         atualizado_em        = now()
   WHERE id = p_tipo_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_solic_tipo_api_config(bigint, boolean, bigint[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_solic_tipo_api_config(bigint, boolean, bigint[]) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- DOWN (reversão manual; documentada, NÃO executada automaticamente):
-- ---------------------------------------------------------------------------
/*
-- 1) Restaura solic_concluir à assinatura de 2 parâmetros (0213) — reexecutar
--    o CREATE OR REPLACE tal como está naquele arquivo (inclui o DROP FUNCTION
--    IF EXISTS public.solic_concluir(bigint) antes, e os GRANT/REVOKE de lá).
DROP FUNCTION IF EXISTS public.solic_concluir(bigint);
-- (reexecutar o corpo da 0213, seção 6, a partir de "CREATE OR REPLACE FUNCTION public.solic_concluir(p_id bigint, p_referencia text DEFAULT NULL)")

-- 2) Restaura app.solic_json à versão da 0213 (com exige_referencia_conclusao/
--    referencia_conclusao) — reexecutar o CREATE OR REPLACE da 0213 (seção 8).

-- 3) Restaura admin_solic_salvar_tipo/admin_solic_listar_tipos à versão da
--    0210 (seções 5 e 6 daquele arquivo) — reexecutar os CREATE OR REPLACE tal
--    como estão lá.

-- 4) Restaura solic_tipos_api à versão da 0212 (seção 6) — reexecutar o
--    CREATE OR REPLACE tal como está lá.

-- 5) Remove a RPC nova.
DROP FUNCTION IF EXISTS public.admin_solic_tipo_api_config(bigint, boolean, bigint[]);

NOTIFY pgrst, 'reload schema';
*/
