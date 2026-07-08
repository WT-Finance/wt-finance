-- 0174 — Onboarding "Welcome to Janus" (v4.40.0, ADR-0145). ADITIVA / retrocompatível.
--
-- O QUE FAZ: (1) ADD COLUMN anulável `onboarding_visto_em timestamptz` em app.rbac_usuarios
-- (flag por usuário do modal de boas-vindas — no BANCO, não em localStorage: multi-dispositivo);
-- (2) duas RPCs novas no padrão INLINE (guard na 1ª linha; qualquer autenticado ATIVO — o dado
-- é do próprio usuário, sem área específica, mesmo molde de solic_minhas_pendencias/0133).
--
-- ADITIVA/RETROCOMPATÍVEL com a main viva: só ADD COLUMN NULL + CREATE FUNCTION + GRANTs.
-- NÃO escreve em dados pré-existentes (a coluna nasce NULL para todos = ninguém viu o modal).

ALTER TABLE app.rbac_usuarios ADD COLUMN onboarding_visto_em timestamptz;

-- Já viu o modal? true = não exibir. (Usuário sem linha em rbac_usuarios → false, mas esse
-- estado não ocorre em sessão válida; o guard já barra inativo/anon.)
CREATE OR REPLACE FUNCTION public.onboarding_visto()
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  PERFORM app.exigir_acesso();  -- qualquer autenticado ATIVO; barra inativo/anon
  RETURN EXISTS (
    SELECT 1 FROM app.rbac_usuarios u
    WHERE u.user_id = app.uid_jwt() AND u.onboarding_visto_em IS NOT NULL
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.onboarding_visto() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.onboarding_visto() TO authenticated, service_role;

-- Grava a 1ª visualização (idempotente: COALESCE preserva o timestamp original se já visto).
CREATE OR REPLACE FUNCTION public.marcar_onboarding_visto()
RETURNS void
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  PERFORM app.exigir_acesso();
  UPDATE app.rbac_usuarios
  SET onboarding_visto_em = COALESCE(onboarding_visto_em, now()),
      atualizado_em       = now()
  WHERE user_id = app.uid_jwt();
END;
$$;
REVOKE EXECUTE ON FUNCTION public.marcar_onboarding_visto() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.marcar_onboarding_visto() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
