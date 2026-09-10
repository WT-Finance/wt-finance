-- ---------------------------------------------------------------------------
-- 0268 — fix(v5.9.5): reverter_diario robusto a múltiplos toques por linha
-- (DESC + comparação sem coluna volátil) + guard de payload duplicado no
-- editor de estrutura do CAIXA
--
-- DECLARAÇÃO (regime ADITIVO): esta migration é ADITIVA/retrocompatível com a
-- main viva —
--   • três `CREATE OR REPLACE FUNCTION`, todos com a MESMA assinatura de hoje
--     (nenhuma troca de parâmetros, nenhum `ALTER`/`DROP`/`RENAME`);
--   • não escreve em nenhum dado pré-existente — os corpos só mudam o
--     COMPORTAMENTO de execuções futuras (reverter só roda quando alguém desfaz;
--     salvar só roda quando alguém salva);
--   • `REVOKE`/`GRANT` explícitos, redeclarados na forma exata de hoje
--     (`reverter_diario` segue sem EXECUTE para nenhum papel da API: só os
--     wrappers SECURITY DEFINER a chamam); `anon` não é aberto em lugar nenhum.
--
-- Os três corpos foram extraídos do CATÁLOGO VIVO (`pg_get_functiondef`,
-- 10/09/2026), não das migrations de origem (0206 / 0208 / 0260) — regra da
-- skill banco-e-rpc. O diff contra o catálogo é só o descrito abaixo.
--
-- ── MUDANÇA 1 — financeiro.reverter_diario(bigint[]) ─────────────────────────
-- Defeito (ADR-0168, achado ALTO do revisor-db na v5.7.0; medido em produção em
-- 09/09/2026: um único lote viola a premissa — `lote_id = 132178`, a aplicação da
-- 0251, 43 toques para 38 linhas): quando um lote toca a MESMA linha mais de uma
-- vez, o desfazer em lote aborta a transação inteira sem reverter nada. Duas
-- camadas:
--   (a) ORDEM. O loop percorria `ORDER BY id` ASC. Numa cadeia de dois toques
--       na mesma linha, a entrada mais antiga é conferida primeiro e o seu
--       `dados_depois` guarda o estado INTERMEDIÁRIO, que não bate com o estado
--       atual → RAISE. Processar em DESC desfaz a cadeia do fim para o começo:
--       cada entrada encontra a linha exatamente como a deixou.
--         U(A→B), U(B→C):  DESC → C≡C, volta a B; B≡B, volta a A.
--         I(→B),  U(B→C):  DESC → volta a B; depois DELETE.
--         U(A→B), D(B→):   DESC → reinsere B; depois volta a A.
--   (b) COLUNA VOLÁTIL — DESC sozinho NÃO basta. `fn_diario_alteracoes` grava a
--       linha inteira (`to_jsonb(NEW)`), inclusive `atualizado_em`; e as três
--       reversões deixam esse carimbo avançar DE PROPÓSITO (o SET do `U` exclui a
--       coluna e o BEFORE trigger carimba now(); o INSERT do `D` a exclui e o
--       DEFAULT carimba). Logo, no segundo passo de qualquer cadeia, a linha volta
--       ao conteúdo certo COM carimbo novo, e comparar a linha inteira contra o
--       `dados_depois` da entrada anterior acusava diferença → RAISE de novo.
--       A checagem de conflito passa a comparar SEM as colunas voláteis
--       (constante única `c_volateis`, hoje só `atualizado_em`), nos ramos I e U.
-- A guarda NÃO afrouxa: alteração real de conteúdo por terceiro continua
-- reprovando (mesmas três mensagens). Deixa de reprovar apenas a linha idêntica
-- com carimbo novo — que nunca foi conflito. Atomicidade preservada: um conflito
-- real derruba a transação inteira, sem reversão parcial. Allowlist estrutural
-- (`::regclass` + trigger anexado), ramos I/U/D, `origem_undo`/`app.diario_undo_de`
-- e o `RETURN v_n` ficam byte-a-byte.
--
-- Nota sobre as listas de colunas do SET (ramo U) e do INSERT (ramo D): elas
-- continuam DIFERENTES de propósito e NÃO são a constante — o SET preserva
-- `id`/`criado_em` da linha viva; o INSERT reinsere `id`/`criado_em` do
-- snapshot. O que as três ocorrências têm em comum é a exclusão de
-- `atualizado_em`, e é só isso que `c_volateis` nomeia.
--
-- Chamadores vivos (a mudança de ordem só importa para quem passa array; quem
-- passa um id só é indiferente): public.dre_estrutura_desfazer_lote/_linha
-- (0206), public.dre_comp_estrutura_desfazer_lote/_linha (0260),
-- public.gerencial_desfazer_lote (0203) e public.gerencial_desfazer_linha (0200).
-- Nenhuma chamada direta no app nem no seed.
--
-- ── MUDANÇA 2 — public.dre_estrutura_salvar(jsonb, timestamptz) (CAIXA) ──────
-- Ganha o guard de `categoria_id` duplicado no payload que a 0260 (competência)
-- já tinha e a 0208 não: a mesma linha duas vezes no mesmo lote é payload
-- AMBÍGUO (cliente confuso), e no `ON CONFLICT DO UPDATE` o último toque venceria
-- em silêncio. Recusar é o comportamento honesto. Roda ANTES do advisory lock e
-- da trava otimista — payload inválido não deve nem entrar na fila.
--
-- ── MUDANÇA 3 — public.dre_comp_estrutura_salvar(jsonb, timestamptz) ─────────
-- Só a JUSTIFICATIVA do guard muda (comentário + mensagem): ele dizia proteger o
-- desfazer, e depois da Mudança 1 isso deixa de ser verdade — migration não passa
-- pela RPC de salvar, então o guard nunca cobriu o caminho que realmente quebrava
-- o undo. O que ele faz é rejeitar payload ambíguo; é isso que passa a dizer,
-- igual ao caixa. Nenhuma lógica muda. (Migration aplicada é registro imutável:
-- a 0260 NÃO é editada; o comentário vive no corpo da função, no catálogo.)
--
-- DOWN (se preciso): reaplicar os corpos anteriores — reverter_diario da 0206
-- (idêntico ao catálogo até esta migration), dre_estrutura_salvar da 0208 e
-- dre_comp_estrutura_salvar da 0260.
-- ---------------------------------------------------------------------------

-- ── 1. financeiro.reverter_diario — DESC + comparação sem coluna volátil ─────
CREATE OR REPLACE FUNCTION financeiro.reverter_diario(p_diario_ids bigint[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  -- Colunas VOLÁTEIS: avançam na própria reversão (BEFORE trigger / DEFAULT now())
  -- e por isso ficam FORA da checagem de conflito. Hoje só o carimbo; se uma tabela
  -- do regime ganhar outro carimbo/token que a reversão não restaura, entra aqui.
  c_volateis  CONSTANT text[] := ARRAY['atualizado_em'];
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
    -- DESC: desfaz do toque mais recente para o mais antigo. Numa cadeia de toques
    -- na MESMA linha dentro do lote, cada entrada encontra a linha exatamente como
    -- a deixou (o `dados_depois` dela é o estado atual) — em ASC a entrada antiga
    -- via um estado intermediário e abortava (0268).
    ORDER BY id DESC
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
      -- Comparação SEM as colunas voláteis: o passo anterior da cadeia (DESC) pode ter
      -- avançado o carimbo ao restaurar o conteúdo — conteúdo igual não é conflito.
      IF v_atual IS NULL THEN
        CONTINUE;                                   -- já removida por outra via → nada a fazer
      ELSIF (v_atual - c_volateis) IS DISTINCT FROM (e.dados_depois - c_volateis) THEN
        RAISE EXCEPTION 'Conflito ao desfazer: a linha % foi alterada por outra pessoa depois desta criação. Recarregue e tente de novo.', v_id;
      END IF;
      EXECUTE format('DELETE FROM %s WHERE id = $1', v_rel) USING v_id;
      v_n := v_n + 1;

    ELSIF e.operacao = 'U' THEN
      -- Desfazer UPDATE = restaurar o "antes", SÓ se a linha existe e continua como ficou
      -- (comparação SEM as colunas voláteis — ver ramo I).
      IF v_atual IS NULL THEN
        RAISE EXCEPTION 'Conflito ao desfazer: a linha % não existe mais (foi excluída depois). Recarregue e tente de novo.', v_id;
      ELSIF (v_atual - c_volateis) IS DISTINCT FROM (e.dados_depois - c_volateis) THEN
        RAISE EXCEPTION 'Conflito ao desfazer: a linha % foi alterada por outra pessoa depois desta edição. Recarregue e tente de novo.', v_id;
      END IF;
      -- SET dinâmico: todas as colunas de negócio (exclui id; criado_em preserva a linha
      -- histórica; atualizado_em fica com o BEFORE trigger — token de trava avança, como na
      -- 0200). Colunas geradas/identity ficam de fora por definição. Esta lista NÃO é
      -- c_volateis de propósito: id/criado_em não são voláteis, só não se restauram aqui.
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
      -- Aqui id/criado_em VOLTAM do snapshot (a linha é a mesma de antes) — por isso esta
      -- lista difere da do SET acima e também não é c_volateis.
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
END $function$;

REVOKE EXECUTE ON FUNCTION financeiro.reverter_diario(BIGINT[]) FROM PUBLIC, anon, authenticated;

-- ── 2. public.dre_estrutura_salvar (CAIXA) — guard de payload duplicado ──────
CREATE OR REPLACE FUNCTION public.dre_estrutura_salvar(p_maps jsonb, p_token timestamp with time zone)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  -- Guard de payload AMBÍGUO (0268, portado da competência/0260): a mesma categoria duas
  -- vezes no mesmo lote é cliente confuso — no ON CONFLICT DO UPDATE abaixo o último toque
  -- venceria em silêncio. Recusar é o comportamento honesto. Hoje a UI não produz duplicata
  -- (cada linha vive em um lugar só), mas um payload construído à mão não deve passar.
  -- (Não é isto que protege o desfazer: reverter_diario aceita múltiplos toques por linha
  -- desde a 0268; migration nem passa por aqui.)
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_maps) AS e(v)
    GROUP BY (e.v->>'categoria_id')
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'DRE_PAYLOAD_INVALIDO: a mesma categoria aparece mais de uma vez no lote.';
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
END $function$;

REVOKE EXECUTE ON FUNCTION public.dre_estrutura_salvar(jsonb, timestamptz) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.dre_estrutura_salvar(jsonb, timestamptz) TO authenticated, service_role;

-- ── 3. public.dre_comp_estrutura_salvar — só a justificativa do guard ────────
CREATE OR REPLACE FUNCTION public.dre_comp_estrutura_salvar(p_maps jsonb, p_token timestamp with time zone)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  item        jsonb;
  v_id        bigint;
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
  IF jsonb_array_length(p_maps) > 1000 THEN
    RAISE EXCEPTION 'DRE_PAYLOAD_INVALIDO: lote grande demais (%). Máximo: 1000 itens.', jsonb_array_length(p_maps);
  END IF;

  -- Guard de payload AMBÍGUO (0260; justificativa reescrita na 0268): a mesma linha duas
  -- vezes no mesmo lote é cliente confuso — no UPDATE abaixo o último toque venceria em
  -- silêncio. Recusar é o comportamento honesto. Hoje a UI não produz duplicata (cada
  -- linha vive em um lugar só), mas um payload construído à mão não deve passar.
  -- (Não é isto que protege o desfazer: reverter_diario aceita múltiplos toques por linha
  -- desde a 0268; migration nem passa por aqui.)
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_maps) AS e(v)
    GROUP BY (e.v->>'categoria_id')
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'DRE_PAYLOAD_INVALIDO: a mesma linha aparece mais de uma vez no lote.';
  END IF;

  -- Mesma trava consultiva do caixa, com nome PRÓPRIO: os dois regimes têm estruturas
  -- independentes e serializar um contra o outro só criaria contenção sem motivo.
  PERFORM pg_advisory_xact_lock(hashtext('financeiro.dre_comp_estrutura_salvar'));

  SELECT greatest(
    (SELECT max(atualizado_em) FROM financeiro.dre_comp_bloco),
    (SELECT max(atualizado_em) FROM financeiro.dre_comp_par)
  ) INTO v_token;

  IF p_token IS NULL OR p_token IS DISTINCT FROM v_token THEN
    RAISE EXCEPTION 'DRE_CONFLITO: a estrutura mudou desde o carregamento. Recarregue e refaça as alterações.';
  END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(p_maps) LOOP
    v_id       := (item->>'categoria_id')::bigint;
    v_bloco    := NULLIF(item->>'bloco_chave', '');
    v_ordem    := COALESCE((item->>'ordem')::int, 0);
    v_excluida := COALESCE((item->>'excluida')::boolean, false);

    IF v_id IS NULL OR NOT EXISTS (SELECT 1 FROM financeiro.dre_comp_par p WHERE p.id = v_id) THEN
      RAISE EXCEPTION 'DRE_CATEGORIA_INVALIDA: linha % inexistente no de-para de competência.',
        COALESCE(v_id::text, 'nula');
    END IF;

    -- Estado coerente (espelha o CHECK, com erro amigável ANTES do constraint)
    IF v_excluida AND v_bloco IS NOT NULL THEN
      RAISE EXCEPTION 'DRE_ESTADO_INVALIDO: a linha % não pode estar excluída E num bloco.', v_id;
    ELSIF NOT v_excluida AND v_bloco IS NULL THEN
      RAISE EXCEPTION 'DRE_ESTADO_INVALIDO: a linha % precisa de um bloco (ou ser excluída).', v_id;
    END IF;

    -- Bloco-destino: precisa existir e ser FOLHA (formula IS NULL). Linha de fórmula
    -- (ROL, LB, LOP, LL, RAIR, REX, REXG, RB_H, DESP_H, ONOP_H, INV_H) é âncora do grafo
    -- de expansão (0257) e não recebe par — recebê-lo faria o valor entrar duas vezes.
    IF v_bloco IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM financeiro.dre_comp_bloco b WHERE b.chave = v_bloco AND b.formula IS NULL
    ) THEN
      RAISE EXCEPTION 'DRE_BLOCO_INVALIDO: "%" não existe ou é linha de fórmula (não recebe linhas).', v_bloco;
    END IF;

    UPDATE financeiro.dre_comp_par p
       SET sub_chave = v_bloco,
           ordem     = v_ordem,
           excluida  = v_excluida
     WHERE p.id = v_id
       -- No-op é pulado: sem UPDATE → sem atualizado_em novo → sem entrada de diário.
       AND (p.sub_chave, p.ordem, p.excluida) IS DISTINCT FROM (v_bloco, v_ordem, v_excluida);

    GET DIAGNOSTICS v_afetadas = ROW_COUNT;
    v_gravadas := v_gravadas + v_afetadas;
  END LOOP;

  RETURN json_build_object(
    'ok', true,
    'gravadas', v_gravadas,
    'token', (
      SELECT greatest(
        (SELECT max(atualizado_em) FROM financeiro.dre_comp_bloco),
        (SELECT max(atualizado_em) FROM financeiro.dre_comp_par)
      )
    )
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.dre_comp_estrutura_salvar(jsonb, timestamptz) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.dre_comp_estrutura_salvar(jsonb, timestamptz) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
