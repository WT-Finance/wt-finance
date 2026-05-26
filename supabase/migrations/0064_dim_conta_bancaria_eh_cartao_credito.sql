-- ---------------------------------------------------------------------------
-- 0064 — feat: dim_conta_bancaria.eh_cartao_credito (ADR-0066 / M3)
--
-- Adiciona flag para identificação de contas de cartão de crédito.
-- Lista fechada e explícita: WCLARA-*, CC ASAAS, CCAB-*, CCMV-MC,
-- VISA WT, MASTERCARD WT
-- ---------------------------------------------------------------------------

ALTER TABLE financeiro.dim_conta_bancaria
  ADD COLUMN IF NOT EXISTS eh_cartao_credito BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE financeiro.dim_conta_bancaria
SET    eh_cartao_credito = TRUE
WHERE  conta IN ('CC ASAAS', 'CCAB-AA', 'CCAB-AD', 'CCAB-VS', 'CCMV-MC', 'VISA WT')
   OR  conta LIKE 'WCLARA-%';

INSERT INTO financeiro.dim_conta_bancaria (conta, tipo, eh_cartao_credito)
VALUES ('MASTERCARD WT', 'outro', TRUE)
ON CONFLICT (conta) DO UPDATE
  SET eh_cartao_credito = TRUE;
