-- ---------------------------------------------------------------------------
-- 0296 — feat(v6.4.0/M4): registro de ANTECIPAÇÕES sob o diário + carga inicial com oráculo
--        + 5 RPCs da gestão (escrita, desfazer, leitura, histórico)
--
-- Classificação: ADITIVA (só objetos NOVOS: 2 tabelas, 1 função auxiliar, 2 triggers, 5 RPCs,
-- REVOKE/GRANT, e INSERT em tabela NOVA — o seed de 2 contas e a carga das 38 linhas da planilha).
--
-- DECLARAÇÃO PRÉVIA (regime aditivo / autônomo):
--   • O QUE FAZ:
--     (1) CREATE TABLE financeiro.antecipacao_conta (lista curada: 1 Asaas, 2 Blimboo);
--     (2) CREATE TABLE financeiro.antecipacao — conta, data, valor antecipado, valor líquido,
--         DESCONTO GERADO (antecipado − líquido, nunca digitado), carimbos de criação/atualização.
--         CHECKs: valores > 0, líquido ≤ antecipado, data ≥ 2000-01-01. RLS ligado SEM policy
--         (deny-all) e REVOKE de PUBLIC/anon/authenticated na tabela e na sequência;
--     (3) CARGA INICIAL: as 38 linhas da planilha "Histórico de Antecipações" (sha256 dbbf07d04fb111cd…)
--         por INSERT … SELECT (conta resolvida por NOME → id), seguida de um guard DO que ABORTA a
--         transação inteira se a contagem ≠ 38 ou se qualquer total do invariante 7 do briefing
--         divergir (antecipado 7.245.412,45 · líquido 7.057.349,44 · desconto 188.063,01 · Asaas
--         2024/2025/2026 · Blimboo 2025/2026). Conferido contra a TABELA, não contra as dinâmicas;
--     (4) triggers, NESTA ORDEM, depois da carga: BEFORE UPDATE que carimba atualizado_em (REUSA
--         financeiro.fn_dre_touch_atualizado_em, 0204 — corpo genérico `NEW.atualizado_em = now()`;
--         0260 já a reusa fora das tabelas "dre") e AFTER INSERT/UPDATE/DELETE → diário genérico
--         (financeiro.fn_diario_alteracoes, 0199). As 38 linhas da carga NÃO geram entrada de diário
--         POR CONSTRUÇÃO (o trigger ainda não existia) — nada do que veio da planilha pode ser
--         "desfeito" para dentro de uma tabela vazia;
--     (5) 5 RPCs em public, todas SECURITY DEFINER, search_path '', com
--         `PERFORM app.exigir_acesso(ARRAY['financeiro/geral/gestao'])` como PRIMEIRA instrução do
--         corpo (padrão INLINE, skill banco-e-rpc §4), REVOKE de PUBLIC/anon e GRANT a
--         authenticated + service_role:
--           • antecipacao_salvar(bigint, smallint, date, numeric, numeric)  RETURNS json
--           • antecipacao_excluir(bigint)                                   RETURNS void
--           • antecipacao_desfazer(bigint)                                  RETURNS json
--           • antecipacao_listar()                                          RETURNS json  (STABLE)
--           • antecipacao_historico(integer DEFAULT 20)                     RETURNS json  (STABLE)
--         As 3 de ESCRITA nunca chegam a `verificador` nem a `ingestor` (REVOKE explícito + guard).
--         As 2 de leitura NÃO são concedidas ao `verificador` aqui: o grant é deliberado, por
--         assinatura, via scripts/credencial/derivar-allowlist.mjs depois dos casos de contrato
--         (briefing inv. 11 / contrato §3). `ingestor` não recebe nenhuma das 5;
--     (6) 1 função AUXILIAR interna em `financeiro` (schema não exposto): antecipacao_diario_campos(jsonb),
--         que reduz um snapshot do diário aos campos de NEGÓCIO (sem carimbos). Sem EXECUTE para
--         PUBLIC/anon/authenticated; só as RPCs SECURITY DEFINER (dono postgres) a chamam.
--   • A ÁREA `financeiro/geral/gestao` NÃO é criada aqui — nasce na 0297 (aplicada no mesmo push, logo
--     depois). `app.exigir_acesso` só avalia a área em RUNTIME (0269: nem consulta app.rbac_areas;
--     só compara com app.rbac_role_permissoes), então nada aqui falha no CREATE e o guard final
--     não referencia a área. Entre a 0296 e a 0297 qualquer usuário real recebe PERMISSAO_NEGADA:
--     é o estado fail-closed desejado, não um defeito.
--   • COMPATÍVEL com a main viva: nada existente é alterado. NÃO toca fn_diario_alteracoes,
--     reverter_diario, app.exigir_acesso, get_dre_mensal nem nenhuma tabela pré-existente. Nenhum
--     código em produção referencia estes objetos. Nenhum UPDATE/DELETE/DROP/TRUNCATE em nível
--     top-level (os DML que há — INSERT/UPDATE/DELETE em financeiro.antecipacao — vivem DENTRO
--     dos corpos das RPCs, runtime, e só rodam quando alguém salva/exclui/desfaz).
--   • DESVIO DELIBERADO DO CONTRATO (spec-v6-4-0-contratos.md §2): `id` é BIGSERIAL, não
--     `GENERATED ALWAYS AS IDENTITY`. Motivo: financeiro.reverter_diario (0268), no ramo D
--     (desfazer EXCLUSÃO), reinsere só as colunas com `is_identity = 'NO'` — com IDENTITY o `id`
--     fica de fora, a linha volta com id NOVO, e a entrada D antiga continua "desfazível" (a linha
--     de id antigo segue ausente): um segundo clique em "Desfazer" REINSERIRIA a antecipação de
--     novo, duplicando-a e inflando todo total (volume, desconto, nº). Com BIGSERIAL (molde
--     dre_comp_par/gerencial_lancamentos) o id volta do snapshot e o segundo desfazer reprova com
--     "já existe uma linha com o id …". Nenhuma outra parte do contrato muda.
--   • COLUNA VOLÁTIL (skill banco-e-rpc §5, 0268): reverter_diario ignora SÓ `atualizado_em` na
--     checagem de conflito. Por isso o ÚNICO carimbo gerido por trigger é `atualizado_em`;
--     `criado_por`/`atualizado_por` são gravados EXPLICITAMENTE pelas RPCs (auth.uid()), nunca por
--     trigger — um BEFORE trigger em `atualizado_por` criaria uma 2ª coluna volátil e o desfazer em
--     cadeia (U2 depois U1) reprovaria como "alterada por outra pessoa". Desfazer RESTAURA
--     atualizado_por do snapshot (está na lista do SET) e deixa atualizado_em avançar.
--   • CONCORRÊNCIA: salvar/excluir/desfazer tomam o MESMO advisory lock transacional
--     (hashtext('financeiro.antecipacao')) — um desfazer não intercala com um salvar (precedente
--     0206, achado MÉDIO do revisor-db).
--   • DUPLICATAS: NÃO há UNIQUE (conta, data) — duas antecipações no mesmo dia e conta são legítimas.
--     Proteção contra duplo clique é do front.
--
-- Pós-aplicação (orquestrador): `npm run db:baseline` (schema + funções novas), regenerar
-- src/types/database.ts, schemas Zod + casos em rpc-contrato.test.ts (inclusive: as 5 RPCs
-- negam quem não tem a área; as de escrita fora da allowlist do verificador/ingestor), grants
-- das 2 leituras ao verificador via derivar-allowlist.mjs (migration aditiva própria).
--
-- DOWN (destrutivo — humano em TTY; NÃO é migration):
--   ⚠️ ANTES de qualquer DROP: `DROP TABLE financeiro.antecipacao` APAGA o registro que, desde a
--   aposentadoria da planilha "Histórico de Antecipações", é a FONTE ÚNICA das antecipações. EXPORTE-O
--   primeiro (contas + registros). O diário (financeiro.diario_alteracoes) guarda o histórico das
--   alterações feitas DEPOIS da carga, mas NÃO é backup de reconstrução trivial: as 38 linhas da carga
--   inicial não geraram entrada de diário, e reconstruir o estado atual a partir dele exige reaplicar
--   cada entrada na ordem. O backup-gate do wrapper é rede de recuperação, não substitui o export.
--   DROP FUNCTION public.antecipacao_historico(integer);
--   DROP FUNCTION public.antecipacao_listar();
--   DROP FUNCTION public.antecipacao_desfazer(bigint);
--   DROP FUNCTION public.antecipacao_excluir(bigint);
--   DROP FUNCTION public.antecipacao_salvar(bigint, smallint, date, numeric, numeric);
--   DROP FUNCTION financeiro.antecipacao_diario_campos(jsonb);
--   DROP TABLE financeiro.antecipacao;          -- leva os 2 triggers junto
--   DROP TABLE financeiro.antecipacao_conta;
--   As entradas JÁ GRAVADAS em financeiro.diario_alteracoes permanecem (append-only). Depois do
--   DROP TABLE, reverter_diario acusaria erro em `'financeiro.antecipacao'::regclass` se alguém
--   tentasse desfazer uma delas — esperado, a tabela não existe mais.
-- ---------------------------------------------------------------------------

BEGIN;

-- ── 1. Lista curada de contas ────────────────────────────────────────────────
CREATE TABLE financeiro.antecipacao_conta (
  id    smallint PRIMARY KEY,
  nome  text     NOT NULL CHECK (btrim(nome) <> ''),
  ativo boolean  NOT NULL DEFAULT true,
  CONSTRAINT antecipacao_conta_nome_uniq UNIQUE (nome)
);

COMMENT ON TABLE financeiro.antecipacao_conta IS
  'Contas de antecipação de recebíveis (v6.4.0): lista CURADA por migration (Asaas, Blimboo). Sem editor.';

INSERT INTO financeiro.antecipacao_conta (id, nome) VALUES
  (1, 'Asaas'),
  (2, 'Blimboo');

-- ── 2. O registro ─────────────────────────────────────────────────────────────
-- id BIGSERIAL (e não IDENTITY): ver "DESVIO DELIBERADO" no header — o desfazer de EXCLUSÃO só
-- preserva o id quando a coluna não é identity (reverter_diario, ramo D, filtra is_identity='NO').
CREATE TABLE financeiro.antecipacao (
  id               bigserial     PRIMARY KEY,
  conta_id         smallint      NOT NULL REFERENCES financeiro.antecipacao_conta (id),
  data             date          NOT NULL,
  valor_antecipado numeric(14,2) NOT NULL,
  valor_liquido    numeric(14,2) NOT NULL,
  -- DERIVADO, nunca digitado: coluna gerada STORED (briefing inv. 6).
  desconto         numeric(14,2) GENERATED ALWAYS AS (valor_antecipado - valor_liquido) STORED,
  criado_por       uuid,                                         -- auth.uid(); NULL na carga inicial e em service_role
  criado_em        timestamptz   NOT NULL DEFAULT now(),
  atualizado_por   uuid,                                         -- idem; gravado pela RPC, NUNCA por trigger (coluna volátil)
  atualizado_em    timestamptz   NOT NULL DEFAULT now(),         -- ÚNICA coluna volátil: BEFORE UPDATE a carimba (0268)

  CONSTRAINT antecipacao_data_min              CHECK (data >= DATE '2000-01-01'),
  CONSTRAINT antecipacao_valor_antecipado_pos  CHECK (valor_antecipado > 0),
  CONSTRAINT antecipacao_valor_liquido_pos     CHECK (valor_liquido > 0),
  CONSTRAINT antecipacao_liquido_le_antecipado CHECK (valor_liquido <= valor_antecipado)
);

CREATE INDEX antecipacao_data_idx  ON financeiro.antecipacao (data DESC);
CREATE INDEX antecipacao_conta_idx ON financeiro.antecipacao (conta_id);

COMMENT ON TABLE financeiro.antecipacao IS
  'Registro de antecipações de recebíveis (v6.4.0), fonte única desde a aposentadoria da planilha "Histórico de Antecipações". Sob o diário (fn_diario_alteracoes) com reversão por reverter_diario. desconto é GERADO.';

-- ── 3. Segurança: RLS deny-by-default, nada de grant direto ──────────────────
-- O app nunca toca estas tabelas (zero .from()); as RPCs SECURITY DEFINER (dono postgres)
-- ignoram RLS. Sem policy = deny-all para não-donos (postura 0120/0123, molde 0199).
ALTER TABLE financeiro.antecipacao_conta ENABLE ROW LEVEL SECURITY;
ALTER TABLE financeiro.antecipacao       ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON financeiro.antecipacao_conta FROM PUBLIC, anon, authenticated;
REVOKE ALL ON financeiro.antecipacao       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE financeiro.antecipacao_id_seq FROM PUBLIC, anon, authenticated;

-- ── 4. CARGA INICIAL — as 38 linhas da planilha, ANTES do trigger do diário ──
-- (conta, data, valor_antecipado, valor_liquido); o desconto é derivado (coluna gerada).
-- Conta resolvida por NOME: um nome que não casar derrubaria a linha em silêncio no JOIN — é
-- exatamente o que o guard de contagem logo abaixo existe para pegar. criado_por/atualizado_por
-- ficam NULL (migration não tem auth.uid()). ORDER BY só para os ids saírem em ordem cronológica.
INSERT INTO financeiro.antecipacao (conta_id, data, valor_antecipado, valor_liquido)
SELECT c.id, v.data, v.valor_antecipado, v.valor_liquido
  FROM (VALUES
    ('Asaas',   DATE '2024-01-05',  25473.48,  25295.08),
    ('Asaas',   DATE '2024-01-06', 132467.52, 130727.74),
    ('Asaas',   DATE '2024-02-05',  39062.38,  38657.01),
    ('Asaas',   DATE '2024-02-08', 154070.29, 151682.59),
    ('Asaas',   DATE '2024-02-09',  77509.08,  75588.65),
    ('Asaas',   DATE '2024-03-04', 390401.56, 375030.37),
    ('Asaas',   DATE '2024-04-11', 317213.88, 303676.13),
    ('Asaas',   DATE '2024-08-15',  92435.27,  91281.08),
    ('Asaas',   DATE '2024-12-16', 292747.68, 285478.10),
    ('Asaas',   DATE '2025-02-11', 232707.67, 228207.59),
    ('Asaas',   DATE '2025-03-10', 195932.94, 191198.14),
    ('Asaas',   DATE '2025-03-25', 292733.69, 280679.47),
    ('Asaas',   DATE '2025-04-03',  28425.05,  26777.52),
    ('Asaas',   DATE '2025-04-23',  74082.34,  72870.17),
    ('Blimboo', DATE '2025-02-04',  10596.86,  10565.07),
    ('Blimboo', DATE '2025-02-12', 344716.23, 335721.94),
    ('Blimboo', DATE '2025-04-08', 596662.55, 580329.76),
    ('Blimboo', DATE '2025-04-24',  75904.82,  74406.18),
    ('Blimboo', DATE '2025-05-09', 298316.20, 289200.48),
    ('Blimboo', DATE '2025-06-17', 279844.85, 276491.93),
    ('Blimboo', DATE '2025-06-23', 381168.61, 370534.22),
    ('Blimboo', DATE '2025-07-18', 194304.46, 190386.43),
    ('Blimboo', DATE '2025-09-15', 110869.58, 108907.36),
    ('Blimboo', DATE '2025-10-24', 416514.05, 407916.96),
    ('Blimboo', DATE '2025-11-18', 166577.28, 161706.79),
    ('Blimboo', DATE '2025-11-28', 149131.98, 143417.00),
    ('Blimboo', DATE '2025-12-15',  77601.96,  74643.77),
    ('Blimboo', DATE '2026-01-16',  91902.35,  90191.68),
    ('Blimboo', DATE '2026-01-20',  92980.58,  89876.68),
    ('Blimboo', DATE '2026-02-19', 269633.75, 257229.99),
    ('Asaas',   DATE '2026-02-20', 149950.11, 148553.92),
    ('Asaas',   DATE '2026-03-20',  59991.47,  59415.54),
    ('Asaas',   DATE '2026-04-08',  97929.86,  96688.23),
    ('Asaas',   DATE '2026-04-09',  41289.23,  40767.81),
    ('Asaas',   DATE '2026-04-16', 577585.21, 562836.43),
    ('Asaas',   DATE '2026-05-19', 126175.61, 123788.04),
    ('Asaas',   DATE '2026-05-27',  80508.35,  78485.25),
    ('Asaas',   DATE '2026-09-21', 209993.67, 208138.34)
  ) AS v(conta, data, valor_antecipado, valor_liquido)
  JOIN financeiro.antecipacao_conta c ON c.nome = v.conta
 ORDER BY v.data, c.id, v.valor_antecipado;

-- ── 5. GUARD DA CARGA (oráculo do invariante 7): reprova → a transação inteira aborta ──
-- numeric(14,2) soma exata: comparação direta com `=`/IS DISTINCT FROM, sem tolerância.
DO $$
DECLARE
  v_n     int;
  v_ant   numeric;
  v_liq   numeric;
  v_desc  numeric;
  v_nconta int;
  v_x     numeric;
  v_xn    int;
  r       record;
BEGIN
  SELECT count(*) INTO v_nconta FROM financeiro.antecipacao_conta;
  IF v_nconta <> 2 OR NOT EXISTS (SELECT 1 FROM financeiro.antecipacao_conta WHERE id = 1 AND nome = 'Asaas')
                   OR NOT EXISTS (SELECT 1 FROM financeiro.antecipacao_conta WHERE id = 2 AND nome = 'Blimboo') THEN
    RAISE EXCEPTION '0296: seed de contas divergente (esperado 1=Asaas, 2=Blimboo; % linhas)', v_nconta;
  END IF;

  SELECT count(*), sum(valor_antecipado), sum(valor_liquido), sum(desconto)
    INTO v_n, v_ant, v_liq, v_desc
    FROM financeiro.antecipacao;

  IF v_n <> 38 THEN
    RAISE EXCEPTION '0296: carga inicial com % linhas (esperado 38) — nome de conta que não casou?', v_n;
  END IF;
  IF v_ant IS DISTINCT FROM 7245412.45 THEN
    RAISE EXCEPTION '0296: Σ antecipado = % (esperado 7245412.45)', v_ant;
  END IF;
  IF v_liq IS DISTINCT FROM 7057349.44 THEN
    RAISE EXCEPTION '0296: Σ líquido = % (esperado 7057349.44)', v_liq;
  END IF;
  IF v_desc IS DISTINCT FROM 188063.01 THEN
    RAISE EXCEPTION '0296: Σ desconto = % (esperado 188063.01)', v_desc;
  END IF;

  -- Σ antecipado e nº de linhas por conta × ano (as 5 células do invariante 7; os nºs somam 38).
  FOR r IN
    SELECT * FROM (VALUES
      ('Asaas',   2024, 1521381.14::numeric,  9),
      ('Asaas',   2025,  823881.69::numeric,  5),
      ('Asaas',   2026, 1343423.51::numeric,  8),
      ('Blimboo', 2025, 3102209.43::numeric, 13),
      ('Blimboo', 2026,  454516.68::numeric,  3)
    ) AS e(conta, ano, esperado, n)
  LOOP
    SELECT sum(a.valor_antecipado), count(*) INTO v_x, v_xn
      FROM financeiro.antecipacao a
      JOIN financeiro.antecipacao_conta c ON c.id = a.conta_id
     WHERE c.nome = r.conta
       AND extract(year FROM a.data)::int = r.ano;
    IF v_x IS DISTINCT FROM r.esperado OR v_xn <> r.n THEN
      RAISE EXCEPTION '0296: % % — Σ antecipado = % em % linhas (esperado % em % linhas)',
        r.conta, r.ano, v_x, v_xn, r.esperado, r.n;
    END IF;
  END LOOP;
END
$$;

-- ── 6. Triggers DEPOIS da carga ──────────────────────────────────────────────
-- (a) BEFORE UPDATE: carimba atualizado_em (a única coluna volátil — 0268).
CREATE TRIGGER trg_touch_antecipacao
  BEFORE UPDATE ON financeiro.antecipacao
  FOR EACH ROW EXECUTE FUNCTION financeiro.fn_dre_touch_atualizado_em();

-- (b) AFTER I/U/D: diário genérico (0199; PK `id`, que a tabela tem). AFTER, não BEFORE: grava os
-- valores finais, depois do carimbo do trigger (a).
CREATE TRIGGER trg_diario_antecipacao
  AFTER INSERT OR UPDATE OR DELETE ON financeiro.antecipacao
  FOR EACH ROW EXECUTE FUNCTION financeiro.fn_diario_alteracoes();

-- ── 7. Auxiliar interna: snapshot do diário → só os campos de negócio ────────
-- Sem carimbos (criado_*/atualizado_*): o histórico mostra o que mudou no registro, não quem/quando
-- (isso já vem em usuario_nome/quando). NULL entra → NULL sai (INSERT não tem "antes"; DELETE, "depois").
CREATE OR REPLACE FUNCTION financeiro.antecipacao_diario_campos(p_dados jsonb)
RETURNS json
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT CASE WHEN p_dados IS NULL THEN NULL ELSE json_build_object(
    'conta_id',         (p_dados->>'conta_id')::smallint,
    'conta',            (SELECT c.nome FROM financeiro.antecipacao_conta c
                          WHERE c.id = (p_dados->>'conta_id')::smallint),
    'data',             (p_dados->>'data')::date,
    'valor_antecipado', (p_dados->>'valor_antecipado')::numeric,
    'valor_liquido',    (p_dados->>'valor_liquido')::numeric,
    'desconto',         (p_dados->>'desconto')::numeric
  ) END
$$;

REVOKE EXECUTE ON FUNCTION financeiro.antecipacao_diario_campos(jsonb) FROM PUBLIC, anon, authenticated;

-- ── 8. RPC: salvar (criar/atualizar) ─────────────────────────────────────────
-- p_id NULL cria; senão atualiza. Mensagens com prefixo-código (padrão DRE_*): o texto depois do
-- ':' já é legível; o front pode exibi-lo direto ou mapear pelo código.
CREATE OR REPLACE FUNCTION public.antecipacao_salvar(
  p_id               bigint,
  p_conta_id         smallint,
  p_data             date,
  p_valor_antecipado numeric,
  p_valor_liquido    numeric
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c_max      CONSTANT numeric := 999999999999.99;   -- teto do numeric(14,2)
  v_uid      uuid;
  v_hoje     date;
  v_ativo    boolean;
  v_id       bigint;
  v_n        int;
  v_criada   boolean := false;
  v_alterada boolean := false;
  v_reg      json;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/geral/gestao']);

  v_uid  := auth.uid();
  v_hoje := (now() AT TIME ZONE 'America/Sao_Paulo')::date;

  -- Conta: da lista curada e ativa.
  IF p_conta_id IS NULL THEN
    RAISE EXCEPTION 'ANTECIPACAO_CONTA_INVALIDA: Selecione a conta da antecipação.';
  END IF;
  SELECT c.ativo INTO v_ativo FROM financeiro.antecipacao_conta c WHERE c.id = p_conta_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ANTECIPACAO_CONTA_INVALIDA: Conta de antecipação inexistente.';
  END IF;
  IF NOT v_ativo THEN
    RAISE EXCEPTION 'ANTECIPACAO_CONTA_INVALIDA: A conta selecionada está inativa.';
  END IF;

  -- Data: erro de digitação de ano e data futura (a antecipação já aconteceu quando se registra).
  IF p_data IS NULL THEN
    RAISE EXCEPTION 'ANTECIPACAO_DATA_INVALIDA: Informe a data da antecipação.';
  END IF;
  IF p_data < DATE '2000-01-01' THEN
    RAISE EXCEPTION 'ANTECIPACAO_DATA_INVALIDA: A data da antecipação é anterior a 01/01/2000.';
  END IF;
  IF p_data > v_hoje THEN
    RAISE EXCEPTION 'ANTECIPACAO_DATA_INVALIDA: A data da antecipação não pode ser futura.';
  END IF;

  -- Valores (mensagens amigáveis ANTES dos CHECKs da tabela).
  IF p_valor_antecipado IS NULL OR p_valor_antecipado <= 0 THEN
    RAISE EXCEPTION 'ANTECIPACAO_VALOR_INVALIDO: O valor antecipado deve ser maior que zero.';
  END IF;
  IF p_valor_liquido IS NULL OR p_valor_liquido <= 0 THEN
    RAISE EXCEPTION 'ANTECIPACAO_VALOR_INVALIDO: O valor líquido deve ser maior que zero.';
  END IF;
  IF p_valor_antecipado > c_max OR p_valor_liquido > c_max THEN
    RAISE EXCEPTION 'ANTECIPACAO_VALOR_INVALIDO: O valor excede o limite permitido (R$ 999.999.999.999,99).';
  END IF;
  IF p_valor_antecipado <> round(p_valor_antecipado, 2) OR p_valor_liquido <> round(p_valor_liquido, 2) THEN
    RAISE EXCEPTION 'ANTECIPACAO_VALOR_INVALIDO: Os valores aceitam no máximo 2 casas decimais.';
  END IF;
  IF p_valor_liquido > p_valor_antecipado THEN
    RAISE EXCEPTION 'ANTECIPACAO_VALOR_INVALIDO: O valor líquido não pode ser maior que o valor antecipado.';
  END IF;

  -- Serializa escrita/exclusão/desfazer (mesma chave nas três RPCs).
  PERFORM pg_advisory_xact_lock(hashtext('financeiro.antecipacao'));

  IF p_id IS NULL THEN
    INSERT INTO financeiro.antecipacao
      (conta_id, data, valor_antecipado, valor_liquido, criado_por, atualizado_por)
    VALUES
      (p_conta_id, p_data, p_valor_antecipado, p_valor_liquido, v_uid, v_uid)
    RETURNING id INTO v_id;
    v_criada := true;
  ELSE
    v_id := p_id;
    -- No-op é pulado: sem UPDATE → sem atualizado_em novo → sem entrada de diário (padrão 0268).
    UPDATE financeiro.antecipacao a
       SET conta_id         = p_conta_id,
           data             = p_data,
           valor_antecipado = p_valor_antecipado,
           valor_liquido    = p_valor_liquido,
           atualizado_por   = v_uid
     WHERE a.id = p_id
       AND (a.conta_id, a.data, a.valor_antecipado, a.valor_liquido)
           IS DISTINCT FROM (p_conta_id, p_data, p_valor_antecipado, p_valor_liquido);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = 0 THEN
      IF NOT EXISTS (SELECT 1 FROM financeiro.antecipacao a WHERE a.id = p_id) THEN
        RAISE EXCEPTION 'ANTECIPACAO_INEXISTENTE: Antecipação não encontrada (talvez já tenha sido excluída). Recarregue a lista.';
      END IF;
    ELSE
      v_alterada := true;
    END IF;
  END IF;

  SELECT json_build_object(
           'id',               a.id,
           'conta_id',         a.conta_id,
           'conta',            c.nome,
           'data',             a.data,
           'valor_antecipado', a.valor_antecipado,
           'valor_liquido',    a.valor_liquido,
           'desconto',         a.desconto,
           'atualizado_em',    a.atualizado_em
         )
    INTO v_reg
    FROM financeiro.antecipacao a
    JOIN financeiro.antecipacao_conta c ON c.id = a.conta_id
   WHERE a.id = v_id;

  RETURN json_build_object(
    'ok',       true,
    'id',       v_id,
    'criada',   v_criada,
    'alterada', (v_criada OR v_alterada),
    'registro', v_reg
  );
END
$$;

-- ── 9. RPC: excluir ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.antecipacao_excluir(p_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/geral/gestao']);

  IF p_id IS NULL THEN
    RAISE EXCEPTION 'ANTECIPACAO_INEXISTENTE: Informe a antecipação a excluir.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('financeiro.antecipacao'));

  DELETE FROM financeiro.antecipacao WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ANTECIPACAO_INEXISTENTE: Antecipação não encontrada (talvez já tenha sido excluída). Recarregue a lista.';
  END IF;
END
$$;

-- ── 10. RPC: desfazer UMA entrada do diário de antecipações ──────────────────
-- Só aceita entrada cuja tabela_alvo é financeiro.antecipacao — um diário_id de OUTRA tabela
-- (gerencial, DRE, patrimônio…) é tratado como inexistente: esta RPC não é porta de entrada para
-- reverter nada fora do registro de antecipações. A permissão é a ÁREA (spec); a regra "ação de
-- terceiro só admin" dos moldes 0200/0206 NÃO foi replicada (decisão de permissão: ver retorno).
CREATE OR REPLACE FUNCTION public.antecipacao_desfazer(p_diario_id bigint)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lote bigint;
  v_rev  int;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/geral/gestao']);

  IF p_diario_id IS NULL THEN
    RAISE EXCEPTION 'ANTECIPACAO_HISTORICO_INEXISTENTE: Entrada de histórico inexistente.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('financeiro.antecipacao'));

  SELECT d.lote_id INTO v_lote
    FROM financeiro.diario_alteracoes d
   WHERE d.id = p_diario_id
     AND d.tabela_alvo = 'financeiro.antecipacao';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ANTECIPACAO_HISTORICO_INEXISTENTE: Entrada de histórico inexistente.';
  END IF;

  -- Carimba as novas entradas do diário com o lote que está sendo revertido (undo auditado, 0199).
  PERFORM set_config('app.diario_undo_de', v_lote::text, true);
  SELECT financeiro.reverter_diario(ARRAY[p_diario_id]) INTO v_rev;

  RETURN json_build_object('revertidos', v_rev, 'total', 1);
END
$$;

-- ── 11. RPC: listar (contas do formulário + registros) ───────────────────────
CREATE OR REPLACE FUNCTION public.antecipacao_listar()
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/geral/gestao']);

  RETURN json_build_object(
    -- Só as ATIVAS: alimenta o <select> do formulário. O registro traz o nome da própria conta
    -- (JOIN abaixo), então uma conta inativada depois continua legível na lista.
    'contas', COALESCE((
      SELECT json_agg(json_build_object('id', c.id, 'nome', c.nome) ORDER BY c.id)
        FROM financeiro.antecipacao_conta c
       WHERE c.ativo
    ), '[]'::json),
    'registros', COALESCE((
      SELECT json_agg(json_build_object(
               'id',               a.id,
               'conta_id',         a.conta_id,
               'conta',            c.nome,
               'data',             a.data,
               'valor_antecipado', a.valor_antecipado,
               'valor_liquido',    a.valor_liquido,
               'desconto',         a.desconto,
               'atualizado_em',    a.atualizado_em
             ) ORDER BY a.data DESC, a.id DESC)
        FROM financeiro.antecipacao a
        JOIN financeiro.antecipacao_conta c ON c.id = a.conta_id
    ), '[]'::json)
  );
END
$$;

-- ── 12. RPC: histórico (entradas do diário só desta tabela) ──────────────────
CREATE OR REPLACE FUNCTION public.antecipacao_historico(p_limite integer DEFAULT 20)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lim int;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/geral/gestao']);

  v_lim := LEAST(GREATEST(COALESCE(p_limite, 20), 1), 200);

  RETURN COALESCE((
    SELECT json_agg(json_build_object(
             'diario_id',    t.id,
             'operacao',     t.operacao,
             'registro_id',  t.registro_id::bigint,
             'usuario_nome', t.usuario_nome,
             'quando',       t.criado_em,
             'e_desfazer',   t.origem_undo IS NOT NULL,
             'antes',        financeiro.antecipacao_diario_campos(t.dados_antes),
             'depois',       financeiro.antecipacao_diario_campos(t.dados_depois)
           ) ORDER BY t.criado_em DESC, t.id DESC)
      FROM (
        -- idx_diario_tabela_criado (tabela_alvo, criado_em DESC) serve este ORDER BY + LIMIT.
        SELECT d.id, d.operacao, d.registro_id, d.usuario_nome, d.criado_em, d.origem_undo,
               d.dados_antes, d.dados_depois
          FROM financeiro.diario_alteracoes d
         WHERE d.tabela_alvo = 'financeiro.antecipacao'
         ORDER BY d.criado_em DESC, d.id DESC
         LIMIT v_lim
      ) t
  ), '[]'::json);
END
$$;

-- ── 13. Privilégios (explícitos, nunca contar com defaults — 0122) ───────────
COMMENT ON FUNCTION public.antecipacao_salvar(bigint, smallint, date, numeric, numeric) IS
  'Registro de antecipações v6.4.0: cria (p_id NULL) ou atualiza. Área financeiro/geral/gestao. Valida conta/data/valores com mensagens ANTECIPACAO_*; no-op não gera diário. Fora da allowlist do verificador e do ingestor.';
COMMENT ON FUNCTION public.antecipacao_excluir(bigint) IS
  'Registro de antecipações v6.4.0: exclui (auditado no diário; reversível por antecipacao_desfazer). Área financeiro/geral/gestao. Fora da allowlist do verificador e do ingestor.';
COMMENT ON FUNCTION public.antecipacao_desfazer(bigint) IS
  'Registro de antecipações v6.4.0: reverte UMA entrada do diário de financeiro.antecipacao via financeiro.reverter_diario. Conflito (linha mudou depois) reprova sem reverter. Área financeiro/geral/gestao. Fora da allowlist do verificador e do ingestor.';
COMMENT ON FUNCTION public.antecipacao_listar() IS
  'Registro de antecipações v6.4.0: contas ativas (formulário) + registros por data desc. Área financeiro/geral/gestao.';
COMMENT ON FUNCTION public.antecipacao_historico(integer) IS
  'Registro de antecipações v6.4.0: últimas entradas do diário de financeiro.antecipacao (campos de negócio apenas). Área financeiro/geral/gestao.';

-- Escrita: nunca verificador/ingestor (REVOKE explícito além do default das duas roles).
REVOKE EXECUTE ON FUNCTION public.antecipacao_salvar(bigint, smallint, date, numeric, numeric)
  FROM PUBLIC, anon, verificador, ingestor;
REVOKE EXECUTE ON FUNCTION public.antecipacao_excluir(bigint)   FROM PUBLIC, anon, verificador, ingestor;
REVOKE EXECUTE ON FUNCTION public.antecipacao_desfazer(bigint)  FROM PUBLIC, anon, verificador, ingestor;
-- Leitura: o verificador entra depois, por assinatura, via derivar-allowlist.mjs.
REVOKE EXECUTE ON FUNCTION public.antecipacao_listar()          FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.antecipacao_historico(integer) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.antecipacao_salvar(bigint, smallint, date, numeric, numeric)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.antecipacao_excluir(bigint)    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.antecipacao_desfazer(bigint)   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.antecipacao_listar()           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.antecipacao_historico(integer) TO authenticated, service_role;

-- ── 14. Guard de EFETIVIDADE ─────────────────────────────────────────────────
-- A transação inteira aborta se a intenção não se cumpriu: assinatura que não resolve, corpo sem a
-- área, sem SECURITY DEFINER/search_path vazio, anon/PUBLIC com EXECUTE, authenticated sem, escrita
-- alcançável por verificador/ingestor, leitura alcançável por ingestor, sobrecarga criada por
-- engano, RLS desligado, policy permissiva, coluna gerada ausente, triggers ausentes, ou diário
-- poluído pela carga. NÃO referencia app.rbac_areas: a área nasce na 0297.
DO $$
DECLARE
  v_sig  text;
  v_proc regprocedure;
  v_n    int;
BEGIN
  FOREACH v_sig IN ARRAY ARRAY[
    'public.antecipacao_salvar(bigint,smallint,date,numeric,numeric)',
    'public.antecipacao_excluir(bigint)',
    'public.antecipacao_desfazer(bigint)',
    'public.antecipacao_listar()',
    'public.antecipacao_historico(integer)'
  ] LOOP
    v_proc := to_regprocedure(v_sig);
    IF v_proc IS NULL THEN
      RAISE EXCEPTION '0296: função % não encontrada', v_sig;
    END IF;
    IF position('''financeiro/geral/gestao''' IN (SELECT prosrc FROM pg_proc WHERE oid = v_proc)) = 0 THEN
      RAISE EXCEPTION '0296: corpo de % não exige financeiro/geral/gestao', v_sig;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = v_proc AND prosecdef
                      AND proconfig @> ARRAY['search_path=""']) THEN
      RAISE EXCEPTION '0296: % sem SECURITY DEFINER ou sem search_path vazio', v_sig;
    END IF;
    IF has_function_privilege('anon', v_proc, 'EXECUTE') THEN
      RAISE EXCEPTION '0296: anon ainda tem EXECUTE em %', v_sig;
    END IF;
    IF NOT has_function_privilege('authenticated', v_proc, 'EXECUTE') THEN
      RAISE EXCEPTION '0296: authenticated sem EXECUTE em %', v_sig;
    END IF;
    IF NOT has_function_privilege('service_role', v_proc, 'EXECUTE') THEN
      RAISE EXCEPTION '0296: service_role sem EXECUTE em %', v_sig;
    END IF;
    IF has_function_privilege('ingestor', v_proc, 'EXECUTE') THEN
      RAISE EXCEPTION '0296: ingestor não deveria ter EXECUTE em %', v_sig;
    END IF;
  END LOOP;

  -- As 3 de ESCRITA nunca chegam ao verificador (credencial só de leitura).
  FOREACH v_sig IN ARRAY ARRAY[
    'public.antecipacao_salvar(bigint,smallint,date,numeric,numeric)',
    'public.antecipacao_excluir(bigint)',
    'public.antecipacao_desfazer(bigint)'
  ] LOOP
    IF has_function_privilege('verificador', to_regprocedure(v_sig), 'EXECUTE') THEN
      RAISE EXCEPTION '0296: verificador não deveria ter EXECUTE em % (escrita)', v_sig;
    END IF;
  END LOOP;

  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname LIKE 'antecipacao\_%';
  IF v_n <> 5 THEN
    RAISE EXCEPTION '0296: % funções public.antecipacao_* (esperado 5; sobrecarga criada por engano?)', v_n;
  END IF;

  -- Auxiliar interna: ninguém de fora executa.
  v_proc := to_regprocedure('financeiro.antecipacao_diario_campos(jsonb)');
  IF v_proc IS NULL THEN
    RAISE EXCEPTION '0296: financeiro.antecipacao_diario_campos(jsonb) não encontrada';
  END IF;
  IF has_function_privilege('anon', v_proc, 'EXECUTE')
     OR has_function_privilege('authenticated', v_proc, 'EXECUTE') THEN
    RAISE EXCEPTION '0296: antecipacao_diario_campos exposta a anon/authenticated';
  END IF;

  -- Tabelas: RLS ligado, ZERO policy, sem grant a anon/authenticated.
  IF (SELECT count(*) FROM pg_class
       WHERE oid IN ('financeiro.antecipacao'::regclass, 'financeiro.antecipacao_conta'::regclass)
         AND relrowsecurity) <> 2 THEN
    RAISE EXCEPTION '0296: RLS não está ligado nas duas tabelas';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policy
              WHERE polrelid IN ('financeiro.antecipacao'::regclass, 'financeiro.antecipacao_conta'::regclass)) THEN
    RAISE EXCEPTION '0296: não pode haver policy nas tabelas de antecipação (deny-all)';
  END IF;
  IF has_table_privilege('anon', 'financeiro.antecipacao', 'SELECT')
     OR has_table_privilege('authenticated', 'financeiro.antecipacao', 'SELECT')
     OR has_table_privilege('anon', 'financeiro.antecipacao_conta', 'SELECT')
     OR has_table_privilege('authenticated', 'financeiro.antecipacao_conta', 'SELECT') THEN
    RAISE EXCEPTION '0296: anon/authenticated com acesso direto às tabelas de antecipação';
  END IF;

  -- Desconto é GERADO (attgenerated = 's' = STORED).
  IF NOT EXISTS (SELECT 1 FROM pg_attribute
                  WHERE attrelid = 'financeiro.antecipacao'::regclass
                    AND attname = 'desconto' AND attgenerated = 's') THEN
    RAISE EXCEPTION '0296: coluna desconto não é gerada';
  END IF;

  -- Triggers: touch (BEFORE) e diário (AFTER), este com a função genérica da 0199.
  IF NOT EXISTS (SELECT 1 FROM pg_trigger t
                  WHERE t.tgrelid = 'financeiro.antecipacao'::regclass AND NOT t.tgisinternal
                    AND t.tgname = 'trg_diario_antecipacao'
                    AND t.tgfoid = 'financeiro.fn_diario_alteracoes()'::regprocedure) THEN
    RAISE EXCEPTION '0296: trigger do diário ausente em financeiro.antecipacao';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger t
                  WHERE t.tgrelid = 'financeiro.antecipacao'::regclass AND NOT t.tgisinternal
                    AND t.tgname = 'trg_touch_antecipacao'
                    AND t.tgfoid = 'financeiro.fn_dre_touch_atualizado_em()'::regprocedure) THEN
    RAISE EXCEPTION '0296: trigger de carimbo ausente em financeiro.antecipacao';
  END IF;

  -- A carga NÃO pode ter gerado diário (o trigger veio depois dela).
  SELECT count(*) INTO v_n FROM financeiro.diario_alteracoes WHERE tabela_alvo = 'financeiro.antecipacao';
  IF v_n <> 0 THEN
    RAISE EXCEPTION '0296: % entradas de diário da carga inicial (esperado 0)', v_n;
  END IF;

  -- Carga intacta depois dos triggers (38 linhas).
  SELECT count(*) INTO v_n FROM financeiro.antecipacao;
  IF v_n <> 38 THEN
    RAISE EXCEPTION '0296: % linhas em financeiro.antecipacao ao fim (esperado 38)', v_n;
  END IF;
END
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
