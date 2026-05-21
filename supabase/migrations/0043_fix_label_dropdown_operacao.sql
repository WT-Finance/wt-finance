-- Fix: get_operacoes_lista_weddings retornava label duplicado
-- porque 'operacao' já está no formato "W - Casal - DDMMMAA" e a função
-- ainda concatenava " - nome_casal - DD/MM/YYYY" por cima.
-- Solução: label = operacao diretamente.

CREATE OR REPLACE FUNCTION public.get_operacoes_lista_weddings()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'operacao', operacao,
        'label',    operacao
      )
      ORDER BY data_evento ASC NULLS LAST
    ),
    '[]'::jsonb
  )
  FROM analytics.dim_operacao_weddings
  WHERE data_evento IS NOT NULL;
$$;

REVOKE EXECUTE ON FUNCTION public.get_operacoes_lista_weddings() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_operacoes_lista_weddings()
  TO anon, authenticated, service_role;
