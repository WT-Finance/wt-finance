-- ---------------------------------------------------------------------------
-- 0158 — feat(v4.25.1): solic_emails_envolvidos devolve NOMES + DATAS (refino do e-mail).
--
-- DECLARAÇÃO (CLAUDE.md): ADITIVA / retrocompatível. CREATE OR REPLACE de uma função
-- (mesma assinatura `(bigint)` → preserva grants), NÃO altera tabela nem dado.
--
-- MOTIVO: o e-mail de notificação passa a exibir NOMES (não e-mails crus) e a DATA/HORA
-- da movimentação. A RPC agora devolve:
--   • autor_rotulo     = coalesce(nome, email) do solicitante (para "por {nome}")
--   • atribuido_rotulo = nome da role OU coalesce(nome, email) do destinatário usuário
--   • criado_em_fmt / decidido_em_fmt = 'DD/MM/AAAA às HH:MM' no fuso de São Paulo
-- (a action escolhe criado_em p/ 'criada' e decidido_em p/ as demais). `envolvidos_emails`
-- inalterado. Removidos `autor_email`/`atribuido_tipo` (o template não os usa mais —
-- "Atribuída a {rótulo}" sem "permissão"). Gate colapsado (0157) preservado.
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
  v_fmt    constant text := 'DD/MM/YYYY" às "HH24:MI';   -- "23/06/2026 às 10:04"
BEGIN
  PERFORM app.exigir_acesso();                       -- autenticado ATIVO (barra anon/inativo)

  SELECT * INTO v_sol FROM app.solicitacao WHERE id = p_id;
  -- Gate único (padrão solic_detalhe): inexistente E proibido dão o MESMO erro (sem oráculo).
  IF NOT FOUND OR NOT app.pode_ver_solic(v_sol) THEN
    RAISE EXCEPTION 'NAO_ENCONTRADA' USING ERRCODE = '42501';
  END IF;

  -- Envolvidos (DISTINCT): autor (sempre) + destinatário usuário (sempre) OU membros
  -- ATIVOS da role destinatária. SÓ os e-mails desta solicitação (nunca um diretório).
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
    'tipo_nome', (SELECT nome FROM app.solicitacao_tipo WHERE id = v_sol.tipo_id),
    -- nome do solicitante (fallback e-mail se sem nome cadastrado)
    'autor_rotulo', (SELECT coalesce(nullif(btrim(nome), ''), email)
                     FROM app.rbac_usuarios WHERE user_id = v_sol.solicitante_id),
    -- destinatário: nome da role OU nome (fallback e-mail) do usuário
    'atribuido_rotulo', CASE
      WHEN v_sol.destinatario_user_id IS NOT NULL
        THEN (SELECT coalesce(nullif(btrim(nome), ''), email)
              FROM app.rbac_usuarios WHERE user_id = v_sol.destinatario_user_id)
      ELSE (SELECT nome FROM app.rbac_roles WHERE id = v_sol.destinatario_role_id)
    END,
    'criado_em_fmt',   to_char(v_sol.criado_em AT TIME ZONE 'America/Sao_Paulo', v_fmt),
    'decidido_em_fmt', CASE WHEN v_sol.decidido_em IS NOT NULL
                            THEN to_char(v_sol.decidido_em AT TIME ZONE 'America/Sao_Paulo', v_fmt)
                            ELSE NULL END,
    'envolvidos_emails', coalesce(to_jsonb(v_emails), '[]'::jsonb)
  );
END;
$$;

-- CREATE OR REPLACE preserva grants; re-afirmamos por clareza (born-hardened).
REVOKE EXECUTE ON FUNCTION public.solic_emails_envolvidos(bigint) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.solic_emails_envolvidos(bigint) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
