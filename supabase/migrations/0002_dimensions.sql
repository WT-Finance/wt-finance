-- Cria todas as tabelas de dimensão e popula as estáticas
--
-- Dimensões representam entidades estáveis do negócio.
-- Cada uma tem chave primária artificial (bigserial) e chave natural (texto).

-- ---------------------------------------------------------------------------
-- analytics.dim_setor_macro  — 3 linhas fixas, inseridas aqui
-- ---------------------------------------------------------------------------
CREATE TABLE analytics.dim_setor_macro (
  id           bigserial  PRIMARY KEY,
  nome         text       NOT NULL UNIQUE,
  display_nome text       NOT NULL,
  cor_hex      text       NOT NULL,
  ordem        int        NOT NULL
);

INSERT INTO analytics.dim_setor_macro (nome, display_nome, cor_hex, ordem) VALUES
  ('Lazer',       'Trips',        '#378ADD', 1),
  ('Weddings',    'Weddings',     '#BA7517', 2),
  ('Corporativo', 'Corporativo',  '#0F6E56', 3);

-- ---------------------------------------------------------------------------
-- analytics.dim_setor  — 7 setores, inseridos aqui (taxonomia de cap. 10.2)
-- ---------------------------------------------------------------------------
CREATE TABLE analytics.dim_setor (
  id             bigserial  PRIMARY KEY,
  nome           text       NOT NULL UNIQUE,
  setor_macro_id bigint     NOT NULL REFERENCES analytics.dim_setor_macro(id)
);

INSERT INTO analytics.dim_setor (nome, setor_macro_id) VALUES
  ('Lazer',            (SELECT id FROM analytics.dim_setor_macro WHERE nome = 'Lazer')),
  ('Expedições',       (SELECT id FROM analytics.dim_setor_macro WHERE nome = 'Lazer')),
  ('Corporativo',      (SELECT id FROM analytics.dim_setor_macro WHERE nome = 'Corporativo')),
  ('WedMe',            (SELECT id FROM analytics.dim_setor_macro WHERE nome = 'Weddings')),
  ('Weddings',         (SELECT id FROM analytics.dim_setor_macro WHERE nome = 'Weddings')),
  ('Planejamento-WED', (SELECT id FROM analytics.dim_setor_macro WHERE nome = 'Weddings')),
  ('Produção',         (SELECT id FROM analytics.dim_setor_macro WHERE nome = 'Weddings'));

-- ---------------------------------------------------------------------------
-- analytics.dim_setor_micro  — 9 linhas (UNIQUE em nome, per briefing)
-- Nota: 'Hospedagem' aparece nas planilhas sob WedMe e Weddings. Como o
-- briefing define UNIQUE em nome (9 linhas únicas), linkamos ao setor
-- 'Weddings' (mais abrangente). O setor correto de cada item é determinado
-- pela coluna setor_id em fato_venda_item, não pelo FK desta dimensão.
-- ---------------------------------------------------------------------------
CREATE TABLE analytics.dim_setor_micro (
  id       bigserial  PRIMARY KEY,
  nome     text       NOT NULL UNIQUE,
  setor_id bigint     NOT NULL REFERENCES analytics.dim_setor(id)
);

INSERT INTO analytics.dim_setor_micro (nome, setor_id) VALUES
  ('Lazer',            (SELECT id FROM analytics.dim_setor WHERE nome = 'Lazer')),
  ('Expedições',       (SELECT id FROM analytics.dim_setor WHERE nome = 'Expedições')),
  ('Corporativo',      (SELECT id FROM analytics.dim_setor WHERE nome = 'Corporativo')),
  ('WedMe',            (SELECT id FROM analytics.dim_setor WHERE nome = 'WedMe')),
  ('Hospedagem',       (SELECT id FROM analytics.dim_setor WHERE nome = 'Weddings')),
  ('Weddings',         (SELECT id FROM analytics.dim_setor WHERE nome = 'Weddings')),
  ('Extras',           (SELECT id FROM analytics.dim_setor WHERE nome = 'Weddings')),
  ('Planejamento-WED', (SELECT id FROM analytics.dim_setor WHERE nome = 'Planejamento-WED')),
  ('Produção',         (SELECT id FROM analytics.dim_setor WHERE nome = 'Produção'));

-- ---------------------------------------------------------------------------
-- analytics.dim_vendedor  — populada pelo seed (transforma nomes do Excel)
-- ---------------------------------------------------------------------------
CREATE TABLE analytics.dim_vendedor (
  id         bigserial    PRIMARY KEY,
  nome       text         NOT NULL UNIQUE,
  ativo      boolean      NOT NULL DEFAULT true,
  criado_em  timestamptz  NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- analytics.dim_pagante  — populada pelo seed
-- ---------------------------------------------------------------------------
CREATE TABLE analytics.dim_pagante (
  id         bigserial    PRIMARY KEY,
  nome       text         NOT NULL UNIQUE,
  criado_em  timestamptz  NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- analytics.dim_produto  — populada pelo seed
-- ---------------------------------------------------------------------------
CREATE TABLE analytics.dim_produto (
  id         bigserial    PRIMARY KEY,
  nome       text         NOT NULL UNIQUE,
  categoria  text,
  criado_em  timestamptz  NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- analytics.dim_data  — tabela de calendário, 2024-01-01 a 2030-12-31
--
-- dia_util: false em sábados e domingos (feriados ficam para iteração futura)
-- dia_util_mes: número sequencial do dia útil dentro do mês (null em não-úteis)
-- dias_uteis_no_mes: total de dias úteis do mês (usado em projeções e ritmo)
-- ---------------------------------------------------------------------------
CREATE TABLE analytics.dim_data (
  data              date  PRIMARY KEY,
  ano               int   NOT NULL,
  mes               int   NOT NULL,
  mes_nome          text  NOT NULL,
  mes_abrev         text  NOT NULL,
  dia               int   NOT NULL,
  dia_semana        int   NOT NULL,   -- 0=domingo, 6=sábado
  dia_semana_nome   text  NOT NULL,
  semana_iso        int   NOT NULL,
  dia_util          boolean  NOT NULL,
  dia_util_mes      int,
  dias_uteis_no_mes int,
  trimestre         int   NOT NULL
);

INSERT INTO analytics.dim_data (
  data, ano, mes, mes_nome, mes_abrev, dia, dia_semana,
  dia_semana_nome, semana_iso, dia_util, dia_util_mes,
  dias_uteis_no_mes, trimestre
)
WITH serie AS (
  SELECT generate_series(
    '2024-01-01'::date,
    '2030-12-31'::date,
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
FROM calc;
