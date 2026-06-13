-- 0137 — Aposentadoria fase 2 (v4.17.1): remove a RPC órfã de (des)ativar usuário.
--
-- DECLARAÇÃO PRÉVIA (âncora 2026-06-13):
--   • O QUE FAZ: DROP de public.admin_definir_usuario_ativo(uuid, boolean) — função
--     SECURITY DEFINER definida na 0119, sem nenhuma chamadora viva após a v4.17.1
--     remover a Server Action `definirAtivo` (a UI não a expõe desde a v4.14.1).
--   • DESTRUTIVA porém REVERSÍVEL: o corpo da função está preservado em
--     0119_rbac_nucleo.sql (linhas 434+) — religar = reaplicar aquele CREATE.
--   • NÃO TOCA DADOS: drop de função, zero linhas afetadas. Backup lógico do dia
--     (~/wt-finance-backups/2026-06-13-pre-v4-17/) cobre o estado anterior.
--   • Decisão do Yan (briefing v4.17.0, Balde 3): remover como código morto —
--     "não há uso futuro planejado" para desativar usuário no nível do banco.
--
-- MANTIDAS (decisão v4.17.1, contra a sugestão do briefing): truncate_dynamic_tables
-- e inserir_lote_raw NÃO são dropadas — `npm run seed` (supabase/seed/seed.ts) ainda
-- as consome; a exposição de segurança de truncate_dynamic_tables já foi fechada na
-- v4.17.0/M1 (REVOKE EXECUTE de anon). Recovery trio (transform_raw_to_analytics,
-- regenerar_dim_operacao_weddings, refresh_all_materialized_views) intacto.

DROP FUNCTION IF EXISTS public.admin_definir_usuario_ativo(uuid, boolean);
