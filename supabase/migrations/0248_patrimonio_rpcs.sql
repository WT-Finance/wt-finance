-- ---------------------------------------------------------------------------
-- 0248 — feat(v5.6.0/M1): RPCs do Inventário de Ativos
--
-- DECLARAÇÃO PRÉVIA (regime aditivo / autônomo):
--   • O QUE FAZ: cria 1 função auxiliar (patrimonio.status_derivado) e 10 RPCs NOVAS em
--     `public`, todas gated por 'gestao-pessoas/inventario'. Leitura: catalogos,
--     listar_ativos, detalhe_ativo, listar_movimentacoes, resumo. Escrita: criar_ativo,
--     atualizar_ativo, registrar_movimentacao, atualizar_obs_movimentacao, upsert_detentor.
--   • ADITIVA / RETROCOMPATÍVEL: só CREATE FUNCTION + REVOKE/GRANT. Nenhuma função
--     pré-existente é alterada, nenhuma coluna ou dado pré-existente é tocado. Toda escrita
--     acontece em tabelas criadas na 0247, que hoje estão VAZIAS e sem consumidor.
--   • ORÇAMENTO DE TEMPO: as RPCs rodam como `authenticated` (teto de 8s, ADR-0122). O
--     volume aqui é o parque de equipamentos de uma empresa (centenas de linhas, não
--     milhões) e não há função escalar por linha em JOIN — sem risco de N+1.
--   • Reversão (manual, destrutiva): DROP das 10 funções públicas e da auxiliar.
-- ---------------------------------------------------------------------------

-- ── 0. Status derivado — UMA definição, espelhada em derivar.ts ─────────────────
-- Invariante 1: o status sai da ÚLTIMA movimentação. Só o `cadastro` ramifica (com
-- detentor nasce em uso; sem detentor, em estoque — decisão do Yan, 10/08/2026).
-- Não é inlineável pelo planner por causa do `SET search_path` — aceito de propósito:
-- correção (definição única) vale mais que o micro-custo neste volume.
CREATE OR REPLACE FUNCTION patrimonio.status_derivado(
  p_tipo                patrimonio.tipo_movimentacao,
  p_detentor_destino_id integer
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_tipo = 'cadastro' THEN
      CASE WHEN p_detentor_destino_id IS NOT NULL THEN 'em_uso' ELSE 'em_estoque' END
    WHEN p_tipo IN ('transferencia', 'retorno_manutencao', 'reativacao') THEN 'em_uso'
    WHEN p_tipo = 'devolucao_estoque' THEN 'em_estoque'
    WHEN p_tipo = 'envio_manutencao'  THEN 'em_manutencao'
    WHEN p_tipo = 'emprestimo'        THEN 'emprestado'
    WHEN p_tipo = 'baixa'             THEN 'baixado'
  END
$$;
REVOKE EXECUTE ON FUNCTION patrimonio.status_derivado(patrimonio.tipo_movimentacao, integer) FROM PUBLIC, anon, authenticated;

-- View interna do estado atual: DISTINCT ON é a tradução exata de "a última movimentação
-- manda". `id DESC` é o terceiro critério de desempate — sem ele, duas linhas com a mesma
-- data E o mesmo criado_em (mesma transação) escolheriam uma arbitrária a cada plano.
CREATE OR REPLACE VIEW patrimonio.v_estado_atual AS
  SELECT DISTINCT ON (m.ativo_id)
    m.ativo_id,
    m.id                  AS movimentacao_id,
    m.tipo,
    m.data_movimentacao,
    m.area_destino_id,
    m.detentor_destino_id,
    m.destino_texto,
    patrimonio.status_derivado(m.tipo, m.detentor_destino_id) AS status
  FROM patrimonio.movimentacao m
  ORDER BY m.ativo_id, m.data_movimentacao DESC, m.criado_em DESC, m.id DESC;
REVOKE ALL ON patrimonio.v_estado_atual FROM PUBLIC, anon, authenticated;

-- ── 1. Catálogos para os formulários ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.patrimonio_catalogos()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v jsonb;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['gestao-pessoas/inventario']);
  SELECT jsonb_build_object(
    'categorias', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'nome', c.nome) ORDER BY c.ordem, app.norm_nome(c.nome)), '[]'::jsonb)
                   FROM patrimonio.categoria c WHERE c.ativo),
    'areas',      (SELECT coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'nome', a.nome) ORDER BY a.ordem, app.norm_nome(a.nome)), '[]'::jsonb)
                   FROM patrimonio.area a WHERE a.ativo),
    'detentores', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'nome', d.nome, 'ativo', d.ativo) ORDER BY app.norm_nome(d.nome)), '[]'::jsonb)
                   FROM patrimonio.detentor d WHERE d.ativo),
    -- Locais já usados em texto livre viram sugestão de datalist (o terceiro nunca virou
    -- tabela de propósito: ninguém pergunta "quantos itens estão na assistência X").
    'locais',     (SELECT coalesce(jsonb_agg(DISTINCT m.destino_texto), '[]'::jsonb)
                   FROM patrimonio.movimentacao m WHERE btrim(coalesce(m.destino_texto, '')) <> '')
  ) INTO v;
  RETURN v;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.patrimonio_catalogos() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.patrimonio_catalogos() TO authenticated, service_role;

-- ── 2. Lista de ativos com estado DERIVADO + filtros ────────────────────────────
CREATE OR REPLACE FUNCTION public.patrimonio_listar_ativos(
  p_busca        text     DEFAULT NULL,
  p_categoria_id smallint DEFAULT NULL,
  p_area_id      smallint DEFAULT NULL,
  p_status       text     DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v     jsonb;
  v_q   text := app.norm_nome(coalesce(p_busca, ''));
BEGIN
  PERFORM app.exigir_acesso(ARRAY['gestao-pessoas/inventario']);

  SELECT coalesce(jsonb_agg(x ORDER BY x->>'codigo'), '[]'::jsonb) INTO v
  FROM (
    SELECT jsonb_build_object(
      'id',                     a.id,
      'codigo',                 a.codigo,
      'categoria_id',           a.categoria_id,
      'categoria_nome',         c.nome,
      'descricao',              a.descricao,
      'numero_serie',           a.numero_serie,
      'fornecedor',             a.fornecedor,
      'data_aquisicao',         a.data_aquisicao,
      'valor_aquisicao',        a.valor_aquisicao,
      'nota_fiscal',            a.nota_fiscal,
      'estado_conservacao',     a.estado_conservacao,
      'obs',                    a.obs,
      -- Estado DERIVADO. Ativo sem movimentação é inalcançável (a abertura nasce junto do
      -- ativo, na mesma transação) — o coalesce só evita que um estado impossível derrube a tela.
      'status',                 coalesce(e.status, 'em_estoque'),
      'area_atual_nome',        ar.nome,
      'detentor_atual_nome',    d.nome,
      'local_atual_texto',      e.destino_texto,
      'ultima_movimentacao_em', e.data_movimentacao
    ) AS x
    FROM patrimonio.ativo a
    JOIN patrimonio.categoria c            ON c.id  = a.categoria_id
    LEFT JOIN patrimonio.v_estado_atual e  ON e.ativo_id = a.id
    LEFT JOIN patrimonio.area ar           ON ar.id = e.area_destino_id
    LEFT JOIN patrimonio.detentor d        ON d.id  = e.detentor_destino_id
    WHERE (p_categoria_id IS NULL OR a.categoria_id = p_categoria_id)
      AND (p_area_id      IS NULL OR e.area_destino_id = p_area_id)
      AND (p_status       IS NULL OR coalesce(e.status, 'em_estoque') = p_status)
      AND (
        v_q = '' OR
        app.norm_nome(a.codigo)              LIKE '%' || v_q || '%' OR
        app.norm_nome(a.descricao)           LIKE '%' || v_q || '%' OR
        app.norm_nome(coalesce(a.numero_serie, ''))  LIKE '%' || v_q || '%' OR
        app.norm_nome(coalesce(d.nome, ''))          LIKE '%' || v_q || '%' OR
        app.norm_nome(coalesce(ar.nome, ''))         LIKE '%' || v_q || '%' OR
        app.norm_nome(coalesce(e.destino_texto, '')) LIKE '%' || v_q || '%'
      )
  ) s;
  RETURN v;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.patrimonio_listar_ativos(text, smallint, smallint, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.patrimonio_listar_ativos(text, smallint, smallint, text) TO authenticated, service_role;

-- ── 3. Ficha + histórico numa ÚNICA leitura (invariante 10) ─────────────────────
-- Imune a movimentação concorrente no meio: a função é uma só chamada, logo uma só
-- transação — ficha e razão nunca saem de instantes diferentes.
-- A ORIGEM não vem daqui: o histórico volta em ordem CRONOLÓGICA e o cliente deriva a
-- origem do destino da linha anterior (rotuloOrigem, em derivar.ts). Uma definição só —
-- calcular também aqui criaria duas verdades para a mesma frase.
CREATE OR REPLACE FUNCTION public.patrimonio_detalhe_ativo(p_ativo_id integer)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v jsonb;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['gestao-pessoas/inventario']);

  SELECT jsonb_build_object(
    'ficha', (
      SELECT jsonb_build_object(
        'id', a.id, 'codigo', a.codigo, 'categoria_id', a.categoria_id,
        'categoria_nome', c.nome, 'descricao', a.descricao,
        'numero_serie', a.numero_serie, 'fornecedor', a.fornecedor,
        'data_aquisicao', a.data_aquisicao, 'valor_aquisicao', a.valor_aquisicao,
        'nota_fiscal', a.nota_fiscal, 'estado_conservacao', a.estado_conservacao,
        'obs', a.obs
      )
      FROM patrimonio.ativo a
      JOIN patrimonio.categoria c ON c.id = a.categoria_id
      WHERE a.id = p_ativo_id
    ),
    'historico', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', m.id, 'ativo_id', m.ativo_id, 'tipo', m.tipo,
        'data_movimentacao', m.data_movimentacao,
        'area_destino_id', m.area_destino_id, 'area_destino_nome', ar.nome,
        'detentor_destino_id', m.detentor_destino_id, 'detentor_destino_nome', d.nome,
        'destino_texto', m.destino_texto, 'motivo_baixa', m.motivo_baixa, 'obs', m.obs,
        'registrado_por_rotulo', coalesce(m.registrado_por_nome, 'Sistema'),
        'criado_em', m.criado_em
      ) ORDER BY m.data_movimentacao, m.criado_em, m.id), '[]'::jsonb)
      FROM patrimonio.movimentacao m
      LEFT JOIN patrimonio.area ar    ON ar.id = m.area_destino_id
      LEFT JOIN patrimonio.detentor d ON d.id  = m.detentor_destino_id
      WHERE m.ativo_id = p_ativo_id
    )
  ) INTO v;

  IF v->'ficha' IS NULL OR v->'ficha' = 'null'::jsonb THEN
    RAISE EXCEPTION 'ATIVO_NAO_ENCONTRADO: ativo % não existe', p_ativo_id USING ERRCODE = '22023';
  END IF;
  RETURN v;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.patrimonio_detalhe_ativo(integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.patrimonio_detalhe_ativo(integer) TO authenticated, service_role;

-- ── 4. Razão completo ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.patrimonio_listar_movimentacoes(
  p_tipo   text    DEFAULT NULL,
  p_busca  text    DEFAULT NULL,
  p_limite integer DEFAULT 500
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v   jsonb;
  v_q text := app.norm_nome(coalesce(p_busca, ''));
  v_n integer := least(greatest(coalesce(p_limite, 500), 1), 2000);
BEGIN
  PERFORM app.exigir_acesso(ARRAY['gestao-pessoas/inventario']);

  SELECT coalesce(jsonb_agg(x ORDER BY (x->>'data_movimentacao') DESC, (x->>'criado_em') DESC), '[]'::jsonb) INTO v
  FROM (
    SELECT jsonb_build_object(
      'id', m.id, 'ativo_id', m.ativo_id,
      'ativo_codigo', a.codigo, 'ativo_descricao', a.descricao,
      'tipo', m.tipo, 'data_movimentacao', m.data_movimentacao,
      'area_destino_id', m.area_destino_id, 'area_destino_nome', ar.nome,
      'detentor_destino_id', m.detentor_destino_id, 'detentor_destino_nome', d.nome,
      'destino_texto', m.destino_texto, 'motivo_baixa', m.motivo_baixa, 'obs', m.obs,
      'registrado_por_rotulo', coalesce(m.registrado_por_nome, 'Sistema'),
      'criado_em', m.criado_em
    ) AS x
    FROM patrimonio.movimentacao m
    JOIN patrimonio.ativo a         ON a.id  = m.ativo_id
    LEFT JOIN patrimonio.area ar    ON ar.id = m.area_destino_id
    LEFT JOIN patrimonio.detentor d ON d.id  = m.detentor_destino_id
    WHERE (p_tipo IS NULL OR m.tipo::text = p_tipo)
      AND (
        v_q = '' OR
        app.norm_nome(a.codigo)    LIKE '%' || v_q || '%' OR
        app.norm_nome(a.descricao) LIKE '%' || v_q || '%' OR
        app.norm_nome(coalesce(d.nome, ''))          LIKE '%' || v_q || '%' OR
        app.norm_nome(coalesce(ar.nome, ''))         LIKE '%' || v_q || '%' OR
        app.norm_nome(coalesce(m.destino_texto, '')) LIKE '%' || v_q || '%' OR
        app.norm_nome(coalesce(m.obs, ''))           LIKE '%' || v_q || '%'
      )
    ORDER BY m.data_movimentacao DESC, m.criado_em DESC, m.id DESC
    LIMIT v_n
  ) s;
  RETURN v;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.patrimonio_listar_movimentacoes(text, text, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.patrimonio_listar_movimentacoes(text, text, integer) TO authenticated, service_role;

-- ── 5. Resumo da visão geral ────────────────────────────────────────────────────
-- ⚠️ RÓTULO CONTÁBIL HONESTO (invariante 9): `custo_historico_aquisicao` soma o valor de
-- AQUISIÇÃO dos não-baixados. Não é "valor imobilizado", não tem depreciação e não entra
-- em DRE nem em Fluxo de Caixa. Ativo sem valor NÃO vira zero: fica fora do somatório e é
-- contado à parte em `sem_valor`.
CREATE OR REPLACE FUNCTION public.patrimonio_resumo()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v jsonb;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['gestao-pessoas/inventario']);

  WITH base AS (
    SELECT a.id, a.categoria_id, a.valor_aquisicao,
           coalesce(e.status, 'em_estoque') AS status,
           e.area_destino_id
    FROM patrimonio.ativo a
    LEFT JOIN patrimonio.v_estado_atual e ON e.ativo_id = a.id
  ), vivos AS (
    SELECT * FROM base WHERE status <> 'baixado'
  )
  SELECT jsonb_build_object(
    'cadastrados',   (SELECT count(*) FROM base),
    'em_uso',        (SELECT count(*) FROM base WHERE status = 'em_uso'),
    'em_estoque',    (SELECT count(*) FROM base WHERE status = 'em_estoque'),
    'em_manutencao', (SELECT count(*) FROM base WHERE status = 'em_manutencao'),
    'emprestados',   (SELECT count(*) FROM base WHERE status = 'emprestado'),
    'baixados',      (SELECT count(*) FROM base WHERE status = 'baixado'),
    'custo_historico_aquisicao', (SELECT coalesce(sum(v.valor_aquisicao), 0) FROM vivos v),
    'sem_valor',     (SELECT count(*) FROM vivos v WHERE v.valor_aquisicao IS NULL),
    'por_categoria', (SELECT coalesce(jsonb_agg(jsonb_build_object('nome', c.nome, 'n', t.n) ORDER BY t.n DESC, c.nome), '[]'::jsonb)
                      FROM (SELECT categoria_id, count(*) AS n FROM vivos GROUP BY categoria_id) t
                      JOIN patrimonio.categoria c ON c.id = t.categoria_id),
    'por_area',      (SELECT coalesce(jsonb_agg(jsonb_build_object('nome', coalesce(ar.nome, 'Sem área'), 'n', t.n) ORDER BY t.n DESC, coalesce(ar.nome, 'Sem área')), '[]'::jsonb)
                      FROM (SELECT area_destino_id, count(*) AS n FROM vivos GROUP BY area_destino_id) t
                      LEFT JOIN patrimonio.area ar ON ar.id = t.area_destino_id)
  ) INTO v;
  RETURN v;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.patrimonio_resumo() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.patrimonio_resumo() TO authenticated, service_role;

-- ── 6. Detentor: cadastro inline pelo próprio combobox ──────────────────────────
-- Idempotente por nome NORMALIZADO: digitar "ana beatriz ramos" devolve a Ana já existente
-- em vez de criar uma segunda. Reativa quem estava inativo (é o que o usuário quer ao
-- digitar o nome de novo).
CREATE OR REPLACE FUNCTION public.patrimonio_upsert_detentor(p_nome text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_nome text := btrim(coalesce(p_nome, ''));
  v_row  patrimonio.detentor;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['gestao-pessoas/inventario']);
  IF v_nome = '' THEN
    RAISE EXCEPTION 'NOME_OBRIGATORIO: informe o nome da pessoa' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row FROM patrimonio.detentor d WHERE app.norm_nome(d.nome) = app.norm_nome(v_nome);
  IF FOUND THEN
    IF NOT v_row.ativo THEN
      UPDATE patrimonio.detentor SET ativo = true WHERE id = v_row.id RETURNING * INTO v_row;
    END IF;
  ELSE
    INSERT INTO patrimonio.detentor (nome) VALUES (v_nome) RETURNING * INTO v_row;
  END IF;

  RETURN jsonb_build_object('id', v_row.id, 'nome', v_row.nome, 'ativo', v_row.ativo);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.patrimonio_upsert_detentor(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.patrimonio_upsert_detentor(text) TO authenticated, service_role;

-- ── 7. Criar ativo — ficha + movimentação de abertura, UMA transação ────────────
-- Invariante 5: nunca existe ativo sem razão. O INSERT do ativo e o da abertura acontecem
-- no mesmo corpo, logo na mesma transação: ou os dois entram, ou nenhum.
-- Código: sequência server-side; `p_codigo` não-vazio é override manual (aceito de propósito).
CREATE OR REPLACE FUNCTION public.patrimonio_criar_ativo(
  p_descricao           text,
  p_categoria_id        smallint,
  p_area_destino_id     smallint,
  p_detentor_destino_id integer  DEFAULT NULL,   -- ausente ⇒ o ativo NASCE EM ESTOQUE
  p_codigo              text     DEFAULT NULL,
  p_numero_serie        text     DEFAULT NULL,
  p_fornecedor          text     DEFAULT NULL,
  p_data_aquisicao      date     DEFAULT NULL,
  p_valor_aquisicao     numeric  DEFAULT NULL,
  p_nota_fiscal         text     DEFAULT NULL,
  p_estado_conservacao  text     DEFAULT NULL,
  p_obs                 text     DEFAULT NULL,
  p_data_movimentacao   date     DEFAULT NULL,   -- data da abertura; ausente ⇒ hoje (SP)
  p_obs_movimentacao    text     DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_nome_uid  text;
  v_descricao text := btrim(coalesce(p_descricao, ''));
  v_codigo    text := btrim(coalesce(p_codigo, ''));
  v_ativo     patrimonio.ativo;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['gestao-pessoas/inventario']);

  IF v_descricao = '' THEN
    RAISE EXCEPTION 'DESCRICAO_OBRIGATORIA: informe a descrição do item' USING ERRCODE = '22023';
  END IF;
  IF p_categoria_id IS NULL THEN
    RAISE EXCEPTION 'CATEGORIA_OBRIGATORIA: escolha a categoria' USING ERRCODE = '22023';
  END IF;
  IF p_area_destino_id IS NULL THEN
    RAISE EXCEPTION 'AREA_OBRIGATORIA: todo ativo nasce numa área' USING ERRCODE = '22023';
  END IF;

  IF v_codigo = '' THEN
    v_codigo := patrimonio.proximo_codigo();
  ELSIF EXISTS (SELECT 1 FROM patrimonio.ativo a WHERE app.norm_nome(a.codigo) = app.norm_nome(v_codigo)) THEN
    RAISE EXCEPTION 'CODIGO_DUPLICADO: já existe um ativo com o código %', v_codigo USING ERRCODE = '23505';
  END IF;

  SELECT u.nome INTO v_nome_uid FROM app.rbac_usuarios u WHERE u.user_id = v_uid;

  INSERT INTO patrimonio.ativo (
    codigo, categoria_id, descricao, numero_serie, fornecedor, data_aquisicao,
    valor_aquisicao, nota_fiscal, estado_conservacao, obs, criado_por
  ) VALUES (
    v_codigo, p_categoria_id, v_descricao,
    nullif(btrim(coalesce(p_numero_serie, '')), ''),
    nullif(btrim(coalesce(p_fornecedor, '')), ''),
    p_data_aquisicao, p_valor_aquisicao,
    nullif(btrim(coalesce(p_nota_fiscal, '')), ''),
    nullif(btrim(coalesce(p_estado_conservacao, '')), '')::patrimonio.estado_conservacao,
    nullif(btrim(coalesce(p_obs, '')), ''),
    v_uid
  ) RETURNING * INTO v_ativo;

  -- Movimentação de ABERTURA, mesma transação (invariante 5). `CURRENT_DATE` já é o hoje de
  -- São Paulo dentro de uma RPC: o PostgREST aplica o rolconfig do papel (migration 0152).
  INSERT INTO patrimonio.movimentacao (
    ativo_id, tipo, data_movimentacao, area_destino_id, detentor_destino_id, obs,
    registrado_por, registrado_por_nome
  ) VALUES (
    v_ativo.id, 'cadastro', coalesce(p_data_movimentacao, CURRENT_DATE),
    p_area_destino_id, p_detentor_destino_id,
    nullif(btrim(coalesce(p_obs_movimentacao, '')), ''),
    v_uid, v_nome_uid
  );

  RETURN jsonb_build_object('id', v_ativo.id, 'codigo', v_ativo.codigo);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.patrimonio_criar_ativo(text, smallint, smallint, integer, text, text, text, date, numeric, text, text, text, date, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.patrimonio_criar_ativo(text, smallint, smallint, integer, text, text, text, date, numeric, text, text, text, date, text) TO authenticated, service_role;

-- ── 8. Atualizar a ficha — e REJEITAR qualquer tentativa de mexer em localização ─
-- INVARIANTE 3, virando código. Os dois últimos parâmetros existem SÓ para serem recusados:
-- sem eles, quem tentasse mandar área/detentor receberia "função não existe", um erro
-- críptico que não ensina nada. Com eles, a resposta diz exatamente qual é a regra.
-- É aqui que "movimentação ≠ correção de cadastro" deixa de ser conceito.
CREATE OR REPLACE FUNCTION public.patrimonio_atualizar_ativo(
  p_id                  integer,
  p_descricao           text,
  p_categoria_id        smallint,
  p_codigo              text     DEFAULT NULL,
  p_numero_serie        text     DEFAULT NULL,
  p_fornecedor          text     DEFAULT NULL,
  p_data_aquisicao      date     DEFAULT NULL,
  p_valor_aquisicao     numeric  DEFAULT NULL,
  p_nota_fiscal         text     DEFAULT NULL,
  p_estado_conservacao  text     DEFAULT NULL,
  p_obs                 text     DEFAULT NULL,
  p_area_destino_id     smallint DEFAULT NULL,   -- recusado de propósito
  p_detentor_destino_id integer  DEFAULT NULL    -- recusado de propósito
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_descricao text := btrim(coalesce(p_descricao, ''));
  v_codigo    text := btrim(coalesce(p_codigo, ''));
  v_ativo     patrimonio.ativo;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['gestao-pessoas/inventario']);

  IF p_area_destino_id IS NOT NULL OR p_detentor_destino_id IS NOT NULL THEN
    RAISE EXCEPTION
      'LOCALIZACAO_IMUTAVEL: área e detentor não se editam na ficha — registre uma movimentação'
      USING ERRCODE = '22023';
  END IF;

  IF v_descricao = '' THEN
    RAISE EXCEPTION 'DESCRICAO_OBRIGATORIA: informe a descrição do item' USING ERRCODE = '22023';
  END IF;
  IF p_categoria_id IS NULL THEN
    RAISE EXCEPTION 'CATEGORIA_OBRIGATORIA: escolha a categoria' USING ERRCODE = '22023';
  END IF;

  -- Código duplicado é barrado na EDIÇÃO tanto quanto na criação (excluindo a própria linha).
  IF v_codigo <> '' AND EXISTS (
    SELECT 1 FROM patrimonio.ativo a
    WHERE app.norm_nome(a.codigo) = app.norm_nome(v_codigo) AND a.id <> p_id
  ) THEN
    RAISE EXCEPTION 'CODIGO_DUPLICADO: já existe um ativo com o código %', v_codigo USING ERRCODE = '23505';
  END IF;

  UPDATE patrimonio.ativo a SET
    codigo             = CASE WHEN v_codigo <> '' THEN v_codigo ELSE a.codigo END,
    categoria_id       = p_categoria_id,
    descricao          = v_descricao,
    numero_serie       = nullif(btrim(coalesce(p_numero_serie, '')), ''),
    fornecedor         = nullif(btrim(coalesce(p_fornecedor, '')), ''),
    data_aquisicao     = p_data_aquisicao,
    valor_aquisicao    = p_valor_aquisicao,
    nota_fiscal        = nullif(btrim(coalesce(p_nota_fiscal, '')), ''),
    estado_conservacao = nullif(btrim(coalesce(p_estado_conservacao, '')), '')::patrimonio.estado_conservacao,
    obs                = nullif(btrim(coalesce(p_obs, '')), ''),
    atualizado_em      = now(),
    atualizado_por     = auth.uid()
  WHERE a.id = p_id
  RETURNING * INTO v_ativo;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ATIVO_NAO_ENCONTRADO: ativo % não existe', p_id USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object('id', v_ativo.id, 'codigo', v_ativo.codigo);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.patrimonio_atualizar_ativo(integer, text, smallint, text, text, text, date, numeric, text, text, text, smallint, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.patrimonio_atualizar_ativo(integer, text, smallint, text, text, text, date, numeric, text, text, text, smallint, integer) TO authenticated, service_role;

-- ── 9. Registrar movimentação ───────────────────────────────────────────────────
-- O CHECK por tipo da 0247 é a barreira final; aqui as recusas viram mensagem legível.
-- Ativo BAIXADO só aceita `reativacao` — append-only exige um caminho de volta explícito
-- e auditável, nunca um DELETE.
CREATE OR REPLACE FUNCTION public.patrimonio_registrar_movimentacao(
  p_ativo_id            integer,
  p_tipo                text,
  p_data_movimentacao   date     DEFAULT NULL,
  p_area_destino_id     smallint DEFAULT NULL,
  p_detentor_destino_id integer  DEFAULT NULL,
  p_destino_texto       text     DEFAULT NULL,
  p_motivo_baixa        text     DEFAULT NULL,
  p_obs                 text     DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_nome_uid text;
  v_tipo     patrimonio.tipo_movimentacao;
  v_status   text;
  v_data     date := coalesce(p_data_movimentacao, CURRENT_DATE);
  v_id       bigint;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['gestao-pessoas/inventario']);

  IF NOT EXISTS (SELECT 1 FROM patrimonio.ativo a WHERE a.id = p_ativo_id) THEN
    RAISE EXCEPTION 'ATIVO_NAO_ENCONTRADO: ativo % não existe', p_ativo_id USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_tipo := p_tipo::patrimonio.tipo_movimentacao;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'TIPO_INVALIDO: "%" não é um tipo de movimentação', p_tipo USING ERRCODE = '22023';
  END;

  IF v_tipo = 'cadastro' THEN
    RAISE EXCEPTION 'ABERTURA_UNICA: a movimentação de cadastro nasce junto do ativo e não se repete'
      USING ERRCODE = '22023';
  END IF;

  SELECT e.status INTO v_status FROM patrimonio.v_estado_atual e WHERE e.ativo_id = p_ativo_id;

  IF v_status = 'baixado' AND v_tipo <> 'reativacao' THEN
    RAISE EXCEPTION 'ATIVO_BAIXADO: ativo baixado só aceita reativação' USING ERRCODE = '22023';
  END IF;
  IF coalesce(v_status, '') <> 'baixado' AND v_tipo = 'reativacao' THEN
    RAISE EXCEPTION 'ATIVO_NAO_BAIXADO: reativação só faz sentido depois de uma baixa' USING ERRCODE = '22023';
  END IF;

  SELECT u.nome INTO v_nome_uid FROM app.rbac_usuarios u WHERE u.user_id = v_uid;

  INSERT INTO patrimonio.movimentacao (
    ativo_id, tipo, data_movimentacao, area_destino_id, detentor_destino_id,
    destino_texto, motivo_baixa, obs, registrado_por, registrado_por_nome
  ) VALUES (
    p_ativo_id, v_tipo, v_data, p_area_destino_id, p_detentor_destino_id,
    nullif(btrim(coalesce(p_destino_texto, '')), ''),
    nullif(btrim(coalesce(p_motivo_baixa, '')), '')::patrimonio.motivo_baixa,
    nullif(btrim(coalesce(p_obs, '')), ''),
    v_uid, v_nome_uid
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'id', v_id,
    'status', patrimonio.status_derivado(v_tipo, p_detentor_destino_id)
  );
EXCEPTION
  -- O CHECK por tipo é a verdade; traduzimos a violação para uma mensagem que diz o que falta.
  WHEN check_violation THEN
    RAISE EXCEPTION 'DESTINO_INCOERENTE: os campos de destino não batem com o tipo "%"', p_tipo
      USING ERRCODE = '22023';
END;
$$;
REVOKE EXECUTE ON FUNCTION public.patrimonio_registrar_movimentacao(integer, text, date, smallint, integer, text, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.patrimonio_registrar_movimentacao(integer, text, date, smallint, integer, text, text, text) TO authenticated, service_role;

-- ── 10. Editar SÓ a observação de uma movimentação ──────────────────────────────
-- Append-only: é a única mutação permitida no razão, e o diário da 0199 registra o antes/depois.
CREATE OR REPLACE FUNCTION public.patrimonio_atualizar_obs_movimentacao(
  p_id  bigint,
  p_obs text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_id bigint;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['gestao-pessoas/inventario']);

  UPDATE patrimonio.movimentacao m
     SET obs = nullif(btrim(coalesce(p_obs, '')), '')
   WHERE m.id = p_id
  RETURNING m.id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'MOVIMENTACAO_NAO_ENCONTRADA: movimentação % não existe', p_id USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object('id', v_id);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.patrimonio_atualizar_obs_movimentacao(bigint, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.patrimonio_atualizar_obs_movimentacao(bigint, text) TO authenticated, service_role;
