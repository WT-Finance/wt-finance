-- ---------------------------------------------------------------------------
-- 0123 — fix(v4.13/S11): remove policies RLS PERMISSIVAS pré-existentes
-- (achado da auto-auditoria adversarial).
--
-- A auditoria encontrou 17 policies herdadas das migrations 0007/0021/0026
-- (`leitura_anon`, `anon_select_*` com USING true para {anon,authenticated}; e
-- `usuarios_select_*` em app.usuarios para {public}) em tabelas de dados
-- sensíveis — incl. analytics.fato_venda, fato_venda_item,
-- fato_lancamento_operacao, dim_operacao_weddings e app.meta_setor.
--
-- A 0120 habilitou RLS e revogou os GRANTs diretos de tabela (anon/authenticated),
-- então o acesso JÁ está fechado pela camada de privilégio. Mas manter policies
-- `USING true` (a) viola o requisito "RLS granular — NÃO permissivo" e (b) é
-- frágil: se um GRANT for reconcedido (schema exposto, defaults do Supabase, uma
-- RPC SECURITY INVOKER), a policy reabriria os dados a QUALQUER logado, furando o
-- RBAC. Defense-in-depth exige que a camada de RLS também negue.
--
-- Seguro p/ a main (S5): o app acessa dados SÓ via RPCs SECURITY DEFINER (owner
-- postgres), que NÃO são sujeitas a RLS — remover policies não muda esse caminho
-- (verificado: zero acesso direto a tabela no código). Após esta migration, a
-- ÚNICA policy nos 6 schemas é a granular de auto-leitura do próprio registro RBAC.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname IN ('analytics', 'app', 'audit', 'dim', 'financeiro', 'raw')
      AND policyname <> 'rbac_usuarios_proprio_registro'   -- única que se mantém
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
