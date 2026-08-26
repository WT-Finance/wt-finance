-- ---------------------------------------------------------------------------
-- 0257 — feat(db): leitura do regime de COMPETÊNCIA (v5.8.0, M2)
--
-- ADITIVA / retrocompatível:
--   • 1 CREATE VIEW nova (expansão da árvore) + 1 CREATE FUNCTION nova
--   • NADA do motor de caixa é tocado: `get_dre_mensal`, `dre_bloco`,
--     `dre_categoria_map`, `fato_fluxo` e o editor seguem intocados.
--
-- A RPC devolve o MESMO envelope de `public.get_dre_mensal(int)` — `ano`, `hoje`,
-- `relacao`, `mes_corrente`, `token_estrutura`, `linhas[]`, `bandeja[]` — e as mesmas
-- chaves por linha, para a tabela densa, as pills de ano, a Análise Vertical e o "Ver em
-- tela cheia" servirem aos DOIS regimes sem adaptação.
--
-- Com UMA diferença nomeada, e não pode ser varrida para debaixo do tapete: os itens da
-- BANDEJA não têm `categoria_id`. A competência não chaveia por categoria do banco — uma
-- linha que ninguém mapeou só tem o par de texto (Grupo, Descrição) do arquivo, e é ele
-- que viaja em `chave`. Por isso existe `dreCompBandejaSchema` separado do
-- `dreBandejaSchema` do caixa (src/lib/dre/schemas.ts): reusar o do caixa faria o
-- `safeParse` do envelope INTEIRO falhar no primeiro par não mapeado, apagando a seção
-- em silêncio justamente quando a bandeja tinha algo a dizer.
--
-- ── A expansão da árvore, e por que ela é uma VIEW ──────────────────────────
-- As fórmulas da árvore de competência apontam para DUAS direções: um `blocoH`
-- referencia os subgrupos que vêm DEPOIS dele (RB_H@10 = RV@20 + REEMB@30), e um `tot`
-- referencia chaves ANTERIORES (ROL@50 = RB_H@10 + IMP_H@40). Não existe, portanto, um
-- passe único por `ordem` que resolva tudo.
--
-- A saída é expandir cada chave na sua combinação SIGNADA de FOLHAS (blocos com
-- `formula IS NULL`, que somam as próprias linhas do de-para). Feito isso, o valor de
-- qualquer bloco é uma combinação linear das folhas — e a expansão depende só da
-- árvore, não do ano, então é uma view.
--
-- O ganho não é só de organização: o REXG (`["REX","-REEMB"]`) tem REEMB somado DENTRO
-- do REX e subtraído fora. Na expansão os dois termos se encontram no mesmo grupo e o
-- coeficiente de REEMB vira 0 — o `HAVING` o descarta. A subtração vira ARITMÉTICA de
-- coeficientes, não um caso especial no código.
--
-- ⚠️ A recursão tem teto de profundidade (24) como rede contra ciclo. Hoje ciclo é
--    impossível por construção: a árvore é semeada por `scripts/gera-seed-dre-competencia.mjs`,
--    que valida as referências, e esta versão NÃO tem editor da árvore de competência.
--    **Quando esse editor existir, ele tem de recusar ciclo na gravação** — o teto aqui
--    protege o servidor de laço infinito, não a corretude do número.
--
-- ── Competência não tem PREVISTO ────────────────────────────────────────────
-- O regime tem UMA coluna por mês: a base traz o que foi reconhecido, e não existe
-- projeção. Por isso `prev_corrente` sai NULL e `venc` sai 0 em toda linha — os campos
-- existem para o contrato ser o mesmo, e o front roda a seção em modo "sem previsto".
-- `relacao`/`mes_corrente` saem da COBERTURA da base (não da data de hoje): ano coberto
-- até dezembro é 'fechado'; coberto até o mês N é 'corrente' com `mes_corrente = N`;
-- ano sem nenhuma linha é 'futuro'. É o que faz a tabela mostrar exatamente os meses
-- que existem, sem inventar coluna zerada.
--
-- ── Completude: nada some em silêncio ───────────────────────────────────────
-- O envelope carrega `reconciliacao` em CENTAVOS INTEIROS:
--     base = linhas + bandeja + excluidas
-- `linhas` são as classificadas e não-excluídas, `bandeja` são os pares sem mapa (a view
-- é LEFT JOIN de propósito) e `excluidas` são as marcadas na curadoria (hoje nenhuma).
-- Centavos inteiros porque essa igualdade é conferida por teste e por humano, e comparar
-- dinheiro em ponto flutuante é onde a v5.5.1 apanhou.
--
-- ── Linhas-folha vêm do DE-PARA, não do dado ────────────────────────────────
-- Toda linha mapeada aparece, zerada quando o ano não tem valor nela — é o que a
-- `get_dre_mensal` já faz (0207: `FROM financeiro.dre_categoria_map mp` com
-- `COALESCE(cv.r, v_zeros)`). Assim o demonstrativo tem a MESMA forma ano a ano, e a
-- visão Consolidado casa linha com linha por chave.
-- ---------------------------------------------------------------------------

CREATE VIEW financeiro.vw_dre_comp_expansao AS
WITH RECURSIVE termo(raiz, chave, sinal, profundidade) AS (
  -- semente: cada bloco começa como ele mesmo, coeficiente +1
  SELECT b.chave, b.chave, 1, 0
  FROM financeiro.dre_comp_bloco b
  UNION ALL
  -- passo: bloco COM fórmula é substituído pelos seus termos, propagando o sinal
  SELECT t.raiz, f.ref, t.sinal * f.sinal, t.profundidade + 1
  FROM termo t
  JOIN financeiro.dre_comp_bloco b
    ON b.chave = t.chave
   AND b.formula IS NOT NULL
  CROSS JOIN LATERAL (
    SELECT
      CASE WHEN e.v LIKE '-%' THEN substr(e.v, 2) ELSE e.v END AS ref,
      CASE WHEN e.v LIKE '-%' THEN -1 ELSE 1 END              AS sinal
    FROM jsonb_array_elements_text(b.formula) AS e(v)
  ) f
  WHERE t.profundidade < 24
)
SELECT
  t.raiz,
  t.chave              AS folha,
  sum(t.sinal)::int    AS coeficiente
FROM termo t
JOIN financeiro.dre_comp_bloco b
  ON b.chave = t.chave
 AND b.formula IS NULL          -- só FOLHA é termo final; o resto foi expandido
GROUP BY t.raiz, t.chave
HAVING sum(t.sinal) <> 0;       -- coeficiente 0 = termo que se cancelou (o REEMB do REXG)

REVOKE ALL ON financeiro.vw_dre_comp_expansao FROM PUBLIC, anon, authenticated;
GRANT SELECT ON financeiro.vw_dre_comp_expansao TO service_role;

-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_dre_competencia_mensal(p_ano int)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_ult_mes  int;
  v_relacao  text;
  v_mes_corr int;
  v_out      json;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/dre']);

  SELECT max(v.mes_num) INTO v_ult_mes
  FROM financeiro.vw_dre_competencia v
  WHERE v.ano = p_ano;

  IF v_ult_mes IS NULL THEN
    v_relacao := 'futuro';   v_mes_corr := NULL;
  ELSIF v_ult_mes >= 12 THEN
    v_relacao := 'fechado';  v_mes_corr := NULL;
  ELSE
    v_relacao := 'corrente'; v_mes_corr := v_ult_mes;
  END IF;

  WITH dado AS (
    SELECT v.grupo, v.descricao, v.mes_num, v.valor, v.sub_chave, v.rotulo_linha, v.excluida
    FROM financeiro.vw_dre_competencia v
    WHERE v.ano = p_ano
  ),
  classificado AS (
    SELECT d.sub_chave, d.rotulo_linha, d.mes_num, d.valor
    FROM dado d
    WHERE d.sub_chave IS NOT NULL AND NOT d.excluida
  ),
  -- valor mensal de cada FOLHA da árvore (soma das linhas do de-para que caem nela)
  folha_mes AS (
    SELECT c.sub_chave AS folha, c.mes_num, sum(c.valor) AS valor
    FROM classificado c
    GROUP BY 1, 2
  ),
  -- valor mensal de QUALQUER bloco = combinação signada das suas folhas
  bloco_mes AS (
    SELECT e.raiz AS chave, f.mes_num, sum(e.coeficiente * f.valor) AS valor
    FROM financeiro.vw_dre_comp_expansao e
    JOIN folha_mes f ON f.folha = e.folha
    GROUP BY 1, 2
  ),
  -- a FUSÃO acontece aqui: dois pares com mesmo (sub_chave, rotulo_linha) viram UMA linha
  linha_mes AS (
    SELECT c.sub_chave, c.rotulo_linha, c.mes_num, sum(c.valor) AS valor
    FROM classificado c
    GROUP BY 1, 2, 3
  ),
  -- destino exibido: uma linha por (sub_chave, rotulo_linha) do DE-PARA, com ou sem dado
  destino AS (
    SELECT m.sub_chave, m.rotulo_linha, min(m.ordem) AS ordem
    FROM financeiro.dre_comp_map m
    WHERE NOT m.excluida
    GROUP BY 1, 2
  ),
  bandeja_mes AS (
    SELECT d.grupo, d.descricao, d.mes_num, sum(d.valor) AS valor
    FROM dado d
    WHERE d.sub_chave IS NULL
    GROUP BY 1, 2, 3
  ),
  -- ── linhas do demonstrativo, na ordem de renderização ────────────────────
  -- Cada bloco pela sua `ordem`; logo depois, as folhas mapeadas nele. `o2` separa o
  -- bloco (0) das suas folhas (1); `o3` ordena as folhas dentro do bloco.
  linhas AS (
    SELECT b.ordem AS o1, 0 AS o2, 0 AS o3,
           json_build_object(
             't',             b.tipo,
             'chave',         b.chave,
             'rotulo',        b.rotulo,
             'estrela',       false,
             'meses',         (SELECT COALESCE(json_agg(COALESCE(bm.valor, 0) ORDER BY g.m), '[]'::json)
                                 FROM generate_series(1, 12) g(m)
                                 LEFT JOIN bloco_mes bm ON bm.chave = b.chave AND bm.mes_num = g.m),
             'prev_corrente', NULL,
             'venc',          0,
             'total',         COALESCE((SELECT sum(bm.valor) FROM bloco_mes bm WHERE bm.chave = b.chave), 0)
           ) AS linha
    FROM financeiro.dre_comp_bloco b
    UNION ALL
    SELECT b.ordem, 1, dt.ordem,
           json_build_object(
             't',             'cat',
             'g',             dt.sub_chave,
             'chave',         dt.sub_chave || ' · ' || dt.rotulo_linha,
             'rotulo',        dt.rotulo_linha,
             'estrela',       false,
             'meses',         (SELECT COALESCE(json_agg(COALESCE(lm.valor, 0) ORDER BY g.m), '[]'::json)
                                 FROM generate_series(1, 12) g(m)
                                 LEFT JOIN linha_mes lm
                                        ON lm.sub_chave = dt.sub_chave
                                       AND lm.rotulo_linha = dt.rotulo_linha
                                       AND lm.mes_num = g.m),
             'prev_corrente', NULL,
             'venc',          0,
             'total',         COALESCE((SELECT sum(lm.valor) FROM linha_mes lm
                                         WHERE lm.sub_chave = dt.sub_chave
                                           AND lm.rotulo_linha = dt.rotulo_linha), 0)
           )
    FROM destino dt
    JOIN financeiro.dre_comp_bloco b ON b.chave = dt.sub_chave
  ),
  bandeja AS (
    SELECT bm.grupo, bm.descricao,
           json_build_object(
             -- Sem `categoria_id`: a competência não chaveia por categoria do banco, e sim
             -- pelo par de texto do arquivo. `chave` é essa identidade, ESTÁVEL entre anos
             -- (o que a visão Consolidado exige para casar linha com linha).
             'chave',         bm.grupo || ' · ' || bm.descricao,
             'rotulo',        bm.descricao,
             'grupo_monde',   bm.grupo,
             'meses',         (SELECT COALESCE(json_agg(COALESCE(b2.valor, 0) ORDER BY g.m), '[]'::json)
                                 FROM generate_series(1, 12) g(m)
                                 LEFT JOIN bandeja_mes b2
                                        ON b2.grupo = bm.grupo AND b2.descricao = bm.descricao
                                       AND b2.mes_num = g.m),
             'prev_corrente', NULL,
             'venc',          0,
             'total',         (SELECT sum(b3.valor) FROM bandeja_mes b3
                                WHERE b3.grupo = bm.grupo AND b3.descricao = bm.descricao)
           ) AS item
    FROM (SELECT DISTINCT grupo, descricao FROM bandeja_mes) bm
  ),
  recon AS (
    SELECT
      COALESCE((SELECT round(sum(d.valor) * 100) FROM dado d), 0)::bigint AS base,
      COALESCE((SELECT round(sum(c.valor) * 100) FROM classificado c), 0)::bigint AS linhas,
      COALESCE((SELECT round(sum(d.valor) * 100) FROM dado d WHERE d.sub_chave IS NULL), 0)::bigint AS bandeja,
      COALESCE((SELECT round(sum(d.valor) * 100) FROM dado d
                 WHERE d.sub_chave IS NOT NULL AND d.excluida), 0)::bigint AS excluidas
  )
  SELECT json_build_object(
    'ano',             p_ano,
    'hoje',            (now() AT TIME ZONE 'America/Sao_Paulo')::date,
    'relacao',         v_relacao,
    'mes_corrente',    v_mes_corr,
    'token_estrutura', (SELECT max(x) FROM (
                          SELECT max(atualizado_em) AS x FROM financeiro.dre_comp_bloco
                          UNION ALL
                          SELECT max(atualizado_em)      FROM financeiro.dre_comp_map
                        ) t),
    'linhas',          (SELECT COALESCE(json_agg(l.linha ORDER BY l.o1, l.o2, l.o3), '[]'::json) FROM linhas l),
    'bandeja',         (SELECT COALESCE(json_agg(b.item ORDER BY b.grupo, b.descricao), '[]'::json) FROM bandeja b),
    -- Extras do regime, DECLARADOS em `dreCompMensalSchema` (src/lib/dre/schemas.ts) —
    -- não deixados passar pelo `.passthrough()`. Campo que o schema não declara vira
    -- `undefined` mudo três camadas depois; declarado, quebra no parse.
    'anos',            (SELECT COALESCE(json_agg(DISTINCT r.ano ORDER BY r.ano), '[]'::json)
                          FROM raw.demonstrativo_competencia r),
    'cobertura_de',    (SELECT min(r.competencia) FROM raw.demonstrativo_competencia r),
    'cobertura_ate',   (SELECT max(r.competencia) FROM raw.demonstrativo_competencia r),
    'carregado_em',    (SELECT max(r.carregado_em) FROM raw.demonstrativo_competencia r),
    'reconciliacao',   (SELECT json_build_object(
                                 'base_centavos',      rc.base,
                                 'linhas_centavos',    rc.linhas,
                                 'bandeja_centavos',   rc.bandeja,
                                 'excluidas_centavos', rc.excluidas,
                                 'fecha',              rc.base = rc.linhas + rc.bandeja + rc.excluidas)
                          FROM recon rc)
  ) INTO v_out;

  RETURN v_out;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_dre_competencia_mensal(int) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_dre_competencia_mensal(int) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
