-- 0200 — Histórico + desfazer sobre o diário de alterações (v5.2.1 / M3, ADR-0155)
--
-- ADITIVA: só RPCs NOVAS (born-hardened: exigir_acesso inline + REVOKE PUBLIC/anon +
-- GRANT authenticated/service_role) + uma função interna no schema `financeiro` (não exposto).
-- NÃO altera dado pré-existente. O DESFAZER aplica o INVERSO em transação, com VERIFICAÇÃO de
-- conflito (a linha mudou depois → avisa, NÃO força) e é AUDITADO: cada reversão gera novas
-- entradas no diário (append-only) carimbadas com origem_undo = lote revertido (via GUC
-- transacional app.diario_undo_de, lido pelo trigger da 0199). Reversão de LOTE = atômica
-- (tudo-ou-nada). Permissões: ações próprias unitárias = quem tem financeiro/gerencial; de
-- TERCEIROS ou restauração EM MASSA (lote > 1 linha) = só admin (admin/acessos).

-- ── 1. Leitura: LOTES do histórico (ações agrupadas), mais recentes primeiro ─────
CREATE OR REPLACE FUNCTION public.gerencial_historico_lotes(p_limit INT DEFAULT 50, p_offset INT DEFAULT 0)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/gerencial']);
  RETURN (
    SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.criado_em DESC), '[]'::json)
    FROM (
      SELECT
        d.lote_id::text                     AS lote_id,          -- bigint → text (evita perda de precisão no JSON/JS)
        min(d.criado_em)                     AS criado_em,
        max(d.usuario_id)                    AS usuario_id,       -- um lote = uma transação = um autor
        max(d.usuario_nome)                  AS usuario_nome,
        count(*)                             AS n_linhas,
        array_agg(DISTINCT d.operacao ORDER BY d.operacao) AS operacoes,
        bool_or(d.origem_undo IS NOT NULL)   AS is_undo
      FROM financeiro.diario_alteracoes d
      WHERE d.tabela_alvo = 'analytics.gerencial_lancamentos'
      GROUP BY d.lote_id
      ORDER BY min(d.criado_em) DESC
      LIMIT LEAST(p_limit, 500) OFFSET GREATEST(p_offset, 0)
    ) t
  );
END $$;

-- ── 2. Leitura: DETALHE de um lote (antes/depois por linha) ──────────────────────
CREATE OR REPLACE FUNCTION public.gerencial_historico_lote(p_lote BIGINT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/gerencial']);
  RETURN (
    SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.id), '[]'::json)
    FROM (
      SELECT id, operacao, registro_id, dados_antes, dados_depois, usuario_nome,
             criado_em, origem_undo::text AS origem_undo
      FROM financeiro.diario_alteracoes
      WHERE lote_id = p_lote AND tabela_alvo = 'analytics.gerencial_lancamentos'
    ) t
  );
END $$;

-- ── 3. Núcleo interno da reversão (schema financeiro, NÃO exposto) ───────────────
-- Aplica o inverso de um conjunto de entradas do diário, com verificação de conflito.
-- Levanta exceção amigável em conflito (aborta a transação inteira → nada muda). As escritas
-- daqui disparam o trigger da 0199 → novas entradas de diário (undo auditado); origem_undo vem
-- do GUC app.diario_undo_de que o chamador seta. Retorna a contagem de linhas efetivamente
-- revertidas (entradas já-neutralizadas — ex.: INSERT cujo registro já sumiu — contam como 0).
CREATE OR REPLACE FUNCTION financeiro.reverter_diario(p_diario_ids BIGINT[])
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  e        financeiro.diario_alteracoes;
  v_atual  jsonb;
  v_id     bigint;
  v_n      int := 0;
BEGIN
  FOR e IN
    SELECT * FROM financeiro.diario_alteracoes
    WHERE id = ANY(p_diario_ids) AND tabela_alvo = 'analytics.gerencial_lancamentos'
    ORDER BY id
  LOOP
    v_id := (e.registro_id)::bigint;
    SELECT to_jsonb(g) INTO v_atual FROM analytics.gerencial_lancamentos g WHERE g.id = v_id;

    IF e.operacao = 'I' THEN
      -- Desfazer INSERT = apagar a linha criada, SE ainda existe e NÃO mudou depois.
      IF v_atual IS NULL THEN
        CONTINUE;                                   -- já removida por outra via → nada a fazer
      ELSIF v_atual IS DISTINCT FROM e.dados_depois THEN
        RAISE EXCEPTION 'Conflito ao desfazer: a linha % foi alterada por outra pessoa depois desta criação. Recarregue e tente de novo.', v_id;
      END IF;
      DELETE FROM analytics.gerencial_lancamentos WHERE id = v_id;
      v_n := v_n + 1;

    ELSIF e.operacao = 'U' THEN
      -- Desfazer UPDATE = restaurar o "antes", SÓ se a linha existe e continua como ficou.
      IF v_atual IS NULL THEN
        RAISE EXCEPTION 'Conflito ao desfazer: a linha % não existe mais (foi excluída depois). Recarregue e tente de novo.', v_id;
      ELSIF v_atual IS DISTINCT FROM e.dados_depois THEN
        RAISE EXCEPTION 'Conflito ao desfazer: a linha % foi alterada por outra pessoa depois desta edição. Recarregue e tente de novo.', v_id;
      END IF;
      UPDATE analytics.gerencial_lancamentos SET
        tipo              = e.dados_antes->>'tipo',
        pessoa            = e.dados_antes->>'pessoa',
        valor_final       = (e.dados_antes->>'valor_final')::numeric,
        descricao         = e.dados_antes->>'descricao',
        conta_previsao    = e.dados_antes->>'conta_previsao',
        vencimento        = (e.dados_antes->>'vencimento')::date,
        origem            = e.dados_antes->>'origem',
        destacado         = (e.dados_antes->>'destacado')::boolean,
        importado_em      = (e.dados_antes->>'importado_em')::timestamptz,
        importado_lote_id = (e.dados_antes->>'importado_lote_id')::uuid,
        originador_id     = (e.dados_antes->>'originador_id')::uuid,
        originador_nome   = e.dados_antes->>'originador_nome'
      WHERE id = v_id;
      v_n := v_n + 1;

    ELSE -- 'D'
      -- Desfazer DELETE = reinserir o "antes" com o MESMO id (preserva referências),
      -- SÓ se não existe uma linha com esse id agora (senão conflito).
      IF v_atual IS NOT NULL THEN
        RAISE EXCEPTION 'Conflito ao desfazer: já existe uma linha com o id % (recriada depois). Recarregue e tente de novo.', v_id;
      END IF;
      -- atualizado_em NÃO é copiado do snapshot: o DEFAULT now() carimba o momento da RESTAURAÇÃO.
      -- Assim, um token de trava otimista antigo (de antes da exclusão) NÃO volta a "bater" após um
      -- ciclo excluir→desfazer — quem via a linha antiga é forçado a recarregar. criado_em é
      -- preservado (historicamente a linha é a mesma).
      INSERT INTO analytics.gerencial_lancamentos
        (id, tipo, pessoa, valor_final, descricao, conta_previsao, vencimento, origem,
         importado_em, importado_lote_id, criado_em, destacado, originador_id, originador_nome)
      VALUES (
        (e.dados_antes->>'id')::bigint,
        e.dados_antes->>'tipo',
        e.dados_antes->>'pessoa',
        (e.dados_antes->>'valor_final')::numeric,
        e.dados_antes->>'descricao',
        e.dados_antes->>'conta_previsao',
        (e.dados_antes->>'vencimento')::date,
        e.dados_antes->>'origem',
        (e.dados_antes->>'importado_em')::timestamptz,
        (e.dados_antes->>'importado_lote_id')::uuid,
        (e.dados_antes->>'criado_em')::timestamptz,
        (e.dados_antes->>'destacado')::boolean,
        (e.dados_antes->>'originador_id')::uuid,
        e.dados_antes->>'originador_nome'
      );
      v_n := v_n + 1;
    END IF;
  END LOOP;

  RETURN v_n;
END $$;

-- ── 4. Desfazer um LOTE inteiro (transação atômica) ──────────────────────────────
CREATE OR REPLACE FUNCTION public.gerencial_desfazer_lote(p_lote BIGINT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_autor uuid;
  v_n     int;
  v_rev   int;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/gerencial']);
  SELECT max(usuario_id), count(*) INTO v_autor, v_n
  FROM financeiro.diario_alteracoes
  WHERE lote_id = p_lote AND tabela_alvo = 'analytics.gerencial_lancamentos';
  IF v_n = 0 THEN RAISE EXCEPTION 'Lote de histórico inexistente.'; END IF;

  -- Permissão: restauração EM MASSA (>1 linha) OU ação de TERCEIRO → só admin.
  IF v_n > 1 OR v_autor IS DISTINCT FROM auth.uid() THEN
    PERFORM app.exigir_acesso(ARRAY['admin/acessos']);
  END IF;

  PERFORM set_config('app.diario_undo_de', p_lote::text, true);  -- carimba as novas entradas (undo auditado)
  SELECT financeiro.reverter_diario(
    (SELECT array_agg(id) FROM financeiro.diario_alteracoes
      WHERE lote_id = p_lote AND tabela_alvo = 'analytics.gerencial_lancamentos')
  ) INTO v_rev;

  RETURN json_build_object('revertidos', v_rev, 'total', v_n);
END $$;

-- ── 5. Desfazer UMA linha do histórico (unitário) ────────────────────────────────
CREATE OR REPLACE FUNCTION public.gerencial_desfazer_linha(p_diario_id BIGINT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_autor uuid;
  v_lote  bigint;
  v_rev   int;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/gerencial']);
  SELECT usuario_id, lote_id INTO v_autor, v_lote
  FROM financeiro.diario_alteracoes
  WHERE id = p_diario_id AND tabela_alvo = 'analytics.gerencial_lancamentos';
  IF NOT FOUND THEN RAISE EXCEPTION 'Entrada de histórico inexistente.'; END IF;

  -- Uma linha não é "em massa"; ação de TERCEIRO → só admin, própria → basta a área.
  IF v_autor IS DISTINCT FROM auth.uid() THEN
    PERFORM app.exigir_acesso(ARRAY['admin/acessos']);
  END IF;

  PERFORM set_config('app.diario_undo_de', v_lote::text, true);
  SELECT financeiro.reverter_diario(ARRAY[p_diario_id]) INTO v_rev;

  RETURN json_build_object('revertidos', v_rev, 'total', 1);
END $$;

-- ── 6. Privilégios ───────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.gerencial_historico_lotes(INT, INT)  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.gerencial_historico_lote(BIGINT)     FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.gerencial_desfazer_lote(BIGINT)      FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.gerencial_desfazer_linha(BIGINT)     FROM PUBLIC, anon;
-- Núcleo interno: nunca chamável de fora (schema financeiro não é exposto pelo PostgREST).
REVOKE EXECUTE ON FUNCTION financeiro.reverter_diario(BIGINT[])        FROM PUBLIC, anon, authenticated;

GRANT  EXECUTE ON FUNCTION public.gerencial_historico_lotes(INT, INT)  TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.gerencial_historico_lote(BIGINT)     TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.gerencial_desfazer_lote(BIGINT)      TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.gerencial_desfazer_linha(BIGINT)     TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
