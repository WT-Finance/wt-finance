-- ---------------------------------------------------------------------------
-- 0295 — feat(v6.4.0/M2): base de ingestão `contas-receber` (Contas a receber, Monde)
--        + fotos da posição de recebíveis, gravadas na MESMA transação da promoção
--
-- Classificação: ADITIVA (CREATE TABLE/INDEX novos + 4 funções NOVAS + 3 CREATE OR REPLACE que só
-- ACRESCENTAM um ramo + REVOKE/GRANT + guard de efetividade).
--
-- DECLARAÇÃO PRÉVIA (regime aditivo / autônomo):
--   • O QUE FAZ:
--     (1) `raw.contas_receber` (a base viva: 1 linha por título, só a LISTA FECHADA de colunas do
--         briefing — Número, Emissão, Pessoa, Descrição, Vencimento, Liquidação, Valor Final,
--         Conferido, Operação Própria; Observações/Pendente com/Documento/Conta (Previsão) NUNCA
--         entram) e `raw.contas_receber_staging` (UNLOGGED, `LIKE ... INCLUDING DEFAULTS`, molde
--         0277). RLS ligado, sem policy, REVOKE de PUBLIC/anon/authenticated. A raw tem CHECK no
--         domínio de `Conferido` (segunda rede; a staging NÃO herda o CHECK, de propósito: valor
--         fora do domínio entra na staging e `validar_carga_contas_receber` o NOMEIA);
--     (2) `financeiro.contas_receber_foto_carga` (uma linha por carga promovida: data da posição,
--         contadores) e `financeiro.contas_receber_foto` (os títulos EM ABERTO ∪ os marcados
--         'Inadimplente' naquela posição). Histórico que NÃO se reconstrói depois — por isso é
--         gravado na transação da promoção. RLS ligado, sem policy, REVOKE de PUBLIC/anon/
--         authenticated e SEM GRANT de tabela a ninguém: acesso só pelas RPCs SECURITY DEFINER
--         (postura de `ingestao.promocao`, 0277);
--     (3) 4 RPCs NOVAS de carga (molde 0278/Aberto): `limpar_staging_contas_receber()`,
--         `inserir_lote_staging_contas_receber(jsonb)`, `validar_carga_contas_receber()` e
--         `promover_carga_contas_receber(jsonb, uuid)`. Advisory lock 4017060 (chave nova; as de
--         4017001..4017050 estão listadas no header da 0278);
--     (4) `CREATE OR REPLACE` de `ingestao_carga_abrir`, `ingestao_carga_ultima` e
--         `ingestao_soma_por_ano`, escritos a partir do CATÁLOGO VIVO de 15/10/2026 (skill
--         banco-e-rpc §5), só para aceitar 'contas-receber' (a base nova por ÚLTIMO nas listas).
--         Em `ingestao_soma_por_ano`: ramo próprio (ano do VENCIMENTO, Σ valor_final) e o `ELSE`
--         implícito de Operação vira `ELSIF` explícito + `ELSE RAISE` (fail-closed: uma sétima base
--         sem ramo deixa de cair, calada, na soma de Operação).
--   • ADITIVA / RETROCOMPATÍVEL: nenhuma assinatura existente muda; as 3 funções reescritas só
--     ganham um valor aceito (as 5 bases vivas respondem exatamente como antes — o ramo de
--     Operação tem o MESMO corpo, só deixou de ser o ELSE). NÃO ESCREVE em dado pré-existente: não
--     há DROP, TRUNCATE, ALTER TABLE, UPDATE nem DELETE no nível da migration (TRUNCATE aparece só
--     DENTRO do corpo das RPCs de carga, que rodam em runtime).
--   • ⚠️ DEPENDÊNCIA DE UM PATCH DESTRUTIVO (aplicação HUMANA, TTY): os CHECKs
--     `ingestao_carga_base_valida` (ingestao.carga) e `ingestao_promocao_base_valida`
--     (ingestao.promocao) ainda listam 5 bases. Ampliá-los exige DROP CONSTRAINT (destrutivo por
--     classificação) — `supabase/patches/contas_receber_checks_ingestao.sql`. Até ele ser aplicado,
--     abrir carga da base nova falha no CHECK de ingestao.carga: fail-closed, a base fica intacta
--     e nada é gravado.
--   • RBAC (por desenho): as 4 RPCs de carga NÃO chamam `app.exigir_acesso` — não têm sessão de
--     usuário; são RPC de CARGA chamada pela rota `/api/ingestao/{base}`, protegida só por GRANT
--     (mesma classe de promover_carga_aberto, 0278): REVOKE de PUBLIC/anon/authenticated e GRANT a
--     `service_role` E `ingestor` (credencial de máquina que aplica, 0274/0279). As 3 reescritas
--     seguem service_role-only, como já estavam.
--     ⚠️ PII: `Pessoa`, `Descrição` e `Operação Própria` contêm nomes de pessoas (decisão do Yan,
--     GATE 1) — ficam só em raw.contas_receber, sob a mesma proteção; nenhuma mensagem de erro
--     das RPCs as reproduz, e as FOTOS não as guardam.
--   • CONTRATO DO `p_linhas` de `inserir_lote_staging_contas_receber` — array jsonb de objetos:
--       arquivo_origem (text, obrigatório) · linha_origem (int) · numero (text, obrigatório) ·
--       emissao (date ISO | null) · pessoa · descricao · vencimento (date ISO | null) ·
--       liquidacao (date ISO | null) · valor_final (number OU string numérica, obrigatório) ·
--       conferido (text | null) · operacao_propria
--     Texto vazio vira NULL. Linha com `arquivo_origem`, `numero` ou `valor_final` ausente/vazio
--     REPROVA o lote (22023, LOTE_LINHA_INVALIDA) citando só a posição no lote e o nome do campo —
--     nunca o conteúdo da linha (PII). `valor_final` é arredondado a 2 casas na chegada (NUMERIC(18,2)): o
--     parser deve emitir `toCentavos(v)/100` para o que se envia ser idêntico ao que se grava.
--   • CONTRATO DO CHECKSUM de `promover_carga_contas_receber(p_checksums, p_carga_id)` — array
--     jsonb, UM objeto por ARQUIVO da carga, TODOS obrigatórios:
--       { "escopo": "arquivo",
--         "chave":  { "arquivo_origem": text },   -- o MESMO texto gravado em arquivo_origem
--         "linhas": integer,                      -- Número da linha de total do arquivo
--         "centavos": bigint }                    -- Valor Final da linha de total, em centavos,
--                                                    arredondado como o NUMERIC(18,2) (toCentavos)
--     Tolerância ZERO, comparação de igualdade exata contra o GRAVADO em raw.contas_receber.
--     Fail-closed: array vazio ⇒ CHECKSUM_AUSENTE; escopo diferente de 'arquivo', `arquivo_origem`,
--     `linhas` ou `centavos` ausentes ⇒ CHECKSUM_INVALIDO; arquivo gravado SEM checksum ⇒
--     CHECKSUM_AUSENTE (sem isto um arquivo a mais passaria sem conferência); qualquer divergência
--     ⇒ CHECKSUM_FALHOU. Em qualquer RAISE a transação inteira volta e a base anterior fica intacta.
--   • FOTO (a razão desta base ter a promoção diferente das irmãs): na mesma transação, depois da
--     conferência, a promoção grava `contas_receber_foto_carga` + `contas_receber_foto`.
--     `data_posicao` = (now() AT TIME ZONE 'America/Sao_Paulo')::date — explícito, porque a
--     migration/role dono pode estar em UTC (skill banco-e-rpc §3). Definições:
--       em aberto    = liquidacao IS NULL
--       a vencer     = em aberto E vencimento > data_posicao
--       inadimplente = em aberto E conferido = 'Inadimplente'   (decisão do GATE 1: só a MARCAÇÃO)
--     O contador `inadimplente_*` NÃO inclui o marcado já liquidado; esse entra nas LINHAS da foto
--     (`contas_receber_foto`) mas não no contador.
--     QUEM LÊ O QUÊ (v6.4.0): a página NÃO lê `financeiro.contas_receber_foto` — a 0297 calcula o
--     "recuperado do ano" direto em raw.contas_receber, e `comparativo`/`evolucao` leem só
--     `contas_receber_foto_carga`. A foto POR TÍTULO existe pelo invariante 4 do briefing (histórico
--     por título que só a plataforma guarda e não se reconstrói depois), SEM leitor nesta versão.
--     VOLUME MEDIDO: ≈ 4,85 mil linhas por carga (4.830 em aberto + ~22 marcados 'Inadimplente' já
--     liquidados, no export de 15/10) ⇒ ≈ 1,8 mi de linhas/ano com UMA carga por dia. RETENÇÃO: decisão
--     PENDENTE do Yan (registrada no out-briefing); qualquer limpeza futura é DELETE em dado existente,
--     isto é, DESTRUTIVA (confirmação humana em TTY).
--     Replay idempotente por `ingestao.promocao`: mesma (base, carga_id) devolve o resultado
--     guardado, sem regravar a base nem a foto.
--   • ESTADO ANTES (para o revisor): 'contas-receber' ainda NÃO está em `BASES_INGESTAO`
--     (src/lib/ingestao/bases.ts) nem em `rpcs-ingestor.ts`; `api_chave_escopo_bases_validas` e
--     `ingestao_expectativa_alvo_valido` NÃO mudam (sem RPA/vigia para esta base, briefing §11).
--
-- Pós-aplicação (orquestrador): `npm run db:baseline`; regenerar `src/types/database.ts`; incluir as 4
-- RPCs em `src/lib/ingestao/rpcs-ingestor.ts` e rodar `scripts/credencial/derivar-allowlist.mjs`;
-- verificar por REST com service_role (db query NÃO executa o corpo — skill banco-e-rpc §6).
--
-- DOWN (destrutivo — humano em TTY; nada aqui se aplica sozinho):
--   -- 1) as 3 funções reescritas: reaplicar o corpo do CATÁLOGO VIVO anterior a esta migration
--   --    (ingestao_carga_abrir e ingestao_carga_ultima = 0276; ingestao_soma_por_ano = 0280), isto
--   --    é, com a lista de 5 bases e, em soma_por_ano, com o `ELSE` de Operação — NÃO apagar as
--   --    funções: o app vivo as chama.
--   -- 2) as 4 RPCs novas:
--   DROP FUNCTION public.promover_carga_contas_receber(jsonb, uuid);
--   DROP FUNCTION public.validar_carga_contas_receber();
--   DROP FUNCTION public.inserir_lote_staging_contas_receber(jsonb);
--   DROP FUNCTION public.limpar_staging_contas_receber();
--   -- 3) tabelas (só vazias; as FOTOS são histórico NÃO reconstruível — exportar antes):
--   DROP TABLE financeiro.contas_receber_foto;
--   DROP TABLE financeiro.contas_receber_foto_carga;
--   DROP TABLE raw.contas_receber_staging;
--   DROP TABLE raw.contas_receber;
--   -- 4) o patch destrutivo dos CHECKs (supabase/patches/contas_receber_checks_ingestao.sql) tem DOWN
--   --    próprio e só volta às 5 bases se não houver linha de 'contas-receber'.
-- ---------------------------------------------------------------------------

BEGIN;

-- ── 1. raw.contas_receber — a base viva ─────────────────────────────────────────────────
CREATE TABLE raw.contas_receber (
  id                BIGSERIAL    PRIMARY KEY,
  arquivo_origem    TEXT         NOT NULL,
  linha_origem      INT,                      -- linha do arquivo, 1-based com cabeçalho
  numero            TEXT         NOT NULL,    -- pode ter sufixo "-N"; único por carga
  emissao           DATE,                     -- data zero/inválida do export vira NULL
  pessoa            TEXT,                     -- PII
  descricao         TEXT,                     -- PII em parte das linhas; NÃO é a categoria
  vencimento        DATE,
  liquidacao        DATE,                     -- NULL = em aberto
  valor_final       NUMERIC(18,2) NOT NULL,
  conferido         TEXT,                     -- NULL | Sim | Pendente | Enviado para o banco | Inadimplente
  operacao_propria  TEXT,                     -- PII em parte das linhas
  carregado_em      TIMESTAMPTZ  NOT NULL DEFAULT now(),

  -- Domínio de `Conferido` (briefing inv. 3/GATE 1). CASE-free: IS NULL OR IN é binário (nunca NULL
  -- no resultado), então não há o fail-open do CASE sem ELSE (skill banco-e-rpc §5).
  CONSTRAINT contas_receber_conferido_dominio CHECK (
    conferido IS NULL
    OR conferido IN ('Sim', 'Pendente', 'Enviado para o banco', 'Inadimplente')
  )
);

COMMENT ON TABLE raw.contas_receber IS
  'v6.4.0 (0295): Contas a receber do Monde — 1 linha por título, só a lista fechada de colunas do briefing. Substituída por inteiro a cada carga (promover_carga_contas_receber). Pessoa, Descricao e Operacao Propria contêm nomes de pessoas: só a área financeiro/geral lê, nunca vai a relatório commitado.';

-- Rede de segurança do "Número repetido ⇒ a carga reprova" (a validação nomeia o erro antes; o
-- índice é o cinto caso alguém promova sem validar).
CREATE UNIQUE INDEX contas_receber_numero_uniq ON raw.contas_receber (numero);
CREATE INDEX contas_receber_vencimento_idx ON raw.contas_receber (vencimento);

ALTER TABLE raw.contas_receber ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON raw.contas_receber FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON raw.contas_receber TO service_role;
GRANT USAGE, SELECT ON SEQUENCE raw.contas_receber_id_seq TO service_role;

-- Staging UNLOGGED — molde 0277. `LIKE ... INCLUDING DEFAULTS` NÃO copia o CHECK nem os índices
-- (de propósito, ver header); copia o NOT NULL de arquivo_origem/numero/valor_final.
CREATE UNLOGGED TABLE raw.contas_receber_staging
  (LIKE raw.contas_receber INCLUDING DEFAULTS);

ALTER TABLE raw.contas_receber_staging ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON raw.contas_receber_staging FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE raw.contas_receber_staging IS
  'v6.4.0 (0295): staging UNLOGGED de raw.contas_receber (sem o CHECK de Conferido e sem o índice único: validar_carga_contas_receber nomeia esses erros). Não sobrevive a crash no meio de uma carga multi-lote: o sintoma é "Nenhuma linha válida na carga"; a base viva fica intacta e a ação é refazer o upload.';

-- ── 2. Fotos da posição de recebíveis ───────────────────────────────────────────────────
CREATE TABLE financeiro.contas_receber_foto_carga (
  carga_id            UUID          PRIMARY KEY,
  data_posicao        DATE          NOT NULL,   -- "hoje" de São Paulo no momento da promoção
  gravado_em          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  titulos             INT           NOT NULL,   -- total de títulos da carga
  em_aberto           INT           NOT NULL,   -- liquidacao IS NULL
  a_vencer_n          INT           NOT NULL,   -- em aberto e vencimento > data_posicao
  a_vencer_valor      NUMERIC(18,2) NOT NULL,
  inadimplente_n      INT           NOT NULL,   -- em aberto E conferido = 'Inadimplente'
  inadimplente_valor  NUMERIC(18,2) NOT NULL
);

COMMENT ON TABLE financeiro.contas_receber_foto_carga IS
  'v6.4.0 (0295): uma linha por carga de Contas a receber promovida — a posição daquele dia (data_posicao = hoje SP). Gravada na MESMA transação de promover_carga_contas_receber: histórico que não se reconstrói depois. inadimplente_* = só em aberto E marcado Inadimplente (o marcado já liquidado entra nas linhas de contas_receber_foto, não neste contador).';

CREATE INDEX contas_receber_foto_carga_posicao_idx
  ON financeiro.contas_receber_foto_carga (data_posicao DESC, gravado_em DESC);

CREATE TABLE financeiro.contas_receber_foto (
  carga_id      UUID          NOT NULL REFERENCES financeiro.contas_receber_foto_carga (carga_id),
  numero        TEXT          NOT NULL,
  vencimento    DATE,
  liquidacao    DATE,
  valor_final   NUMERIC(18,2) NOT NULL,
  conferido     TEXT,
  PRIMARY KEY (carga_id, numero),
  CONSTRAINT contas_receber_foto_conferido_dominio CHECK (
    conferido IS NULL
    OR conferido IN ('Sim', 'Pendente', 'Enviado para o banco', 'Inadimplente')
  )
);

COMMENT ON TABLE financeiro.contas_receber_foto IS
  'v6.4.0 (0295): os títulos EM ABERTO (liquidacao IS NULL) e os marcados Inadimplente (inclusive já liquidados) de cada carga promovida. Sem Pessoa/Descricao/Operacao Propria por desenho: a foto guarda só o necessário para o histórico por título. Sem leitor na v6.4.0 (a página lê raw.contas_receber e contas_receber_foto_carga); retenção pendente de decisão.';

ALTER TABLE financeiro.contas_receber_foto_carga ENABLE ROW LEVEL SECURITY;
ALTER TABLE financeiro.contas_receber_foto       ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON financeiro.contas_receber_foto_carga FROM PUBLIC, anon, authenticated;
REVOKE ALL ON financeiro.contas_receber_foto       FROM PUBLIC, anon, authenticated;
-- Sem GRANT a service_role: acesso só pelas RPCs SECURITY DEFINER (owner postgres, ignora RLS).

-- ── 3. As 4 RPCs de carga ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.limpar_staging_contas_receber()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(4017060); -- chave própria da base Contas a receber (header)
  TRUNCATE raw.contas_receber_staging RESTART IDENTITY;
END;
$$;

CREATE OR REPLACE FUNCTION public.inserir_lote_staging_contas_receber(p_linhas jsonb)
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

  -- Campos obrigatórios (arquivo_origem, numero, valor_final) ausentes ou vazios: o erro NOMEIA só a
  -- posição da linha no lote e o campo. NUNCA o conteúdo da linha: o DETAIL do 23502 (NOT NULL) que o
  -- INSERT levantaria cita a linha inteira ("Failing row contains ...") e vazaria Pessoa/Descrição/
  -- Operação Própria (PII) para a mensagem de erro/log.
  SELECT t.ord, c.campo INTO v_idx, v_campo
    FROM jsonb_array_elements(p_linhas) WITH ORDINALITY AS t(x, ord)
   CROSS JOIN (VALUES (1, 'arquivo_origem'), (2, 'numero'), (3, 'valor_final')) AS c(n, campo)
   WHERE coalesce(btrim(t.x->>c.campo), '') = ''
   ORDER BY t.ord, c.n
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'LOTE_LINHA_INVALIDA: a linha na posição % do lote (base 1) está sem o campo obrigatório "%" (ausente ou vazio)',
      v_idx, v_campo USING ERRCODE = '22023';
  END IF;

  INSERT INTO raw.contas_receber_staging (
    arquivo_origem, linha_origem, numero, emissao, pessoa, descricao,
    vencimento, liquidacao, valor_final, conferido, operacao_propria
  )
  SELECT
    x->>'arquivo_origem',
    (NULLIF(x->>'linha_origem', ''))::int,
    NULLIF(x->>'numero', ''),
    (NULLIF(x->>'emissao', ''))::date,
    NULLIF(x->>'pessoa', ''),
    NULLIF(x->>'descricao', ''),
    (NULLIF(x->>'vencimento', ''))::date,
    (NULLIF(x->>'liquidacao', ''))::date,
    (x->>'valor_final')::numeric(18,2),
    NULLIF(x->>'conferido', ''),
    NULLIF(x->>'operacao_propria', '')
  FROM jsonb_array_elements(p_linhas) AS x;
END;
$$;

CREATE OR REPLACE FUNCTION public.validar_carga_contas_receber()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_total       int;
  v_erros       text[] := '{}';
  v_rep_n       int;
  v_rep_linhas  bigint;
  v_rep_ex      text;
  v_dom_n       int;
  v_dom_valores text;
  v_negativos   int;
BEGIN
  SELECT count(*) INTO v_total FROM raw.contas_receber_staging;
  IF v_total = 0 THEN
    RETURN jsonb_build_object(
      'ok', false, 'total', 0,
      'erros', jsonb_build_array('Nenhuma linha válida na carga — arquivo vazio ou inválido.')
    );
  END IF;

  -- Número repetido (dentro de um arquivo ou ENTRE arquivos): faixa de vencimento sobreposta ou
  -- título exportado duas vezes. Nomeia a quantidade; só o Número (não é dado pessoal) como exemplo.
  WITH rep AS (
    SELECT numero, count(*) AS n
      FROM raw.contas_receber_staging
     GROUP BY numero
    HAVING count(*) > 1
  ), ex AS (
    SELECT numero FROM rep ORDER BY numero LIMIT 5
  )
  SELECT (SELECT count(*) FROM rep),
         (SELECT coalesce(sum(n), 0) FROM rep),
         (SELECT string_agg(numero, ', ' ORDER BY numero) FROM ex)
    INTO v_rep_n, v_rep_linhas, v_rep_ex;
  IF v_rep_n > 0 THEN
    v_erros := v_erros || format(
      '%s número(s) de título repetido(s) na carga (%s linhas envolvidas; ex.: %s). Cada título deve aparecer uma vez só — confira se as faixas de vencimento dos arquivos se sobrepõem.',
      v_rep_n, v_rep_linhas, v_rep_ex);
  END IF;

  -- Conferido fora do domínio (a staging não tem o CHECK; aqui o erro ganha nome e valores).
  SELECT count(*),
         left(string_agg(DISTINCT '"' || conferido || '"', ', '), 200)
    INTO v_dom_n, v_dom_valores
    FROM raw.contas_receber_staging
   WHERE conferido IS NOT NULL
     AND conferido NOT IN ('Sim', 'Pendente', 'Enviado para o banco', 'Inadimplente');
  IF v_dom_n > 0 THEN
    v_erros := v_erros || format(
      '%s título(s) com "Conferido" fora do domínio permitido (vazio, Sim, Pendente, Enviado para o banco, Inadimplente): %s.',
      v_dom_n, v_dom_valores);
  END IF;

  -- Valor Final < 0: o export de uma base só a receber só traz crédito. Um arquivo misto pagar +
  -- receber traz débito (negativo) e o total com sinal. ZERO é legítimo (medido na M1: 216 títulos
  -- em 2024 e 395 em 2025-26, quase todos faturas de cliente/fornecedor zeradas por compensação).
  SELECT count(*) INTO v_negativos FROM raw.contas_receber_staging WHERE valor_final < 0;
  IF v_negativos > 0 THEN
    v_erros := v_erros || format(
      '%s título(s) com Valor Final negativo. A base é só de contas a receber (Valor Final nunca negativo) — o arquivo pode misturar contas a pagar.',
      v_negativos);
  END IF;

  RETURN jsonb_build_object(
    'ok', cardinality(v_erros) = 0,
    'total', v_total,
    'erros', to_jsonb(v_erros)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.promover_carga_contas_receber(p_checksums jsonb, p_carga_id uuid)
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
  v_arq            text;
  v_linhas_sql     int;
  v_centavos_sql   bigint;
  v_conferidos     int := 0;
  v_falhas         jsonb := '[]'::jsonb;
  v_sem_chk        text;
  v_avisos         text[] := '{}';
  v_data           date;
  v_titulos        int;
  v_em_aberto      int;
  v_a_vencer_n     int;
  v_a_vencer_valor numeric(18,2);
  v_inad_n         int;
  v_inad_valor     numeric(18,2);
  v_sem_venc       int;
  v_result         jsonb;
BEGIN
  IF p_carga_id IS NULL THEN
    RAISE EXCEPTION 'CARGA_ID_OBRIGATORIO: promover_carga_contas_receber exige carga_id' USING ERRCODE = '22023';
  END IF;
  IF p_checksums IS NULL OR jsonb_typeof(p_checksums) <> 'array' THEN
    RAISE EXCEPTION 'CHECKSUMS_OBRIGATORIOS: promover_carga_contas_receber exige p_checksums (array jsonb)' USING ERRCODE = '22023';
  END IF;

  -- Array VAZIO não passa: sem isto o loop de conferência roda zero vezes e a função TROCA A BASE
  -- INTEIRA devolvendo sucesso com checksums_conferidos = 0 (mesma rede de promover_carga_aberto).
  IF jsonb_array_length(p_checksums) = 0 THEN
    RAISE EXCEPTION 'CHECKSUM_AUSENTE: esta base é conferida por checksum e a carga não trouxe nenhum (contrato ingestao-v1 §4)'
      USING ERRCODE = '22023';
  END IF;

  SET LOCAL lock_timeout = '10s';
  PERFORM pg_advisory_xact_lock(4017060); -- chave própria da base Contas a receber

  -- Replay: a MESMA carga repetida devolve o resultado guardado, sem regravar base nem foto.
  SELECT resultado INTO v_existente FROM ingestao.promocao
   WHERE base = 'contas-receber' AND carga_id = p_carga_id;
  IF FOUND THEN
    RETURN v_existente;
  END IF;

  SELECT count(*) INTO v_total_stg FROM raw.contas_receber_staging;
  IF v_total_stg = 0 THEN
    RAISE EXCEPTION 'Carga abortada: staging vazia — nada a promover.';
  END IF;

  -- Rede: quem chamar a promoção sem passar pela validação não troca a base com número repetido,
  -- Conferido fora do domínio ou valor negativo. Mesma função da validação (uma só cópia do SQL).
  v_valid := public.validar_carga_contas_receber();
  IF NOT coalesce((v_valid->>'ok')::boolean, false) THEN
    RAISE EXCEPTION 'VALIDACAO_REPROVADA: %', left((v_valid->'erros')::text, 1500)
      USING ERRCODE = '22023';
  END IF;

  TRUNCATE raw.contas_receber RESTART IDENTITY;
  INSERT INTO raw.contas_receber (
    arquivo_origem, linha_origem, numero, emissao, pessoa, descricao,
    vencimento, liquidacao, valor_final, conferido, operacao_propria
  )
  SELECT
    arquivo_origem, linha_origem, numero, emissao, pessoa, descricao,
    vencimento, liquidacao, valor_final, conferido, operacao_propria
  FROM raw.contas_receber_staging;

  -- ── Conferência POR ARQUIVO contra o GRAVADO (não contra a staging) ───────────────────────
  FOR v_chk IN SELECT * FROM jsonb_array_elements(p_checksums)
  LOOP
    v_arq := v_chk->'chave'->>'arquivo_origem';
    IF coalesce(v_chk->>'escopo', '') <> 'arquivo' OR v_arq IS NULL THEN
      RAISE EXCEPTION 'CHECKSUM_INVALIDO: esta base só aceita checksum de escopo "arquivo" com chave.arquivo_origem (escopo %)',
        v_chk->>'escopo' USING ERRCODE = '22023';
    END IF;
    IF v_chk->>'centavos' IS NULL OR v_chk->>'linhas' IS NULL THEN
      RAISE EXCEPTION 'CHECKSUM_INVALIDO: checksum do arquivo % sem "linhas" ou "centavos"', v_arq
        USING ERRCODE = '22023';
    END IF;

    SELECT count(*), coalesce(round(sum(r.valor_final) * 100), 0)::bigint
      INTO v_linhas_sql, v_centavos_sql
      FROM raw.contas_receber r
     WHERE r.arquivo_origem = v_arq;

    v_conferidos := v_conferidos + 1;

    IF v_centavos_sql <> (v_chk->>'centavos')::bigint
       OR v_linhas_sql <> (v_chk->>'linhas')::int THEN
      v_falhas := v_falhas || jsonb_build_object(
        'escopo', v_chk->>'escopo', 'chave', v_chk->'chave',
        'centavos_esperado', (v_chk->>'centavos')::bigint, 'centavos_gravado', v_centavos_sql,
        'linhas_esperadas', v_chk->>'linhas', 'linhas_gravadas', v_linhas_sql
      );
    END IF;
  END LOOP;

  IF jsonb_array_length(v_falhas) > 0 THEN
    RAISE EXCEPTION 'CHECKSUM_FALHOU: % de % conferência(s) não fecharam contra o gravado: %',
      jsonb_array_length(v_falhas), v_conferidos, left(v_falhas::text, 2000)
      USING ERRCODE = '22023';
  END IF;

  -- Cobertura: todo arquivo GRAVADO tem de ter tido o seu checksum conferido. Sem isto, um arquivo
  -- a mais na carga (sem linha em p_checksums) passaria sem nenhuma conferência. A conferência roda
  -- sobre os arquivos DISTINTOS (poucos), não por linha: o NOT EXISTS corre uma vez por arquivo.
  SELECT string_agg(a.arquivo_origem, ', ' ORDER BY a.arquivo_origem)
    INTO v_sem_chk
    FROM (SELECT DISTINCT r.arquivo_origem FROM raw.contas_receber r) a
   WHERE NOT EXISTS (
     SELECT 1 FROM jsonb_array_elements(p_checksums) c
      WHERE c->'chave'->>'arquivo_origem' = a.arquivo_origem
   );
  IF v_sem_chk IS NOT NULL THEN
    RAISE EXCEPTION 'CHECKSUM_AUSENTE: arquivo(s) gravado(s) sem checksum conferido: %', left(v_sem_chk, 500)
      USING ERRCODE = '22023';
  END IF;

  -- ── Foto da posição, na MESMA transação ──────────────────────────────────────────────────
  -- "Hoje" de São Paulo explícito: a migration/role dono pode estar em UTC (skill banco-e-rpc §3).
  v_data := (now() AT TIME ZONE 'America/Sao_Paulo')::date;

  SELECT count(*),
         count(*) FILTER (WHERE liquidacao IS NULL),
         count(*) FILTER (WHERE liquidacao IS NULL AND vencimento > v_data),
         coalesce(sum(valor_final) FILTER (WHERE liquidacao IS NULL AND vencimento > v_data), 0),
         count(*) FILTER (WHERE liquidacao IS NULL AND conferido = 'Inadimplente'),
         coalesce(sum(valor_final) FILTER (WHERE liquidacao IS NULL AND conferido = 'Inadimplente'), 0),
         count(*) FILTER (WHERE liquidacao IS NULL AND vencimento IS NULL)
    INTO v_titulos, v_em_aberto, v_a_vencer_n, v_a_vencer_valor, v_inad_n, v_inad_valor, v_sem_venc
    FROM raw.contas_receber;

  INSERT INTO financeiro.contas_receber_foto_carga (
    carga_id, data_posicao, titulos, em_aberto,
    a_vencer_n, a_vencer_valor, inadimplente_n, inadimplente_valor
  ) VALUES (
    p_carga_id, v_data, v_titulos, v_em_aberto,
    v_a_vencer_n, v_a_vencer_valor, v_inad_n, v_inad_valor
  );

  -- Linhas: em aberto ∪ marcados Inadimplente (inclusive liquidados). Histórico por título (invariante 4); sem leitor na v6.4.0.
  -- `conferido = 'Inadimplente'` é NULL (não true) quando conferido é nulo: a linha só entra se
  -- estiver em aberto.
  INSERT INTO financeiro.contas_receber_foto (
    carga_id, numero, vencimento, liquidacao, valor_final, conferido
  )
  SELECT p_carga_id, r.numero, r.vencimento, r.liquidacao, r.valor_final, r.conferido
    FROM raw.contas_receber r
   WHERE r.liquidacao IS NULL OR r.conferido = 'Inadimplente';

  IF v_sem_venc > 0 THEN
    v_avisos := v_avisos || format(
      '%s título(s) em aberto sem data de vencimento: contam como em aberto, mas não entram em "a vencer".',
      v_sem_venc);
  END IF;

  -- Posição sem NENHUM título em aberto: pode ser real, mas é o sintoma típico de um relatório
  -- exportado só com liquidados. Aviso (não reprova): a carga é legítima e a foto fica gravada.
  IF v_em_aberto = 0 THEN
    v_avisos := v_avisos || 'Nenhum título em aberto na carga — confira se o relatório não foi exportado só com liquidados; a posição da página fica zerada.'::text;
  END IF;

  v_result := jsonb_build_object(
    'linhas', v_total_stg,
    'checksums_conferidos', v_conferidos,
    'checksums_nao_conferiveis', 0,
    'foto', jsonb_build_object(
      'data_posicao', v_data,
      'em_aberto', v_em_aberto,
      'inadimplente_n', v_inad_n,
      'inadimplente_valor', v_inad_valor
    ),
    'avisos', to_jsonb(v_avisos)
  );

  INSERT INTO ingestao.promocao (base, carga_id, resultado)
  VALUES ('contas-receber', p_carga_id, v_result)
  ON CONFLICT (base, carga_id) DO NOTHING;

  TRUNCATE raw.contas_receber_staging RESTART IDENTITY;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.limpar_staging_contas_receber()                       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.inserir_lote_staging_contas_receber(jsonb)            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validar_carga_contas_receber()                        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.promover_carga_contas_receber(jsonb, uuid)            FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.limpar_staging_contas_receber()                        TO service_role, ingestor;
GRANT EXECUTE ON FUNCTION public.inserir_lote_staging_contas_receber(p_linhas jsonb)    TO service_role, ingestor;
GRANT EXECUTE ON FUNCTION public.validar_carga_contas_receber()                         TO service_role, ingestor;
GRANT EXECUTE ON FUNCTION public.promover_carga_contas_receber(p_checksums jsonb, p_carga_id uuid) TO service_role, ingestor;

COMMENT ON FUNCTION public.limpar_staging_contas_receber() IS
  'v6.4.0 (0295): limpa raw.contas_receber_staging antes do primeiro lote de uma carga. SEM exigir_acesso no corpo POR DESENHO: RPC de carga, protegida por GRANT — só service_role/ingestor executam.';
COMMENT ON FUNCTION public.inserir_lote_staging_contas_receber(jsonb) IS
  'v6.4.0 (0295): insere um lote na staging de Contas a receber (chaves por linha: arquivo_origem, linha_origem, numero, emissao, pessoa, descricao, vencimento, liquidacao, valor_final, conferido, operacao_propria). SEM exigir_acesso no corpo POR DESENHO: RPC de carga, protegida por GRANT — só service_role/ingestor executam.';
COMMENT ON FUNCTION public.validar_carga_contas_receber() IS
  'v6.4.0 (0295): valida a staging de Contas a receber ANTES de qualquer destruição e devolve {ok,total,erros}. Reprova: staging vazia, número de título repetido (dentro ou entre arquivos), Conferido fora do domínio e Valor Final negativo (zero é legítimo). SEM exigir_acesso no corpo POR DESENHO: RPC de carga, protegida por GRANT — só service_role/ingestor executam.';
COMMENT ON FUNCTION public.promover_carga_contas_receber(jsonb, uuid) IS
  'v6.4.0 (0295): promove a staging de Contas a receber para raw.contas_receber numa transação única (TRUNCATE + INSERT), confere o checksum POR ARQUIVO (linhas + centavos da linha de total) contra o GRAVADO e grava a foto da posição (financeiro.contas_receber_foto_carga/_foto) na mesma transação. RAISE em qualquer divergência: base e fotos anteriores intactas. Idempotente por (base, carga_id) via ingestao.promocao. SEM exigir_acesso no corpo POR DESENHO: RPC de carga, protegida por GRANT — só service_role/ingestor executam.';

-- ── 4. As 3 funções existentes, reescritas do CATÁLOGO VIVO (15/10/2026) ────────────────
-- Única mudança de cada uma: 'contas-receber' na lista de bases aceitas (por ÚLTIMO) e, em
-- ingestao_soma_por_ano, o ramo novo + ELSIF explícito de Operação + ELSE RAISE.

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
       'lancamentos-aberto', 'lancamentos-operacao', 'contas-receber'
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
       'lancamentos-aberto', 'lancamentos-operacao', 'contas-receber'
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
       'lancamentos-aberto', 'lancamentos-operacao', 'contas-receber'
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

  ELSE
    -- Fail-closed: base aceita pela lista acima mas sem ramo de soma NÃO cai, calada, na soma de
    -- outra base (o ELSE implícito de Operação fazia exatamente isso).
    RAISE EXCEPTION 'BASE_SEM_SOMA: a base % não tem soma por ano definida em ingestao_soma_por_ano', p_base
      USING ERRCODE = '22023';
  END IF;

  RETURN v_result;
END;
$function$;

-- Redeclara REVOKE/GRANT mesmo sabendo que o CREATE OR REPLACE preserva as ACLs (precedente
-- 0197/0206): o dia em que isto virar DROP + CREATE, o default privilege do Supabase abre `anon`
-- em silêncio. As três já eram service_role-only (0276/0280).
REVOKE EXECUTE ON FUNCTION public.ingestao_carga_abrir(uuid, text, text, jsonb, bigint, uuid, uuid, timestamptz, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.ingestao_carga_abrir(uuid, text, text, jsonb, bigint, uuid, uuid, timestamptz, text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.ingestao_carga_ultima(text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.ingestao_carga_ultima(text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.ingestao_soma_por_ano(text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.ingestao_soma_por_ano(text) TO service_role;

-- ── 5. Guard de EFETIVIDADE ─────────────────────────────────────────────────────────────
-- A transação inteira aborta se a intenção não se cumpriu. Por to_regprocedure/to_regclass com
-- assinatura completa: NULL = "não existe" OU "assinatura que não casa" — por isso cada resolução
-- reprova NULL (as assinaturas foram provadas no catálogo antes de entregar).
DO $$
DECLARE
  v_sig  text;
  v_proc regprocedure;
  v_tab  text;
  v_n    int;
BEGIN
  -- Tabelas: existem, RLS ligado, sem policy, sem privilégio de anon/authenticated.
  FOREACH v_tab IN ARRAY ARRAY[
    'raw.contas_receber',
    'raw.contas_receber_staging',
    'financeiro.contas_receber_foto_carga',
    'financeiro.contas_receber_foto'
  ] LOOP
    IF to_regclass(v_tab) IS NULL THEN
      RAISE EXCEPTION '0295: tabela % não encontrada', v_tab;
    END IF;
    IF NOT (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = to_regclass(v_tab)) THEN
      RAISE EXCEPTION '0295: RLS desligado em %', v_tab;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname || '.' || tablename = v_tab) THEN
      RAISE EXCEPTION '0295: % tem policy (deveria ser deny-by-default, sem policy)', v_tab;
    END IF;
    IF has_table_privilege('anon', v_tab, 'SELECT,INSERT,UPDATE,DELETE')
       OR has_table_privilege('authenticated', v_tab, 'SELECT,INSERT,UPDATE,DELETE') THEN
      RAISE EXCEPTION '0295: anon/authenticated ainda tem privilégio de tabela em %', v_tab;
    END IF;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contas_receber_conferido_dominio'
                    AND conrelid = to_regclass('raw.contas_receber')) THEN
    RAISE EXCEPTION '0295: CHECK contas_receber_conferido_dominio ausente de raw.contas_receber';
  END IF;

  -- As 4 RPCs novas: existem, SECURITY DEFINER com search_path vazio, service_role E ingestor com
  -- EXECUTE, anon/authenticated sem.
  FOREACH v_sig IN ARRAY ARRAY[
    'public.limpar_staging_contas_receber()',
    'public.inserir_lote_staging_contas_receber(jsonb)',
    'public.validar_carga_contas_receber()',
    'public.promover_carga_contas_receber(jsonb, uuid)'
  ] LOOP
    v_proc := to_regprocedure(v_sig);
    IF v_proc IS NULL THEN
      RAISE EXCEPTION '0295: função % não encontrada', v_sig;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = v_proc AND prosecdef
                      AND proconfig @> ARRAY['search_path=""']) THEN
      RAISE EXCEPTION '0295: % sem SECURITY DEFINER ou sem search_path vazio', v_sig;
    END IF;
    IF NOT has_function_privilege('service_role', v_proc, 'EXECUTE') THEN
      RAISE EXCEPTION '0295: service_role sem EXECUTE em %', v_sig;
    END IF;
    IF NOT has_function_privilege('ingestor', v_proc, 'EXECUTE') THEN
      RAISE EXCEPTION '0295: ingestor sem EXECUTE em %', v_sig;
    END IF;
    IF has_function_privilege('anon', v_proc, 'EXECUTE')
       OR has_function_privilege('authenticated', v_proc, 'EXECUTE') THEN
      RAISE EXCEPTION '0295: anon/authenticated ainda tem EXECUTE em %', v_sig;
    END IF;
  END LOOP;

  -- As 3 reescritas: assinatura completa, aceitam 'contas-receber', sem acesso de anon/authenticated.
  FOREACH v_sig IN ARRAY ARRAY[
    'public.ingestao_carga_abrir(uuid, text, text, jsonb, bigint, uuid, uuid, timestamptz, text)',
    'public.ingestao_carga_ultima(text)',
    'public.ingestao_soma_por_ano(text)'
  ] LOOP
    v_proc := to_regprocedure(v_sig);
    IF v_proc IS NULL THEN
      RAISE EXCEPTION '0295: função % não encontrada', v_sig;
    END IF;
    IF position('''contas-receber''' IN (SELECT prosrc FROM pg_proc WHERE oid = v_proc)) = 0 THEN
      RAISE EXCEPTION '0295: corpo de % não aceita a base contas-receber', v_sig;
    END IF;
    IF NOT has_function_privilege('service_role', v_proc, 'EXECUTE') THEN
      RAISE EXCEPTION '0295: service_role sem EXECUTE em %', v_sig;
    END IF;
    IF has_function_privilege('anon', v_proc, 'EXECUTE')
       OR has_function_privilege('authenticated', v_proc, 'EXECUTE') THEN
      RAISE EXCEPTION '0295: anon/authenticated ainda tem EXECUTE em %', v_sig;
    END IF;
  END LOOP;

  -- ingestao_soma_por_ano: o ELSE de Operação virou ELSIF explícito + ELSE RAISE.
  IF position('BASE_SEM_SOMA' IN (SELECT prosrc FROM pg_proc WHERE oid = to_regprocedure('public.ingestao_soma_por_ano(text)'))) = 0 THEN
    RAISE EXCEPTION '0295: ingestao_soma_por_ano sem o ELSE RAISE fail-closed';
  END IF;

  -- Nenhuma sobrecarga criada por engano.
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND (p.proname LIKE '%\_carga\_contas\_receber'
          OR p.proname LIKE '%\_staging\_contas\_receber');
  IF v_n <> 4 THEN
    RAISE EXCEPTION '0295: % funções de carga de contas_receber (esperado 4; sobrecarga criada por engano?)', v_n;
  END IF;
END
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
