-- ---------------------------------------------------------------------------
-- 0307 — feat(v6.5.2): coluna CONTRATO no Cadastro de Clientes Corporativos + situação "eventual".
--
-- Classificação: ADITIVA (1 ALTER TABLE … ADD COLUMN anulável com CHECK próprio + 2 COMMENT ON COLUMN +
-- 3 CREATE OR REPLACE FUNCTION com a MESMA assinatura e o MESMO `RETURNS jsonb` + guard de efetividade).
-- Nenhum DROP/TRUNCATE/UPDATE/DELETE top-level; o `DELETE … WHERE origem='planilha'` que aparece é o
-- CORPO de importar_clientes_corp (comportamento de runtime, idêntico ao vivo — o classificador ignora
-- corpos $$). Nenhum GRANT/REVOKE (CREATE OR REPLACE com a mesma assinatura preserva as ACLs; o guard
-- no fim PROVA isso). Nenhum dado escrito: a coluna nasce NULL em todas as 249 linhas.
--
-- DECLARAÇÃO PRÉVIA (regime aditivo / autônomo):
--   • O QUE FAZ —
--       (1) `app.cliente_corporativo.contrato text NULL CHECK (contrato IN ('sim','nao'))` — a coluna
--           CONTRATO da planilha oficial ("Faturamento Clientes - Corporativo.xlsx": Sim/Não). O front
--           normaliza na entrada (`normalizarContrato`, src/lib/faturamento/situacao-cliente.ts).
--       (2) importar_clientes_corp / inserir_cliente_corp passam a gravar `contrato`;
--           atualizar_cliente_corp aceita o campo 'contrato' na lista permitida (mesmo molde dos outros).
--       (3) COMMENT documenta `situacao` = 'ativo' | 'eventual' | 'inativo' (texto livre no banco, sem
--           CHECK — como desde a 0164; o canônico é do front, `normalizarSituacaoCliente`).
--     listar_clientes_corp e buscar_cliente_corporativo NÃO mudam: devolvem `to_jsonb(c)` (a linha
--     inteira menos timestamps) e passam a incluir `contrato` sozinhas.
--   • POR QUÊ (pedido do Yan, 10/11/2026) — a planilha ganhou a coluna CONTRATO e a situação EVENTUAL
--     (28 clientes sem contrato que faturam de vez em quando). Antes desta versão o import descartava
--     o CONTRATO e gravava EVENTUAL como NULL — e NULL é tratado como inativo no envio de e-mail.
--   • SEGURA PARA O FRONT NO AR (v6.5.0/v6.5.1) — chave nova no jsonb de leitura é ignorada pelo
--     front antigo (o tipo ClienteCorp não valida chave extra); o import antigo não manda `contrato`
--     → NULL. ORDEM OBRIGATÓRIA: aplicar ESTA migration ANTES do merge/deploy da v6.5.2 — o front novo
--     chama atualizar_cliente_corp(p_campo='contrato'), que a função viva de hoje RECUSA.
--   • PADRÃO INLINE (skill banco-e-rpc §4): `PERFORM app.exigir_acesso(ARRAY['financeiro/faturamento-corp'])`
--     como primeira instrução, SECURITY DEFINER, search_path vazio, nomes qualificados — inalterados.
--   • ESCRITA A PARTIR DO CATÁLOGO VIVO (skill banco-e-rpc §5): os 3 corpos foram transcritos de
--     pg_get_functiondef do banco em 10/11/2026 (pós-0306) e só então alterados nos pontos de `contrato`.
--   • REVERSÃO (DOWN) — tirar `contrato` do front primeiro; depois restaurar os 3 corpos pela 0164 (as
--     definições anteriores mais altas: nenhuma migration entre 0164 e 0306 os redefiniu) e, DESTRUTIVA
--     (humano em TTY), `ALTER TABLE app.cliente_corporativo DROP COLUMN contrato`.
--   • DADO — esta migration não corrige os 28 clientes EVENTUAL hoje gravados com situação NULL nem
--     preenche `contrato`: isso vem do RE-IMPORT da planilha oficial pela tela, depois do deploy.
-- ---------------------------------------------------------------------------

BEGIN;

-- (1) Coluna nova, anulável, com CHECK nomeado (canônico do front: 'sim' | 'nao').
ALTER TABLE app.cliente_corporativo
  ADD COLUMN IF NOT EXISTS contrato text
  CONSTRAINT cliente_corporativo_contrato_check CHECK (contrato IN ('sim', 'nao'));

COMMENT ON COLUMN app.cliente_corporativo.contrato IS
  'Cliente tem contrato? ''sim'' | ''nao'' | NULL (não informado). Coluna CONTRATO da planilha oficial; '
  'referência (Visão A) — não muda emissão nem envio. v6.5.2 / 0307.';

COMMENT ON COLUMN app.cliente_corporativo.situacao IS
  '''ativo'' | ''eventual'' | ''inativo'' (canônico normalizado no front, sem CHECK). ''eventual'' = sem '
  'contrato, fatura de vez em quando; ativo e eventual recebem a fatura por e-mail (situacaoEnviavel). v6.5.2.';

-- (2a) inserir — + contrato
CREATE OR REPLACE FUNCTION public.inserir_cliente_corp(p_dados jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_id bigint; v_empresa text;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/faturamento-corp']);
  v_empresa := btrim(p_dados->>'empresa');
  IF v_empresa IS NULL OR v_empresa = '' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'empresa_obrigatoria');
  END IF;
  IF EXISTS (SELECT 1 FROM app.cliente_corporativo WHERE app.norm_nome(empresa) = app.norm_nome(v_empresa)) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'duplicado');
  END IF;

  INSERT INTO app.cliente_corporativo (
    empresa, situacao, faturar_em, vencimento, obs, pct_juros, pct_multa,
    destinatarios, forma_pgto, contato_whats, contrato, origem
  ) VALUES (
    v_empresa,
    NULLIF(p_dados->>'situacao',''), NULLIF(p_dados->>'faturar_em',''), NULLIF(p_dados->>'vencimento',''),
    NULLIF(p_dados->>'obs',''), NULLIF(p_dados->>'pct_juros',''), NULLIF(p_dados->>'pct_multa',''),
    NULLIF(p_dados->>'destinatarios',''), NULLIF(p_dados->>'forma_pgto',''), NULLIF(p_dados->>'contato_whats',''),
    NULLIF(p_dados->>'contrato',''),
    'manual'
  )
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$function$;

-- (2b) atualizar — 'contrato' na lista permitida + CASE próprio
CREATE OR REPLACE FUNCTION public.atualizar_cliente_corp(p_id bigint, p_campo text, p_valor text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_val text;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/faturamento-corp']);
  IF p_campo NOT IN ('empresa','situacao','faturar_em','vencimento','obs','pct_juros','pct_multa','destinatarios','forma_pgto','contato_whats','contrato') THEN
    RAISE EXCEPTION 'campo não permitido: %', p_campo;
  END IF;
  v_val := NULLIF(p_valor, '');

  IF p_campo = 'empresa' THEN
    v_val := btrim(p_valor);
    IF v_val IS NULL OR v_val = '' THEN RETURN jsonb_build_object('ok', false, 'motivo', 'empresa_obrigatoria'); END IF;
    IF EXISTS (SELECT 1 FROM app.cliente_corporativo WHERE app.norm_nome(empresa) = app.norm_nome(v_val) AND id <> p_id) THEN
      RETURN jsonb_build_object('ok', false, 'motivo', 'duplicado');
    END IF;
  END IF;

  UPDATE app.cliente_corporativo SET
    empresa       = CASE WHEN p_campo = 'empresa'       THEN v_val ELSE empresa END,
    situacao      = CASE WHEN p_campo = 'situacao'      THEN v_val ELSE situacao END,
    faturar_em    = CASE WHEN p_campo = 'faturar_em'    THEN v_val ELSE faturar_em END,
    vencimento    = CASE WHEN p_campo = 'vencimento'    THEN v_val ELSE vencimento END,
    obs           = CASE WHEN p_campo = 'obs'           THEN v_val ELSE obs END,
    pct_juros     = CASE WHEN p_campo = 'pct_juros'     THEN v_val ELSE pct_juros END,
    pct_multa     = CASE WHEN p_campo = 'pct_multa'     THEN v_val ELSE pct_multa END,
    destinatarios = CASE WHEN p_campo = 'destinatarios' THEN v_val ELSE destinatarios END,
    forma_pgto    = CASE WHEN p_campo = 'forma_pgto'    THEN v_val ELSE forma_pgto END,
    contato_whats = CASE WHEN p_campo = 'contato_whats' THEN v_val ELSE contato_whats END,
    contrato      = CASE WHEN p_campo = 'contrato'      THEN v_val ELSE contrato END,
    atualizado_em = now()
  WHERE id = p_id;
  RETURN jsonb_build_object('ok', true);
END;
$function$;

-- (2c) importar — + contrato (resto byte-idêntico ao vivo)
CREATE OR REPLACE FUNCTION public.importar_clientes_corp(p_linhas jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_item jsonb;
  v_empresa text;
  v_norm text;
  v_inseridos int := 0;
  v_colisoes text[] := ARRAY[]::text[];   -- colidem com um cadastro MANUAL existente
  v_duplicadas text[] := ARRAY[]::text[]; -- nome repetido DENTRO da própria planilha
  v_vistos text[] := ARRAY[]::text[];     -- normalizados já inseridos neste lote
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/faturamento-corp']);

  -- substitui só a fatia da planilha; manuais permanecem intactos
  DELETE FROM app.cliente_corporativo WHERE origem = 'planilha';

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_linhas) LOOP
    v_empresa := btrim(v_item->>'empresa');
    CONTINUE WHEN v_empresa IS NULL OR v_empresa = '';   -- sem chave, ignora
    v_norm := app.norm_nome(v_empresa);

    IF v_norm = ANY (v_vistos) THEN
      v_duplicadas := v_duplicadas || v_empresa;         -- repetido na planilha
      CONTINUE;
    END IF;
    IF EXISTS (SELECT 1 FROM app.cliente_corporativo WHERE app.norm_nome(empresa) = v_norm AND origem = 'manual') THEN
      v_colisoes := v_colisoes || v_empresa;             -- já existe como manual → não sobrescreve
      CONTINUE;
    END IF;

    INSERT INTO app.cliente_corporativo (
      empresa, situacao, faturar_em, vencimento, obs, pct_juros, pct_multa,
      destinatarios, forma_pgto, contato_whats, contrato, origem, carregado_em
    ) VALUES (
      v_empresa,
      NULLIF(v_item->>'situacao',''), NULLIF(v_item->>'faturar_em',''), NULLIF(v_item->>'vencimento',''),
      NULLIF(v_item->>'obs',''), NULLIF(v_item->>'pct_juros',''), NULLIF(v_item->>'pct_multa',''),
      NULLIF(v_item->>'destinatarios',''), NULLIF(v_item->>'forma_pgto',''), NULLIF(v_item->>'contato_whats',''),
      NULLIF(v_item->>'contrato',''),
      'planilha', now()
    );
    v_vistos := v_vistos || v_norm;
    v_inseridos := v_inseridos + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'inseridos', v_inseridos,
    'colisoes_manual', to_jsonb(v_colisoes),
    'duplicadas_planilha', to_jsonb(v_duplicadas)
  );
END;
$function$;

-- (3) Guard de efetividade — falha a transação inteira se algo não ficou como declarado.
DO $$
DECLARE
  v_sig  text;
  v_proc regprocedure;
  v_src  text;
BEGIN
  -- Coluna existe, é text e anulável; o CHECK nomeado está lá; nenhuma linha foi escrita.
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'app' AND table_name = 'cliente_corporativo'
                    AND column_name = 'contrato' AND data_type = 'text' AND is_nullable = 'YES') THEN
    RAISE EXCEPTION '0307: coluna app.cliente_corporativo.contrato ausente ou com tipo/nulidade errados';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cliente_corporativo_contrato_check'
                    AND conrelid = 'app.cliente_corporativo'::regclass) THEN
    RAISE EXCEPTION '0307: CHECK cliente_corporativo_contrato_check ausente';
  END IF;
  IF EXISTS (SELECT 1 FROM app.cliente_corporativo WHERE contrato IS NOT NULL) THEN
    RAISE EXCEPTION '0307: a migration não deveria escrever dado (contrato nasce NULL)';
  END IF;

  FOREACH v_sig IN ARRAY ARRAY[
    'public.inserir_cliente_corp(jsonb)',
    'public.atualizar_cliente_corp(bigint, text, text)',
    'public.importar_clientes_corp(jsonb)'
  ] LOOP
    v_proc := to_regprocedure(v_sig);
    IF v_proc IS NULL THEN RAISE EXCEPTION '0307: % não existe', v_sig; END IF;
    v_src := pg_get_functiondef(v_proc);

    IF position('contrato' IN v_src) = 0 THEN
      RAISE EXCEPTION '0307: corpo de % não grava contrato', v_sig;
    END IF;
    IF position('app.exigir_acesso(ARRAY[''financeiro/faturamento-corp''])' IN v_src) = 0 THEN
      RAISE EXCEPTION '0307: % perdeu o exigir_acesso inline', v_sig;
    END IF;
    IF position('SECURITY DEFINER' IN v_src) = 0 THEN
      RAISE EXCEPTION '0307: % deixou de ser SECURITY DEFINER', v_sig;
    END IF;

    -- Grants: o CREATE OR REPLACE com a mesma assinatura os preserva (nenhum GRANT/REVOKE aqui).
    IF has_function_privilege('anon', v_proc, 'EXECUTE') THEN
      RAISE EXCEPTION '0307: anon ganhou EXECUTE em %', v_sig;
    END IF;
    IF NOT has_function_privilege('authenticated', v_proc, 'EXECUTE') THEN
      RAISE EXCEPTION '0307: authenticated perdeu EXECUTE em %', v_sig;
    END IF;
    IF NOT has_function_privilege('service_role', v_proc, 'EXECUTE') THEN
      RAISE EXCEPTION '0307: service_role perdeu EXECUTE em %', v_sig;
    END IF;
  END LOOP;

  -- O import continua preservando os manuais (só a fatia 'planilha' é substituída).
  IF position('WHERE origem = ''planilha''' IN pg_get_functiondef('public.importar_clientes_corp(jsonb)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION '0307: importar_clientes_corp deixou de restringir o DELETE à fatia planilha';
  END IF;

  -- Nenhuma sobrecarga criada por engano (uma só assinatura por nome).
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname IN ('inserir_cliente_corp','atualizar_cliente_corp','importar_clientes_corp')) <> 3 THEN
    RAISE EXCEPTION '0307: sobrecarga criada por engano';
  END IF;
END
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
