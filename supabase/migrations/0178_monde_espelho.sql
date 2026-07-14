-- ---------------------------------------------------------------------------
-- 0178 — feat(v5.1.2/M1): schema espelho MONDE (ingestão paralela da API) + carga idempotente
--
-- DECLARAÇÃO (CLAUDE.md): ADITIVA / retrocompatível com a `main` viva.
--   • CREATE de SCHEMA e tabelas NOVAS (monde.*) + funções NOVAS + REVOKE/GRANT + NOTIFY.
--   • NÃO altera schema/tabela/coluna/dado pré-existente. O schema `monde` é SEPARADO de
--     `analytics`/`raw` e NUNCA é alcançado pelo TRUNCATE CASCADE do upload (nem vice-versa).
--   • TRUNCATE/UPSERT vivem DENTRO de corpos de função e só tocam tabelas NOVAS desta migration.
--
-- Para quê (v5.1.2): o Janus passa a LER a API do Monde e espelhar as vendas numa estrutura
-- PARALELA, para alimentar as Metas SEM tocar a base do upload. Decisão-mãe (investigação):
-- consumir `sales` cru (casa ao centavo por venda). Fonte de produção das Metas segue no
-- upload; a virada é o PASSO 2 (runbook a parte). Este schema é o lado "Monde".
--
-- Idempotência: UPSERT por `venda_numero` + `raw_hash` (se o hash não muda, pula) — oposto
-- do full-swap destrutivo do upload. Re-rodar o Cron nunca duplica.
--
-- `monde` NÃO é exposto pelo PostgREST (config.toml só expõe public/graphql_public), igual a
-- `analytics`: todo acesso é via RPCs SECURITY DEFINER no schema `public` (owner postgres
-- ignora RLS). Ingestão = service_role-only (server job via getAdminClient).
-- ---------------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS monde;
GRANT USAGE ON SCHEMA monde TO service_role;

-- ===========================================================================
-- 1. Tabelas VIVAS
-- ===========================================================================
-- Venda (1 por sale_number). Espelha analytics.fato_venda + campos novos do Monde
-- (status, setor já resolvido em macro, totais de conferência, raw + raw_hash).
-- Setor_macro guardado DIRETO (não FK às dims de produção) → estrutura auto-contida:
-- nenhuma venda do Monde se perde por dim ausente. Welcome é EXCLUÍDO na ingestão
-- (nunca chega aqui). Os 3 booleanos (contrato/taxa_servico/operacao_propria) são
-- SINTETIZADOS (ADR-0149) — completude/auditoria; a mv NÃO agrega por eles.
CREATE TABLE IF NOT EXISTS monde.venda (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  venda_numero      text NOT NULL UNIQUE,          -- sale_number — chave de dedup/UPSERT
  sale_id           uuid,                           -- sale_id do Monde (para o detalhe)
  data_venda        date NOT NULL,                  -- sale_date (a data que manda p/ a meta)
  status            text NOT NULL,                  -- closed | opened
  setor_micro       text NOT NULL,                  -- custom_field Setor (Lazer/Weddings/…)
  setor_macro       text NOT NULL,                  -- derivado (Lazer/Weddings/Corporativo) — nome INTERNO
  vendedor          text,                           -- travel_agent_name (Weddings: custom_field)
  pagante           text,
  pagante_doc       text,
  contrato          boolean NOT NULL DEFAULT false, -- sintetizado (ADR-0149)
  taxa_servico      boolean NOT NULL DEFAULT false, -- sintetizado: any(item.agency_service_fee>0)
  operacao_propria  boolean NOT NULL DEFAULT false, -- sintetizado: sem intermediary no raw
  total_final_value numeric(14,2),                  -- total da venda (conferência)
  total_revenue     numeric(14,2),                  -- receita da venda (conferência)
  raw               jsonb NOT NULL,                 -- payload nativo do Monde (reprocesso futuro)
  raw_hash          text NOT NULL,                  -- detecção de mudança (idempotência)
  sincronizado_em   timestamptz NOT NULL DEFAULT now(),
  criado_em         timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE monde.venda ENABLE ROW LEVEL SECURITY;   -- deny-by-default (postura dos schemas)
CREATE INDEX IF NOT EXISTS idx_monde_venda_data   ON monde.venda (data_venda);
CREATE INDEX IF NOT EXISTS idx_monde_venda_macro  ON monde.venda (setor_macro);

-- Item (1 por produto da venda). status active/canceled + canceled_at guardados (auditável);
-- a mv espelho (M4) soma só os ATIVOS. valor_total = product.total_amount; receitas = soma
-- dos passengers[].agency_fee do produto.
CREATE TABLE IF NOT EXISTS monde.venda_item (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  venda_id      bigint NOT NULL REFERENCES monde.venda(id) ON DELETE CASCADE,
  venda_numero  text NOT NULL,
  produto       text,
  product_kind  text,
  fornecedor    text,
  status        text NOT NULL DEFAULT 'active',     -- active | canceled
  canceled_at   timestamptz,
  valor_total   numeric(14,2) NOT NULL DEFAULT 0,
  receitas      numeric(14,2) NOT NULL DEFAULT 0,
  data_inicio   date,
  data_fim      date,
  passageiros   integer
);
ALTER TABLE monde.venda_item ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_monde_item_venda  ON monde.venda_item (venda_id);
CREATE INDEX IF NOT EXISTS idx_monde_item_status ON monde.venda_item (status);

-- Controle de ingestão (cursor do backfill, marca do último incremental).
CREATE TABLE IF NOT EXISTS monde.ingest_control (
  chave         text PRIMARY KEY,
  valor         text,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE monde.ingest_control ENABLE ROW LEVEL SECURITY;

-- ===========================================================================
-- 2. Staging (UNLOGGED, efêmera) — mesma estrutura util das vivas
-- ===========================================================================
CREATE UNLOGGED TABLE IF NOT EXISTS monde.venda_staging (
  venda_numero      text,
  sale_id           uuid,
  data_venda        date,
  status            text,
  setor_micro       text,
  setor_macro       text,
  vendedor          text,
  pagante           text,
  pagante_doc       text,
  contrato          boolean,
  taxa_servico      boolean,
  operacao_propria  boolean,
  total_final_value numeric(14,2),
  total_revenue     numeric(14,2),
  raw               jsonb,
  raw_hash          text
);
ALTER TABLE monde.venda_staging ENABLE ROW LEVEL SECURITY;

CREATE UNLOGGED TABLE IF NOT EXISTS monde.venda_item_staging (
  venda_numero  text,
  produto       text,
  product_kind  text,
  fornecedor    text,
  status        text,
  canceled_at   timestamptz,
  valor_total   numeric(14,2),
  receitas      numeric(14,2),
  data_inicio   date,
  data_fim      date,
  passageiros   integer
);
ALTER TABLE monde.venda_item_staging ENABLE ROW LEVEL SECURITY;

-- ===========================================================================
-- 3. RPCs de ingestão (service_role-only; sem exigir_acesso — job de servidor)
-- ===========================================================================

-- 3.1 Limpa a staging (início de cada janela/lote).
CREATE OR REPLACE FUNCTION public.monde_ingest_limpar_staging()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  TRUNCATE monde.venda_staging;
  TRUNCATE monde.venda_item_staging;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.monde_ingest_limpar_staging() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.monde_ingest_limpar_staging() TO service_role;

-- 3.2 Insere um lote na STAGING. Cada elemento de p_vendas = venda + array `itens`.
CREATE OR REPLACE FUNCTION public.monde_ingest_lote(p_vendas jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v  jsonb;
  it jsonb;
BEGIN
  FOR v IN SELECT jsonb_array_elements(p_vendas)
  LOOP
    INSERT INTO monde.venda_staging (
      venda_numero, sale_id, data_venda, status, setor_micro, setor_macro, vendedor,
      pagante, pagante_doc, contrato, taxa_servico, operacao_propria,
      total_final_value, total_revenue, raw, raw_hash
    ) VALUES (
      v->>'venda_numero',
      NULLIF(v->>'sale_id','')::uuid,
      (v->>'data_venda')::date,
      v->>'status',
      v->>'setor_micro',
      v->>'setor_macro',
      v->>'vendedor',
      v->>'pagante',
      v->>'pagante_doc',
      COALESCE((v->>'contrato')::boolean, false),
      COALESCE((v->>'taxa_servico')::boolean, false),
      COALESCE((v->>'operacao_propria')::boolean, false),
      NULLIF(v->>'total_final_value','')::numeric,
      NULLIF(v->>'total_revenue','')::numeric,
      COALESCE(v->'raw', '{}'::jsonb),
      v->>'raw_hash'
    );
    FOR it IN SELECT jsonb_array_elements(COALESCE(v->'itens', '[]'::jsonb))
    LOOP
      INSERT INTO monde.venda_item_staging (
        venda_numero, produto, product_kind, fornecedor, status, canceled_at,
        valor_total, receitas, data_inicio, data_fim, passageiros
      ) VALUES (
        v->>'venda_numero',
        it->>'produto',
        it->>'product_kind',
        it->>'fornecedor',
        COALESCE(it->>'status','active'),
        NULLIF(it->>'canceled_at','')::timestamptz,
        COALESCE(NULLIF(it->>'valor_total','')::numeric, 0),
        COALESCE(NULLIF(it->>'receitas','')::numeric, 0),
        NULLIF(it->>'data_inicio','')::date,
        NULLIF(it->>'data_fim','')::date,
        NULLIF(it->>'passageiros','')::integer
      );
    END LOOP;
  END LOOP;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.monde_ingest_lote(jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.monde_ingest_lote(jsonb) TO service_role;

-- 3.3 PROMOVER: UPSERT idempotente staging → vivas. Só toca vendas NOVAS ou com raw_hash
--     diferente; itens das vendas mudadas são recriados (DELETE+INSERT em statements
--     SEPARADOS p/ ordem garantida). Atômico (corpo da função = 1 transação). Retorna contagens.
CREATE OR REPLACE FUNCTION public.monde_ingest_promover()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_ids   bigint[];
  v_ins   int := 0;
  v_upd   int := 0;
  v_itens int := 0;
  v_total int;
  v_skip  int;
BEGIN
  SELECT count(*) INTO v_total FROM monde.venda_staging;
  IF v_total = 0 THEN
    RETURN jsonb_build_object('ok', true, 'inseridas', 0, 'atualizadas', 0, 'ignoradas', 0, 'itens', 0);
  END IF;

  -- UPSERT das vendas; ON CONFLICT ... WHERE raw_hash mudou → linha igual NÃO é retornada (pula).
  -- xmax=0 distingue INSERT (nova) de UPDATE (mudada). Captura os ids mudados.
  WITH up AS (
    INSERT INTO monde.venda AS d (
      venda_numero, sale_id, data_venda, status, setor_micro, setor_macro, vendedor,
      pagante, pagante_doc, contrato, taxa_servico, operacao_propria,
      total_final_value, total_revenue, raw, raw_hash, sincronizado_em
    )
    SELECT
      s.venda_numero, s.sale_id, s.data_venda, s.status, s.setor_micro, s.setor_macro, s.vendedor,
      s.pagante, s.pagante_doc, s.contrato, s.taxa_servico, s.operacao_propria,
      s.total_final_value, s.total_revenue, s.raw, s.raw_hash, now()
    FROM monde.venda_staging s
    ON CONFLICT (venda_numero) DO UPDATE SET
      sale_id=EXCLUDED.sale_id, data_venda=EXCLUDED.data_venda, status=EXCLUDED.status,
      setor_micro=EXCLUDED.setor_micro, setor_macro=EXCLUDED.setor_macro, vendedor=EXCLUDED.vendedor,
      pagante=EXCLUDED.pagante, pagante_doc=EXCLUDED.pagante_doc, contrato=EXCLUDED.contrato,
      taxa_servico=EXCLUDED.taxa_servico, operacao_propria=EXCLUDED.operacao_propria,
      total_final_value=EXCLUDED.total_final_value, total_revenue=EXCLUDED.total_revenue,
      raw=EXCLUDED.raw, raw_hash=EXCLUDED.raw_hash, sincronizado_em=now()
    WHERE d.raw_hash IS DISTINCT FROM EXCLUDED.raw_hash
    RETURNING d.id, (xmax = 0) AS inserted
  )
  SELECT
    COALESCE(array_agg(id), '{}'::bigint[]),
    COALESCE(count(*) FILTER (WHERE inserted), 0),
    COALESCE(count(*) FILTER (WHERE NOT inserted), 0)
  INTO v_ids, v_ins, v_upd
  FROM up;

  -- Itens só das vendas mudadas: recria (DELETE então INSERT, ordem garantida).
  IF array_length(v_ids, 1) IS NOT NULL THEN
    DELETE FROM monde.venda_item WHERE venda_id = ANY(v_ids);
    INSERT INTO monde.venda_item (
      venda_id, venda_numero, produto, product_kind, fornecedor, status, canceled_at,
      valor_total, receitas, data_inicio, data_fim, passageiros
    )
    SELECT
      d.id, si.venda_numero, si.produto, si.product_kind, si.fornecedor,
      COALESCE(si.status,'active'), si.canceled_at, si.valor_total, si.receitas,
      si.data_inicio, si.data_fim, si.passageiros
    FROM monde.venda_item_staging si
    JOIN monde.venda d ON d.venda_numero = si.venda_numero
    WHERE d.id = ANY(v_ids);
    GET DIAGNOSTICS v_itens = ROW_COUNT;
  END IF;

  v_skip := v_total - v_ins - v_upd;

  INSERT INTO monde.ingest_control (chave, valor, atualizado_em)
  VALUES ('ultimo_promover', now()::text, now())
  ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = now();

  RETURN jsonb_build_object(
    'ok', true, 'inseridas', v_ins, 'atualizadas', v_upd, 'ignoradas', v_skip, 'itens', v_itens
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.monde_ingest_promover() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.monde_ingest_promover() TO service_role;

-- 3.4 Status do espelho (contagens + última sync) — p/ o Cron/telas logarem.
CREATE OR REPLACE FUNCTION public.monde_ingest_status()
RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'vendas',            (SELECT count(*) FROM monde.venda),
    'itens',             (SELECT count(*) FROM monde.venda_item),
    'itens_ativos',      (SELECT count(*) FROM monde.venda_item WHERE status = 'active'),
    'min_data',          (SELECT min(data_venda) FROM monde.venda),
    'max_data',          (SELECT max(data_venda) FROM monde.venda),
    'ultima_sync',       (SELECT max(sincronizado_em) FROM monde.venda)
  )
$$;
REVOKE EXECUTE ON FUNCTION public.monde_ingest_status() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.monde_ingest_status() TO service_role;

-- 3.5 Cursor de controle (backfill/incremental) — get/set simples.
CREATE OR REPLACE FUNCTION public.monde_ingest_control_get(p_chave text)
RETURNS text
LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
  SELECT valor FROM monde.ingest_control WHERE chave = p_chave
$$;
REVOKE EXECUTE ON FUNCTION public.monde_ingest_control_get(text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.monde_ingest_control_get(text) TO service_role;

CREATE OR REPLACE FUNCTION public.monde_ingest_control_set(p_chave text, p_valor text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO monde.ingest_control (chave, valor, atualizado_em)
  VALUES (p_chave, p_valor, now())
  ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = now();
END;
$$;
REVOKE EXECUTE ON FUNCTION public.monde_ingest_control_set(text, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.monde_ingest_control_set(text, text) TO service_role;

NOTIFY pgrst, 'reload schema';
