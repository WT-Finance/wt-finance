-- ---------------------------------------------------------------------------
-- 0256 — feat(db): árvore e de-para do regime de COMPETÊNCIA + view de leitura
--                  (v5.8.0, M2)
--
-- ⚠️  ARQUIVO GERADO por `scripts/gera-seed-dre-competencia.mjs` a partir dos anexos
--     `docs/briefings/anexo-v5-8-0-arvore-competencia.csv` (26 blocos) e
--     `docs/briefings/anexo-v5-8-0-depara-competencia.csv` (141 pares).
--     Para mudar a curadoria, edite o ANEXO e rode o gerador — não edite o SQL à mão.
--     O gerador valida antes de emitir (chave de fórmula existente, par não repetido,
--     regra de rótulos da v5.7.0: agregação carrega operador, folha nunca).
--
-- ADITIVA / retrocompatível:
--   • 2 CREATE TABLE novas em `financeiro` + 1 CREATE VIEW nova
--   • NADA é tocado no motor de CAIXA: `dre_bloco`, `dre_categoria_map`,
--     `get_dre_mensal`, `fato_fluxo` e o editor da estrutura seguem intocados.
--
-- ── Por que árvore PRÓPRIA e não reuso de dre_bloco/dre_categoria_map ───────
-- As duas árvores divergem de verdade: competência não tem REPASSE nem IMOB, e tem
-- ONOP_H, LL, DL e REXG que o caixa não tem. E as CHAVES de mapeamento são de espécies
-- diferentes: o caixa chaveia por `dim_categoria.id` (um inteiro do próprio banco), a
-- competência chaveia pelo par de TEXTO (Grupo, Descrição) que vem no arquivo.
-- Convergir as duas é decisão futura; forçar agora criaria uma tabela que serve mal aos
-- dois regimes. (Decisão do Yan, §1 do briefing.)
--
-- ── `formula` com SINAL — a diferença em relação à árvore de caixa ──────────
-- Em `financeiro.dre_bloco` a fórmula é um array JSONB de chaves que se SOMAM, e os
-- sinais vivem no dado (despesa é negativa). Aqui isso não basta: o
-- RESULTADO GERENCIAL é `REX − REEMB` — uma SUBTRAÇÃO de um bloco que já está somado
-- dentro do REX. Então o array aceita chave prefixada por `-`: `["REX","-REEMB"]`.
-- Chave sem prefixo soma, chave com `-` subtrai. `formula IS NULL` = folha, que soma
-- as próprias linhas do de-para.
--
-- ── Chave COMPOSTA no de-para (não é preciosismo) ───────────────────────────
-- Exatamente 3 descrições existem sob DOIS pais diferentes no arquivo — `Comissão`,
-- `Reembolso Cliente` e `Reembolso Fornecedor` —, então uma chave só por descrição
-- colidiria. A FUSÃO dessas linhas acontece no DESTINO (mesmo `sub_chave` + mesmo
-- `rotulo_linha` ⇒ uma linha exibida), nunca na chave. Medido no arquivo vivo:
-- 141 pares ⇒ 138 linhas exibidas.
--
-- ── `IMP_H` é a exceção estrutural da árvore ────────────────────────────────
-- Todo outro `blocoH` é um cabeçalho cuja fórmula soma os subgrupos que vêm depois
-- dele (RB_H = RV + REEMB; DESP_H = ADM..FIN). `IMP_H` não: ele tem `formula NULL` e
-- recebe categorias do de-para DIRETAMENTE (4 pares), ou seja, é cabeçalho na
-- apresentação e FOLHA na aritmética. É deliberado — no modelo da gerente "Impostos e
-- Deduções da Receita Bruta" não tem subdivisão — e é exatamente o que o modelo de
-- caixa já permite (`formula IS NULL` = soma as próprias categorias).
--
-- Medido antes de aplicar (arquivo de 25/08/2026): os 141 pares do de-para são
-- EXATAMENTE os 141 pares distintos do arquivo — bijeção, sem par órfão de nenhum
-- lado. Par novo num export futuro cai na bandeja "Não classificadas" (LEFT JOIN da view).
-- ---------------------------------------------------------------------------

CREATE TABLE financeiro.dre_comp_bloco (
  id           BIGSERIAL   PRIMARY KEY,
  chave        TEXT        NOT NULL UNIQUE,        -- âncora estável (casar por chave, nunca por posição)
  rotulo       TEXT        NOT NULL,
  tipo         TEXT        NOT NULL CHECK (tipo IN ('blocoH', 'sub', 'tot')),
  ordem        INT         NOT NULL,               -- governa a renderização
  formula      JSONB,                              -- array de chaves com sinal; NULL = folha
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX dre_comp_bloco_ordem_idx ON financeiro.dre_comp_bloco (ordem);

CREATE TABLE financeiro.dre_comp_map (
  id                BIGSERIAL PRIMARY KEY,
  grupo_arquivo     TEXT    NOT NULL,
  descricao_arquivo TEXT    NOT NULL,
  sub_chave         TEXT    NOT NULL REFERENCES financeiro.dre_comp_bloco (chave),
  rotulo_linha      TEXT    NOT NULL,
  -- Ordem da LINHA EXIBIDA dentro do subgrupo (espelha `dre_categoria_map.ordem` do
  -- caixa). É por DESTINO, não por par: as duas pernas de uma fusão trazem o mesmo
  -- valor, senão a linha herdaria a ordem de qualquer uma delas. Semeada alfabética.
  ordem             INT     NOT NULL,
  -- Nasce toda FALSA. Existe para o dia em que uma linha precisar sair do demonstrativo
  -- sem sair da base (o análogo do `excluida` do caixa). Linha excluída NÃO desaparece da
  -- reconciliação: a RPC de leitura a soma num total próprio, para "linhas + bandeja +
  -- excluídas = base" continuar fechando.
  excluida          BOOLEAN NOT NULL DEFAULT false,
  atualizado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dre_comp_map_par_unico UNIQUE (grupo_arquivo, descricao_arquivo)
);

CREATE INDEX dre_comp_map_sub_idx ON financeiro.dre_comp_map (sub_chave);

ALTER TABLE financeiro.dre_comp_bloco ENABLE ROW LEVEL SECURITY;
ALTER TABLE financeiro.dre_comp_map   ENABLE ROW LEVEL SECURITY;

-- Leitura só pela RPC (SECURITY DEFINER, 0257). Nenhum role de aplicação toca as tabelas
-- diretamente — mesmo desenho da 0204 para o caixa.
REVOKE ALL ON financeiro.dre_comp_bloco FROM PUBLIC, anon, authenticated;
REVOKE ALL ON financeiro.dre_comp_map   FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON financeiro.dre_comp_bloco TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON financeiro.dre_comp_map   TO service_role;
GRANT USAGE, SELECT ON SEQUENCE financeiro.dre_comp_bloco_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE financeiro.dre_comp_map_id_seq   TO service_role;

-- ---------------------------------------------------------------------------
-- Seed da ÁRVORE (26 blocos) — anexo `anexo-v5-8-0-arvore-competencia.csv`
-- ---------------------------------------------------------------------------

INSERT INTO financeiro.dre_comp_bloco (ordem, tipo, chave, rotulo, formula) VALUES
  (10, 'blocoH', 'RB_H', '(+) RECEITA BRUTA DE VENDAS', '["RV","REEMB"]'::jsonb),
  (20, 'sub', 'RV', '(+) Receita de Vendas', NULL),
  (30, 'sub', 'REEMB', '(+/-) Reembolsos', NULL),
  (40, 'blocoH', 'IMP_H', '(-) IMPOSTOS E DEDUÇÕES DA RECEITA BRUTA', NULL),
  (50, 'tot', 'ROL', '(=) RECEITA OPERACIONAL LÍQUIDA', '["RB_H","IMP_H"]'::jsonb),
  (60, 'sub', 'CUSTO', '(-) Custo dos Serviços Prestados', NULL),
  (70, 'tot', 'LB', '(=) LUCRO BRUTO', '["ROL","CUSTO"]'::jsonb),
  (80, 'blocoH', 'DESP_H', '(-) DESPESAS', '["ADM","COM","MKT","ESTR","RH","RHB","FIN"]'::jsonb),
  (90, 'sub', 'ADM', '(-) Despesas Administrativas', NULL),
  (100, 'sub', 'COM', '(-) Despesas Comerciais', NULL),
  (110, 'sub', 'MKT', '(-) Despesas Marketing', NULL),
  (120, 'sub', 'ESTR', '(-) Despesas Operacionais de Estrutura', NULL),
  (130, 'sub', 'RH', '(-) Despesas Operacionais de RH', NULL),
  (140, 'sub', 'RHB', '(-) Despesas Operacionais de RH Benefícios', NULL),
  (150, 'sub', 'FIN', '(+/-) Resultado Financeiro', NULL),
  (160, 'tot', 'LOP', '(=) LUCRO / PREJUÍZO OPERACIONAL', '["LB","DESP_H"]'::jsonb),
  (170, 'blocoH', 'ONOP_H', '(+/-) OUTRAS RECEITAS E DESPESAS NÃO OPERACIONAIS', '["RNOP","DNOP"]'::jsonb),
  (180, 'sub', 'RNOP', '(+) Outras Receitas não Operacionais', NULL),
  (190, 'sub', 'DNOP', '(-) Outras Despesas não Operacionais', NULL),
  (200, 'tot', 'LL', '(=) LUCRO / PREJUÍZO LÍQUIDO', '["LOP","ONOP_H"]'::jsonb),
  (210, 'blocoH', 'INV_H', '(-) DESPESAS COM INVESTIMENTOS E EMPRÉSTIMOS', '["INV"]'::jsonb),
  (220, 'sub', 'INV', '(-) Despesas com Investimentos e Empréstimos', NULL),
  (230, 'tot', 'RAIR', '(=) RESULTADO ANTES DO IR E CSLL', '["LL","INV_H"]'::jsonb),
  (240, 'sub', 'DL', '(-) Distribuição de Lucros', NULL),
  (250, 'tot', 'REX', '(=) RESULTADO DO EXERCÍCIO', '["RAIR","DL"]'::jsonb),
  (260, 'tot', 'REXG', '(=) RESULTADO GERENCIAL (ex-Reembolsos)', '["REX","-REEMB"]'::jsonb);

-- ---------------------------------------------------------------------------
-- Seed do DE-PARA (141 pares) — anexo `anexo-v5-8-0-depara-competencia.csv`
-- 140 derivados do modelo da gerente + 1 pelo grupo do arquivo
-- (`Estacionamento Vaga Rotativa` → RHB).
-- ---------------------------------------------------------------------------

INSERT INTO financeiro.dre_comp_map (grupo_arquivo, descricao_arquivo, sub_chave, rotulo_linha, ordem) VALUES
  ('Despesas Administrativas', 'Bens não Ativos', 'ADM', 'Bens não ativos', 10),
  ('Despesas Administrativas', 'Consultorias e Assessorias', 'ADM', 'Consultorias e Assessorias', 20),
  ('Despesas Administrativas', 'Copa e Cozinha', 'ADM', 'Copa e Cozinha', 30),
  ('Despesas Administrativas', 'Despesas com Cartório', 'ADM', 'Despesas com Cartório', 40),
  ('Despesas Administrativas', 'Honorários Advocatícios', 'ADM', 'Honorários Advocatícios', 50),
  ('Despesas Administrativas', 'Honorários Contábeis', 'ADM', 'Honorários Contábeis', 60),
  ('Despesas Administrativas', 'Licença de Software (ADM)', 'ADM', 'Licença de Software (ADM)', 70),
  ('Despesas Administrativas', 'Material de Escritório', 'ADM', 'Material de Escritório', 80),
  ('Despesas Administrativas', 'Material de Informática', 'ADM', 'Material de Informática', 90),
  ('Despesas Administrativas', 'Material de Limpeza e Higiene', 'ADM', 'Material de Limpeza e Higiene', 100),
  ('Despesas Administrativas', 'Prestadores de Serviço - PJ - (ADM)', 'ADM', 'Prestadores de Serviço - PJ - (ADM)', 110),
  ('Despesas Administrativas', 'Taxas de Licenciamento e Funcionamento', 'ADM', 'Taxas de Licenciamento e Funcionamento', 120),
  ('Despesas Operacionais de RH', 'Comissão de Vendas', 'COM', 'Comissão de Vendas', 10),
  ('Despesas Comerciais', 'Comissão Terceiros', 'COM', 'Comissão Terceiros', 20),
  ('Despesas Comerciais', 'Cortesia', 'COM', 'Cortesia', 30),
  ('Despesas Comerciais', 'FamTour', 'COM', 'FamTour', 40),
  ('Despesas Comerciais', 'Feiras, Eventos e Divulgações', 'COM', 'Feiras, Eventos e Divulgações', 50),
  ('Despesas Comerciais', 'Licença de Software (Comercial)', 'COM', 'Licença de Software (Comercial)', 60),
  ('Despesas Comerciais', 'Material Gráfico', 'COM', 'Material Gráfico', 70),
  ('Custo dos Serviços Prestados', 'Prejuízos', 'COM', 'Prejuízos', 80),
  ('Despesas Operacionais de RH', 'Premiação', 'COM', 'Premiação', 90),
  ('Despesas Comerciais', 'Presentes', 'COM', 'Presentes', 100),
  ('Despesas Comerciais', 'Relacionamento (Clientes ou Fornecedores)', 'COM', 'Relacionamento (Clientes ou Fornecedores)', 110),
  ('Receita de Vendas', 'Reversão de Perdas Financeiras', 'COM', 'Reversão de Perdas Financeiras', 120),
  ('Despesas Comerciais', 'Transporte e Envio', 'COM', 'Transporte e Envio', 130),
  ('Custo dos Serviços Prestados', 'Assessoria Local', 'CUSTO', 'Assessoria Local', 10),
  ('Custo dos Serviços Prestados', 'Custo com Viagem', 'CUSTO', 'Custo com Viagem', 20),
  ('Custo dos Serviços Prestados', 'Material de apoio - Eventos', 'CUSTO', 'Material de Apoio - Eventos', 30),
  ('Custo dos Serviços Prestados', 'Plantão de Atendimento', 'CUSTO', 'Plantão de Atendimento', 40),
  ('Custo dos Serviços Prestados', 'Prestador de Serviço - PJ', 'CUSTO', 'Prestador de Serviço - PJ', 50),
  ('Receitas Não Operacionais', 'Reembolso - Custo com Viagem - C', 'CUSTO', 'Reembolso - Custo com Viagem - C', 60),
  ('Custo dos Serviços Prestados', 'Seguro de Responsabilidade Civil', 'CUSTO', 'Seguro de Responsabilidade Civil', 70),
  ('Despesas com Investimentos e Empréstimos', 'Welcome Labs', 'CUSTO', 'Welcome Labs', 80),
  ('Despesas Operacionais de RH', 'Distribuição de Lucros', 'DL', 'Distribuição de Lucros', 10),
  ('Despesas não Operacionais', 'Ações Judiciais e Extrajudiciais - D', 'DNOP', 'Ações Judiciais e Extrajudiciais - D', 10),
  ('Despesas Operacionais de Estrutura', 'Aluguel', 'ESTR', 'Aluguel', 10),
  ('Despesas Operacionais de Estrutura', 'Condomínio', 'ESTR', 'Condomínio', 20),
  ('Despesas Operacionais de Estrutura', 'Energia', 'ESTR', 'Energia', 30),
  ('Despesas Operacionais de Estrutura', 'Estacionamento (Vaga Diretoria)', 'ESTR', 'Estacionamento (vaga diretoria)', 40),
  ('Receitas Não Operacionais', 'Fundo de Reserva - Condomínio C', 'ESTR', 'Fundo de Reserva - Condomínio C', 50),
  ('Despesas Operacionais de Estrutura', 'Fundo de Reserva - Condomínio D', 'ESTR', 'Fundo de Reserva - Condomínio D', 60),
  ('Despesas Operacionais de Estrutura', 'Internet', 'ESTR', 'Internet', 70),
  ('Despesas Operacionais de Estrutura', 'Limpeza e Manutenção Predial', 'ESTR', 'Limpeza e Manutenção Predial', 80),
  ('Despesas Operacionais de Estrutura', 'Manutenção e Conservação de Equipamentos', 'ESTR', 'Manutenção e Conservação de Equipamentos', 90),
  ('Despesas Operacionais de Estrutura', 'Telefonia', 'ESTR', 'Telefonia', 100),
  ('Receitas e Rendimentos Financeiros', 'Acréscimos Cobrados', 'FIN', 'Acréscimos Cobrados', 10),
  ('Despesas Financeiras', 'Anuidade de Cartões', 'FIN', 'Anuidade de Cartões', 20),
  ('Receitas e Rendimentos Financeiros', 'Aplicações e Investimentos C', 'FIN', 'Aplicações e Investimentos C', 30),
  ('Despesas Financeiras', 'Aplicações e Investimentos D', 'FIN', 'Aplicações e Investimentos D', 40),
  ('Receitas e Rendimentos Financeiros', 'Desconto Obtido', 'FIN', 'Desconto Obtido', 50),
  ('Receita de Vendas', 'Diferença Apuração de Baixas C', 'FIN', 'Diferença Apuração de Baixas C', 60),
  ('Custo dos Serviços Prestados', 'Diferença Apuração de Baixas D', 'FIN', 'Diferença Apuração de Baixas D', 70),
  ('Receita de Vendas', 'Diferença Taxa de Câmbio Dia C', 'FIN', 'Diferença Taxa de Câmbio Dia C', 80),
  ('Custo dos Serviços Prestados', 'Diferença Taxa de Cambio Dia D', 'FIN', 'Diferença Taxa de Cambio Dia D', 90),
  ('Despesas Financeiras', 'IOF', 'FIN', 'IOF', 100),
  ('Despesas Financeiras', 'Juros e Multa', 'FIN', 'Juros e Multa', 110),
  ('Custo dos Serviços Prestados', 'Tarifa de Remessa', 'FIN', 'Tarifa de Remessa', 120),
  ('Despesas Financeiras', 'Taxa de Antecipação', 'FIN', 'Taxa de Antecipação', 130),
  ('Despesas Financeiras', 'Taxa do Cartão de Crédito/Débito', 'FIN', 'Taxa do Cartão de Crédito/Débito', 140),
  ('Despesas Financeiras', 'Taxas e Tarifas Bancárias', 'FIN', 'Taxas e Tarifas Bancárias', 150),
  ('Impostos e Deduções da Receita Bruta', 'DAS', 'IMP_H', 'DAS', 10),
  ('Impostos e Deduções da Receita Bruta', 'Descontos Concedidos', 'IMP_H', 'Descontos Concedidos', 20),
  ('Impostos e Deduções da Receita Bruta', 'ISS - RPA', 'IMP_H', 'ISS - RPA', 30),
  ('Impostos e Deduções da Receita Bruta', 'Reembolso / Carta de Crédito', 'IMP_H', 'Reembolso / Carta de Crédito', 40),
  ('Despesas com Investimentos e Empréstimos', 'Empréstimos', 'INV', 'Empréstimos', 10),
  ('Despesas com Investimentos e Empréstimos', 'Máquinas e Equipamentos', 'INV', 'Máquinas e Equipamentos', 20),
  ('Despesas com Investimentos e Empréstimos', 'Móveis e Utensílios', 'INV', 'Móveis e Utensílios', 30),
  ('Despesas com Investimentos e Empréstimos', 'Reforma', 'INV', 'Reforma', 40),
  ('Despesas Marketing', 'Agência de Marketing / Terceiros de MKT', 'MKT', 'Agência de Marketing / Terceiros de Mkt', 10),
  ('Despesas Marketing', 'Anúncios', 'MKT', 'Anúncios', 20),
  ('Despesas Marketing', 'Licença de Software (MKT)', 'MKT', 'Licença de Software (MKT)', 30),
  ('Despesas Marketing', 'Marcas e Patentes', 'MKT', 'Marcas e Patentes', 40),
  ('Despesas Marketing', 'Material gráfico MKT', 'MKT', 'Material Gráfico MKT', 50),
  ('Despesas Marketing', 'TravelBack', 'MKT', 'TravelBack', 60),
  ('Descontos da venda', 'Desconto', 'REEMB', 'Desconto', 10),
  ('Descontos da venda', 'Reembolso Cliente', 'REEMB', 'Reembolso Cliente', 20),
  ('Receitas da venda', 'Reembolso Cliente', 'REEMB', 'Reembolso Cliente', 20),
  ('Descontos da venda', 'Reembolso Fornecedor', 'REEMB', 'Reembolso Fornecedor', 30),
  ('Receitas da venda', 'Reembolso Fornecedor', 'REEMB', 'Reembolso Fornecedor', 30),
  ('Despesas Operacionais de RH', '13° Salário Sócios', 'RH', '13° Salário Sócios', 10),
  ('Despesas Operacionais de RH', '13º Salário', 'RH', '13º Salário', 20),
  ('Receitas Não Operacionais', 'Adiantamento 13º Salário', 'RH', 'Adiantamento 13º Salário', 30),
  ('Receitas Não Operacionais', 'Adiantamento de Salário', 'RH', 'Adiantamento de Salário', 40),
  ('Receitas Não Operacionais', 'Adiantamento Férias', 'RH', 'Adiantamento Férias', 50),
  ('Despesas Operacionais de RH', 'Adiantamento Salarial', 'RH', 'Adiantamento Salarial', 60),
  ('Despesas Operacionais de RH', 'Auxilio Alimentação', 'RH', 'Auxilio Alimentação', 70),
  ('Despesas Operacionais de RH', 'Benefício (VR)', 'RH', 'Benefício (VR)', 80),
  ('Despesas Operacionais de RH', 'Benefícios Previdenciários', 'RH', 'Benefícios Previdenciários', 90),
  ('Receitas Não Operacionais', 'Desconto de Salário', 'RH', 'Desconto de Salário', 100),
  ('Receitas Não Operacionais', 'Desconto INSS', 'RH', 'Desconto INSS', 110),
  ('Receitas Não Operacionais', 'Desconto IRRF', 'RH', 'Desconto IRRF', 120),
  ('Receitas Não Operacionais', 'Devolução de Empréstimo', 'RH', 'Devolução de Empréstimo', 130),
  ('Despesas Operacionais de RH', 'Empréstimo D', 'RH', 'Empréstimo D', 140),
  ('Despesas Operacionais de RH', 'Estágio', 'RH', 'Estágio', 150),
  ('Despesas Operacionais de RH', 'Férias', 'RH', 'Férias', 160),
  ('Despesas Operacionais de RH', 'Ferramentas de RH', 'RH', 'Ferramentas de RH', 170),
  ('Despesas Operacionais de RH', 'FGTS', 'RH', 'FGTS', 180),
  ('Despesas Operacionais de RH', 'GRCSU - Contribuição Sindical', 'RH', 'GRCSU - Contribuição Sindical', 190),
  ('Despesas Operacionais de RH', 'INSS - Instituto Nacional do Seguro Social', 'RH', 'INSS - Instituto Nacional do Seguro Social', 200),
  ('Despesas Operacionais de RH', 'Integração DSR', 'RH', 'Integração DSR', 210),
  ('Despesas Operacionais de RH', 'IRRF - Imposto de Renda Retido na Fonte', 'RH', 'IRRF - Imposto de Renda Retido na Fonte', 220),
  ('Despesas Operacionais de RH', 'Prestadores de Serviço - PJ - (RH)', 'RH', 'Prestadores de Serviço - PJ - (RH)', 230),
  ('Despesas Operacionais de RH', 'Pró-Labore', 'RH', 'Pró-Labore', 240),
  ('Despesas Operacionais de RH', 'Rescisões', 'RH', 'Rescisões', 250),
  ('Despesas Operacionais de RH', 'Salário', 'RH', 'Salário', 260),
  ('Despesas Operacionais de RH', 'Salário Maternidade', 'RH', 'Salário Maternidade', 270),
  ('Despesas Operacionais de RH', 'Saúde Ocupacional', 'RH', 'Saúde Ocupacional', 280),
  ('Despesas Operacionais de RH', 'Uniforme', 'RH', 'Uniforme', 290),
  ('Despesas Operacionais de RH', 'Vale Transporte', 'RH', 'Vale Transporte', 300),
  ('Despesas Operacionais de RH Benefícios', 'Aniversário de Empresa', 'RHB', 'Aniversário de Empresa', 10),
  ('Despesas Operacionais de RH Benefícios', 'Beneficio Extra (categorias Caju)', 'RHB', 'Beneficio Extra (categorias Caju)', 20),
  ('Despesas Operacionais de RH Benefícios', 'Benefício Extra (Home Office)', 'RHB', 'Benefício Extra (Home Office)', 30),
  ('Despesas Operacionais de RH Benefícios', 'Benefício Extra (Saldo Livre)', 'RHB', 'Benefício Extra (Saldo Livre)', 40),
  ('Despesas Operacionais de RH Benefícios', 'Benefício Extra (VC)', 'RHB', 'Benefício Extra (VC)', 50),
  ('Despesas Operacionais de RH Benefícios', 'Cursos e Treinamentos', 'RHB', 'Cursos e Treinamentos', 60),
  ('Despesas Marketing', 'Endomarketing', 'RHB', 'Endomarketing', 70),
  ('Despesas Operacionais de RH Benefícios', 'Estacionamento Vaga Rotativa', 'RHB', 'Estacionamento Vaga Rotativa', 80),
  ('Despesas Operacionais de RH Benefícios', 'Gympass', 'RHB', 'Gympass', 90),
  ('Despesas Operacionais de RH Benefícios', 'Plano de Saúde', 'RHB', 'Plano de Saúde', 100),
  ('Despesas Operacionais de RH Benefícios', 'PLR - Participação nos Lucros e Resultados', 'RHB', 'PLR - Participação nos Lucros e Resultados', 110),
  ('Despesas Operacionais de RH Benefícios', 'Previdência Privada - Sócios', 'RHB', 'Previdência Privada - Sócios', 120),
  ('Receitas Não Operacionais', 'Reembolso GymPass', 'RHB', 'Reembolso GymPass', 130),
  ('Receitas Não Operacionais', 'Reembolso Plano de Saúde', 'RHB', 'Reembolso Plano de Saúde', 140),
  ('Despesas Operacionais de RH Benefícios', 'Seguro de Vida', 'RHB', 'Seguro de Vida', 150),
  ('Receitas Não Operacionais', 'Ações Judiciais e Extrajudiciais - C', 'RNOP', 'Ações Judiciais e Extrajudiciais - C', 10),
  ('Receitas Não Operacionais', 'Empréstimo C', 'RNOP', 'Empréstimo C', 20),
  ('Receitas Não Operacionais', 'Reembolso', 'RNOP', 'Reembolso', 30),
  ('Receitas Não Operacionais', 'Reembolso Interno', 'RNOP', 'Reembolso Interno', 40),
  ('Receita de Vendas', 'Carta de Crédito', 'RV', 'Carta de Crédito', 10),
  ('Receita de Vendas', 'Comissão', 'RV', 'Comissão', 20),
  ('Receitas da venda', 'Comissão', 'RV', 'Comissão', 20),
  ('Receita de Vendas', 'Incentivo', 'RV', 'Incentivo', 30),
  ('Receitas da venda', 'Operação própria', 'RV', 'Operação Própria', 40),
  ('Receitas da venda', 'Over', 'RV', 'Over', 50),
  ('Custo dos Serviços Prestados', 'Pagamento ao Fornecedor - Operação propria', 'RV', 'Pagamento ao Fornecedor - Operação Própria', 60),
  ('Receita de Vendas', 'Reembolso Fornecedor - C', 'RV', 'Reembolso Fornecedor - C', 70),
  ('Descontos da venda', 'Taxa CC DU', 'RV', 'Taxa CC DU', 80),
  ('Descontos da venda', 'Taxa CC RAV', 'RV', 'Taxa CC RAV', 90),
  ('Receitas da venda', 'Taxa de Serviço', 'RV', 'Taxa de Serviço', 100),
  ('Receitas da venda', 'Taxa DU', 'RV', 'Taxa DU', 110),
  ('Receitas da venda', 'Taxa RAV', 'RV', 'Taxa RAV', 120);

-- ---------------------------------------------------------------------------
-- View de leitura — a base já chega no GRÃO da DRE (um registro por par × mês), então
-- não há fato a materializar e não existe deriva possível entre base e leitura.
--
-- LEFT JOIN de propósito: par sem mapa sai com `sub_chave IS NULL` e vira a bandeja
-- "Não classificadas". INNER JOIN faria a linha SUMIR — exatamente o que o invariante
-- de completude proíbe.
-- ---------------------------------------------------------------------------

CREATE VIEW financeiro.vw_dre_competencia AS
SELECT
  r.id,
  r.tipo,
  r.grupo,
  r.descricao,
  r.ano,
  r.mes_num,
  r.competencia,
  r.valor,
  m.sub_chave,
  m.rotulo_linha,
  COALESCE(m.excluida, false) AS excluida
FROM raw.demonstrativo_competencia r
LEFT JOIN financeiro.dre_comp_map m
  ON m.grupo_arquivo = r.grupo
 AND m.descricao_arquivo = r.descricao;

REVOKE ALL ON financeiro.vw_dre_competencia FROM PUBLIC, anon, authenticated;
GRANT SELECT ON financeiro.vw_dre_competencia TO service_role;

NOTIFY pgrst, 'reload schema';
