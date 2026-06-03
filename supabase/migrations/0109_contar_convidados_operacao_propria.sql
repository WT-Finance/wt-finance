-- ---------------------------------------------------------------------------
-- 0109 — feat(v4.9/M3): contar_convidados_operacao via operacao_propria (vínculo direto)
--
-- ⚠️ APLICAR SOMENTE APÓS O RE-UPLOAD de Vendas por Produto COM a coluna
--    Operação Própria (M2/checkpoint). Antes disso, operacao_propria é NULL em
--    todas as linhas e esta função retornaria 0 convidados para tudo. A versão
--    antiga (join via venda_n) continua válida sobre os dados atuais até lá.
--
-- ANTES: a contagem cruzava Vendas×Lançamentos — pegava venda_n de
--   analytics.fato_lancamento_operacao (WHERE operacao = p_operacao), juntava em
--   raw.vendas_excel por venda_numero e filtrava produto. Join frágil, fonte de
--   divergência (o mesmo passageiro aparece em várias diárias; o vínculo por
--   venda_n nem sempre cobre todas as diárias da operação).
--
-- AGORA: filtro DIRETO em raw.vendas_excel WHERE operacao_propria = p_operacao
--   (o nome da operação, vindo do ERP, no mesmo formato de Lançamentos) AND
--   produto = 'Diárias de Hospedagem'. Da coluna Passageiros: split por vírgula,
--   normaliza (trim + lower + unaccent + colapsa espaços), DISTINCT, COUNT.
--   A normalização é mantida (evita contar "João Silva" e "JOÃO  SILVA" como 2).
--
-- Performance (anon, 3s): a função é chamada 1×/operação dentro de
--   get_operacoes_weddings (~140 ops). raw.vendas_excel tem ~54k linhas; sem
--   índice, o filtro por operacao_propria seria seq scan × 140 → estouro de
--   timeout (mesma armadilha N+1 da migration 0101). Índice parcial em
--   operacao_propria (só linhas de hospedagem) torna cada chamada uma busca
--   indexada. CREATE OR REPLACE preserva os GRANTs.
-- ---------------------------------------------------------------------------

-- Índice parcial: só as linhas de hospedagem, chaveadas pelo nome da operação.
CREATE INDEX IF NOT EXISTS idx_raw_vendas_excel_operacao_propria_hosp
  ON raw.vendas_excel (operacao_propria)
  WHERE produto = 'Diárias de Hospedagem';

CREATE OR REPLACE FUNCTION public.contar_convidados_operacao(p_operacao text)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  WITH passageiros_raw AS (
    SELECT unnest(string_to_array(v.passageiros, ',')) AS nome
    FROM raw.vendas_excel v
    WHERE v.operacao_propria = p_operacao
      AND v.produto = 'Diárias de Hospedagem'
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
