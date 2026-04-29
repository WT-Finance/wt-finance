-- Tabelas de auditoria: logs de carga e operações

-- ---------------------------------------------------------------------------
-- audit.ingestao_log  — uma linha por execução do script seed
-- ---------------------------------------------------------------------------
CREATE TABLE audit.ingestao_log (
  id                     bigserial    PRIMARY KEY,
  fonte                  text         NOT NULL,  -- 'excel-2024', 'excel-2025', 'excel-2026', 'metas'
  iniciado_em            timestamptz  NOT NULL,
  finalizado_em          timestamptz,
  status                 text         NOT NULL CHECK (status IN ('sucesso', 'falha', 'em_progresso')),
  registros_processados  int,
  erro_mensagem          text
);
