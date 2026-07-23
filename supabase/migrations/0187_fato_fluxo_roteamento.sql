-- ---------------------------------------------------------------------------
-- 0187 — feat(financeiro): fato_fluxo (eixo movimentação) + regenerar_fluxo_caixa
--        (v5.2.0 / Onda 1, M2)
--
-- ADITIVA / retrocompatível com a main viva:
--   • CREATE TABLE nova (financeiro.fato_fluxo) — NÃO toca financeiro.fato_lancamentos
--   • CREATE FUNCTION nova (regenerar_fluxo_caixa) — NÃO toca regenerar_financeiro_lancamentos
--   • Auto-sync ADITIVO das dims compartilhadas (dim_categoria/dim_conta_bancaria):
--     só INSERT ... ON CONFLICT DO NOTHING/UPDATE de grupo — não remove nem reescreve
--     linhas existentes (as ids que o fato antigo referencia continuam válidas).
--
-- DECISÃO TÉCNICA (convivência, invariante #1): em vez de MUTAR fato_lancamentos +
--   regenerar_financeiro_lancamentos (o que quebraria o seed `seed-lancamentos-financeiro.ts`
--   que chama regenerar_financeiro_lancamentos, e os consumidores liquidação-based durante
--   M2→M3), criamos uma TABELA e FUNÇÃO NOVAS. O fato antigo e a v1 seguem intactos até o
--   M3 repontar os consumidores; o DROP das bases/fato antigos é destrutiva separada (Yan/TTY).
--   Produto idêntico ao pedido ("fato com data_movimentacao + roteamento") — ADR-0154.
--
-- ROTEAMENTO (regras §3 da REFERENCIA_DRE):
--   • data-base = hoje em São Paulo ((now() AT TIME ZONE 'America/Sao_Paulo')::date).
--   • REALIZADO  = raw.lancamentos_movimentacao WHERE data_movimentacao <= data-base
--                  → data_competencia = data_movimentacao.
--   • PREVISTO   = (a) movimentações FUTURAS (data_movimentacao > data-base; vencimento=movimentação, §3.3)
--                + (b) raw.titulos_em_aberto (todos, por vencimento).
--                  → data_competencia = vencimento (b) / data_movimentacao (a).
--   • CORTE      = data_competencia > 31/12/2028 → pos_corte=true (bloco meta; §3.4). NUNCA filtra no upload.
--   • Sinal do valor preservado (+ entrada / − saída). Entidades internas INCLUÍDAS (§3.5, sem filtro).
-- ---------------------------------------------------------------------------

CREATE TABLE financeiro.fato_fluxo (
  id                 BIGSERIAL   PRIMARY KEY,
  origem             TEXT        NOT NULL CHECK (origem IN ('movimentacao', 'em_aberto')),
  origem_id          BIGINT,                    -- id na tabela raw de origem (proveniência)
  numero             TEXT,
  venda_no           BIGINT,
  emissao            DATE,
  vencimento         DATE,
  liquidacao         DATE,
  data_movimentacao  DATE,
  pessoa             TEXT,
  descricao          TEXT,
  valor              NUMERIC(18,2) NOT NULL,    -- + entrada / − saída
  categoria_id       INTEGER     REFERENCES financeiro.dim_categoria (id),
  conta_bancaria_id  INTEGER     REFERENCES financeiro.dim_conta_bancaria (id),
  tipo               TEXT        NOT NULL CHECK (tipo IN ('realizado', 'previsto')),
  data_competencia   DATE        NOT NULL,      -- data que posiciona a linha no mês
  pos_corte          BOOLEAN     NOT NULL DEFAULT false,
  gerado_em          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX fato_fluxo_competencia_idx      ON financeiro.fato_fluxo (data_competencia);
CREATE INDEX fato_fluxo_tipo_idx             ON financeiro.fato_fluxo (tipo);
CREATE INDEX fato_fluxo_tipo_competencia_idx ON financeiro.fato_fluxo (tipo, data_competencia);  -- consumidores M3: mês × tipo
CREATE INDEX fato_fluxo_categoria_idx   ON financeiro.fato_fluxo (categoria_id);
CREATE INDEX fato_fluxo_conta_idx       ON financeiro.fato_fluxo (conta_bancaria_id);
CREATE INDEX fato_fluxo_venda_idx       ON financeiro.fato_fluxo (venda_no);

ALTER TABLE financeiro.fato_fluxo ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON financeiro.fato_fluxo TO service_role;
GRANT USAGE, SELECT ON SEQUENCE financeiro.fato_fluxo_id_seq TO service_role;

-- ---------------------------------------------------------------------------
-- regenerar_fluxo_caixa() — reconstrói fato_fluxo a partir das 2 bases novas.
-- SECURITY DEFINER (owner postgres ignora RLS); chamada no finalizar do upload
-- (service_role) e re-executável (idempotente: TRUNCATE + rebuild). Retorna jsonb
-- com contadores de qualidade da base e a lista de contas NOVAS (aviso, não silêncio).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.regenerar_fluxo_caixa()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_data_base    date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;  -- "hoje" SP (§3.8)
  v_corte        date := DATE '2028-12-31';                               -- §3.4
  v_contas_novas text[];
  v_realizado_n  int;
  v_previsto_n   int;
  v_excluidos    int;
  v_result       jsonb;
BEGIN
  -- Lista de cartões conhecida (mesma da v1 regenerar_financeiro_lancamentos, ADR-0065/0067):
  -- saída em conta-cartão é excluída do realizado no cômputo (Abordagem B) — a classificação
  -- eh_cartao_credito é o que sustenta isso nos consumidores (M3).
  WITH contas_todas AS (
    SELECT DISTINCT conta FROM raw.lancamentos_movimentacao WHERE conta IS NOT NULL
    UNION
    SELECT DISTINCT conta FROM raw.titulos_em_aberto        WHERE conta IS NOT NULL
  ),
  novas AS (
    SELECT ct.conta
    FROM contas_todas ct
    WHERE NOT EXISTS (SELECT 1 FROM financeiro.dim_conta_bancaria d WHERE d.conta = ct.conta)
  )
  SELECT array_agg(conta ORDER BY conta) INTO v_contas_novas FROM novas;

  -- 1. Auto-sync dim_conta_bancaria (aditivo; ON CONFLICT preserva classificação manual)
  INSERT INTO financeiro.dim_conta_bancaria (conta, tipo, eh_cartao_credito)
  SELECT
    ct.conta,
    CASE WHEN ct.conta LIKE 'WCLARA - %'
           OR ct.conta IN ('CC ASAAS','CCAB - AA','CCAB - AD','CCAB - VS','CCMV - MC','VISA WT','MASTERCARD WT')
         THEN 'cartao_credito' ELSE 'outro' END,
    CASE WHEN ct.conta LIKE 'WCLARA - %'
           OR ct.conta IN ('CC ASAAS','CCAB - AA','CCAB - AD','CCAB - VS','CCMV - MC','VISA WT','MASTERCARD WT')
         THEN TRUE ELSE FALSE END
  FROM (
    SELECT DISTINCT conta FROM raw.lancamentos_movimentacao WHERE conta IS NOT NULL
    UNION
    SELECT DISTINCT conta FROM raw.titulos_em_aberto        WHERE conta IS NOT NULL
  ) ct
  ON CONFLICT (conta) DO NOTHING;

  -- 2. Auto-sync dim_categoria (aditivo; atualiza grupo se mudou).
  --    DEDUP por categoria ANTES do INSERT (DISTINCT ON): as 2 fontes são independentes e
  --    o Monde pode trazer a MESMA categoria com grupo divergente (ou NULL num export e
  --    preenchido no outro) — sem dedup, o ON CONFLICT DO UPDATE atingiria a mesma linha 2×
  --    e abortaria a função ("cannot affect row a second time"). Desempate determinístico:
  --    prefere grupo NÃO-nulo e, entre eles, o maior alfabeticamente.
  INSERT INTO financeiro.dim_categoria (categoria, grupo_categoria)
  SELECT categoria, grupo_categoria
  FROM (
    SELECT DISTINCT ON (categoria)
      categoria,
      COALESCE(grupo_categoria, 'Sem Grupo') AS grupo_categoria
    FROM (
      SELECT categoria, grupo_categoria FROM raw.lancamentos_movimentacao WHERE categoria IS NOT NULL
      UNION ALL
      SELECT categoria, grupo_categoria FROM raw.titulos_em_aberto        WHERE categoria IS NOT NULL
    ) src
    ORDER BY categoria, (grupo_categoria IS NULL), grupo_categoria DESC
  ) d
  ON CONFLICT (categoria) DO UPDATE SET grupo_categoria = EXCLUDED.grupo_categoria;

  -- 3. Rebuild fato_fluxo
  TRUNCATE financeiro.fato_fluxo RESTART IDENTITY;

  -- 3a. REALIZADO — movimentações com data_movimentacao <= data-base
  INSERT INTO financeiro.fato_fluxo (
    origem, origem_id, numero, venda_no, emissao, vencimento, liquidacao, data_movimentacao,
    pessoa, descricao, valor, categoria_id, conta_bancaria_id, tipo, data_competencia, pos_corte
  )
  SELECT
    'movimentacao', r.id, r.numero, r.venda_no, r.emissao, r.vencimento, r.liquidacao, r.data_movimentacao,
    r.pessoa, r.descricao, r.valor, dc.id, dcb.id,
    'realizado', r.data_movimentacao, (r.data_movimentacao > v_corte)
  FROM raw.lancamentos_movimentacao r
  LEFT JOIN financeiro.dim_categoria      dc  ON dc.categoria = r.categoria
  LEFT JOIN financeiro.dim_conta_bancaria dcb ON dcb.conta    = r.conta
  WHERE r.data_movimentacao IS NOT NULL
    AND r.data_movimentacao <= v_data_base;
  GET DIAGNOSTICS v_realizado_n = ROW_COUNT;

  -- 3b. PREVISTO (a) — movimentações FUTURAS (data_movimentacao > data-base): vencimento = movimentação (§3.3)
  INSERT INTO financeiro.fato_fluxo (
    origem, origem_id, numero, venda_no, emissao, vencimento, liquidacao, data_movimentacao,
    pessoa, descricao, valor, categoria_id, conta_bancaria_id, tipo, data_competencia, pos_corte
  )
  SELECT
    'movimentacao', r.id, r.numero, r.venda_no, r.emissao, r.data_movimentacao, r.liquidacao, r.data_movimentacao,
    r.pessoa, r.descricao, r.valor, dc.id, dcb.id,
    'previsto', r.data_movimentacao, (r.data_movimentacao > v_corte)
  FROM raw.lancamentos_movimentacao r
  LEFT JOIN financeiro.dim_categoria      dc  ON dc.categoria = r.categoria
  LEFT JOIN financeiro.dim_conta_bancaria dcb ON dcb.conta    = r.conta
  WHERE r.data_movimentacao IS NOT NULL
    AND r.data_movimentacao > v_data_base;

  -- 3c. PREVISTO (b) — títulos em aberto, por vencimento
  INSERT INTO financeiro.fato_fluxo (
    origem, origem_id, numero, venda_no, emissao, vencimento, liquidacao, data_movimentacao,
    pessoa, descricao, valor, categoria_id, conta_bancaria_id, tipo, data_competencia, pos_corte
  )
  SELECT
    'em_aberto', r.id, r.numero, r.venda_no, r.emissao, r.vencimento, r.liquidacao, NULL,
    r.pessoa, r.descricao, r.valor, dc.id, dcb.id,
    'previsto', r.vencimento, (r.vencimento > v_corte)
  FROM raw.titulos_em_aberto r
  LEFT JOIN financeiro.dim_categoria      dc  ON dc.categoria = r.categoria
  LEFT JOIN financeiro.dim_conta_bancaria dcb ON dcb.conta    = r.conta
  WHERE r.vencimento IS NOT NULL;

  SELECT count(*) INTO v_previsto_n FROM financeiro.fato_fluxo WHERE tipo = 'previsto';

  -- Linhas descartadas por data-eixo nula (aviso, nunca silêncio — invariante 3).
  SELECT (SELECT count(*) FROM raw.lancamentos_movimentacao WHERE data_movimentacao IS NULL)
       + (SELECT count(*) FROM raw.titulos_em_aberto        WHERE vencimento        IS NULL)
    INTO v_excluidos;

  v_result := jsonb_build_object(
    'data_base',          to_char(v_data_base, 'YYYY-MM-DD'),
    'realizado_n',        v_realizado_n,
    'previsto_n',         v_previsto_n,
    'futuras_n',          (SELECT count(*) FROM financeiro.fato_fluxo WHERE origem='movimentacao' AND tipo='previsto'),
    'pos_corte_n',        (SELECT count(*) FROM financeiro.fato_fluxo WHERE pos_corte),
    'excluidos_data_nula', v_excluidos,
    'contas_novas',       COALESCE(to_jsonb(v_contas_novas), '[]'::jsonb),
    'contas_novas_n',     COALESCE(array_length(v_contas_novas, 1), 0)
  );
  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.regenerar_fluxo_caixa() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.regenerar_fluxo_caixa() TO service_role;

NOTIFY pgrst, 'reload schema';
