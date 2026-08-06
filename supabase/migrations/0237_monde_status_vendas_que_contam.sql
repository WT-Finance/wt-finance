-- ---------------------------------------------------------------------------
-- 0237 — feat(v5.4.5): `monde_ingest_status` distingue o que ESTÁ no espelho do que CONTA
--
-- DECLARAÇÃO (CLAUDE.md): ADITIVA / retrocompatível com a `main` viva.
--   • Um único `CREATE OR REPLACE FUNCTION` que ACRESCENTA chaves ao jsonb de status.
--     Nenhuma chave existente sai nem muda de significado. Sem DDL de tabela, sem DML,
--     sem agendamento, sem GRANT novo (os do objeto são reafirmados como no padrão).
--   • NÃO toca `monde.venda`, `monde.venda_item`, a mv, as views-compat nem o cron.
--
-- POR QUÊ (v5.4.5): a partir desta versão o `transformSale` grava TAMBÉM os produtos
-- cancelados, e passa a espelhar a venda cujos produtos foram todos cancelados na origem —
-- em vez de descartá-la e deixar a linha velha congelada no espelho (o defeito: 10 vendas,
-- +25,0% na receita de jul/2026). Quem decide o que soma é a `monde.mv_vendas_diarias`, que
-- já filtra `WHERE i.status='active'` desde a 0179.
--
-- CONSEQUÊNCIA QUE ESTA MIGRATION ENDEREÇA: os contadores `vendas` e `itens` do status são
-- crus (`count(*)` sem filtro) e passariam a incluir o que a mv ignora. `vendas` é exibido no
-- cartão "Sincronização Monde" de `admin/uploads` como **"Vendas no espelho"** — ficaria maior
-- que o universo que alimenta Metas e Performance, sem explicação na tela. Um painel de
-- monitoramento que infla sozinho é ruído, e esta versão existe justamente para tirar ruído
-- do alarme.
--
-- O que entra:
--   • `vendas_que_contam`  — vendas com ao menos um item ativo (o universo da mv).
--   • `itens_cancelados`   — passa a existir de verdade; era 0 fixo (47.182 itens, todos ativos).
-- O que fica como estava (retrocompatível): `vendas`, `itens`, `itens_ativos`, `min_data`,
-- `max_data`, `ultima_sync`, `ultima_sincronizacao`, `ultima_reconciliacao`,
-- `reconciliacao_cursor`, `ingest_em_curso`, `tripwire`.
--
-- Fail-safe do `tripwire` PRESERVADO da 0232: a leitura fica dentro de BEGIN/EXCEPTION porque
-- /metas depende desta RPC para o rótulo "Última atualização" (`lib/metas/ultima-sincronizacao.ts`)
-- e um valor malformado na chave de controle não pode derrubar o status da tela.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.monde_ingest_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tripwire jsonb;
BEGIN
  BEGIN
    SELECT valor::jsonb INTO v_tripwire
    FROM monde.ingest_control WHERE chave = 'tripwire';
  EXCEPTION WHEN others THEN
    v_tripwire := NULL;
  END;

  RETURN jsonb_build_object(
    'vendas',               (SELECT count(*) FROM monde.venda),
    -- v5.4.5: o universo que a mv soma. Diverge de `vendas` quando a origem cancela todos os
    -- produtos de uma venda — ela continua espelhada (auditável) e deixa de contar.
    'vendas_que_contam',    (SELECT count(*) FROM monde.venda v
                             WHERE EXISTS (SELECT 1 FROM monde.venda_item i
                                           WHERE i.venda_id = v.id AND i.status = 'active')),
    'itens',                (SELECT count(*) FROM monde.venda_item),
    'itens_ativos',         (SELECT count(*) FROM monde.venda_item WHERE status = 'active'),
    -- v5.4.5: passa a ser > 0. Antes desta versão o cancelado era descartado na escrita.
    'itens_cancelados',     (SELECT count(*) FROM monde.venda_item WHERE status <> 'active'),
    'min_data',             (SELECT min(data_venda) FROM monde.venda),
    'max_data',             (SELECT max(data_venda) FROM monde.venda),
    'ultima_sync',          (SELECT max(sincronizado_em) FROM monde.venda),
    'ultima_sincronizacao', (SELECT max(atualizado_em) FROM monde.ingest_control
                             WHERE chave = 'ultimo_incremental'),
    'ultima_reconciliacao', (SELECT max(atualizado_em) FROM monde.ingest_control
                             WHERE chave = 'ultima_reconciliacao'),
    'reconciliacao_cursor', (SELECT valor FROM monde.ingest_control
                             WHERE chave = 'reconciliacao_cursor'),
    'ingest_em_curso',      (SELECT jsonb_build_object('dono', valor, 'desde', atualizado_em)
                             FROM monde.ingest_control WHERE chave = 'ingest_em_curso'),
    'tripwire',             v_tripwire
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.monde_ingest_status() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.monde_ingest_status() TO service_role;

NOTIFY pgrst, 'reload schema';

-- ⚠️ O bloco DOWN abaixo usa comentário de LINHA (`--`), não de bloco: a 1ª aplicação da 0236
--    morreu porque uma expressão de cron dentro de `/* */` fechou o comentário no meio. Aqui não
--    há cron, mas a convenção fica — é barata e o erro custou uma aplicação.
--
-- ===========================================================================
-- DOWN (reversão explícita) — aplicar como migration NOVA para reverter.
-- Restaura o corpo exatamente como a 0232 o deixou (sem `vendas_que_contam` e
-- `itens_cancelados`). Nenhum dado é tocado por esta migration, então isto basta.
-- ⚠️ Reverter só o status NÃO reverte o comportamento do `transformSale` — os itens cancelados
--    continuariam sendo gravados, e aí `vendas` volta a inflar no cartão. Reverta o código junto.
-- ---------------------------------------------------------------------------
-- CREATE OR REPLACE FUNCTION public.monde_ingest_status()
-- RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
-- AS $$
-- DECLARE v_tripwire jsonb;
-- BEGIN
--   BEGIN
--     SELECT valor::jsonb INTO v_tripwire FROM monde.ingest_control WHERE chave = 'tripwire';
--   EXCEPTION WHEN others THEN v_tripwire := NULL;
--   END;
--   RETURN jsonb_build_object(
--     'vendas',               (SELECT count(*) FROM monde.venda),
--     'itens',                (SELECT count(*) FROM monde.venda_item),
--     'itens_ativos',         (SELECT count(*) FROM monde.venda_item WHERE status = 'active'),
--     'min_data',             (SELECT min(data_venda) FROM monde.venda),
--     'max_data',             (SELECT max(data_venda) FROM monde.venda),
--     'ultima_sync',          (SELECT max(sincronizado_em) FROM monde.venda),
--     'ultima_sincronizacao', (SELECT max(atualizado_em) FROM monde.ingest_control
--                              WHERE chave = 'ultimo_incremental'),
--     'ultima_reconciliacao', (SELECT max(atualizado_em) FROM monde.ingest_control
--                              WHERE chave = 'ultima_reconciliacao'),
--     'reconciliacao_cursor', (SELECT valor FROM monde.ingest_control
--                              WHERE chave = 'reconciliacao_cursor'),
--     'ingest_em_curso',      (SELECT jsonb_build_object('dono', valor, 'desde', atualizado_em)
--                              FROM monde.ingest_control WHERE chave = 'ingest_em_curso'),
--     'tripwire',             v_tripwire
--   );
-- END;
-- $$;
-- REVOKE EXECUTE ON FUNCTION public.monde_ingest_status() FROM PUBLIC, anon, authenticated;
-- GRANT  EXECUTE ON FUNCTION public.monde_ingest_status() TO service_role;
-- NOTIFY pgrst, 'reload schema';
-- ===========================================================================
