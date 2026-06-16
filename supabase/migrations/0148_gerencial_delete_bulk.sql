-- ---------------------------------------------------------------------------
-- 0148 — v4.21.0 M5: exclusão em massa de lançamentos gerenciais.
-- ADITIVA: RPC nova (born-hardened: exigir_acesso + GRANT authenticated). Hard delete por
-- conjunto de ids (qualquer origem); o aviso extra para origem='planilha' é da UI.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_gerencial_lancamentos_bulk(p_ids BIGINT[])
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_n INT;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/gerencial']);
  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN RETURN 0; END IF;
  DELETE FROM analytics.gerencial_lancamentos WHERE id = ANY(p_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;

REVOKE EXECUTE ON FUNCTION public.delete_gerencial_lancamentos_bulk(BIGINT[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.delete_gerencial_lancamentos_bulk(BIGINT[]) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
