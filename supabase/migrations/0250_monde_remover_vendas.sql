-- ---------------------------------------------------------------------------
-- 0250 — feat(v5.6.3): cura auditada de vendas retidas no espelho Monde.
--
-- ADITIVA / retrocompatível: só CREATE de RPC NOVA + REVOKE/GRANT explícitos.
-- Nenhum objeto existente alterado; nada a consome até o front desta versão
-- chegar. O DELETE vive no CORPO da função (mesmo tratamento do TRUNCATE de
-- monde_ingest_limpar_staging) e NÃO executa na aplicação da migration.
--
-- O QUE É: a peça de banco da rota 2 do tripwire (v5.4.5). Venda espelhada que
-- depois é RECLASSIFICADA na origem para Welcome/sem-setor (ou some da
-- listagem) deixa de ser tocada pelo upsert — a exclusão de escopo é aplicada
-- na escrita — e fica congelada somando (caso medido: venda 73580, ago/26,
-- R$ 7.372,92, Corporativo→Welcome). A reconciliação diária passa a CURAR o
-- mês: recebe os sale_ids que a rodada provou ESPELHÁVEIS e remove do espelho
-- o que ficou de fora — desde que a apuração seja íntegra (guardas no app:
-- erros=0, conta_fecha, sem_sale_id=0) E dentro do teto abaixo.
--
-- CINTOS NA PRÓPRIA RPC (não dependem do chamador):
--   • conjunto provado VAZIO nunca autoriza (bloqueado:true sem varrer nada):
--     com `NOT ANY('{}')` toda linha do mês viraria candidata, e num mês novo
--     com ≤ p_teto vendas a "cura" apagaria o mês inteiro — e a recontagem
--     pós-cura apagaria o próprio alarme (CRÍTICO do revisor de código; o app
--     também bloqueia rodada vazia em podeCurar — cinto duplo);
--   • só olha a janela [p_from, p_to] — um bug no app não varre fora do mês;
--   • venda com sale_id NULL nunca é candidata (não dá para provar ausência);
--   • TETO NO SQL: mais candidatas que p_teto ⇒ NÃO remove NADA e devolve
--     {bloqueado:true, candidatas:N} — listagem truncada da API viraria
--     remoção em massa; fail-closed é a única resposta certa.
-- Itens caem por CASCADE (FK de monde.venda_item). Devolve o detalhe do que
-- removeu (número/setor/valor ativo) para o log da rodada e para
-- `ingest_control.ultima_remocao` — remoção é auditada, nunca silenciosa.
--
-- service_role-only (padrão de TODA a família monde_ingest_*, 0178): quem
-- chama é a rota de ingestão com admin client; nenhum papel de UI enxerga.
--
-- ⚠️ TIPO: monde.venda.sale_id é UUID (0178:38) — a assinatura usa uuid[] e o
-- PostgREST faz o binding de string[]→uuid[] pela função de input do tipo
-- (achado CRÍTICO do revisor-db: text[] compilaria e estouraria 'operator does
-- not exist: uuid = text' na 1ª chamada real, engolido pelo try/catch da cura —
-- mesma classe do max(uuid) da v5.2.1/0203).
--
-- Verificação pós-push, via REST/service_role (executa o corpo — db query não):
--   1. array vazio (qualquer janela) → {bloqueado:true, removidas:0} — cinto do
--      conjunto vazio;
--   2. janela de ago/26 + array com 1 uuid aleatório → mês inteiro vira
--      candidata → {bloqueado:true} — cinto do TETO. Nada é removido em nenhum.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.monde_ingest_remover_vendas(
  p_espelhaveis_ids uuid[],
  p_from            date,
  p_to              date,
  p_teto            int
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_candidatas uuid[];
  v_detalhe    jsonb;
  v_n          int;
BEGIN
  -- Conjunto provado vazio (ou nulo) não autoriza remoção nenhuma — fail-closed.
  IF p_espelhaveis_ids IS NULL OR COALESCE(array_length(p_espelhaveis_ids, 1), 0) = 0 THEN
    RETURN jsonb_build_object('removidas', 0, 'bloqueado', true, 'candidatas', 0, 'vendas', '[]'::jsonb);
  END IF;

  -- Candidatas: no espelho, dentro da janela, com sale_id, e FORA do conjunto
  -- que a rodada provou espelhável.
  SELECT COALESCE(array_agg(v.sale_id), '{}')
    INTO v_candidatas
  FROM monde.venda v
  WHERE v.data_venda BETWEEN p_from AND p_to
    AND v.sale_id IS NOT NULL
    AND NOT (v.sale_id = ANY(p_espelhaveis_ids));

  IF COALESCE(array_length(v_candidatas, 1), 0) = 0 THEN
    RETURN jsonb_build_object('removidas', 0, 'bloqueado', false, 'candidatas', 0, 'vendas', '[]'::jsonb);
  END IF;

  IF array_length(v_candidatas, 1) > p_teto THEN
    RETURN jsonb_build_object(
      'removidas', 0, 'bloqueado', true,
      'candidatas', array_length(v_candidatas, 1), 'vendas', '[]'::jsonb
    );
  END IF;

  -- Detalhe ANTES de remover (auditoria): o que era, quanto somava.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'sale_id',      v.sale_id,
           'venda_numero', v.venda_numero,
           'data_venda',   v.data_venda,
           'setor_macro',  v.setor_macro,
           'valor_ativo',  COALESCE((
             SELECT SUM(vi.valor_total)
             FROM monde.venda_item vi
             WHERE vi.venda_id = v.id AND vi.status = 'active'
           ), 0)
         )), '[]'::jsonb)
    INTO v_detalhe
  FROM monde.venda v
  WHERE v.sale_id = ANY(v_candidatas)
    AND v.data_venda BETWEEN p_from AND p_to;

  DELETE FROM monde.venda v
  WHERE v.sale_id = ANY(v_candidatas)
    AND v.data_venda BETWEEN p_from AND p_to;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  RETURN jsonb_build_object(
    'removidas', v_n, 'bloqueado', false,
    'candidatas', COALESCE(array_length(v_candidatas, 1), 0), 'vendas', v_detalhe
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.monde_ingest_remover_vendas(uuid[], date, date, int) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.monde_ingest_remover_vendas(uuid[], date, date, int) TO service_role;
