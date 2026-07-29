-- ---------------------------------------------------------------------------
-- 0211 — feat(v5.4.0/M2): Chaves de API para a API externa de Solicitações
--
-- NUMERAÇÃO: definitiva (renumerada de 095x → 021x no checklist de merge da v5.4.0,
-- 2026-07-28; histórico remoto realinhado via `supabase migration repair`).
-- DECLARAÇÃO PRÉVIA (regime aditivo / autônomo):
--   • O QUE FAZ: cria a infraestrutura de CHAVES DE API que permitirá a
--     plataformas externas abrir/consultar Solicitações via API HTTP (a rota em
--     si é de outra missão da v5.4.0) — duas tabelas novas (app.api_chave,
--     app.api_chamada_log) + 8 RPCs (6 de administração, gated por 'solicitacoes';
--     2 de runtime, service_role-only). Núcleo 100% GENÉRICO: nenhum nome de
--     integrador específico aparece em coluna/rota — a integração concreta é
--     apenas um REGISTRO nesta tabela, nunca código.
--   • ADITIVA / RETROCOMPATÍVEL: só CREATE TABLE + CREATE FUNCTION + GRANT/REVOKE.
--     Não altera tabela/coluna/dado pré-existente (inclusive app.rbac_usuarios,
--     onde só faz INSERT de linhas novas via RPC, nunca UPDATE/DELETE em massa).
--   • Segredo IRRECUPERÁVEL (mesmo padrão da senha provisória, v4.14): só o HASH
--     (sha256 hex, gerado em src/lib/api-externa/segredo.ts) é persistido em
--     segredo_hash. O segredo em claro nunca é gravado — é devolvido à UI UMA
--     VEZ no momento da criação da chave; depois disso só é possível REVOGAR e
--     criar uma chave nova, nunca "ver de novo" a existente.
--   • callback_segredo é DIFERENTE: é o segredo que o PRÓPRIO Janus ENVIA no
--     callback/webhook que dispara para o integrador (para ele validar que a
--     chamada é legítima) — não algo que o Janus recebe e precisa comparar, daí
--     ser armazenado em claro (não hash). api_chave_listar NUNCA o devolve (só
--     o booleano tem_callback_segredo); só api_chave_resolver (runtime,
--     service_role-only) o expõe, para o worker de callback usá-lo ao montar o
--     webhook.
--   • Usuário-robô: app.rbac_usuarios.user_id tem FK para auth.users(id) — a
--     ACTION cria o usuário no Supabase Auth (getAdminClient().auth.admin.
--     createUser) e esta migration só REGISTRA o vínculo RBAC via
--     api_robo_registrar, com ativo=false e role_id NULL — o robô NUNCA passa em
--     app.exigir_acesso (que exige u.ativo), ou seja, NUNCA "loga" na
--     plataforma; ele só é referenciado como autor das solicitações que a
--     integração cria (escopo de outra missão).
--   • RBAC: reaproveita a área 'solicitacoes' (gestão) já existente — SEM área
--     nova. Todas as RPCs de administração usam o padrão RPC-nova (0121, inline,
--     sem wrapper+__nucleo): `PERFORM app.exigir_acesso(ARRAY['solicitacoes'])`
--     como primeira linha do corpo, com REVOKE/GRANT explícitos.
--   • RPCs de RUNTIME (api_chave_resolver / api_chamada_registrar) são
--     service_role-ONLY: EXECUTE revogado também de `authenticated` (além de
--     PUBLIC/anon) — só a rota da API externa (server-side, service role) as
--     chama; não fazem sentido para um usuário da sessão web.
--   • Reversão (manual, destrutiva): DROP das 8 funções, DROP TABLE
--     app.api_chamada_log, DROP TABLE app.api_chave. Os usuários-robô ficam
--     órfãos em app.rbac_usuarios/auth.users (não removidos automaticamente) —
--     limpar manualmente se necessário.
-- ---------------------------------------------------------------------------

-- ── 1. Tabelas ────────────────────────────────────────────────────────────────

CREATE TABLE app.api_chave (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  plataforma        text NOT NULL UNIQUE,
  segredo_hash      text NOT NULL,
  callback_url      text,
  callback_segredo  text,
  whitelist_tipos   bigint[] NOT NULL DEFAULT '{}'::bigint[],
  robo_user_id      uuid NOT NULL REFERENCES app.rbac_usuarios(user_id),
  ativo             boolean NOT NULL DEFAULT true,
  criado_em         timestamptz NOT NULL DEFAULT now(),
  criado_por        uuid,
  revogado_em       timestamptz,
  revogado_por      uuid
);

-- Índice PARCIAL (só chaves ativas) para o caminho quente de runtime:
-- api_chave_resolver busca por segredo_hash a CADA chamada da API externa.
-- Não-único: colisão de sha256 é astronomicamente improvável, mas não é uma
-- invariante que esta migration precise IMPOR (a UNIQUE já vive em plataforma).
CREATE INDEX idx_api_chave_segredo_hash_ativo ON app.api_chave (segredo_hash) WHERE ativo;

CREATE TABLE app.api_chamada_log (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  chave_id   bigint REFERENCES app.api_chave(id),
  rota       text NOT NULL,
  status     integer NOT NULL,
  detalhe    text,
  criado_em  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_api_chamada_log_chave_criado ON app.api_chamada_log (chave_id, criado_em DESC);

-- RLS deny-by-default (postura dos 6 schemas, 0123). O app nunca toca app.*
-- direto; as RPCs SECURITY DEFINER (owner postgres) ignoram RLS.
ALTER TABLE app.api_chave ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app.api_chave FROM PUBLIC, anon, authenticated;

ALTER TABLE app.api_chamada_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app.api_chamada_log FROM PUBLIC, anon, authenticated;

-- ── 2. RPCs de ADMINISTRAÇÃO (gated por 'solicitacoes' — gestão) ──────────────

-- Lista as chaves para a tela /admin/chaves-api. NUNCA emite segredo_hash nem
-- callback_segredo — só o booleano tem_callback_segredo (a UI mostra "definido"
-- vs "não definido", nunca o valor).
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
      'callback_url',       c.callback_url,
      'tem_callback_segredo', (c.callback_segredo IS NOT NULL),
      'whitelist_tipos',    coalesce((
        SELECT jsonb_agg(jsonb_build_object('id', t.id, 'nome', t.nome) ORDER BY t.nome)
        FROM app.solicitacao_tipo t
        WHERE t.id = ANY (c.whitelist_tipos)
      ), '[]'::jsonb),
      'robo', jsonb_build_object(
        'user_id', u.user_id, 'email', u.email, 'nome', u.nome
      ),
      'ativo',             c.ativo,
      'criado_em',         c.criado_em,
      'revogado_em',       c.revogado_em,
      'ultima_chamada_em', (SELECT max(l.criado_em) FROM app.api_chamada_log l WHERE l.chave_id = c.id)
    ) ORDER BY c.criado_em DESC)
    FROM app.api_chave c
    JOIN app.rbac_usuarios u ON u.user_id = c.robo_user_id
  ), '[]'::jsonb);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.api_chave_listar() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.api_chave_listar() TO authenticated, service_role;

-- Registra o vínculo RBAC do usuário-robô (a conta no Auth já foi criada pela
-- ACTION, via service role, ANTES desta chamada). ativo=false + role_id NULL:
-- o robô nunca passa em app.exigir_acesso (exige u.ativo), logo nunca "loga".
CREATE OR REPLACE FUNCTION public.api_robo_registrar(p_user_id uuid, p_email text, p_nome text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email text := lower(btrim(coalesce(p_email, '')));
BEGIN
  PERFORM app.exigir_acesso(ARRAY['solicitacoes']);
  IF v_email = '' THEN
    RAISE EXCEPTION 'EMAIL_OBRIGATORIO: informe o e-mail do robô' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM app.rbac_usuarios WHERE email = v_email) THEN
    RAISE EXCEPTION 'EMAIL_EM_USO: já existe um usuário com este e-mail' USING ERRCODE = '22023';
  END IF;

  INSERT INTO app.rbac_usuarios (user_id, email, nome, role_id, ativo, precisa_trocar_senha, convidado_por)
  VALUES (p_user_id, v_email, nullif(btrim(coalesce(p_nome, '')), ''), NULL, false, false, auth.uid());

  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.api_robo_registrar(uuid, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.api_robo_registrar(uuid, text, text) TO authenticated, service_role;

-- Registra a chave em si. Valida plataforma não-vazia/única e whitelist só com
-- tipos EXISTENTES (app.solicitacao_tipo) — tipo inválido barra a criação
-- inteira (erro explícito, não silenciosamente ignorado).
CREATE OR REPLACE FUNCTION public.api_chave_registrar(
  p_plataforma        text,
  p_segredo_hash      text,
  p_callback_url      text,
  p_callback_segredo  text,
  p_whitelist         bigint[],
  p_robo_user_id      uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_plataforma text := btrim(coalesce(p_plataforma, ''));
  v_invalidos  bigint[];
  v_id         bigint;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['solicitacoes']);

  IF v_plataforma = '' THEN
    RAISE EXCEPTION 'PLATAFORMA_OBRIGATORIA: informe o nome da plataforma' USING ERRCODE = '22023';
  END IF;
  IF coalesce(btrim(p_segredo_hash), '') = '' THEN
    RAISE EXCEPTION 'SEGREDO_OBRIGATORIO: segredo ausente' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM app.api_chave WHERE plataforma = v_plataforma) THEN
    RAISE EXCEPTION 'PLATAFORMA_EM_USO: já existe uma chave para esta plataforma' USING ERRCODE = '22023';
  END IF;

  SELECT array_agg(x) INTO v_invalidos
  FROM unnest(coalesce(p_whitelist, '{}'::bigint[])) x
  WHERE NOT EXISTS (SELECT 1 FROM app.solicitacao_tipo st WHERE st.id = x);
  IF v_invalidos IS NOT NULL THEN
    RAISE EXCEPTION 'TIPO_INVALIDO: %', array_to_string(v_invalidos, ', ') USING ERRCODE = '22023';
  END IF;

  INSERT INTO app.api_chave (
    plataforma, segredo_hash, callback_url, callback_segredo, whitelist_tipos, robo_user_id, criado_por
  ) VALUES (
    v_plataforma, p_segredo_hash, nullif(btrim(coalesce(p_callback_url, '')), ''), p_callback_segredo,
    coalesce(p_whitelist, '{}'::bigint[]), p_robo_user_id, app.uid_jwt()
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.api_chave_registrar(text, text, text, text, bigint[], uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.api_chave_registrar(text, text, text, text, bigint[], uuid) TO authenticated, service_role;

-- Revoga uma chave (IRREVERSÍVEL — nenhuma RPC reativa; recuperar = criar uma
-- chave nova). Só permite revogar chave ainda ATIVA.
CREATE OR REPLACE FUNCTION public.api_chave_revogar(p_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ativo boolean;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['solicitacoes']);

  SELECT ativo INTO v_ativo FROM app.api_chave WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NAO_ENCONTRADA: chave inexistente' USING ERRCODE = '22023';
  END IF;
  IF NOT v_ativo THEN
    RAISE EXCEPTION 'JA_REVOGADA: esta chave já está revogada' USING ERRCODE = '22023';
  END IF;

  UPDATE app.api_chave
     SET ativo = false, revogado_em = now(), revogado_por = app.uid_jwt()
   WHERE id = p_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.api_chave_revogar(bigint) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.api_chave_revogar(bigint) TO authenticated, service_role;

-- Edita callback_url/callback_segredo/whitelist de uma chave ATIVA. NULL em
-- p_callback_segredo = mantém o valor atual (a UI só envia um valor novo
-- quando o admin digita um; deixar em branco preserva o segredo existente).
CREATE OR REPLACE FUNCTION public.api_chave_atualizar(
  p_id                bigint,
  p_callback_url      text,
  p_callback_segredo  text,
  p_whitelist         bigint[]
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ativo     boolean;
  v_invalidos bigint[];
BEGIN
  PERFORM app.exigir_acesso(ARRAY['solicitacoes']);

  SELECT ativo INTO v_ativo FROM app.api_chave WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NAO_ENCONTRADA: chave inexistente' USING ERRCODE = '22023';
  END IF;
  IF NOT v_ativo THEN
    RAISE EXCEPTION 'CHAVE_REVOGADA: chave revogada não pode ser editada' USING ERRCODE = '22023';
  END IF;

  SELECT array_agg(x) INTO v_invalidos
  FROM unnest(coalesce(p_whitelist, '{}'::bigint[])) x
  WHERE NOT EXISTS (SELECT 1 FROM app.solicitacao_tipo st WHERE st.id = x);
  IF v_invalidos IS NOT NULL THEN
    RAISE EXCEPTION 'TIPO_INVALIDO: %', array_to_string(v_invalidos, ', ') USING ERRCODE = '22023';
  END IF;

  UPDATE app.api_chave
     SET callback_url     = nullif(btrim(coalesce(p_callback_url, '')), ''),
         callback_segredo = coalesce(p_callback_segredo, callback_segredo),
         whitelist_tipos  = coalesce(p_whitelist, '{}'::bigint[])
   WHERE id = p_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.api_chave_atualizar(bigint, text, text, bigint[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.api_chave_atualizar(bigint, text, text, bigint[]) TO authenticated, service_role;

-- Últimas N chamadas registradas para uma chave (modal de log da tela admin).
CREATE OR REPLACE FUNCTION public.api_log_listar(p_chave_id bigint, p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['solicitacoes']);
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'rota', l.rota, 'status', l.status, 'detalhe', l.detalhe, 'criado_em', l.criado_em
    ) ORDER BY l.criado_em DESC)
    FROM (
      SELECT rota, status, detalhe, criado_em
      FROM app.api_chamada_log
      WHERE chave_id = p_chave_id
      ORDER BY criado_em DESC
      LIMIT least(greatest(coalesce(p_limit, 50), 1), 200)
    ) l
  ), '[]'::jsonb);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.api_log_listar(bigint, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.api_log_listar(bigint, integer) TO authenticated, service_role;

-- ── 3. RPCs de RUNTIME (service_role ONLY — a rota HTTP da API externa) ──────
-- Estas duas NÃO chamam app.exigir_acesso: não fazem sentido para um usuário da
-- sessão web (authenticated) — a superfície de segurança é o REVOKE/GRANT
-- abaixo (EXECUTE só para service_role). Isolar a permissão no GRANT, e não em
-- lógica de guard, evita todo o custo de um JWT/área para uma chamada que a
-- própria rota Next (server-side, service role) já autenticou via API Route.

-- Resolve a chave ATIVA a partir do hash do segredo apresentado pelo
-- integrador (o segredo em claro NUNCA trafega além da rota; ela hasheia e
-- chama esta RPC com o hash). NULL se não houver chave ativa com este hash —
-- a rota trata NULL como 401 (chave inválida/revogada), sem detalhar o motivo.
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
    'whitelist_tipos',  to_jsonb(c.whitelist_tipos),
    'robo_user_id',     c.robo_user_id,
    'callback_url',     c.callback_url,
    'callback_segredo', c.callback_segredo
  ) INTO v
  FROM app.api_chave c
  WHERE c.segredo_hash = p_segredo_hash AND c.ativo;

  RETURN v; -- NULL quando não encontrada/revogada.
END;
$$;
REVOKE EXECUTE ON FUNCTION public.api_chave_resolver(text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.api_chave_resolver(text) TO service_role;

-- Registra uma chamada no log de auditoria. p_chave_id pode ser NULL — chamada
-- rejeitada por chave inválida/inexistente ainda é registrada (auditoria de
-- tentativas), só sem vínculo a uma chave real.
CREATE OR REPLACE FUNCTION public.api_chamada_registrar(
  p_chave_id  bigint,
  p_rota      text,
  p_status    integer,
  p_detalhe   text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO app.api_chamada_log (chave_id, rota, status, detalhe)
  VALUES (p_chave_id, p_rota, p_status, p_detalhe);
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.api_chamada_registrar(bigint, text, integer, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.api_chamada_registrar(bigint, text, integer, text) TO service_role;

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- DOWN (reversão manual, destrutiva — requer confirmação humana):
--
-- DROP FUNCTION IF EXISTS public.api_chamada_registrar(bigint, text, integer, text);
-- DROP FUNCTION IF EXISTS public.api_chave_resolver(text);
-- DROP FUNCTION IF EXISTS public.api_log_listar(bigint, integer);
-- DROP FUNCTION IF EXISTS public.api_chave_atualizar(bigint, text, text, bigint[]);
-- DROP FUNCTION IF EXISTS public.api_chave_revogar(bigint);
-- DROP FUNCTION IF EXISTS public.api_chave_registrar(text, text, text, text, bigint[], uuid);
-- DROP FUNCTION IF EXISTS public.api_robo_registrar(uuid, text, text);
-- DROP FUNCTION IF EXISTS public.api_chave_listar();
-- DROP TABLE IF EXISTS app.api_chamada_log;
-- DROP TABLE IF EXISTS app.api_chave;
-- -- Usuários-robô ficam órfãos em app.rbac_usuarios/auth.users — avaliar remoção manual.
-- NOTIFY pgrst, 'reload schema';
-- ---------------------------------------------------------------------------
