-- ---------------------------------------------------------------------------
-- 0149 — v4.22.0 M6: normalização do conta_previsao dos lançamentos gerenciais.
--
-- DECLARAÇÃO: só NORMALIZA dado existente em analytics.gerencial_lancamentos
-- (UPDATE de conta_previsao para o nome canônico da conta real, ou "Outras"). Sem DDL,
-- sem FK, sem mudar tipo (conta_previsao continua TEXT). Reversível. NÃO toca
-- get_gerencial_projecao_diaria nem a Visualização Agregada — a agregada NÃO usa
-- conta_previsao (decisão de modelo imutável; verificar projeção idêntica antes/depois).
--
-- É um UPDATE em dado existente → o heurístico do db-gate marca como destrutiva.
-- É normalização ADITIVA/reversível (decisão do briefing v4.22 §7): aplicar sob backup-gate
-- com CONFIRMAÇÃO HUMANA CONSCIENTE (jamais via EOF).
--
-- Contas REAIS (analytics.gerencial_saldos): Itaú, Asaas, Blimboo, Clara
--   (chaves normalizadas: itau, asaas, blimboo, clara — batem com a lista canônica abaixo).
-- Snapshot de origem RE-VERIFICADO contra produção em 2026-06-17 (108 linhas, 100% origem='planilha';
-- a base cresceu desde a investigação 2026-06-16/47 linhas — re-checada antes de aplicar):
--   Banco Itau(42), ASAAS(33), NULL(18), Blimboo(13), Caixa Economica(1), USD 4.680(1).
-- Aliases/decisões do Yan: Banco Itau→Itaú; ASAAS→Asaas (caixa); Blimboo já bate; Clara é conta
-- real (sem linha crua hoje). NULL + órfãos (Caixa Economica, USD 4.680 — não são contas reais)→"Outras".
-- "Outras" é rótulo, NÃO conta. Resultado esperado: Itaú×42, Asaas×33, Blimboo×13, Outras×20.
-- Espelha src/lib/gerencial/normalizar-conta.ts (caminho vivo do re-import).
-- pg_catalog.unaccent já habilitado (migration 0073).
-- ---------------------------------------------------------------------------

-- Aliases → nome canônico (match por lower+unaccent+trim). Rodam ANTES do catch-all.
UPDATE analytics.gerencial_lancamentos
SET conta_previsao = 'Itaú'
WHERE lower(pg_catalog.unaccent(btrim(conta_previsao))) IN ('banco itau', 'itau');

UPDATE analytics.gerencial_lancamentos
SET conta_previsao = 'Asaas'
WHERE lower(pg_catalog.unaccent(btrim(conta_previsao))) = 'asaas';

UPDATE analytics.gerencial_lancamentos
SET conta_previsao = 'Blimboo'
WHERE lower(pg_catalog.unaccent(btrim(conta_previsao))) = 'blimboo';

-- Catch-all: nulo, vazio ou qualquer valor que NÃO seja uma conta real → "Outras".
-- (As contas reais já foram canonizadas acima; o NOT IN protege-as.)
UPDATE analytics.gerencial_lancamentos
SET conta_previsao = 'Outras'
WHERE conta_previsao IS NULL
   OR btrim(conta_previsao) = ''
   OR lower(pg_catalog.unaccent(btrim(conta_previsao))) NOT IN ('itau', 'asaas', 'blimboo', 'clara');

NOTIFY pgrst, 'reload schema';
