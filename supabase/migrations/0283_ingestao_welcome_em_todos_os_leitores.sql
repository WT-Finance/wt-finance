-- ---------------------------------------------------------------------------
-- 0283 — feat(v6.0.0/M7a): Welcome em TODOS os leitores de raw.vendas_excel
--        anexo v6.0.0/M7 §2 (desenho), decisão 8 do briefing v6.0.0, divergência D10
--
-- DECLARAÇÃO PRÉVIA (regime aditivo / autônomo):
--   • O QUE FAZ: a 0277 (M5) pôs o filtro `setor_macro IS DISTINCT FROM 'Welcome'` numa view
--     (`analytics.vendas_excel_para_fato`) e trocou só `transform_raw_to_analytics()` para lê-la.
--     Enumerados no catálogo VIVO em 25/09/2026 (pg_get_functiondef/pg_get_viewdef; dump insumo
--     desta missão, fora do repositório), **seis** objetos ainda liam `raw.vendas_excel`
--     diretamente — cada um vira `CREATE OR REPLACE` (função) ou `CREATE OR REPLACE VIEW`, corpo
--     BYTE A BYTE o do catálogo vivo, com a ÚNICA mudança sendo `raw.vendas_excel` →
--     `analytics.vendas_excel_para_fato` em cada ocorrência de LEITURA (alias preservado):
--
--       1. analytics.regenerar_dim_operacao_weddings()                        — 3 ocorrências
--       2. public.contar_convidados_operacao(text)                           — 1 ocorrência
--       3. public.get_carteira_weddings__nucleo(text)                        — 2 ocorrências
--       4. public.get_operacao_weddings__nucleo(text)                        — 3 ocorrências
--       5. public.get_operacoes_weddings__nucleo(text,date,date,text,text,
--          text,text,integer,integer)                                       — 3 ocorrências
--       6. analytics.vw_vendas_agregadas (VIEW)                              — 1 ocorrência
--                                                                    TOTAL:    13 ocorrências
--
--     Todas as 13 ocorrências são `FROM raw.vendas_excel <alias>` (leitura pura, dentro de CTE ou
--     de subquery) — nenhuma é escrita (INSERT/UPDATE/DELETE contra `raw.vendas_excel`). Conferido
--     ocorrência a ocorrência contra o dump antes de escrever este arquivo; nenhuma ambígua.
--
--     Também atualiza o `COMMENT ON VIEW analytics.vendas_excel_para_fato` (0277): hoje ele diz só
--     que `transform_raw_to_analytics()` a lê; passa a dizer que TODOS os consumidores de Vendas
--     por Produto — o transform e os seis objetos acima — leem por ela.
--
--   • POR QUE EXISTE: medido nos anexos crus de 21/09 (a tabela viva tem ZERO Welcome hoje —
--     "diff = 0" contra ela não prova nada): das 210 linhas Welcome, 5 têm `operacao_propria`
--     preenchida em 4 operações que também existem fora de Welcome (duas casamentos, duas de
--     grupos), 47 são "Diárias de Hospedagem", 141 vendas distintas, 4 "Aberta", 7 com receita
--     negativa; nenhuma venda mistura item Welcome e não-Welcome. Sem esta migration, a primeira
--     carga de Vendas da M9 mudaria número em Weddings (Lista de Operações, carteira, convidados)
--     e em Vendas em Aberto (`vw_vendas_agregadas`, `cruzar_vendas_setor`) — violação do
--     invariante 1. O plano da Fase 3 (divergência D10) já pedia o mesmo filtro em
--     `regenerar_dim_operacao_weddings`; esta migration fecha essa divergência junto.
--
--   • NO-OP SOBRE O DADO DE HOJE: `raw.vendas_excel` em produção tem ZERO linhas Welcome (o card
--     antigo subia o arquivo já tratado pelo script R) — a view devolve exatamente as mesmas
--     linhas que a tabela hoje, então nenhum dos seis leitores muda de número nesta aplicação. O
--     filtro só passa a excluir algo quando a PRÓXIMA carga de Vendas (cru não-tratado, M9) for
--     promovida — é aí que esta migration paga o efeito pretendido.
--
--   • ADITIVA / RETROCOMPATÍVEL: só `CREATE OR REPLACE FUNCTION` com assinatura IDÊNTICA (nenhuma
--     ganha nem perde parâmetro) e `CREATE OR REPLACE VIEW` com a MESMA lista de colunas, mesma
--     ordem, mesmos tipos (Postgres exige — e é o caso aqui, já que só o FROM muda). Nenhum DROP,
--     nenhum TRUNCATE, nenhum UPDATE/DELETE em dado existente. ACL/dono/SECURITY DEFINER
--     preservados pelo próprio `CREATE OR REPLACE` (mesma assinatura ⇒ mesmo OID de função; a view
--     mantém a mesma lista de colunas). Para as CINCO funções, o precedente da casa é MISTO — a
--     0269 e a 0277 não redeclaram GRANT/REVOKE ao repontar corpo, a 0282 redeclara — e aqui optei
--     por NÃO redeclarar (nenhuma delas ganha/perde grant; conferido linha a linha contra o
--     cabeçalho do dump vivo de cada objeto, abaixo). **Exceção: a VIEW.** A skill banco-e-rpc §5
--     tem um ⚠️ explícito para o padrão "repontar por `CREATE OR REPLACE VIEW`": redeclarar
--     REVOKE/GRANT MESMO sabendo que o Postgres preserva a ACL (precedente 0197/0206) — então
--     `analytics.vw_vendas_agregadas` GANHA um `REVOKE ALL ... FROM PUBLIC, anon, authenticated`
--     explícito logo após o `CREATE OR REPLACE VIEW` (seção 6 abaixo). É no-op sobre o ACL de HOJE
--     (que já é só o dono — `acl={postgres=arwdDxtm/postgres}`, nenhum PUBLIC/anon/authenticated
--     para revogar) e é ADITIVO (REVOKE de privilégio que ninguém tem não remove nada; é
--     endurecimento declarado, mesma classe do REVOKE global da 0122):
--       1. analytics.regenerar_dim_operacao_weddings() — secdef=false, dono=postgres,
--          acl=["postgres=X/postgres"]
--       2. public.contar_convidados_operacao(text) — secdef=true (STABLE SECURITY DEFINER),
--          dono=postgres, acl=["postgres=X/postgres","service_role=X/postgres"]
--       3. public.get_carteira_weddings__nucleo(text) — secdef=true, dono=postgres,
--          acl=["postgres=X/postgres","service_role=X/postgres"]
--       4. public.get_operacao_weddings__nucleo(text) — secdef=true, dono=postgres,
--          acl=["postgres=X/postgres","service_role=X/postgres"]
--       5. public.get_operacoes_weddings__nucleo(...) — secdef=true, dono=postgres,
--          acl=["postgres=X/postgres","service_role=X/postgres"]
--       6. analytics.vw_vendas_agregadas — dono=postgres, acl={postgres=arwdDxtm/postgres} (só o
--          dono tem privilégio; nenhum outro papel a acessa direto — é lida via as RPCs que a
--          consomem, ex. `cruzar_vendas_setor`)
--
--   • Nota de desempenho: `analytics.vendas_excel_para_fato` é um `SELECT * … WHERE` simples sobre
--     uma tabela base (sem CTE recursiva, sem agregação, sem JOIN) — inlineável pelo planner
--     (confirmado lendo a definição na 0277); os seis objetos que passam a lê-la não ganham custo
--     de execução adicional além do predicado extra `setor_macro IS DISTINCT FROM 'Welcome'`, que
--     roda sobre a MESMA tabela que já liam.
--
--   • Enforcement mecânico (nesta missão): `src/lib/ingestao/sonda-leitores-vendas-excel.test.ts`
--     — sonda de catálogo read-only que reprova qualquer leitor NOVO de `raw.vendas_excel` fora de
--     uma lista fechada (os escritores/carregadores do pipeline + a própria view
--     `analytics.vendas_excel_para_fato`). Antes desta migration ser aplicada, a sonda reprova de
--     propósito (os seis ainda leem a tabela) — comentário no topo do arquivo de teste explica
--     isso. `transform_raw_to_analytics()` NÃO entra na lista fechada: desde a 0277 seu corpo já
--     não cita `raw.vendas_excel` (só a view) — mantê-lo pré-allowlistado cegaria a sonda para a
--     MESMA regressão que a skill banco-e-rpc §5 documenta (corpo reescrito do catálogo errado
--     perde a view em silêncio). Achado corrigido nesta missão: o anexo v6.0.0/M7 §2 supunha que
--     o corpo vivo do transform ainda citava a tabela — não cita (conferido no dump vivo).
--
--   • Reversão (manual, destrutiva — cita o que precisaria ser refeito, não aplica nada aqui):
--       reaplicar, para cada um dos seis objetos, o corpo do CATÁLOGO VIVO anterior a esta
--       migration (dump `molde-vivo-m7.sql` entregue para a missão M7, 25/09/2026, fora do
--       repositório). Sem o dump, NÃO adianta reintrospectar esperando o corpo anterior: depois
--       desta migration o catálogo devolve o corpo NOVO. O caminho é pegar o `pg_get_functiondef`/
--       `pg_get_viewdef` ATUAL e inverter a troca `analytics.vendas_excel_para_fato` →
--       `raw.vendas_excel` — mecânico e seguro, porque a troca é a ÚNICA diferença (13 ocorrências,
--       contadas acima; achado BAIXO do `revisor-db`). Skill banco-e-rpc: "CREATE OR REPLACE se escreve do catálogo vivo, nunca da
--       migration de origem"). Como referência adicional (não autoritativa — o dump vivo é a
--       verdade), a última migration que tocou o CORPO de cada objeto antes desta:
--         analytics.regenerar_dim_operacao_weddings()  → 0112
--         public.contar_convidados_operacao(text)      → 0109
--         public.get_carteira_weddings__nucleo(text)   → 0111 (corpo; renomeado p/ __nucleo na 0121)
--         public.get_operacao_weddings__nucleo(text)   → 0113 (corpo; renomeado p/ __nucleo na 0121)
--         public.get_operacoes_weddings__nucleo(...)   → 0246 (corpo; renomeado p/ __nucleo na 0121 —
--           CONFERIDO: 0113/0121 são anteriores, mas 0228/0241/0246 redefinem o corpo DEPOIS do
--           rename direto sob o nome __nucleo; 0246 é a mais alta e bate com os comentários
--           v5.4.2/v5.5.0/v5.5.1 presentes no corpo vivo)
--         analytics.vw_vendas_agregadas                → 0040 (única definição desde a criação)
--       E reverter o COMMENT ON VIEW ao texto da 0277.
-- ---------------------------------------------------------------------------

-- ═════════════════════════════════════════════════════════════════════════════════════
-- 1. analytics.regenerar_dim_operacao_weddings() — 3 ocorrências trocadas
-- ═════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION analytics.regenerar_dim_operacao_weddings()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_count int;
BEGIN
  TRUNCATE analytics.dim_operacao_weddings;

  INSERT INTO analytics.dim_operacao_weddings (
    operacao,
    nome_casal,
    data_evento,
    situacao,
    hotel,
    data_venda_contrato,
    faturamento,
    receita_bruta,
    entradas_total,
    saidas_total,
    recebido,
    a_receber,
    pago,
    a_pagar,
    custos_internos,
    margem_bruta_pct,
    margem_liquida_pct,
    atualizado_em
  )
  WITH

  lanc AS (
    SELECT
      operacao,
      SUM(CASE WHEN tipo   = 'Entrada'          THEN valor ELSE 0 END) AS entradas_total,
      SUM(CASE WHEN tipo   = 'Saída'            THEN valor ELSE 0 END) AS saidas_total,
      SUM(CASE WHEN status = 'Entrada'          THEN valor ELSE 0 END) AS recebido,
      SUM(CASE WHEN status = 'A Receber Futuro' THEN valor ELSE 0 END) AS a_receber,
      SUM(CASE WHEN status = 'Saída'            THEN valor ELSE 0 END) AS pago,
      SUM(CASE WHEN status = 'A Pagar Futuro'   THEN valor ELSE 0 END) AS a_pagar
    FROM analytics.fato_lancamento_operacao
    GROUP BY operacao
  ),

  -- data_evento/data_venda_contrato da linha 'Contrato de casamento' (v4.9.1/0110).
  contrato_info AS (
    SELECT DISTINCT ON (r.operacao_propria)
      r.operacao_propria       AS operacao,
      r.data_inicio_evento,
      r.data_venda             AS data_venda_contrato,
      NULLIF(r.fornecedor, '') AS hotel
    FROM analytics.vendas_excel_para_fato r
    WHERE r.produto = 'Contrato de casamento'
      AND r.operacao_propria IS NOT NULL
      AND r.operacao_propria <> ''
    ORDER BY r.operacao_propria, r.id
  ),

  -- v4.9.2: hotel via operacao_propria (fornecedor da hospedagem/pacote da operação).
  -- 'Diárias de Hospedagem' (1) → 'Pacote de Casamento' (2).
  hotel_por_produto AS (
    SELECT DISTINCT ON (r.operacao_propria)
      r.operacao_propria AS operacao,
      r.fornecedor       AS hotel
    FROM analytics.vendas_excel_para_fato r
    WHERE r.operacao_propria IS NOT NULL
      AND r.operacao_propria <> ''
      AND r.produto IN ('Diárias de Hospedagem', 'Pacote de Casamento')
      AND r.fornecedor IS NOT NULL
      AND r.fornecedor <> ''
    ORDER BY r.operacao_propria,
      CASE r.produto
        WHEN 'Diárias de Hospedagem' THEN 1
        WHEN 'Pacote de Casamento'   THEN 2
        ELSE 99
      END,
      r.id
  ),

  -- v4.9.2: faturamento/receita = soma da operação por operacao_propria (todos
  -- os produtos/setores). Substitui o join por venda_n, que contaminava e duplicava.
  vendas_agg AS (
    SELECT
      r.operacao_propria                AS operacao,
      COALESCE(SUM(r.valor_total), 0)   AS faturamento,
      COALESCE(SUM(r.receitas),    0)   AS receita_bruta
    FROM analytics.vendas_excel_para_fato r
    WHERE r.operacao_propria IS NOT NULL
      AND r.operacao_propria <> ''
    GROUP BY r.operacao_propria
  )

  SELECT
    l.operacao,
    analytics.extrair_nome_casal(l.operacao)                                      AS nome_casal,
    ci.data_inicio_evento                                                          AS data_evento,
    CASE
      WHEN ci.data_inicio_evento IS NULL        THEN 'sem_data'
      WHEN ci.data_inicio_evento < CURRENT_DATE THEN 'passado'
      ELSE 'futuro'
    END                                                                            AS situacao,
    COALESCE(ci.hotel, hpb.hotel)                                                  AS hotel,
    ci.data_venda_contrato,
    COALESCE(v.faturamento,   0)                                                   AS faturamento,
    COALESCE(v.receita_bruta, 0)                                                   AS receita_bruta,
    l.entradas_total,
    l.saidas_total,
    l.recebido,
    l.a_receber,
    l.pago,
    l.a_pagar,
    GREATEST(COALESCE(v.receita_bruta, 0) - (l.entradas_total - l.saidas_total), 0)
                                                                                   AS custos_internos,
    CASE WHEN COALESCE(v.faturamento, 0) > 0
      THEN ROUND(COALESCE(v.receita_bruta, 0) / v.faturamento * 100, 1)
      ELSE 0 END                                                                   AS margem_bruta_pct,
    CASE WHEN COALESCE(v.faturamento, 0) > 0
      THEN ROUND((l.entradas_total - l.saidas_total) / v.faturamento * 100, 1)
      ELSE 0 END                                                                   AS margem_liquida_pct,
    now()                                                                          AS atualizado_em

  FROM lanc l
  LEFT JOIN contrato_info    ci  ON ci.operacao  = l.operacao
  LEFT JOIN hotel_por_produto hpb ON hpb.operacao = l.operacao
  LEFT JOIN vendas_agg        v   ON v.operacao   = l.operacao;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $function$
;

-- ═════════════════════════════════════════════════════════════════════════════════════
-- 2. public.contar_convidados_operacao(text) — 1 ocorrência trocada
-- ═════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.contar_convidados_operacao(p_operacao text)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  WITH passageiros_raw AS (
    SELECT unnest(string_to_array(v.passageiros, ',')) AS nome
    FROM analytics.vendas_excel_para_fato v
    WHERE v.operacao_propria = p_operacao
      AND v.produto = 'Diárias de Hospedagem'
      AND v.passageiros IS NOT NULL
      AND trim(v.passageiros) != ''
  ),
  normalizados AS (
    SELECT DISTINCT
      regexp_replace(
        lower(pg_catalog.unaccent(trim(nome))),
        '\s+', ' ', 'g'
      ) AS nome_norm
    FROM passageiros_raw
    WHERE trim(nome) != ''
  )
  SELECT COUNT(*)::INTEGER FROM normalizados;
$function$
;

-- ═════════════════════════════════════════════════════════════════════════════════════
-- 3. public.get_carteira_weddings__nucleo(text) — 2 ocorrências trocadas
-- ═════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_carteira_weddings__nucleo(p_metric text DEFAULT 'casamentos'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_result jsonb;
  v_metric text;
BEGIN
  v_metric := CASE
    WHEN p_metric IN ('casamentos', 'faturamento', 'receita_bruta') THEN p_metric
    ELSE 'casamentos'
  END;

  WITH
  -- 1 linha por casamento: a linha 'Contrato de casamento' da base de Vendas.
  contrato AS (
    SELECT DISTINCT ON (operacao_propria)
      operacao_propria,
      data_venda          AS data_venda_contrato,
      data_inicio_evento  AS data_evento
    FROM analytics.vendas_excel_para_fato
    WHERE produto = 'Contrato de casamento'
      AND operacao_propria IS NOT NULL
      AND operacao_propria <> ''
    ORDER BY operacao_propria, id
  ),
  -- faturamento/receita da operação = soma de TODOS os produtos da Operação Própria.
  financeiro AS (
    SELECT
      operacao_propria,
      COALESCE(SUM(valor_total), 0) AS faturamento,
      COALESCE(SUM(receitas),    0) AS receita_bruta
    FROM analytics.vendas_excel_para_fato
    WHERE operacao_propria IS NOT NULL
      AND operacao_propria <> ''
    GROUP BY operacao_propria
  ),
  base AS (
    SELECT
      EXTRACT(YEAR FROM c.data_venda_contrato)::int                AS ano_venda,
      EXTRACT(YEAR FROM c.data_evento)::int                        AS ano_casamento_num,
      COALESCE(EXTRACT(YEAR FROM c.data_evento)::text, 'sem_data') AS ano_casamento,
      CASE v_metric
        WHEN 'faturamento'   THEN f.faturamento
        WHEN 'receita_bruta' THEN f.receita_bruta
        ELSE 1
      END AS valor
    FROM contrato c
    LEFT JOIN financeiro f ON f.operacao_propria = c.operacao_propria
    WHERE c.data_venda_contrato IS NOT NULL
  ),
  celulas AS (
    SELECT
      ano_venda,
      ano_casamento_num,
      ano_casamento,
      CASE v_metric
        WHEN 'casamentos' THEN COUNT(*)::numeric
        ELSE SUM(valor)
      END AS v
    FROM base
    GROUP BY ano_venda, ano_casamento_num, ano_casamento
  ),
  anos_casamento_arr AS (
    SELECT array_agg(ano_casamento ORDER BY ano_casamento_num NULLS LAST, ano_casamento) AS arr
    FROM (SELECT DISTINCT ano_casamento, ano_casamento_num FROM celulas) t
  ),
  linhas AS (
    SELECT
      ano_venda::text AS av,
      jsonb_object_agg(ano_casamento, v) AS valores,
      SUM(v) AS total
    FROM celulas
    GROUP BY ano_venda
  ),
  totais_col AS (
    SELECT ano_casamento, SUM(v) AS col_total
    FROM celulas
    GROUP BY ano_casamento
  ),
  total_row AS (
    SELECT
      jsonb_object_agg(ano_casamento, col_total) AS valores,
      SUM(col_total) AS total
    FROM totais_col
  ),
  linhas_json AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object('ano_venda', av, 'valores', valores, 'total', total)
        ORDER BY sort_key, av
      ),
      '[]'::jsonb
    ) AS linhas
    FROM (
      SELECT av, valores, total, 1 AS sort_key FROM linhas
      UNION ALL
      SELECT 'total', valores, total, 2 FROM total_row WHERE total IS NOT NULL
    ) combined
  )
  SELECT jsonb_build_object(
    'metrica',        v_metric,
    'anos_casamento', COALESCE((SELECT to_jsonb(arr) FROM anos_casamento_arr), '[]'::jsonb),
    'linhas',         (SELECT linhas FROM linhas_json)
  )
  INTO v_result;

  RETURN v_result;
END $function$
;

-- ═════════════════════════════════════════════════════════════════════════════════════
-- 4. public.get_operacao_weddings__nucleo(text) — 3 ocorrências trocadas
-- ═════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_operacao_weddings__nucleo(p_operacao text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_dim           analytics.dim_operacao_weddings%ROWTYPE;
  v_situacao      text;
  v_faturamento   numeric;
  v_receita       numeric;
  v_tipo_contrato text;
  v_convidados    integer;
  v_decomp        jsonb;
  v_acumulado     jsonb;
BEGIN
  SELECT * INTO v_dim FROM analytics.dim_operacao_weddings WHERE operacao = p_operacao;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Operação não encontrada'); END IF;

  v_situacao := analytics.situacao_por_data_evento(v_dim.data_evento);

  -- Faturamento / Receita totais da operação (vendas distintas vinculadas)
  SELECT COALESCE(SUM(valor_total), 0), COALESCE(SUM(receitas), 0)
  INTO v_faturamento, v_receita
  FROM analytics.vendas_excel_para_fato
  WHERE operacao_propria = p_operacao AND operacao_propria <> '';

  -- Tipo de contrato: última venda com contrato=TRUE da operação
  -- (mesma lógica do tipo_contrato_cte de get_operacoes_weddings).
  SELECT v.tipo_contrato
  INTO v_tipo_contrato
  FROM analytics.vendas_excel_para_fato v
  WHERE v.operacao_propria = p_operacao
    AND v.produto = 'Contrato de casamento'
  ORDER BY v.data_venda DESC
  LIMIT 1;

  -- Convidados (mesma função usada na Lista de Operações).
  v_convidados := public.contar_convidados_operacao(p_operacao);

  -- decomposicao_subsetor no formato SumarioSubsetorItem
  -- (faturamento, receita, margem_pct, pct_faturamento) + NÃO_CLASSIFICADO sempre.
  SELECT jsonb_agg(
           jsonb_build_object(
             'subsetor',        sub.subsetor,
             'faturamento',     sub.faturamento,
             'receita',         sub.receita,
             'margem_pct',      CASE WHEN sub.faturamento > 0
                                  THEN ROUND(sub.receita / sub.faturamento * 100, 1)
                                  ELSE 0 END,
             'pct_faturamento', CASE WHEN sub.total_faturamento > 0
                                  THEN ROUND(sub.faturamento / sub.total_faturamento * 100, 1)
                                  ELSE 0 END
           )
           ORDER BY sub.faturamento DESC
         )
  INTO v_decomp
  FROM (
    SELECT
      COALESCE(dps.subsetor, 'NÃO_CLASSIFICADO')               AS subsetor,
      COALESCE(SUM(r.valor_total), 0)                          AS faturamento,
      COALESCE(SUM(r.receitas), 0)                             AS receita,
      SUM(COALESCE(SUM(r.valor_total), 0)) OVER ()             AS total_faturamento
    FROM analytics.vendas_excel_para_fato r
    LEFT JOIN analytics.dim_produto_subsetor dps
           ON dps.produto_normalizado = UPPER(TRIM(r.produto))
    WHERE r.operacao_propria = p_operacao AND r.operacao_propria <> ''
    GROUP BY COALESCE(dps.subsetor, 'NÃO_CLASSIFICADO')
  ) sub;

  -- acumulado_mensal: curva CONTÍNUA, ENTRADAS e SAÍDAS separadas.
  --   • Efetivo  → só lançamentos LIQUIDADOS, agregados por mês de liquidacao_dt;
  --                NULL nos meses futuros (> mês atual).
  --   • Projetado→ por mês de COALESCE(liquidacao_dt, vencimento_dt) (inclui futuro).
  --   • Acumulados (running sum) sobre a série contínua de meses (generate_series
  --     do min..max observado).
  SELECT jsonb_agg(
           jsonb_build_object(
             'mes',               TO_CHAR(s.mes, 'YYYY-MM'),
             'entrada_efetiva',   CASE WHEN s.mes > DATE_TRUNC('month', CURRENT_DATE)
                                       THEN NULL ELSE s.entrada_efetiva END,
             'entrada_projetada', s.entrada_projetada,
             'saida_efetiva',     CASE WHEN s.mes > DATE_TRUNC('month', CURRENT_DATE)
                                       THEN NULL ELSE s.saida_efetiva END,
             'saida_projetada',   s.saida_projetada,
             'eh_futuro',         s.mes > DATE_TRUNC('month', CURRENT_DATE)
           )
           ORDER BY s.mes
         )
  INTO v_acumulado
  FROM (
    SELECT
      gs.mes,
      SUM(COALESCE(pe.entrada_efetiva,   0)) OVER (ORDER BY gs.mes) AS entrada_efetiva,
      SUM(COALESCE(pp.entrada_projetada, 0)) OVER (ORDER BY gs.mes) AS entrada_projetada,
      SUM(COALESCE(pe.saida_efetiva,     0)) OVER (ORDER BY gs.mes) AS saida_efetiva,
      SUM(COALESCE(pp.saida_projetada,   0)) OVER (ORDER BY gs.mes) AS saida_projetada
    FROM (
      SELECT generate_series(r.mes_min, r.mes_max, INTERVAL '1 month')::date AS mes
      FROM (
        SELECT
          DATE_TRUNC('month', MIN(COALESCE(liquidacao_dt, vencimento_dt)))::date AS mes_min,
          DATE_TRUNC('month', MAX(COALESCE(liquidacao_dt, vencimento_dt)))::date AS mes_max
        FROM analytics.fato_lancamento_operacao
        WHERE operacao = p_operacao
          AND COALESCE(liquidacao_dt, vencimento_dt) IS NOT NULL
      ) r
      WHERE r.mes_min IS NOT NULL
    ) gs
    LEFT JOIN (
      -- EFETIVO por mês de liquidação (só liquidados), entradas e saídas separadas
      SELECT
        DATE_TRUNC('month', liquidacao_dt)::date AS mes,
        SUM(CASE WHEN tipo = 'Entrada' THEN valor ELSE 0 END) AS entrada_efetiva,
        SUM(CASE WHEN tipo = 'Saída'   THEN valor ELSE 0 END) AS saida_efetiva
      FROM analytics.fato_lancamento_operacao
      WHERE operacao = p_operacao AND liquidacao_dt IS NOT NULL
      GROUP BY DATE_TRUNC('month', liquidacao_dt)::date
    ) pe ON pe.mes = gs.mes
    LEFT JOIN (
      -- PROJETADO por mês de COALESCE(liquidacao, vencimento), entradas e saídas separadas
      SELECT
        DATE_TRUNC('month', COALESCE(liquidacao_dt, vencimento_dt))::date AS mes,
        SUM(CASE WHEN tipo = 'Entrada' THEN valor ELSE 0 END) AS entrada_projetada,
        SUM(CASE WHEN tipo = 'Saída'   THEN valor ELSE 0 END) AS saida_projetada
      FROM analytics.fato_lancamento_operacao
      WHERE operacao = p_operacao
        AND COALESCE(liquidacao_dt, vencimento_dt) IS NOT NULL
      GROUP BY DATE_TRUNC('month', COALESCE(liquidacao_dt, vencimento_dt))::date
    ) pp ON pp.mes = gs.mes
  ) s;

  RETURN jsonb_build_object(
    'operacao',            v_dim.operacao,
    'nome_casal',          v_dim.nome_casal,
    'data_evento',         v_dim.data_evento,
    'situacao',            v_situacao,
    'hotel',               v_dim.hotel,
    'tipo_contrato',       v_tipo_contrato,
    'convidados',          v_convidados,
    'data_venda_contrato', TO_CHAR(v_dim.data_venda_contrato, 'YYYY-MM-DD'),
    'visao_financeira', jsonb_build_object(
      'faturamento',        v_faturamento,
      'receita_bruta',      v_receita,
      'margem_pct',         CASE WHEN v_faturamento > 0
                              THEN ROUND(v_receita / v_faturamento * 100, 1) ELSE 0 END,
      'custos_internos',    v_dim.custos_internos,
      'margem_liquida_pct', v_dim.margem_liquida_pct,
      'entradas_total',     v_dim.entradas_total,
      'recebido',           v_dim.recebido,
      'a_receber',          v_dim.a_receber,
      'saidas_total',       v_dim.saidas_total,
      'pago',               v_dim.pago,
      'a_pagar',            v_dim.a_pagar,
      'resultado_caixa',    v_dim.resultado_caixa,
      'resultado_pct',      CASE WHEN v_dim.entradas_total > 0
                              THEN ROUND(v_dim.resultado_caixa / v_dim.entradas_total * 100, 1) ELSE 0 END,
      'ncg',                v_dim.ncg
    ),
    'decomposicao_subsetor', COALESCE(v_decomp, '[]'::jsonb),
    'acumulado_mensal',      COALESCE(v_acumulado, '[]'::jsonb)
  );
END $function$
;

-- ═════════════════════════════════════════════════════════════════════════════════════
-- 5. public.get_operacoes_weddings__nucleo(...) — 3 ocorrências trocadas
--    (todas dentro do texto de SQL dinâmico $q$...$q$ atribuído a v_sql/executado por EXECUTE —
--    a troca vale igual: é texto de LEITURA, `FROM raw.vendas_excel <alias>`, alias preservado)
-- ═════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_operacoes_weddings__nucleo(p_status text DEFAULT 'todos'::text, p_periodo_inicio date DEFAULT NULL::date, p_periodo_fim date DEFAULT NULL::date, p_subsetor text DEFAULT 'todos'::text, p_busca text DEFAULT NULL::text, p_ordenar_por text DEFAULT 'data_evento'::text, p_direcao text DEFAULT 'desc'::text, p_pagina integer DEFAULT 1, p_por_pagina integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_offset     int := (GREATEST(p_pagina, 1) - 1) * LEAST(GREATEST(p_por_pagina, 1), 200);
  v_limit      int := LEAST(GREATEST(p_por_pagina, 1), 200);
  v_order_col  text;
  v_order_dir  text;
  v_operacoes  jsonb;
  v_sql        text;
BEGIN
  v_order_col := CASE p_ordenar_por
    WHEN 'nome_casal'    THEN 'd_nome_casal'
    WHEN 'hotel'         THEN 'd_hotel'
    WHEN 'faturamento'   THEN 'v_faturamento'
    WHEN 'receita'       THEN 'v_receita'
    WHEN 'margem'        THEN 'v_margem'
    WHEN 'custos'        THEN 'd_custos_internos'
    WHEN 'resultado'     THEN 'd_resultado_caixa'
    WHEN 'ml'            THEN 'd_margem_liquida'
    WHEN 'margem_aa'     THEN 'd_margem_aa'
    WHEN 'rend_float'    THEN 'd_rend_float'
    WHEN 'margem_teorica_aa' THEN 'd_margem_teorica_aa'
    WHEN 'duracao'       THEN 'd_duracao'
    WHEN 'tipo_contrato' THEN 'd_tipo_contrato'
    WHEN 'convidados'    THEN 'd_convidados'
    ELSE 'd_data_evento'
  END;
  v_order_dir := CASE WHEN lower(p_direcao) = 'asc' THEN 'ASC' ELSE 'DESC' END;

  v_sql := $q$
    WITH vendas_op AS (
      -- v4.9.2: faturamento/receita por operacao_propria (Vendas), não venda_n.
      SELECT
        r.operacao_propria AS operacao,
        COALESCE(SUM(r.valor_total), 0) AS faturamento,
        COALESCE(SUM(r.receitas),    0) AS receita
      FROM analytics.vendas_excel_para_fato r
      WHERE r.operacao_propria IS NOT NULL AND r.operacao_propria <> ''
      GROUP BY r.operacao_propria
    ),
    subsetor_op AS (
      -- v4.9.2: subsetor predominante por operacao_propria (Vendas).
      SELECT DISTINCT ON (r.operacao_propria)
        r.operacao_propria AS operacao,
        COALESCE(dps.subsetor, 'NÃO_CLASSIFICADO') AS subsetor_predominante
      FROM analytics.vendas_excel_para_fato r
      LEFT JOIN analytics.dim_produto_subsetor dps
             ON dps.produto_normalizado = UPPER(TRIM(r.produto))
      WHERE r.operacao_propria IS NOT NULL AND r.operacao_propria <> ''
      ORDER BY r.operacao_propria,
               SUM(COALESCE(r.valor_total, 0)) OVER (
                 PARTITION BY r.operacao_propria, COALESCE(dps.subsetor, 'NÃO_CLASSIFICADO')
               ) DESC
    ),
    tipo_contrato_cte AS (
      -- v4.9.2: tipo de contrato da linha 'Contrato de casamento' por operacao_propria.
      SELECT DISTINCT ON (v.operacao_propria)
        v.operacao_propria AS operacao,
        v.tipo_contrato
      FROM analytics.vendas_excel_para_fato v
      WHERE v.produto = 'Contrato de casamento'
        AND v.operacao_propria IS NOT NULL AND v.operacao_propria <> ''
      ORDER BY v.operacao_propria, v.data_venda DESC
    ),
    base AS (
      SELECT
        d.operacao                                      AS d_operacao,
        d.nome_casal                                    AS d_nome_casal,
        d.data_evento                                   AS d_data_evento,
        d.situacao                                      AS d_situacao,
        d.entradas_total                                AS d_entradas_total,
        d.saidas_total                                  AS d_saidas_total,
        d.resultado_caixa                               AS d_resultado_caixa,
        d.ncg                                           AS d_ncg,
        d.hotel                                         AS d_hotel,
        d.data_venda_contrato                           AS d_data_venda_contrato,
        tc.tipo_contrato                                AS d_tipo_contrato,
        (d.data_evento - d.data_venda_contrato)         AS d_duracao,
        public.contar_convidados_operacao(d.operacao)   AS d_convidados,
        COALESCE(v.faturamento, 0)                      AS v_faturamento,
        COALESCE(v.receita, 0)                          AS v_receita,
        CASE WHEN COALESCE(v.faturamento, 0) > 0
          THEN ROUND(v.receita / v.faturamento * 100, 1)
          ELSE 0 END                                    AS v_margem,
        -- sem GREATEST: permite negativo para sinalizar anomalia
        -- Rec. Bruta − Custos = Rec. Líq. sempre
        COALESCE(v.receita, 0) - COALESCE(d.resultado_caixa, 0)
                                                        AS d_custos_internos,
        CASE WHEN COALESCE(v.faturamento, 0) > 0
          THEN ROUND(COALESCE(d.resultado_caixa, 0) / v.faturamento * 100, 1)
          ELSE 0 END                                    AS d_margem_liquida,
        -- v5.4.2: chave de ORDENAÇÃO da Margem a.a. (linear). Espelha byte a byte a
        -- fórmula do cliente (src/lib/weddings/margem-anualizada.ts):
        --   margem_liquida_pct × 12 / (dias / 30,44)
        -- O numerador reusa a MESMA expressão de d_margem_liquida (inclusive o ROUND
        -- para 1 casa e o ELSE 0 de faturamento zero) — se as duas divergirem, a lista
        -- ordena por um número diferente do que exibe. NULL só quando a duração não é
        -- anualizável (data ausente, duração zero ou negativa): NULL nunca virá 0, e o
        -- ORDER BY já usa NULLS LAST. `30.44` é numeric, então não há divisão inteira.
        CASE WHEN (d.data_evento - d.data_venda_contrato) > 0
          THEN (CASE WHEN COALESCE(v.faturamento, 0) > 0
                  THEN ROUND(COALESCE(d.resultado_caixa, 0) / v.faturamento * 100, 1)
                  ELSE 0 END) * 12 * 30.44
               / (d.data_evento - d.data_venda_contrato)
          ELSE NULL END                                 AS d_margem_aa,
        -- v5.5.0: Rendimento potencial do float. Diferente de d_margem_aa, este
        -- valor NÃO é derivável no cliente (série do CDI + composição mês a mês),
        -- então entra também no payload. LEFT JOIN: operação sem nenhum lançamento
        -- não aparece na view e o valor fica NULL — travessão na UI, nunca zero
        -- (zero significaria "rendeu nada", que é outra afirmação).
        rf.rendimento                                   AS d_rend_float,
        -- v5.5.1: margem TEÓRICA = (resultado + float) ÷ faturamento. Espelha byte a
        -- byte a expressão de `d_margem_liquida` acima, trocando só o numerador —
        -- inclusive o `ROUND(..., 1)` e o `ELSE 0` de faturamento zero. Se as duas
        -- divergirem, a coluna nova deixa de ser comparável com a que está ao lado.
        -- NULL (não 0) quando não há float: `travessão`, porque zero afirmaria que o
        -- float não mudou a margem, e o que se sabe é que não se sabe.
        CASE WHEN rf.rendimento IS NULL THEN NULL
             WHEN COALESCE(v.faturamento, 0) > 0
               THEN ROUND((COALESCE(d.resultado_caixa, 0) + rf.rendimento) / v.faturamento * 100, 1)
             ELSE 0 END                                 AS d_margem_teorica_pct,
        -- Chave de ORDENAÇÃO: a mesma anualização LINEAR da `d_margem_aa` (ADR-0162),
        -- aplicada sobre a margem teórica. NULL quando a duração não é anualizável
        -- OU quando não há float — o ORDER BY já usa NULLS LAST.
        CASE WHEN (d.data_evento - d.data_venda_contrato) > 0 AND rf.rendimento IS NOT NULL
          THEN (CASE WHEN COALESCE(v.faturamento, 0) > 0
                  THEN ROUND((COALESCE(d.resultado_caixa, 0) + rf.rendimento) / v.faturamento * 100, 1)
                  ELSE 0 END) * 12 * 30.44
               / (d.data_evento - d.data_venda_contrato)
          ELSE NULL END                                 AS d_margem_teorica_aa
      FROM analytics.dim_operacao_weddings d
      LEFT JOIN vendas_op         v  ON v.operacao  = d.operacao
      LEFT JOIN subsetor_op       sp ON sp.operacao = d.operacao
      LEFT JOIN tipo_contrato_cte tc ON tc.operacao = d.operacao
      LEFT JOIN analytics.vw_rendimento_float_operacao rf ON rf.operacao = d.operacao
      WHERE ($1 = 'todos'  OR d.situacao = $1)
        AND ($2 IS NULL    OR d.data_evento >= $2)
        AND ($3 IS NULL    OR d.data_evento <= $3)
        AND ($4 = 'todos'  OR sp.subsetor_predominante = $4)
        AND ($5 IS NULL    OR d.nome_casal ILIKE '%' || $5 || '%')
    )
    SELECT jsonb_build_object(
      'total',      (SELECT COUNT(*) FROM base),
      'pagina',     $6,
      'por_pagina', $8,
      -- v5.5.0: último mês FECHADO do CDI. Viaja no envelope, não por linha (é o
      -- mesmo para todas), e é o que o tooltip da coluna mostra como "taxa de
      -- referência de MMM/AA" quando a série está atrasada. Sem ele a M3 faria uma
      -- segunda chamada só para descobrir isto.
      'taxa_vigente_mes', (
        SELECT to_char(MAX(mes), 'YYYY-MM-DD') FROM analytics.dim_taxa_cdi
        WHERE mes < date_trunc('month', CURRENT_DATE)::date
      ),
      'operacoes',  COALESCE(
        (SELECT jsonb_agg(row_data ORDER BY ord)
         FROM (
           SELECT
             jsonb_build_object(
               'operacao',             d_operacao,
               'nome_casal',           d_nome_casal,
               'data_evento',          d_data_evento,
               'situacao',             d_situacao,
               'faturamento',          v_faturamento,
               'receita',              v_receita,
               'margem_pct',           v_margem,
               'entradas_total',       d_entradas_total,
               'saidas_total',         d_saidas_total,
               'resultado_caixa',      d_resultado_caixa,
               'ncg',                  d_ncg,
               'hotel',                d_hotel,
               'custos_internos',      d_custos_internos,
               'margem_liquida_pct',   d_margem_liquida,
               'rend_float',           d_rend_float,
               'margem_teorica_pct',   d_margem_teorica_pct,
               'data_venda_contrato',  to_char(d_data_venda_contrato, 'YYYY-MM-DD'),
               'tipo_contrato',        d_tipo_contrato,
               'convidados',           d_convidados,
               'flags', (
                 SELECT COALESCE(jsonb_agg(f), '[]'::jsonb)
                 FROM unnest(ARRAY[
                   CASE WHEN v_margem < 0 THEN 'margem_negativa' END,
                   CASE WHEN d_ncg > 50000 THEN 'ncg_alto' END,
                   CASE WHEN v_margem > 50 OR v_margem < -20 THEN 'outlier' END
                 ]) AS f WHERE f IS NOT NULL
               )
             ) AS row_data,
             ROW_NUMBER() OVER (ORDER BY $q$ || v_order_col || $q$ $q$ || v_order_dir || $q$ NULLS LAST) AS ord
           FROM base
           LIMIT $8 OFFSET $7
         ) paged
        ),
        '[]'::jsonb
      )
    )
  $q$;

  EXECUTE v_sql
  INTO v_operacoes
  USING
    p_status, p_periodo_inicio, p_periodo_fim, p_subsetor, p_busca,
    p_pagina, v_offset, v_limit;

  RETURN v_operacoes;
END $function$
;

-- ═════════════════════════════════════════════════════════════════════════════════════
-- 6. analytics.vw_vendas_agregadas — 1 ocorrência trocada (mesma lista/ordem/tipo de colunas)
-- ═════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW analytics.vw_vendas_agregadas AS
 SELECT venda_numero AS venda_no,
    min(data_venda) AS data_venda,
    min(vendedor) AS vendedor,
    setor_macro,
    sum(valor_total) AS valor_total,
    sum(receitas) AS receita,
        CASE
            WHEN sum(
            CASE
                WHEN situacao = 'Aberta'::text OR situacao IS NULL THEN 1
                ELSE 0
            END) > 0 THEN 'Aberta'::text
            ELSE 'Fechada'::text
        END AS situacao,
    count(*) AS qtd_produtos,
    string_agg(COALESCE(produto, ''::text), ', '::text ORDER BY produto) AS produtos
   FROM analytics.vendas_excel_para_fato
  GROUP BY venda_numero, setor_macro;

-- Redeclara a ACL mesmo sabendo que o Postgres a PRESERVA por `CREATE OR REPLACE VIEW`
-- (skill banco-e-rpc §5, precedente 0197/0206: "o dia em que aquilo virar DROP+CREATE, o
-- default privilege do Supabase abre anon em silêncio"). No-op hoje: o dump vivo mostra
-- acl={postgres=arwdDxtm/postgres} — só o dono tem privilégio, nada a revogar de fato.
REVOKE ALL ON analytics.vw_vendas_agregadas FROM PUBLIC, anon, authenticated;

-- ═════════════════════════════════════════════════════════════════════════════════════
-- 7. COMMENT ON VIEW analytics.vendas_excel_para_fato — atualizado (era só sobre o transform)
-- ═════════════════════════════════════════════════════════════════════════════════════
COMMENT ON VIEW analytics.vendas_excel_para_fato IS
  'v6.0.0/M5 (0277) + M7a (0283): raw.vendas_excel sem as linhas de Setor Macro = Welcome '
  '(briefing v6.0.0 decisão 8; anexo M5 §1, anexo M7 §2). O filtro que hoje só existe no script R '
  '(analise_casamentos2.R) vive aqui — raw.vendas_excel guarda o arquivo INTEIRO (o checksum do '
  'arquivo precisa disso para fechar, contrato §4) e é esta view, não a tabela, que TODOS os '
  'consumidores de Vendas por Produto leem: public.transform_raw_to_analytics() (0277), '
  'analytics.regenerar_dim_operacao_weddings(), public.contar_convidados_operacao(text), '
  'public.get_carteira_weddings__nucleo(text), public.get_operacao_weddings__nucleo(text), '
  'public.get_operacoes_weddings__nucleo(...) e analytics.vw_vendas_agregadas (0283, divergência '
  'D10 fechada). Predicado IS DISTINCT FROM, nunca <>: setor_macro é anulável e '
  'NULL <> ''Welcome'' avalia NULL, o que excluiria em silêncio toda linha sem setor macro. '
  'Medido nos anexos de 21/09: 210 linhas Welcome, das quais 141 vendas distintas afetariam '
  'Weddings/Vendas em Aberto sem este filtro em algum dos seis leitores.';

NOTIFY pgrst, 'reload schema';
