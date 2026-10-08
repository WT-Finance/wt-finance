-- ---------------------------------------------------------------------------
-- 0291 — fix(v6.2.3): a carga de Vendas por Produto deixa de ser recusada por venda SEM SETOR —
--        a linha fica no cru (o checksum do arquivo precisa dela) e sai da leitura, com AVISO
--
-- DECLARAÇÃO PRÉVIA (regime aditivo / autônomo):
--   • O QUE FAZ — dois objetos, ambos por CREATE OR REPLACE a partir do catálogo VIVO (dump
--     READ ONLY de 08/10/2026, insumo fora do repositório; a função viva é byte a byte a da 0284):
--       1. `analytics.vendas_excel_para_fato` (0277/0283): o predicado ganha `setor_macro IS NOT
--          NULL AND` na frente do `IS DISTINCT FROM 'Welcome'` que já existia. Mesma lista de
--          colunas (as 25 de raw.vendas_excel, conferidas contra o dump e o baseline), mesmo dono,
--          ACL vazia — o OR REPLACE de view só aceita isso, e é isso.
--       2. `public.validar_carga_staging()` (0284): a guarda de setor/setor_micro passa a usar o
--          MESMO predicado da view (as três ocorrências), e entra um AVISO não-bloqueante com a
--          contagem de linhas/vendas sem setor e os `venda_numero` (cortados em 300 caracteres,
--          como a mensagem da guarda já faz). O retorno ganha a chave `sem_setor` (linhas).
--          E uma guarda NOVA que REPROVA: carga em que nenhuma linha passa no predicado da view
--          (arquivo inteiro sem setor, ou só Welcome) — sem ela, ignorar a linha sem setor seria
--          fail-open e a promoção esvaziaria `fato_venda` (achado ALTO do revisor-db).
--     E os dois COMMENTs, que hoje afirmam a regra que esta migration inverte.
--   • POR QUE: o Monde deixa, em casos raros, uma venda ser lançada SEM SETOR até a forma de
--     pagamento ser informada — estado transitório, que se resolve sozinho na origem. A guarda da
--     0132/0284 cobrava toda linha não-Welcome contra `analytics.dim_setor`; setor nulo dá
--     `setor_macro` nulo, passa no `IS DISTINCT FROM 'Welcome'`, não existe na dimensão e a carga
--     INTEIRA era recusada ("setor=«∅»"). Uma venda incompleta derrubava a atualização de todas
--     as outras. Decisão do Yan (08/10): ignorar a venda sem setor enquanto ela estiver assim.
--   • ⚠️ INVERTE DE PROPÓSITO a regra "NULL passa" da 0277/0283. Lá o `IS DISTINCT FROM` existia
--     para que linha sem setor macro NÃO sumisse EM SILÊNCIO da leitura. Aqui ela sai da leitura
--     DE PROPÓSITO, e não em silêncio: o aviso da validação nomeia as vendas a cada carga. Por que
--     tirar da VIEW e não só afrouxar a guarda: afrouxar só a guarda deixaria a venda entrar em
--     `analytics.fato_venda` como cabeçalho SEM itens (o INNER JOIN de `fato_venda_item` com
--     `dim_setor` a descarta) — contaria como venda, e como contrato se fosse "Contrato de
--     casamento", sem valor nenhum. Pela view ela some de forma coerente de todos os leitores.
--   • EFEITO NOS LEITORES (os sete que leem pela view — transform, regenerar_dim_operacao_weddings,
--     contar_convidados_operacao, get_carteira/get_operacao/get_operacoes_weddings__nucleo e
--     vw_vendas_agregadas): enquanto a venda estiver sem setor, ela não aparece em nenhum deles;
--     volta na primeira carga em que o Monde trouxer o setor (a promoção é substituição completa).
--     Na base viva de 08/10 há ZERO linhas com setor_macro nulo (49.438 linhas): nenhum número
--     de hoje muda com esta migration.
--   • O QUE NÃO MUDA: a guarda de data (dim_data) e o aviso de operacao_propria continuam sobre a
--     staging inteira; `raw.vendas_excel` continua guardando o arquivo inteiro (checksum §4).
--     Uma linha COM setor fora das dimensões continua reprovando a carga exatamente como antes.
--   • VENDA MISTA (itens com e sem setor na mesma venda — não observado, não medido): só os itens
--     sem setor saem; a venda entra em fato_venda com os demais. O aviso fala em LINHAS por isso.
--   • APLICAR fora de carga em andamento: o OR REPLACE da view espera o lock de uma promoção em
--     curso (TRUNCATE) e os leitores entram na fila atrás dela.
--   • ACL/dono/SECURITY DEFINER/search_path da função preservados pelo CREATE OR REPLACE
--     (assinatura idêntica, sem parâmetros). EXECUTE hoje: postgres, service_role, verificador,
--     ingestor. Retorno continua `jsonb` (database.ts não muda).
--   • Classificação: ADITIVA (CREATE OR REPLACE de view com as mesmas colunas e de corpo de
--     função, COMMENT e NOTIFY). Nenhum dado é escrito.
--   • Reversão: reaplicar a view com só `WHERE setor_macro IS DISTINCT FROM 'Welcome'`, o corpo
--     da 0284 e os COMMENTs da 0283 (view) e da 0284 (função).
-- ---------------------------------------------------------------------------

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- 1. analytics.vendas_excel_para_fato — sai também a linha sem setor
-- ═════════════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW analytics.vendas_excel_para_fato AS
SELECT *
FROM raw.vendas_excel
WHERE setor_macro IS NOT NULL
  AND setor_macro IS DISTINCT FROM 'Welcome';

COMMENT ON VIEW analytics.vendas_excel_para_fato IS
  'v6.0.0/M5 (0277) + M7a (0283) + v6.2.3 (0291): raw.vendas_excel sem as linhas de Setor Macro = '
  'Welcome (briefing v6.0.0 decisão 8; anexo M5 §1, anexo M7 §2) e sem as linhas SEM SETOR (0291: '
  'venda lançada no Monde sem setor até a forma de pagamento ser informada — estado transitório; '
  'a venda volta na carga seguinte em que o setor vier). raw.vendas_excel guarda o arquivo INTEIRO '
  '(o checksum do arquivo precisa disso para fechar, contrato §4) e é esta view, não a tabela, que '
  'TODOS os consumidores de Vendas por Produto leem: public.transform_raw_to_analytics() (0277), '
  'analytics.regenerar_dim_operacao_weddings(), public.contar_convidados_operacao(text), '
  'public.get_carteira_weddings__nucleo(text), public.get_operacao_weddings__nucleo(text), '
  'public.get_operacoes_weddings__nucleo(...) e analytics.vw_vendas_agregadas (0283). A exclusão '
  'da linha sem setor é DELIBERADA e não silenciosa: public.validar_carga_staging() avisa a cada '
  'carga quais vendas ficaram de fora, e reprova a carga em que NENHUMA linha passa neste predicado '
  '(arquivo inteiro sem setor esvaziaria a base). public.validar_carga_staging() usa este MESMO '
  'predicado, literal, na guarda de dimensões; o contador TS vendasDistintasQueEntramNoFato o espelha.';

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- 2. public.validar_carga_staging() — guarda com o predicado da view + aviso de venda sem setor
-- ═════════════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.validar_carga_staging()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_total      int;
  v_min        date;
  v_max        date;
  v_dim_min    date;
  v_dim_max    date;
  v_fora       int;
  v_setor_fora int;
  v_setor_vals text;
  v_sem_setor        int;
  v_sem_setor_vendas int;
  v_sem_setor_vals   text;
  v_erros      text[] := '{}';
  v_avisos     text[] := '{}';
  v_prod_total int;
  v_prod_pct   numeric;
  v_stg_pct    numeric;
BEGIN
  SELECT count(*) INTO v_total FROM raw.vendas_excel_staging;
  IF v_total = 0 THEN
    RETURN jsonb_build_object(
      'ok', false, 'total', 0,
      'erros', jsonb_build_array('Nenhuma linha válida na carga — arquivo vazio ou inválido.')
    );
  END IF;

  SELECT min(data_venda), max(data_venda) INTO v_min, v_max
  FROM raw.vendas_excel_staging WHERE data_venda IS NOT NULL;

  SELECT min(data), max(data) INTO v_dim_min, v_dim_max FROM analytics.dim_data;

  SELECT count(*) INTO v_fora
  FROM raw.vendas_excel_staging
  WHERE data_venda IS NOT NULL AND (data_venda < v_dim_min OR data_venda > v_dim_max);

  IF v_fora > 0 THEN
    v_erros := v_erros || format(
      '%s venda(s) com data fora do calendário (%s a %s). Estenda dim_data antes de carregar.',
      v_fora, v_dim_min, v_dim_max);
  END IF;

  -- Guarda de setor/setor_micro (0132): linhas que o INNER JOIN do transform descartaria.
  -- v6.0.0/0284: só as linhas que o transform LÊ — o mesmo predicado de
  -- analytics.vendas_excel_para_fato (0277). As linhas de Setor Macro = Welcome entram em
  -- raw.vendas_excel (o checksum do arquivo precisa delas) e ficam FORA do transform por decisão
  -- (briefing v6.0.0, decisão 8); cobrá-las contra as dimensões reprovava a carga do cru inteira.
  -- v6.2.3/0291: a linha SEM SETOR também fica fora da view (venda transitória no Monde) — sai da
  -- guarda pelo mesmo predicado e entra no AVISO abaixo, em vez de reprovar a carga inteira.
  -- IS DISTINCT FROM, nunca <>, para Welcome: a forma do predicado é a da view, literal.
  SELECT count(*) INTO v_setor_fora
  FROM raw.vendas_excel_staging s
  WHERE s.setor_macro IS NOT NULL AND s.setor_macro IS DISTINCT FROM 'Welcome'
    AND (NOT EXISTS (SELECT 1 FROM analytics.dim_setor d        WHERE d.nome  = TRIM(s.setor))
      OR NOT EXISTS (SELECT 1 FROM analytics.dim_setor_micro dm WHERE dm.nome = TRIM(s.setor_micro)));

  IF v_setor_fora > 0 THEN
    SELECT string_agg(DISTINCT q, ', ' ORDER BY q) INTO v_setor_vals
    FROM (
      SELECT 'setor=«'        || coalesce(NULLIF(TRIM(s.setor), ''), '∅')       || '»' AS q
        FROM raw.vendas_excel_staging s
        WHERE s.setor_macro IS NOT NULL AND s.setor_macro IS DISTINCT FROM 'Welcome'
          AND NOT EXISTS (SELECT 1 FROM analytics.dim_setor d WHERE d.nome = TRIM(s.setor))
      UNION
      SELECT 'setor_micro=«' || coalesce(NULLIF(TRIM(s.setor_micro), ''), '∅') || '»'
        FROM raw.vendas_excel_staging s
        WHERE s.setor_macro IS NOT NULL AND s.setor_macro IS DISTINCT FROM 'Welcome'
          AND NOT EXISTS (SELECT 1 FROM analytics.dim_setor_micro dm WHERE dm.nome = TRIM(s.setor_micro))
    ) t;

    v_erros := v_erros || format(
      '%s venda(s) com setor/setor_micro fora das dimensões (seriam descartadas em silêncio pelo transform): %s. Atualize analytics.dim_setor/dim_setor_micro antes de carregar.',
      v_setor_fora, left(v_setor_vals, 300));
  END IF;

  -- v6.2.3/0291: carga em que NENHUMA linha passa no predicado da view REPROVA. Sem esta guarda,
  -- ignorar a linha sem setor seria fail-open para o arquivo INTEIRO sem setor (o Monde exportando
  -- a coluna vazia): a validação passaria só com aviso, a promoção truncaria fato_venda e o
  -- transform, lendo a view vazia, deixaria as telas sem venda nenhuma (achado ALTO do revisor-db).
  -- Cobre também o arquivo só-Welcome, que já passava antes da 0291.
  IF NOT EXISTS (SELECT 1 FROM raw.vendas_excel_staging s
                 WHERE s.setor_macro IS NOT NULL AND s.setor_macro IS DISTINCT FROM 'Welcome') THEN
    v_erros := v_erros || format(
      'Nenhuma das %s linha(s) da carga tem Setor válido para as telas (todas sem Setor ou Welcome) — carregá-la esvaziaria a base de vendas. Confira se o relatório exportado traz a coluna Setor preenchida.',
      v_total);
  END IF;

  -- v6.2.3/0291: venda SEM SETOR — AVISO não-bloqueante. A linha é gravada em raw.vendas_excel
  -- (checksum do arquivo) e fica fora de analytics.vendas_excel_para_fato até uma carga em que o
  -- Monde traga o setor. O aviso é o que impede o "ignorar" de virar "sumir em silêncio".
  -- A contagem de vendas usa o MESMO coalesce da lista (uma venda sem número conta como «∅»).
  SELECT count(*), count(DISTINCT coalesce(NULLIF(TRIM(s.venda_numero), ''), '∅'))
    INTO v_sem_setor, v_sem_setor_vendas
  FROM raw.vendas_excel_staging s
  WHERE s.setor_macro IS NULL;

  IF v_sem_setor > 0 THEN
    SELECT string_agg(DISTINCT q, ', ' ORDER BY q) INTO v_sem_setor_vals
    FROM (
      SELECT coalesce(NULLIF(TRIM(s.venda_numero), ''), '∅') AS q
        FROM raw.vendas_excel_staging s
        WHERE s.setor_macro IS NULL
    ) t;

    v_avisos := v_avisos || format(
      '%s linha(s) sem Setor no Monde, de %s venda(s), ficaram de fora das telas nesta carga — vendas: %s. Elas voltam sozinhas na próxima carga em que o Setor estiver preenchido. A carga prossegue.',
      v_sem_setor, v_sem_setor_vendas, left(v_sem_setor_vals, 300));
  END IF;

  -- op_propria: AVISO não-bloqueante se o preenchimento de operacao_propria cair
  -- abruptamente vs a base viva (origem parou de popular → regressão silenciosa v4.9.x).
  SELECT count(*) INTO v_prod_total FROM raw.vendas_excel;
  IF v_prod_total > 0 THEN
    SELECT round(100.0 * count(*) FILTER (WHERE operacao_propria IS NOT NULL AND operacao_propria <> '') / count(*), 1)
      INTO v_prod_pct FROM raw.vendas_excel;
    SELECT round(100.0 * count(*) FILTER (WHERE operacao_propria IS NOT NULL AND operacao_propria <> '') / count(*), 1)
      INTO v_stg_pct FROM raw.vendas_excel_staging;
    IF v_prod_pct > 0 AND v_stg_pct < v_prod_pct / 2 THEN
      v_avisos := v_avisos || format(
        'operacao_propria preenchida em %s%% da carga vs %s%% da base atual — queda abrupta. Verifique se a origem (ERP) ainda exporta a coluna. A carga prossegue.',
        v_stg_pct, v_prod_pct);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok',            (array_length(v_erros, 1) IS NULL),
    'total',         v_total,
    'data_min',      v_min,
    'data_max',      v_max,
    'dim_min',       v_dim_min,
    'dim_max',       v_dim_max,
    'fora_do_range', v_fora,
    'setor_fora',    v_setor_fora,
    'sem_setor',     v_sem_setor,
    'erros',         to_jsonb(v_erros),
    'avisos',        to_jsonb(v_avisos)
  );
END;
$function$
;

COMMENT ON FUNCTION public.validar_carga_staging() IS
  'Valida a staging de Vendas por Produto antes da promoção (jsonb: ok, total, erros, avisos, sem_setor). Guardas: data fora de dim_data (todas as linhas); setor/setor_micro fora das dimensões SÓ nas linhas que o transform lê (setor_macro IS NOT NULL AND setor_macro IS DISTINCT FROM ''Welcome'', o predicado de analytics.vendas_excel_para_fato — v6.0.0/0284, v6.2.3/0291); REPROVA a carga em que nenhuma linha passa nesse predicado (esvaziaria fato_venda — 0291); AVISO de linha sem setor (fica fora da leitura até vir com setor — 0291); aviso de queda de operacao_propria. SEM exigir_acesso no corpo POR DESENHO: RPC de carga, protegida por GRANT.';

NOTIFY pgrst, 'reload schema';
