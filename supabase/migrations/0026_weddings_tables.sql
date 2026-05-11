-- ---------------------------------------------------------------------------
-- 0026 — Weddings v3.4: tabelas de operações e lançamentos
--
-- Adiciona:
--   analytics.dim_produto_subsetor      — mapeamento produto → subsetor
--   analytics.fato_lancamento_operacao  — lançamentos financeiros por casamento
--   analytics.dim_operacao_weddings     — resumo por operação (casamento)
--   analytics.extrair_data_evento()     — extrai data do nome da operação
--   analytics.extrair_nome_casal()      — extrai nome do casal do nome da operação
--   analytics.regenerar_dim_operacao_weddings() — reconstrói dim_operacao_weddings
--   public.get_upload_status()          — status de carga (counts + timestamps)
--   public.truncar_lancamentos()        — limpa fato_lancamento_operacao
--   public.inserir_lote_lancamentos()   — insere lote de lançamentos via JSON
--   public.regenerar_dim_operacao_weddings() — wrapper público para analytics fn
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. dim_produto_subsetor
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analytics.dim_produto_subsetor (
  produto              text        PRIMARY KEY,
  produto_normalizado  text        NOT NULL,
  subsetor             text        NOT NULL
    CHECK (subsetor IN ('COMERCIAL', 'CONVIDADOS', 'PRODUÇÃO', 'PLANEJAMENTO')),
  ativo                boolean     NOT NULL DEFAULT true,
  criado_em            timestamptz NOT NULL DEFAULT now(),
  atualizado_em        timestamptz NOT NULL DEFAULT now()
);

-- Carga inicial: 21 produtos da matriz do Anexo A (case-sensitive igual aos dados)
INSERT INTO analytics.dim_produto_subsetor (produto, produto_normalizado, subsetor) VALUES
  ('Contrato de Casamento',              'CONTRATO DE CASAMENTO',              'COMERCIAL'),
  ('Contrato de casamento',              'CONTRATO DE CASAMENTO',              'COMERCIAL'),
  ('Atualização de Contrato',            'ATUALIZAÇÃO DE CONTRATO',            'COMERCIAL'),
  ('Taxa de Serviço',                    'TAXA DE SERVIÇO',                    'COMERCIAL'),
  ('Diárias de Hospedagem',              'DIÁRIAS DE HOSPEDAGEM',              'CONVIDADOS'),
  ('Aluguel de Carro',                   'ALUGUEL DE CARRO',                   'CONVIDADOS'),
  ('Cruzeiros',                          'CRUZEIROS',                          'CONVIDADOS'),
  ('Ingressos',                          'INGRESSOS',                          'CONVIDADOS'),
  ('Pacote Turístico',                   'PACOTE TURÍSTICO',                   'CONVIDADOS'),
  ('Passagem Aérea',                     'PASSAGEM AÉREA',                     'CONVIDADOS'),
  ('Passes de Trem',                     'PASSES DE TREM',                     'CONVIDADOS'),
  ('Receptivo - Traslados e Passeios',   'RECEPTIVO - TRASLADOS E PASSEIOS',   'CONVIDADOS'),
  ('Seguro Viagem',                      'SEGURO VIAGEM',                      'CONVIDADOS'),
  ('Transporte Rodoviario',              'TRANSPORTE RODOVIARIO',              'CONVIDADOS'),
  ('Bagagens ou assentos',               'BAGAGENS OU ASSENTOS',               'CONVIDADOS'),
  ('Cerimonial de Casamento',            'CERIMONIAL DE CASAMENTO',            'PRODUÇÃO'),
  ('Extras Casamento',                   'EXTRAS CASAMENTO',                   'PRODUÇÃO'),
  ('Pacote de Casamento',                'PACOTE DE CASAMENTO',                'PLANEJAMENTO'),
  ('Pacote Turístico (passeios)',         'PACOTE TURÍSTICO (PASSEIOS)',        'PLANEJAMENTO'),
  ('Eventos (festa de boas vindas)',      'EVENTOS (FESTA DE BOAS VINDAS)',     'PLANEJAMENTO'),
  ('Pacote Turístico (Passeios)',         'PACOTE TURÍSTICO (PASSEIOS)',        'PLANEJAMENTO')
ON CONFLICT (produto) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. fato_lancamento_operacao
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analytics.fato_lancamento_operacao (
  id             bigserial      PRIMARY KEY,
  lancamento_n   bigint,
  venda_n        bigint,
  pessoa         text,
  descricao      text,
  liquidacao_dt  date,
  vencimento_dt  date,
  valor          numeric(14,2)  NOT NULL,
  tipo           text           NOT NULL CHECK (tipo IN ('Entrada', 'Saída')),
  operacao       text           NOT NULL,
  status         text,
  data_final     date,
  mes_ano        text,
  importado_em   timestamptz    NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lancamento_operacao   ON analytics.fato_lancamento_operacao (operacao);
CREATE INDEX IF NOT EXISTS idx_lancamento_venda_n    ON analytics.fato_lancamento_operacao (venda_n);
CREATE INDEX IF NOT EXISTS idx_lancamento_liquidacao ON analytics.fato_lancamento_operacao (liquidacao_dt);
CREATE INDEX IF NOT EXISTS idx_lancamento_tipo_op    ON analytics.fato_lancamento_operacao (tipo, operacao);

-- ---------------------------------------------------------------------------
-- 3. dim_operacao_weddings
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analytics.dim_operacao_weddings (
  operacao         text           PRIMARY KEY,
  nome_casal       text,
  data_evento      date,
  situacao         text           NOT NULL DEFAULT 'sem_data'
    CHECK (situacao IN ('passado', 'futuro', 'sem_data')),
  entradas_total   numeric(14,2)  NOT NULL DEFAULT 0,
  saidas_total     numeric(14,2)  NOT NULL DEFAULT 0,
  recebido         numeric(14,2)  NOT NULL DEFAULT 0,
  a_receber        numeric(14,2)  NOT NULL DEFAULT 0,
  pago             numeric(14,2)  NOT NULL DEFAULT 0,
  a_pagar          numeric(14,2)  NOT NULL DEFAULT 0,
  resultado_caixa  numeric(14,2)  GENERATED ALWAYS AS (entradas_total - saidas_total) STORED,
  ncg              numeric(14,2)  GENERATED ALWAYS AS (a_pagar - a_receber) STORED,
  atualizado_em    timestamptz    NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 4. Função: extrair data do nome da operação
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION analytics.extrair_data_evento(p_operacao text)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_match   text[];
  v_dia     int;
  v_mes     text;
  v_ano     int;
  v_mes_num int;
BEGIN
  -- Captura: 1-2 dígitos + 3 letras + 2 ou 4 dígitos no final da string
  v_match := regexp_match(upper(p_operacao), '(\d{1,2})([A-Z]{3})(\d{2,4})$');
  IF v_match IS NULL THEN RETURN NULL; END IF;

  v_dia := v_match[1]::int;
  v_mes := v_match[2];
  v_ano := v_match[3]::int;
  IF v_ano < 100 THEN v_ano := v_ano + 2000; END IF;

  v_mes_num := CASE v_mes
    WHEN 'JAN' THEN 1  WHEN 'FEB' THEN 2  WHEN 'FEV' THEN 2
    WHEN 'MAR' THEN 3  WHEN 'APR' THEN 4  WHEN 'ABR' THEN 4
    WHEN 'MAY' THEN 5  WHEN 'MAI' THEN 5  WHEN 'JUN' THEN 6
    WHEN 'JUL' THEN 7  WHEN 'AUG' THEN 8  WHEN 'AGO' THEN 8
    WHEN 'SEP' THEN 9  WHEN 'SET' THEN 9  WHEN 'OCT' THEN 10
    WHEN 'OUT' THEN 10 WHEN 'NOV' THEN 11 WHEN 'DEC' THEN 12
    WHEN 'DEZ' THEN 12 ELSE NULL
  END;

  IF v_mes_num IS NULL THEN RETURN NULL; END IF;

  RETURN make_date(v_ano, v_mes_num, v_dia);
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Função: extrair nome do casal do nome da operação
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION analytics.extrair_nome_casal(p_operacao text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_match text[];
BEGIN
  -- Padrão: 'W - <nome casal> - DDMMMAA' (com ou sem espaços ao redor do hífen)
  v_match := regexp_match(p_operacao, '^W\s*-\s*(.+?)\s*-\s*\d{1,2}[A-Za-z]{3}\d{2,4}$');
  IF v_match IS NOT NULL THEN RETURN v_match[1]; END IF;

  -- Fallback: remove prefixo 'W - '
  v_match := regexp_match(p_operacao, '^W\s*-\s*(.+)$');
  IF v_match IS NOT NULL THEN RETURN v_match[1]; END IF;

  RETURN p_operacao;
EXCEPTION WHEN OTHERS THEN
  RETURN p_operacao;
END $$;

-- ---------------------------------------------------------------------------
-- 6. Função: regenerar dim_operacao_weddings a partir dos lançamentos
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION analytics.regenerar_dim_operacao_weddings()
RETURNS int
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_count int;
BEGIN
  TRUNCATE analytics.dim_operacao_weddings;

  INSERT INTO analytics.dim_operacao_weddings
    (operacao, nome_casal, data_evento, situacao,
     entradas_total, saidas_total, recebido, a_receber, pago, a_pagar)
  SELECT
    operacao,
    analytics.extrair_nome_casal(operacao),
    analytics.extrair_data_evento(operacao),
    CASE
      WHEN analytics.extrair_data_evento(operacao) IS NULL       THEN 'sem_data'
      WHEN analytics.extrair_data_evento(operacao) < CURRENT_DATE THEN 'passado'
      ELSE 'futuro'
    END,
    SUM(CASE WHEN tipo   = 'Entrada'          THEN valor ELSE 0 END),
    SUM(CASE WHEN tipo   = 'Saída'            THEN valor ELSE 0 END),
    SUM(CASE WHEN status = 'Entrada'          THEN valor ELSE 0 END),
    SUM(CASE WHEN status = 'A Receber Futuro' THEN valor ELSE 0 END),
    SUM(CASE WHEN status = 'Saída'            THEN valor ELSE 0 END),
    SUM(CASE WHEN status = 'A Pagar Futuro'   THEN valor ELSE 0 END)
  FROM analytics.fato_lancamento_operacao
  GROUP BY operacao;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

-- ---------------------------------------------------------------------------
-- 7. RLS: SELECT aberto para anon; INSERT/UPDATE somente service_role
-- ---------------------------------------------------------------------------
ALTER TABLE analytics.dim_produto_subsetor       ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics.fato_lancamento_operacao   ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics.dim_operacao_weddings      ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "anon_select_dim_produto_subsetor"
  ON analytics.dim_produto_subsetor FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY IF NOT EXISTS "anon_select_fato_lancamento"
  ON analytics.fato_lancamento_operacao FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY IF NOT EXISTS "anon_select_dim_operacao_weddings"
  ON analytics.dim_operacao_weddings FOR SELECT TO anon, authenticated USING (true);

-- ---------------------------------------------------------------------------
-- 8. RPCs públicos — acesso ao analytics schema via PostgREST
--    (analytics não está exposto diretamente; toda leitura/escrita passa por
--     funções SECURITY DEFINER no schema public)
-- ---------------------------------------------------------------------------

-- Status de carga: counts + timestamps de última importação
CREATE OR REPLACE FUNCTION public.get_upload_status()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'vendas', jsonb_build_object(
      'total',              (SELECT COUNT(*)    FROM analytics.fato_venda),
      'ultima_atualizacao', (SELECT MAX(criado_em) FROM analytics.fato_venda)
    ),
    'lancamentos', jsonb_build_object(
      'total',              (SELECT COUNT(*)       FROM analytics.fato_lancamento_operacao),
      'ultima_atualizacao', (SELECT MAX(importado_em) FROM analytics.fato_lancamento_operacao)
    )
  )
$$;

-- Trunca fato_lancamento_operacao (substitui DELETE .neq('id',0))
CREATE OR REPLACE FUNCTION public.truncar_lancamentos()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  TRUNCATE analytics.fato_lancamento_operacao;
END $$;

-- Insere lote de lançamentos recebido como array JSON
CREATE OR REPLACE FUNCTION public.inserir_lote_lancamentos(p_linhas jsonb)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count int;
BEGIN
  INSERT INTO analytics.fato_lancamento_operacao
    (lancamento_n, venda_n, pessoa, descricao,
     liquidacao_dt, vencimento_dt, valor, tipo,
     operacao, status, data_final, mes_ano)
  SELECT
    NULLIF(el->>'lancamento_n', '')::bigint,
    NULLIF(el->>'venda_n',      '')::bigint,
    NULLIF(el->>'pessoa',       ''),
    NULLIF(el->>'descricao',    ''),
    NULLIF(el->>'liquidacao_dt','')::date,
    NULLIF(el->>'vencimento_dt','')::date,
    (el->>'valor')::numeric,
    el->>'tipo',
    el->>'operacao',
    NULLIF(el->>'status',    ''),
    NULLIF(el->>'data_final','')::date,
    NULLIF(el->>'mes_ano',   '')
  FROM jsonb_array_elements(p_linhas) AS el;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

-- Wrapper público para analytics.regenerar_dim_operacao_weddings
CREATE OR REPLACE FUNCTION public.regenerar_dim_operacao_weddings()
RETURNS int
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT analytics.regenerar_dim_operacao_weddings()
$$;
