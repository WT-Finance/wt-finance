-- ---------------------------------------------------------------------------
-- 0243 — fix(v5.5.0/M6): sem NENHUMA taxa fechada, o indicador é NULL, não zero.
--
-- ADITIVA / retrocompatível: `CREATE OR REPLACE` da view com a MESMA lista de
-- colunas. Nenhum DROP, nenhuma escrita.
--
-- POR QUE (achado ALTO do `revisor`): o comentário da 0238 e a Decisão 5 do
-- ADR-0166 prometem que série de CDI ausente produz **NULL** (travessão), nunca 0 —
-- e o SQL não cumpria. Dois mecanismos do Postgres conspiravam:
--   (a) o ramo `n = 1` da recursão gravava `0::numeric AS juros` INCONDICIONALMENTE,
--       independente de haver taxa;
--   (b) **`GREATEST`/`LEAST` IGNORAM argumentos NULL** — `GREATEST(NULL, 0)` é `0`,
--       não NULL — e `SUM()` também ignora NULL.
-- Resultado: com `dim_taxa_cdi` VAZIA, `SUM` agregava `{0, NULL, NULL, …}` e o
-- indicador colapsava para **`0.00`** em toda operação. A coluna da Lista exibiria
-- "R$ 0,00" para o portfólio inteiro — a afirmação "não rendeu nada", que é
-- exatamente a mentira que esta versão foi desenhada para nunca contar.
--
-- Alcance real: só pela LISTA (`get_operacoes_weddings`, que faz LEFT JOIN direto na
-- view). O drawer estava protegido, porque `get_rendimento_float` tem o guard
-- explícito de tabela vazia ANTES de tocar a view. Hoje a série tem 25 meses, então
-- o estado não está ativo em produção — mas ele é alcançável em qualquer ambiente
-- que aplique as migrations antes da primeira ingestão bem-sucedida.
--
-- A correção NÃO confia em propagação de NULL (foi ela que falhou): o agregado passa
-- por um `CASE` explícito sobre a contagem de meses com taxa conhecida.
--
-- Verificação pós-push: com a série populada, os valores têm de ficar IDÊNTICOS aos
-- de antes (a mudança só toca o ramo "nenhuma taxa"); conferir contra a amostra já
-- medida na auto-auditoria.
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
  -- v5.5.0/0242: o total é a SOMA das partes já arredondadas, não o arredondamento
  -- da soma. As três aparecem juntas no bloco do drawer e o usuário as soma com os
  -- olhos — arredondar cada uma por conta própria fazia faltar 1 centavo.
  --
  -- v5.5.0/0243: o `CASE` sobre a contagem de meses COM taxa é o que garante NULL
  -- quando a série não tem nenhuma taxa fechada. NÃO dá para confiar na propagação
  -- de NULL aqui: `GREATEST(NULL, 0)` devolve `0` (a função ignora NULL), e `SUM`
  -- também ignora — as duas coisas juntas transformavam "não sei" em "zero".
  CASE WHEN COUNT(*) FILTER (WHERE taxa IS NOT NULL) = 0 THEN NULL
       ELSE ROUND(SUM(GREATEST(juros, 0)), 2) + ROUND(SUM(LEAST(juros, 0)), 2)
  END                                                           AS rendimento,
  CASE WHEN COUNT(*) FILTER (WHERE taxa IS NOT NULL) = 0 THEN NULL
       ELSE ROUND(SUM(GREATEST(juros, 0)), 2)
  END                                                           AS rendimento_positivo,
  CASE WHEN COUNT(*) FILTER (WHERE taxa IS NOT NULL) = 0 THEN NULL
       ELSE ROUND(SUM(LEAST(juros, 0)), 2)
  END                                                           AS custo_negativo,
  ROUND(AVG(saldo_real), 2)                                     AS saldo_medio,
  COUNT(*) FILTER (WHERE saldo_real > 0)                        AS meses_positivos,
  COUNT(*)                                                      AS meses_total,
  MIN(mes)                                                      AS mes_inicio,
  MAX(mes)                                                      AS mes_fim
FROM rec
GROUP BY operacao;
