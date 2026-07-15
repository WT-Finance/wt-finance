-- 0183_monde_status_ultima_sincronizacao.sql
-- ADITIVA / retrocompatível com a main viva. O QUE FAZ: CREATE OR REPLACE de
-- public.monde_ingest_status ACRESCENTANDO o campo `ultima_sincronizacao` = timestamp da
-- última SINCRONIZAÇÃO com o Monde — max(atualizado_em) de monde.ingest_control, que avança
-- a cada pull do cron (~15min), mesmo quando nenhuma venda mudou. NÃO altera os campos
-- existentes (inclusive `ultima_sync`); NÃO escreve em dados pré-existentes; só acrescenta
-- uma chave ao jsonb de status. Retrocompatível: consumidores antigos que leem `ultima_sync`
-- seguem funcionando. (v5.1.8 — o rótulo "Última atualização" de /metas e /metas/tv passa a
-- mostrar a última sincronização, não o último dado mudado; ver carregar-acompanhamento.ts.)

CREATE OR REPLACE FUNCTION public.monde_ingest_status()
RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'vendas',               (SELECT count(*) FROM monde.venda),
    'itens',                (SELECT count(*) FROM monde.venda_item),
    'itens_ativos',         (SELECT count(*) FROM monde.venda_item WHERE status = 'active'),
    'min_data',             (SELECT min(data_venda) FROM monde.venda),
    'max_data',             (SELECT max(data_venda) FROM monde.venda),
    'ultima_sync',          (SELECT max(sincronizado_em) FROM monde.venda),
    'ultima_sincronizacao', (SELECT max(atualizado_em) FROM monde.ingest_control
                             WHERE chave IN ('ultimo_incremental', 'ultimo_promover'))
  )
$$;
REVOKE EXECUTE ON FUNCTION public.monde_ingest_status() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.monde_ingest_status() TO service_role;

NOTIFY pgrst, 'reload schema';
