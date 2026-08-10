-- ---------------------------------------------------------------------------
-- 0238 — feat(v5.5.0/M1): Rendimento potencial do float (Weddings).
--
-- ADITIVA / retrocompatível. Declaração prévia (regime do CLAUDE.md):
--   • O QUE FAZ:
--       (1) CREATE TABLE analytics.dim_taxa_cdi — série mensal do CDI (a M2
--           alimenta pela API SGS do BACEN; esta migration NÃO semeia nada);
--       (2) CREATE VIEW analytics.vw_rendimento_float_operacao — a conta virtual
--           remunerada, uma linha por operação;
--       (3) CREATE FUNCTION public.get_rendimento_float — leitura para o drawer;
--       (4) CREATE FUNCTION public.get_taxas_cdi — série de taxas para o gráfico.
--   • POR QUE É ADITIVA: só CREATE de objetos NOVOS. Nenhum DROP, nenhum TRUNCATE,
--     nenhuma escrita em dado pré-existente (tudo leitura), e — deliberadamente —
--     nenhuma alteração em função já viva. Ver o bloco de SEQUENCIAMENTO abaixo.
--   • REVERSIBILIDADE: os objetos são dropáveis sem consumidor legado (nada em
--     `src/` nem em `supabase/seed/` os referencia nesta migration).
--
-- SEQUENCIAMENTO — por que o REPLACE da RPC da Lista NÃO está aqui:
-- a Lista de Operações precisa da coluna derivada `d_rend_float` e da entrada
-- `WHEN 'rend_float'` na whitelist de ORDER BY, senão ordenar por ela cai no
-- `ELSE 'd_data_evento'` — fallback SILENCIOSO (a armadilha que a 0228 documentou).
-- Mas esse REPLACE injeta a view recursiva na CTE `base` de uma RPC que já está
-- EM PRODUÇÃO e é o caminho principal da tela de Weddings; `WITH RECURSIVE` nunca
-- é inlineada pelo planner, então não há pushdown dos filtros e TODA chamada
-- recomputaria a recursão inteira — mesmo uma busca por um único casal. É a mesma
-- classe de erro que já derrubou esta função (0101, `contar_convidados_operacao`
-- por linha), e não existe Postgres local para medir antes do push.
-- Por isso o REPLACE foi separado para `supabase/patches/PENDENTE-lista-operacoes-
-- rend-float.sql`, FORA de `supabase/migrations/` — o `db push` empurra todo o
-- conjunto pendente, então deixá-lo na pasta aplicaria os dois juntos e anularia o
-- sequenciamento. A ordem é: aplicar esta migration (superfície 100% nova, risco
-- zero no caminho vivo) → MEDIR o custo real da view contra produção via
-- REST/service_role → só então numerar e aplicar o patch, com a forma que a medição
-- indicar. Mesmo padrão da v5.4.4: primeiro provar, depois ligar.
--
-- DEFINIÇÃO DA MÉTRICA (o ADR-0166 a registra por extenso):
--   saldo_virtual(t) = saldo_virtual(t−1) × (1 + i_t) + fluxo_t   (composto)
--   saldo_real(t)    = saldo_real(t−1) + fluxo_t
--   indicador        = saldo_virtual_final − saldo_real_final
-- Como a diferença acumula exatamente os termos de juro, o indicador também é
-- Σ juros_t, com juros_t = saldo_virtual(t−1) × i_t — é isso que permite abrir o
-- total em "rendimento teórico (+)" e "custo teórico (−)" sem uma segunda conta.
-- Simétrico por construção: saldo negativo rende negativamente (custo teórico de
-- captar à CDI). Sai de graça da fórmula, sem ramo especial.
--
-- ⚠️ Taxa FORA da série: a mais próxima conhecida — a última fechada para o mês
-- corrente e os futuros (é a premissa do briefing), e a primeira conhecida para
-- meses anteriores ao início do backfill. Extrapolar para trás evita uma
-- descontinuidade artificial em operação antiga; a origem fica registrada na
-- `dim_taxa_cdi` e o mês vigente viaja no contrato para a UI sinalizar staleness.
--
-- Verificação pós-push, via REST/service_role (o `db query` não executa o corpo de
-- função gated), em duas frentes:
--   • LATÊNCIA — cronometrar `get_rendimento_float` sem filtro, que percorre a view
--     inteira, e comparar com o teto de 8s do role `authenticated`. Este número é o
--     que decide a FORMA do patch da Lista (join direto × escopo por operação ×
--     materialização) e precisa existir ANTES de ligá-lo. Medir aqui é seguro
--     justamente porque nenhuma tela consome estes objetos ainda.
--   • FORMA E VALOR — operação sem lançamento devolvendo NULL (não zero); a soma
--     `rendimento_positivo + custo_negativo` batendo com `rendimento`.
-- ⚠️ A conferência ARITMÉTICA da conta composta (recomputar uma operação à mão em
-- planilha) só é significativa DEPOIS da M2: com `dim_taxa_cdi` vazia toda taxa é
-- NULL e a fórmula não é exercitada. Não dar a M1 por verificada com esse teste
-- degenerado — a auto-auditoria da M1 fecha junto com a M2.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1) Dimensão de taxas
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analytics.dim_taxa_cdi (
  mes           date          PRIMARY KEY,          -- 1º dia do mês de competência
  -- Fração decimal do mês (0.010500 = 1,05% a.m.), NUNCA percentual: a conta
  -- virtual multiplica por (1 + taxa) e um /100 espalhado pelo código seria a
  -- próxima divergência. A ingestão (M2) converte na borda.
  taxa          numeric(10,8) NOT NULL,
  origem        text          NOT NULL DEFAULT 'bacen_sgs',
  atualizado_em timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT dim_taxa_cdi_mes_e_primeiro_dia CHECK (mes = date_trunc('month', mes)::date),
  -- CDI mensal fora de [−100%, +100%] é erro de ingestão, não dado.
  CONSTRAINT dim_taxa_cdi_taxa_plausivel     CHECK (taxa > -1 AND taxa < 1)
);

COMMENT ON TABLE  analytics.dim_taxa_cdi IS
  'Série mensal do CDI (fração decimal). Alimentada pela ingestão da API SGS do BACEN (v5.5.0/M2).';
COMMENT ON COLUMN analytics.dim_taxa_cdi.taxa IS
  'Fração decimal do mês: 0.010500 = 1,05% a.m. Nunca percentual.';

-- RLS ligada e deny-by-default, como toda tabela do projeto (0123): o app nunca
-- acessa tabela direto, mas a camada fica fechada.
ALTER TABLE analytics.dim_taxa_cdi ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2) A conta virtual, uma linha por operação
-- ---------------------------------------------------------------------------
-- `WITH RECURSIVE` é obrigatório porque a CTE `rec` se auto-referencia; o
-- qualificador vale para a cláusula WITH inteira, então as CTEs não-recursivas
-- convivem com ele sem mudança.
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
-- Taxa por mês, resolvida UMA vez sobre os meses distintos da grade (dezenas),
-- não uma vez por linha de operação. Regra única, e ela precisa ser única:
--   1º a taxa do próprio mês;
--   2º na falta dela, a última conhecida ANTES dele (carry-forward — é o que
--      cobre o mês corrente e os futuros, que é a premissa do briefing, e também
--      tapa buraco no meio da série sem zerar o mês);
--   3º antes do início da série, a primeira conhecida.
-- A MESMA regra vive em public.get_taxas_cdi. Se as duas divergirem, a coluna e o
-- gráfico param de convergir e o usuário vê dois números vizinhos discordando.
taxa_por_mes AS (
  SELECT
    mg.mes,
    COALESCE(
      (SELECT c.taxa FROM analytics.dim_taxa_cdi c WHERE c.mes <= mg.mes ORDER BY c.mes DESC LIMIT 1),
      (SELECT c.taxa FROM analytics.dim_taxa_cdi c ORDER BY c.mes ASC LIMIT 1)
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

COMMENT ON VIEW analytics.vw_rendimento_float_operacao IS
  'Rendimento potencial do float por operação (conta virtual a 100% do CDI, composta e '
  'simétrica). Fonte única dos três pontos de UI da v5.5.0 — coluna, drawer e gráfico saem '
  'daqui, então os números não podem divergir entre si por construção.';

-- ⚠️ Mês faltante NÃO zera a taxa daquele mês: o carry-forward acima repete a
-- última conhecida. Zerar seria pior que errar por pouco — um buraco de um mês
-- deprimiria o indicador da operação inteira e ninguém veria por quê. Com a
-- tabela VAZIA (estado real entre esta migration e a M2 rodar) a taxa fica NULL e
-- o indicador sai NULL — travessão, invariante 5 do briefing. A get_rendimento_float
-- abaixo, por ser consulta direta do drawer, falha ALTO nesse mesmo estado
-- (invariante 9): a divergência é deliberada — a tela lista degrada em silêncio
-- honesto, a consulta pontual grita.

-- ---------------------------------------------------------------------------
-- 3) Leitura do float (drawer e conferência) — padrão INLINE (v4.29+)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_rendimento_float(p_operacao text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
  v_tem_taxa boolean;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['performance/weddings']);

  SELECT EXISTS (SELECT 1 FROM analytics.dim_taxa_cdi) INTO v_tem_taxa;
  IF NOT v_tem_taxa THEN
    -- Invariante 9 do briefing: falha EXPLÍCITA só quando NENHUMA taxa existe.
    -- Silenciar aqui devolveria zero — indistinguível de "esta operação não rende".
    RAISE EXCEPTION 'dim_taxa_cdi vazia: a ingestão do CDI (BACEN/SGS) nunca rodou'
      USING ERRCODE = 'no_data_found';
  END IF;

  SELECT jsonb_build_object(
    'taxa_vigente_mes', to_char((SELECT MAX(mes) FROM analytics.dim_taxa_cdi), 'YYYY-MM-DD'),
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

-- ---------------------------------------------------------------------------
-- 4) Série de taxas para o gráfico — padrão INLINE
-- ---------------------------------------------------------------------------
-- O gráfico NÃO recebe a curva virtual pronta: juro composto depende do saldo
-- inicial, e o slider rebaseia o acumulado na borda esquerda da janela (0141 +
-- src/lib/weddings/janela-fluxo.ts). Fatiar uma curva pronta daria a curva errada
-- em toda posição do slider menos a default. O cliente já tem o fluxo mensal
-- (derivado da diferença de acumulados); o que falta é a TAXA de cada mês —
-- igual para toda operação e todo filtro, buscada uma vez, sem refetch ao
-- arrastar (invariante 7 do briefing).
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
    'taxa_vigente_mes', to_char((SELECT MAX(mes) FROM analytics.dim_taxa_cdi), 'YYYY-MM-DD'),
    'meses', COALESCE(
      (SELECT jsonb_agg(
         jsonb_build_object(
           'mes',    to_char(m.mes, 'YYYY-MM-DD'),
           -- MESMA regra da analytics.vw_rendimento_float_operacao, nesta ordem:
           -- taxa do próprio mês → carry-forward da última anterior → primeira da
           -- série. Divergir daqui quebra a convergência coluna × gráfico.
           -- SEM fallback para 0, pelo mesmo motivo da view: tabela vazia devolve
           -- taxa NULL, e o cliente não desenha uma curva plana falsa.
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
           (SELECT taxa FROM analytics.dim_taxa_cdi WHERE mes <= m.mes ORDER BY mes DESC LIMIT 1) AS taxa_carregada,
           (SELECT taxa FROM analytics.dim_taxa_cdi ORDER BY mes ASC LIMIT 1)                     AS taxa_primeira_serie
       ) b
       LEFT JOIN analytics.dim_taxa_cdi t ON t.mes = m.mes),
      '[]'::jsonb
    )
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_taxas_cdi(integer, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_taxas_cdi(integer, integer) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
