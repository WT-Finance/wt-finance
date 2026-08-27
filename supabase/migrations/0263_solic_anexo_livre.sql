-- ---------------------------------------------------------------------------
-- 0263 — feat(v5.9.0): anexo LIVRE em solicitação — reverte a decisão D7.
--
-- DECLARAÇÃO (regime ADITIVO): esta migration é ADITIVA/retrocompatível com a main viva —
--   • um único `CREATE OR REPLACE` de `public.solic_anexar` que apenas AFROUXA uma
--     validação: `campo_id` nulo deixa de ser recusado e passa a significar "anexo geral";
--   • tudo que era aceito antes continua aceito, com o mesmo resultado (anexo COM campo
--     segue validado contra `tipo_campo='anexo'` daquele tipo — nada é relaxado ali);
--   • assinatura, `SECURITY DEFINER`, `search_path` e grants preservados (`CREATE OR
--     REPLACE` sem troca de assinatura mantém o ACL);
--   • NÃO escreve em dado pré-existente; nenhuma estrutura muda.
--
-- POR QUE A REVERSÃO: a v5.9.0 nasceu com a decisão D7 — "não existe anexo livre; todo
-- anexo pertence a um campo `tipo_campo='anexo'` daquele tipo". A consequência prática só
-- ficou visível depois de pronta: num tipo que NÃO tem campo de anexo configurado, quem
-- responde simplesmente não tem onde pôr o comprovante do pagamento efetuado — que é o
-- caso de uso que originou a versão inteira. Fazia o recurso depender de um passo de
-- cadastro que ninguém tinha motivo para adivinhar.
--
-- A ESTRUTURA SEMPRE PERMITIU. `app.solicitacao_anexo.campo_id` é anulável desde a 0127,
-- e o comentário lá diz textualmente "NULL = geral"; o drawer já EXIBE anexos sem campo
-- desde então. Quem fechou a porta foi a validação que a 0261 acrescentou — esta migration
-- só a reabre. Não há dado a migrar nem coluna a criar.
--
-- O QUE CONTINUA VALENDO (não foi relaxado):
--   • anexo COM `campo_id` ainda precisa apontar para um campo `tipo_campo='anexo'` DAQUELE
--     tipo — um id de outro tipo continua recusado com CAMPO_INVALIDO;
--   • solicitação encerrada continua imutável;
--   • só solicitante ou atendente anexam;
--   • `storage_path`/`nome_arquivo` continuam obrigatórios.
--
-- Base: corpo VIVO do catálogo (`pg_get_functiondef`), não o arquivo da 0261 — mesma regra
-- que esta versão aprendeu com `app.solic_json` (que divergia da 0130 desde a 0217).
--
-- DOWN: `CREATE OR REPLACE` restaurando o corpo da 0261 (com o RAISE
-- 'CAMPO_ANEXO_OBRIGATORIO'). ⚠️ Só seguro enquanto não existir anexo geral criado por
-- esta versão — o DOWN não apaga o que já entrou, apenas volta a recusar novos.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.solic_anexar(p_id bigint, p_anexos jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE
  v_sol    app.solicitacao;
  v_anexo  jsonb;
  v_campo  bigint;
  v_n      int := 0;
BEGIN
  PERFORM app.exigir_acesso();
  SELECT * INTO v_sol FROM app.solicitacao WHERE id = p_id;
  IF NOT FOUND OR NOT app.pode_ver_solic(v_sol) THEN
    RAISE EXCEPTION 'NAO_ENCONTRADA' USING ERRCODE='42501'; END IF;

  -- Solicitação ENCERRADA é imutável: nem anexo, nem transição.
  IF v_sol.status NOT IN ('aberta','aprovada') THEN
    RAISE EXCEPTION 'TRANSICAO_ILEGAL: solicitação encerrada não aceita anexo' USING ERRCODE='22023'; END IF;

  -- Os DOIS lados anexam (o solicitante complementa; o atendente devolve o comprovante).
  -- O coalesce abaixo é DEFENSIVO e redundante: `solicitante_id` é NOT NULL por schema.
  -- ⚠️ Ele NÃO é a proteção do caso ROLE — essa mora DENTRO de `app.sou_atendente`, que
  -- já faz coalesce interno em `destinatario_user_id` (NULL quando o destino é uma role;
  -- `NULL OR false` = NULL faria um `IF NOT (...)` não disparar, que foi o vazamento
  -- corrigido na 0129). Não remova o coalesce de `sou_atendente` achando que esta linha
  -- o substitui.
  IF NOT (coalesce(v_sol.solicitante_id = app.uid_jwt(), false) OR app.sou_atendente(v_sol)) THEN
    RAISE EXCEPTION 'PERMISSAO_NEGADA: só o solicitante ou o atendente pode anexar' USING ERRCODE='42501'; END IF;

  IF p_anexos IS NULL OR jsonb_typeof(p_anexos) <> 'array' OR jsonb_array_length(p_anexos) = 0 THEN
    RAISE EXCEPTION 'ANEXO_AUSENTE' USING ERRCODE='22023'; END IF;

  FOR v_anexo IN SELECT * FROM jsonb_array_elements(p_anexos) LOOP
    v_campo := nullif(v_anexo->>'campo_id','')::bigint;

    -- v5.9.0/0263 — ANEXO LIVRE (reverte D7): `campo_id` NULL é legítimo e significa
    -- "anexo geral", exatamente como a 0127 previu. Sem isto, um tipo sem campo de anexo
    -- configurado não tem onde receber o comprovante — o caso que originou a versão.
    -- Quando o campo VEM, ele continua sendo validado: precisa ser um campo de anexo
    -- DAQUELE tipo. Afrouxar o nulo não é afrouxar o resto.
    IF v_campo IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM app.solicitacao_campo c
       WHERE c.id = v_campo AND c.tipo_id = v_sol.tipo_id AND c.tipo_campo = 'anexo'
    ) THEN
      RAISE EXCEPTION 'CAMPO_INVALIDO: campo de anexo inexistente neste tipo' USING ERRCODE='22023'; END IF;

    IF coalesce(btrim(v_anexo->>'storage_path'), '') = ''
       OR coalesce(btrim(v_anexo->>'nome_arquivo'), '') = '' THEN
      RAISE EXCEPTION 'ANEXO_INVALIDO' USING ERRCODE='22023'; END IF;

    INSERT INTO app.solicitacao_anexo
      (solicitacao_id, campo_id, storage_path, nome_arquivo, mime, tamanho_bytes, criado_por)
    VALUES (p_id, v_campo, v_anexo->>'storage_path', v_anexo->>'nome_arquivo',
            coalesce(v_anexo->>'mime','application/octet-stream'),
            coalesce((v_anexo->>'tamanho_bytes')::bigint, 0), app.uid_jwt());
    v_n := v_n + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'inseridos', v_n);
END; $function$;

NOTIFY pgrst, 'reload schema';
