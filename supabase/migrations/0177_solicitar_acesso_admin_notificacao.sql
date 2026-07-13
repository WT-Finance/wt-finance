-- ---------------------------------------------------------------------------
-- 0177 — solicitar_acesso_admin: auto-cadastro + insumo p/ notificar admins
--
-- Declaração (regime ADITIVO): CREATE FUNCTION nova + GRANT/REVOKE. NÃO altera
-- solicitar_acesso (anon) nem qualquer objeto existente; NÃO reescreve dado
-- pré-existente (só INSERE uma solicitação nova, como solicitar_acesso já faz).
-- Retrocompatível com a `main` viva.
--
-- Numeração: 0177 fica ACIMA da 0175/0176 da branch v5.0.0 (paralela) p/ evitar
-- colisão de arquivo. Aplicar DEPOIS que a v5.0.0 (0175 aditiva + 0176 destrutiva)
-- já estiver aplicada, na ordem.
--
-- Contexto: hoje o auto-cadastro (/solicitar-acesso) NÃO avisa ninguém. Esta função
-- é a variante SERVICE_ROLE do fluxo: além de inserir (mesma guarda de solicitar_acesso),
-- informa se REALMENTE inseriu (pedido novo, não duplicado/nem já-usuário) e devolve os
-- e-mails ATIVOS com a área 'admin/acessos', para a Server Action de /solicitar-acesso
-- notificar quem administra Usuários & Acessos.
--
-- SEGURANÇA: service_role-ONLY (REVOKE anon/authenticated). A Server Action chama via
-- getAdminClient() (100% server-side). Assim o "inserida" (oráculo de enumeração) e a
-- lista de e-mails NUNCA ficam alcançáveis por chamador anônimo — preserva o invariante
-- M1 (v4.17.0: anon só executa solicitar_acesso). solicitar_acesso (anon) permanece
-- intacta como contrato público de auto-cadastro.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.solicitar_acesso_admin(p_email text, p_nome text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email  text   := lower(trim(p_email));
  v_count  int;
  v_emails text[] := ARRAY[]::text[];
BEGIN
  IF v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RETURN jsonb_build_object('inserida', false, 'emails', '[]'::jsonb);
  END IF;

  -- Mesma guarda de solicitar_acesso (0125): só insere se não há pendente para o
  -- e-mail E ele ainda não é usuário.
  INSERT INTO app.rbac_solicitacoes (email, nome)
  SELECT v_email, nullif(trim(p_nome), '')
  WHERE NOT EXISTS (
          SELECT 1 FROM app.rbac_solicitacoes s
          WHERE lower(s.email) = v_email AND s.status = 'pendente')
    AND NOT EXISTS (
          SELECT 1 FROM app.rbac_usuarios u WHERE lower(u.email) = v_email);
  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Só busca os destinatários quando de fato inseriu (pedido NOVO) — evita notificar
  -- em reenvios/duplicatas. E-mails ativos com a área que governa Usuários & Acessos.
  IF v_count > 0 THEN
    SELECT coalesce(array_agg(DISTINCT lower(u.email)), ARRAY[]::text[])
    INTO v_emails
    FROM app.rbac_usuarios u
    JOIN app.rbac_role_permissoes rp ON rp.role_id = u.role_id
    WHERE u.ativo AND rp.area = 'admin/acessos';
  END IF;

  RETURN jsonb_build_object('inserida', v_count > 0, 'emails', to_jsonb(v_emails));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.solicitar_acesso_admin(text, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.solicitar_acesso_admin(text, text) TO service_role;
