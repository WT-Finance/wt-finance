-- ---------------------------------------------------------------------------
-- 0233 — feat(v5.4.4): Metas por Subsetor de Weddings — tabelas + RPCs
--
-- DECLARAÇÃO PRÉVIA (regime aditivo / autônomo):
--   • O QUE FAZ:
--       - CREATE TABLE app.meta_subsetor (grade mensal de metas por subsetor de
--         Weddings: COMERCIAL, PLANEJAMENTO, PRODUÇÃO, CONVIDADOS - Hospedagens,
--         CONVIDADOS - Extras). Espelha app.meta_setor (0004), trocando
--         setor_macro_id (FK numérica) por subsetor (text + CHECK), e somando
--         meta_contratos (só faz sentido para COMERCIAL — trava por CHECK
--         nomeado + validação na RPC).
--       - CREATE TABLE app.meta_subsetor_historico — espelha
--         app.meta_setor_historico (0004 + colunas pct_receita/pct_receita_anterior
--         da 0175), trocando setor_macro_id por subsetor e somando
--         meta_contratos/meta_contratos_anterior. Sem UNIQUE (log de auditoria).
--       - RPCs inline (padrão pós-v4.29, mesmo molde de metas_listar/metas_upsert
--         da 0175): metas_subsetor_listar (leitura) e metas_subsetor_upsert
--         (escrita + histórico condicional). Reusam as áreas RBAC JÁ existentes
--         'metas/acompanhamento' (leitura) e 'metas' (edição) — nenhuma área nova.
--   • ADITIVA / RETROCOMPATÍVEL: só CREATE TABLE e CREATE FUNCTION. Nenhuma
--     tabela, coluna, RPC ou linha pré-existente é alterada ou removida. A
--     numeração 0233 foi conferida contra supabase/migrations/ real antes de
--     escrever este arquivo (nenhum 023x pré-existia).
--   • RLS: app.meta_subsetor e app.meta_subsetor_historico entram com
--     ENABLE ROW LEVEL SECURITY e SEM policy permissiva — espelha exatamente o
--     que app.meta_setor/app.meta_setor_historico têm HOJE (a policy
--     "leitura_anon" USING true de 0007 foi removida na 0123; hoje é
--     deny-by-default, e o acesso real é só via RPC SECURITY DEFINER). Não
--     inventamos policy nova.
--   • OS 5 LITERAIS do CHECK de `subsetor` são idênticos, byte a byte (inclusive
--     acentos), a SUBSETOR_ORDER de src/lib/config.ts. A igualdade é garantida
--     por teste automatizado — alterar um lado sem o outro quebra o teste.
--   • Reversão (manual, destrutiva): DROP das 2 funções; DROP das 2 tabelas;
--     nenhuma área RBAC foi criada aqui, então não há o que remover ali.
-- ---------------------------------------------------------------------------

-- ── 1. app.meta_subsetor ─────────────────────────────────────────────────
CREATE TABLE app.meta_subsetor (
  id             bigserial      PRIMARY KEY,
  -- Lista canônica também vive em src/lib/config.ts (SUBSETOR_ORDER) — a
  -- igualdade byte a byte (inclusive acentos: "PRODUÇÃO" com Ç e Ã) é
  -- garantida por teste automatizado. Não editar um lado sem o outro.
  subsetor       text           NOT NULL
    CHECK (subsetor IN ('COMERCIAL','PLANEJAMENTO','PRODUÇÃO',
                        'CONVIDADOS - Hospedagens','CONVIDADOS - Extras')),
  ano            int            NOT NULL,
  mes            int            NOT NULL CHECK (mes BETWEEN 1 AND 12),
  valor_meta     numeric(14,2)  NOT NULL CHECK (valor_meta >= 0),
  meta_contratos int            NULL CHECK (meta_contratos IS NULL OR meta_contratos >= 0),
  pct_receita    numeric(5,2)   NULL CHECK (pct_receita IS NULL OR (pct_receita BETWEEN 0 AND 100)),
  fonte          text           NOT NULL CHECK (fonte IN ('real','ficticia')),
  criado_em      timestamptz    NOT NULL DEFAULT now(),
  -- meta_contratos só faz sentido para COMERCIAL (único subsetor com o produto
  -- "Contrato de Casamento" — ver 0099). A RPC também barra ANTES, com
  -- mensagem legível (METAS_CONTRATOS_SO_COMERCIAL); esta constraint é a
  -- última linha de defesa no próprio dado.
  CONSTRAINT meta_subsetor_contratos_so_comercial
    CHECK (meta_contratos IS NULL OR subsetor = 'COMERCIAL'),
  UNIQUE (subsetor, ano, mes)
);

ALTER TABLE app.meta_subsetor ENABLE ROW LEVEL SECURITY;

-- ── 2. app.meta_subsetor_historico — snapshot de cada alteração ─────────────
CREATE TABLE app.meta_subsetor_historico (
  id                      bigserial      PRIMARY KEY,
  subsetor                text           NOT NULL
    CHECK (subsetor IN ('COMERCIAL','PLANEJAMENTO','PRODUÇÃO',
                        'CONVIDADOS - Hospedagens','CONVIDADOS - Extras')),
  ano                     int            NOT NULL,
  mes                     int            NOT NULL CHECK (mes BETWEEN 1 AND 12),
  valor_meta              numeric(14,2)  NOT NULL,
  meta_contratos          int,
  pct_receita             numeric(5,2),
  fonte                   text           NOT NULL CHECK (fonte IN ('real', 'ficticia')),
  criado_em               timestamptz    NOT NULL DEFAULT now(),
  alterado_em             timestamptz    NOT NULL DEFAULT now(),
  alterado_por            text,
  valor_anterior          numeric(14,2),
  meta_contratos_anterior int,
  pct_receita_anterior    numeric(5,2),
  motivo_alteracao        text
  -- Sem UNIQUE: é log de auditoria (cada alteração gera uma linha nova),
  -- espelhando app.meta_setor_historico.
);

ALTER TABLE app.meta_subsetor_historico ENABLE ROW LEVEL SECURITY;

-- ── 3. RPC de LEITURA — grade anual por subsetor ────────────────────────────
-- Espelha metas_listar (0175). Ordenação por CASE explícito na ordem de
-- SUBSETOR_ORDER — não há coluna "ordem" para subsetor (dim_setor_macro.ordem
-- é por SETOR MACRO, não por subsetor detalhado).
CREATE OR REPLACE FUNCTION public.metas_subsetor_listar(p_ano int)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v jsonb;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['metas/acompanhamento', 'metas']);
  SELECT jsonb_build_object(
    'ano', p_ano,
    'metas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'subsetor',       m.subsetor,
               'mes',            m.mes,
               'valor_meta',     m.valor_meta,
               'meta_contratos', m.meta_contratos,
               'pct_receita',    m.pct_receita
             ) ORDER BY
               CASE m.subsetor
                 WHEN 'COMERCIAL'                  THEN 1
                 WHEN 'PLANEJAMENTO'                THEN 2
                 WHEN 'PRODUÇÃO'                    THEN 3
                 WHEN 'CONVIDADOS - Hospedagens'    THEN 4
                 WHEN 'CONVIDADOS - Extras'         THEN 5
               END,
               m.mes)
      FROM app.meta_subsetor m
      WHERE m.ano = p_ano AND m.fonte = 'real'
    ), '[]'::jsonb),
    'ultima_alteracao', (
      SELECT jsonb_build_object('alterado_em', h.alterado_em, 'alterado_por', h.alterado_por)
      FROM app.meta_subsetor_historico h
      WHERE h.ano = p_ano
      ORDER BY h.alterado_em DESC
      LIMIT 1
    )
  ) INTO v;
  RETURN v;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.metas_subsetor_listar(int) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.metas_subsetor_listar(int) TO authenticated, service_role;

-- ── 4. RPC de ESCRITA — upsert do Cadastro + trilha de auditoria ────────────
-- Espelha metas_upsert (0175), incluindo o bloco de descoberta de
-- alterado_por: NÃO usa auth.uid() (a RPC roda SECURITY DEFINER como
-- postgres) — lê o claim `sub` do JWT via current_setting('request.jwt.claims',
-- true) e resolve nome/e-mail por join com app.rbac_usuarios. Copiado literal
-- do irmão.
--
-- ⚠️ CONTRATO DO PAYLOAD — cada item é a LINHA COMPLETA de (subsetor, ano, mes),
-- não um delta de célula. O `ON CONFLICT DO UPDATE` grava os três campos
-- (valor_meta, meta_contratos, pct_receita) com o que veio no item, então um item
-- que OMITA `meta_contratos` para COMERCIAL **apaga** a meta de contratos que
-- estava lá — perda de dado por omissão, não por intenção. O Cadastro envia só as
-- linhas que o usuário tocou (o gatilho da rampa depende disso), mas cada linha
-- enviada tem de trazer os três campos com o valor CORRENTE, inclusive os que não
-- mudaram. Não trocar isto por COALESCE(EXCLUDED.x, tabela.x): aí ficaria
-- impossível LIMPAR um campo de volta para NULL.
CREATE OR REPLACE FUNCTION public.metas_subsetor_upsert(p_metas jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  item            jsonb;
  v_subsetor      text;
  v_ano           int;
  v_mes           int;
  v_valor         numeric;
  v_contratos     int;
  v_pct           numeric;
  v_old_valor     numeric;
  v_old_contratos int;
  v_old_pct       numeric;
  v_existe        boolean;
  v_uid           uuid;
  v_quem          text;
  v_n             int := 0;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['metas']);

  v_uid := nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid;
  IF v_uid IS NOT NULL THEN
    SELECT coalesce(u.nome, u.email) INTO v_quem FROM app.rbac_usuarios u WHERE u.user_id = v_uid;
  END IF;

  FOR item IN SELECT jsonb_array_elements(p_metas)
  LOOP
    v_subsetor  := item->>'subsetor';
    v_ano       := (item->>'ano')::int;
    v_mes       := (item->>'mes')::int;
    v_valor     := (item->>'valor_meta')::numeric;
    v_contratos := nullif(item->>'meta_contratos', '')::int;
    v_pct       := nullif(item->>'pct_receita', '')::numeric;

    -- `IS NULL OR` é obrigatório: `NULL NOT IN (...)` avalia para NULL, não TRUE,
    -- então um item sem a chave `subsetor` ESCAPARIA desta validação e só quebraria
    -- depois, no NOT NULL do INSERT, com erro de Postgres cru em vez da mensagem
    -- legível que o front sabe traduzir.
    IF v_subsetor IS NULL
       OR v_subsetor NOT IN ('COMERCIAL', 'PLANEJAMENTO', 'PRODUÇÃO',
                             'CONVIDADOS - Hospedagens', 'CONVIDADOS - Extras') THEN
      RAISE EXCEPTION 'METAS_SUBSETOR_INVALIDO: subsetor % inexistente', v_subsetor USING ERRCODE = '22023';
    END IF;
    -- Mesmo motivo do guard de `v_subsetor` acima: com v_mes/v_ano NULL, as
    -- comparações avaliam NULL (nunca TRUE) e o item escaparia da validação, quebrando
    -- só depois no NOT NULL do INSERT, com erro cru do Postgres que o front não traduz.
    IF v_ano IS NULL THEN
      RAISE EXCEPTION 'METAS_ANO_INVALIDO: ano ausente no item' USING ERRCODE = '22023';
    END IF;
    IF v_mes IS NULL OR v_mes < 1 OR v_mes > 12 THEN
      RAISE EXCEPTION 'METAS_MES_INVALIDO: %', v_mes USING ERRCODE = '22023';
    END IF;
    IF v_valor IS NULL OR v_valor < 0 THEN
      RAISE EXCEPTION 'METAS_VALOR_INVALIDO: %', v_valor USING ERRCODE = '22023';
    END IF;
    IF v_pct IS NOT NULL AND (v_pct < 0 OR v_pct > 100) THEN
      RAISE EXCEPTION 'METAS_PCT_INVALIDO: %', v_pct USING ERRCODE = '22023';
    END IF;
    IF v_contratos IS NOT NULL AND v_contratos < 0 THEN
      RAISE EXCEPTION 'METAS_CONTRATOS_INVALIDO: %', v_contratos USING ERRCODE = '22023';
    END IF;
    IF v_contratos IS NOT NULL AND v_subsetor <> 'COMERCIAL' THEN
      RAISE EXCEPTION 'METAS_CONTRATOS_SO_COMERCIAL: meta_contratos só se aplica a COMERCIAL (subsetor %)', v_subsetor
        USING ERRCODE = '22023';
    END IF;

    SELECT valor_meta, meta_contratos, pct_receita, true
      INTO v_old_valor, v_old_contratos, v_old_pct, v_existe
    FROM app.meta_subsetor WHERE subsetor = v_subsetor AND ano = v_ano AND mes = v_mes;

    INSERT INTO app.meta_subsetor (subsetor, ano, mes, valor_meta, meta_contratos, pct_receita, fonte)
    VALUES (v_subsetor, v_ano, v_mes, v_valor, v_contratos, v_pct, 'real')
    ON CONFLICT (subsetor, ano, mes) DO UPDATE
      SET valor_meta     = EXCLUDED.valor_meta,
          meta_contratos = EXCLUDED.meta_contratos,
          pct_receita    = EXCLUDED.pct_receita,
          fonte          = 'real';

    IF NOT coalesce(v_existe, false)
       OR v_old_valor     IS DISTINCT FROM v_valor
       OR v_old_contratos IS DISTINCT FROM v_contratos
       OR v_old_pct       IS DISTINCT FROM v_pct THEN
      INSERT INTO app.meta_subsetor_historico
        (subsetor, ano, mes, valor_meta, meta_contratos, pct_receita, fonte,
         alterado_por, valor_anterior, meta_contratos_anterior, pct_receita_anterior, motivo_alteracao)
      VALUES
        (v_subsetor, v_ano, v_mes, v_valor, v_contratos, v_pct, 'real',
         v_quem, v_old_valor, v_old_contratos, v_old_pct, NULL);
      v_n := v_n + 1;
    END IF;

    v_existe := NULL; v_old_valor := NULL; v_old_contratos := NULL; v_old_pct := NULL;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'gravadas', v_n);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.metas_subsetor_upsert(jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.metas_subsetor_upsert(jsonb) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
