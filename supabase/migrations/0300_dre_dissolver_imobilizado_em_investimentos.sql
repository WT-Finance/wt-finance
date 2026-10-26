-- ---------------------------------------------------------------------------
-- v6.4.2 — DRE de CAIXA: o grupo "(-) Despesas com Imobilizados" (`IMOB`) sai da
--          estrutura; as categorias dele passam para "(-) Despesas com Investimentos
--          e Empréstimos" (`INV`).
--
-- ⛔ DESTRUTIVA — UPDATE em dado existente (de-para e fórmulas) + DELETE da linha do
--    bloco `IMOB`. Mora em `supabase/patches/`, SEM número, pelo mesmo motivo da 0251:
--    `db push` empurra TODO o conjunto pendente de `supabase/migrations/`, e um arquivo
--    destrutivo esquecido lá é aplicado por arrasto (v5.2.0). O agente NÃO aplica — o
--    wrapper aborta em stdin não-TTY (ADR-0131), por construção.
--
--    COMO APLICAR (Yan, em TTY, na worktree da v6.4.2):
--      0. set -a; . .env.local; set +a
--         node scripts/dre-oracle.mjs /tmp/dre-antes-v642.json        # retrato ANTES
--      1. npx supabase migration list --linked                        # conferir: 0300 livre
--         mv supabase/patches/dre-dissolver-imobilizado-em-investimentos.sql \
--            supabase/migrations/0300_dre_dissolver_imobilizado_em_investimentos.sql
--      2. npm run db:migrate -- --destrutiva
--      3. node scripts/dre-oracle.mjs /tmp/dre-antes-v642.json --comparar
--         (tem de terminar em "ORACLE OK"; 2026 anda todo dia — rodar 0 e 3 com minutos
--          de diferença, no mesmo dia de SP)
--      4. npm run db:baseline   (regenera supabase/baseline/schema-v6.json → 0300)
--         e commitar o `mv` + o baseline juntos (o arquivo vira a migration 0300).
--      5. npm test — os casos do IMOB em rpc-contrato.test.ts só ficam verdes depois daqui.
--
--    Pré-requisitos: `.env.local` (SUPABASE_VERIFICADOR_SENHA, NEXT_PUBLIC_SUPABASE_URL,
--    NEXT_PUBLIC_SUPABASE_ANON_KEY) e `supabase/.temp` na worktree.
--
--    SE ALGO DER ERRADO:
--      · o db:migrate abortou (gate, confirmação ou guarda) → `mv` de volta para
--        supabase/patches/ ANTES de qualquer outro db:migrate (destrutiva parada em
--        migrations/ é aplicada por arrasto pelo próximo push);
--      · o oracle reprovou depois de aplicado → desfazer o LOTE pelo painel da estrutura
--        (admin; um lote só, cada linha tocada uma vez) ou restaurar o backup do gate.
--
-- ── O que muda (decisão do Yan, 26/10) ──────────────────────────────────────
-- 1. As categorias do `IMOB` (no seed: Máquinas e Equipamentos, Móveis e Utensílios,
--    Reforma — o editor pode ter mexido desde então, por isso tudo aqui ancora em
--    `bloco_chave = 'IMOB'`, nunca em nome) passam para o `INV`, apensadas DEPOIS das que
--    já estão lá, na ordem relativa que tinham.
-- 2. Fórmulas: `INV_H` = ["INV"] e `RAIR` = ["LL","INV"] — o `IMOB` sai das duas juntas.
-- 3. O bloco `IMOB` é removido.
-- 4. O cabeçalho "(+/-) INVESTIMENTOS, IMOBILIZADO E EMPRÉSTIMOS" FICA como está
--    (decisão do Yan). A competência não tem `IMOB` (0256) — nada muda lá.
--
-- ── O ORACLE ────────────────────────────────────────────────────────────────
-- Em álgebra: INV' = INV + IMOB · INV_H' = INV' = INV + IMOB = INV_H
--             RAIR' = LL + INV' = LL + INV + IMOB = RAIR · REX' = REX
-- LOP e LL nem participam (o IMOB já estava abaixo deles desde a v5.7.0). Ou seja:
-- **INV_H, RAIR e REX não mudam um centavo em ano nenhum**; a linha IMOB some e a
-- linha INV cresce exatamente o valor dela. `scripts/dre-oracle.mjs` confere as quatro.
--
-- ── Reconciliação sem número cravado ────────────────────────────────────────
-- A produção não foi lida na preparação deste patch (leitura negada à sessão). Em vez de
-- cravar contagens, o passo 1 tira um RETRATO do estado vivo no ato (tabela temporária) e
-- a reconciliação final confere contra ele — contagem E conteúdo: o conjunto exato de
-- categorias de INV ∪ IMOB, e um hash do resto da estrutura (que não pode se mover). A
-- pré-condição aborta se a estrutura já não for a que a v5.7.0 deixou.
--
-- O DML fica no TOP-LEVEL, como na 0251, e não dentro de um `DO`: o classificador do
-- backup-gate (scripts/db-gate/classificar.mjs) ignora corpos `$$…$$` e leria um patch
-- só de `DO` como ADITIVO. Os `DO` aqui são só guardas. O arquivo roda numa transação
-- (lote do CLI, como a 0251), então qualquer RAISE desfaz tudo. O teste "fórmula cita
-- IMOB" usa `@>`, não o operador `?` do jsonb (que um driver pode ler como placeholder).
--
-- Auditoria: as duas tabelas têm trigger do diário (0199/0205) — o patch entra no
-- histórico como um lote e é REVERSÍVEL pelo painel da estrutura.
-- ---------------------------------------------------------------------------

-- ── 0. Lock do editor + pré-condição ─────────────────────────────────────────
DO $$
BEGIN
  -- O mesmo lock de `dre_estrutura_salvar`/`dre_estrutura_desfazer_*`: o editor não grava
  -- no meio do patch (até o fim da transação).
  PERFORM pg_advisory_xact_lock(hashtext('financeiro.dre_estrutura_salvar'));

  IF NOT EXISTS (SELECT 1 FROM financeiro.dre_bloco WHERE chave = 'IMOB' AND formula IS NULL) THEN
    RAISE EXCEPTION 'DRE v6.4.2: o bloco IMOB não existe (ou não é folha) — estado vivo inesperado; nada foi alterado.';
  END IF;
  -- O INV tem de ser FOLHA (sem fórmula): `get_dre_mensal` só soma categoria de folha, e
  -- uma categoria movida para bloco com fórmula sairia da conta em silêncio.
  IF NOT EXISTS (SELECT 1 FROM financeiro.dre_bloco WHERE chave = 'INV' AND formula IS NULL) THEN
    RAISE EXCEPTION 'DRE v6.4.2: o bloco INV não existe ou não é folha — rever o patch.';
  END IF;
  IF (SELECT formula FROM financeiro.dre_bloco WHERE chave = 'INV_H') IS DISTINCT FROM '["INV","IMOB"]'::jsonb
     OR (SELECT formula FROM financeiro.dre_bloco WHERE chave = 'RAIR') IS DISTINCT FROM '["LL","INV","IMOB"]'::jsonb THEN
    RAISE EXCEPTION 'DRE v6.4.2: fórmulas de INV_H/RAIR diferentes das deixadas pela v5.7.0 (INV_H=%, RAIR=%) — rever o patch.',
      (SELECT formula FROM financeiro.dre_bloco WHERE chave = 'INV_H'),
      (SELECT formula FROM financeiro.dre_bloco WHERE chave = 'RAIR');
  END IF;
END $$;

-- ── 1. Retrato do estado vivo ────────────────────────────────────────────────
CREATE TEMP TABLE _v642_antes AS
SELECT
  (SELECT count(*) FROM financeiro.dre_bloco)                                    AS blocos,
  (SELECT count(*) FROM financeiro.dre_categoria_map)                            AS maps,
  (SELECT count(*) FROM financeiro.dre_categoria_map WHERE excluida)             AS excluidas,
  (SELECT count(*) FROM financeiro.dre_categoria_map WHERE bloco_chave = 'IMOB') AS imob,
  -- o conjunto que tem de acabar INTEIRO no INV
  (SELECT array_agg(categoria_id ORDER BY categoria_id)
     FROM financeiro.dre_categoria_map WHERE bloco_chave IN ('INV', 'IMOB'))     AS ids_inv_imob,
  -- todo o resto do de-para, que não pode se mover
  (SELECT md5(string_agg(categoria_id || ':' || coalesce(bloco_chave, '∅') || ':' || excluida
                         || ':' || ordem || ':' || coalesce(rotulo, '∅'), ',' ORDER BY categoria_id))
     FROM financeiro.dre_categoria_map
    WHERE bloco_chave IS NULL OR bloco_chave NOT IN ('INV', 'IMOB'))            AS hash_outros_maps,
  -- todos os blocos, fora os dois que mudam de fórmula e o que sai
  (SELECT md5(string_agg(chave || ':' || rotulo || ':' || tipo || ':' || ordem || ':'
                         || coalesce(formula::text, '∅'), ',' ORDER BY chave))
     FROM financeiro.dre_bloco
    WHERE chave NOT IN ('INV_H', 'RAIR', 'IMOB'))                               AS hash_outros_blocos,
  (SELECT rotulo FROM financeiro.dre_bloco WHERE chave = 'INV_H')                AS rotulo_inv_h;

-- ── 2. As categorias do IMOB passam para o INV ────────────────────────────────
-- Antes do DELETE do bloco: a FK `dre_categoria_map.bloco_chave → dre_bloco.chave` é a
-- rede que impediria deixar categoria apontando para bloco inexistente. Apensadas DEPOIS
-- das que já estão no INV, na ordem relativa que tinham no IMOB.
WITH base AS (
  SELECT COALESCE(max(ordem), 0) AS ult
  FROM financeiro.dre_categoria_map
  WHERE bloco_chave = 'INV'
),
mudar AS (
  SELECT m.id, row_number() OVER (ORDER BY m.ordem, dc.categoria) AS rn
  FROM financeiro.dre_categoria_map m
  JOIN financeiro.dim_categoria dc ON dc.id = m.categoria_id
  WHERE m.bloco_chave = 'IMOB'
)
UPDATE financeiro.dre_categoria_map m
SET bloco_chave = 'INV',
    ordem       = base.ult + 10 * mudar.rn
FROM mudar, base
WHERE m.id = mudar.id;

-- ── 3. Fórmulas: as DUAS listas mudam JUNTAS ─────────────────────────────────
UPDATE financeiro.dre_bloco SET formula = '["INV"]'::jsonb      WHERE chave = 'INV_H';
UPDATE financeiro.dre_bloco SET formula = '["LL","INV"]'::jsonb WHERE chave = 'RAIR';

-- ── 4. O bloco IMOB sai ──────────────────────────────────────────────────────
DELETE FROM financeiro.dre_bloco WHERE chave = 'IMOB';

-- ── 5. Reconciliação FAIL-CLOSED (contra o retrato do passo 1) ───────────────
DO $$
DECLARE
  a           record;
  v_blocos    int;
  v_maps      int;
  v_excl      int;
  v_imob_map  int;
  v_ids_inv   int[];
  v_hash_m    text;
  v_hash_b    text;
  v_ref       text;
  v_ordem_dup int;
BEGIN
  SELECT * INTO a FROM _v642_antes;
  SELECT count(*) INTO v_blocos   FROM financeiro.dre_bloco;
  SELECT count(*) INTO v_maps     FROM financeiro.dre_categoria_map;
  SELECT count(*) INTO v_excl     FROM financeiro.dre_categoria_map WHERE excluida;
  SELECT count(*) INTO v_imob_map FROM financeiro.dre_categoria_map WHERE bloco_chave = 'IMOB';
  SELECT array_agg(categoria_id ORDER BY categoria_id) INTO v_ids_inv
    FROM financeiro.dre_categoria_map WHERE bloco_chave = 'INV';
  SELECT md5(string_agg(categoria_id || ':' || coalesce(bloco_chave, '∅') || ':' || excluida
                        || ':' || ordem || ':' || coalesce(rotulo, '∅'), ',' ORDER BY categoria_id))
    INTO v_hash_m
    FROM financeiro.dre_categoria_map
   WHERE bloco_chave IS NULL OR bloco_chave NOT IN ('INV', 'IMOB');
  SELECT md5(string_agg(chave || ':' || rotulo || ':' || tipo || ':' || ordem || ':'
                        || coalesce(formula::text, '∅'), ',' ORDER BY chave))
    INTO v_hash_b
    FROM financeiro.dre_bloco
   WHERE chave NOT IN ('INV_H', 'RAIR', 'IMOB');

  IF EXISTS (SELECT 1 FROM financeiro.dre_bloco WHERE chave = 'IMOB') THEN
    RAISE EXCEPTION 'DRE v6.4.2: o bloco IMOB ainda existe.';
  END IF;
  IF v_blocos <> a.blocos - 1 THEN
    RAISE EXCEPTION 'DRE v6.4.2: esperados % blocos (% − IMOB), achados %.', a.blocos - 1, a.blocos, v_blocos;
  END IF;
  -- O de-para não ganha nem perde linha, e nenhuma categoria muda de "excluída".
  IF v_maps <> a.maps OR v_excl <> a.excluidas THEN
    RAISE EXCEPTION 'DRE v6.4.2: de-para não reconcilia — maps=% (antes %), excluídas=% (antes %).',
      v_maps, a.maps, v_excl, a.excluidas;
  END IF;
  -- CONTEÚDO, não só contagem: o INV termina com exatamente as categorias de INV ∪ IMOB.
  IF v_imob_map <> 0 OR v_ids_inv IS DISTINCT FROM a.ids_inv_imob THEN
    RAISE EXCEPTION 'DRE v6.4.2: o INV não ficou com exatamente as categorias de INV ∪ IMOB (antes %, agora %); sobraram % no IMOB.',
      a.ids_inv_imob, v_ids_inv, v_imob_map;
  END IF;
  -- O resto da estrutura não se moveu.
  IF v_hash_m IS DISTINCT FROM a.hash_outros_maps THEN
    RAISE EXCEPTION 'DRE v6.4.2: categorias fora de INV/IMOB mudaram durante o patch.';
  END IF;
  IF v_hash_b IS DISTINCT FROM a.hash_outros_blocos THEN
    RAISE EXCEPTION 'DRE v6.4.2: blocos fora de INV_H/RAIR/IMOB mudaram durante o patch.';
  END IF;

  -- Nenhuma fórmula pode citar o bloco removido (senão o totalizador soma uma chave fantasma).
  SELECT string_agg(chave, ', ') INTO v_ref
  FROM financeiro.dre_bloco
  WHERE formula @> '["IMOB"]'::jsonb;
  IF v_ref IS NOT NULL THEN
    RAISE EXCEPTION 'DRE v6.4.2: fórmula ainda cita IMOB em [%].', v_ref;
  END IF;
  IF (SELECT formula FROM financeiro.dre_bloco WHERE chave = 'INV_H') IS DISTINCT FROM '["INV"]'::jsonb
     OR (SELECT formula FROM financeiro.dre_bloco WHERE chave = 'RAIR') IS DISTINCT FROM '["LL","INV"]'::jsonb THEN
    RAISE EXCEPTION 'DRE v6.4.2: fórmulas de INV_H/RAIR não ficaram como o esperado.';
  END IF;
  -- O cabeçalho mantém o rótulo (decisão do Yan).
  IF (SELECT rotulo FROM financeiro.dre_bloco WHERE chave = 'INV_H') IS DISTINCT FROM a.rotulo_inv_h THEN
    RAISE EXCEPTION 'DRE v6.4.2: o rótulo de INV_H mudou.';
  END IF;

  -- `ordem` duplicada entre blocos desalinharia a renderização em silêncio (sem UNIQUE).
  SELECT count(*) INTO v_ordem_dup
  FROM (SELECT ordem FROM financeiro.dre_bloco GROUP BY ordem HAVING count(*) > 1) d;
  IF v_ordem_dup > 0 THEN
    RAISE EXCEPTION 'DRE v6.4.2: % valor(es) de ordem duplicados entre blocos.', v_ordem_dup;
  END IF;

  RAISE NOTICE 'DRE v6.4.2 OK: % blocos (IMOB removido), % maps, INV com % categorias (% vieram do IMOB).',
    v_blocos, v_maps, cardinality(v_ids_inv), a.imob;
END $$;

DROP TABLE _v642_antes;
