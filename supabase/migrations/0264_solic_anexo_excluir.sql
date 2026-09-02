-- ---------------------------------------------------------------------------
-- 0264 — feat(v5.9.1): excluir anexo (só quem anexou) + `sou_autor` no solic_json.
--
-- DECLARAÇÃO (regime ADITIVO): esta migration é ADITIVA/retrocompatível com a main viva —
--   • uma RPC NOVA (`solic_anexo_excluir`) — superfície inédita, nenhuma tela a consome
--     antes do merge;
--   • um `CREATE OR REPLACE` de `app.solic_json` que só ACRESCENTA uma chave por anexo
--     (`sou_autor`); nenhuma chave existente sai, nenhum tipo muda;
--   • NÃO escreve em dado pré-existente. O `DELETE` vive DENTRO do corpo da função e só
--     roda quando alguém a chama — a migration em si não apaga linha nenhuma.
--
-- ⚠️ SOBRE A CLASSIFICAÇÃO: `DELETE` dentro do corpo de um `CREATE FUNCTION` **não** torna
--    a migration destrutiva — o tokenizer do backup-gate excisa corpos `$$…$$` e casa só o
--    nível top-level (skill `banco-e-rpc` §1). Verificado com `classificarSql` numa sonda
--    equivalente antes de escrever este arquivo: `{"nivel":"aditiva","motivos":[]}`.
--    Reconferir na hora de aplicar; se vier `destrutiva`, é humano em TTY e não se contorna.
--
-- POR QUE: quem anexa o arquivo errado convive com ele para sempre. Num módulo onde o anexo
-- é comprovante de pagamento, arquivo errado não é detalhe cosmético.
--
-- AS QUATRO DECISÕES (fechadas com o Yan; ver briefing v5.9.1):
--   E2 — só **quem anexou** exclui. Não o atendente, não a gestão: quem subiu desfaz.
--   E3 — apaga de VEZ (metadado aqui; o binário do Storage, na Server Action).
--   E4 — **bloqueia** a exclusão do ÚLTIMO anexo de campo OBRIGATÓRIO. O fluxo do arquivo
--        trocado vira "anexa o certo → apaga o errado", que é a ordem natural de quem está
--        corrigindo um upload, e o campo obrigatório nunca fica vazio.
--
-- Nota sobre E4: a obrigatoriedade do campo é validada apenas na ABERTURA
-- (`criar_solicitacao`/0212) e nunca revalidada depois — é gate de ENTRADA, não invariante.
-- Excluir não violaria nada no banco; deixaria a solicitação num estado que não teria sido
-- aceito na abertura. E4 escolhe preservar o invariante mesmo sem o banco exigir.
--
-- Base do `CREATE OR REPLACE`: CATÁLOGO VIVO (`pg_get_functiondef`), não o arquivo da 0261.
-- Esta função já mordeu a v5.9.0 — divergia da 0130 desde a 0217 (chave `origem`), e
-- reescrevê-la pelo arquivo antigo a teria apagado em silêncio.
--
-- DOWN: `DROP FUNCTION public.solic_anexo_excluir(bigint)` e `CREATE OR REPLACE` de
-- `app.solic_json` sem a chave `sou_autor` (corpo anterior: o da **0261**, que é a última a
-- defini-la antes desta — a 0263 mexeu em `solic_anexar`, não nela).
-- ---------------------------------------------------------------------------

-- ── 1. solic_json: cada anexo passa a dizer se o CALLER foi quem o anexou ─────
-- Afordância de UI, no mesmo espírito de `sou_solicitante`/`sou_atendente` (0130): a tela
-- não precisa adivinhar quem pode excluir, e a autorização REAL continua na RPC abaixo.
-- Boolean estrito via coalesce — `criado_por` é anulável (anexo antigo pode não ter autor),
-- e um NULL vazando para o front viraria `undefined` numa comparação silenciosa.
CREATE OR REPLACE FUNCTION app.solic_json(p_sol app.solicitacao)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
  SELECT jsonb_build_object(
    'id', p_sol.id,
    'tipo_id', p_sol.tipo_id,
    'tipo_nome', (SELECT nome FROM app.solicitacao_tipo WHERE id = p_sol.tipo_id),
    'solicitante_email', (SELECT email FROM app.rbac_usuarios WHERE user_id = p_sol.solicitante_id),
    'destinatario', CASE
      WHEN p_sol.destinatario_user_id IS NOT NULL
        THEN jsonb_build_object('tipo','usuario','rotulo',(SELECT email FROM app.rbac_usuarios WHERE user_id = p_sol.destinatario_user_id))
      ELSE jsonb_build_object('tipo','role','rotulo',(SELECT nome FROM app.rbac_roles WHERE id = p_sol.destinatario_role_id))
    END,
    'data_limite', p_sol.data_limite,
    'descricao', p_sol.descricao,
    'status', p_sol.status,
    'respostas', p_sol.respostas,
    'decidido_em', p_sol.decidido_em,
    'decidido_por_email', (SELECT email FROM app.rbac_usuarios WHERE user_id = p_sol.decidido_por),
    'aprovado_em', p_sol.aprovado_em,
    'aprovado_por_email', (SELECT email FROM app.rbac_usuarios WHERE user_id = p_sol.aprovado_por),
    'justificativa', p_sol.justificativa,
    'criado_em', p_sol.criado_em,
    'sou_solicitante', coalesce(p_sol.solicitante_id = app.uid_jwt(), false),
    'sou_atendente', app.sou_atendente(p_sol),
    'origem', CASE
      WHEN p_sol.origem_chave_id IS NOT NULL
        THEN jsonb_build_object('plataforma', (SELECT plataforma FROM app.api_chave WHERE id = p_sol.origem_chave_id))
      ELSE NULL
    END,
    'anexos', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id',a.id,'campo_id',a.campo_id,'nome',a.nome_arquivo,'mime',a.mime,
               'tamanho',a.tamanho_bytes,
               'sou_autor', coalesce(a.criado_por = app.uid_jwt(), false)
             ) ORDER BY a.id)
      FROM app.solicitacao_anexo a WHERE a.solicitacao_id = p_sol.id), '[]'::jsonb)
  );
$function$;
REVOKE EXECUTE ON FUNCTION app.solic_json(app.solicitacao) FROM PUBLIC;

-- ── 2. solic_anexo_excluir — RPC NOVA ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.solic_anexo_excluir(p_anexo_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE
  v_anexo app.solicitacao_anexo;
  v_sol   app.solicitacao;
  v_path  text;
  v_obrig boolean;
  v_resto int;
BEGIN
  PERFORM app.exigir_acesso();

  SELECT * INTO v_anexo FROM app.solicitacao_anexo WHERE id = p_anexo_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NAO_ENCONTRADA' USING ERRCODE='42501'; END IF;

  SELECT * INTO v_sol FROM app.solicitacao WHERE id = v_anexo.solicitacao_id;
  -- Mesma mensagem para "não existe" e "não pode ver": a resposta não revela a existência
  -- de anexo de solicitação alheia.
  IF NOT FOUND OR NOT app.pode_ver_solic(v_sol) THEN
    RAISE EXCEPTION 'NAO_ENCONTRADA' USING ERRCODE='42501'; END IF;

  -- Solicitação ENCERRADA é imutável — invariante da v5.9.0. Vale para excluir também:
  -- o histórico de uma solicitação fechada não se reescreve.
  IF v_sol.status NOT IN ('aberta','aprovada') THEN
    RAISE EXCEPTION 'TRANSICAO_ILEGAL: solicitação encerrada não aceita alteração de anexo' USING ERRCODE='22023'; END IF;

  -- E2 — só quem anexou. O `coalesce` NÃO é decorativo: `criado_por` é anulável, e
  -- `NULL` num `IF NOT (...)` não dispara o RAISE (`NOT NULL` = NULL, que não é true) —
  -- é exatamente o vazamento de permissão corrigido na 0129. Sem ele, um anexo sem autor
  -- seria excluível por QUALQUER pessoa que enxergasse a solicitação.
  IF NOT coalesce(v_anexo.criado_por = app.uid_jwt(), false) THEN
    RAISE EXCEPTION 'PERMISSAO_NEGADA: só quem anexou pode excluir o arquivo' USING ERRCODE='42501'; END IF;

  -- E4 — não esvaziar campo OBRIGATÓRIO. Só se aplica a anexo COM campo: anexo livre
  -- (campo_id nulo) não tem obrigatoriedade a preservar.
  IF v_anexo.campo_id IS NOT NULL THEN
    -- A obrigatoriedade vem do SNAPSHOT de respostas da própria solicitação, NÃO de
    -- `app.solicitacao_campo`. Isso não é preciosismo — a leitura pela tabela viva seria
    -- FAIL-OPEN, e o caso já existe em produção:
    --
    --   • `solicitacao_anexo.campo_id` é referência LÓGICA, sem FK (0127);
    --   • `admin_solic_salvar_tipo` (0216) faz DELETE + re-INSERT de TODOS os campos a cada
    --     edição do tipo, e nada impede editar um tipo com solicitações abertas;
    --   • como o id é IDENTITY (nunca reusado), todo `campo_id` já gravado vira órfão.
    --
    -- Medido ao escrever esta migration: 9 dos 68 anexos com campo já estão nesse estado —
    -- e o snapshot deles diz `obrigatorio: true`. Consultar a tabela viva devolveria NOT
    -- FOUND, o `coalesce(..., false)` leria isso como "não é obrigatório" e a trava se
    -- abriria justamente onde deveria fechar (mesma classe do `CASE` sem `ELSE false`).
    --
    -- O snapshot é IMUTÁVEL por desenho (ADR-0112: "legíveis mesmo após editar/arquivar o
    -- tipo") e é a MESMA fonte que a UI usa para decidir o que mostrar — então tela e banco
    -- concordam por construção, em vez de por coincidência. (Achado ALTO do revisor-db.)
    SELECT (r->>'obrigatorio')::boolean INTO v_obrig
      FROM jsonb_array_elements(v_sol.respostas) r
     WHERE (r->>'campo_id')::bigint = v_anexo.campo_id
       AND r->>'tipo_campo' = 'anexo'
     LIMIT 1;

    -- FAIL-CLOSED: `NULL` aqui significa "nem o snapshot conhece este campo" — estado que
    -- só surge com dado inconsistente, e no qual o anexo sequer é renderizado pela tela
    -- (o drawer casa anexo × campo pelo snapshot). Sob ambiguidade, travar.
    IF v_obrig IS NULL OR v_obrig THEN
      SELECT count(*) INTO v_resto
        FROM app.solicitacao_anexo a
       WHERE a.solicitacao_id = v_anexo.solicitacao_id
         AND a.campo_id = v_anexo.campo_id
         AND a.id <> p_anexo_id;
      IF v_resto = 0 THEN
        RAISE EXCEPTION 'ANEXO_OBRIGATORIO_UNICO: anexe o substituto antes de excluir este' USING ERRCODE='22023';
      END IF;
    END IF;
  END IF;

  -- E3 — apaga o metadado e devolve o caminho: quem remove o BINÁRIO é a Server Action,
  -- que tem o service_role do Storage. A ordem é deliberada — metadado primeiro. O inverso
  -- deixaria, em caso de falha no meio, um anexo LISTADO que não baixa, que é pior do que
  -- um binário órfão invisível.
  DELETE FROM app.solicitacao_anexo WHERE id = p_anexo_id RETURNING storage_path INTO v_path;

  RETURN jsonb_build_object('ok', true, 'storage_path', v_path);
END; $function$;

-- ── 3. Grants explícitos ─────────────────────────────────────────────────────
-- Nunca contar com o default do Supabase, que concede EXECUTE a anon/authenticated em
-- função nova mesmo com REVOKE FROM PUBLIC (§4 da skill `banco-e-rpc`).
REVOKE EXECUTE ON FUNCTION public.solic_anexo_excluir(bigint) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.solic_anexo_excluir(bigint) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
