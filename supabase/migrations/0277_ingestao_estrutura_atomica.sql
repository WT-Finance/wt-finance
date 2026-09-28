-- ---------------------------------------------------------------------------
-- 0277 — feat(v6.0.0/M5): estrutura da carga atômica das quatro bases restantes
--        + filtro Welcome no transform (anexo v6.0.0/M5 §1-§3)
--
-- DECLARAÇÃO PRÉVIA (regime aditivo / autônomo):
--   • O QUE FAZ:
--     (1) `raw.vendas_excel` e `raw.vendas_excel_staging` ganham a coluna anulável
--         `intermediario text` — briefing decisão 7 ("Intermediário volta a ser carregado");
--     (2) `raw.lancamentos_operacao` — a RAW que falta para Lançamentos por Operação, espelhando
--         as colunas de `LancamentoOperacaoCru` (parser M3) mais `arquivo_origem`/`carregado_em`,
--         RLS ligada, REVOKE de PUBLIC/anon/authenticated, GRANT só a `service_role` — mesma
--         postura de `raw.titulos_em_aberto` (0186). NÃO guarda `status`/`mes_ano`/`data_final`:
--         esses são DERIVADOS na promoção (M5/0278), a partir de `liquidacao`/`vencimento`, porque
--         dependem de "hoje" (anexo §6);
--     (3) quatro STAGING `UNLOGGED` novas — `demonstrativo_competencia_staging`,
--         `lancamentos_movimentacao_staging`, `titulos_em_aberto_staging`,
--         `lancamentos_operacao_staging` — cada uma `(LIKE <raw> INCLUDING DEFAULTS)`, molde de
--         `raw.vendas_excel_staging` (0116). Verificado ANTES de escrever esta migration: nenhuma
--         das três raw pré-existentes (0255/0185/0186) tem `CHECK` — `INCLUDING DEFAULTS` não
--         traria um `CHECK` de qualquer forma (anexo §3/§5), mas aqui não há nada a perder;
--     (4) `analytics.vendas_excel_para_fato` (view) + `public.transform_raw_to_analytics()`
--         (CREATE OR REPLACE, corpo do CATÁLOGO VIVO — ver o dump `molde-vivo.txt` entregue para
--         a missão M5, fora do repositório) passando a ler da view nas CINCO leituras (dim_vendedor,
--         dim_pagante, dim_produto, fato_venda, fato_venda_item) em vez de `raw.vendas_excel` — o filtro
--         `Setor Macro != 'Welcome'` que hoje só existe no script R (anexo §1, achado que mudou
--         a ordem do briefing: aplicar uma carga de Vendas HOJE, sem este filtro, acrescentaria
--         141 vendas e R$ 470.320,84 ao `fato_venda` — violação do invariante 1). Comportamento
--         HOJE, com a produção atual (raw.vendas_excel sem nenhuma linha Welcome, porque o card
--         antigo subia o arquivo já tratado pelo R): a view devolve exatamente as mesmas linhas
--         que a tabela — ZERO mudança de número nesta aplicação. O filtro só passa a excluir
--         algo quando a PRÓXIMA carga de Vendas (M5/0278, cru não-tratado) for promovida;
--     (5) `ingestao.promocao` — a tabela que torna `promover_carga_*` idempotente por
--         `(base, carga_id)` (anexo §2/§3): `promovido_em`, `resultado jsonb`, UNIQUE(base,
--         carga_id). Escrita DENTRO da transação de cada `promover_carga_*` (migration 0278) —
--         é o que permite repetir a chamada sem repetir o efeito. Mesma postura deny-by-default
--         de `ingestao.carga` (0276): RLS ligada, sem policy, `REVOKE ALL FROM PUBLIC, anon,
--         authenticated`, acesso só via as RPCs SECURITY DEFINER que o schema já tem.
--   • ADITIVA / RETROCOMPATÍVEL: só `ALTER TABLE ... ADD COLUMN` anulável, `CREATE TABLE`,
--     `CREATE UNLOGGED TABLE`, `CREATE VIEW`, `CREATE OR REPLACE FUNCTION` (mesma assinatura,
--     `transform_raw_to_analytics()` não ganha nem perde parâmetro), `GRANT`/`REVOKE`. Nenhum
--     `DROP`, nenhum `TRUNCATE` de tabela viva NO NÍVEL DA MIGRATION, nenhum `UPDATE`/`DELETE`
--     de dado existente. Nenhuma tabela pré-existente perde coluna ou linha.
--   • Por que `transform_raw_to_analytics()` pode mudar por `CREATE OR REPLACE` sem virar
--     destrutiva: o classificador (`scripts/db-gate/classificar.mjs`) casa `DROP`/`TRUNCATE`/
--     `ALTER ... DROP`/`UPDATE`/`DELETE` TOP-LEVEL — nada disso aparece aqui; é troca de corpo de
--     função, não perda de dado (o precedente de `promover_carga_vendas` ganhando assinatura nova
--     em vez de `DROP FUNCTION`, no header da 0278, é a MESMA lógica, ADR-0126).
--   • `app.exigir_acesso` NÃO muda. Nenhuma RPC nova nesta migration (as RPCs de carga são a
--     0278) — `transform_raw_to_analytics()` já não chamava `exigir_acesso` antes (é
--     service_role-only, chamada de dentro de `promover_carga_vendas`) e continua sem chamar.
--   • Reversão (manual, destrutiva — cita o que precisaria ser refeito, não aplica nada aqui):
--       -- transform_raw_to_analytics: reaplicar o corpo do CATÁLOGO VIVO anterior a esta
--       --   migration (o dump `molde-vivo.txt` entregue para a missão M5, 22/09/2026, fora do
--       --   repositório — reintrospectar `pg_get_functiondef` se ele não estiver mais disponível)
--       --   — NÃO a 0011, que é só a criação original; o corpo pode ter mudado entre as duas
--       --   (skill banco-e-rpc: "CREATE OR REPLACE se escreve do catálogo vivo").
--       DROP VIEW analytics.vendas_excel_para_fato;
--       DELETE FROM storage.buckets ...  -- N/A, não criado aqui
--       ALTER TABLE ingestao.promocao ... -- DROP TABLE ingestao.promocao;  (só se vazia)
--       DROP TABLE raw.lancamentos_operacao_staging;
--       DROP TABLE raw.titulos_em_aberto_staging;
--       DROP TABLE raw.lancamentos_movimentacao_staging;
--       DROP TABLE raw.demonstrativo_competencia_staging;
--       DROP TABLE raw.lancamentos_operacao;  -- só se vazia
--       ALTER TABLE raw.vendas_excel_staging DROP COLUMN intermediario;
--       ALTER TABLE raw.vendas_excel DROP COLUMN intermediario;
-- ---------------------------------------------------------------------------

-- ── 1. Vendas: Intermediário volta a ser carregado (briefing decisão 7) ──────────────────────
ALTER TABLE raw.vendas_excel         ADD COLUMN IF NOT EXISTS intermediario text;
ALTER TABLE raw.vendas_excel_staging ADD COLUMN IF NOT EXISTS intermediario text;

COMMENT ON COLUMN raw.vendas_excel.intermediario IS
  'v6.0.0/M5 (0277): coluna "Intermediário" do export de Vendas por Produto. O script R legado '
  'zerava esta coluna (mutate(Intermediário = NA)) — resíduo, não regra de negócio (briefing '
  'decisão 7). O parser da M3 (parsers/vendas-produto.ts) já a preserva; esta coluna é onde ela '
  'passa a ser gravada a partir da M5.';

-- ── 2. raw.lancamentos_operacao — a raw que falta (anexo §2 item 4) ──────────────────────────
-- Espelha as colunas de LancamentoOperacaoCru (parsers/lancamentos-operacao.ts) exceto
-- `status`/`mes_ano`/`data_final`: esses dependem de "hoje" e são DERIVADOS na promoção
-- (0278/public.promover_carga_operacao), nunca gravados aqui — mesma razão pela qual
-- analytics.fato_lancamento_operacao.status nunca vem do upload direto (anexo §6).
-- `vencimento` É gravado: vem resolvido no SERVIDOR contra as bases vizinhas
-- (public.ingestao_vencimentos_por_numero, 0276) ANTES do staging — não é recalculado aqui.
CREATE TABLE raw.lancamentos_operacao (
  id                 BIGSERIAL   PRIMARY KEY,
  arquivo_origem     TEXT        NOT NULL,
  carregado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  linha_origem       INT         NOT NULL,   -- linha do CSV do scrape, 1-based com cabeçalho
  lancamento_numero  TEXT,
  venda_numero       TEXT,
  pessoa             TEXT,
  descricao          TEXT,
  liquidacao         DATE,
  vencimento         DATE,                   -- resolvido no servidor (Aberto → Movimentação), não do CSV
  valor              NUMERIC(18,2),
  operacao           TEXT,
  tipo               TEXT
);

COMMENT ON TABLE raw.lancamentos_operacao IS
  'v6.0.0/M5 (0277): espelha o CSV cru de "Análise de Operações" (scrape), mais vencimento já '
  'resolvido contra raw.titulos_em_aberto/raw.lancamentos_movimentacao no servidor. '
  'analytics.fato_lancamento_operacao passa a derivar DESTA tabela em public.promover_carga_operacao '
  '(0278), não mais de inserir_lote_lancamentos direto. status/mes_ano/data_final não são '
  'gravados aqui — dependem de "hoje" e são calculados na promoção.';

ALTER TABLE raw.lancamentos_operacao ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON raw.lancamentos_operacao FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON raw.lancamentos_operacao TO service_role;
GRANT USAGE, SELECT ON SEQUENCE raw.lancamentos_operacao_id_seq TO service_role;

-- ── 3. Quatro STAGING UNLOGGED — molde de raw.vendas_excel_staging (0116) ────────────────────
-- Nenhuma das quatro raw de origem tem CHECK (verificado contra 0255/0185/0186 e a própria
-- seção 2 acima antes de escrever esta migration — anexo §3/§5): `INCLUDING DEFAULTS` não traz
-- CHECK, mas aqui não há nenhum para perder.
CREATE UNLOGGED TABLE IF NOT EXISTS raw.demonstrativo_competencia_staging
  (LIKE raw.demonstrativo_competencia INCLUDING DEFAULTS);

CREATE UNLOGGED TABLE IF NOT EXISTS raw.lancamentos_movimentacao_staging
  (LIKE raw.lancamentos_movimentacao INCLUDING DEFAULTS);

CREATE UNLOGGED TABLE IF NOT EXISTS raw.titulos_em_aberto_staging
  (LIKE raw.titulos_em_aberto INCLUDING DEFAULTS);

CREATE UNLOGGED TABLE IF NOT EXISTS raw.lancamentos_operacao_staging
  (LIKE raw.lancamentos_operacao INCLUDING DEFAULTS);

-- ── 4. Filtro Welcome no transform (anexo §1) ────────────────────────────────────────────────
-- View, não filtro na tabela: raw.vendas_excel continua guardando o arquivo INTEIRO (é sobre
-- ele que o checksum do arquivo fecha, contrato §4) — só a LEITURA que alimenta analytics.*
-- exclui Welcome. `IS DISTINCT FROM`, NUNCA `<>`: setor_macro é anulável, e
-- `NULL <> 'Welcome'` avalia para NULL, o que excluiria em silêncio toda linha sem setor macro
-- (armadilha nomeada no anexo §1/§5).
CREATE VIEW analytics.vendas_excel_para_fato AS
SELECT *
FROM raw.vendas_excel
WHERE setor_macro IS DISTINCT FROM 'Welcome';

COMMENT ON VIEW analytics.vendas_excel_para_fato IS
  'v6.0.0/M5 (0277): raw.vendas_excel sem as linhas de Setor Macro = Welcome (briefing v6.0.0 '
  'decisão 8; anexo M5 §1). O filtro que hoje só existe no script R (analise_casamentos2.R) '
  'passa a viver aqui — raw.vendas_excel guarda o arquivo INTEIRO (o checksum do arquivo precisa '
  'disso para fechar, contrato §4) e é esta view, não a tabela, que public.transform_raw_to_analytics() '
  'lê nas cinco leituras (dim_vendedor, dim_pagante, dim_produto, fato_venda, fato_venda_item). '
  'Predicado IS DISTINCT FROM, nunca <>: setor_macro é anulável e NULL <> ''Welcome'' avalia NULL, '
  'o que excluiria em silêncio toda linha sem setor macro. Medido nos anexos de 21/09: 210 linhas, '
  'Σ Valor Total 470.320,84, Σ Receitas 5.242,80 — exatamente o que este filtro precisa remover '
  'quando a próxima carga (cru não-tratado) for promovida.';

-- public.transform_raw_to_analytics() — CORPO IDÊNTICO ao do catálogo vivo (dump `molde-vivo.txt`
-- entregue para esta missão M5, fora do repositório), com a ÚNICA mudança sendo `FROM raw.vendas_excel` →
-- `FROM analytics.vendas_excel_para_fato` nas cinco leituras. Nenhuma outra linha muda.
CREATE OR REPLACE FUNCTION public.transform_raw_to_analytics()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_itens_count   int;
  v_vendas_count  int;
  v_result        jsonb;
BEGIN
  -- dim_vendedor: armazena UPPER(TRIM()) para deduplicação case-insensitive
  INSERT INTO analytics.dim_vendedor (nome)
  SELECT DISTINCT UPPER(TRIM(vendedor))
  FROM analytics.vendas_excel_para_fato
  WHERE vendedor IS NOT NULL AND TRIM(vendedor) <> ''
  ON CONFLICT (nome) DO NOTHING;

  -- dim_pagante: deduplicação por nome trimado
  INSERT INTO analytics.dim_pagante (nome)
  SELECT DISTINCT TRIM(pagante)
  FROM analytics.vendas_excel_para_fato
  WHERE pagante IS NOT NULL AND TRIM(pagante) <> ''
  ON CONFLICT (nome) DO NOTHING;

  -- dim_produto: deduplicação por nome trimado
  INSERT INTO analytics.dim_produto (nome)
  SELECT DISTINCT TRIM(produto)
  FROM analytics.vendas_excel_para_fato
  WHERE produto IS NOT NULL AND TRIM(produto) <> ''
  ON CONFLICT (nome) DO NOTHING;

  -- fato_venda: filtra linhas sem data_venda, venda_numero, vendedor ou flags nulos
  INSERT INTO analytics.fato_venda (
    venda_numero, data_venda, vendedor_id, pagante_id, contrato, taxa_servico
  )
  SELECT DISTINCT ON (r.venda_numero)
    r.venda_numero,
    r.data_venda,
    dv.id,
    dp.id,
    r.contrato,
    r.taxa_servico
  FROM analytics.vendas_excel_para_fato r
  JOIN  analytics.dim_vendedor  dv ON dv.nome = UPPER(TRIM(r.vendedor))
  LEFT JOIN analytics.dim_pagante dp ON dp.nome = TRIM(r.pagante)
  WHERE r.venda_numero  IS NOT NULL
    AND r.data_venda    IS NOT NULL
    AND r.contrato      IS NOT NULL
    AND r.taxa_servico  IS NOT NULL
  ORDER BY r.venda_numero, r.id
  ON CONFLICT (venda_numero) DO NOTHING;

  GET DIAGNOSTICS v_vendas_count = ROW_COUNT;

  -- fato_venda_item: filtra linhas sem valor_total, receitas ou dimensões nulas
  INSERT INTO analytics.fato_venda_item (
    fato_venda_id, produto_id, setor_id, setor_micro_id, valor_total, receitas
  )
  SELECT
    fv.id,
    dprod.id,
    ds.id,
    dsm.id,
    r.valor_total,
    r.receitas
  FROM analytics.vendas_excel_para_fato r
  JOIN analytics.fato_venda      fv    ON fv.venda_numero = r.venda_numero
  JOIN analytics.dim_produto     dprod ON dprod.nome       = TRIM(r.produto)
  JOIN analytics.dim_setor       ds    ON ds.nome          = TRIM(r.setor)
  JOIN analytics.dim_setor_micro dsm   ON dsm.nome         = TRIM(r.setor_micro)
  WHERE r.valor_total IS NOT NULL
    AND r.receitas    IS NOT NULL;

  GET DIAGNOSTICS v_itens_count = ROW_COUNT;

  v_result := jsonb_build_object(
    'vendas_count',          v_vendas_count,
    'fato_venda_item_count', v_itens_count
  );
  RETURN v_result;
END;
$function$;

-- ── 5. ingestao.promocao — idempotência de promover_carga_* por (base, carga_id) ─────────────
CREATE TABLE ingestao.promocao (
  id           BIGSERIAL   PRIMARY KEY,
  base         TEXT        NOT NULL,
  carga_id     UUID        NOT NULL,
  promovido_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resultado    JSONB       NOT NULL,

  -- Espelho de BASES_INGESTAO (src/lib/ingestao/bases.ts), mesma lista/ordem das outras duas
  -- ocorrências deste CHECK (0274, 0276). `bases-paridade.test.ts` passou a ler TAMBÉM esta
  -- migration, então a quarta repetição da lista tem fiscal próprio — sem ele, uma base nova em
  -- `BASES_INGESTAO` sem a migration correspondente passaria batida justamente aqui.
  CONSTRAINT ingestao_promocao_base_valida CHECK (
    base IN (
      'demonstrativo-competencia',
      'vendas-produto',
      'lancamentos-movimentacao',
      'lancamentos-aberto',
      'lancamentos-operacao'
    )
  ),
  CONSTRAINT ingestao_promocao_base_carga_uniq UNIQUE (base, carga_id)
);

COMMENT ON TABLE ingestao.promocao IS
  'v6.0.0/M5 (0277): uma linha por (base, carga_id) promovido com sucesso — é o que torna '
  'promover_carga_{base} idempotente (anexo M5 §2/§3): repetir a chamada com o MESMO carga_id '
  'devolve `resultado` sem repetir o efeito. Escrita DENTRO da mesma transação da promoção.';

ALTER TABLE ingestao.promocao ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ingestao.promocao FROM PUBLIC, anon, authenticated;
-- Sem GRANT a service_role: acesso só via as RPCs SECURITY DEFINER (owner postgres, ignora
-- RLS e não precisa de GRANT de tabela) — mesma postura de ingestao.carga (0276).

NOTIFY pgrst, 'reload schema';
