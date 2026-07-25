-- ---------------------------------------------------------------------------
-- 0208 — feat(dre): dre_estrutura_salvar(p_maps, p_token) — salvar em lote do editor
-- v5.3.0 / M5 (DRE Gerencial · Onda 2).
--
-- DECLARAÇÃO (regime aditivo): esta migration é ADITIVA/retrocompatível com a main viva —
--   • CREATE FUNCTION nova; nenhum objeto existente alterado/removido;
--   • escreve APENAS nas tabelas novas da 0204 (dre_bloco não é tocado; só dre_categoria_map),
--     e somente quando um usuário salva no editor — nenhum dado pré-existente de outras
--     tabelas é alterado.
--
-- Padrão do Cadastro de Metas (metas_upsert): o editor edita LOCALMENTE e envia UM lote
-- (array jsonb de {categoria_id, bloco_chave|null, ordem, excluida}) — classificar órfã
-- INSERE no map; mover/reordenar/excluir/reincluir ATUALIZAM. Tudo numa transação = um
-- lote_id no diário (0199, trigger anexado na 0205) → o painel de histórico mostra a
-- ação como UMA entrada, reversível em bloco (0206).
--
-- TRAVA OTIMISTA (receita da 0202, adaptada a estrutura GLOBAL): o token é o
-- greatest(max(atualizado_em)) das duas tabelas, lido pelo dre_estrutura()/get_dre_mensal().
-- Um pg_advisory_xact_lock serializa salvamentos concorrentes (sem ele, dois salvares
-- simultâneos passariam ambos pela checagem do token — TOCTOU); o segundo então falha com
-- DRE_CONFLITO e recarrega. Diferente da 0202 (overloads retrocompatíveis com token NULL),
-- aqui a função é NOVA: token é OBRIGATÓRIO — edição de estrutura sempre viaja com trava.
--
-- No-op não vira ruído: item cujo estado já é o gravado é PULADO (sem UPDATE → sem entrada
-- de diário → o histórico registra só o que de fato mudou; mesma filosofia do metas_upsert).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.dre_estrutura_salvar(p_maps jsonb, p_token timestamptz)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  item        jsonb;
  v_cat       int;
  v_bloco     text;
  v_ordem     int;
  v_excluida  boolean;
  v_token     timestamptz;
  v_gravadas  int := 0;
  v_afetadas  int;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/dre']);

  IF p_maps IS NULL OR jsonb_typeof(p_maps) <> 'array' THEN
    RAISE EXCEPTION 'DRE_PAYLOAD_INVALIDO: esperado um array de alterações.';
  END IF;
  -- Cap defensivo: max_rows do PostgREST não se aplica a INPUT; o de-para inteiro tem
  -- ~200 categorias — 1000 já é ordem de grandeza acima de qualquer lote legítimo.
  IF jsonb_array_length(p_maps) > 1000 THEN
    RAISE EXCEPTION 'DRE_PAYLOAD_INVALIDO: lote grande demais (%). Máximo: 1000 itens.', jsonb_array_length(p_maps);
  END IF;

  -- Serializa salvamentos da estrutura (global): a checagem de token abaixo só é confiável
  -- se dois salvares concorrentes não a executarem ao mesmo tempo.
  PERFORM pg_advisory_xact_lock(hashtext('financeiro.dre_estrutura_salvar'));

  SELECT greatest(
    (SELECT max(atualizado_em) FROM financeiro.dre_bloco),
    (SELECT max(atualizado_em) FROM financeiro.dre_categoria_map)
  ) INTO v_token;

  IF p_token IS NULL OR p_token IS DISTINCT FROM v_token THEN
    RAISE EXCEPTION 'DRE_CONFLITO: a estrutura mudou desde o carregamento. Recarregue e refaça as alterações.';
  END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(p_maps) LOOP
    v_cat      := (item->>'categoria_id')::int;
    v_bloco    := NULLIF(item->>'bloco_chave', '');
    v_ordem    := COALESCE((item->>'ordem')::int, 0);
    v_excluida := COALESCE((item->>'excluida')::boolean, false);

    IF v_cat IS NULL OR NOT EXISTS (SELECT 1 FROM financeiro.dim_categoria dc WHERE dc.id = v_cat) THEN
      RAISE EXCEPTION 'DRE_CATEGORIA_INVALIDA: categoria % inexistente.', COALESCE(v_cat::text, 'nula');
    END IF;

    -- Estado coerente (espelha o CHECK dre_map_estado, com erro amigável ANTES do constraint)
    IF v_excluida AND v_bloco IS NOT NULL THEN
      RAISE EXCEPTION 'DRE_ESTADO_INVALIDO: categoria % não pode estar excluída E num bloco.', v_cat;
    ELSIF NOT v_excluida AND v_bloco IS NULL THEN
      RAISE EXCEPTION 'DRE_ESTADO_INVALIDO: categoria % precisa de um bloco (ou ser excluída).', v_cat;
    END IF;

    -- Bloco-destino: precisa existir e ser AGREGADOR (formula IS NULL) — linha de fórmula
    -- (REPASSE, ROL, …, RB_H/DESP_H/ONOP_H/INV_H) não recebe categoria (âncora do grafo).
    IF v_bloco IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM financeiro.dre_bloco b WHERE b.chave = v_bloco AND b.formula IS NULL
    ) THEN
      RAISE EXCEPTION 'DRE_BLOCO_INVALIDO: "%" não existe ou é linha de fórmula (não recebe categorias).', v_bloco;
    END IF;

    INSERT INTO financeiro.dre_categoria_map AS m (categoria_id, bloco_chave, ordem, excluida)
    VALUES (v_cat, v_bloco, v_ordem, v_excluida)
    ON CONFLICT (categoria_id) DO UPDATE
      SET bloco_chave = EXCLUDED.bloco_chave,
          ordem       = EXCLUDED.ordem,
          excluida    = EXCLUDED.excluida
      -- No-op é pulado: sem UPDATE → sem atualizado_em novo → sem entrada de diário.
      WHERE (m.bloco_chave, m.ordem, m.excluida)
            IS DISTINCT FROM (EXCLUDED.bloco_chave, EXCLUDED.ordem, EXCLUDED.excluida);

    GET DIAGNOSTICS v_afetadas = ROW_COUNT;
    v_gravadas := v_gravadas + v_afetadas;
  END LOOP;

  RETURN json_build_object(
    'ok', true,
    'gravadas', v_gravadas,
    'token', (
      SELECT greatest(
        (SELECT max(atualizado_em) FROM financeiro.dre_bloco),
        (SELECT max(atualizado_em) FROM financeiro.dre_categoria_map)
      )
    )
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.dre_estrutura_salvar(jsonb, timestamptz) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.dre_estrutura_salvar(jsonb, timestamptz) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
