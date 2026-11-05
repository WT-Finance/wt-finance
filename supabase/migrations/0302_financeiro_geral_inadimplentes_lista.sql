-- ---------------------------------------------------------------------------
-- 0302 — feat(v6.5.0): get_geral_recebiveis() passa a devolver a LISTA COMPLETA de devedores
--        inadimplentes na chave `devedores` (refino do Yan sobre a 0301).
--
-- Classificação: ADITIVA (1 CREATE OR REPLACE FUNCTION com a MESMA assinatura e o MESMO `RETURNS json`
-- + COMMENT + guard de efetividade). Nenhum DROP/TRUNCATE/ALTER/UPDATE/DELETE. Nenhum índice, nenhum
-- GRANT/REVOKE (CREATE OR REPLACE com a mesma assinatura preserva as ACLs; o guard no fim PROVA isso).
-- Nenhum dado escrito.
--
-- DECLARAÇÃO PRÉVIA (regime aditivo / autônomo):
--   • O QUE FAZ — muda a FORMA de UMA chave de get_geral_recebiveis(): `devedores`.
--       0301: `devedores {top[≤10] {pessoa,n,valor,maior_atraso}, demais {devedores,n,valor}}`
--       0302: `devedores [{pessoa,n,valor,maior_atraso}]` — array com TODOS os devedores, sem corte.
--     Mesma agregação (CTE `dev`), mesmo aparo de pessoa, mesma ordem (valor DESC, pessoa ASC NULLS LAST).
--     Sem base (ramo antecipado): `devedores` = `[]` (json array vazio, nunca NULL). Todas as outras chaves,
--     CTEs e variáveis ficam IDÊNTICAS ao corpo vivo pós-0301.
--   • POR QUÊ (refino do Yan, v6.5.0): o card "Maiores Inadimplentes" mostra as 4 maiores linhas e um drawer
--     "ver mais" mostra a lista completa; o corte (top 4) é do front, que passa a receber todos os devedores.
--     Σ devedores (n e valor) ≡ `inadimplente` (n e valor) por construção: `dev` agrega a MESMA CTE `inad` e
--     nada é cortado (a janela row_number()/`rn` e a CTE `dev_rk` deixam de existir — só serviam ao corte).
--   • SEGURA PARA O FRONT NO AR — a chave `devedores` nasceu na 0301 (v6.5.0) e a versão em produção (v6.4.0)
--     NÃO a lê (o schema Zod de hoje ignora chave extra); quem passa a ler a forma nova é o front da v6.5.0.
--     Nenhuma assinatura muda, nenhuma outra chave muda de forma ou de valor.
--   • PADRÃO INLINE (skill banco-e-rpc §4): `PERFORM app.exigir_acesso(ARRAY['financeiro/geral'])` como
--     primeira instrução do corpo, SECURITY DEFINER, STABLE, search_path vazio, nomes qualificados.
--     `app.exigir_acesso` NÃO muda; áreas e concessões NÃO mudam.
--   • ESCRITA A PARTIR DO CATÁLOGO VIVO (skill banco-e-rpc §5): o corpo foi transcrito de pg_get_functiondef do
--     banco APÓS a 0301 e só então alterado nos dois pontos de `devedores` (+ remoção da CTE `dev_rk`).
--
-- DECISÕES:
--   • ORDEM — valor DESC, desempate pessoa ASC NULLS LAST dentro do `json_agg(... ORDER BY ...)`; pessoa é
--     única por grupo (GROUP BY 1) ⇒ ordem total, determinística entre execuções.
--   • LISTA VAZIA — `COALESCE(json_agg(...), '[]'::json)`: sem inadimplentes (com base) ou sem base, o
--     front recebe sempre um array, nunca NULL.
--   • TAMANHO — um item por devedor inadimplente (marcação manual do Financeiro; ordem de dezenas a poucas
--     centenas), 4 campos cada: payload desprezível frente ao resto da resposta.
--
-- ATENÇÃO — a destrutiva pendente `supabase/patches/financeiro-geral-v2-poda-destrutiva.sql` (que era
-- "a 0302", a poda do GATE 2) passa a ser a **0303** e TERÁ DE SER REGENERADA a partir do corpo vivo
-- PÓS-0302 de get_geral_recebiveis() (o corpo que ela reescreve deixou de ser o pós-0301: `devedores` mudou
-- de forma e `dev_rk` saiu). Outra missão faz isso; nada nesta migration a aplica nem a toca.
--
-- Pós-aplicação (orquestrador): ensaio em TRANSAÇÃO REVERTIDA antes (BEGIN → corpo → ROLLBACK; o guard no
-- fim já roda dentro da própria migration); depois, verificação REST com a credencial de verificação
-- (`SUPABASE_VERIFICADOR_*`) — `db query` NÃO executa o corpo de RPC gated (nega antes do corpo). Conferir
-- `devedores` é array, Σ n e Σ valor ≡ `inadimplente`; rodar o bloco "Financeiro · Geral" de
-- src/lib/rpc-contrato.test.ts (o schema Zod/teste de `devedores` muda junto com o front). O baseline de
-- schema (`npm run db:baseline`) precisa ser regenerado por causa do COMMENT ON FUNCTION novo.
--
-- DOWN (reversão — só leitura, sem dado a restaurar): `CREATE OR REPLACE` do corpo ANTERIOR, que é o da
-- 0301 (supabase/migrations/0301_financeiro_geral_v2_leitura.sql, bloco (1) get_geral_recebiveis) com o
-- COMMENT da 0301. Só faça a volta DEPOIS de tirar do ar o front da v6.5.0 (ele lê `devedores` como array).
-- ---------------------------------------------------------------------------

BEGIN;

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- get_geral_recebiveis() — `devedores` = lista completa
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
      'devedores',          '[]'::json,
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
    -- Lista COMPLETA dos devedores inadimplentes (sem corte; o top N é do front). Ordem total: valor DESC,
    -- pessoa ASC NULLS LAST (pessoa é única por grupo) ⇒ Σ n e Σ valor ≡ `inadimplente` por construção.
    'devedores', COALESCE((
      SELECT json_agg(json_build_object(
               'pessoa',       d.pessoa,
               'n',            d.n,
               'valor',        d.valor,
               'maior_atraso', d.maior_atraso
             ) ORDER BY d.valor DESC, d.pessoa ASC NULLS LAST)
        FROM dev d
    ), '[]'::json),
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

COMMENT ON FUNCTION public.get_geral_recebiveis() IS
  'Geral v6.5.0: posição de recebíveis na carga vigente de raw.contas_receber. Contrato novo: em_aberto/vencido {n,valor}; inadimplente {n,valor,faixas} (marcação Conferido=Inadimplente); devedores [{pessoa,n,valor,maior_atraso}] (a lista COMPLETA dos devedores inadimplentes, sem corte — o top N é do front; ordem valor desc, pessoa asc nulls last; aparo de pessoa de Marketing; Σ n e Σ valor ≡ inadimplente; sem base = []); referencia_semana (a última foto ANTES da semana da posição — pode ser de 2+ semanas atrás —, p/ o Δ; null sem foto anterior); evolucao_semanal [{semana,data_posicao,inadimplente_n,inadimplente_valor,vencido_valor}] (a última foto de cada semana seg–dom, do detalhe contas_receber_foto; semana sem carga não vem); historico_desde. Chaves da v6.4.0 (a_vencer, marcacao_em_aberto, concentracao, recuperado_ano, comparativo, evolucao mensal) ainda emitidas até a poda do GATE 2. Sem base: carga null, zeros e listas vazias.';

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- Guard de EFETIVIDADE: a transação inteira aborta se a intenção não se cumpriu — função ausente (ou
-- assinatura errada: to_regprocedure devolve NULL), sem a área no corpo, sem SECURITY DEFINER/search_path
-- vazio, grant que o REPLACE deveria ter preservado, chave (velha ou nova) que sumiu do corpo, e resquício
-- da forma antiga de `devedores` ('demais').
-- ═════════════════════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_sig    text := 'public.get_geral_recebiveis()';
  v_chaves text := 'carga,a_vencer,inadimplente,marcacao_em_aberto,concentracao,recuperado_ano,comparativo,evolucao,historico_desde,'
                   || 'em_aberto,vencido,devedores,referencia_semana,evolucao_semanal';
  v_k      text;
  v_proc   regprocedure;
  v_src    text;
BEGIN
  v_proc := to_regprocedure(v_sig);
  IF v_proc IS NULL THEN
    RAISE EXCEPTION '0302: função % não encontrada', v_sig;
  END IF;
  SELECT p.prosrc INTO v_src FROM pg_proc p WHERE p.oid = v_proc;

  -- As aspas discriminam 'financeiro/geral' de 'financeiro/geral/gestao'.
  IF position('''financeiro/geral''' IN v_src) = 0 THEN
    RAISE EXCEPTION '0302: corpo de % não exige financeiro/geral', v_sig;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = v_proc AND prosecdef
                    AND proconfig @> ARRAY['search_path=""']) THEN
    RAISE EXCEPTION '0302: % sem SECURITY DEFINER ou sem search_path vazio', v_sig;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = v_proc AND provolatile = 's' AND prorettype = 'json'::regtype) THEN
    RAISE EXCEPTION '0302: % deixou de ser STABLE ou de retornar json', v_sig;
  END IF;

  -- Nenhuma chave existente pode ter sumido na transcrição.
  FOREACH v_k IN ARRAY string_to_array(v_chaves, ',') LOOP
    IF position('''' || v_k || '''' IN v_src) = 0 THEN
      RAISE EXCEPTION '0302: corpo de % não emite a chave %', v_sig, v_k;
    END IF;
  END LOOP;

  -- A forma antiga de `devedores` ({top, demais}) não pode ter sobrado em nenhum dos dois ramos.
  IF position('''demais''' IN v_src) > 0 THEN
    RAISE EXCEPTION '0302: corpo de % ainda emite devedores.demais (forma da 0301)', v_sig;
  END IF;

  -- Grants: o CREATE OR REPLACE com a mesma assinatura os preserva (nenhum GRANT/REVOKE nesta migration).
  IF has_function_privilege('anon', v_proc, 'EXECUTE') THEN
    RAISE EXCEPTION '0302: anon ainda tem EXECUTE em %', v_sig;
  END IF;
  IF NOT has_function_privilege('authenticated', v_proc, 'EXECUTE') THEN
    RAISE EXCEPTION '0302: authenticated sem EXECUTE em %', v_sig;
  END IF;
  IF NOT has_function_privilege('service_role', v_proc, 'EXECUTE') THEN
    RAISE EXCEPTION '0302: service_role sem EXECUTE em %', v_sig;
  END IF;
  IF NOT has_function_privilege('verificador', v_proc, 'EXECUTE') THEN
    RAISE EXCEPTION '0302: verificador sem EXECUTE em %', v_sig;
  END IF;
  IF has_function_privilege('ingestor', v_proc, 'EXECUTE') THEN
    RAISE EXCEPTION '0302: ingestor não deveria ter EXECUTE em %', v_sig;
  END IF;

  -- Nenhuma sobrecarga criada por engano (uma só assinatura por nome).
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'get_geral_recebiveis') <> 1 THEN
    RAISE EXCEPTION '0302: sobrecarga de get_geral_recebiveis criada por engano';
  END IF;
END
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
