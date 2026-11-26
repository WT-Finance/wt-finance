-- ---------------------------------------------------------------------------
-- 0309 — feat(v6.5.3): Solicitações — moeda nos campos de valor e Notas.
--
-- DECLARAÇÃO (regime ADITIVO): esta migration é ADITIVA/retrocompatível com a main viva —
--   • uma TABELA NOVA (`app.solicitacao_nota`), vazia, com RLS ligado e sem grant a
--     anon/authenticated (acesso só por RPC SECURITY DEFINER, padrão 0127);
--   • uma RPC NOVA (`solic_nota_adicionar`) — superfície inédita;
--   • três `CREATE OR REPLACE` que só ACRESCENTAM, mesma assinatura (ACL preservado e
--     redeclarado abaixo):
--       – `app.solic_validar_e_snapshotar`: o item de snapshot de um campo `moeda` ganha a
--         chave `moeda` ('BRL' quando não informada — exatamente o que o front no ar envia
--         hoje, que é nada). Nenhuma regra que passava deixa de passar; a única recusa nova
--         é de uma chave `<id>:moeda` com valor fora de BRL/USD/EUR, que nenhum cliente envia;
--       – `public.criar_solicitacao_externa`: `p_campos` passa a aceitar, além de texto, o
--         objeto `{ "valor": …, "moeda": … }` num campo de moeda. Escalares (texto, número,
--         boolean, null, array) seguem idênticos (`#>> '{}'` dá o mesmo texto que o
--         `jsonb_each_text` dava). ÚNICA recusa nova na API além da moeda inválida: um OBJETO
--         num campo que não é de moeda — antes um campo de texto o gravava como o texto JSON
--         ('{"a": 1}'); agora volta VALOR_INVALIDO (achado B2 do revisor-db, aceito: nenhum
--         integrador manda isso, e gravar JSON cru num texto nunca foi intenção);
--       – `app.solic_json`: chave NOVA `notas` (lista, `[]` quando não há). O Zod do front no
--         ar não é estrito e descarta chave extra (skill banco-e-rpc, v6.5.0).
--   • NÃO escreve em dado pré-existente (nenhum UPDATE/DELETE). Resposta antiga sem `moeda`
--     é lida como R$ pelo front — nada é reescrito.
--
-- Fonte dos `CREATE OR REPLACE`: o CATÁLOGO VIVO (pg_get_functiondef em 26/11/2026), não as
-- migrations de origem. Última definição de cada uma = o DOWN desta migration:
--   app.solic_validar_e_snapshotar ...... 0212 (idêntica ao catálogo vivo)
--   public.criar_solicitacao_externa .... 0224 (idêntica ao catálogo vivo; 0217 mudou o solicitante)
--   app.solic_json ...................... 0264 (a 0217 introduziu `origem`; a 0261, `aprovado_*`;
--                                          a 0264, `sou_autor` — reverter pela 0261 APAGARIA o
--                                          botão de excluir anexo; achado M1 do revisor-db)
-- DOWN: reaplicar os corpos dessas migrations (nessa ordem, qualquer uma) e
--   DROP FUNCTION public.solic_nota_adicionar(bigint, text); DROP TABLE app.solicitacao_nota;
--   (o DOWN é destrutivo — humano em TTY — e o DROP TABLE apaga as notas já escritas, que a
--   essa altura são dado de negócio: exportar antes.)
--
-- Por quê (briefing v6.5.3, decisões do Yan em 26/11/2026):
--   1. Pedido em dólar ou euro era digitado num campo com "R$" fixo — o valor gravado
--      perdia a moeda. A moeda vai como chave À PARTE no snapshot; o valor continua no
--      formato que o banco já aceita (um separador), e toda soma/exibição que existe hoje
--      segue lendo o mesmo texto.
--   2. Não havia como conversar dentro da solicitação. Notas são EVENTOS imutáveis numa
--      tabela própria (ADR-0185), ao lado das movimentações, que seguem DERIVADAS das
--      colunas da solicitação (ADR-0169). Comentar não muda status nem reabre nada.
-- ---------------------------------------------------------------------------

-- ── 1. Tabela de notas (molde: app.solicitacao_anexo, 0127) ────────────────────
CREATE TABLE app.solicitacao_nota (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  solicitacao_id bigint NOT NULL REFERENCES app.solicitacao(id) ON DELETE CASCADE,
  autor_id       uuid NOT NULL REFERENCES auth.users(id),
  texto          text NOT NULL CHECK (length(btrim(texto)) BETWEEN 1 AND 2000),
  criado_em      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_solicitacao_nota_sol   ON app.solicitacao_nota (solicitacao_id, criado_em, id);
CREATE INDEX idx_solicitacao_nota_autor ON app.solicitacao_nota (autor_id);  -- FK (achado B3)

ALTER TABLE app.solicitacao_nota ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app.solicitacao_nota FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE app.solicitacao_nota IS
  'v6.5.3 (0309): comentários de uma solicitação. Eventos IMUTÁVEIS (sem UPDATE/DELETE por RPC): '
  'registro da conversa. Escrita só por public.solic_nota_adicionar; leitura por app.solic_json.';

-- ── 2. solic_validar_e_snapshotar — moeda no item de snapshot ──────────────────
-- Única mudança: campo `moeda` lê `p_respostas ->> '<id>:moeda'` (BRL/USD/EUR; ausente ou
-- vazio = BRL) e grava a chave `moeda` no item. Resto idêntico ao catálogo vivo (0212).
CREATE OR REPLACE FUNCTION app.solic_validar_e_snapshotar(p_tipo_id bigint, p_respostas jsonb, p_anexos jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_campo     record;
  v_val       text;
  v_moeda     text;
  v_item      jsonb;
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

    v_item := jsonb_build_object(
      'campo_id', v_campo.id, 'rotulo', v_campo.rotulo, 'tipo_campo', v_campo.tipo_campo,
      'obrigatorio', v_campo.obrigatorio, 'opcoes', v_campo.opcoes,
      'valor', CASE WHEN v_campo.tipo_campo='anexo' THEN NULL ELSE v_val END);

    -- v6.5.3 — moeda do campo de valor. Lista FECHADA; ausente/vazia = BRL (o que todo
    -- cliente anterior a esta versão envia, inclusive a API externa).
    IF v_campo.tipo_campo = 'moeda' THEN
      v_moeda := upper(btrim(coalesce(p_respostas ->> (v_campo.id::text || ':moeda'), '')));
      IF v_moeda = '' THEN v_moeda := 'BRL'; END IF;
      IF v_moeda NOT IN ('BRL','USD','EUR') THEN
        RAISE EXCEPTION 'VALOR_INVALIDO: moeda inválida em % (use BRL, USD ou EUR)', v_campo.rotulo USING ERRCODE='22023';
      END IF;
      v_item := v_item || jsonb_build_object('moeda', v_moeda);
    END IF;

    v_snap := v_snap || v_item;
  END LOOP;

  RETURN v_snap;
END;
$function$;
REVOKE EXECUTE ON FUNCTION app.solic_validar_e_snapshotar(bigint, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION app.solic_validar_e_snapshotar(bigint, jsonb, jsonb) TO service_role;

-- ── 3. criar_solicitacao_externa — campo de moeda aceita { valor, moeda } ──────
-- Única mudança: o laço CHAVE → campo_id lê `jsonb_each` (era `jsonb_each_text`). Escalar
-- (texto/número) vira texto por `#>> '{}'` — o MESMO texto de antes (sem aspas). Objeto só
-- vale em campo `moeda`: `valor` vai para a chave do campo e `moeda` para `<id>:moeda`, que a
-- validação compartilhada lê. Resto idêntico ao catálogo vivo.
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
  v_campo_tipo        text;
  v_campo_rotulo      text;
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
  -- v6.5.3 — `jsonb_each` (era `jsonb_each_text`): o valor pode ser escalar (texto/número,
  -- como sempre) ou, num campo de MOEDA, o objeto { "valor": …, "moeda": "BRL|USD|EUR" }.
  -- `#>> '{}'` devolve o texto do escalar SEM aspas — o mesmo que o `_text` devolvia.
  FOR v_par IN SELECT key, value FROM jsonb_each(coalesce(p_campos, '{}'::jsonb))
  LOOP
    SELECT id, tipo_campo, rotulo INTO v_campo_id, v_campo_tipo, v_campo_rotulo
    FROM app.solicitacao_campo WHERE tipo_id = v_tipo_id AND chave = v_par.key;
    IF v_campo_id IS NULL THEN
      RAISE EXCEPTION 'CAMPO_DESCONHECIDO: %', v_par.key USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(v_par.value) = 'object' THEN
      IF v_campo_tipo <> 'moeda' THEN
        RAISE EXCEPTION 'VALOR_INVALIDO: % não é campo de moeda (envie o valor como texto)', v_campo_rotulo USING ERRCODE = '22023';
      END IF;
      v_respostas := v_respostas || jsonb_build_object(
        v_campo_id::text,              v_par.value #>> '{valor}',
        v_campo_id::text || ':moeda',  v_par.value #>> '{moeda}');
    ELSE
      v_respostas := v_respostas || jsonb_build_object(v_campo_id::text, v_par.value #>> '{}');
    END IF;
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
REVOKE EXECUTE ON FUNCTION public.criar_solicitacao_externa(bigint, text, text, text, jsonb, date, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.criar_solicitacao_externa(bigint, text, text, text, jsonb, date, text, text, text) TO service_role;

-- ── 4. app.solic_json — chave NOVA `notas` ─────────────────────────────────────
-- Ponto único (0261): solic_minhas, solic_caixa e solic_detalhe passam por aqui, então o
-- drawer (que deriva da linha da lista) e a página Movimentações (que usa o detalhe) veem as
-- notas sem RPC nova de leitura. Volume medido em 26/11: 284 solicitações no total.
-- Resto idêntico ao catálogo vivo.
CREATE OR REPLACE FUNCTION app.solic_json(p_sol app.solicitacao)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    'aprovado_em', p_sol.aprovado_em,
    'aprovado_por_email', (SELECT email FROM app.rbac_usuarios WHERE user_id = p_sol.aprovado_por),
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
      SELECT jsonb_agg(jsonb_build_object(
               'id',a.id,'campo_id',a.campo_id,'nome',a.nome_arquivo,'mime',a.mime,
               'tamanho',a.tamanho_bytes,
               'sou_autor', coalesce(a.criado_por = app.uid_jwt(), false)
             ) ORDER BY a.id)
      FROM app.solicitacao_anexo a WHERE a.solicitacao_id = p_sol.id), '[]'::jsonb),
    -- v6.5.3 (0309): comentários, do mais antigo ao mais novo (desempate pelo id).
    'notas', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', n.id,
               'autor_email', (SELECT email FROM app.rbac_usuarios WHERE user_id = n.autor_id),
               'texto', n.texto,
               'criado_em', n.criado_em
             ) ORDER BY n.criado_em, n.id)
      FROM app.solicitacao_nota n WHERE n.solicitacao_id = p_sol.id), '[]'::jsonb)
  );
$function$;
-- ACL vivo (26/11): só `postgres` — é chamada apenas de dentro das RPCs SECURITY DEFINER.
-- Redeclarado sem GRANT novo, para o REPLACE não ampliar nada.
REVOKE EXECUTE ON FUNCTION app.solic_json(app.solicitacao) FROM PUBLIC, anon, authenticated;

-- ── 5. solic_nota_adicionar — RPC NOVA ─────────────────────────────────────────
-- Quem vê a solicitação comenta (solicitante, destinatário/membro da role, gestão), em
-- QUALQUER status — inclusive encerrada (decisão do Yan). Mesmo gate sem oráculo de
-- solic_detalhe: inexistente e proibida dão o mesmo NAO_ENCONTRADA.
-- Devolve o que o e-mail precisa, resolvido NO ATO que gravou (skill email: a data da
-- aprovação saía vazia porque vinha de um contexto genérico): o e-mail do autor (excluído
-- do envio) e o instante formatado em SP.
CREATE OR REPLACE FUNCTION public.solic_nota_adicionar(p_id bigint, p_texto text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_sol   app.solicitacao;
  v_uid   uuid;
  v_texto text;
  v_id    bigint;
  v_em    timestamptz;
BEGIN
  PERFORM app.exigir_acesso();
  v_uid := app.uid_jwt();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_NECESSARIA' USING ERRCODE='42501'; END IF;

  SELECT * INTO v_sol FROM app.solicitacao WHERE id = p_id;
  IF NOT FOUND OR NOT app.pode_ver_solic(v_sol) THEN
    RAISE EXCEPTION 'NAO_ENCONTRADA' USING ERRCODE='42501';
  END IF;

  v_texto := btrim(coalesce(p_texto, ''));
  IF length(v_texto) = 0 THEN RAISE EXCEPTION 'NOTA_VAZIA' USING ERRCODE='22023'; END IF;
  IF length(v_texto) > 2000 THEN RAISE EXCEPTION 'NOTA_LONGA' USING ERRCODE='22023'; END IF;

  INSERT INTO app.solicitacao_nota (solicitacao_id, autor_id, texto)
  VALUES (p_id, v_uid, v_texto)
  RETURNING id, criado_em INTO v_id, v_em;

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_id,
    'autor_email', (SELECT email FROM app.rbac_usuarios WHERE user_id = v_uid),
    'criado_em_fmt', to_char(v_em AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY" às "HH24:MI')
  );
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.solic_nota_adicionar(bigint, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.solic_nota_adicionar(bigint, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
