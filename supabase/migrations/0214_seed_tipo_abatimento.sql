-- ---------------------------------------------------------------------------
-- 0214 — feat(v5.4.0/M5): seed do tipo "Abatimento de créditos" (primeiro tipo
-- exposto via API externa — integrador TARS/CRM, disparado pelas consultoras de
-- Weddings). O TIPO é cadastro, não código: este seed entrega a ESTRUTURA
-- inicial; o ajuste fino (rótulos, opções, roles permitidas) é operação do Yan
-- no editor de tipos — briefing v5.4.0 §5 "dependência de gente".
--
-- NUMERAÇÃO: definitiva (renumerada de 095x → 021x no checklist de merge da v5.4.0,
-- 2026-07-28; histórico remoto realinhado via `supabase migration repair`).
--     NOVOS; idempotente — se o slug já existir, não faz nada).
--   • ADITIVA / RETROCOMPATÍVEL: só INSERT de linhas novas; nenhum UPDATE/DELETE
--     em dado pré-existente; nenhum objeto alterado.
--
-- Decisões de mapeamento (handoff do Vitor = REQUISITOS; o contrato é o do Janus):
--   • `prazo_pagamento` da origem NÃO é campo — vira a `data_limite` da
--     solicitação (nativa do módulo).
--   • `api_roles_permitidas` nasce VAZIO de propósito: com a lista vazia, TODO
--     destinatário externo é recusado (DESTINATARIO_NAO_PERMITIDO) — a
--     integração fica INERTE até o Yan configurar as roles na tela. Fail-safe
--     por construção; roles de produção são cadastro, não seed.
--   • `exige_referencia_conclusao` LIGADO (generalização do "nº do Monde
--     obrigatório no concluído" do handoff).
--   • Sem campo "casamento" (a lista do briefing §3/M5 não o inclui; o título do
--     disparo identifica o casamento — documentado no contrato do integrador; o
--     Yan pode adicionar o campo no editor a qualquer momento, se quiser).
--   • CHAVES explícitas fixadas aqui (não derivadas em runtime) — são o contrato.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_tipo_id bigint;
BEGIN
  -- Idempotente: o slug é único; se já existe, o seed não recria nem duplica.
  IF EXISTS (SELECT 1 FROM app.solicitacao_tipo WHERE slug = 'abatimento_de_creditos') THEN
    RETURN;
  END IF;

  INSERT INTO app.solicitacao_tipo
    (nome, slug, arquivado, exposto_via_api, exige_referencia_conclusao, api_roles_permitidas, criado_por)
  VALUES
    ('Abatimento de créditos', 'abatimento_de_creditos', false, true, true, '{}'::bigint[], NULL)
  RETURNING id INTO v_tipo_id;

  INSERT INTO app.solicitacao_campo
    (tipo_id, ordem, rotulo, tipo_campo, obrigatorio, opcoes, chave,
     data_permite_passado, data_aviso_dias_futuro, data_aviso_direcao)
  VALUES
    (v_tipo_id, 1, 'Valor',                 'moeda',       true,  NULL,                                                              'valor',              true, NULL, 'acima'),
    (v_tipo_id, 2, 'Moeda',                 'selecao',     true,  '["BRL","USD","EUR"]'::jsonb,                                      'moeda',              true, NULL, 'acima'),
    (v_tipo_id, 3, 'Categoria',             'selecao',     true,  '["fornecedor","reembolso","adiantamento","taxa","outro"]'::jsonb, 'categoria',          true, NULL, 'acima'),
    (v_tipo_id, 4, 'Descrição',             'texto_longo', true,  NULL,                                                              'descricao',          true, NULL, 'acima'),
    (v_tipo_id, 5, 'Fornecedor',            'texto_curto', false, NULL,                                                              'fornecedor',         true, NULL, 'acima'),
    (v_tipo_id, 6, 'Forma de pagamento',    'texto_curto', false, NULL,                                                              'forma_pagamento',    true, NULL, 'acima'),
    (v_tipo_id, 7, 'Urgência',              'selecao',     false, '["normal","urgente"]'::jsonb,                                     'urgencia',           true, NULL, 'acima'),
    (v_tipo_id, 8, 'Observações',           'texto_longo', false, NULL,                                                              'observacoes',        true, NULL, 'acima'),
    (v_tipo_id, 9, 'Solicitante (origem)',  'texto_curto', false, NULL,                                                              'solicitante_origem', true, NULL, 'acima');
END $$;

-- ---------------------------------------------------------------------------
-- DOWN (reversão manual; NÃO executada automaticamente):
-- ---------------------------------------------------------------------------
/*
DELETE FROM app.solicitacao_campo
 WHERE tipo_id = (SELECT id FROM app.solicitacao_tipo WHERE slug = 'abatimento_de_creditos');
DELETE FROM app.solicitacao_tipo
 WHERE slug = 'abatimento_de_creditos'
   AND NOT EXISTS (SELECT 1 FROM app.solicitacao s
                   WHERE s.tipo_id = app.solicitacao_tipo.id);  -- só se nenhuma solicitação usa
*/
