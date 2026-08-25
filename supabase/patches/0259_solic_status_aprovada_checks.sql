-- ---------------------------------------------------------------------------
-- 0259 — feat(v5.9.0): relaxa os dois CHECKs que barram o status 'aprovada'.
--
-- ⚠️ MIGRATION DESTRUTIVA — EXIGE CONFIRMAÇÃO HUMANA EM TTY.
--
-- ⚠️ ESTE ARQUIVO VIVE FORA DE `supabase/migrations/` DE PROPÓSITO.
--    `db push` empurra TODO o conjunto pendente da pasta: uma destrutiva parada lá é
--    arrastada por qualquer push aditivo de qualquer branch (foi assim que a v5.2.0
--    dropou bases sem querer). Ele só é MOVIDO para `supabase/migrations/` no momento
--    exato da aplicação, e por um humano.
--
--    COMO APLICAR (Yan, num terminal interativo):
--      mv supabase/patches/0259_solic_status_aprovada_checks.sql supabase/migrations/
--      npm run db:migrate -- --destrutiva
--    Conferir antes: a 0258 já precisa estar aplicada, e nenhuma outra migration
--    pendente pode estar na pasta.
--
-- 🔴 ESTA MIGRATION É PRÉ-REQUISITO DO **MERGE**, NÃO UM PASSO PÓS-MERGE.
--    O front desta versão já chama `solic_aprovar` e já renderiza o botão "Aprovar"
--    (drawer-solicitacao.tsx). O que hoje o mantém inofensivo é só o PR não estar
--    mergeado — a Vercel deploya no merge. Se o merge acontecer com a 0258 aplicada e
--    esta aqui pendente, o botão fica vivo em produção contra um CHECK que ainda rejeita
--    'aprovada', e o primeiro clique de qualquer atendente estoura violação de constraint.
--    (Há uma rede em `traduzir()` que transforma esse erro numa mensagem acionável, mas
--    rede não é ordem: a ordem certa é aplicar ANTES de mergear.) — achado ALTO do
--    revisor-db, v5.9.0.
--
-- ⚠️ NUMERAÇÃO: 0255/0256/0257 estão reservadas pela v5.8.0 (DRE competência), em
--    implementação PARALELA e ainda não mergeada — por isso esta versão saltou para
--    0258/0259. O CLI identifica a migration pelo PREFIXO numérico, não pelo nome: duas
--    branches com o mesmo número fariam a segunda a aplicar ser tratada como "já
--    aplicada" e PULADA EM SILÊNCIO. Reconferir os números livres nas DUAS worktrees
--    imediatamente antes de aplicar — a v5.8.0 avançou de 0255 para 0257 no curso desta
--    própria versão.
--
-- POR QUE É CLASSIFICADA COMO DESTRUTIVA, embora não destrua dado: as duas operações
-- passam por `DROP CONSTRAINT`, e a regra do projeto trata todo DROP como destrutivo.
-- Na prática ambas RELAXAM (aceitam um superconjunto do que aceitavam): nenhuma linha
-- existente se torna inválida, nenhum valor é reescrito, nada é apagado. A janela real
-- de risco é o ACCESS EXCLUSIVE lock momentâneo em `app.solicitacao` — tabela pequena
-- (o histórico foi zerado na 0220), lock de milissegundos.
--
-- POR QUE ELA É NECESSÁRIA — as duas constraints vivas, verificadas em pg_constraint:
--   solicitacao_status_check
--     CHECK (status = ANY (ARRAY['aberta','concluida','rejeitada','cancelada']))
--     → não conhece 'aprovada'.
--   solicitacao_terminal_decidido
--     CHECK (status = 'aberta' OR (decidido_por IS NOT NULL AND decidido_em IS NOT NULL))
--     → afirma "ou está aberta, ou tem decisão TERMINAL registrada". Uma etapa
--       intermediária é exatamente o caso que essa disjunção não previu: 'aprovada' não
--       é 'aberta' e não tem decidido_por/decidido_em (que pertencem ao encerramento).
--       Sem relaxar, `solic_aprovar` falharia com violação de CHECK.
--
-- ORDEM: a 0258 (aditiva) vem ANTES — ela é superfície nova que nenhuma tela consome,
-- então aplicá-la sozinha tem risco zero, e é o que permite que este passo (o único que
-- exige humano) seja curto e isolado. Segue o padrão de sequenciamento da §9 da skill
-- `banco-e-rpc`.
--
-- DOWN (reaperto — só possível se nenhuma linha estiver em 'aprovada'):
--   ALTER TABLE app.solicitacao DROP CONSTRAINT solicitacao_status_check;
--   ALTER TABLE app.solicitacao ADD  CONSTRAINT solicitacao_status_check
--     CHECK (status = ANY (ARRAY['aberta','concluida','rejeitada','cancelada']));
--   ALTER TABLE app.solicitacao DROP CONSTRAINT solicitacao_terminal_decidido;
--   ALTER TABLE app.solicitacao ADD  CONSTRAINT solicitacao_terminal_decidido
--     CHECK (status = 'aberta' OR (decidido_por IS NOT NULL AND decidido_em IS NOT NULL));
-- ---------------------------------------------------------------------------

-- ── 1. status passa a aceitar 'aprovada' ─────────────────────────────────────
ALTER TABLE app.solicitacao DROP CONSTRAINT solicitacao_status_check;
ALTER TABLE app.solicitacao ADD  CONSTRAINT solicitacao_status_check CHECK (
  status = ANY (ARRAY['aberta'::text, 'aprovada'::text, 'concluida'::text,
                      'rejeitada'::text, 'cancelada'::text])
);

-- ── 2. 'aprovada' é estado NÃO-terminal: não exige decidido_por/decidido_em ───
ALTER TABLE app.solicitacao DROP CONSTRAINT solicitacao_terminal_decidido;
ALTER TABLE app.solicitacao ADD  CONSTRAINT solicitacao_terminal_decidido CHECK (
  status IN ('aberta','aprovada')
  OR (decidido_por IS NOT NULL AND decidido_em IS NOT NULL)
);

-- Reconciliação fail-closed: as duas constraints têm de existir com a forma nova, e a
-- `solicitacao_aprovada_registrada` (da 0258) tem de estar no lugar — sem ela, 'aprovada'
-- passaria a ser aceita SEM registro de quem/quando aprovou, que é pior que o estado atual.
DO $$
DECLARE v_faltando text;
BEGIN
  SELECT string_agg(c.nome, ', ')
    INTO v_faltando
    FROM (VALUES ('solicitacao_status_check'), ('solicitacao_terminal_decidido'),
                 ('solicitacao_aprovada_registrada')) AS c(nome)
   WHERE NOT EXISTS (
     SELECT 1 FROM pg_constraint
      WHERE conrelid = 'app.solicitacao'::regclass AND conname = c.nome
   );
  IF v_faltando IS NOT NULL THEN
    RAISE EXCEPTION '[0259] constraint(s) ausente(s): % — a 0258 foi aplicada?', v_faltando;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'app.solicitacao'::regclass
       AND conname  = 'solicitacao_status_check'
       AND pg_get_constraintdef(oid) LIKE '%aprovada%'
  ) THEN
    RAISE EXCEPTION '[0259] solicitacao_status_check não aceita ''aprovada'' após o ALTER';
  END IF;

  RAISE NOTICE '[0259] OK — status aceita 5 valores; ''aprovada'' é não-terminal e exige aprovado_por/aprovado_em.';
END $$;

NOTIFY pgrst, 'reload schema';
