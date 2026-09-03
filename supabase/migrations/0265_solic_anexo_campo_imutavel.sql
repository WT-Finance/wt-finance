-- ---------------------------------------------------------------------------
-- 0265 — feat(v5.9.1): o campo de anexo do TIPO vira registro imutável da abertura.
--
-- DECLARAÇÃO (regime ADITIVO): dois `CREATE OR REPLACE` que apenas ESTREITAM o que as
-- funções aceitam — nenhuma estrutura muda, nenhum dado é escrito ou apagado, assinaturas
-- e grants preservados. Estreitar não é destruir: o que já está gravado continua legível e
-- intacto; só deixam de ser aceitas operações NOVAS sobre anexo com `campo_id`.
--
-- DECISÃO DE PRODUTO (Yan, 02/09/2026, ao ver a tela em uso): com o bloco "Outros anexos"
-- disponível, o campo de anexo do tipo passa a ser **o registro do que foi submetido na
-- ABERTURA** — imutável depois. Tudo que chega em seguida vai para o bloco livre. Isso
-- desfaz de vez a ambiguidade dos dois lugares para anexar, que a v5.9.1 tinha atacado
-- apenas pelo rótulo ("Outros anexos").
--
-- O QUE MUDA:
--   • `solic_anexar` passa a aceitar SOMENTE anexo livre (`campo_id` nulo). A criação NÃO é
--     afetada — `criar_solicitacao` (0128) insere direto na tabela e não passa por aqui.
--   • `solic_anexo_excluir` passa a recusar anexo COM `campo_id`. O que veio na abertura não
--     se apaga.
--
-- O QUE SOME, E POR QUÊ ISSO É CORRETO: a regra do "último anexo de campo obrigatório"
-- (E4, da 0264) deixa de existir. Ela protegia o invariante "campo obrigatório não fica
-- vazio" durante exclusões — e sem exclusão em campo, não há o que proteger. A lógica que
-- lia a obrigatoriedade do snapshot sai junto, não porque estivesse errada (ela corrigiu um
-- fail-open real, com 9 de 68 anexos já órfãos), mas porque o caso que ela cobria deixou de
-- ser alcançável. O APRENDIZADO fica na skill `banco-e-rpc`, que é onde ele serve à próxima
-- validação; o código some porque código sem caso de uso é peso morto.
--
-- IMPACTO EM DADO EXISTENTE: nenhum. Medido antes de escrever — dos 72 anexos vivos, 68 têm
-- campo e **todos vieram da abertura** (zero anexados a um campo mais de 5 min depois da
-- criação da solicitação); 4 são livres. Ninguém perde acesso a nada, e nenhum anexo fica
-- num limbo "existe mas não dá para gerenciar" que não existisse já.
--
-- Base: corpos VIVOS do catálogo (`pg_get_functiondef`), não os arquivos da 0263/0264.
--
-- DOWN: `CREATE OR REPLACE` com os corpos da 0263 (`solic_anexar`) e 0264
-- (`solic_anexo_excluir`), que são as últimas a defini-las antes desta.
-- ---------------------------------------------------------------------------

-- ── 1. solic_anexar — pós-abertura, só anexo LIVRE ───────────────────────────
CREATE OR REPLACE FUNCTION public.solic_anexar(p_id bigint, p_anexos jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE
  v_sol    app.solicitacao;
  v_anexo  jsonb;
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
    -- v5.9.1/0265 — anexo pós-abertura é SEMPRE livre. O campo do tipo guarda o que foi
    -- submetido na criação e não recebe mais nada: um único lugar para anexar depois
    -- ("Outros anexos") elimina a dúvida de qual dos dois usar.
    -- A criação segue intacta — `criar_solicitacao` (0128) insere direto, sem passar aqui.
    IF nullif(v_anexo->>'campo_id','') IS NOT NULL THEN
      RAISE EXCEPTION 'ANEXO_SO_LIVRE: o campo de anexo do tipo guarda apenas o que veio na abertura' USING ERRCODE='22023'; END IF;

    IF coalesce(btrim(v_anexo->>'storage_path'), '') = ''
       OR coalesce(btrim(v_anexo->>'nome_arquivo'), '') = '' THEN
      RAISE EXCEPTION 'ANEXO_INVALIDO' USING ERRCODE='22023'; END IF;

    INSERT INTO app.solicitacao_anexo
      (solicitacao_id, campo_id, storage_path, nome_arquivo, mime, tamanho_bytes, criado_por)
    VALUES (p_id, NULL, v_anexo->>'storage_path', v_anexo->>'nome_arquivo',
            coalesce(v_anexo->>'mime','application/octet-stream'),
            coalesce((v_anexo->>'tamanho_bytes')::bigint, 0), app.uid_jwt());
    v_n := v_n + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'inseridos', v_n);
END; $function$;

-- ── 2. solic_anexo_excluir — só anexo LIVRE se apaga ─────────────────────────
CREATE OR REPLACE FUNCTION public.solic_anexo_excluir(p_anexo_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE
  v_anexo app.solicitacao_anexo;
  v_sol   app.solicitacao;
  v_path  text;
BEGIN
  PERFORM app.exigir_acesso();

  SELECT * INTO v_anexo FROM app.solicitacao_anexo WHERE id = p_anexo_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NAO_ENCONTRADA' USING ERRCODE='42501'; END IF;

  SELECT * INTO v_sol FROM app.solicitacao WHERE id = v_anexo.solicitacao_id;
  -- Mesma mensagem para "não existe" e "não pode ver": a resposta não revela a existência
  -- de anexo de solicitação alheia.
  IF NOT FOUND OR NOT app.pode_ver_solic(v_sol) THEN
    RAISE EXCEPTION 'NAO_ENCONTRADA' USING ERRCODE='42501'; END IF;

  -- v5.9.1/0265 — o que veio na ABERTURA não se apaga. Substitui a regra E4 (que bloqueava
  -- só o último anexo de campo obrigatório): agora o campo inteiro é imutável, então não há
  -- invariante de obrigatoriedade a proteger — a trava é anterior a ele.
  IF v_anexo.campo_id IS NOT NULL THEN
    RAISE EXCEPTION 'ANEXO_DA_ABERTURA: anexo enviado na abertura não pode ser excluído' USING ERRCODE='22023'; END IF;

  -- Solicitação ENCERRADA é imutável — invariante da v5.9.0, nos dois sentidos.
  IF v_sol.status NOT IN ('aberta','aprovada') THEN
    RAISE EXCEPTION 'TRANSICAO_ILEGAL: solicitação encerrada não aceita alteração de anexo' USING ERRCODE='22023'; END IF;

  -- E2 — só quem anexou. O `coalesce` NÃO é decorativo: `criado_por` é anulável, e
  -- `NULL` num `IF NOT (...)` não dispara o RAISE (`NOT NULL` = NULL, que não é true) —
  -- é exatamente o vazamento de permissão corrigido na 0129.
  IF NOT coalesce(v_anexo.criado_por = app.uid_jwt(), false) THEN
    RAISE EXCEPTION 'PERMISSAO_NEGADA: só quem anexou pode excluir o arquivo' USING ERRCODE='42501'; END IF;

  -- E3 — apaga o metadado e devolve o caminho: quem remove o BINÁRIO é a Server Action,
  -- que tem o service_role do Storage. Metadado primeiro: o inverso deixaria, em caso de
  -- falha no meio, um anexo LISTADO que não baixa — pior que um binário órfão invisível.
  DELETE FROM app.solicitacao_anexo WHERE id = p_anexo_id RETURNING storage_path INTO v_path;

  RETURN jsonb_build_object('ok', true, 'storage_path', v_path);
END; $function$;

NOTIFY pgrst, 'reload schema';
