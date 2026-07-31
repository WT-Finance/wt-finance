-- ---------------------------------------------------------------------------
-- 0222 — refactor(v5.4.0/Round5): REMOVE os callbacks de saída — o Janus deixa de
-- chamar ninguém; quem quer saber, consulta.
--
-- Decisão do Yan (2026-07-31), depois de discutir o trade-off: "se os callbacks
-- forem desnecessários com o endpoint de consulta vamos removê-los, nós somos
-- donos do formato, não devemos precisar mandar nada de volta, os outros sistemas
-- que devem nos consultar" → "vamos seguir com a remoção".
--
-- POR QUE isto é simplificação e não perda: o webhook era a única peça que
-- obrigava o OUTRO lado a construir e proteger infraestrutura (endereço público,
-- validação de segredo, tolerância a evento repetido) e a única que nos obrigava a
-- manter fila, cron de 5 minutos, retentativa com espera crescente e um segredo
-- por chave. Com a consulta (0221) o integrador descobre o desfecho perguntando —
-- e o modo de falha que o push criava (fila desiste após 8 tentativas → evento
-- perdido para sempre) simplesmente deixa de existir: não há entrega para falhar.
-- O preço, registrado: a pontualidade passa a ser inteiramente responsabilidade da
-- plataforma de origem — enquanto ela não consultar, ninguém do lado dela sabe.
-- Ver ADR-0161 (superado por esta migration).
--
-- DECLARAÇÃO PRÉVIA (regime aditivo / autônomo):
--   • O QUE FAZ: reescreve 9 funções para PARAREM de usar a fila e os campos de
--     callback. Nada é apagado aqui — a tabela `app.api_outbox`, as 3 RPCs da fila,
--     o cron e as colunas `callback_url`/`callback_segredo` continuam existindo,
--     inertes, até o patch DESTRUTIVO que só o Yan aplica (TTY).
--   • COMO OS CORPOS FORAM OBTIDOS (isto importa): não foram copiados à mão das
--     migrations antigas. Extraí o corpo VIVO de produção via
--     `pg_get_functiondef` e removi cirurgicamente só as linhas do enfileiramento
--     (+ os comentários que só falavam dele), conferindo o diff linha a linha —
--     garantia mais forte que transcrição manual de 180 linhas. Por isso o estilo
--     (`$function$`, indentação) difere do resto do repo: é o texto que o Postgres
--     tem, não uma reescrita.
--   • PERDEM O `PERFORM app.api_outbox_enfileirar` (5): `solic_concluir`,
--     `solic_rejeitar`, `solic_cancelar` (as três do fluxo HUMANO — a única
--     mudança é deixar de enfileirar; nenhuma regra de permissão ou transição foi
--     tocada), `criar_solicitacao_externa` e `cancelar_solicitacao_externa`.
--   • PERDEM OS CAMPOS DE CALLBACK (4): `api_chave_listar` (para de emitir
--     `callback_url`/`tem_callback_segredo`), `api_chave_resolver` (para de
--     devolver `callback_url`/`callback_segredo` ao runtime),
--     `api_chave_registrar` (6 → 4 params) e `api_chave_atualizar` (4 → 2).
--     Estas duas últimas são troca de ASSINATURA: `DROP FUNCTION` + `CREATE` —
--     o classificador do db-gate marca como WARN, não destrutivo (nenhum dado sai).
--   • RETROCOMPATIBILIDADE com a `main` viva: nula por vacuidade — a tela de chaves
--     e as rotas externas existem só nesta branch, e não há NENHUMA chave emitida
--     (`app.api_chave` vazia), então nenhum integrador real perde nada. As três
--     RPCs humanas eram no-op de fila para solicitação interna (a esmagadora
--     maioria), então a UI humana não sente diferença.
--   • DOWN: reaplicar as definições das migrations 0213/0216/0217/0211 (as versões
--     com enfileiramento e com os campos de callback).
-- ---------------------------------------------------------------------------

-- ═══ Funções reescritas a partir do corpo VIVO (pg_get_functiondef), sem o
-- ═══ enfileiramento e sem os campos de callback. Ver nota no header.

CREATE OR REPLACE FUNCTION public.solic_cancelar(p_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
END; $function$;

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

  -- conclusão foi EXTIRPADO (ver Emenda no ADR-0161).

  RETURN jsonb_build_object('ok', true);
END; $function$;

CREATE OR REPLACE FUNCTION public.solic_rejeitar(p_id bigint, p_justificativa text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
END; $function$;

CREATE OR REPLACE FUNCTION public.cancelar_solicitacao_externa(p_chave_id bigint, p_solicitacao_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.criar_solicitacao_externa(p_chave_id bigint, p_tipo_slug text, p_destinatario text, p_titulo text, p_campos jsonb, p_data_limite date, p_chave_idempotencia text, p_referencia_origem text DEFAULT NULL::text, p_solicitante_email text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  v_existente_id                 bigint;
  v_existente_status             text;
  v_existente_role_id            bigint;
  v_existente_solicitante_email  text;
  v_existente_solicitante_nome   text;
  v_email             text;
  v_solicitante       uuid;
  v_solicitante_nome  text;
  v_solicitante_email text;  -- e-mail CADASTRADO (o ack ecoa este, não a normalização do payload)
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
  -- v5.4.0/Round4: o ack ecoa também o SOLICITANTE da solicitação existente
  -- (join em rbac_usuarios pelo solicitante_id já gravado) — nunca o e-mail
  -- desta chamada (que pode nem bater, num reenvio tardio).
  SELECT s.id, s.status, s.destinatario_role_id, u.email, u.nome
    INTO v_existente_id, v_existente_status, v_existente_role_id,
         v_existente_solicitante_email, v_existente_solicitante_nome
  FROM app.solicitacao s
  LEFT JOIN app.rbac_usuarios u ON u.user_id = s.solicitante_id
  WHERE s.origem_chave_id = p_chave_id AND s.chave_idempotencia = p_chave_idempotencia;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true, 'id', v_existente_id, 'status', v_existente_status,
      'destinatario', jsonb_build_object(
        'id', v_existente_role_id,
        'nome', (SELECT nome FROM app.rbac_roles WHERE id = v_existente_role_id)
      ),
      'solicitante', jsonb_build_object('email', v_existente_solicitante_email, 'nome', v_existente_solicitante_nome),
      'idempotente', true
    );
  END IF;

  -- d) Tipo por SLUG: existe, não arquivado, exposto via API, e autorizado
  -- para ESTA chave (whitelist DA CHAVE).
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
  -- btrim) — nunca os dois, nunca fallback para um destino default. QUALQUER
  -- role existente é destino válido (destino livre, 0216).
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

  -- e2) Solicitante OBRIGATÓRIO — v5.4.0/Round4 (decisão do Yan, 2026-07-30):
  -- precisa ser o e-mail de um usuário JÁ cadastrado e ATIVO na plataforma;
  -- esse usuário vira o SOLICITANTE de verdade (solicitante_id), não mais o
  -- robô da chave. Sem isso a solicitação não aparece em "Minhas
  -- solicitações" de ninguém, não notifica quem pediu de fato, e ninguém
  -- consegue cancelá-la pela tela — por isso é bloqueante, igual ao
  -- destinatário.
  v_email := lower(btrim(coalesce(p_solicitante_email, '')));
  IF v_email = '' THEN
    RAISE EXCEPTION 'SOLICITANTE_OBRIGATORIO: informe o e-mail (já cadastrado na plataforma) de quem está pedindo' USING ERRCODE = '22023';
  END IF;
  -- Comparação case-insensitive com btrim (o integrador não precisa acertar a caixa);
  -- o ack devolve o e-mail COMO ESTÁ CADASTRADO (v_solicitante_email), que é a
  -- identidade real na plataforma, não o que veio no payload.
  SELECT user_id, nome, email INTO v_solicitante, v_solicitante_nome, v_solicitante_email
  FROM app.rbac_usuarios WHERE lower(email) = v_email AND ativo;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SOLICITANTE_INVALIDO: % não tem cadastro ativo na plataforma', v_email USING ERRCODE = '22023';
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
  -- registro dela em vez de propagar o erro. `solicitante_id` passa a ser o
  -- USUÁRIO REAL resolvido acima (v_solicitante) — antes era o robô da chave
  -- (v_chave_robo, agora só lido para a checagem de chave ativa em (a)).
  BEGIN
    INSERT INTO app.solicitacao (
      tipo_id, solicitante_id, destinatario_user_id, destinatario_role_id,
      data_limite, descricao, respostas, status,
      origem_chave_id, chave_idempotencia, referencia_origem
    ) VALUES (
      v_tipo_id, v_solicitante, NULL, v_role_id,
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
      'solicitante', jsonb_build_object('email', v_solicitante_email, 'nome', v_solicitante_nome),
      'idempotente', true
    );
  END;

  -- k) Retorno.
  RETURN jsonb_build_object(
    'ok', true, 'id', v_id, 'status', 'aberta',
    'destinatario', jsonb_build_object('id', v_role_id, 'nome', (SELECT nome FROM app.rbac_roles WHERE id = v_role_id)),
    'solicitante', jsonb_build_object('email', v_solicitante_email, 'nome', v_solicitante_nome),
    'idempotente', false
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.api_chave_listar()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['solicitacoes']);
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id',                 c.id,
      'plataforma',         c.plataforma,
      'whitelist_tipos',    coalesce((
        SELECT jsonb_agg(jsonb_build_object('id', t.id, 'nome', t.nome) ORDER BY t.nome)
        FROM app.solicitacao_tipo t
        WHERE t.id = ANY (c.whitelist_tipos)
      ), '[]'::jsonb),
      'robo', jsonb_build_object(
        'user_id', u.user_id, 'email', u.email, 'nome', u.nome
      ),
      'ativo',             c.ativo,
      'criado_em',         c.criado_em,
      'revogado_em',       c.revogado_em,
      'ultima_chamada_em', (SELECT max(l.criado_em) FROM app.api_chamada_log l WHERE l.chave_id = c.id)
    ) ORDER BY c.criado_em DESC)
    FROM app.api_chave c
    JOIN app.rbac_usuarios u ON u.user_id = c.robo_user_id
  ), '[]'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.api_chave_resolver(p_segredo_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v jsonb;
BEGIN
  SELECT jsonb_build_object(
    'id',               c.id,
    'plataforma',       c.plataforma,
    'whitelist_tipos',  to_jsonb(c.whitelist_tipos),
    'robo_user_id',     c.robo_user_id
  ) INTO v
  FROM app.api_chave c
  WHERE c.segredo_hash = p_segredo_hash AND c.ativo;

  RETURN v; -- NULL quando não encontrada/revogada.
END;
$function$;

-- ── api_chave_registrar — 6 → 4 parâmetros (perde url e segredo de callback) ───
DROP FUNCTION IF EXISTS public.api_chave_registrar(text, text, text, text, bigint[], uuid);

CREATE FUNCTION public.api_chave_registrar(p_plataforma text, p_segredo_hash text, p_whitelist bigint[], p_robo_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_plataforma text := btrim(coalesce(p_plataforma, ''));
  v_invalidos  bigint[];
  v_id         bigint;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['solicitacoes']);

  IF v_plataforma = '' THEN
    RAISE EXCEPTION 'PLATAFORMA_OBRIGATORIA: informe o nome da plataforma' USING ERRCODE = '22023';
  END IF;
  IF coalesce(btrim(p_segredo_hash), '') = '' THEN
    RAISE EXCEPTION 'SEGREDO_OBRIGATORIO: segredo ausente' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM app.api_chave WHERE plataforma = v_plataforma) THEN
    RAISE EXCEPTION 'PLATAFORMA_EM_USO: já existe uma chave para esta plataforma' USING ERRCODE = '22023';
  END IF;

  SELECT array_agg(x) INTO v_invalidos
  FROM unnest(coalesce(p_whitelist, '{}'::bigint[])) x
  WHERE NOT EXISTS (SELECT 1 FROM app.solicitacao_tipo st WHERE st.id = x);
  IF v_invalidos IS NOT NULL THEN
    RAISE EXCEPTION 'TIPO_INVALIDO: %', array_to_string(v_invalidos, ', ') USING ERRCODE = '22023';
  END IF;

  INSERT INTO app.api_chave (
    plataforma, segredo_hash, whitelist_tipos, robo_user_id, criado_por
  ) VALUES (
    v_plataforma, p_segredo_hash,
    coalesce(p_whitelist, '{}'::bigint[]), p_robo_user_id, app.uid_jwt()
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.api_chave_registrar(text, text, bigint[], uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.api_chave_registrar(text, text, bigint[], uuid) TO authenticated, service_role;

-- ── api_chave_atualizar — 4 → 2 parâmetros (só a whitelist sobra) ─────────────
DROP FUNCTION IF EXISTS public.api_chave_atualizar(bigint, text, text, bigint[]);

CREATE FUNCTION public.api_chave_atualizar(p_id bigint, p_whitelist bigint[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ativo     boolean;
  v_invalidos bigint[];
BEGIN
  PERFORM app.exigir_acesso(ARRAY['solicitacoes']);

  SELECT ativo INTO v_ativo FROM app.api_chave WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NAO_ENCONTRADA: chave inexistente' USING ERRCODE = '22023';
  END IF;
  IF NOT v_ativo THEN
    RAISE EXCEPTION 'CHAVE_REVOGADA: chave revogada não pode ser editada' USING ERRCODE = '22023';
  END IF;

  SELECT array_agg(x) INTO v_invalidos
  FROM unnest(coalesce(p_whitelist, '{}'::bigint[])) x
  WHERE NOT EXISTS (SELECT 1 FROM app.solicitacao_tipo st WHERE st.id = x);
  IF v_invalidos IS NOT NULL THEN
    RAISE EXCEPTION 'TIPO_INVALIDO: %', array_to_string(v_invalidos, ', ') USING ERRCODE = '22023';
  END IF;

  UPDATE app.api_chave
     SET whitelist_tipos = coalesce(p_whitelist, '{}'::bigint[])
   WHERE id = p_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.api_chave_atualizar(bigint, bigint[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.api_chave_atualizar(bigint, bigint[]) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
