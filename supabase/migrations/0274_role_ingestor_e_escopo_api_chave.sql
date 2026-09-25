-- ---------------------------------------------------------------------------
-- 0274 — feat(v6.0.0/M2): role `ingestor` + escopo por BASE na chave de API
--
-- DECLARAÇÃO PRÉVIA (regime aditivo / autônomo):
--   • O QUE FAZ: (1) cria a role NOLOGIN `ingestor` — espelho da `verificador` (0273) para a
--     ESCRITA da ingestão: concedida a `authenticator`, nasce sem EXECUTE e recebe EXECUTE só
--     no pipeline staging → validação → promoção (allowlist DERIVADA de
--     `src/lib/ingestao/rpcs-ingestor.ts` por `scripts/credencial/derivar-allowlist.mjs
--     ingestor`; hoje só Vendas tem pipeline atômico — 4 assinaturas; as outras quatro bases
--     entram na M5 com suas `*_staging`/`promover_carga_*`); `statement_timeout = 0` (carga
--     pesada, como o service_role desde a 0145) e fuso SP; (2) cria a role RBAC "Máquina ·
--     ingestão" com UMA área, `admin/uploads`;
--   • ASSIMETRIA REGISTRADA (achado MÉDIO do revisor-db, acatado): NENHUMA das 4 RPCs da
--     allowlist chama `app.exigir_acesso` — são service_role-only por GRANT desde a 0116/0118/
--     0135. A área `admin/uploads` da role RBAC NÃO é, portanto, o gate real desta credencial;
--     serve à visibilidade no editor de acessos e ao `USUARIO_INATIVO` (desativar o usuário
--     continua matando o JWT, porque a rota da M4 valida o usuário antes de promover). O gate
--     real é o par GRANT EXECUTE (role `ingestor`) × claim `role=ingestor` no JWT assinado com
--     o JWT secret do projeto. Quem revisar a allowlist no futuro não deve presumir RBAC de
--     área onde não há `exigir_acesso`. As `promover_carga_*` novas da M5 nascem COM
--     `exigir_acesso(ARRAY['admin/uploads'])` inline, fechando a assimetria para as 4 bases novas.
--   • PARA A M4 (achado MÉDIO): `statement_timeout = 0` no banco × `maxDuration` da rota na
--     Vercel — uma transação de promoção pode seguir no Postgres depois de a função HTTP ser
--     abortada. A rota tem de medir o swap com volume real e decidir se cabe um teto finito
--     (minutos) em vez de 0. (3) `app.api_chave` ganha `escopo_bases text[]`
--     (default `{}`, CHECK contra as cinco bases do contrato `docs/contratos/ingestao-v1.md`)
--     — a chave da API externa de Solicitações continua com escopo vazio e funcionando como
--     hoje; (4) `api_chave_resolver` e `api_chave_listar` passam a emitir `escopo_bases`
--     (CREATE OR REPLACE escrito a partir do CATÁLOGO VIVO — corpo lido por
--     pg_get_functiondef em 21/09/2026, não da 0211/0224); (5) NOVA sobrecarga
--     `api_chave_registrar(text, text, uuid, text[])` que recebe o escopo — a de 3 parâmetros
--     fica intocada (CREATE OR REPLACE não adiciona parâmetro, ADR-0126; sobrecarga é aditiva).
--   • ADITIVA / RETROCOMPATÍVEL: CREATE ROLE, GRANT/REVOKE, ALTER ROLE ... SET, ALTER DEFAULT
--     PRIVILEGES, INSERT idempotente em rbac_roles/rbac_role_permissoes, ADD COLUMN com
--     DEFAULT constante (metadata-only no PG ≥ 11, nenhuma linha reescrita), ADD CONSTRAINT
--     CHECK que TODAS as linhas existentes satisfazem (`{}` ⊂ qualquer conjunto), CREATE OR
--     REPLACE que só ACRESCENTA uma chave ao jsonb de saída, CREATE FUNCTION nova. Nenhum
--     papel existente muda; nenhum dado pré-existente é tocado.
--   • `app.exigir_acesso` NÃO muda.
--   • A CHAVE (x-api-key) autoriza a PORTA HTTP por base; a RPC de promoção roda com o JWT do
--     `ingestor` (usuário ATIVO `ingestor@janus.interno`), não com o robô inativo da chave —
--     três alavancas de revogação independentes (revogar a chave ⇒ 401; desativar o usuário ⇒
--     PERMISSAO_NEGADA; trocar o JWT). Runbook: docs/runbooks/credenciais-maquina-runbook.md.
--   • Reversão (manual, destrutiva):
--       DROP FUNCTION public.api_chave_registrar(text, text, uuid, text[]);
--       -- api_chave_resolver / api_chave_listar: reaplicar os corpos da 0224 (últimas definições
--       --   anteriores; a 0224 é a fonte, NÃO a 0211)
--       ALTER TABLE app.api_chave DROP CONSTRAINT api_chave_escopo_bases_validas;
--       ALTER TABLE app.api_chave DROP COLUMN escopo_bases;
--       DELETE FROM app.rbac_role_permissoes WHERE role_id = (SELECT id FROM app.rbac_roles WHERE nome = 'Máquina · ingestão');
--       DELETE FROM app.rbac_roles WHERE nome = 'Máquina · ingestão';
--       REVOKE ingestor FROM authenticator;  DROP OWNED BY ingestor;  DROP ROLE ingestor;
-- ---------------------------------------------------------------------------

-- ── 1. A role do Postgres ─────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ingestor') THEN
    CREATE ROLE ingestor NOLOGIN NOINHERIT;
  END IF;
END $$;

GRANT ingestor TO authenticator;

-- Carga pesada (94k linhas em lotes + promoção atômica com TRUNCATE/INSERT…SELECT/regenerar):
-- sem teto, como o service_role (0145). O timer é armado no statement externo do PostgREST
-- e não se desarma de dentro da função — só o rolconfig do papel escapa dele (ADR-0122).
ALTER ROLE ingestor SET statement_timeout = 0;
ALTER ROLE ingestor SET timezone = 'America/Sao_Paulo';

GRANT USAGE ON SCHEMA public TO ingestor;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM ingestor;
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM ingestor;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM ingestor;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM ingestor;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM ingestor;

-- ── 2. ALLOWLIST (derivada de src/lib/ingestao/rpcs-ingestor.ts — só o pipeline de carga) ─
GRANT EXECUTE ON FUNCTION public.inserir_lote_staging(p_linhas jsonb) TO ingestor;
GRANT EXECUTE ON FUNCTION public.limpar_staging_vendas() TO ingestor;
GRANT EXECUTE ON FUNCTION public.promover_carga_vendas() TO ingestor;
GRANT EXECUTE ON FUNCTION public.validar_carga_staging() TO ingestor;

-- ── 3. Role RBAC "Máquina · ingestão" — só `admin/uploads` ────────────────────────────────
INSERT INTO app.rbac_roles (nome, descricao)
VALUES ('Máquina · ingestão',
        'Credencial de MÁQUINA da rota /api/ingestao (v6.0.0). Só a área admin/uploads; EXECUTE só no '
        'pipeline staging → promoção. Não é pessoa; não loga. Revogar = desativar o usuário ou revogar a chave.')
ON CONFLICT (nome) DO NOTHING;

INSERT INTO app.rbac_role_permissoes (role_id, area)
SELECT r.id, 'admin/uploads'
FROM app.rbac_roles r
WHERE r.nome = 'Máquina · ingestão'
ON CONFLICT DO NOTHING;

-- ── 4. Escopo por base na chave de API ────────────────────────────────────────────────────
-- As cinco bases do contrato v1. Espelho de `src/lib/ingestao/bases.ts` — a paridade das
-- duas pontas é provada por `src/lib/ingestao/bases-paridade.test.ts` (lê ESTE arquivo).
ALTER TABLE app.api_chave
  ADD COLUMN IF NOT EXISTS escopo_bases text[] NOT NULL DEFAULT '{}'::text[];

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'api_chave_escopo_bases_validas') THEN
    ALTER TABLE app.api_chave
      ADD CONSTRAINT api_chave_escopo_bases_validas CHECK (
        escopo_bases <@ ARRAY[
          'demonstrativo-competencia',
          'vendas-produto',
          'lancamentos-movimentacao',
          'lancamentos-aberto',
          'lancamentos-operacao'
        ]::text[]
      );
  END IF;
END $$;

COMMENT ON COLUMN app.api_chave.escopo_bases IS
  'v6.0.0 (0274): bases de ingestão que esta chave pode carregar em /api/ingestao/{base}. Vazio = chave só da API externa de Solicitações.';

-- ── 5. api_chave_resolver — emite `escopo_bases` (corpo do catálogo vivo + 1 chave) ───────
CREATE OR REPLACE FUNCTION public.api_chave_resolver(p_segredo_hash text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v jsonb;
BEGIN
  SELECT jsonb_build_object(
    'id',               c.id,
    'plataforma',       c.plataforma,
    'robo_user_id',     c.robo_user_id,
    'escopo_bases',     to_jsonb(c.escopo_bases)
  ) INTO v
  FROM app.api_chave c
  WHERE c.segredo_hash = p_segredo_hash AND c.ativo;

  RETURN v; -- NULL quando não encontrada/revogada.
END;
$$;
-- Redeclarados na forma exata de hoje (runtime: service_role-ONLY).
REVOKE EXECUTE ON FUNCTION public.api_chave_resolver(text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.api_chave_resolver(text) TO service_role;

-- ── 6. api_chave_listar — emite `escopo_bases` (corpo do catálogo vivo + 1 chave) ─────────
CREATE OR REPLACE FUNCTION public.api_chave_listar()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['solicitacoes']);
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id',                 c.id,
      'plataforma',         c.plataforma,
      'robo', jsonb_build_object(
        'user_id', u.user_id, 'email', u.email, 'nome', u.nome
      ),
      'ativo',             c.ativo,
      'criado_em',         c.criado_em,
      'revogado_em',       c.revogado_em,
      'ultima_chamada_em', (SELECT max(l.criado_em) FROM app.api_chamada_log l WHERE l.chave_id = c.id),
      'escopo_bases',      to_jsonb(c.escopo_bases)
    ) ORDER BY c.criado_em DESC)
    FROM app.api_chave c
    JOIN app.rbac_usuarios u ON u.user_id = c.robo_user_id
  ), '[]'::jsonb);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.api_chave_listar() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.api_chave_listar() TO authenticated, service_role;

-- ── 7. api_chave_registrar — NOVA sobrecarga com escopo (a de 3 parâmetros fica) ──────────
-- Corpo = o da versão viva (0224) + validação do escopo. O PostgREST resolve a sobrecarga
-- pelos NOMES dos argumentos: a UI passa `p_escopo_bases` e cai aqui.
CREATE OR REPLACE FUNCTION public.api_chave_registrar(
  p_plataforma text, p_segredo_hash text, p_robo_user_id uuid, p_escopo_bases text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_plataforma text   := btrim(coalesce(p_plataforma, ''));
  v_escopo     text[] := (SELECT coalesce(array_agg(DISTINCT b ORDER BY b), '{}'::text[])
                            FROM unnest(coalesce(p_escopo_bases, '{}'::text[])) b);
  v_id         bigint;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['solicitacoes']);

  IF v_plataforma = '' THEN
    RAISE EXCEPTION 'PLATAFORMA_OBRIGATORIA: informe a referência da integração' USING ERRCODE = '22023';
  END IF;
  IF coalesce(btrim(p_segredo_hash), '') = '' THEN
    RAISE EXCEPTION 'SEGREDO_OBRIGATORIO: segredo ausente' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM app.api_chave WHERE plataforma = v_plataforma) THEN
    RAISE EXCEPTION 'PLATAFORMA_EM_USO: já existe uma chave com esta referência' USING ERRCODE = '22023';
  END IF;
  -- Escopo fora do contrato falharia no CHECK; aqui o erro ganha nome e diz QUAL base.
  IF NOT (v_escopo <@ ARRAY['demonstrativo-competencia','vendas-produto','lancamentos-movimentacao',
                             'lancamentos-aberto','lancamentos-operacao']::text[]) THEN
    RAISE EXCEPTION 'ESCOPO_INVALIDO: base desconhecida em % (contrato ingestao-v1 §3)', v_escopo
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO app.api_chave (plataforma, segredo_hash, robo_user_id, criado_por, escopo_bases)
  VALUES (v_plataforma, p_segredo_hash, p_robo_user_id, app.uid_jwt(), v_escopo)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'escopo_bases', to_jsonb(v_escopo));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.api_chave_registrar(text, text, uuid, text[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.api_chave_registrar(text, text, uuid, text[]) TO authenticated, service_role;

COMMENT ON ROLE ingestor IS
  'v6.0.0 (0274): credencial de MÁQUINA da ingestão (rota /api/ingestao). EXECUTE só no pipeline staging → promoção, derivado de src/lib/ingestao/rpcs-ingestor.ts. Nunca lê dado de negócio; nunca trunca base viva. Ver docs/runbooks/credenciais-maquina-runbook.md.';

NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';
