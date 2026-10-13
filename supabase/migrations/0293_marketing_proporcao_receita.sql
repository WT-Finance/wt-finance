-- ---------------------------------------------------------------------------
-- 0293 — feat(v6.3.0): RPC `get_marketing_proporcao_receita(p_ano)` — o número de Marketing e o
--        da Receita Bruta, por COMPETÊNCIA, que a grade "Proporção sobre a Receita Bruta" da DRE
--        usa, para a página "Gastos de Marketing" (/marketing/gastos)
--
-- Classificação: ADITIVA (1 CREATE FUNCTION nova + COMMENT + REVOKE/GRANT + guard de efetividade).
--
-- DECLARAÇÃO PRÉVIA (regime aditivo / autônomo):
--   • O QUE FAZ: cria `public.get_marketing_proporcao_receita(p_ano integer) RETURNS json`,
--     SECURITY DEFINER, STABLE, search_path '', com `PERFORM app.exigir_acesso(ARRAY['marketing/gastos'])`
--     como primeira instrução do corpo (padrão INLINE, skill banco-e-rpc §4). Devolve, em camelCase:
--         { ano, mesesCobertos (0..12), parcial, coberturaAte (date|null), pct (numeric|null) }
--     • pct = Σ MKT ÷ Σ RB_H × 100 na janela, com o sinal da DRE (despesa → negativo) — a mesma
--       conta da grade (avPercentual(mkt/100, baseAv(rb/100)) de src/lib/dre/av.ts), feita sobre
--       os centavos inteiros abaixo; Receita Bruta < meio centavo (baseAv) → null; com
--       mesesCobertos = 0 → null (o ano não tem ponto).
--     • SÓ O PERCENTUAL SAI DO BANCO (achado MÉDIO do revisor-db, 09/10): devolver os centavos de
--       Marketing e de Receita Bruta entregaria a RECEITA BRUTA EXATA a quem só tem a área de
--       Marketing — mais do que o percentual exibido, que é o que foi aceito. A fórmula fica
--       duplicada (aqui e em av.ts), e o caso de contrato prova que o pct ≡ o da grade.
--   • POR QUE LÊ AS VIEWS E NÃO CHAMA `get_dre_competencia_mensal`: `app.exigir_acesso` lê o JWT da
--     REQUISIÇÃO, não do dono da função. Uma RPC gated por 'marketing/gastos' que chamasse a RPC da
--     DRE (gated por 'financeiro/dre', 0260:513) seria NEGADA para quem tem a área de Marketing e
--     não a da DRE — exatamente o público desta página. Por isso esta RPC lê as MESMAS views que a
--     0260 lê (`financeiro.vw_dre_competencia`, `financeiro.vw_dre_comp_expansao`) e repete APENAS o
--     filtro e as somas — nunca a montagem da árvore de linhas nem a recursão (a expansão já é a
--     view). Predicados copiados (fonte: 0260):
--         MKT  = vw_dre_competencia WHERE ano = p_ano AND sub_chave = 'MKT' AND NOT excluida
--                (0260:529-535, CTEs `dado`/`classificado`; é o que a linha t='cat', g='MKT' de
--                `linha_mes` soma — 0260:548-552, 0260:588-598 — e que `folhasPorGrupo` do TS,
--                src/lib/dre/folhas.ts:55-72, agrega por `g`). Não precisa juntar dre_comp_bloco:
--                dre_comp_par.sub_chave tem FK para dre_comp_bloco(chave) (0260:53), então toda
--                sub_chave classificada tem bloco, e a linha 'cat' existe para todo par
--                (sub_chave, rotulo_linha) não excluído (CTE `destino`, 0260:553-558).
--         RB_H = Σ e.coeficiente × c.valor sobre vw_dre_comp_expansao e (e.raiz = 'RB_H') JOIN
--                `classificado` c ON c.sub_chave = e.folha (0260:537-547, CTEs `folha_mes`/
--                `bloco_mes`). A soma direta por linha é igual à soma por (folha, mês) e depois
--                por mês: a aritmética é exata (ver "Centavos" abaixo). A fórmula de RB_H é DADO
--                EDITÁVEL (dre_comp_bloco.formula); ler a view mantém a RPC acompanhando o editor.
--   • JANELA (mesma regra da grade; fonte TS: janela-competencia.ts:54-66 `mesFinalCoberto` e
--     financeiro/dre/page.tsx:341-351 — `meses: a === anoCorrente ? mCob : 12`):
--       - cobertura_ate = max(raw.demonstrativo_competencia.competencia), GLOBAL da base (0260:644);
--       - p_ano anterior ao ano de HOJE (SP)        → 12 meses (ano fechado, como a grade, que usa
--                                                     12 incondicionalmente — vale até com base vazia);
--       - p_ano do ano de hoje (ou posterior)       → mesFinalCoberto(cobertura_ate, p_ano):
--           cobertura em ano POSTERIOR → 12; NO próprio ano → o mês dela; em ano ANTERIOR → 0;
--       - base sem nenhuma linha (cobertura_ate nulo), nesses anos → 0.
--     `parcial` = p_ano é o ano de hoje E mesesCobertos < 12 (o ano corrente ainda não coberto
--     inteiro). "Hoje" é `(now() AT TIME ZONE 'America/Sao_Paulo')::date` EXPLÍCITO, não CURRENT_DATE:
--     a credencial `verificador` não tem rolconfig de fuso (só anon/authenticated/service_role, 0152),
--     e o ano de hoje decide a janela.
--   • CENTAVOS — por que o inteiro do SQL é o MESMO do TS: `raw.demonstrativo_competencia.valor` é
--     NUMERIC(18,2) (0255:46) e o coeficiente da expansão é inteiro (0257:91 `sum(sinal)::int`).
--     Σ de NUMERIC(18,2) e Σ de (int × NUMERIC(18,2)) são EXATOS e têm escala 2, logo
--     `round(Σ × 100)` é um inteiro sem arredondamento real. O TS faz, mês a mês e linha a linha,
--     `toCentavos(v)`/`Math.round(v × 100)` sobre esses mesmos valores de 2 casas e soma os inteiros
--     (folhas.ts:66, proporcao-grupos.ts:95-99): soma de inteiros exatos = o inteiro da soma exata.
--     Nenhum ponto flutuante entra do lado do banco; o pct é a divisão NUMERIC desses inteiros
--     (o TS faz a mesma divisão em float — o contrato compara com tolerância de 1e-9 p.p.).
--   • Meses: `mes_num BETWEEN 1 AND v_meses` (o TS só enxerga os índices 1..12; achado BAIXO).
--   • Virada de ano: com a base ainda sem o ano novo (ex.: 02/01, cobertura em dezembro), a grade
--     da DRE não renderiza (mCob = 0) e esta RPC devolve 12 meses para o ano que acabou de fechar —
--     coerente com "ano fechado = 12" (registrado, achado BAIXO do revisor-db).
--   • AUTORIZAÇÃO e produto (decisão do Yan, 09/10/2026): o card mostra COMPETÊNCIA enquanto o resto
--     da página de Gastos de Marketing é CAIXA — o pedido foi "igual à DRE" — e fica visível a todos
--     com a área `marketing/gastos`. O percentual permite ESTIMAR a receita bruta de quem só tem
--     Marketing (gasto ÷ %); o risco foi apresentado e ACEITO pelo Yan. A receita exata não sai.
--   • COMPATÍVEL com a main viva: só objeto NOVO; nenhuma assinatura existente muda; nenhum código em
--     produção o referencia. NÃO ESCREVE em dado pré-existente. NÃO TOCA `get_dre_competencia_mensal`,
--     as views, `app.exigir_acesso` nem a migration 0292. Depende da 0292 (área `marketing/gastos`),
--     que já está na ordem.
--   • GRANTs: REVOKE de PUBLIC/anon; GRANT a authenticated e service_role (padrão 0207/0209) e,
--     DELIBERADAMENTE, ao `verificador` por assinatura completa (molde 0273/0292) — a suíte de
--     contrato prova a RPC viva e a allowlist é DERIVADA do nome literal no rpc-contrato.test.ts
--     (scripts/credencial/derivar-allowlist.mjs). O `ingestor` fica SEM.
--   • Volatilidade: STABLE (leitura pura). Orçamento: 1 varredura de vw_dre_competencia por `ano`
--     (índice demonstrativo_comp_ano_idx, 0255:54) + a expansão da árvore (dezenas de linhas) +
--     1 max(competencia) indexado — folga larga nos 8s de `authenticated`.
--
-- Pós-aplicação (orquestrador): regenerar src/types/database.ts (`gen types`), conferir a allowlist
-- com scripts/credencial/derivar-allowlist.mjs, `npm run db:baseline`, e a verificação REST
-- (service_role executa o corpo; `db query` NÃO).
--
-- DOWN (destrutivo — humano em TTY):
--   DROP FUNCTION public.get_marketing_proporcao_receita(integer);
-- ---------------------------------------------------------------------------

BEGIN;

CREATE OR REPLACE FUNCTION public.get_marketing_proporcao_receita(p_ano integer)
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_hoje_ano int;
  v_cob      date;
  v_meses    int;
  v_mkt      bigint;
  v_rb       bigint;
  v_pct      numeric;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['marketing/gastos']);

  IF p_ano IS NULL OR p_ano < 2000 OR p_ano > 2100 THEN
    RAISE EXCEPTION 'Ano inválido.';
  END IF;

  v_hoje_ano := extract(year FROM (now() AT TIME ZONE 'America/Sao_Paulo')::date)::int;

  -- Cobertura GLOBAL da base de competência (a mesma de `cobertura_ate` da RPC da DRE).
  SELECT max(r.competencia) INTO v_cob FROM raw.demonstrativo_competencia r;

  -- Janela da grade: ano passado = 12; ano de hoje (ou posterior) = mesFinalCoberto; base vazia = 0.
  IF p_ano < v_hoje_ano THEN
    v_meses := 12;
  ELSIF v_cob IS NULL THEN
    v_meses := 0;
  ELSIF extract(year FROM v_cob)::int > p_ano THEN
    v_meses := 12;
  ELSIF extract(year FROM v_cob)::int < p_ano THEN
    v_meses := 0;
  ELSE
    v_meses := least(greatest(extract(month FROM v_cob)::int, 0), 12);
  END IF;

  IF v_meses > 0 THEN
    -- Marketing: linhas classificadas, não excluídas, do grupo MKT, nos meses da janela.
    SELECT COALESCE(round(sum(v.valor) * 100), 0)::bigint INTO v_mkt
    FROM financeiro.vw_dre_competencia v
    WHERE v.ano = p_ano
      AND v.mes_num BETWEEN 1 AND v_meses
      AND v.sub_chave = 'MKT'
      AND NOT v.excluida;

    -- Receita Bruta (bloco RB_H): combinação linear das folhas da raiz RB_H, nos meses da janela.
    SELECT COALESCE(round(sum(e.coeficiente * v.valor) * 100), 0)::bigint INTO v_rb
    FROM financeiro.vw_dre_comp_expansao e
    JOIN financeiro.vw_dre_competencia v ON v.sub_chave = e.folha
    WHERE e.raiz = 'RB_H'
      AND v.ano = p_ano
      AND v.mes_num BETWEEN 1 AND v_meses
      AND v.sub_chave IS NOT NULL
      AND NOT v.excluida;

    -- Mesma conta de avPercentual(mkt/100, baseAv(rb/100)): base < meio centavo (rb ≤ 0 em
    -- centavos inteiros) → sem ponto.
    IF v_rb > 0 THEN
      v_pct := v_mkt::numeric / v_rb::numeric * 100;
    END IF;
  END IF;

  RETURN json_build_object(
    'ano',          p_ano,
    'mesesCobertos', v_meses,
    'parcial',      (p_ano = v_hoje_ano AND v_meses < 12),
    'coberturaAte', v_cob,
    'pct',          v_pct
  );
END $$;

COMMENT ON FUNCTION public.get_marketing_proporcao_receita(integer) IS
  'Despesas de Marketing v6.3.0: proporção (%) Marketing / Receita Bruta por COMPETÊNCIA, igual à da grade "Proporção sobre a Receita Bruta" da DRE '
  '(MKT = linhas de sub_chave MKT; RB_H via vw_dre_comp_expansao; janela = 12 meses em ano passado, cobertura da base no ano corrente). '
  'Lê as mesmas views de get_dre_competencia_mensal para não exigir financeiro/dre. Só o % sai (nunca a receita absoluta).';

REVOKE EXECUTE ON FUNCTION public.get_marketing_proporcao_receita(integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_marketing_proporcao_receita(integer) TO authenticated, service_role;

-- Credencial de máquina de VERIFICAÇÃO (somente leitura): por assinatura completa (molde 0273/0292).
GRANT EXECUTE ON FUNCTION public.get_marketing_proporcao_receita(p_ano integer) TO verificador;

-- Guard de EFETIVIDADE: a transação inteira aborta se a intenção não se cumpriu — função ausente
-- ou sobrecarregada, sem a área no corpo, sem SECURITY DEFINER/search_path vazio, anon/PUBLIC com
-- EXECUTE, authenticated/verificador sem EXECUTE, ingestor com EXECUTE.
DO $$
DECLARE
  v_sig  text := 'public.get_marketing_proporcao_receita(integer)';
  v_proc regprocedure;
  v_n    int;
BEGIN
  v_proc := to_regprocedure(v_sig);
  IF v_proc IS NULL THEN
    RAISE EXCEPTION '0293: função % não encontrada', v_sig;
  END IF;
  IF position('''marketing/gastos''' IN (SELECT prosrc FROM pg_proc WHERE oid = v_proc)) = 0 THEN
    RAISE EXCEPTION '0293: corpo de % não exige marketing/gastos', v_sig;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = v_proc AND prosecdef
                    AND proconfig @> ARRAY['search_path=""']) THEN
    RAISE EXCEPTION '0293: % sem SECURITY DEFINER ou sem search_path vazio', v_sig;
  END IF;
  IF has_function_privilege('anon', v_proc, 'EXECUTE') THEN
    RAISE EXCEPTION '0293: anon ainda tem EXECUTE em %', v_sig;
  END IF;
  IF NOT has_function_privilege('authenticated', v_proc, 'EXECUTE') THEN
    RAISE EXCEPTION '0293: authenticated sem EXECUTE em %', v_sig;
  END IF;
  IF NOT has_function_privilege('verificador', v_proc, 'EXECUTE') THEN
    RAISE EXCEPTION '0293: verificador sem EXECUTE em %', v_sig;
  END IF;
  IF has_function_privilege('ingestor', v_proc, 'EXECUTE') THEN
    RAISE EXCEPTION '0293: ingestor não deveria ter EXECUTE em %', v_sig;
  END IF;

  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'get_marketing_proporcao_receita';
  IF v_n <> 1 THEN
    RAISE EXCEPTION '0293: % funções get_marketing_proporcao_receita (esperado 1; sobrecarga criada por engano?)', v_n;
  END IF;
END
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
