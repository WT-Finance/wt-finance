-- ---------------------------------------------------------------------------
-- 0306 — feat(v6.5.1/M3): DRE de caixa por centro de custo — identificação dos recebíveis antecipados
--        e a leitura `get_dre_caixa_centro(p_ano, p_ajuste)`
--
-- Classificação: ADITIVA (CREATE TABLE nova + seed dela + 1 função NOVA + REVOKE/GRANT + guard).
--
-- DECLARAÇÃO PRÉVIA (regime aditivo / autônomo):
--   • O QUE FAZ (briefing v6.5.1 §3.3–3.4, §7; contrato do front em src/lib/dre-centro/tipos.ts):
--     (1) `financeiro.antecipacao_conta_monde` — de-para FIXO e NOMEADO (decisão D3) da conta do registro de
--         antecipações para a conta bancária do Monde, com a antecedência mínima de cada uma (constante de
--         regra, §3.3): Asaas (1) → ASAAS (8), mais de 2 dias; Blimboo (2) → Blimboo (7), mais de 7 dias.
--         `CC ASAAS` e a conta composta ficam FORA. Conta do registro sem de-para = antecipação não
--         identificada, nomeada na nota — nunca casamento por aproximação. Mudar é decisão de produto.
--     (2) `public.get_dre_caixa_centro(p_ano int, p_ajuste boolean DEFAULT true) RETURNS json` — leitura pura,
--         `app.exigir_acesso('financeiro/dre')` inline (a área da DRE de caixa, inv. 10). Devolve:
--           • `arvores` — por centro (financeiro.centro_custo), as MESMAS linhas da visão Empresa
--             (dre_bloco + dre_categoria_map vivos, mesma fonte `financeiro.fato_fluxo` realizado — inv. 2),
--             realizado mês a mês, cada linha do fato repartida pelo rateio do Número
--             (financeiro.centro_custo_rateio; Número sem rateio = Sem centro, peso 1). Com `p_ajuste`:
--             os recebíveis antecipados identificados voltam ao mês do VENCIMENTO (fração antecipada, no
--             centro dono) e a categoria de taxa de antecipação sai da árvore (vai ao bloco de antecipação).
--           • `recebiveis` — dono × mês da antecipação × mês do vencimento (13+ = ano seguinte), o insumo da
--             atribuição (§3.4), que é aritmética sobre agregados e roda no módulo puro do front
--             (src/lib/dre-centro/atribuicao.ts, testado contra o protótipo).
--           • `taxa_monde` — taxa de antecipação lançada no Monde, por centro (em que foi lançada) e mês.
--           • `eventos` — cada antecipação do registro do ano: identificado, nº de recebíveis, taxa do
--             registro × taxa do Monde associada, motivo quando não identifica tudo.
--           • `cobertura` (Σ |valor| movimentado e a parte Sem centro), `anos_com_centro`, e os carimbos
--             `centro_carregado_em` / `antecipacoes_atualizado_em`.
--         Sem `p_ajuste` (modo de TESTE, inv. 1): nada é deslocado, a taxa fica na árvore e os recebíveis/taxa
--         saem vazios — a soma dos centros é a visão Empresa LINHA A LINHA. É o que separa o rateio do ajuste.
--   • A REGRA DE IDENTIFICAÇÃO (§3.3), reproduzida contra o protótipo de 06/11 (16/16 antecipações e
--     3.186/3.186 recebíveis iguais, por engenharia reversa com as fixtures do mesmo dia):
--       recebível  = Σ das linhas de "Receita de Vendas" (grupo do Monde) POSITIVAS de um Número, por data de
--                    movimentação e vencimento, na conta do de-para;
--       janela     = movimentação de 1 dia ANTES a 2 dias DEPOIS da data do registro;
--       antecedência (vencimento − movimentação) > mínimo da conta;
--       preenchimento = maior antecedência, depois maior valor, depois Número (COLLATE "C") até completar o
--                    valor antecipado; o último entra pela fração que falta;
--       ordem      = antecipações em ordem cronológica (data, id); cada recebível entra em UMA só;
--       taxa Monde = linhas da categoria de taxa (id 38, M0/Q3) da mesma conta e janela; cada linha vai à
--                    antecipação MAIS ANTIGA cuja janela a contém (as de 08/04 e 09/04 se sobrepõem).
--     Constantes nomeadas no corpo (c_janela_antes, c_janela_depois, c_grupo_receita, c_cat_taxa) e no
--     de-para (antecedência por conta). Mudar uma delas é decisão de produto (inv. 8).
--   • ADITIVA / RETROCOMPATÍVEL: nenhuma função existente muda; `get_dre_mensal`, `dre_categoria_map`, o
--     editor e o registro de antecipações ficam intocados (inv. 9). NÃO ESCREVE em dado pré-existente: o único
--     INSERT de nível de migration é o seed da tabela NOVA; tudo o mais da função vive em tabelas TEMP da
--     própria chamada.
--   • RBAC/GRANT: SECURITY DEFINER + search_path vazio + `app.exigir_acesso` na 1ª linha; REVOKE de
--     PUBLIC/anon; GRANT a authenticated, service_role e — deliberado, por assinatura (inv. 11) — ao
--     `verificador` (o caso de contrato está em src/lib/rpc-contrato.test.ts). A tabela nova não tem GRANT.
--   • PII: nenhuma coluna com nome de pessoa é lida ou devolvida (fato_fluxo.pessoa/descricao não entram).
--   • ORÇAMENTO: authenticated = 8 s. Medido no ensaio revertido (ver o out-briefing): a chamada roda em
--     temp tables sobre ~36 mil linhas realizadas do ano e ~16 antecipações.
--
-- Pós-aplicação (orquestrador): `npm run db:baseline`; regenerar `src/types/database.ts`; rodar
-- `scripts/credencial/derivar-allowlist.mjs verificador` e conferir a assinatura nova; verificar por REST.
--
-- DOWN (destrutivo — humano em TTY):
--   -- DROP FUNCTION public.get_dre_caixa_centro(integer, boolean);
--   -- DROP TABLE financeiro.antecipacao_conta_monde;
-- ---------------------------------------------------------------------------

BEGIN;

-- ── 1. De-para conta do registro → conta do Monde (D3) ──────────────────────────────────
CREATE TABLE financeiro.antecipacao_conta_monde (
  antecipacao_conta_id   SMALLINT PRIMARY KEY REFERENCES financeiro.antecipacao_conta (id),
  conta_bancaria_id      INT      NOT NULL UNIQUE REFERENCES financeiro.dim_conta_bancaria (id),
  antecedencia_min_dias  INT      NOT NULL,
  CONSTRAINT antecipacao_conta_monde_antecedencia CHECK (antecedencia_min_dias >= 0)
);

INSERT INTO financeiro.antecipacao_conta_monde (antecipacao_conta_id, conta_bancaria_id, antecedencia_min_dias) VALUES
  (1, 8, 2),   -- Asaas   → ASAAS   — recebimento normal cai no vencimento (mediana 0 dia)
  (2, 7, 7);   -- Blimboo → Blimboo — recebimento normal chega até 7 dias antes em 90% dos casos

COMMENT ON TABLE financeiro.antecipacao_conta_monde IS
  'v6.5.1 (0306, decisão D3): de-para fixo da conta do registro de antecipações para a conta bancária do Monde, com a antecedência mínima (dias, estrito) que marca um recebível como antecipado. Conta do registro sem linha aqui = antecipação não identificada. Mudar é decisão de produto.';

ALTER TABLE financeiro.antecipacao_conta_monde ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON financeiro.antecipacao_conta_monde FROM PUBLIC, anon, authenticated;

-- ── 2. A leitura ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_dre_caixa_centro(p_ano integer, p_ajuste boolean DEFAULT true)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  -- Regras da identificação (§3.3) — constantes NOMEADAS; mudar é decisão de produto.
  c_janela_antes   CONSTANT int  := 1;                    -- dias ANTES da data do registro
  c_janela_depois  CONSTANT int  := 2;                    -- dias DEPOIS (o Monde registra o dia em que o dinheiro caiu)
  c_grupo_receita  CONSTANT text := 'Receita de Vendas';  -- grupo do Monde dos candidatos (M0/Q4)
  c_cat_taxa       CONSTANT int  := 38;                   -- dim_categoria "Taxa de Antecipação" (M0/Q3)

  v_hoje      date := current_date;
  v_rel       text;
  v_mes       int;
  v_zeros     numeric[] := ARRAY(SELECT 0::numeric FROM generate_series(1, 12));
  e           record;
  c           record;
  b           record;
  v_falta     numeric;
  v_v         numeric;
  v_n         int;
  v_taxa      numeric;
  v_taxa_ids  bigint[];
  v_res       json;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/dre']);

  IF p_ano IS NULL OR p_ano < 2000 OR p_ano > 2100 THEN
    RAISE EXCEPTION 'Ano inválido.';
  END IF;
  p_ajuste := coalesce(p_ajuste, true);

  v_rel := CASE
    WHEN p_ano < extract(year FROM v_hoje)::int THEN 'fechado'
    WHEN p_ano = extract(year FROM v_hoje)::int THEN 'corrente'
    ELSE 'futuro'
  END;
  v_mes := CASE WHEN v_rel = 'corrente' THEN extract(month FROM v_hoje)::int END;

  DROP TABLE IF EXISTS _cc_fato, _cc_parte, _cc_usado, _cc_taxa_usada, _cc_receb, _cc_evento,
                       _cc_val, _cc_agg, _cc_cat, _cc_bloco;

  -- ── Realizado do ano: a MESMA fonte e o MESMO predicado do Realizado de get_dre_mensal (inv. 2) ──
  CREATE TEMP TABLE _cc_fato ON COMMIT DROP AS
  SELECT f.id, f.numero, f.categoria_id, f.conta_bancaria_id,
         f.data_competencia AS mov, f.vencimento, f.valor,
         extract(month FROM f.data_competencia)::int AS m,
         dc.grupo_categoria AS grupo
    FROM financeiro.fato_fluxo f
    LEFT JOIN financeiro.dim_categoria dc ON dc.id = f.categoria_id
   WHERE f.tipo = 'realizado'
     AND f.data_competencia >= make_date(p_ano, 1, 1)
     AND f.data_competencia <  make_date(p_ano + 1, 1, 1);
  CREATE INDEX ON _cc_fato (conta_bancaria_id, mov);
  CREATE INDEX ON _cc_fato (id);

  -- Cada linha do fato × centro pelo rateio do Número (Σ pesos = 1 por Número, 0304). Sem rateio = Sem centro.
  CREATE TEMP TABLE _cc_parte ON COMMIT DROP AS
  SELECT f.id, coalesce(r.centro, 'sem_centro') AS centro, coalesce(r.peso, 1::numeric) AS peso
    FROM _cc_fato f
    LEFT JOIN financeiro.centro_custo_rateio r ON r.numero = f.numero;
  CREATE INDEX ON _cc_parte (id);
  ANALYZE _cc_fato;    -- CTAS nasce sem estatística: margem para quando o fato crescer (B5)
  ANALYZE _cc_parte;

  -- ── Identificação dos recebíveis antecipados (§3.3) ─────────────────────────────────────
  CREATE TEMP TABLE _cc_usado      (fato_id bigint PRIMARY KEY) ON COMMIT DROP;
  CREATE TEMP TABLE _cc_taxa_usada (fato_id bigint PRIMARY KEY) ON COMMIT DROP;
  CREATE TEMP TABLE _cc_receb (
    evento_id bigint, numero text, mov date, venc date, valor numeric, fracao numeric, ids bigint[]
  ) ON COMMIT DROP;
  CREATE TEMP TABLE _cc_evento (
    id bigint, data date, conta text, valor numeric, taxa_registro numeric,
    identificado numeric, n_recebiveis int, taxa_monde numeric, motivo text
  ) ON COMMIT DROP;

  FOR e IN
    SELECT a.id, a.data, a.valor_antecipado, coalesce(a.desconto, 0) AS desconto, ac.nome AS conta,
           dp.conta_bancaria_id, dp.antecedencia_min_dias
      FROM financeiro.antecipacao a
      JOIN financeiro.antecipacao_conta ac ON ac.id = a.conta_id
      LEFT JOIN financeiro.antecipacao_conta_monde dp ON dp.antecipacao_conta_id = a.conta_id
     WHERE a.data >= make_date(p_ano, 1, 1) AND a.data < make_date(p_ano + 1, 1, 1)
     ORDER BY a.data, a.id
  LOOP
    v_falta := e.valor_antecipado;
    v_n := 0;
    v_taxa := 0;
    IF e.conta_bancaria_id IS NOT NULL THEN
      FOR c IN
        SELECT f.numero, f.mov, f.vencimento AS venc, sum(f.valor) AS valor, array_agg(f.id) AS ids
          FROM _cc_fato f
         WHERE f.grupo = c_grupo_receita
           AND f.valor > 0
           AND f.numero IS NOT NULL
           AND f.conta_bancaria_id = e.conta_bancaria_id
           -- Só categoria que está NA ÁRVORE: um recebível de categoria na bandeja/excluída seria
           -- deslocado fora da árvore e quebraria Σ Resultado de caixa ≡ REX (revisor-db M2).
           AND EXISTS (SELECT 1 FROM financeiro.dre_categoria_map mp
                        WHERE mp.categoria_id = f.categoria_id AND NOT mp.excluida)
           AND f.mov BETWEEN e.data - c_janela_antes AND e.data + c_janela_depois
           AND f.vencimento IS NOT NULL
           AND f.vencimento - f.mov > e.antecedencia_min_dias
           AND NOT EXISTS (SELECT 1 FROM _cc_usado u WHERE u.fato_id = f.id)
         GROUP BY f.numero, f.mov, f.vencimento
         -- Desempate TOTAL (revisor-db M3): o mesmo Número pode ter dois grupos com a mesma
         -- antecedência e a mesma soma em datas diferentes.
         ORDER BY (f.vencimento - f.mov) DESC, sum(f.valor) DESC, f.numero COLLATE "C", f.mov, f.vencimento
      LOOP
        EXIT WHEN v_falta <= 0;
        v_v := least(c.valor, v_falta);
        INSERT INTO _cc_receb VALUES (e.id, c.numero, c.mov, c.venc, c.valor, v_v / c.valor, c.ids);
        INSERT INTO _cc_usado SELECT unnest(c.ids);
        v_falta := v_falta - v_v;
        v_n := v_n + 1;
      END LOOP;

      -- Taxa do Monde desta antecipação: mesma conta e janela; a linha fica com a antecipação mais antiga.
      SELECT coalesce(sum(f.valor), 0), array_agg(f.id)
        INTO v_taxa, v_taxa_ids
        FROM _cc_fato f
       WHERE f.categoria_id = c_cat_taxa
         AND f.conta_bancaria_id = e.conta_bancaria_id
         AND f.mov BETWEEN e.data - c_janela_antes AND e.data + c_janela_depois
         AND NOT EXISTS (SELECT 1 FROM _cc_taxa_usada t WHERE t.fato_id = f.id);
      IF v_taxa_ids IS NOT NULL THEN
        INSERT INTO _cc_taxa_usada SELECT unnest(v_taxa_ids);
      END IF;
    END IF;

    INSERT INTO _cc_evento VALUES (
      e.id, e.data, e.conta, e.valor_antecipado, -e.desconto,
      e.valor_antecipado - greatest(v_falta, 0), v_n, v_taxa,
      CASE
        WHEN e.conta_bancaria_id IS NULL THEN 'conta sem de-para com o Monde'
        WHEN v_falta > 0.005 THEN 'recebíveis não encontrados nos recebimentos da conta'
      END
    );
  END LOOP;

  -- ── Valores por (centro, categoria, mês) ────────────────────────────────────────────────
  CREATE TEMP TABLE _cc_val (centro text, categoria_id int, m int, v numeric) ON COMMIT DROP;
  INSERT INTO _cc_val
  SELECT p.centro, f.categoria_id, f.m, f.valor * p.peso
    FROM _cc_fato f JOIN _cc_parte p ON p.id = f.id
   WHERE NOT p_ajuste OR f.categoria_id IS DISTINCT FROM c_cat_taxa;   -- sem NULL em comparação (B3)

  IF p_ajuste THEN
    -- O recebível antecipado sai do mês em que o dinheiro caiu…
    INSERT INTO _cc_val
    SELECT p.centro, f.categoria_id, f.m, -(f.valor * r.fracao * p.peso)
      FROM _cc_receb r
      CROSS JOIN LATERAL unnest(r.ids) AS u(id)
      JOIN _cc_fato f ON f.id = u.id
      JOIN _cc_parte p ON p.id = f.id;
    -- …e volta ao mês do vencimento original, no mesmo centro dono (se o vencimento cai no ano).
    INSERT INTO _cc_val
    SELECT p.centro, f.categoria_id, extract(month FROM r.venc)::int, f.valor * r.fracao * p.peso
      FROM _cc_receb r
      CROSS JOIN LATERAL unnest(r.ids) AS u(id)
      JOIN _cc_fato f ON f.id = u.id
      JOIN _cc_parte p ON p.id = f.id
     WHERE extract(year FROM r.venc)::int = p_ano;
  END IF;

  CREATE TEMP TABLE _cc_agg ON COMMIT DROP AS
  SELECT centro, categoria_id, m, sum(v) AS v FROM _cc_val GROUP BY 1, 2, 3;

  -- Categorias por centro: as MESMAS do mapa vivo (sem as excluídas), 12 meses.
  CREATE TEMP TABLE _cc_cat ON COMMIT DROP AS
  SELECT ce.id AS centro, mp.categoria_id,
         array_agg(coalesce(a.v, 0) ORDER BY i.i)::numeric[] AS r
    FROM financeiro.centro_custo ce
    CROSS JOIN financeiro.dre_categoria_map mp
    CROSS JOIN generate_series(1, 12) AS i(i)
    LEFT JOIN _cc_agg a ON a.centro = ce.id AND a.categoria_id = mp.categoria_id AND a.m = i.i
   WHERE NOT mp.excluida
   GROUP BY ce.id, mp.categoria_id;

  -- Blocos: folhas (Σ das categorias) e, na ordem, os de fórmula — a MESMA mecânica de get_dre_mensal.
  CREATE TEMP TABLE _cc_bloco (centro text, chave text, r numeric[], PRIMARY KEY (centro, chave)) ON COMMIT DROP;
  INSERT INTO _cc_bloco (centro, chave, r)
  SELECT ce.id, g.bloco_chave, array_agg(coalesce(s.v, 0) ORDER BY i.i)::numeric[]
    FROM financeiro.centro_custo ce
    CROSS JOIN (SELECT DISTINCT bloco_chave FROM financeiro.dre_categoria_map WHERE NOT excluida) g
    CROSS JOIN generate_series(1, 12) AS i(i)
    LEFT JOIN LATERAL (
      SELECT sum(cc.r[i.i]) AS v
        FROM _cc_cat cc
        JOIN financeiro.dre_categoria_map mp ON mp.categoria_id = cc.categoria_id
       WHERE cc.centro = ce.id AND mp.bloco_chave = g.bloco_chave AND NOT mp.excluida
    ) s ON true
   GROUP BY ce.id, g.bloco_chave;

  FOR b IN SELECT chave, formula FROM financeiro.dre_bloco WHERE formula IS NOT NULL ORDER BY ordem
  LOOP
    INSERT INTO _cc_bloco (centro, chave, r)
    SELECT ce.id, b.chave, array_agg(coalesce(s.v, 0) ORDER BY i.i)::numeric[]
      FROM financeiro.centro_custo ce
      CROSS JOIN generate_series(1, 12) AS i(i)
      LEFT JOIN LATERAL (
        SELECT sum(v.r[i.i]) AS v
          FROM _cc_bloco v
         WHERE v.centro = ce.id AND v.chave IN (SELECT jsonb_array_elements_text(b.formula))
      ) s ON true
     GROUP BY ce.id;
  END LOOP;

  SELECT json_build_object(
    'ano',          p_ano,
    'hoje',         v_hoje,
    'relacao',      v_rel,
    'mes_corrente', v_mes,
    'ajuste',       p_ajuste,
    'arvores', (
      SELECT json_object_agg(ce.id, (
        SELECT coalesce(json_agg(t.linha ORDER BY t.ord, t.sub_ord), '[]'::json)
          FROM (
            SELECT bl.ordem AS ord, 0 AS sub_ord,
                   json_build_object(
                     't', bl.tipo, 'chave', bl.chave, 'rotulo', bl.rotulo, 'estrela', bl.nota_estrela,
                     'meses', coalesce(vb.r, v_zeros), 'prev_corrente', NULL, 'venc', 0,
                     'total', (SELECT sum(x) FROM unnest(coalesce(vb.r, v_zeros)) x)
                   ) AS linha
              FROM financeiro.dre_bloco bl
              LEFT JOIN _cc_bloco vb ON vb.centro = ce.id AND vb.chave = bl.chave
            UNION ALL
            SELECT bl.ordem, mp.ordem,
                   json_build_object(
                     't', 'cat', 'g', mp.bloco_chave, 'categoria_id', mp.categoria_id,
                     'rotulo', coalesce(mp.rotulo, dc.categoria), 'estrela', mp.nota_estrela,
                     'meses', coalesce(cc.r, v_zeros), 'prev_corrente', NULL, 'venc', 0,
                     'total', (SELECT sum(x) FROM unnest(coalesce(cc.r, v_zeros)) x)
                   )
              FROM financeiro.dre_categoria_map mp
              JOIN financeiro.dre_bloco bl ON bl.chave = mp.bloco_chave
              JOIN financeiro.dim_categoria dc ON dc.id = mp.categoria_id
              LEFT JOIN _cc_cat cc ON cc.centro = ce.id AND cc.categoria_id = mp.categoria_id
             WHERE NOT mp.excluida
               AND NOT (p_ajuste AND mp.categoria_id = c_cat_taxa)
          ) t
      ) ORDER BY ce.ordem)
      FROM financeiro.centro_custo ce
    ),
    'recebiveis', (
      SELECT coalesce(json_agg(json_build_object(
               'dono', x.centro, 'mes_antecipacao', x.ma, 'mes_vencimento', x.mv, 'valor', x.v
             ) ORDER BY x.ma, x.mv, x.centro), '[]'::json)
        FROM (
          SELECT p.centro,
                 extract(month FROM r.mov)::int AS ma,
                 (extract(year FROM r.venc)::int - p_ano) * 12 + extract(month FROM r.venc)::int AS mv,
                 sum(f.valor * r.fracao * p.peso) AS v
            FROM _cc_receb r
            CROSS JOIN LATERAL unnest(r.ids) AS u(id)
            JOIN _cc_fato f ON f.id = u.id
            JOIN _cc_parte p ON p.id = f.id
           WHERE p_ajuste
           GROUP BY 1, 2, 3
        ) x
    ),
    'taxa_monde', (
      SELECT json_object_agg(ce.id, (
        SELECT array_agg(coalesce(t.v, 0) ORDER BY i.i)
          FROM generate_series(1, 12) AS i(i)
          LEFT JOIN (
            SELECT f.m, sum(f.valor * p.peso) AS v
              FROM _cc_fato f JOIN _cc_parte p ON p.id = f.id
             WHERE p_ajuste AND f.categoria_id = c_cat_taxa AND p.centro = ce.id
             GROUP BY f.m
          ) t ON t.m = i.i
      ) ORDER BY ce.ordem)
      FROM financeiro.centro_custo ce
    ),
    'eventos', (
      SELECT coalesce(json_agg(json_build_object(
               'data', ev.data, 'conta', ev.conta, 'valor', ev.valor, 'identificado', ev.identificado,
               'n_recebiveis', ev.n_recebiveis, 'taxa_registro', ev.taxa_registro,
               'taxa_monde', ev.taxa_monde, 'motivo', ev.motivo
             ) ORDER BY ev.data, ev.id), '[]'::json)
        FROM _cc_evento ev
    ),
    'cobertura', (
      SELECT json_build_object(
               'valor_movimentado', coalesce(sum(abs(f.valor * p.peso)), 0),
               'sem_centro',        coalesce(sum(abs(f.valor * p.peso)) FILTER (WHERE p.centro = 'sem_centro'), 0)
             )
        FROM _cc_fato f
        JOIN _cc_parte p ON p.id = f.id
       WHERE EXISTS (SELECT 1 FROM financeiro.dre_categoria_map mp
                      WHERE mp.categoria_id = f.categoria_id AND NOT mp.excluida)
    ),
    'anos_com_centro', (
      SELECT coalesce(json_agg(a ORDER BY a), '[]'::json)
        FROM (SELECT DISTINCT extract(year FROM movimentacao)::int AS a
                FROM raw.lancamentos_centro_custo WHERE movimentacao IS NOT NULL) y
    ),
    'centro_carregado_em', (
      SELECT max(concluido_em) FROM ingestao.carga
       WHERE base = 'lancamentos-centro-custo' AND status = 'aplicada'
    ),
    'antecipacoes_atualizado_em', (
      SELECT greatest(max(criado_em), max(atualizado_em)) FROM financeiro.antecipacao
    )
  ) INTO v_res;

  RETURN v_res;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_dre_caixa_centro(integer, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_dre_caixa_centro(integer, boolean) TO authenticated, service_role, verificador;

COMMENT ON FUNCTION public.get_dre_caixa_centro(integer, boolean) IS
  'v6.5.1 (0306): DRE de caixa por centro de custo — árvores por centro (mesma fonte e mapa vivo de get_dre_mensal, linha do fato repartida pelo rateio do Número), recebíveis antecipados identificados (regra §3.3, de-para financeiro.antecipacao_conta_monde), taxa do Monde por centro, eventos do registro, cobertura e carimbos. p_ajuste=false (teste): sem deslocamento e com a taxa na árvore — Σ centros = Empresa linha a linha. Leitura pura; exigir_acesso financeiro/dre.';

-- ── 3. Guard de EFETIVIDADE ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_proc regprocedure := to_regprocedure('public.get_dre_caixa_centro(integer, boolean)');
BEGIN
  IF v_proc IS NULL THEN
    RAISE EXCEPTION '0306: get_dre_caixa_centro(integer, boolean) não encontrada';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = v_proc AND prosecdef AND proconfig @> ARRAY['search_path=""']) THEN
    RAISE EXCEPTION '0306: get_dre_caixa_centro sem SECURITY DEFINER ou sem search_path vazio';
  END IF;
  IF position('app.exigir_acesso(ARRAY[''financeiro/dre''])' IN (SELECT prosrc FROM pg_proc WHERE oid = v_proc)) = 0 THEN
    RAISE EXCEPTION '0306: get_dre_caixa_centro sem exigir_acesso(financeiro/dre)';
  END IF;
  IF has_function_privilege('anon', v_proc, 'EXECUTE') THEN
    RAISE EXCEPTION '0306: anon com EXECUTE em get_dre_caixa_centro';
  END IF;
  IF NOT (has_function_privilege('authenticated', v_proc, 'EXECUTE')
          AND has_function_privilege('service_role', v_proc, 'EXECUTE')
          AND has_function_privilege('verificador', v_proc, 'EXECUTE')) THEN
    RAISE EXCEPTION '0306: authenticated/service_role/verificador sem EXECUTE em get_dre_caixa_centro';
  END IF;
  -- O de-para aponta para as contas CERTAS (nomes conferidos — id solto não basta).
  IF (SELECT count(*) FROM financeiro.antecipacao_conta_monde d
        JOIN financeiro.antecipacao_conta ac ON ac.id = d.antecipacao_conta_id
        JOIN financeiro.dim_conta_bancaria cb ON cb.id = d.conta_bancaria_id
       WHERE (ac.nome, cb.conta) IN (('Asaas', 'ASAAS'), ('Blimboo', 'Blimboo'))) <> 2 THEN
    RAISE EXCEPTION '0306: de-para de contas não aponta Asaas→ASAAS e Blimboo→Blimboo';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM financeiro.dim_categoria WHERE id = 38 AND categoria = 'Taxa de Antecipação') THEN
    RAISE EXCEPTION '0306: dim_categoria 38 não é "Taxa de Antecipação"';
  END IF;
  IF (SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('financeiro.antecipacao_conta_monde')) IS DISTINCT FROM true THEN
    RAISE EXCEPTION '0306: RLS desligado em financeiro.antecipacao_conta_monde';
  END IF;
END
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
