-- 0062: Nova tabela raw.fluxo_caixa_titulos para CAP/CAR tratada
-- Substitui raw.contas_pagar_receber com estrutura que inclui Tipo, Status, Data_Final, Mes_Ano, Conta_Previsao

CREATE TABLE raw.fluxo_caixa_titulos (
    id             BIGSERIAL    PRIMARY KEY,
    arquivo_origem TEXT         NOT NULL,
    carregado_em   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    numero         TEXT,
    emissao        DATE,
    pessoa         TEXT,
    documento      TEXT,
    observacoes    TEXT,
    descricao      TEXT,
    conta_previsao TEXT,
    vencimento     DATE,
    liquidacao     DATE,
    valor          NUMERIC(18,2),
    valor_final    NUMERIC(18,2),
    tipo           TEXT         NOT NULL CHECK (tipo IN ('Entrada', 'Saída')),
    status         TEXT         NOT NULL CHECK (status IN ('Entrada', 'Saída', 'A Receber Futuro', 'A Pagar Futuro')),
    data_final     DATE         NOT NULL,
    mes_ano        TEXT         NOT NULL
);

CREATE INDEX idx_fct_data_final      ON raw.fluxo_caixa_titulos(data_final);
CREATE INDEX idx_fct_status          ON raw.fluxo_caixa_titulos(status);
CREATE INDEX idx_fct_vencimento      ON raw.fluxo_caixa_titulos(vencimento);
CREATE INDEX idx_fct_conta_previsao  ON raw.fluxo_caixa_titulos(conta_previsao) WHERE conta_previsao IS NOT NULL;
CREATE INDEX idx_fct_descricao       ON raw.fluxo_caixa_titulos(descricao);
CREATE INDEX idx_fct_mes_ano         ON raw.fluxo_caixa_titulos(mes_ano);
CREATE INDEX fct_liquidacao_idx      ON raw.fluxo_caixa_titulos (liquidacao);
CREATE INDEX fct_tipo_idx            ON raw.fluxo_caixa_titulos (tipo);

GRANT SELECT ON raw.fluxo_caixa_titulos TO authenticated, anon;
GRANT ALL    ON raw.fluxo_caixa_titulos TO service_role;
GRANT USAGE, SELECT ON SEQUENCE raw.fluxo_caixa_titulos_id_seq TO service_role;
