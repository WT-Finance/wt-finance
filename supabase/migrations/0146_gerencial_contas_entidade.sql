-- ---------------------------------------------------------------------------
-- 0146 — v4.21.0 M1: contas do Fluxo de Caixa Gerencial viram entidade gerenciável.
--
-- DECLARAÇÃO (ADITIVA / retrocompatível):
--   • Estende analytics.gerencial_saldos com 3 colunas (limite, consolidado, papel).
--   • Backfilla as 4 contas atuais para PRESERVAR o comportamento da tela (Itaú=isolada+
--     consolidado+limite 200k; Asaas/Blimboo=consolidado; Clara=reserva). O UPDATE atinge
--     SÓ colunas RECÉM-CRIADAS — não sobrescreve dado pré-existente → aditiva de fato.
--   • Adiciona grants INSERT/DELETE (hoje só SELECT/UPDATE) e RPCs de CRUD de conta
--     (já nascem "hardened": exigir_acesso + GRANT authenticated — fecha M2 nas RPCs novas).
--   • get_gerencial_saldos / update_gerencial_saldo recriados aqui (novas colunas + guard).
--   Se o heurístico do db-gate marcar como destrutiva (por causa do UPDATE), CONFIRMAR
--   CONSCIENTEMENTE: é aditiva (colunas novas + backfill delas), reversível, sem perda.
-- ---------------------------------------------------------------------------

-- ── 1. Extensão da tabela ───────────────────────────────────────────────────
ALTER TABLE analytics.gerencial_saldos
  ADD COLUMN IF NOT EXISTS limite      NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS consolidado BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS papel       TEXT CHECK (papel IN ('isolada','reserva'));

-- Papéis são EXCLUSIVOS: no máximo 1 conta 'isolada' e 1 'reserva' (e uma conta tem
-- no máx. um papel). Índice único parcial garante isso no banco.
CREATE UNIQUE INDEX IF NOT EXISTS uq_gerencial_saldos_papel
  ON analytics.gerencial_saldos (papel) WHERE papel IS NOT NULL;

-- ── 2. Backfill das 4 contas atuais (preserva a tela; só colunas novas) ──────
UPDATE analytics.gerencial_saldos SET consolidado = true,  papel = 'isolada', limite = 200000 WHERE conta = 'Itaú';
UPDATE analytics.gerencial_saldos SET consolidado = true                                       WHERE conta IN ('Asaas', 'Blimboo');
UPDATE analytics.gerencial_saldos SET consolidado = false, papel = 'reserva'                    WHERE conta = 'Clara';

-- ── 3. Grants novos ──────────────────────────────────────────────────────────
GRANT INSERT, DELETE ON analytics.gerencial_saldos TO service_role;

-- ── 4. RPCs de contas (born-hardened: exigir_acesso(['financeiro/gerencial']) + authenticated) ──

-- Leitura: agora devolve os atributos novos (limite, consolidado, papel, ativo).
CREATE OR REPLACE FUNCTION public.get_gerencial_saldos()
RETURNS JSON LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/gerencial']);
  RETURN (
    SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.ordem), '[]'::json)
    FROM (
      SELECT conta, saldo, ordem, ativo, limite, consolidado, papel
      FROM analytics.gerencial_saldos
      WHERE ativo = true
    ) t
  );
END $$;

-- Edição de saldo (mantida; usada pelo SaldoInput) — agora com guard.
CREATE OR REPLACE FUNCTION public.update_gerencial_saldo(p_conta TEXT, p_saldo NUMERIC)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/gerencial']);
  UPDATE analytics.gerencial_saldos SET saldo = p_saldo, atualizado_em = now() WHERE conta = p_conta;
  RETURN FOUND;
END $$;

-- Criar conta.
CREATE OR REPLACE FUNCTION public.create_gerencial_conta(
  p_conta       TEXT,
  p_saldo       NUMERIC  DEFAULT 0,
  p_limite      NUMERIC  DEFAULT NULL,
  p_consolidado BOOLEAN  DEFAULT false,
  p_papel       TEXT     DEFAULT NULL
) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_nome  TEXT := btrim(p_conta);
  v_papel TEXT := NULLIF(p_papel, '');
  v_ordem INT;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/gerencial']);
  IF v_nome = '' OR v_nome IS NULL THEN RAISE EXCEPTION 'CONTA_VAZIA: nome obrigatório'; END IF;
  IF EXISTS (SELECT 1 FROM analytics.gerencial_saldos WHERE conta = v_nome) THEN
    RAISE EXCEPTION 'CONTA_DUPLICADA: já existe conta "%"', v_nome;
  END IF;
  -- Papel é exclusivo: ao atribuir, libera de quem detinha.
  IF v_papel IS NOT NULL THEN
    UPDATE analytics.gerencial_saldos SET papel = NULL WHERE papel = v_papel;
  END IF;
  SELECT COALESCE(MAX(ordem), 0) + 1 INTO v_ordem FROM analytics.gerencial_saldos;
  INSERT INTO analytics.gerencial_saldos (conta, saldo, limite, consolidado, papel, ordem, ativo)
  VALUES (v_nome, COALESCE(p_saldo, 0), p_limite, COALESCE(p_consolidado, false), v_papel, v_ordem, true);
  RETURN (SELECT row_to_json(t) FROM (
    SELECT conta, saldo, ordem, ativo, limite, consolidado, papel
    FROM analytics.gerencial_saldos WHERE conta = v_nome
  ) t);
END $$;

-- Editar conta (atributos + rename). p_updates: {nome, saldo, limite, consolidado, papel}.
-- papel='isolada'|'reserva' é exclusivo (libera de outra conta); papel=null/'' remove o papel.
CREATE OR REPLACE FUNCTION public.update_gerencial_conta(p_conta TEXT, p_updates JSONB)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_novo_papel TEXT;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/gerencial']);
  -- Exclusividade do papel: se vier 'papel' não-nulo, libera de quem detém.
  IF p_updates ? 'papel' THEN
    v_novo_papel := NULLIF(p_updates->>'papel', '');
    IF v_novo_papel IS NOT NULL THEN
      IF v_novo_papel NOT IN ('isolada','reserva') THEN RAISE EXCEPTION 'PAPEL_INVALIDO: %', v_novo_papel; END IF;
      UPDATE analytics.gerencial_saldos SET papel = NULL WHERE papel = v_novo_papel AND conta <> p_conta;
    END IF;
  END IF;
  UPDATE analytics.gerencial_saldos SET
    conta       = CASE WHEN p_updates ? 'nome'        THEN btrim(p_updates->>'nome')              ELSE conta       END,
    saldo       = CASE WHEN p_updates ? 'saldo'       THEN (p_updates->>'saldo')::NUMERIC          ELSE saldo       END,
    limite      = CASE WHEN p_updates ? 'limite'      THEN NULLIF(p_updates->>'limite','')::NUMERIC ELSE limite      END,
    consolidado = CASE WHEN p_updates ? 'consolidado' THEN (p_updates->>'consolidado')::BOOLEAN     ELSE consolidado END,
    papel       = CASE WHEN p_updates ? 'papel'       THEN NULLIF(p_updates->>'papel','')           ELSE papel       END,
    atualizado_em = now()
  WHERE conta = p_conta;
  RETURN FOUND;
END $$;

-- Remover conta (hard delete da entidade; conta_previsao dos lançamentos é texto livre,
-- sem FK — não cascateia, e é irrelevante para a agregada por decisão de modelo v4.21).
CREATE OR REPLACE FUNCTION public.delete_gerencial_conta(p_conta TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/gerencial']);
  DELETE FROM analytics.gerencial_saldos WHERE conta = p_conta;
  RETURN FOUND;
END $$;

-- ── 5. Grants das RPCs (REVOKE público; GRANT authenticated + service_role) ──
REVOKE EXECUTE ON FUNCTION public.get_gerencial_saldos()                          FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_gerencial_saldo(TEXT, NUMERIC)           FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_gerencial_conta(TEXT,NUMERIC,NUMERIC,BOOLEAN,TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_gerencial_conta(TEXT, JSONB)             FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_gerencial_conta(TEXT)                    FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_gerencial_saldos()                          TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_gerencial_saldo(TEXT, NUMERIC)           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_gerencial_conta(TEXT,NUMERIC,NUMERIC,BOOLEAN,TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_gerencial_conta(TEXT, JSONB)             TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_gerencial_conta(TEXT)                    TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
