-- PENDENTE: aguardando confirmação de Yan antes de aplicar
-- DROP de raw.contas_pagar_receber (substituída por raw.fluxo_caixa_titulos na v4.1)
-- Aplicar manualmente após confirmar que todos os uploads estão usando a nova tabela

DROP TABLE IF EXISTS raw.contas_pagar_receber CASCADE;
