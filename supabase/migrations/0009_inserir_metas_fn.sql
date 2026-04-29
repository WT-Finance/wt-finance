-- Função para inserir metas sem expor o schema analytics via REST.
-- Recebe um array JSON com { setor_macro_nome, ano, mes, valor_meta, fonte }
-- e faz o JOIN com dim_setor_macro internamente.

CREATE OR REPLACE FUNCTION public.inserir_metas(p_metas jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  meta jsonb;
BEGIN
  FOR meta IN SELECT jsonb_array_elements(p_metas)
  LOOP
    INSERT INTO app.meta_setor (setor_macro_id, ano, mes, valor_meta, fonte)
    SELECT
      dsm.id,
      (meta->>'ano')::int,
      (meta->>'mes')::int,
      (meta->>'valor_meta')::numeric,
      meta->>'fonte'
    FROM analytics.dim_setor_macro dsm
    WHERE dsm.nome = meta->>'setor_macro_nome'
    ON CONFLICT (setor_macro_id, ano, mes) DO NOTHING;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.inserir_metas(jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.inserir_metas(jsonb) TO service_role;
