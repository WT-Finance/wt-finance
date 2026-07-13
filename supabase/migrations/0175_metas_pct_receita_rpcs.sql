-- ---------------------------------------------------------------------------
-- 0175 — feat(v5.0.0): Metas por Setor — pct_receita + área de leitura + RPCs
--
-- DECLARAÇÃO PRÉVIA (regime aditivo / autônomo):
--   • O QUE FAZ:
--       - ADD COLUMN app.meta_setor.pct_receita (alvo de % Rec = receita/VT).
--       - ADD COLUMN app.meta_setor_historico.{pct_receita, pct_receita_anterior}
--         (auditoria completa do Cadastro — a tabela de histórico é ATIVADA nesta versão).
--       - INSERT da área RBAC 'metas/acompanhamento' (leitura; a área 'metas' existente
--         vira a de edição/Cadastro). ON CONFLICT DO NOTHING.
--       - RPCs inline (padrão pós-v4.29): metas_listar (leitura), metas_ritmo_diario
--         (leitura, série diária p/ o gráfico), metas_upsert (escrita + histórico).
--   • ADITIVA / RETROCOMPATÍVEL: só ADD COLUMN (anulável), INSERT ON CONFLICT e CREATE FUNCTION.
--     NÃO altera/remove coluna, dado ou linha pré-existente. A linha 'metas' de rbac_areas
--     e as 108 metas de seed permanecem intactas.
--   • FONTE ÚNICA DO REAL: metas_ritmo_diario soma analytics.mv_vendas_diarias com o MESMO
--     JOIN/WHERE de get_executiva_kpis (paridade provada em rpc-contrato.test.ts).
--   • Reversão (manual, destrutiva): DROP das 3 funções; ALTER TABLE ... DROP COLUMN
--     pct_receita / pct_receita_anterior; DELETE da área 'metas/acompanhamento'.
-- ---------------------------------------------------------------------------

-- ── 1. Colunas novas (aditivas) ────────────────────────────────────────────
-- CHECK inline no ADD COLUMN (não um ALTER…DROP/ADD CONSTRAINT separado — 'ALTER…DROP'
-- classificaria a migration como DESTRUTIVA no tokenizer do backup-gate). IF NOT EXISTS
-- torna re-execução segura (pula a coluna e seu CHECK juntos).
ALTER TABLE app.meta_setor
  ADD COLUMN IF NOT EXISTS pct_receita numeric(5,2)
    CHECK (pct_receita IS NULL OR (pct_receita >= 0 AND pct_receita <= 100));

ALTER TABLE app.meta_setor_historico
  ADD COLUMN IF NOT EXISTS pct_receita           numeric(5,2);
ALTER TABLE app.meta_setor_historico
  ADD COLUMN IF NOT EXISTS pct_receita_anterior  numeric(5,2);

-- ── 2. Área RBAC de LEITURA (a 'metas' existente = edição/Cadastro) ─────────
-- Mesmo padrão de dois níveis de solicitacoes/basico × solicitacoes e
-- financeiro/acervo × .../gestao: a área nova é a de VER; a 'metas' (nome
-- histórico) é a forte (editar), e também libera a leitura (a página faz OR).
INSERT INTO app.rbac_areas (area, rotulo, grupo, ordem)
VALUES ('metas/acompanhamento', 'Metas — Acompanhamento', 'Geral', 41)
ON CONFLICT (area) DO NOTHING;

-- ── 3. RPC de LEITURA — grade anual (Cadastro + Acompanhamento) ─────────────
CREATE OR REPLACE FUNCTION public.metas_listar(p_ano int)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v jsonb;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['metas/acompanhamento', 'metas']);
  SELECT jsonb_build_object(
    'ano', p_ano,
    'metas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'setor_macro_id', m.setor_macro_id,
               'setor_nome',     dsm.nome,
               'setor_display',  dsm.display_nome,
               'mes',            m.mes,
               'valor_meta',     m.valor_meta,
               'pct_receita',    m.pct_receita
             ) ORDER BY dsm.ordem, m.mes)
      FROM app.meta_setor m
      JOIN analytics.dim_setor_macro dsm ON dsm.id = m.setor_macro_id
      WHERE m.ano = p_ano AND m.fonte = 'real'
    ), '[]'::jsonb),
    'ultima_alteracao', (
      SELECT jsonb_build_object('alterado_em', h.alterado_em, 'alterado_por', h.alterado_por)
      FROM app.meta_setor_historico h
      WHERE h.ano = p_ano
      ORDER BY h.alterado_em DESC
      LIMIT 1
    )
  ) INTO v;
  RETURN v;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.metas_listar(int) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.metas_listar(int) TO authenticated, service_role;

-- ── 4. RPC de LEITURA — série diária p/ o gráfico de ritmo ──────────────────
-- FONTE ÚNICA: mesmo mv_vendas_diarias + JOIN dim_setor_macro + WHERE de
-- get_executiva_kpis. A SOMA da série == faturamento do período (paridade).
CREATE OR REPLACE FUNCTION public.metas_ritmo_diario(p_from date, p_to date, p_setor text DEFAULT 'todos')
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
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
$$;
REVOKE EXECUTE ON FUNCTION public.metas_ritmo_diario(date, date, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.metas_ritmo_diario(date, date, text) TO authenticated, service_role;

-- ── 5. RPC de ESCRITA — upsert do Cadastro + trilha de auditoria ────────────
-- Escrita exige SÓ 'metas' (edição). Chave = setor_macro_id (nunca nome).
-- fonte SEMPRE 'real' (entrada de produto). Grava histórico quando é linha nova
-- ou quando valor_meta/pct_receita mudaram (no-op não polui o histórico).
CREATE OR REPLACE FUNCTION public.metas_upsert(p_metas jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  item        jsonb;
  v_sid       bigint;
  v_ano       int;
  v_mes       int;
  v_valor     numeric;
  v_pct       numeric;
  v_old_valor numeric;
  v_old_pct   numeric;
  v_existe    boolean;
  v_uid       uuid;
  v_quem      text;
  v_n         int := 0;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['metas']);

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
