-- ---------------------------------------------------------------------------
-- 0261 — feat(v5.9.0): Solicitações — etapa "Aprovada" e anexo ao longo da vida.
--
-- DECLARAÇÃO (regime ADITIVO): esta migration é ADITIVA/retrocompatível com a main viva —
--   • duas colunas NOVAS e ANULÁVEIS (`aprovado_por`, `aprovado_em`): nenhuma linha
--     existente muda de valor, nenhum default é aplicado a dado já gravado;
--   • uma CONSTRAINT NOVA (`solicitacao_aprovada_registrada`) que só pode reprovar linhas
--     com `status='aprovada'` — status que HOJE o CHECK vivo nem aceita, logo zero linhas
--     existentes a violam (a validação do ADD CONSTRAINT passa por construção);
--   • duas RPCs NOVAS (`solic_aprovar`, `solic_anexar`) — superfície inédita, nenhuma tela
--     as consome ainda;
--   • sete `CREATE OR REPLACE` que apenas AMPLIAM o conjunto de estados aceitos
--     (`= 'aberta'` → `IN ('aberta','aprovada')`) ou ACRESCENTAM chaves/ramos ao retorno.
--     Quem passava continua passando; nenhum acesso é removido; nenhuma assinatura muda
--     (o ACL é preservado pelo REPLACE);
--   • NÃO escreve em dado pré-existente (nenhum UPDATE/DELETE de linha viva).
--
-- 📌 NUMERAÇÃO — histórico desta migration (vale como precedente, ver §Aprendizado do
--    out-briefing). Ela nasceu `0256`, virou `0258` e agora é `0261`:
--      • `0256` colidia de frente com a v5.8.0 (DRE competência), em implementação
--        PARALELA — achado CRÍTICO do `revisor-db`, invisível de dentro de uma worktree só;
--      • `0258` era livre, mas a v5.8.0 mergeou usando `0255`-`0257` **e `0260`**, deixando
--        a `0258` ATRÁS da última aplicada. Aplicá-la exigiria `--fora-de-ordem`, que é
--        justamente o que a ordem acordada com o Yan (25/08: "a v5.8 aplica primeiro")
--        existia para evitar;
--      • `0261` é a próxima em ordem natural depois da `0260`. Nada havia sido aplicado,
--        então renumerar saiu de graça.
--    ⚠️ RECONFERIR O NÚMERO LIVRE IMEDIATAMENTE ANTES DE APLICAR — nas DUAS árvores
--    (`ls supabase/migrations/ | tail -3` aqui e em cada `.claude/worktrees/*/`) e no banco
--    (`npx supabase migration list`). O CLI casa pelo PREFIXO numérico: número repetido faz
--    a segunda a aplicar ser tratada como "já aplicada" e **pulada em silêncio**, sem erro.
--
-- ⚠️ ESTA MIGRATION NÃO BASTA SOZINHA. O CHECK `solicitacao_status_check` vivo ainda não
--    aceita 'aprovada', então `solic_aprovar` só passa a funcionar depois da migration
--    DESTRUTIVA que relaxa os dois CHECKs (`supabase/patches/0262_*.sql`, aplicada por
--    humano em TTY). A ordem é deliberada e segue a §9 da skill `banco-e-rpc`: primeiro
--    a superfície NOVA (risco zero — ninguém consome), depois o passo que exige humano.
--
-- Por quê: autorizar e executar eram um ato só. Num pedido de pagamento os dois momentos
-- são distintos (aprovo hoje, pago amanhã) e não havia como registrar o meio do caminho.
-- E só se anexava arquivo na ABERTURA — quem responde não tinha por onde devolver o
-- comprovante do pagamento efetuado a quem abriu o pedido.
--
-- POR QUE `aprovado_por`/`aprovado_em` SÃO COLUNAS, E NÃO ESTADO DERIVADO — o ponto
-- estrutural desta versão: `solic_movimentacoes` NÃO é um log de eventos, é uma PROJEÇÃO
-- do estado atual (deriva a ação de `CASE s.status WHEN 'concluida' THEN 'Conclusão'…`).
-- Se 'aprovada' fosse apenas uma passagem de `status`, no instante em que a solicitação
-- virasse 'concluida' a aprovação DESAPARECERIA do histórico — sem registro de que houve
-- aprovação, de quem aprovou, de quando. O presente reescreveria o passado. Com as duas
-- colunas, o terceiro ramo do UNION abaixo sobrevive a qualquer estado final.
--
-- Os corpos dos `CREATE OR REPLACE` foram extraídos do CATÁLOGO VIVO (pg_get_functiondef),
-- não das migrations de origem. Isso não é preciosismo: `app.solic_json` viva já divergia
-- da 0130 — ganhou o campo `origem` (plataforma da API externa) numa versão posterior, e
-- reescrevê-la a partir do arquivo antigo teria APAGADO em silêncio o selo "aberta via API
-- externa" que o board exibe.
--
-- DOWN: as colunas e a constraint saem por DROP (destrutivo, humano); as sete funções
-- voltam por `CREATE OR REPLACE` com os corpos anteriores. Fonte de cada corpo ANTERIOR
-- (a ÚLTIMA definição de cada uma, não a de origem):
--   app.solic_json ............... 0217 (é ela que introduziu `origem`; a 0130 NÃO tem)
--   solic_concluir ............... 0225
--   solic_rejeitar ............... 0222 (definida em 0128, redefinida em 0213 e 0222)
--   solic_cancelar ............... 0222
--   solic_movimentacoes .......... 0142
--   solic_minhas_pendencias ...... 0133
--   cancelar_solicitacao_externa . 0222
-- ⚠️ Reverter `app.solic_json` pela 0130 APAGARIA a chave `origem` — o mesmo erro que o
-- parágrafo acima evitou na ida. Achado ALTO do revisor-db nesta versão: a nota de DOWN
-- citava 0130 e teria induzido exatamente essa perda.
-- ---------------------------------------------------------------------------

-- ── 1. Colunas da aprovação (anuláveis; nenhuma linha existente é tocada) ─────
ALTER TABLE app.solicitacao
  ADD COLUMN IF NOT EXISTS aprovado_por uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS aprovado_em  timestamptz;

COMMENT ON COLUMN app.solicitacao.aprovado_por IS
  'Quem aprovou (etapa intermediária OPCIONAL). Independente de decidido_por, que é da '
  'decisão TERMINAL — uma solicitação concluída que passou por aprovação tem os dois.';
COMMENT ON COLUMN app.solicitacao.aprovado_em IS
  'Quando foi aprovada. Sobrevive à conclusão: é o que sustenta a linha "Aprovação" no '
  'histórico depois que o status já mudou.';

-- Aprovada sem registro de quem/quando é estado inconsistente. Zero linhas existentes
-- violam: o CHECK vivo de status ainda nem aceita 'aprovada'.
ALTER TABLE app.solicitacao
  ADD CONSTRAINT solicitacao_aprovada_registrada CHECK (
    status <> 'aprovada' OR (aprovado_por IS NOT NULL AND aprovado_em IS NOT NULL)
  );

-- ── 2. app.solic_json — expõe a aprovação em TODAS as leituras de uma vez ─────
-- Ponto único: solic_minhas, solic_caixa e solic_detalhe passam por aqui.
-- Base: corpo VIVO do catálogo (inclui `origem`, ausente na 0130) + 2 chaves novas.
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
      SELECT jsonb_agg(jsonb_build_object('id',a.id,'campo_id',a.campo_id,'nome',a.nome_arquivo,'mime',a.mime,'tamanho',a.tamanho_bytes) ORDER BY a.id)
      FROM app.solicitacao_anexo a WHERE a.solicitacao_id = p_sol.id), '[]'::jsonb)
  );
$function$;
REVOKE EXECUTE ON FUNCTION app.solic_json(app.solicitacao) FROM PUBLIC;

-- ── 3. solic_aprovar — RPC NOVA (etapa intermediária opcional) ────────────────
-- Só o ATENDENTE aprova. `solic_concluir` admite também o solicitante (fechar o próprio
-- pedido é legítimo), mas APROVAR o próprio pedido não é — aprovação é ato de quem recebe.
-- Espelha a regra de `solic_rejeitar`, que já é atendente-only.
CREATE OR REPLACE FUNCTION public.solic_aprovar(p_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE
  v_sol app.solicitacao;
  v_em  timestamptz;
BEGIN
  PERFORM app.exigir_acesso();
  SELECT * INTO v_sol FROM app.solicitacao WHERE id = p_id;
  IF NOT FOUND OR NOT app.pode_ver_solic(v_sol) THEN
    RAISE EXCEPTION 'NAO_ENCONTRADA' USING ERRCODE='42501'; END IF;
  -- Só de 'aberta': aprovar o que já está aprovado/encerrado é transição ilegal.
  IF v_sol.status <> 'aberta' THEN
    RAISE EXCEPTION 'TRANSICAO_ILEGAL: solicitação não está aberta' USING ERRCODE='22023'; END IF;
  IF NOT app.sou_atendente(v_sol) THEN
    RAISE EXCEPTION 'PERMISSAO_NEGADA: só o atendente pode aprovar' USING ERRCODE='42501'; END IF;

  -- NÃO toca decidido_por/decidido_em: esses pertencem à decisão TERMINAL. É essa
  -- separação que permite a uma solicitação concluída exibir Abertura + Aprovação +
  -- Conclusão, com atores e instantes distintos.
  UPDATE app.solicitacao
     SET status = 'aprovada', aprovado_por = app.uid_jwt(), aprovado_em = now()
   WHERE id = p_id
  RETURNING aprovado_em INTO v_em;

  -- Devolve o instante gravado: o e-mail de notificação precisa dele e NÃO pode buscá-lo
  -- em `solic_emails_envolvidos`, que só conhece `decidido_em` — nulo aqui justamente
  -- porque aprovar não é decidir. Sem isto o e-mail de aprovação sai sem data e sem erro
  -- nenhum (o template trata `quando` ausente como string vazia). Achado ALTO do revisor.
  RETURN jsonb_build_object('ok', true, 'aprovado_em', v_em);
END; $function$;

-- ── 4. solic_anexar — RPC NOVA (anexo depois da abertura, pelos dois lados) ───
-- p_anexos: array [{campo_id, storage_path, nome_arquivo, mime, tamanho_bytes}] — mesmo
-- formato que `abrir_solicitacao` já usa, para o front reaproveitar o `uploadAnexo`.
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
  -- o substitui. (Achado MÉDIO do revisor-db nesta versão: o comentário anterior aqui
  -- creditava a defesa à coluna errada.)
  IF NOT (coalesce(v_sol.solicitante_id = app.uid_jwt(), false) OR app.sou_atendente(v_sol)) THEN
    RAISE EXCEPTION 'PERMISSAO_NEGADA: só o solicitante ou o atendente pode anexar' USING ERRCODE='42501'; END IF;

  IF p_anexos IS NULL OR jsonb_typeof(p_anexos) <> 'array' OR jsonb_array_length(p_anexos) = 0 THEN
    RAISE EXCEPTION 'ANEXO_AUSENTE' USING ERRCODE='22023'; END IF;

  FOR v_anexo IN SELECT * FROM jsonb_array_elements(p_anexos) LOOP
    v_campo := nullif(v_anexo->>'campo_id','')::bigint;

    -- Decisão de produto (D7): NÃO existe anexo livre. Todo anexo pertence a um campo
    -- `tipo_campo='anexo'` DAQUELE tipo — campo_id nulo ou de outro tipo é recusado.
    -- (Anexos gerais legados, com campo_id NULL, seguem legíveis; só não se criam novos.)
    IF v_campo IS NULL THEN
      RAISE EXCEPTION 'CAMPO_ANEXO_OBRIGATORIO' USING ERRCODE='22023'; END IF;
    IF NOT EXISTS (
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

-- ── 5. Transições: aceitar 'aprovada' como ORIGEM ────────────────────────────
-- Base: corpos vivos do catálogo. Duas diferenças, ambas deliberadas:
--   (a) a trava de estado (`= 'aberta'` → `NOT IN ('aberta','aprovada')`) e a mensagem
--       de erro que a acompanha ("já encerrada" em vez de "não está mais aberta");
--   (b) `coalesce(..., false)` acrescentado nas comparações de `solicitante_id` —
--       defensivo (a coluna é NOT NULL), na direção da convenção da skill.
-- Nada mais do corpo muda. (Achado BAIXO do revisor-db: o comentário anterior dizia
-- "corpos idênticos", o que escondia (b).)

CREATE OR REPLACE FUNCTION public.solic_concluir(p_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE
  v_sol app.solicitacao;
BEGIN
  PERFORM app.exigir_acesso();
  SELECT * INTO v_sol FROM app.solicitacao WHERE id = p_id;
  IF NOT FOUND OR NOT app.pode_ver_solic(v_sol) THEN RAISE EXCEPTION 'NAO_ENCONTRADA' USING ERRCODE='42501'; END IF;
  IF v_sol.status NOT IN ('aberta','aprovada') THEN RAISE EXCEPTION 'TRANSICAO_ILEGAL: solicitação já encerrada' USING ERRCODE='22023'; END IF;
  IF NOT (app.sou_atendente(v_sol) OR coalesce(v_sol.solicitante_id = app.uid_jwt(), false)) THEN
    RAISE EXCEPTION 'PERMISSAO_NEGADA: só o atendente ou o solicitante pode concluir' USING ERRCODE='42501'; END IF;

  UPDATE app.solicitacao SET status='concluida', decidido_por=app.uid_jwt(), decidido_em=now() WHERE id=p_id;

  -- Só move o estado. Não notifica ninguém: o Round5 removeu os callbacks de saída
  -- (ADR-0161 superado) — quem quer saber do desfecho CONSULTA a API.

  RETURN jsonb_build_object('ok', true);
END; $function$;

CREATE OR REPLACE FUNCTION public.solic_rejeitar(p_id bigint, p_justificativa text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE v_sol app.solicitacao;
BEGIN
  PERFORM app.exigir_acesso();
  SELECT * INTO v_sol FROM app.solicitacao WHERE id = p_id;
  IF NOT FOUND OR NOT app.pode_ver_solic(v_sol) THEN RAISE EXCEPTION 'NAO_ENCONTRADA' USING ERRCODE='42501'; END IF;
  IF v_sol.status NOT IN ('aberta','aprovada') THEN RAISE EXCEPTION 'TRANSICAO_ILEGAL: solicitação já encerrada' USING ERRCODE='22023'; END IF;
  IF NOT app.sou_atendente(v_sol) THEN
    RAISE EXCEPTION 'PERMISSAO_NEGADA: só o atendente pode rejeitar' USING ERRCODE='42501'; END IF;
  IF p_justificativa IS NULL OR length(btrim(p_justificativa)) = 0 THEN
    RAISE EXCEPTION 'JUSTIFICATIVA_OBRIGATORIA' USING ERRCODE='22023'; END IF;
  UPDATE app.solicitacao SET status='rejeitada', justificativa=btrim(p_justificativa),
    decidido_por=app.uid_jwt(), decidido_em=now() WHERE id=p_id;

  RETURN jsonb_build_object('ok', true);
END; $function$;

CREATE OR REPLACE FUNCTION public.solic_cancelar(p_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE v_sol app.solicitacao;
BEGIN
  PERFORM app.exigir_acesso();
  SELECT * INTO v_sol FROM app.solicitacao WHERE id = p_id;
  IF NOT FOUND OR NOT app.pode_ver_solic(v_sol) THEN RAISE EXCEPTION 'NAO_ENCONTRADA' USING ERRCODE='42501'; END IF;
  IF v_sol.status NOT IN ('aberta','aprovada') THEN RAISE EXCEPTION 'TRANSICAO_ILEGAL: solicitação já encerrada' USING ERRCODE='22023'; END IF;
  IF NOT coalesce(v_sol.solicitante_id = app.uid_jwt(), false) THEN
    RAISE EXCEPTION 'PERMISSAO_NEGADA: só o solicitante pode cancelar' USING ERRCODE='42501'; END IF;
  UPDATE app.solicitacao SET status='cancelada', decidido_por=app.uid_jwt(), decidido_em=now() WHERE id=p_id;

  RETURN jsonb_build_object('ok', true);
END; $function$;

-- ── 6. solic_movimentacoes — terceiro ramo: a Aprovação, que sobrevive ────────
CREATE OR REPLACE FUNCTION public.solic_movimentacoes()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['solicitacoes']);
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
        'solicitacao_id', m.solicitacao_id,
        'tipo_nome',      m.tipo_nome,
        'acao',           m.acao,
        'status_atual',   m.status_atual,
        'ator',           m.ator,
        'em',             m.em,
        'detalhe',        m.detalhe
      ) ORDER BY m.em DESC, m.solicitacao_id DESC)
    FROM (
      -- (a) ABERTURA — sempre existe
      SELECT s.id AS solicitacao_id, t.nome AS tipo_nome, 'Abertura' AS acao,
             s.status AS status_atual,
             (SELECT coalesce(nome, email) FROM app.rbac_usuarios WHERE user_id = s.solicitante_id) AS ator,
             s.criado_em AS em, NULL::text AS detalhe
      FROM app.solicitacao s JOIN app.solicitacao_tipo t ON t.id = s.tipo_id
      UNION ALL
      -- (b) APROVAÇÃO — etapa intermediária. Derivada de `aprovado_em`, NÃO do status:
      -- é por isso que ela continua aparecendo depois que a solicitação foi concluída.
      SELECT s.id, t.nome, 'Aprovação',
             s.status,
             (SELECT coalesce(nome, email) FROM app.rbac_usuarios WHERE user_id = s.aprovado_por),
             s.aprovado_em, NULL::text
      FROM app.solicitacao s JOIN app.solicitacao_tipo t ON t.id = s.tipo_id
      WHERE s.aprovado_em IS NOT NULL
      UNION ALL
      -- (c) DECISÃO TERMINAL — só quando de fato encerrou
      SELECT s.id, t.nome,
             CASE s.status WHEN 'concluida' THEN 'Conclusão'
                           WHEN 'rejeitada' THEN 'Rejeição'
                           WHEN 'cancelada' THEN 'Cancelamento'
                           ELSE 'Decisão' END,
             s.status,
             (SELECT coalesce(nome, email) FROM app.rbac_usuarios WHERE user_id = s.decidido_por),
             s.decidido_em, s.justificativa
      FROM app.solicitacao s JOIN app.solicitacao_tipo t ON t.id = s.tipo_id
      WHERE s.status NOT IN ('aberta','aprovada') AND s.decidido_em IS NOT NULL
    ) m
  ), '[]'::jsonb);
END; $function$;

-- ── 7. Pendências — aprovada ainda é trabalho a fazer na sua caixa ───────────
CREATE OR REPLACE FUNCTION public.solic_minhas_pendencias()
RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
BEGIN
  PERFORM app.exigir_acesso();  -- qualquer autenticado ATIVO; barra inativo/anon
  RETURN (
    SELECT count(*)::int
    FROM app.solicitacao s
    WHERE s.status IN ('aberta','aprovada')
      AND (coalesce(s.destinatario_user_id = app.uid_jwt(), false)
           OR (s.destinatario_role_id IS NOT NULL AND s.destinatario_role_id = app.minha_role_id()))
  );
END;
$function$;

-- ── 8. API externa — cancelar aceita solicitação já aprovada (D10) ───────────
-- Coerente com a tela: o solicitante cancela nos dois estados, e a chave de API é o
-- solicitante das solicitações que ela abriu.
CREATE OR REPLACE FUNCTION public.cancelar_solicitacao_externa(p_chave_id bigint, p_solicitacao_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE
  v_robo_user_id uuid;
  v_sol          app.solicitacao;
BEGIN
  SELECT robo_user_id INTO v_robo_user_id FROM app.api_chave WHERE id = p_chave_id AND ativo;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CHAVE_INVALIDA' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_sol FROM app.solicitacao WHERE id = p_solicitacao_id AND origem_chave_id = p_chave_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NAO_ENCONTRADA' USING ERRCODE = '42501';
  END IF;

  IF v_sol.status NOT IN ('aberta','aprovada') THEN
    RAISE EXCEPTION 'CONFLITO_ESTADO: %', v_sol.status USING ERRCODE = '22023';
  END IF;

  UPDATE app.solicitacao
     SET status = 'cancelada', decidido_por = v_robo_user_id, decidido_em = now()
   WHERE id = p_solicitacao_id;

  RETURN jsonb_build_object('ok', true, 'id', p_solicitacao_id, 'status', 'cancelada');
END;
$function$;

-- ── 9. Grants explícitos das RPCs NOVAS ──────────────────────────────────────
-- Nunca contar com o default do Supabase (que concede EXECUTE a anon/authenticated em
-- função nova mesmo com REVOKE FROM PUBLIC) — ver §4 da skill `banco-e-rpc`.
REVOKE EXECUTE ON FUNCTION public.solic_aprovar(bigint)        FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.solic_anexar(bigint, jsonb)  FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.solic_aprovar(bigint)        TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.solic_anexar(bigint, jsonb)  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
