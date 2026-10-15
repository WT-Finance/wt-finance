-- ---------------------------------------------------------------------------
-- PATCH DESTRUTIVO (v6.4.0/M2) — amplia para 6 bases os dois CHECKs de `base` da ingestão
--
-- ⚠️ ESTE ARQUIVO NÃO ESTÁ em supabase/migrations/ DE PROPÓSITO. `db push` aplica TODO o conjunto
-- pendente da pasta; uma migration destrutiva escrita lá antes da hora seria empurrada junto de
-- qualquer aplicação aditiva (v5.2.0 — skill banco-e-rpc §1). Ele só entra na pasta na hora de
-- aplicar, pelas mãos do Yan.
--
-- CLASSIFICAÇÃO: DESTRUTIVA — por classificação do backup-gate (scripts/db-gate/classificar.mjs),
-- NÃO por perda de dado: o regex casa `ALTER TABLE … DROP` sem distinguir DROP COLUMN de
-- DROP CONSTRAINT (skill banco-e-rpc §5). Nenhuma linha é lida, alterada ou apagada: as duas
-- constraints são recriadas, idênticas, com UMA base a mais na lista.
--
-- O QUE FAZ
--   Recria, com as 6 bases (a nova, 'contas-receber', por ÚLTIMO):
--     • ingestao_carga_base_valida     em ingestao.carga     (0276)
--     • ingestao_promocao_base_valida  em ingestao.promocao  (0277)
--   Sem isto, abrir carga da base nova falha no CHECK de ingestao.carga e, mesmo que passasse, a
--   promoção falharia ao gravar em ingestao.promocao. É fail-closed: até o patch ser aplicado a base
--   `contas-receber` não grava nada e as outras cinco seguem iguais. A migration 0295 (aditiva) já
--   aceita a base nas RPCs; este patch fecha a única peça que ela não pode fazer sozinha.
--
-- COMO APLICAR (ato HUMANO, em terminal interativo — agente não consegue: stdin não-TTY aborta)
--   1. Conferir a numeração real: `ls supabase/migrations/ | tail -3` e as worktrees irmãs
--      (`ls ../*/supabase/migrations/ | tail -3`). Hoje o próximo livre depois de 0295/0296/0297
--      seria 0298 — VERIFICAR, não confiar.
--   2. Copiar este arquivo para `supabase/migrations/<NNNN>_contas_receber_checks_ingestao.sql`.
--      (As duas listas abaixo são lidas por src/lib/ingestao/bases-paridade.test.ts por NOME de
--      arquivo; ao copiar, apontar os blocos de ingestao_carga_base_valida/ingestao_promocao_base_valida
--      desse teste para a nova migration — a 0276/0277 ficam com a lista antiga.)
--   3. `npm run db:migrate -- --destrutiva`   (backup-gate → confirmação humana em TTY → push).
--      ⚠️ O push empurra TODO o pendente de supabase/migrations/ (inclusive 0296/0297, se ainda não
--      aplicadas) — aplicar as aditivas antes, por `--aditiva`, deixa o push destrutivo só com este.
--   4. `npm run db:baseline` e commitar o JSON junto da migration.
--
-- PRÉ-CONDIÇÕES: a 0295 aplicada (não é exigida pelo SQL, mas sem ela a base não tem RPCs).
--   O ADD CONSTRAINT valida as linhas existentes (as duas tabelas são pequenas: uma linha por carga).
--   `lock_timeout` curto: se uma carga estiver gravando em ingestao.carga/promocao agora, o patch
--   ABORTA em vez de enfileirar — repetir quando a carga terminar.
--
-- DOWN (voltar às 5 bases) — só é possível se NÃO houver linha da base nova; o DO reprova antes
-- (reapertar o CHECK com linha existente falharia no ADD CONSTRAINT, mas com erro menos legível).
-- Por ser a mesma classe destrutiva, também é aplicação HUMANA em TTY:
--
--   BEGIN;
--   SET LOCAL lock_timeout = '5s';
--   DO $$
--   BEGIN
--     IF EXISTS (SELECT 1 FROM ingestao.carga     WHERE base = 'contas-receber')
--        OR EXISTS (SELECT 1 FROM ingestao.promocao WHERE base = 'contas-receber') THEN
--       RAISE EXCEPTION 'DOWN abortado: existem cargas/promoções da base contas-receber';
--     END IF;
--   END
--   $$;
--   ALTER TABLE ingestao.carga DROP CONSTRAINT IF EXISTS ingestao_carga_base_valida;
--   ALTER TABLE ingestao.carga ADD CONSTRAINT ingestao_carga_base_valida CHECK (
--     base IN (
--       'demonstrativo-competencia',
--       'vendas-produto',
--       'lancamentos-movimentacao',
--       'lancamentos-aberto',
--       'lancamentos-operacao'
--     )
--   );
--   ALTER TABLE ingestao.promocao DROP CONSTRAINT IF EXISTS ingestao_promocao_base_valida;
--   ALTER TABLE ingestao.promocao ADD CONSTRAINT ingestao_promocao_base_valida CHECK (
--     base IN (
--       'demonstrativo-competencia',
--       'vendas-produto',
--       'lancamentos-movimentacao',
--       'lancamentos-aberto',
--       'lancamentos-operacao'
--     )
--   );
--   COMMIT;
-- ---------------------------------------------------------------------------

BEGIN;

SET LOCAL lock_timeout = '5s';

-- ── ingestao.carga ───────────────────────────────────────────────────────────────────────
ALTER TABLE ingestao.carga DROP CONSTRAINT IF EXISTS ingestao_carga_base_valida;

-- Espelho de BASES_INGESTAO (src/lib/ingestao/bases.ts) — MESMA ordem das seis. (O comentário fica
-- ACIMA do ADD CONSTRAINT: bases-paridade.test.ts casa `CONSTRAINT <nome> CHECK ( base IN (` sem
-- nada entre o parêntese e `base`.)
ALTER TABLE ingestao.carga ADD CONSTRAINT ingestao_carga_base_valida CHECK (
  base IN (
    'demonstrativo-competencia',
    'vendas-produto',
    'lancamentos-movimentacao',
    'lancamentos-aberto',
    'lancamentos-operacao',
    'contas-receber'
  )
);

-- ── ingestao.promocao ────────────────────────────────────────────────────────────────────
ALTER TABLE ingestao.promocao DROP CONSTRAINT IF EXISTS ingestao_promocao_base_valida;

-- Espelho de BASES_INGESTAO (src/lib/ingestao/bases.ts), mesma lista/ordem das outras ocorrências
-- deste CHECK (0274, 0276). `bases-paridade.test.ts` tem fiscal próprio para esta.
ALTER TABLE ingestao.promocao ADD CONSTRAINT ingestao_promocao_base_valida CHECK (
  base IN (
    'demonstrativo-competencia',
    'vendas-produto',
    'lancamentos-movimentacao',
    'lancamentos-aberto',
    'lancamentos-operacao',
    'contas-receber'
  )
);

-- ── Guard de EFETIVIDADE ─────────────────────────────────────────────────────────────────
-- Um DROP CONSTRAINT IF EXISTS de nome errado seria no-op silencioso e o ADD abaixo falharia por
-- duplicata; o inverso (constraint recriada sem a base) passaria calado. Confere o estado FINAL.
-- Confere o CONJUNTO EXATO de literais das duas constraints (as 6 bases, nem uma a mais, nem a menos,
-- sem repetição): extrai todo literal entre aspas simples de pg_get_constraintdef, ordena e compara
-- com a lista esperada ordenada. (A versão antiga conferia só 2 literais — uma base digitada errada ou
-- esquecida nas outras 4 passaria calada.)
DO $$
DECLARE
  v_esperado text[] := ARRAY[
    'contas-receber',
    'demonstrativo-competencia',
    'lancamentos-aberto',
    'lancamentos-movimentacao',
    'lancamentos-operacao',
    'vendas-produto'
  ];   -- já em ordem ASCII/COLLATE "C" (a comparação é por array ordenado nessa mesma ordem)
  v_alvo   text;
  v_rel    regclass;
  v_nome   text;
  v_def    text;
  v_lits   text[];
BEGIN
  FOR v_alvo, v_nome IN
    SELECT * FROM (VALUES
      ('ingestao.carga',     'ingestao_carga_base_valida'),
      ('ingestao.promocao',  'ingestao_promocao_base_valida')
    ) AS t(rel, nome)
  LOOP
    v_rel := to_regclass(v_alvo);
    IF v_rel IS NULL THEN
      RAISE EXCEPTION 'patch contas-receber: tabela % não encontrada', v_alvo;
    END IF;

    SELECT pg_get_constraintdef(c.oid) INTO v_def
      FROM pg_constraint c
     WHERE c.conname = v_nome AND c.conrelid = v_rel;
    IF v_def IS NULL THEN
      RAISE EXCEPTION 'patch contas-receber: constraint % ausente em %', v_nome, v_alvo;
    END IF;

    v_lits := ARRAY(
      SELECT m.g[1] FROM regexp_matches(v_def, '''([^'']+)''', 'g') AS m(g) ORDER BY m.g[1] COLLATE "C"
    );
    IF v_lits IS DISTINCT FROM v_esperado THEN
      RAISE EXCEPTION 'patch contas-receber: % em % não tem EXATAMENTE as 6 bases esperadas (literais: %; esperado: %; def: %)',
        v_nome, v_alvo, v_lits, v_esperado, v_def;
    END IF;
  END LOOP;
END
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
