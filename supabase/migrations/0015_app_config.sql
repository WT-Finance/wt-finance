-- V3-1: tabela de configuração global do dashboard.
-- Benchmarks de margem e outras configurações ajustáveis em runtime,
-- sem exigir nova migração ou deploy.

CREATE TABLE IF NOT EXISTS app.config (
  id             serial       PRIMARY KEY,
  chave          text         NOT NULL UNIQUE,
  valor          jsonb        NOT NULL,
  categoria      text         NOT NULL DEFAULT 'geral',
  descricao      text,
  atualizado_em  timestamptz  NOT NULL DEFAULT now(),
  atualizado_por text
);

-- Benchmarks iniciais de margem
INSERT INTO app.config (chave, valor, categoria, descricao) VALUES
  ('margem_alvo_pct',    '14', 'benchmark', 'Margem mínima para classificação OK (verde)'),
  ('margem_atencao_pct', '12', 'benchmark', 'Margem mínima para classificação Atenção (âmbar)'),
  ('margem_critica_pct', '10', 'benchmark', 'Margem abaixo desta = crítica (vermelho)')
ON CONFLICT (chave) DO NOTHING;

-- Leitura anon/authenticated (somente SELECT); escrita apenas via service_role
GRANT USAGE  ON SCHEMA app  TO anon, authenticated;
GRANT SELECT ON app.config  TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPC pública: retorna todos os valores de config como objeto JSON
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_dashboard_config()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_object_agg(chave, valor)
  FROM app.config
$$;

REVOKE EXECUTE ON FUNCTION public.get_dashboard_config() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_dashboard_config() TO anon, authenticated, service_role;
