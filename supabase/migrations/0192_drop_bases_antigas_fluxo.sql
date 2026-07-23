-- ---------------------------------------------------------------------------
-- 0192 — chore(db): DROP das bases/RPCs ANTIGAS do Fluxo de Caixa (v5.2.0/Onda 1, M3-fim)
--
-- ⚠️ MIGRATION DESTRUTIVA — NÃO é aplicada pelo agente. O `npm run db:migrate -- --destrutiva`
--    aborta em stdin não-TTY (headless), então SÓ um humano num terminal aplica (ADR-0131).
--    APLICAR PELO YAN, no checkpoint, DEPOIS de confirmar que a Onda 1 está validada em prod.
--    Recuperação: backup-do-dia do backup-gate + as migrations de origem (0057/0058/0060/0062).
--
-- Aposenta as bases do eixo LIQUIDAÇÃO, substituídas pelo eixo MOVIMENTAÇÃO (fato_fluxo / M2)
-- com todos os consumidores repontados (M3). CONSUMIDORES VERIFICADOS antes do DROP:
--   • App (src/): ZERO referência viva (M3 repontou views+RPCs; M4 trocou os cards de upload;
--     M6 removeu o código morto de upload/worker/parsers antigos). `src/types/database.ts` é
--     congelado (só tipos gerados; inofensivo).
--   • Seed: `seed-lancamentos-financeiro.ts` foi REESCRITO (M6) p/ popular as bases NOVAS
--     (raw.lancamentos_movimentacao / raw.titulos_em_aberto + regenerar_fluxo_caixa). Não usa
--     mais nada dropado aqui.
--   • `analytics.fato_lancamento_operacao` (base "Lançamentos por Operação") NÃO é tocada —
--     é outro caminho (truncar_lancamentos/inserir_lote_lancamentos), permanece vivo.
--   • Dependência de view/objeto sobre os alvos: NENHUMA (pg_depend conferido; as views
--     vw_fluxo_caixa_* já leem fato_fluxo desde a 0188).
--
-- NÃO dropar: dim_categoria / dim_conta_bancaria (COMPARTILHADAS — fato_fluxo também as usa).
-- ---------------------------------------------------------------------------

-- 1. Funções de upload/transform do caminho antigo (referenciam as tabelas → dropar primeiro).
DROP FUNCTION IF EXISTS public.regenerar_financeiro_lancamentos();
DROP FUNCTION IF EXISTS public.truncar_lancamentos_financeiro();
DROP FUNCTION IF EXISTS public.inserir_lote_lancamentos_financeiro(jsonb);
DROP FUNCTION IF EXISTS public.status_lancamentos_financeiro();
DROP FUNCTION IF EXISTS public.contar_lancamentos_financeiro();
DROP FUNCTION IF EXISTS public.truncar_fluxo_caixa_titulos();
DROP FUNCTION IF EXISTS public.inserir_lote_fluxo_caixa_titulos(jsonb);
DROP FUNCTION IF EXISTS public.status_fluxo_caixa_titulos();
DROP FUNCTION IF EXISTS public.contar_fluxo_caixa_titulos();

-- 2. Fato antigo (FK → raw.lancamentos + dims; dropar antes das raw).
DROP TABLE IF EXISTS financeiro.fato_lancamentos;

-- 3. Bases raw antigas do Fluxo de Caixa.
DROP TABLE IF EXISTS raw.lancamentos;
DROP TABLE IF EXISTS raw.fluxo_caixa_titulos;

NOTIFY pgrst, 'reload schema';
