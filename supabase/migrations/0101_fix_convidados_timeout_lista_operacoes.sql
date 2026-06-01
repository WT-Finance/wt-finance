-- ---------------------------------------------------------------------------
-- 0101 — fix: timeout (HTTP 500) na Lista de Operações Weddings
--
-- BUG: get_operacoes_weddings passou a estourar o statement_timeout do role
--   `anon` (3s) → PostgREST devolve 57014 "canceling statement due to statement
--   timeout" → HTTP 500. (O role service_role não tem timeout, por isso só
--   quebrava pelo front, que usa a anon key.)
--
-- CAUSA: a coluna `convidados` é calculada por public.contar_convidados_operacao
--   DENTRO da CTE `base` — ou seja, uma vez POR OPERAÇÃO FILTRADA (~140 em
--   'passado'). Essa função junta raw.vendas_excel por
--   `vo.venda_n = v.venda_numero::bigint`: o cast ::bigint na coluna indexável
--   impede uso de índice, e não havia índice em raw.vendas_excel(venda_numero).
--   Resultado: ~140 seq-scans da tabela raw.vendas_excel. Quando o backfill
--   0100 repopulou/dobrou fato_venda e raw.vendas_excel (32.860 vendas, 54.458
--   linhas, histórico 2022-2023), o tempo passou de <3s para ~3,3s, cruzando o
--   limite de 3s do anon.
--
-- FIX (sem mudar get_operacoes_weddings — menor risco):
--   1. Índice btree em raw.vendas_excel(venda_numero).
--   2. Reescreve o JOIN de contar_convidados_operacao para comparar como TEXTO
--      (vo.venda_n::text = v.venda_numero), tirando o cast da coluna indexável.
--      Equivalência verificada: 54.458/54.458 valores de venda_numero são
--      puramente numéricos e sem zeros à esquerda, então venda_n = venda_numero::bigint
--      ⟺ venda_n::text = venda_numero (zero linhas perdidas). É também o mesmo
--      padrão de join já usado por vendas_op / tipo_contrato_cte / passageiros_cte.
--   Cada chamada de convidados vira index lookup; a RPC cai para ~0,5-1s.
-- ---------------------------------------------------------------------------

-- 1. Índice geral em raw.vendas_excel(venda_numero)
--    (antes só existia o parcial WHERE contrato IS TRUE — não cobria convidados)
CREATE INDEX IF NOT EXISTS idx_raw_vendas_excel_venda_numero
  ON raw.vendas_excel (venda_numero);

-- 2. contar_convidados_operacao: join como texto (usa o índice acima)
CREATE OR REPLACE FUNCTION public.contar_convidados_operacao(p_operacao text)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  WITH vendas_operacao AS (
    SELECT DISTINCT flo.venda_n
    FROM analytics.fato_lancamento_operacao flo
    WHERE flo.operacao = p_operacao
  ),
  passageiros_raw AS (
    SELECT unnest(string_to_array(v.passageiros, ',')) AS nome
    FROM raw.vendas_excel v
    JOIN vendas_operacao vo ON vo.venda_n::text = v.venda_numero
    WHERE v.produto = 'Diárias de Hospedagem'
      AND v.passageiros IS NOT NULL
      AND trim(v.passageiros) != ''
  ),
  normalizados AS (
    SELECT DISTINCT
      regexp_replace(
        lower(pg_catalog.unaccent(trim(nome))),
        '\s+', ' ', 'g'
      ) AS nome_norm
    FROM passageiros_raw
    WHERE trim(nome) != ''
  )
  SELECT COUNT(*)::INTEGER FROM normalizados;
$function$;

REVOKE EXECUTE ON FUNCTION public.contar_convidados_operacao(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.contar_convidados_operacao(text) TO service_role;
