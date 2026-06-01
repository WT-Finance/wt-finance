-- ---------------------------------------------------------------------------
-- 0100 — Backfill de dim_data para 2022-2023
--
-- BUG: upload de Vendas por Produto falhava em transform_raw_to_analytics com
--   "fato_venda violates foreign key fato_venda_data_venda_fkey"
-- CAUSA: fato_venda.data_venda REFERENCES dim_data(data). O dim_data foi
--   semeado (0002) apenas de 2024-01-01 a 2030-12-31, mas o arquivo do ERP
--   passou a incluir vendas de 2022-2023 — datas inexistentes na dimensão.
-- FIX: estender dim_data para trás cobrindo 2022-01-01..2023-12-31, com a MESMA
--   lógica de derivação do seed original (0002). ON CONFLICT (data) DO NOTHING
--   garante idempotência e não toca as linhas 2024+ existentes.
-- ---------------------------------------------------------------------------

INSERT INTO analytics.dim_data (
  data, ano, mes, mes_nome, mes_abrev, dia, dia_semana,
  dia_semana_nome, semana_iso, dia_util, dia_util_mes,
  dias_uteis_no_mes, trimestre
)
WITH serie AS (
  SELECT generate_series(
    '2022-01-01'::date,
    '2023-12-31'::date,
    '1 day'::interval
  )::date AS dt
),
calc AS (
  SELECT
    dt,
    EXTRACT(YEAR    FROM dt)::int AS ano,
    EXTRACT(MONTH   FROM dt)::int AS mes,
    EXTRACT(DAY     FROM dt)::int AS dia,
    EXTRACT(DOW     FROM dt)::int AS dia_semana,
    EXTRACT(WEEK    FROM dt)::int AS semana_iso,
    EXTRACT(QUARTER FROM dt)::int AS trimestre,
    EXTRACT(DOW     FROM dt) NOT IN (0, 6) AS dia_util
  FROM serie
)
SELECT
  dt,
  ano,
  mes,
  CASE mes
    WHEN 1  THEN 'Janeiro'   WHEN 2  THEN 'Fevereiro' WHEN 3  THEN 'Março'
    WHEN 4  THEN 'Abril'     WHEN 5  THEN 'Maio'      WHEN 6  THEN 'Junho'
    WHEN 7  THEN 'Julho'     WHEN 8  THEN 'Agosto'    WHEN 9  THEN 'Setembro'
    WHEN 10 THEN 'Outubro'   WHEN 11 THEN 'Novembro'  WHEN 12 THEN 'Dezembro'
  END AS mes_nome,
  CASE mes
    WHEN 1  THEN 'jan' WHEN 2  THEN 'fev' WHEN 3  THEN 'mar'
    WHEN 4  THEN 'abr' WHEN 5  THEN 'mai' WHEN 6  THEN 'jun'
    WHEN 7  THEN 'jul' WHEN 8  THEN 'ago' WHEN 9  THEN 'set'
    WHEN 10 THEN 'out' WHEN 11 THEN 'nov' WHEN 12 THEN 'dez'
  END AS mes_abrev,
  dia,
  dia_semana,
  CASE dia_semana
    WHEN 0 THEN 'Domingo'  WHEN 1 THEN 'Segunda' WHEN 2 THEN 'Terça'
    WHEN 3 THEN 'Quarta'   WHEN 4 THEN 'Quinta'  WHEN 5 THEN 'Sexta'
    WHEN 6 THEN 'Sábado'
  END AS dia_semana_nome,
  semana_iso,
  dia_util,
  CASE WHEN dia_util THEN
    SUM(CASE WHEN dia_util THEN 1 ELSE 0 END) OVER (
      PARTITION BY ano, mes
      ORDER BY dt
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    )
  END AS dia_util_mes,
  SUM(CASE WHEN dia_util THEN 1 ELSE 0 END) OVER (
    PARTITION BY ano, mes
  ) AS dias_uteis_no_mes,
  trimestre
FROM calc
ON CONFLICT (data) DO NOTHING;
