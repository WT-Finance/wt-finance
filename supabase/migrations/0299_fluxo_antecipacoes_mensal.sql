-- ---------------------------------------------------------------------------
-- 0299 — feat(v6.4.1): RPC de leitura get_fluxo_antecipacoes_mensal() — o líquido das antecipações de
--        recebíveis por mês, legível pela área `financeiro/fluxo-caixa`.
--
-- Classificação: ADITIVA (1 CREATE FUNCTION nova + REVOKE/GRANT + COMMENT + guard de efetividade).
-- Nenhum DROP/TRUNCATE/ALTER/UPDATE/DELETE. Nenhum dado escrito.
--
-- DECLARAÇÃO PRÉVIA (regime aditivo / autônomo):
--   • O QUE FAZ: cria `public.get_fluxo_antecipacoes_mensal() RETURNS json` (STABLE, SECURITY DEFINER,
--     search_path vazio). Lê `financeiro.antecipacao` (v6.4.0, 0296) e devolve, por mês da `data` da
--     antecipação (TODAS as contas somadas), o valor LÍQUIDO recebido e a quantidade de registros —
--     o valor de face NÃO sai (líquido + face revelaria o desconto mensal a quem só tem fluxo-caixa):
--         [{"mes":"2026-04","liquido":700292.47,"n":3}, ...]
--     ordenado por mês; `[]` (nunca null) quando não há registro algum. Valores numéricos JSON.
--   • POR QUÊ (v6.4.1): o gráfico "Fluxo de Caixa Mensal" (/financeiro/fluxo-caixa) passa a mostrar, em
--     âmbar, quanto das entradas efetivadas de cada mês veio de antecipação. O registro de antecipações
--     só era legível pela área `financeiro/geral` (e a de gestão) — as RPCs da v6.4.0 exigem essas áreas
--     —, então a página do Fluxo de Caixa, que exige `financeiro/fluxo-caixa`, não tinha como lê-lo.
--     Esta RPC é o recorte de leitura MÍNIMO e sem escrita para essa página.
--   • RETROCOMPATÍVEL com a `main` viva: função nova, sem consumidor ainda. NADA existente é alterado — em
--     especial `get_fluxo_caixa_mensal_v3` (corpo 0229, gate 0121) NÃO muda: contrato e consumidor atuais
--     ficam intactos. A tabela `financeiro.antecipacao` não é tocada (só SELECT).
--   • PADRÃO INLINE (skill banco-e-rpc §4): `PERFORM app.exigir_acesso(ARRAY['financeiro/fluxo-caixa'])`
--     como primeira instrução do corpo. REVOKE EXECUTE de PUBLIC e anon; GRANT a authenticated e
--     service_role e, DELIBERADAMENTE, ao `verificador` por assinatura completa (o caso de contrato desta
--     RPC em rpc-contrato.test.ts precisa dele; molde 0273/0292/0297). O `ingestor` fica SEM.
--   • AGREGAÇÃO: `to_char(a.data, 'YYYY-MM')` sobre a coluna `date` (sem fuso envolvido). Σ liquido sobre
--     todos os meses ≡ Σ valor_liquido do registro (invariante conferido no ensaio e no caso de contrato).
--
-- DOWN (reversão — não há dado a restaurar, a função é só leitura):
--   DROP FUNCTION public.get_fluxo_antecipacoes_mensal();
--   (DROP é destrutivo para o classificador: só aplicar com confirmação humana, e só depois de tirar o
--   consumidor da página do Fluxo de Caixa.)
-- ---------------------------------------------------------------------------

BEGIN;

CREATE OR REPLACE FUNCTION public.get_fluxo_antecipacoes_mensal()
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_res json;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/fluxo-caixa']);

  -- Só o LÍQUIDO sai (decisão do Yan, 15/10). O valor de face NÃO é exposto: líquido + face revelaria o
  -- desconto mensal (custo de antecipação) a quem tem só financeiro/fluxo-caixa — achado MÉDIO do revisor-db.
  -- `data::timestamp` tira a dependência do TimeZone da sessão no to_char (achado BAIXO do revisor-db).
  SELECT COALESCE(json_agg(json_build_object(
                    'mes',     m.mes,
                    'liquido', m.liquido,
                    'n',       m.n
                  ) ORDER BY m.mes), '[]'::json)
    INTO v_res
    FROM (
      SELECT to_char(a.data::timestamp, 'YYYY-MM') AS mes,
             sum(a.valor_liquido)                  AS liquido,
             count(*)::int                         AS n
        FROM financeiro.antecipacao a
       GROUP BY 1
    ) m;

  RETURN v_res;
END $$;

COMMENT ON FUNCTION public.get_fluxo_antecipacoes_mensal() IS
  'Fluxo de Caixa v6.4.1: antecipações registradas no Janus (financeiro.antecipacao) agregadas por mês da data, todas as contas — [{mes, liquido, antecipado, n}] ordenado por mês, [] sem registro. Gate financeiro/fluxo-caixa. Alimenta o segmento âmbar do gráfico Fluxo de Caixa Mensal.';

REVOKE EXECUTE ON FUNCTION public.get_fluxo_antecipacoes_mensal() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_fluxo_antecipacoes_mensal() TO authenticated, service_role;

-- Credencial de máquina de VERIFICAÇÃO (somente leitura): por assinatura completa.
GRANT EXECUTE ON FUNCTION public.get_fluxo_antecipacoes_mensal() TO verificador;

-- Guard de EFETIVIDADE: a transação inteira aborta se a intenção não se cumpriu — função ausente (ou
-- assinatura errada: to_regprocedure devolve NULL), sem a área no corpo, sem SECURITY DEFINER/search_path
-- vazio, grants errados.
DO $$
DECLARE
  v_sig  text := 'public.get_fluxo_antecipacoes_mensal()';
  v_proc regprocedure;
BEGIN
  -- Pré-condição (achado BAIXO do revisor-db): plpgsql só liga tabela/coluna em runtime — sem isto a
  -- migration aplicaria fora de ordem e a falha só apareceria na 1ª chamada.
  IF (SELECT count(*) FROM pg_attribute
       WHERE attrelid = to_regclass('financeiro.antecipacao') AND NOT attisdropped
         AND attname IN ('data', 'valor_liquido')) <> 2 THEN
    RAISE EXCEPTION '0299: financeiro.antecipacao (0296) ausente ou sem as colunas data/valor_liquido';
  END IF;

  v_proc := to_regprocedure(v_sig);
  IF v_proc IS NULL THEN
    RAISE EXCEPTION '0299: função % não encontrada', v_sig;
  END IF;
  IF position('''financeiro/fluxo-caixa''' IN (SELECT prosrc FROM pg_proc WHERE oid = v_proc)) = 0 THEN
    RAISE EXCEPTION '0299: corpo de % não exige financeiro/fluxo-caixa', v_sig;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = v_proc AND prosecdef
                    AND proconfig @> ARRAY['search_path=""']) THEN
    RAISE EXCEPTION '0299: % sem SECURITY DEFINER ou sem search_path vazio', v_sig;
  END IF;
  IF has_function_privilege('anon', v_proc, 'EXECUTE') THEN
    RAISE EXCEPTION '0299: anon ainda tem EXECUTE em %', v_sig;
  END IF;
  IF NOT has_function_privilege('authenticated', v_proc, 'EXECUTE') THEN
    RAISE EXCEPTION '0299: authenticated sem EXECUTE em %', v_sig;
  END IF;
  IF NOT has_function_privilege('service_role', v_proc, 'EXECUTE') THEN
    RAISE EXCEPTION '0299: service_role sem EXECUTE em %', v_sig;
  END IF;
  IF NOT has_function_privilege('verificador', v_proc, 'EXECUTE') THEN
    RAISE EXCEPTION '0299: verificador sem EXECUTE em %', v_sig;
  END IF;
  IF has_function_privilege('ingestor', v_proc, 'EXECUTE') THEN
    RAISE EXCEPTION '0299: ingestor não deveria ter EXECUTE em %', v_sig;
  END IF;
END
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
