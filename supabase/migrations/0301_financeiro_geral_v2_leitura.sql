-- ---------------------------------------------------------------------------
-- 0301 — feat(v6.5.0/M2): as 3 RPCs de leitura de /financeiro/geral passam a emitir o contrato v6.5.0
--        (Financeiro · Geral v2): get_geral_recebiveis, get_geral_prejuizos, get_geral_antecipacoes.
--
-- Classificação: ADITIVA (3 CREATE OR REPLACE FUNCTION com a MESMA assinatura e o MESMO `RETURNS json`
-- + COMMENT + guards de efetividade). Nenhum DROP/TRUNCATE/ALTER/UPDATE/DELETE. Nenhum índice, nenhum
-- GRANT/REVOKE (CREATE OR REPLACE com a mesma assinatura preserva as ACLs; o guard no fim PROVA isso).
-- Nenhum dado escrito.
--
-- DECLARAÇÃO PRÉVIA (regime aditivo / autônomo):
--   • O QUE FAZ — só ACRESCENTA chaves (e muda a semântica de UMA, abaixo). Toda chave que as 3 funções
--     emitem hoje continua emitida, com o mesmo valor: o front da v6.4.0 em produção segue lendo as
--     chaves velhas até o deploy da v6.5.0; a poda delas é a destrutiva posterior (GATE 2).
--     (1) get_geral_recebiveis() — NOVAS: `em_aberto {n,valor}`, `vencido {n,valor}` (posição atual),
--         `devedores {top[≤10], demais{devedores,n,valor}}` (sobre os inadimplentes, por devedor),
--         `referencia_semana` (a última foto ANTES da semana da posição, p/ o Δ), `evolucao_semanal[]` (a última foto de
--         cada semana, seg–dom). Mantidas idênticas: carga, a_vencer, inadimplente{n,valor,faixas},
--         marcacao_em_aberto, concentracao, recuperado_ano, comparativo, evolucao (mensal), historico_desde.
--     (2) get_geral_prejuizos(p_ano) — NOVA: `por_pessoa[]` {pessoa,n,valor}: a lista COMPLETA do ano (sem
--         corte) do `prejuizo`, agregada pela pessoa do lançamento. Mantidas idênticas: ano, relacao,
--         mes_corrente, prejuizo, reversao, liquido, ano_anterior_ytd, bandeja, atualizado_em.
--     (3) get_geral_antecipacoes(p_ano) — NENHUMA chave nova; muda a SEMÂNTICA de `maior_intervalo_ano`
--         (mesma forma {dias,de,ate}, ver "DECISÕES"). Todas as outras chaves, idênticas.
--   • POR QUÊ (v6.5.0, briefing §2/§4): a página passa a mostrar o funil em aberto ⊃ vencido ⊃ inadimplente
--     com Δ semanal e evolução semanal, os 10 maiores devedores, o prejuízo por pessoa e o "maior intervalo"
--     que nunca é menor que os dias sem antecipação. Medição: docs/auditoria/v6-5-0-m0-financeiro-geral-v2.md.
--   • RETROCOMPATÍVEL com a `main` viva: nenhuma assinatura muda, nenhuma chave sai, nenhum tipo muda; o
--     schema Zod de hoje (v6.4.0) ignora chave extra. A única mudança observável para o front antigo é o
--     valor de `maior_intervalo_ano` (card "Dias sem antecipação"), que passa a ser ≥ o de antes.
--   • PADRÃO INLINE (skill banco-e-rpc §4): `PERFORM app.exigir_acesso(ARRAY['financeiro/geral'])` como
--     primeira instrução do corpo, SECURITY DEFINER, STABLE, search_path vazio, nomes qualificados.
--     `app.exigir_acesso` NÃO muda; áreas e concessões NÃO mudam.
--   • ESCRITA A PARTIR DO CATÁLOGO VIVO (skill banco-e-rpc §5): os 3 corpos foram transcritos de
--     pg_get_functiondef do banco (coincidem com 0297:578/690/867) e só então acrescidos; as partes velhas
--     NÃO foram reescritas (inclusive o `btrim(pessoa)` simples de `concentracao`, que difere do aparo novo
--     de `devedores` — são DOIS blocos, o velho vai embora com a poda).
--
-- DECISÕES (cada uma com o porquê):
--   • APARO DE PESSOA — `NULLIF(btrim(pessoa, E' \t\r\n' || chr(160)), '')`, o MESMO de
--     get_marketing_gastos_fornecedores (0292:206): espaço, tab, CR, LF e NBSP, acompanhando o
--     `String.trim()` do front; vazio/só-branco colapsa em NULL (um balde só; a UI mostra "(sem pessoa)").
--   • FUNIL (recebíveis) — da MESMA carga vigente que a função já escolhe: em aberto = `liquidacao IS NULL`;
--     vencido = em aberto com `vencimento < data_posicao` (vencimento NULL não é vencido); inadimplente =
--     em aberto com `conferido = 'Inadimplente'` (a definição que a função já usa). Tudo em `valor_final`.
--   • DEVEDORES — agregados sobre os inadimplentes (CTE `inad`, a mesma de `inadimplente`/`faixas`).
--     Ordem: valor DESC, desempate pessoa ASC NULLS LAST (pessoa é única por grupo ⇒ ordem total, o corte
--     top 10 / demais não flutua). `top` e `demais` saem da MESMA janela row_number(): top = rn ≤ 10,
--     demais = rn > 10 ⇒ Σ top + demais ≡ inadimplente (n e valor) por construção. `maior_atraso` =
--     max(data_posicao − vencimento) dos títulos do devedor (NULL se nenhum tem vencimento; ≤ 0 = ainda
--     não venceu). `demais` é {0,0,0} quando todos cabem no top.
--   • SEMANA / FOTO (recebíveis) — UMA ordem de "mais recente" para tudo: a da carga vigente,
--     (gravado_em DESC, carga_id DESC). A foto que REPRESENTA uma semana (segunda a domingo, pela
--     data_posicao, `date_trunc('week', …)`) é a de maior (gravado_em, carga_id) dentre as da semana; a
--     série vai até a semana da carga vigente (inclusive) e NÃO passa dela; `referencia_semana` é o ponto
--     da própria série imediatamente anterior à semana da posição — a MESMA CTE, não uma segunda consulta.
--     Por quê: (a) `data_posicao` é `(now() AT TIME ZONE 'America/Sao_Paulo')::date` gravado na MESMA
--     transação do `gravado_em DEFAULT now()` (0295:476), então as duas ordens coincidem — dentro de uma
--     semana e entre semanas — e o caso comum é o mesmo por qualquer das duas; (b) se divergirem (foto
--     histórica inserida à mão com data antiga, por exemplo), a carga vigente CONTINUA a que a função já
--     escolhe (chave `carga` não pode mudar) e a série passa a ter por construção o último ponto ≡ posição
--     atual e a referência ≡ ponto anterior — o contrato que rpc-contrato.test.ts exige — em vez de
--     depender de uma segunda ordem que pode discordar da primeira; (c) foto de semana POSTERIOR à da
--     vigente (só possível nesse caso patológico) fica fora da série, e não finge ser a posição atual.
--     Semana sem foto NÃO aparece (a UI mostra lacuna; nunca zero). Em aberto/vencido de cada ponto saem do
--     DETALHE da carga (`contas_receber_foto`), usando a `data_posicao` DAQUELA foto; o inadimplente sai da
--     própria `contas_receber_foto_carga` (imune a poda do detalhe), e a semana cujo detalhe não tem mais
--     todos os títulos em aberto que a foto contou SAI da série (lacuna, nunca zero fabricado); os cards
--     da posição atual saem de `raw.contas_receber` — iguais porque a foto é gravada da mesma raw, na mesma
--     transação da carga (0295:499-504).
--   • PRESCRIÇÃO DE JOIN — agregação do detalhe por `count(f.numero) FILTER (…)` com LEFT JOIN: uma carga
--     SEM linha de detalhe (posição realmente zerada) continua na série com zeros; `count(*) FILTER`
--     contaria a linha nula do LEFT JOIN como "em aberto" (liquidacao IS NULL), e INNER JOIN a sumiria.
--   • PREJUÍZO POR PESSOA — a CTE `base` (a varredura de fato_fluxo que já alimenta `prejuizo`/`reversao`/
--     `liquido`) passa a agrupar também pela pessoa aparada e a contar linhas; `ser` soma por cima (soma
--     de `numeric` é exata: nenhum valor existente muda). `por_pessoa` lê a MESMA `base` filtrada em
--     papel='prejuizo' e ano=p_ano — não é um predicado copiado, é a mesma varredura ⇒ Σ por_pessoa ≡
--     `prejuizo.total` por construção. Ordem: valor ASC (o mais negativo = o maior prejuízo primeiro),
--     desempate pessoa ASC NULLS LAST ("NULL por último" lido como desempate; o front reordena por
--     magnitude em prejuizos.ts e o NULL já vira "(sem pessoa)", visível).
--   • MAIOR INTERVALO (antecipações) — as datas DISTINTAS de TODAS as contas e de TODOS os anos
--     (`SELECT DISTINCT data FROM financeiro.antecipacao`, não a CTE `a`, que é filtrada pelo ano), com
--     lead(): o par (de, ate) é candidato quando `ate` cai dentro de p_ano — inclui o que atravessa a
--     virada. Quando o "hoje" cai em p_ano e é POSTERIOR à última antecipação, entra também o intervalo EM
--     CURSO (última, hoje). Vence o de mais dias; empate, o `de` mais antigo; NULL sem candidato. O
--     "hoje" é o MESMO `v_hoje` de `dias_desde_ultima`, e o `v_ultima` é o mesmo de `ultima_data`
--     (coerência entre os dois números: no ano corrente com dias sem antecipação, maior ≥ dias_desde_ultima).
--     Data futura é barrada na escrita (0296:345, antecipacao_salvar), então nenhum `ate` passa de hoje.
--   • FUSO — como a função já faz: `current_date` (o rolconfig TimeZone=America/Sao_Paulo de
--     authenticated/verificador/ingestor/service_role dá o hoje de SP; skill banco-e-rpc §3). `date_trunc`
--     de semana sobre `data_posicao::timestamp` (date puro: sem fuso envolvido).
--   • ÍNDICES — nenhum novo. contas_receber_foto tem PK (carga_id, numero): o JOIN por carga é por
--     intervalo de índice. contas_receber_foto_carga é de uma linha por carga promovida (dezenas): varredura
--     direta. fato_fluxo: a mesma passada indexada de antes. antecipacao: dezenas de linhas.
--   • ORÇAMENTO (8 s de `authenticated`): a série semanal lê UMA foto por semana (~4,8 mil linhas de
--     detalhe cada, hoje 1 foto); cresce linearmente com as semanas e SEM retenção do detalhe (briefing
--     inv. 8): ≈ 250 mil linhas/ano de série — folgado, mas medir de novo ao fim do 1º ano de cargas.
--     STABLE, sem temp table.
--
-- Pós-aplicação (orquestrador): ensaio em TRANSAÇÃO REVERTIDA antes (BEGIN → corpo → ROLLBACK; o guard no
-- fim já roda dentro da própria migration); depois, verificação REST com a credencial de verificação
-- (`SUPABASE_VERIFICADOR_*`) — `db query` NÃO executa o corpo de RPC gated (nega antes do corpo). Rodar o
-- bloco "Financeiro · Geral" de src/lib/rpc-contrato.test.ts. src/types/database.ts não muda (as
-- assinaturas e o tipo `json` são os mesmos e o arquivo não carrega COMMENT); o baseline de schema
-- (`npm run db:baseline`) precisa ser regenerado por causa dos COMMENT ON FUNCTION novos.
--
-- DOWN (reversão — só leitura, sem dado a restaurar): `CREATE OR REPLACE` dos 3 corpos ANTERIORES, que
-- são os de 0297 (única migration que os define antes desta; 0297:578 get_geral_prejuizos, :690
-- get_geral_recebiveis, :867 get_geral_antecipacoes) com os COMMENT de 0297:1034-1039. Só faça a volta
-- DEPOIS de tirar do ar o front da v6.5.0 (ele lê as chaves novas e o `maior_intervalo_ano` novo).
-- ---------------------------------------------------------------------------

BEGIN;

-- (0) Pré-condição: colunas que as versões novas passam a ler (plpgsql só liga tabela/coluna em runtime —
-- sem isto a migration aplicaria fora de ordem e a falha só apareceria na 1ª chamada).
DO $$
DECLARE
  v_col text;
BEGIN
  FOREACH v_col IN ARRAY ARRAY[
    'financeiro.contas_receber_foto.carga_id',
    'financeiro.contas_receber_foto.numero',
    'financeiro.contas_receber_foto.vencimento',
    'financeiro.contas_receber_foto.liquidacao',
    'financeiro.contas_receber_foto.valor_final',
    'financeiro.contas_receber_foto.conferido',
    'financeiro.contas_receber_foto_carga.carga_id',
    'financeiro.contas_receber_foto_carga.data_posicao',
    'financeiro.contas_receber_foto_carga.gravado_em',
    'financeiro.fato_fluxo.pessoa',
    'financeiro.fato_fluxo.valor',
    'financeiro.antecipacao.data'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_attribute a
       WHERE a.attrelid = to_regclass(format('%I.%I', split_part(v_col, '.', 1), split_part(v_col, '.', 2)))
         AND a.attname = split_part(v_col, '.', 3)
         AND a.attnum > 0 AND NOT a.attisdropped
    ) THEN
      RAISE EXCEPTION '0301: coluna % ausente — as migrations 0187/0295/0296 foram aplicadas?', v_col;
    END IF;
  END LOOP;
END
$$;

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- (1) get_geral_recebiveis() — funil, devedores, referência e evolução semanais
-- ═════════════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_geral_recebiveis()
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_carga_id uuid;
  v_dp       date;
  v_gravado  timestamptz;
  v_ano      int;
  v_mes_ini  date;
  v_mes_ant  date;
  v_semana   date;
  v_res      json;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/geral']);

  -- Carga vigente = a última foto de carga (gravada na MESMA transação do TRUNCATE+INSERT do raw).
  SELECT fc.carga_id, fc.data_posicao, fc.gravado_em
    INTO v_carga_id, v_dp, v_gravado
    FROM financeiro.contas_receber_foto_carga fc
   ORDER BY fc.gravado_em DESC, fc.carga_id DESC
   LIMIT 1;

  -- Sem base: zeros e listas vazias (nunca zero fabricado como se houvesse posição).
  IF v_carga_id IS NULL OR NOT EXISTS (SELECT 1 FROM raw.contas_receber) THEN
    RETURN json_build_object(
      'carga',              NULL::json,
      'a_vencer',           json_build_object('n', 0, 'valor', 0),
      'inadimplente',       json_build_object('n', 0, 'valor', 0, 'faixas', '[]'::json),
      'marcacao_em_aberto', '[]'::json,
      'concentracao',       json_build_object('top', '[]'::json, 'valor_top', 0, 'pct_top', NULL::numeric),
      'recuperado_ano',     json_build_object('ano', extract(year FROM current_date)::int, 'n', 0, 'valor', 0),
      'comparativo',        NULL::json,
      'evolucao',           '[]'::json,
      'historico_desde',    (SELECT min(fc.data_posicao) FROM financeiro.contas_receber_foto_carga fc),
      -- v6.5.0: chaves novas, zeradas/vazias (a UI trata "sem base" pela chave `carga` nula).
      'em_aberto',          json_build_object('n', 0, 'valor', 0),
      'vencido',            json_build_object('n', 0, 'valor', 0),
      'devedores',          json_build_object('top', '[]'::json,
                                              'demais', json_build_object('devedores', 0, 'n', 0, 'valor', 0)),
      'referencia_semana',  NULL::json,
      'evolucao_semanal',   '[]'::json
    );
  END IF;

  v_ano     := extract(year FROM v_dp)::int;
  v_mes_ini := date_trunc('month', v_dp::timestamp)::date;
  v_mes_ant := (v_mes_ini - interval '1 month')::date;
  -- Segunda-feira da semana (seg–dom, ISO) da posição atual.
  v_semana  := date_trunc('week', v_dp::timestamp)::date;

  WITH ab AS (
    -- O mesmo conjunto que a foto grava: em aberto + marcados Inadimplente (inclusive liquidados).
    SELECT r.pessoa, r.vencimento, r.liquidacao, r.valor_final, r.conferido
      FROM raw.contas_receber r
     WHERE r.liquidacao IS NULL OR r.conferido = 'Inadimplente'
  ),
  inad AS (
    -- Inadimplente = SÓ a marcação do Financeiro (decisão do GATE 1): em aberto E conferido='Inadimplente'.
    SELECT i.pessoa, i.vencimento, i.valor_final
      FROM ab i
     WHERE i.liquidacao IS NULL AND i.conferido = 'Inadimplente'
  ),
  tot AS (
    SELECT count(*) AS n, COALESCE(sum(i.valor_final), 0) AS valor FROM inad i
  ),
  fx AS (
    -- Faixas pelos dias de atraso (data_posicao − vencimento) dos MARCADOS; sem vencimento cai em
    -- 'nao_vencido' para a soma das faixas fechar com o total.
    SELECT CASE
             WHEN i.vencimento IS NULL OR v_dp - i.vencimento <= 0 THEN 'nao_vencido'
             WHEN v_dp - i.vencimento <= 30 THEN '1-30'
             WHEN v_dp - i.vencimento <= 60 THEN '31-60'
             WHEN v_dp - i.vencimento <= 90 THEN '61-90'
             ELSE '90+'
           END AS faixa,
           count(*) AS n,
           sum(i.valor_final) AS valor
      FROM inad i
     GROUP BY 1
  ),
  topn AS (
    -- pessoa vazia/só-espaço colapsa em NULL (a UI rotula); NULLS LAST pela ordenação abaixo.
    SELECT NULLIF(btrim(i.pessoa), '') AS pessoa,
           count(*) AS n,
           sum(i.valor_final) AS valor
      FROM inad i
     GROUP BY 1
     ORDER BY 3 DESC, 1
     LIMIT 10
  ),
  tp AS (
    SELECT COALESCE(sum(t.valor), 0) AS valor_top FROM topn t
  ),
  -- ── v6.5.0 ────────────────────────────────────────────────────────────────────────────────
  dev AS (
    -- Inadimplentes por DEVEDOR, com o aparo de Marketing (espaço/tab/CR/LF/NBSP). `topn`/`concentracao`
    -- (btrim simples) ficam como estão: a v6.4.0 em produção ainda os lê.
    SELECT NULLIF(btrim(i.pessoa, E' \t\r\n' || chr(160)), '') AS pessoa,
           count(*)                                           AS n,
           sum(i.valor_final)                                 AS valor,
           max(v_dp - i.vencimento)                           AS maior_atraso
      FROM inad i
     GROUP BY 1
  ),
  dev_rk AS (
    -- UMA janela decide top e demais ⇒ Σ top + demais ≡ inadimplente. Ordem total (pessoa é única
    -- por grupo): o corte do top 10 não flutua entre execuções.
    SELECT d.pessoa, d.n, d.valor, d.maior_atraso,
           row_number() OVER (ORDER BY d.valor DESC, d.pessoa ASC NULLS LAST) AS rn
      FROM dev d
  ),
  semanas AS (
    -- A foto que REPRESENTA cada semana (seg–dom, pela data_posicao): a de maior (gravado_em, carga_id)
    -- da semana — a MESMA ordem da carga vigente — e só até a semana da vigente (ver o header).
    SELECT DISTINCT ON (date_trunc('week', fc.data_posicao::timestamp))
           date_trunc('week', fc.data_posicao::timestamp)::date AS semana,
           fc.carga_id,
           fc.data_posicao,
           fc.em_aberto          AS fc_ab_n,
           fc.inadimplente_n     AS fc_inad_n,
           fc.inadimplente_valor AS fc_inad_valor
      FROM financeiro.contas_receber_foto_carga fc
     WHERE date_trunc('week', fc.data_posicao::timestamp)::date <= v_semana
     ORDER BY date_trunc('week', fc.data_posicao::timestamp), fc.gravado_em DESC, fc.carga_id DESC
  ),
  sem_agg AS (
    -- Funil de CADA foto representante, com a data_posicao DAQUELA foto. O INADIMPLENTE sai da própria
    -- `contas_receber_foto_carga` (gravado na transação da carga, imune a uma futura poda do detalhe);
    -- em aberto e vencido só existem no DETALHE por título. `completo` = o detalhe ainda tem todos os
    -- títulos em aberto que a foto contou: se a retenção (decisão pendente, inv. 8) podar o detalhe de uma
    -- carga antiga, a semana sai da série (LACUNA na UI) em vez de virar um zero fabricado (inv. 4 —
    -- achado MÉDIO do revisor-db). count(f.numero) (NOT NULL na PK), nunca count(*): a linha nula do LEFT
    -- JOIN não pode contar como "em aberto"; uma posição realmente zerada (0 = 0) continua completa.
    SELECT s.semana,
           s.data_posicao,
           count(f.numero) FILTER (WHERE f.liquidacao IS NULL) = s.fc_ab_n                      AS completo,
           count(f.numero) FILTER (WHERE f.liquidacao IS NULL)                                  AS ab_n,
           COALESCE(sum(f.valor_final) FILTER (WHERE f.liquidacao IS NULL), 0)                  AS ab_valor,
           count(f.numero) FILTER (WHERE f.liquidacao IS NULL AND f.vencimento < s.data_posicao) AS venc_n,
           COALESCE(sum(f.valor_final) FILTER (WHERE f.liquidacao IS NULL
                                                 AND f.vencimento < s.data_posicao), 0)         AS venc_valor,
           s.fc_inad_n                                                                          AS inad_n,
           s.fc_inad_valor                                                                      AS inad_valor
      FROM semanas s
      LEFT JOIN financeiro.contas_receber_foto f ON f.carga_id = s.carga_id
     GROUP BY s.semana, s.data_posicao, s.fc_ab_n, s.fc_inad_n, s.fc_inad_valor
  )
  SELECT json_build_object(
    'carga', json_build_object('carga_id', v_carga_id, 'data_posicao', v_dp, 'gravado_em', v_gravado),
    -- A vencer = em aberto com vencimento > data_posicao.
    'a_vencer', (
      SELECT json_build_object('n', count(*), 'valor', COALESCE(sum(x.valor_final), 0))
        FROM ab x
       WHERE x.liquidacao IS NULL AND x.vencimento > v_dp
    ),
    'inadimplente', (
      SELECT json_build_object(
               'n',     t.n,
               'valor', t.valor,
               'faixas', (
                 SELECT json_agg(json_build_object(
                          'faixa', z.faixa,
                          'n',     COALESCE(f.n, 0),
                          'valor', COALESCE(f.valor, 0)
                        ) ORDER BY z.ord)
                   FROM (VALUES ('nao_vencido', 1), ('1-30', 2), ('31-60', 3), ('61-90', 4), ('90+', 5)) AS z(faixa, ord)
                   LEFT JOIN fx f ON f.faixa = z.faixa
               ))
        FROM tot t
    ),
    -- Marcação dos títulos EM ABERTO (todos, vencidos ou a vencer): só os estados presentes.
    'marcacao_em_aberto', COALESCE((
      SELECT json_agg(json_build_object('conferido', g.conferido, 'n', g.n, 'valor', g.valor) ORDER BY g.ord)
        FROM (
          SELECT x.conferido,
                 count(*) AS n,
                 sum(x.valor_final) AS valor,
                 CASE x.conferido
                   WHEN 'Inadimplente'          THEN 1
                   WHEN 'Pendente'              THEN 2
                   WHEN 'Enviado para o banco'  THEN 3
                   WHEN 'Sim'                   THEN 4
                   ELSE 5
                 END AS ord
            FROM ab x
           WHERE x.liquidacao IS NULL
           GROUP BY x.conferido
        ) g
    ), '[]'::json),
    'concentracao', (
      SELECT json_build_object(
               'top', COALESCE((SELECT json_agg(json_build_object('pessoa', q.pessoa, 'n', q.n, 'valor', q.valor)
                                                ORDER BY q.valor DESC, q.pessoa)
                                  FROM topn q), '[]'::json),
               'valor_top', p.valor_top,
               'pct_top',   CASE WHEN t.valor > 0 THEN p.valor_top / t.valor * 100 END)
        FROM tot t CROSS JOIN tp p
    ),
    -- Recuperado = marcado Inadimplente e já liquidado, com liquidação no ano da data_posicao.
    'recuperado_ano', (
      SELECT json_build_object('ano', v_ano, 'n', count(*), 'valor', COALESCE(sum(x.valor_final), 0))
        FROM ab x
       WHERE x.conferido = 'Inadimplente'
         AND x.liquidacao IS NOT NULL
         AND extract(year FROM x.liquidacao)::int = v_ano
    ),
    -- Comparativo = última foto do mês anterior ao da data_posicao.
    'comparativo', (
      SELECT json_build_object(
               'data_posicao',       fc.data_posicao,
               'inadimplente_n',     fc.inadimplente_n,
               'inadimplente_valor', fc.inadimplente_valor,
               'a_vencer_valor',     fc.a_vencer_valor)
        FROM financeiro.contas_receber_foto_carga fc
       WHERE fc.data_posicao >= v_mes_ant AND fc.data_posicao < v_mes_ini
       ORDER BY fc.data_posicao DESC, fc.gravado_em DESC, fc.carga_id DESC
       LIMIT 1
    ),
    -- Evolução = última foto de cada mês.
    'evolucao', COALESCE((
      SELECT json_agg(json_build_object(
               'mes',                to_char(e.data_posicao, 'YYYY-MM'),
               'data_posicao',       e.data_posicao,
               'inadimplente_n',     e.inadimplente_n,
               'inadimplente_valor', e.inadimplente_valor,
               'a_vencer_valor',     e.a_vencer_valor
             ) ORDER BY e.data_posicao)
        FROM (
          SELECT DISTINCT ON (date_trunc('month', fc.data_posicao::timestamp))
                 fc.data_posicao, fc.inadimplente_n, fc.inadimplente_valor, fc.a_vencer_valor
            FROM financeiro.contas_receber_foto_carga fc
           ORDER BY date_trunc('month', fc.data_posicao::timestamp), fc.data_posicao DESC, fc.gravado_em DESC, fc.carga_id DESC
        ) e
    ), '[]'::json),
    'historico_desde', (SELECT min(fc.data_posicao) FROM financeiro.contas_receber_foto_carga fc),
    -- ── v6.5.0 ──────────────────────────────────────────────────────────────────────────────
    -- Funil da posição atual (raw.contas_receber, a mesma `ab`), em valor_final.
    'em_aberto', (
      SELECT json_build_object('n', count(*), 'valor', COALESCE(sum(x.valor_final), 0))
        FROM ab x
       WHERE x.liquidacao IS NULL
    ),
    'vencido', (
      SELECT json_build_object('n', count(*), 'valor', COALESCE(sum(x.valor_final), 0))
        FROM ab x
       WHERE x.liquidacao IS NULL AND x.vencimento < v_dp
    ),
    'devedores', json_build_object(
      'top', COALESCE((
        SELECT json_agg(json_build_object(
                 'pessoa',       r.pessoa,
                 'n',            r.n,
                 'valor',        r.valor,
                 'maior_atraso', r.maior_atraso
               ) ORDER BY r.rn)
          FROM dev_rk r
         WHERE r.rn <= 10
      ), '[]'::json),
      'demais', (
        SELECT json_build_object(
                 'devedores', count(*),
                 'n',         COALESCE(sum(r.n), 0)::bigint,
                 'valor',     COALESCE(sum(r.valor), 0))
          FROM dev_rk r
         WHERE r.rn > 10
      )
    ),
    -- Referência do Δ: o ponto da própria série imediatamente anterior à semana da posição atual.
    'referencia_semana', (
      SELECT json_build_object(
               'data_posicao', r.data_posicao,
               'em_aberto',    json_build_object('n', r.ab_n,   'valor', r.ab_valor),
               'vencido',      json_build_object('n', r.venc_n, 'valor', r.venc_valor),
               'inadimplente', json_build_object('n', r.inad_n, 'valor', r.inad_valor))
        FROM sem_agg r
       WHERE r.semana < v_semana AND r.completo
       ORDER BY r.semana DESC
       LIMIT 1
    ),
    'evolucao_semanal', COALESCE((
      SELECT json_agg(json_build_object(
               'semana',             e.semana,
               'data_posicao',       e.data_posicao,
               'inadimplente_n',     e.inad_n,
               'inadimplente_valor', e.inad_valor,
               'vencido_valor',      e.venc_valor
             ) ORDER BY e.semana)
        FROM sem_agg e
       WHERE e.completo
    ), '[]'::json)
  ) INTO v_res;

  RETURN v_res;
END $function$;

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- (2) get_geral_prejuizos(p_ano) — por_pessoa
-- ═════════════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_geral_prejuizos(p_ano integer)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_hoje    date := current_date;
  v_rel     text;
  v_mes     int;
  v_cut     int;
  v_ini     date;
  v_ini_ant date;
  v_fim     date;
  v_zeros   numeric[] := ARRAY(SELECT 0::numeric FROM generate_series(1, 12));
  v_res     json;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/geral']);

  IF p_ano IS NULL OR p_ano < 2000 OR p_ano > 2100 THEN
    RAISE EXCEPTION 'Ano inválido.';
  END IF;

  v_rel := CASE
    WHEN p_ano < extract(year FROM v_hoje)::int THEN 'fechado'
    WHEN p_ano = extract(year FROM v_hoje)::int THEN 'corrente'
    ELSE 'futuro'
  END;
  v_mes := CASE WHEN v_rel = 'corrente' THEN extract(month FROM v_hoje)::int END;
  v_cut := CASE WHEN v_rel = 'corrente' THEN v_mes ELSE 12 END;
  v_ini     := make_date(p_ano, 1, 1);
  v_ini_ant := make_date(p_ano - 1, 1, 1);
  v_fim     := make_date(p_ano + 1, 1, 1);

  WITH base AS (
    -- Categorias da tabela curada ⨝ mapa da DRE (NOT excluida), em QUALQUER bloco. Uma varredura.
    -- v6.5.0: agrupa também pela pessoa aparada (espaço/tab/CR/LF/NBSP — o aparo de 0292:206) e conta as
    -- linhas; `ser` soma por cima (soma de numeric é exata: as séries existentes não mudam de valor) e
    -- `pess` lê ESTA mesma varredura ⇒ Σ por_pessoa ≡ prejuizo.total por construção.
    SELECT extract(year FROM f.data_competencia)::int  AS ano,
           extract(month FROM f.data_competencia)::int AS mes,
           pm.papel,
           NULLIF(btrim(f.pessoa, E' \t\r\n' || chr(160)), '') AS pessoa,
           count(*)                                    AS n,
           sum(f.valor)                                AS valor
      FROM financeiro.fato_fluxo f
      JOIN financeiro.geral_perda_map pm ON pm.categoria_id = f.categoria_id
      JOIN financeiro.dre_categoria_map m
        ON m.categoria_id = f.categoria_id AND NOT m.excluida
     WHERE f.tipo = 'realizado'
       AND f.data_competencia >= v_ini_ant
       AND f.data_competencia <  v_fim
     GROUP BY 1, 2, 3, 4
  ),
  ser AS (
    SELECT b.papel AS k, b.ano, b.mes, sum(b.valor) AS v FROM base b GROUP BY b.papel, b.ano, b.mes
    UNION ALL
    SELECT 'liquido', b.ano, b.mes, sum(b.valor) FROM base b GROUP BY b.ano, b.mes
  ),
  arr AS (
    SELECT kk.k, kk.ano,
           (SELECT array_agg(COALESCE(s.v, 0) ORDER BY i.i)
              FROM generate_series(1, 12) AS i(i)
              LEFT JOIN ser s ON s.k = kk.k AND s.ano = kk.ano AND s.mes = i.i)::numeric[] AS meses
      FROM (SELECT DISTINCT s0.k, s0.ano FROM ser s0) kk
  ),
  top AS (
    SELECT ks.k,
           COALESCE(ac.meses, v_zeros) AS meses,
           COALESCE(ap.meses, v_zeros) AS meses_ant
      FROM (VALUES ('prejuizo'), ('reversao'), ('liquido')) AS ks(k)
      LEFT JOIN arr ac ON ac.k = ks.k AND ac.ano = p_ano
      LEFT JOIN arr ap ON ap.k = ks.k AND ap.ano = p_ano - 1
  ),
  ytd AS (
    SELECT t.k, t.meses,
           (SELECT COALESCE(sum(x), 0) FROM unnest(t.meses) x) AS total,
           (SELECT COALESCE(sum(u.x), 0)
              FROM unnest(t.meses_ant) WITH ORDINALITY AS u(x, n)
             WHERE u.n <= v_cut) AS ytd_ant
      FROM top t
  ),
  pess AS (
    -- O prejuízo do ano por pessoa, SEM corte (o top N + demais é do módulo puro do front). Só pessoa
    -- com ao menos um lançamento (n ≥ 1); NULL = lançamento sem pessoa, UM balde.
    SELECT b.pessoa,
           sum(b.n)     AS n,
           sum(b.valor) AS valor
      FROM base b
     WHERE b.papel = 'prejuizo' AND b.ano = p_ano
     GROUP BY b.pessoa
  )
  SELECT json_build_object(
    'ano',          p_ano,
    'relacao',      v_rel,
    'mes_corrente', v_mes,
    'prejuizo',     (SELECT json_build_object('meses', y.meses, 'total', y.total) FROM ytd y WHERE y.k = 'prejuizo'),
    'reversao',     (SELECT json_build_object('meses', y.meses, 'total', y.total) FROM ytd y WHERE y.k = 'reversao'),
    'liquido',      (SELECT json_build_object('meses', y.meses, 'total', y.total) FROM ytd y WHERE y.k = 'liquido'),
    'ano_anterior_ytd', json_build_object(
      'prejuizo', (SELECT y.ytd_ant FROM ytd y WHERE y.k = 'prejuizo'),
      'reversao', (SELECT y.ytd_ant FROM ytd y WHERE y.k = 'reversao'),
      'liquido',  (SELECT y.ytd_ant FROM ytd y WHERE y.k = 'liquido')
    ),
    -- Bandeja: categoria de nome preju/perda FORA da tabela curada, com o realizado do ano.
    'bandeja', COALESCE((
      SELECT json_agg(json_build_object(
               'categoria_id', dc.id,
               'rotulo',       COALESCE(m.rotulo, dc.categoria),
               'total',        COALESCE((
                 SELECT sum(f.valor)
                   FROM financeiro.fato_fluxo f
                  WHERE f.categoria_id = dc.id
                    AND f.tipo = 'realizado'
                    AND f.data_competencia >= v_ini
                    AND f.data_competencia <  v_fim
               ), 0)
             ) ORDER BY COALESCE(m.rotulo, dc.categoria), dc.id)
        FROM financeiro.dim_categoria dc
        LEFT JOIN financeiro.dre_categoria_map m ON m.categoria_id = dc.id
       WHERE (dc.categoria ILIKE '%preju%' OR dc.categoria ILIKE '%perda%')
         AND NOT EXISTS (SELECT 1 FROM financeiro.geral_perda_map pm WHERE pm.categoria_id = dc.id)
    ), '[]'::json),
    'atualizado_em', (SELECT max(f.gerado_em) FROM financeiro.fato_fluxo f),
    -- v6.5.0: lista completa do prejuízo do ano por pessoa, do maior prejuízo (mais negativo) ao menor;
    -- empate por pessoa, NULL por último. Item = só {pessoa, n, valor} (nenhuma coluna a mais do lançamento).
    'por_pessoa', COALESCE((
      SELECT json_agg(json_build_object(
               'pessoa', q.pessoa,
               'n',      q.n::bigint,
               'valor',  q.valor
             ) ORDER BY q.valor ASC, q.pessoa ASC NULLS LAST)
        FROM pess q
    ), '[]'::json)
  ) INTO v_res;

  RETURN v_res;
END $function$;

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- (3) get_geral_antecipacoes(p_ano) — maior_intervalo_ano com a semântica nova
-- ═════════════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_geral_antecipacoes(p_ano integer)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_hoje       date := current_date;
  v_rel        text;
  v_mes        int;
  v_cut        int;
  v_ini        date;
  v_fim        date;
  v_ant_ini    date;
  v_ant_fim    date;
  v_ultima     date;
  v_atualizado timestamptz;
  v_res        json;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/geral']);

  IF p_ano IS NULL OR p_ano < 2000 OR p_ano > 2100 THEN
    RAISE EXCEPTION 'Ano inválido.';
  END IF;

  v_rel := CASE
    WHEN p_ano < extract(year FROM v_hoje)::int THEN 'fechado'
    WHEN p_ano = extract(year FROM v_hoje)::int THEN 'corrente'
    ELSE 'futuro'
  END;
  v_mes := CASE WHEN v_rel = 'corrente' THEN extract(month FROM v_hoje)::int END;
  v_cut := CASE WHEN v_rel = 'corrente' THEN v_mes ELSE 12 END;
  v_ini     := make_date(p_ano, 1, 1);
  v_fim     := make_date(p_ano + 1, 1, 1);
  v_ant_ini := make_date(p_ano - 1, 1, 1);
  v_ant_fim := (make_date(p_ano - 1, 1, 1) + make_interval(months => v_cut))::date;

  SELECT max(x.data), max(x.atualizado_em) INTO v_ultima, v_atualizado
    FROM financeiro.antecipacao x;

  WITH a AS (
    SELECT x.data, x.conta_id, x.valor_antecipado, x.valor_liquido, x.desconto
      FROM financeiro.antecipacao x
     WHERE x.data >= v_ini AND x.data < v_fim
  ),
  mes AS (
    SELECT i.i AS mes,
           COALESCE(sum(a.valor_antecipado), 0) AS volume,
           COALESCE(sum(a.valor_liquido), 0)    AS liquido,
           COALESCE(sum(a.desconto), 0)         AS desconto,
           count(a.conta_id)                    AS n
      FROM generate_series(1, 12) AS i(i)
      LEFT JOIN a ON extract(month FROM a.data)::int = i.i
     GROUP BY i.i
  )
  SELECT json_build_object(
    'ano',          p_ano,
    'relacao',      v_rel,
    'mes_corrente', v_mes,
    'meses', (
      SELECT json_agg(json_build_object(
               'volume',   mm.volume,
               'liquido',  mm.liquido,
               'desconto', mm.desconto,
               'n',        mm.n
             ) ORDER BY mm.mes)
        FROM mes mm
    ),
    'total', (
      SELECT json_build_object(
               'volume',       sum(mm.volume),
               'liquido',      sum(mm.liquido),
               'desconto',     sum(mm.desconto),
               'n',            sum(mm.n)::int,
               'desconto_pct', CASE WHEN sum(mm.volume) > 0 THEN sum(mm.desconto) / sum(mm.volume) * 100 END)
        FROM mes mm
    ),
    'ano_anterior_ytd', (
      SELECT json_build_object(
               'volume',   COALESCE(sum(x.valor_antecipado), 0),
               'desconto', COALESCE(sum(x.desconto), 0),
               'n',        count(*))
        FROM financeiro.antecipacao x
       WHERE x.data >= v_ant_ini AND x.data < v_ant_fim
    ),
    -- Contas ativas (ou com registro no ano), mesmo sem movimento: a ausência também informa.
    'por_conta', COALESCE((
      SELECT json_agg(json_build_object(
               'conta',    c.nome,
               'volume',   COALESCE(t.volume, 0),
               'desconto', COALESCE(t.desconto, 0),
               'n',        COALESCE(t.n, 0)
             ) ORDER BY COALESCE(t.volume, 0) DESC, c.nome)
        FROM financeiro.antecipacao_conta c
        LEFT JOIN (
          SELECT a.conta_id,
                 sum(a.valor_antecipado) AS volume,
                 sum(a.desconto)         AS desconto,
                 count(*)                AS n
            FROM a
           GROUP BY a.conta_id
        ) t ON t.conta_id = c.id
       WHERE c.ativo OR t.n > 0
    ), '[]'::json),
    'ultima_data',        v_ultima,
    'dias_desde_ultima',  (v_hoje - v_ultima),
    -- v6.5.0 — maior intervalo entre datas DISTINTAS consecutivas de antecipação (todas as contas, TODOS os
    -- anos) cujo FIM (`ate`) cai em p_ano: inclui o que atravessa a virada do ano. Se o "hoje" (o mesmo de
    -- dias_desde_ultima) cai em p_ano e é posterior à última antecipação, entra também o intervalo EM CURSO
    -- (última → hoje). Maior em dias; empate, o `de` mais antigo; NULL sem candidato.
    'maior_intervalo_ano', (
      SELECT json_build_object('dias', g.dias, 'de', g.de, 'ate', g.ate)
        FROM (
          SELECT c.de, c.ate, (c.ate - c.de) AS dias
            FROM (
              SELECT d.de, d.ate
                FROM (
                  SELECT dd.dt AS de, lead(dd.dt) OVER (ORDER BY dd.dt) AS ate
                    FROM (SELECT DISTINCT x2.data AS dt FROM financeiro.antecipacao x2) dd
                ) d
               WHERE d.ate IS NOT NULL
                 AND d.ate >= v_ini AND d.ate < v_fim
              UNION ALL
              SELECT v_ultima, v_hoje
               WHERE v_ultima IS NOT NULL
                 AND v_hoje >= v_ini AND v_hoje < v_fim
                 AND v_hoje > v_ultima
            ) c
           ORDER BY (c.ate - c.de) DESC, c.de ASC
           LIMIT 1
        ) g
    ),
    'atualizado_em', v_atualizado
  ) INTO v_res;

  RETURN v_res;
END $function$;

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- COMMENT — descrevem o contrato v6.5.0 (as chaves velhas seguem emitidas até a poda do GATE 2)
-- ═════════════════════════════════════════════════════════════════════════════════════════════
COMMENT ON FUNCTION public.get_geral_recebiveis() IS
  'Geral v6.5.0: posição de recebíveis na carga vigente de raw.contas_receber. Contrato novo: em_aberto/vencido {n,valor}; inadimplente {n,valor,faixas} (marcação Conferido=Inadimplente); devedores {top[≤10] {pessoa,n,valor,maior_atraso}, demais {devedores,n,valor}} (aparo de pessoa de Marketing; Σ top+demais ≡ inadimplente); referencia_semana (a última foto ANTES da semana da posição — pode ser de 2+ semanas atrás —, p/ o Δ; null sem foto anterior); evolucao_semanal [{semana,data_posicao,inadimplente_n,inadimplente_valor,vencido_valor}] (a última foto de cada semana seg–dom, do detalhe contas_receber_foto; semana sem carga não vem); historico_desde. Chaves da v6.4.0 (a_vencer, marcacao_em_aberto, concentracao, recuperado_ano, comparativo, evolucao mensal) ainda emitidas até a poda do GATE 2. Sem base: carga null, zeros e listas vazias.';
COMMENT ON FUNCTION public.get_geral_prejuizos(integer) IS
  'Geral v6.5.0: prejuízo por mês (categorias de geral_perda_map ⨝ dre_categoria_map NOT excluida, realizado) + por_pessoa [{pessoa,n,valor}] (lista completa do ano, mesma varredura do prejuizo: Σ por_pessoa ≡ prejuizo.total; pessoa aparada, NULL = sem pessoa; do maior prejuízo ao menor) + bandeja de categorias preju/perda não curadas. reversao/liquido ainda emitidos até a poda do GATE 2.';
COMMENT ON FUNCTION public.get_geral_antecipacoes(integer) IS
  'Geral v6.5.0: antecipações registradas no Janus (financeiro.antecipacao) por mês, total, por conta, dias desde a última e maior_intervalo_ano {dias,de,ate} = maior intervalo entre datas distintas de antecipação (todas as contas e anos) que TERMINA em p_ano — inclui o que atravessa a virada e, no ano corrente, o intervalo em curso (última → hoje).';

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- Guard de EFETIVIDADE: a transação inteira aborta se a intenção não se cumpriu — função ausente (ou
-- assinatura errada: to_regprocedure devolve NULL), sem a área no corpo, sem SECURITY DEFINER/search_path
-- vazio, grant que o REPLACE deveria ter preservado, e CHAVE (velha ou nova) que sumiu do corpo.
-- ═════════════════════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_sig    text;
  v_chaves text;
  v_k      text;
  v_proc   regprocedure;
  v_src    text;
BEGIN
  FOR v_sig, v_chaves IN
    SELECT * FROM (VALUES
      ('public.get_geral_recebiveis()',
       -- 9 chaves da v6.4.0 + 5 novas
       'carga,a_vencer,inadimplente,marcacao_em_aberto,concentracao,recuperado_ano,comparativo,evolucao,historico_desde,'
       || 'em_aberto,vencido,devedores,referencia_semana,evolucao_semanal'),
      ('public.get_geral_prejuizos(integer)',
       -- 9 da v6.4.0 + por_pessoa
       'ano,relacao,mes_corrente,prejuizo,reversao,liquido,ano_anterior_ytd,bandeja,atualizado_em,por_pessoa'),
      ('public.get_geral_antecipacoes(integer)',
       'ano,relacao,mes_corrente,meses,total,ano_anterior_ytd,por_conta,ultima_data,dias_desde_ultima,maior_intervalo_ano,atualizado_em')
    ) AS t(sig, chaves)
  LOOP
    v_proc := to_regprocedure(v_sig);
    IF v_proc IS NULL THEN
      RAISE EXCEPTION '0301: função % não encontrada', v_sig;
    END IF;
    SELECT p.prosrc INTO v_src FROM pg_proc p WHERE p.oid = v_proc;

    -- As aspas discriminam 'financeiro/geral' de 'financeiro/geral/gestao'.
    IF position('''financeiro/geral''' IN v_src) = 0 THEN
      RAISE EXCEPTION '0301: corpo de % não exige financeiro/geral', v_sig;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = v_proc AND prosecdef
                      AND proconfig @> ARRAY['search_path=""']) THEN
      RAISE EXCEPTION '0301: % sem SECURITY DEFINER ou sem search_path vazio', v_sig;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = v_proc AND provolatile = 's' AND prorettype = 'json'::regtype) THEN
      RAISE EXCEPTION '0301: % deixou de ser STABLE ou de retornar json', v_sig;
    END IF;

    -- Nenhuma chave existente pode ter sumido na transcrição, e as novas têm de estar lá.
    FOREACH v_k IN ARRAY string_to_array(v_chaves, ',') LOOP
      IF position('''' || v_k || '''' IN v_src) = 0 THEN
        RAISE EXCEPTION '0301: corpo de % não emite a chave %', v_sig, v_k;
      END IF;
    END LOOP;

    -- Grants: o CREATE OR REPLACE com a mesma assinatura os preserva (nenhum GRANT/REVOKE nesta migration).
    IF has_function_privilege('anon', v_proc, 'EXECUTE') THEN
      RAISE EXCEPTION '0301: anon ainda tem EXECUTE em %', v_sig;
    END IF;
    IF NOT has_function_privilege('authenticated', v_proc, 'EXECUTE') THEN
      RAISE EXCEPTION '0301: authenticated sem EXECUTE em %', v_sig;
    END IF;
    IF NOT has_function_privilege('service_role', v_proc, 'EXECUTE') THEN
      RAISE EXCEPTION '0301: service_role sem EXECUTE em %', v_sig;
    END IF;
    IF NOT has_function_privilege('verificador', v_proc, 'EXECUTE') THEN
      RAISE EXCEPTION '0301: verificador sem EXECUTE em %', v_sig;
    END IF;
    IF has_function_privilege('ingestor', v_proc, 'EXECUTE') THEN
      RAISE EXCEPTION '0301: ingestor não deveria ter EXECUTE em %', v_sig;
    END IF;
  END LOOP;

  -- Nenhuma sobrecarga criada por engano (uma só assinatura por nome).
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname IN ('get_geral_recebiveis', 'get_geral_prejuizos', 'get_geral_antecipacoes')) <> 3 THEN
    RAISE EXCEPTION '0301: sobrecarga de get_geral_recebiveis/prejuizos/antecipacoes criada por engano';
  END IF;
END
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
