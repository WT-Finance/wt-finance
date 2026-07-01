-- ---------------------------------------------------------------------------
-- 0164 — feat(v4.33.0/M1): app.cliente_corporativo — cadastro de clientes corporativos
--
-- DECLARAÇÃO PRÉVIA (regime aditivo / autônomo):
--   • O QUE FAZ: cria a tabela NOVA app.cliente_corporativo (cadastro gerenciável dos
--     clientes corporativos de faturamento — traz a planilha paralela p/ a plataforma) +
--     RPCs de CRUD/import/lookup + o helper de normalização de nome + GRANTs. RLS
--     deny-by-default. UNIQUE no nome normalizado.
--   • ADITIVA: só CREATE de objetos NOVOS + GRANT. NÃO altera tabela/coluna/dado pré-existente.
--     As escritas (INSERT/UPDATE/DELETE) vivem DENTRO do corpo das funções (não top-level), e
--     só tocam a tabela NOVA — não há escrita-no-mundo no apply da migration.
--   • CONTEXTO: cadastro é REFERÊNCIA (Visão A) — guarda os dados (situação/dias/regras/e-mails);
--     a plataforma NÃO aplica as regras automaticamente. Campos TEXT (dias como "01 / 10 / 20"
--     não são estruturados). Nome (empresa) = chave; UNIQUE normalizado impede duplicados.
--   • Normalização do nome: trim + minúsculo + COLAPSO de espaços internos (o spec pede
--     TRIM+minúsculo; colapsar runs de espaço serve melhor o invariante "impedir duplicados"
--     — "Acme  Ltda" e "Acme Ltda" são o mesmo cliente).
--   • Reversão (manual, destrutiva): DROP das funções + DROP TABLE app.cliente_corporativo.
-- ---------------------------------------------------------------------------

-- 0) Normalização do nome (IMMUTABLE p/ poder indexar): trim + minúsculo + colapsa espaços.
CREATE OR REPLACE FUNCTION app.norm_nome(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$ SELECT lower(btrim(regexp_replace(coalesce(p, ''), '\s+', ' ', 'g'))) $$;

-- 1) Tabela do cadastro. empresa = chave (nome); UNIQUE normalizado impede duplicados entre
--    qualquer origem. Todos os campos de negócio são TEXT (Visão A).
CREATE TABLE IF NOT EXISTS app.cliente_corporativo (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa        text NOT NULL,                 -- nome (chave de ligação c/ fatura e raw.pessoas)
  situacao       text,                          -- 'ativo' | 'inativo' (normalizado na entrada)
  faturar_em     text,                          -- dias, ex. "01 / 10 / 20"
  vencimento     text,                          -- dias
  obs            text,                          -- regra fiscal em texto livre (NÃO interpretada)
  pct_juros      text,
  pct_multa      text,
  destinatarios  text,                          -- "ENVIAR PARA" concatenado (split = Fase 4)
  forma_pgto     text,
  contato_whats  text,
  origem         text NOT NULL CHECK (origem IN ('planilha','manual')),
  criado_em      timestamptz NOT NULL DEFAULT now(),
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  carregado_em   timestamptz                    -- quando veio da planilha (null p/ manual)
);

-- UNIQUE normalizado: impede dois clientes com o mesmo nome (trim+minúsculo+colapso), qualquer origem.
CREATE UNIQUE INDEX IF NOT EXISTS uq_cliente_corp_empresa_norm
  ON app.cliente_corporativo (app.norm_nome(empresa));

-- RLS deny-by-default (postura dos 6 schemas, 0123). O app nunca toca app.* direto; as RPCs
-- SECURITY DEFINER (owner postgres) ignoram RLS.
ALTER TABLE app.cliente_corporativo ENABLE ROW LEVEL SECURITY;

-- ── Leitura (tabela editável) ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.listar_clientes_corp()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v jsonb;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/faturamento-corp']);
  SELECT COALESCE(jsonb_agg(to_jsonb(c) - 'criado_em' - 'atualizado_em' - 'carregado_em' ORDER BY app.norm_nome(c.empresa)), '[]'::jsonb)
  INTO v FROM app.cliente_corporativo c;
  RETURN v;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.listar_clientes_corp() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.listar_clientes_corp() TO authenticated, service_role;

-- ── Lookup read-only (scaffolding p/ Fase 4; análogo a buscar_pessoas) ────────
CREATE OR REPLACE FUNCTION public.buscar_cliente_corporativo(p_nomes text[])
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v jsonb;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/faturamento-corp']);
  SELECT COALESCE(jsonb_agg(to_jsonb(c) - 'criado_em' - 'atualizado_em' - 'carregado_em'), '[]'::jsonb)
  INTO v
  FROM app.cliente_corporativo c
  WHERE app.norm_nome(c.empresa) = ANY (SELECT app.norm_nome(unnest(p_nomes)));
  RETURN v;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.buscar_cliente_corporativo(text[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.buscar_cliente_corporativo(text[]) TO authenticated, service_role;

-- ── Inserir manual (origem='manual'). Nome duplicado (qualquer origem) → reporta, não quebra. ──
CREATE OR REPLACE FUNCTION public.inserir_cliente_corp(p_dados jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_id bigint; v_empresa text;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/faturamento-corp']);
  v_empresa := btrim(p_dados->>'empresa');
  IF v_empresa IS NULL OR v_empresa = '' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'empresa_obrigatoria');
  END IF;
  IF EXISTS (SELECT 1 FROM app.cliente_corporativo WHERE app.norm_nome(empresa) = app.norm_nome(v_empresa)) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'duplicado');
  END IF;

  INSERT INTO app.cliente_corporativo (
    empresa, situacao, faturar_em, vencimento, obs, pct_juros, pct_multa,
    destinatarios, forma_pgto, contato_whats, origem
  ) VALUES (
    v_empresa,
    NULLIF(p_dados->>'situacao',''), NULLIF(p_dados->>'faturar_em',''), NULLIF(p_dados->>'vencimento',''),
    NULLIF(p_dados->>'obs',''), NULLIF(p_dados->>'pct_juros',''), NULLIF(p_dados->>'pct_multa',''),
    NULLIF(p_dados->>'destinatarios',''), NULLIF(p_dados->>'forma_pgto',''), NULLIF(p_dados->>'contato_whats',''),
    'manual'
  )
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.inserir_cliente_corp(jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.inserir_cliente_corp(jsonb) TO authenticated, service_role;

-- ── Atualizar 1 campo (edição inline). Campo em WHITELIST. Renomear p/ nome que já existe → reporta. ──
CREATE OR REPLACE FUNCTION public.atualizar_cliente_corp(p_id bigint, p_campo text, p_valor text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_val text;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/faturamento-corp']);
  IF p_campo NOT IN ('empresa','situacao','faturar_em','vencimento','obs','pct_juros','pct_multa','destinatarios','forma_pgto','contato_whats') THEN
    RAISE EXCEPTION 'campo não permitido: %', p_campo;
  END IF;
  v_val := NULLIF(p_valor, '');

  IF p_campo = 'empresa' THEN
    v_val := btrim(p_valor);
    IF v_val IS NULL OR v_val = '' THEN RETURN jsonb_build_object('ok', false, 'motivo', 'empresa_obrigatoria'); END IF;
    IF EXISTS (SELECT 1 FROM app.cliente_corporativo WHERE app.norm_nome(empresa) = app.norm_nome(v_val) AND id <> p_id) THEN
      RETURN jsonb_build_object('ok', false, 'motivo', 'duplicado');
    END IF;
  END IF;

  UPDATE app.cliente_corporativo SET
    empresa       = CASE WHEN p_campo = 'empresa'       THEN v_val ELSE empresa END,
    situacao      = CASE WHEN p_campo = 'situacao'      THEN v_val ELSE situacao END,
    faturar_em    = CASE WHEN p_campo = 'faturar_em'    THEN v_val ELSE faturar_em END,
    vencimento    = CASE WHEN p_campo = 'vencimento'    THEN v_val ELSE vencimento END,
    obs           = CASE WHEN p_campo = 'obs'           THEN v_val ELSE obs END,
    pct_juros     = CASE WHEN p_campo = 'pct_juros'     THEN v_val ELSE pct_juros END,
    pct_multa     = CASE WHEN p_campo = 'pct_multa'     THEN v_val ELSE pct_multa END,
    destinatarios = CASE WHEN p_campo = 'destinatarios' THEN v_val ELSE destinatarios END,
    forma_pgto    = CASE WHEN p_campo = 'forma_pgto'    THEN v_val ELSE forma_pgto END,
    contato_whats = CASE WHEN p_campo = 'contato_whats' THEN v_val ELSE contato_whats END,
    atualizado_em = now()
  WHERE id = p_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.atualizar_cliente_corp(bigint, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.atualizar_cliente_corp(bigint, text, text) TO authenticated, service_role;

-- ── Excluir 1 / apagar em massa (a UI computa os ids respeitando o filtro de origem) ──
CREATE OR REPLACE FUNCTION public.excluir_cliente_corp(p_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/faturamento-corp']);
  DELETE FROM app.cliente_corporativo WHERE id = p_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.excluir_cliente_corp(bigint) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.excluir_cliente_corp(bigint) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.apagar_clientes_corp(p_ids bigint[])
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_n int;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/faturamento-corp']);
  DELETE FROM app.cliente_corporativo WHERE id = ANY (p_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'removidos', v_n);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.apagar_clientes_corp(bigint[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.apagar_clientes_corp(bigint[]) TO authenticated, service_role;

-- ── Importar (SIMPLES): DELETE origem='planilha' + INSERT, numa transação. Mantém os manuais.
--    REPORTA (não quebra): nomes que colidem com MANUAL existente, e duplicados DENTRO da planilha.
CREATE OR REPLACE FUNCTION public.importar_clientes_corp(p_linhas jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_item jsonb;
  v_empresa text;
  v_norm text;
  v_inseridos int := 0;
  v_colisoes text[] := ARRAY[]::text[];   -- colidem com um cadastro MANUAL existente
  v_duplicadas text[] := ARRAY[]::text[]; -- nome repetido DENTRO da própria planilha
  v_vistos text[] := ARRAY[]::text[];     -- normalizados já inseridos neste lote
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/faturamento-corp']);

  -- substitui só a fatia da planilha; manuais permanecem intactos
  DELETE FROM app.cliente_corporativo WHERE origem = 'planilha';

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_linhas) LOOP
    v_empresa := btrim(v_item->>'empresa');
    CONTINUE WHEN v_empresa IS NULL OR v_empresa = '';   -- sem chave, ignora
    v_norm := app.norm_nome(v_empresa);

    IF v_norm = ANY (v_vistos) THEN
      v_duplicadas := v_duplicadas || v_empresa;         -- repetido na planilha
      CONTINUE;
    END IF;
    IF EXISTS (SELECT 1 FROM app.cliente_corporativo WHERE app.norm_nome(empresa) = v_norm AND origem = 'manual') THEN
      v_colisoes := v_colisoes || v_empresa;             -- já existe como manual → não sobrescreve
      CONTINUE;
    END IF;

    INSERT INTO app.cliente_corporativo (
      empresa, situacao, faturar_em, vencimento, obs, pct_juros, pct_multa,
      destinatarios, forma_pgto, contato_whats, origem, carregado_em
    ) VALUES (
      v_empresa,
      NULLIF(v_item->>'situacao',''), NULLIF(v_item->>'faturar_em',''), NULLIF(v_item->>'vencimento',''),
      NULLIF(v_item->>'obs',''), NULLIF(v_item->>'pct_juros',''), NULLIF(v_item->>'pct_multa',''),
      NULLIF(v_item->>'destinatarios',''), NULLIF(v_item->>'forma_pgto',''), NULLIF(v_item->>'contato_whats',''),
      'planilha', now()
    );
    v_vistos := v_vistos || v_norm;
    v_inseridos := v_inseridos + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'inseridos', v_inseridos,
    'colisoes_manual', to_jsonb(v_colisoes),
    'duplicadas_planilha', to_jsonb(v_duplicadas)
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.importar_clientes_corp(jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.importar_clientes_corp(jsonb) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
