-- ---------------------------------------------------------------------------
-- 0212 — feat(v5.4.0/M3a): validação COMPARTILHADA de Solicitações (extraída
-- de criar_solicitacao) + RPCs de RUNTIME da API externa (criar, cancelar,
-- descobrir tipos) + fan-out de e-mail deixa de convocar o autor-robô.
--
-- NUMERAÇÃO: definitiva (renumerada de 095x → 021x no checklist de merge da v5.4.0,
-- 2026-07-28; histórico remoto realinhado via `supabase migration repair`).
-- DECLARAÇÃO PRÉVIA (regime aditivo / autônomo):
--   • O QUE FAZ: (1) 3 colunas novas ANULÁVEIS em app.solicitacao
--     (origem_chave_id, chave_idempotencia, referencia_origem) + índice único
--     parcial de idempotência; (2) extrai o loop de validação/snapshot de
--     `criar_solicitacao` para `app.solic_validar_e_snapshotar` (função nova,
--     schema app — nunca exposta via REST), corpo IDÊNTICO ao vigente; (3)
--     `criar_solicitacao` (CREATE OR REPLACE, MESMA assinatura de 7 params)
--     passa a delegar a validação à função extraída — nenhuma regra muda,
--     REGRESSÃO ZERO é invariante desta migration; (4) 3 RPCs novas,
--     service_role-ONLY, para a rota HTTP da API externa (de outra missão):
--     `criar_solicitacao_externa`, `cancelar_solicitacao_externa`,
--     `solic_tipos_api`; (5) `solic_emails_envolvidos` (CREATE OR REPLACE,
--     mesma assinatura) deixa de incluir o e-mail do autor quando ele está
--     INATIVO em app.rbac_usuarios (usuário-robô, ADR referenciada abaixo).
--   • ADITIVA / RETROCOMPATÍVEL com a `main` viva: só ADD COLUMN (todas
--     anuláveis, sem DEFAULT que mude linha existente), CREATE FUNCTION nova
--     e CREATE OR REPLACE que preserva assinatura e todo o comportamento
--     anterior para os chamadores existentes (o único CREATE OR REPLACE que
--     muda uma saída observável é solic_emails_envolvidos, e a mudança é
--     estritamente uma EXCLUSÃO de um e-mail que hoje só existe para
--     usuários-robô — nenhum usuário humano ativo é afetado, e nenhum robô
--     ainda existe em produção nesta migration, pois a criação de chaves/robôs
--     é da 0211, sem dado ainda inserido).
--   • NÃO ESCREVE em dados pré-existentes: nenhum UPDATE/backfill acontece
--     nesta migration.
-- ---------------------------------------------------------------------------

-- ── 1) app.solicitacao — colunas de ORIGEM EXTERNA (todas anuláveis) ───────────
-- origem_chave_id: qual chave de API criou a solicitação (NULL = criada pela UI
-- humana, o caminho de sempre). chave_idempotencia: token do integrador —
-- reenviar a MESMA (origem_chave_id, chave_idempotencia) nunca duplica.
-- referencia_origem: id/nº do objeto no sistema de origem (auditoria/rastreio,
-- não usado pela plataforma além de exibição).
ALTER TABLE app.solicitacao
  ADD COLUMN origem_chave_id      bigint REFERENCES app.api_chave(id),
  ADD COLUMN chave_idempotencia   text,
  ADD COLUMN referencia_origem    text;

CREATE UNIQUE INDEX idx_solicitacao_idempotencia_uniq
  ON app.solicitacao (origem_chave_id, chave_idempotencia)
  WHERE origem_chave_id IS NOT NULL AND chave_idempotencia IS NOT NULL;

-- ── 2) app.solic_validar_e_snapshotar — validação COMPARTILHADA ────────────────
-- Extraída VERBATIM do loop de `criar_solicitacao` (defs-vivas, produção
-- 2026-07-21): campos obrigatórios (anexo × demais tipos), formato de
-- numero/moeda, formato de data + regra `data_permite_passado` (comparando com
-- o "hoje" de São Paulo, igual ao vigente — a sessão do PostgREST já roda no
-- fuso de SP, 0152), seleção contida em `opcoes`, e o snapshot montado na ORDEM
-- do admin (`ORDER BY ordem`) com os mesmos campos do JSON.
--
-- AS DUAS PORTAS (humana, via `criar_solicitacao`, e externa, via
-- `criar_solicitacao_externa`) validam AQUI — mudar uma regra é mudar para
-- AMBAS de uma vez. Não reimplementar este loop em nenhum outro lugar.
--
-- Vive no schema `app` (não `public`): nunca é exposta como RPC via REST
-- (config.toml só expõe public/graphql_public) — é helper interno, chamado só
-- por outras funções SECURITY DEFINER do próprio banco.
CREATE OR REPLACE FUNCTION app.solic_validar_e_snapshotar(p_tipo_id bigint, p_respostas jsonb, p_anexos jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_campo     record;
  v_val       text;
  v_snap      jsonb := '[]'::jsonb;
  v_tem_anexo boolean;
BEGIN
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

  RETURN v_snap;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.solic_validar_e_snapshotar(bigint, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION app.solic_validar_e_snapshotar(bigint, jsonb, jsonb) TO service_role;

-- ── 3) criar_solicitacao — MESMA assinatura; loop de validação delegado ────────
-- Idêntica à vigente (defs-vivas) em TUDO: exigir_acesso, uid, tipo válido,
-- XOR de destinatário, alvo válido/ativo, data_limite obrigatória, INSERT,
-- anexos, retorno. A ÚNICA mudança é o corpo do loop de validação, que agora
-- vive em app.solic_validar_e_snapshotar (item 2 acima). Comportamento
-- observável: ZERO diferença.
CREATE OR REPLACE FUNCTION public.criar_solicitacao(p_tipo_id bigint, p_destinatario_user_id uuid, p_destinatario_role_id bigint, p_data_limite date, p_descricao text, p_respostas jsonb, p_anexos jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid    uuid;
  v_snap   jsonb;
  v_id     bigint;
  v_anexo  jsonb;
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

  -- Validação dinâmica + snapshot (ordem do admin) — v5.4.0: delegada à função
  -- COMPARTILHADA app.solic_validar_e_snapshotar (também usada por
  -- criar_solicitacao_externa). Mudar regra = mudar as DUAS portas de uma vez.
  v_snap := app.solic_validar_e_snapshotar(p_tipo_id, p_respostas, p_anexos);

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
END; $function$;
REVOKE EXECUTE ON FUNCTION public.criar_solicitacao(bigint, uuid, bigint, date, text, jsonb, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.criar_solicitacao(bigint, uuid, bigint, date, text, jsonb, jsonb) TO authenticated, service_role;

-- ── 4) criar_solicitacao_externa — RPC de RUNTIME (service_role ONLY) ──────────
-- Porta EXTERNA de criação: a rota HTTP (outra missão) resolve a chave de API,
-- hasheia o segredo e chama esta função. p_campos vem KEYED POR CHAVE de campo
-- (ex.: {"valor": "1500,00"}), nunca por campo_id (a chave é o contrato
-- estável com o integrador; campo_id é interno/instável). Anexos estão FORA do
-- MVP: tipo com campo anexo OBRIGATÓRIO não pode ser criado via API.
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
  v_tipo_roles        bigint[];
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
  -- para ESTA chave (whitelist).
  SELECT id, api_roles_permitidas INTO v_tipo_id, v_tipo_roles
  FROM app.solicitacao_tipo
  WHERE slug = p_tipo_slug AND NOT arquivado AND exposto_via_api;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TIPO_INVALIDO: tipo inexistente, arquivado ou não exposto via API' USING ERRCODE = '22023';
  END IF;
  IF NOT (v_tipo_id = ANY (v_chave_whitelist)) THEN
    RAISE EXCEPTION 'TIPO_NAO_AUTORIZADO: esta chave não está autorizada para este tipo' USING ERRCODE = '42501';
  END IF;

  -- e) Destinatário OBRIGATÓRIO: id numérico OU nome de role (case-insensitive,
  -- btrim) — nunca os dois, nunca fallback para um destino default. O id
  -- resolvido precisa estar em api_roles_permitidas do TIPO.
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

  IF NOT (v_role_id = ANY (v_tipo_roles)) THEN
    RAISE EXCEPTION 'DESTINATARIO_NAO_PERMITIDO: % não é destino autorizado para este tipo', p_destinatario USING ERRCODE = '22023';
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

-- ── 5) cancelar_solicitacao_externa — RPC de RUNTIME (service_role ONLY) ───────
-- Só cancela solicitação que a PRÓPRIA chave criou (origem_chave_id = p_chave_id)
-- — não vaza existência de solicitações de outras origens (NAO_ENCONTRADA
-- cobre tanto "não existe" quanto "existe mas não é sua", sem oráculo).
CREATE OR REPLACE FUNCTION public.cancelar_solicitacao_externa(p_chave_id bigint, p_solicitacao_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_robo_user_id uuid;
  v_sol          app.solicitacao;
BEGIN
  SELECT robo_user_id INTO v_robo_user_id FROM app.api_chave WHERE id = p_chave_id AND ativo;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CHAVE_INVALIDA' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_sol FROM app.solicitacao WHERE id = p_solicitacao_id AND origem_chave_id = p_chave_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NAO_ENCONTRADA' USING ERRCODE = '42501';
  END IF;

  IF v_sol.status <> 'aberta' THEN
    RAISE EXCEPTION 'CONFLITO_ESTADO: %', v_sol.status USING ERRCODE = '22023';
  END IF;

  UPDATE app.solicitacao
     SET status = 'cancelada', decidido_por = v_robo_user_id, decidido_em = now()
   WHERE id = p_solicitacao_id;

  RETURN jsonb_build_object('ok', true, 'id', p_solicitacao_id, 'status', 'cancelada');
END;
$$;
REVOKE EXECUTE ON FUNCTION public.cancelar_solicitacao_externa(bigint, bigint) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.cancelar_solicitacao_externa(bigint, bigint) TO service_role;

-- ── 6) solic_tipos_api — descoberta (GET) de tipos habilitados p/ a chave ──────
-- Só tipos NÃO arquivados, expostos via API e autorizados na whitelist da
-- chave. Campos do tipo 'anexo' NÃO entram (fora do MVP da API).
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
      'exige_referencia_conclusao', t.exige_referencia_conclusao,
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

-- ── 7) solic_emails_envolvidos — fan-out ignora o AUTOR quando é o robô ────────
-- Idêntica à vigente, exceto: o e-mail do AUTOR só entra na lista se ele
-- estiver ATIVO em app.rbac_usuarios. Destinatário-usuário e membros de role
-- preservam o comportamento vigente (a role já filtrava `ativo`; usuário
-- destinatário direto não filtrava antes e continua não filtrando).
CREATE OR REPLACE FUNCTION public.solic_emails_envolvidos(p_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_sol    app.solicitacao;
  v_emails text[];
  v_fmt    constant text := 'DD/MM/YYYY" às "HH24:MI';   -- "23/06/2026 às 10:04"
BEGIN
  PERFORM app.exigir_acesso();                       -- autenticado ATIVO (barra anon/inativo)

  SELECT * INTO v_sol FROM app.solicitacao WHERE id = p_id;
  -- Gate único (padrão solic_detalhe): inexistente E proibido dão o MESMO erro (sem oráculo).
  IF NOT FOUND OR NOT app.pode_ver_solic(v_sol) THEN
    RAISE EXCEPTION 'NAO_ENCONTRADA' USING ERRCODE = '42501';
  END IF;

  -- Envolvidos (DISTINCT): autor (só se ATIVO) + destinatário usuário (sempre)
  -- OU membros ATIVOS da role destinatária. SÓ os e-mails desta solicitação
  -- (nunca um diretório).
  -- v5.4.0: autor-robô (ativo=false) fica fora do fan-out — o recibo da
  -- integração é o ack síncrono + callbacks (ADR-0161).
  SELECT array_agg(DISTINCT e) INTO v_emails FROM (
    SELECT email AS e FROM app.rbac_usuarios
      WHERE user_id = v_sol.solicitante_id AND ativo
    UNION
    SELECT email FROM app.rbac_usuarios
      WHERE v_sol.destinatario_user_id IS NOT NULL AND user_id = v_sol.destinatario_user_id
    UNION
    SELECT email FROM app.rbac_usuarios
      WHERE v_sol.destinatario_role_id IS NOT NULL AND role_id = v_sol.destinatario_role_id AND ativo
  ) s
  WHERE e IS NOT NULL;

  RETURN jsonb_build_object(
    'tipo_nome', (SELECT nome FROM app.solicitacao_tipo WHERE id = v_sol.tipo_id),
    -- nome do solicitante (fallback e-mail se sem nome cadastrado)
    'autor_rotulo', (SELECT coalesce(nullif(btrim(nome), ''), email)
                     FROM app.rbac_usuarios WHERE user_id = v_sol.solicitante_id),
    -- destinatário: nome da role OU nome (fallback e-mail) do usuário
    'atribuido_rotulo', CASE
      WHEN v_sol.destinatario_user_id IS NOT NULL
        THEN (SELECT coalesce(nullif(btrim(nome), ''), email)
              FROM app.rbac_usuarios WHERE user_id = v_sol.destinatario_user_id)
      ELSE (SELECT nome FROM app.rbac_roles WHERE id = v_sol.destinatario_role_id)
    END,
    'criado_em_fmt',   to_char(v_sol.criado_em AT TIME ZONE 'America/Sao_Paulo', v_fmt),
    'decidido_em_fmt', CASE WHEN v_sol.decidido_em IS NOT NULL
                            THEN to_char(v_sol.decidido_em AT TIME ZONE 'America/Sao_Paulo', v_fmt)
                            ELSE NULL END,
    'envolvidos_emails', coalesce(to_jsonb(v_emails), '[]'::jsonb)
  );
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.solic_emails_envolvidos(bigint) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.solic_emails_envolvidos(bigint) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- DOWN (reversão manual; documentada, NÃO executada automaticamente):
-- ---------------------------------------------------------------------------
/*
-- 1) Restaura solic_emails_envolvidos à versão anterior (autor sempre entra).
CREATE OR REPLACE FUNCTION public.solic_emails_envolvidos(p_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_sol    app.solicitacao;
  v_emails text[];
  v_fmt    constant text := 'DD/MM/YYYY" às "HH24:MI';
BEGIN
  PERFORM app.exigir_acesso();

  SELECT * INTO v_sol FROM app.solicitacao WHERE id = p_id;
  IF NOT FOUND OR NOT app.pode_ver_solic(v_sol) THEN
    RAISE EXCEPTION 'NAO_ENCONTRADA' USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(DISTINCT e) INTO v_emails FROM (
    SELECT email AS e FROM app.rbac_usuarios
      WHERE user_id = v_sol.solicitante_id
    UNION
    SELECT email FROM app.rbac_usuarios
      WHERE v_sol.destinatario_user_id IS NOT NULL AND user_id = v_sol.destinatario_user_id
    UNION
    SELECT email FROM app.rbac_usuarios
      WHERE v_sol.destinatario_role_id IS NOT NULL AND role_id = v_sol.destinatario_role_id AND ativo
  ) s
  WHERE e IS NOT NULL;

  RETURN jsonb_build_object(
    'tipo_nome', (SELECT nome FROM app.solicitacao_tipo WHERE id = v_sol.tipo_id),
    'autor_rotulo', (SELECT coalesce(nullif(btrim(nome), ''), email)
                     FROM app.rbac_usuarios WHERE user_id = v_sol.solicitante_id),
    'atribuido_rotulo', CASE
      WHEN v_sol.destinatario_user_id IS NOT NULL
        THEN (SELECT coalesce(nullif(btrim(nome), ''), email)
              FROM app.rbac_usuarios WHERE user_id = v_sol.destinatario_user_id)
      ELSE (SELECT nome FROM app.rbac_roles WHERE id = v_sol.destinatario_role_id)
    END,
    'criado_em_fmt',   to_char(v_sol.criado_em AT TIME ZONE 'America/Sao_Paulo', v_fmt),
    'decidido_em_fmt', CASE WHEN v_sol.decidido_em IS NOT NULL
                            THEN to_char(v_sol.decidido_em AT TIME ZONE 'America/Sao_Paulo', v_fmt)
                            ELSE NULL END,
    'envolvidos_emails', coalesce(to_jsonb(v_emails), '[]'::jsonb)
  );
END;
$function$;

-- 2) Remove as RPCs de runtime da API externa.
DROP FUNCTION IF EXISTS public.solic_tipos_api(bigint);
DROP FUNCTION IF EXISTS public.cancelar_solicitacao_externa(bigint, bigint);
DROP FUNCTION IF EXISTS public.criar_solicitacao_externa(bigint, text, text, text, jsonb, date, text, text);

-- 3) Restaura criar_solicitacao à versão anterior (validação inline, defs-vivas
--    produção 2026-07-21 — anterior a esta migration).
CREATE OR REPLACE FUNCTION public.criar_solicitacao(p_tipo_id bigint, p_destinatario_user_id uuid, p_destinatario_role_id bigint, p_data_limite date, p_descricao text, p_respostas jsonb, p_anexos jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  IF NOT EXISTS (SELECT 1 FROM app.solicitacao_tipo WHERE id = p_tipo_id AND NOT arquivado) THEN
    RAISE EXCEPTION 'TIPO_INVALIDO: tipo inexistente ou arquivado' USING ERRCODE='22023';
  END IF;

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

  FOR v_anexo IN SELECT * FROM jsonb_array_elements(coalesce(p_anexos,'[]'::jsonb))
  LOOP
    INSERT INTO app.solicitacao_anexo (solicitacao_id, campo_id, storage_path, nome_arquivo, mime, tamanho_bytes, criado_por)
    VALUES (v_id, nullif(v_anexo->>'campo_id','')::bigint, v_anexo->>'storage_path',
            v_anexo->>'nome_arquivo', v_anexo->>'mime', (v_anexo->>'tamanho_bytes')::bigint, v_uid);
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END; $function$;

-- 4) Remove a função de validação compartilhada.
DROP FUNCTION IF EXISTS app.solic_validar_e_snapshotar(bigint, jsonb, jsonb);

-- 5) Remove índice + colunas de origem externa.
DROP INDEX IF EXISTS app.idx_solicitacao_idempotencia_uniq;
ALTER TABLE app.solicitacao
  DROP COLUMN IF EXISTS origem_chave_id,
  DROP COLUMN IF EXISTS chave_idempotencia,
  DROP COLUMN IF EXISTS referencia_origem;

NOTIFY pgrst, 'reload schema';
*/
