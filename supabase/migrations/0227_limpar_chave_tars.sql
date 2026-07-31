-- ---------------------------------------------------------------------------
-- PATCH DESTRUTIVO — apaga a chave de API 'TARS' (REVOGADA) e o usuário-robô dela,
-- para liberar o nome. Pedido do Yan (2026-07-31): "limpe do banco de dados o
-- usuário Integração TARS e chave de api revogada TARS, para que eu possa criar
-- outra chave com o mesmo nome".
--
-- ███ SEM NÚMERO DE PROPÓSITO ███ — numerar na hora de aplicar (o próximo livre
-- hoje é `0227`; confira com `npx supabase migration list`). Destrutivo parado na
-- pasta `migrations/` é arrastado pelo primeiro `db push` aditivo.
--
-- COMO APLICAR (no SEU terminal — o wrapper exige TTY, ADR-0131):
--
--   git mv supabase/patches/PENDENTE-limpar-chave-tars.sql \
--          supabase/migrations/0227_limpar_chave_tars.sql
--   npm run db:migrate -- --destrutiva
--
-- POR QUE PRECISA APAGAR OS DOIS: `app.api_chave.plataforma` é UNIQUE e a chave
-- revogada continua ocupando o nome; e o robô tem e-mail derivado do nome
-- (`integracao-tars@janus.internal`), então recriar esbarraria também em
-- EMAIL_EM_USO no Auth. Some um sem o outro e a criação continua barrada.
--
-- DECLARAÇÃO PRÉVIA (regime destrutivo / confirmação humana obrigatória):
--   • O QUE APAGA (censo conferido em 31/07, depois da revogação):
--       - `app.api_chave` id 47, plataforma 'TARS', **ativo=false** (revogada às
--         17h21) — 0 chamadas no log, 0 solicitações de origem nela.
--       - `auth.users` do robô `integracao-tars@janus.internal` (nome "Integração
--         TARS", ativo=false, role_id NULL) — a linha em `app.rbac_usuarios` sai
--         junto por CASCADE (`rbac_usuarios_user_id_fkey`, conferido no catálogo,
--         não suposto). O robô não é solicitante, decisor nem criador de tipo de
--         NADA (conferido).
--   • O QUE NÃO TOCA: nenhuma outra chave, nenhum usuário humano, nenhuma
--     solicitação, nenhum tipo. As guardas abortam se qualquer premissa acima tiver
--     mudado entre esta escrita e a sua execução.
--   • DEPOIS DISTO: o nome 'TARS' e o e-mail do robô ficam livres — pode criar a
--     chave nova pela tela normalmente.
--   • NÃO EXISTE DOWN: o segredo da chave antiga já era irrecuperável (só hash) e
--     ela estava revogada — não há o que restaurar.
-- ---------------------------------------------------------------------------

-- ── Guarda 1 (PRÉ) ────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_chave   bigint;
  v_ativo   boolean;
  v_robo    uuid;
  v_log     int;
  v_sol     int;
  v_uso     int;
  v_outras  int;
BEGIN
  SELECT id, ativo, robo_user_id INTO v_chave, v_ativo, v_robo
  FROM app.api_chave WHERE plataforma = 'TARS';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ABORTADO: não existe chave com plataforma = TARS. Nada a limpar — o nome já está livre.';
  END IF;

  -- Chave ATIVA nunca é apagada por este patch: revogar é ato deliberado na tela, e
  -- apagar uma chave em uso derrubaria a integração sem aviso.
  IF v_ativo THEN
    RAISE EXCEPTION 'ABORTADO: a chave TARS (id %) está ATIVA. Revogue pela tela antes — este patch só limpa chave já revogada.', v_chave;
  END IF;

  SELECT count(*) INTO v_log FROM app.api_chamada_log WHERE chave_id = v_chave;
  SELECT count(*) INTO v_sol FROM app.solicitacao     WHERE origem_chave_id = v_chave;
  IF v_log > 0 OR v_sol > 0 THEN
    RAISE EXCEPTION 'ABORTADO: a chave TARS tem histórico (% chamada(s) no log, % solicitação(ões)). Apagá-la levaria auditoria junto — decida o que fazer com esse histórico antes.', v_log, v_sol;
  END IF;

  -- O robô só sai se não for autor/decisor/criador de nada e não pertencer a outra chave.
  SELECT count(*) INTO v_uso FROM (
    SELECT 1 FROM app.solicitacao      WHERE solicitante_id = v_robo
    UNION ALL SELECT 1 FROM app.solicitacao      WHERE decidido_por  = v_robo
    UNION ALL SELECT 1 FROM app.solicitacao_tipo WHERE criado_por    = v_robo
  ) t;
  IF v_uso > 0 THEN
    RAISE EXCEPTION 'ABORTADO: o usuário-robô aparece em % registro(s) (solicitação ou tipo). Não dá para apagá-lo sem perder autoria.', v_uso;
  END IF;

  SELECT count(*) INTO v_outras FROM app.api_chave WHERE robo_user_id = v_robo AND id <> v_chave;
  IF v_outras > 0 THEN
    RAISE EXCEPTION 'ABORTADO: o robô também é titular de % outra(s) chave(s).', v_outras;
  END IF;

  RAISE NOTICE '[patch] guardas OK → chave % (TARS, revogada, sem histórico) e robô % serão removidos.', v_chave, v_robo;
END $$;

-- ── Remoção ───────────────────────────────────────────────────────────────────
-- Ordem obrigatória: a chave referencia o robô (FK api_chave.robo_user_id →
-- rbac_usuarios.user_id), então ela sai primeiro.
DELETE FROM app.api_chave WHERE plataforma = 'TARS' AND NOT ativo;

-- O robô: apagar de auth.users leva a linha de app.rbac_usuarios junto
-- (rbac_usuarios_user_id_fkey é ON DELETE CASCADE). Testado antes em transação
-- REVERTIDA: o role `postgres` que roda a migration tem privilégio para isto.
DELETE FROM auth.users WHERE email = 'integracao-tars@janus.internal';

-- ── Guarda 2 (PÓS) ────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM app.api_chave WHERE plataforma = 'TARS') THEN
    RAISE EXCEPTION 'ABORTADO: a chave TARS continua lá.';
  END IF;
  IF EXISTS (SELECT 1 FROM app.rbac_usuarios WHERE email = 'integracao-tars@janus.internal') THEN
    RAISE EXCEPTION 'ABORTADO: o robô continua em app.rbac_usuarios (o cascade não pegou).';
  END IF;
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = 'integracao-tars@janus.internal') THEN
    RAISE EXCEPTION 'ABORTADO: o robô continua em auth.users.';
  END IF;
  RAISE NOTICE '[patch] DEPOIS → nome TARS e e-mail do robô LIVRES. Pode criar a chave nova pela tela.';
END $$;

NOTIFY pgrst, 'reload schema';
