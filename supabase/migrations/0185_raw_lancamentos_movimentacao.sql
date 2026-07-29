-- ---------------------------------------------------------------------------
-- 0185 — feat(db): base nova raw.lancamentos_movimentacao (v5.2.0 / Onda 1, M1)
--
-- ADITIVA / retrocompatível com a main viva:
--   • CREATE TABLE nova (não toca raw.lancamentos nem nenhum dado pré-existente)
--   • CREATE FUNCTION novas (truncar/inserir_lote/status) — RPCs de upload, service_role
-- Convivência: nasce AO LADO de raw.lancamentos; nada lê esta base ainda (o fato
--   passa a lê-la só no M2, regenerar_financeiro_lancamentos v2). raw.lancamentos e
--   seu pipeline seguem vivos até o último consumidor repontar (M3); o DROP é migration
--   destrutiva separada, aplicada pelo Yan em TTY.
--
-- Fonte: export Monde "Lançamentos por movimentação" (tratada, script R v2) — 13 colunas.
--   Eixo do REALIZADO = data_movimentacao (regra §3.1 da referência: dinheiro conta
--   quando entra/sai da conta; liquidação ≠ movimentação — o cartão liquida numa data
--   e movimenta depois). Movimentações com data futura entram no PREVISTO (M2).
--   Sinal do Valor preserva entrada (+) / saída (−).
-- ---------------------------------------------------------------------------

CREATE TABLE raw.lancamentos_movimentacao (
  id                    BIGSERIAL   PRIMARY KEY,
  arquivo_origem        TEXT        NOT NULL,
  carregado_em          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  numero                TEXT,
  venda_no              BIGINT,                   -- Venda Nº (NULL se não vinculado a venda)
  emissao               DATE,
  vencimento            DATE,
  liquidacao            DATE,                     -- data de baixa no ERP (≠ movimentação)
  data_movimentacao     DATE,                     -- NOVO: eixo do realizado (dinheiro na conta)
  pessoa                TEXT,
  descricao             TEXT,
  descricao_categoria   TEXT,
  valor                 NUMERIC(18,2),            -- positivo = entrada, negativo = saída
  categoria             TEXT,
  grupo_categoria       TEXT,
  conta                 TEXT
);

CREATE INDEX lanc_mov_movimentacao_idx ON raw.lancamentos_movimentacao (data_movimentacao);
CREATE INDEX lanc_mov_vencimento_idx   ON raw.lancamentos_movimentacao (vencimento);
CREATE INDEX lanc_mov_liquidacao_idx   ON raw.lancamentos_movimentacao (liquidacao);
CREATE INDEX lanc_mov_conta_idx        ON raw.lancamentos_movimentacao (conta);
CREATE INDEX lanc_mov_grupo_idx        ON raw.lancamentos_movimentacao (grupo_categoria);

-- RLS fechado (deny-by-default, sem policy) — o app nunca toca a tabela direto;
-- o acesso é via RPCs SECURITY DEFINER (owner postgres ignora RLS). Mesmo padrão
-- das demais raw.* (ADR-0123).
ALTER TABLE raw.lancamentos_movimentacao ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, DELETE ON raw.lancamentos_movimentacao TO service_role;
GRANT USAGE, SELECT ON SEQUENCE raw.lancamentos_movimentacao_id_seq TO service_role;

-- ---------------------------------------------------------------------------
-- RPCs de upload (full-swap: truncar → inserir_lote → [M2: regenerar]).
-- SECURITY DEFINER, EXECUTE só para service_role (chamadas via getAdminClient).
-- Mesmo contrato de inserir_lote_lancamentos_financeiro (chaves do jsonb) + data_movimentacao.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.truncar_lancamentos_movimentacao()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  TRUNCATE raw.lancamentos_movimentacao RESTART IDENTITY;
END;
$function$;

CREATE OR REPLACE FUNCTION public.inserir_lote_lancamentos_movimentacao(p_linhas jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  INSERT INTO raw.lancamentos_movimentacao (
    arquivo_origem,
    numero,
    venda_no,
    emissao,
    vencimento,
    liquidacao,
    data_movimentacao,
    pessoa,
    descricao,
    descricao_categoria,
    valor,
    categoria,
    grupo_categoria,
    conta
  )
  SELECT
    x->>'arquivo_origem',
    NULLIF(x->>'numero',              ''),
    (NULLIF(x->>'venda_no',           ''))::BIGINT,
    (NULLIF(x->>'emissao',            ''))::DATE,
    (NULLIF(x->>'vencimento',         ''))::DATE,
    (NULLIF(x->>'liquidacao',         ''))::DATE,
    (NULLIF(x->>'data_movimentacao',  ''))::DATE,
    NULLIF(x->>'pessoa',              ''),
    NULLIF(x->>'descricao',           ''),
    NULLIF(x->>'descricao_categoria', ''),
    (x->>'valor')::NUMERIC(18,2),
    NULLIF(x->>'categoria',           ''),
    NULLIF(x->>'grupo_categoria',     ''),
    NULLIF(x->>'conta',               '')
  FROM jsonb_array_elements(p_linhas) AS x;
END;
$function$;

CREATE OR REPLACE FUNCTION public.status_lancamentos_movimentacao()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT jsonb_build_object(
    'total',              (SELECT count(*)          FROM raw.lancamentos_movimentacao),
    'ultima_atualizacao', (SELECT max(carregado_em) FROM raw.lancamentos_movimentacao)
  );
$function$;

REVOKE EXECUTE ON FUNCTION public.truncar_lancamentos_movimentacao()          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.inserir_lote_lancamentos_movimentacao(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.status_lancamentos_movimentacao()           FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.truncar_lancamentos_movimentacao()          TO service_role;
GRANT EXECUTE ON FUNCTION public.inserir_lote_lancamentos_movimentacao(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.status_lancamentos_movimentacao()           TO service_role;

NOTIFY pgrst, 'reload schema';
