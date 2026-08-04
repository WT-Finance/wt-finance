-- ---------------------------------------------------------------------------
-- 0231 — feat(v5.4.4): produtos NÃO_CLASSIFICADOS no sumário de subsetor +
-- wrapper de leitura para Metas + trava de metas_upsert contra Weddings
--
-- DECLARAÇÃO PRÉVIA (regime aditivo / autônomo):
--   • O QUE FAZ:
--       1) CREATE OR REPLACE de public.get_sumario_subsetor__nucleo(date, date):
--          corpo é o MESMO da 0099 (a 0121 apenas RENOMEOU a função de
--          get_sumario_subsetor para get_sumario_subsetor__nucleo via
--          ALTER FUNCTION — não alterou o corpo; 0122 só mexeu em grants).
--          Ganha UMA chave nova no jsonb_build_object final:
--          'produtos_nao_classificados' — lista de {produto, faturamento,
--          receita} dos itens de Weddings, no período, cujo LEFT JOIN com o
--          mapa de subsetor (dim_produto_subsetor) resulta NULL — exatamente
--          as linhas que hoje caem no balde 'NÃO_CLASSIFICADO' do array
--          'subsetores' já existente. MESMA subquery DISTINCT ON
--          (produto_normalizado) e MESMO JOIN ON dps.produto_normalizado =
--          UPPER(TRIM(dp.nome)) do agregado — nenhuma regra de classificação
--          nova foi escrita, é reuso do que já existe.
--          Assinatura (date, date) INTOCADA (isso é troca de corpo com
--          CREATE OR REPLACE, não adição de parâmetro — não é o caso da
--          lição da v4.23.0/ADR-0126). Nenhuma chave antiga muda de valor.
--       2) CREATE OR REPLACE de public.metas_sumario_subsetor(date, date) —
--          wrapper novo. Existe porque get_sumario_subsetor (o wrapper de
--          0121) é gated em 'performance/weddings', e quem tem só
--          'metas/acompanhamento' não a alcança. O corpo é ÚNICO de
--          propósito: quando a fonte de subsetor for repontada ao Monde
--          (Scope B da v5.1.4/ADR-0151), há UM núcleo (__nucleo) a trocar,
--          e os dois wrappers (get_sumario_subsetor e metas_sumario_subsetor)
--          continuam delegando a ele sem mudança própria.
--       3) CREATE OR REPLACE de public.metas_upsert(jsonb) — corpo idêntico
--          ao da 0175, com UMA trava nova dentro do loop, antes das demais
--          validações: setor_macro_id de Weddings não pode receber meta pela
--          grade de Setor, porque agora é DERIVADO das metas de subsetor
--          (0230). O id de Weddings é resolvido por NOME (não cravado em 2)
--          para não depender de uma numeração fixa — conferido em
--          supabase/migrations/0002_dimensions.sql que o INSERT
--          (nome, display_nome, cor_hex, ordem) insere 'Lazer', 'Weddings',
--          'Corporativo' nessa ordem numa tabela com id bigserial recém-
--          criada, então Weddings recebe id=2 (coincide com a coluna `ordem`
--          = 2, mas o id vem da ORDEM DE INSERÇÃO, não da coluna ordem).
--   • ADITIVA / RETROCOMPATÍVEL: os 3 objetos já existem — isto é
--     CREATE OR REPLACE preservando assinatura. (1) só ACRESCENTA uma chave
--     ao payload; nenhuma chave/valor pré-existente muda. (2) é função NOVA.
--     (3) só ACRESCENTA uma validação que RECUSA um caso que antes era aceito
--     (setor_macro_id=2 em metas_upsert) — não é destrutivo (não toca em
--     dado/coluna/linha existente), mas É uma mudança de comportamento:
--     qualquer chamada futura tentando gravar meta de Weddings pela grade de
--     Setor passa a falhar com METAS_WEDDINGS_DERIVADO. Nenhuma linha
--     pré-existente de app.meta_setor é tocada por esta migration.
--   • INVARIANTE que será verificada: a soma de `faturamento` da lista
--     produtos_nao_classificados tem de ser idêntica, ao centavo, ao
--     `faturamento` do item 'NÃO_CLASSIFICADO' do array `subsetores`; idem
--     para `receita` — garantido estruturalmente porque
--     `dps.subsetor_detalhado IS NULL` (usado na nova subquery) e
--     `COALESCE(dps.subsetor_detalhado, 'NÃO_CLASSIFICADO') = 'NÃO_CLASSIFICADO'`
--     (usado no agregado já existente) selecionam exatamente as MESMAS linhas
--     de fato_venda_item. Valores conhecidos para conferência posterior (NÃO
--     usados no SQL, só para o smoke pós-push via REST/service_role): ano
--     2026 → 4 produtos, faturamento 72.717,41 e receita −37.339,05;
--     jul/2026 → faturamento 18.100,00; ago/2026 → lista vazia.
--   • Reversão (manual, destrutiva): restaurar o corpo anterior de
--     get_sumario_subsetor__nucleo (0099) e de metas_upsert (0175); DROP de
--     metas_sumario_subsetor.
-- ---------------------------------------------------------------------------

-- ── 1. get_sumario_subsetor__nucleo — ganha produtos_nao_classificados ──────
CREATE OR REPLACE FUNCTION public.get_sumario_subsetor__nucleo(
  p_from date,
  p_to   date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_subsetores jsonb;
  v_total      jsonb;
  v_fat_total  numeric;
BEGIN
  SELECT COALESCE(SUM(fvi.valor_total), 0)
  INTO v_fat_total
  FROM analytics.fato_venda_item  fvi
  JOIN analytics.fato_venda       fv  ON fv.id  = fvi.fato_venda_id
  JOIN analytics.dim_setor        ds  ON ds.id  = fvi.setor_id
  JOIN analytics.dim_setor_macro  dsm ON dsm.id = ds.setor_macro_id
  WHERE fv.data_venda BETWEEN p_from AND p_to
    AND dsm.nome = 'Weddings';

  SELECT jsonb_agg(
    jsonb_build_object(
      'subsetor',        sub.subsetor_detalhado,
      'n_vendas',        sub.n_vendas,
      'n_contratos',     sub.n_contratos,
      'faturamento',     sub.faturamento,
      'receita',         sub.receita,
      'margem_pct',      CASE WHEN sub.faturamento > 0
                           THEN ROUND(sub.receita / sub.faturamento * 100, 1)
                           ELSE 0 END,
      'pct_faturamento', CASE WHEN v_fat_total > 0
                           THEN ROUND(sub.faturamento / v_fat_total * 100, 1)
                           ELSE 0 END
    )
    ORDER BY sub.faturamento DESC
  )
  INTO v_subsetores
  FROM (
    SELECT
      COALESCE(dps.subsetor_detalhado, 'NÃO_CLASSIFICADO') AS subsetor_detalhado,
      COUNT(DISTINCT fv.id)                                 AS n_vendas,
      COUNT(DISTINCT fv.id) FILTER (
        WHERE UPPER(TRIM(dp.nome)) = 'CONTRATO DE CASAMENTO'
      )                                                     AS n_contratos,
      COALESCE(SUM(fvi.valor_total), 0)                     AS faturamento,
      COALESCE(SUM(fvi.receitas),    0)                     AS receita
    FROM analytics.fato_venda_item  fvi
    JOIN analytics.fato_venda       fv  ON fv.id  = fvi.fato_venda_id
    JOIN analytics.dim_setor        ds  ON ds.id  = fvi.setor_id
    JOIN analytics.dim_setor_macro  dsm ON dsm.id = ds.setor_macro_id
    JOIN analytics.dim_produto      dp  ON dp.id  = fvi.produto_id
    LEFT JOIN (
      SELECT DISTINCT ON (produto_normalizado)
             produto_normalizado,
             subsetor_detalhado
      FROM   analytics.dim_produto_subsetor
      WHERE  ativo = TRUE
      ORDER  BY produto_normalizado
    ) dps ON dps.produto_normalizado = UPPER(TRIM(dp.nome))
    WHERE fv.data_venda BETWEEN p_from AND p_to
      AND dsm.nome = 'Weddings'
    GROUP BY COALESCE(dps.subsetor_detalhado, 'NÃO_CLASSIFICADO')
  ) sub;

  SELECT jsonb_build_object(
    'n_vendas',    COUNT(DISTINCT fv.id),
    'faturamento', COALESCE(SUM(fvi.valor_total), 0),
    'receita',     COALESCE(SUM(fvi.receitas),    0),
    'margem_pct',  CASE WHEN COALESCE(SUM(fvi.valor_total), 0) > 0
                     THEN ROUND(SUM(fvi.receitas) / SUM(fvi.valor_total) * 100, 1)
                     ELSE 0 END
  )
  INTO v_total
  FROM analytics.fato_venda_item  fvi
  JOIN analytics.fato_venda       fv  ON fv.id  = fvi.fato_venda_id
  JOIN analytics.dim_setor        ds  ON ds.id  = fvi.setor_id
  JOIN analytics.dim_setor_macro  dsm ON dsm.id = ds.setor_macro_id
  WHERE fv.data_venda BETWEEN p_from AND p_to
    AND dsm.nome = 'Weddings';

  RETURN jsonb_build_object(
    'periodo',    jsonb_build_object('inicio', p_from, 'fim', p_to),
    'subsetores', COALESCE(v_subsetores, '[]'::jsonb),
    'total',      COALESCE(v_total,
      '{"n_vendas":0,"faturamento":0,"receita":0,"margem_pct":0}'::jsonb),
    -- NOVO: os mesmos itens que caem em 'NÃO_CLASSIFICADO' acima, abertos por
    -- produto. dps.subsetor_detalhado IS NULL é a MESMA condição que produz
    -- COALESCE(dps.subsetor_detalhado, 'NÃO_CLASSIFICADO') = 'NÃO_CLASSIFICADO'
    -- no agregado acima — soma de faturamento/receita aqui bate ao centavo
    -- com o item 'NÃO_CLASSIFICADO' de 'subsetores' (mesmas linhas de origem).
    'produtos_nao_classificados', COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'produto',     np.produto,
                 'faturamento', np.faturamento,
                 'receita',     np.receita
               ) ORDER BY np.faturamento DESC
             )
      FROM (
        SELECT
          dp.nome                            AS produto,
          COALESCE(SUM(fvi.valor_total), 0)  AS faturamento,
          COALESCE(SUM(fvi.receitas),    0)  AS receita
        FROM analytics.fato_venda_item  fvi
        JOIN analytics.fato_venda       fv  ON fv.id  = fvi.fato_venda_id
        JOIN analytics.dim_setor        ds  ON ds.id  = fvi.setor_id
        JOIN analytics.dim_setor_macro  dsm ON dsm.id = ds.setor_macro_id
        JOIN analytics.dim_produto      dp  ON dp.id  = fvi.produto_id
        LEFT JOIN (
          SELECT DISTINCT ON (produto_normalizado)
                 produto_normalizado,
                 subsetor_detalhado
          FROM   analytics.dim_produto_subsetor
          WHERE  ativo = TRUE
          ORDER  BY produto_normalizado
        ) dps ON dps.produto_normalizado = UPPER(TRIM(dp.nome))
        WHERE fv.data_venda BETWEEN p_from AND p_to
          AND dsm.nome = 'Weddings'
          AND dps.subsetor_detalhado IS NULL
        GROUP BY dp.nome
      ) np
    ), '[]'::jsonb)
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.get_sumario_subsetor__nucleo(date, date) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_sumario_subsetor__nucleo(date, date) TO service_role;

-- ── 2. metas_sumario_subsetor — wrapper de leitura p/ a área de Metas ───────
-- Guard próprio ('metas/acompanhamento'|'metas'), distinto do guard de
-- get_sumario_subsetor (0121: 'performance/weddings'). O corpo delega
-- integralmente ao MESMO núcleo — ver ponto (2) da declaração acima.
CREATE OR REPLACE FUNCTION public.metas_sumario_subsetor(p_from date, p_to date)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['metas/acompanhamento', 'metas']);
  RETURN public.get_sumario_subsetor__nucleo(p_from, p_to);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.metas_sumario_subsetor(date, date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.metas_sumario_subsetor(date, date) TO authenticated, service_role;

-- ── 3. metas_upsert — trava contra gravar Weddings pela grade de Setor ──────
-- Corpo idêntico ao da 0175 + a trava nova abaixo. A meta de Weddings
-- (setor macro) agora é DERIVADA das metas de subsetor (0230) — não pode mais
-- ser digitada diretamente na grade de Setor.
CREATE OR REPLACE FUNCTION public.metas_upsert(p_metas jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  item          jsonb;
  v_sid         bigint;
  v_ano         int;
  v_mes         int;
  v_valor       numeric;
  v_pct         numeric;
  v_old_valor   numeric;
  v_old_pct     numeric;
  v_existe      boolean;
  v_uid         uuid;
  v_quem        text;
  v_n           int := 0;
  v_weddings_id bigint;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['metas']);

  -- id de Weddings resolvido por NOME (não cravado em 2) para não ficar
  -- frágil a uma renumeração futura da dimensão. Conferido em
  -- 0002_dimensions.sql: id=2 hoje (ver nota no header desta migration).
  SELECT id INTO v_weddings_id FROM analytics.dim_setor_macro WHERE nome = 'Weddings';

  v_uid := nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid;
  IF v_uid IS NOT NULL THEN
    SELECT coalesce(u.nome, u.email) INTO v_quem FROM app.rbac_usuarios u WHERE u.user_id = v_uid;
  END IF;

  FOR item IN SELECT jsonb_array_elements(p_metas)
  LOOP
    v_sid   := (item->>'setor_macro_id')::bigint;
    v_ano   := (item->>'ano')::int;
    v_mes   := (item->>'mes')::int;
    v_valor := (item->>'valor_meta')::numeric;
    v_pct   := nullif(item->>'pct_receita', '')::numeric;

    IF v_sid = v_weddings_id THEN
      RAISE EXCEPTION 'METAS_WEDDINGS_DERIVADO: a meta de Weddings é derivada das metas de subsetor'
        USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM analytics.dim_setor_macro WHERE id = v_sid) THEN
      RAISE EXCEPTION 'METAS_SETOR_INVALIDO: setor % inexistente', v_sid USING ERRCODE = '22023';
    END IF;
    IF v_mes < 1 OR v_mes > 12 THEN
      RAISE EXCEPTION 'METAS_MES_INVALIDO: %', v_mes USING ERRCODE = '22023';
    END IF;
    IF v_valor IS NULL OR v_valor < 0 THEN
      RAISE EXCEPTION 'METAS_VALOR_INVALIDO: %', v_valor USING ERRCODE = '22023';
    END IF;
    IF v_pct IS NOT NULL AND (v_pct < 0 OR v_pct > 100) THEN
      RAISE EXCEPTION 'METAS_PCT_INVALIDO: %', v_pct USING ERRCODE = '22023';
    END IF;

    SELECT valor_meta, pct_receita, true INTO v_old_valor, v_old_pct, v_existe
    FROM app.meta_setor WHERE setor_macro_id = v_sid AND ano = v_ano AND mes = v_mes;

    INSERT INTO app.meta_setor (setor_macro_id, ano, mes, valor_meta, pct_receita, fonte)
    VALUES (v_sid, v_ano, v_mes, v_valor, v_pct, 'real')
    ON CONFLICT (setor_macro_id, ano, mes) DO UPDATE
      SET valor_meta = EXCLUDED.valor_meta,
          pct_receita = EXCLUDED.pct_receita,
          fonte       = 'real';

    IF NOT coalesce(v_existe, false)
       OR v_old_valor IS DISTINCT FROM v_valor
       OR v_old_pct   IS DISTINCT FROM v_pct THEN
      INSERT INTO app.meta_setor_historico
        (setor_macro_id, ano, mes, valor_meta, pct_receita, fonte,
         alterado_por, valor_anterior, pct_receita_anterior, motivo_alteracao)
      VALUES
        (v_sid, v_ano, v_mes, v_valor, v_pct, 'real',
         v_quem, v_old_valor, v_old_pct, NULL);
      v_n := v_n + 1;
    END IF;

    v_existe := NULL; v_old_valor := NULL; v_old_pct := NULL;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'gravadas', v_n);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.metas_upsert(jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.metas_upsert(jsonb) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
