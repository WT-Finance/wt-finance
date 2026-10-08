-- ---------------------------------------------------------------------------
-- 0292 — feat(v6.3.0/M2): área RBAC `marketing/gastos` + 3 RPCs de leitura da página
--        "Gastos de Marketing" (/marketing/gastos)
--
-- Classificação: ADITIVA (1 INSERT da área + 1 INSERT…SELECT que cria as 3 concessões + 3 CREATE
-- FUNCTION novas + REVOKE/GRANT + guard de efetividade).
--
-- DECLARAÇÃO PRÉVIA (regime aditivo / autônomo):
--   • O QUE FAZ:
--     (1) INSERT da área `marketing/gastos` em app.rbac_areas (rótulo 'Gastos', grupo NOVO
--         'Marketing', ordem 70 — cada grupo ocupa uma dezena; a maior ordem até a 0289 é 62,
--         de Gestão de Pessoas) — ON CONFLICT DO NOTHING;
--     (2) concede a área, EXPLICITAMENTE POR NOME de role, a: 'Administrador', 'Financeiro' e
--         'Máquina · verificação'. Nenhuma outra role ganha a área (quem mais precisar de acesso
--         recebe pelo editor de roles). ON CONFLICT DO NOTHING — idempotente.
--         A role de máquina entra por EXIGÊNCIA de rpc-contrato.test.ts (~913-916): ela tem de
--         ter TODA área fora do grupo 'Administração', e 'Marketing' é grupo de leitura (molde da
--         0273 §3). A 0289 fez diferente (concedeu "a quem já tem tal área" e excluiu máquinas)
--         porque `api-externa` é do grupo Administração; aqui o critério é outro.
--         'Máquina · ingestão' NÃO recebe (só tem admin/uploads, 0274);
--     (3) 3 funções NOVAS, todas `(p_ano integer) RETURNS json`, SECURITY DEFINER,
--         search_path '', `PERFORM app.exigir_acesso(ARRAY['marketing/gastos'])` como primeira
--         instrução do corpo (padrão INLINE, skill banco-e-rpc §4):
--         • public.get_marketing_gastos_resumo(p_ano)      — por mês × categoria + metadados
--                                                            (anos com dado, cobertura, última
--                                                            carga, última data de cartão);
--         • public.get_marketing_gastos_fornecedores(p_ano) — por mês × fornecedor;
--         • public.get_marketing_gastos_lancamentos(p_ano)  — os lançamentos do ano (~230/ano; o
--                                                            filtro/ordenação/busca rodam no
--                                                            cliente, sem paginação no servidor).
--         Chaves do JSON em camelCase, como em src/components/marketing/gastos/tipos.ts.
--         `lancamentos` devolve uma lista FECHADA de colunas (decisão do Yan): id, data,
--         categoria, fornecedor, descricao, documento, valor — nada de conta bancária/cartão,
--         venda_no, emissão, vencimento, liquidação.
--     (4) REVOKE de PUBLIC/anon nas 3 funções; GRANT a authenticated e service_role (padrão
--         0207/0209) e, DELIBERADAMENTE, ao `verificador` — por assinatura completa, molde 0273 —
--         para que a suíte de contrato (rpc-contrato.test.ts) consiga provar as RPCs vivas.
--         O `ingestor` fica SEM (credencial de escrita; não lê nada de marketing).
--   • PREDICADO COPIADO DA DRE, SEM LISTA DE CATEGORIAS, e por quê: a página mostra os
--     lançamentos PAGOS do bloco MKT da DRE de caixa, e o INVARIANTE CENTRAL é que o total por
--     mês da página ≡ a célula MKT de get_dre_mensal(p_ano) (0207), ao centavo. Por isso as 3
--     RPCs usam EXATAMENTE o filtro da DRE, lendo o mapa VIVO (curado e editável pelo editor da
--     estrutura):
--         FROM financeiro.fato_fluxo f
--         JOIN financeiro.dre_categoria_map m
--           ON m.categoria_id = f.categoria_id AND NOT m.excluida AND m.bloco_chave = 'MKT'
--         WHERE f.tipo = 'realizado'
--           AND f.data_competencia >= make_date(p_ano,1,1) AND f.data_competencia < make_date(p_ano+1,1,1)
--     • `tipo = 'realizado'` já foi decidido na carga (data_movimentacao ≤ data-base): NÃO se
--       recalcula "pago" por data ≤ hoje. Para realizado, data_competencia = data_movimentacao.
--     • Faixa de ano semiaberta (como 0207), não `extract(year ...)`: mantém o índice
--       fato_fluxo_tipo_competencia_idx (0187) utilizável.
--     • `valor` sai COM o sinal da DRE (gasto < 0, estorno > 0) — sem inversão e sem arredondar.
--     • Rótulo da categoria = COALESCE(m.rotulo, dc.categoria): o MESMO que a DRE mostra para a
--       linha da categoria (0207:193) e que a decomposição usa (0209:106).
--     • Fornecedor = NULLIF(btrim(f.pessoa, E' \t\r\n' || chr(160)), '') — UMA expressão, usada
--       igual nas RPCs de fornecedores e de lançamentos, para que Σ por fornecedor reconcilie entre
--       as duas (NULL e só-branco colapsam num balde NULL; a UI mostra "(sem fornecedor)"). O
--       conjunto de brancos (espaço, tab, CR, LF, NBSP) acompanha o String.trim() do cliente
--       (src/lib/marketing/agregacao.ts), para a chave do fornecedor ser a mesma nos dois lados.
--     • A DRE (0207) troca realizado por PREVISTO nos meses futuros do ano corrente; esta página
--       é só realizado (mês futuro = 0), então a paridade é por mês JÁ REALIZADO — a coluna de
--       realizado da DRE, que é a de que a página trata.
--   • COMPATÍVEL com a main viva: só objetos NOVOS (área nova, role→área nova, 3 funções novas).
--     Nenhum código em produção os referencia. Nenhuma assinatura existente muda.
--   • NÃO ESCREVE em dado pré-existente (só INSERT em catálogo RBAC). NÃO TOCA get_dre_mensal,
--     financeiro.dre_categoria_map nem app.exigir_acesso.
--   • Volatilidade: STABLE (leitura pura, sem temp table — ao contrário da get_dre_mensal).
--     Orçamento: 1 varredura indexada de fato_fluxo por (tipo, data_competencia) no ano + joins
--     com 130 categorias — folga larga nos 8s de `authenticated`. "Hoje" não é usado no SQL.
--     Fuso: nenhum "hoje" aqui; `ultimaCarga` (timestamptz) sai em ISO e o front formata com
--     fmtDataSP (skill banco-e-rpc §3).
--
-- Pós-aplicação (orquestrador): regenerar src/types/database.ts (`gen types`), schemas Zod +
-- casos em rpc-contrato.test.ts (inclusive a identidade Σ página ≡ MKT da DRE), conferir a
-- allowlist com scripts/credencial/derivar-allowlist.mjs e `npm run db:baseline`.
--
-- DOWN (destrutivo — humano em TTY):
--   DROP FUNCTION public.get_marketing_gastos_resumo(integer);
--   DROP FUNCTION public.get_marketing_gastos_fornecedores(integer);
--   DROP FUNCTION public.get_marketing_gastos_lancamentos(integer);
--   DELETE FROM app.rbac_role_permissoes WHERE area = 'marketing/gastos';
--   DELETE FROM app.rbac_areas WHERE area = 'marketing/gastos';
-- ---------------------------------------------------------------------------

BEGIN;

-- (1) Área nova. Paridade exata com AREAS/AREA_INFO em src/lib/auth/areas.ts (rpc-contrato.test.ts).
INSERT INTO app.rbac_areas (area, rotulo, grupo, ordem) VALUES
  ('marketing/gastos', 'Gastos', 'Marketing', 70)
ON CONFLICT (area) DO NOTHING;

-- (2) Concessões explícitas, por nome de role. O guard (6) reprova se algum nome não casar
-- (um nome digitado errado inseriria ZERO linhas, em silêncio).
INSERT INTO app.rbac_role_permissoes (role_id, area)
SELECT r.id, 'marketing/gastos'
  FROM app.rbac_roles r
 WHERE r.nome IN ('Administrador', 'Financeiro', 'Máquina · verificação')
ON CONFLICT (role_id, area) DO NOTHING;

-- (3) Resumo do ano: por mês × categoria + metadados.
CREATE OR REPLACE FUNCTION public.get_marketing_gastos_resumo(p_ano integer)
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_ini date;
  v_fim date;
  v_res json;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['marketing/gastos']);

  IF p_ano IS NULL OR p_ano < 2000 OR p_ano > 2100 THEN
    RAISE EXCEPTION 'Ano inválido.';
  END IF;

  v_ini := make_date(p_ano, 1, 1);
  v_fim := make_date(p_ano + 1, 1, 1);

  WITH mkt AS (
    -- Lançamentos PAGOS do bloco MKT no ano: o predicado da DRE (0207), sem lista de categorias.
    SELECT f.data_competencia,
           extract(month FROM f.data_competencia)::int AS mes,
           COALESCE(m.rotulo, dc.categoria)            AS categoria,
           f.valor
    FROM financeiro.fato_fluxo f
    JOIN financeiro.dre_categoria_map m
      ON m.categoria_id = f.categoria_id AND NOT m.excluida AND m.bloco_chave = 'MKT'
    JOIN financeiro.dim_categoria dc ON dc.id = f.categoria_id
    WHERE f.tipo = 'realizado'
      AND f.data_competencia >= v_ini
      AND f.data_competencia <  v_fim
  ),
  agg AS (
    -- Agrupa pelo RÓTULO exibido (não pelo id): duas categorias com o mesmo rótulo na DRE
    -- viram UMA linha por mês, e o total do mês não muda.
    SELECT x.mes, x.categoria, sum(x.valor) AS valor, count(*) AS qtd
    FROM mkt x
    GROUP BY x.mes, x.categoria
  )
  SELECT json_build_object(
    'ano', p_ano,
    -- Anos com lançamento MKT realizado (sem filtro de ano), crescente.
    'anosDisponiveis', COALESCE((
      SELECT json_agg(a.ano ORDER BY a.ano)
      FROM (
        SELECT DISTINCT extract(year FROM f.data_competencia)::int AS ano
        FROM financeiro.fato_fluxo f
        JOIN financeiro.dre_categoria_map m
          ON m.categoria_id = f.categoria_id AND NOT m.excluida AND m.bloco_chave = 'MKT'
        WHERE f.tipo = 'realizado'
      ) a
    ), '[]'::json),
    'porMesCategoria', COALESCE((
      SELECT json_agg(json_build_object(
               'mes',       g.mes,
               'categoria', g.categoria,
               'valor',     g.valor,
               'qtd',       g.qtd
             ) ORDER BY g.mes, g.categoria)
      FROM agg g
    ), '[]'::json),
    -- NULL (não {min:null,max:null}) quando o ano não tem lançamento.
    'cobertura', (
      SELECT CASE WHEN count(*) > 0
                  THEN json_build_object('min', min(x.data_competencia), 'max', max(x.data_competencia))
             END
      FROM mkt x
    ),
    -- Mesma fonte que a DRE usa (status_lancamentos_movimentacao, 0185).
    'ultimaCarga', (SELECT max(r.carregado_em) FROM raw.lancamentos_movimentacao r),
    -- Última data de TODO realizado (não só MKT) em conta de cartão de crédito: a fatura entra
    -- com atraso e o mês corrente fica subcontado até ela entrar. Sem filtro de ano.
    'ultimaDataCartao', (
      SELECT max(f.data_competencia)
      FROM financeiro.fato_fluxo f
      WHERE f.tipo = 'realizado'
        AND f.conta_bancaria_id IN (
          SELECT d.id FROM financeiro.dim_conta_bancaria d WHERE d.eh_cartao_credito
        )
    )
  ) INTO v_res;

  RETURN v_res;
END $$;

-- (4) Por mês × fornecedor.
CREATE OR REPLACE FUNCTION public.get_marketing_gastos_fornecedores(p_ano integer)
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_ini date;
  v_fim date;
  v_res json;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['marketing/gastos']);

  IF p_ano IS NULL OR p_ano < 2000 OR p_ano > 2100 THEN
    RAISE EXCEPTION 'Ano inválido.';
  END IF;

  v_ini := make_date(p_ano, 1, 1);
  v_fim := make_date(p_ano + 1, 1, 1);

  WITH agg AS (
    SELECT extract(month FROM f.data_competencia)::int AS mes,
           NULLIF(btrim(f.pessoa, E' \t\r\n' || chr(160)), '') AS fornecedor,
           sum(f.valor)                                AS valor,
           count(*)                                    AS qtd
    FROM financeiro.fato_fluxo f
    JOIN financeiro.dre_categoria_map m
      ON m.categoria_id = f.categoria_id AND NOT m.excluida AND m.bloco_chave = 'MKT'
    WHERE f.tipo = 'realizado'
      AND f.data_competencia >= v_ini
      AND f.data_competencia <  v_fim
    GROUP BY 1, 2
  )
  SELECT json_build_object(
    'ano', p_ano,
    'porMesFornecedor', COALESCE((
      SELECT json_agg(json_build_object(
               'mes',        g.mes,
               'fornecedor', g.fornecedor,
               'valor',      g.valor,
               'qtd',        g.qtd
             ) ORDER BY g.mes, g.fornecedor NULLS LAST)
      FROM agg g
    ), '[]'::json)
  ) INTO v_res;

  RETURN v_res;
END $$;

-- (5) Lançamentos do ano (array na raiz). Lista FECHADA de colunas.
CREATE OR REPLACE FUNCTION public.get_marketing_gastos_lancamentos(p_ano integer)
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_ini date;
  v_fim date;
  v_res json;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['marketing/gastos']);

  IF p_ano IS NULL OR p_ano < 2000 OR p_ano > 2100 THEN
    RAISE EXCEPTION 'Ano inválido.';
  END IF;

  v_ini := make_date(p_ano, 1, 1);
  v_fim := make_date(p_ano + 1, 1, 1);

  SELECT COALESCE(json_agg(json_build_object(
           'id',         t.id,
           'data',       t.data_competencia,
           'categoria',  t.categoria,
           'fornecedor', t.fornecedor,
           'descricao',  t.descricao,
           'documento',  t.numero,
           'valor',      t.valor
         ) ORDER BY t.data_competencia, t.id), '[]'::json)
  INTO v_res
  FROM (
    SELECT f.id,
           f.data_competencia,
           COALESCE(m.rotulo, dc.categoria) AS categoria,
           NULLIF(btrim(f.pessoa, E' \t\r\n' || chr(160)), '') AS fornecedor,
           f.descricao,
           f.numero,
           f.valor
    FROM financeiro.fato_fluxo f
    JOIN financeiro.dre_categoria_map m
      ON m.categoria_id = f.categoria_id AND NOT m.excluida AND m.bloco_chave = 'MKT'
    JOIN financeiro.dim_categoria dc ON dc.id = f.categoria_id
    WHERE f.tipo = 'realizado'
      AND f.data_competencia >= v_ini
      AND f.data_competencia <  v_fim
  ) t;

  RETURN v_res;
END $$;

COMMENT ON FUNCTION public.get_marketing_gastos_resumo(integer) IS
  'Gastos de Marketing v6.3.0: por mês x categoria + metadados (anos, cobertura, última carga, última data de cartão). '
  'Predicado IDÊNTICO ao da DRE de caixa (tipo=realizado, dre_categoria_map NOT excluida, bloco MKT): total do mês = célula MKT de get_dre_mensal.';
COMMENT ON FUNCTION public.get_marketing_gastos_fornecedores(integer) IS
  'Gastos de Marketing v6.3.0: por mês x fornecedor (pessoa; vazio/só-espaço = NULL). Mesmo predicado da DRE; Σ = Σ do resumo.';
COMMENT ON FUNCTION public.get_marketing_gastos_lancamentos(integer) IS
  'Gastos de Marketing v6.3.0: lançamentos pagos do bloco MKT no ano (lista fechada de colunas). Mesmo predicado da DRE; Σ valor = Σ do resumo.';

REVOKE EXECUTE ON FUNCTION public.get_marketing_gastos_resumo(integer)      FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_marketing_gastos_fornecedores(integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_marketing_gastos_lancamentos(integer)  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_marketing_gastos_resumo(integer)      TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_marketing_gastos_fornecedores(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_marketing_gastos_lancamentos(integer)  TO authenticated, service_role;

-- Credencial de máquina de VERIFICAÇÃO (somente leitura): por assinatura completa (molde 0273).
GRANT EXECUTE ON FUNCTION public.get_marketing_gastos_resumo(p_ano integer)      TO verificador;
GRANT EXECUTE ON FUNCTION public.get_marketing_gastos_fornecedores(p_ano integer) TO verificador;
GRANT EXECUTE ON FUNCTION public.get_marketing_gastos_lancamentos(p_ano integer)  TO verificador;

-- (6) Guard de EFETIVIDADE: a transação inteira aborta se a intenção não se cumpriu — role com
-- nome digitado errado (concessão com zero linhas), função ausente ou sem a área no corpo,
-- anon/PUBLIC com EXECUTE, verificador sem EXECUTE, ou role de máquina errada com a área.
DO $$
DECLARE
  v_sig  text;
  v_proc regprocedure;
  v_n    int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app.rbac_areas
                  WHERE area = 'marketing/gastos' AND rotulo = 'Gastos' AND grupo = 'Marketing' AND ordem = 70) THEN
    RAISE EXCEPTION '0292: área marketing/gastos ausente ou divergente em app.rbac_areas';
  END IF;

  SELECT count(DISTINCT r.nome) INTO v_n
    FROM app.rbac_role_permissoes rp
    JOIN app.rbac_roles r ON r.id = rp.role_id
   WHERE rp.area = 'marketing/gastos'
     AND r.nome IN ('Administrador', 'Financeiro', 'Máquina · verificação');
  IF v_n <> 3 THEN
    RAISE EXCEPTION '0292: % das 3 roles (Administrador, Financeiro, Máquina · verificação) têm marketing/gastos', v_n;
  END IF;

  -- Nenhuma OUTRA role (de máquina ou não) com a área: exatamente as 3 concessões declaradas.
  SELECT count(*) INTO v_n FROM app.rbac_role_permissoes WHERE area = 'marketing/gastos';
  IF v_n <> 3 THEN
    RAISE EXCEPTION '0292: % roles têm marketing/gastos (esperado exatamente 3)', v_n;
  END IF;

  FOREACH v_sig IN ARRAY ARRAY[
    'public.get_marketing_gastos_resumo(integer)',
    'public.get_marketing_gastos_fornecedores(integer)',
    'public.get_marketing_gastos_lancamentos(integer)'
  ] LOOP
    v_proc := to_regprocedure(v_sig);
    IF v_proc IS NULL THEN
      RAISE EXCEPTION '0292: função % não encontrada', v_sig;
    END IF;
    IF position('''marketing/gastos''' IN (SELECT prosrc FROM pg_proc WHERE oid = v_proc)) = 0 THEN
      RAISE EXCEPTION '0292: corpo de % não exige marketing/gastos', v_sig;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = v_proc AND prosecdef
                      AND proconfig @> ARRAY['search_path=""']) THEN
      RAISE EXCEPTION '0292: % sem SECURITY DEFINER ou sem search_path vazio', v_sig;
    END IF;
    IF has_function_privilege('anon', v_proc, 'EXECUTE') THEN
      RAISE EXCEPTION '0292: anon ainda tem EXECUTE em %', v_sig;
    END IF;
    IF NOT has_function_privilege('authenticated', v_proc, 'EXECUTE') THEN
      RAISE EXCEPTION '0292: authenticated sem EXECUTE em %', v_sig;
    END IF;
    IF NOT has_function_privilege('verificador', v_proc, 'EXECUTE') THEN
      RAISE EXCEPTION '0292: verificador sem EXECUTE em %', v_sig;
    END IF;
    IF has_function_privilege('ingestor', v_proc, 'EXECUTE') THEN
      RAISE EXCEPTION '0292: ingestor não deveria ter EXECUTE em %', v_sig;
    END IF;
  END LOOP;

  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname LIKE 'get\_marketing\_gastos\_%';
  IF v_n <> 3 THEN
    RAISE EXCEPTION '0292: % funções get_marketing_gastos_* (esperado 3; sobrecarga criada por engano?)', v_n;
  END IF;
END
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
