-- ---------------------------------------------------------------------------
-- 0213 — feat(v5.4.0/M4): outbox de callbacks AT-LEAST-ONCE (ADR-0161) — a
-- movimentação (concluir/rejeitar/cancelar/criar) NUNCA falha por causa do
-- assinante externo; referência externa obrigatória na conclusão quando o TIPO
-- exigir; e correção do fan-out de e-mail da porta externa (solic_emails_
-- envolvidos_svc, sem exigir_acesso/pode_ver_solic — a rota HTTP não tem JWT
-- humano).
--
-- NUMERAÇÃO: definitiva (renumerada de 095x → 021x no checklist de merge da v5.4.0,
-- 2026-07-28; histórico remoto realinhado via `supabase migration repair`).
-- DECLARAÇÃO PRÉVIA (regime aditivo / autônomo):
--   • O QUE FAZ: (1) tabela nova app.api_outbox (fila de callbacks, RLS-fechada,
--     sem policy); (2) 1 coluna nova ANULÁVEL em app.solicitacao
--     (referencia_conclusao); (3) app.api_outbox_enfileirar — helper interno que
--     INSERE na outbox só para solicitações de ORIGEM EXTERNA (origem_chave_id
--     NOT NULL; interna = no-op); (4)/(5) criar_solicitacao_externa e
--     cancelar_solicitacao_externa (CREATE OR REPLACE, MESMA assinatura da
--     0212) passam a enfileirar 'solicitacao.criada'/'solicitacao.cancelada' NA
--     MESMA transação da movimentação; (6) solic_concluir GANHA um 2º parâmetro
--     (p_referencia text DEFAULT NULL — DROP+CREATE, troca de assinatura,
--     chamador antigo com só p_id continua funcionando por causa do DEFAULT) e
--     passa a exigir referência quando o TIPO tiver exige_referencia_conclusao;
--     solic_rejeitar/solic_cancelar (CREATE OR REPLACE, MESMA assinatura) só
--     ganham o enfileiramento; (7) app.solic_json (CREATE OR REPLACE, MESMA
--     assinatura) passa a EMITIR exige_referencia_conclusao/referencia_conclusao
--     — consumido por solic_caixa/solic_minhas/solic_detalhe sem mudança de
--     contrato (chaves NOVAS, nenhuma removida); (8) api_outbox_reivindicar/
--     api_outbox_resultado — RPCs de RUNTIME service_role-only (o processador
--     de entrega, de outra peça desta missão, as chama); (9)
--     solic_emails_envolvidos_svc — variante service_role-only de
--     solic_emails_envolvidos (0212), SEM exigir_acesso/pode_ver_solic; (10)
--     agendamento pg_cron (*/5min) reaproveitando os MESMOS secrets do Vault já
--     criados para o Monde (0182) — monde_cron_secret/monde_app_url SÃO o
--     CRON_SECRET/URL do app, compartilhados entre as duas integrações
--     agendadas; não há nada "Monde" sobre eles além do nome histórico, e não se
--     cria um 2º par de secrets para a MESMA credencial.
--   • ADITIVA / RETROCOMPATÍVEL com a `main` viva: CREATE TABLE nova, ADD COLUMN
--     anulável, CREATE FUNCTION novas, e CREATE OR REPLACE que só ACRESCENTA
--     comportamento (enfileiramento best-effort-transacional; novas chaves no
--     JSON de solic_json) sem remover nada do caminho existente. O ÚNICO DROP
--     FUNCTION (solic_concluir, troca de assinatura) é aceito como WARN pelo
--     classificador do db-gate — não é destrutivo: nenhum dado é removido, e o
--     chamador antigo (só p_id) continua funcionando idêntico via DEFAULT NULL
--     em tipos que não exigem referência.
--   • NÃO ESCREVE em dados pré-existentes: nenhum UPDATE/backfill em linha já
--     existente (referencia_conclusao nasce NULL nas solicitações atuais).
-- ---------------------------------------------------------------------------

-- ── 1) app.api_outbox — fila de callbacks (at-least-once) ──────────────────────
CREATE TABLE app.api_outbox (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  chave_id        bigint NOT NULL REFERENCES app.api_chave(id),
  evento          text NOT NULL,
  solicitacao_id  bigint NOT NULL REFERENCES app.solicitacao(id),
  payload         jsonb NOT NULL,
  tentativas      integer NOT NULL DEFAULT 0,
  proximo_retry   timestamptz NOT NULL DEFAULT now(),
  status          text NOT NULL DEFAULT 'pendente'
                    CHECK (status IN ('pendente', 'entregue', 'esgotado')),
  ultimo_erro     text,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  entregue_em     timestamptz
);

-- Caminho quente do processador: busca pendentes prontos para (re)tentar.
CREATE INDEX idx_api_outbox_status_retry ON app.api_outbox (status, proximo_retry);
-- Auxiliar (cleanup/depuração por solicitação — ex.: testes de contrato).
CREATE INDEX idx_api_outbox_solicitacao ON app.api_outbox (solicitacao_id);

-- RLS deny-by-default (postura dos 6 schemas, 0123). Só RPCs SECURITY DEFINER
-- tocam esta tabela (owner postgres ignora RLS).
ALTER TABLE app.api_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app.api_outbox FROM PUBLIC, anon, authenticated;

-- ── 2) app.solicitacao — referência externa da conclusão ───────────────────────
ALTER TABLE app.solicitacao ADD COLUMN referencia_conclusao text;

-- ── 3) app.api_outbox_enfileirar — helper INTERNO (schema app, nunca exposta) ──
-- Chamado DENTRO da MESMA transação da movimentação (criar/concluir/rejeitar/
-- cancelar) — o evento nunca se perde nem nasce sem a movimentação de fato ter
-- acontecido. NO-OP se a solicitação for de origem INTERNA (origem_chave_id
-- NULL): a UI humana não gera callback nenhum.
CREATE OR REPLACE FUNCTION app.api_outbox_enfileirar(p_solicitacao_id bigint, p_evento text, p_extra jsonb DEFAULT '{}'::jsonb)
RETURNS void
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sol       app.solicitacao;
  v_destino   jsonb;
BEGIN
  SELECT * INTO v_sol FROM app.solicitacao WHERE id = p_solicitacao_id;
  IF NOT FOUND OR v_sol.origem_chave_id IS NULL THEN
    RETURN; -- interna: nunca gera callback.
  END IF;

  -- Destinatário: role (caso comum de criar_solicitacao_externa) OU usuário
  -- direto (defensivo — a criação externa hoje só atribui a roles, nunca a um
  -- usuário específico, mas o payload cobre os dois formatos por robustez).
  v_destino := CASE
    WHEN v_sol.destinatario_role_id IS NOT NULL THEN
      jsonb_build_object('id', v_sol.destinatario_role_id,
        'nome', (SELECT nome FROM app.rbac_roles WHERE id = v_sol.destinatario_role_id))
    ELSE
      jsonb_build_object('id', v_sol.destinatario_user_id,
        'nome', (SELECT coalesce(nullif(btrim(nome), ''), email)
                 FROM app.rbac_usuarios WHERE user_id = v_sol.destinatario_user_id))
  END;

  INSERT INTO app.api_outbox (chave_id, evento, solicitacao_id, payload)
  VALUES (
    v_sol.origem_chave_id, p_evento, p_solicitacao_id,
    jsonb_build_object(
      'evento',            p_evento,
      'solicitacao_id',    p_solicitacao_id,
      'referencia_origem', v_sol.referencia_origem,
      'tipo',              (SELECT slug FROM app.solicitacao_tipo WHERE id = v_sol.tipo_id),
      'status',            v_sol.status,
      'destinatario',      v_destino,
      'ocorrido_em',       now()
    ) || coalesce(p_extra, '{}'::jsonb)
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION app.api_outbox_enfileirar(bigint, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION app.api_outbox_enfileirar(bigint, text, jsonb) TO service_role;

-- ── 4) criar_solicitacao_externa — REEMITIDA (+ enfileira 'solicitacao.criada') ─
-- Corpo IDÊNTICO à 0212, exceto o PERFORM logo após o INSERT bem-sucedido —
-- NUNCA no ramo idempotente (idempotente:true retorna ANTES de chegar lá).
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

    -- v5.4.0/M4 (ADR-0161): enfileira o callback DE CRIAÇÃO na MESMA transação
    -- do INSERT acima — NUNCA no ramo idempotente (abaixo, EXCEPTION).
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

-- ── 5) cancelar_solicitacao_externa — REEMITIDA (+ enfileira 'solicitacao.cancelada') ─
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

  -- v5.4.0/M4 (ADR-0161): enfileira o callback DE CANCELAMENTO na MESMA
  -- transação do UPDATE acima.
  PERFORM app.api_outbox_enfileirar(p_solicitacao_id, 'solicitacao.cancelada', '{}'::jsonb);

  RETURN jsonb_build_object('ok', true, 'id', p_solicitacao_id, 'status', 'cancelada');
END;
$$;
REVOKE EXECUTE ON FUNCTION public.cancelar_solicitacao_externa(bigint, bigint) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.cancelar_solicitacao_externa(bigint, bigint) TO service_role;

-- ── 6) solic_concluir — NOVA ASSINATURA (p_referencia) ─────────────────────────
-- DROP + CREATE: adicionar um parâmetro muda a identidade da função (mesmo
-- padrão de admin_solic_salvar_tipo na 0210). O classificador do db-gate marca
-- este DROP como WARN (troca de assinatura), não destrutivo — aceito: nenhum
-- dado é removido, e o chamador antigo (só p_id) continua funcionando idêntico
-- via DEFAULT NULL (tipos sem exige_referencia_conclusao nunca sentem isto).
DROP FUNCTION public.solic_concluir(bigint);

CREATE OR REPLACE FUNCTION public.solic_concluir(p_id bigint, p_referencia text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_sol               app.solicitacao;
  v_exige_referencia  boolean;
  v_referencia        text;
BEGIN
  PERFORM app.exigir_acesso();
  SELECT * INTO v_sol FROM app.solicitacao WHERE id = p_id;
  IF NOT FOUND OR NOT app.pode_ver_solic(v_sol) THEN RAISE EXCEPTION 'NAO_ENCONTRADA' USING ERRCODE='42501'; END IF;
  IF v_sol.status <> 'aberta' THEN RAISE EXCEPTION 'TRANSICAO_ILEGAL: solicitação não está aberta' USING ERRCODE='22023'; END IF;
  IF NOT (app.sou_atendente(v_sol) OR v_sol.solicitante_id = app.uid_jwt()) THEN
    RAISE EXCEPTION 'PERMISSAO_NEGADA: só o atendente ou o solicitante pode concluir' USING ERRCODE='42501'; END IF;

  -- v5.4.0/M4 (ADR-0161): tipo com exige_referencia_conclusao exige uma
  -- referência externa (ex.: nº do lançamento) para concluir.
  SELECT exige_referencia_conclusao INTO v_exige_referencia
  FROM app.solicitacao_tipo WHERE id = v_sol.tipo_id;

  v_referencia := nullif(btrim(coalesce(p_referencia, '')), '');
  IF coalesce(v_exige_referencia, false) AND v_referencia IS NULL THEN
    RAISE EXCEPTION 'REFERENCIA_OBRIGATORIA: este tipo exige uma referência externa na conclusão' USING ERRCODE='22023';
  END IF;

  UPDATE app.solicitacao SET status='concluida', decidido_por=app.uid_jwt(), decidido_em=now(),
    referencia_conclusao = v_referencia
  WHERE id=p_id;

  -- Enfileira o callback DE CONCLUSÃO — api_outbox_enfileirar já é no-op para
  -- solicitação de origem INTERNA (a maioria; a UI humana não sente nada disto).
  PERFORM app.api_outbox_enfileirar(p_id, 'solicitacao.concluida', jsonb_build_object('referencia', v_referencia));

  RETURN jsonb_build_object('ok', true);
END; $function$;
REVOKE EXECUTE ON FUNCTION public.solic_concluir(bigint, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.solic_concluir(bigint, text) TO authenticated, service_role;

-- ── 7) solic_rejeitar / solic_cancelar — REEMITIDAS (+ enfileiramento) ─────────
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

  PERFORM app.api_outbox_enfileirar(p_id, 'solicitacao.rejeitada', jsonb_build_object('justificativa', btrim(p_justificativa)));

  RETURN jsonb_build_object('ok', true);
END; $function$;
REVOKE EXECUTE ON FUNCTION public.solic_rejeitar(bigint, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.solic_rejeitar(bigint, text) TO authenticated, service_role;

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

  PERFORM app.api_outbox_enfileirar(p_id, 'solicitacao.cancelada', '{}'::jsonb);

  RETURN jsonb_build_object('ok', true);
END; $function$;
REVOKE EXECUTE ON FUNCTION public.solic_cancelar(bigint) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.solic_cancelar(bigint) TO authenticated, service_role;

-- ── 8) app.solic_json — REEMITIDA (+ exige_referencia_conclusao/referencia_conclusao) ─
-- Consumida por solic_caixa/solic_minhas/solic_detalhe — chaves NOVAS apenas
-- (nenhuma removida); .optional() no Zod do app absorve o rollout.
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
      FROM app.solicitacao_anexo a WHERE a.solicitacao_id = p_sol.id), '[]'::jsonb),
    -- v5.4.0/M4 (ADR-0161): flag do TIPO (exige referência externa p/ concluir)
    -- + a referência já gravada (NULL se ainda não concluída ou tipo não exige).
    'exige_referencia_conclusao', coalesce((SELECT exige_referencia_conclusao FROM app.solicitacao_tipo WHERE id = p_sol.tipo_id), false),
    'referencia_conclusao', p_sol.referencia_conclusao
  );
$$;
REVOKE EXECUTE ON FUNCTION app.solic_json(app.solicitacao) FROM PUBLIC;

-- ── 9) api_outbox_reivindicar / api_outbox_resultado — RUNTIME (service_role ONLY) ─
-- Chamadas pelo processador de entrega (src/lib/api-externa/outbox.ts, outra
-- peça desta missão) — nunca por um usuário da sessão web.
CREATE OR REPLACE FUNCTION public.api_outbox_reivindicar(p_limite integer DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_limite    integer := least(greatest(coalesce(p_limite, 20), 1), 100);
  v_ids       bigint[];
  v_resultado jsonb;
BEGIN
  -- a) Claim atômico: trava (FOR UPDATE SKIP LOCKED) e coleta os ids das linhas
  -- pendentes e prontas (proximo_retry <= now()) — evita que o disparo INLINE
  -- (best-effort, logo após a movimentação) e a varredura do CRON processem o
  -- MESMO item ao mesmo tempo.
  SELECT array_agg(id) INTO v_ids FROM (
    SELECT id FROM app.api_outbox
    WHERE status = 'pendente' AND proximo_retry <= now()
    ORDER BY proximo_retry
    LIMIT v_limite
    FOR UPDATE SKIP LOCKED
  ) s;

  IF v_ids IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  -- b) Conta a tentativa em TODAS as linhas reivindicadas (mesmo as que serão
  -- esgotadas por chave inválida no passo c — refletir a tentativa é honesto
  -- com o histórico, ainda que o motivo do esgotamento não seja falha de rede).
  UPDATE app.api_outbox SET tentativas = tentativas + 1 WHERE id = ANY(v_ids);

  -- c) Itens de chave REVOGADA ou SEM callback_url NUNCA serão entregáveis:
  -- esgota direto (fora do ciclo de retry) e NÃO entram no resultado devolvido.
  UPDATE app.api_outbox o
     SET status = 'esgotado',
         ultimo_erro = 'chave de API revogada ou sem callback_url configurado'
    FROM app.api_chave c
   WHERE o.id = ANY(v_ids) AND o.chave_id = c.id AND (NOT c.ativo OR c.callback_url IS NULL);

  -- d) Resultado: só os itens ENTREGÁVEIS (ainda pendentes após o passo c).
  SELECT jsonb_agg(jsonb_build_object(
    'outbox_id',        o.id,
    'evento',           o.evento,
    'payload',          o.payload,
    'tentativas',       o.tentativas,
    'callback_url',     c.callback_url,
    'callback_segredo', c.callback_segredo
  )) INTO v_resultado
  FROM app.api_outbox o
  JOIN app.api_chave c ON c.id = o.chave_id
  WHERE o.id = ANY(v_ids) AND o.status = 'pendente';

  RETURN coalesce(v_resultado, '[]'::jsonb);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.api_outbox_reivindicar(integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.api_outbox_reivindicar(integer) TO service_role;

-- Sucesso = 2xx no POST de callback (decidido pelo CALLER, não aqui); qualquer
-- outra coisa é falha e agenda retry com backoff exponencial (2^tentativas
-- minutos, teto 240min/8 tentativas → esgotado).
CREATE OR REPLACE FUNCTION public.api_outbox_resultado(p_id bigint, p_sucesso boolean, p_erro text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tentativas integer;
BEGIN
  SELECT tentativas INTO v_tentativas FROM app.api_outbox WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NAO_ENCONTRADA: item de outbox inexistente' USING ERRCODE = '22023';
  END IF;

  IF p_sucesso THEN
    UPDATE app.api_outbox
       SET status = 'entregue', entregue_em = now(), ultimo_erro = NULL
     WHERE id = p_id;
  ELSIF v_tentativas >= 8 THEN
    UPDATE app.api_outbox
       SET status = 'esgotado', ultimo_erro = coalesce(p_erro, 'falha desconhecida')
     WHERE id = p_id;
  ELSE
    -- 1 << v_tentativas = 2^tentativas (inteiro, sem cast) — make_interval exige mins int.
    UPDATE app.api_outbox
       SET status = 'pendente',
           proximo_retry = now() + make_interval(mins => least(1 << v_tentativas, 240)),
           ultimo_erro = coalesce(p_erro, 'falha desconhecida')
     WHERE id = p_id;
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.api_outbox_resultado(bigint, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.api_outbox_resultado(bigint, boolean, text) TO service_role;

-- ── 10) solic_emails_envolvidos_svc — fan-out SEM JWT humano (service_role ONLY) ─
-- Idêntica à solic_emails_envolvidos (0212: autor só entra se ATIVO), MENOS
-- exigir_acesso/pode_ver_solic — a porta externa (rotas /api/externo/*) não tem
-- sessão de usuário (chave de API, não JWT Supabase); a variante gated sempre
-- negaria aqui. EXCLUSIVA do handler server-side dessas rotas (GRANT abaixo).
CREATE OR REPLACE FUNCTION public.solic_emails_envolvidos_svc(p_id bigint)
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
  SELECT * INTO v_sol FROM app.solicitacao WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NAO_ENCONTRADA' USING ERRCODE = '42501';
  END IF;

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
REVOKE EXECUTE ON FUNCTION public.solic_emails_envolvidos_svc(bigint) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.solic_emails_envolvidos_svc(bigint) TO service_role;

-- ── 11) pg_cron — varredura da outbox a cada 5 minutos ─────────────────────────
-- REAPROVEITA os MESMOS secrets do Vault já criados para o Monde (0182):
-- monde_cron_secret = CRON_SECRET do app; monde_app_url = URL de produção do
-- app. São o CRON_SECRET/URL COMPARTILHADOS entre as integrações agendadas —
-- não há nada específico de Monde neles além do nome histórico; NÃO criar um
-- 2º par de secrets para a MESMA credencial. Extensões já habilitadas pela
-- 0182 (IF NOT EXISTS, idempotente, inofensivo repetir aqui).
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('api-outbox-processar')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'api-outbox-processar');

SELECT cron.schedule(
  'api-outbox-processar',
  '*/5 * * * *',
  $cron$
    SELECT net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'monde_app_url')
             || '/api/externo/outbox/processar',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'monde_cron_secret'),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
  $cron$
);

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- DOWN (reversão manual; documentada, NÃO executada automaticamente):
-- ---------------------------------------------------------------------------
/*
-- 1) Remove o agendamento (mantém as extensões, inofensivas — também usadas pelo Monde).
SELECT cron.unschedule('api-outbox-processar');

-- 2) Restaura solic_emails_envolvidos_svc / api_outbox_resultado / api_outbox_reivindicar.
DROP FUNCTION IF EXISTS public.solic_emails_envolvidos_svc(bigint);
DROP FUNCTION IF EXISTS public.api_outbox_resultado(bigint, boolean, text);
DROP FUNCTION IF EXISTS public.api_outbox_reivindicar(integer);

-- 3) Restaura app.solic_json à versão da 0130 (sem os 2 campos novos).
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

-- 4) Restaura solic_rejeitar/solic_cancelar/solic_concluir (defs-vivas, produção
--    2026-07-21 — anteriores a esta migration). solic_concluir volta a p_id ÚNICO.
CREATE OR REPLACE FUNCTION public.solic_rejeitar(p_id bigint, p_justificativa text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
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

CREATE OR REPLACE FUNCTION public.solic_cancelar(p_id bigint)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
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

DROP FUNCTION IF EXISTS public.solic_concluir(bigint, text);
CREATE OR REPLACE FUNCTION public.solic_concluir(p_id bigint)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
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
END; $function$;

REVOKE EXECUTE ON FUNCTION public.solic_rejeitar(bigint, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.solic_rejeitar(bigint, text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.solic_cancelar(bigint) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.solic_cancelar(bigint) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.solic_concluir(bigint) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.solic_concluir(bigint) TO authenticated, service_role;

-- 5) Restaura criar_solicitacao_externa/cancelar_solicitacao_externa à versão
--    da 0212 (sem enfileiramento) — ver corpo na própria 0212.
--    (reexecutar o CREATE OR REPLACE da 0212 tal como está naquele arquivo)

-- 6) Remove o helper de enfileiramento.
DROP FUNCTION IF EXISTS app.api_outbox_enfileirar(bigint, text, jsonb);

-- 7) Remove a coluna de referência da conclusão.
ALTER TABLE app.solicitacao DROP COLUMN IF EXISTS referencia_conclusao;

-- 8) Remove a tabela da outbox.
DROP TABLE IF EXISTS app.api_outbox;

NOTIFY pgrst, 'reload schema';
*/
