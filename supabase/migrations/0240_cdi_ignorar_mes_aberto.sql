-- ---------------------------------------------------------------------------
-- 0240 — fix(v5.5.0/M2): a LEITURA ignora o mês ainda aberto da série do CDI.
--
-- ADITIVA / retrocompatível. Declaração prévia (regime do CLAUDE.md):
--   • O QUE FAZ: `CREATE OR REPLACE` de `analytics.vw_rendimento_float_operacao` e
--     de `public.get_taxas_cdi`, acrescentando um único predicado — só contam as
--     linhas de `dim_taxa_cdi` cujo mês já FECHOU.
--   • POR QUE É ADITIVA: REPLACE com a MESMA lista de colunas na view e a MESMA
--     assinatura na função; nenhum DROP, nenhum DELETE, nenhuma escrita. Não toca
--     dado — ao contrário, deixa de LER um dado.
--   • REVERSIBILIDADE: reaplicar os corpos da 0238.
--
-- POR QUE ELA EXISTE (medido, não suposto): o SGS publica o mês CORRENTE parcial.
-- Em 07/08/2026 a série devolveu ago/2026 = 0,21% — o acumulado de 7 dias, não do
-- mês. A ingestão da M2 gravou essa linha antes de o defeito ser percebido, e o
-- efeito não ficou no mês corrente: o carry-forward projeta a ÚLTIMA taxa conhecida
-- sobre TODOS os meses futuros, então o rendimento projetado inteiro passou a
-- ser calculado a 0,21% a.m. em vez de ~1,15% — cinco vezes menor, e plausível o
-- bastante para ninguém desconfiar olhando a tela.
--
-- A rota de ingestão já passou a descartar o mês aberto (`apenasMesesFechados`),
-- mas isso sozinho não bastava por dois motivos:
--   (a) a linha de ago/2026 JÁ está gravada, e removê-la seria DELETE — destrutivo,
--       fora do que o agente aplica;
--   (b) mesmo sem ela, confiar só na escrita deixa a regra dependente de quem
--       grava. Aqui a leitura passa a não aceitar mês aberto de forma nenhuma, e o
--       dado parcial fica inerte onde está. Em setembro o upsert o substitui pelo
--       valor fechado sozinho, sem intervenção.
-- É a mesma lição da v5.4.5: filtro de negócio mora na LEITURA.
--
-- ⚠️ `CURRENT_DATE` aqui é o "hoje" de São Paulo porque `anon`/`authenticated`/
-- `service_role` têm `timezone` no rolconfig (0152) e o PostgREST o aplica a cada
-- requisição. Consultada como `postgres` (migration/seed, UTC), a view pode discordar
-- na janela entre 21h e a meia-noite do último dia do mês. Nenhum caminho do app
-- passa por aí — o acesso é sempre via RPC.
--
-- Verificação pós-push: via REST/service_role — `get_taxas_cdi` devolvendo o mês
-- corrente e os futuros com a taxa de JULHO (última fechada), não com os 0,21% de
-- agosto.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW analytics.vw_rendimento_float_operacao AS
WITH RECURSIVE fluxo AS (
  -- Mesma régua do get_acumulado_weddings (0141): efetivado pela liquidação,
  -- previsto pelo vencimento — é o COALESCE que implementa "PROJETADO".
  -- `valor` é sempre positivo na origem; o sinal vem do `tipo`.
  SELECT
    l.operacao,
    date_trunc('month', COALESCE(l.liquidacao_dt, l.vencimento_dt))::date AS mes,
    SUM(CASE WHEN l.tipo = 'Entrada' THEN l.valor ELSE -l.valor END)      AS fluxo
  FROM analytics.fato_lancamento_operacao l
  WHERE COALESCE(l.liquidacao_dt, l.vencimento_dt) IS NOT NULL
  GROUP BY 1, 2
),
limites AS (
  SELECT operacao, MIN(mes) AS mes_ini, MAX(mes) AS mes_fim
  FROM fluxo
  GROUP BY operacao
),
-- Grade CONTÍNUA: mês sem lançamento não some, porque o saldo dele ainda rende.
grade AS (
  SELECT lm.operacao, gs::date AS mes
  FROM limites lm
  CROSS JOIN LATERAL generate_series(lm.mes_ini, lm.mes_fim, interval '1 month') gs
),
-- v5.5.0/0240: SÓ mês fechado é taxa conhecida. O mês corrente vem parcial da
-- origem e, por causa do carry-forward, contaminaria todo o futuro.
taxas_fechadas AS (
  SELECT c.mes, c.taxa
  FROM analytics.dim_taxa_cdi c
  WHERE c.mes < date_trunc('month', CURRENT_DATE)::date
),
-- Taxa por mês, resolvida UMA vez sobre os meses distintos da grade (dezenas),
-- não uma vez por linha de operação. Regra única, e ela precisa ser única:
--   1º a taxa do próprio mês, se ele já fechou;
--   2º na falta dela, a última FECHADA anterior (carry-forward — é o que cobre o
--      mês corrente e os futuros, a premissa do briefing, e também tapa buraco no
--      meio da série sem zerar o mês);
--   3º antes do início da série, a primeira conhecida.
-- A MESMA regra vive em public.get_taxas_cdi. Se as duas divergirem, a coluna e o
-- gráfico param de convergir e o usuário vê dois números vizinhos discordando.
taxa_por_mes AS (
  SELECT
    mg.mes,
    COALESCE(
      (SELECT c.taxa FROM taxas_fechadas c WHERE c.mes <= mg.mes ORDER BY c.mes DESC LIMIT 1),
      (SELECT c.taxa FROM taxas_fechadas c ORDER BY c.mes ASC LIMIT 1)
      -- SEM fallback para 0: com a tabela VAZIA a taxa fica NULL, o juro fica NULL
      -- e o indicador sai NULL — travessão na UI. Um zero aqui seria plausível e
      -- FALSO ("esta operação não rendeu nada"), que é a pior das duas saídas.
    ) AS taxa
  FROM (SELECT DISTINCT mes FROM grade) mg
),
ordenado AS (
  SELECT
    g.operacao,
    g.mes,
    ROW_NUMBER() OVER (PARTITION BY g.operacao ORDER BY g.mes) AS n,
    COALESCE(f.fluxo, 0) AS fluxo,
    tm.taxa
  FROM grade g
  JOIN taxa_por_mes tm ON tm.mes = g.mes
  LEFT JOIN fluxo f ON f.operacao = g.operacao AND f.mes = g.mes
),
-- Recursão set-based: TODAS as operações de uma vez. Uma função escalar por
-- linha na RPC de listagem seria N+1 — a armadilha que custou a 0101.
rec AS (
  SELECT
    o.operacao, o.mes, o.n, o.fluxo, o.taxa,
    o.fluxo::numeric AS saldo_virtual,
    o.fluxo::numeric AS saldo_real,
    0::numeric       AS juros
  FROM ordenado o
  WHERE o.n = 1

  UNION ALL

  SELECT
    o.operacao, o.mes, o.n, o.fluxo, o.taxa,
    r.saldo_virtual * (1 + o.taxa) + o.fluxo,
    r.saldo_real + o.fluxo,
    r.saldo_virtual * o.taxa
  FROM rec r
  JOIN ordenado o ON o.operacao = r.operacao AND o.n = r.n + 1
)
SELECT
  operacao,
  ROUND(SUM(juros), 2)                                          AS rendimento,
  ROUND(SUM(GREATEST(juros, 0)), 2)                             AS rendimento_positivo,
  ROUND(SUM(LEAST(juros, 0)), 2)                                AS custo_negativo,
  ROUND(AVG(saldo_real), 2)                                     AS saldo_medio,
  COUNT(*) FILTER (WHERE saldo_real > 0)                        AS meses_positivos,
  COUNT(*)                                                      AS meses_total,
  MIN(mes)                                                      AS mes_inicio,
  MAX(mes)                                                      AS mes_fim
FROM rec
GROUP BY operacao;

-- ---------------------------------------------------------------------------
-- get_taxas_cdi — mesma regra, mesma ordem de fallback.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_taxas_cdi(
  p_meses_passados integer DEFAULT 24,
  p_meses_futuros  integer DEFAULT 18
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_mes_atual date := date_trunc('month', CURRENT_DATE)::date;
  v_inicio    date;
  v_result    jsonb;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['performance/weddings']);

  -- Mesmos clamps da get_acumulado_weddings (0141), para a grade de meses das
  -- duas RPCs coincidir mês a mês.
  p_meses_passados := LEAST(GREATEST(COALESCE(p_meses_passados, 24), 1), 120);
  p_meses_futuros  := LEAST(GREATEST(COALESCE(p_meses_futuros,  18), 0),  60);
  v_inicio := (v_mes_atual - (p_meses_passados * interval '1 month'))::date;

  SELECT jsonb_build_object(
    -- Passa a ser o último mês FECHADO — é ele que a UI mostra como "taxa de
    -- referência de MMM/AA" no sinal de staleness.
    'taxa_vigente_mes', to_char(
      (SELECT MAX(mes) FROM analytics.dim_taxa_cdi WHERE mes < v_mes_atual), 'YYYY-MM-DD'),
    'meses', COALESCE(
      (SELECT jsonb_agg(
         jsonb_build_object(
           'mes',    to_char(m.mes, 'YYYY-MM-DD'),
           -- MESMA regra da analytics.vw_rendimento_float_operacao, nesta ordem:
           -- taxa do próprio mês (se fechado) → carry-forward da última fechada
           -- anterior → primeira da série. Divergir daqui quebra a convergência
           -- coluna × gráfico.
           'taxa',   COALESCE(t.taxa, b.taxa_carregada, b.taxa_primeira_serie),
           'origem', CASE WHEN t.mes IS NULL THEN 'projetada' ELSE t.origem END
         ) ORDER BY m.mes
       )
       FROM (
         SELECT (v_inicio + (n * interval '1 month'))::date AS mes
         FROM generate_series(0, p_meses_passados + p_meses_futuros) n
       ) m
       CROSS JOIN LATERAL (
         SELECT
           (SELECT c.taxa FROM analytics.dim_taxa_cdi c
             WHERE c.mes <= m.mes AND c.mes < v_mes_atual
             ORDER BY c.mes DESC LIMIT 1)                        AS taxa_carregada,
           (SELECT c.taxa FROM analytics.dim_taxa_cdi c
             WHERE c.mes < v_mes_atual
             ORDER BY c.mes ASC LIMIT 1)                         AS taxa_primeira_serie
       ) b
       LEFT JOIN analytics.dim_taxa_cdi t
              ON t.mes = m.mes AND t.mes < v_mes_atual),
      '[]'::jsonb
    )
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_taxas_cdi(integer, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_taxas_cdi(integer, integer) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- get_rendimento_float — o mesmo ajuste no sinal de staleness.
-- Sem isto, o drawer anunciaria "taxa de referência de ago/26" enquanto a conta
-- usa a de julho: o rótulo mentiria sobre o próprio número que acompanha.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_rendimento_float(p_operacao text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result   jsonb;
  v_tem_taxa boolean;
  v_vigente  date;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['performance/weddings']);

  SELECT MAX(mes) INTO v_vigente
  FROM analytics.dim_taxa_cdi
  WHERE mes < date_trunc('month', CURRENT_DATE)::date;

  v_tem_taxa := v_vigente IS NOT NULL;
  IF NOT v_tem_taxa THEN
    -- Invariante 9 do briefing: falha EXPLÍCITA só quando NENHUMA taxa FECHADA
    -- existe. Silenciar aqui devolveria zero — indistinguível de "esta operação
    -- não rende".
    RAISE EXCEPTION 'dim_taxa_cdi sem nenhum mês fechado: a ingestão do CDI (BACEN/SGS) nunca rodou'
      USING ERRCODE = 'no_data_found';
  END IF;

  SELECT jsonb_build_object(
    'taxa_vigente_mes', to_char(v_vigente, 'YYYY-MM-DD'),
    'operacoes', COALESCE(
      (SELECT jsonb_agg(
         jsonb_build_object(
           'operacao',            rf.operacao,
           'rendimento',          rf.rendimento,
           'rendimento_positivo', rf.rendimento_positivo,
           'custo_negativo',      rf.custo_negativo,
           'saldo_medio',         rf.saldo_medio,
           'meses_positivos',     rf.meses_positivos,
           'meses_total',         rf.meses_total,
           'mes_inicio',          to_char(rf.mes_inicio, 'YYYY-MM-DD'),
           'mes_fim',             to_char(rf.mes_fim,    'YYYY-MM-DD')
         ) ORDER BY rf.operacao
       )
       FROM analytics.vw_rendimento_float_operacao rf
       WHERE p_operacao IS NULL OR rf.operacao = p_operacao),
      '[]'::jsonb
    )
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_rendimento_float(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_rendimento_float(text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
