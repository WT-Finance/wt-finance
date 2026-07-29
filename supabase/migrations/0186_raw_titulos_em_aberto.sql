-- ---------------------------------------------------------------------------
-- 0186 — feat(db): base nova raw.titulos_em_aberto (v5.2.0 / Onda 1, M1)
--
-- ADITIVA / retrocompatível com a main viva:
--   • CREATE TABLE nova (não toca raw.fluxo_caixa_titulos nem dado pré-existente)
--   • CREATE FUNCTION novas (truncar/inserir_lote/status) — RPCs de upload, service_role
-- Convivência: nasce AO LADO de raw.fluxo_caixa_titulos; nada lê esta base ainda
--   (o roteamento do PREVISTO passa a lê-la no M2/M3). A base antiga segue viva até o
--   último consumidor repontar (M3); o DROP é destrutiva separada, aplicada pelo Yan.
--
-- Fonte: export Monde "Lançamentos por vencimento — em aberto" (tratada, R v2) — 12 colunas.
--   Define o PREVISTO por VENCIMENTO (regra §3.2). Títulos NÃO liquidados:
--   liquidacao é SEMPRE vazia (validado no parser/M2; sem CHECK rígido para tolerar
--   variação do export). A pagar = valor negativo; a receber = positivo. Vencimentos
--   vão até 2049 no Monde; o corte 31/12/2028 (regra §3.4) é aplicado no roteamento (M2),
--   NÃO no upload — nunca filtrar no upload (invariante 2).
-- ---------------------------------------------------------------------------

CREATE TABLE raw.titulos_em_aberto (
  id                    BIGSERIAL   PRIMARY KEY,
  arquivo_origem        TEXT        NOT NULL,
  carregado_em          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  numero                TEXT,
  venda_no              BIGINT,
  emissao               DATE,
  vencimento            DATE,
  liquidacao            DATE,                     -- sempre NULL nesta base (título em aberto)
  pessoa                TEXT,
  descricao             TEXT,
  descricao_categoria   TEXT,
  valor                 NUMERIC(18,2),            -- a receber (+) / a pagar (−)
  categoria             TEXT,
  grupo_categoria       TEXT,
  conta                 TEXT
);

CREATE INDEX titulos_ab_vencimento_idx ON raw.titulos_em_aberto (vencimento);
CREATE INDEX titulos_ab_conta_idx      ON raw.titulos_em_aberto (conta);
CREATE INDEX titulos_ab_grupo_idx      ON raw.titulos_em_aberto (grupo_categoria);

ALTER TABLE raw.titulos_em_aberto ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, DELETE ON raw.titulos_em_aberto TO service_role;
GRANT USAGE, SELECT ON SEQUENCE raw.titulos_em_aberto_id_seq TO service_role;

-- ---------------------------------------------------------------------------
-- RPCs de upload — mesmo padrão do movimentação (service_role only).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.truncar_titulos_em_aberto()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  TRUNCATE raw.titulos_em_aberto RESTART IDENTITY;
END;
$function$;

CREATE OR REPLACE FUNCTION public.inserir_lote_titulos_em_aberto(p_linhas jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  INSERT INTO raw.titulos_em_aberto (
    arquivo_origem,
    numero,
    venda_no,
    emissao,
    vencimento,
    liquidacao,
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

CREATE OR REPLACE FUNCTION public.status_titulos_em_aberto()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT jsonb_build_object(
    'total',              (SELECT count(*)          FROM raw.titulos_em_aberto),
    'ultima_atualizacao', (SELECT max(carregado_em) FROM raw.titulos_em_aberto)
  );
$function$;

REVOKE EXECUTE ON FUNCTION public.truncar_titulos_em_aberto()          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.inserir_lote_titulos_em_aberto(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.status_titulos_em_aberto()           FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.truncar_titulos_em_aberto()          TO service_role;
GRANT EXECUTE ON FUNCTION public.inserir_lote_titulos_em_aberto(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.status_titulos_em_aberto()           TO service_role;

NOTIFY pgrst, 'reload schema';
