-- ---------------------------------------------------------------------------
-- 0157 — hardening(v4.25.0): solic_emails_envolvidos sem oráculo de existência.
--
-- DECLARAÇÃO (CLAUDE.md): ADITIVA / retrocompatível. Só CREATE OR REPLACE de uma
-- função (preserva grants), NÃO altera tabela nem dado, NÃO toca outro objeto.
--
-- ACHADO da auto-auditoria adversarial (v4.25): a 0156 separava `NAO_ENCONTRADA`
-- (P0002) de `PERMISSAO_NEGADA` (42501) — o que deixava um AUTENTICADO, via chamada
-- REST direta, distinguir "ID inexistente" de "ID existe mas você não vê" (oráculo de
-- existência; só a EXISTÊNCIA do id, nenhum e-mail/PII; na UI o erro é engolido pelo
-- try/catch de notificarMovimentacao). O padrão do projeto (solic_detalhe/concluir/
-- cancelar, 0128) COLAPSA os dois ramos num só, justamente para não revelar existência.
-- FIX: colapsar em `IF NOT FOUND OR NOT app.pode_ver_solic(v_sol) THEN RAISE
-- 'NAO_ENCONTRADA' USING ERRCODE='42501'` — idêntico ao solic_detalhe. Demais corpo
-- (fan-out gated, retorno) inalterado.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.solic_emails_envolvidos(p_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sol    app.solicitacao;
  v_emails text[];
BEGIN
  PERFORM app.exigir_acesso();                       -- autenticado ATIVO (barra anon/inativo)

  SELECT * INTO v_sol FROM app.solicitacao WHERE id = p_id;
  -- Gate único (padrão solic_detalhe): inexistente E proibido dão o MESMO erro —
  -- sem distinção observável (não revela a existência do id a quem não pode ver).
  IF NOT FOUND OR NOT app.pode_ver_solic(v_sol) THEN
    RAISE EXCEPTION 'NAO_ENCONTRADA' USING ERRCODE = '42501';
  END IF;

  -- Envolvidos (DISTINCT): autor (sempre) + destinatário usuário (sempre, atribuído
  -- explícito) OU todos os membros ATIVOS da role destinatária. SÓ os desta solicitação.
  SELECT array_agg(DISTINCT e) INTO v_emails FROM (
    SELECT email AS e FROM app.rbac_usuarios
      WHERE user_id = v_sol.solicitante_id
    UNION
    SELECT email FROM app.rbac_usuarios
      WHERE v_sol.destinatario_user_id IS NOT NULL AND user_id = v_sol.destinatario_user_id
    UNION
    SELECT email FROM app.rbac_usuarios
      WHERE v_sol.destinatario_role_id IS NOT NULL AND role_id = v_sol.destinatario_role_id AND ativo
  ) s
  WHERE e IS NOT NULL;

  RETURN jsonb_build_object(
    'tipo_nome',     (SELECT nome FROM app.solicitacao_tipo WHERE id = v_sol.tipo_id),
    'autor_email',   (SELECT email FROM app.rbac_usuarios WHERE user_id = v_sol.solicitante_id),
    'atribuido_tipo', CASE WHEN v_sol.destinatario_user_id IS NOT NULL THEN 'usuario' ELSE 'role' END,
    'atribuido_rotulo', CASE
      WHEN v_sol.destinatario_user_id IS NOT NULL
        THEN (SELECT email FROM app.rbac_usuarios WHERE user_id = v_sol.destinatario_user_id)
      ELSE (SELECT nome FROM app.rbac_roles WHERE id = v_sol.destinatario_role_id)
    END,
    'envolvidos_emails', coalesce(to_jsonb(v_emails), '[]'::jsonb)
  );
END;
$$;

-- CREATE OR REPLACE preserva grants; re-afirmamos por clareza (born-hardened).
REVOKE EXECUTE ON FUNCTION public.solic_emails_envolvidos(bigint) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.solic_emails_envolvidos(bigint) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
