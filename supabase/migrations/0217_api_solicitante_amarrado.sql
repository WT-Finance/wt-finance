-- ---------------------------------------------------------------------------
-- 0217 — feat(v5.4.0/Round4): o disparo pela API passa a EXIGIR o e-mail de um
-- usuário cadastrado e ATIVO na plataforma, que vira o SOLICITANTE de verdade
-- da solicitação — decisão do Yan (2026-07-30): quem pediu no sistema de
-- origem some em "Minhas solicitações", recebe os e-mails de movimentação e
-- pode cancelar pela tela (os três já são efeito de `solicitante_id`, via
-- `solic_minhas`/`solic_cancelar`/`solic_json`/`solic_concluir` — nenhuma
-- dessas RPCs muda nesta migration). A proveniência NÃO se perde: a
-- solicitação continua marcada com `origem_chave_id`; `app.solic_json` passa a
-- emitir a chave `origem` (plataforma da chave), base do selo "via integração
-- X" que a UI (outra missão) exibe.
--
-- DECLARAÇÃO PRÉVIA (regime aditivo / autônomo):
--   • O QUE FAZ: (1) área RBAC NOVA `solicitacoes/documentacao` (catálogo,
--     INSERT idempotente) — usada pela página/documentação da API na
--     plataforma (outra missão faz a UI; aqui só nasce a área); (2)
--     `criar_solicitacao_externa` — NOVA ASSINATURA (DROP da versão de 8
--     parâmetros da 0216 + CREATE com um 9º parâmetro
--     `p_solicitante_email text DEFAULT NULL`) — resolve o e-mail contra
--     `app.rbac_usuarios` (ativo=true), grava `solicitante_id` com o
--     USUÁRIO REAL (antes era sempre o robô da chave) e ecoa `solicitante`
--     (email/nome) no retorno, inclusive no ramo idempotente; e-mail
--     ausente/sem cadastro ativo → erro estruturado
--     (SOLICITANTE_OBRIGATORIO/SOLICITANTE_INVALIDO), nunca fallback para o
--     robô. TODO o resto do corpo (chave ativa, idempotência com retorno
--     antecipado do existente, tipo por slug + whitelist da chave,
--     destinatário obrigatório/resolvido sem fallback, data_limite, bloqueio
--     de anexo obrigatório, conversão chave→campo_id, validação
--     compartilhada, INSERT, unique_violation, enfileiramento do outbox)
--     é preservado VERBATIM; (3) `app.solic_json` (CREATE OR REPLACE, MESMA
--     assinatura) ganha a chave `origem` — `{ plataforma }` quando a
--     solicitação tiver `origem_chave_id`, senão `null`.
--   • ADITIVA / RETROCOMPATÍVEL com a `main` viva: o único `DROP FUNCTION` é
--     troca de ASSINATURA (`criar_solicitacao_externa`: 8 parâmetros → 9, o
--     novo com DEFAULT NULL) — o classificador do db-gate marca isso como
--     WARN, não destrutivo (nenhum dado é removido). O `CREATE OR REPLACE` de
--     `app.solic_json` só ACRESCENTA uma chave nova (`origem`) a um JSON já
--     existente — não remove nenhuma chave. A área RBAC nova é só um INSERT de
--     catálogo (`ON CONFLICT DO NOTHING`), sem grant a nenhum role ainda (quem
--     concede o acesso é o admin, depois, pelo editor de permissões — mesmo
--     padrão da 0127/0143). NOTA para o orquestrador: o consumidor Zod de
--     `solic_json` (`src/lib/solicitacoes/schemas.ts`, fora do escopo desta
--     missão) precisa tratar `origem` como opcional/desconhecida para este
--     acréscimo não quebrar o parse — conferir no gate de tsc/lint/test.
--   • NÃO ESCREVE em dados pré-existentes: nenhum UPDATE/DELETE/backfill em
--     linha já existente. Solicitações já criadas via API antes desta
--     migration continuam com `solicitante_id` = robô da chave (histórico
--     intocado); só as criações NOVAS passam a exigir e gravar o solicitante
--     real.
-- ---------------------------------------------------------------------------

-- ── 1) Área RBAC nova — 'solicitacoes/documentacao' ────────────────────────────
-- Catálogo (idempotente); mesmo grupo/faixa de ordem das outras áreas de
-- Solicitações (básico=53, gestão=54 — 0144). Nenhum grant automático: o admin
-- concede pelo editor de permissões, como toda área nova.
INSERT INTO app.rbac_areas (area, rotulo, grupo, ordem)
VALUES ('solicitacoes/documentacao', 'Solicitações (documentação)', 'Solicitações', 55)
ON CONFLICT (area) DO NOTHING;

-- ── 2) criar_solicitacao_externa — NOVA ASSINATURA: solicitante amarrado ───────
-- DROP + CREATE: acrescentar um parâmetro muda a identidade da função (mesmo
-- padrão de troca de assinatura das migrations anteriores desta feature). O
-- classificador do db-gate marca este DROP como WARN (troca de assinatura),
-- não destrutivo — nenhum dado é removido, e o `DEFAULT NULL` do novo
-- parâmetro é só para permitir a assinatura; SEM o e-mail a função RECUSA
-- (SOLICITANTE_OBRIGATORIO), nunca segue sem solicitante.
DROP FUNCTION IF EXISTS public.criar_solicitacao_externa(bigint, text, text, text, jsonb, date, text, text);

CREATE FUNCTION public.criar_solicitacao_externa(
  p_chave_id           bigint,
  p_tipo_slug          text,
  p_destinatario       text,
  p_titulo             text,
  p_campos             jsonb,
  p_data_limite        date,
  p_chave_idempotencia text,
  p_referencia_origem  text DEFAULT NULL,
  p_solicitante_email  text DEFAULT NULL
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
$$;
REVOKE EXECUTE ON FUNCTION public.criar_solicitacao_externa(bigint, text, text, text, jsonb, date, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.criar_solicitacao_externa(bigint, text, text, text, jsonb, date, text, text, text) TO service_role;

-- ── 3) app.solic_json — ganha a chave `origem` ─────────────────────────────────
-- Base do selo "via integração X" na UI (outra missão): quando a solicitação
-- tem origem_chave_id, devolve a plataforma da chave; senão null (solicitação
-- 100% interna, criada pela UI humana). Chave NOVA (não remove nenhuma) —
-- consumidores Zod tratam como opcional/desconhecida (ver nota no header).
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
    'origem', CASE
      WHEN p_sol.origem_chave_id IS NOT NULL
        THEN jsonb_build_object('plataforma', (SELECT plataforma FROM app.api_chave WHERE id = p_sol.origem_chave_id))
      ELSE NULL
    END,
    'anexos', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id',a.id,'campo_id',a.campo_id,'nome',a.nome_arquivo,'mime',a.mime,'tamanho',a.tamanho_bytes) ORDER BY a.id)
      FROM app.solicitacao_anexo a WHERE a.solicitacao_id = p_sol.id), '[]'::jsonb)
  );
$$;
REVOKE EXECUTE ON FUNCTION app.solic_json(app.solicitacao) FROM PUBLIC;

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- DOWN (reversão manual; documentada, NÃO executada automaticamente):
-- ---------------------------------------------------------------------------
/*
-- 1) Restaura criar_solicitacao_externa à assinatura de 8 parâmetros (0216) —
--    solicitante_id volta a ser sempre o robô da chave (v_chave_robo).
DROP FUNCTION IF EXISTS public.criar_solicitacao_externa(bigint, text, text, text, jsonb, date, text, text, text);

CREATE FUNCTION public.criar_solicitacao_externa(
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
  SELECT whitelist_tipos, robo_user_id INTO v_chave_whitelist, v_chave_robo
  FROM app.api_chave WHERE id = p_chave_id AND ativo;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CHAVE_INVALIDA' USING ERRCODE = '42501';
  END IF;

  IF coalesce(btrim(p_chave_idempotencia), '') = '' THEN
    RAISE EXCEPTION 'IDEMPOTENCIA_OBRIGATORIA: informe uma chave de idempotência' USING ERRCODE = '22023';
  END IF;

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

  SELECT id INTO v_tipo_id
  FROM app.solicitacao_tipo
  WHERE slug = p_tipo_slug AND NOT arquivado AND exposto_via_api;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TIPO_INVALIDO: tipo inexistente, arquivado ou não exposto via API' USING ERRCODE = '22023';
  END IF;
  IF NOT (v_tipo_id = ANY (v_chave_whitelist)) THEN
    RAISE EXCEPTION 'TIPO_NAO_AUTORIZADO: esta chave não está autorizada para este tipo' USING ERRCODE = '42501';
  END IF;

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

  IF p_data_limite IS NULL THEN
    RAISE EXCEPTION 'DATA_LIMITE_OBRIGATORIA' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM app.solicitacao_campo
    WHERE tipo_id = v_tipo_id AND tipo_campo = 'anexo' AND obrigatorio
  ) THEN
    RAISE EXCEPTION 'TIPO_EXIGE_ANEXO: criação via API indisponível para este tipo' USING ERRCODE = '22023';
  END IF;

  FOR v_par IN SELECT key, value FROM jsonb_each_text(coalesce(p_campos, '{}'::jsonb))
  LOOP
    SELECT id INTO v_campo_id FROM app.solicitacao_campo WHERE tipo_id = v_tipo_id AND chave = v_par.key;
    IF v_campo_id IS NULL THEN
      RAISE EXCEPTION 'CAMPO_DESCONHECIDO: %', v_par.key USING ERRCODE = '22023';
    END IF;
    v_respostas := v_respostas || jsonb_build_object(v_campo_id::text, v_par.value);
  END LOOP;

  v_snap := app.solic_validar_e_snapshotar(v_tipo_id, v_respostas, '[]'::jsonb);

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

  RETURN jsonb_build_object(
    'ok', true, 'id', v_id, 'status', 'aberta',
    'destinatario', jsonb_build_object('id', v_role_id, 'nome', (SELECT nome FROM app.rbac_roles WHERE id = v_role_id)),
    'idempotente', false
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.criar_solicitacao_externa(bigint, text, text, text, jsonb, date, text, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.criar_solicitacao_externa(bigint, text, text, text, jsonb, date, text, text) TO service_role;

-- 2) Restaura app.solic_json à versão da 0215 (sem a chave `origem`) —
--    reexecutar o CREATE OR REPLACE tal como está naquele arquivo (seção 2).

-- 3) Remove a área RBAC (SÓ se não tiver sido concedida a nenhum role — senão
--    remover primeiro os grants em app.rbac_role_permissoes).
-- DELETE FROM app.rbac_areas WHERE area = 'solicitacoes/documentacao';

NOTIFY pgrst, 'reload schema';
*/
