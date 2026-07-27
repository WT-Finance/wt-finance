-- ---------------------------------------------------------------------------
-- 0205 — feat(dre): SEED da estrutura viva (struct provado da controladoria) + triggers do diário
-- v5.3.0 / M1 (DRE Gerencial · Onda 2).
--
-- DECLARAÇÃO (regime aditivo): esta migration é ADITIVA/retrocompatível com a main viva —
--   • só INSERE nas tabelas NOVAS da 0204 (dre_bloco/dre_categoria_map) e anexa triggers
--     do diário (0199) a elas; NENHUM dado pré-existente é alterado (dim_categoria é só LIDA);
--   • fail-closed: se a reconciliação com dim_categoria não fechar, a migration ABORTA.
--
-- Fonte do seed: o struct de 159 linhas da controladoria, EXTRAÍDO e PROVADO na investigação
-- (docs/relatorios/Relatorio_DRE_FluxoCaixa_Onda2_2026-07-24.md): 29 blocos (7 blocoH + 15 sub
-- + 7 tot) com as fórmulas da §A.2 (aritmeticamente verificadas nas 13 colunas), 130 categorias
-- mapeadas (18 com rótulo contábil "(-) …" de exibição), a categoria "Distribuição de Lucros"
-- na linha homônima (chave DIST_LUCROS — no struct original ela NÃO tem chave e é alimentada
-- por NOME; aqui fórmula ancora por CHAVE, então ela ganhou uma: REX = RAIR + DIST_LUCROS;
-- sem isso o Resultado do Exercício erraria R$ 376.455,16 no ano — achado do oráculo do M0),
-- e as 2 transferências internas ("Movimentação de Caixa - C/D", netam a zero) EXCLUÍDAS.
-- A 4ª órfã ("Estacionamento Vaga Rotativa") fica SEM linha = bandeja (por decisão).
-- Reconciliação esperada HOJE: 130 + 1 especial + 2 excluídas = 133 linhas; bandeja = 1.
-- (Categorias criadas no Monde DEPOIS deste seed caem na bandeja — não abortam nada.)
--
-- O de-para casa por NOME (dim_categoria.categoria é UNIQUE) no MOMENTO DO APPLY e grava o
-- categoria_id (robusto a rename futuro). Categoria do struct ausente do dim → ABORTA (lista).
-- ---------------------------------------------------------------------------

-- ── 1. Blocos (ordem = posição no demonstrativo; fórmulas por CHAVE, §A.2) ────
INSERT INTO financeiro.dre_bloco (chave, rotulo, tipo, ordem, formula) VALUES
  ('ENT_H', '(+) ENTRADA DE CLIENTES', 'blocoH', 10, NULL),
  ('PAG_H', '(-) PAGAMENTO AO FORNECEDOR', 'blocoH', 20, NULL),
  ('REPASSE', '(=) SALDO REPASSE', 'tot', 30, '["ENT_H","PAG_H"]'::jsonb),
  ('RB_H', '(+) RECEITA BRUTA DE VENDAS', 'blocoH', 40, '["REPASSE","RV"]'::jsonb),
  ('RV', 'Receita de Vendas', 'sub', 50, NULL),
  ('IMP_H', '(-) IMPOSTOS E DEDUÇÕES DA RECEITA BRUTA', 'blocoH', 60, NULL),
  ('ROL', '(=) RECEITA OPERACIONAL LÍQUIDA', 'tot', 70, '["REPASSE","RV","IMP_H"]'::jsonb),
  ('CUSTO', 'Custo dos Serviços Prestados', 'sub', 80, NULL),
  ('LB', '= LUCRO BRUTO', 'tot', 90, '["ROL","CUSTO"]'::jsonb),
  ('DESP_H', '(-) DESPESAS', 'blocoH', 100, '["ADM","COM","IMOB","FIN","MKT","ESTR","RH","RHB","RFIN"]'::jsonb),
  ('ADM', 'Despesas Administrativas', 'sub', 110, NULL),
  ('COM', 'Despesas Comerciais', 'sub', 120, NULL),
  ('IMOB', 'Despesas com Imobilizados', 'sub', 130, NULL),
  ('FIN', 'Despesas Financeiras', 'sub', 140, NULL),
  ('MKT', 'Despesas Marketing', 'sub', 150, NULL),
  ('ESTR', 'Despesas Operacionais de Estrutura', 'sub', 160, NULL),
  ('RH', 'Despesas Operacionais RH', 'sub', 170, NULL),
  ('RHB', 'Despesas Operacionais RH Benefícios', 'sub', 180, NULL),
  ('RFIN', 'Receitas e Rendimentos Financeiros', 'sub', 190, NULL),
  ('LOP', '= LUCRO / PREJUÍZO OPERACIONAL', 'tot', 200, '["LB","ADM","COM","IMOB","FIN","MKT","ESTR","RH","RHB","RFIN"]'::jsonb),
  ('ONOP_H', '(+ / -) OUTRAS RECEITAS E DESPESAS NÃO OPERACIONAIS', 'blocoH', 210, '["RNOP","DNOP"]'::jsonb),
  ('RNOP', 'Outras Receitas não Operacionais', 'sub', 220, NULL),
  ('DNOP', 'Outras Despesas não Operacionais', 'sub', 230, NULL),
  ('LL', '= LUCRO / PREJUÍZO LÍQUIDO', 'tot', 240, '["LOP","RNOP","DNOP"]'::jsonb),
  ('INV_H', '(-) DESPESAS COM INVESTIMENTOS E EMPRÉSTIMOS', 'blocoH', 250, '["INV"]'::jsonb),
  ('INV', 'Despesas com Investimentos e Empréstimos', 'sub', 260, NULL),
  ('RAIR', '= RESULTADO ANTES DO IR E CSLL', 'tot', 270, '["LL","INV"]'::jsonb),
  ('DIST_LUCROS', 'Distribuição de Lucros', 'sub', 280, NULL),
  ('REX', '= RESULTADO DO EXERCÍCIO', 'tot', 290, '["RAIR","DIST_LUCROS"]'::jsonb);

-- ── 2. De-para categoria → bloco (130 struct + DIST_LUCROS + 2 excluídas) ────
INSERT INTO financeiro.dre_categoria_map (categoria_id, bloco_chave, ordem, nota_estrela, excluida, rotulo)
SELECT dc.id, v.bloco_chave, v.ordem, v.estrela, v.excluida, v.rotulo
FROM (VALUES
  ('Deposito não Identificado', 'ENT_H', 10, FALSE, FALSE, NULL),
  ('Entrada de clientes', 'ENT_H', 20, FALSE, FALSE, 'Entrada de Clientes'),
  ('Pagamento ao Fornecedor', 'PAG_H', 10, FALSE, FALSE, NULL),
  ('Carta de Crédito', 'RV', 10, FALSE, FALSE, NULL),
  ('Comissão', 'RV', 20, FALSE, FALSE, NULL),
  ('Diferença Apuração de Baixas C', 'RV', 30, FALSE, FALSE, NULL),
  ('Diferença Taxa de Câmbio Dia C', 'RV', 40, FALSE, FALSE, NULL),
  ('Incentivo', 'RV', 50, FALSE, FALSE, NULL),
  ('Reversão de Perdas Financeiras', 'RV', 60, FALSE, FALSE, NULL),
  ('Reembolso Fornecedor - C', 'RV', 70, FALSE, FALSE, NULL),
  ('DAS', 'IMP_H', 10, FALSE, FALSE, NULL),
  ('Reembolso / Carta de Crédito', 'IMP_H', 20, FALSE, FALSE, NULL),
  ('Descontos Concedidos', 'IMP_H', 30, FALSE, FALSE, NULL),
  ('ISS - RPA', 'IMP_H', 40, TRUE, FALSE, NULL),
  ('Custo com Viagem', 'CUSTO', 10, FALSE, FALSE, NULL),
  ('Reembolso - Custo com Viagem - C', 'CUSTO', 20, FALSE, FALSE, '(-) Reembolso - Custo com Viagem - C'),
  ('Diferença Apuração de Baixas D', 'CUSTO', 30, FALSE, FALSE, NULL),
  ('Diferença Taxa de Cambio Dia D', 'CUSTO', 40, FALSE, FALSE, NULL),
  ('Material de apoio - Eventos', 'CUSTO', 50, FALSE, FALSE, 'Material de Apoio - Eventos'),
  ('Pagamento ao Fornecedor - Operação propria', 'CUSTO', 60, FALSE, FALSE, '(-) Pagamento ao Fornecedor - Operação propria'),
  ('Prejuízos', 'CUSTO', 70, FALSE, FALSE, NULL),
  ('Assessoria Local', 'CUSTO', 80, FALSE, FALSE, NULL),
  ('Plantão de Atendimento', 'CUSTO', 90, FALSE, FALSE, NULL),
  ('Seguro de Responsabilidade Civil', 'CUSTO', 100, FALSE, FALSE, NULL),
  ('Welcome Labs', 'CUSTO', 110, FALSE, FALSE, NULL),
  ('Prestador de Serviço - PJ', 'CUSTO', 120, TRUE, FALSE, NULL),
  ('Bens não Ativos', 'ADM', 10, FALSE, FALSE, 'Bens não ativos'),
  ('Consultorias e Assessorias', 'ADM', 20, FALSE, FALSE, NULL),
  ('Copa e Cozinha', 'ADM', 30, FALSE, FALSE, NULL),
  ('Despesas com Cartório', 'ADM', 40, FALSE, FALSE, NULL),
  ('Honorários Advocatícios', 'ADM', 50, FALSE, FALSE, NULL),
  ('Honorários Contábeis', 'ADM', 60, FALSE, FALSE, NULL),
  ('Licença de Software (ADM)', 'ADM', 70, FALSE, FALSE, NULL),
  ('Material de Escritório', 'ADM', 80, FALSE, FALSE, NULL),
  ('Material de Informática', 'ADM', 90, FALSE, FALSE, NULL),
  ('Material de Limpeza e Higiene', 'ADM', 100, FALSE, FALSE, NULL),
  ('Taxas de Licenciamento e Funcionamento', 'ADM', 110, FALSE, FALSE, NULL),
  ('Prestadores de Serviço - PJ - (ADM)', 'ADM', 120, FALSE, FALSE, NULL),
  ('Presentes', 'COM', 10, FALSE, FALSE, NULL),
  ('Comissão de Vendas', 'COM', 20, FALSE, FALSE, NULL),
  ('Comissão Terceiros', 'COM', 30, FALSE, FALSE, NULL),
  ('Cortesia', 'COM', 40, FALSE, FALSE, NULL),
  ('Feiras, Eventos e Divulgações', 'COM', 50, FALSE, FALSE, NULL),
  ('FamTour', 'COM', 60, FALSE, FALSE, NULL),
  ('Material Gráfico', 'COM', 70, FALSE, FALSE, NULL),
  ('Premiação', 'COM', 80, FALSE, FALSE, NULL),
  ('Relacionamento (Clientes ou Fornecedores)', 'COM', 90, FALSE, FALSE, NULL),
  ('Transporte e Envio', 'COM', 100, FALSE, FALSE, NULL),
  ('Licença de Software (Comercial)', 'COM', 110, FALSE, FALSE, NULL),
  ('Máquinas e Equipamentos', 'IMOB', 10, FALSE, FALSE, NULL),
  ('Móveis e Utensílios', 'IMOB', 20, FALSE, FALSE, NULL),
  ('Reforma', 'IMOB', 30, FALSE, FALSE, NULL),
  ('Aplicações e Investimentos D', 'FIN', 10, FALSE, FALSE, NULL),
  ('Anuidade de Cartões', 'FIN', 20, FALSE, FALSE, NULL),
  ('IOF', 'FIN', 30, FALSE, FALSE, NULL),
  ('Juros e Multa', 'FIN', 40, FALSE, FALSE, NULL),
  ('Tarifa de Remessa', 'FIN', 50, FALSE, FALSE, NULL),
  ('Taxa de Antecipação', 'FIN', 60, FALSE, FALSE, NULL),
  ('Taxa do Cartão de Crédito/Débito', 'FIN', 70, FALSE, FALSE, NULL),
  ('Taxas e Tarifas Bancárias', 'FIN', 80, FALSE, FALSE, NULL),
  ('Agência de Marketing / Terceiros de MKT', 'MKT', 10, FALSE, FALSE, 'Agência de Marketing / Terceiros de Mkt'),
  ('Anúncios', 'MKT', 20, FALSE, FALSE, NULL),
  ('Endomarketing', 'MKT', 30, FALSE, FALSE, NULL),
  ('Licença de Software (MKT)', 'MKT', 40, FALSE, FALSE, NULL),
  ('TravelBack', 'MKT', 50, FALSE, FALSE, NULL),
  ('Marcas e Patentes', 'MKT', 60, FALSE, FALSE, NULL),
  ('Material gráfico MKT', 'MKT', 70, FALSE, FALSE, 'Material Gráfico MKT'),
  ('Aluguel', 'ESTR', 10, FALSE, FALSE, NULL),
  ('Condomínio', 'ESTR', 20, FALSE, FALSE, NULL),
  ('Energia', 'ESTR', 30, FALSE, FALSE, NULL),
  ('Estacionamento (Vaga Diretoria)', 'ESTR', 40, FALSE, FALSE, 'Estacionamento (vaga diretoria)'),
  ('Fundo de Reserva - Condomínio D', 'ESTR', 50, FALSE, FALSE, NULL),
  ('Fundo de Reserva - Condomínio C', 'ESTR', 60, FALSE, FALSE, '(-) Fundo de Reserva - Condomínio C'),
  ('Internet', 'ESTR', 70, FALSE, FALSE, NULL),
  ('Manutenção e Conservação de Equipamentos', 'ESTR', 80, FALSE, FALSE, NULL),
  ('Limpeza e Manutenção Predial', 'ESTR', 90, FALSE, FALSE, NULL),
  ('Telefonia', 'ESTR', 100, FALSE, FALSE, NULL),
  ('13° Salário Sócios', 'RH', 10, FALSE, FALSE, NULL),
  ('13º Salário', 'RH', 20, FALSE, FALSE, NULL),
  ('Adiantamento 13º Salário', 'RH', 30, FALSE, FALSE, '(-) Adiantamento 13º Salário'),
  ('Adiantamento Salarial', 'RH', 40, FALSE, FALSE, NULL),
  ('Adiantamento de Salário', 'RH', 50, FALSE, FALSE, '(-) Adiantamento de Salário'),
  ('Benefício (VR)', 'RH', 60, FALSE, FALSE, NULL),
  ('Benefícios Previdenciários', 'RH', 70, FALSE, FALSE, NULL),
  ('IRRF - Imposto de Renda Retido na Fonte', 'RH', 80, FALSE, FALSE, NULL),
  ('Desconto IRRF', 'RH', 90, FALSE, FALSE, '(-) Desconto IRRF'),
  ('Empréstimo D', 'RH', 100, FALSE, FALSE, NULL),
  ('Devolução de Empréstimo', 'RH', 110, FALSE, FALSE, '(-) Devolução de Empréstimo'),
  ('Estágio', 'RH', 120, FALSE, FALSE, NULL),
  ('Saúde Ocupacional', 'RH', 130, FALSE, FALSE, NULL),
  ('Férias', 'RH', 140, FALSE, FALSE, NULL),
  ('Adiantamento Férias', 'RH', 150, FALSE, FALSE, '(-) Adiantamento Férias'),
  ('Ferramentas de RH', 'RH', 160, FALSE, FALSE, NULL),
  ('FGTS', 'RH', 170, FALSE, FALSE, NULL),
  ('GRCSU - Contribuição Sindical', 'RH', 180, FALSE, FALSE, NULL),
  ('INSS - Instituto Nacional do Seguro Social', 'RH', 190, FALSE, FALSE, NULL),
  ('Desconto INSS', 'RH', 200, FALSE, FALSE, '(-) Desconto INSS'),
  ('Integração DSR', 'RH', 210, FALSE, FALSE, NULL),
  ('Prestadores de Serviço - PJ - (RH)', 'RH', 220, FALSE, FALSE, NULL),
  ('Pró-Labore', 'RH', 230, FALSE, FALSE, NULL),
  ('Rescisões', 'RH', 240, FALSE, FALSE, NULL),
  ('Salário', 'RH', 250, FALSE, FALSE, NULL),
  ('Desconto de Salário', 'RH', 260, FALSE, FALSE, '(-) Desconto de Salário'),
  ('Salário Maternidade', 'RH', 270, FALSE, FALSE, NULL),
  ('Uniforme', 'RH', 280, FALSE, FALSE, NULL),
  ('Vale Transporte', 'RH', 290, FALSE, FALSE, NULL),
  ('Auxilio Alimentação', 'RH', 300, TRUE, FALSE, NULL),
  ('Aniversário de Empresa', 'RHB', 10, FALSE, FALSE, NULL),
  ('Benefício Extra (Home Office)', 'RHB', 20, FALSE, FALSE, NULL),
  ('Benefício Extra (Saldo Livre)', 'RHB', 30, FALSE, FALSE, NULL),
  ('Benefício Extra (VC)', 'RHB', 40, FALSE, FALSE, NULL),
  ('Cursos e Treinamentos', 'RHB', 50, FALSE, FALSE, NULL),
  ('Gympass', 'RHB', 60, FALSE, FALSE, NULL),
  ('Reembolso GymPass', 'RHB', 70, FALSE, FALSE, '(-) Reembolso GymPass'),
  ('Plano de Saúde', 'RHB', 80, FALSE, FALSE, NULL),
  ('Reembolso Plano de Saúde', 'RHB', 90, FALSE, FALSE, '(-) Reembolso Plano de Saúde'),
  ('Previdência Privada - Sócios', 'RHB', 100, FALSE, FALSE, NULL),
  ('Seguro de Vida', 'RHB', 110, FALSE, FALSE, NULL),
  ('PLR - Participação nos Lucros e Resultados', 'RHB', 120, FALSE, FALSE, NULL),
  ('Beneficio Extra (categorias Caju)', 'RHB', 130, TRUE, FALSE, NULL),
  ('Acréscimos Cobrados', 'RFIN', 10, FALSE, FALSE, NULL),
  ('Aplicações e Investimentos C', 'RFIN', 20, FALSE, FALSE, NULL),
  ('Desconto Obtido', 'RFIN', 30, FALSE, FALSE, NULL),
  ('Ações Judiciais e Extrajudiciais - C', 'RNOP', 10, FALSE, FALSE, NULL),
  ('Empréstimo C', 'RNOP', 20, FALSE, FALSE, NULL),
  ('PartnerShip - Cotas', 'RNOP', 30, FALSE, FALSE, NULL),
  ('Reembolso', 'RNOP', 40, FALSE, FALSE, NULL),
  ('Reembolso Interno', 'RNOP', 50, FALSE, FALSE, NULL),
  ('Ações Judiciais e Extrajudiciais - D', 'DNOP', 10, FALSE, FALSE, NULL),
  ('Empréstimos', 'INV', 10, FALSE, FALSE, NULL),
  ('Distribuição de Lucros', 'DIST_LUCROS', 10, FALSE, FALSE, NULL),
  ('Movimentação de Caixa - C', NULL, 10, FALSE, TRUE, NULL),
  ('Movimentação de Caixa - D', NULL, 20, FALSE, TRUE, NULL)
) AS v(nome, bloco_chave, ordem, estrela, excluida, rotulo)
JOIN financeiro.dim_categoria dc ON dc.categoria = v.nome;

-- ── 3. Reconciliação FAIL-CLOSED (aborta o apply se o seed não fechou) ─────────
DO $$
DECLARE
  v_blocos   int;
  v_maps     int;
  v_excl     int;
  v_dist     int;
  v_faltando text;
BEGIN
  SELECT count(*) INTO v_blocos FROM financeiro.dre_bloco;
  SELECT count(*) INTO v_maps   FROM financeiro.dre_categoria_map;
  SELECT count(*) INTO v_excl   FROM financeiro.dre_categoria_map WHERE excluida;
  SELECT count(*) INTO v_dist   FROM financeiro.dre_categoria_map WHERE bloco_chave = 'DIST_LUCROS';

  IF v_blocos <> 29 THEN
    RAISE EXCEPTION 'Seed DRE: esperados 29 blocos, achados %.', v_blocos;
  END IF;
  -- 133 = 130 do struct + 1 especial (Distribuição de Lucros) + 2 excluídas. Se o Monde
  -- renomeou alguma categoria entre a escrita e o apply, o JOIN por nome não insere a linha
  -- e o total cai — melhor ABORTAR e re-gerar o seed do que semear um de-para furado.
  IF v_maps <> 133 OR v_excl <> 2 OR v_dist <> 1 THEN
    SELECT string_agg(v.nome, ', ') INTO v_faltando
    FROM (VALUES
      ('Distribuição de Lucros'), ('Movimentação de Caixa - C'), ('Movimentação de Caixa - D')
    ) AS v(nome)
    WHERE NOT EXISTS (SELECT 1 FROM financeiro.dim_categoria dc WHERE dc.categoria = v.nome);
    RAISE EXCEPTION 'Seed DRE não reconcilia: maps=% (esperado 133), excluídas=% (2), DIST_LUCROS=% (1). Especiais ausentes no dim: [%]. Regere o seed contra a produção atual.',
      v_maps, v_excl, v_dist, COALESCE(v_faltando, 'nenhum');
  END IF;

  RAISE NOTICE 'Seed DRE OK: % blocos, % maps (% excluídas), bandeja = dim sem map.', v_blocos, v_maps, v_excl;
END $$;

-- ── 4. Diário de alterações nas DUAS tabelas (APÓS o seed — o seed não polui o histórico) ──
-- Primeira promoção do padrão da v5.2.1 para fora do Gerencial (decisão firme do Yan).
-- O trigger genérico (0199) exige PK "id" — ambas cumprem (BIGSERIAL id).
CREATE TRIGGER trg_diario_dre_bloco
  AFTER INSERT OR UPDATE OR DELETE ON financeiro.dre_bloco
  FOR EACH ROW EXECUTE FUNCTION financeiro.fn_diario_alteracoes();
CREATE TRIGGER trg_diario_dre_categoria_map
  AFTER INSERT OR UPDATE OR DELETE ON financeiro.dre_categoria_map
  FOR EACH ROW EXECUTE FUNCTION financeiro.fn_diario_alteracoes();
