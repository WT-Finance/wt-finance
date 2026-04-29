-- Tabelas fato: cabeçalho e itens de venda
--
-- Decisão arquitetural importante:
-- O setor fica em fato_venda_item, NÃO em fato_venda.
-- Motivo: uma mesma venda pode ter itens de setores diferentes
-- (ex: pacote Lazer com extra de Weddings). Toda soma por setor
-- passa obrigatoriamente por fato_venda_item.

-- ---------------------------------------------------------------------------
-- analytics.fato_venda  — cabeçalho, uma linha por Venda Nº único
-- ---------------------------------------------------------------------------
CREATE TABLE analytics.fato_venda (
  id            bigserial    PRIMARY KEY,
  venda_numero  text         NOT NULL UNIQUE,
  data_venda    date         NOT NULL REFERENCES analytics.dim_data(data),
  vendedor_id   bigint       NOT NULL REFERENCES analytics.dim_vendedor(id),
  pagante_id    bigint                REFERENCES analytics.dim_pagante(id),
  contrato      boolean      NOT NULL DEFAULT false,
  taxa_servico  boolean      NOT NULL DEFAULT false,
  criado_em     timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX idx_fato_venda_data      ON analytics.fato_venda (data_venda);
CREATE INDEX idx_fato_venda_vendedor  ON analytics.fato_venda (vendedor_id);
CREATE INDEX idx_fato_venda_pagante   ON analytics.fato_venda (pagante_id);

-- ---------------------------------------------------------------------------
-- analytics.fato_venda_item  — detalhe, uma linha por produto da venda
-- ---------------------------------------------------------------------------
CREATE TABLE analytics.fato_venda_item (
  id             bigserial       PRIMARY KEY,
  fato_venda_id  bigint          NOT NULL REFERENCES analytics.fato_venda(id),
  produto_id     bigint          NOT NULL REFERENCES analytics.dim_produto(id),
  setor_id       bigint          NOT NULL REFERENCES analytics.dim_setor(id),
  setor_micro_id bigint          NOT NULL REFERENCES analytics.dim_setor_micro(id),
  valor_total    numeric(14,2)   NOT NULL,
  receitas       numeric(14,2)   NOT NULL
);

CREATE INDEX idx_fato_item_venda_setor ON analytics.fato_venda_item (fato_venda_id, setor_id);
CREATE INDEX idx_fato_item_produto     ON analytics.fato_venda_item (produto_id);
CREATE INDEX idx_fato_item_setor_micro ON analytics.fato_venda_item (setor_id, setor_micro_id);
