-- 0281 — v6.0.0/M6: o painel de ingestão diz QUEM fez cada carga; o catálogo registra a prova do vigia.
--
-- CLASSIFICAÇÃO DECLARADA: ADITIVA.
--   • `CREATE OR REPLACE FUNCTION public.ingestao_painel()` — MESMA assinatura (sem parâmetro),
--     MESMO tipo de retorno (jsonb): o objeto só GANHA chaves (`cargas[].quem`,
--     `expectativas[].alterado_por_nome`); nenhuma chave existente sai nem muda de tipo, então o
--     consumidor atual (`ingestaoPainelSchema`, `src/lib/schemas-rpc.ts`) continua válido.
--   • `COMMENT ON FUNCTION` — só metadado.
--   Nenhuma tabela, coluna, dado ou GRANT pré-existente é tocado; REVOKE/GRANT reafirmados iguais.
--
-- POR QUÊ (1) — o anexo §7 pede "quem" em cada carga. `ingestao.carga` já grava `usuario_id`
--   (carga pela tela, sessão) e `chave_id` (carga pela API, `app.api_chave`) desde a 0276 — a rota
--   `/api/ingestao/{base}` preenche um OU outro (route.ts: `auth.via === 'sessao'` / `'chave'`).
--   Faltava só o painel resolver o identificador em algo legível. `quem`:
--     sessão → `coalesce(nullif(btrim(u.nome), ''), u.email)` de `app.rbac_usuarios`;
--     chave  → `'API · ' || k.plataforma` de `app.api_chave`;
--     nenhum dos dois (não deveria acontecer pela rota) → NULL — a tela mostra "—", nunca inventa.
--   LEFT JOIN nos dois: um usuário removido de `rbac_usuarios` não pode esconder a carga do log.
--
-- POR QUÊ (2) — o COMMENT de `ingestao_vigia_definir` (0280) dizia "NÃO verificada ao vivo" sobre a
--   posse do pg_cron sob SECURITY DEFINER (ALTO do revisor-db). Verificado em 24/09/2026 via REST
--   com service_role, corpo executado: `p_ativo=true` → `cron.job.active=true`; `p_ativo=false` →
--   `false` (job 10, dono postgres = dono da função). O catálogo é o que a próxima sessão lê.
--
-- REVERSÃO: reaplicar o `CREATE OR REPLACE` de `ingestao_painel` e o COMMENT da 0280 (aditivo).

CREATE OR REPLACE FUNCTION public.ingestao_painel()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['admin/uploads']);

  SELECT jsonb_build_object(
    'cargas', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'carga_id', c.carga_id, 'base', c.base, 'origem', c.origem, 'status', c.status,
        'linhas', c.linhas, 'checksums_conferidos', c.checksums_conferidos,
        'checksums_falhos', c.checksums_falhos, 'rejeitadas_por_data', c.rejeitadas_por_data,
        'pares_novos', c.pares_novos, 'diff', c.diff, 'recebido_em', c.recebido_em,
        'concluido_em', c.concluido_em, 'erro', c.erro,
        'quem', CASE
                  WHEN c.usuario_id IS NOT NULL THEN coalesce(nullif(btrim(u.nome), ''), u.email)
                  WHEN c.chave_id   IS NOT NULL THEN 'API · ' || k.plataforma
                END
      ) ORDER BY c.recebido_em DESC)
      FROM (SELECT * FROM ingestao.carga ORDER BY recebido_em DESC LIMIT 50) c
      LEFT JOIN app.rbac_usuarios u ON u.user_id = c.usuario_id
      LEFT JOIN app.api_chave     k ON k.id      = c.chave_id
    ), '[]'::jsonb),
    'execucoes', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', e.id, 'processo', e.processo, 'status', e.status,
        'iniciado_em', e.iniciado_em, 'concluido_em', e.concluido_em,
        'duracao_ms', e.duracao_ms, 'erro', e.erro
      ) ORDER BY e.iniciado_em DESC)
      FROM (SELECT * FROM ingestao.execucao ORDER BY iniciado_em DESC LIMIT 100) e
    ), '[]'::jsonb),
    -- Alarmes ABERTOS — o que a tela destaca no topo (ver 0280).
    'alarmes_abertos', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', a.id, 'tipo', a.tipo, 'chave', a.chave, 'aberto_em', a.aberto_em,
        'notificado_em', a.notificado_em, 'detalhe', a.detalhe
      ) ORDER BY a.aberto_em DESC)
      FROM ingestao.alarme a
      WHERE a.resolvido_em IS NULL
    ), '[]'::jsonb),
    -- Alarmes RECENTES — abertos E resolvidos (alarme de EVENTO só aparece na tela por aqui, ver 0280).
    'alarmes_recentes', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', a.id, 'tipo', a.tipo, 'chave', a.chave, 'aberto_em', a.aberto_em,
        'resolvido_em', a.resolvido_em, 'notificado_em', a.notificado_em, 'detalhe', a.detalhe
      ) ORDER BY a.aberto_em DESC)
      FROM (SELECT * FROM ingestao.alarme ORDER BY aberto_em DESC LIMIT 50) a
    ), '[]'::jsonb),
    'expectativas', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'tipo', x.tipo, 'alvo', x.alvo, 'tolerancia', x.tolerancia,
        'ativo', x.ativo, 'descricao', x.descricao,
        'alterado_em', x.alterado_em, 'alterado_por', x.alterado_por,
        'alterado_por_nome', coalesce(nullif(btrim(u.nome), ''), u.email)
      ) ORDER BY x.tipo, x.alvo)
      FROM ingestao.expectativa x
      LEFT JOIN app.rbac_usuarios u ON u.user_id = x.alterado_por
    ), '[]'::jsonb),
    'vigia_ultima_verificacao', (
      SELECT max(concluido_em) FROM ingestao.execucao WHERE processo = 'ingestao-vigia'
    ),
    'vigia_cron_ativo', (
      SELECT active FROM cron.job WHERE jobname = 'ingestao-vigia'
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.ingestao_painel() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.ingestao_painel() TO authenticated, service_role;
COMMENT ON FUNCTION public.ingestao_painel() IS
  'v6.0.0/M6 (0280, 0281): últimas 50 cargas (com quem: nome/e-mail do usuário da sessão, ou "API · plataforma" da chave — NULL se nenhum dos dois), últimas 100 execuções, alarmes abertos (topo) + últimos 50 alarmes recentes (abertos e resolvidos — alarme de EVENTO só aparece na tela via alarmes_recentes), expectativas (com alterado_em/alterado_por/alterado_por_nome) e o estado do vigia (última verificação + se o cron está ativo) — tudo que a tela /admin/ingestao (anexo §7) precisa numa chamada. app.exigir_acesso(ARRAY[''admin/uploads'']) inline (padrão de RPC nova, skill banco-e-rpc §4). GRANT a authenticated e service_role.';

COMMENT ON FUNCTION public.ingestao_vigia_definir(boolean) IS
  'v6.0.0/M6: liga/desliga o cron ingestao-vigia via cron.alter_job (job criado pela migration 0280, mesmo dono — postgres — desta função SECURITY DEFINER). VERIFICADO AO VIVO em 24/09/2026 (0281): corpo executado via REST/service_role, p_ativo=true levou cron.job.active a true e p_ativo=false de volta a false — o pg_cron autoriza pelo dono do job, e SECURITY DEFINER basta. Relê cron.job.active após a chamada e levanta VIGIA_ALTERACAO_NAO_APLICADA se o estado não bateu, em vez de confiar no retorno void de cron.alter_job. VIGIA_CRON_NAO_ENCONTRADO se o job não existir. app.exigir_acesso(ARRAY[''admin/uploads'']) inline, GRANT a authenticated e service_role — chamada pela tela /admin/ingestao.';

NOTIFY pgrst, 'reload schema';
