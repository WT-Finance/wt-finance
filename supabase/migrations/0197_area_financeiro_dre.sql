-- ---------------------------------------------------------------------------
-- 0197 — feat(rbac): área própria 'financeiro/dre' p/ a aba DRE (v5.2.0, checkpoint)
--
-- DECLARAÇÃO (regime aditivo): esta migration é ADITIVA/retrocompatível com a main viva —
--   • INSERT idempotente em app.rbac_areas / app.rbac_role_permissoes (ON CONFLICT DO NOTHING);
--   • CREATE OR REPLACE dos 2 wrappers de decomposição SÓ AMPLIANDO o array de áreas
--     aceitas (['executiva'] → ['executiva','financeiro/dre']) — quem passava continua
--     passando; nenhum acesso é removido; assinaturas/GRANTs intocados;
--   • não reescreve dado pré-existente.
--
-- A aba /financeiro/dre nasceu (checkpoint) reusando a área do Fluxo de Caixa; decisão do
-- Yan: área PRÓPRIA. Mesmo molde da 0161/0165: cria a área, concede só aos roles com
-- 'admin/acessos' (gate APERTADO — o admin libera os demais pelo editor de roles) e as
-- RPCs que a página consome passam a aceitar a área nova.
-- Espelho no app: src/lib/auth/areas.ts (paridade testada em rpc-contrato.test.ts).
--
-- REVERSÃO (manual, se precisar): DELETE das linhas de rbac_role_permissoes/rbac_areas
-- com area='financeiro/dre' (nessa ordem, pela FK) + CREATE OR REPLACE dos 2 wrappers
-- de volta a ARRAY['executiva'] (corpo original na 0121).
-- ---------------------------------------------------------------------------

-- 1) Nova área (grupo Financeiro; ordem 35 — após acervo/gestao=34). Idempotente.
INSERT INTO app.rbac_areas (area, rotulo, grupo, ordem) VALUES
  ('financeiro/dre', 'DRE', 'Financeiro', 35)
ON CONFLICT (area) DO NOTHING;

-- 2) Gate APERTADO: concede só aos roles que têm 'admin/acessos' (administradores).
INSERT INTO app.rbac_role_permissoes (role_id, area)
  SELECT DISTINCT role_id, 'financeiro/dre'
  FROM app.rbac_role_permissoes
  WHERE area = 'admin/acessos'
ON CONFLICT (role_id, area) DO NOTHING;

-- 3) Wrappers de decomposição (retrofit 0121, padrão wrapper+__nucleo — mantido, é o
--    molde DESSAS funções) aceitam a área nova além de 'executiva'.
CREATE OR REPLACE FUNCTION public.get_decomposicao_grupo(p_from text, p_to text)
RETURNS json
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['executiva', 'financeiro/dre']);
  RETURN public.get_decomposicao_grupo__nucleo(p_from, p_to);
END;
$$;
-- ACL redeclarada (defense-in-depth; o REPLACE preserva, mas nunca confiar no implícito).
REVOKE EXECUTE ON FUNCTION public.get_decomposicao_grupo(text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_decomposicao_grupo(text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_decomposicao_categoria(p_from text, p_to text, p_grupo text DEFAULT NULL::text)
RETURNS json
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['executiva', 'financeiro/dre']);
  RETURN public.get_decomposicao_categoria__nucleo(p_from, p_to, p_grupo);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_decomposicao_categoria(text, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_decomposicao_categoria(text, text, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
