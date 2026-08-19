-- ---------------------------------------------------------------------------
-- v5.7.0 — DRE: camada firme (Resultado Financeiro unificado + Imobilizado abaixo
--          da linha) e padronização dos rótulos da estrutura viva.
--
-- ⛔ DESTRUTIVA — DELETE da linha do bloco `RFIN`. Mora em `supabase/patches/`, SEM
--    número, justamente por isso: `db push` empurra TODO o conjunto pendente de
--    `supabase/migrations/`, e um arquivo destrutivo esquecido lá é aplicado por
--    arrasto (custou caro na v5.2.0). O agente NÃO aplica — o wrapper aborta em
--    stdin não-TTY (ADR-0131), por construção.
--
--    COMO APLICAR (Yan, em TTY):
--      1. mv supabase/patches/dre-reestruturacao-resultado-financeiro-imobilizado.sql \
--            supabase/migrations/0251_dre_reestruturacao_resultado_financeiro.sql
--         (0251 é a próxima livre: `migration list` em 19/08 mostrou local ≡ remoto
--          até 0250, nada pendente — CONFERIR de novo no ato)
--      2. npm run db:migrate -- --destrutiva
--
-- ── O que muda (decisão da gerente) ─────────────────────────────────────────
-- 1. FUSÃO FIN+RFIN — as receitas financeiras entram no bloco das despesas
--    financeiras, que passa a ser lido LÍQUIDO: "(+/-) Resultado Financeiro". A
--    chave `FIN` é preservada (é âncora de fórmula); o bloco `RFIN` é deletado.
--    NEUTRO por construção: `FIN` e `RFIN` já estavam AMBOS nas listas de `DESP_H`
--    e de `LOP`, então trocar dois somandos por um só não move o subtotal.
-- 2. IMOBILIZADO ABAIXO DA LINHA — `IMOB` sai de `DESP_H`/`LOP` e passa a compor
--    `INV_H`/`RAIR` como subgrupo próprio (as categorias NÃO são dissolvidas em
--    `INV`). É a mudança de critério: capex deixa de rebaixar o resultado
--    OPERACIONAL.
-- 3. RÓTULOS — regra de uma frase: cabeçalho, subgrupo e totalizador carregam
--    operador `(+)`/`(-)`/`(+/-)`/`(=)`; categoria-folha NUNCA carrega (o sinal da
--    folha é do VALOR, não do rótulo). Aqui: os 5 `=` soltos entram na fôrma `(=)`,
--    o `(+ / -)` do ONOP_H é normalizado, os 14 subgrupos ganham operador e os 12
--    overrides de categoria com prefixo `(-)` o perdem.
--
-- ── O ORACLE (medido em produção por REST ANTES desta migration) ─────────────
-- Em álgebra: LOP' = LOP − IMOB · LL' = LL − IMOB · INV_H' = INV_H + IMOB
--             RAIR' = (LL − IMOB) + INV + IMOB = RAIR · REX' = REX
-- Ou seja: **RAIR e REX não mudam um centavo em ano nenhum.**
--
--   ano   ROL              IMOB           LOP antes → depois            RAIR          REX
--   2024  8.445.067,04     (20.912,64)    1.345.435,68 → 1.366.348,32   1.166.913,02  293.853,61
--   2025  10.032.946,54    (99.342,56)      692.722,91 →   792.065,47     993.514,58  248.434,54
--   2026* 7.331.991,77    (236.572,23)   (1.538.932,99) → (1.302.360,76) (1.703.591,25) (2.496.722,68)
--   (*) ano corrente: o total inclui previsto e ANDA todo dia — o oracle de 2026 só
--       fecha comparando um "antes" capturado no ato da aplicação. 2024 e 2025 são
--       estáveis e podem ser conferidos contra os números acima.
--
-- Como IMOB é despesa (negativa), o LUCRO OPERACIONAL MELHORA em todos os anos —
-- é essa a manchete da comunicação de mudança de critério à liderança (ADR-0168).
--
-- ── Estado vivo conferido em 19/08 (NÃO o seed 0205, que já divergiu) ────────
-- 29 blocos · 134 maps · 2 excluídas · bandeja 0 · FIN com 8 categorias · RFIN com 3.
-- O editor de estrutura já foi usado desde o seed (a órfã "Estacionamento Vaga
-- Rotativa" foi classificada; uma categoria migrou de MKT para RHB), por isso todo
-- UPDATE aqui ancora em CHAVE/`categoria_id` e a reconciliação final é fail-closed.
--
-- Auditoria: as duas tabelas têm trigger do diário (0199/0205), então esta migration
-- entra no histórico como um lote grande e REVERSÍVEL pelo painel da estrutura.
-- ---------------------------------------------------------------------------

-- ── 1. As categorias do RFIN passam para o FIN ────────────────────────────────
-- Apensadas DEPOIS das que já estão no FIN (a ordem dentro do bloco é cosmética e
-- reordenável no editor). Tem de vir ANTES do DELETE do bloco: a FK
-- `dre_categoria_map.bloco_chave → dre_bloco.chave` é a rede que impediria o
-- DELETE de deixar categoria órfã apontando para um bloco inexistente.
WITH base AS (
  SELECT COALESCE(max(ordem), 0) AS ult
  FROM financeiro.dre_categoria_map
  WHERE bloco_chave = 'FIN'
),
mudar AS (
  SELECT m.id, row_number() OVER (ORDER BY dc.categoria) AS rn
  FROM financeiro.dre_categoria_map m
  JOIN financeiro.dim_categoria dc ON dc.id = m.categoria_id
  WHERE m.bloco_chave = 'RFIN'
)
UPDATE financeiro.dre_categoria_map m
SET bloco_chave = 'FIN',
    ordem       = base.ult + 10 * mudar.rn
FROM mudar, base
WHERE m.id = mudar.id;

-- ── 2. Fórmulas: as DUAS listas mudam JUNTAS ─────────────────────────────────
-- `DESP_H` e `LOP` enumeram os mesmos subgrupos cada um por conta própria (a
-- assimetria documentada da estrutura: LOP NÃO consome DESP_H). Remover RFIN e
-- IMOB de uma só faria o cabeçalho de despesas contradizer o próprio totalizador.
UPDATE financeiro.dre_bloco
SET formula = '["ADM","COM","FIN","MKT","ESTR","RH","RHB"]'::jsonb
WHERE chave = 'DESP_H';

UPDATE financeiro.dre_bloco
SET formula = '["LB","ADM","COM","FIN","MKT","ESTR","RH","RHB"]'::jsonb
WHERE chave = 'LOP';

-- O IMOB passa a compor o bloco de investimentos, como subgrupo próprio.
UPDATE financeiro.dre_bloco
SET formula = '["INV","IMOB"]'::jsonb
WHERE chave = 'INV_H';

UPDATE financeiro.dre_bloco
SET formula = '["LL","INV","IMOB"]'::jsonb
WHERE chave = 'RAIR';

-- ── 3. Posição no demonstrativo ──────────────────────────────────────────────
-- A `ordem` NÃO afeta o cálculo destes dois blocos (ambos somam categorias e são
-- materializados antes do passe das fórmulas em `get_dre_mensal`); ela manda na
-- RENDERIZAÇÃO. Daí a precisão exigida:
--   · FIN → 190: última linha DENTRO de "(-) DESPESAS" (RHB é 180, LOP é 200).
--     Libera o 140 e ocupa o 190 que era do RFIN, que sai logo abaixo.
--   · IMOB → 265: DEPOIS de INV (260), sob o cabeçalho INV_H (250) que passa a
--     agregá-lo. Em 245 — "entre LL e RAIR" lido ao pé da letra — o subgrupo
--     apareceria ACIMA do próprio cabeçalho.
UPDATE financeiro.dre_bloco SET ordem = 190 WHERE chave = 'FIN';
UPDATE financeiro.dre_bloco SET ordem = 265 WHERE chave = 'IMOB';

-- ── 4. Rótulos da estrutura: a fôrma (+)/(-)/(+/-)/(=) ───────────────────────
-- Cabeçalhos: normaliza o `(+ / -)` do ONOP_H (com espaços, não casa a fôrma) e
-- renomeia o bloco de investimentos, que passa a abrigar o imobilizado. O prefixo
-- `(+/-)` ali é decisão do Yan: hoje só há amortização, mas em ano de captação o
-- bloco pode fechar positivo — o rótulo já nasce à prova disso.
UPDATE financeiro.dre_bloco SET rotulo = '(+/-) OUTRAS RECEITAS E DESPESAS NÃO OPERACIONAIS' WHERE chave = 'ONOP_H';
UPDATE financeiro.dre_bloco SET rotulo = '(+/-) INVESTIMENTOS, IMOBILIZADO E EMPRÉSTIMOS'    WHERE chave = 'INV_H';

-- Totalizadores: os 5 com `=` solto entram na fôrma `(=)`.
UPDATE financeiro.dre_bloco SET rotulo = '(=) LUCRO BRUTO'                  WHERE chave = 'LB';
UPDATE financeiro.dre_bloco SET rotulo = '(=) LUCRO / PREJUÍZO OPERACIONAL' WHERE chave = 'LOP';
UPDATE financeiro.dre_bloco SET rotulo = '(=) LUCRO / PREJUÍZO LÍQUIDO'     WHERE chave = 'LL';
UPDATE financeiro.dre_bloco SET rotulo = '(=) RESULTADO ANTES DO IR E CSLL' WHERE chave = 'RAIR';
UPDATE financeiro.dre_bloco SET rotulo = '(=) RESULTADO DO EXERCÍCIO'       WHERE chave = 'REX';

-- Subgrupos: operador pelo papel DOMINANTE do bloco. O FIN é o único que muda de
-- nome — deixa de ser "Despesas Financeiras" porque deixou de ser só despesa.
UPDATE financeiro.dre_bloco SET rotulo = '(+) Receita de Vendas'                       WHERE chave = 'RV';
UPDATE financeiro.dre_bloco SET rotulo = '(-) Custo dos Serviços Prestados'            WHERE chave = 'CUSTO';
UPDATE financeiro.dre_bloco SET rotulo = '(-) Despesas Administrativas'                WHERE chave = 'ADM';
UPDATE financeiro.dre_bloco SET rotulo = '(-) Despesas Comerciais'                     WHERE chave = 'COM';
UPDATE financeiro.dre_bloco SET rotulo = '(-) Despesas com Imobilizados'               WHERE chave = 'IMOB';
UPDATE financeiro.dre_bloco SET rotulo = '(+/-) Resultado Financeiro'                  WHERE chave = 'FIN';
UPDATE financeiro.dre_bloco SET rotulo = '(-) Despesas Marketing'                      WHERE chave = 'MKT';
UPDATE financeiro.dre_bloco SET rotulo = '(-) Despesas Operacionais de Estrutura'      WHERE chave = 'ESTR';
UPDATE financeiro.dre_bloco SET rotulo = '(-) Despesas Operacionais RH'                WHERE chave = 'RH';
UPDATE financeiro.dre_bloco SET rotulo = '(-) Despesas Operacionais RH Benefícios'     WHERE chave = 'RHB';
UPDATE financeiro.dre_bloco SET rotulo = '(+) Outras Receitas não Operacionais'        WHERE chave = 'RNOP';
UPDATE financeiro.dre_bloco SET rotulo = '(-) Outras Despesas não Operacionais'        WHERE chave = 'DNOP';
UPDATE financeiro.dre_bloco SET rotulo = '(-) Despesas com Investimentos e Empréstimos' WHERE chave = 'INV';
UPDATE financeiro.dre_bloco SET rotulo = '(-) Distribuição de Lucros'                  WHERE chave = 'DIST_LUCROS';

-- ── 5. Categorias-folha perdem o operador ────────────────────────────────────
-- São 12 (não 18 — os outros 6 overrides são só de CAPITALIZAÇÃO e ficam, por
-- decisão do briefing). Genérico de propósito: tira o prefixo e, se o que sobra é
-- exatamente o nome do Monde, zera o override — que passou a ser redundante.
-- `NULLIF` faz esse último passo; `rotulo = NULL` já significa "use dim_categoria".
UPDATE financeiro.dre_categoria_map m
SET rotulo = NULLIF(regexp_replace(m.rotulo, '^\(\s*[-+=]\s*\)\s+', ''), dc.categoria)
FROM financeiro.dim_categoria dc
WHERE dc.id = m.categoria_id
  AND m.rotulo ~ '^\(\s*[-+=]\s*\)\s+';

-- ── 6. O bloco RFIN sai ──────────────────────────────────────────────────────
-- Por último, já sem categorias apontando para ele (passo 1) e já fora de toda
-- fórmula (passo 2). Se qualquer um dos dois tivesse falhado, a FK ou a
-- reconciliação abaixo derrubariam a transação inteira.
DELETE FROM financeiro.dre_bloco WHERE chave = 'RFIN';

-- ── 7. Reconciliação FAIL-CLOSED ─────────────────────────────────────────────
-- Aborta a transação se qualquer invariante não fechar. É a rede que transforma
-- "a migration rodou" em "a migration fez o que dizia".
DO $$
DECLARE
  v_blocos    int;
  v_maps      int;
  v_excl      int;
  v_fin       int;
  v_rfin      int;
  v_sem_op    text;
  v_com_op    text;
  v_ordem_dup int;
  v_ordem_fin int;
  v_ordem_imob int;
BEGIN
  SELECT count(*) INTO v_blocos FROM financeiro.dre_bloco;
  SELECT count(*) INTO v_maps   FROM financeiro.dre_categoria_map;
  SELECT count(*) INTO v_excl   FROM financeiro.dre_categoria_map WHERE excluida;
  SELECT count(*) INTO v_fin    FROM financeiro.dre_categoria_map WHERE bloco_chave = 'FIN';
  SELECT count(*) INTO v_rfin   FROM financeiro.dre_bloco         WHERE chave = 'RFIN';

  IF v_blocos <> 28 THEN
    RAISE EXCEPTION 'DRE v5.7.0: esperados 28 blocos (29 − RFIN), achados %.', v_blocos;
  END IF;
  IF v_rfin <> 0 THEN
    RAISE EXCEPTION 'DRE v5.7.0: o bloco RFIN ainda existe.';
  END IF;
  -- O de-para não ganha nem perde linha: as 3 categorias do RFIN MUDARAM de bloco.
  IF v_maps <> 134 OR v_excl <> 2 THEN
    RAISE EXCEPTION 'DRE v5.7.0: de-para não reconcilia — maps=% (esperado 134), excluídas=% (2). Estado vivo mudou desde 19/08: reveja o patch contra a produção atual.', v_maps, v_excl;
  END IF;
  IF v_fin <> 11 THEN
    RAISE EXCEPTION 'DRE v5.7.0: FIN deveria ter 11 categorias (8 próprias + 3 do RFIN), tem %.', v_fin;
  END IF;

  -- Rótulo de estrutura SEM operador (direção 1 da guarda).
  SELECT string_agg(chave || ': ' || rotulo, ' | ') INTO v_sem_op
  FROM financeiro.dre_bloco
  WHERE rotulo !~ '^\((\+|-|\+/-|=)\) ';
  IF v_sem_op IS NOT NULL THEN
    RAISE EXCEPTION 'DRE v5.7.0: bloco sem operador padronizado — [%]', v_sem_op;
  END IF;

  -- Categoria-folha COM operador (direção 2 — a que pega o defeito que a versão
  -- veio corrigir). Olha o rótulo EXIBIDO: override quando há, nome do Monde senão.
  SELECT string_agg(COALESCE(m.rotulo, dc.categoria), ' | ') INTO v_com_op
  FROM financeiro.dre_categoria_map m
  JOIN financeiro.dim_categoria dc ON dc.id = m.categoria_id
  WHERE COALESCE(m.rotulo, dc.categoria) ~ '^\s*(\(\s*[-+=](\s*/\s*[-+=])?\s*\)|[-+=])(\s|$)';
  IF v_com_op IS NOT NULL THEN
    RAISE EXCEPTION 'DRE v5.7.0: categoria-folha com operador no rótulo — [%]', v_com_op;
  END IF;

  -- `ordem` duplicada entre blocos desalinharia a renderização em silêncio (não há
  -- UNIQUE na coluna — o empate seria desfeito de forma arbitrária pelo ORDER BY).
  SELECT count(*) INTO v_ordem_dup
  FROM (SELECT ordem FROM financeiro.dre_bloco GROUP BY ordem HAVING count(*) > 1) d;
  IF v_ordem_dup > 0 THEN
    RAISE EXCEPTION 'DRE v5.7.0: % valor(es) de ordem duplicados entre blocos.', v_ordem_dup;
  END IF;

  -- E as duas posições que a decisão de produto exige.
  SELECT ordem INTO v_ordem_fin  FROM financeiro.dre_bloco WHERE chave = 'FIN';
  SELECT ordem INTO v_ordem_imob FROM financeiro.dre_bloco WHERE chave = 'IMOB';
  IF v_ordem_fin <= (SELECT ordem FROM financeiro.dre_bloco WHERE chave = 'RHB')
     OR v_ordem_fin >= (SELECT ordem FROM financeiro.dre_bloco WHERE chave = 'LOP') THEN
    RAISE EXCEPTION 'DRE v5.7.0: FIN não ficou como última linha das DESPESAS (ordem %).', v_ordem_fin;
  END IF;
  IF v_ordem_imob <= (SELECT ordem FROM financeiro.dre_bloco WHERE chave = 'INV')
     OR v_ordem_imob >= (SELECT ordem FROM financeiro.dre_bloco WHERE chave = 'RAIR') THEN
    RAISE EXCEPTION 'DRE v5.7.0: IMOB não ficou sob o cabeçalho de investimentos (ordem %).', v_ordem_imob;
  END IF;

  RAISE NOTICE 'DRE v5.7.0 OK: % blocos (RFIN removido), % maps, FIN com % categorias, rótulos padronizados.',
    v_blocos, v_maps, v_fin;
END $$;
