-- V3-1 (complemento): adiciona função utilitária app.get_config_numeric().
-- Omitida na migration 0015; permite leitura de valores numéricos direto no SQL
-- sem precisar desserializar o jsonb no lado da aplicação.

CREATE OR REPLACE FUNCTION app.get_config_numeric(p_chave text)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (valor #>> '{}')::numeric
  FROM app.config
  WHERE chave = p_chave
$$;

GRANT EXECUTE ON FUNCTION app.get_config_numeric(text) TO anon, authenticated, service_role;
