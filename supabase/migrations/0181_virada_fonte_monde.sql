-- ---------------------------------------------------------------------------
-- 0181 — feat(v5.1.4/M1): A VIRADA — fonte de vendas passa a ser o Monde (REVERSÍVEL)
--
-- DECLARAÇÃO (CLAUDE.md): REVERSÍVEL / retrocompatível. NÃO toca o fato do upload
--   (analytics.fato_venda/item, raw.vendas_excel INTOCADOS). É troca de PONTEIRO:
--   as funções PURA-mv passam a ler o espelho Monde via views-compat (mesma forma).
--   CREATE OR REPLACE de função + CREATE VIEW → classificação ADITIVA (sem DROP/TRUNCATE
--   top-level). O rollback é a migration de volta (bloco DOWN abaixo), NÃO restauração de dado.
--
-- ⚠️ ESTA MIGRATION É O FLIP DE PRODUÇÃO. NÃO aplicar autonomamente: a aplicação é GATE
--    do Yan, DEPOIS da comunicação à diretoria (runbook). backup-gate verde, horário calmo.
--
-- Escopo (ADR-0151): repontadas as 7 funções PURA-mv (só leem a mv):
--   diária → get_executiva_kpis__nucleo, metas_ritmo_diario, get_tendencia_margem__nucleo,
--            get_decomposicao_variacao__nucleo, get_historico_12m_setores__nucleo, get_mix_setor__nucleo
--   mensal → get_historico_mensal__nucleo
--   FORA (MISTA, leem o fato direto → exigiriam alimentar o fato = escopo futuro):
--            get_mix_produto__nucleo (mv+fato), get_cagr__nucleo (mv_mensal+fato) — SEGUEM no upload.
--   Metas ≡ Performance por construção (mesma get_executiva_kpis).
-- ---------------------------------------------------------------------------

-- 1. View-compat DIÁRIA: mesma FORMA de analytics.mv_vendas_diarias (setor_macro_id bigint),
--    sobre o espelho Monde (setor_macro TEXT → id via dim). Troca de FROM vira 1 linha por função.
CREATE OR REPLACE VIEW monde.mv_vendas_diarias_compat AS
  SELECT m.data_venda, dsm.id AS setor_macro_id, m.valor_total, m.receitas, m.vendas_count
  FROM monde.mv_vendas_diarias m
  JOIN analytics.dim_setor_macro dsm ON dsm.nome = m.setor_macro;

-- 2. View MENSAL espelho: mesma FORMA de analytics.mv_vendas_mensais, roll-up da compat diária
--    (venda tem 1 data_venda → soma dos distintos diários = distintos mensais). Sempre fresca.
CREATE OR REPLACE VIEW monde.mv_vendas_mensais AS
  SELECT dd.ano, dd.mes, cpt.setor_macro_id,
         SUM(cpt.valor_total) AS valor_total, SUM(cpt.receitas) AS receitas, SUM(cpt.vendas_count) AS vendas_count
  FROM monde.mv_vendas_diarias_compat cpt
  JOIN analytics.dim_data dd ON dd.data = cpt.data_venda
  GROUP BY dd.ano, dd.mes, cpt.setor_macro_id;

-- 3. Repoint das 7 funções (corpo idêntico ao vivo, só o FROM da mv trocado).
CREATE OR REPLACE FUNCTION public.get_executiva_kpis__nucleo(p_from date, p_to date, p_setor text DEFAULT 'todos'::text, p_ant_from date DEFAULT NULL::date, p_ant_to date DEFAULT NULL::date, p_yoy_from date DEFAULT NULL::date, p_yoy_to date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_dias          int := (p_to - p_from) + 1;

  v_ant_to        date := COALESCE(p_ant_to,   p_from - 1);
  v_ant_from      date := COALESCE(p_ant_from, p_from - v_dias);

  v_yoy_from      date := COALESCE(p_yoy_from, (p_from - interval '1 year')::date);
  v_yoy_to        date := COALESCE(p_yoy_to,   (p_to   - interval '1 year')::date);

  v_fat           numeric := 0;
  v_rec           numeric := 0;
  v_vendas        bigint  := 0;

  v_fat_ant       numeric := 0;
  v_rec_ant       numeric := 0;
  v_vendas_ant    bigint  := 0;

  v_fat_yoy       numeric := 0;
  v_rec_yoy       numeric := 0;
  v_vendas_yoy    bigint  := 0;

  v_margem        numeric;
  v_margem_ant    numeric;
  v_margem_yoy    numeric;
  v_ticket        numeric;
  v_ticket_ant    numeric;
  v_ticket_yoy    numeric;
  v_rec_media     numeric;
  v_rec_media_ant numeric;
  v_rec_media_yoy numeric;
BEGIN
  -- ── Período atual ──────────────────────────────────────────────────────
  SELECT
    COALESCE(SUM(vd.valor_total), 0),
    COALESCE(SUM(vd.receitas), 0),
    COALESCE(SUM(vd.vendas_count), 0)
  INTO v_fat, v_rec, v_vendas
  FROM monde.mv_vendas_diarias_compat vd
  JOIN analytics.dim_setor_macro dsm ON dsm.id = vd.setor_macro_id
  WHERE vd.data_venda BETWEEN p_from AND p_to
    AND (p_setor = 'todos' OR dsm.nome = p_setor);

  -- ── Período anterior ───────────────────────────────────────────────────
  SELECT
    COALESCE(SUM(vd.valor_total), 0),
    COALESCE(SUM(vd.receitas), 0),
    COALESCE(SUM(vd.vendas_count), 0)
  INTO v_fat_ant, v_rec_ant, v_vendas_ant
  FROM monde.mv_vendas_diarias_compat vd
  JOIN analytics.dim_setor_macro dsm ON dsm.id = vd.setor_macro_id
  WHERE vd.data_venda BETWEEN v_ant_from AND v_ant_to
    AND (p_setor = 'todos' OR dsm.nome = p_setor);

  -- ── Período YoY ────────────────────────────────────────────────────────
  SELECT
    COALESCE(SUM(vd.valor_total), 0),
    COALESCE(SUM(vd.receitas), 0),
    COALESCE(SUM(vd.vendas_count), 0)
  INTO v_fat_yoy, v_rec_yoy, v_vendas_yoy
  FROM monde.mv_vendas_diarias_compat vd
  JOIN analytics.dim_setor_macro dsm ON dsm.id = vd.setor_macro_id
  WHERE vd.data_venda BETWEEN v_yoy_from AND v_yoy_to
    AND (p_setor = 'todos' OR dsm.nome = p_setor);

  -- ── Margens, tickets e receita média ──────────────────────────────────
  v_margem     := CASE WHEN v_fat     > 0 THEN ROUND((v_rec     / v_fat     * 100)::numeric, 2) ELSE NULL END;
  v_margem_ant := CASE WHEN v_fat_ant > 0 THEN ROUND((v_rec_ant / v_fat_ant * 100)::numeric, 2) ELSE NULL END;
  v_margem_yoy := CASE WHEN v_fat_yoy > 0 THEN ROUND((v_rec_yoy / v_fat_yoy * 100)::numeric, 2) ELSE NULL END;

  v_ticket     := CASE WHEN v_vendas     > 0 THEN ROUND((v_fat     / v_vendas)::numeric,     2) ELSE NULL END;
  v_ticket_ant := CASE WHEN v_vendas_ant > 0 THEN ROUND((v_fat_ant / v_vendas_ant)::numeric, 2) ELSE NULL END;
  v_ticket_yoy := CASE WHEN v_vendas_yoy > 0 THEN ROUND((v_fat_yoy / v_vendas_yoy)::numeric, 2) ELSE NULL END;

  v_rec_media     := CASE WHEN v_vendas     > 0 THEN ROUND((v_rec     / v_vendas)::numeric,     2) ELSE NULL END;
  v_rec_media_ant := CASE WHEN v_vendas_ant > 0 THEN ROUND((v_rec_ant / v_vendas_ant)::numeric, 2) ELSE NULL END;
  v_rec_media_yoy := CASE WHEN v_vendas_yoy > 0 THEN ROUND((v_rec_yoy / v_vendas_yoy)::numeric, 2) ELSE NULL END;

  RETURN jsonb_build_object(
    'periodo',          jsonb_build_object('from', to_char(p_from,     'YYYY-MM-DD'), 'to', to_char(p_to,     'YYYY-MM-DD')),
    'periodo_anterior', jsonb_build_object('from', to_char(v_ant_from, 'YYYY-MM-DD'), 'to', to_char(v_ant_to, 'YYYY-MM-DD')),
    'periodo_yoy',      jsonb_build_object('from', to_char(v_yoy_from, 'YYYY-MM-DD'), 'to', to_char(v_yoy_to, 'YYYY-MM-DD')),

    'faturamento', jsonb_build_object(
      'valor',             v_fat,
      'variacao_anterior', CASE WHEN v_vendas = 0 THEN NULL WHEN v_fat_ant = 0 THEN NULL
                                ELSE ROUND(((v_fat - v_fat_ant) / v_fat_ant * 100)::numeric, 1) END,
      'variacao_yoy',      CASE WHEN v_vendas = 0 THEN NULL WHEN v_fat_yoy = 0 THEN NULL
                                ELSE ROUND(((v_fat - v_fat_yoy) / v_fat_yoy * 100)::numeric, 1) END
    ),
    'receita', jsonb_build_object(
      'valor',             v_rec,
      'variacao_anterior', CASE WHEN v_vendas = 0 THEN NULL WHEN v_rec_ant = 0 THEN NULL
                                ELSE ROUND(((v_rec - v_rec_ant) / v_rec_ant * 100)::numeric, 1) END,
      'variacao_yoy',      CASE WHEN v_vendas = 0 THEN NULL WHEN v_rec_yoy = 0 THEN NULL
                                ELSE ROUND(((v_rec - v_rec_yoy) / v_rec_yoy * 100)::numeric, 1) END
    ),
    'margem_pct', jsonb_build_object(
      'valor',             v_margem,
      'variacao_anterior', CASE WHEN v_vendas = 0 THEN NULL
                                WHEN v_margem IS NULL OR v_margem_ant IS NULL THEN NULL
                                ELSE ROUND((v_margem - v_margem_ant)::numeric, 2) END,
      'variacao_yoy',      CASE WHEN v_vendas = 0 THEN NULL
                                WHEN v_margem IS NULL OR v_margem_yoy IS NULL THEN NULL
                                ELSE ROUND((v_margem - v_margem_yoy)::numeric, 2) END,
      'is_pp', true
    ),
    'vendas', jsonb_build_object(
      'valor',             v_vendas,
      'variacao_anterior', CASE WHEN v_vendas = 0 THEN NULL WHEN v_vendas_ant = 0 THEN NULL
                                ELSE ROUND((((v_vendas - v_vendas_ant)::numeric) / v_vendas_ant * 100)::numeric, 1) END,
      'variacao_yoy',      CASE WHEN v_vendas = 0 THEN NULL WHEN v_vendas_yoy = 0 THEN NULL
                                ELSE ROUND((((v_vendas - v_vendas_yoy)::numeric) / v_vendas_yoy * 100)::numeric, 1) END
    ),
    'ticket_medio', jsonb_build_object(
      'valor',             v_ticket,
      'variacao_anterior', CASE WHEN v_vendas = 0 THEN NULL WHEN v_ticket_ant IS NULL THEN NULL
                                ELSE ROUND(((v_ticket - v_ticket_ant) / v_ticket_ant * 100)::numeric, 1) END,
      'variacao_yoy',      CASE WHEN v_vendas = 0 THEN NULL WHEN v_ticket_yoy IS NULL THEN NULL
                                ELSE ROUND(((v_ticket - v_ticket_yoy) / v_ticket_yoy * 100)::numeric, 1) END
    ),
    'receita_media', jsonb_build_object(
      'valor',             v_rec_media,
      'variacao_anterior', CASE WHEN v_vendas = 0 THEN NULL WHEN v_rec_media_ant IS NULL THEN NULL
                                ELSE ROUND(((v_rec_media - v_rec_media_ant) / v_rec_media_ant * 100)::numeric, 1) END,
      'variacao_yoy',      CASE WHEN v_vendas = 0 THEN NULL WHEN v_rec_media_yoy IS NULL THEN NULL
                                ELSE ROUND(((v_rec_media - v_rec_media_yoy) / v_rec_media_yoy * 100)::numeric, 1) END
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.metas_ritmo_diario(p_from date, p_to date, p_setor text DEFAULT 'todos'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_serie  jsonb;
  v_ultima text;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['metas/acompanhamento', 'metas']);
  v_serie := COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'data',        to_char(t.d, 'YYYY-MM-DD'),
             'valor_total', t.vt,
             'receitas',    t.rec
           ) ORDER BY t.d)
    FROM (
      SELECT vd.data_venda AS d,
             SUM(vd.valor_total) AS vt,
             SUM(vd.receitas)    AS rec
      FROM monde.mv_vendas_diarias_compat vd
      JOIN analytics.dim_setor_macro dsm ON dsm.id = vd.setor_macro_id
      WHERE vd.data_venda BETWEEN p_from AND p_to
        AND (p_setor = 'todos' OR dsm.nome = p_setor)
      GROUP BY vd.data_venda
    ) t
  ), '[]'::jsonb);
  -- "hoje" do produto = data da última venda carregada (global), não o calendário.
  SELECT to_char(max(vd.data_venda), 'YYYY-MM-DD') INTO v_ultima
  FROM monde.mv_vendas_diarias_compat vd;
  RETURN jsonb_build_object('serie', v_serie, 'ultima_venda', v_ultima);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_tendencia_margem__nucleo(p_from date, p_to date, p_setor text DEFAULT 'todos'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_dias          int := (p_to - p_from) + 1;
  v_granularidade text;
  v_result        jsonb;
BEGIN
  v_granularidade := CASE
    WHEN v_dias <= 30 THEN 'diaria'
    WHEN v_dias <= 90 THEN 'semanal'
    ELSE                   'mensal'
  END;

  IF v_granularidade = 'diaria' THEN
    -- Um ponto por dia
    WITH serie AS (
      SELECT d::date AS data_inicio
      FROM generate_series(p_from, p_to, '1 day'::interval) d
    ),
    vendas AS (
      SELECT
        vd.data_venda,
        SUM(vd.valor_total) AS faturamento,
        SUM(vd.receitas)    AS receita
      FROM monde.mv_vendas_diarias_compat vd
      JOIN analytics.dim_setor_macro dsm ON dsm.id = vd.setor_macro_id
      WHERE vd.data_venda BETWEEN p_from AND p_to
        AND (p_setor = 'todos' OR dsm.nome = p_setor)
      GROUP BY vd.data_venda
    )
    SELECT jsonb_build_object(
      'granularidade', 'diaria',
      'pontos', jsonb_agg(
        jsonb_build_object(
          'label',        to_char(s.data_inicio, 'DD/MM'),
          'data_inicio',  to_char(s.data_inicio, 'YYYY-MM-DD'),
          'faturamento',  COALESCE(v.faturamento, 0),
          'receita',      COALESCE(v.receita,    0),
          'margem_pct',   CASE WHEN COALESCE(v.faturamento, 0) > 0
                            THEN ROUND((COALESCE(v.receita, 0) / v.faturamento * 100)::numeric, 2)
                            ELSE NULL END
        )
        ORDER BY s.data_inicio
      )
    )
    INTO v_result
    FROM serie s
    LEFT JOIN vendas v ON v.data_venda = s.data_inicio;

  ELSIF v_granularidade = 'semanal' THEN
    -- Um ponto por semana ISO
    WITH semanas AS (
      SELECT
        date_trunc('week', d)::date AS semana_inicio,
        (date_trunc('week', d) + interval '6 days')::date AS semana_fim
      FROM generate_series(
        date_trunc('week', p_from),
        date_trunc('week', p_to),
        '1 week'::interval
      ) d
      GROUP BY 1, 2
    ),
    vendas AS (
      SELECT
        date_trunc('week', vd.data_venda)::date AS semana_inicio,
        SUM(vd.valor_total) AS faturamento,
        SUM(vd.receitas)    AS receita
      FROM monde.mv_vendas_diarias_compat vd
      JOIN analytics.dim_setor_macro dsm ON dsm.id = vd.setor_macro_id
      WHERE vd.data_venda BETWEEN p_from AND p_to
        AND (p_setor = 'todos' OR dsm.nome = p_setor)
      GROUP BY 1
    )
    SELECT jsonb_build_object(
      'granularidade', 'semanal',
      'pontos', jsonb_agg(
        jsonb_build_object(
          'label',        'Sem ' || to_char(s.semana_inicio, 'WW'),
          'data_inicio',  to_char(s.semana_inicio, 'YYYY-MM-DD'),
          'faturamento',  COALESCE(v.faturamento, 0),
          'receita',      COALESCE(v.receita,    0),
          'margem_pct',   CASE WHEN COALESCE(v.faturamento, 0) > 0
                            THEN ROUND((COALESCE(v.receita, 0) / v.faturamento * 100)::numeric, 2)
                            ELSE NULL END
        )
        ORDER BY s.semana_inicio
      )
    )
    INTO v_result
    FROM semanas s
    LEFT JOIN vendas v ON v.semana_inicio = s.semana_inicio;

  ELSE
    -- Mensal
    WITH meses AS (
      SELECT
        date_trunc('month', d)::date AS mes_inicio
      FROM generate_series(
        date_trunc('month', p_from),
        date_trunc('month', p_to),
        '1 month'::interval
      ) d
    ),
    vendas AS (
      SELECT
        date_trunc('month', vd.data_venda)::date AS mes_inicio,
        SUM(vd.valor_total) AS faturamento,
        SUM(vd.receitas)    AS receita
      FROM monde.mv_vendas_diarias_compat vd
      JOIN analytics.dim_setor_macro dsm ON dsm.id = vd.setor_macro_id
      WHERE vd.data_venda BETWEEN p_from AND p_to
        AND (p_setor = 'todos' OR dsm.nome = p_setor)
      GROUP BY 1
    )
    SELECT jsonb_build_object(
      'granularidade', 'mensal',
      'pontos', jsonb_agg(
        jsonb_build_object(
          'label',        to_char(s.mes_inicio, 'Mon/YY'),
          'data_inicio',  to_char(s.mes_inicio, 'YYYY-MM-DD'),
          'faturamento',  COALESCE(v.faturamento, 0),
          'receita',      COALESCE(v.receita,    0),
          'margem_pct',   CASE WHEN COALESCE(v.faturamento, 0) > 0
                            THEN ROUND((COALESCE(v.receita, 0) / v.faturamento * 100)::numeric, 2)
                            ELSE NULL END
        )
        ORDER BY s.mes_inicio
      )
    )
    INTO v_result
    FROM meses s
    LEFT JOIN vendas v ON v.mes_inicio = s.mes_inicio;
  END IF;

  RETURN COALESCE(v_result, jsonb_build_object('granularidade', v_granularidade, 'pontos', '[]'::jsonb));
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_decomposicao_variacao__nucleo(p_from date, p_to date, p_ant_from date, p_ant_to date, p_setor text DEFAULT 'todos'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  WITH
  atual AS (
    SELECT
      dsm.id, dsm.nome, dsm.display_nome, dsm.cor_hex, dsm.ordem,
      COALESCE(SUM(vd.valor_total), 0) AS fat
    FROM analytics.dim_setor_macro dsm
    LEFT JOIN monde.mv_vendas_diarias_compat vd
      ON vd.setor_macro_id = dsm.id
     AND vd.data_venda BETWEEN p_from AND p_to
    WHERE p_setor = 'todos' OR dsm.nome = p_setor
    GROUP BY dsm.id, dsm.nome, dsm.display_nome, dsm.cor_hex, dsm.ordem
  ),
  anterior AS (
    SELECT
      dsm.id,
      COALESCE(SUM(vd.valor_total), 0) AS fat
    FROM analytics.dim_setor_macro dsm
    LEFT JOIN monde.mv_vendas_diarias_compat vd
      ON vd.setor_macro_id = dsm.id
     AND vd.data_venda BETWEEN p_ant_from AND p_ant_to
    WHERE p_setor = 'todos' OR dsm.nome = p_setor
    GROUP BY dsm.id
  ),
  combined AS (
    SELECT
      a.id, a.nome, a.display_nome, a.cor_hex, a.ordem,
      a.fat                        AS atual,
      COALESCE(ant.fat, 0)         AS anterior,
      a.fat - COALESCE(ant.fat, 0) AS variacao
    FROM atual a
    LEFT JOIN anterior ant ON ant.id = a.id
  ),
  totals AS (
    SELECT
      SUM(atual)    AS fat_total,
      SUM(anterior) AS ant_total,
      SUM(variacao) AS variacao_total
    FROM combined
  )
  SELECT jsonb_build_object(
    'variacao_total',     t.variacao_total,
    'variacao_total_pct', CASE WHEN t.ant_total > 0
                            THEN ROUND(((t.variacao_total / t.ant_total) * 100)::numeric, 1)
                            ELSE NULL END,
    'tem_dados_anterior', t.ant_total > 0,
    'periodo_atual',    jsonb_build_object(
                          'from', to_char(p_from,     'YYYY-MM-DD'),
                          'to',   to_char(p_to,       'YYYY-MM-DD')),
    'periodo_anterior', jsonb_build_object(
                          'from', to_char(p_ant_from, 'YYYY-MM-DD'),
                          'to',   to_char(p_ant_to,   'YYYY-MM-DD')),
    'setores', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'nome',             c.nome,
          'display_nome',     c.display_nome,
          'cor_hex',          c.cor_hex,
          'atual',            c.atual,
          'anterior',         c.anterior,
          'variacao',         c.variacao,
          'variacao_pct',     CASE WHEN c.anterior > 0
                                THEN ROUND(((c.variacao / c.anterior) * 100)::numeric, 1)
                                ELSE NULL END,
          'contribuicao_pct', CASE WHEN ABS(t.variacao_total) > 0
                                THEN ROUND(((c.variacao / t.variacao_total) * 100)::numeric, 1)
                                ELSE NULL END
        )
        ORDER BY ABS(c.variacao) DESC
      )
      FROM combined c
    )
  )
  INTO v_result
  FROM totals t;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_historico_12m_setores__nucleo(p_setor text DEFAULT 'todos'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  WITH
  months AS (
    SELECT date_trunc('month', CURRENT_DATE - (n || ' months')::interval)::date AS m_start
    FROM generate_series(11, 0, -1) AS n
  ),
  fv AS (
    SELECT
      vd.data_venda,
      vd.valor_total,
      vd.receitas,
      dsm.nome AS setor_nome
    FROM monde.mv_vendas_diarias_compat vd
    JOIN analytics.dim_setor_macro dsm ON dsm.id = vd.setor_macro_id
    WHERE p_setor = 'todos' OR dsm.nome = p_setor
  ),
  agg AS (
    SELECT
      m.m_start,
      EXTRACT(year  FROM m.m_start)::int AS ano,
      EXTRACT(month FROM m.m_start)::int AS mes,
      COALESCE(SUM(CASE WHEN fv.setor_nome = 'Lazer'       THEN fv.valor_total END), 0)::numeric AS fat_lazer,
      COALESCE(SUM(CASE WHEN fv.setor_nome = 'Weddings'    THEN fv.valor_total END), 0)::numeric AS fat_weddings,
      COALESCE(SUM(CASE WHEN fv.setor_nome = 'Corporativo' THEN fv.valor_total END), 0)::numeric AS fat_corp,
      COALESCE(SUM(fv.valor_total), 0)::numeric AS fat_total,
      COALESCE(SUM(fv.receitas),    0)::numeric AS rec_total
    FROM months m
    LEFT JOIN fv ON fv.data_venda
      BETWEEN m.m_start
          AND (m.m_start + interval '1 month' - interval '1 day')::date
    GROUP BY m.m_start
    ORDER BY m.m_start
  )
  SELECT jsonb_build_object(
    'meses', jsonb_agg(
      jsonb_build_object(
        'ano',         a.ano,
        'mes',         a.mes,
        'eh_atual',    a.m_start = date_trunc('month', CURRENT_DATE)::date,
        'total',       a.fat_total,
        'receita',     a.rec_total,
        'margem_pct',  CASE WHEN a.fat_total > 0
                         THEN ROUND((a.rec_total / a.fat_total * 100)::numeric, 1)
                         ELSE NULL END,
        'Lazer',       a.fat_lazer,
        'Weddings',    a.fat_weddings,
        'Corporativo', a.fat_corp
      )
      ORDER BY a.m_start
    )
  )
  INTO v_result
  FROM agg a;

  RETURN COALESCE(v_result, '{"meses":[]}'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_mix_setor__nucleo(p_from date, p_to date, p_setor text DEFAULT 'todos'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  WITH totais AS (
    SELECT
      COALESCE(SUM(vd.valor_total), 0) AS fat_total,
      COALESCE(SUM(vd.receitas),    0) AS rec_total
    FROM monde.mv_vendas_diarias_compat vd
    JOIN analytics.dim_setor_macro dsm ON dsm.id = vd.setor_macro_id
    WHERE vd.data_venda BETWEEN p_from AND p_to
      AND (p_setor = 'todos' OR dsm.nome = p_setor)
  ),
  por_setor AS (
    SELECT
      dsm.id,
      dsm.nome,
      dsm.display_nome,
      dsm.cor_hex,
      dsm.ordem,
      COALESCE(SUM(vd.valor_total), 0) AS faturamento,
      COALESCE(SUM(vd.receitas),    0) AS receita
    FROM analytics.dim_setor_macro dsm
    LEFT JOIN monde.mv_vendas_diarias_compat vd
      ON vd.setor_macro_id = dsm.id
     AND vd.data_venda BETWEEN p_from AND p_to
    WHERE (p_setor = 'todos' OR dsm.nome = p_setor)
    GROUP BY dsm.id, dsm.nome, dsm.display_nome, dsm.cor_hex, dsm.ordem
  )
  SELECT jsonb_build_object(
    'total', jsonb_build_object(
      'faturamento', t.fat_total,
      'receita',     t.rec_total,
      'margem_pct',  CASE WHEN t.fat_total > 0
                       THEN ROUND((t.rec_total / t.fat_total * 100)::numeric, 2)
                       ELSE NULL END
    ),
    'setores', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'setor_macro',    s.nome,
          'display_nome',   s.display_nome,
          'cor_hex',        s.cor_hex,
          'faturamento',    s.faturamento,
          'receita',        s.receita,
          'margem_pct',     CASE WHEN s.faturamento > 0
                              THEN ROUND((s.receita / s.faturamento * 100)::numeric, 2)
                              ELSE NULL END,
          'pct_faturamento', CASE WHEN t.fat_total > 0
                               THEN ROUND((s.faturamento / t.fat_total * 100)::numeric, 1)
                               ELSE 0 END,
          'pct_receita',     CASE WHEN t.rec_total > 0
                               THEN ROUND((s.receita / t.rec_total * 100)::numeric, 1)
                               ELSE 0 END
        )
        ORDER BY s.ordem
      )
      FROM por_setor s
    )
  )
  INTO v_result
  FROM totais t;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_historico_mensal__nucleo(p_setor text DEFAULT 'todos'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  WITH month_series AS (
    SELECT
      EXTRACT(YEAR  FROM m)::int AS ano,
      EXTRACT(MONTH FROM m)::int AS mes
    FROM generate_series(
      date_trunc('month', CURRENT_DATE) - interval '23 months',
      date_trunc('month', CURRENT_DATE),
      '1 month'::interval
    ) m
  ),
  vendas_mes AS (
    SELECT
      vm.ano,
      vm.mes,
      SUM(vm.valor_total)        AS valor_total,
      SUM(vm.receitas)           AS receitas,
      SUM(vm.vendas_count)::int  AS vendas_count
    FROM monde.mv_vendas_mensais vm
    JOIN analytics.dim_setor_macro dsm ON dsm.id = vm.setor_macro_id
    WHERE (p_setor = 'todos' OR dsm.nome = p_setor)
    GROUP BY vm.ano, vm.mes
  ),
  metas_mes AS (
    SELECT
      ms.ano,
      ms.mes,
      SUM(ms.valor_meta) AS valor_meta
    FROM app.meta_setor ms
    JOIN analytics.dim_setor_macro dsm ON dsm.id = ms.setor_macro_id
    WHERE (p_setor = 'todos' OR dsm.nome = p_setor)
    GROUP BY ms.ano, ms.mes
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'ano',          s.ano,
      'mes',          s.mes,
      'valor_total',  COALESCE(v.valor_total, 0),
      'receitas',     COALESCE(v.receitas, 0),
      'vendas_count', COALESCE(v.vendas_count, 0),
      'valor_meta',   COALESCE(m.valor_meta, 0)
    )
    ORDER BY s.ano, s.mes
  )
  INTO v_result
  FROM month_series s
  LEFT JOIN vendas_mes  v ON v.ano = s.ano AND v.mes = s.mes
  LEFT JOIN metas_mes   m ON m.ano = s.ano AND m.mes = s.mes;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$function$;

NOTIFY pgrst, 'reload schema';

/* ===========================================================================
   DOWN (reversão explícita) — aplicar como migration nova para reverter o flip.
   Restaura as 7 funções lendo analytics.* e remove as views-compat. O fato do
   upload nunca foi tocado, então isto basta para voltar 100% ao estado anterior.
   ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_executiva_kpis__nucleo(p_from date, p_to date, p_setor text DEFAULT 'todos'::text, p_ant_from date DEFAULT NULL::date, p_ant_to date DEFAULT NULL::date, p_yoy_from date DEFAULT NULL::date, p_yoy_to date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_dias          int := (p_to - p_from) + 1;

  v_ant_to        date := COALESCE(p_ant_to,   p_from - 1);
  v_ant_from      date := COALESCE(p_ant_from, p_from - v_dias);

  v_yoy_from      date := COALESCE(p_yoy_from, (p_from - interval '1 year')::date);
  v_yoy_to        date := COALESCE(p_yoy_to,   (p_to   - interval '1 year')::date);

  v_fat           numeric := 0;
  v_rec           numeric := 0;
  v_vendas        bigint  := 0;

  v_fat_ant       numeric := 0;
  v_rec_ant       numeric := 0;
  v_vendas_ant    bigint  := 0;

  v_fat_yoy       numeric := 0;
  v_rec_yoy       numeric := 0;
  v_vendas_yoy    bigint  := 0;

  v_margem        numeric;
  v_margem_ant    numeric;
  v_margem_yoy    numeric;
  v_ticket        numeric;
  v_ticket_ant    numeric;
  v_ticket_yoy    numeric;
  v_rec_media     numeric;
  v_rec_media_ant numeric;
  v_rec_media_yoy numeric;
BEGIN
  -- ── Período atual ──────────────────────────────────────────────────────
  SELECT
    COALESCE(SUM(vd.valor_total), 0),
    COALESCE(SUM(vd.receitas), 0),
    COALESCE(SUM(vd.vendas_count), 0)
  INTO v_fat, v_rec, v_vendas
  FROM analytics.mv_vendas_diarias vd
  JOIN analytics.dim_setor_macro dsm ON dsm.id = vd.setor_macro_id
  WHERE vd.data_venda BETWEEN p_from AND p_to
    AND (p_setor = 'todos' OR dsm.nome = p_setor);

  -- ── Período anterior ───────────────────────────────────────────────────
  SELECT
    COALESCE(SUM(vd.valor_total), 0),
    COALESCE(SUM(vd.receitas), 0),
    COALESCE(SUM(vd.vendas_count), 0)
  INTO v_fat_ant, v_rec_ant, v_vendas_ant
  FROM analytics.mv_vendas_diarias vd
  JOIN analytics.dim_setor_macro dsm ON dsm.id = vd.setor_macro_id
  WHERE vd.data_venda BETWEEN v_ant_from AND v_ant_to
    AND (p_setor = 'todos' OR dsm.nome = p_setor);

  -- ── Período YoY ────────────────────────────────────────────────────────
  SELECT
    COALESCE(SUM(vd.valor_total), 0),
    COALESCE(SUM(vd.receitas), 0),
    COALESCE(SUM(vd.vendas_count), 0)
  INTO v_fat_yoy, v_rec_yoy, v_vendas_yoy
  FROM analytics.mv_vendas_diarias vd
  JOIN analytics.dim_setor_macro dsm ON dsm.id = vd.setor_macro_id
  WHERE vd.data_venda BETWEEN v_yoy_from AND v_yoy_to
    AND (p_setor = 'todos' OR dsm.nome = p_setor);

  -- ── Margens, tickets e receita média ──────────────────────────────────
  v_margem     := CASE WHEN v_fat     > 0 THEN ROUND((v_rec     / v_fat     * 100)::numeric, 2) ELSE NULL END;
  v_margem_ant := CASE WHEN v_fat_ant > 0 THEN ROUND((v_rec_ant / v_fat_ant * 100)::numeric, 2) ELSE NULL END;
  v_margem_yoy := CASE WHEN v_fat_yoy > 0 THEN ROUND((v_rec_yoy / v_fat_yoy * 100)::numeric, 2) ELSE NULL END;

  v_ticket     := CASE WHEN v_vendas     > 0 THEN ROUND((v_fat     / v_vendas)::numeric,     2) ELSE NULL END;
  v_ticket_ant := CASE WHEN v_vendas_ant > 0 THEN ROUND((v_fat_ant / v_vendas_ant)::numeric, 2) ELSE NULL END;
  v_ticket_yoy := CASE WHEN v_vendas_yoy > 0 THEN ROUND((v_fat_yoy / v_vendas_yoy)::numeric, 2) ELSE NULL END;

  v_rec_media     := CASE WHEN v_vendas     > 0 THEN ROUND((v_rec     / v_vendas)::numeric,     2) ELSE NULL END;
  v_rec_media_ant := CASE WHEN v_vendas_ant > 0 THEN ROUND((v_rec_ant / v_vendas_ant)::numeric, 2) ELSE NULL END;
  v_rec_media_yoy := CASE WHEN v_vendas_yoy > 0 THEN ROUND((v_rec_yoy / v_vendas_yoy)::numeric, 2) ELSE NULL END;

  RETURN jsonb_build_object(
    'periodo',          jsonb_build_object('from', to_char(p_from,     'YYYY-MM-DD'), 'to', to_char(p_to,     'YYYY-MM-DD')),
    'periodo_anterior', jsonb_build_object('from', to_char(v_ant_from, 'YYYY-MM-DD'), 'to', to_char(v_ant_to, 'YYYY-MM-DD')),
    'periodo_yoy',      jsonb_build_object('from', to_char(v_yoy_from, 'YYYY-MM-DD'), 'to', to_char(v_yoy_to, 'YYYY-MM-DD')),

    'faturamento', jsonb_build_object(
      'valor',             v_fat,
      'variacao_anterior', CASE WHEN v_vendas = 0 THEN NULL WHEN v_fat_ant = 0 THEN NULL
                                ELSE ROUND(((v_fat - v_fat_ant) / v_fat_ant * 100)::numeric, 1) END,
      'variacao_yoy',      CASE WHEN v_vendas = 0 THEN NULL WHEN v_fat_yoy = 0 THEN NULL
                                ELSE ROUND(((v_fat - v_fat_yoy) / v_fat_yoy * 100)::numeric, 1) END
    ),
    'receita', jsonb_build_object(
      'valor',             v_rec,
      'variacao_anterior', CASE WHEN v_vendas = 0 THEN NULL WHEN v_rec_ant = 0 THEN NULL
                                ELSE ROUND(((v_rec - v_rec_ant) / v_rec_ant * 100)::numeric, 1) END,
      'variacao_yoy',      CASE WHEN v_vendas = 0 THEN NULL WHEN v_rec_yoy = 0 THEN NULL
                                ELSE ROUND(((v_rec - v_rec_yoy) / v_rec_yoy * 100)::numeric, 1) END
    ),
    'margem_pct', jsonb_build_object(
      'valor',             v_margem,
      'variacao_anterior', CASE WHEN v_vendas = 0 THEN NULL
                                WHEN v_margem IS NULL OR v_margem_ant IS NULL THEN NULL
                                ELSE ROUND((v_margem - v_margem_ant)::numeric, 2) END,
      'variacao_yoy',      CASE WHEN v_vendas = 0 THEN NULL
                                WHEN v_margem IS NULL OR v_margem_yoy IS NULL THEN NULL
                                ELSE ROUND((v_margem - v_margem_yoy)::numeric, 2) END,
      'is_pp', true
    ),
    'vendas', jsonb_build_object(
      'valor',             v_vendas,
      'variacao_anterior', CASE WHEN v_vendas = 0 THEN NULL WHEN v_vendas_ant = 0 THEN NULL
                                ELSE ROUND((((v_vendas - v_vendas_ant)::numeric) / v_vendas_ant * 100)::numeric, 1) END,
      'variacao_yoy',      CASE WHEN v_vendas = 0 THEN NULL WHEN v_vendas_yoy = 0 THEN NULL
                                ELSE ROUND((((v_vendas - v_vendas_yoy)::numeric) / v_vendas_yoy * 100)::numeric, 1) END
    ),
    'ticket_medio', jsonb_build_object(
      'valor',             v_ticket,
      'variacao_anterior', CASE WHEN v_vendas = 0 THEN NULL WHEN v_ticket_ant IS NULL THEN NULL
                                ELSE ROUND(((v_ticket - v_ticket_ant) / v_ticket_ant * 100)::numeric, 1) END,
      'variacao_yoy',      CASE WHEN v_vendas = 0 THEN NULL WHEN v_ticket_yoy IS NULL THEN NULL
                                ELSE ROUND(((v_ticket - v_ticket_yoy) / v_ticket_yoy * 100)::numeric, 1) END
    ),
    'receita_media', jsonb_build_object(
      'valor',             v_rec_media,
      'variacao_anterior', CASE WHEN v_vendas = 0 THEN NULL WHEN v_rec_media_ant IS NULL THEN NULL
                                ELSE ROUND(((v_rec_media - v_rec_media_ant) / v_rec_media_ant * 100)::numeric, 1) END,
      'variacao_yoy',      CASE WHEN v_vendas = 0 THEN NULL WHEN v_rec_media_yoy IS NULL THEN NULL
                                ELSE ROUND(((v_rec_media - v_rec_media_yoy) / v_rec_media_yoy * 100)::numeric, 1) END
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.metas_ritmo_diario(p_from date, p_to date, p_setor text DEFAULT 'todos'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_serie  jsonb;
  v_ultima text;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['metas/acompanhamento', 'metas']);
  v_serie := COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'data',        to_char(t.d, 'YYYY-MM-DD'),
             'valor_total', t.vt,
             'receitas',    t.rec
           ) ORDER BY t.d)
    FROM (
      SELECT vd.data_venda AS d,
             SUM(vd.valor_total) AS vt,
             SUM(vd.receitas)    AS rec
      FROM analytics.mv_vendas_diarias vd
      JOIN analytics.dim_setor_macro dsm ON dsm.id = vd.setor_macro_id
      WHERE vd.data_venda BETWEEN p_from AND p_to
        AND (p_setor = 'todos' OR dsm.nome = p_setor)
      GROUP BY vd.data_venda
    ) t
  ), '[]'::jsonb);
  -- "hoje" do produto = data da última venda carregada (global), não o calendário.
  SELECT to_char(max(vd.data_venda), 'YYYY-MM-DD') INTO v_ultima
  FROM analytics.mv_vendas_diarias vd;
  RETURN jsonb_build_object('serie', v_serie, 'ultima_venda', v_ultima);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_tendencia_margem__nucleo(p_from date, p_to date, p_setor text DEFAULT 'todos'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_dias          int := (p_to - p_from) + 1;
  v_granularidade text;
  v_result        jsonb;
BEGIN
  v_granularidade := CASE
    WHEN v_dias <= 30 THEN 'diaria'
    WHEN v_dias <= 90 THEN 'semanal'
    ELSE                   'mensal'
  END;

  IF v_granularidade = 'diaria' THEN
    -- Um ponto por dia
    WITH serie AS (
      SELECT d::date AS data_inicio
      FROM generate_series(p_from, p_to, '1 day'::interval) d
    ),
    vendas AS (
      SELECT
        vd.data_venda,
        SUM(vd.valor_total) AS faturamento,
        SUM(vd.receitas)    AS receita
      FROM analytics.mv_vendas_diarias vd
      JOIN analytics.dim_setor_macro dsm ON dsm.id = vd.setor_macro_id
      WHERE vd.data_venda BETWEEN p_from AND p_to
        AND (p_setor = 'todos' OR dsm.nome = p_setor)
      GROUP BY vd.data_venda
    )
    SELECT jsonb_build_object(
      'granularidade', 'diaria',
      'pontos', jsonb_agg(
        jsonb_build_object(
          'label',        to_char(s.data_inicio, 'DD/MM'),
          'data_inicio',  to_char(s.data_inicio, 'YYYY-MM-DD'),
          'faturamento',  COALESCE(v.faturamento, 0),
          'receita',      COALESCE(v.receita,    0),
          'margem_pct',   CASE WHEN COALESCE(v.faturamento, 0) > 0
                            THEN ROUND((COALESCE(v.receita, 0) / v.faturamento * 100)::numeric, 2)
                            ELSE NULL END
        )
        ORDER BY s.data_inicio
      )
    )
    INTO v_result
    FROM serie s
    LEFT JOIN vendas v ON v.data_venda = s.data_inicio;

  ELSIF v_granularidade = 'semanal' THEN
    -- Um ponto por semana ISO
    WITH semanas AS (
      SELECT
        date_trunc('week', d)::date AS semana_inicio,
        (date_trunc('week', d) + interval '6 days')::date AS semana_fim
      FROM generate_series(
        date_trunc('week', p_from),
        date_trunc('week', p_to),
        '1 week'::interval
      ) d
      GROUP BY 1, 2
    ),
    vendas AS (
      SELECT
        date_trunc('week', vd.data_venda)::date AS semana_inicio,
        SUM(vd.valor_total) AS faturamento,
        SUM(vd.receitas)    AS receita
      FROM analytics.mv_vendas_diarias vd
      JOIN analytics.dim_setor_macro dsm ON dsm.id = vd.setor_macro_id
      WHERE vd.data_venda BETWEEN p_from AND p_to
        AND (p_setor = 'todos' OR dsm.nome = p_setor)
      GROUP BY 1
    )
    SELECT jsonb_build_object(
      'granularidade', 'semanal',
      'pontos', jsonb_agg(
        jsonb_build_object(
          'label',        'Sem ' || to_char(s.semana_inicio, 'WW'),
          'data_inicio',  to_char(s.semana_inicio, 'YYYY-MM-DD'),
          'faturamento',  COALESCE(v.faturamento, 0),
          'receita',      COALESCE(v.receita,    0),
          'margem_pct',   CASE WHEN COALESCE(v.faturamento, 0) > 0
                            THEN ROUND((COALESCE(v.receita, 0) / v.faturamento * 100)::numeric, 2)
                            ELSE NULL END
        )
        ORDER BY s.semana_inicio
      )
    )
    INTO v_result
    FROM semanas s
    LEFT JOIN vendas v ON v.semana_inicio = s.semana_inicio;

  ELSE
    -- Mensal
    WITH meses AS (
      SELECT
        date_trunc('month', d)::date AS mes_inicio
      FROM generate_series(
        date_trunc('month', p_from),
        date_trunc('month', p_to),
        '1 month'::interval
      ) d
    ),
    vendas AS (
      SELECT
        date_trunc('month', vd.data_venda)::date AS mes_inicio,
        SUM(vd.valor_total) AS faturamento,
        SUM(vd.receitas)    AS receita
      FROM analytics.mv_vendas_diarias vd
      JOIN analytics.dim_setor_macro dsm ON dsm.id = vd.setor_macro_id
      WHERE vd.data_venda BETWEEN p_from AND p_to
        AND (p_setor = 'todos' OR dsm.nome = p_setor)
      GROUP BY 1
    )
    SELECT jsonb_build_object(
      'granularidade', 'mensal',
      'pontos', jsonb_agg(
        jsonb_build_object(
          'label',        to_char(s.mes_inicio, 'Mon/YY'),
          'data_inicio',  to_char(s.mes_inicio, 'YYYY-MM-DD'),
          'faturamento',  COALESCE(v.faturamento, 0),
          'receita',      COALESCE(v.receita,    0),
          'margem_pct',   CASE WHEN COALESCE(v.faturamento, 0) > 0
                            THEN ROUND((COALESCE(v.receita, 0) / v.faturamento * 100)::numeric, 2)
                            ELSE NULL END
        )
        ORDER BY s.mes_inicio
      )
    )
    INTO v_result
    FROM meses s
    LEFT JOIN vendas v ON v.mes_inicio = s.mes_inicio;
  END IF;

  RETURN COALESCE(v_result, jsonb_build_object('granularidade', v_granularidade, 'pontos', '[]'::jsonb));
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_decomposicao_variacao__nucleo(p_from date, p_to date, p_ant_from date, p_ant_to date, p_setor text DEFAULT 'todos'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  WITH
  atual AS (
    SELECT
      dsm.id, dsm.nome, dsm.display_nome, dsm.cor_hex, dsm.ordem,
      COALESCE(SUM(vd.valor_total), 0) AS fat
    FROM analytics.dim_setor_macro dsm
    LEFT JOIN analytics.mv_vendas_diarias vd
      ON vd.setor_macro_id = dsm.id
     AND vd.data_venda BETWEEN p_from AND p_to
    WHERE p_setor = 'todos' OR dsm.nome = p_setor
    GROUP BY dsm.id, dsm.nome, dsm.display_nome, dsm.cor_hex, dsm.ordem
  ),
  anterior AS (
    SELECT
      dsm.id,
      COALESCE(SUM(vd.valor_total), 0) AS fat
    FROM analytics.dim_setor_macro dsm
    LEFT JOIN analytics.mv_vendas_diarias vd
      ON vd.setor_macro_id = dsm.id
     AND vd.data_venda BETWEEN p_ant_from AND p_ant_to
    WHERE p_setor = 'todos' OR dsm.nome = p_setor
    GROUP BY dsm.id
  ),
  combined AS (
    SELECT
      a.id, a.nome, a.display_nome, a.cor_hex, a.ordem,
      a.fat                        AS atual,
      COALESCE(ant.fat, 0)         AS anterior,
      a.fat - COALESCE(ant.fat, 0) AS variacao
    FROM atual a
    LEFT JOIN anterior ant ON ant.id = a.id
  ),
  totals AS (
    SELECT
      SUM(atual)    AS fat_total,
      SUM(anterior) AS ant_total,
      SUM(variacao) AS variacao_total
    FROM combined
  )
  SELECT jsonb_build_object(
    'variacao_total',     t.variacao_total,
    'variacao_total_pct', CASE WHEN t.ant_total > 0
                            THEN ROUND(((t.variacao_total / t.ant_total) * 100)::numeric, 1)
                            ELSE NULL END,
    'tem_dados_anterior', t.ant_total > 0,
    'periodo_atual',    jsonb_build_object(
                          'from', to_char(p_from,     'YYYY-MM-DD'),
                          'to',   to_char(p_to,       'YYYY-MM-DD')),
    'periodo_anterior', jsonb_build_object(
                          'from', to_char(p_ant_from, 'YYYY-MM-DD'),
                          'to',   to_char(p_ant_to,   'YYYY-MM-DD')),
    'setores', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'nome',             c.nome,
          'display_nome',     c.display_nome,
          'cor_hex',          c.cor_hex,
          'atual',            c.atual,
          'anterior',         c.anterior,
          'variacao',         c.variacao,
          'variacao_pct',     CASE WHEN c.anterior > 0
                                THEN ROUND(((c.variacao / c.anterior) * 100)::numeric, 1)
                                ELSE NULL END,
          'contribuicao_pct', CASE WHEN ABS(t.variacao_total) > 0
                                THEN ROUND(((c.variacao / t.variacao_total) * 100)::numeric, 1)
                                ELSE NULL END
        )
        ORDER BY ABS(c.variacao) DESC
      )
      FROM combined c
    )
  )
  INTO v_result
  FROM totals t;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_historico_12m_setores__nucleo(p_setor text DEFAULT 'todos'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  WITH
  months AS (
    SELECT date_trunc('month', CURRENT_DATE - (n || ' months')::interval)::date AS m_start
    FROM generate_series(11, 0, -1) AS n
  ),
  fv AS (
    SELECT
      vd.data_venda,
      vd.valor_total,
      vd.receitas,
      dsm.nome AS setor_nome
    FROM analytics.mv_vendas_diarias vd
    JOIN analytics.dim_setor_macro dsm ON dsm.id = vd.setor_macro_id
    WHERE p_setor = 'todos' OR dsm.nome = p_setor
  ),
  agg AS (
    SELECT
      m.m_start,
      EXTRACT(year  FROM m.m_start)::int AS ano,
      EXTRACT(month FROM m.m_start)::int AS mes,
      COALESCE(SUM(CASE WHEN fv.setor_nome = 'Lazer'       THEN fv.valor_total END), 0)::numeric AS fat_lazer,
      COALESCE(SUM(CASE WHEN fv.setor_nome = 'Weddings'    THEN fv.valor_total END), 0)::numeric AS fat_weddings,
      COALESCE(SUM(CASE WHEN fv.setor_nome = 'Corporativo' THEN fv.valor_total END), 0)::numeric AS fat_corp,
      COALESCE(SUM(fv.valor_total), 0)::numeric AS fat_total,
      COALESCE(SUM(fv.receitas),    0)::numeric AS rec_total
    FROM months m
    LEFT JOIN fv ON fv.data_venda
      BETWEEN m.m_start
          AND (m.m_start + interval '1 month' - interval '1 day')::date
    GROUP BY m.m_start
    ORDER BY m.m_start
  )
  SELECT jsonb_build_object(
    'meses', jsonb_agg(
      jsonb_build_object(
        'ano',         a.ano,
        'mes',         a.mes,
        'eh_atual',    a.m_start = date_trunc('month', CURRENT_DATE)::date,
        'total',       a.fat_total,
        'receita',     a.rec_total,
        'margem_pct',  CASE WHEN a.fat_total > 0
                         THEN ROUND((a.rec_total / a.fat_total * 100)::numeric, 1)
                         ELSE NULL END,
        'Lazer',       a.fat_lazer,
        'Weddings',    a.fat_weddings,
        'Corporativo', a.fat_corp
      )
      ORDER BY a.m_start
    )
  )
  INTO v_result
  FROM agg a;

  RETURN COALESCE(v_result, '{"meses":[]}'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_mix_setor__nucleo(p_from date, p_to date, p_setor text DEFAULT 'todos'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  WITH totais AS (
    SELECT
      COALESCE(SUM(vd.valor_total), 0) AS fat_total,
      COALESCE(SUM(vd.receitas),    0) AS rec_total
    FROM analytics.mv_vendas_diarias vd
    JOIN analytics.dim_setor_macro dsm ON dsm.id = vd.setor_macro_id
    WHERE vd.data_venda BETWEEN p_from AND p_to
      AND (p_setor = 'todos' OR dsm.nome = p_setor)
  ),
  por_setor AS (
    SELECT
      dsm.id,
      dsm.nome,
      dsm.display_nome,
      dsm.cor_hex,
      dsm.ordem,
      COALESCE(SUM(vd.valor_total), 0) AS faturamento,
      COALESCE(SUM(vd.receitas),    0) AS receita
    FROM analytics.dim_setor_macro dsm
    LEFT JOIN analytics.mv_vendas_diarias vd
      ON vd.setor_macro_id = dsm.id
     AND vd.data_venda BETWEEN p_from AND p_to
    WHERE (p_setor = 'todos' OR dsm.nome = p_setor)
    GROUP BY dsm.id, dsm.nome, dsm.display_nome, dsm.cor_hex, dsm.ordem
  )
  SELECT jsonb_build_object(
    'total', jsonb_build_object(
      'faturamento', t.fat_total,
      'receita',     t.rec_total,
      'margem_pct',  CASE WHEN t.fat_total > 0
                       THEN ROUND((t.rec_total / t.fat_total * 100)::numeric, 2)
                       ELSE NULL END
    ),
    'setores', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'setor_macro',    s.nome,
          'display_nome',   s.display_nome,
          'cor_hex',        s.cor_hex,
          'faturamento',    s.faturamento,
          'receita',        s.receita,
          'margem_pct',     CASE WHEN s.faturamento > 0
                              THEN ROUND((s.receita / s.faturamento * 100)::numeric, 2)
                              ELSE NULL END,
          'pct_faturamento', CASE WHEN t.fat_total > 0
                               THEN ROUND((s.faturamento / t.fat_total * 100)::numeric, 1)
                               ELSE 0 END,
          'pct_receita',     CASE WHEN t.rec_total > 0
                               THEN ROUND((s.receita / t.rec_total * 100)::numeric, 1)
                               ELSE 0 END
        )
        ORDER BY s.ordem
      )
      FROM por_setor s
    )
  )
  INTO v_result
  FROM totais t;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_historico_mensal__nucleo(p_setor text DEFAULT 'todos'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  WITH month_series AS (
    SELECT
      EXTRACT(YEAR  FROM m)::int AS ano,
      EXTRACT(MONTH FROM m)::int AS mes
    FROM generate_series(
      date_trunc('month', CURRENT_DATE) - interval '23 months',
      date_trunc('month', CURRENT_DATE),
      '1 month'::interval
    ) m
  ),
  vendas_mes AS (
    SELECT
      vm.ano,
      vm.mes,
      SUM(vm.valor_total)        AS valor_total,
      SUM(vm.receitas)           AS receitas,
      SUM(vm.vendas_count)::int  AS vendas_count
    FROM analytics.mv_vendas_mensais vm
    JOIN analytics.dim_setor_macro dsm ON dsm.id = vm.setor_macro_id
    WHERE (p_setor = 'todos' OR dsm.nome = p_setor)
    GROUP BY vm.ano, vm.mes
  ),
  metas_mes AS (
    SELECT
      ms.ano,
      ms.mes,
      SUM(ms.valor_meta) AS valor_meta
    FROM app.meta_setor ms
    JOIN analytics.dim_setor_macro dsm ON dsm.id = ms.setor_macro_id
    WHERE (p_setor = 'todos' OR dsm.nome = p_setor)
    GROUP BY ms.ano, ms.mes
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'ano',          s.ano,
      'mes',          s.mes,
      'valor_total',  COALESCE(v.valor_total, 0),
      'receitas',     COALESCE(v.receitas, 0),
      'vendas_count', COALESCE(v.vendas_count, 0),
      'valor_meta',   COALESCE(m.valor_meta, 0)
    )
    ORDER BY s.ano, s.mes
  )
  INTO v_result
  FROM month_series s
  LEFT JOIN vendas_mes  v ON v.ano = s.ano AND v.mes = s.mes
  LEFT JOIN metas_mes   m ON m.ano = s.ano AND m.mes = s.mes;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$function$;

DROP VIEW IF EXISTS monde.mv_vendas_mensais;
DROP VIEW IF EXISTS monde.mv_vendas_diarias_compat;
NOTIFY pgrst, 'reload schema';
=========================================================================== */
