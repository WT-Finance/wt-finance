-- ---------------------------------------------------------------------------
-- 0206 — refactor(diario): reverter_diario GENÉRICO + histórico/undo da estrutura da DRE
-- v5.3.0 / M2 (DRE Gerencial · Onda 2) — primeira promoção do padrão da v5.2.1 (ADR-0155)
-- para fora do Gerencial, como decisão firme do Yan ("diário/undo generalizado DE VERDADE").
--
-- DECLARAÇÃO (regime aditivo): esta migration é ADITIVA/retrocompatível com a main viva —
--   • CREATE OR REPLACE de financeiro.reverter_diario com a MESMA assinatura (bigint[]) e a
--     MESMA semântica para o Gerencial (o hardcode a analytics.gerencial_lancamentos era
--     detalhe INTERNO: cada entrada do diário já carrega sua tabela_alvo; os wrappers
--     gerencial_desfazer_lote/linha já passam ids filtrados pela tabela — seguem INTOCADOS);
--   • CREATE FUNCTION ×4 novas (histórico/undo da estrutura da DRE);
--   • NÃO escreve em dados pré-existentes (reverter só roda quando um usuário desfaz).
--
-- O que muda no núcleo: a restauração deixa de listar colunas hardcoded e passa a ser
-- DINÂMICA (jsonb_populate_record + information_schema), com uma ALLOWLIST estrutural:
-- a tabela-alvo precisa TER o trigger do diário (fn_diario_alteracoes) anexado — reverter
-- em tabela fora do regime de auditoria é negado (fail-closed). Semântica de conflito
-- preservada byte-a-byte: linha mudou depois → exceção amigável, transação aborta.
-- ---------------------------------------------------------------------------

-- ── 1. Núcleo genérico da reversão (substitui o corpo hardcoded da 0200) ────────
CREATE OR REPLACE FUNCTION financeiro.reverter_diario(p_diario_ids BIGINT[])
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  e           financeiro.diario_alteracoes;
  v_rel       regclass;
  v_schema    text;
  v_table     text;
  v_atual     jsonb;
  v_id        bigint;
  v_n         int := 0;
  v_set_list  text;
  v_ins_cols  text;
  v_ins_sel   text;
BEGIN
  FOR e IN
    SELECT * FROM financeiro.diario_alteracoes
    WHERE id = ANY(p_diario_ids)
    ORDER BY id
  LOOP
    -- ALLOWLIST estrutural (fail-closed): só reverte tabela que está NO regime do diário —
    -- i.e., tem o trigger fn_diario_alteracoes anexado. O cast ::regclass também valida o
    -- identificador (nome malicioso/na tabela inexistente falha aqui, nunca vira SQL).
    v_rel := e.tabela_alvo::regclass;
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_trigger t
      WHERE t.tgrelid = v_rel
        AND t.tgfoid  = 'financeiro.fn_diario_alteracoes()'::regprocedure
        AND NOT t.tgisinternal
    ) THEN
      RAISE EXCEPTION 'reverter_diario: a tabela % não está no regime do diário — reversão negada.', e.tabela_alvo;
    END IF;

    v_schema := split_part(e.tabela_alvo, '.', 1);
    v_table  := split_part(e.tabela_alvo, '.', 2);
    -- PK "id" numérica é premissa do trigger genérico (0199); o diário guarda registro_id
    -- como texto. Tabela futura com PK uuid exigirá revisitar este cast (erro claro aqui).
    v_id := (e.registro_id)::bigint;

    EXECUTE format('SELECT to_jsonb(t) FROM %s t WHERE t.id = $1', v_rel)
      INTO v_atual USING v_id;

    IF e.operacao = 'I' THEN
      -- Desfazer INSERT = apagar a linha criada, SE ainda existe e NÃO mudou depois.
      IF v_atual IS NULL THEN
        CONTINUE;                                   -- já removida por outra via → nada a fazer
      ELSIF v_atual IS DISTINCT FROM e.dados_depois THEN
        RAISE EXCEPTION 'Conflito ao desfazer: a linha % foi alterada por outra pessoa depois desta criação. Recarregue e tente de novo.', v_id;
      END IF;
      EXECUTE format('DELETE FROM %s WHERE id = $1', v_rel) USING v_id;
      v_n := v_n + 1;

    ELSIF e.operacao = 'U' THEN
      -- Desfazer UPDATE = restaurar o "antes", SÓ se a linha existe e continua como ficou.
      IF v_atual IS NULL THEN
        RAISE EXCEPTION 'Conflito ao desfazer: a linha % não existe mais (foi excluída depois). Recarregue e tente de novo.', v_id;
      ELSIF v_atual IS DISTINCT FROM e.dados_depois THEN
        RAISE EXCEPTION 'Conflito ao desfazer: a linha % foi alterada por outra pessoa depois desta edição. Recarregue e tente de novo.', v_id;
      END IF;
      -- SET dinâmico: todas as colunas de negócio (exclui id; criado_em preserva a linha
      -- histórica; atualizado_em fica com o BEFORE trigger — token de trava avança, como na
      -- 0200). Colunas geradas/identity ficam de fora por definição.
      SELECT string_agg(format('%I = r.%I', c.column_name, c.column_name), ', ')
        INTO v_set_list
      FROM information_schema.columns c
      WHERE c.table_schema = v_schema AND c.table_name = v_table
        AND c.column_name NOT IN ('id', 'criado_em', 'atualizado_em')
        AND c.is_generated = 'NEVER' AND c.is_identity = 'NO';
      IF v_set_list IS NULL THEN
        RAISE EXCEPTION 'reverter_diario: nenhuma coluna restaurável em %.', e.tabela_alvo;
      END IF;
      EXECUTE format(
        'UPDATE %s t SET %s FROM jsonb_populate_record(NULL::%s, $1) r WHERE t.id = $2',
        v_rel, v_set_list, v_rel
      ) USING e.dados_antes, v_id;
      v_n := v_n + 1;

    ELSE -- 'D'
      -- Desfazer DELETE = reinserir o "antes" com o MESMO id (preserva referências), SÓ se
      -- não existe linha com esse id agora. atualizado_em NÃO volta do snapshot (DEFAULT
      -- now() carimba a restauração — token antigo não volta a "bater"; mesma regra da 0200).
      IF v_atual IS NOT NULL THEN
        RAISE EXCEPTION 'Conflito ao desfazer: já existe uma linha com o id % (recriada depois). Recarregue e tente de novo.', v_id;
      END IF;
      SELECT string_agg(format('%I', c.column_name), ', '),
             string_agg(format('r.%I', c.column_name), ', ')
        INTO v_ins_cols, v_ins_sel
      FROM information_schema.columns c
      WHERE c.table_schema = v_schema AND c.table_name = v_table
        AND c.column_name <> 'atualizado_em'
        AND c.is_generated = 'NEVER' AND c.is_identity = 'NO';
      EXECUTE format(
        'INSERT INTO %s (%s) SELECT %s FROM jsonb_populate_record(NULL::%s, $1) r',
        v_rel, v_ins_cols, v_ins_sel, v_rel
      ) USING e.dados_antes;
      v_n := v_n + 1;
    END IF;
  END LOOP;

  RETURN v_n;
END $$;

-- Privilégios do núcleo: CREATE OR REPLACE preserva as ACLs da 0200, mas o projeto
-- REDECLARA (precedente 0197 — "nunca confiar no implícito").
REVOKE EXECUTE ON FUNCTION financeiro.reverter_diario(BIGINT[]) FROM PUBLIC, anon, authenticated;

-- ── 2. Histórico da ESTRUTURA da DRE (as duas tabelas num histórico só) ──────────
CREATE OR REPLACE FUNCTION public.dre_estrutura_historico_lotes(p_limit INT DEFAULT 50, p_offset INT DEFAULT 0)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/dre']);
  RETURN (
    SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.criado_em DESC), '[]'::json)
    FROM (
      SELECT
        d.lote_id::text                    AS lote_id,
        min(d.criado_em)                   AS criado_em,
        max(d.usuario_id::text)::uuid      AS usuario_id,       -- Postgres não agrega uuid (lição 0203)
        max(d.usuario_nome)                AS usuario_nome,
        count(*)                           AS n_linhas,
        array_agg(DISTINCT d.operacao ORDER BY d.operacao) AS operacoes,
        bool_or(d.origem_undo IS NOT NULL) AS is_undo
      FROM financeiro.diario_alteracoes d
      WHERE d.tabela_alvo IN ('financeiro.dre_bloco', 'financeiro.dre_categoria_map')
      GROUP BY d.lote_id
      ORDER BY min(d.criado_em) DESC
      LIMIT LEAST(p_limit, 500) OFFSET GREATEST(p_offset, 0)
    ) t
  );
END $$;

CREATE OR REPLACE FUNCTION public.dre_estrutura_historico_lote(p_lote BIGINT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/dre']);
  RETURN (
    SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.id), '[]'::json)
    FROM (
      SELECT id, tabela_alvo, operacao, registro_id, dados_antes, dados_depois, usuario_nome,
             criado_em, origem_undo::text AS origem_undo
      FROM financeiro.diario_alteracoes
      WHERE lote_id = p_lote
        AND tabela_alvo IN ('financeiro.dre_bloco', 'financeiro.dre_categoria_map')
    ) t
  );
END $$;

-- ── 3. Desfazer (lote e linha) da estrutura ──────────────────────────────────────
-- Permissões: ação de TERCEIRO → só admin (admin/acessos), como no Gerencial. DIFERENÇA
-- deliberada (documentada no ADR-0156): reversão EM MASSA do PRÓPRIO lote é PERMITIDA —
-- na estrutura, todo salvar-em-lote gera um lote multi-linha (é o fluxo normal do editor),
-- diferente do Gerencial onde massa = import/exclusão em massa (situação de exceção).
CREATE OR REPLACE FUNCTION public.dre_estrutura_desfazer_lote(p_lote BIGINT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_autor uuid;
  v_n     int;
  v_rev   int;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/dre']);
  -- Mesma trava consultiva do dre_estrutura_salvar (0208): um DESFAZER não corre em
  -- paralelo com um SALVAR — sem ela, o UPSERT do salvar em curso poderia sobrescrever
  -- silenciosamente a linha recém-revertida (achado MÉDIO do revisor-db).
  PERFORM pg_advisory_xact_lock(hashtext('financeiro.dre_estrutura_salvar'));
  SELECT max(usuario_id::text)::uuid, count(*) INTO v_autor, v_n
  FROM financeiro.diario_alteracoes
  WHERE lote_id = p_lote
    AND tabela_alvo IN ('financeiro.dre_bloco', 'financeiro.dre_categoria_map');
  IF v_n = 0 THEN RAISE EXCEPTION 'Lote de histórico inexistente.'; END IF;

  IF v_autor IS DISTINCT FROM auth.uid() THEN
    PERFORM app.exigir_acesso(ARRAY['admin/acessos']);
  END IF;

  PERFORM set_config('app.diario_undo_de', p_lote::text, true);  -- undo auditado (0199)
  SELECT financeiro.reverter_diario(
    (SELECT array_agg(id) FROM financeiro.diario_alteracoes
      WHERE lote_id = p_lote
        AND tabela_alvo IN ('financeiro.dre_bloco', 'financeiro.dre_categoria_map'))
  ) INTO v_rev;

  RETURN json_build_object('revertidos', v_rev, 'total', v_n);
END $$;

CREATE OR REPLACE FUNCTION public.dre_estrutura_desfazer_linha(p_diario_id BIGINT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_autor uuid;
  v_lote  bigint;
  v_rev   int;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/dre']);
  PERFORM pg_advisory_xact_lock(hashtext('financeiro.dre_estrutura_salvar'));  -- idem lote
  SELECT usuario_id, lote_id INTO v_autor, v_lote
  FROM financeiro.diario_alteracoes
  WHERE id = p_diario_id
    AND tabela_alvo IN ('financeiro.dre_bloco', 'financeiro.dre_categoria_map');
  IF NOT FOUND THEN RAISE EXCEPTION 'Entrada de histórico inexistente.'; END IF;

  IF v_autor IS DISTINCT FROM auth.uid() THEN
    PERFORM app.exigir_acesso(ARRAY['admin/acessos']);
  END IF;

  PERFORM set_config('app.diario_undo_de', v_lote::text, true);
  SELECT financeiro.reverter_diario(ARRAY[p_diario_id]) INTO v_rev;

  RETURN json_build_object('revertidos', v_rev, 'total', 1);
END $$;

-- ── 4. Privilégios (explícitos, nunca contar com defaults) ───────────────────────
REVOKE EXECUTE ON FUNCTION public.dre_estrutura_historico_lotes(INT, INT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.dre_estrutura_historico_lote(BIGINT)    FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.dre_estrutura_desfazer_lote(BIGINT)     FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.dre_estrutura_desfazer_linha(BIGINT)    FROM PUBLIC, anon;

GRANT  EXECUTE ON FUNCTION public.dre_estrutura_historico_lotes(INT, INT) TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.dre_estrutura_historico_lote(BIGINT)    TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.dre_estrutura_desfazer_lote(BIGINT)     TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.dre_estrutura_desfazer_linha(BIGINT)    TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
