-- ---------------------------------------------------------------------------
-- v5.7.1 — DRE: Receita de Vendas sobe, e Receita Bruta de Vendas vira linha de RESULTADO
--
-- ⛔ DESTRUTIVA — `UPDATE` em dado existente (`financeiro.dre_bloco`). Mora em
--    `supabase/patches/`, SEM número: `db push` empurra TODO o conjunto pendente de
--    `supabase/migrations/`, e um destrutivo esquecido lá é aplicado por arrasto.
--    O agente NÃO aplica — o wrapper aborta em stdin não-TTY (ADR-0131).
--
--    COMO APLICAR (Yan, em TTY):
--      1. mv supabase/patches/dre-receita-bruta-vira-resultado.sql \
--            supabase/migrations/0254_dre_receita_bruta_vira_resultado.sql
--         (0254 é a próxima livre DEPOIS da 0253 deste mesmo patch — CONFERIR no ato)
--      2. npm run db:migrate -- --destrutiva
--
-- ── O que muda e por quê ─────────────────────────────────────────────────────
-- `RB_H` ("RECEITA BRUTA DE VENDAS") sempre foi um SUBTOTAL — a fórmula dela é
-- `["REPASSE","RV"]` —, mas estava tipada como `blocoH` (cabeçalho de grupo) e desenhada
-- na banda clara, ACIMA da parcela que ela soma. Duas correções, decididas pelo Yan:
--
--   1. **`RV` sobe para antes de `RB_H`** — a leitura passa a ser Saldo Repasse →
--      Receita de Vendas → (=) Receita Bruta, isto é, as duas parcelas e depois a soma.
--      Antes o total aparecia antes de uma das parcelas dele.
--   2. **`RB_H` vira `tipo='tot'`** — ganha a banda escura das linhas de resultado, o
--      peso e a cor por sinal que as demais já têm. O prefixo acompanha o papel
--      (`(+)` → `(=)`): é a regra de rótulo firmada na v5.7.0 — o prefixo diz o PAPEL da
--      linha, e o papel dela é resultado, não entrada.
--
-- Nada disso muda um centavo: `tipo` e `ordem` não entram no cálculo de `get_dre_mensal`
-- (`RB_H` é bloco de FÓRMULA e `RV` soma categorias — materializado antes do passe das
-- fórmulas), e a fórmula de `RB_H` e a de `ROL` ficam intocadas. É apresentação.
--
-- ── UM UPDATE POR LINHA (lição da v5.7.0) ────────────────────────────────────
-- `financeiro.reverter_diario` (0206) pressupõe **no máximo um toque por linha por lote**;
-- a `0251` violou isso e deixou o "desfazer em lote" do painel quebrado para ela. Aqui os
-- dois UPDATEs tocam linhas DIFERENTES, cada uma uma única vez — então este lote É
-- reversível pelo painel da estrutura, de verdade.
-- ---------------------------------------------------------------------------

-- Receita de Vendas passa a vir ANTES da soma que a contém.
UPDATE financeiro.dre_bloco
SET ordem = 40
WHERE chave = 'RV';

-- Receita Bruta vira linha de resultado: posição, tipo e prefixo, num único toque.
UPDATE financeiro.dre_bloco
SET ordem  = 50,
    tipo   = 'tot',
    rotulo = '(=) RECEITA BRUTA DE VENDAS'
WHERE chave = 'RB_H';

-- ── Reconciliação FAIL-CLOSED ────────────────────────────────────────────────
DO $$
DECLARE
  v_blocos    int;
  v_rv_ordem  int;
  v_rb_ordem  int;
  v_rb_tipo   text;
  v_rb_rotulo text;
  v_rb_form   jsonb;
  v_sem_op    text;
  v_ordem_dup int;
BEGIN
  SELECT count(*) INTO v_blocos FROM financeiro.dre_bloco;
  SELECT ordem INTO v_rv_ordem FROM financeiro.dre_bloco WHERE chave = 'RV';
  SELECT ordem, tipo, rotulo, formula INTO v_rb_ordem, v_rb_tipo, v_rb_rotulo, v_rb_form
  FROM financeiro.dre_bloco WHERE chave = 'RB_H';

  IF v_blocos <> 28 THEN
    RAISE EXCEPTION 'DRE v5.7.1: esperados 28 blocos, achados %. Estado vivo mudou — reveja o patch.', v_blocos;
  END IF;

  -- A ordem de leitura pedida: REPASSE (30) < RV < RB_H < IMP_H (60).
  IF v_rv_ordem >= v_rb_ordem THEN
    RAISE EXCEPTION 'DRE v5.7.1: Receita de Vendas (ordem %) deveria vir ANTES da Receita Bruta (ordem %).', v_rv_ordem, v_rb_ordem;
  END IF;
  IF v_rv_ordem <= (SELECT ordem FROM financeiro.dre_bloco WHERE chave = 'REPASSE')
     OR v_rb_ordem >= (SELECT ordem FROM financeiro.dre_bloco WHERE chave = 'IMP_H') THEN
    RAISE EXCEPTION 'DRE v5.7.1: o par RV/RB_H saiu da faixa entre SALDO REPASSE e IMPOSTOS (RV=%, RB_H=%).', v_rv_ordem, v_rb_ordem;
  END IF;

  IF v_rb_tipo <> 'tot' THEN
    RAISE EXCEPTION 'DRE v5.7.1: RB_H deveria ser tipo "tot", é "%".', v_rb_tipo;
  END IF;
  IF v_rb_rotulo !~ '^\(=\) ' THEN
    RAISE EXCEPTION 'DRE v5.7.1: o rótulo da RB_H deveria abrir com "(=) ", é "%".', v_rb_rotulo;
  END IF;
  -- CONTEÚDO, não só forma (lacuna que o revisor-db apontou na 0251): a fórmula da
  -- Receita Bruta é o que justifica ela ser resultado — se mudar, a mudança de tipo perde
  -- o fundamento.
  IF v_rb_form <> '["REPASSE","RV"]'::jsonb THEN
    RAISE EXCEPTION 'DRE v5.7.1: a fórmula da RB_H mudou (%) — ela não é mais REPASSE+RV.', v_rb_form;
  END IF;

  -- A regra de rótulo da v5.7.0 continua valendo para TODOS os blocos.
  SELECT string_agg(chave || ': ' || rotulo, ' | ') INTO v_sem_op
  FROM financeiro.dre_bloco
  WHERE rotulo !~ '^\((\+|-|\+/-|=)\) ';
  IF v_sem_op IS NOT NULL THEN
    RAISE EXCEPTION 'DRE v5.7.1: bloco sem operador padronizado — [%]', v_sem_op;
  END IF;

  SELECT count(*) INTO v_ordem_dup
  FROM (SELECT ordem FROM financeiro.dre_bloco GROUP BY ordem HAVING count(*) > 1) d;
  IF v_ordem_dup > 0 THEN
    RAISE EXCEPTION 'DRE v5.7.1: % valor(es) de ordem duplicados entre blocos.', v_ordem_dup;
  END IF;

  RAISE NOTICE 'DRE v5.7.1 OK: RV em %, RB_H em % como "tot" (%).', v_rv_ordem, v_rb_ordem, v_rb_rotulo;
END $$;
