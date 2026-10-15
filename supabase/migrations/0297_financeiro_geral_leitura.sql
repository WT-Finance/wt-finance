-- ---------------------------------------------------------------------------
-- 0297 — feat(v6.4.0/M5): áreas RBAC `financeiro/geral` e `financeiro/geral/gestao`, tabelas curadas
--        (grupos do FIN, mapa de perdas), núcleo + foto dos prazos médios e as 5 RPCs de leitura da
--        página "Geral" (/financeiro/geral): get_geral_custos_financeiros, get_geral_prejuizos,
--        get_geral_recebiveis, get_geral_antecipacoes, get_geral_prazos.
--
-- Classificação: ADITIVA (2 INSERT em catálogo RBAC + 1 INSERT…SELECT de concessões + 4 CREATE TABLE
-- novas com seed INSERT…SELECT + 3 CREATE FUNCTION de apoio + 5 CREATE FUNCTION de leitura +
-- REVOKE/GRANT + 1 INSERT de foto inicial + guards de efetividade). Nenhum DROP/TRUNCATE/UPDATE/DELETE.
--
-- DECLARAÇÃO PRÉVIA (regime aditivo / autônomo):
--   • O QUE FAZ:
--     (1) INSERT das áreas `financeiro/geral` ('Geral', grupo 'Financeiro', ordem 36) e
--         `financeiro/geral/gestao` ('Geral (gestão)', grupo 'Financeiro', ordem 37) em app.rbac_areas
--         — as áreas financeiras vão de 30 a 35 (fluxo-caixa, gerencial, faturamento-corp, acervo,
--         acervo/gestao, dre); ON CONFLICT DO NOTHING;
--     (2) concede as áreas, EXPLICITAMENTE POR NOME de role:
--         • financeiro/geral         → 'Diretoria', 'Financeiro', 'Administrador', 'Máquina · verificação';
--         • financeiro/geral/gestao  → 'Financeiro', 'Administrador', 'Máquina · verificação'
--           (a role de máquina recebe SÓ a área, por exigência de rpc-contrato.test.ts: ela tem de ter
--           TODA área fora do grupo 'Administração'. Nenhuma RPC de escrita é concedida ao `verificador`).
--         'Gestor' fica fora (decisão do Yan, GATE 0). ON CONFLICT DO NOTHING — idempotente;
--     (3) tabelas curadas, com RLS ligado, sem acesso direto (REVOKE de PUBLIC/anon/authenticated):
--         • financeiro.geral_fin_grupo  — categoria → grupo do bloco FIN (seed por NOME: 11 linhas);
--         • financeiro.geral_perda_map  — categoria → papel prejuizo|reversao (seed por NOME: 2 linhas);
--         Categoria do FIN vivo fora de geral_fin_grupo cai no grupo 'nao_classificado' (bandeja visível);
--         categoria de nome ILIKE '%preju%'/'%perda%' fora de geral_perda_map sai na `bandeja` de perdas;
--     (4) prazos médios: financeiro.geral_prazo_calcular() (núcleo, service-only) +
--         financeiro.geral_prazo_foto (uma linha por captura) + public.registrar_foto_prazos(uuid)
--         (GRANT só service_role) + UMA foto inicial gravada no fim desta migration;
--     (5) as 5 RPCs de leitura, todas SECURITY DEFINER, STABLE, search_path '',
--         `PERFORM app.exigir_acesso(ARRAY['financeiro/geral'])` como primeira instrução do corpo
--         (padrão INLINE, skill banco-e-rpc §4). REVOKE de PUBLIC/anon; GRANT a authenticated e
--         service_role e, DELIBERADAMENTE, ao `verificador` por assinatura completa (molde 0273/0292).
--         O `ingestor` fica SEM nas 5.
--   • PREDICADO COPIADO DA DRE (inv. 1), sem lista de categorias em código para o FIN:
--         FROM financeiro.fato_fluxo f
--         JOIN financeiro.dre_categoria_map m ON m.categoria_id = f.categoria_id AND NOT m.excluida
--         WHERE f.tipo = 'realizado'
--           AND f.data_competencia >= <ano> AND f.data_competencia < <ano+1>   -- faixa semiaberta
--     (0207: realizado[m] = Σ valor, tipo='realizado', mês de data_competencia). `fin` = bloco FIN do
--     mapa VIVO, calculado direto desse predicado; os grupos são uma PARTIÇÃO das mesmas linhas
--     (LEFT JOIN em geral_fin_grupo + COALESCE 'nao_classificado'), então Σ grupos ≡ fin por construção.
--     Receita bruta = blocos ENT_H + PAG_H + RV (RB_H = REPASSE + RV; REPASSE = ENT_H + PAG_H). Essa
--     fórmula é DADO editável (dre_bloco.formula): o guard no fim da seção de seeds REPROVA a migration
--     se a premissa não valer no momento da aplicação; depois, mudança no editor NÃO é seguida por
--     esta RPC (o caso de contrato receita_bruta ≡ linha RB_H de get_dre_mensal pega a deriva).
--     Prejuízo/reversão = categorias de geral_perda_map ⨝ dre_categoria_map NOT excluida, quaisquer que
--     sejam os blocos (categoria excluída some da DRE inteira; a página espelha).
--     A DRE troca realizado por PREVISTO nos meses futuros do ano corrente; estas RPCs são só realizado
--     (mês futuro = 0): a paridade é por mês JÁ REALIZADO.
--   • "HOJE": as 5 get_geral_* usam `current_date`. Medido no catálogo vivo em 15/10/2026: `verificador`,
--     `ingestor` e `authenticated` têm rolconfig `TimeZone=America/Sao_Paulo` (0273:69 / 0274:69; os
--     app roles desde a 0152), então `current_date` nessas credenciais JÁ é o hoje de São Paulo — não há
--     risco de virada entre 21h e 24h, e get_dre_mensal (que também usa current_date) concorda na mesma
--     credencial. EXCEÇÃO deliberada: o núcleo geral_prazo_calcular() e registrar_foto_prazos() rodam
--     também como `postgres` (esta migration, em UTC) e como service_role: usam
--     (now() AT TIME ZONE 'America/Sao_Paulo')::date EXPLÍCITO, para a foto inicial, a foto da carga e o
--     `atual` da RPC concordarem sem parâmetro, qualquer que seja a credencial.
--   • PRAZOS (decisão do GATE 0): saldo_receber = Σ raw.titulos_em_aberto.valor do grupo 'Receita de
--     Vendas'; saldo_pagar = |Σ| do grupo 'Repasse'; entrada_12m = Realizado de ENT_H; pagamento_12m =
--     |Realizado de PAG_H|; janela = os 12 meses FECHADOS anteriores ao mês da data; pmr/pmp =
--     saldo ÷ fluxo × 365 (1 casa; NULL com denominador ≤ 0); folga = pmp − pmr (dos valores já
--     arredondados, para a tela somar sem resíduo).
--   • DEPENDE EM RUNTIME DE 0295 E 0296 (tabelas raw.contas_receber, financeiro.contas_receber_foto_carga,
--     financeiro.antecipacao, financeiro.antecipacao_conta): plpgsql não valida tabela no CREATE, então a
--     migration APLICARIA sem elas — por isso o guard (0) no começo exige as colunas usadas e aborta com
--     mensagem clara.
--   • COMPATÍVEL com a main viva: só objetos NOVOS; nenhuma assinatura existente muda; nenhum código em
--     produção os referencia. NÃO TOCA get_dre_mensal, dre_categoria_map, app.exigir_acesso.
--     A única escrita de dado é o INSERT da foto inicial de prazos (tabela nova).
--   • Volatilidade/orçamento (8 s de `authenticated`): STABLE, sem temp table. Custos/prejuízos: UMA
--     varredura indexada de fato_fluxo por (tipo, data_competencia) no intervalo [ano-1, ano+1) + joins
--     com ~130 categorias; o ano anterior sai da mesma passada. Recebíveis: UMA passada em
--     raw.contas_receber (filtro liquidacao IS NULL OR conferido = 'Inadimplente') + fotos de carga
--     (poucas linhas). Antecipações: tabela de dezenas de linhas. Prazos: 1 agregação de
--     raw.titulos_em_aberto por grupo + 1 passada de fato_fluxo em 12 meses + fotos.
--
-- Pós-aplicação (orquestrador): regenerar src/types/database.ts, schemas Zod + casos em
-- rpc-contrato.test.ts (paridade fin ≡ bloco FIN de get_dre_mensal; prejuízo/reversão ≡ linha da
-- categoria; receita_bruta ≡ RB_H), derivar a allowlist com scripts/credencial/derivar-allowlist.mjs,
-- `npm run db:baseline`, e verificação REST com service_role (db query NÃO executa o corpo).
--
-- DOWN (destrutivo — humano em TTY; guardar FORA de supabase/migrations/):
--   ⚠️ `DROP TABLE financeiro.geral_prazo_foto` APAGA a SÉRIE HISTÓRICA de prazos médios (PMR/PMP/folga):
--   uma foto por carga do Aberto, que NÃO se reconstrói depois (o saldo em aberto de cada dia só existia
--   naquele dia). Exporte a tabela antes. As tabelas curadas (geral_fin_grupo, geral_perda_map) são
--   seed e se recriam por migration.
--   DROP FUNCTION public.get_geral_custos_financeiros(integer);
--   DROP FUNCTION public.get_geral_prejuizos(integer);
--   DROP FUNCTION public.get_geral_recebiveis();
--   DROP FUNCTION public.get_geral_antecipacoes(integer);
--   DROP FUNCTION public.get_geral_prazos();
--   DROP FUNCTION public.registrar_foto_prazos(uuid);
--   DROP FUNCTION financeiro.geral_prazo_calcular();
--   DROP TABLE financeiro.geral_prazo_foto;
--   DROP TABLE financeiro.geral_perda_map;
--   DROP TABLE financeiro.geral_fin_grupo;
--   DELETE FROM app.rbac_role_permissoes WHERE area IN ('financeiro/geral', 'financeiro/geral/gestao');
--   DELETE FROM app.rbac_areas WHERE area IN ('financeiro/geral', 'financeiro/geral/gestao');
-- ---------------------------------------------------------------------------

BEGIN;

-- (0) Pré-condição: as tabelas/colunas das migrations irmãs (0295/0296) que as RPCs leem.
DO $$
DECLARE
  v_col text;
BEGIN
  FOREACH v_col IN ARRAY ARRAY[
    'raw.contas_receber.pessoa',
    'raw.contas_receber.vencimento',
    'raw.contas_receber.liquidacao',
    'raw.contas_receber.valor_final',
    'raw.contas_receber.conferido',
    'financeiro.contas_receber_foto_carga.carga_id',
    'financeiro.contas_receber_foto_carga.data_posicao',
    'financeiro.contas_receber_foto_carga.gravado_em',
    'financeiro.contas_receber_foto_carga.inadimplente_n',
    'financeiro.contas_receber_foto_carga.inadimplente_valor',
    'financeiro.contas_receber_foto_carga.a_vencer_valor',
    'financeiro.antecipacao.conta_id',
    'financeiro.antecipacao.data',
    'financeiro.antecipacao.valor_antecipado',
    'financeiro.antecipacao.valor_liquido',
    'financeiro.antecipacao.desconto',
    'financeiro.antecipacao.atualizado_em',
    'financeiro.antecipacao_conta.id',
    'financeiro.antecipacao_conta.nome',
    'financeiro.antecipacao_conta.ativo',
    'raw.titulos_em_aberto.grupo_categoria',
    'raw.titulos_em_aberto.valor'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_attribute a
       WHERE a.attrelid = to_regclass(format('%I.%I', split_part(v_col, '.', 1), split_part(v_col, '.', 2)))
         AND a.attname = split_part(v_col, '.', 3)
         AND a.attnum > 0 AND NOT a.attisdropped
    ) THEN
      RAISE EXCEPTION '0297: pré-condição ausente — coluna % (aplique 0295/0296 antes)', v_col;
    END IF;
  END LOOP;
END
$$;

-- (1) Áreas novas. Paridade exata com AREAS/AREA_INFO em src/lib/auth/areas.ts (rpc-contrato.test.ts).
INSERT INTO app.rbac_areas (area, rotulo, grupo, ordem) VALUES
  ('financeiro/geral',        'Geral',          'Financeiro', 36),
  ('financeiro/geral/gestao', 'Geral (gestão)', 'Financeiro', 37)
ON CONFLICT (area) DO NOTHING;

-- (2) Concessões explícitas, por nome de role. O guard final reprova se algum nome não casar
-- (um nome digitado errado inseriria ZERO linhas, em silêncio).
INSERT INTO app.rbac_role_permissoes (role_id, area)
SELECT r.id, 'financeiro/geral'
  FROM app.rbac_roles r
 WHERE r.nome IN ('Diretoria', 'Financeiro', 'Administrador', 'Máquina · verificação')
ON CONFLICT (role_id, area) DO NOTHING;

INSERT INTO app.rbac_role_permissoes (role_id, area)
SELECT r.id, 'financeiro/geral/gestao'
  FROM app.rbac_roles r
 WHERE r.nome IN ('Financeiro', 'Administrador', 'Máquina · verificação')
ON CONFLICT (role_id, area) DO NOTHING;

-- (3) Tabelas curadas. RLS deny-by-default; o app só lê por RPC SECURITY DEFINER.
CREATE TABLE financeiro.geral_fin_grupo (
  categoria_id int  PRIMARY KEY REFERENCES financeiro.dim_categoria (id),
  grupo        text NOT NULL CHECK (grupo IN ('cartao', 'antecipacao', 'juros_iof', 'tarifas', 'cambio', 'receitas_financeiras')),
  ordem        int  NOT NULL DEFAULT 0
);

CREATE TABLE financeiro.geral_perda_map (
  categoria_id int  PRIMARY KEY REFERENCES financeiro.dim_categoria (id),
  papel        text NOT NULL CHECK (papel IN ('prejuizo', 'reversao'))
);

ALTER TABLE financeiro.geral_fin_grupo ENABLE ROW LEVEL SECURITY;
ALTER TABLE financeiro.geral_perda_map ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON financeiro.geral_fin_grupo FROM PUBLIC, anon, authenticated;
REVOKE ALL ON financeiro.geral_perda_map FROM PUBLIC, anon, authenticated;
GRANT SELECT ON financeiro.geral_fin_grupo TO service_role;
GRANT SELECT ON financeiro.geral_perda_map TO service_role;

COMMENT ON TABLE financeiro.geral_fin_grupo IS
  'v6.4.0: agrupamento curado das categorias do bloco FIN para a página Geral. Categoria do FIN fora daqui = grupo nao_classificado (bandeja visível).';
COMMENT ON TABLE financeiro.geral_perda_map IS
  'v6.4.0: categorias de prejuízo e de reversão de perdas para a página Geral. Categoria de nome preju/perda fora daqui = bandeja de perdas.';

-- Seed por NOME de categoria (nunca por id) — INSERT…SELECT, aditivo. Atenção: "Cambio" (sem acento) no
-- Dia D e "Câmbio" (com acento) no Dia C é a grafia real do Monde (0205).
INSERT INTO financeiro.geral_fin_grupo (categoria_id, grupo, ordem)
SELECT dc.id, v.grupo, v.ordem
  FROM (VALUES
    ('Taxa do Cartão de Crédito/Débito',   'cartao',               10),
    ('Taxa de Antecipação',                'antecipacao',          20),
    ('Juros e Multa',                      'juros_iof',            30),
    ('IOF',                                'juros_iof',            40),
    ('Taxas e Tarifas Bancárias',          'tarifas',              50),
    ('Tarifa de Remessa',                  'tarifas',              60),
    ('Anuidade de Cartões',                'tarifas',              70),
    ('Diferença Taxa de Cambio Dia D',     'cambio',               80),
    ('Diferença Taxa de Câmbio Dia C',     'cambio',               90),
    ('Acréscimos Cobrados',                'receitas_financeiras', 100),
    ('Desconto Obtido',                    'receitas_financeiras', 110)
  ) AS v(nome, grupo, ordem)
  JOIN financeiro.dim_categoria dc ON dc.categoria = v.nome
ON CONFLICT (categoria_id) DO NOTHING;

INSERT INTO financeiro.geral_perda_map (categoria_id, papel)
SELECT dc.id, v.papel
  FROM (VALUES
    ('Prejuízos',                       'prejuizo'),
    ('Reversão de Perdas Financeiras',  'reversao')
  ) AS v(nome, papel)
  JOIN financeiro.dim_categoria dc ON dc.categoria = v.nome
ON CONFLICT (categoria_id) DO NOTHING;

-- Guard dos seeds + premissas da DRE em que as RPCs se apoiam (fail-closed na aplicação).
DO $$
DECLARE
  v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM financeiro.geral_fin_grupo;
  IF v_n <> 11 THEN
    RAISE EXCEPTION '0297: geral_fin_grupo com % linhas (esperado 11 — nome de categoria não casou?)', v_n;
  END IF;
  IF (SELECT count(*) FROM financeiro.geral_fin_grupo WHERE grupo = 'cartao') <> 1
     OR (SELECT count(*) FROM financeiro.geral_fin_grupo WHERE grupo = 'antecipacao') <> 1
     OR (SELECT count(*) FROM financeiro.geral_fin_grupo WHERE grupo = 'juros_iof') <> 2
     OR (SELECT count(*) FROM financeiro.geral_fin_grupo WHERE grupo = 'tarifas') <> 3
     OR (SELECT count(*) FROM financeiro.geral_fin_grupo WHERE grupo = 'cambio') <> 2
     OR (SELECT count(*) FROM financeiro.geral_fin_grupo WHERE grupo = 'receitas_financeiras') <> 2 THEN
    RAISE EXCEPTION '0297: distribuição de geral_fin_grupo por grupo diverge do contrato (1/1/2/3/2/2)';
  END IF;

  SELECT count(*) INTO v_n FROM financeiro.geral_perda_map;
  IF v_n <> 2
     OR (SELECT count(*) FROM financeiro.geral_perda_map WHERE papel = 'prejuizo') <> 1
     OR (SELECT count(*) FROM financeiro.geral_perda_map WHERE papel = 'reversao') <> 1 THEN
    RAISE EXCEPTION '0297: geral_perda_map com % linhas (esperado 2: 1 prejuizo + 1 reversao)', v_n;
  END IF;

  -- As 11 categorias têm de estar HOJE no bloco FIN do mapa vivo (senão não entram em fin).
  SELECT count(*) INTO v_n
    FROM financeiro.geral_fin_grupo g
    JOIN financeiro.dre_categoria_map m ON m.categoria_id = g.categoria_id
   WHERE m.bloco_chave = 'FIN' AND NOT m.excluida;
  IF v_n <> 11 THEN
    RAISE EXCEPTION '0297: só % das 11 categorias curadas estão no bloco FIN do mapa vivo', v_n;
  END IF;

  -- Prejuízo e reversão têm de estar na DRE (mapeadas e não excluídas), senão a página zeraria.
  SELECT count(*) INTO v_n
    FROM financeiro.geral_perda_map p
    JOIN financeiro.dre_categoria_map m ON m.categoria_id = p.categoria_id
   WHERE NOT m.excluida AND m.bloco_chave IS NOT NULL;
  IF v_n <> 2 THEN
    RAISE EXCEPTION '0297: só % das 2 categorias de perda estão mapeadas e não excluídas na DRE', v_n;
  END IF;

  -- Premissa da receita bruta: ENT_H, PAG_H, RV e FIN são FOLHAS; RB_H = REPASSE + RV; REPASSE = ENT_H + PAG_H.
  SELECT count(*) INTO v_n
    FROM financeiro.dre_bloco b
   WHERE b.chave IN ('ENT_H', 'PAG_H', 'RV', 'FIN') AND b.formula IS NULL;
  IF v_n <> 4 THEN
    RAISE EXCEPTION '0297: ENT_H/PAG_H/RV/FIN deveriam ser blocos-folha (formula NULL) — só % são', v_n;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM financeiro.dre_bloco b WHERE b.chave = 'RB_H'
                  AND b.formula @> '["REPASSE","RV"]'::jsonb AND b.formula <@ '["REPASSE","RV"]'::jsonb) THEN
    RAISE EXCEPTION '0297: a fórmula de RB_H não é mais REPASSE + RV';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM financeiro.dre_bloco b WHERE b.chave = 'REPASSE'
                  AND b.formula @> '["ENT_H","PAG_H"]'::jsonb AND b.formula <@ '["ENT_H","PAG_H"]'::jsonb) THEN
    RAISE EXCEPTION '0297: a fórmula de REPASSE não é mais ENT_H + PAG_H';
  END IF;
END
$$;

-- (4) Prazos médios — foto, núcleo e registro.
CREATE TABLE financeiro.geral_prazo_foto (
  id             bigint        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  data           date          NOT NULL,            -- "hoje" de São Paulo no momento da captura
  capturado_em   timestamptz   NOT NULL DEFAULT now(),
  carga_id       uuid,                              -- NULL = foto avulsa (a inicial da migration)
  saldo_receber  numeric(18,2) NOT NULL,
  saldo_pagar    numeric(18,2) NOT NULL,
  entrada_12m    numeric(18,2) NOT NULL,
  pagamento_12m  numeric(18,2) NOT NULL,
  janela_de      date          NOT NULL,
  janela_ate     date          NOT NULL,
  pmr            numeric,                           -- NULL quando entrada_12m <= 0
  pmp            numeric,                           -- NULL quando pagamento_12m <= 0
  folga          numeric                            -- pmp - pmr; NULL se qualquer um for NULL
);

-- Idempotência do registro por carga (replay do cliente): ON CONFLICT, nunca check-then-insert.
CREATE UNIQUE INDEX geral_prazo_foto_carga_uq ON financeiro.geral_prazo_foto (carga_id) WHERE carga_id IS NOT NULL;
CREATE INDEX geral_prazo_foto_data_idx ON financeiro.geral_prazo_foto (data);

ALTER TABLE financeiro.geral_prazo_foto ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON financeiro.geral_prazo_foto FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE financeiro.geral_prazo_foto_id_seq FROM PUBLIC, anon, authenticated;
GRANT SELECT ON financeiro.geral_prazo_foto TO service_role;

COMMENT ON TABLE financeiro.geral_prazo_foto IS
  'v6.4.0: foto dos prazos médios (PMR/PMP) a cada carga aplicada do Aberto (public.registrar_foto_prazos). A série da página é a última foto de cada dia.';

-- Núcleo: o ÚNICO lugar onde o cálculo mora. Usado pela RPC (`atual`), pela foto da carga e pela foto
-- inicial. SEM exigir_acesso POR DESENHO (função de apoio no schema financeiro, não exposto): protegida
-- por GRANT — só service_role executa (as RPCs SECURITY DEFINER a chamam com os privilégios do dono).
CREATE OR REPLACE FUNCTION financeiro.geral_prazo_calcular()
RETURNS TABLE (
  data           date,
  saldo_receber  numeric,
  saldo_pagar    numeric,
  entrada_12m    numeric,
  pagamento_12m  numeric,
  janela_de      date,
  janela_ate     date,
  pmr            numeric,
  pmp            numeric,
  folga          numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_hoje  date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_pri   date;
  v_de    date;
  v_ate   date;
  v_sr    numeric;
  v_sp    numeric;
  v_ent   numeric;
  v_pag   numeric;
  v_pmr   numeric;
  v_pmp   numeric;
BEGIN
  -- Janela = os 12 meses FECHADOS anteriores ao mês da data.
  v_pri := date_trunc('month', v_hoje::timestamp)::date;
  v_de  := (v_pri - interval '12 months')::date;
  v_ate := v_pri - 1;

  -- Saldos em aberto (a receber de clientes; repasse a pagar), da carga vigente do Aberto.
  SELECT COALESCE(sum(t.valor) FILTER (WHERE t.grupo_categoria = 'Receita de Vendas'), 0),
         abs(COALESCE(sum(t.valor) FILTER (WHERE t.grupo_categoria = 'Repasse'), 0))
    INTO v_sr, v_sp
    FROM raw.titulos_em_aberto t
   WHERE t.grupo_categoria IN ('Receita de Vendas', 'Repasse');

  -- Fluxos de 12 meses: Realizado de ENT_H e de PAG_H (predicado da DRE de caixa).
  SELECT COALESCE(sum(f.valor) FILTER (WHERE m.bloco_chave = 'ENT_H'), 0),
         abs(COALESCE(sum(f.valor) FILTER (WHERE m.bloco_chave = 'PAG_H'), 0))
    INTO v_ent, v_pag
    FROM financeiro.fato_fluxo f
    JOIN financeiro.dre_categoria_map m
      ON m.categoria_id = f.categoria_id AND NOT m.excluida AND m.bloco_chave IN ('ENT_H', 'PAG_H')
   WHERE f.tipo = 'realizado'
     AND f.data_competencia >= v_de
     AND f.data_competencia <= v_ate;

  IF v_ent > 0 THEN v_pmr := round(v_sr / v_ent * 365, 1); END IF;
  IF v_pag > 0 THEN v_pmp := round(v_sp / v_pag * 365, 1); END IF;

  RETURN QUERY SELECT v_hoje, v_sr, v_sp, v_ent, v_pag, v_de, v_ate, v_pmr, v_pmp, (v_pmp - v_pmr);
END $$;

COMMENT ON FUNCTION financeiro.geral_prazo_calcular() IS
  'v6.4.0: núcleo dos prazos médios (PMR/PMP/folga). Saldo do Aberto (grupos Receita de Vendas e Repasse) ÷ fluxo realizado de 12 meses fechados (ENT_H, PAG_H) × 365. Service-only; "hoje" = São Paulo explícito.';

REVOKE EXECUTE ON FUNCTION financeiro.geral_prazo_calcular() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION financeiro.geral_prazo_calcular() TO service_role;

-- Registro da foto, chamado pelo servidor depois de aplicar a carga do Aberto (fail-soft no app).
-- SEM exigir_acesso POR DESENHO: RPC de carga, protegida por GRANT — só service_role executa.
-- Idempotente por carga: o replay devolve a foto original (ON CONFLICT DO NOTHING, sem check-then-insert).
CREATE OR REPLACE FUNCTION public.registrar_foto_prazos(p_carga_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_id  bigint;
  v_rep boolean := false;
BEGIN
  IF p_carga_id IS NULL THEN
    RAISE EXCEPTION 'registrar_foto_prazos: p_carga_id é obrigatório.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM raw.titulos_em_aberto) THEN
    RAISE EXCEPTION 'registrar_foto_prazos: raw.titulos_em_aberto está vazia — sem saldo para fotografar.';
  END IF;

  INSERT INTO financeiro.geral_prazo_foto
    (data, carga_id, saldo_receber, saldo_pagar, entrada_12m, pagamento_12m, janela_de, janela_ate, pmr, pmp, folga)
  SELECT c.data, p_carga_id, c.saldo_receber, c.saldo_pagar, c.entrada_12m, c.pagamento_12m,
         c.janela_de, c.janela_ate, c.pmr, c.pmp, c.folga
    FROM financeiro.geral_prazo_calcular() AS c
  ON CONFLICT (carga_id) WHERE carga_id IS NOT NULL DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    v_rep := true;
    SELECT f.id INTO v_id FROM financeiro.geral_prazo_foto f WHERE f.carga_id = p_carga_id;
  END IF;

  RETURN (
    SELECT jsonb_build_object(
             'id', f.id, 'data', f.data, 'carga_id', f.carga_id, 'repetida', v_rep,
             'pmr', f.pmr, 'pmp', f.pmp, 'folga', f.folga)
      FROM financeiro.geral_prazo_foto f
     WHERE f.id = v_id
  );
END $$;

COMMENT ON FUNCTION public.registrar_foto_prazos(uuid) IS
  'v6.4.0: grava a foto dos prazos médios da carga do Aberto recém-aplicada. Idempotente por carga_id. Só service_role.';

REVOKE EXECUTE ON FUNCTION public.registrar_foto_prazos(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.registrar_foto_prazos(uuid) TO service_role;

-- Foto INICIAL: a série nasce com 1 ponto no dia da aplicação (sem carga_id). Hoje de SP explícito
-- (a migration roda em UTC): é o próprio núcleo que calcula a data. Sem títulos em aberto, não grava.
INSERT INTO financeiro.geral_prazo_foto
  (data, carga_id, saldo_receber, saldo_pagar, entrada_12m, pagamento_12m, janela_de, janela_ate, pmr, pmp, folga)
SELECT c.data, NULL::uuid, c.saldo_receber, c.saldo_pagar, c.entrada_12m, c.pagamento_12m,
       c.janela_de, c.janela_ate, c.pmr, c.pmp, c.folga
  FROM financeiro.geral_prazo_calcular() AS c
 WHERE EXISTS (SELECT 1 FROM raw.titulos_em_aberto);

-- (5) RPC 1 — Custos financeiros (fluxo; bloco FIN = resultado financeiro líquido).
CREATE OR REPLACE FUNCTION public.get_geral_custos_financeiros(p_ano integer)
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_hoje    date := current_date;
  v_rel     text;
  v_mes     int;
  v_cut     int;
  v_ini_ant date;
  v_fim     date;
  v_zeros   numeric[] := ARRAY(SELECT 0::numeric FROM generate_series(1, 12));
  v_res     json;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/geral']);

  IF p_ano IS NULL OR p_ano < 2000 OR p_ano > 2100 THEN
    RAISE EXCEPTION 'Ano inválido.';
  END IF;

  v_rel := CASE
    WHEN p_ano < extract(year FROM v_hoje)::int THEN 'fechado'
    WHEN p_ano = extract(year FROM v_hoje)::int THEN 'corrente'
    ELSE 'futuro'
  END;
  v_mes := CASE WHEN v_rel = 'corrente' THEN extract(month FROM v_hoje)::int END;
  v_cut := CASE WHEN v_rel = 'corrente' THEN v_mes ELSE 12 END;   -- meses do recorte do ano anterior
  v_ini_ant := make_date(p_ano - 1, 1, 1);
  v_fim     := make_date(p_ano + 1, 1, 1);

  WITH cls AS (
    -- Categorias do bloco FIN VIVO e o grupo curado (sem grupo => bandeja 'nao_classificado').
    SELECT m.categoria_id,
           COALESCE(m.rotulo, dc.categoria)          AS rotulo,
           COALESCE(g.grupo, 'nao_classificado')     AS grupo,
           COALESCE(g.ordem, 0)                      AS ordem
      FROM financeiro.dre_categoria_map m
      JOIN financeiro.dim_categoria dc ON dc.id = m.categoria_id
      LEFT JOIN financeiro.geral_fin_grupo g ON g.categoria_id = m.categoria_id
     WHERE m.bloco_chave = 'FIN' AND NOT m.excluida
  ),
  grp (grupo, ord, tipo) AS (
    VALUES ('cartao', 1, 'custo'), ('antecipacao', 2, 'custo'), ('juros_iof', 3, 'custo'),
           ('tarifas', 4, 'custo'), ('cambio', 5, 'outros'), ('receitas_financeiras', 6, 'outros'),
           ('nao_classificado', 7, 'outros')
  ),
  base AS (
    -- UMA varredura de fato_fluxo: [ano-1, ano+1), predicado da DRE (0207), só os blocos usados.
    SELECT extract(year FROM f.data_competencia)::int  AS ano,
           extract(month FROM f.data_competencia)::int AS mes,
           f.categoria_id,
           m.bloco_chave,
           sum(f.valor)                                AS valor
      FROM financeiro.fato_fluxo f
      JOIN financeiro.dre_categoria_map m
        ON m.categoria_id = f.categoria_id AND NOT m.excluida
       AND m.bloco_chave IN ('FIN', 'ENT_H', 'PAG_H', 'RV')
     WHERE f.tipo = 'realizado'
       AND f.data_competencia >= v_ini_ant
       AND f.data_competencia <  v_fim
     GROUP BY 1, 2, 3, 4
  ),
  ser AS (
    SELECT ('c:' || b.categoria_id::text) AS k, b.ano, b.mes, b.valor AS v
      FROM base b WHERE b.bloco_chave = 'FIN'
    UNION ALL
    SELECT ('g:' || c.grupo), b.ano, b.mes, sum(b.valor)
      FROM base b JOIN cls c ON c.categoria_id = b.categoria_id
     GROUP BY c.grupo, b.ano, b.mes
    UNION ALL
    SELECT 'fin', b.ano, b.mes, sum(b.valor)
      FROM base b WHERE b.bloco_chave = 'FIN'
     GROUP BY b.ano, b.mes
    UNION ALL
    SELECT 'custos', b.ano, b.mes, sum(b.valor)
      FROM base b
      JOIN cls c ON c.categoria_id = b.categoria_id
      JOIN grp gg ON gg.grupo = c.grupo
     WHERE gg.tipo = 'custo'
     GROUP BY b.ano, b.mes
    UNION ALL
    SELECT 'rb', b.ano, b.mes, sum(b.valor)
      FROM base b WHERE b.bloco_chave IN ('ENT_H', 'PAG_H', 'RV')
     GROUP BY b.ano, b.mes
  ),
  arr AS (
    SELECT kk.k, kk.ano,
           (SELECT array_agg(COALESCE(s.v, 0) ORDER BY i.i)
              FROM generate_series(1, 12) AS i(i)
              LEFT JOIN ser s ON s.k = kk.k AND s.ano = kk.ano AND s.mes = i.i)::numeric[] AS meses
      FROM (SELECT DISTINCT s0.k, s0.ano FROM ser s0) kk
  ),
  top AS (
    SELECT ks.k,
           COALESCE(ac.meses, v_zeros) AS meses,
           COALESCE(ap.meses, v_zeros) AS meses_ant
      FROM (VALUES ('custos'), ('fin'), ('rb')) AS ks(k)
      LEFT JOIN arr ac ON ac.k = ks.k AND ac.ano = p_ano
      LEFT JOIN arr ap ON ap.k = ks.k AND ap.ano = p_ano - 1
  ),
  ytd AS (
    SELECT t.k, t.meses,
           (SELECT COALESCE(sum(x), 0) FROM unnest(t.meses) x) AS total,
           (SELECT COALESCE(sum(u.x), 0)
              FROM unnest(t.meses_ant) WITH ORDINALITY AS u(x, n)
             WHERE u.n <= v_cut) AS ytd_ant
      FROM top t
  )
  SELECT json_build_object(
    'ano',          p_ano,
    'relacao',      v_rel,
    'mes_corrente', v_mes,
    'grupos', COALESCE((
      SELECT json_agg(json_build_object(
               'grupo', gg.grupo,
               'tipo',  gg.tipo,
               'meses', COALESCE(ga.meses, v_zeros),
               'total', (SELECT COALESCE(sum(x), 0) FROM unnest(COALESCE(ga.meses, v_zeros)) x),
               'categorias', COALESCE((
                 SELECT json_agg(json_build_object(
                          'categoria_id', c.categoria_id,
                          'rotulo',       c.rotulo,
                          'meses',        COALESCE(ca.meses, v_zeros),
                          'total',        (SELECT COALESCE(sum(x), 0) FROM unnest(COALESCE(ca.meses, v_zeros)) x)
                        ) ORDER BY c.ordem, c.rotulo, c.categoria_id)
                   FROM cls c
                   LEFT JOIN arr ca ON ca.k = ('c:' || c.categoria_id::text) AND ca.ano = p_ano
                  WHERE c.grupo = gg.grupo
               ), '[]'::json)
             ) ORDER BY gg.ord)
        FROM grp gg
        LEFT JOIN arr ga ON ga.k = ('g:' || gg.grupo) AND ga.ano = p_ano
       WHERE gg.grupo <> 'nao_classificado'
          OR EXISTS (SELECT 1 FROM cls c0 WHERE c0.grupo = 'nao_classificado')
    ), '[]'::json),
    'custos',        (SELECT json_build_object('meses', y.meses, 'total', y.total) FROM ytd y WHERE y.k = 'custos'),
    'fin',           (SELECT json_build_object('meses', y.meses, 'total', y.total) FROM ytd y WHERE y.k = 'fin'),
    'receita_bruta', (SELECT json_build_object('meses', y.meses, 'total', y.total) FROM ytd y WHERE y.k = 'rb'),
    'ano_anterior_ytd', json_build_object(
      'custos',        (SELECT y.ytd_ant FROM ytd y WHERE y.k = 'custos'),
      'fin',           (SELECT y.ytd_ant FROM ytd y WHERE y.k = 'fin'),
      'receita_bruta', (SELECT y.ytd_ant FROM ytd y WHERE y.k = 'rb')
    ),
    'atualizado_em', (SELECT max(f.gerado_em) FROM financeiro.fato_fluxo f)
  ) INTO v_res;

  RETURN v_res;
END $$;

-- RPC 2 — Perdas e prejuízos (fluxo): bruto, com a reversão ao lado.
CREATE OR REPLACE FUNCTION public.get_geral_prejuizos(p_ano integer)
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_hoje    date := current_date;
  v_rel     text;
  v_mes     int;
  v_cut     int;
  v_ini     date;
  v_ini_ant date;
  v_fim     date;
  v_zeros   numeric[] := ARRAY(SELECT 0::numeric FROM generate_series(1, 12));
  v_res     json;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/geral']);

  IF p_ano IS NULL OR p_ano < 2000 OR p_ano > 2100 THEN
    RAISE EXCEPTION 'Ano inválido.';
  END IF;

  v_rel := CASE
    WHEN p_ano < extract(year FROM v_hoje)::int THEN 'fechado'
    WHEN p_ano = extract(year FROM v_hoje)::int THEN 'corrente'
    ELSE 'futuro'
  END;
  v_mes := CASE WHEN v_rel = 'corrente' THEN extract(month FROM v_hoje)::int END;
  v_cut := CASE WHEN v_rel = 'corrente' THEN v_mes ELSE 12 END;
  v_ini     := make_date(p_ano, 1, 1);
  v_ini_ant := make_date(p_ano - 1, 1, 1);
  v_fim     := make_date(p_ano + 1, 1, 1);

  WITH base AS (
    -- Categorias da tabela curada ⨝ mapa da DRE (NOT excluida), em QUALQUER bloco. Uma varredura.
    SELECT extract(year FROM f.data_competencia)::int  AS ano,
           extract(month FROM f.data_competencia)::int AS mes,
           pm.papel,
           sum(f.valor)                                AS valor
      FROM financeiro.fato_fluxo f
      JOIN financeiro.geral_perda_map pm ON pm.categoria_id = f.categoria_id
      JOIN financeiro.dre_categoria_map m
        ON m.categoria_id = f.categoria_id AND NOT m.excluida
     WHERE f.tipo = 'realizado'
       AND f.data_competencia >= v_ini_ant
       AND f.data_competencia <  v_fim
     GROUP BY 1, 2, 3
  ),
  ser AS (
    SELECT b.papel AS k, b.ano, b.mes, b.valor AS v FROM base b
    UNION ALL
    SELECT 'liquido', b.ano, b.mes, sum(b.valor) FROM base b GROUP BY b.ano, b.mes
  ),
  arr AS (
    SELECT kk.k, kk.ano,
           (SELECT array_agg(COALESCE(s.v, 0) ORDER BY i.i)
              FROM generate_series(1, 12) AS i(i)
              LEFT JOIN ser s ON s.k = kk.k AND s.ano = kk.ano AND s.mes = i.i)::numeric[] AS meses
      FROM (SELECT DISTINCT s0.k, s0.ano FROM ser s0) kk
  ),
  top AS (
    SELECT ks.k,
           COALESCE(ac.meses, v_zeros) AS meses,
           COALESCE(ap.meses, v_zeros) AS meses_ant
      FROM (VALUES ('prejuizo'), ('reversao'), ('liquido')) AS ks(k)
      LEFT JOIN arr ac ON ac.k = ks.k AND ac.ano = p_ano
      LEFT JOIN arr ap ON ap.k = ks.k AND ap.ano = p_ano - 1
  ),
  ytd AS (
    SELECT t.k, t.meses,
           (SELECT COALESCE(sum(x), 0) FROM unnest(t.meses) x) AS total,
           (SELECT COALESCE(sum(u.x), 0)
              FROM unnest(t.meses_ant) WITH ORDINALITY AS u(x, n)
             WHERE u.n <= v_cut) AS ytd_ant
      FROM top t
  )
  SELECT json_build_object(
    'ano',          p_ano,
    'relacao',      v_rel,
    'mes_corrente', v_mes,
    'prejuizo',     (SELECT json_build_object('meses', y.meses, 'total', y.total) FROM ytd y WHERE y.k = 'prejuizo'),
    'reversao',     (SELECT json_build_object('meses', y.meses, 'total', y.total) FROM ytd y WHERE y.k = 'reversao'),
    'liquido',      (SELECT json_build_object('meses', y.meses, 'total', y.total) FROM ytd y WHERE y.k = 'liquido'),
    'ano_anterior_ytd', json_build_object(
      'prejuizo', (SELECT y.ytd_ant FROM ytd y WHERE y.k = 'prejuizo'),
      'reversao', (SELECT y.ytd_ant FROM ytd y WHERE y.k = 'reversao'),
      'liquido',  (SELECT y.ytd_ant FROM ytd y WHERE y.k = 'liquido')
    ),
    -- Bandeja: categoria de nome preju/perda FORA da tabela curada, com o realizado do ano.
    'bandeja', COALESCE((
      SELECT json_agg(json_build_object(
               'categoria_id', dc.id,
               'rotulo',       COALESCE(m.rotulo, dc.categoria),
               'total',        COALESCE((
                 SELECT sum(f.valor)
                   FROM financeiro.fato_fluxo f
                  WHERE f.categoria_id = dc.id
                    AND f.tipo = 'realizado'
                    AND f.data_competencia >= v_ini
                    AND f.data_competencia <  v_fim
               ), 0)
             ) ORDER BY COALESCE(m.rotulo, dc.categoria), dc.id)
        FROM financeiro.dim_categoria dc
        LEFT JOIN financeiro.dre_categoria_map m ON m.categoria_id = dc.id
       WHERE (dc.categoria ILIKE '%preju%' OR dc.categoria ILIKE '%perda%')
         AND NOT EXISTS (SELECT 1 FROM financeiro.geral_perda_map pm WHERE pm.categoria_id = dc.id)
    ), '[]'::json),
    'atualizado_em', (SELECT max(f.gerado_em) FROM financeiro.fato_fluxo f)
  ) INTO v_res;

  RETURN v_res;
END $$;

-- RPC 3 — Recebíveis e inadimplência (ESTOQUE: posição na data da carga vigente; ignora pills de ano).
CREATE OR REPLACE FUNCTION public.get_geral_recebiveis()
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_carga_id uuid;
  v_dp       date;
  v_gravado  timestamptz;
  v_ano      int;
  v_mes_ini  date;
  v_mes_ant  date;
  v_res      json;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/geral']);

  -- Carga vigente = a última foto de carga (gravada na MESMA transação do TRUNCATE+INSERT do raw).
  SELECT fc.carga_id, fc.data_posicao, fc.gravado_em
    INTO v_carga_id, v_dp, v_gravado
    FROM financeiro.contas_receber_foto_carga fc
   ORDER BY fc.gravado_em DESC, fc.carga_id DESC
   LIMIT 1;

  -- Sem base: zeros e listas vazias (nunca zero fabricado como se houvesse posição).
  IF v_carga_id IS NULL OR NOT EXISTS (SELECT 1 FROM raw.contas_receber) THEN
    RETURN json_build_object(
      'carga',              NULL::json,
      'a_vencer',           json_build_object('n', 0, 'valor', 0),
      'inadimplente',       json_build_object('n', 0, 'valor', 0, 'faixas', '[]'::json),
      'marcacao_em_aberto', '[]'::json,
      'concentracao',       json_build_object('top', '[]'::json, 'valor_top', 0, 'pct_top', NULL::numeric),
      'recuperado_ano',     json_build_object('ano', extract(year FROM current_date)::int, 'n', 0, 'valor', 0),
      'comparativo',        NULL::json,
      'evolucao',           '[]'::json,
      'historico_desde',    (SELECT min(fc.data_posicao) FROM financeiro.contas_receber_foto_carga fc)
    );
  END IF;

  v_ano     := extract(year FROM v_dp)::int;
  v_mes_ini := date_trunc('month', v_dp::timestamp)::date;
  v_mes_ant := (v_mes_ini - interval '1 month')::date;

  WITH ab AS (
    -- O mesmo conjunto que a foto grava: em aberto + marcados Inadimplente (inclusive liquidados).
    SELECT r.pessoa, r.vencimento, r.liquidacao, r.valor_final, r.conferido
      FROM raw.contas_receber r
     WHERE r.liquidacao IS NULL OR r.conferido = 'Inadimplente'
  ),
  inad AS (
    -- Inadimplente = SÓ a marcação do Financeiro (decisão do GATE 1): em aberto E conferido='Inadimplente'.
    SELECT i.pessoa, i.vencimento, i.valor_final
      FROM ab i
     WHERE i.liquidacao IS NULL AND i.conferido = 'Inadimplente'
  ),
  tot AS (
    SELECT count(*) AS n, COALESCE(sum(i.valor_final), 0) AS valor FROM inad i
  ),
  fx AS (
    -- Faixas pelos dias de atraso (data_posicao − vencimento) dos MARCADOS; sem vencimento cai em
    -- 'nao_vencido' para a soma das faixas fechar com o total.
    SELECT CASE
             WHEN i.vencimento IS NULL OR v_dp - i.vencimento <= 0 THEN 'nao_vencido'
             WHEN v_dp - i.vencimento <= 30 THEN '1-30'
             WHEN v_dp - i.vencimento <= 60 THEN '31-60'
             WHEN v_dp - i.vencimento <= 90 THEN '61-90'
             ELSE '90+'
           END AS faixa,
           count(*) AS n,
           sum(i.valor_final) AS valor
      FROM inad i
     GROUP BY 1
  ),
  topn AS (
    -- pessoa vazia/só-espaço colapsa em NULL (a UI rotula); NULLS LAST pela ordenação abaixo.
    SELECT NULLIF(btrim(i.pessoa), '') AS pessoa,
           count(*) AS n,
           sum(i.valor_final) AS valor
      FROM inad i
     GROUP BY 1
     ORDER BY 3 DESC, 1
     LIMIT 10
  ),
  tp AS (
    SELECT COALESCE(sum(t.valor), 0) AS valor_top FROM topn t
  )
  SELECT json_build_object(
    'carga', json_build_object('carga_id', v_carga_id, 'data_posicao', v_dp, 'gravado_em', v_gravado),
    -- A vencer = em aberto com vencimento > data_posicao.
    'a_vencer', (
      SELECT json_build_object('n', count(*), 'valor', COALESCE(sum(x.valor_final), 0))
        FROM ab x
       WHERE x.liquidacao IS NULL AND x.vencimento > v_dp
    ),
    'inadimplente', (
      SELECT json_build_object(
               'n',     t.n,
               'valor', t.valor,
               'faixas', (
                 SELECT json_agg(json_build_object(
                          'faixa', z.faixa,
                          'n',     COALESCE(f.n, 0),
                          'valor', COALESCE(f.valor, 0)
                        ) ORDER BY z.ord)
                   FROM (VALUES ('nao_vencido', 1), ('1-30', 2), ('31-60', 3), ('61-90', 4), ('90+', 5)) AS z(faixa, ord)
                   LEFT JOIN fx f ON f.faixa = z.faixa
               ))
        FROM tot t
    ),
    -- Marcação dos títulos EM ABERTO (todos, vencidos ou a vencer): só os estados presentes.
    'marcacao_em_aberto', COALESCE((
      SELECT json_agg(json_build_object('conferido', g.conferido, 'n', g.n, 'valor', g.valor) ORDER BY g.ord)
        FROM (
          SELECT x.conferido,
                 count(*) AS n,
                 sum(x.valor_final) AS valor,
                 CASE x.conferido
                   WHEN 'Inadimplente'          THEN 1
                   WHEN 'Pendente'              THEN 2
                   WHEN 'Enviado para o banco'  THEN 3
                   WHEN 'Sim'                   THEN 4
                   ELSE 5
                 END AS ord
            FROM ab x
           WHERE x.liquidacao IS NULL
           GROUP BY x.conferido
        ) g
    ), '[]'::json),
    'concentracao', (
      SELECT json_build_object(
               'top', COALESCE((SELECT json_agg(json_build_object('pessoa', q.pessoa, 'n', q.n, 'valor', q.valor)
                                                ORDER BY q.valor DESC, q.pessoa)
                                  FROM topn q), '[]'::json),
               'valor_top', p.valor_top,
               'pct_top',   CASE WHEN t.valor > 0 THEN p.valor_top / t.valor * 100 END)
        FROM tot t CROSS JOIN tp p
    ),
    -- Recuperado = marcado Inadimplente e já liquidado, com liquidação no ano da data_posicao.
    'recuperado_ano', (
      SELECT json_build_object('ano', v_ano, 'n', count(*), 'valor', COALESCE(sum(x.valor_final), 0))
        FROM ab x
       WHERE x.conferido = 'Inadimplente'
         AND x.liquidacao IS NOT NULL
         AND extract(year FROM x.liquidacao)::int = v_ano
    ),
    -- Comparativo = última foto do mês anterior ao da data_posicao.
    'comparativo', (
      SELECT json_build_object(
               'data_posicao',       fc.data_posicao,
               'inadimplente_n',     fc.inadimplente_n,
               'inadimplente_valor', fc.inadimplente_valor,
               'a_vencer_valor',     fc.a_vencer_valor)
        FROM financeiro.contas_receber_foto_carga fc
       WHERE fc.data_posicao >= v_mes_ant AND fc.data_posicao < v_mes_ini
       ORDER BY fc.data_posicao DESC, fc.gravado_em DESC, fc.carga_id DESC
       LIMIT 1
    ),
    -- Evolução = última foto de cada mês.
    'evolucao', COALESCE((
      SELECT json_agg(json_build_object(
               'mes',                to_char(e.data_posicao, 'YYYY-MM'),
               'data_posicao',       e.data_posicao,
               'inadimplente_n',     e.inadimplente_n,
               'inadimplente_valor', e.inadimplente_valor,
               'a_vencer_valor',     e.a_vencer_valor
             ) ORDER BY e.data_posicao)
        FROM (
          SELECT DISTINCT ON (date_trunc('month', fc.data_posicao::timestamp))
                 fc.data_posicao, fc.inadimplente_n, fc.inadimplente_valor, fc.a_vencer_valor
            FROM financeiro.contas_receber_foto_carga fc
           ORDER BY date_trunc('month', fc.data_posicao::timestamp), fc.data_posicao DESC, fc.gravado_em DESC, fc.carga_id DESC
        ) e
    ), '[]'::json),
    'historico_desde', (SELECT min(fc.data_posicao) FROM financeiro.contas_receber_foto_carga fc)
  ) INTO v_res;

  RETURN v_res;
END $$;

-- RPC 4 — Antecipações (fluxo): registro do Janus (financeiro.antecipacao).
CREATE OR REPLACE FUNCTION public.get_geral_antecipacoes(p_ano integer)
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_hoje       date := current_date;
  v_rel        text;
  v_mes        int;
  v_cut        int;
  v_ini        date;
  v_fim        date;
  v_ant_ini    date;
  v_ant_fim    date;
  v_ultima     date;
  v_atualizado timestamptz;
  v_res        json;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/geral']);

  IF p_ano IS NULL OR p_ano < 2000 OR p_ano > 2100 THEN
    RAISE EXCEPTION 'Ano inválido.';
  END IF;

  v_rel := CASE
    WHEN p_ano < extract(year FROM v_hoje)::int THEN 'fechado'
    WHEN p_ano = extract(year FROM v_hoje)::int THEN 'corrente'
    ELSE 'futuro'
  END;
  v_mes := CASE WHEN v_rel = 'corrente' THEN extract(month FROM v_hoje)::int END;
  v_cut := CASE WHEN v_rel = 'corrente' THEN v_mes ELSE 12 END;
  v_ini     := make_date(p_ano, 1, 1);
  v_fim     := make_date(p_ano + 1, 1, 1);
  v_ant_ini := make_date(p_ano - 1, 1, 1);
  v_ant_fim := (make_date(p_ano - 1, 1, 1) + make_interval(months => v_cut))::date;

  SELECT max(x.data), max(x.atualizado_em) INTO v_ultima, v_atualizado
    FROM financeiro.antecipacao x;

  WITH a AS (
    SELECT x.data, x.conta_id, x.valor_antecipado, x.valor_liquido, x.desconto
      FROM financeiro.antecipacao x
     WHERE x.data >= v_ini AND x.data < v_fim
  ),
  mes AS (
    SELECT i.i AS mes,
           COALESCE(sum(a.valor_antecipado), 0) AS volume,
           COALESCE(sum(a.valor_liquido), 0)    AS liquido,
           COALESCE(sum(a.desconto), 0)         AS desconto,
           count(a.conta_id)                    AS n
      FROM generate_series(1, 12) AS i(i)
      LEFT JOIN a ON extract(month FROM a.data)::int = i.i
     GROUP BY i.i
  )
  SELECT json_build_object(
    'ano',          p_ano,
    'relacao',      v_rel,
    'mes_corrente', v_mes,
    'meses', (
      SELECT json_agg(json_build_object(
               'volume',   mm.volume,
               'liquido',  mm.liquido,
               'desconto', mm.desconto,
               'n',        mm.n
             ) ORDER BY mm.mes)
        FROM mes mm
    ),
    'total', (
      SELECT json_build_object(
               'volume',       sum(mm.volume),
               'liquido',      sum(mm.liquido),
               'desconto',     sum(mm.desconto),
               'n',            sum(mm.n)::int,
               'desconto_pct', CASE WHEN sum(mm.volume) > 0 THEN sum(mm.desconto) / sum(mm.volume) * 100 END)
        FROM mes mm
    ),
    'ano_anterior_ytd', (
      SELECT json_build_object(
               'volume',   COALESCE(sum(x.valor_antecipado), 0),
               'desconto', COALESCE(sum(x.desconto), 0),
               'n',        count(*))
        FROM financeiro.antecipacao x
       WHERE x.data >= v_ant_ini AND x.data < v_ant_fim
    ),
    -- Contas ativas (ou com registro no ano), mesmo sem movimento: a ausência também informa.
    'por_conta', COALESCE((
      SELECT json_agg(json_build_object(
               'conta',    c.nome,
               'volume',   COALESCE(t.volume, 0),
               'desconto', COALESCE(t.desconto, 0),
               'n',        COALESCE(t.n, 0)
             ) ORDER BY COALESCE(t.volume, 0) DESC, c.nome)
        FROM financeiro.antecipacao_conta c
        LEFT JOIN (
          SELECT a.conta_id,
                 sum(a.valor_antecipado) AS volume,
                 sum(a.desconto)         AS desconto,
                 count(*)                AS n
            FROM a
           GROUP BY a.conta_id
        ) t ON t.conta_id = c.id
       WHERE c.ativo OR t.n > 0
    ), '[]'::json),
    'ultima_data',        v_ultima,
    'dias_desde_ultima',  (v_hoje - v_ultima),
    -- Maior intervalo entre datas DISTINTAS consecutivas dentro do ano (todas as contas); NULL com < 2 datas.
    'maior_intervalo_ano', (
      SELECT json_build_object('dias', g.dias, 'de', g.de, 'ate', g.ate)
        FROM (
          SELECT d.dt AS de, d.prox AS ate, (d.prox - d.dt) AS dias
            FROM (
              SELECT dd.dt, lead(dd.dt) OVER (ORDER BY dd.dt) AS prox
                FROM (SELECT DISTINCT a2.data AS dt FROM a a2) dd
            ) d
           WHERE d.prox IS NOT NULL
           ORDER BY (d.prox - d.dt) DESC, d.dt
           LIMIT 1
        ) g
    ),
    'atualizado_em', v_atualizado
  ) INTO v_res;

  RETURN v_res;
END $$;

-- RPC 5 — Prazos médios (fluxo · janela móvel de 12 meses; saldo do Aberto).
CREATE OR REPLACE FUNCTION public.get_geral_prazos()
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_res json;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/geral']);

  SELECT json_build_object(
    -- `atual` vem do MESMO núcleo da foto; NULL quando não há nenhum título em aberto carregado.
    'atual', (
      SELECT CASE WHEN EXISTS (SELECT 1 FROM raw.titulos_em_aberto)
                  THEN json_build_object(
                         'data',          c.data,
                         'saldo_receber', c.saldo_receber,
                         'saldo_pagar',   c.saldo_pagar,
                         'entrada_12m',   c.entrada_12m,
                         'pagamento_12m', c.pagamento_12m,
                         'janela_de',     c.janela_de,
                         'janela_ate',    c.janela_ate,
                         'pmr',           c.pmr,
                         'pmp',           c.pmp,
                         'folga',         c.folga)
             END
        FROM financeiro.geral_prazo_calcular() AS c
    ),
    -- Série = a última foto de cada dia.
    'serie', COALESCE((
      SELECT json_agg(json_build_object('data', s.data, 'pmr', s.pmr, 'pmp', s.pmp, 'folga', s.folga) ORDER BY s.data)
        FROM (
          SELECT DISTINCT ON (f.data) f.data, f.pmr, f.pmp, f.folga
            FROM financeiro.geral_prazo_foto f
           ORDER BY f.data, f.capturado_em DESC, f.id DESC
        ) s
    ), '[]'::json),
    'historico_desde', (SELECT min(f.data) FROM financeiro.geral_prazo_foto f)
  ) INTO v_res;

  RETURN v_res;
END $$;

COMMENT ON FUNCTION public.get_geral_custos_financeiros(integer) IS
  'Geral v6.4.0: custos financeiros do ano (bloco FIN da DRE de caixa, realizado) por grupo curado e categoria, com receita bruta (ENT_H+PAG_H+RV) e ano anterior YTD. fin ≡ bloco FIN de get_dre_mensal nos meses realizados.';
COMMENT ON FUNCTION public.get_geral_prejuizos(integer) IS
  'Geral v6.4.0: prejuízo, reversão de perdas e líquido por mês (categorias de geral_perda_map ⨝ dre_categoria_map NOT excluida, realizado) + bandeja de categorias preju/perda não curadas.';
COMMENT ON FUNCTION public.get_geral_recebiveis() IS
  'Geral v6.4.0: posição de recebíveis na carga vigente de raw.contas_receber (inadimplente = marcação Conferido=Inadimplente), faixas, concentração, recuperado e evolução pelas fotos. Sem base: carga null e zeros.';
COMMENT ON FUNCTION public.get_geral_antecipacoes(integer) IS
  'Geral v6.4.0: antecipações registradas no Janus (financeiro.antecipacao) por mês, total, por conta, dias desde a última e maior intervalo do ano.';
COMMENT ON FUNCTION public.get_geral_prazos() IS
  'Geral v6.4.0: prazos médios (PMR, PMP, folga) atuais pelo núcleo geral_prazo_calcular + série das fotos (última de cada dia).';

-- (6) REVOKE/GRANT das 5 RPCs. `anon` nunca; `ingestor` nunca.
REVOKE EXECUTE ON FUNCTION public.get_geral_custos_financeiros(integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_geral_prejuizos(integer)          FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_geral_recebiveis()                FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_geral_antecipacoes(integer)       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_geral_prazos()                    FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_geral_custos_financeiros(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_geral_prejuizos(integer)          TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_geral_recebiveis()                TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_geral_antecipacoes(integer)       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_geral_prazos()                    TO authenticated, service_role;

-- Credencial de máquina de VERIFICAÇÃO (somente leitura): por assinatura completa (molde 0273/0292).
GRANT EXECUTE ON FUNCTION public.get_geral_custos_financeiros(p_ano integer) TO verificador;
GRANT EXECUTE ON FUNCTION public.get_geral_prejuizos(p_ano integer)          TO verificador;
GRANT EXECUTE ON FUNCTION public.get_geral_recebiveis()                      TO verificador;
GRANT EXECUTE ON FUNCTION public.get_geral_antecipacoes(p_ano integer)       TO verificador;
GRANT EXECUTE ON FUNCTION public.get_geral_prazos()                          TO verificador;

-- (7) Guard de EFETIVIDADE: a transação inteira aborta se a intenção não se cumpriu — áreas ausentes ou
-- divergentes, concessão com nome de role digitado errado, função ausente/sobrecarregada, sem a área no
-- corpo, sem SECURITY DEFINER/search_path vazio, grants errados, foto inicial ausente.
DO $$
DECLARE
  v_sig  text;
  v_proc regprocedure;
  v_n    int;
  v_tab  text;
BEGIN
  -- Tabelas novas (curadas + foto de prazos): existem, RLS ligado, ZERO policy, sem privilégio de
  -- anon/authenticated (mesma forma do guard da 0295). A sequence da foto idem.
  FOREACH v_tab IN ARRAY ARRAY[
    'financeiro.geral_fin_grupo',
    'financeiro.geral_perda_map',
    'financeiro.geral_prazo_foto'
  ] LOOP
    IF to_regclass(v_tab) IS NULL THEN
      RAISE EXCEPTION '0297: tabela % não encontrada', v_tab;
    END IF;
    IF NOT (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = to_regclass(v_tab)) THEN
      RAISE EXCEPTION '0297: RLS desligado em %', v_tab;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname || '.' || tablename = v_tab) THEN
      RAISE EXCEPTION '0297: % tem policy (deveria ser deny-by-default, sem policy)', v_tab;
    END IF;
    IF has_table_privilege('anon', v_tab, 'SELECT,INSERT,UPDATE,DELETE')
       OR has_table_privilege('authenticated', v_tab, 'SELECT,INSERT,UPDATE,DELETE') THEN
      RAISE EXCEPTION '0297: anon/authenticated ainda tem privilégio de tabela em %', v_tab;
    END IF;
  END LOOP;

  IF to_regclass('financeiro.geral_prazo_foto_id_seq') IS NULL THEN
    RAISE EXCEPTION '0297: sequence financeiro.geral_prazo_foto_id_seq não encontrada';
  END IF;
  IF has_sequence_privilege('anon', 'financeiro.geral_prazo_foto_id_seq', 'USAGE,SELECT,UPDATE')
     OR has_sequence_privilege('authenticated', 'financeiro.geral_prazo_foto_id_seq', 'USAGE,SELECT,UPDATE') THEN
    RAISE EXCEPTION '0297: anon/authenticated ainda tem privilégio na sequence geral_prazo_foto_id_seq';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM app.rbac_areas
                  WHERE area = 'financeiro/geral' AND rotulo = 'Geral' AND grupo = 'Financeiro' AND ordem = 36) THEN
    RAISE EXCEPTION '0297: área financeiro/geral ausente ou divergente em app.rbac_areas';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM app.rbac_areas
                  WHERE area = 'financeiro/geral/gestao' AND rotulo = 'Geral (gestão)' AND grupo = 'Financeiro' AND ordem = 37) THEN
    RAISE EXCEPTION '0297: área financeiro/geral/gestao ausente ou divergente em app.rbac_areas';
  END IF;

  -- financeiro/geral: exatamente as 4 roles nomeadas.
  SELECT count(DISTINCT r.nome) INTO v_n
    FROM app.rbac_role_permissoes rp
    JOIN app.rbac_roles r ON r.id = rp.role_id
   WHERE rp.area = 'financeiro/geral'
     AND r.nome IN ('Diretoria', 'Financeiro', 'Administrador', 'Máquina · verificação');
  IF v_n <> 4 THEN
    RAISE EXCEPTION '0297: % das 4 roles (Diretoria, Financeiro, Administrador, Máquina · verificação) têm financeiro/geral', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM app.rbac_role_permissoes WHERE area = 'financeiro/geral';
  IF v_n <> 4 THEN
    RAISE EXCEPTION '0297: % roles têm financeiro/geral (esperado exatamente 4)', v_n;
  END IF;

  -- financeiro/geral/gestao: exatamente as 3 roles nomeadas.
  SELECT count(DISTINCT r.nome) INTO v_n
    FROM app.rbac_role_permissoes rp
    JOIN app.rbac_roles r ON r.id = rp.role_id
   WHERE rp.area = 'financeiro/geral/gestao'
     AND r.nome IN ('Financeiro', 'Administrador', 'Máquina · verificação');
  IF v_n <> 3 THEN
    RAISE EXCEPTION '0297: % das 3 roles (Financeiro, Administrador, Máquina · verificação) têm financeiro/geral/gestao', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM app.rbac_role_permissoes WHERE area = 'financeiro/geral/gestao';
  IF v_n <> 3 THEN
    RAISE EXCEPTION '0297: % roles têm financeiro/geral/gestao (esperado exatamente 3)', v_n;
  END IF;

  -- As 5 RPCs de leitura.
  FOREACH v_sig IN ARRAY ARRAY[
    'public.get_geral_custos_financeiros(integer)',
    'public.get_geral_prejuizos(integer)',
    'public.get_geral_recebiveis()',
    'public.get_geral_antecipacoes(integer)',
    'public.get_geral_prazos()'
  ] LOOP
    v_proc := to_regprocedure(v_sig);
    IF v_proc IS NULL THEN
      RAISE EXCEPTION '0297: função % não encontrada', v_sig;
    END IF;
    -- As aspas discriminam 'financeiro/geral' de 'financeiro/geral/gestao'.
    IF position('''financeiro/geral''' IN (SELECT prosrc FROM pg_proc WHERE oid = v_proc)) = 0 THEN
      RAISE EXCEPTION '0297: corpo de % não exige financeiro/geral', v_sig;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = v_proc AND prosecdef
                      AND proconfig @> ARRAY['search_path=""']) THEN
      RAISE EXCEPTION '0297: % sem SECURITY DEFINER ou sem search_path vazio', v_sig;
    END IF;
    IF has_function_privilege('anon', v_proc, 'EXECUTE') THEN
      RAISE EXCEPTION '0297: anon ainda tem EXECUTE em %', v_sig;
    END IF;
    IF NOT has_function_privilege('authenticated', v_proc, 'EXECUTE') THEN
      RAISE EXCEPTION '0297: authenticated sem EXECUTE em %', v_sig;
    END IF;
    IF NOT has_function_privilege('service_role', v_proc, 'EXECUTE') THEN
      RAISE EXCEPTION '0297: service_role sem EXECUTE em %', v_sig;
    END IF;
    IF NOT has_function_privilege('verificador', v_proc, 'EXECUTE') THEN
      RAISE EXCEPTION '0297: verificador sem EXECUTE em %', v_sig;
    END IF;
    IF has_function_privilege('ingestor', v_proc, 'EXECUTE') THEN
      RAISE EXCEPTION '0297: ingestor não deveria ter EXECUTE em %', v_sig;
    END IF;
  END LOOP;

  -- Funções de apoio: SÓ service_role (nem authenticated, nem anon, nem verificador).
  FOREACH v_sig IN ARRAY ARRAY[
    'public.registrar_foto_prazos(uuid)',
    'financeiro.geral_prazo_calcular()'
  ] LOOP
    v_proc := to_regprocedure(v_sig);
    IF v_proc IS NULL THEN
      RAISE EXCEPTION '0297: função % não encontrada', v_sig;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = v_proc AND prosecdef
                      AND proconfig @> ARRAY['search_path=""']) THEN
      RAISE EXCEPTION '0297: % sem SECURITY DEFINER ou sem search_path vazio', v_sig;
    END IF;
    IF NOT has_function_privilege('service_role', v_proc, 'EXECUTE') THEN
      RAISE EXCEPTION '0297: service_role sem EXECUTE em %', v_sig;
    END IF;
    IF has_function_privilege('anon', v_proc, 'EXECUTE')
       OR has_function_privilege('authenticated', v_proc, 'EXECUTE')
       OR has_function_privilege('verificador', v_proc, 'EXECUTE') THEN
      RAISE EXCEPTION '0297: % deveria ser service-only (anon/authenticated/verificador com EXECUTE)', v_sig;
    END IF;
  END LOOP;

  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname LIKE 'get\_geral\_%';
  IF v_n <> 5 THEN
    RAISE EXCEPTION '0297: % funções get_geral_* (esperado 5; sobrecarga criada por engano?)', v_n;
  END IF;

  -- A foto inicial entrou (quando há títulos em aberto carregados).
  IF EXISTS (SELECT 1 FROM raw.titulos_em_aberto) THEN
    SELECT count(*) INTO v_n FROM financeiro.geral_prazo_foto;
    IF v_n <> 1 THEN
      RAISE EXCEPTION '0297: geral_prazo_foto com % linhas após a foto inicial (esperado 1)', v_n;
    END IF;
  END IF;
END
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
