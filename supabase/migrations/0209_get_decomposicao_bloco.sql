-- ---------------------------------------------------------------------------
-- 0209 — feat(dre): get_decomposicao_bloco(p_from, p_to)
-- Decomposição REALIZADA por BLOCO da estrutura viva, em intervalo de datas livre.
-- v5.3.1 / M2 (DRE: Resumo Executivo + Decomposição dos Lançamentos).
--
-- DECLARAÇÃO (regime aditivo): esta migration é ADITIVA/retrocompatível com a main viva —
--   • CREATE FUNCTION nova; nenhum objeto existente é alterado ou removido;
--   • NÃO escreve em dados pré-existentes (leitura pura de financeiro.fato_fluxo /
--     dim_categoria / dre_categoria_map / dre_bloco — nem temp table);
--   • `get_decomposicao_grupo` / `get_decomposicao_categoria` (0188/0197) ficam
--     INTOCADAS (nenhum DROP aqui) — mas honestamente: elas ficam ÓRFÃS por efeito
--     desta versão. O único consumidor vivo era o card da Composição desta mesma
--     página, que passou a chamar esta função. NÃO são "da área executiva" (a
--     /executiva consome `get_decomposicao_variacao`, outra função). Candidatas a
--     DROP futuro — e aí valendo a regra de sempre: verificar consumidores REAIS
--     (app E `supabase/seed/`) antes de remover, que é onde a v4.17.1 se enganou.
--
-- ── POR QUE UMA RPC NOVA (a M2 preferia reusar; medi e não dava) ───────────────
-- A candidata natural, `get_decomposicao_categoria(p_from, p_to)`, tem DOIS
-- desalinhamentos com o que a Decomposição precisa ser:
--
--   1. NÃO filtra `tipo` — soma `realizado` + `previsto` na janela. E `previsto` tem
--      `data_competencia` RETROATIVA quando o título está vencido em aberto (0187:
--      competência = vencimento, sem piso de data). Medido em produção na janela
--      2026-01-01..2026-07-31: 699 linhas de previsto, R$ 4.327.007,77 em valor
--      ABSOLUTO, competência retroativa até 05/01 — misturadas ao realizado.
--      (`NOT pos_corte` não ajuda: `pos_corte` é o corte de HORIZONTE, competência
--      > 31/12/2028, não o discriminador realizado × previsto.)
--   2. Ignora a estrutura viva — agrupa pelo GRUPO NATIVO do Monde
--      (`dim_categoria.grupo_categoria`) e não respeita `excluida`. O de-para da DRE
--      é CURADO: 20 das 130 categorias são re-parenteadas em relação ao grupo nativo,
--      e 2 estão explicitamente excluídas (transferência interna — net −30.000,00 na
--      mesma janela, ou seja não se anulam sozinhas).
--
-- Resultado: a RPC existente não é "sempre realizado" (decisão firme do Yan) e NÃO
-- reconcilia com a tabela da DRE logo acima, no mesmo card — os dois invariantes da
-- versão. Daí a aditiva, que é o caminho que a própria M2 prevê para este caso.
--
-- Descartado também: derivar a Decomposição de `get_dre_mensal` (zero migration,
-- pois ela já vem na leva). Ela devolve BALDES MENSAIS — serve para as 5 pills
-- alinhadas a mês, mas torna "Personalizado ao dia" impossível (não há como recortar
-- sub-mês de um balde de mês), e exigiria costurar meses de dois anos na virada.
-- Degradar o Personalizado em silêncio é justamente a classe de defeito que este
-- projeto pune.
--
-- ── CONTRATO / RECONCILIAÇÃO ─────────────────────────────────────────────────
-- As colunas mensais de `get_dre_mensal` são `Σ valor FILTER (tipo='realizado')` por
-- mês de competência — o previsto do mês corrente viaja numa coluna à parte
-- (`prev_corrente`) e os vencidos em `venc`, ambos FORA de `meses[]`. Esta função
-- aplica EXATAMENTE o mesmo filtro na janela pedida e agrega pelo MESMO de-para
-- (`dre_categoria_map WHERE NOT excluida`). Logo o net por bloco fecha AO CENTAVO
-- com a soma das colunas de mês correspondentes, em toda janela alinhada a mês.
-- PROVADO em produção (jan..jul/2026, os 18 blocos analíticos): delta 0,00 em todos.
--
-- `valor` é o net SIGNADO (+ entrada / − saída), não ABS: é o que reconcilia com a
-- tabela e o que deixa o lado (Entradas | Saídas) ser derivado do próprio dado. A
-- soma das categorias de um bloco é, por construção, o net do bloco — inclusive
-- quando uma categoria tem sinal OPOSTO ao do bloco (estorno; 9 casos medidos na
-- janela acima, em RH/RHB/ESTR).
--
-- `bloco_chave IS NULL` numa categoria = NÃO CLASSIFICADA (sem linha no de-para —
-- a bandeja). Vem no payload de propósito: nada some em silêncio, mesma política da
-- bandeja da tabela. Hoje está vazia (0 categorias sem mapa com movimento), mas
-- categoria nova do Monde nasce aqui.
--
-- Performance: 1 varredura indexada de `fato_fluxo` por (tipo, data_competencia) —
-- índice `fato_fluxo_tipo_competencia_idx` (0187) — + joins pequenos (130 categorias,
-- 29 blocos). Folga larga no orçamento de 8s do papel `authenticated`.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_decomposicao_bloco(p_from text, p_to text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_de  date;
  v_ate date;
  v_res json;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/dre']);

  v_de  := p_from::date;
  v_ate := p_to::date;

  IF v_de IS NULL OR v_ate IS NULL OR v_ate < v_de THEN
    RAISE EXCEPTION 'Período inválido.';
  END IF;

  WITH base AS (
    -- Realizado da janela, por categoria. `categoria_id IS NOT NULL` é defensivo:
    -- lançamento sem categoria não tem como ser posicionado na estrutura (0 casos
    -- medidos); a RPC de decomposição antiga também o descartava, pelo INNER JOIN.
    SELECT f.categoria_id,
           sum(f.valor) AS valor,
           count(*)     AS n
    FROM financeiro.fato_fluxo f
    WHERE f.tipo = 'realizado'
      AND f.data_competencia BETWEEN v_de AND v_ate
      AND f.categoria_id IS NOT NULL
    GROUP BY f.categoria_id
  ),
  cat AS (
    -- De-para CURADO. Excluídas ficam FORA (transferência interna); sem linha no
    -- mapa → `bloco_chave` NULL = não classificada (bandeja), e segue visível.
    SELECT b.categoria_id,
           m.bloco_chave,
           COALESCE(m.rotulo, dc.categoria) AS rotulo,
           b.valor,
           b.n
    FROM base b
    JOIN financeiro.dim_categoria dc ON dc.id = b.categoria_id
    LEFT JOIN financeiro.dre_categoria_map m ON m.categoria_id = b.categoria_id
    WHERE COALESCE(m.excluida, false) = false
  ),
  bl AS (
    SELECT c.bloco_chave AS chave,
           sum(c.valor)  AS valor,
           sum(c.n)      AS n
    FROM cat c
    WHERE c.bloco_chave IS NOT NULL
    GROUP BY c.bloco_chave
  )
  SELECT json_build_object(
    'de',  v_de,
    'ate', v_ate,
    'blocos', COALESCE((
      SELECT json_agg(json_build_object(
               'chave',  t.chave,
               'rotulo', t.rotulo,
               'ordem',  t.ordem,
               'valor',  t.valor,
               'n',      t.n
             ) ORDER BY t.ordem)
      FROM (
        SELECT bl.chave, b.rotulo, b.ordem, bl.valor, bl.n
        FROM bl
        JOIN financeiro.dre_bloco b ON b.chave = bl.chave
      ) t
    ), '[]'::json),
    'categorias', COALESCE((
      SELECT json_agg(json_build_object(
               'categoria_id', c.categoria_id,
               'bloco_chave',  c.bloco_chave,
               'rotulo',       c.rotulo,
               'valor',        c.valor,
               'n',            c.n
             ) ORDER BY c.bloco_chave NULLS FIRST, abs(c.valor) DESC)
      FROM cat c
    ), '[]'::json)
  ) INTO v_res;

  RETURN v_res;
END $$;

COMMENT ON FUNCTION public.get_decomposicao_bloco(text, text) IS
  'DRE v5.3.1: decomposição REALIZADA por bloco da estrutura viva no intervalo '
  '[p_from, p_to]. Net signado; excluídas fora; bloco_chave NULL = não classificada. '
  'Reconcilia ao centavo com as colunas mensais de get_dre_mensal (mesmo filtro '
  'tipo=realizado, mesmo de-para dre_categoria_map WHERE NOT excluida).';

REVOKE EXECUTE ON FUNCTION public.get_decomposicao_bloco(text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_decomposicao_bloco(text, text) TO authenticated, service_role;

-- O event trigger do Supabase normalmente já recarrega o schema do PostgREST num
-- CREATE FUNCTION, mas o NOTIFY explícito é o padrão de toda migration irmã que cria
-- RPC (0188/0197/0204/0205/0207/0208) e é defesa barata: sem ele, um reload que não
-- dispare a tempo faz a verificação REST pós-push devolver PGRST202 ("could not find
-- function") — que se diagnostica como bug no corpo quando é só cache de schema.
NOTIFY pgrst, 'reload schema';
