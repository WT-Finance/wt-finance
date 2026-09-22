-- ---------------------------------------------------------------------------
-- 0276 — feat(v6.0.0/M4): schema `ingestao` + `ingestao.carga` + bucket `ingestao-cru`
--
-- DECLARAÇÃO PRÉVIA (regime aditivo / autônomo):
--   • O QUE FAZ: cria o schema NOVO `ingestao` com UMA tabela (`ingestao.carga` — uma
--     linha por execução da rota `/api/ingestao/{base}`, contrato `ingestao-v1.md` §6);
--     o bucket privado NOVO `ingestao-cru` (Storage) onde o cru sobe por URL assinada
--     (contrato §2.1/§2.2); e QUATRO RPCs `SECURITY DEFINER` service_role-only
--     (`ingestao_carga_abrir`, `ingestao_carga_concluir`, `ingestao_carga_obter`,
--     `ingestao_carga_ultima`) que sustentam a idempotência do passo 1→3 do contrato,
--     mais `ingestao_vencimentos_por_numero` (item 5), o cruzamento que resolve o
--     `Vencimento` de Lançamentos por Operação nas bases vizinhas
--     (anexo v6.0.0/M4 §3). A tabela nasce na M4 — não na M6 onde o briefing a listava —
--     porque a rota não consegue honrar `x-ingestao-idempotencia` sem persistência
--     sobrevivendo entre requisições/instâncias serverless (anexo §1.1a). Só a tabela e
--     a escrita entram agora; `ingestao.baseline`, alarmes e a tela `/admin/ingestao`
--     são M6.
--   • ADITIVA / RETROCOMPATÍVEL: só CREATE SCHEMA/TABLE/INDEX/FUNCTION, INSERT
--     idempotente do bucket (ON CONFLICT DO NOTHING) e GRANT/REVOKE. Nenhuma tabela,
--     coluna ou dado pré-existente é tocado — superfície 100% nova, nenhuma tela ou
--     rota consome nada disto ainda (a rota é de outra missão da M4).
--   • Por que as 4 RPCs NÃO chamam `app.exigir_acesso`: esta superfície não tem sessão
--     de usuário — quem autoriza é a ROTA (`x-api-key` pelo `escopo_bases` da chave, ou
--     `requireAreaApi('admin/uploads')` na sessão do card), exatamente o precedente de
--     `api_chave_resolver`/`api_chamada_registrar` (0211/ADR-0172): a permissão vive só
--     no par REVOKE/GRANT abaixo (EXECUTE só para `service_role`), nunca em lógica de
--     guard dentro do corpo. Nenhuma das 4 é alcançável por `authenticated`. Quando a
--     tela `/admin/ingestao` nascer (M6), ela ganha uma RPC de LEITURA própria, aí sim
--     com `exigir_acesso` inline — estas 4 continuam service_role-only para sempre.
--   • O PASSO 1 DO CONTRATO É SEM ESTADO. `ingestao_carga_abrir` roda no passo 3, não no
--     passo 1: recebe o `carga_id` que a rota `/upload-url` emitiu e que já viaja dentro
--     do caminho do objeto (`{base}/{aaaa}/{mm}/{carga_id}-{n}-{nome}`) — é o caminho,
--     conferido no passo 3, que amarra os arquivos à carga. Abrir a linha no passo 1
--     deixaria `extraido_em` sem onde ser gravado (o contrato §2.3 só o recebe no passo 3)
--     e faria todo upload abandonado virar linha de carga fantasma.
--   • Idempotência (contrato §1/§2.3 passo 1): `idempotencia` é UNIQUE parcial (tolera
--     NULL — chamador que não mandou a chave). `ingestao_carga_abrir` devolve a linha
--     EXISTENTE quando a chave já foi usada (nunca cria duas), com a flag `existente`
--     para o chamador distinguir "abri agora" de "já existia" — inclusive recuperando a
--     `resposta` de uma carga já concluída, sem refazer trabalho.
--   • Bucket privado, SEM policy em `storage.objects` (deny-by-default, molde
--     `acervo-documentos`/0165 e `solicitacoes-anexos`/0127): leitura e escrita só por
--     `service_role`/URL assinada. `file_size_limit` = 50 MB (`LIMITE_BYTES_ARQUIVO`,
--     contrato §2.1) — o teto de 200 MB por CARGA (`LIMITE_BYTES_CARGA`, soma de N
--     arquivos) não tem equivalente no Storage (o limite do bucket é por OBJETO) e fica
--     enforçado no app, em `src/lib/ingestao/storage.ts` (missão seguinte).
--   • `base` do CHECK nomeado repete, na MESMA ordem, `src/lib/ingestao/bases.ts`
--     (`BASES_INGESTAO`) — mesma fonte que o CHECK de `app.api_chave.escopo_bases`
--     (0274) já espelha, e pelo mesmo motivo: paridade provável por teste que lê o SQL
--     aplicado, não por comentário ("as duas pontas mudam juntas" não reprova nada).
--   • `chave_id` referencia `app.api_chave(id)` (quem chamou pela API); `usuario_id`
--     referencia `auth.users(id)` (quem chamou pela sessão do card) — os dois são
--     nulos até que a rota preencha um deles; esta migration não impõe XOR entre os
--     dois porque nenhuma fonte (contrato/anexo) especifica a regra, e é decisão de
--     validação melhor deixada para a ROTA, que já sabe por qual porta a chamada veio.
--   • Reversão (manual, destrutiva):
--       DROP FUNCTION public.ingestao_vencimentos_por_numero(text[]);
--       DROP FUNCTION public.ingestao_carga_ultima(text);
--       DROP FUNCTION public.ingestao_carga_obter(uuid);
--       DROP FUNCTION public.ingestao_carga_concluir(uuid, text, integer, jsonb, integer, integer, integer, integer, jsonb, jsonb, text, integer);
--       DROP FUNCTION public.ingestao_carga_abrir(uuid, text, text, jsonb, bigint, uuid, uuid, timestamptz, text);
--       DELETE FROM storage.buckets WHERE id = 'ingestao-cru'; -- só se o bucket estiver VAZIO
--       DROP SCHEMA ingestao CASCADE;
-- ---------------------------------------------------------------------------

-- ── 1. Schema — deny-by-default, nenhum papel do PostgREST o alcança ─────────────────
CREATE SCHEMA IF NOT EXISTS ingestao;

REVOKE ALL ON SCHEMA ingestao FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA ingestao
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

COMMENT ON SCHEMA ingestao IS
  'Log de carga da ingestão v6.0.0 (contrato ingestao-v1.md). Todo acesso é por RPC SECURITY DEFINER em public, service_role-only — nenhum papel do PostgREST toca este schema direto.';

-- ── 2. ingestao.carga — uma linha por execução (contrato §6) ─────────────────────────
CREATE TABLE ingestao.carga (
  carga_id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  base                  text NOT NULL,
  origem                text NOT NULL,
  chave_id              bigint REFERENCES app.api_chave(id),
  usuario_id            uuid REFERENCES auth.users(id),
  idempotencia          uuid,
  extraido_em           timestamptz,
  recebido_em           timestamptz NOT NULL DEFAULT now(),
  concluido_em          timestamptz,
  arquivos              jsonb NOT NULL DEFAULT '[]'::jsonb,
  linhas                integer,
  somas                 jsonb,
  checksums_conferidos  integer,
  checksums_falhos      integer,
  rejeitadas_por_data   integer,
  pares_novos           integer,
  diff                  jsonb,
  status                text NOT NULL DEFAULT 'aberta',
  erro                  text,
  duracao_ms            integer,
  resposta              jsonb,
  observacao            text,

  CONSTRAINT ingestao_carga_status_valido CHECK (
    status IN ('aberta', 'aplicada', 'rejeitada', 'erro')
  ),
  -- Espelho de BASES_INGESTAO (src/lib/ingestao/bases.ts) — MESMA ordem das cinco.
  CONSTRAINT ingestao_carga_base_valida CHECK (
    base IN (
      'demonstrativo-competencia',
      'vendas-produto',
      'lancamentos-movimentacao',
      'lancamentos-aberto',
      'lancamentos-operacao'
    )
  )
);

COMMENT ON TABLE ingestao.carga IS
  'v6.0.0/M4: uma linha por execução de /api/ingestao/{base} (contrato ingestao-v1.md §6). status=aberta nasce em ingestao_carga_abrir; ingestao_carga_concluir grava o resultado final. resposta guarda o corpo devolvido ao chamador, para a idempotência poder repeti-lo sem refazer trabalho.';

-- Idempotência (contrato §1): mesma chave ⇒ mesma resposta. Tolera NULL (chamador que
-- não mandou x-ingestao-idempotencia) — por isso índice parcial, não CONSTRAINT UNIQUE.
CREATE UNIQUE INDEX idx_ingestao_carga_idempotencia
  ON ingestao.carga (idempotencia)
  WHERE idempotencia IS NOT NULL;

-- Caminho quente de ingestao_carga_ultima: última carga APLICADA de uma base.
CREATE INDEX idx_ingestao_carga_base_status_concluido
  ON ingestao.carga (base, status, concluido_em DESC);

-- RLS deny-by-default (postura dos demais schemas). O app nunca toca ingestao.* direto;
-- as RPCs SECURITY DEFINER (owner postgres) ignoram RLS. O ENABLE é cinto de segurança,
-- não a porta — a porta é o REVOKE abaixo (nenhuma policy é criada).
ALTER TABLE ingestao.carga ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ingestao.carga FROM PUBLIC, anon, authenticated;

-- ── 3. Bucket privado ingestao-cru (idempotente) ──────────────────────────────────────
-- Sem policy em storage.objects → deny-by-default (molde 0165/0127): leitura e escrita
-- só por service_role/URL assinada. file_size_limit é POR OBJETO (50 MB,
-- LIMITE_BYTES_ARQUIVO); o teto de 200 MB por CARGA é app-side (storage.ts).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ingestao-cru', 'ingestao-cru', false, 52428800,
  ARRAY[
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', -- xlsx
    'text/csv'                                                          -- csv (só lancamentos-operacao)
  ]
)
ON CONFLICT (id) DO NOTHING;

-- ── 4. RPCs — SECURITY DEFINER, service_role-ONLY (sem exigir_acesso — ver header) ───

-- Abre uma carga (contrato §2.3 passo 1). Se a chave de idempotência já existe, NÃO
-- cria outra — devolve a linha existente com existente=true, para o chamador distinguir
-- "abri agora" de "já existia" e recuperar a `resposta` se a carga já foi concluída.
CREATE OR REPLACE FUNCTION public.ingestao_carga_abrir(
  p_carga_id      uuid,
  p_base          text,
  p_origem        text,
  p_arquivos      jsonb,
  p_chave_id      bigint      DEFAULT NULL,
  p_usuario_id    uuid        DEFAULT NULL,
  p_idempotencia  uuid        DEFAULT NULL,
  p_extraido_em   timestamptz DEFAULT NULL,
  p_observacao    text        DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row       ingestao.carga;
  v_existente boolean := false;
BEGIN
  -- O `carga_id` NÃO é gerado aqui: ele nasce no passo 1 do contrato (a rota
  -- `/upload-url`) e vai DENTRO do caminho do objeto no bucket
  -- (`{base}/{aaaa}/{mm}/{carga_id}-{n}-{nome}`), que é o que amarra os arquivos à carga.
  -- O passo 1 é deliberadamente SEM ESTADO — a linha só nasce aqui, no passo 3, quando
  -- tudo já é conhecido (os sha256 dos arquivos, `extraido_em`, a origem). Se `abrir`
  -- rodasse no passo 1, `extraido_em` (que o contrato §2.3 só recebe no passo 3) nunca
  -- teria onde ser gravado, e um upload abandonado deixaria linha de carga fantasma.
  IF p_carga_id IS NULL THEN
    RAISE EXCEPTION 'CARGA_ID_OBRIGATORIO: o carga_id é emitido no passo 1 (upload-url) e viaja no caminho do objeto'
      USING ERRCODE = '22023';
  END IF;
  IF p_base IS NULL OR NOT (p_base = ANY (ARRAY[
       'demonstrativo-competencia', 'vendas-produto', 'lancamentos-movimentacao',
       'lancamentos-aberto', 'lancamentos-operacao'
     ]::text[])) THEN
    RAISE EXCEPTION 'BASE_INVALIDA: % não é uma base de ingestão conhecida (contrato ingestao-v1 §3)', p_base
      USING ERRCODE = '22023';
  END IF;
  IF coalesce(btrim(p_origem), '') = '' THEN
    RAISE EXCEPTION 'ORIGEM_OBRIGATORIA: informe x-ingestao-origem' USING ERRCODE = '22023';
  END IF;

  -- Duas formas de "já existe", nesta ordem. (1) A MESMA carga chegando de novo: repetição
  -- do passo 3 depois de um timeout de rede, com o mesmo carga_id. Sem este ramo a
  -- repetição bateria na PK e viraria 500. (2) Chave de idempotência já usada, ainda que
  -- com carga_id novo — é o que o contrato §1 promete ("mesma chave ⇒ mesma resposta, sem
  -- recarregar"), e é o caso de uma RPA que reemitiu o passo 1 antes de repetir o passo 3.
  SELECT * INTO v_row FROM ingestao.carga WHERE carga_id = p_carga_id;
  IF FOUND THEN
    v_existente := true;
  ELSIF p_idempotencia IS NOT NULL THEN
    SELECT * INTO v_row FROM ingestao.carga WHERE idempotencia = p_idempotencia;
    IF FOUND THEN
      v_existente := true;
    END IF;
  END IF;

  IF NOT v_existente THEN
    INSERT INTO ingestao.carga (
      carga_id, base, origem, chave_id, usuario_id, idempotencia,
      extraido_em, arquivos, status, observacao
    ) VALUES (
      p_carga_id, p_base, btrim(p_origem), p_chave_id, p_usuario_id, p_idempotencia,
      p_extraido_em, coalesce(p_arquivos, '[]'::jsonb), 'aberta',
      nullif(btrim(coalesce(p_observacao, '')), '')
    )
    RETURNING * INTO v_row;
  END IF;

  RETURN jsonb_build_object(
    'existente', v_existente,
    'carga_id', v_row.carga_id, 'base', v_row.base, 'origem', v_row.origem,
    'chave_id', v_row.chave_id, 'usuario_id', v_row.usuario_id, 'idempotencia', v_row.idempotencia,
    'extraido_em', v_row.extraido_em, 'recebido_em', v_row.recebido_em, 'concluido_em', v_row.concluido_em,
    'arquivos', v_row.arquivos, 'linhas', v_row.linhas, 'somas', v_row.somas,
    'checksums_conferidos', v_row.checksums_conferidos, 'checksums_falhos', v_row.checksums_falhos,
    'rejeitadas_por_data', v_row.rejeitadas_por_data, 'pares_novos', v_row.pares_novos,
    'diff', v_row.diff, 'status', v_row.status, 'erro', v_row.erro,
    'duracao_ms', v_row.duracao_ms, 'resposta', v_row.resposta, 'observacao', v_row.observacao
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.ingestao_carga_abrir(uuid, text, text, jsonb, bigint, uuid, uuid, timestamptz, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.ingestao_carga_abrir(uuid, text, text, jsonb, bigint, uuid, uuid, timestamptz, text) TO service_role;
COMMENT ON FUNCTION public.ingestao_carga_abrir(uuid, text, text, jsonb, bigint, uuid, uuid, timestamptz, text) IS
  'v6.0.0/M4: abre uma carga (status=aberta) e devolve a linha existente sem duplicar quando a idempotência já foi usada (contrato ingestao-v1 §1/§2.3 passo 1). SEM exigir_acesso no corpo POR DESENHO: esta superfície não tem sessão de usuário — quem autoriza é a rota /api/ingestao/{base} (x-api-key pelo escopo_bases, ou requireAreaApi(admin/uploads) na sessão do card); protegida só por GRANT, service_role-only.';

-- Conclui uma carga (contrato §2.3 passos 4-10). Concluir carga inexistente é erro
-- nomeado, não silêncio.
CREATE OR REPLACE FUNCTION public.ingestao_carga_concluir(
  p_carga_id             uuid,
  p_status               text,
  p_linhas               integer DEFAULT NULL,
  p_somas                jsonb   DEFAULT NULL,
  p_checksums_conferidos integer DEFAULT NULL,
  p_checksums_falhos     integer DEFAULT NULL,
  p_rejeitadas_por_data  integer DEFAULT NULL,
  p_pares_novos          integer DEFAULT NULL,
  p_diff                 jsonb   DEFAULT NULL,
  p_resposta             jsonb   DEFAULT NULL,
  p_erro                 text    DEFAULT NULL,
  p_duracao_ms           integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row ingestao.carga;
BEGIN
  IF p_status IS NULL OR NOT (p_status = ANY (ARRAY['aberta', 'aplicada', 'rejeitada', 'erro']::text[])) THEN
    RAISE EXCEPTION 'STATUS_INVALIDO: % não é um status de carga válido', p_status USING ERRCODE = '22023';
  END IF;

  UPDATE ingestao.carga SET
    status               = p_status,
    linhas               = p_linhas,
    somas                = p_somas,
    checksums_conferidos = p_checksums_conferidos,
    checksums_falhos     = p_checksums_falhos,
    rejeitadas_por_data  = p_rejeitadas_por_data,
    pares_novos          = p_pares_novos,
    diff                 = p_diff,
    resposta             = p_resposta,
    erro                 = p_erro,
    duracao_ms           = p_duracao_ms,
    concluido_em         = now()
  WHERE carga_id = p_carga_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CARGA_NAO_ENCONTRADA: carga % não existe', p_carga_id USING ERRCODE = '22023';
  END IF;

  RETURN jsonb_build_object(
    'carga_id', v_row.carga_id, 'base', v_row.base, 'origem', v_row.origem,
    'chave_id', v_row.chave_id, 'usuario_id', v_row.usuario_id, 'idempotencia', v_row.idempotencia,
    'extraido_em', v_row.extraido_em, 'recebido_em', v_row.recebido_em, 'concluido_em', v_row.concluido_em,
    'arquivos', v_row.arquivos, 'linhas', v_row.linhas, 'somas', v_row.somas,
    'checksums_conferidos', v_row.checksums_conferidos, 'checksums_falhos', v_row.checksums_falhos,
    'rejeitadas_por_data', v_row.rejeitadas_por_data, 'pares_novos', v_row.pares_novos,
    'diff', v_row.diff, 'status', v_row.status, 'erro', v_row.erro,
    'duracao_ms', v_row.duracao_ms, 'resposta', v_row.resposta, 'observacao', v_row.observacao
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.ingestao_carga_concluir(uuid, text, integer, jsonb, integer, integer, integer, integer, jsonb, jsonb, text, integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.ingestao_carga_concluir(uuid, text, integer, jsonb, integer, integer, integer, integer, jsonb, jsonb, text, integer) TO service_role;
COMMENT ON FUNCTION public.ingestao_carga_concluir(uuid, text, integer, jsonb, integer, integer, integer, integer, jsonb, jsonb, text, integer) IS
  'v6.0.0/M4: grava o resultado final de uma carga (status/números medidos/diff/resposta/erro/duração, contrato ingestao-v1 §2.3 passos 4-10). Concluir carga_id inexistente levanta CARGA_NAO_ENCONTRADA, nunca silêncio. SEM exigir_acesso no corpo POR DESENHO: sem sessão de usuário — quem autoriza é a rota /api/ingestao/{base} (x-api-key pelo escopo_bases, ou requireAreaApi(admin/uploads)); protegida só por GRANT, service_role-only.';

-- Lê uma carga por carga_id (ex.: GET /api/ingestao/cargas/{carga_id}, contrato §7).
CREATE OR REPLACE FUNCTION public.ingestao_carga_obter(p_carga_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row ingestao.carga;
BEGIN
  SELECT * INTO v_row FROM ingestao.carga WHERE carga_id = p_carga_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CARGA_NAO_ENCONTRADA: carga % não existe', p_carga_id USING ERRCODE = '22023';
  END IF;

  RETURN jsonb_build_object(
    'carga_id', v_row.carga_id, 'base', v_row.base, 'origem', v_row.origem,
    'chave_id', v_row.chave_id, 'usuario_id', v_row.usuario_id, 'idempotencia', v_row.idempotencia,
    'extraido_em', v_row.extraido_em, 'recebido_em', v_row.recebido_em, 'concluido_em', v_row.concluido_em,
    'arquivos', v_row.arquivos, 'linhas', v_row.linhas, 'somas', v_row.somas,
    'checksums_conferidos', v_row.checksums_conferidos, 'checksums_falhos', v_row.checksums_falhos,
    'rejeitadas_por_data', v_row.rejeitadas_por_data, 'pares_novos', v_row.pares_novos,
    'diff', v_row.diff, 'status', v_row.status, 'erro', v_row.erro,
    'duracao_ms', v_row.duracao_ms, 'resposta', v_row.resposta, 'observacao', v_row.observacao
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.ingestao_carga_obter(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.ingestao_carga_obter(uuid) TO service_role;
COMMENT ON FUNCTION public.ingestao_carga_obter(uuid) IS
  'v6.0.0/M4: lê uma carga por carga_id (ex.: GET /api/ingestao/cargas/{carga_id}, contrato ingestao-v1 §7). carga_id inexistente levanta CARGA_NAO_ENCONTRADA. SEM exigir_acesso no corpo POR DESENHO: sem sessão de usuário — quem autoriza é a rota /api/ingestao (x-api-key pelo escopo_bases, ou requireAreaApi(admin/uploads)); protegida só por GRANT, service_role-only.';

-- Última carga APLICADA de uma base (insumo do diff §2.3 passo 8; na M6, dos alarmes).
-- NULL quando a base ainda não teve nenhuma carga aplicada — estado inicial legítimo,
-- não erro.
CREATE OR REPLACE FUNCTION public.ingestao_carga_ultima(p_base text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row ingestao.carga;
BEGIN
  IF p_base IS NULL OR NOT (p_base = ANY (ARRAY[
       'demonstrativo-competencia', 'vendas-produto', 'lancamentos-movimentacao',
       'lancamentos-aberto', 'lancamentos-operacao'
     ]::text[])) THEN
    RAISE EXCEPTION 'BASE_INVALIDA: % não é uma base de ingestão conhecida (contrato ingestao-v1 §3)', p_base
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row FROM ingestao.carga
   WHERE base = p_base AND status = 'aplicada'
   ORDER BY concluido_em DESC NULLS LAST, recebido_em DESC
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'carga_id', v_row.carga_id, 'base', v_row.base, 'origem', v_row.origem,
    'chave_id', v_row.chave_id, 'usuario_id', v_row.usuario_id, 'idempotencia', v_row.idempotencia,
    'extraido_em', v_row.extraido_em, 'recebido_em', v_row.recebido_em, 'concluido_em', v_row.concluido_em,
    'arquivos', v_row.arquivos, 'linhas', v_row.linhas, 'somas', v_row.somas,
    'checksums_conferidos', v_row.checksums_conferidos, 'checksums_falhos', v_row.checksums_falhos,
    'rejeitadas_por_data', v_row.rejeitadas_por_data, 'pares_novos', v_row.pares_novos,
    'diff', v_row.diff, 'status', v_row.status, 'erro', v_row.erro,
    'duracao_ms', v_row.duracao_ms, 'resposta', v_row.resposta, 'observacao', v_row.observacao
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.ingestao_carga_ultima(text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.ingestao_carga_ultima(text) TO service_role;
COMMENT ON FUNCTION public.ingestao_carga_ultima(text) IS
  'v6.0.0/M4: última carga com status=aplicada de uma base — insumo do diff (contrato ingestao-v1 §2.3 passo 8) e, na M6, dos alarmes. NULL quando a base ainda não tem carga aplicada (estado inicial legítimo). SEM exigir_acesso no corpo POR DESENHO: sem sessão de usuário — quem autoriza é a rota /api/ingestao/{base} (x-api-key pelo escopo_bases, ou requireAreaApi(admin/uploads)); protegida só por GRANT, service_role-only.';

-- ── 5. Índice de vencimentos das bases vizinhas (Lançamentos por Operação) ───────────────
--
-- O CSV cru da "Análise de Operações" NÃO traz `Vencimento` — quem o resolvia era o script R,
-- cruzando por `Número` com as contas a pagar/receber. A decisão 10 do briefing aposenta aqueles
-- 8 XLSX e manda o `Vencimento` vir da base **Aberto**, com **Movimentação** como fallback; o
-- parser da M3 (`parsers/lancamentos-operacao.ts`) já recebe esse índice pronto como parâmetro,
-- e é esta função que o serve.
--
-- Por que ela é indispensável na M4 e não pode esperar: sem índice, todo lançamento sem
-- liquidação fica com `vencimento` nulo, logo `data_final = coalesce(liquidacao, vencimento)`
-- também nulo — e `data_final` nulo apaga `mes_ano` e joga o `status` de "A Receber Futuro"/
-- "A Pagar Futuro" de volta para o tipo. As RPCs de Carteira/Próximos de Weddings somam
-- `SUM(CASE WHEN status = 'A Receber Futuro' …)`: as duas colunas de PREVISTO iriam a zero, em
-- ~4.008 lançamentos. É o invariante 1 da versão ("zero mudança de número em qualquer tela").
--
-- Precedência IDÊNTICA à de `indiceDeVencimentos` no parser: **Aberto vence Movimentação**
-- (a base Aberto é a mais atual para um título que ainda não liquidou). `numero` vazio NUNCA
-- entra — no legado a junção era um `left_join` do dplyr, que casa `NA` com `NA` e fazia toda
-- linha sem número herdar o mesmo vencimento.
--
-- Recebe os números de interesse (os sem liquidação, ~4 mil) em vez de devolver as duas bases
-- inteiras (~130 mil linhas): o payload fica pequeno e o `max_rows` do PostgREST não se aplica
-- porque o retorno é um único `jsonb`.
CREATE OR REPLACE FUNCTION public.ingestao_vencimentos_por_numero(p_numeros text[])
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(jsonb_object_agg(numero, to_char(vencimento, 'YYYY-MM-DD')), '{}'::jsonb)
  FROM (
    SELECT DISTINCT ON (numero) numero, vencimento
    FROM (
      -- prioridade 1 = Aberto (vence); 2 = Movimentação (fallback)
      SELECT btrim(numero) AS numero, vencimento, 1 AS prioridade
        FROM raw.titulos_em_aberto
       WHERE vencimento IS NOT NULL AND btrim(coalesce(numero, '')) <> ''
      UNION ALL
      SELECT btrim(numero), vencimento, 2
        FROM raw.lancamentos_movimentacao
       WHERE vencimento IS NOT NULL AND btrim(coalesce(numero, '')) <> ''
    ) fontes
    WHERE numero = ANY (coalesce(p_numeros, ARRAY[]::text[]))
    ORDER BY numero, prioridade
  ) resolvido;
$$;
REVOKE EXECUTE ON FUNCTION public.ingestao_vencimentos_por_numero(text[]) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.ingestao_vencimentos_por_numero(text[]) TO service_role;
COMMENT ON FUNCTION public.ingestao_vencimentos_por_numero(text[]) IS
  'v6.0.0/M4: vencimento por Número nas bases vizinhas (Aberto vence, Movimentação é fallback) — o cruzamento que resolve o Vencimento de Lançamentos por Operação, cujo CSV de scrape não o traz (briefing decisão 10; contrato ingestao-v1 §4). Sem ele, data_final fica nula nos lançamentos sem liquidação e as somas de A Receber/A Pagar Futuro da Carteira de Weddings vão a zero. SEM exigir_acesso no corpo POR DESENHO: sem sessão de usuário — quem autoriza é a rota /api/ingestao/{base}; protegida só por GRANT, service_role-only.';

NOTIFY pgrst, 'reload schema';
