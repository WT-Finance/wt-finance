-- 0201 — M4: Realtime da Base de Dados via BROADCAST (não postgres_changes) — v5.2.1/ADR-0155
--
-- ESCOLHA (investigação do Code): broadcast por trigger SECURITY DEFINER, NÃO postgres_changes.
-- postgres_changes exigiria reabrir acesso direto à tabela — (a) incluir na publication
-- supabase_realtime, (b) policy de SELECT p/ authenticated, (c) re-GRANT SELECT de tabela —
-- desfazendo o fechamento deliberado da 0120/ADR-0108 e criando uma 2ª regra de autorização
-- divergente do exigir_acesso (risco de dessincronizar). O broadcast mantém a tabela SEM
-- grant/policy; a única superfície nova é uma policy em realtime.messages que REUSA o RBAC
-- (app.pode_assinar_area) e checa `ativo` (usuário desativado com token vivo não recebe).
--
-- ADITIVA: função/triggers/policy NOVOS; não toca dados nem a tabela alvo. Fail-safe: se o
-- realtime.send falhar (ou a versão do Realtime não suportar), a exceção é engolida — a ESCRITA
-- do Gerencial nunca quebra (a AUDITORIA é o diário/0199; o broadcast é só o "aviso vivo").
-- ⚠️ CHECKPOINT (BLOQUEANTE): broadcast em canal PRIVADO depende de o schema `realtime` do projeto
--   HOSPEDADO ter `realtime.topic()`/`realtime.send()` e da Autorização de Realtime (canais
--   privados) habilitada no dashboard/Management API. Verificar ANTES de aplicar:
--     select proname from pg_proc where pronamespace='realtime'::regnamespace and proname in ('topic','send');
--   Se `realtime.topic()` não existir, a CREATE POLICY abaixo FALHA na aplicação. Por isso ela vem
--   ANTES dos triggers: se falhar, só o helper (idempotente) terá sido criado, e a reaplicação
--   (após habilitar) não colide com trigger já existente. Se indisponível, degradar p/ polling.

-- ── 1. Helper booleano de autorização de canal (genérico, reutilizável) ──────────
-- SECURITY DEFINER porque lê app.rbac_usuarios/permissoes_de (schema `app`, fechado). GRANT a
-- authenticated para a POLICY de realtime.messages poder avaliá-lo (a policy roda como o papel
-- da requisição). Não é exposto por REST (schema `app` fora do PostgREST).
CREATE OR REPLACE FUNCTION app.pode_assinar_area(p_area text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM app.rbac_usuarios u
    WHERE u.user_id = auth.uid() AND u.ativo
      AND p_area = ANY (app.permissoes_de(auth.uid()))
  )
$$;
REVOKE EXECUTE ON FUNCTION app.pode_assinar_area(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION app.pode_assinar_area(text) TO authenticated, service_role;

-- ── 2. Policy de leitura do canal privado (broadcast) do Gerencial ───────────────
-- (ANTES dos triggers de propósito — ver nota de checkpoint. É o único statement que pode falhar
--  na aplicação por dependência externa do Realtime.) realtime.messages tem RLS ligada por padrão
--  e sem policy (nega). Esta libera SÓ o tópico 'gerencial_lancamentos', SÓ p/ quem está ativo e
--  tem a área. Sem USING(true). (Sem DROP POLICY IF EXISTS de propósito: manteria o 0201
--  puramente ADITIVO — DROP POLICY é classificado destrutivo pelo backup-gate. A policy é NOVA;
--  se a aplicação falhar aqui por versão do Realtime, ela não chega a existir e a reaplicação
--  recria limpo — por isso a policy vem antes dos triggers.)
CREATE POLICY "gerencial_broadcast_leitura"
  ON realtime.messages FOR SELECT TO authenticated
  USING (
    realtime.messages.extension = 'broadcast'
    AND realtime.topic() = 'gerencial_lancamentos'
    AND app.pode_assinar_area('financeiro/gerencial')
  );

-- ── 3. Trigger de broadcast — STATEMENT-level com transition tables ──────────────
-- UMA mensagem por statement, com a CONTAGEM de linhas (a exclusão em massa é um único DELETE →
-- 1 mensagem "N linhas", não N mensagens). Payload: autor (id+nome — o cliente ignora as próprias
-- mudanças), operação e nº de linhas. A mesma função serve os 3 triggers; cada branch só toca a
-- sua transition table (a outra não é parseada quando o branch não executa).
CREATE OR REPLACE FUNCTION financeiro.fn_broadcast_gerencial()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_nome text;
  v_n    int;
BEGIN
  -- Só há "aviso vivo" para edição INTERATIVA (um usuário logado). Operação de sistema
  -- (service_role, auth.uid() nulo) — sobretudo a importação de planilha, que insere linha a
  -- linha num loop — NÃO faz broadcast: evitaria inundar os clientes com N mensagens. O DIÁRIO
  -- (0199) ainda audita tudo, inclusive a importação; só o aviso vivo é interativo-only.
  IF v_uid IS NULL THEN RETURN NULL; END IF;

  IF TG_OP = 'DELETE' THEN
    SELECT count(*) INTO v_n FROM oldtab;
  ELSE
    SELECT count(*) INTO v_n FROM newtab;
  END IF;
  IF coalesce(v_n, 0) = 0 THEN RETURN NULL; END IF;

  SELECT u.nome INTO v_nome FROM app.rbac_usuarios u WHERE u.user_id = v_uid;

  BEGIN
    PERFORM realtime.send(
      jsonb_build_object(
        'op', left(TG_OP, 1), 'n', v_n,
        'usuario_id', v_uid, 'usuario_nome', v_nome, 'lote', txid_current()::text
      ),
      'gerencial_change',        -- event
      'gerencial_lancamentos',   -- topic
      true                       -- private
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;  -- FAIL-SAFE: o aviso vivo nunca quebra a escrita (a verdade auditável é o diário)
  END;
  RETURN NULL;
END $$;

CREATE TRIGGER trg_broadcast_gerencial_ins
  AFTER INSERT ON analytics.gerencial_lancamentos
  REFERENCING NEW TABLE AS newtab FOR EACH STATEMENT
  EXECUTE FUNCTION financeiro.fn_broadcast_gerencial();
CREATE TRIGGER trg_broadcast_gerencial_upd
  AFTER UPDATE ON analytics.gerencial_lancamentos
  REFERENCING NEW TABLE AS newtab FOR EACH STATEMENT
  EXECUTE FUNCTION financeiro.fn_broadcast_gerencial();
CREATE TRIGGER trg_broadcast_gerencial_del
  AFTER DELETE ON analytics.gerencial_lancamentos
  REFERENCING OLD TABLE AS oldtab FOR EACH STATEMENT
  EXECUTE FUNCTION financeiro.fn_broadcast_gerencial();

NOTIFY pgrst, 'reload schema';
