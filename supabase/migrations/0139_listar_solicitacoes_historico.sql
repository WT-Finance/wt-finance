-- 0139 — admin_listar_solicitacoes: histórico de acesso mais informativo (v4.18.0/M4).
--
-- DECLARAÇÃO PRÉVIA (âncora / regime autônomo):
--   • O QUE FAZ: CREATE OR REPLACE de admin_listar_solicitacoes acrescentando dois
--     campos ao JSON retornado — `decidido_por_rotulo` (nome ou e-mail de QUEM decidiu,
--     via LEFT JOIN em app.rbac_usuarios pelo decidido_por) e `observacao` (motivo da
--     rejeição). É o insumo do histórico "Aprovada/Rejeitada em DD/MM/AAAA às HH:MM por …".
--   • ADITIVA / retrocompatível: só ACRESCENTA chaves ao objeto; consumidores antigos
--     ignoram os campos novos. Mesmo guard (exigir_acesso 'admin/acessos'), mesmos grants.
--     NÃO altera schema nem escreve em dados pré-existentes.

CREATE OR REPLACE FUNCTION public.admin_listar_solicitacoes()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['admin/acessos']);
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id', s.id, 'email', s.email, 'nome', s.nome, 'status', s.status,
      'criado_em', s.criado_em, 'decidido_em', s.decidido_em,
      'decidido_por_rotulo', coalesce(du.nome, du.email),
      'observacao', s.observacao
    ) ORDER BY (s.status = 'pendente') DESC, s.criado_em DESC)
    FROM app.rbac_solicitacoes s
    LEFT JOIN app.rbac_usuarios du ON du.user_id = s.decidido_por
  ), '[]'::jsonb);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_listar_solicitacoes() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_listar_solicitacoes() TO authenticated, service_role;
