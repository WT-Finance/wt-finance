-- ---------------------------------------------------------------------------
-- 0260 — feat(db): editor da estrutura de COMPETÊNCIA (v5.8.0, M5)
--
-- ADITIVA / retrocompatível:
--   • 1 CREATE TABLE nova + seed por INSERT ... SELECT (nada de UPDATE/DELETE)
--   • 2 CREATE TRIGGER (touch + diário) — DDL aditiva
--   • 7 CREATE FUNCTION novas + 2 CREATE OR REPLACE (view e RPC de leitura)
--   • NADA é removido. `financeiro.dre_comp_map` continua existindo intacta.
--
-- Motivação: o briefing da v5.8.0 dizia "sem editor da árvore nesta versão; curadoria por
-- migration". O Yan pediu o editor, replicando o que existe no Demonstrativo por Fluxo de
-- Caixa. Isto é a camada de dados dele.
--
-- ── Por que uma TABELA NOVA e não um ALTER na `dre_comp_map` ────────────────
-- O editor do caixa tem três estados por linha: CLASSIFICADA (num bloco), na BANDEJA (sem
-- bloco) e EXCLUÍDA (fora do demonstrativo). No caixa isso funciona porque
-- `dre_categoria_map.bloco_chave` é ANULÁVEL e existe um catálogo separado
-- (`dim_categoria`) de onde a bandeja é derivada por `NOT EXISTS`.
--
-- A `dre_comp_map` da 0256 nasceu com `sub_chave NOT NULL` — ela era só a curadoria por
-- migration, onde todo par tem destino por definição. Para o editor, o estado "sem bloco"
-- precisa ser representável.
--
-- O caminho óbvio seria `ALTER TABLE ... ALTER COLUMN sub_chave DROP NOT NULL`. Ele foi
-- REJEITADO por uma razão concreta: o classificador do backup-gate
-- (`scripts/db-gate/classificar.mjs:102`) casa `/ALTER\s+TABLE[\s\S]*DROP/` e classificaria
-- a migration como DESTRUTIVA — e destrutiva exige confirmação humana em TTY, que o agente
-- não alcança por construção (ADR-0131). O regex está CERTO em ser conservador; quem tinha
-- de mudar era o desenho.
--
-- Então `financeiro.dre_comp_par` nasce já com a forma certa: `sub_chave` anulável e o
-- MESMO CHECK de estado do caixa. Ela é ao mesmo tempo o catálogo de pares e o de-para —
-- o que simplifica em relação ao caixa: a bandeja não é `NOT EXISTS` contra outra tabela,
-- é `sub_chave IS NULL`.
--
-- ⚠️ `dre_comp_map` fica ÓRFÃ de leitura a partir daqui (a view e a RPC repontam para
-- `dre_comp_par`), mas NÃO é removida: DROP é destrutiva e exige humano. Fica registrada
-- como dívida no out-briefing. Ela segue sendo a fonte do SEED inicial e o que o teste de
-- paridade `competencia-estrutura.test.ts` confere contra os anexos do briefing.
--
-- ── Provisionamento: é o que faz "par novo cai na bandeja" ser real ─────────
-- `provisionar_dre_comp_par()` insere, com `sub_chave NULL`, todo par presente na base e
-- ausente da tabela. É chamada no FINALIZAR do upload. Sem isso, um par novo apareceria na
-- bandeja da LEITURA (o LEFT JOIN da view garante que nada some) mas não teria linha para
-- o editor classificar.
-- ---------------------------------------------------------------------------

CREATE TABLE financeiro.dre_comp_par (
  id                BIGSERIAL PRIMARY KEY,
  grupo_arquivo     TEXT        NOT NULL,
  descricao_arquivo TEXT        NOT NULL,
  -- ANULÁVEL: NULL = na bandeja (não classificada). É a diferença que motivou esta tabela.
  sub_chave         TEXT        REFERENCES financeiro.dre_comp_bloco (chave),
  rotulo_linha      TEXT        NOT NULL,
  ordem             INT         NOT NULL DEFAULT 0,
  nota_estrela      BOOLEAN     NOT NULL DEFAULT false,
  excluida          BOOLEAN     NOT NULL DEFAULT false,
  atualizado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT dre_comp_par_unico UNIQUE (grupo_arquivo, descricao_arquivo),
  -- Espelha `dre_map_estado` da 0204: excluída NUNCA convive com bloco. Os três estados
  -- válidos são (bloco, não-excluída), (NULL, não-excluída) = bandeja, e (NULL, excluída).
  CONSTRAINT dre_comp_par_estado CHECK (NOT (excluida AND sub_chave IS NOT NULL))
);

CREATE INDEX dre_comp_par_sub_idx ON financeiro.dre_comp_par (sub_chave);

ALTER TABLE financeiro.dre_comp_par ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON financeiro.dre_comp_par FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE financeiro.dre_comp_par_id_seq FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON financeiro.dre_comp_par TO service_role;
GRANT USAGE, SELECT ON SEQUENCE financeiro.dre_comp_par_id_seq TO service_role;

-- ---------------------------------------------------------------------------
-- Seed: a curadoria da 0256, transposta. INSERT ... SELECT (aditivo).
-- ---------------------------------------------------------------------------

INSERT INTO financeiro.dre_comp_par (grupo_arquivo, descricao_arquivo, sub_chave, rotulo_linha, ordem, excluida)
SELECT m.grupo_arquivo, m.descricao_arquivo, m.sub_chave, m.rotulo_linha, m.ordem, m.excluida
FROM financeiro.dre_comp_map m;

-- ---------------------------------------------------------------------------
-- Triggers DEPOIS do seed — o seed não polui o histórico (precedente da 0205).
-- O diário é genérico (0199): exige PK chamada `id`, que esta tabela tem.
-- ---------------------------------------------------------------------------

CREATE TRIGGER trg_touch_dre_comp_bloco
  BEFORE UPDATE ON financeiro.dre_comp_bloco
  FOR EACH ROW EXECUTE FUNCTION financeiro.fn_dre_touch_atualizado_em();
CREATE TRIGGER trg_touch_dre_comp_par
  BEFORE UPDATE ON financeiro.dre_comp_par
  FOR EACH ROW EXECUTE FUNCTION financeiro.fn_dre_touch_atualizado_em();

CREATE TRIGGER trg_diario_dre_comp_bloco
  AFTER INSERT OR UPDATE OR DELETE ON financeiro.dre_comp_bloco
  FOR EACH ROW EXECUTE FUNCTION financeiro.fn_diario_alteracoes();
CREATE TRIGGER trg_diario_dre_comp_par
  AFTER INSERT OR UPDATE OR DELETE ON financeiro.dre_comp_par
  FOR EACH ROW EXECUTE FUNCTION financeiro.fn_diario_alteracoes();

-- ---------------------------------------------------------------------------
-- Provisionamento a partir da base (service_role; chamado no finalizar do upload)
-- ---------------------------------------------------------------------------

-- Alcançável por `authenticated` COM a área da DRE, e não só por service_role. Duas razões:
--   • o EDITOR provisiona ao abrir (ver a nota em `dre_comp_estrutura` abaixo), então ele
--     nunca fica cego para um par que já está na base;
--   • provisionando pela SESSÃO, o diário atribui a inserção a quem abriu a tela, em vez de
--     gravar um lote anônimo. Pelo caminho do upload (service_role) o autor segue nulo — é
--     um evento de sistema, e está certo que apareça como tal.
-- Idempotente por construção (`NOT EXISTS`), então chamar em toda abertura é seguro.
CREATE OR REPLACE FUNCTION public.provisionar_dre_comp_par()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_novos int;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/dre']);

  INSERT INTO financeiro.dre_comp_par (grupo_arquivo, descricao_arquivo, sub_chave, rotulo_linha)
  SELECT DISTINCT r.grupo, r.descricao, NULL, r.descricao
  FROM raw.demonstrativo_competencia r
  WHERE NOT EXISTS (
    SELECT 1 FROM financeiro.dre_comp_par p
    WHERE p.grupo_arquivo = r.grupo AND p.descricao_arquivo = r.descricao
  );
  GET DIAGNOSTICS v_novos = ROW_COUNT;

  RETURN jsonb_build_object(
    'novos', v_novos,
    'total', (SELECT count(*) FROM financeiro.dre_comp_par),
    'bandeja', (SELECT count(*) FROM financeiro.dre_comp_par
                 WHERE sub_chave IS NULL AND NOT excluida)
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.provisionar_dre_comp_par() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.provisionar_dre_comp_par() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Leitura da estrutura para o EDITOR — contrato IDÊNTICO ao `dre_estrutura()` (0204),
-- para o editor de 766 linhas servir aos dois regimes sem adaptação.
--
-- `categoria_id` do payload é o `dre_comp_par.id`. No caixa é o id de `dim_categoria`; aqui
-- não existe categoria de banco, e o id da própria linha do de-para é a identidade estável
-- equivalente. `nome` carrega o GRUPO junto porque três descrições existem sob dois pais
-- (as fusões) — sem o grupo, o editor mostraria duas linhas de nome idêntico.
-- ---------------------------------------------------------------------------

-- ⚠️ A bandeja daqui lê SÓ `dre_comp_par` (`sub_chave IS NULL`), sem o `UNION` contra
-- `raw.demonstrativo_competencia` que a `get_dre_competencia_mensal` faz. Isso é
-- deliberado, e a razão importa: um par sem linha na tabela **não tem id**, e o editor
-- identifica cada linha por id — inventá-lo seria fabricar identidade. A cegueira que esse
-- `UNION` evitaria é resolvida na origem: a PÁGINA do editor chama
-- `provisionar_dre_comp_par()` (idempotente) ANTES de ler, então todo par da base tem linha
-- quando esta RPC responde. Achado MÉDIO do `revisor-db`, resolvido por provisionamento em
-- vez de por leitura tolerante — a leitura tolerante mostraria o par e não deixaria mexer nele.
--
-- `p_ano` alimenta `totais` (id da linha → total do ano). O editor usa esses números só
-- para mostrar o EFEITO nos modais de mover/excluir; sem eles ele funciona com tudo a 0
-- ("categoria sem valor → 0", como o do caixa). NULL = o último ano coberto pela base, que
-- é o recorte que interessa a quem está curando o de-para agora.
CREATE OR REPLACE FUNCTION public.dre_comp_estrutura(p_ano int DEFAULT NULL)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_ano int;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/dre']);

  v_ano := COALESCE(p_ano, (SELECT max(r.ano) FROM raw.demonstrativo_competencia r));

  RETURN json_build_object(
    'ano_totais', v_ano,
    'totais', (
      SELECT COALESCE(json_object_agg(t.id::text, t.total), '{}'::json)
      FROM (
        SELECT p.id, sum(r.valor) AS total
        FROM financeiro.dre_comp_par p
        JOIN raw.demonstrativo_competencia r
          ON r.grupo = p.grupo_arquivo AND r.descricao = p.descricao_arquivo
        WHERE r.ano = v_ano
        GROUP BY p.id
      ) t
    ),
    'token', (
      SELECT greatest(
        (SELECT max(atualizado_em) FROM financeiro.dre_comp_bloco),
        (SELECT max(atualizado_em) FROM financeiro.dre_comp_par)
      )
    ),
    'blocos', (
      SELECT COALESCE(json_agg(json_build_object(
        'chave', b.chave, 'rotulo', b.rotulo, 'tipo', b.tipo,
        'ordem', b.ordem, 'formula', b.formula, 'nota_estrela', false
      ) ORDER BY b.ordem), '[]'::json)
      FROM financeiro.dre_comp_bloco b
    ),
    -- maps = linhas COM destino (ou excluídas). A bandeja sai separada, abaixo.
    'maps', (
      SELECT COALESCE(json_agg(json_build_object(
        'categoria_id', p.id,
        'nome',         p.grupo_arquivo || ' · ' || p.descricao_arquivo,
        'rotulo',       p.rotulo_linha,
        'bloco_chave',  p.sub_chave,
        'ordem',        p.ordem,
        'nota_estrela', p.nota_estrela,
        'excluida',     p.excluida
      ) ORDER BY p.sub_chave NULLS LAST, p.ordem), '[]'::json)
      FROM financeiro.dre_comp_par p
      WHERE p.sub_chave IS NOT NULL OR p.excluida
    ),
    'bandeja', (
      SELECT COALESCE(json_agg(json_build_object(
        'categoria_id', p.id,
        'nome',         p.grupo_arquivo || ' · ' || p.descricao_arquivo,
        'grupo_monde',  p.grupo_arquivo
      ) ORDER BY p.grupo_arquivo, p.descricao_arquivo), '[]'::json)
      FROM financeiro.dre_comp_par p
      WHERE p.sub_chave IS NULL AND NOT p.excluida
    )
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.dre_comp_estrutura(int) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.dre_comp_estrutura(int) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Salvar em lote, com trava otimista — espelho da `dre_estrutura_salvar` (0208).
--
-- Diferença em relação ao caixa: aqui é sempre UPDATE por id (a linha já existe, o
-- provisionamento garante), nunca UPSERT — não há como o editor inventar um par que não
-- esteja na base. Isso também fecha a porta para um par entrar no de-para sem existir no
-- arquivo, que era possível no caixa (upsert por categoria_id).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.dre_comp_estrutura_salvar(p_maps jsonb, p_token timestamptz)
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

  -- Guard que o molde do caixa (0208) NÃO tem, e que protege o DESFAZER: `reverter_diario`
  -- pressupõe UM TOQUE POR LINHA POR LOTE, e tocar a mesma linha duas vezes na mesma
  -- transação faz o undo em lote abortar sem reverter nada (achado ALTO do revisor-db na
  -- v5.7.0, que custou caro). Hoje a UI não produz duplicata — cada linha vive em um lugar
  -- só —, mas o invariante é do BANCO, e um payload construído à mão não deve poder quebrá-lo.
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_maps) AS e(v)
    GROUP BY (e.v->>'categoria_id')
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'DRE_PAYLOAD_INVALIDO: a mesma linha aparece mais de uma vez no lote — isso quebraria o desfazer.';
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

-- ---------------------------------------------------------------------------
-- Histórico e desfazer — wrappers do diário genérico (0199/0206), filtrados nas tabelas
-- de COMPETÊNCIA. Mesmas regras de permissão do caixa (ADR-0156): ação de terceiro exige
-- admin/acessos; reversão em massa do PRÓPRIO lote é permitida, porque salvar-em-lote é o
-- fluxo normal do editor.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.dre_comp_estrutura_historico_lotes(p_limit INT DEFAULT 50, p_offset INT DEFAULT 0)
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
      WHERE d.tabela_alvo IN ('financeiro.dre_comp_bloco', 'financeiro.dre_comp_par')
      GROUP BY d.lote_id
      ORDER BY min(d.criado_em) DESC
      LIMIT LEAST(p_limit, 500) OFFSET GREATEST(p_offset, 0)
    ) t
  );
END $$;

CREATE OR REPLACE FUNCTION public.dre_comp_estrutura_historico_lote(p_lote BIGINT)
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
        AND tabela_alvo IN ('financeiro.dre_comp_bloco', 'financeiro.dre_comp_par')
    ) t
  );
END $$;

CREATE OR REPLACE FUNCTION public.dre_comp_estrutura_desfazer_lote(p_lote BIGINT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_autor uuid;
  v_n     int;
  v_rev   int;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/dre']);
  PERFORM pg_advisory_xact_lock(hashtext('financeiro.dre_comp_estrutura_salvar'));
  SELECT max(usuario_id::text)::uuid, count(*) INTO v_autor, v_n
  FROM financeiro.diario_alteracoes
  WHERE lote_id = p_lote
    AND tabela_alvo IN ('financeiro.dre_comp_bloco', 'financeiro.dre_comp_par');
  IF v_n = 0 THEN RAISE EXCEPTION 'Lote de histórico inexistente.'; END IF;

  IF v_autor IS DISTINCT FROM auth.uid() THEN
    PERFORM app.exigir_acesso(ARRAY['admin/acessos']);
  END IF;

  PERFORM set_config('app.diario_undo_de', p_lote::text, true);
  SELECT financeiro.reverter_diario(
    (SELECT array_agg(id) FROM financeiro.diario_alteracoes
      WHERE lote_id = p_lote
        AND tabela_alvo IN ('financeiro.dre_comp_bloco', 'financeiro.dre_comp_par'))
  ) INTO v_rev;

  RETURN json_build_object('revertidos', v_rev, 'total', v_n);
END $$;

CREATE OR REPLACE FUNCTION public.dre_comp_estrutura_desfazer_linha(p_diario_id BIGINT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_autor uuid;
  v_lote  bigint;
  v_rev   int;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/dre']);
  PERFORM pg_advisory_xact_lock(hashtext('financeiro.dre_comp_estrutura_salvar'));
  SELECT usuario_id, lote_id INTO v_autor, v_lote
  FROM financeiro.diario_alteracoes
  WHERE id = p_diario_id
    AND tabela_alvo IN ('financeiro.dre_comp_bloco', 'financeiro.dre_comp_par');
  IF NOT FOUND THEN RAISE EXCEPTION 'Entrada de histórico inexistente.'; END IF;

  IF v_autor IS DISTINCT FROM auth.uid() THEN
    PERFORM app.exigir_acesso(ARRAY['admin/acessos']);
  END IF;

  PERFORM set_config('app.diario_undo_de', v_lote::text, true);
  SELECT financeiro.reverter_diario(ARRAY[p_diario_id]) INTO v_rev;

  RETURN json_build_object('revertidos', v_rev, 'total', 1);
END $$;

REVOKE EXECUTE ON FUNCTION public.dre_comp_estrutura_historico_lotes(INT, INT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.dre_comp_estrutura_historico_lote(BIGINT)    FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.dre_comp_estrutura_desfazer_lote(BIGINT)     FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.dre_comp_estrutura_desfazer_linha(BIGINT)    FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.dre_comp_estrutura_historico_lotes(INT, INT) TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.dre_comp_estrutura_historico_lote(BIGINT)    TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.dre_comp_estrutura_desfazer_lote(BIGINT)     TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.dre_comp_estrutura_desfazer_linha(BIGINT)    TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Repontar a LEITURA para `dre_comp_par`. Mesmas colunas, na mesma ordem — requisito do
-- CREATE OR REPLACE VIEW.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW financeiro.vw_dre_competencia AS
SELECT
  r.id,
  r.tipo,
  r.grupo,
  r.descricao,
  r.ano,
  r.mes_num,
  r.competencia,
  r.valor,
  p.sub_chave,
  p.rotulo_linha,
  COALESCE(p.excluida, false) AS excluida
FROM raw.demonstrativo_competencia r
LEFT JOIN financeiro.dre_comp_par p
  ON p.grupo_arquivo = r.grupo
 AND p.descricao_arquivo = r.descricao;

-- REDECLARA as ACLs. `CREATE OR REPLACE` as preserva, mas o projeto redeclara por
-- princípio (precedente 0197/0206 — "nunca confiar no implícito"): o dia em que isto virar
-- DROP+CREATE por troca de forma, o default privilege do Supabase abriria `anon` em
-- silêncio. Achado MÉDIO do `revisor-db`.
REVOKE ALL ON financeiro.vw_dre_competencia FROM PUBLIC, anon, authenticated;
GRANT SELECT ON financeiro.vw_dre_competencia TO service_role;

-- ---------------------------------------------------------------------------
-- `get_dre_competencia_mensal` — só o que muda: as linhas exibidas e a BANDEJA passam a
-- sair de `dre_comp_par`, e o `token_estrutura` passa a refletir a tabela editável.
--
-- A bandeja tem DUAS fontes, de propósito: par com linha e `sub_chave IS NULL` (o caso
-- normal, provisionado) UNIÃO par da base SEM linha nenhuma (fail-safe para o intervalo
-- entre um upload e o provisionamento). Nada some em silêncio em nenhum dos dois casos.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_dre_competencia_mensal(p_ano int)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_ult_mes  int;
  v_relacao  text;
  v_mes_corr int;
  v_out      json;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/dre']);

  SELECT max(v.mes_num) INTO v_ult_mes
  FROM financeiro.vw_dre_competencia v
  WHERE v.ano = p_ano;

  IF v_ult_mes IS NULL THEN
    v_relacao := 'futuro';   v_mes_corr := NULL;
  ELSIF v_ult_mes >= 12 THEN
    v_relacao := 'fechado';  v_mes_corr := NULL;
  ELSE
    v_relacao := 'corrente'; v_mes_corr := v_ult_mes;
  END IF;

  WITH dado AS (
    SELECT v.grupo, v.descricao, v.mes_num, v.valor, v.sub_chave, v.rotulo_linha, v.excluida
    FROM financeiro.vw_dre_competencia v
    WHERE v.ano = p_ano
  ),
  classificado AS (
    SELECT d.sub_chave, d.rotulo_linha, d.mes_num, d.valor
    FROM dado d
    WHERE d.sub_chave IS NOT NULL AND NOT d.excluida
  ),
  folha_mes AS (
    SELECT c.sub_chave AS folha, c.mes_num, sum(c.valor) AS valor
    FROM classificado c
    GROUP BY 1, 2
  ),
  bloco_mes AS (
    SELECT e.raiz AS chave, f.mes_num, sum(e.coeficiente * f.valor) AS valor
    FROM financeiro.vw_dre_comp_expansao e
    JOIN folha_mes f ON f.folha = e.folha
    GROUP BY 1, 2
  ),
  linha_mes AS (
    SELECT c.sub_chave, c.rotulo_linha, c.mes_num, sum(c.valor) AS valor
    FROM classificado c
    GROUP BY 1, 2, 3
  ),
  destino AS (
    SELECT p.sub_chave, p.rotulo_linha, min(p.ordem) AS ordem
    FROM financeiro.dre_comp_par p
    WHERE p.sub_chave IS NOT NULL AND NOT p.excluida
    GROUP BY 1, 2
  ),
  bandeja_mes AS (
    SELECT d.grupo, d.descricao, d.mes_num, sum(d.valor) AS valor
    FROM dado d
    WHERE d.sub_chave IS NULL AND NOT d.excluida
    GROUP BY 1, 2, 3
  ),
  linhas AS (
    SELECT b.ordem AS o1, 0 AS o2, 0 AS o3,
           json_build_object(
             't',             b.tipo,
             'chave',         b.chave,
             'rotulo',        b.rotulo,
             'estrela',       false,
             'meses',         (SELECT COALESCE(json_agg(COALESCE(bm.valor, 0) ORDER BY g.m), '[]'::json)
                                 FROM generate_series(1, 12) g(m)
                                 LEFT JOIN bloco_mes bm ON bm.chave = b.chave AND bm.mes_num = g.m),
             'prev_corrente', NULL,
             'venc',          0,
             'total',         COALESCE((SELECT sum(bm.valor) FROM bloco_mes bm WHERE bm.chave = b.chave), 0)
           ) AS linha
    FROM financeiro.dre_comp_bloco b
    UNION ALL
    SELECT b.ordem, 1, dt.ordem,
           json_build_object(
             't',             'cat',
             'g',             dt.sub_chave,
             'chave',         dt.sub_chave || ' · ' || dt.rotulo_linha,
             'rotulo',        dt.rotulo_linha,
             'estrela',       false,
             'meses',         (SELECT COALESCE(json_agg(COALESCE(lm.valor, 0) ORDER BY g.m), '[]'::json)
                                 FROM generate_series(1, 12) g(m)
                                 LEFT JOIN linha_mes lm
                                        ON lm.sub_chave = dt.sub_chave
                                       AND lm.rotulo_linha = dt.rotulo_linha
                                       AND lm.mes_num = g.m),
             'prev_corrente', NULL,
             'venc',          0,
             'total',         COALESCE((SELECT sum(lm.valor) FROM linha_mes lm
                                         WHERE lm.sub_chave = dt.sub_chave
                                           AND lm.rotulo_linha = dt.rotulo_linha), 0)
           )
    FROM destino dt
    JOIN financeiro.dre_comp_bloco b ON b.chave = dt.sub_chave
  ),
  bandeja AS (
    SELECT bm.grupo, bm.descricao,
           json_build_object(
             'chave',         bm.grupo || ' · ' || bm.descricao,
             'rotulo',        bm.descricao,
             'grupo_monde',   bm.grupo,
             'meses',         (SELECT COALESCE(json_agg(COALESCE(b2.valor, 0) ORDER BY g.m), '[]'::json)
                                 FROM generate_series(1, 12) g(m)
                                 LEFT JOIN bandeja_mes b2
                                        ON b2.grupo = bm.grupo AND b2.descricao = bm.descricao
                                       AND b2.mes_num = g.m),
             'prev_corrente', NULL,
             'venc',          0,
             'total',         (SELECT sum(b3.valor) FROM bandeja_mes b3
                                WHERE b3.grupo = bm.grupo AND b3.descricao = bm.descricao)
           ) AS item
    FROM (SELECT DISTINCT grupo, descricao FROM bandeja_mes) bm
  ),
  recon AS (
    SELECT
      COALESCE((SELECT round(sum(d.valor) * 100) FROM dado d), 0)::bigint AS base,
      COALESCE((SELECT round(sum(c.valor) * 100) FROM classificado c), 0)::bigint AS linhas,
      COALESCE((SELECT round(sum(d.valor) * 100) FROM dado d
                 WHERE d.sub_chave IS NULL AND NOT d.excluida), 0)::bigint AS bandeja,
      COALESCE((SELECT round(sum(d.valor) * 100) FROM dado d WHERE d.excluida), 0)::bigint AS excluidas
  )
  SELECT json_build_object(
    'ano',             p_ano,
    'hoje',            (now() AT TIME ZONE 'America/Sao_Paulo')::date,
    'relacao',         v_relacao,
    'mes_corrente',    v_mes_corr,
    'token_estrutura', (SELECT max(x) FROM (
                          SELECT max(atualizado_em) AS x FROM financeiro.dre_comp_bloco
                          UNION ALL
                          SELECT max(atualizado_em)      FROM financeiro.dre_comp_par
                        ) t),
    'linhas',          (SELECT COALESCE(json_agg(l.linha ORDER BY l.o1, l.o2, l.o3), '[]'::json) FROM linhas l),
    'bandeja',         (SELECT COALESCE(json_agg(b.item ORDER BY b.grupo, b.descricao), '[]'::json) FROM bandeja b),
    'anos',            (SELECT COALESCE(json_agg(DISTINCT r.ano ORDER BY r.ano), '[]'::json)
                          FROM raw.demonstrativo_competencia r),
    'cobertura_de',    (SELECT min(r.competencia) FROM raw.demonstrativo_competencia r),
    'cobertura_ate',   (SELECT max(r.competencia) FROM raw.demonstrativo_competencia r),
    'carregado_em',    (SELECT max(r.carregado_em) FROM raw.demonstrativo_competencia r),
    'reconciliacao',   (SELECT json_build_object(
                                 'base_centavos',      rc.base,
                                 'linhas_centavos',    rc.linhas,
                                 'bandeja_centavos',   rc.bandeja,
                                 'excluidas_centavos', rc.excluidas,
                                 'fecha',              rc.base = rc.linhas + rc.bandeja + rc.excluidas)
                          FROM recon rc)
  ) INTO v_out;

  RETURN v_out;
END;
$function$;

-- Idem view: redeclarado por princípio, não por necessidade (0197/0206).
REVOKE EXECUTE ON FUNCTION public.get_dre_competencia_mensal(int) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_dre_competencia_mensal(int) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
