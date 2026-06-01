-- ---------------------------------------------------------------------------
-- 0102 — Limpeza: remover base morta "Vendas por Forma de Pagamento" (M3)
--               + RPCs órfãs de contas_pagar_receber (M7 faxina #4)
--
-- M3: raw.vendas_pagamento nunca teve consumidor (0 linhas em prod, nenhuma
--   view/função a referencia além das próprias RPCs de carga). A base e suas
--   RPCs de upload saem; o código (parser/action/tipos/card) é removido em
--   paralelo no front (Track A).
--
-- M7 #4: raw.contas_pagar_receber foi dropada na v4.2 (migration 0075), mas as
--   RPCs de carga dela continuaram no banco apontando para tabela inexistente.
--   Removê-las evita erro silencioso e ruído. Substituídas há tempos por
--   fluxo_caixa_titulos (RPCs em 0063, ativas).
--
-- Verificado antes do drop (jun/2026): vendas_pagamento = 0 linhas, sem views
-- dependentes, sem outras funções referenciando-a; contas_pagar_receber já
-- inexistente.
-- ---------------------------------------------------------------------------

-- M3 — Vendas por Forma de Pagamento
DROP FUNCTION IF EXISTS public.contar_vendas_pagamento();
DROP FUNCTION IF EXISTS public.truncar_vendas_pagamento();
DROP FUNCTION IF EXISTS public.inserir_lote_vendas_pagamento(p_linhas jsonb);
DROP TABLE    IF EXISTS raw.vendas_pagamento;

-- M7 #4 — RPCs órfãs de contas_pagar_receber (tabela já dropada na 0075)
DROP FUNCTION IF EXISTS public.contar_contas_pagar_receber();
DROP FUNCTION IF EXISTS public.truncar_contas_pagar_receber();
DROP FUNCTION IF EXISTS public.inserir_lote_contas_pagar_receber(p_linhas jsonb);
