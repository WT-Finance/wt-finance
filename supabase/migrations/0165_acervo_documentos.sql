-- ---------------------------------------------------------------------------
-- 0165 — feat(v4.34.0): Acervo de Documentos — tabela + bucket + RBAC + RPCs
--
-- DECLARAÇÃO PRÉVIA (regime aditivo / autônomo):
--   • O QUE FAZ: cria a tabela NOVA app.acervo_documento (metadados de documentos —
--     título, descrição, nome original do arquivo, mime, tamanho, caminho no Storage)
--     + bucket privado NOVO 'acervo-documentos' (binário) + DUAS áreas RBAC novas
--     ('financeiro/acervo' = ver a biblioteca; 'financeiro/acervo/gestao' = adicionar
--     documentos, inclui a visão) + 3 RPCs (listar / criar / obter caminho p/ download).
--   • ADITIVA / RETROCOMPATÍVEL: só CREATE TABLE, CREATE de bucket (INSERT idempotente
--     em storage.buckets via ON CONFLICT DO NOTHING), INSERT idempotente em
--     app.rbac_areas/app.rbac_role_permissoes (ON CONFLICT DO NOTHING) e CREATE FUNCTION
--     + GRANT/REVOKE. NÃO altera tabela/coluna/dado pré-existente. A única escrita em
--     tabela pré-existente é o INSERT de catálogo (rbac_areas/rbac_role_permissoes),
--     idempotente e sem tocar linha alguma já existente.
--   • RBAC: 'financeiro/acervo/gestao' inclui a visão (a página faz OR das duas áreas —
--     quem só tem gestão também vê a biblioteca), mesmo padrão de dois níveis de
--     'solicitacoes/basico' × 'solicitacoes' (0127/0144). Gate inicial APERTADO: só os
--     roles que já têm 'admin/acessos' recebem as duas áreas novas (mesmo padrão da
--     0161 para 'financeiro/faturamento-corp') — o admin libera outros roles pelo editor.
--   • Storage: bucket PRIVADO, sem policy em storage.objects → deny-by-default (só
--     service_role acessa; leitura via signed URL de curta duração gerada pela Server
--     Action). allowed_mime_types = NULL (qualquer tipo de arquivo é aceito, conforme
--     produto); file_size_limit = 25 MiB (26214400 bytes), enforçado também
--     server-side na Action antes do upload.
--   • Reversão (manual, destrutiva): DROP das 3 funções, remover os grants/linhas das
--     duas áreas em rbac_role_permissoes/rbac_areas, DROP TABLE app.acervo_documento,
--     remover o bucket 'acervo-documentos' (e seus objetos) do Storage.
-- ---------------------------------------------------------------------------

-- 1) Tabela de metadados dos documentos. Binário vive no Storage; aqui só o que a
--    biblioteca lista/pesquisa. storage_path é UNIQUE (1:1 com o objeto no bucket).
CREATE TABLE IF NOT EXISTS app.acervo_documento (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  titulo         text NOT NULL CHECK (btrim(titulo) <> ''),
  descricao      text NOT NULL CHECK (btrim(descricao) <> ''),
  nome_arquivo   text NOT NULL,   -- nome ORIGINAL do arquivo (metadado de exibição/download)
  mime           text NOT NULL,
  tamanho_bytes  bigint NOT NULL,
  storage_path   text NOT NULL UNIQUE,
  criado_por     uuid REFERENCES auth.users(id),
  criado_em      timestamptz NOT NULL DEFAULT now()
);

-- RLS deny-by-default (postura dos 6 schemas, 0123). O app nunca toca app.* direto; as
-- RPCs SECURITY DEFINER (owner postgres) ignoram RLS.
ALTER TABLE app.acervo_documento ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app.acervo_documento FROM PUBLIC, anon, authenticated;

-- 2) Bucket privado (idempotente). Sem policies em storage.objects → deny-by-default;
--    upload e leitura são SEMPRE server-side via service_role (Server Actions),
--    leitura por signed URL de curta duração (60s). Qualquer tipo de arquivo é aceito
--    (allowed_mime_types = NULL); limite de 25 MiB por arquivo (enforçado aqui E na Action).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('acervo-documentos', 'acervo-documentos', false, 26214400, NULL)
ON CONFLICT (id) DO NOTHING;

-- 3) Duas áreas RBAC novas (grupo Financeiro; ordens 33/34 — após faturamento-corp=32).
--    Idempotente.
INSERT INTO app.rbac_areas (area, rotulo, grupo, ordem) VALUES
  ('financeiro/acervo',        'Acervo de Documentos',            'Financeiro', 33),
  ('financeiro/acervo/gestao', 'Acervo — Adicionar documentos',   'Financeiro', 34)
ON CONFLICT (area) DO NOTHING;

-- Gate APERTADO: concede as duas áreas novas só aos roles que já têm 'admin/acessos'
-- (administradores). O admin libera outros roles pelo editor de roles. NÃO backfill a
-- todos (mesmo padrão da 0161 para 'financeiro/faturamento-corp').
INSERT INTO app.rbac_role_permissoes (role_id, area)
  SELECT DISTINCT role_id, 'financeiro/acervo'
  FROM app.rbac_role_permissoes
  WHERE area = 'admin/acessos'
ON CONFLICT (role_id, area) DO NOTHING;

INSERT INTO app.rbac_role_permissoes (role_id, area)
  SELECT DISTINCT role_id, 'financeiro/acervo/gestao'
  FROM app.rbac_role_permissoes
  WHERE area = 'admin/acessos'
ON CONFLICT (role_id, area) DO NOTHING;

-- ── Listar (ver a biblioteca) — as duas áreas liberam (gestão inclui a visão) ────────
-- NUNCA expõe storage_path nem criado_por (whitelist explícita via jsonb_build_object).
CREATE OR REPLACE FUNCTION public.acervo_listar()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v jsonb;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/acervo', 'financeiro/acervo/gestao']);
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',            d.id,
    'titulo',        d.titulo,
    'descricao',     d.descricao,
    'nome_arquivo',  d.nome_arquivo,
    'mime',          d.mime,
    'tamanho_bytes', d.tamanho_bytes,
    'criado_em',     d.criado_em
  ) ORDER BY app.norm_nome(d.titulo)), '[]'::jsonb)
  INTO v
  FROM app.acervo_documento d;
  RETURN v;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.acervo_listar() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.acervo_listar() TO authenticated, service_role;

-- ── Criar (adicionar documento) — SÓ gestão. Valida título/descrição não-vazios. ────
-- O binário já foi enviado ao Storage pela Action (service role) antes desta chamada;
-- aqui só persiste os metadados. criado_por = auth.uid() (usuário da sessão).
CREATE OR REPLACE FUNCTION public.acervo_criar(
  p_titulo        text,
  p_descricao     text,
  p_nome_arquivo  text,
  p_mime          text,
  p_tamanho_bytes bigint,
  p_storage_path  text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_titulo    text := btrim(coalesce(p_titulo, ''));
  v_descricao text := btrim(coalesce(p_descricao, ''));
  v_row       app.acervo_documento;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/acervo/gestao']);

  IF v_titulo = '' THEN
    RAISE EXCEPTION 'TITULO_OBRIGATORIO: informe um título' USING ERRCODE='22023';
  END IF;
  IF v_descricao = '' THEN
    RAISE EXCEPTION 'DESCRICAO_OBRIGATORIA: informe uma descrição' USING ERRCODE='22023';
  END IF;

  INSERT INTO app.acervo_documento (
    titulo, descricao, nome_arquivo, mime, tamanho_bytes, storage_path, criado_por
  ) VALUES (
    v_titulo, v_descricao, p_nome_arquivo, p_mime, p_tamanho_bytes, p_storage_path, auth.uid()
  )
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'id',            v_row.id,
    'titulo',        v_row.titulo,
    'descricao',     v_row.descricao,
    'nome_arquivo',  v_row.nome_arquivo,
    'mime',          v_row.mime,
    'tamanho_bytes', v_row.tamanho_bytes,
    'criado_em',     v_row.criado_em
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.acervo_criar(text, text, text, text, bigint, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.acervo_criar(text, text, text, text, bigint, text) TO authenticated, service_role;

-- ── Caminho p/ download (a Action gera a signed URL) — as duas áreas liberam ────────
CREATE OR REPLACE FUNCTION public.acervo_doc_path(p_doc_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_path text;
  v_nome text;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/acervo', 'financeiro/acervo/gestao']);
  SELECT storage_path, nome_arquivo INTO v_path, v_nome
  FROM app.acervo_documento WHERE id = p_doc_id;
  IF v_path IS NULL THEN
    RAISE EXCEPTION 'NAO_ENCONTRADO' USING ERRCODE='42501';
  END IF;
  RETURN jsonb_build_object('storage_path', v_path, 'nome_arquivo', v_nome);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.acervo_doc_path(bigint) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.acervo_doc_path(bigint) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
