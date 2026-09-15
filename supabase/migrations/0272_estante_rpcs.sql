-- ---------------------------------------------------------------------------
-- 0272 — feat(v5.11.0/M1): RPCs da Estante Welcome
--
-- DECLARAÇÃO PRÉVIA (regime aditivo / autônomo):
--   • O QUE FAZ: cria 7 RPCs NOVAS em `public`, todas gated. LEITURA (área de uso
--     OU de gestão): estante_listar_livros, estante_detalhe_livro,
--     estante_listar_movimentacoes. ESCRITA DE CATÁLOGO (só gestão):
--     estante_criar_livro, estante_atualizar_livro, estante_remover_livro.
--     ESCRITA DE RAZÃO (área de uso): estante_registrar_movimentacao.
--   • ADITIVA: só CREATE FUNCTION + REVOKE/GRANT. Nenhuma função pré-existente é
--     alterada; toda escrita acontece em tabelas criadas na 0271, hoje VAZIAS e
--     sem consumidor.
--   • ORÇAMENTO DE TEMPO: rodam como `authenticated` (teto de 8s, ADR-0122). O
--     volume é uma estante de escritório (dezenas de linhas) — sem risco de N+1.
--   • Reversão (manual, destrutiva) — assinaturas completas (sem elas o DROP não
--     resolve função com DEFAULT); executar ANTES do DROP SCHEMA da 0271:
--       DROP FUNCTION public.estante_listar_livros(text, text, boolean);
--       DROP FUNCTION public.estante_detalhe_livro(bigint);
--       DROP FUNCTION public.estante_listar_movimentacoes(integer);
--       DROP FUNCTION public.estante_criar_livro(text, text, text, smallint, text, text);
--       DROP FUNCTION public.estante_atualizar_livro(bigint, text, text, text, smallint, text, text);
--       DROP FUNCTION public.estante_remover_livro(bigint);
--       DROP FUNCTION public.estante_registrar_movimentacao(bigint, text, uuid, date, text);
-- ---------------------------------------------------------------------------

-- Áreas que abrem a LEITURA: gestão inclui o uso (invariante 8 do briefing).
-- Repetido em cada RPC de propósito: `exigir_acesso` recebe o array literal, e um
-- helper que devolvesse o array esconderia de quem lê a RPC quem pode chamá-la.

-- ── 1. Lista do acervo com estado DERIVADO ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.estante_listar_livros(
  p_busca               text    DEFAULT NULL,
  p_estado              text    DEFAULT NULL,
  p_incluir_arquivados  boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v   jsonb;
  -- `app.norm_nome` só faz lower/btrim/colapso de espaço — não escapa curinga de
  -- LIKE. Escapamos aqui para uma busca com "%" ou "_" não virar padrão. ORDEM
  -- IMPORTA (achado R2 da re-revisão): a própria barra invertida tem de ser
  -- escapada PRIMEIRO — senão "C:\temp" produz "\t" no padrão e o Postgres
  -- recusa com "invalid escape sequence" (500 por um caractere legítimo).
  v_q text := replace(replace(replace(
                app.norm_nome(coalesce(p_busca, '')),
                '\', '\\'), '%', '\%'), '_', '\_');
BEGIN
  PERFORM app.exigir_acesso(ARRAY['gestao-pessoas/estante', 'gestao-pessoas/estante/gestao']);

  IF p_estado IS NOT NULL AND p_estado NOT IN ('emprestado', 'disponivel') THEN
    RAISE EXCEPTION 'ESTADO_INVALIDO: "%" não é um estado reconhecido', p_estado USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(jsonb_agg(x ORDER BY x->>'titulo'), '[]'::jsonb) INTO v
  FROM (
    SELECT jsonb_build_object(
      'id',                 l.id,
      'titulo',             l.titulo,
      'autor',              l.autor,
      'editora',            l.editora,
      'ano',                l.ano,
      'isbn',               l.isbn,
      'obs',                l.obs,
      'arquivado',          (l.arquivado_em IS NOT NULL),
      -- Livro sem movimentação não está em v_estado_atual: `coalesce(false)` é o
      -- estado CORRETO (invariante 2), não um fallback defensivo.
      'emprestado',         coalesce(e.emprestado, false),
      'portador_id',        CASE WHEN coalesce(e.emprestado, false) THEN e.usuario_id END,
      -- Nome VIVO do cadastro, com o snapshot da movimentação como retaguarda para
      -- quem já saiu da plataforma.
      'portador_nome',      CASE WHEN coalesce(e.emprestado, false)
                                 THEN coalesce(u.nome, e.usuario_nome, u.email) END,
      'desde',              CASE WHEN coalesce(e.emprestado, false) THEN e.data_movimentacao END,
      'tem_historico',      EXISTS (SELECT 1 FROM estante.movimentacao m WHERE m.livro_id = l.id)
    ) AS x
    FROM estante.livro l
    LEFT JOIN estante.v_estado_atual e ON e.livro_id = l.id
    LEFT JOIN app.rbac_usuarios u      ON u.user_id  = e.usuario_id
    WHERE (p_incluir_arquivados OR l.arquivado_em IS NULL)
      AND (p_estado IS NULL
           OR (p_estado = 'emprestado' AND coalesce(e.emprestado, false))
           OR (p_estado = 'disponivel' AND NOT coalesce(e.emprestado, false)))
      AND (
        v_q = '' OR
        app.norm_nome(l.titulo)                LIKE '%' || v_q || '%' ESCAPE '\' OR
        app.norm_nome(coalesce(l.autor, ''))   LIKE '%' || v_q || '%' ESCAPE '\' OR
        app.norm_nome(coalesce(l.editora, '')) LIKE '%' || v_q || '%' ESCAPE '\' OR
        -- Só casa nome de portador se o livro ESTIVER emprestado — senão "Ana"
        -- devolve livros disponíveis que ela já devolveu, com pill "Disponível".
        (coalesce(e.emprestado, false) AND
         app.norm_nome(coalesce(u.nome, e.usuario_nome, '')) LIKE '%' || v_q || '%' ESCAPE '\')
      )
  ) s;
  RETURN v;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.estante_listar_livros(text, text, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.estante_listar_livros(text, text, boolean) TO authenticated, service_role;

-- ── 2. Ficha + razão do exemplar numa ÚNICA leitura (invariante 10) ─────────────
CREATE OR REPLACE FUNCTION public.estante_detalhe_livro(p_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v jsonb;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['gestao-pessoas/estante', 'gestao-pessoas/estante/gestao']);

  -- O livro volta no MESMO formato de `estante_listar_livros` (não `to_jsonb` cru): uma
  -- forma só para os dois caminhos, senão ficha e lista divergiriam de tipo no front.
  SELECT jsonb_build_object(
    'livro', (
      SELECT jsonb_build_object(
        'id',            l.id,
        'titulo',        l.titulo,
        'autor',         l.autor,
        'editora',       l.editora,
        'ano',           l.ano,
        'isbn',          l.isbn,
        'obs',           l.obs,
        'arquivado',     (l.arquivado_em IS NOT NULL),
        'emprestado',    coalesce(e.emprestado, false),
        'portador_id',   CASE WHEN coalesce(e.emprestado, false) THEN e.usuario_id END,
        'portador_nome', CASE WHEN coalesce(e.emprestado, false)
                              THEN coalesce(u.nome, e.usuario_nome, u.email) END,
        'desde',         CASE WHEN coalesce(e.emprestado, false) THEN e.data_movimentacao END,
        'tem_historico', EXISTS (SELECT 1 FROM estante.movimentacao m WHERE m.livro_id = l.id)
      )
      FROM estante.livro l
      LEFT JOIN estante.v_estado_atual e ON e.livro_id = l.id
      LEFT JOIN app.rbac_usuarios u      ON u.user_id  = e.usuario_id
      WHERE l.id = p_id
    ),
    'movimentacoes', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id',                m.id,
        'livro_id',          m.livro_id,
        'tipo',              m.tipo,
        'usuario_id',        m.usuario_id,
        'usuario_nome',      coalesce(u.nome, m.usuario_nome, u.email),
        'data_movimentacao', m.data_movimentacao,
        'obs',               m.obs,
        'criado_em',         m.criado_em
      ) ORDER BY m.data_movimentacao DESC, m.criado_em DESC, m.id DESC), '[]'::jsonb)
      FROM estante.movimentacao m
      LEFT JOIN app.rbac_usuarios u ON u.user_id = m.usuario_id
      WHERE m.livro_id = p_id
    )
  ) INTO v;

  IF v->'livro' IS NULL OR v->'livro' = 'null'::jsonb THEN
    RAISE EXCEPTION 'LIVRO_NAO_ENCONTRADO: livro % não existe', p_id USING ERRCODE = '22023';
  END IF;
  RETURN v;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.estante_detalhe_livro(bigint) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.estante_detalhe_livro(bigint) TO authenticated, service_role;

-- ── 3. Razão completo ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.estante_listar_movimentacoes(p_limite integer DEFAULT 2000)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v jsonb;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['gestao-pessoas/estante', 'gestao-pessoas/estante/gestao']);

  SELECT coalesce(jsonb_agg(x ORDER BY (x->>'data_movimentacao') DESC, (x->>'id')::bigint DESC), '[]'::jsonb)
  INTO v
  FROM (
    SELECT jsonb_build_object(
      'id',                m.id,
      'livro_id',          m.livro_id,
      'livro_titulo',      l.titulo,
      'tipo',              m.tipo,
      'usuario_id',        m.usuario_id,
      'usuario_nome',      coalesce(u.nome, m.usuario_nome, u.email),
      'data_movimentacao', m.data_movimentacao,
      'obs',               m.obs,
      'criado_em',         m.criado_em
    ) AS x
    FROM estante.movimentacao m
    JOIN estante.livro l          ON l.id      = m.livro_id
    LEFT JOIN app.rbac_usuarios u ON u.user_id = m.usuario_id
    ORDER BY m.data_movimentacao DESC, m.criado_em DESC, m.id DESC
    LIMIT greatest(coalesce(p_limite, 2000), 1)
  ) s;
  RETURN v;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.estante_listar_movimentacoes(integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.estante_listar_movimentacoes(integer) TO authenticated, service_role;

-- ── 4. Cadastrar livro (só GESTÃO) ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.estante_criar_livro(
  p_titulo  text,
  p_autor   text     DEFAULT NULL,
  p_editora text     DEFAULT NULL,
  p_ano     smallint DEFAULT NULL,
  p_isbn    text     DEFAULT NULL,
  p_obs     text     DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_titulo text := nullif(btrim(coalesce(p_titulo, '')), '');
  v_id     bigint;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['gestao-pessoas/estante/gestao']);

  IF v_titulo IS NULL THEN
    RAISE EXCEPTION 'TITULO_OBRIGATORIO: informe o título do livro' USING ERRCODE = '22023';
  END IF;
  IF p_ano IS NOT NULL AND (p_ano < 1400 OR p_ano > 2100) THEN
    RAISE EXCEPTION 'ANO_INVALIDO: % está fora do intervalo aceito', p_ano USING ERRCODE = '22023';
  END IF;

  INSERT INTO estante.livro (titulo, autor, editora, ano, isbn, obs, criado_por)
  VALUES (
    v_titulo,
    nullif(btrim(coalesce(p_autor, '')), ''),
    nullif(btrim(coalesce(p_editora, '')), ''),
    p_ano,
    nullif(btrim(coalesce(p_isbn, '')), ''),
    nullif(btrim(coalesce(p_obs, '')), ''),
    app.uid_jwt()
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id, 'titulo', v_titulo);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.estante_criar_livro(text, text, text, smallint, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.estante_criar_livro(text, text, text, smallint, text, text) TO authenticated, service_role;

-- ── 5. Editar livro (só GESTÃO) ─────────────────────────────────────────────────
-- Edita só a FICHA. Não existe campo de estado aqui: quem está com o livro muda por
-- movimentação, nunca por correção de cadastro (mesma fronteira da invariante 3 do
-- Inventário). Como `estante.livro` não tem coluna de estado, a trava é estrutural.
CREATE OR REPLACE FUNCTION public.estante_atualizar_livro(
  p_id      bigint,
  p_titulo  text,
  p_autor   text     DEFAULT NULL,
  p_editora text     DEFAULT NULL,
  p_ano     smallint DEFAULT NULL,
  p_isbn    text     DEFAULT NULL,
  p_obs     text     DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_titulo text := nullif(btrim(coalesce(p_titulo, '')), '');
BEGIN
  PERFORM app.exigir_acesso(ARRAY['gestao-pessoas/estante/gestao']);

  IF v_titulo IS NULL THEN
    RAISE EXCEPTION 'TITULO_OBRIGATORIO: informe o título do livro' USING ERRCODE = '22023';
  END IF;
  IF p_ano IS NOT NULL AND (p_ano < 1400 OR p_ano > 2100) THEN
    RAISE EXCEPTION 'ANO_INVALIDO: % está fora do intervalo aceito', p_ano USING ERRCODE = '22023';
  END IF;

  UPDATE estante.livro SET
    titulo        = v_titulo,
    autor         = nullif(btrim(coalesce(p_autor, '')), ''),
    editora       = nullif(btrim(coalesce(p_editora, '')), ''),
    ano           = p_ano,
    isbn          = nullif(btrim(coalesce(p_isbn, '')), ''),
    obs           = nullif(btrim(coalesce(p_obs, '')), ''),
    atualizado_em = now()
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'LIVRO_NAO_ENCONTRADO: livro % não existe', p_id USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object('id', p_id, 'titulo', v_titulo);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.estante_atualizar_livro(bigint, text, text, text, smallint, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.estante_atualizar_livro(bigint, text, text, text, smallint, text, text) TO authenticated, service_role;

-- ── 6. Remover livro: apaga OU arquiva (invariante 6) ───────────────────────────
-- Livro virgem some de verdade; livro com razão é ARQUIVADO. Apagar um livro com
-- histórico apagaria o registro de quem o levou — e o RESTRICT da FK da 0271 é o
-- backstop para quem tentar por fora. A RPC devolve qual dos dois aconteceu para a
-- tela contar a verdade ao usuário.
CREATE OR REPLACE FUNCTION public.estante_remover_livro(p_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tem_historico boolean;
  v_ja_arquivado  boolean;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['gestao-pessoas/estante/gestao']);

  -- Trava a linha do livro E checa a existência no MESMO statement (achado R1 da
  -- re-revisão): checar em dois passos deixava uma fresta entre o EXISTS sem
  -- lock e o FOR UPDATE seguinte — outro gestor podia apagar o livro nessa
  -- janela, e a função devolvia 'apagado' para algo que não tinha apagado.
  PERFORM 1 FROM estante.livro WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'LIVRO_NAO_ENCONTRADO: livro % não existe', p_id USING ERRCODE = '22023';
  END IF;

  SELECT EXISTS (SELECT 1 FROM estante.movimentacao m WHERE m.livro_id = p_id)
    INTO v_tem_historico;

  IF v_tem_historico THEN
    SELECT (arquivado_em IS NOT NULL) INTO v_ja_arquivado FROM estante.livro WHERE id = p_id;
    IF v_ja_arquivado THEN
      -- Já estava arquivado: não é um no-op disfarçado de ação. A tela precisa
      -- saber que nada mudou para não afirmar "arquivado" como se tivesse agido.
      RETURN jsonb_build_object('id', p_id, 'acao', 'ja_arquivado');
    END IF;
    UPDATE estante.livro SET arquivado_em = now(), atualizado_em = now()
     WHERE id = p_id AND arquivado_em IS NULL;
    RETURN jsonb_build_object('id', p_id, 'acao', 'arquivado');
  END IF;

  DELETE FROM estante.livro WHERE id = p_id;
  RETURN jsonb_build_object('id', p_id, 'acao', 'apagado');
END;
$$;
REVOKE EXECUTE ON FUNCTION public.estante_remover_livro(bigint) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.estante_remover_livro(bigint) TO authenticated, service_role;

-- ── 7. Registrar movimentação ───────────────────────────────────────────────────
-- As recusas desta função (JA_EMPRESTADO, NAO_EMPRESTADO, DEVOLUCAO_DE_OUTRO,
-- EMPRESTIMO_PARA_OUTRO, LIVRO_ARQUIVADO, e as de validação de entrada) SÃO a
-- regra de negócio da versão; nada disto se duplica no TypeScript (invariante 7).
CREATE OR REPLACE FUNCTION public.estante_registrar_movimentacao(
  p_livro_id          bigint,
  p_tipo              text,
  p_usuario_id        uuid DEFAULT NULL,
  p_data_movimentacao date DEFAULT NULL,
  p_obs               text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tipo       estante.tipo_movimentacao;
  v_uid        uuid   := app.uid_jwt();
  v_alvo       uuid   := coalesce(p_usuario_id, app.uid_jwt());
  -- Sem inicializador: atribuído no corpo, DEPOIS do PERFORM app.exigir_acesso
  -- (achado M1 do revisor-db). Inicializadores de DECLARE rodam antes da primeira
  -- instrução do BEGIN, então `:= estante.pode_gerir()` aqui rodaria ANTES do
  -- guard — hoje inofensivo porque o valor só é usado depois e anon não tem
  -- EXECUTE, mas a segurança da função não deve depender de "uso depois" em vez
  -- de "chamada depois".
  v_gestao     boolean;
  v_data       date   := coalesce(p_data_movimentacao, CURRENT_DATE);
  v_emprestado boolean;
  v_portador   uuid;
  v_arquivado  boolean;
  v_nome       text;
  v_id         bigint;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['gestao-pessoas/estante', 'gestao-pessoas/estante/gestao']);
  v_gestao := estante.pode_gerir();

  BEGIN
    v_tipo := p_tipo::estante.tipo_movimentacao;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'TIPO_INVALIDO: "%" não é um tipo de movimentação', p_tipo USING ERRCODE = '22023';
  END;
  -- `NULL::estante.tipo_movimentacao` NÃO lança — o cast acima não dispara a
  -- EXCEPTION para p_tipo NULL, e sem este guard o fluxo cairia silenciosamente
  -- no ramo de devolução (achado A1 do revisor-db).
  IF v_tipo IS NULL THEN
    RAISE EXCEPTION 'TIPO_INVALIDO: informe "emprestimo" ou "devolucao"' USING ERRCODE = '22023';
  END IF;

  -- Trava a linha do livro: entre esta leitura e o INSERT no fim, duas sessões
  -- concorrentes não podem ambas passar pelo JA_EMPRESTADO (achado M3 do
  -- revisor-db).
  SELECT (l.arquivado_em IS NOT NULL) INTO v_arquivado
  FROM estante.livro l WHERE l.id = p_livro_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'LIVRO_NAO_ENCONTRADO: livro % não existe', p_livro_id USING ERRCODE = '22023';
  END IF;
  IF v_arquivado THEN
    RAISE EXCEPTION 'LIVRO_ARQUIVADO: livro arquivado não aceita movimentação' USING ERRCODE = '22023';
  END IF;

  IF v_data < DATE '2000-01-01' THEN
    RAISE EXCEPTION 'DATA_INVALIDA: % está fora do intervalo aceito — confira o ano', v_data
      USING ERRCODE = '22023';
  END IF;
  -- Teto: uma data futura (typo de ano) vira a última movimentação para sempre
  -- pela ordenação (data DESC, criado_em DESC, id DESC), e a correção por
  -- movimentação nova — a única saída do desenho append-only — deixa de
  -- funcionar (achado M2 do revisor-db). O CHECK não serve: CURRENT_DATE não é
  -- IMMUTABLE. Retroativa continua liberada.
  IF v_data > CURRENT_DATE THEN
    RAISE EXCEPTION 'DATA_FUTURA: a movimentação não pode ter data futura' USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(e.emprestado, false), e.usuario_id INTO v_emprestado, v_portador
  FROM estante.livro l
  LEFT JOIN estante.v_estado_atual e ON e.livro_id = l.id
  WHERE l.id = p_livro_id;

  IF v_tipo = 'emprestimo' THEN
    IF v_emprestado THEN
      RAISE EXCEPTION 'JA_EMPRESTADO: este livro já está com outra pessoa' USING ERRCODE = '22023';
    END IF;
    -- O alvo é dado de negócio SÓ neste ramo (achado M6 do revisor-db): sem JWT
    -- (service_role/superusuário) tem de vir explícito, e precisa de cadastro
    -- ATIVO — faz sentido exigir isso de quem está PEGANDO o livro agora.
    IF v_alvo IS NULL THEN
      RAISE EXCEPTION 'USUARIO_OBRIGATORIO: informe de quem é a movimentação' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM app.rbac_usuarios u WHERE u.user_id = v_alvo AND u.ativo) THEN
      RAISE EXCEPTION 'USUARIO_DESCONHECIDO: pessoa sem cadastro ativo no Janus' USING ERRCODE = '42501';
    END IF;
    -- Registrar empréstimo em nome de terceiro é ato de gestão (alguém pegou o
    -- livro e não registrou). Para si mesmo, qualquer um da área de uso.
    IF v_alvo <> coalesce(v_uid, v_alvo) AND NOT v_gestao THEN
      RAISE EXCEPTION 'EMPRESTIMO_PARA_OUTRO: só a gestão registra empréstimo em nome de outra pessoa'
        USING ERRCODE = '42501';
    END IF;
  ELSIF v_tipo = 'devolucao' THEN
    IF NOT v_emprestado THEN
      RAISE EXCEPTION 'NAO_EMPRESTADO: este livro já está na estante' USING ERRCODE = '22023';
    END IF;
    -- A devolução é SEMPRE do portador atual — o razão não aceita devolução em nome
    -- de quem não estava com o livro. Nenhuma exigência de cadastro ATIVO aqui
    -- (achado M6 do revisor-db): devolver o livro de alguém que já saiu da
    -- empresa é precisamente o caso de uso da regra "só a gestão devolve por
    -- outro" logo abaixo.
    v_alvo := v_portador;
    IF v_portador <> coalesce(v_uid, v_portador) AND NOT v_gestao THEN
      RAISE EXCEPTION 'DEVOLUCAO_DE_OUTRO: este livro está com outra pessoa — só a gestão devolve por ela'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    -- Trava explícita: sem este ELSE, um terceiro valor futuro do enum (ex.:
    -- "reserva") cairia aqui por coincidência de tamanho do enum e seria tratado
    -- como devolução — nada reprovaria, nem banco, nem tsc, nem a suíte (achado
    -- A2 do revisor-db). `estante.tipo_movimentacao` tem hoje só dois valores; a
    -- fronteira da versão prevê que ele cresça (reserva, baixa) depois.
    RAISE EXCEPTION 'TIPO_NAO_SUPORTADO: "%" não é tratado por esta função', v_tipo USING ERRCODE = '22023';
  END IF;

  SELECT u.nome INTO v_nome FROM app.rbac_usuarios u WHERE u.user_id = v_alvo;

  INSERT INTO estante.movimentacao (
    livro_id, tipo, usuario_id, usuario_nome, data_movimentacao, obs,
    registrado_por, registrado_por_nome
  ) VALUES (
    p_livro_id, v_tipo, v_alvo, v_nome, v_data,
    nullif(btrim(coalesce(p_obs, '')), ''),
    v_uid, (SELECT u.nome FROM app.rbac_usuarios u WHERE u.user_id = v_uid)
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id, 'emprestado', v_tipo = 'emprestimo');
END;
$$;
REVOKE EXECUTE ON FUNCTION public.estante_registrar_movimentacao(bigint, text, uuid, date, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.estante_registrar_movimentacao(bigint, text, uuid, date, text) TO authenticated, service_role;
