-- 0282 — v6.0.0/M6b: retenção do arquivo cru (errata 3(b) do contrato — decisão do Yan, 24/09).
-- Desenho: docs/briefings/anexo-v6-0-0-m6b-retencao-do-cru.md
--
-- CLASSIFICAÇÃO DECLARADA: ADITIVA.
--   • `CREATE TABLE ingestao.retencao` (nova), `CREATE INDEX`, `CREATE FUNCTION` de nome NOVO
--     (`ingestao_retencao_inventario`, `ingestao_retencao_registrar`), `GRANT`/`REVOKE`,
--     `cron.schedule` + `cron.alter_job(..., active := false)` numa instrução só (molde da 0280).
--   • `CREATE OR REPLACE FUNCTION public.ingestao_painel()` — MESMA assinatura e retorno; parte da
--     definição VIVA (0281, catálogo conferido), só GANHA duas chaves (`retencao_ultima`,
--     `retencao_cron_ativo`). Nenhuma chave existente sai ou muda de tipo.
--   • Nenhum `DROP`, `TRUNCATE`, `UPDATE`/`DELETE` de dado existente. Esta migration NÃO apaga
--     arquivo nenhum: quem apaga é a rota `/api/ingestao/retencao`, pela API do Storage (linha
--     removida de `storage.objects` por SQL não apaga o arquivo físico).
--
-- A REGRA (3 meses para todo cru; 7 dias para o que nunca virou carga) mora em
-- `src/lib/ingestao/retencao.ts` como função PURA e testada; aqui fica só o INVENTÁRIO que ela lê
-- (o que existe no bucket, o que as cargas citam, o relógio do banco) e o LOG do que foi apagado.
--
-- REVERSÃO (manual, destrutiva): SELECT cron.unschedule('ingestao-retencao');
--   DROP FUNCTION public.ingestao_retencao_registrar(text, timestamptz, integer, integer, jsonb, text);
--   DROP FUNCTION public.ingestao_retencao_inventario(); DROP TABLE ingestao.retencao;
--   e reaplicar o `ingestao_painel` da 0281.

-- ═════════════════════════════════════════════════════════════════════════════════════
-- 1. ingestao.retencao — uma linha por RODADA da limpeza, com o que ela apagou
-- ═════════════════════════════════════════════════════════════════════════════════════

CREATE TABLE ingestao.retencao (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  iniciado_em  timestamptz NOT NULL,
  concluido_em timestamptz NOT NULL DEFAULT now(),
  status       text        NOT NULL,
  expirados    integer     NOT NULL DEFAULT 0,
  orfaos       integer     NOT NULL DEFAULT 0,
  -- [{path, motivo: 'expirado'|'orfao', criado_em}] — o que foi apagado (ou, em `simulado`, o
  -- que SERIA). É o registro de auditoria que a decisão pede: "registra o que apagou".
  apagados     jsonb       NOT NULL DEFAULT '[]'::jsonb,
  erro         text,

  -- `simulado` = rodada de diagnóstico (`?simular=1`), não apagou nada; `recusado` = uma trava
  -- de segurança impediu apagar (teto por rodada, inventário de cargas vazio) — ver anexo §4.
  CONSTRAINT ingestao_retencao_status_valido CHECK (status IN ('ok', 'simulado', 'recusado', 'erro')),
  CONSTRAINT ingestao_retencao_contagens_nao_negativas CHECK (expirados >= 0 AND orfaos >= 0)
);

COMMENT ON TABLE ingestao.retencao IS
  'v6.0.0/M6b (errata 3(b)): uma linha por rodada da limpeza do bucket ingestao-cru — expirados (cru com mais de 3 meses) e órfãos (cru sem carga com mais de 7 dias), com a lista de paths apagados em `apagados`. status: ok | simulado (diagnóstico, nada apagado) | recusado (trava de segurança) | erro.';

CREATE INDEX idx_ingestao_retencao_concluido_em ON ingestao.retencao (concluido_em DESC);

ALTER TABLE ingestao.retencao ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ingestao.retencao FROM PUBLIC, anon, authenticated;

-- ═════════════════════════════════════════════════════════════════════════════════════
-- 2. ingestao_retencao_inventario() — o que a regra lê. service_role-only (a rota de cron).
-- ═════════════════════════════════════════════════════════════════════════════════════

CREATE FUNCTION public.ingestao_retencao_inventario()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    -- Relógio do BANCO, não do processo que chama (mesma regra do vigia).
    'agora', now(),
    -- SÓ o bucket da ingestão — o filtro é a primeira trava contra apagar fora dele.
    'objetos', coalesce((
      SELECT jsonb_agg(jsonb_build_object('path', o.name, 'criado_em', o.created_at) ORDER BY o.created_at)
        FROM storage.objects o
       WHERE o.bucket_id = 'ingestao-cru'
    ), '[]'::jsonb),
    -- Todo path citado por QUALQUER carga (aberta, aplicada, rejeitada, erro). Distinto.
    'citados', coalesce((
      SELECT jsonb_agg(DISTINCT a->>'path')
        FROM ingestao.carga c
       CROSS JOIN LATERAL jsonb_array_elements(
                CASE WHEN jsonb_typeof(c.arquivos) = 'array' THEN c.arquivos ELSE '[]'::jsonb END
              ) a
       WHERE a->>'path' IS NOT NULL
    ), '[]'::jsonb),
    -- Quantas cargas existem — a trava 5 do anexo (cargas = 0 com objetos presentes ⇒ recusa).
    'cargas', (SELECT count(*) FROM ingestao.carga)
  );
$$;
REVOKE EXECUTE ON FUNCTION public.ingestao_retencao_inventario() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.ingestao_retencao_inventario() TO service_role;
COMMENT ON FUNCTION public.ingestao_retencao_inventario() IS
  'v6.0.0/M6b: inventário da limpeza do cru — {agora (relógio do banco), objetos [{path, criado_em}] SÓ do bucket ingestao-cru, citados [path] por qualquer ingestao.carga, cargas (contagem)}. Só LÊ; quem decide o que apagar é src/lib/ingestao/retencao.ts (função pura) e quem apaga é a rota /api/ingestao/retencao pela API do Storage. service_role-only (sem exigir_acesso: não há sessão de usuário no cron; a rota autoriza por CRON_SECRET ou sessão admin/uploads).';

-- ═════════════════════════════════════════════════════════════════════════════════════
-- 3. ingestao_retencao_registrar(...) — o log da rodada. service_role-only.
-- ═════════════════════════════════════════════════════════════════════════════════════

CREATE FUNCTION public.ingestao_retencao_registrar(
  p_status      text,
  p_iniciado_em timestamptz,
  p_expirados   integer,
  p_orfaos      integer,
  p_apagados    jsonb DEFAULT '[]'::jsonb,
  p_erro        text  DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('ok', 'simulado', 'recusado', 'erro') THEN
    RAISE EXCEPTION 'STATUS_INVALIDO: % (esperado ok | simulado | recusado | erro)', p_status
      USING ERRCODE = '22023';
  END IF;
  IF p_iniciado_em IS NULL THEN
    RAISE EXCEPTION 'INICIO_OBRIGATORIO: informe quando a rodada começou' USING ERRCODE = '22023';
  END IF;
  IF p_apagados IS NOT NULL AND jsonb_typeof(p_apagados) <> 'array' THEN
    RAISE EXCEPTION 'APAGADOS_INVALIDO: esperado um array jsonb' USING ERRCODE = '22023';
  END IF;

  INSERT INTO ingestao.retencao (iniciado_em, status, expirados, orfaos, apagados, erro)
  VALUES (p_iniciado_em, p_status, coalesce(p_expirados, 0), coalesce(p_orfaos, 0),
          coalesce(p_apagados, '[]'::jsonb), p_erro)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.ingestao_retencao_registrar(text, timestamptz, integer, integer, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.ingestao_retencao_registrar(text, timestamptz, integer, integer, jsonb, text) TO service_role;
COMMENT ON FUNCTION public.ingestao_retencao_registrar(text, timestamptz, integer, integer, jsonb, text) IS
  'v6.0.0/M6b: grava UMA rodada da limpeza do cru em ingestao.retencao (status ok | simulado | recusado | erro, contagens e a lista de paths apagados). service_role-only (chamada pela rota /api/ingestao/retencao).';

-- ═════════════════════════════════════════════════════════════════════════════════════
-- 4. cron `ingestao-retencao` — diário 07:30 UTC (04:30 em São Paulo). NASCE INATIVO.
--    Molde da 0280 (Vault: monde_app_url/monde_cron_secret, REUSADOS — nenhum segredo novo).
--    A rota só existe em produção depois do deploy: ativo antes, bateria 404 todo dia.
-- ═════════════════════════════════════════════════════════════════════════════════════

SELECT cron.unschedule('ingestao-retencao')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ingestao-retencao');

SELECT cron.alter_job(
  cron.schedule(
    'ingestao-retencao',
    '30 7 * * *',
    $cron$
      SELECT net.http_post(
        url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'monde_app_url')
               || '/api/ingestao/retencao',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'monde_cron_secret'),
          'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 120000
      );
    $cron$
  ),
  active := false
);

-- ATIVAÇÃO (depois do deploy, M9), como `postgres` (dono do job):
--   SELECT cron.alter_job((SELECT jobid FROM cron.job WHERE jobname = 'ingestao-retencao'), active := true);
-- Antes de ativar: rodar a rota com `?simular=1` e conferir a lista.

-- ═════════════════════════════════════════════════════════════════════════════════════
-- 5. ingestao_painel() — definição VIVA da 0281 + a linha da limpeza para a tela
-- ═════════════════════════════════════════════════════════════════════════════════════

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
    'alarmes_abertos', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', a.id, 'tipo', a.tipo, 'chave', a.chave, 'aberto_em', a.aberto_em,
        'notificado_em', a.notificado_em, 'detalhe', a.detalhe
      ) ORDER BY a.aberto_em DESC)
      FROM ingestao.alarme a
      WHERE a.resolvido_em IS NULL
    ), '[]'::jsonb),
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
    ),
    -- 0282: a última rodada REAL da limpeza (sem a lista de paths — a tela só precisa do resumo)
    -- e se o cron dela está ligado. NULL até a primeira rodada. `simulado` fica de fora de
    -- propósito (BAIXO do revisor-db): um diagnóstico manual não pode esconder na tela o
    -- resultado da limpeza automática — a simulação devolve a sua lista na própria resposta HTTP.
    'retencao_ultima', (
      SELECT jsonb_build_object(
        'concluido_em', r.concluido_em, 'status', r.status,
        'expirados', r.expirados, 'orfaos', r.orfaos, 'erro', r.erro
      )
      FROM ingestao.retencao r
      WHERE r.status <> 'simulado'
      ORDER BY r.concluido_em DESC
      LIMIT 1
    ),
    'retencao_cron_ativo', (
      SELECT active FROM cron.job WHERE jobname = 'ingestao-retencao'
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.ingestao_painel() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.ingestao_painel() TO authenticated, service_role;
COMMENT ON FUNCTION public.ingestao_painel() IS
  'v6.0.0/M6 (0280, 0281, 0282): últimas 50 cargas (com quem: nome/e-mail do usuário da sessão, ou "API · plataforma" da chave — NULL se nenhum dos dois), últimas 100 execuções, alarmes abertos (topo) + últimos 50 alarmes recentes (abertos e resolvidos — alarme de EVENTO só aparece na tela via alarmes_recentes), expectativas (com alterado_em/alterado_por/alterado_por_nome), o estado do vigia (última verificação + se o cron está ativo) e da limpeza do cru (última rodada + se o cron está ativo) — tudo que a tela /admin/ingestao (anexo §7) precisa numa chamada. app.exigir_acesso(ARRAY[''admin/uploads'']) inline (padrão de RPC nova, skill banco-e-rpc §4). GRANT a authenticated e service_role.';

NOTIFY pgrst, 'reload schema';
