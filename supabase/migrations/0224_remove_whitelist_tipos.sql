-- ---------------------------------------------------------------------------
-- 0224 — refactor(v5.4.0/Round6): REMOVE a whitelist de tipos por chave — toda
-- chave de API alcança todo tipo exposto.
--
-- Decisão do Yan (2026-07-31): "retirar a whitelist de tipos da chave de API, cada
-- chave de API deve ter acesso a todos os tipos expostos, não precisamos de tanta
-- complexidade de restrições".
--
-- É a MESMA correção de assimetria do Round 3, um nível acima: lá caiu a lista de
-- equipes por tipo (a API era mais estrita que a tela); aqui cai a lista de tipos
-- por chave. O controle que RESTA é o que sempre bastou e é visível numa tela só:
-- `solicitacao_tipo.exposto_via_api` — o tipo está exposto ou não. Duas listas
-- brancas em série (tipo exposto E tipo na whitelist da chave) davam a impressão de
-- controle fino e na prática produziam um 403 difícil de diagnosticar do lado do
-- integrador para um tipo que a tela mostrava como exposto.
--
-- DECLARAÇÃO PRÉVIA (regime aditivo / autônomo):
--   • O QUE FAZ: reescreve 5 funções e DROPA 1.
--       - `solic_tipos_api(p_chave_id)`: a chave CONTINUA sendo validada (existe e
--         está ativa — a descoberta não é pública), mas a lista devolvida deixa de
--         ser filtrada por chave: todo tipo exposto e não arquivado aparece.
--       - `criar_solicitacao_externa`: sai a checagem que produzia
--         `TIPO_NAO_AUTORIZADO` (403) — esse erro DEIXA DE EXISTIR no contrato.
--         Saem também duas variáveis mortas: `v_chave_whitelist` e `v_chave_robo`
--         (o robô deixou de ser autor no Round4); a validação de chave ativa virou
--         um `PERFORM`.
--       - `api_chave_listar` / `api_chave_resolver`: param de emitir
--         `whitelist_tipos`.
--       - `api_chave_registrar`: 4 → 3 parâmetros (perde `p_whitelist`) — troca de
--         assinatura, `DROP`+`CREATE`, WARN no classificador.
--       - **`api_chave_atualizar` é DROPADA.** Consequência necessária, não escolha
--         minha: a whitelist era o ÚNICO campo editável de uma chave. Sem ela, a
--         função (e o modal "Editar chave", e o botão na tabela) não tinham o que
--         editar. Uma chave passa a ter dois estados na vida: criada e revogada.
--   • CORPOS obtidos do `pg_get_functiondef` VIVO com remoção cirúrgica e diff
--     conferido linha a linha (mesmo método da 0222) — não transcrição manual.
--   • A COLUNA `app.api_chave.whitelist_tipos` NÃO é apagada aqui: fica inerte até
--     o patch destrutivo `supabase/patches/PENDENTE-remover-whitelist-tipos.sql`,
--     que só o Yan aplica em TTY. Com 0 chaves emitidas, nada de valor há nela.
--   • DOWN: reaplicar as definições das 0211/0216/0217/0222 (as versões com
--     whitelist) e recriar `api_chave_atualizar`.
-- ---------------------------------------------------------------------------

-- ═══ Funções reescritas a partir do corpo VIVO (pg_get_functiondef). Ver header.

CREATE OR REPLACE FUNCTION public.solic_tipos_api(p_chave_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  -- A chave ainda é validada (precisa existir e estar ativa) — o que saiu foi a
  -- restrição POR TIPO: toda chave alcança todo tipo exposto.
  PERFORM 1 FROM app.api_chave WHERE id = p_chave_id AND ativo;
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
    WHERE NOT t.arquivado AND t.exposto_via_api
  ), '[]'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.criar_solicitacao_externa(p_chave_id bigint, p_tipo_slug text, p_destinatario text, p_titulo text, p_campos jsonb, p_data_limite date, p_chave_idempotencia text, p_referencia_origem text DEFAULT NULL::text, p_solicitante_email text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
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
  -- Chave ativa. Nada mais é lido dela: a whitelist por tipo saiu (Round6) e o robô
  -- deixou de ser autor no Round4 — o solicitante é a pessoa do e-mail.
  PERFORM 1 FROM app.api_chave WHERE id = p_chave_id AND ativo;
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

  -- d) Tipo por SLUG: existe, não arquivado e exposto via API. NÃO há mais
  -- restrição por chave (Round6): toda chave alcança todo tipo exposto.
  SELECT id INTO v_tipo_id
  FROM app.solicitacao_tipo
  WHERE slug = p_tipo_slug AND NOT arquivado AND exposto_via_api;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TIPO_INVALIDO: tipo inexistente, arquivado ou não exposto via API' USING ERRCODE = '22023';
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
    'robo_user_id',     c.robo_user_id
  ) INTO v
  FROM app.api_chave c
  WHERE c.segredo_hash = p_segredo_hash AND c.ativo;

  RETURN v; -- NULL quando não encontrada/revogada.
END;
$function$;

-- ── api_chave_registrar — 4 → 3 parâmetros (perde a whitelist) ────────────────
DROP FUNCTION IF EXISTS public.api_chave_registrar(text, text, bigint[], uuid);

CREATE FUNCTION public.api_chave_registrar(p_plataforma text, p_segredo_hash text, p_robo_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_plataforma text := btrim(coalesce(p_plataforma, ''));
  v_id         bigint;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['solicitacoes']);

  IF v_plataforma = '' THEN
    RAISE EXCEPTION 'PLATAFORMA_OBRIGATORIA: informe a referência da integração' USING ERRCODE = '22023';
  END IF;
  IF coalesce(btrim(p_segredo_hash), '') = '' THEN
    RAISE EXCEPTION 'SEGREDO_OBRIGATORIO: segredo ausente' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM app.api_chave WHERE plataforma = v_plataforma) THEN
    RAISE EXCEPTION 'PLATAFORMA_EM_USO: já existe uma chave com esta referência' USING ERRCODE = '22023';
  END IF;

  -- A validação de tipos saiu com a whitelist (Round6): não há mais lista a validar.
  INSERT INTO app.api_chave (plataforma, segredo_hash, robo_user_id, criado_por)
  VALUES (v_plataforma, p_segredo_hash, p_robo_user_id, app.uid_jwt())
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.api_chave_registrar(text, text, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.api_chave_registrar(text, text, uuid) TO authenticated, service_role;

-- ── api_chave_atualizar — DROPADA (sem whitelist, não há o que editar) ─────────
DROP FUNCTION IF EXISTS public.api_chave_atualizar(bigint, bigint[]);

-- ── Comentários desatualizados dentro do corpo das funções (pedido do Yan) ────
-- Não é cosmética à toa: comentário que descreve o mundo antigo mente para quem ler
-- o catálogo (`pg_get_functiondef`) em vez do repo. Varri TODAS as funções de `app`
-- e `public` por comentário citando outbox/callback/whitelist/referência de conclusão
-- /equipes por tipo/ADR em numeração provisória: eram 3 linhas, e uma delas a própria
-- 0224 já conserta (o bloco do tipo em criar_solicitacao_externa). As outras duas:
--   • consultar_solicitacoes_externas: citava "payload de callback, 0213" (o payload
--     não existe mais).
--   • solic_emails_envolvidos: dizia que o autor-robô fica FORA do fan-out porque o
--     recibo da integração são os callbacks (ADR-0953) — errado em TRÊS frentes: o
--     autor virou uma PESSOA ativa no Round4 (e portanto ENTRA no fan-out), os
--     callbacks morreram no Round5, e ADR-0953 era a numeração provisória de 0161.
--     A lógica (`AND ativo`) não muda — só a explicação, que agora diz a verdade.

CREATE OR REPLACE FUNCTION public.consultar_solicitacoes_externas(p_chave_id bigint, p_solicitacao_id bigint DEFAULT NULL::bigint, p_referencia_origem text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_ref text;
BEGIN
  -- a) Chave ativa (revogada não lê nada — mesmo critério do cancelamento).
  IF NOT EXISTS (SELECT 1 FROM app.api_chave WHERE id = p_chave_id AND ativo) THEN
    RAISE EXCEPTION 'CHAVE_INVALIDA' USING ERRCODE = '42501';
  END IF;

  -- b) Um critério é obrigatório: sem isso a chamada viraria "liste tudo o que
  -- essa chave já criou", que é outra funcionalidade (paginação, ordenação,
  -- volume) e não foi pedida.
  v_ref := nullif(btrim(coalesce(p_referencia_origem, '')), '');
  IF p_solicitacao_id IS NULL AND v_ref IS NULL THEN
    RAISE EXCEPTION 'CONSULTA_INVALIDA: informe o id da solicitação ou referencia_origem' USING ERRCODE = '22023';
  END IF;

  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id',                 s.id,
      'status',             s.status,
      'tipo',               (SELECT t.slug FROM app.solicitacao_tipo t WHERE t.id = s.tipo_id),
      'titulo',             s.descricao,
      -- Criação externa sempre endereça uma EQUIPE; o ramo de usuário é defensivo
      -- (a forma cobre os dois casos, como o board humano — a API nunca atribui a
      -- um usuário específico).
      'destinatario', CASE
        WHEN s.destinatario_role_id IS NOT NULL
          THEN jsonb_build_object('id', s.destinatario_role_id,
                 'nome', (SELECT r.nome FROM app.rbac_roles r WHERE r.id = s.destinatario_role_id))
        ELSE jsonb_build_object('id', s.destinatario_user_id,
                 'nome', (SELECT coalesce(nullif(btrim(du.nome), ''), du.email)
                          FROM app.rbac_usuarios du WHERE du.user_id = s.destinatario_user_id))
      END,
      'solicitante',        jsonb_build_object('email', u.email, 'nome', u.nome),
      'data_limite',        s.data_limite,
      'criado_em',          s.criado_em,
      'decidido_em',        s.decidido_em,
      'justificativa',      s.justificativa,
      'referencia_origem',  s.referencia_origem,
      'chave_idempotencia', s.chave_idempotencia
    ) ORDER BY s.id DESC)
    FROM app.solicitacao s
    LEFT JOIN app.rbac_usuarios u ON u.user_id = s.solicitante_id
    WHERE s.origem_chave_id = p_chave_id
      AND (p_solicitacao_id IS NULL OR s.id = p_solicitacao_id)
      AND (v_ref IS NULL OR s.referencia_origem = v_ref)
  ), '[]'::jsonb);
END;
$function$;

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
  -- v5.4.0/Round4: o autor de uma solicitação vinda da API é uma PESSOA ATIVA
  -- (resolvida de solicitante_email), então ela ENTRA no fan-out como qualquer
  -- outro autor — o robô da chave nunca é autor (emenda no ADR-0158). O `AND ativo`
  -- continua valendo como rede: autor desativado depois deixa de receber. O recibo
  -- da integração é o ack síncrono + a CONSULTA — não existe mais callback de saída
  -- (ADR-0161 superado).
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

NOTIFY pgrst, 'reload schema';
