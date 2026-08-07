-- ---------------------------------------------------------------------------
-- 0239 — feat(v5.5.0/M2): upsert idempotente da série do CDI (BACEN/SGS).
--
-- ADITIVA / retrocompatível. Declaração prévia (regime do CLAUDE.md):
--   • O QUE FAZ: CREATE de uma função nova, `public.cdi_ingest_upsert(jsonb)`,
--     que grava a série mensal do CDI em `analytics.dim_taxa_cdi` (criada na
--     0238). Nenhum objeto existente é alterado.
--   • POR QUE É ADITIVA: só CREATE. A escrita que ela faz é sobre a `dim_taxa_cdi`,
--     tabela que NASCEU VAZIA nesta mesma versão e não tem histórico a preservar —
--     não há dado pré-existente sob risco. Nenhum DROP/TRUNCATE/ALTER.
--   • REVERSIBILIDADE: `DROP FUNCTION public.cdi_ingest_upsert(jsonb)`.
--
-- ⚠️ NÃO AGENDA NADA. O `cron.schedule` vive em
-- `supabase/patches/PENDENTE-agendamento-cdi.sql`, aplicado só DEPOIS do deploy do
-- código. Agendar antes é a armadilha que a v5.4.4 pagou: o cron chama uma rota
-- que ainda não existe, o pg_net registra a resposta e o job aparece VERDE em
-- `cron.job_run_details` sem ter feito nada.
--
-- SERVICE_ROLE-ONLY, sem `app.exigir_acesso`: quem chama é a API Route
-- `/api/cdi/ingest` pelo admin client. Nenhum papel de usuário alcança esta função
-- (REVOKE de PUBLIC/anon/authenticated abaixo), então o gate de área seria
-- inalcançável — mesmo regime das funções `__nucleo` e das `monde_ingest_*`.
--
-- IDEMPOTÊNCIA: chave primária em `mes` + `ON CONFLICT DO UPDATE`. Rodar duas
-- vezes seguidas não cria linha nem corrompe valor; a 2ª passada devolve
-- `novas: 0, alteradas: 0`. `atualizado_em` é reescrito SEMPRE, inclusive quando o
-- valor não mudou — é isso que o torna um "última vez CONFIRMADO pela fonte", e
-- portanto o sinal de staleness que a UI lê. Se ele só mudasse junto com a taxa,
-- uma ingestão quebrada há meses seria indistinguível de um CDI estável.
--
-- Verificação pós-push: via REST/service_role — chamar duas vezes com o mesmo
-- payload e conferir contagem de linhas idêntica e `novas/alteradas` zerados na
-- segunda; conferir 3 meses contra o site do BACEN.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cdi_ingest_upsert(p_taxas jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF p_taxas IS NULL OR jsonb_typeof(p_taxas) <> 'array' THEN
    RAISE EXCEPTION 'p_taxas deve ser um array jsonb' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Array vazio é FALHA, não no-op: significa que a origem respondeu sem dado
  -- nenhum, e engolir isso em silêncio é exatamente o modo de falha que já custou
  -- caro aqui (200 sem conteúdo parecendo sucesso).
  IF jsonb_array_length(p_taxas) = 0 THEN
    RAISE EXCEPTION 'p_taxas vazio: a origem não devolveu nenhuma taxa'
      USING ERRCODE = 'no_data_found';
  END IF;

  WITH entrada AS (
    SELECT
      (e->>'mes')::date     AS mes,
      (e->>'taxa')::numeric AS taxa
    FROM jsonb_array_elements(p_taxas) e
  ),
  -- Lido ANTES do upsert: todas as CTEs de um mesmo statement enxergam o mesmo
  -- snapshot, então isto é o estado pré-escrita mesmo com a CTE de INSERT ao lado.
  antes AS (
    SELECT e.mes, e.taxa AS taxa_nova, d.taxa AS taxa_antiga
    FROM entrada e
    LEFT JOIN analytics.dim_taxa_cdi d ON d.mes = e.mes
  ),
  gravadas AS (
    INSERT INTO analytics.dim_taxa_cdi AS t (mes, taxa, origem, atualizado_em)
    SELECT mes, taxa, 'bacen_sgs', now() FROM entrada
    ON CONFLICT (mes) DO UPDATE
      SET taxa          = EXCLUDED.taxa,
          origem        = EXCLUDED.origem,
          atualizado_em = now()
    RETURNING t.mes
  )
  SELECT jsonb_build_object(
    'recebidas',  (SELECT count(*) FROM entrada),
    'gravadas',   (SELECT count(*) FROM gravadas),
    'novas',      (SELECT count(*) FROM antes WHERE taxa_antiga IS NULL),
    'alteradas',  (SELECT count(*) FROM antes
                    WHERE taxa_antiga IS NOT NULL
                      AND taxa_antiga IS DISTINCT FROM taxa_nova),
    'mes_min',    to_char((SELECT min(mes) FROM entrada), 'YYYY-MM-DD'),
    'mes_max',    to_char((SELECT max(mes) FROM entrada), 'YYYY-MM-DD'),
    -- ⚠️ Uma contagem crua de `dim_taxa_cdi` aqui devolveria o total ANTES do
    -- upsert: o statement inteiro roda num único snapshot, então nem o SELECT
    -- externo enxerga as linhas que a CTE `gravadas` acabou de inserir. E esse é
    -- justamente o número que a auto-auditoria de idempotência compara entre duas
    -- passadas. Somar `novas` ao total pré-escrita dá o total real pós-commit.
    'total_serie',(SELECT count(*) FROM analytics.dim_taxa_cdi)
                  + (SELECT count(*) FROM antes WHERE taxa_antiga IS NULL)
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cdi_ingest_upsert(jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.cdi_ingest_upsert(jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';
