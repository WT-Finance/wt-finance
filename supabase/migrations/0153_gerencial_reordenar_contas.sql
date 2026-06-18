-- ---------------------------------------------------------------------------
-- 0153 — v4.22.4: reordenação das contas gerenciais (define a ORDEM dos cards na
-- Visualização Agregada e das linhas no drawer "Gerenciar contas").
--
-- DECLARAÇÃO: ADITIVA / retrocompatível — RPC NOVA. O `UPDATE` só roda quando a UI
-- chama reordenar (arrastar-soltar) e reescreve APENAS a coluna `ordem` de
-- analytics.gerencial_saldos (não toca saldo/limite/consolidado/papel/conta). Atômico
-- (um único UPDATE via unnest WITH ORDINALITY). Born-hardened: exigir_acesso + GRANT
-- authenticated (mesmo padrão das demais RPCs de conta, 0146).
--
-- ⚠️ O heurístico do db-gate marca como destrutiva (literal `UPDATE` no corpo da função)
-- → aplicar sob CONFIRMAÇÃO HUMANA CONSCIENTE, embora seja aditiva (não há DDL de tabela
-- nem escrita em dado pré-existente fora da coluna `ordem` sob ação explícita do usuário).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reordenar_gerencial_contas(p_contas TEXT[])
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/gerencial']);
  UPDATE analytics.gerencial_saldos g
  SET ordem = t.pos::int, atualizado_em = now()
  FROM unnest(p_contas) WITH ORDINALITY AS t(nome, pos)
  WHERE g.conta = t.nome;
  RETURN FOUND;
END $$;

REVOKE EXECUTE ON FUNCTION public.reordenar_gerencial_contas(TEXT[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.reordenar_gerencial_contas(TEXT[]) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
