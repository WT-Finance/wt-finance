-- ---------------------------------------------------------------------------
-- 0216 — feat(v5.4.0/Round3): EXTIRPA a lista branca de equipes POR TIPO
-- (`api_roles_permitidas`) na criação via API — decisão do Yan (2026-07-29):
-- o fluxo humano nunca restringiu destino por tipo (na tela, qualquer tipo vai
-- para qualquer equipe); manter a API mais estrita que a UI era assimetria sem
-- razão, e o Janus é dono do formato. O que PERMANECE integralmente: o
-- `destinatario` continua OBRIGATÓRIO no disparo, resolvido por id numérico OU
-- nome de role, validado contra as roles EXISTENTES (equipe inexistente →
-- `DESTINATARIO_INVALIDO`, erro estruturado, nunca fallback — ver Emenda no
-- ADR-0160) e ECOADO na resposta/callbacks. O que cai é só a checagem
-- adicional "e precisa estar na lista deste tipo" (`DESTINATARIO_NAO_
-- PERMITIDO`, que deixa de existir).
--
-- DECLARAÇÃO PRÉVIA (regime aditivo / autônomo):
--   • O QUE FAZ: (1) `criar_solicitacao_externa` (CREATE OR REPLACE, MESMA
--     assinatura de 8 params, herdando o corpo vivo da 0213) perde o bloco que
--     validava a role resolvida contra `api_roles_permitidas` do TIPO — o
--     resto (chave ativa, idempotência obrigatória + resolução idempotente
--     antecipada, tipo por slug + whitelist DA CHAVE — essa PERMANECE —,
--     destinatário obrigatório/resolvido, data_limite, bloqueio de anexo
--     obrigatório, conversão chave→campo_id, validação compartilhada, INSERT,
--     unique_violation, enfileiramento do outbox, retorno) é preservado
--     VERBATIM; (2) `solic_tipos_api` (CREATE OR REPLACE, mesma assinatura)
--     — o campo `destinos` de cada tipo passa a listar TODAS as roles de
--     `app.rbac_roles` (não mais filtradas por tipo); (3) `admin_solic_tipo_
--     api_config` — NOVA ASSINATURA (2 parâmetros: perde `p_roles bigint[]`)
--     — DROP + CREATE, mesmo padrão de troca de assinatura das migrations
--     anteriores desta feature; passa a atualizar só `exposto_via_api`; (4)
--     `admin_solic_listar_tipos` (CREATE OR REPLACE, mesma assinatura) para de
--     emitir a chave `api_roles_permitidas`; (5) `admin_solic_salvar_tipo`
--     (CREATE OR REPLACE, mesma assinatura de 4 params) para de reconhecer
--     `api_roles_permitidas` em `p_config` (e a validação `ROLE_INVALIDA` que
--     só servia a ele) — `exposto_via_api` continua configurável por ali.
--   • ADITIVA / RETROCOMPATÍVEL com a `main` viva: o único `DROP FUNCTION` é
--     troca de ASSINATURA (`admin_solic_tipo_api_config`: 3 params → 2) — o
--     classificador do db-gate marca isso como WARN, não destrutivo (nenhum
--     dado é removido). Todo `CREATE OR REPLACE` restante preserva a
--     assinatura; a única mudança observável é (a) a REMOÇÃO de uma checagem
--     que hoje RECUSA um destinatário que antes seria aceito pela UI — a
--     mudança AFROUXA a API para igualá-la ao fluxo humano, nunca aperta; e
--     (b) a REMOÇÃO de uma chave de JSON (`api_roles_permitidas` em `admin_
--     solic_listar_tipos`) que o consumidor Zod trata como `.optional()`.
--     A coluna `app.solicitacao_tipo.api_roles_permitidas` fica ÓRFÃ a partir
--     desta migration — nenhuma função lê ou escreve nela daqui em diante. Ela
--     se junta às DUAS colunas já órfãs da 0215 (`app.solicitacao_tipo.
--     exige_referencia_conclusao`, `app.solicitacao.referencia_conclusao`):
--     o DROP das TRÊS é o MESMO patch destrutivo separado, pós-merge (skill
--     banco-e-rpc: destrutiva não fica na pasta `supabase/migrations/` antes
--     da hora de aplicar).
--   • NÃO ESCREVE em dados pré-existentes: nenhum UPDATE/backfill em linha já
--     existente.
-- ---------------------------------------------------------------------------

-- ── 1) criar_solicitacao_externa — REEMITIDA: destino LIVRE por role ───────────
-- Corpo herdado da 0213 (última versão viva). ÚNICA mudança: o passo e) deixa
-- de checar a role resolvida contra `api_roles_permitidas` do TIPO — qualquer
-- role EXISTENTE (app.rbac_roles) é destino válido, desde que a CHAVE esteja
-- autorizada para o TIPO (whitelist da chave, passo d, PERMANECE intocado).
-- destinatario continua OBRIGATÓRIO, resolvido por id numérico OU nome de
-- role (case-insensitive, btrim), com erro estruturado (DESTINATARIO_
-- OBRIGATORIO/DESTINATARIO_INVALIDO) e SEM fallback — ver Emenda no ADR-0160.
CREATE OR REPLACE FUNCTION public.criar_solicitacao_externa(
  p_chave_id           bigint,
  p_tipo_slug          text,
  p_destinatario       text,
  p_titulo             text,
  p_campos             jsonb,
  p_data_limite        date,
  p_chave_idempotencia text,
  p_referencia_origem  text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_chave_whitelist   bigint[];
  v_chave_robo        uuid;
  v_tipo_id           bigint;
  v_role_id           bigint;
  v_par               record;
  v_campo_id          bigint;
  v_respostas         jsonb := '{}'::jsonb;
  v_snap              jsonb;
  v_id                bigint;
  v_status            text;
  v_existente_id       bigint;
  v_existente_status   text;
  v_existente_role_id  bigint;
BEGIN
  -- a) Chave ativa.
  SELECT whitelist_tipos, robo_user_id INTO v_chave_whitelist, v_chave_robo
  FROM app.api_chave WHERE id = p_chave_id AND ativo;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CHAVE_INVALIDA' USING ERRCODE = '42501';
  END IF;

  -- b) Idempotência obrigatória.
  IF coalesce(btrim(p_chave_idempotencia), '') = '' THEN
    RAISE EXCEPTION 'IDEMPOTENCIA_OBRIGATORIA: informe uma chave de idempotência' USING ERRCODE = '22023';
  END IF;

  -- c) Reenvio idempotente: já existe registro para (chave, idempotência) →
  -- devolve o ack do EXISTENTE, sem criar nada nem revalidar o payload atual.
  SELECT s.id, s.status, s.destinatario_role_id
    INTO v_existente_id, v_existente_status, v_existente_role_id
  FROM app.solicitacao s
  WHERE s.origem_chave_id = p_chave_id AND s.chave_idempotencia = p_chave_idempotencia;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true, 'id', v_existente_id, 'status', v_existente_status,
      'destinatario', jsonb_build_object(
        'id', v_existente_role_id,
        'nome', (SELECT nome FROM app.rbac_roles WHERE id = v_existente_role_id)
      ),
      'idempotente', true
    );
  END IF;

  -- d) Tipo por SLUG: existe, não arquivado, exposto via API, e autorizado
  -- para ESTA chave (whitelist DA CHAVE — permanece; é diferente da lista por
  -- tipo que esta migration remove).
  SELECT id INTO v_tipo_id
  FROM app.solicitacao_tipo
  WHERE slug = p_tipo_slug AND NOT arquivado AND exposto_via_api;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TIPO_INVALIDO: tipo inexistente, arquivado ou não exposto via API' USING ERRCODE = '22023';
  END IF;
  IF NOT (v_tipo_id = ANY (v_chave_whitelist)) THEN
    RAISE EXCEPTION 'TIPO_NAO_AUTORIZADO: esta chave não está autorizada para este tipo' USING ERRCODE = '42501';
  END IF;

  -- e) Destinatário OBRIGATÓRIO: id numérico OU nome de role (case-insensitive,
  -- btrim) — nunca os dois, nunca fallback para um destino default. v5.4.0/
  -- Round3 (decisão do Yan, 2026-07-29): QUALQUER role existente é destino
  -- válido — a restrição adicional por TIPO foi REVOGADA (ver Emenda no
  -- ADR-0160).
  IF coalesce(btrim(p_destinatario), '') = '' THEN
    RAISE EXCEPTION 'DESTINATARIO_OBRIGATORIO: informe o destinatário (id ou nome da permissão)' USING ERRCODE = '22023';
  END IF;

  IF btrim(p_destinatario) ~ '^[0-9]+$' THEN
    v_role_id := btrim(p_destinatario)::bigint;
    IF NOT EXISTS (SELECT 1 FROM app.rbac_roles WHERE id = v_role_id) THEN
      RAISE EXCEPTION 'DESTINATARIO_INVALIDO: permissão inexistente' USING ERRCODE = '22023';
    END IF;
  ELSE
    SELECT id INTO v_role_id FROM app.rbac_roles WHERE lower(btrim(nome)) = lower(btrim(p_destinatario));
    IF v_role_id IS NULL THEN
      RAISE EXCEPTION 'DESTINATARIO_INVALIDO: permissão inexistente' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- f) Data-limite obrigatória.
  IF p_data_limite IS NULL THEN
    RAISE EXCEPTION 'DATA_LIMITE_OBRIGATORIA' USING ERRCODE = '22023';
  END IF;

  -- g) Anexos fora do MVP: tipo com campo anexo OBRIGATÓRIO não é criável via API.
  IF EXISTS (
    SELECT 1 FROM app.solicitacao_campo
    WHERE tipo_id = v_tipo_id AND tipo_campo = 'anexo' AND obrigatorio
  ) THEN
    RAISE EXCEPTION 'TIPO_EXIGE_ANEXO: criação via API indisponível para este tipo' USING ERRCODE = '22023';
  END IF;

  -- Conversão CHAVE → campo_id: p_campos vem keyed por chave de campo.
  FOR v_par IN SELECT key, value FROM jsonb_each_text(coalesce(p_campos, '{}'::jsonb))
  LOOP
    SELECT id INTO v_campo_id FROM app.solicitacao_campo WHERE tipo_id = v_tipo_id AND chave = v_par.key;
    IF v_campo_id IS NULL THEN
      RAISE EXCEPTION 'CAMPO_DESCONHECIDO: %', v_par.key USING ERRCODE = '22023';
    END IF;
    v_respostas := v_respostas || jsonb_build_object(v_campo_id::text, v_par.value);
  END LOOP;

  -- h) Validação COMPARTILHADA (mesma função usada por criar_solicitacao).
  v_snap := app.solic_validar_e_snapshotar(v_tipo_id, v_respostas, '[]'::jsonb);

  -- i)/j) INSERT — corrida de idempotência: se outra chamada concorrente com a
  -- MESMA (chave, idempotência) venceu a corrida do índice único, devolvemos o
  -- registro dela em vez de propagar o erro.
  BEGIN
    INSERT INTO app.solicitacao (
      tipo_id, solicitante_id, destinatario_user_id, destinatario_role_id,
      data_limite, descricao, respostas, status,
      origem_chave_id, chave_idempotencia, referencia_origem
    ) VALUES (
      v_tipo_id, v_chave_robo, NULL, v_role_id,
      p_data_limite, nullif(btrim(coalesce(p_titulo, '')), ''), v_snap, 'aberta',
      p_chave_id, p_chave_idempotencia, p_referencia_origem
    )
    RETURNING id INTO v_id;

    -- Enfileira o callback DE CRIAÇÃO na MESMA transação do INSERT acima —
    -- NUNCA no ramo idempotente (abaixo, EXCEPTION).
    PERFORM app.api_outbox_enfileirar(v_id, 'solicitacao.criada', '{}'::jsonb);
  EXCEPTION WHEN unique_violation THEN
    SELECT s.id, s.status INTO v_id, v_status
    FROM app.solicitacao s
    WHERE s.origem_chave_id = p_chave_id AND s.chave_idempotencia = p_chave_idempotencia;
    RETURN jsonb_build_object(
      'ok', true, 'id', v_id, 'status', v_status,
      'destinatario', jsonb_build_object('id', v_role_id, 'nome', (SELECT nome FROM app.rbac_roles WHERE id = v_role_id)),
      'idempotente', true
    );
  END;

  -- k) Retorno.
  RETURN jsonb_build_object(
    'ok', true, 'id', v_id, 'status', 'aberta',
    'destinatario', jsonb_build_object('id', v_role_id, 'nome', (SELECT nome FROM app.rbac_roles WHERE id = v_role_id)),
    'idempotente', false
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.criar_solicitacao_externa(bigint, text, text, text, jsonb, date, text, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.criar_solicitacao_externa(bigint, text, text, text, jsonb, date, text, text) TO service_role;

-- ── 2) solic_tipos_api — `destinos` passa a listar TODAS as roles ─────────────
-- Antes: filtrado por api_roles_permitidas do tipo. Agora: qualquer role de
-- app.rbac_roles é destino válido (mesma regra do fluxo humano) — o array
-- `destinos` de CADA tipo devolve a lista COMPLETA, ordenada por nome.
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
      'destinos', (
        SELECT coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'nome', r.nome) ORDER BY r.nome), '[]'::jsonb)
        FROM app.rbac_roles r
      ),
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

-- ── 3) admin_solic_tipo_api_config — NOVA ASSINATURA (2 parâmetros) ────────────
-- DROP + CREATE: remover um parâmetro muda a identidade da função (mesmo
-- padrão de solic_concluir/admin_solic_salvar_tipo nas migrations anteriores
-- desta feature). O classificador do db-gate marca este DROP como WARN
-- (troca de assinatura), não destrutivo — nenhum dado é removido. A página
-- "Tipos expostos" (/admin/chaves-api) passa a chamar só com (p_tipo_id,
-- p_exposto) — a lista de roles do tipo deixa de existir como conceito.
DROP FUNCTION IF EXISTS public.admin_solic_tipo_api_config(bigint, boolean, bigint[]);

CREATE FUNCTION public.admin_solic_tipo_api_config(p_tipo_id bigint, p_exposto boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['solicitacoes']);

  IF NOT EXISTS (SELECT 1 FROM app.solicitacao_tipo WHERE id = p_tipo_id) THEN
    RAISE EXCEPTION 'TIPO_INEXISTENTE' USING ERRCODE = '22023';
  END IF;

  UPDATE app.solicitacao_tipo
     SET exposto_via_api = coalesce(p_exposto, false),
         atualizado_em   = now()
   WHERE id = p_tipo_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_solic_tipo_api_config(bigint, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_solic_tipo_api_config(bigint, boolean) TO authenticated, service_role;

-- ── 4) admin_solic_listar_tipos — deixa de emitir api_roles_permitidas ─────────
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

-- ── 5) admin_solic_salvar_tipo — para de reconhecer api_roles_permitidas ───────
-- Mesma assinatura de 4 parâmetros; p_config passa a reconhecer SÓ
-- exposto_via_api — api_roles_permitidas fica ÓRFÃ (nunca mais lida/escrita
-- aqui). A validação ROLE_INVALIDA, que só existia para checar essa lista,
-- também sai.
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
BEGIN
  PERFORM app.exigir_acesso(ARRAY['solicitacoes']);
  IF p_nome IS NULL OR length(btrim(p_nome)) = 0 THEN RAISE EXCEPTION 'NOME_OBRIGATORIO' USING ERRCODE='22023'; END IF;

  IF p_id IS NULL THEN
    -- Criação: slug gerado do nome — dedup contra os já existentes. NUNCA muda depois.
    v_base_slug := app.slugificar(p_nome);
    v_slug := v_base_slug;
    v_sufixo := 1;
    WHILE EXISTS (SELECT 1 FROM app.solicitacao_tipo WHERE slug = v_slug) LOOP
      v_sufixo := v_sufixo + 1;
      v_slug := v_base_slug || '_' || v_sufixo;
    END LOOP;

    INSERT INTO app.solicitacao_tipo (nome, criado_por, slug, exposto_via_api)
    VALUES (
      btrim(p_nome), app.uid_jwt(), v_slug,
      coalesce((p_config->>'exposto_via_api')::boolean, false)
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
        THEN coalesce((p_config->>'exposto_via_api')::boolean, exposto_via_api) ELSE exposto_via_api END
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

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- DOWN (reversão manual; documentada, NÃO executada automaticamente):
-- ---------------------------------------------------------------------------
/*
-- 1) Restaura criar_solicitacao_externa à versão da 0213 (valida a role
--    resolvida contra api_roles_permitidas do TIPO) — reexecutar o CREATE OR
--    REPLACE tal como está naquele arquivo (seção 4).

-- 2) Restaura solic_tipos_api à versão da 0215 (destinos filtrados por
--    api_roles_permitidas do tipo) — reexecutar o CREATE OR REPLACE tal como
--    está naquele arquivo (seção 5).

-- 3) Restaura admin_solic_tipo_api_config à assinatura de 3 parâmetros (0215)
--    — corpo curto, inlinado aqui.
DROP FUNCTION IF EXISTS public.admin_solic_tipo_api_config(bigint, boolean);

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

-- 4) Restaura admin_solic_listar_tipos à versão da 0215 (com api_roles_permitidas)
--    — reexecutar o CREATE OR REPLACE tal como está naquele arquivo (seção 4).

-- 5) Restaura admin_solic_salvar_tipo à versão da 0215 (reconhece
--    api_roles_permitidas em p_config) — reexecutar o CREATE OR REPLACE tal
--    como está naquele arquivo (seção 3).

NOTIFY pgrst, 'reload schema';
*/
