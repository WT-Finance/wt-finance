-- ---------------------------------------------------------------------------
-- 0221 — feat(v5.4.0/Round4): CONSULTA de solicitação pela API externa — decisão
-- do Yan (2026-07-31): "não seria mais fácil para o nosso lado criarmos um
-- endpoint de consulta no Janus?".
--
-- Sim, e por um motivo mais forte que conveniência: sem consulta, a integração
-- depende do OUTRO lado construir e hospedar um receptor de webhook. Se o
-- integrador não fizer, ele cria pedidos e nunca sabe o desfecho — risco de
-- lançamento que não está nas nossas mãos. Pior: a outbox DESISTE após 8
-- tentativas (`esgotado`), então um endpoint dele fora do ar por algumas horas
-- perde o evento para sempre, hoje sem caminho de recuperação. Com consulta, o
-- contrato fica autossuficiente (criar → consultar → cancelar, tudo por chamada
-- dele) e o callback volta a ser o que deveria: otimização de tempo real, não
-- pré-requisito.
--
-- DECLARAÇÃO PRÉVIA (regime aditivo / autônomo):
--   • O QUE FAZ: cria `public.consultar_solicitacoes_externas(p_chave_id,
--     p_solicitacao_id DEFAULT NULL, p_referencia_origem DEFAULT NULL)` —
--     LEITURA PURA (STABLE), escopada à chave, devolvendo SEMPRE um array
--     (0..n). Duas buscas: por `id` (o nosso) ou por `referencia_origem` (o id do
--     integrador, ecoado desde a criação — ele não precisa guardar o nosso).
--   • ESCOPO IDÊNTICO AO DO CANCELAMENTO (0213): chave precisa estar ATIVA, e a
--     cláusula `origem_chave_id = p_chave_id` é o que impede uma chave de ler a
--     solicitação de outra — inclusive as criadas na TELA por humanos, que têm
--     `origem_chave_id NULL` e portanto nunca aparecem aqui. Não existe consulta
--     "por id genérico": o filtro de chave está no WHERE, não numa checagem
--     posterior que alguém possa esquecer.
--   • POR QUE ARRAY MESMO NA BUSCA POR ID: `referencia_origem` NÃO é única (só
--     `(chave, chave_idempotencia)` é) — o integrador pode ter reusado a mesma
--     referência em pedidos diferentes. Uma única RPC com forma única evita duas
--     funções quase iguais; quem impõe "exatamente uma" é a rota do item
--     (`GET /solicitacoes/{id}` → 404 se o array vier vazio), enquanto a rota de
--     busca devolve a coleção como coleção.
--   • O QUE NÃO DEVOLVE: os valores dos campos preenchidos (`respostas`). O
--     integrador acabou de enviá-los; devolver o snapshot ampliaria a superfície
--     sem necessidade conhecida. Fica registrado como candidato a v2.
--   • ADITIVA: nenhuma função existente é alterada, nenhuma tabela, nenhum dado.
--     Service_role-ONLY (é RPC de runtime da porta externa, como as irmãs).
--   • DOWN: `DROP FUNCTION IF EXISTS public.consultar_solicitacoes_externas(bigint, bigint, text);`
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.consultar_solicitacoes_externas(
  p_chave_id           bigint,
  p_solicitacao_id     bigint DEFAULT NULL,
  p_referencia_origem  text   DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ref text;
BEGIN
  -- a) Chave ativa (revogada não lê nada — mesmo critério do cancelamento).
  IF NOT EXISTS (SELECT 1 FROM app.api_chave WHERE id = p_chave_id AND ativo) THEN
    RAISE EXCEPTION 'CHAVE_INVALIDA' USING ERRCODE = '42501';
  END IF;

  -- b) Um critério é obrigatório: sem isso a chamada viraria "liste tudo o que
  -- essa chave já criou", que é outra funcionalidade (paginação, ordenação,
  -- volume) e não foi pedida.
  v_ref := nullif(btrim(coalesce(p_referencia_origem, '')), '');
  IF p_solicitacao_id IS NULL AND v_ref IS NULL THEN
    RAISE EXCEPTION 'CONSULTA_INVALIDA: informe o id da solicitação ou referencia_origem' USING ERRCODE = '22023';
  END IF;

  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id',                 s.id,
      'status',             s.status,
      'tipo',               (SELECT t.slug FROM app.solicitacao_tipo t WHERE t.id = s.tipo_id),
      'titulo',             s.descricao,
      -- Criação externa sempre endereça uma EQUIPE; o ramo de usuário é defensivo
      -- (mesma forma do payload de callback, 0213).
      'destinatario', CASE
        WHEN s.destinatario_role_id IS NOT NULL
          THEN jsonb_build_object('id', s.destinatario_role_id,
                 'nome', (SELECT r.nome FROM app.rbac_roles r WHERE r.id = s.destinatario_role_id))
        ELSE jsonb_build_object('id', s.destinatario_user_id,
                 'nome', (SELECT coalesce(nullif(btrim(du.nome), ''), du.email)
                          FROM app.rbac_usuarios du WHERE du.user_id = s.destinatario_user_id))
      END,
      'solicitante',        jsonb_build_object('email', u.email, 'nome', u.nome),
      'data_limite',        s.data_limite,
      'criado_em',          s.criado_em,
      'decidido_em',        s.decidido_em,
      'justificativa',      s.justificativa,
      'referencia_origem',  s.referencia_origem,
      'chave_idempotencia', s.chave_idempotencia
    ) ORDER BY s.id DESC)
    FROM app.solicitacao s
    LEFT JOIN app.rbac_usuarios u ON u.user_id = s.solicitante_id
    WHERE s.origem_chave_id = p_chave_id
      AND (p_solicitacao_id IS NULL OR s.id = p_solicitacao_id)
      AND (v_ref IS NULL OR s.referencia_origem = v_ref)
  ), '[]'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.consultar_solicitacoes_externas(bigint, bigint, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.consultar_solicitacoes_externas(bigint, bigint, text) TO service_role;

-- Índice para a busca pelo id do integrador: sem ele a consulta por
-- `referencia_origem` varre as solicitações da chave. Parcial (só as de origem
-- externa) — as criadas na tela têm origem_chave_id NULL e não interessam aqui.
CREATE INDEX IF NOT EXISTS idx_solicitacao_ref_origem
  ON app.solicitacao (origem_chave_id, referencia_origem)
  WHERE origem_chave_id IS NOT NULL AND referencia_origem IS NOT NULL;

NOTIFY pgrst, 'reload schema';
