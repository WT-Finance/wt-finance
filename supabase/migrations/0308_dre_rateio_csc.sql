-- ---------------------------------------------------------------------------
-- 0308 — feat(v6.5.1, pedido do Yan no PR #311): RATEIO DO CSC na DRE de caixa por centro de custo
--
-- Classificação: ADITIVA (CREATE TABLE nova + índices + 1 função interna NOVA + CREATE OR REPLACE de
-- get_dre_caixa_centro com a MESMA assinatura e o MESMO RETURNS json + 3 RPCs NOVAS + REVOKE/GRANT +
-- guard). Nenhum DROP/TRUNCATE/UPDATE/DELETE top-level: o `DELETE` que aparece vive em CORPOS $$ (a
-- substituição do conjunto em salvar_dre_rateio_csc e a troca da parte CSC na tabela TEMP do núcleo).
--
-- DECLARAÇÃO PRÉVIA (regime aditivo / autônomo):
--   • O QUE FAZ — decisões do Yan (23/11/2026): (1) o rateio reparte SÓ o valor que caiu no CSC entre Trips,
--     Weddings e Corporativo (Sem centro é ignorado); (2) aparece por uma chave "Com rateio" no card (a DRE
--     sem rateio fica como hoje); (3) fica salvo no banco, igual para todos; (4) um único conjunto de %
--     para todos os períodos; (5) quem vê a DRE (área financeiro/dre) pode editar.
--       (a) `financeiro.dre_rateio_csc` — um % por CATEGORIA (categoria_id) ou por GRUPO (bloco-folha do
--           mapa, bloco_chave), exatamente um dos dois; Σ dos três % = 100 (CHECK). O % do grupo vence o
--           das categorias dele (no drawer, grupo preenchido trava as categorias).
--       (b) `financeiro.dre_caixa_centro_nucleo(p_ano, p_ajuste, p_rateio)` — o CORPO VIVO de
--           get_dre_caixa_centro (0306, copiado sem mudança de regra) + o rateio, aplicado num único ponto:
--           a tabela TEMP `_cc_parte` (linha do fato × centro). Todo o resto soma valor × peso por centro,
--           então árvore, totalizadores (mesma mecânica de fórmula), recebíveis e taxa do Monde saem da
--           mesma conta. Sem p_rateio, o núcleo é idêntico à 0306.
--       (c) `get_dre_caixa_centro(p_ano, p_ajuste)` passa a delegar ao núcleo com p_rateio = false (mesma
--           assinatura, mesmo retorno + a chave `rateio: false`; o front e o contrato atuais não mudam).
--       (d) `get_dre_caixa_centro_rateio(p_ano)` — a mesma leitura com o rateio aplicado (p_ajuste = true).
--       (e) `get_dre_rateio_csc()` / `salvar_dre_rateio_csc(p_itens jsonb)` — ler e SUBSTITUIR o conjunto
--           inteiro (o drawer salva tudo de uma vez), com validação nomeada antes de escrever.
--   • RBAC/GRANT: wrappers e RPCs novas SECURITY DEFINER + search_path vazio + `app.exigir_acesso` na 1ª
--     linha; REVOKE de PUBLIC/anon; GRANT a authenticated e service_role; ao `verificador` SÓ as leituras que
--     entram em caso de contrato (get_dre_caixa_centro_rateio e get_dre_rateio_csc — salvar fica fora). O
--     núcleo é interno: REVOKE de PUBLIC/anon/authenticated (só os wrappers definer o chamam). A tabela nova
--     tem RLS ligado e nenhum GRANT.
--   • PII: nenhuma coluna com nome de pessoa; `atualizado_por` guarda só o uuid de quem salvou.
--   • NUMERAÇÃO: 0307 é da v6.5.2 (PR #312, já aplicada; o arquivo idêntico entra nesta branch para o
--     histórico local casar com o remoto). Esta é a 0308.
--
-- Pós-aplicação (orquestrador): `npm run db:baseline`; regenerar `src/types/database.ts`; rodar
-- `scripts/credencial/derivar-allowlist.mjs verificador`; verificar por REST (com e sem rateio).
--
-- DOWN (destrutivo — humano em TTY):
--   -- DROP FUNCTION public.salvar_dre_rateio_csc(jsonb);
--   -- DROP FUNCTION public.get_dre_rateio_csc();
--   -- DROP FUNCTION public.get_dre_caixa_centro_rateio(integer);
--   -- recriar get_dre_caixa_centro(integer, boolean) com o corpo da 0306;
--   -- DROP FUNCTION financeiro.dre_caixa_centro_nucleo(integer, boolean, boolean);
--   -- DROP TABLE financeiro.dre_rateio_csc;
-- ---------------------------------------------------------------------------

BEGIN;

-- ── 1. Os percentuais do rateio do CSC ───────────────────────────────────────────────────
CREATE TABLE financeiro.dre_rateio_csc (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  categoria_id   integer REFERENCES financeiro.dim_categoria (id) ON DELETE CASCADE,
  -- Sem FK de propósito: uma FK travaria o editor da DRE ao renomear/remover um bloco. A existência do grupo é
  -- validada em salvar_dre_rateio_csc; grupo que deixar de existir só para de aplicar (o núcleo junta pelo mapa
  -- vivo) e sai no próximo salvamento do drawer.
  bloco_chave    text,
  pct_trips      numeric(7,4) NOT NULL CHECK (pct_trips    BETWEEN 0 AND 100),
  pct_weddings   numeric(7,4) NOT NULL CHECK (pct_weddings BETWEEN 0 AND 100),
  pct_corp       numeric(7,4) NOT NULL CHECK (pct_corp     BETWEEN 0 AND 100),
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid,
  CONSTRAINT dre_rateio_csc_um_alvo  CHECK ((categoria_id IS NULL) <> (bloco_chave IS NULL)),
  CONSTRAINT dre_rateio_csc_soma_100 CHECK (pct_trips + pct_weddings + pct_corp = 100)
);
CREATE UNIQUE INDEX dre_rateio_csc_categoria_uq ON financeiro.dre_rateio_csc (categoria_id) WHERE categoria_id IS NOT NULL;
CREATE UNIQUE INDEX dre_rateio_csc_bloco_uq     ON financeiro.dre_rateio_csc (bloco_chave)  WHERE bloco_chave  IS NOT NULL;
ALTER TABLE financeiro.dre_rateio_csc ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON financeiro.dre_rateio_csc FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE financeiro.dre_rateio_csc IS
  'v6.5.1 (0308): rateio do CSC entre Trips, Weddings e Corporativo na DRE de caixa por centro — um % por categoria OU por grupo (bloco-folha); o do grupo vence. Σ = 100. Lido/gravado só por get_dre_rateio_csc / salvar_dre_rateio_csc.';

-- ── 2. O núcleo: corpo vivo de get_dre_caixa_centro (0306) + o rateio em _cc_parte ───────────
CREATE OR REPLACE FUNCTION financeiro.dre_caixa_centro_nucleo(p_ano integer, p_ajuste boolean, p_rateio boolean)
RETURNS json
LANGUAGE plpgsql
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
  p_rateio := coalesce(p_rateio, false);

  v_rel := CASE
    WHEN p_ano < extract(year FROM v_hoje)::int THEN 'fechado'
    WHEN p_ano = extract(year FROM v_hoje)::int THEN 'corrente'
    ELSE 'futuro'
  END;
  v_mes := CASE WHEN v_rel = 'corrente' THEN extract(month FROM v_hoje)::int END;

  DROP TABLE IF EXISTS _cc_fato, _cc_parte, _cc_usado, _cc_taxa_usada, _cc_receb, _cc_evento,
                       _cc_val, _cc_agg, _cc_cat, _cc_bloco, _cc_rateio;

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
  -- ── Rateio do CSC (0308, decisão do Yan no PR #311) ────────────────────────────────────
  -- Só com p_rateio: a parte CSC de cada linha cuja categoria tem rateio vira partes de Trips, Weddings e
  -- Corporativo pelos % (Σ = 100, CHECK da tabela). O % do GRUPO (bloco-folha do mapa) vence o da categoria —
  -- no drawer, grupo preenchido trava as categorias dele. Sem centro e os demais centros NÃO mudam; tudo o que
  -- vem depois soma valor × peso por centro, então árvore, recebíveis e taxa do Monde saem da mesma conta.
  IF p_rateio THEN
    CREATE TEMP TABLE _cc_rateio ON COMMIT DROP AS
    -- Apelidos rgrp/rcat: `b`, `c` e `e` são variáveis record do DECLARE e o PL/pgSQL as resolveria primeiro.
    SELECT mp.categoria_id,
           CASE WHEN rgrp.bloco_chave IS NOT NULL THEN rgrp.pct_trips    ELSE rcat.pct_trips    END AS pct_trips,
           CASE WHEN rgrp.bloco_chave IS NOT NULL THEN rgrp.pct_weddings ELSE rcat.pct_weddings END AS pct_weddings,
           CASE WHEN rgrp.bloco_chave IS NOT NULL THEN rgrp.pct_corp     ELSE rcat.pct_corp     END AS pct_corp
      FROM financeiro.dre_categoria_map mp
      LEFT JOIN financeiro.dre_rateio_csc rgrp ON rgrp.bloco_chave  = mp.bloco_chave
      LEFT JOIN financeiro.dre_rateio_csc rcat ON rcat.categoria_id = mp.categoria_id
     WHERE rgrp.bloco_chave IS NOT NULL OR rcat.categoria_id IS NOT NULL;

    INSERT INTO _cc_parte (id, centro, peso)
    SELECT p.id, x.centro, p.peso * x.pct / 100
      FROM _cc_parte p
      JOIN _cc_fato f    ON f.id = p.id
      JOIN _cc_rateio rc ON rc.categoria_id = f.categoria_id
     CROSS JOIN LATERAL (VALUES ('trips', rc.pct_trips), ('weddings', rc.pct_weddings), ('corp', rc.pct_corp)) AS x(centro, pct)
     WHERE p.centro = 'csc' AND x.pct > 0;

    DELETE FROM _cc_parte p
     USING _cc_fato f, _cc_rateio rc
     WHERE p.id = f.id AND rc.categoria_id = f.categoria_id AND p.centro = 'csc';
  END IF;

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
    'rateio',       p_rateio,
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

REVOKE ALL ON FUNCTION financeiro.dre_caixa_centro_nucleo(integer, boolean, boolean) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION financeiro.dre_caixa_centro_nucleo(integer, boolean, boolean) IS
  'v6.5.1 (0308): núcleo INTERNO da DRE de caixa por centro (corpo da 0306) + rateio do CSC (p_rateio). Só os wrappers SECURITY DEFINER get_dre_caixa_centro / get_dre_caixa_centro_rateio o chamam.';

-- ── 3. A leitura de sempre, agora pelo núcleo (mesma assinatura, mesmo retorno) ─────────────
CREATE OR REPLACE FUNCTION public.get_dre_caixa_centro(p_ano integer, p_ajuste boolean DEFAULT true)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/dre']);
  RETURN financeiro.dre_caixa_centro_nucleo(p_ano, p_ajuste, false);
END;
$$;

-- O Postgres preserva as ACLs no CREATE OR REPLACE; redeclaradas mesmo assim (skill banco-e-rpc — revisor-db, BAIXO).
REVOKE EXECUTE ON FUNCTION public.get_dre_caixa_centro(integer, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_dre_caixa_centro(integer, boolean) TO authenticated, service_role, verificador;

COMMENT ON FUNCTION public.get_dre_caixa_centro(integer, boolean) IS
  'v6.5.1 (0306; delega ao núcleo desde a 0308): DRE de caixa por centro de custo SEM rateio do CSC — árvores por centro, recebíveis antecipados identificados, taxa do Monde por centro, eventos, cobertura e carimbos. p_ajuste=false (teste): Σ centros = Empresa linha a linha. Leitura pura; exigir_acesso financeiro/dre.';

-- ── 4. A mesma leitura COM o rateio do CSC ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_dre_caixa_centro_rateio(p_ano integer)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/dre']);
  RETURN financeiro.dre_caixa_centro_nucleo(p_ano, true, true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_dre_caixa_centro_rateio(integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_dre_caixa_centro_rateio(integer) TO authenticated, service_role, verificador;

COMMENT ON FUNCTION public.get_dre_caixa_centro_rateio(integer) IS
  'v6.5.1 (0308): get_dre_caixa_centro com o rateio do CSC (financeiro.dre_rateio_csc) aplicado. Leitura pura; exigir_acesso financeiro/dre.';

-- ── 5. Ler os percentuais ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_dre_rateio_csc()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/dre']);
  RETURN json_build_object(
    'itens', (
      -- `ativo`: o alvo ainda existe no mapa VIVO (grupo com categorias não excluídas; categoria não excluída). Um
      -- bloco renomeado/esvaziado no editor da DRE deixa o % órfão — o drawer o sinaliza (revisor-db, MÉDIO).
      SELECT coalesce(json_agg(json_build_object(
               'categoria_id', r.categoria_id, 'bloco_chave', r.bloco_chave,
               'pct_trips', r.pct_trips, 'pct_weddings', r.pct_weddings, 'pct_corp', r.pct_corp,
               'ativo', CASE
                 WHEN r.bloco_chave IS NOT NULL THEN EXISTS (
                   SELECT 1 FROM financeiro.dre_categoria_map mp WHERE mp.bloco_chave = r.bloco_chave AND NOT mp.excluida)
                 ELSE EXISTS (
                   SELECT 1 FROM financeiro.dre_categoria_map mp WHERE mp.categoria_id = r.categoria_id AND NOT mp.excluida)
               END
             ) ORDER BY r.bloco_chave NULLS LAST, r.categoria_id), '[]'::json)
        FROM financeiro.dre_rateio_csc r
    ),
    'atualizado_em', (SELECT max(atualizado_em) FROM financeiro.dre_rateio_csc)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_dre_rateio_csc() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_dre_rateio_csc() TO authenticated, service_role, verificador;

COMMENT ON FUNCTION public.get_dre_rateio_csc() IS
  'v6.5.1 (0308): os percentuais do rateio do CSC (por categoria ou por grupo). Leitura pura; exigir_acesso financeiro/dre.';

-- ── 6. Salvar (SUBSTITUI o conjunto inteiro — o drawer manda tudo de uma vez) ─────────────
CREATE OR REPLACE FUNCTION public.salvar_dre_rateio_csc(p_itens jsonb)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_n int;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/dre']);

  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' THEN
    RAISE EXCEPTION 'Rateio: a lista de percentuais é inválida.';
  END IF;
  IF jsonb_array_length(p_itens) > 2000 THEN
    RAISE EXCEPTION 'Rateio: lista grande demais.';
  END IF;

  DROP TABLE IF EXISTS _rt;
  CREATE TEMP TABLE _rt ON COMMIT DROP AS
  SELECT nullif(e->>'categoria_id', '')::int        AS categoria_id,
         nullif(btrim(e->>'bloco_chave'), '')        AS bloco_chave,
         round(coalesce((e->>'pct_trips')::numeric,    0), 4) AS pct_trips,
         round(coalesce((e->>'pct_weddings')::numeric, 0), 4) AS pct_weddings,
         round(coalesce((e->>'pct_corp')::numeric,     0), 4) AS pct_corp
    FROM jsonb_array_elements(p_itens) AS e;

  -- Validação NOMEADA antes de escrever (a tabela também tem CHECK; a mensagem aqui é a que o usuário lê).
  IF EXISTS (SELECT 1 FROM _rt WHERE (categoria_id IS NULL) = (bloco_chave IS NULL)) THEN
    RAISE EXCEPTION 'Rateio: cada linha precisa ser de uma categoria OU de um grupo.';
  END IF;
  IF EXISTS (SELECT 1 FROM _rt WHERE least(pct_trips, pct_weddings, pct_corp) < 0
                                  OR greatest(pct_trips, pct_weddings, pct_corp) > 100) THEN
    RAISE EXCEPTION 'Rateio: percentual fora de 0 a 100.';
  END IF;
  IF EXISTS (SELECT 1 FROM _rt WHERE pct_trips + pct_weddings + pct_corp <> 100) THEN
    RAISE EXCEPTION 'Rateio: em cada linha, Trips + Weddings + Corporativo precisa somar 100%%.';
  END IF;
  IF EXISTS (SELECT 1 FROM _rt WHERE categoria_id IS NOT NULL GROUP BY categoria_id HAVING count(*) > 1)
     OR EXISTS (SELECT 1 FROM _rt WHERE bloco_chave IS NOT NULL GROUP BY bloco_chave HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Rateio: categoria ou grupo repetido.';
  END IF;
  IF EXISTS (SELECT 1 FROM _rt t WHERE t.categoria_id IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM financeiro.dre_categoria_map mp
                                WHERE mp.categoria_id = t.categoria_id AND NOT mp.excluida)) THEN
    RAISE EXCEPTION 'Rateio: categoria fora da DRE.';
  END IF;
  IF EXISTS (SELECT 1 FROM _rt t WHERE t.bloco_chave IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM financeiro.dre_categoria_map mp
                                WHERE mp.bloco_chave = t.bloco_chave AND NOT mp.excluida)) THEN
    RAISE EXCEPTION 'Rateio: grupo sem categorias na DRE.';
  END IF;

  -- Dois salvamentos ao mesmo tempo não se intercalam: o último a pegar o lock vence por inteiro.
  LOCK TABLE financeiro.dre_rateio_csc IN SHARE ROW EXCLUSIVE MODE;
  DELETE FROM financeiro.dre_rateio_csc WHERE true;
  INSERT INTO financeiro.dre_rateio_csc (categoria_id, bloco_chave, pct_trips, pct_weddings, pct_corp, atualizado_por)
  SELECT categoria_id, bloco_chave, pct_trips, pct_weddings, pct_corp, auth.uid() FROM _rt;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  RETURN json_build_object('salvos', v_n);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.salvar_dre_rateio_csc(jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.salvar_dre_rateio_csc(jsonb) TO authenticated, service_role;

COMMENT ON FUNCTION public.salvar_dre_rateio_csc(jsonb) IS
  'v6.5.1 (0308): substitui o conjunto inteiro do rateio do CSC (lista de {categoria_id | bloco_chave, pct_trips, pct_weddings, pct_corp}, Σ = 100 por linha). exigir_acesso financeiro/dre (quem vê a DRE edita — decisão do Yan).';

-- ── 7. Guard de EFETIVIDADE ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_fn  text;
  v_proc regprocedure;
BEGIN
  IF to_regprocedure('financeiro.dre_caixa_centro_nucleo(integer, boolean, boolean)') IS NULL THEN
    RAISE EXCEPTION '0308: núcleo não encontrado';
  END IF;
  IF has_function_privilege('authenticated', 'financeiro.dre_caixa_centro_nucleo(integer, boolean, boolean)', 'EXECUTE')
     OR has_function_privilege('anon', 'financeiro.dre_caixa_centro_nucleo(integer, boolean, boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION '0308: núcleo executável por anon/authenticated';
  END IF;

  FOREACH v_fn IN ARRAY ARRAY[
    'public.get_dre_caixa_centro(integer, boolean)',
    'public.get_dre_caixa_centro_rateio(integer)',
    'public.get_dre_rateio_csc()',
    'public.salvar_dre_rateio_csc(jsonb)'
  ] LOOP
    v_proc := to_regprocedure(v_fn);
    IF v_proc IS NULL THEN
      RAISE EXCEPTION '0308: % não encontrada', v_fn;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = v_proc AND prosecdef AND proconfig @> ARRAY['search_path=""']) THEN
      RAISE EXCEPTION '0308: % sem SECURITY DEFINER ou sem search_path vazio', v_fn;
    END IF;
    IF position('app.exigir_acesso(ARRAY[''financeiro/dre''])' IN (SELECT prosrc FROM pg_proc WHERE oid = v_proc)) = 0 THEN
      RAISE EXCEPTION '0308: % sem exigir_acesso(financeiro/dre)', v_fn;
    END IF;
    IF has_function_privilege('anon', v_proc, 'EXECUTE') THEN
      RAISE EXCEPTION '0308: anon com EXECUTE em %', v_fn;
    END IF;
    IF NOT (has_function_privilege('authenticated', v_proc, 'EXECUTE')
            AND has_function_privilege('service_role', v_proc, 'EXECUTE')) THEN
      RAISE EXCEPTION '0308: authenticated/service_role sem EXECUTE em %', v_fn;
    END IF;
  END LOOP;

  -- verificador: as leituras do contrato SIM; salvar NÃO.
  IF NOT (has_function_privilege('verificador', 'public.get_dre_caixa_centro(integer, boolean)', 'EXECUTE')
          AND has_function_privilege('verificador', 'public.get_dre_caixa_centro_rateio(integer)', 'EXECUTE')
          AND has_function_privilege('verificador', 'public.get_dre_rateio_csc()', 'EXECUTE')) THEN
    RAISE EXCEPTION '0308: verificador sem EXECUTE nas leituras';
  END IF;
  IF has_function_privilege('verificador', 'public.salvar_dre_rateio_csc(jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION '0308: verificador com EXECUTE em salvar_dre_rateio_csc';
  END IF;

  IF (SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('financeiro.dre_rateio_csc')) IS DISTINCT FROM true THEN
    RAISE EXCEPTION '0308: RLS desligado em financeiro.dre_rateio_csc';
  END IF;
  -- O núcleo sem rateio é o corpo da 0306: o rateio só entra sob IF p_rateio.
  IF position('IF p_rateio THEN' IN (SELECT prosrc FROM pg_proc
        WHERE oid = to_regprocedure('financeiro.dre_caixa_centro_nucleo(integer, boolean, boolean)'))) = 0 THEN
    RAISE EXCEPTION '0308: núcleo sem o bloco condicional do rateio';
  END IF;
END
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
