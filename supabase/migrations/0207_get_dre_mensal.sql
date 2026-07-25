-- ---------------------------------------------------------------------------
-- 0207 — feat(dre): get_dre_mensal(p_ano) — a DRE mensal híbrida numa chamada só
-- v5.3.0 / M3 (DRE Gerencial · Onda 2).
--
-- DECLARAÇÃO (regime aditivo): esta migration é ADITIVA/retrocompatível com a main viva —
--   • CREATE FUNCTION nova; nenhum objeto existente alterado/removido;
--   • NÃO escreve em dados pré-existentes (lê fato_fluxo/dim_categoria/dre_*; as únicas
--     escritas são TEMP TABLES ON COMMIT DROP da própria transação da chamada).
--
-- Contrato: UMA chamada devolve UM json com as ~160 linhas × 12 meses do ano pedido,
-- montadas da ESTRUTURA VIVA (0204/0205) sobre financeiro.fato_fluxo — numa transação
-- única (consistência de leitura: imune a edição concorrente da estrutura no meio).
--
-- Regras de coluna (o "mês híbrido" já é automático por data_competencia — 0187):
--   • realizado[m] = Σ valor  onde tipo='realizado' e mês(data_competencia)=m;
--   • previsto[m]  = Σ valor  onde tipo='previsto'  e data_competencia > hoje e mês=m
--     (previsto com data ≤ hoje é VENCIDO — fora das colunas mensais, como no modelo);
--   • venc         = Σ previsto com data_competencia ≤ hoje (total em aberto, sem filtro
--     de ano — semântica do modelo). A UI ainda NÃO o soma no Total (decisão adiada para
--     o refino final); o dado já viaja por linha para o refino não exigir nova migration;
--   • ano CORRENTE: meses[m] = realizado (m ≤ mês-corrente) | previsto (m > corrente);
--     prev_corrente = previsto do RESTO do mês corrente (a 2ª coluna do híbrido);
--   • ano FECHADO: meses = realizado. ano FUTURO: meses = previsto. mes_corrente = NULL.
--   "Hoje" = CURRENT_DATE já em America/Sao_Paulo (rolconfig por papel, 0152).
--
-- Fórmulas: blocos com `formula` (jsonb de CHAVES) avaliados em ORDEM ASC do demonstrativo
-- — todo insumo vem antes de quem o consome (invariante: blocos não são reordenáveis no
-- editor v1; fórmula que referencie chave ainda não computada soma 0 naquele insumo).
-- Fórmulas provadas na investigação (§A.2); paridade auditada no fechamento (M6).
--
-- Performance: 1 varredura indexada do fato no ano + 1 varredura do balde de vencidos
-- (pequeno) + avaliação de 29 blocos — folga dentro do orçamento de 8s do authenticated.
-- VOLATILE (cria temp tables); leitura pura na prática.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_dre_mensal(p_ano int)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_hoje   date := current_date;
  v_mes    int;             -- mês corrente (1..12) quando p_ano é o ano corrente; NULL senão
  v_rel    text;            -- 'fechado' | 'corrente' | 'futuro'
  v_zeros  numeric[] := ARRAY(SELECT 0::numeric FROM generate_series(1, 12));
  b        record;
  v_res    json;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/dre']);

  IF p_ano IS NULL OR p_ano < 2000 OR p_ano > 2100 THEN
    RAISE EXCEPTION 'Ano inválido.';
  END IF;

  v_rel := CASE
    WHEN p_ano < extract(year FROM v_hoje)::int THEN 'fechado'
    WHEN p_ano = extract(year FROM v_hoje)::int THEN 'corrente'
    ELSE 'futuro'
  END;
  v_mes := CASE WHEN v_rel = 'corrente' THEN extract(month FROM v_hoje)::int END;

  -- ── 1. Matriz CATEGORIA × mês (r/p) + balde de vencidos, em varredura única do ano ──
  -- DROP defensivo: se um wrapper futuro chamar esta função 2× na MESMA transação,
  -- a temp table da 1ª chamada ainda existiria (ON COMMIT DROP só age no commit).
  DROP TABLE IF EXISTS _dre_cat;
  DROP TABLE IF EXISTS _dre_bloco;
  CREATE TEMP TABLE _dre_cat ON COMMIT DROP AS
  WITH base AS (
    SELECT f.categoria_id,
           extract(month FROM f.data_competencia)::int AS m,
           COALESCE(sum(f.valor) FILTER (WHERE f.tipo = 'realizado'), 0)                                AS r,
           COALESCE(sum(f.valor) FILTER (WHERE f.tipo = 'previsto' AND f.data_competencia > v_hoje), 0) AS p
    FROM financeiro.fato_fluxo f
    WHERE f.data_competencia >= make_date(p_ano, 1, 1)
      AND f.data_competencia <  make_date(p_ano + 1, 1, 1)
    GROUP BY 1, 2
  ),
  venc AS (
    SELECT f.categoria_id, sum(f.valor) AS venc
    FROM financeiro.fato_fluxo f
    WHERE f.tipo = 'previsto' AND f.data_competencia <= v_hoje
    GROUP BY 1
  ),
  cats AS (
    SELECT categoria_id FROM base
    UNION
    SELECT categoria_id FROM venc
  )
  SELECT c.categoria_id, ag.r, ag.p, COALESCE(v.venc, 0)::numeric AS venc
  FROM cats c
  LEFT JOIN venc v ON v.categoria_id = c.categoria_id
  CROSS JOIN LATERAL (
    SELECT
      (SELECT array_agg(COALESCE(bb.r, 0) ORDER BY i.i)
       FROM generate_series(1, 12) i(i)
       LEFT JOIN base bb ON bb.categoria_id = c.categoria_id AND bb.m = i.i)::numeric[] AS r,
      (SELECT array_agg(COALESCE(bb.p, 0) ORDER BY i.i)
       FROM generate_series(1, 12) i(i)
       LEFT JOIN base bb ON bb.categoria_id = c.categoria_id AND bb.m = i.i)::numeric[] AS p
  ) ag;

  -- ── 2. Matriz por BLOCO: primeiro os que SOMAM categorias (mapeadas, não-excluídas) ──
  CREATE TEMP TABLE _dre_bloco (chave text PRIMARY KEY, r numeric[], p numeric[], venc numeric) ON COMMIT DROP;

  INSERT INTO _dre_bloco (chave, r, p, venc)
  SELECT g.bloco_chave, ag.r, ag.p, ag.venc
  FROM (SELECT DISTINCT bloco_chave FROM financeiro.dre_categoria_map WHERE NOT excluida) g
  CROSS JOIN LATERAL (
    SELECT
      (SELECT array_agg(s ORDER BY i) FROM (
         SELECT i.i AS i, COALESCE(sum(c.r[i.i]), 0) AS s
         FROM generate_series(1, 12) i(i)
         LEFT JOIN (financeiro.dre_categoria_map m
           JOIN _dre_cat c ON c.categoria_id = m.categoria_id)
           ON m.bloco_chave = g.bloco_chave AND NOT m.excluida
         GROUP BY i.i) q)::numeric[] AS r,
      (SELECT array_agg(s ORDER BY i) FROM (
         SELECT i.i AS i, COALESCE(sum(c.p[i.i]), 0) AS s
         FROM generate_series(1, 12) i(i)
         LEFT JOIN (financeiro.dre_categoria_map m
           JOIN _dre_cat c ON c.categoria_id = m.categoria_id)
           ON m.bloco_chave = g.bloco_chave AND NOT m.excluida
         GROUP BY i.i) q)::numeric[] AS p,
      (SELECT COALESCE(sum(c.venc), 0)
       FROM financeiro.dre_categoria_map m
       JOIN _dre_cat c ON c.categoria_id = m.categoria_id
       WHERE m.bloco_chave = g.bloco_chave AND NOT m.excluida)::numeric AS venc
  ) ag;

  -- ── 3. Blocos de FÓRMULA, em ordem do demonstrativo (grafo por CHAVE) ────────────
  FOR b IN
    SELECT chave, formula FROM financeiro.dre_bloco
    WHERE formula IS NOT NULL
    ORDER BY ordem
  LOOP
    INSERT INTO _dre_bloco (chave, r, p, venc)
    SELECT b.chave,
      (SELECT array_agg(s ORDER BY i) FROM (
         SELECT i.i AS i, COALESCE(sum(v.r[i.i]), 0) AS s
         FROM generate_series(1, 12) i(i)
         LEFT JOIN _dre_bloco v ON v.chave IN (SELECT jsonb_array_elements_text(b.formula))
         GROUP BY i.i) q)::numeric[],
      (SELECT array_agg(s ORDER BY i) FROM (
         SELECT i.i AS i, COALESCE(sum(v.p[i.i]), 0) AS s
         FROM generate_series(1, 12) i(i)
         LEFT JOIN _dre_bloco v ON v.chave IN (SELECT jsonb_array_elements_text(b.formula))
         GROUP BY i.i) q)::numeric[],
      (SELECT COALESCE(sum(v.venc), 0) FROM _dre_bloco v
       WHERE v.chave IN (SELECT jsonb_array_elements_text(b.formula)))::numeric;
  END LOOP;

  -- ── 4. Montagem do JSON (linhas na ordem do demonstrativo + bandeja ao fim) ──────
  SELECT json_build_object(
    'ano',            p_ano,
    'hoje',           v_hoje,
    'relacao',        v_rel,
    'mes_corrente',   v_mes,
    'token_estrutura', (
      SELECT greatest(
        (SELECT max(atualizado_em) FROM financeiro.dre_bloco),
        (SELECT max(atualizado_em) FROM financeiro.dre_categoria_map)
      )
    ),
    'linhas', (
      SELECT COALESCE(json_agg(t.linha ORDER BY t.ord, t.sub_ord), '[]'::json)
      FROM (
        -- Cabeçalhos, sub-blocos e totalizadores (29)
        SELECT bl.ordem AS ord, 0 AS sub_ord,
               json_build_object(
                 't', bl.tipo, 'chave', bl.chave, 'rotulo', bl.rotulo,
                 'estrela', bl.nota_estrela,
                 'meses', d.meses, 'prev_corrente', d.prev_c, 'venc', COALESCE(vb.venc, 0),
                 'total', (SELECT sum(x) FROM unnest(d.meses) x) + COALESCE(d.prev_c, 0)
               ) AS linha
        FROM financeiro.dre_bloco bl
        LEFT JOIN _dre_bloco vb ON vb.chave = bl.chave
        CROSS JOIN LATERAL (
          SELECT
            CASE v_rel
              WHEN 'fechado' THEN COALESCE(vb.r, v_zeros)
              WHEN 'futuro'  THEN COALESCE(vb.p, v_zeros)
              ELSE (SELECT array_agg(CASE WHEN i.i <= v_mes THEN (COALESCE(vb.r, v_zeros))[i.i]
                                          ELSE (COALESCE(vb.p, v_zeros))[i.i] END ORDER BY i.i)
                    FROM generate_series(1, 12) i(i))
            END::numeric[] AS meses,
            CASE WHEN v_rel = 'corrente' THEN (COALESCE(vb.p, v_zeros))[v_mes] END AS prev_c
        ) d

        UNION ALL

        -- Categorias mapeadas (folhas), na ordem do seu bloco
        SELECT bl.ordem, mp.ordem,
               json_build_object(
                 't', 'cat', 'g', mp.bloco_chave, 'categoria_id', mp.categoria_id,
                 'rotulo', COALESCE(mp.rotulo, dc.categoria),
                 'estrela', mp.nota_estrela,
                 'meses', d.meses, 'prev_corrente', d.prev_c, 'venc', COALESCE(cv.venc, 0),
                 'total', (SELECT sum(x) FROM unnest(d.meses) x) + COALESCE(d.prev_c, 0)
               )
        FROM financeiro.dre_categoria_map mp
        JOIN financeiro.dre_bloco bl ON bl.chave = mp.bloco_chave
        JOIN financeiro.dim_categoria dc ON dc.id = mp.categoria_id
        LEFT JOIN _dre_cat cv ON cv.categoria_id = mp.categoria_id
        CROSS JOIN LATERAL (
          SELECT
            CASE v_rel
              WHEN 'fechado' THEN COALESCE(cv.r, v_zeros)
              WHEN 'futuro'  THEN COALESCE(cv.p, v_zeros)
              ELSE (SELECT array_agg(CASE WHEN i.i <= v_mes THEN (COALESCE(cv.r, v_zeros))[i.i]
                                          ELSE (COALESCE(cv.p, v_zeros))[i.i] END ORDER BY i.i)
                    FROM generate_series(1, 12) i(i))
            END::numeric[] AS meses,
            CASE WHEN v_rel = 'corrente' THEN (COALESCE(cv.p, v_zeros))[v_mes] END AS prev_c
        ) d
        WHERE NOT mp.excluida
      ) t
    ),
    'bandeja', (
      -- Órfãs do de-para: dim SEM linha no map — nada some em silêncio
      SELECT COALESCE(json_agg(json_build_object(
               'categoria_id', dc.id, 'rotulo', dc.categoria, 'grupo_monde', dc.grupo_categoria,
               'meses', d.meses, 'prev_corrente', d.prev_c, 'venc', COALESCE(cv.venc, 0),
               'total', (SELECT sum(x) FROM unnest(d.meses) x) + COALESCE(d.prev_c, 0)
             ) ORDER BY dc.categoria), '[]'::json)
      FROM financeiro.dim_categoria dc
      LEFT JOIN _dre_cat cv ON cv.categoria_id = dc.id
      CROSS JOIN LATERAL (
        SELECT
          CASE v_rel
            WHEN 'fechado' THEN COALESCE(cv.r, v_zeros)
            WHEN 'futuro'  THEN COALESCE(cv.p, v_zeros)
            ELSE (SELECT array_agg(CASE WHEN i.i <= v_mes THEN (COALESCE(cv.r, v_zeros))[i.i]
                                        ELSE (COALESCE(cv.p, v_zeros))[i.i] END ORDER BY i.i)
                  FROM generate_series(1, 12) i(i))
          END::numeric[] AS meses,
          CASE WHEN v_rel = 'corrente' THEN (COALESCE(cv.p, v_zeros))[v_mes] END AS prev_c
      ) d
      WHERE NOT EXISTS (SELECT 1 FROM financeiro.dre_categoria_map m WHERE m.categoria_id = dc.id)
    )
  ) INTO v_res;

  RETURN v_res;
END $$;

REVOKE EXECUTE ON FUNCTION public.get_dre_mensal(int) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_dre_mensal(int) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
