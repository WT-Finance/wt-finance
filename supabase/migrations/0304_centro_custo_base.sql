-- ---------------------------------------------------------------------------
-- 0304 — feat(v6.5.1/M2): base de ingestão `lancamentos-centro-custo` (Lançamentos por Centro de
--        Custo, Monde) + dimensão de centros + tabela de RATEIO regenerada na promoção
--
-- Classificação: ADITIVA (CREATE TABLE/INDEX novos + seed da dimensão nova (INSERT em tabela nova) +
-- 4 funções NOVAS + 3 CREATE OR REPLACE que só ACRESCENTAM a base + REVOKE/GRANT + guard).
--
-- DECLARAÇÃO PRÉVIA (regime aditivo / autônomo):
--   • O QUE FAZ (contrato: docs/specs/v6-5-1-m2-base-centro-custo.md; regras: briefing v6.5.1 §3.1–3.2):
--     (1) `financeiro.centro_custo` — dimensão FECHADA dos centros (trips/weddings/corp/csc/sem_centro),
--         com o nome exato do Monde (`WG - Trips` …) e a ordem. "Sem centro" não tem nome no Monde.
--         Centro novo no Monde ⇒ a carga REPROVA nomeando-o (cadastrar por migration aditiva) — nunca
--         cai, calado, em Sem centro.
--     (2) `raw.lancamentos_centro_custo` — a base viva, só a LISTA FECHADA (decisão D6): Número,
--         Emissão, Vencimento, Movimentação, Centro de Custo, % Centro Custo, Valor Movimentação,
--         Valor Centro Custo. `Pessoa`, `Descrição` e `Valor Lançamento` NUNCA entram. O arquivo traz
--         `Valor Centro Custo` SEM sinal; aqui ele é gravado COM o sinal de `Valor Movimentação` (o
--         parser deriva) — é a grandeza do checksum do outline e do rateio. + staging UNLOGGED (molde 0295).
--     (3) `financeiro.centro_custo_rateio (numero, centro, peso)` — regenerada INTEIRA dentro da
--         promoção, na mesma transação do swap da raw. Regras (§3.2): o % é do lançamento (a validação
--         prova que não varia entre movimentações do mesmo Número); peso = % ÷ Σ % dos centros do Número;
--         Σ % = 0 (lançamento de valor líquido zero, % vazio) ⇒ partes iguais; "Sem centro" com valor
--         zero num Número que tem outro centro é sobra de arredondamento e sai; peso zero não entra; o
--         ÚLTIMO centro (pela ordem da dimensão) recebe 1 − Σ dos outros ⇒ Σ pesos = 1 EXATO. Guarda:
--         Número sem rateio ou com Σ ≠ 1 ⇒ RAISE RATEIO_NAO_FECHA (base anterior intacta).
--     (4) 4 RPCs NOVAS de carga (molde 0295): `limpar_staging_centro_custo()`,
--         `inserir_lote_staging_centro_custo(jsonb)`, `validar_carga_centro_custo()` e
--         `promover_carga_centro_custo(jsonb, uuid)`. Advisory lock 4017070 (chave nova; 4017001..4017060
--         em uso — 0278/0295).
--     (5) `CREATE OR REPLACE` de `ingestao_carga_abrir`, `ingestao_carga_ultima` e `ingestao_soma_por_ano`,
--         a partir do CATÁLOGO VIVO de 06/11/2026 (skill banco-e-rpc §5): só acrescentam
--         'lancamentos-centro-custo' por ÚLTIMO nas listas e, em `ingestao_soma_por_ano`, um ramo próprio
--         (ano da MOVIMENTAÇÃO, Σ valor_centro_custo) antes do `ELSE RAISE BASE_SEM_SOMA`.
--   • ADITIVA / RETROCOMPATÍVEL: nenhuma assinatura existente muda; as 3 funções reescritas só ganham um
--     valor aceito (as 6 bases vivas respondem exatamente como antes). NÃO ESCREVE em dado pré-existente:
--     o único INSERT de nível de migration é o seed da dimensão NOVA; não há DROP, TRUNCATE, ALTER TABLE
--     de tabela existente, UPDATE nem DELETE no nível da migration (TRUNCATE só DENTRO das RPCs de carga).
--   • ⚠️ DEPENDÊNCIA DE UM PATCH DESTRUTIVO (aplicação HUMANA, TTY — decisão D2): os CHECKs
--     `ingestao_carga_base_valida` e `ingestao_promocao_base_valida` listam 6 bases. Ampliá-los exige
--     DROP CONSTRAINT — `supabase/patches/centro_custo_checks_ingestao.sql`. Até ele, abrir carga da base
--     nova falha no CHECK de ingestao.carga: fail-closed, nada é gravado, as outras bases seguem iguais.
--     `api_chave_escopo_bases_validas` e `ingestao_expectativa_alvo_valido` NÃO mudam (sem RPA nem vigia
--     para esta base — fronteira §11 do briefing).
--   • RBAC (por desenho): as 4 RPCs de carga NÃO chamam `app.exigir_acesso` — são RPC de CARGA, sem sessão
--     de usuário, chamadas pela rota `/api/ingestao/{base}` e protegidas só por GRANT (classe de
--     promover_carga_contas_receber, 0295): REVOKE de PUBLIC/anon/authenticated e GRANT a `service_role` e
--     `ingestor`. As 3 reescritas seguem service_role-only. As tabelas novas não têm GRANT a ninguém além do
--     que a 0295 deu à raw irmã (service_role); a leitura da DRE por centro (M3) será por RPC SECURITY DEFINER.
--     PII: a lista fechada deixa de fora todos os campos com nome de pessoa; nenhuma mensagem de erro das
--     RPCs reproduz conteúdo de linha além de Número e nome de centro.
--   • CONTRATO DO `p_linhas` de `inserir_lote_staging_centro_custo` — array jsonb de objetos:
--       arquivo_origem (text, obrigatório) · linha_origem (int) · numero (text, obrigatório) ·
--       emissao · vencimento · movimentacao (date ISO | null) · centro_custo (text | null; null = sem
--       centro) · pct_centro (number | null, escala 0–100) · valor_movimentacao (obrigatório) ·
--       valor_centro_custo (obrigatório, COM sinal)
--     Texto vazio vira NULL. Campo obrigatório ausente/vazio ⇒ 22023 LOTE_LINHA_INVALIDA (posição + campo,
--     nunca o conteúdo). Valores arredondados a 2 casas na chegada: o parser emite toCentavos(v)/100.
--   • CONTRATO DO CHECKSUM de `promover_carga_centro_custo(p_checksums, p_carga_id)` — array jsonb, UM objeto
--     por OUTLINE de centro do arquivo, TODOS obrigatórios:
--       { "escopo": "centro", "chave": { "centro_custo": text | null }, "linhas": int, "centavos": bigint }
--     `centavos` = Σ valor_centro_custo COM sinal, como gravado. Tolerância ZERO contra o GRAVADO
--     (`centro_custo IS NOT DISTINCT FROM`). Vazio ⇒ CHECKSUM_AUSENTE; formato errado ⇒ CHECKSUM_INVALIDO;
--     centro gravado sem checksum ⇒ CHECKSUM_AUSENTE; divergência ⇒ CHECKSUM_FALHOU. Um outline recolhido
--     ("+", n > 0, sem detalhe) declara n linhas que não chegam: CHECKSUM_FALHOU aqui mesmo que o parser não
--     o tivesse rejeitado antes (o parser rejeita o "+" explicitamente — briefing §3.1).
--   • Replay idempotente por `ingestao.promocao`: mesma (base, carga_id) devolve o resultado guardado, sem
--     regravar a base nem o rateio.
--   • ESTADO ANTES (para o revisor): banco na 0303; 'lancamentos-centro-custo' ainda não está em
--     `BASES_INGESTAO` (src/lib/ingestao/bases.ts) nem em `rpcs-ingestor.ts` — entram no mesmo commit.
--
-- Pós-aplicação (orquestrador): `npm run db:baseline`; regenerar `src/types/database.ts`; rodar
-- `scripts/credencial/derivar-allowlist.mjs ingestor` e conferir as 29 assinaturas; verificar por REST com
-- service_role (db query NÃO executa o corpo — skill banco-e-rpc §6).
--
-- DOWN (destrutivo — humano em TTY; nada aqui se aplica sozinho):
--   -- 1) as 3 funções reescritas: reaplicar o corpo do CATÁLOGO VIVO anterior a esta migration (0295 —
--   --    lista de 6 bases, sem o ramo de centro de custo em soma_por_ano). NÃO apagar: o app as chama.
--   -- 2) DROP FUNCTION public.promover_carga_centro_custo(jsonb, uuid);
--   --    DROP FUNCTION public.validar_carga_centro_custo();
--   --    DROP FUNCTION public.inserir_lote_staging_centro_custo(jsonb);
--   --    DROP FUNCTION public.limpar_staging_centro_custo();
--   -- 3) DROP TABLE financeiro.centro_custo_rateio; DROP TABLE raw.lancamentos_centro_custo_staging;
--   --    DROP TABLE raw.lancamentos_centro_custo; DROP TABLE financeiro.centro_custo;
--   -- 4) o patch dos CHECKs tem DOWN próprio e só volta às 6 bases se não houver carga da base nova.
-- ---------------------------------------------------------------------------

BEGIN;

-- ── 1. financeiro.centro_custo — dimensão fechada ───────────────────────────────────────
CREATE TABLE financeiro.centro_custo (
  id          TEXT     PRIMARY KEY,
  nome_monde  TEXT     UNIQUE,              -- nome EXATO no Monde, aparado; NULL só para Sem centro
  rotulo      TEXT     NOT NULL,
  ordem       SMALLINT NOT NULL UNIQUE,
  -- Só "Sem centro" não tem nome no Monde, e ele não pode ter (binário: nunca NULL no resultado).
  CONSTRAINT centro_custo_sem_nome_so_sem_centro CHECK ((id = 'sem_centro') = (nome_monde IS NULL))
);

INSERT INTO financeiro.centro_custo (id, nome_monde, rotulo, ordem) VALUES
  ('trips',      'WG - Trips',    'Trips',      1),
  ('weddings',   'WG - Weddings', 'Weddings',   2),
  ('corp',       'WG - Corp',     'Corp',       3),
  ('csc',        'WG - CSC',      'CSC',        4),
  ('sem_centro', NULL,            'Sem centro', 5);

COMMENT ON TABLE financeiro.centro_custo IS
  'v6.5.1 (0304): os centros de custo da DRE de caixa por centro, com o nome exato do Monde. Fechada: centro novo no Monde faz a carga de Lançamentos por Centro de Custo reprovar até ser cadastrado aqui (migration aditiva). A ordem decide quem recebe o resto do rateio (Σ pesos = 1 exato).';

ALTER TABLE financeiro.centro_custo ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON financeiro.centro_custo FROM PUBLIC, anon, authenticated;

-- ── 2. raw.lancamentos_centro_custo — a base viva ───────────────────────────────────────
CREATE TABLE raw.lancamentos_centro_custo (
  id                  BIGSERIAL     PRIMARY KEY,
  arquivo_origem      TEXT          NOT NULL,
  linha_origem        INT,                        -- linha do arquivo, 1-based com cabeçalho
  numero              TEXT          NOT NULL,     -- TEXTO: pode ter sufixo "-N" (chave da junção, M0/Q1)
  emissao             DATE,
  vencimento          DATE,
  movimentacao        DATE,
  centro_custo        TEXT,                       -- nome do Monde, aparado; NULL = sem centro
  pct_centro          NUMERIC(9,4),               -- escala 0–100; NULL = vazio no export
  valor_movimentacao  NUMERIC(18,2) NOT NULL,
  valor_centro_custo  NUMERIC(18,2) NOT NULL,     -- COM o sinal de valor_movimentacao
  carregado_em        TIMESTAMPTZ   NOT NULL DEFAULT now()
);

COMMENT ON TABLE raw.lancamentos_centro_custo IS
  'v6.5.1 (0304): Lançamentos por Centro de Custo do Monde (grão lançamento × movimentação × centro), só a lista fechada de colunas (D6 — sem Pessoa, Descrição nem Valor Lançamento). valor_centro_custo vem com o SINAL de valor_movimentacao (o export o traz sem sinal). Substituída por inteiro a cada carga; o rateio (financeiro.centro_custo_rateio) é regenerado na mesma transação.';

CREATE INDEX lancamentos_centro_custo_numero_idx ON raw.lancamentos_centro_custo (numero);

ALTER TABLE raw.lancamentos_centro_custo ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON raw.lancamentos_centro_custo FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON raw.lancamentos_centro_custo TO service_role;
GRANT USAGE, SELECT ON SEQUENCE raw.lancamentos_centro_custo_id_seq TO service_role;

CREATE UNLOGGED TABLE raw.lancamentos_centro_custo_staging
  (LIKE raw.lancamentos_centro_custo INCLUDING DEFAULTS);

ALTER TABLE raw.lancamentos_centro_custo_staging ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON raw.lancamentos_centro_custo_staging FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE raw.lancamentos_centro_custo_staging IS
  'v6.5.1 (0304): staging UNLOGGED de raw.lancamentos_centro_custo. Não sobrevive a crash no meio de uma carga multi-lote: o sintoma é "Nenhuma linha válida na carga"; a base viva fica intacta e a ação é refazer o upload.';

-- ── 3. financeiro.centro_custo_rateio — regenerada na promoção ──────────────────────────
CREATE TABLE financeiro.centro_custo_rateio (
  numero  TEXT    NOT NULL,
  centro  TEXT    NOT NULL REFERENCES financeiro.centro_custo (id),
  peso    NUMERIC NOT NULL,
  PRIMARY KEY (numero, centro),
  CONSTRAINT centro_custo_rateio_peso_faixa CHECK (peso > 0 AND peso <= 1)
);

COMMENT ON TABLE financeiro.centro_custo_rateio IS
  'v6.5.1 (0304): peso de cada centro em cada lançamento (Número), regenerado inteiro por promover_carga_centro_custo. Σ peso por Número = 1 exato. Lançamento da base de movimentação sem linha aqui = Sem centro (cobertura, M3).';

ALTER TABLE financeiro.centro_custo_rateio ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON financeiro.centro_custo_rateio FROM PUBLIC, anon, authenticated;

-- ── 4. As 4 RPCs de carga ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.limpar_staging_centro_custo()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(4017070); -- chave própria da base Lançamentos por Centro de Custo
  TRUNCATE raw.lancamentos_centro_custo_staging RESTART IDENTITY;
END;
$$;

CREATE OR REPLACE FUNCTION public.inserir_lote_staging_centro_custo(p_linhas jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_idx   bigint;
  v_campo text;
BEGIN
  IF p_linhas IS NULL OR jsonb_typeof(p_linhas) <> 'array' THEN
    RAISE EXCEPTION 'LOTE_INVALIDO: p_linhas deve ser um array jsonb' USING ERRCODE = '22023';
  END IF;

  -- Obrigatórios ausentes/vazios: nomeia só a posição no lote e o campo (o DETAIL do 23502 citaria a
  -- linha inteira — skill banco-e-rpc §5).
  SELECT t.ord, c.campo INTO v_idx, v_campo
    FROM jsonb_array_elements(p_linhas) WITH ORDINALITY AS t(x, ord)
   CROSS JOIN (VALUES (1, 'arquivo_origem'), (2, 'numero'), (3, 'valor_movimentacao'),
                      (4, 'valor_centro_custo')) AS c(n, campo)
   WHERE coalesce(btrim(t.x->>c.campo), '') = ''
   ORDER BY t.ord, c.n
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'LOTE_LINHA_INVALIDA: a linha na posição % do lote (base 1) está sem o campo obrigatório "%" (ausente ou vazio)',
      v_idx, v_campo USING ERRCODE = '22023';
  END IF;

  INSERT INTO raw.lancamentos_centro_custo_staging (
    arquivo_origem, linha_origem, numero, emissao, vencimento, movimentacao,
    centro_custo, pct_centro, valor_movimentacao, valor_centro_custo
  )
  SELECT
    -- btrim: o Número é a chave TEXTUAL da junção com a base de movimentação (M3) — espaço nas pontas
    -- quebraria a junção em silêncio. O parser já apara; isto é defesa em profundidade (revisor-db B-3).
    btrim(x->>'arquivo_origem'),
    (NULLIF(x->>'linha_origem', ''))::int,
    NULLIF(btrim(x->>'numero'), ''),
    (NULLIF(x->>'emissao', ''))::date,
    (NULLIF(x->>'vencimento', ''))::date,
    (NULLIF(x->>'movimentacao', ''))::date,
    NULLIF(btrim(x->>'centro_custo'), ''),
    (NULLIF(x->>'pct_centro', ''))::numeric(9,4),
    (x->>'valor_movimentacao')::numeric(18,2),
    (x->>'valor_centro_custo')::numeric(18,2)
  FROM jsonb_array_elements(p_linhas) AS x;
END;
$$;

CREATE OR REPLACE FUNCTION public.validar_carga_centro_custo()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_total      int;
  v_erros      text[] := '{}';
  v_desc_n     int;
  v_desc       text;
  v_var_n      int;
  v_var_ex     text;
  v_neg        int;
BEGIN
  SELECT count(*) INTO v_total FROM raw.lancamentos_centro_custo_staging;
  IF v_total = 0 THEN
    RETURN jsonb_build_object(
      'ok', false, 'total', 0,
      'erros', jsonb_build_array('Nenhuma linha válida na carga — arquivo vazio ou inválido.')
    );
  END IF;

  -- Centro que a dimensão não conhece: nunca cai, calado, em Sem centro. Nome de centro não é dado
  -- pessoal — vai na mensagem.
  SELECT count(*), left(string_agg(DISTINCT '"' || s.centro_custo || '"', ', '), 300)
    INTO v_desc_n, v_desc
    FROM raw.lancamentos_centro_custo_staging s
   WHERE s.centro_custo IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM financeiro.centro_custo c WHERE c.nome_monde = s.centro_custo);
  IF v_desc_n > 0 THEN
    v_erros := v_erros || format(
      '%s linha(s) com centro de custo não cadastrado na plataforma: %s. Cadastre o centro (financeiro.centro_custo) antes de carregar.',
      v_desc_n, v_desc);
  END IF;

  -- O % é do LANÇAMENTO (briefing §3.2: 0 de 16.882 pares variavam). Se variar entre movimentações do
  -- mesmo (Número, centro), o rateio por Número perde o sentido: reprova nomeando os Números.
  WITH v AS (
    SELECT numero
      FROM raw.lancamentos_centro_custo_staging
     GROUP BY numero, centro_custo
    HAVING count(DISTINCT coalesce(pct_centro, -1)) > 1
  )
  SELECT (SELECT count(DISTINCT numero) FROM v),
         (SELECT string_agg(numero, ', ' ORDER BY numero) FROM (SELECT DISTINCT numero FROM v ORDER BY numero LIMIT 5) e)
    INTO v_var_n, v_var_ex;
  IF v_var_n > 0 THEN
    v_erros := v_erros || format(
      '%s lançamento(s) com %% de centro de custo diferente entre as movimentações do mesmo centro (ex.: %s). O rateio é por lançamento — confira o lançamento no Monde.',
      v_var_n, v_var_ex);
  END IF;

  SELECT count(*) INTO v_neg FROM raw.lancamentos_centro_custo_staging WHERE pct_centro < 0;
  IF v_neg > 0 THEN
    v_erros := v_erros || format('%s linha(s) com %% de centro de custo negativo.', v_neg);
  END IF;

  RETURN jsonb_build_object(
    'ok', cardinality(v_erros) = 0,
    'total', v_total,
    'erros', to_jsonb(v_erros)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.promover_carga_centro_custo(p_checksums jsonb, p_carga_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existente      jsonb;
  v_total_stg      int;
  v_valid          jsonb;
  v_chk            jsonb;
  v_centro         text;
  v_linhas_sql     int;
  v_centavos_sql   bigint;
  v_conferidos     int := 0;
  v_falhas         jsonb := '[]'::jsonb;
  v_sem_chk        text;
  v_rateio_falho   int;
  v_numeros        int;
  v_multicentro    int;
  v_partes_iguais  int;
  v_por_centro     jsonb;
  v_sem_centro     int;
  v_valor_fora     int;
  v_avisos         text[] := '{}';
  v_result         jsonb;
BEGIN
  IF p_carga_id IS NULL THEN
    RAISE EXCEPTION 'CARGA_ID_OBRIGATORIO: promover_carga_centro_custo exige carga_id' USING ERRCODE = '22023';
  END IF;
  IF p_checksums IS NULL OR jsonb_typeof(p_checksums) <> 'array' THEN
    RAISE EXCEPTION 'CHECKSUMS_OBRIGATORIOS: promover_carga_centro_custo exige p_checksums (array jsonb)' USING ERRCODE = '22023';
  END IF;
  -- Array VAZIO não passa: sem isto o loop roda zero vezes e a base inteira troca sem conferência.
  IF jsonb_array_length(p_checksums) = 0 THEN
    RAISE EXCEPTION 'CHECKSUM_AUSENTE: esta base é conferida pelo outline de cada centro e a carga não trouxe nenhum checksum (contrato ingestao-v1 §4)'
      USING ERRCODE = '22023';
  END IF;

  SET LOCAL lock_timeout = '10s';
  PERFORM pg_advisory_xact_lock(4017070);

  -- Replay: a MESMA carga repetida devolve o resultado guardado, sem regravar base nem rateio.
  SELECT resultado INTO v_existente FROM ingestao.promocao
   WHERE base = 'lancamentos-centro-custo' AND carga_id = p_carga_id;
  IF FOUND THEN
    RETURN v_existente;
  END IF;

  SELECT count(*) INTO v_total_stg FROM raw.lancamentos_centro_custo_staging;
  IF v_total_stg = 0 THEN
    RAISE EXCEPTION 'Carga abortada: staging vazia — nada a promover.';
  END IF;

  -- Rede: quem promover sem validar não troca a base com centro desconhecido ou % variando.
  v_valid := public.validar_carga_centro_custo();
  IF NOT coalesce((v_valid->>'ok')::boolean, false) THEN
    RAISE EXCEPTION 'VALIDACAO_REPROVADA: %', left((v_valid->'erros')::text, 1500)
      USING ERRCODE = '22023';
  END IF;

  TRUNCATE raw.lancamentos_centro_custo RESTART IDENTITY;
  INSERT INTO raw.lancamentos_centro_custo (
    arquivo_origem, linha_origem, numero, emissao, vencimento, movimentacao,
    centro_custo, pct_centro, valor_movimentacao, valor_centro_custo
  )
  SELECT
    arquivo_origem, linha_origem, numero, emissao, vencimento, movimentacao,
    centro_custo, pct_centro, valor_movimentacao, valor_centro_custo
  FROM raw.lancamentos_centro_custo_staging;

  -- ── Conferência POR CENTRO (o outline do arquivo) contra o GRAVADO ───────────────────────
  FOR v_chk IN SELECT * FROM jsonb_array_elements(p_checksums)
  LOOP
    IF coalesce(v_chk->>'escopo', '') <> 'centro'
       OR jsonb_typeof(v_chk->'chave') IS DISTINCT FROM 'object'
       OR NOT (v_chk->'chave' ? 'centro_custo') THEN
      RAISE EXCEPTION 'CHECKSUM_INVALIDO: esta base só aceita checksum de escopo "centro" com chave.centro_custo (escopo %)',
        v_chk->>'escopo' USING ERRCODE = '22023';
    END IF;
    IF v_chk->>'centavos' IS NULL OR v_chk->>'linhas' IS NULL THEN
      RAISE EXCEPTION 'CHECKSUM_INVALIDO: checksum de centro sem "linhas" ou "centavos"' USING ERRCODE = '22023';
    END IF;
    -- JSON null e texto vazio = sem centro (o gravado é NULL).
    v_centro := NULLIF(btrim(v_chk->'chave'->>'centro_custo'), '');

    SELECT count(*), coalesce(round(sum(r.valor_centro_custo) * 100), 0)::bigint
      INTO v_linhas_sql, v_centavos_sql
      FROM raw.lancamentos_centro_custo r
     WHERE r.centro_custo IS NOT DISTINCT FROM v_centro;

    v_conferidos := v_conferidos + 1;

    IF v_centavos_sql <> (v_chk->>'centavos')::bigint
       OR v_linhas_sql <> (v_chk->>'linhas')::int THEN
      v_falhas := v_falhas || jsonb_build_object(
        'escopo', 'centro', 'chave', v_chk->'chave',
        'centavos_esperado', (v_chk->>'centavos')::bigint, 'centavos_gravado', v_centavos_sql,
        'linhas_esperadas', (v_chk->>'linhas')::int, 'linhas_gravadas', v_linhas_sql
      );
    END IF;
  END LOOP;

  IF jsonb_array_length(v_falhas) > 0 THEN
    RAISE EXCEPTION 'CHECKSUM_FALHOU: % de % conferência(s) não fecharam contra o gravado: %',
      jsonb_array_length(v_falhas), v_conferidos, left(v_falhas::text, 2000)
      USING ERRCODE = '22023';
  END IF;

  -- Cobertura: todo centro GRAVADO teve o seu checksum (sem isto, um grupo a mais no arquivo passaria
  -- sem conferência). Poucos centros: o NOT EXISTS roda uma vez por centro.
  SELECT string_agg(coalesce(a.centro_custo, '(sem centro)'), ', ' ORDER BY a.centro_custo)
    INTO v_sem_chk
    FROM (SELECT DISTINCT r.centro_custo FROM raw.lancamentos_centro_custo r) a
   WHERE NOT EXISTS (
     SELECT 1 FROM jsonb_array_elements(p_checksums) c
      WHERE NULLIF(btrim(c->'chave'->>'centro_custo'), '') IS NOT DISTINCT FROM a.centro_custo
   );
  IF v_sem_chk IS NOT NULL THEN
    RAISE EXCEPTION 'CHECKSUM_AUSENTE: centro(s) gravado(s) sem checksum conferido: %', left(v_sem_chk, 500)
      USING ERRCODE = '22023';
  END IF;

  -- ── Rateio, na MESMA transação (briefing §3.2) ───────────────────────────────────────────
  TRUNCATE financeiro.centro_custo_rateio;
  INSERT INTO financeiro.centro_custo_rateio (numero, centro, peso)
  WITH linhas AS (
    -- A validação já reprovou centro desconhecido: aqui todo nome casa, e NULL é Sem centro.
    SELECT r.numero, coalesce(c.id, 'sem_centro') AS centro, r.pct_centro, r.valor_centro_custo
      FROM raw.lancamentos_centro_custo r
      LEFT JOIN financeiro.centro_custo c ON c.nome_monde = r.centro_custo
  ), por_centro AS (
    -- O % é do lançamento (constante entre as movimentações — validado): um registro por centro.
    SELECT numero, centro, max(pct_centro) AS pct, bool_or(valor_centro_custo <> 0) AS tem_valor
      FROM linhas
     GROUP BY numero, centro
  ), participantes AS (
    -- Sem centro com valor zero num Número que tem outro centro = sobra de arredondamento: sai.
    SELECT p.*
      FROM por_centro p
     WHERE NOT (p.centro = 'sem_centro' AND NOT p.tem_valor
                AND EXISTS (SELECT 1 FROM por_centro o WHERE o.numero = p.numero AND o.centro <> 'sem_centro'))
  ), bruto AS (
    -- Σ % = 0 (valor líquido zero, % vazio) ⇒ partes iguais. O peso NUNCA vem do Valor Centro Custo.
    SELECT numero, centro,
           CASE WHEN sum(coalesce(pct, 0)) OVER w > 0
                THEN coalesce(pct, 0) / sum(coalesce(pct, 0)) OVER w
                ELSE 1::numeric / count(*) OVER w
           END AS peso
      FROM participantes
    WINDOW w AS (PARTITION BY numero)
  ), ordenados AS (
    SELECT b.numero, b.centro, b.peso,
           row_number() OVER (PARTITION BY b.numero ORDER BY d.ordem DESC) AS rn_desc,
           sum(b.peso) OVER (PARTITION BY b.numero) AS soma
      FROM bruto b
      JOIN financeiro.centro_custo d ON d.id = b.centro
     WHERE b.peso > 0
  )
  -- O último centro (pela ordem) fica com o resto: Σ pesos = 1 EXATO, sem resíduo de divisão.
  SELECT numero, centro, CASE WHEN rn_desc = 1 THEN 1 - (soma - peso) ELSE peso END
    FROM ordenados;

  -- Guarda: todo Número gravado tem rateio e ele fecha em 1.
  SELECT count(*) INTO v_rateio_falho
    FROM (SELECT DISTINCT numero FROM raw.lancamentos_centro_custo) n
    LEFT JOIN (SELECT numero, sum(peso) AS s FROM financeiro.centro_custo_rateio GROUP BY numero) r
      USING (numero)
   WHERE r.s IS DISTINCT FROM 1;
  IF v_rateio_falho > 0 THEN
    RAISE EXCEPTION 'RATEIO_NAO_FECHA: % lançamento(s) sem rateio ou com Σ pesos ≠ 1 — a base anterior foi preservada', v_rateio_falho
      USING ERRCODE = '22023';
  END IF;

  SELECT count(DISTINCT numero),
         count(*) FILTER (WHERE centro = 'sem_centro')
    INTO v_numeros, v_sem_centro
    FROM financeiro.centro_custo_rateio;
  SELECT count(*) INTO v_multicentro
    FROM (SELECT numero FROM financeiro.centro_custo_rateio GROUP BY numero HAVING count(*) > 1) m;
  SELECT count(*) INTO v_partes_iguais
    FROM (SELECT numero FROM raw.lancamentos_centro_custo GROUP BY numero
          HAVING coalesce(sum(pct_centro), 0) = 0) z;
  SELECT coalesce(jsonb_object_agg(centro, n), '{}'::jsonb) INTO v_por_centro
    FROM (SELECT centro, count(*) AS n FROM financeiro.centro_custo_rateio GROUP BY centro) s;

  -- Linha COM valor num centro que ficou de fora do rateio (o % dele é zero ou vazio enquanto outro
  -- centro do lançamento tem %): o valor dela é repartido entre os outros centros do lançamento. Pode
  -- ser legítimo (é o que o % do Monde diz), mas não passa calado (revisor-db B-1).
  SELECT count(DISTINCT l.numero) INTO v_valor_fora
    FROM raw.lancamentos_centro_custo l
    LEFT JOIN financeiro.centro_custo c ON c.nome_monde = l.centro_custo
   WHERE l.valor_centro_custo <> 0
     AND NOT EXISTS (SELECT 1 FROM financeiro.centro_custo_rateio r
                      WHERE r.numero = l.numero AND r.centro = coalesce(c.id, 'sem_centro'));
  IF v_valor_fora > 0 THEN
    v_avisos := v_avisos || format(
      '%s lançamento(s) com valor num centro de %% zero ou vazio — esse valor foi repartido entre os outros centros do lançamento, pelo %% do Monde.',
      v_valor_fora);
  END IF;

  IF v_sem_centro > 0 THEN
    v_avisos := v_avisos || format(
      '%s lançamento(s) sem centro de custo — aparecem como "Sem centro" na DRE por centro; corrija no lançamento, no Monde.',
      v_sem_centro);
  END IF;

  v_result := jsonb_build_object(
    'linhas', v_total_stg,
    'checksums_conferidos', v_conferidos,
    'checksums_nao_conferiveis', 0,
    'rateio', jsonb_build_object(
      'numeros', v_numeros,
      'multicentro', v_multicentro,
      'partes_iguais', v_partes_iguais,
      'por_centro', v_por_centro
    ),
    'avisos', to_jsonb(v_avisos)
  );

  INSERT INTO ingestao.promocao (base, carga_id, resultado)
  VALUES ('lancamentos-centro-custo', p_carga_id, v_result)
  ON CONFLICT (base, carga_id) DO NOTHING;

  TRUNCATE raw.lancamentos_centro_custo_staging RESTART IDENTITY;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.limpar_staging_centro_custo()                   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.inserir_lote_staging_centro_custo(jsonb)        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validar_carga_centro_custo()                    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.promover_carga_centro_custo(jsonb, uuid)        FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.limpar_staging_centro_custo()                    TO service_role, ingestor;
GRANT EXECUTE ON FUNCTION public.inserir_lote_staging_centro_custo(p_linhas jsonb) TO service_role, ingestor;
GRANT EXECUTE ON FUNCTION public.validar_carga_centro_custo()                     TO service_role, ingestor;
GRANT EXECUTE ON FUNCTION public.promover_carga_centro_custo(p_checksums jsonb, p_carga_id uuid) TO service_role, ingestor;

COMMENT ON FUNCTION public.limpar_staging_centro_custo() IS
  'v6.5.1 (0304): limpa raw.lancamentos_centro_custo_staging antes do primeiro lote. SEM exigir_acesso POR DESENHO: RPC de carga, protegida por GRANT — só service_role/ingestor executam.';
COMMENT ON FUNCTION public.inserir_lote_staging_centro_custo(jsonb) IS
  'v6.5.1 (0304): insere um lote na staging de Lançamentos por Centro de Custo (chaves: arquivo_origem, linha_origem, numero, emissao, vencimento, movimentacao, centro_custo, pct_centro, valor_movimentacao, valor_centro_custo). SEM exigir_acesso POR DESENHO: RPC de carga, protegida por GRANT.';
COMMENT ON FUNCTION public.validar_carga_centro_custo() IS
  'v6.5.1 (0304): valida a staging de Lançamentos por Centro de Custo e devolve {ok,total,erros}. Reprova: staging vazia, centro não cadastrado em financeiro.centro_custo, % diferente entre movimentações do mesmo (Número, centro), % negativo. SEM exigir_acesso POR DESENHO.';
COMMENT ON FUNCTION public.promover_carga_centro_custo(jsonb, uuid) IS
  'v6.5.1 (0304): promove a staging para raw.lancamentos_centro_custo numa transação única, confere o checksum POR CENTRO (outline do arquivo: linhas + Σ valor_centro_custo com sinal) contra o GRAVADO e regenera financeiro.centro_custo_rateio (Σ pesos = 1 por Número) na mesma transação. RAISE em qualquer divergência: base e rateio anteriores intactos. Idempotente por (base, carga_id). SEM exigir_acesso POR DESENHO.';

-- ── 5. As 3 funções compartilhadas, reescritas do CATÁLOGO VIVO (06/11/2026) ─────────────
-- Só acrescentam 'lancamentos-centro-custo' (por ÚLTIMO) às listas e, em ingestao_soma_por_ano, o ramo
-- próprio antes do ELSE RAISE. O resto do corpo é o vivo, byte a byte.
CREATE OR REPLACE FUNCTION public.ingestao_carga_abrir(p_carga_id uuid, p_base text, p_origem text, p_arquivos jsonb, p_chave_id bigint DEFAULT NULL::bigint, p_usuario_id uuid DEFAULT NULL::uuid, p_idempotencia uuid DEFAULT NULL::uuid, p_extraido_em timestamp with time zone DEFAULT NULL::timestamp with time zone, p_observacao text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_row       ingestao.carga;
  v_existente boolean := false;
BEGIN
  -- O `carga_id` NÃO é gerado aqui: ele nasce no passo 1 do contrato (a rota
  -- `/upload-url`) e vai DENTRO do caminho do objeto no bucket
  -- (`{base}/{aaaa}/{mm}/{carga_id}-{n}-{nome}`), que é o que amarra os arquivos à carga.
  -- O passo 1 é deliberadamente SEM ESTADO — a linha só nasce aqui, no passo 3, quando
  -- tudo já é conhecido (os sha256 dos arquivos, `extraido_em`, a origem). Se `abrir`
  -- rodasse no passo 1, `extraido_em` (que o contrato §2.3 só recebe no passo 3) nunca
  -- teria onde ser gravado, e um upload abandonado deixaria linha de carga fantasma.
  IF p_carga_id IS NULL THEN
    RAISE EXCEPTION 'CARGA_ID_OBRIGATORIO: o carga_id é emitido no passo 1 (upload-url) e viaja no caminho do objeto'
      USING ERRCODE = '22023';
  END IF;
  IF p_base IS NULL OR NOT (p_base = ANY (ARRAY[
       'demonstrativo-competencia', 'vendas-produto', 'lancamentos-movimentacao',
       'lancamentos-aberto', 'lancamentos-operacao', 'contas-receber',
       'lancamentos-centro-custo'
     ]::text[])) THEN
    RAISE EXCEPTION 'BASE_INVALIDA: % não é uma base de ingestão conhecida (contrato ingestao-v1 §3)', p_base
      USING ERRCODE = '22023';
  END IF;
  IF coalesce(btrim(p_origem), '') = '' THEN
    RAISE EXCEPTION 'ORIGEM_OBRIGATORIA: informe x-ingestao-origem' USING ERRCODE = '22023';
  END IF;

  -- Duas formas de "já existe", nesta ordem. (1) A MESMA carga chegando de novo: repetição
  -- do passo 3 depois de um timeout de rede, com o mesmo carga_id. Sem este ramo a
  -- repetição bateria na PK e viraria 500. (2) Chave de idempotência já usada, ainda que
  -- com carga_id novo — é o que o contrato §1 promete ("mesma chave ⇒ mesma resposta, sem
  -- recarregar"), e é o caso de uma RPA que reemitiu o passo 1 antes de repetir o passo 3.
  SELECT * INTO v_row FROM ingestao.carga WHERE carga_id = p_carga_id;
  IF FOUND THEN
    v_existente := true;
  ELSIF p_idempotencia IS NOT NULL THEN
    SELECT * INTO v_row FROM ingestao.carga WHERE idempotencia = p_idempotencia;
    IF FOUND THEN
      v_existente := true;
    END IF;
  END IF;

  -- ⚠️ Os dois SELECTs acima NÃO bastam sozinhos, e é por isso que o INSERT abaixo tem
  -- tratamento de violação de unicidade. Eles são um `check-then-insert`: sob READ COMMITTED,
  -- duas chamadas concorrentes não enxergam a linha não-commitada uma da outra, as duas chegam
  -- a `v_existente = false` e as duas tentam inserir. A segunda bateria na PK (`carga_id`) ou
  -- no índice único parcial da idempotência e sairia como erro cru 23505 — 500 para o chamador,
  -- exatamente no caso que a idempotência existe para atender. E a concorrência aqui é real,
  -- não hipotética: a trava de aplicação do lado do app é em MEMÓRIA, por processo (ver
  -- `tentarTravarBase` em `src/lib/ingestao/carga.ts`), então duas instâncias serverless não se
  -- veem — nesse cenário esta função é a única rede que sobra. Achado ALTO do `revisor-db`.
  IF NOT v_existente THEN
    BEGIN
      INSERT INTO ingestao.carga (
        carga_id, base, origem, chave_id, usuario_id, idempotencia,
        extraido_em, arquivos, status, observacao
      ) VALUES (
        p_carga_id, p_base, btrim(p_origem), p_chave_id, p_usuario_id, p_idempotencia,
        p_extraido_em, coalesce(p_arquivos, '[]'::jsonb), 'aberta',
        nullif(btrim(coalesce(p_observacao, '')), '')
      )
      RETURNING * INTO v_row;
    EXCEPTION WHEN unique_violation THEN
      -- Perdemos a corrida: a linha que o outro chamador acabou de commitar é a verdadeira.
      -- Relemos por carga_id e, se não for esse o conflito, por idempotência.
      v_existente := true;
      SELECT * INTO v_row FROM ingestao.carga WHERE carga_id = p_carga_id;
      IF NOT FOUND AND p_idempotencia IS NOT NULL THEN
        SELECT * INTO v_row FROM ingestao.carga WHERE idempotencia = p_idempotencia;
      END IF;
      -- Violação de unicidade que não é nem uma nem outra: não é nossa para engolir.
      IF NOT FOUND THEN
        RAISE;
      END IF;
    END;
  END IF;

  -- Reaproveitar `carga_id`/`x-ingestao-idempotencia` entre BASES diferentes é erro do
  -- chamador, e devolver calado a carga da outra base seria uma resposta mentirosa sobre o
  -- que foi aplicado. Achado MÉDIO do `revisor-db`.
  IF v_existente AND v_row.base <> p_base THEN
    RAISE EXCEPTION 'IDEMPOTENCIA_BASE_DIVERGENTE: a carga % já existe para a base %, não para %',
      v_row.carga_id, v_row.base, p_base USING ERRCODE = '22023';
  END IF;

  RETURN jsonb_build_object(
    'existente', v_existente,
    'carga_id', v_row.carga_id, 'base', v_row.base, 'origem', v_row.origem,
    'chave_id', v_row.chave_id, 'usuario_id', v_row.usuario_id, 'idempotencia', v_row.idempotencia,
    'extraido_em', v_row.extraido_em, 'recebido_em', v_row.recebido_em, 'concluido_em', v_row.concluido_em,
    'arquivos', v_row.arquivos, 'linhas', v_row.linhas, 'somas', v_row.somas,
    'checksums_conferidos', v_row.checksums_conferidos, 'checksums_falhos', v_row.checksums_falhos,
    'rejeitadas_por_data', v_row.rejeitadas_por_data, 'pares_novos', v_row.pares_novos,
    'diff', v_row.diff, 'status', v_row.status, 'erro', v_row.erro,
    'duracao_ms', v_row.duracao_ms, 'resposta', v_row.resposta, 'observacao', v_row.observacao
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.ingestao_carga_ultima(p_base text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_row ingestao.carga;
BEGIN
  IF p_base IS NULL OR NOT (p_base = ANY (ARRAY[
       'demonstrativo-competencia', 'vendas-produto', 'lancamentos-movimentacao',
       'lancamentos-aberto', 'lancamentos-operacao', 'contas-receber',
       'lancamentos-centro-custo'
     ]::text[])) THEN
    RAISE EXCEPTION 'BASE_INVALIDA: % não é uma base de ingestão conhecida (contrato ingestao-v1 §3)', p_base
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row FROM ingestao.carga
   WHERE base = p_base AND status = 'aplicada'
   ORDER BY concluido_em DESC NULLS LAST, recebido_em DESC
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'carga_id', v_row.carga_id, 'base', v_row.base, 'origem', v_row.origem,
    'chave_id', v_row.chave_id, 'usuario_id', v_row.usuario_id, 'idempotencia', v_row.idempotencia,
    'extraido_em', v_row.extraido_em, 'recebido_em', v_row.recebido_em, 'concluido_em', v_row.concluido_em,
    'arquivos', v_row.arquivos, 'linhas', v_row.linhas, 'somas', v_row.somas,
    'checksums_conferidos', v_row.checksums_conferidos, 'checksums_falhos', v_row.checksums_falhos,
    'rejeitadas_por_data', v_row.rejeitadas_por_data, 'pares_novos', v_row.pares_novos,
    'diff', v_row.diff, 'status', v_row.status, 'erro', v_row.erro,
    'duracao_ms', v_row.duracao_ms, 'resposta', v_row.resposta, 'observacao', v_row.observacao
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.ingestao_soma_por_ano(p_base text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF p_base IS NULL OR NOT (p_base = ANY (ARRAY[
       'demonstrativo-competencia', 'vendas-produto', 'lancamentos-movimentacao',
       'lancamentos-aberto', 'lancamentos-operacao', 'contas-receber',
       'lancamentos-centro-custo'
     ]::text[])) THEN
    RAISE EXCEPTION 'BASE_INVALIDA: % não é uma base de ingestão conhecida (contrato ingestao-v1 §3)', p_base
      USING ERRCODE = '22023';
  END IF;

  IF p_base = 'demonstrativo-competencia' THEN
    SELECT coalesce(jsonb_object_agg(s.ano::text, jsonb_build_object('linhas', s.linhas, 'centavos', s.centavos)), '{}'::jsonb)
      INTO v_result
    FROM (
      SELECT ano, count(*) AS linhas, coalesce(round(sum(valor) * 100), 0)::bigint AS centavos
      FROM raw.demonstrativo_competencia
      GROUP BY ano
    ) s;

  ELSIF p_base = 'lancamentos-movimentacao' THEN
    SELECT coalesce(jsonb_object_agg(s.ano::text, jsonb_build_object('linhas', s.linhas, 'centavos', s.centavos)), '{}'::jsonb)
      INTO v_result
    FROM (
      SELECT date_part('year', data_movimentacao)::int AS ano,
             count(*) AS linhas, coalesce(round(sum(valor) * 100), 0)::bigint AS centavos
      FROM raw.lancamentos_movimentacao
      WHERE data_movimentacao IS NOT NULL
      GROUP BY 1
    ) s;

  ELSIF p_base = 'lancamentos-aberto' THEN
    SELECT coalesce(jsonb_object_agg(s.ano::text, jsonb_build_object('linhas', s.linhas, 'centavos', s.centavos)), '{}'::jsonb)
      INTO v_result
    FROM (
      SELECT date_part('year', vencimento)::int AS ano,
             count(*) AS linhas, coalesce(round(sum(valor) * 100), 0)::bigint AS centavos
      FROM raw.titulos_em_aberto
      WHERE vencimento IS NOT NULL
      GROUP BY 1
    ) s;

  ELSIF p_base = 'vendas-produto' THEN
    -- Base VIVA = analytics.fato_venda (uma linha por venda_numero, já sem Welcome) +
    -- fato_venda_item (valor_total por item). "linhas" = venda DISTINTA, não linha de item —
    -- ver header ("a base conta venda distinta, o parser conta linha de item").
    SELECT coalesce(jsonb_object_agg(s.ano::text, jsonb_build_object('linhas', s.linhas, 'centavos', s.centavos)), '{}'::jsonb)
      INTO v_result
    FROM (
      SELECT date_part('year', fv.data_venda)::int AS ano,
             count(DISTINCT fv.id) AS linhas,
             coalesce(round(sum(fi.valor_total) * 100), 0)::bigint AS centavos
      FROM analytics.fato_venda fv
      JOIN analytics.fato_venda_item fi ON fi.fato_venda_id = fv.id
      GROUP BY 1
    ) s;

  ELSIF p_base = 'lancamentos-operacao' THEN
    -- Base VIVA = analytics.fato_lancamento_operacao (placeholder do scrape já descartado na
    -- promoção, 0278). data_final = coalesce(liquidacao, vencimento), já resolvido lá.
    -- (Era o ELSE implícito até a 0295; agora é um ramo explícito e o ELSE final reprova.)
    SELECT coalesce(jsonb_object_agg(s.ano::text, jsonb_build_object('linhas', s.linhas, 'centavos', s.centavos)), '{}'::jsonb)
      INTO v_result
    FROM (
      SELECT date_part('year', data_final)::int AS ano,
             count(*) AS linhas, coalesce(round(sum(valor) * 100), 0)::bigint AS centavos
      FROM analytics.fato_lancamento_operacao
      WHERE data_final IS NOT NULL
      GROUP BY 1
    ) s;

  ELSIF p_base = 'contas-receber' THEN
    -- Base VIVA = raw.contas_receber (0295). Ano = ano do VENCIMENTO; centavos = Σ valor_final.
    SELECT coalesce(jsonb_object_agg(s.ano::text, jsonb_build_object('linhas', s.linhas, 'centavos', s.centavos)), '{}'::jsonb)
      INTO v_result
    FROM (
      SELECT date_part('year', vencimento)::int AS ano,
             count(*) AS linhas, coalesce(round(sum(valor_final) * 100), 0)::bigint AS centavos
      FROM raw.contas_receber
      WHERE vencimento IS NOT NULL
      GROUP BY 1
    ) s;

  ELSIF p_base = 'lancamentos-centro-custo' THEN
    -- Base VIVA = raw.lancamentos_centro_custo (0304, base de FLUXO). Ano = ano da MOVIMENTAÇÃO;
    -- centavos = Σ valor_centro_custo (com o sinal da movimentação, como gravado).
    SELECT coalesce(jsonb_object_agg(s.ano::text, jsonb_build_object('linhas', s.linhas, 'centavos', s.centavos)), '{}'::jsonb)
      INTO v_result
    FROM (
      SELECT date_part('year', movimentacao)::int AS ano,
             count(*) AS linhas, coalesce(round(sum(valor_centro_custo) * 100), 0)::bigint AS centavos
      FROM raw.lancamentos_centro_custo
      WHERE movimentacao IS NOT NULL
      GROUP BY 1
    ) s;

  ELSE
    -- Fail-closed: base aceita pela lista acima mas sem ramo de soma NÃO cai, calada, na soma de
    -- outra base (o ELSE implícito de Operação fazia exatamente isso).
    RAISE EXCEPTION 'BASE_SEM_SOMA: a base % não tem soma por ano definida em ingestao_soma_por_ano', p_base
      USING ERRCODE = '22023';
  END IF;

  RETURN v_result;
END;
$function$;

-- `CREATE OR REPLACE` preserva as ACLs; redeclarar mesmo assim (precedente 0197/0206): o dia em que isto
-- virar DROP + CREATE, o default privilege do Supabase abre `anon` em silêncio.
REVOKE EXECUTE ON FUNCTION public.ingestao_carga_abrir(uuid, text, text, jsonb, bigint, uuid, uuid, timestamptz, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.ingestao_carga_abrir(uuid, text, text, jsonb, bigint, uuid, uuid, timestamptz, text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.ingestao_carga_ultima(text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.ingestao_carga_ultima(text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.ingestao_soma_por_ano(text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.ingestao_soma_por_ano(text) TO service_role;

-- ── 6. Guard de EFETIVIDADE ─────────────────────────────────────────────────────────────
-- A transação inteira aborta se a intenção não se cumpriu. to_regprocedure/to_regclass com assinatura
-- completa (NULL = não existe OU não casa — por isso cada resolução reprova NULL).
DO $$
DECLARE
  v_sig  text;
  v_proc regprocedure;
  v_tab  text;
  v_n    int;
BEGIN
  FOREACH v_tab IN ARRAY ARRAY[
    'financeiro.centro_custo',
    'raw.lancamentos_centro_custo',
    'raw.lancamentos_centro_custo_staging',
    'financeiro.centro_custo_rateio'
  ] LOOP
    IF to_regclass(v_tab) IS NULL THEN
      RAISE EXCEPTION '0304: tabela % não encontrada', v_tab;
    END IF;
    IF NOT (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = to_regclass(v_tab)) THEN
      RAISE EXCEPTION '0304: RLS desligado em %', v_tab;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname || '.' || tablename = v_tab) THEN
      RAISE EXCEPTION '0304: % tem policy (deveria ser deny-by-default, sem policy)', v_tab;
    END IF;
    IF has_table_privilege('anon', v_tab, 'SELECT,INSERT,UPDATE,DELETE')
       OR has_table_privilege('authenticated', v_tab, 'SELECT,INSERT,UPDATE,DELETE') THEN
      RAISE EXCEPTION '0304: anon/authenticated ainda tem privilégio de tabela em %', v_tab;
    END IF;
  END LOOP;

  -- A dimensão nasce com os 5 centros, um só sem nome (Sem centro).
  SELECT count(*) INTO v_n FROM financeiro.centro_custo;
  IF v_n <> 5 THEN
    RAISE EXCEPTION '0304: financeiro.centro_custo com % linhas (esperado 5)', v_n;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM financeiro.centro_custo WHERE id = 'sem_centro' AND nome_monde IS NULL) THEN
    RAISE EXCEPTION '0304: centro sem_centro ausente ou com nome';
  END IF;

  -- Lista fechada (D6): nenhuma coluna com nome de pessoa na raw.
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'raw' AND table_name = 'lancamentos_centro_custo'
                AND column_name IN ('pessoa', 'descricao', 'valor_lancamento')) THEN
    RAISE EXCEPTION '0304: raw.lancamentos_centro_custo tem coluna fora da lista fechada (D6)';
  END IF;

  FOREACH v_sig IN ARRAY ARRAY[
    'public.limpar_staging_centro_custo()',
    'public.inserir_lote_staging_centro_custo(jsonb)',
    'public.validar_carga_centro_custo()',
    'public.promover_carga_centro_custo(jsonb, uuid)'
  ] LOOP
    v_proc := to_regprocedure(v_sig);
    IF v_proc IS NULL THEN
      RAISE EXCEPTION '0304: função % não encontrada', v_sig;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = v_proc AND prosecdef
                      AND proconfig @> ARRAY['search_path=""']) THEN
      RAISE EXCEPTION '0304: % sem SECURITY DEFINER ou sem search_path vazio', v_sig;
    END IF;
    IF NOT has_function_privilege('service_role', v_proc, 'EXECUTE') THEN
      RAISE EXCEPTION '0304: service_role sem EXECUTE em %', v_sig;
    END IF;
    IF NOT has_function_privilege('ingestor', v_proc, 'EXECUTE') THEN
      RAISE EXCEPTION '0304: ingestor sem EXECUTE em %', v_sig;
    END IF;
    IF has_function_privilege('anon', v_proc, 'EXECUTE')
       OR has_function_privilege('authenticated', v_proc, 'EXECUTE')
       OR has_function_privilege('verificador', v_proc, 'EXECUTE') THEN
      RAISE EXCEPTION '0304: anon/authenticated/verificador com EXECUTE em %', v_sig;
    END IF;
  END LOOP;

  FOREACH v_sig IN ARRAY ARRAY[
    'public.ingestao_carga_abrir(uuid, text, text, jsonb, bigint, uuid, uuid, timestamptz, text)',
    'public.ingestao_carga_ultima(text)',
    'public.ingestao_soma_por_ano(text)'
  ] LOOP
    v_proc := to_regprocedure(v_sig);
    IF v_proc IS NULL THEN
      RAISE EXCEPTION '0304: função % não encontrada', v_sig;
    END IF;
    IF position('''lancamentos-centro-custo''' IN (SELECT prosrc FROM pg_proc WHERE oid = v_proc)) = 0 THEN
      RAISE EXCEPTION '0304: corpo de % não aceita a base lancamentos-centro-custo', v_sig;
    END IF;
    -- As 6 bases anteriores continuam aceitas (a reescrita só acrescenta).
    IF position('''contas-receber''' IN (SELECT prosrc FROM pg_proc WHERE oid = v_proc)) = 0
       OR position('''demonstrativo-competencia''' IN (SELECT prosrc FROM pg_proc WHERE oid = v_proc)) = 0 THEN
      RAISE EXCEPTION '0304: corpo de % perdeu uma base anterior', v_sig;
    END IF;
    IF NOT has_function_privilege('service_role', v_proc, 'EXECUTE') THEN
      RAISE EXCEPTION '0304: service_role sem EXECUTE em %', v_sig;
    END IF;
    IF has_function_privilege('anon', v_proc, 'EXECUTE')
       OR has_function_privilege('authenticated', v_proc, 'EXECUTE') THEN
      RAISE EXCEPTION '0304: anon/authenticated ainda tem EXECUTE em %', v_sig;
    END IF;
  END LOOP;

  IF position('BASE_SEM_SOMA' IN (SELECT prosrc FROM pg_proc WHERE oid = to_regprocedure('public.ingestao_soma_por_ano(text)'))) = 0 THEN
    RAISE EXCEPTION '0304: ingestao_soma_por_ano perdeu o ELSE RAISE fail-closed';
  END IF;

  -- Nenhuma sobrecarga criada por engano.
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND (p.proname LIKE '%\_carga\_centro\_custo' OR p.proname LIKE '%\_staging\_centro\_custo');
  IF v_n <> 4 THEN
    RAISE EXCEPTION '0304: % funções de carga de centro_custo (esperado 4; sobrecarga criada por engano?)', v_n;
  END IF;
END
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
