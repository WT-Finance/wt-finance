-- ---------------------------------------------------------------------------
-- 0161 — feat(v4.30.0/M0): área RBAC 'financeiro/faturamento-corp' (Faturamento Fase 1a)
--
-- DECLARAÇÃO PRÉVIA (regime aditivo / autônomo):
--   • O QUE FAZ: (1) cria a área de permissão 'financeiro/faturamento-corp' (rótulo
--     "Faturamento Corporativo", grupo Financeiro) — catálogo; (2) concede-a APENAS aos
--     roles que já administram acessos (têm 'admin/acessos') — gate APERTADO, NÃO a
--     todos (≠ solicitacoes/basico da 0143); o admin libera a usuários de finanças pelo
--     editor de roles; (3) CREATE OR REPLACE de buscar_pessoas (0160) estendendo o gate
--     para aceitar TAMBÉM a nova área (o Faturamento é o consumidor que a v4.29.0
--     antecipou — "re-gateará à sua própria área"). exigir_acesso passa com QUALQUER das
--     áreas (OR), então admin/uploads segue funcionando.
--   • ADITIVA / RETROCOMPATÍVEL: só INSERT de catálogo (ON CONFLICT DO NOTHING) + INSERT
--     de grants novos + CREATE OR REPLACE (preserva grants da função). NÃO faz
--     UPDATE/DELETE/DROP, NÃO escreve em dado pré-existente, NÃO é escrita-no-mundo
--     (nenhuma emissão; isso é a Fase 1b). O app vivo ignora área desconhecida no array.
--   • Reversão (manual, destrutiva): remover os grants de 'financeiro/faturamento-corp',
--     a linha em rbac_areas, e reverter o gate de buscar_pessoas — nessa ordem.
-- ---------------------------------------------------------------------------

-- 1) Nova área (grupo Financeiro; ordem 32 — após fluxo-caixa=30, gerencial=31). Idempotente.
INSERT INTO app.rbac_areas (area, rotulo, grupo, ordem) VALUES
  ('financeiro/faturamento-corp', 'Faturamento Corporativo', 'Financeiro', 32)
ON CONFLICT (area) DO NOTHING;

-- 2) Gate APERTADO: concede só aos roles que têm 'admin/acessos' (administradores). O
--    admin concede aos usuários de finanças pelo editor. NÃO backfill a todos.
INSERT INTO app.rbac_role_permissoes (role_id, area)
  SELECT DISTINCT role_id, 'financeiro/faturamento-corp'
  FROM app.rbac_role_permissoes
  WHERE area = 'admin/acessos'
ON CONFLICT (role_id, area) DO NOTHING;

-- 3) Estende o gate de buscar_pessoas (0160) para o novo consumidor. Idêntico ao corpo
--    da 0160, só o array de exigir_acesso ganha 'financeiro/faturamento-corp' (OR). O
--    Faturamento (Fase 1a) cruza Pessoa→cadastro via esta RPC, sob a sua própria área.
CREATE OR REPLACE FUNCTION public.buscar_pessoas(p_nomes text[])
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v jsonb;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['admin/uploads', 'financeiro/faturamento-corp']);

  SELECT COALESCE(jsonb_agg(to_jsonb(p) - 'carregado_em'), '[]'::jsonb)
  INTO v
  FROM raw.pessoas p
  WHERE p.nome = ANY (SELECT TRIM(unnest(p_nomes)));

  RETURN v;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.buscar_pessoas(text[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.buscar_pessoas(text[]) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
