-- ---------------------------------------------------------------------------
-- 0160 — feat(v4.29.0/M1): Base de Pessoas (cadastro fiscal do Monde) + carga atômica
--
-- DECLARAÇÃO (CLAUDE.md): ADITIVA / retrocompatível com a `main` viva.
--   • CREATE de tabelas NOVAS (raw.pessoas, raw.pessoas_staging) + funções NOVAS +
--     REVOKE/GRANT + NOTIFY. NÃO altera tabela/coluna/dado pré-existente.
--   • As TRUNCATE/INSERT vivem DENTRO de corpos de função (não top-level) e só tocam
--     as tabelas NOVAS desta migration → não-destrutiva para a base viva.
--
-- Para quê: trazer a base de pessoas do Monde (pessoas.xlsx, ~64k) para a Atualização
-- de Dados como base persistida de primeira classe (pré-requisito do Faturamento).
-- Documentos (cnpj/cpf/cep/inscrições) como TEXT — preservam zero à esquerda. Nome
-- guardado com TRIM (origem traz espaço à esquerda). Carga full-replace ATÔMICA
-- (staging → validar → promover swap numa transação) — modelo 0116 (Vendas); o
-- Faturamento vai depender, a base não pode ficar vazia no meio de uma recarga.
-- ---------------------------------------------------------------------------

-- 1. Tabela viva. Todos os campos TEXT (documentos preservam zero); carregado_em alimenta status.
CREATE TABLE IF NOT EXISTS raw.pessoas (
  nome                 text,
  razao_social         text,
  cnpj                 text,
  cpf                  text,
  cep                  text,
  inscricao_estadual   text,
  inscricao_municipal  text,
  email                text,
  endereco             text,
  numero               text,
  complemento          text,
  bairro               text,
  cidade               text,
  uf                   text,
  pais                 text,
  telefone             text,
  celular              text,
  carregado_em         timestamptz NOT NULL DEFAULT now()
);

-- RLS deny-by-default (postura dos 6 schemas, 0123): sem policy → acesso direto negado.
-- O app nunca toca raw direto; as RPCs SECURITY DEFINER (owner postgres) ignoram RLS.
ALTER TABLE raw.pessoas ENABLE ROW LEVEL SECURITY;

-- Índice p/ o lookup do Faturamento (buscar_pessoas por nome trimado, ~64k linhas).
CREATE INDEX IF NOT EXISTS idx_pessoas_nome ON raw.pessoas (nome);

-- 2. Staging (não-destrutiva): mesma estrutura, UNLOGGED (efêmera, como vendas_excel_staging).
CREATE UNLOGGED TABLE IF NOT EXISTS raw.pessoas_staging
  (LIKE raw.pessoas INCLUDING DEFAULTS);
ALTER TABLE raw.pessoas_staging ENABLE ROW LEVEL SECURITY;

-- 3. Limpa a staging (início de cada carga, antes dos lotes).
CREATE OR REPLACE FUNCTION public.limpar_staging_pessoas()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  TRUNCATE raw.pessoas_staging;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.limpar_staging_pessoas() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.limpar_staging_pessoas() TO service_role;

-- 4. Insere um lote na STAGING (não-destrutivo). Documentos como TEXT (sem cast).
--    TRIM(nome) defensivo — a origem (Monde) traz espaço à esquerda; o parser já
--    trima (toStr), aqui é cinto-e-suspensório (a chave de lookup precisa bater).
CREATE OR REPLACE FUNCTION public.inserir_lote_staging_pessoas(p_linhas jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  linha jsonb;
BEGIN
  FOR linha IN SELECT jsonb_array_elements(p_linhas)
  LOOP
    INSERT INTO raw.pessoas_staging (
      nome, razao_social, cnpj, cpf, cep, inscricao_estadual, inscricao_municipal,
      email, endereco, numero, complemento, bairro, cidade, uf, pais, telefone, celular
    ) VALUES (
      NULLIF(TRIM(linha->>'nome'), ''),
      linha->>'razao_social', linha->>'cnpj', linha->>'cpf', linha->>'cep',
      linha->>'inscricao_estadual', linha->>'inscricao_municipal',
      linha->>'email', linha->>'endereco', linha->>'numero', linha->>'complemento',
      linha->>'bairro', linha->>'cidade', linha->>'uf', linha->>'pais',
      linha->>'telefone', linha->>'celular'
    );
  END LOOP;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.inserir_lote_staging_pessoas(jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.inserir_lote_staging_pessoas(jsonb) TO service_role;

-- 5. Pré-validação (não escreve): staging precisa ter linhas. Mesmo shape de validar_carga_staging.
CREATE OR REPLACE FUNCTION public.validar_carga_pessoas()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_total int;
BEGIN
  SELECT count(*) INTO v_total FROM raw.pessoas_staging;
  IF v_total = 0 THEN
    RETURN jsonb_build_object('ok', false, 'total', 0,
      'erros', jsonb_build_array('Nenhuma linha válida na carga — arquivo vazio ou inválido.'));
  END IF;
  RETURN jsonb_build_object('ok', true, 'total', v_total, 'erros', '[]'::jsonb);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.validar_carga_pessoas() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.validar_carga_pessoas() TO service_role;

-- 6. SWAP ATÔMICO: numa transação. staging vazia → RAISE (não esvazia a base). Falha → ROLLBACK.
CREATE OR REPLACE FUNCTION public.promover_carga_pessoas()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_total int;
BEGIN
  SELECT count(*) INTO v_total FROM raw.pessoas_staging;
  IF v_total = 0 THEN
    RAISE EXCEPTION 'Carga abortada: staging vazia — nada a promover.';
  END IF;

  TRUNCATE raw.pessoas;
  INSERT INTO raw.pessoas (
    nome, razao_social, cnpj, cpf, cep, inscricao_estadual, inscricao_municipal,
    email, endereco, numero, complemento, bairro, cidade, uf, pais, telefone, celular
  )
  SELECT
    nome, razao_social, cnpj, cpf, cep, inscricao_estadual, inscricao_municipal,
    email, endereco, numero, complemento, bairro, cidade, uf, pais, telefone, celular
  FROM raw.pessoas_staging;

  TRUNCATE raw.pessoas_staging;
  RETURN jsonb_build_object('pessoas_count', v_total);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.promover_carga_pessoas() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.promover_carga_pessoas() TO service_role;

-- 7. Status (count + última carga) — padrão status_fluxo_caixa_titulos (0145).
CREATE OR REPLACE FUNCTION public.status_pessoas()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'total',              (SELECT count(*)          FROM raw.pessoas),
    'ultima_atualizacao', (SELECT max(carregado_em) FROM raw.pessoas)
  )
$$;
REVOKE EXECUTE ON FUNCTION public.status_pessoas() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.status_pessoas() TO service_role;

-- 8. Lookup read-only p/ o Faturamento (frente seguinte) — modelo cruzar_vendas_setor (0159).
--    Cruza por NOME trimado (origem canônica). Devolve os pares ENCONTRADOS; nomes não
--    casados são inferidos pela diferença no consumidor. Gate exigir_acesso(['admin/uploads'])
--    — dado fiscal/PII; o Faturamento re-gateará à sua própria área quando existir.
CREATE OR REPLACE FUNCTION public.buscar_pessoas(p_nomes text[])
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v jsonb;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['admin/uploads']);

  SELECT COALESCE(jsonb_agg(to_jsonb(p) - 'carregado_em'), '[]'::jsonb)
  INTO v
  FROM raw.pessoas p
  WHERE p.nome = ANY (SELECT TRIM(unnest(p_nomes)));

  RETURN v;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.buscar_pessoas(text[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.buscar_pessoas(text[]) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
