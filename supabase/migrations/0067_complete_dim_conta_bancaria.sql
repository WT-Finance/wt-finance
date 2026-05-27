-- ---------------------------------------------------------------------------
-- 0067 — fix: completa dim_conta_bancaria + backfill FK em fato_lancamentos
--
-- Problema: 51 contas em raw.lancamentos ausentes de dim_conta_bancaria,
-- incluindo todos os WCLARA-*, CCAB-*, VISA WT, TBO, Conta Investimento XP,
-- "Banco Itau, Caixa" e entradas compostas (erros de cadastro ERP).
-- Consequência: INNER JOIN em vw_fluxo_caixa_kpis_b excluía lançamentos
-- com conta_bancaria_id IS NULL, causando divergência de R$ 512K nas entradas.
--
-- Correções:
--   1. Expande CHECK constraint de tipo para incluir 'cartao_credito' e
--      'investimento'.
--   2. INSERT de todas as contas ausentes com tipo e eh_cartao_credito corretos.
--   3. Rebuild de fato_lancamentos via regenerar_financeiro_lancamentos()
--      para populará conta_bancaria_id agora que todas as contas existem.
-- ---------------------------------------------------------------------------

-- 1. Expande o CHECK constraint de tipo
ALTER TABLE financeiro.dim_conta_bancaria
  DROP CONSTRAINT dim_conta_bancaria_tipo_check;

ALTER TABLE financeiro.dim_conta_bancaria
  ADD CONSTRAINT dim_conta_bancaria_tipo_check
  CHECK (tipo IN (
    'banco', 'gateway', 'carteira_interna', 'caixa_fisico',
    'outro', 'cartao_credito', 'investimento'
  ));

-- 2. Insere todas as contas ausentes
INSERT INTO financeiro.dim_conta_bancaria (conta, tipo, eh_cartao_credito)
SELECT DISTINCT
  r.conta,
  CASE
    -- Cartões corporativos individuais
    WHEN r.conta LIKE 'WCLARA - %'
      OR r.conta IN ('CC ASAAS', 'CCAB - AA', 'CCAB - AD', 'CCAB - VS',
                     'CCMV - MC', 'VISA WT', 'MASTERCARD WT')
      THEN 'cartao_credito'
    -- Entradas compostas de múltiplos cartões (erros ERP — todas as partes são cartão)
    WHEN r.conta LIKE 'WCLARA - %,%'
      OR r.conta IN (
        'CCAB - AA, CCAB - AD',
        'CCAB - AD, CCAB - VS',
        'WCLARA - BARBARA T., WCLARA - BIANCA, WCLARA - BRU',
        'WCLARA - BARBARA T., WCLARA - DANIELE, WCLARA - JU',
        'WCLARA - BARBARA T., WCLARA - FINANCEIRO, WCLARA -',
        'WCLARA - BIANCA, WCLARA - CAMILA, WCLARA - CARINE,',
        'WCLARA - BRUNA, WCLARA - CAMILA, WCLARA - CARINE,',
        'WCLARA - CAMILA, WCLARA - DANIELE, WCLARA - JULIAN',
        'WCLARA - CARINE, WCLARA - JULIANA, WCLARA - SILVIA',
        'WCLARA - ANA TEREZA, WCLARA - THAINA',
        'WCLARA - MARCELO (1773 Weddings), WCLARA - MARCELO'
      )
      THEN 'cartao_credito'
    -- Contas bancárias
    WHEN r.conta IN ('Banco Itau, Caixa')  -- entrada composta, erro ERP → banco
      THEN 'banco'
    -- Gateway de turismo
    WHEN r.conta = 'TBO'
      THEN 'gateway'
    -- Investimento
    WHEN r.conta = 'Conta Investimento XP'
      THEN 'investimento'
    -- Misto/indeterminado (ex: 'ASAAS, WCLARA - RENATA, WISE')
    ELSE 'outro'
  END AS tipo,
  CASE
    WHEN r.conta LIKE 'WCLARA - %'
      OR r.conta IN ('CC ASAAS', 'CCAB - AA', 'CCAB - AD', 'CCAB - VS',
                     'CCMV - MC', 'VISA WT', 'MASTERCARD WT')
      THEN TRUE
    WHEN r.conta LIKE 'WCLARA - %,%'
      OR r.conta IN (
        'CCAB - AA, CCAB - AD',
        'CCAB - AD, CCAB - VS',
        'WCLARA - BARBARA T., WCLARA - BIANCA, WCLARA - BRU',
        'WCLARA - BARBARA T., WCLARA - DANIELE, WCLARA - JU',
        'WCLARA - BARBARA T., WCLARA - FINANCEIRO, WCLARA -',
        'WCLARA - BIANCA, WCLARA - CAMILA, WCLARA - CARINE,',
        'WCLARA - BRUNA, WCLARA - CAMILA, WCLARA - CARINE,',
        'WCLARA - CAMILA, WCLARA - DANIELE, WCLARA - JULIAN',
        'WCLARA - CARINE, WCLARA - JULIANA, WCLARA - SILVIA',
        'WCLARA - ANA TEREZA, WCLARA - THAINA',
        'WCLARA - MARCELO (1773 Weddings), WCLARA - MARCELO'
      )
      THEN TRUE
    ELSE FALSE
  END AS eh_cartao_credito
FROM raw.lancamentos r
WHERE r.conta IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM financeiro.dim_conta_bancaria d WHERE d.conta = r.conta
  )
ON CONFLICT (conta) DO NOTHING;

-- 3. Rebuild fato_lancamentos para popular conta_bancaria_id com as novas FKs
SELECT public.regenerar_financeiro_lancamentos();
