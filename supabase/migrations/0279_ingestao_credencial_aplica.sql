-- ---------------------------------------------------------------------------
-- 0279 — feat(v6.0.0/M5): a credencial `ingestor` passa a APLICAR as cargas —
--        separa o núcleo de `provisionar_dre_comp_par` para o Demonstrativo poder promover
--        sem a área `financeiro/dre` que a role de máquina não tem, por decisão de produto
--
-- DECLARAÇÃO PRÉVIA (regime aditivo / autônomo):
--   • O QUE FAZ: (1) separa `provisionar_dre_comp_par()` (0257/0260) em NÚCLEO
--     (`provisionar_dre_comp_par__nucleo()`, SEM `exigir_acesso`, service_role-only por GRANT
--     — o molde de retrofit da migration 0121, `<fn>__nucleo`) + WRAPPER (o próprio
--     `provisionar_dre_comp_par()`, MESMO nome/assinatura/GRANTs de sempre — `authenticated,
--     service_role` —, que continua checando `financeiro/dre` antes de delegar); (2)
--     `promover_carga_demonstrativo(jsonb, uuid)` (0278) passa a chamar o NÚCLEO direto, e o
--     bloco `BEGIN...EXCEPTION WHEN insufficient_privilege` que blindava a chamada antiga SAI
--     (motivo no bloco "SOBRE O CATCH REMOVIDO" abaixo); (3) concede à credencial `ingestor` as
--     21 assinaturas geradas por `scripts/credencial/derivar-allowlist.mjs ingestor` a partir de
--     `src/lib/ingestao/rpcs-ingestor.ts` (20 nomes — o pipeline staging→validação→promoção das
--     CINCO bases do contrato `ingestao-v1.md`), usadas **literalmente**, sem edição manual.
--   • DECISÃO DE PRODUTO JÁ TOMADA (não decidida por esta migration): a credencial `ingestor`
--     continua ESTREITA — só `admin/uploads` (role RBAC "Máquina · ingestão", 0274). Ela NÃO
--     ganha `financeiro/dre`. É essa decisão que obriga a separação do núcleo: sem ela,
--     `promover_carga_demonstrativo` rodando com o JWT do `ingestor` bateria em
--     `PERMISSAO_NEGADA` toda vez que chamasse `provisionar_dre_comp_par()` (que exige
--     `financeiro/dre` no próprio corpo) — hoje isso não acontece só porque o caminho de HOJE
--     roda com `service_role` (ramo TRUSTED de `app.exigir_acesso`, skill banco-e-rpc §4/§6),
--     não com o JWT de um usuário. Risco identificado no ACHADO PARA REVISÃO do header da 0278.
--   • POR QUE A SEPARAÇÃO NÃO MUDA NADA PARA QUEM JÁ CONSOME: a tela "Editar estrutura"
--     (`src/app/financeiro/dre/estrutura-competencia/page.tsx`) continua chamando
--     `provisionar_dre_comp_par()` pelo MESMO nome, sem parâmetro, com o MESMO GRANT
--     (`authenticated, service_role`) e o MESMO guard `financeiro/dre` — o corpo do wrapper é
--     literalmente `PERFORM app.exigir_acesso(ARRAY['financeiro/dre']); RETURN
--     public.provisionar_dre_comp_par__nucleo();`. Ninguém do lado humano percebe diferença.
--   • SOBRE O CATCH REMOVIDO (`EXCEPTION WHEN insufficient_privilege`, 0278): ele existia para
--     tolerar EXATAMENTE o erro `42501` que `app.exigir_acesso` levanta quando o chamador não
--     tem `financeiro/dre` — o cenário que esta migration elimina, porque o NÚCLEO
--     (`provisionar_dre_comp_par__nucleo()`) não chama `exigir_acesso`. Com o núcleo, esse ramo do catch não é mais
--     alcançável por PERMISSÃO nenhuma vez — e MANTER um `EXCEPTION` para um erro que não pode
--     mais acontecer é pior do que ruído: se `provisionar_dre_comp_par__nucleo()` viesse a
--     falhar por outro motivo real (constraint violada, bug introduzido por uma migration
--     futura), o Postgres ainda levantaria ERRCODE `42501` por acaso? NÃO — um bug real dentro
--     do núcleo levantaria o ERRCODE daquele erro específico (ex.: `23505` de unique_violation),
--     não `42501`; o catch estreito já não o pegaria mesmo mantido, então ele ficaria como
--     comentário morto prometendo uma tolerância que nunca mais dispara. Removê-lo é a decisão
--     certa: se o núcleo falhar agora, a exceção sobe CRUA e derruba a promoção inteira (a carga
--     é reprovada, não silenciosamente aceita com um aviso) — o comportamento correto para um
--     erro de DADO, ao contrário do que se tolerava antes (um erro de PERMISSÃO).
--   • ADITIVA / RETROCOMPATÍVEL: só `CREATE OR REPLACE FUNCTION` — uma de nome NOVO (o núcleo,
--     nunca existiu), duas que preservam a assinatura exata das funções já existentes (o wrapper
--     e `promover_carga_demonstrativo`, nenhum parâmetro muda) — mais `GRANT`/`REVOKE`. Nenhum
--     `DROP`, nenhum `TRUNCATE`, nenhuma coluna ou tabela tocada, nenhum comportamento
--     OBSERVÁVEL PELOS CONSUMIDORES DE HOJE muda (o único comportamento que muda é o caminho
--     INTERNO de uma chamada que, até aqui, só era alcançada por `service_role`).
--   • OS 21 GRANTs (bloco 4 abaixo) SÃO LITERAIS do output de
--     `scripts/credencial/derivar-allowlist.mjs ingestor` — não editados à mão. Um deles,
--     `promover_carga_vendas()` (zero-arg, 0116), é a versão ÓRFÃ que a 0278 já registrou para
--     aposentar no GATE 3/M10 (o derivador concede TODAS as assinaturas de um nome, por
--     desenho — não distingue órfã de viva). Quem escrever a migration destrutiva daquele GATE
--     precisa saber: o `REVOKE`/o `DROP` daquela função tem de levar junto o `GRANT` que ESTA
--     migration concede a `ingestor` para ela. As outras 4 (`limpar_staging_vendas`,
--     `inserir_lote_staging(jsonb)`, `validar_carga_staging()`, `promover_carga_vendas()`
--     zero-arg) já eram concedidas desde a 0274 — esta migration as REPETE (idempotente,
--     `GRANT` não falha se já concedido) porque o derivador as inclui nas 21; não há regressão.
--   • Reversão (manual, destrutiva):
--       -- 1. Devolver a allowlist ao estado da 0274 (só o pipeline de Vendas):
--       REVOKE EXECUTE ON FUNCTION public.inserir_lote_staging_demonstrativo(jsonb) FROM ingestor;
--       REVOKE EXECUTE ON FUNCTION public.inserir_lote_staging_movimentacao(jsonb) FROM ingestor;
--       REVOKE EXECUTE ON FUNCTION public.inserir_lote_staging_operacao(jsonb) FROM ingestor;
--       REVOKE EXECUTE ON FUNCTION public.inserir_lote_staging_aberto(jsonb) FROM ingestor;
--       REVOKE EXECUTE ON FUNCTION public.limpar_staging_demonstrativo() FROM ingestor;
--       REVOKE EXECUTE ON FUNCTION public.limpar_staging_movimentacao() FROM ingestor;
--       REVOKE EXECUTE ON FUNCTION public.limpar_staging_operacao() FROM ingestor;
--       REVOKE EXECUTE ON FUNCTION public.limpar_staging_aberto() FROM ingestor;
--       REVOKE EXECUTE ON FUNCTION public.promover_carga_demonstrativo(jsonb, uuid) FROM ingestor;
--       REVOKE EXECUTE ON FUNCTION public.promover_carga_movimentacao(jsonb, uuid) FROM ingestor;
--       REVOKE EXECUTE ON FUNCTION public.promover_carga_operacao(jsonb, uuid) FROM ingestor;
--       REVOKE EXECUTE ON FUNCTION public.promover_carga_aberto(jsonb, uuid) FROM ingestor;
--       REVOKE EXECUTE ON FUNCTION public.promover_carga_vendas(jsonb, uuid) FROM ingestor;
--       REVOKE EXECUTE ON FUNCTION public.validar_carga_demonstrativo() FROM ingestor;
--       REVOKE EXECUTE ON FUNCTION public.validar_carga_movimentacao() FROM ingestor;
--       REVOKE EXECUTE ON FUNCTION public.validar_carga_operacao() FROM ingestor;
--       REVOKE EXECUTE ON FUNCTION public.validar_carga_aberto() FROM ingestor;
--       -- (as 4 de sempre — inserir_lote_staging(jsonb)/limpar_staging_vendas()/
--       --  validar_carga_staging()/promover_carga_vendas() zero-arg — permanecem concedidas,
--       --  como estavam desde a 0274.)
--       -- 2. Reaplicar o corpo de `promover_carga_demonstrativo` do CATÁLOGO VIVO anterior a
--       --    esta migration (= o texto da 0278, com o bloco BEGIN...EXCEPTION de volta).
--       -- 3. Reaplicar o corpo de `provisionar_dre_comp_par()` do CATÁLOGO VIVO anterior a esta
--       --    migration (dump `provisionar-vivo.sql`, extraído 22/09/2026, fora do repositório —
--       --    a versão com `PERFORM app.exigir_acesso(...)` inline, sem delegar a nenhum núcleo).
--       DROP FUNCTION public.provisionar_dre_comp_par__nucleo();
-- ---------------------------------------------------------------------------

-- ═════════════════════════════════════════════════════════════════════════════════════
-- 1. NÚCLEO de provisionar_dre_comp_par — SEM exigir_acesso, service_role-only por GRANT
--    (molde <fn>__nucleo, migration 0121). Corpo = o do catálogo vivo (provisionar-vivo.sql,
--    22/09/2026) MENOS a linha `PERFORM app.exigir_acesso(...)`, que fica só no wrapper.
-- ═════════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.provisionar_dre_comp_par__nucleo()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_novos int;
BEGIN
  INSERT INTO financeiro.dre_comp_par (grupo_arquivo, descricao_arquivo, sub_chave, rotulo_linha)
  SELECT DISTINCT r.grupo, r.descricao, NULL, r.descricao
  FROM raw.demonstrativo_competencia r
  WHERE NOT EXISTS (
    SELECT 1 FROM financeiro.dre_comp_par p
    WHERE p.grupo_arquivo = r.grupo AND p.descricao_arquivo = r.descricao
  );
  GET DIAGNOSTICS v_novos = ROW_COUNT;

  RETURN jsonb_build_object(
    'novos', v_novos,
    'total', (SELECT count(*) FROM financeiro.dre_comp_par),
    'bandeja', (SELECT count(*) FROM financeiro.dre_comp_par
                 WHERE sub_chave IS NULL AND NOT excluida)
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.provisionar_dre_comp_par__nucleo() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.provisionar_dre_comp_par__nucleo() TO service_role;
COMMENT ON FUNCTION public.provisionar_dre_comp_par__nucleo() IS
  'v6.0.0/M5: NÚCLEO de provisionar_dre_comp_par (0257/0260) — insere, com sub_chave NULL, todo par (grupo, descrição) presente em raw.demonstrativo_competencia e ausente de financeiro.dre_comp_par. Idempotente por construção (NOT EXISTS). SEM exigir_acesso no corpo POR DESENHO (molde <fn>__nucleo, 0121): quem checa financeiro/dre é o WRAPPER público (provisionar_dre_comp_par, mesmo nome/assinatura de sempre) — este núcleo é chamado por ELE e por promover_carga_demonstrativo (RPC de carga, protegida só por GRANT). Protegido só por GRANT: service_role executa (o wrapper, SECURITY DEFINER, e a RPC de carga, também SECURITY DEFINER, alcançam-no como o owner da função, independente de quem fez a requisição original).';

-- ═════════════════════════════════════════════════════════════════════════════════════
-- 2. WRAPPER — MESMO nome/assinatura/GRANTs de sempre. Único comportamento observável:
--    delega ao núcleo em vez de fazer o trabalho inline. O guard financeiro/dre não sai daqui.
-- ═════════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.provisionar_dre_comp_par()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/dre']);
  RETURN public.provisionar_dre_comp_par__nucleo();
END;
$$;
REVOKE EXECUTE ON FUNCTION public.provisionar_dre_comp_par() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.provisionar_dre_comp_par() TO authenticated, service_role;
COMMENT ON FUNCTION public.provisionar_dre_comp_par() IS
  'v6.0.0/M5: WRAPPER de RBAC — exige financeiro/dre e delega a provisionar_dre_comp_par__nucleo() (separação introduzida nesta migration; molde <fn>__nucleo, 0121). Mesmo nome/assinatura/GRANTs de sempre (0257/0260): a tela "Editar estrutura" (estrutura-competencia/page.tsx) continua chamando-a sem perceber a separação. Existe para que a credencial de máquina `ingestor` (admin/uploads apenas, SEM financeiro/dre — 0274) possa promover o Demonstrativo chamando o núcleo por dentro de promover_carga_demonstrativo, sem herdar este guard.';

-- ═════════════════════════════════════════════════════════════════════════════════════
-- 3. promover_carga_demonstrativo — passa a chamar o NÚCLEO direto; o catch
--    `insufficient_privilege` da 0278 SAI (ver "SOBRE O CATCH REMOVIDO" no header do arquivo).
--    Corpo idêntico ao da 0278, exceto o bloco de chamada a provisionar_dre_comp_par.
-- ═════════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.promover_carga_demonstrativo(p_checksums jsonb, p_carga_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existente    jsonb;
  v_total_stg    int;
  v_chk          jsonb;
  v_linhas_sql   int;
  v_centavos_sql bigint;
  v_conferidos   int := 0;
  v_falhas       jsonb := '[]'::jsonb;
  v_avisos       text[] := '{}';
  v_prov         jsonb;
  v_result       jsonb;
BEGIN
  IF p_carga_id IS NULL THEN
    RAISE EXCEPTION 'CARGA_ID_OBRIGATORIO: promover_carga_demonstrativo exige carga_id' USING ERRCODE = '22023';
  END IF;
  IF p_checksums IS NULL OR jsonb_typeof(p_checksums) <> 'array' THEN
    RAISE EXCEPTION 'CHECKSUMS_OBRIGATORIOS: promover_carga_demonstrativo exige p_checksums (array jsonb)' USING ERRCODE = '22023';
  END IF;

  -- ⚠️ Array VAZIO não passa. Sem isto, `p_checksums = '[]'` faz o loop de conferência rodar zero
  -- vezes, `v_falhas` fica vazio, e a função TROCA A BASE INTEIRA devolvendo sucesso com
  -- `checksums_conferidos: 0` — pela porta de trás, o mesmo efeito que o invariante 5 do briefing
  -- ("checksum falho nunca aplica") existe para impedir. Um checksum AUSENTE não é "falho", mas
  -- o resultado prático é idêntico: base substituída sem nenhuma verificação. Fecha o caso óbvio
  -- ("esqueci de anexar os checksums") sem exigir que a SQL conheça a contagem esperada por base,
  -- que varia com o número de arquivos e de categorias. Achado ALTO do `revisor-db`.
  IF jsonb_array_length(p_checksums) = 0 THEN
    RAISE EXCEPTION 'CHECKSUM_AUSENTE: esta base é conferida por checksum e a carga não trouxe nenhum (contrato ingestao-v1 §4)'
      USING ERRCODE = '22023';
  END IF;

  SET LOCAL lock_timeout = '10s';
  PERFORM pg_advisory_xact_lock(4017010); -- chave própria da base Demonstrativo

  SELECT resultado INTO v_existente FROM ingestao.promocao
   WHERE base = 'demonstrativo-competencia' AND carga_id = p_carga_id;
  IF FOUND THEN
    RETURN v_existente;
  END IF;

  SELECT count(*) INTO v_total_stg FROM raw.demonstrativo_competencia_staging;
  IF v_total_stg = 0 THEN
    RAISE EXCEPTION 'Carga abortada: staging vazia — nada a promover.';
  END IF;

  TRUNCATE raw.demonstrativo_competencia RESTART IDENTITY;
  INSERT INTO raw.demonstrativo_competencia (
    arquivo_origem, tipo, grupo, descricao, ano, mes, mes_num, competencia, valor
  )
  SELECT
    arquivo_origem, tipo, grupo, descricao, ano, mes, mes_num, competencia, valor
  FROM raw.demonstrativo_competencia_staging;

  -- ── Conferência do checksum CONTRA O QUE FICOU GRAVADO (anexo M5 §4) ────────────────────
  -- `chave` é objeto {tipo?, grupo?, descricao?, ano?} — as colunas que compõem o subtotal
  -- daquele nível do pivot, chaveadas por NOME (ver contrato do checksum no header da 0278).
  FOR v_chk IN SELECT * FROM jsonb_array_elements(p_checksums)
  LOOP
    IF v_chk->>'centavos' IS NULL THEN
      RAISE EXCEPTION 'CHECKSUM_INVALIDO: checksum sem "centavos" (escopo %)', v_chk->>'escopo'
        USING ERRCODE = '22023';
    END IF;

    SELECT count(*), coalesce(round(sum(r.valor) * 100), 0)::bigint
      INTO v_linhas_sql, v_centavos_sql
    FROM raw.demonstrativo_competencia r
    WHERE ( (v_chk->'chave'->>'tipo')      IS NULL OR r.tipo      = (v_chk->'chave'->>'tipo') )
      AND ( (v_chk->'chave'->>'grupo')     IS NULL OR r.grupo     = (v_chk->'chave'->>'grupo') )
      AND ( (v_chk->'chave'->>'descricao') IS NULL OR r.descricao = (v_chk->'chave'->>'descricao') )
      AND ( (v_chk->'chave'->>'ano')       IS NULL OR r.ano       = (v_chk->'chave'->>'ano')::int );

    v_conferidos := v_conferidos + 1;

    IF v_centavos_sql <> (v_chk->>'centavos')::bigint
       OR (v_chk->>'linhas' IS NOT NULL AND v_linhas_sql <> (v_chk->>'linhas')::int) THEN
      v_falhas := v_falhas || jsonb_build_object(
        'escopo', v_chk->>'escopo', 'chave', v_chk->'chave',
        'centavos_esperado', (v_chk->>'centavos')::bigint, 'centavos_gravado', v_centavos_sql,
        'linhas_esperadas', v_chk->>'linhas', 'linhas_gravadas', v_linhas_sql
      );
    END IF;
  END LOOP;

  IF jsonb_array_length(v_falhas) > 0 THEN
    RAISE EXCEPTION 'CHECKSUM_FALHOU: % de % conferência(s) não fecharam contra o gravado: %',
      jsonb_array_length(v_falhas), v_conferidos, left(v_falhas::text, 2000)
      USING ERRCODE = '22023';
  END IF;

  -- 0279: chama o NÚCLEO direto (provisionar_dre_comp_par__nucleo) — não mais a RPC pública
  -- provisionar_dre_comp_par(), que agora é wrapper+guard financeiro/dre para o consumidor
  -- humano ("Editar estrutura"). O catch `EXCEPTION WHEN insufficient_privilege` que existia
  -- aqui na 0278 SAIU: ele blindava exatamente o erro de PERMISSÃO que o wrapper levantava
  -- quando o chamador não tinha financeiro/dre — cenário que deixou de existir, porque o núcleo
  -- não chama exigir_acesso. Mantê-lo seria capturar um ERRCODE que este caminho não pode mais
  -- produzir por este motivo, escondendo sob "aviso não-bloqueante" um bug real de outra
  -- natureza (constraint violada, erro de uma migration futura) — que agora sobe CRU e reverte
  -- a promoção inteira, como convém a um erro de DADO (ver header do arquivo desta migration).
  v_prov := public.provisionar_dre_comp_par__nucleo();

  v_result := jsonb_build_object(
    'linhas', v_total_stg,
    'checksums_conferidos', v_conferidos,
    'checksums_nao_conferiveis', 0,
    'pares_novos', (v_prov->>'novos')::int,
    'avisos', to_jsonb(v_avisos)
  );

  INSERT INTO ingestao.promocao (base, carga_id, resultado)
  VALUES ('demonstrativo-competencia', p_carga_id, v_result)
  ON CONFLICT (base, carga_id) DO NOTHING;

  TRUNCATE raw.demonstrativo_competencia_staging RESTART IDENTITY;

  RETURN v_result;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.promover_carga_demonstrativo(jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.promover_carga_demonstrativo(jsonb, uuid) TO service_role;
COMMENT ON FUNCTION public.promover_carga_demonstrativo(jsonb, uuid) IS
  'v6.0.0/M5: promove a staging de Demonstrativo para raw.demonstrativo_competencia numa transação única (TRUNCATE + INSERT…SELECT), conferindo os checksums do arquivo contra o GRAVADO (contrato ingestao-v1 §4) — RAISE em qualquer divergência, base anterior intacta. Chama provisionar_dre_comp_par__nucleo() diretamente (0279) — sem o catch de insufficient_privilege que a 0278 tinha, porque este caminho não passa mais por exigir_acesso; uma falha real do núcleo agora reverte a carga, em vez de virar aviso. Idempotente por (base, carga_id) via ingestao.promocao. SEM exigir_acesso no corpo POR DESENHO: RPC de carga, protegida por GRANT — só service_role/ingestor executam (mesma classe de promover_carga_vendas, 0269).';

-- ═════════════════════════════════════════════════════════════════════════════════════
-- 4. Allowlist da credencial ingestor — 21 assinaturas, LITERAIS do output de
--    `scripts/credencial/derivar-allowlist.mjs ingestor` (fonte: src/lib/ingestao/rpcs-ingestor.ts,
--    20 nomes). O nome `promover_carga_vendas` tem DUAS assinaturas — a zero-arg (0116), órfã a
--    partir desta migration (o servidor troca para a de dois parâmetros em missão futura; o
--    DROP dela é a destrutiva do GATE 3/M10, junto das demais `truncar_*`/`inserir_lote_*`
--    aposentadas ali) — e a nova (jsonb, uuid); o derivador concede TODAS as assinaturas de um
--    nome, por desenho, então as duas recebem o grant abaixo.
-- ═════════════════════════════════════════════════════════════════════════════════════

GRANT EXECUTE ON FUNCTION public.inserir_lote_staging(p_linhas jsonb) TO ingestor;
GRANT EXECUTE ON FUNCTION public.inserir_lote_staging_aberto(p_linhas jsonb) TO ingestor;
GRANT EXECUTE ON FUNCTION public.inserir_lote_staging_demonstrativo(p_linhas jsonb) TO ingestor;
GRANT EXECUTE ON FUNCTION public.inserir_lote_staging_movimentacao(p_linhas jsonb) TO ingestor;
GRANT EXECUTE ON FUNCTION public.inserir_lote_staging_operacao(p_linhas jsonb) TO ingestor;
GRANT EXECUTE ON FUNCTION public.limpar_staging_aberto() TO ingestor;
GRANT EXECUTE ON FUNCTION public.limpar_staging_demonstrativo() TO ingestor;
GRANT EXECUTE ON FUNCTION public.limpar_staging_movimentacao() TO ingestor;
GRANT EXECUTE ON FUNCTION public.limpar_staging_operacao() TO ingestor;
GRANT EXECUTE ON FUNCTION public.limpar_staging_vendas() TO ingestor;
GRANT EXECUTE ON FUNCTION public.promover_carga_aberto(p_checksums jsonb, p_carga_id uuid) TO ingestor;
GRANT EXECUTE ON FUNCTION public.promover_carga_demonstrativo(p_checksums jsonb, p_carga_id uuid) TO ingestor;
GRANT EXECUTE ON FUNCTION public.promover_carga_movimentacao(p_checksums jsonb, p_carga_id uuid) TO ingestor;
GRANT EXECUTE ON FUNCTION public.promover_carga_operacao(p_checksums jsonb, p_carga_id uuid) TO ingestor;
GRANT EXECUTE ON FUNCTION public.promover_carga_vendas() TO ingestor;
GRANT EXECUTE ON FUNCTION public.promover_carga_vendas(p_checksums jsonb, p_carga_id uuid) TO ingestor;
GRANT EXECUTE ON FUNCTION public.validar_carga_aberto() TO ingestor;
GRANT EXECUTE ON FUNCTION public.validar_carga_demonstrativo() TO ingestor;
GRANT EXECUTE ON FUNCTION public.validar_carga_movimentacao() TO ingestor;
GRANT EXECUTE ON FUNCTION public.validar_carga_operacao() TO ingestor;
GRANT EXECUTE ON FUNCTION public.validar_carga_staging() TO ingestor;

NOTIFY pgrst, 'reload schema';
