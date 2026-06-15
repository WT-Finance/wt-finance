-- ---------------------------------------------------------------------------
-- 0142 — feat(v4.19.1): solic_movimentacoes() — lista única de AUDITORIA das
-- movimentações das solicitações.
--
-- DECLARAÇÃO PRÉVIA (regime autônomo, ADITIVA / retrocompatível):
--   • O QUE FAZ: cria a RPC public.solic_movimentacoes() (STABLE SECURITY DEFINER,
--     exigir_acesso(ARRAY['solicitacoes']) — gestão-only, mesma área de "Ver todas"/
--     "Gerenciar"). Devolve uma LISTA ÚNICA de movimentos DERIVADA das colunas
--     existentes de app.solicitacao — SEM tabela de eventos nova (solicitacao_evento
--     segue fora de escopo). Cada solicitação rende:
--       (a) ABERTURA      — solicitante_id @ criado_em;
--       (b) DECISÃO TERMINAL (se status<>'aberta') — decidido_por @ decidido_em,
--           ação derivada do status (concluida→Conclusão, rejeitada→Rejeição,
--           cancelada→Cancelamento), justificativa como detalhe.
--     Ordenado por timestamp desc. É a realização do "relatório futuro" previsto no ADR-0117
--     (o par decidido_em/decidido_por + criado_em/solicitante cobre o histórico, sem reabertura).
--   • ADITIVA: só CREATE de função + GRANT; NÃO altera tabela/coluna/dado pré-existente.
--   • E-mail do ator: mesma resolução das demais RPCs de solicitação
--     ((SELECT email FROM app.rbac_usuarios WHERE user_id = <uuid>)); NULL se o usuário sumiu.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.solic_movimentacoes()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['solicitacoes']);
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
        'solicitacao_id', m.solicitacao_id,
        'tipo_nome',      m.tipo_nome,
        'acao',           m.acao,
        'status_atual',   m.status_atual,
        'ator',           m.ator,
        'em',             m.em,
        'detalhe',        m.detalhe
      ) ORDER BY m.em DESC, m.solicitacao_id DESC)
    FROM (
      -- (a) ABERTURA — sempre existe
      SELECT s.id AS solicitacao_id, t.nome AS tipo_nome, 'Abertura' AS acao,
             s.status AS status_atual,
             (SELECT coalesce(nome, email) FROM app.rbac_usuarios WHERE user_id = s.solicitante_id) AS ator,
             s.criado_em AS em, NULL::text AS detalhe
      FROM app.solicitacao s JOIN app.solicitacao_tipo t ON t.id = s.tipo_id
      UNION ALL
      -- (b) DECISÃO TERMINAL — só quando saiu de 'aberta'
      SELECT s.id, t.nome,
             CASE s.status WHEN 'concluida' THEN 'Conclusão'
                           WHEN 'rejeitada' THEN 'Rejeição'
                           WHEN 'cancelada' THEN 'Cancelamento'
                           ELSE 'Decisão' END,
             s.status,
             (SELECT coalesce(nome, email) FROM app.rbac_usuarios WHERE user_id = s.decidido_por),
             s.decidido_em, s.justificativa
      FROM app.solicitacao s JOIN app.solicitacao_tipo t ON t.id = s.tipo_id
      WHERE s.status <> 'aberta' AND s.decidido_em IS NOT NULL
    ) m
  ), '[]'::jsonb);
END; $$;

REVOKE EXECUTE ON FUNCTION public.solic_movimentacoes() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.solic_movimentacoes() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
