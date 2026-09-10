-- ---------------------------------------------------------------------------
-- 0267 — fix(v5.9.4): promover preserva sale_id (COALESCE) + metas/acompanhamento
-- lê get_executiva_kpis
--
-- DECLARAÇÃO (regime ADITIVO): esta migration é ADITIVA/retrocompatível com a
-- main viva —
--   • dois `CREATE OR REPLACE FUNCTION`, ambos com a MESMA assinatura de hoje
--     (nenhuma troca de parâmetros, nenhum `ALTER`/`DROP`/`RENAME`);
--   • não escreve em nenhum dado pré-existente — os dois corpos só mudam o
--     COMPORTAMENTO de execuções futuras da própria função;
--   • nenhuma outra RPC muda de comportamento: `app.areas_do_setor` (helper
--     compartilhado por 15 RPCs, listadas abaixo) não é tocado — a ampliação
--     de acesso é só no `PERFORM` local de `get_executiva_kpis`;
--   • `REVOKE`/`GRANT` explícitos, redeclarados na forma exata de hoje, sem
--     abrir `anon` em nenhum dos dois casos.
--
-- Nota de classificação: o corpo de `monde_ingest_promover` contém um
-- `DELETE`/`INSERT` (recriação dos itens de vendas mudadas), mas esse DML vive
-- DENTRO do corpo `$function$...$function$` de uma definição de função — o
-- classificador `scripts/db-gate/classificar.mjs` exclui corpos de função da
-- varredura de padrões destrutivos (precedente: migration 0264, linha 12).
-- Esta migration não escreve em dado nenhum por si mesma; ela só troca a
-- DEFINIÇÃO da função, o que é sempre regime aditivo por convenção do projeto.
--
-- MUDANÇA A1 — public.monde_ingest_promover(): no ON CONFLICT (venda_numero)
-- DO UPDATE SET, `sale_id=EXCLUDED.sale_id` vira
-- `sale_id=COALESCE(EXCLUDED.sale_id, d.sale_id)`. Um detalhe da API Monde que
-- chega sem `sale_id` num mês cujo `raw_hash` mudou sobrescrevia o `sale_id`
-- real com NULL — corrupção silenciosa, e NULL nunca é candidata à cura do
-- espelho auto-curativo (v5.6.3, migration 0250/0232, ADR correspondente).
-- Nenhuma outra linha do corpo muda.
--
-- MUDANÇA A2 — public.get_executiva_kpis(...): o `PERFORM
-- app.exigir_acesso(app.areas_do_setor(p_setor))` vira `PERFORM
-- app.exigir_acesso(app.areas_do_setor(p_setor) || ARRAY['metas/acompanhamento']);`.
-- Decisão de produto do Yan (09/09/2026): quem tem só a área
-- `metas/acompanhamento` via "—" nos MetaCards e no Comparativo porque a RPC
-- exigia `performance/<setor>` ou `executiva`; aceito expor o payload
-- executivo do setor a quem tem só Metas.
--
-- Por que a alteração é no PERFORM local e não no helper `app.areas_do_setor`:
-- o helper é compartilhado por 15 RPCs de leitura (todas declaradas na
-- migration 0121): get_mix_produto, get_mix_setor, get_prejuizos,
-- get_ranking_vendedores_range, get_tendencia_margem, get_vendas_em_aberto,
-- get_vendas_receita_negativa, get_decomposicao_variacao,
-- get_historico_12m_setores, get_historico_mensal, get_kpis,
-- get_ranking_produtos, get_ranking_vendedores, get_ritmo_diario e
-- get_executiva_kpis. Ampliar o helper alargaria o acesso das outras 14 RPCs,
-- que ninguém pediu. Assinatura, RETURNS, atributos (SECURITY DEFINER,
-- search_path) e o restante do corpo idênticos ao catálogo vivo.
--
-- Grants de get_executiva_kpis: a definição original (migration 0121, linha
-- 205) concedia também a `anon` — a 0122 ainda a PRESERVAVA na allow-list; quem
-- revogou `anon` de todas as RPCs foi a migration 0133 (bloco M1, fim da janela
-- anônima, ADR-0114). Esta migration REDECLARA sem `anon`.
--
-- DOWN: a última definição anterior de cada função é a migration 0178
-- (monde_ingest_promover, linhas 206-282 — corpo até o RETURN + REVOKE/GRANT) e a migration 0121
-- (get_executiva_kpis, linhas 192-205). Reverter é reaplicar aquelas
-- definições — não há dado a restaurar, pois nenhuma migration de dado foi
-- executada aqui.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.monde_ingest_promover()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_ids   bigint[];
  v_ins   int := 0;
  v_upd   int := 0;
  v_itens int := 0;
  v_total int;
  v_skip  int;
BEGIN
  SELECT count(*) INTO v_total FROM monde.venda_staging;
  IF v_total = 0 THEN
    RETURN jsonb_build_object('ok', true, 'inseridas', 0, 'atualizadas', 0, 'ignoradas', 0, 'itens', 0);
  END IF;

  -- UPSERT das vendas; ON CONFLICT ... WHERE raw_hash mudou → linha igual NÃO é retornada (pula).
  -- xmax=0 distingue INSERT (nova) de UPDATE (mudada). Captura os ids mudados.
  WITH up AS (
    INSERT INTO monde.venda AS d (
      venda_numero, sale_id, data_venda, status, setor_micro, setor_macro, vendedor,
      pagante, pagante_doc, contrato, taxa_servico, operacao_propria,
      total_final_value, total_revenue, raw, raw_hash, sincronizado_em
    )
    SELECT
      s.venda_numero, s.sale_id, s.data_venda, s.status, s.setor_micro, s.setor_macro, s.vendedor,
      s.pagante, s.pagante_doc, s.contrato, s.taxa_servico, s.operacao_propria,
      s.total_final_value, s.total_revenue, s.raw, s.raw_hash, now()
    FROM monde.venda_staging s
    ON CONFLICT (venda_numero) DO UPDATE SET
      sale_id=COALESCE(EXCLUDED.sale_id, d.sale_id), data_venda=EXCLUDED.data_venda, status=EXCLUDED.status,
      setor_micro=EXCLUDED.setor_micro, setor_macro=EXCLUDED.setor_macro, vendedor=EXCLUDED.vendedor,
      pagante=EXCLUDED.pagante, pagante_doc=EXCLUDED.pagante_doc, contrato=EXCLUDED.contrato,
      taxa_servico=EXCLUDED.taxa_servico, operacao_propria=EXCLUDED.operacao_propria,
      total_final_value=EXCLUDED.total_final_value, total_revenue=EXCLUDED.total_revenue,
      raw=EXCLUDED.raw, raw_hash=EXCLUDED.raw_hash, sincronizado_em=now()
    WHERE d.raw_hash IS DISTINCT FROM EXCLUDED.raw_hash
    RETURNING d.id, (xmax = 0) AS inserted
  )
  SELECT
    COALESCE(array_agg(id), '{}'::bigint[]),
    COALESCE(count(*) FILTER (WHERE inserted), 0),
    COALESCE(count(*) FILTER (WHERE NOT inserted), 0)
  INTO v_ids, v_ins, v_upd
  FROM up;

  -- Itens só das vendas mudadas: recria (DELETE então INSERT, ordem garantida).
  IF array_length(v_ids, 1) IS NOT NULL THEN
    DELETE FROM monde.venda_item WHERE venda_id = ANY(v_ids);
    INSERT INTO monde.venda_item (
      venda_id, venda_numero, produto, product_kind, fornecedor, status, canceled_at,
      valor_total, receitas, data_inicio, data_fim, passageiros
    )
    SELECT
      d.id, si.venda_numero, si.produto, si.product_kind, si.fornecedor,
      COALESCE(si.status,'active'), si.canceled_at, si.valor_total, si.receitas,
      si.data_inicio, si.data_fim, si.passageiros
    FROM monde.venda_item_staging si
    JOIN monde.venda d ON d.venda_numero = si.venda_numero
    WHERE d.id = ANY(v_ids);
    GET DIAGNOSTICS v_itens = ROW_COUNT;
  END IF;

  v_skip := v_total - v_ins - v_upd;

  INSERT INTO monde.ingest_control (chave, valor, atualizado_em)
  VALUES ('ultimo_promover', now()::text, now())
  ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = now();

  RETURN jsonb_build_object(
    'ok', true, 'inseridas', v_ins, 'atualizadas', v_upd, 'ignoradas', v_skip, 'itens', v_itens
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.monde_ingest_promover() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.monde_ingest_promover() TO service_role;

CREATE OR REPLACE FUNCTION public.get_executiva_kpis(p_from date, p_to date, p_setor text DEFAULT 'todos'::text, p_ant_from date DEFAULT NULL::date, p_ant_to date DEFAULT NULL::date, p_yoy_from date DEFAULT NULL::date, p_yoy_to date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  PERFORM app.exigir_acesso(app.areas_do_setor(p_setor) || ARRAY['metas/acompanhamento']);
  RETURN public.get_executiva_kpis__nucleo(p_from, p_to, p_setor, p_ant_from, p_ant_to, p_yoy_from, p_yoy_to);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_executiva_kpis(date, date, text, date, date, date, date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_executiva_kpis(date, date, text, date, date, date, date) TO authenticated, service_role;
