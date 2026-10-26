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
--          de diferença)
--      4. commitar o `mv` (o arquivo passa a ser a migration 0300 no histórico).
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
-- linha INV cresce exatamente o valor dela. `scripts/dre-oracle.mjs` confere os três.
--
-- ── Reconciliação sem número cravado ────────────────────────────────────────
-- A produção não foi lida na preparação deste patch (leitura negada à sessão). Em vez de
-- cravar contagens, o passo 0 tira um RETRATO do estado vivo no ato e a reconciliação
-- final confere contra ele; a pré-condição aborta se a estrutura já não for a que a
-- v5.7.0 deixou (alguém mexeu pelo editor: rever o patch antes de aplicar).
--
-- Tudo num ÚNICO bloco DO: atômico por si só, sem depender de o arquivo inteiro rodar
-- numa transação (o retrato vive em variáveis locais, não em tabela temporária). E o
-- teste "fórmula cita IMOB" usa `@>`, não o operador `?` do jsonb, que um driver pode
-- confundir com placeholder de parâmetro.
--
-- Auditoria: as duas tabelas têm trigger do diário (0199/0205) — o patch entra no
-- histórico como um lote e é REVERSÍVEL pelo painel da estrutura.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  -- retrato do passo 0
  a_blocos    int;
  a_maps      int;
  a_excl      int;
  a_inv       int;
  a_imob      int;
  -- estado depois
  v_blocos    int;
  v_maps      int;
  v_excl      int;
  v_inv       int;
  v_imob_map  int;
  v_ref       text;
  v_ordem_dup int;
BEGIN
  -- ── 0. Pré-condição + retrato do estado vivo ───────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM financeiro.dre_bloco WHERE chave = 'IMOB') THEN
    RAISE EXCEPTION 'DRE v6.4.2: o bloco IMOB não existe — o estado vivo não é o esperado; nada foi alterado.';
  END IF;
  IF (SELECT formula FROM financeiro.dre_bloco WHERE chave = 'INV_H') IS DISTINCT FROM '["INV","IMOB"]'::jsonb
     OR (SELECT formula FROM financeiro.dre_bloco WHERE chave = 'RAIR') IS DISTINCT FROM '["LL","INV","IMOB"]'::jsonb THEN
    RAISE EXCEPTION 'DRE v6.4.2: fórmulas de INV_H/RAIR diferentes das deixadas pela v5.7.0 (INV_H=%, RAIR=%) — rever o patch.',
      (SELECT formula FROM financeiro.dre_bloco WHERE chave = 'INV_H'),
      (SELECT formula FROM financeiro.dre_bloco WHERE chave = 'RAIR');
  END IF;

  SELECT count(*) INTO a_blocos FROM financeiro.dre_bloco;
  SELECT count(*) INTO a_maps   FROM financeiro.dre_categoria_map;
  SELECT count(*) INTO a_excl   FROM financeiro.dre_categoria_map WHERE excluida;
  SELECT count(*) INTO a_inv    FROM financeiro.dre_categoria_map WHERE bloco_chave = 'INV';
  SELECT count(*) INTO a_imob   FROM financeiro.dre_categoria_map WHERE bloco_chave = 'IMOB';

  -- ── 1. As categorias do IMOB passam para o INV ──────────────────────────────
  -- Antes do DELETE do bloco: a FK `dre_categoria_map.bloco_chave → dre_bloco.chave` é a
  -- rede que impediria deixar categoria apontando para bloco inexistente. Apensadas
  -- DEPOIS das que já estão no INV, na ordem relativa que tinham no IMOB.
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

  -- ── 2. Fórmulas: as DUAS listas mudam JUNTAS ───────────────────────────────
  UPDATE financeiro.dre_bloco SET formula = '["INV"]'::jsonb      WHERE chave = 'INV_H';
  UPDATE financeiro.dre_bloco SET formula = '["LL","INV"]'::jsonb WHERE chave = 'RAIR';

  -- ── 3. O bloco IMOB sai ────────────────────────────────────────────────────
  DELETE FROM financeiro.dre_bloco WHERE chave = 'IMOB';

  -- ── 4. Reconciliação FAIL-CLOSED (contra o retrato do passo 0) ─────────────
  SELECT count(*) INTO v_blocos   FROM financeiro.dre_bloco;
  SELECT count(*) INTO v_maps     FROM financeiro.dre_categoria_map;
  SELECT count(*) INTO v_excl     FROM financeiro.dre_categoria_map WHERE excluida;
  SELECT count(*) INTO v_inv      FROM financeiro.dre_categoria_map WHERE bloco_chave = 'INV';
  SELECT count(*) INTO v_imob_map FROM financeiro.dre_categoria_map WHERE bloco_chave = 'IMOB';

  IF EXISTS (SELECT 1 FROM financeiro.dre_bloco WHERE chave = 'IMOB') THEN
    RAISE EXCEPTION 'DRE v6.4.2: o bloco IMOB ainda existe.';
  END IF;
  IF v_blocos <> a_blocos - 1 THEN
    RAISE EXCEPTION 'DRE v6.4.2: esperados % blocos (% − IMOB), achados %.', a_blocos - 1, a_blocos, v_blocos;
  END IF;
  -- O de-para não ganha nem perde linha, e nenhuma categoria muda de "excluída".
  IF v_maps <> a_maps OR v_excl <> a_excl THEN
    RAISE EXCEPTION 'DRE v6.4.2: de-para não reconcilia — maps=% (antes %), excluídas=% (antes %).',
      v_maps, a_maps, v_excl, a_excl;
  END IF;
  IF v_imob_map <> 0 OR v_inv <> a_inv + a_imob THEN
    RAISE EXCEPTION 'DRE v6.4.2: INV deveria ter % categorias (% próprias + % do IMOB), tem %; sobraram % no IMOB.',
      a_inv + a_imob, a_inv, a_imob, v_inv, v_imob_map;
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

  -- `ordem` duplicada entre blocos desalinharia a renderização em silêncio (sem UNIQUE).
  SELECT count(*) INTO v_ordem_dup
  FROM (SELECT ordem FROM financeiro.dre_bloco GROUP BY ordem HAVING count(*) > 1) d;
  IF v_ordem_dup > 0 THEN
    RAISE EXCEPTION 'DRE v6.4.2: % valor(es) de ordem duplicados entre blocos.', v_ordem_dup;
  END IF;

  RAISE NOTICE 'DRE v6.4.2 OK: % blocos (IMOB removido), % maps, INV com % categorias (% vieram do IMOB).',
    v_blocos, v_maps, v_inv, a_imob;
END $$;
