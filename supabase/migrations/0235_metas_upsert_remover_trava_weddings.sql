-- ---------------------------------------------------------------------------
-- 0235 — fix: remover a trava METAS_WEDDINGS_DERIVADO de metas_upsert
--
-- DECLARAÇÃO PRÉVIA (regime aditivo / autônomo):
--   • O QUE FAZ: CREATE OR REPLACE de public.metas_upsert(jsonb), assinatura
--     idêntica, removendo APENAS a trava que a 0234 acrescentou (recusa de
--     setor_macro_id de Weddings). Nada mais muda: os guards de NULL para
--     ano/mes ficam (melhoram a mensagem, não mudam comportamento aceito), o
--     bloco de alterado_por fica, o histórico condicional fica.
--   • ADITIVA / RETROCOMPATÍVEL: volta a ACEITAR um caso que a 0234 passou a
--     recusar. Nenhuma tabela, coluna ou linha é tocada.
--
-- POR QUE ESTA MIGRATION EXISTE — incidente de produção, causado pela ordem de
-- aplicação:
--
--   A v5.4.4 (Metas por subsetor) aplicou 0233/0234 em produção ANTES de o seu
--   front ser mergeado. A trava faz sentido COM o front novo, onde a coluna
--   Weddings do Cadastro é read-only e nunca é enviada. Mas o front que está no
--   ar é o da v5.4.3, e ele monta o lote iterando TODOS os setores —
--   `for (const s of setores)` com `{id:1 Lazer, id:2 Weddings, id:3
--   Corporativo}` — sem nenhuma exclusão.
--
--   Resultado: qualquer Salvar do Cadastro que inclua uma célula alterada de
--   Weddings bate na trava. E como o RAISE aborta a TRANSAÇÃO, o lote inteiro
--   morre: as edições de Trips e Corporativo feitas na mesma leva também não
--   gravam, e o usuário vê a mensagem genérica "Falha ao salvar as metas.
--   Tente novamente." (o `traduzirErro` que reconhece o código novo está no
--   front que não foi mergeado).
--
--   A v5.4.4 entrou em STAND-BY por decisão do Yan (o eixo de subsetor continua
--   dependendo do upload manual; ver a errata do §4c/§4d do out-briefing), então
--   a trava ficaria em produção por tempo indeterminado sem o front que a
--   justifica. Ela sai. Quando/se a v5.4.4 for retomada, volta junto com o
--   front — não antes.
--
-- LIÇÃO (para o out-briefing e para o harness): migration cuja CORREÇÃO depende
-- de front novo não é "aditiva" no sentido que importa. Ela é aditiva no schema
-- e **incompatível com o front vigente** — e o que manda é o front que está no
-- ar, não o da branch. Aplicar banco antes do merge só é seguro quando o
-- comportamento novo é invisível para o código já publicado.
--
-- O que a v5.4.4 deixou em produção e que NÃO é revertido aqui (inerte e
-- inofensivo, pronto se a versão for retomada):
--   • app.meta_subsetor / app.meta_subsetor_historico — tabelas VAZIAS, nenhum
--     consumidor no código publicado;
--   • metas_subsetor_listar / metas_subsetor_upsert / metas_sumario_subsetor —
--     RPCs sem call-site em produção;
--   • a chave `produtos_nao_classificados` no payload de
--     get_sumario_subsetor__nucleo — ADITIVA no payload; os 3 consumidores da
--     Performance fazem cast solto e ignoram chave desconhecida (conferido).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.metas_upsert(p_metas jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  item        jsonb;
  v_sid       bigint;
  v_ano       int;
  v_mes       int;
  v_valor     numeric;
  v_pct       numeric;
  v_old_valor numeric;
  v_old_pct   numeric;
  v_existe    boolean;
  v_uid       uuid;
  v_quem      text;
  v_n         int := 0;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['metas']);

  v_uid := nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid;
  IF v_uid IS NOT NULL THEN
    SELECT coalesce(u.nome, u.email) INTO v_quem FROM app.rbac_usuarios u WHERE u.user_id = v_uid;
  END IF;

  FOR item IN SELECT jsonb_array_elements(p_metas)
  LOOP
    v_sid   := (item->>'setor_macro_id')::bigint;
    v_ano   := (item->>'ano')::int;
    v_mes   := (item->>'mes')::int;
    v_valor := (item->>'valor_meta')::numeric;
    v_pct   := nullif(item->>'pct_receita', '')::numeric;

    IF NOT EXISTS (SELECT 1 FROM analytics.dim_setor_macro WHERE id = v_sid) THEN
      RAISE EXCEPTION 'METAS_SETOR_INVALIDO: setor % inexistente', v_sid USING ERRCODE = '22023';
    END IF;
    -- Guards de NULL preservados da 0234: sem o `IS NULL OR`, um item sem `ano`/`mes`
    -- escaparia da validação (NULL em comparação nunca é TRUE) e só quebraria no
    -- NOT NULL do INSERT, com erro cru que o front não traduz.
    IF v_ano IS NULL THEN
      RAISE EXCEPTION 'METAS_ANO_INVALIDO: ano ausente no item' USING ERRCODE = '22023';
    END IF;
    IF v_mes IS NULL OR v_mes < 1 OR v_mes > 12 THEN
      RAISE EXCEPTION 'METAS_MES_INVALIDO: %', v_mes USING ERRCODE = '22023';
    END IF;
    IF v_valor IS NULL OR v_valor < 0 THEN
      RAISE EXCEPTION 'METAS_VALOR_INVALIDO: %', v_valor USING ERRCODE = '22023';
    END IF;
    IF v_pct IS NOT NULL AND (v_pct < 0 OR v_pct > 100) THEN
      RAISE EXCEPTION 'METAS_PCT_INVALIDO: %', v_pct USING ERRCODE = '22023';
    END IF;

    SELECT valor_meta, pct_receita, true INTO v_old_valor, v_old_pct, v_existe
    FROM app.meta_setor WHERE setor_macro_id = v_sid AND ano = v_ano AND mes = v_mes;

    INSERT INTO app.meta_setor (setor_macro_id, ano, mes, valor_meta, pct_receita, fonte)
    VALUES (v_sid, v_ano, v_mes, v_valor, v_pct, 'real')
    ON CONFLICT (setor_macro_id, ano, mes) DO UPDATE
      SET valor_meta  = EXCLUDED.valor_meta,
          pct_receita = EXCLUDED.pct_receita,
          fonte       = 'real';

    IF NOT coalesce(v_existe, false)
       OR v_old_valor IS DISTINCT FROM v_valor
       OR v_old_pct   IS DISTINCT FROM v_pct THEN
      INSERT INTO app.meta_setor_historico
        (setor_macro_id, ano, mes, valor_meta, pct_receita, fonte,
         alterado_por, valor_anterior, pct_receita_anterior, motivo_alteracao)
      VALUES
        (v_sid, v_ano, v_mes, v_valor, v_pct, 'real',
         v_quem, v_old_valor, v_old_pct, NULL);
      v_n := v_n + 1;
    END IF;

    v_existe := NULL; v_old_valor := NULL; v_old_pct := NULL;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'gravadas', v_n);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.metas_upsert(jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.metas_upsert(jsonb) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
