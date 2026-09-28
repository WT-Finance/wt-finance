-- ---------------------------------------------------------------------------
-- 0278 — feat(v6.0.0/M5): pipeline atômico de carga para as quatro bases restantes
--        + promover_carga_vendas(jsonb, uuid) com checksum conferido no banco
--
-- DECLARAÇÃO PRÉVIA (regime aditivo / autônomo):
--   • O QUE FAZ: dezesseis RPCs NOVAS — `limpar_staging_{base}()`,
--     `inserir_lote_staging_{base}(jsonb)`, `validar_carga_{base}()` e
--     `promover_carga_{base}(p_checksums jsonb, p_carga_id uuid)` para as quatro bases
--     `demonstrativo`, `movimentacao`, `aberto` e `operacao` (anexo M5 §2/§3) — mesmo molde de
--     `promover_carga_vendas` (catálogo vivo, `promocao dentro de uma transação, pg_advisory_xact_lock,
--     TRUNCATE + INSERT…SELECT + regenerar/provisionar/transform dentro da mesma transação`);
--     mais UMA sobrecarga nova `promover_carga_vendas(p_checksums jsonb, p_carga_id uuid)`; mais
--     um `CREATE OR REPLACE` de `inserir_lote_staging(jsonb)` (Vendas) para gravar a coluna
--     `intermediario` que a 0277 acrescentou.
--   • `CREATE OR REPLACE` NÃO adiciona parâmetro (ADR-0126) — por isso `promover_carga_vendas`
--     ganha SOBRECARGA nova em vez de `DROP FUNCTION` + `CREATE` (que seria destrutiva, TTY):
--     saída (a) do anexo §3. A versão zero-arg (0116) fica INTOCADA e passa a ser órfã de
--     chamador (o servidor troca para a de dois parâmetros numa missão futura, junto da troca de
--     `aplicar.ts` — anexo item 9, fora do escopo desta missão); o `DROP` dela é a destrutiva do
--     GATE 3/M10, no MESMO lote das outras `truncar_*`/`inserir_lote_*` que este briefing já
--     havia planejado aposentar ali.
--   • ADITIVA / RETROCOMPATÍVEL: só `CREATE OR REPLACE FUNCTION` de RPCs NOVAS (16) + UMA
--     sobrecarga nova de função existente (mesmo nome, assinatura DIFERENTE — `pg_proc` trata
--     como objeto novo) + UM `CREATE OR REPLACE` que só ACRESCENTA uma coluna ao INSERT de uma
--     função já existente (`inserir_lote_staging`, mesma assinatura `(jsonb)` de sempre) +
--     `REVOKE`/`GRANT`. Nenhuma função pré-existente perde comportamento; a versão zero-arg de
--     `promover_carga_vendas` não é tocada.
--   • Por que nenhuma chama `app.exigir_acesso`: mesma classe de `promover_carga_vendas` (0269)
--     e das quatro RPCs de `ingestao.carga` (0276) — esta superfície não tem sessão de usuário,
--     é RPC de CARGA chamada pela rota `/api/ingestao/{base}` (hoje sempre com `service_role`,
--     via `getAdminClient()` — a allowlist da credencial `ingestor` para estas 16 assinaturas
--     NOVAS ainda não existe: `src/lib/ingestao/rpcs-ingestor.ts` só lista o pipeline de Vendas
--     hoje, e esta migration não o toca — é `src/`, fora do escopo desta missão). Protegida só
--     por GRANT: `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated` + `GRANT ... TO
--     service_role`, explícitos em cada uma. Cada COMMENT ON FUNCTION cita "service_role" —
--     há um teste vivo (`rpc-contrato.test.ts`, D2-006/D2-016) que confere isso por regex nas
--     quatro RPCs da 0276 e em `promover_carga_vendas`; como esse teste busca por NOME (sem
--     `pronargs`), depois desta migration ele passa a ver DUAS linhas de catálogo para
--     `public.promover_carga_vendas` (a zero-arg e a nova) — inofensivo porque as DUAS têm
--     "service_role" no comentário (qualquer uma que o `Map` do teste retenha satisfaz o
--     regex), mas é uma imprecisão que o out-briefing desta missão registra para o `revisor`.
--   • ⚠️ ACHADO PARA REVISÃO — risco futuro de RBAC: `promover_carga_demonstrativo` chama
--     `public.provisionar_dre_comp_par()` (0257), que TEM `PERFORM app.exigir_acesso(ARRAY
--     ['financeiro/dre'])` no próprio corpo. Isso PASSA hoje porque só `service_role` alcança
--     este caminho (`service_role` é o ramo TRUSTED de `exigir_acesso`, skill banco-e-rpc §6).
--     Quando uma migration futura conceder `EXECUTE` à credencial `ingestor` sobre
--     `promover_carga_demonstrativo` (fechando a allowlist que falta, comentário acima) — a
--     role RBAC "Máquina · ingestão" (0274) só tem a área `admin/uploads`, NÃO `financeiro/dre`
--     — essa chamada interna vai passar a levantar `PERMISSAO_NEGADA` e abortar a promoção
--     inteira. Por isso o corpo abaixo blinda essa chamada com `BEGIN...EXCEPTION WHEN
--     insufficient_privilege` — catch ESTREITO no ERRCODE 42501 que `app.exigir_acesso` levanta,
--     e NÃO `WHEN OTHERS`, que engoliria também um bug real dentro de `provisionar_dre_comp_par`
--     (achado ALTO do `revisor-db`). A semântica NÃO-BLOQUEANTE é a mesma que `aplicar.ts` já tem
--     hoje para esta etapa: falha de permissão vira AVISO, não erro de carga — o que evita a
--     quebra de comportamento HOJE, mas quando `ingestor` ganhar esta allowlist o aviso vai
--     aparecer em TODA carga de Demonstrativo feita por ela, mascarando uma falha sistemática de
--     permissão como se fosse intermitente. Decisão
--     para esse momento: dar `financeiro/dre` à role "Máquina · ingestão", OU tornar
--     `provisionar_dre_comp_par` tolerante a chamada sem RBAC quando vier de dentro de uma
--     função SECURITY DEFINER de carga. Não decidido aqui — fora do escopo desta missão.
--   • CONTRATO DO CHECKSUM (jsonb) que toda `promover_carga_{base}(p_checksums, ...)` lê — um
--     objeto por checksum, dentro de um ARRAY jsonb:
--       { "escopo":   text,                    -- nível do arquivo ('grupo'|'categoria'|'total-arquivo'|
--                                                  'tipo'|'grupo'|'descricao'|'ano'|'total-geral'|'arquivo')
--         "chave":    jsonb OBJETO {coluna: valor, ...},  -- NUNCA array posicional — ver nota abaixo
--         "campo":    text,                    -- qual coluna monetária este checksum soma
--         "linhas":   integer | null,           -- contagem esperada; null = arquivo não declara
--         "centavos": bigint }                  -- SEMPRE Checksum.centavosArredondados (comum.ts),
--                                                  NUNCA centavosApurados — é o único que corresponde
--                                                  ao que a coluna NUMERIC(18,2) guarda após o INSERT
--     ⚠️ A "tolerância 0,005" que o contrato §4 dá ao Demonstrativo NÃO vira janela de
--     comparação aqui: ela já se resolve em ARREDONDAR ANTES de comparar. Dos dois lados a
--     grandeza é centavo INTEIRO, e a comparação é de igualdade exata. Quem for implementar o
--     lado TypeScript não deve tentar reproduzir uma margem que não existe neste nível.
--     `chave` é um OBJETO chaveado pelo NOME REAL da coluna (ex.: {"grupo_categoria": "X"}), não
--     um array por posição: no Demonstrativo a ORDEM em que os campos do pivot aparecem no
--     arquivo é DESCOBERTA por nome (parsers/demonstrativo-competencia.ts), não fixa — um array
--     posicional exigiria a SQL saber essa ordem, que ela não tem como saber. Com chave por nome,
--     o SQL abaixo filtra genericamente com `(chave->>'coluna' IS NULL OR r.coluna = chave->>'coluna')`
--     para cada coluna candidata: chave ausente/nula = "não filtra por esta coluna" (é assim que o
--     total do arquivo, com `chave = {}`, soma a tabela inteira sem nenhum caso especial). Isto é
--     uma FORMA MAIS ROBUSTA do que o anexo descreve em prosa ("chave (array)") — decisão desta
--     missão, registrada para quem for escrever o serializador em `src/` (fora do escopo daqui):
--     é ele quem precisa remontar `Checksum.chave` (posicional, ordem do pivot) para este formato
--     (por nome de coluna), usando `nivelDoCampo`/`camposNorm` que o parser já calcula. Para
--     Movimentação/Aberto/Vendas a remontagem é TRIVIAL (a chave já usa os MESMOS nomes de coluna
--     do parser: grupo_categoria/categoria/arquivo_origem); só o Demonstrativo precisa do remapeamento
--     de posição → nome de campo.
--   • QUAIS CHECKSUMS CADA BASE CONSEGUE REAGRUPAR NO BANCO (pedido explícito da missão):
--       - Demonstrativo: TODOS os 557 (556 subtotais + Total Geral) são reagrupáveis por SOMA
--         (GROUP BY tipo/grupo/descricao/ano, com o `chave` por nome de coluna acima) — as quatro
--         colunas EXISTEM em raw.demonstrativo_competencia. Mas esta base NUNCA declara CONTAGEM em
--         nível de subtotal nem no Total Geral (linhasDeclaradas é sempre null no parser) — não é
--         limitação do GROUP BY, é o formato do próprio arquivo: só a dimensão de SOMA é conferível.
--       - Movimentação/Aberto: os 148+1 / 95+1 são TODOS reagrupáveis (soma E contagem, ambas
--         declaradas pelo outline) — GROUP BY grupo_categoria / (grupo_categoria, categoria) / sem
--         filtro (total).
--       - Vendas: por arquivo, 2 dos 4 campos somados são reagrupáveis contra o gravado
--         (`valor_total`, `receitas` — colunas reais de raw.vendas_excel) mais a CONTAGEM (presa ao
--         campo valor_total). Os outros 2 (`total_produtos_moeda_origem`, `reembolso_ao_cliente`)
--         NÃO têm coluna de destino em raw.vendas_excel/staging — são conferidos SÓ no servidor
--         (checksumsFalhos, antes desta chamada); a RPC os RECEBE mas não reconfere, e conta-os
--         em `checksums_nao_conferiveis` no jsonb de retorno (nunca finge conferir).
--       - Operação: NENHUM checksum monetário no arquivo (contrato §4) — só o cruzamento de
--         Vencimento contra Aberto∪Movimentação, que é ALARME (nunca bloqueia), calculado a partir
--         da coluna `vencimento` já resolvida no servidor antes do staging.
--     Em toda base o retorno jsonb distingue `checksums_conferidos` de `checksums_nao_conferiveis`
--     — "conferi 0 de N" e "conferi N de N" nunca têm a mesma aparência (é o que sumiu na M4).
--   • CHAVES DE ADVISORY LOCK (pg_advisory_xact_lock), únicas no espaço de bigint do projeto:
--       4017001  vendas-produto             (0116/0135 — NÃO muda; a sobrecarga nova usa A MESMA
--                                             chave da versão zero-arg, de propósito: as duas
--                                             tocam raw.vendas_excel/staging e NUNCA podem correr
--                                             juntas)
--       4017010  demonstrativo-competencia
--       4017020  lancamentos-movimentacao
--       4017030  lancamentos-aberto
--       4017040  lancamentos-operacao
--       4017050  COMPARTILHADA (movimentação ∩ aberto) — tomada pelas DUAS logo antes de chamar
--                `regenerar_fluxo_caixa()` (que lê as DUAS bases e reconstrói
--                `financeiro.fato_fluxo` inteiro via TRUNCATE+INSERT): sem isto, uma promoção de
--                Movimentação e uma de Aberto rodando ao mesmo tempo poderiam intercalar o
--                TRUNCATE de uma com o INSERT da outra. Decisão desta missão, além do que o anexo
--                pede literalmente ("cada base ganha a sua [chave]") — a chave própria de cada
--                base sozinha NÃO veda esta corrida, porque são bases DIFERENTES.
--     `SET LOCAL lock_timeout = '10s'` em toda `promover_carga_*` nova: valor não especificado em
--     nenhuma fonte (anexo/contrato/briefing) — escolha desta missão, para o SEGUNDO chamador
--     falhar rápido (e a rota decidir 409) em vez de enfileirar indefinidamente atrás de uma
--     promoção em curso. Sinalizado para o revisor-db confirmar o valor.
--   • Idempotência: cada `promover_carga_{base}` consulta `ingestao.promocao` por
--     `(base, carga_id)` LOGO APÓS tomar o advisory lock da base — a serialização por base torna
--     impossível duas transações concorrentes para o MESMO carga_id chegarem ao INSERT ao mesmo
--     tempo (ao contrário de `ingestao_carga_abrir`, 0276, que não tinha essa serialização e por
--     isso precisou de tratamento de `unique_violation`); ainda assim o INSERT final usa
--     `ON CONFLICT (base, carga_id) DO NOTHING` como rede adicional, sem custo.
--   • Reversão (manual, destrutiva):
--       DROP FUNCTION public.promover_carga_vendas(jsonb, uuid);
--       DROP FUNCTION public.promover_carga_operacao(jsonb, uuid);
--       DROP FUNCTION public.validar_carga_operacao();
--       DROP FUNCTION public.inserir_lote_staging_operacao(jsonb);
--       DROP FUNCTION public.limpar_staging_operacao();
--       DROP FUNCTION public.promover_carga_aberto(jsonb, uuid);
--       DROP FUNCTION public.validar_carga_aberto();
--       DROP FUNCTION public.inserir_lote_staging_aberto(jsonb);
--       DROP FUNCTION public.limpar_staging_aberto();
--       DROP FUNCTION public.promover_carga_movimentacao(jsonb, uuid);
--       DROP FUNCTION public.validar_carga_movimentacao();
--       DROP FUNCTION public.inserir_lote_staging_movimentacao(jsonb);
--       DROP FUNCTION public.limpar_staging_movimentacao();
--       DROP FUNCTION public.promover_carga_demonstrativo(jsonb, uuid);
--       DROP FUNCTION public.validar_carga_demonstrativo();
--       DROP FUNCTION public.inserir_lote_staging_demonstrativo(jsonb);
--       DROP FUNCTION public.limpar_staging_demonstrativo();
--       -- inserir_lote_staging(jsonb): reaplicar o corpo do CATÁLOGO VIVO anterior a esta
--       --   migration (dump `molde-vivo.txt` entregue para a missão M5, 22/09/2026, fora do
--       --   repositório) — sem a coluna intermediario.
-- ---------------------------------------------------------------------------

-- ═════════════════════════════════════════════════════════════════════════════════════
-- DEMONSTRATIVO DE COMPETÊNCIA
-- ═════════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.limpar_staging_demonstrativo()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(4017010); -- chave própria da base Demonstrativo (ver header)
  TRUNCATE raw.demonstrativo_competencia_staging RESTART IDENTITY;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.limpar_staging_demonstrativo() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.limpar_staging_demonstrativo() TO service_role;
COMMENT ON FUNCTION public.limpar_staging_demonstrativo() IS
  'v6.0.0/M5: limpa raw.demonstrativo_competencia_staging antes do primeiro lote de uma carga (molde de limpar_staging_vendas, 0116). SEM exigir_acesso no corpo POR DESENHO: RPC de carga, protegida por GRANT — só service_role executa.';

CREATE OR REPLACE FUNCTION public.inserir_lote_staging_demonstrativo(p_linhas jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO raw.demonstrativo_competencia_staging (
    arquivo_origem, tipo, grupo, descricao, ano, mes, mes_num, competencia, valor
  )
  SELECT
    x->>'arquivo_origem',
    NULLIF(x->>'tipo', ''),
    x->>'grupo',
    x->>'descricao',
    (x->>'ano')::INT,
    NULLIF(x->>'mes', ''),
    (x->>'mes_num')::INT,
    (x->>'competencia')::DATE,
    (x->>'valor')::NUMERIC(18,2)
  FROM jsonb_array_elements(p_linhas) AS x;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.inserir_lote_staging_demonstrativo(jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.inserir_lote_staging_demonstrativo(jsonb) TO service_role;
COMMENT ON FUNCTION public.inserir_lote_staging_demonstrativo(jsonb) IS
  'v6.0.0/M5: insere um lote na staging de Demonstrativo (mesmas colunas de inserir_lote_demonstrativo_competencia, 0255, mas para raw.demonstrativo_competencia_staging). SEM exigir_acesso no corpo POR DESENHO: RPC de carga, protegida por GRANT — só service_role executa.';

CREATE OR REPLACE FUNCTION public.validar_carga_demonstrativo()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_total int;
BEGIN
  SELECT count(*) INTO v_total FROM raw.demonstrativo_competencia_staging;
  IF v_total = 0 THEN
    RETURN jsonb_build_object(
      'ok', false, 'total', 0,
      'erros', jsonb_build_array('Nenhuma linha válida na carga — arquivo vazio ou inválido.')
    );
  END IF;
  RETURN jsonb_build_object('ok', true, 'total', v_total, 'erros', '[]'::jsonb);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.validar_carga_demonstrativo() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.validar_carga_demonstrativo() TO service_role;
COMMENT ON FUNCTION public.validar_carga_demonstrativo() IS
  'v6.0.0/M5: valida a staging de Demonstrativo ANTES de qualquer destruição — hoje só checa staging não-vazia (base sem FK de data). SEM exigir_acesso no corpo POR DESENHO: RPC de carga, protegida por GRANT — só service_role executa.';

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
  -- daquele nível do pivot, chaveadas por NOME (ver contrato do checksum no header do arquivo).
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

  -- provisionar_dre_comp_par (0257) exige financeiro/dre via exigir_acesso — passa hoje porque
  -- este caminho só é alcançado por service_role (trusted no exigir_acesso, skill banco-e-rpc
  -- §6). Blindado com EXCEPTION: NÃO-BLOQUEANTE de propósito (mesma semântica que aplicar.ts
  -- já tem hoje para esta etapa) — ver o ACHADO PARA REVISÃO no header deste arquivo sobre o
  -- risco quando a credencial `ingestor` ganhar esta allowlist.
  BEGIN
    v_prov := public.provisionar_dre_comp_par();
  -- Catch ESTREITO (`insufficient_privilege` = 42501), nunca `WHEN OTHERS`: o que se quer tolerar
  -- aqui é APENAS o erro de permissão que `app.exigir_acesso` levanta (ERRCODE 42501, consistente
  -- em toda a base). `WHEN OTHERS` engoliria também um bug real dentro de
  -- `provisionar_dre_comp_par` — constraint violada, erro introduzido por uma migration futura —
  -- convertendo-o num "aviso" com a carga marcada como sucesso. Achado ALTO do `revisor-db`.
  EXCEPTION WHEN insufficient_privilege THEN
    v_avisos := v_avisos || format(
      'A base foi carregada e conferida, mas não foi possível atualizar o de-para editável por falta '
      'de permissão (%s). Pares novos aparecem como "Não classificadas" no demonstrativo; abrir '
      '"Editar estrutura" provisiona de novo.',
      SQLERRM);
    v_prov := NULL;
  END;

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
  'v6.0.0/M5: promove a staging de Demonstrativo para raw.demonstrativo_competencia numa transação única (TRUNCATE + INSERT…SELECT), conferindo os checksums do arquivo contra o GRAVADO (contrato ingestao-v1 §4) — RAISE em qualquer divergência, base anterior intacta. Idempotente por (base, carga_id) via ingestao.promocao. SEM exigir_acesso no corpo POR DESENHO: RPC de carga, protegida por GRANT — só service_role executa (mesma classe de promover_carga_vendas, 0269).';

-- ═════════════════════════════════════════════════════════════════════════════════════
-- LANÇAMENTOS POR MOVIMENTAÇÃO
-- ═════════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.limpar_staging_movimentacao()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(4017020); -- chave própria da base Movimentação (ver header)
  TRUNCATE raw.lancamentos_movimentacao_staging RESTART IDENTITY;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.limpar_staging_movimentacao() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.limpar_staging_movimentacao() TO service_role;
COMMENT ON FUNCTION public.limpar_staging_movimentacao() IS
  'v6.0.0/M5: limpa raw.lancamentos_movimentacao_staging antes do primeiro lote de uma carga. SEM exigir_acesso no corpo POR DESENHO: RPC de carga, protegida por GRANT — só service_role executa.';

CREATE OR REPLACE FUNCTION public.inserir_lote_staging_movimentacao(p_linhas jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO raw.lancamentos_movimentacao_staging (
    arquivo_origem, numero, venda_no, emissao, vencimento, liquidacao, data_movimentacao,
    pessoa, descricao, descricao_categoria, valor, categoria, grupo_categoria, conta
  )
  SELECT
    x->>'arquivo_origem',
    NULLIF(x->>'numero',              ''),
    (NULLIF(x->>'venda_no',           ''))::BIGINT,
    (NULLIF(x->>'emissao',            ''))::DATE,
    (NULLIF(x->>'vencimento',         ''))::DATE,
    (NULLIF(x->>'liquidacao',         ''))::DATE,
    (NULLIF(x->>'data_movimentacao',  ''))::DATE,
    NULLIF(x->>'pessoa',              ''),
    NULLIF(x->>'descricao',           ''),
    NULLIF(x->>'descricao_categoria', ''),
    (x->>'valor')::NUMERIC(18,2),
    NULLIF(x->>'categoria',           ''),
    NULLIF(x->>'grupo_categoria',     ''),
    NULLIF(x->>'conta',               '')
  FROM jsonb_array_elements(p_linhas) AS x;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.inserir_lote_staging_movimentacao(jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.inserir_lote_staging_movimentacao(jsonb) TO service_role;
COMMENT ON FUNCTION public.inserir_lote_staging_movimentacao(jsonb) IS
  'v6.0.0/M5: insere um lote na staging de Lançamentos por Movimentação (mesmas colunas de inserir_lote_lancamentos_movimentacao, 0185, mas para raw.lancamentos_movimentacao_staging). SEM exigir_acesso no corpo POR DESENHO: RPC de carga, protegida por GRANT — só service_role executa.';

CREATE OR REPLACE FUNCTION public.validar_carga_movimentacao()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_total int;
BEGIN
  SELECT count(*) INTO v_total FROM raw.lancamentos_movimentacao_staging;
  IF v_total = 0 THEN
    RETURN jsonb_build_object(
      'ok', false, 'total', 0,
      'erros', jsonb_build_array('Nenhuma linha válida na carga — arquivo vazio ou inválido.')
    );
  END IF;
  RETURN jsonb_build_object('ok', true, 'total', v_total, 'erros', '[]'::jsonb);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.validar_carga_movimentacao() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.validar_carga_movimentacao() TO service_role;
COMMENT ON FUNCTION public.validar_carga_movimentacao() IS
  'v6.0.0/M5: valida a staging de Lançamentos por Movimentação ANTES de qualquer destruição — hoje só checa staging não-vazia (base sem FK de data). SEM exigir_acesso no corpo POR DESENHO: RPC de carga, protegida por GRANT — só service_role executa.';

CREATE OR REPLACE FUNCTION public.promover_carga_movimentacao(p_checksums jsonb, p_carga_id uuid)
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
  v_fluxo        jsonb;
  v_avisos       text[] := '{}';
  v_result       jsonb;
BEGIN
  IF p_carga_id IS NULL THEN
    RAISE EXCEPTION 'CARGA_ID_OBRIGATORIO: promover_carga_movimentacao exige carga_id' USING ERRCODE = '22023';
  END IF;
  IF p_checksums IS NULL OR jsonb_typeof(p_checksums) <> 'array' THEN
    RAISE EXCEPTION 'CHECKSUMS_OBRIGATORIOS: promover_carga_movimentacao exige p_checksums (array jsonb)' USING ERRCODE = '22023';
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
  PERFORM pg_advisory_xact_lock(4017020); -- chave própria da base Movimentação

  SELECT resultado INTO v_existente FROM ingestao.promocao
   WHERE base = 'lancamentos-movimentacao' AND carga_id = p_carga_id;
  IF FOUND THEN
    RETURN v_existente;
  END IF;

  SELECT count(*) INTO v_total_stg FROM raw.lancamentos_movimentacao_staging;
  IF v_total_stg = 0 THEN
    RAISE EXCEPTION 'Carga abortada: staging vazia — nada a promover.';
  END IF;

  TRUNCATE raw.lancamentos_movimentacao RESTART IDENTITY;
  INSERT INTO raw.lancamentos_movimentacao (
    arquivo_origem, numero, venda_no, emissao, vencimento, liquidacao, data_movimentacao,
    pessoa, descricao, descricao_categoria, valor, categoria, grupo_categoria, conta
  )
  SELECT
    arquivo_origem, numero, venda_no, emissao, vencimento, liquidacao, data_movimentacao,
    pessoa, descricao, descricao_categoria, valor, categoria, grupo_categoria, conta
  FROM raw.lancamentos_movimentacao_staging;

  -- ── Conferência (anexo M5 §4): grupo_categoria / (grupo_categoria,categoria) / total ──────
  -- `chave` usa os MESMOS nomes de coluna que o parser já usa (grupo_categoria/categoria) —
  -- sem remapeamento de posição, ao contrário do Demonstrativo (ver header do arquivo).
  FOR v_chk IN SELECT * FROM jsonb_array_elements(p_checksums)
  LOOP
    IF v_chk->>'centavos' IS NULL THEN
      RAISE EXCEPTION 'CHECKSUM_INVALIDO: checksum sem "centavos" (escopo %)', v_chk->>'escopo'
        USING ERRCODE = '22023';
    END IF;

    SELECT count(*), coalesce(round(sum(r.valor) * 100), 0)::bigint
      INTO v_linhas_sql, v_centavos_sql
    FROM raw.lancamentos_movimentacao r
    WHERE ( (v_chk->'chave'->>'grupo_categoria') IS NULL OR r.grupo_categoria = (v_chk->'chave'->>'grupo_categoria') )
      AND ( (v_chk->'chave'->>'categoria')       IS NULL OR r.categoria       = (v_chk->'chave'->>'categoria') );

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

  -- regenerar_fluxo_caixa lê ESTA base + Aberto: lock COMPARTILHADO (4017050, ver header) para
  -- as duas nunca reconstruírem financeiro.fato_fluxo ao mesmo tempo.
  PERFORM pg_advisory_xact_lock(4017050);
  v_fluxo := public.regenerar_fluxo_caixa();
  IF coalesce((v_fluxo->>'contas_novas_n')::int, 0) > 0 THEN
    v_avisos := v_avisos || format(
      'Atenção: %s conta(s) nova(s) não classificada(s) automaticamente: %s. Confira a classificação de cartão em dim_conta_bancaria.',
      v_fluxo->>'contas_novas_n', v_fluxo->'contas_novas');
  END IF;

  v_result := jsonb_build_object(
    'linhas', v_total_stg,
    'checksums_conferidos', v_conferidos,
    'checksums_nao_conferiveis', 0,
    'fluxo_caixa', v_fluxo,
    'avisos', to_jsonb(v_avisos)
  );

  INSERT INTO ingestao.promocao (base, carga_id, resultado)
  VALUES ('lancamentos-movimentacao', p_carga_id, v_result)
  ON CONFLICT (base, carga_id) DO NOTHING;

  TRUNCATE raw.lancamentos_movimentacao_staging RESTART IDENTITY;

  RETURN v_result;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.promover_carga_movimentacao(jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.promover_carga_movimentacao(jsonb, uuid) TO service_role;
COMMENT ON FUNCTION public.promover_carga_movimentacao(jsonb, uuid) IS
  'v6.0.0/M5: promove a staging de Lançamentos por Movimentação para raw.lancamentos_movimentacao numa transação única, conferindo os checksums do outline do arquivo (grupo/categoria/total) contra o GRAVADO (contrato ingestao-v1 §4) — RAISE em qualquer divergência, base anterior intacta. Chama regenerar_fluxo_caixa() sob lock compartilhado com Aberto. Idempotente por (base, carga_id) via ingestao.promocao. SEM exigir_acesso no corpo POR DESENHO: RPC de carga, protegida por GRANT — só service_role executa.';

-- ═════════════════════════════════════════════════════════════════════════════════════
-- LANÇAMENTOS POR VENCIMENTO EM ABERTO
-- ═════════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.limpar_staging_aberto()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(4017030); -- chave própria da base Aberto (ver header)
  TRUNCATE raw.titulos_em_aberto_staging RESTART IDENTITY;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.limpar_staging_aberto() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.limpar_staging_aberto() TO service_role;
COMMENT ON FUNCTION public.limpar_staging_aberto() IS
  'v6.0.0/M5: limpa raw.titulos_em_aberto_staging antes do primeiro lote de uma carga. SEM exigir_acesso no corpo POR DESENHO: RPC de carga, protegida por GRANT — só service_role executa.';

CREATE OR REPLACE FUNCTION public.inserir_lote_staging_aberto(p_linhas jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO raw.titulos_em_aberto_staging (
    arquivo_origem, numero, venda_no, emissao, vencimento, liquidacao,
    pessoa, descricao, descricao_categoria, valor, categoria, grupo_categoria, conta
  )
  SELECT
    x->>'arquivo_origem',
    NULLIF(x->>'numero',              ''),
    (NULLIF(x->>'venda_no',           ''))::BIGINT,
    (NULLIF(x->>'emissao',            ''))::DATE,
    (NULLIF(x->>'vencimento',         ''))::DATE,
    (NULLIF(x->>'liquidacao',         ''))::DATE,
    NULLIF(x->>'pessoa',              ''),
    NULLIF(x->>'descricao',           ''),
    NULLIF(x->>'descricao_categoria', ''),
    (x->>'valor')::NUMERIC(18,2),
    NULLIF(x->>'categoria',           ''),
    NULLIF(x->>'grupo_categoria',     ''),
    NULLIF(x->>'conta',               '')
  FROM jsonb_array_elements(p_linhas) AS x;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.inserir_lote_staging_aberto(jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.inserir_lote_staging_aberto(jsonb) TO service_role;
COMMENT ON FUNCTION public.inserir_lote_staging_aberto(jsonb) IS
  'v6.0.0/M5: insere um lote na staging de Lançamentos por Vencimento em Aberto (mesmas colunas de inserir_lote_titulos_em_aberto, 0186, mas para raw.titulos_em_aberto_staging). SEM exigir_acesso no corpo POR DESENHO: RPC de carga, protegida por GRANT — só service_role executa.';

CREATE OR REPLACE FUNCTION public.validar_carga_aberto()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_total int;
BEGIN
  SELECT count(*) INTO v_total FROM raw.titulos_em_aberto_staging;
  IF v_total = 0 THEN
    RETURN jsonb_build_object(
      'ok', false, 'total', 0,
      'erros', jsonb_build_array('Nenhuma linha válida na carga — arquivo vazio ou inválido.')
    );
  END IF;
  RETURN jsonb_build_object('ok', true, 'total', v_total, 'erros', '[]'::jsonb);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.validar_carga_aberto() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.validar_carga_aberto() TO service_role;
COMMENT ON FUNCTION public.validar_carga_aberto() IS
  'v6.0.0/M5: valida a staging de Lançamentos por Vencimento em Aberto ANTES de qualquer destruição — hoje só checa staging não-vazia. SEM exigir_acesso no corpo POR DESENHO: RPC de carga, protegida por GRANT — só service_role executa.';

CREATE OR REPLACE FUNCTION public.promover_carga_aberto(p_checksums jsonb, p_carga_id uuid)
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
  v_fluxo        jsonb;
  v_avisos       text[] := '{}';
  v_result       jsonb;
BEGIN
  IF p_carga_id IS NULL THEN
    RAISE EXCEPTION 'CARGA_ID_OBRIGATORIO: promover_carga_aberto exige carga_id' USING ERRCODE = '22023';
  END IF;
  IF p_checksums IS NULL OR jsonb_typeof(p_checksums) <> 'array' THEN
    RAISE EXCEPTION 'CHECKSUMS_OBRIGATORIOS: promover_carga_aberto exige p_checksums (array jsonb)' USING ERRCODE = '22023';
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
  PERFORM pg_advisory_xact_lock(4017030); -- chave própria da base Aberto

  SELECT resultado INTO v_existente FROM ingestao.promocao
   WHERE base = 'lancamentos-aberto' AND carga_id = p_carga_id;
  IF FOUND THEN
    RETURN v_existente;
  END IF;

  SELECT count(*) INTO v_total_stg FROM raw.titulos_em_aberto_staging;
  IF v_total_stg = 0 THEN
    RAISE EXCEPTION 'Carga abortada: staging vazia — nada a promover.';
  END IF;

  TRUNCATE raw.titulos_em_aberto RESTART IDENTITY;
  INSERT INTO raw.titulos_em_aberto (
    arquivo_origem, numero, venda_no, emissao, vencimento, liquidacao,
    pessoa, descricao, descricao_categoria, valor, categoria, grupo_categoria, conta
  )
  SELECT
    arquivo_origem, numero, venda_no, emissao, vencimento, liquidacao,
    pessoa, descricao, descricao_categoria, valor, categoria, grupo_categoria, conta
  FROM raw.titulos_em_aberto_staging;

  -- ── Conferência (anexo M5 §4): mesmo desenho da irmã Movimentação ─────────────────────────
  FOR v_chk IN SELECT * FROM jsonb_array_elements(p_checksums)
  LOOP
    IF v_chk->>'centavos' IS NULL THEN
      RAISE EXCEPTION 'CHECKSUM_INVALIDO: checksum sem "centavos" (escopo %)', v_chk->>'escopo'
        USING ERRCODE = '22023';
    END IF;

    SELECT count(*), coalesce(round(sum(r.valor) * 100), 0)::bigint
      INTO v_linhas_sql, v_centavos_sql
    FROM raw.titulos_em_aberto r
    WHERE ( (v_chk->'chave'->>'grupo_categoria') IS NULL OR r.grupo_categoria = (v_chk->'chave'->>'grupo_categoria') )
      AND ( (v_chk->'chave'->>'categoria')       IS NULL OR r.categoria       = (v_chk->'chave'->>'categoria') );

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

  -- regenerar_fluxo_caixa lê Movimentação + ESTA base: lock COMPARTILHADO (4017050, ver header).
  PERFORM pg_advisory_xact_lock(4017050);
  v_fluxo := public.regenerar_fluxo_caixa();
  IF coalesce((v_fluxo->>'contas_novas_n')::int, 0) > 0 THEN
    v_avisos := v_avisos || format(
      'Atenção: %s conta(s) nova(s) não classificada(s) automaticamente: %s. Confira a classificação de cartão em dim_conta_bancaria.',
      v_fluxo->>'contas_novas_n', v_fluxo->'contas_novas');
  END IF;

  v_result := jsonb_build_object(
    'linhas', v_total_stg,
    'checksums_conferidos', v_conferidos,
    'checksums_nao_conferiveis', 0,
    'fluxo_caixa', v_fluxo,
    'avisos', to_jsonb(v_avisos)
  );

  INSERT INTO ingestao.promocao (base, carga_id, resultado)
  VALUES ('lancamentos-aberto', p_carga_id, v_result)
  ON CONFLICT (base, carga_id) DO NOTHING;

  TRUNCATE raw.titulos_em_aberto_staging RESTART IDENTITY;

  RETURN v_result;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.promover_carga_aberto(jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.promover_carga_aberto(jsonb, uuid) TO service_role;
COMMENT ON FUNCTION public.promover_carga_aberto(jsonb, uuid) IS
  'v6.0.0/M5: promove a staging de Lançamentos por Vencimento em Aberto para raw.titulos_em_aberto numa transação única, conferindo os checksums do outline do arquivo (grupo/categoria/total) contra o GRAVADO (contrato ingestao-v1 §4) — RAISE em qualquer divergência, base anterior intacta. Chama regenerar_fluxo_caixa() sob lock compartilhado com Movimentação. Idempotente por (base, carga_id) via ingestao.promocao. SEM exigir_acesso no corpo POR DESENHO: RPC de carga, protegida por GRANT — só service_role executa.';

-- ═════════════════════════════════════════════════════════════════════════════════════
-- LANÇAMENTOS POR OPERAÇÃO
-- ═════════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.limpar_staging_operacao()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(4017040); -- chave própria da base Operação (ver header)
  TRUNCATE raw.lancamentos_operacao_staging RESTART IDENTITY;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.limpar_staging_operacao() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.limpar_staging_operacao() TO service_role;
COMMENT ON FUNCTION public.limpar_staging_operacao() IS
  'v6.0.0/M5: limpa raw.lancamentos_operacao_staging antes do primeiro lote de uma carga. SEM exigir_acesso no corpo POR DESENHO: RPC de carga, protegida por GRANT — só service_role executa.';

CREATE OR REPLACE FUNCTION public.inserir_lote_staging_operacao(p_linhas jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO raw.lancamentos_operacao_staging (
    arquivo_origem, linha_origem, lancamento_numero, venda_numero, pessoa, descricao,
    liquidacao, vencimento, valor, operacao, tipo
  )
  SELECT
    x->>'arquivo_origem',
    (x->>'linha_origem')::int,
    NULLIF(x->>'lancamento_numero', ''),
    NULLIF(x->>'venda_numero', ''),
    NULLIF(x->>'pessoa', ''),
    NULLIF(x->>'descricao', ''),
    NULLIF(x->>'liquidacao', '')::date,
    NULLIF(x->>'vencimento', '')::date,
    (x->>'valor')::numeric(18,2),
    NULLIF(x->>'operacao', ''),
    NULLIF(x->>'tipo', '')
  FROM jsonb_array_elements(p_linhas) AS x;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.inserir_lote_staging_operacao(jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.inserir_lote_staging_operacao(jsonb) TO service_role;
COMMENT ON FUNCTION public.inserir_lote_staging_operacao(jsonb) IS
  'v6.0.0/M5: insere um lote na staging de Lançamentos por Operação (raw.lancamentos_operacao_staging, 0277) — arquivo_origem/vencimento já resolvidos pelo servidor antes desta chamada. SEM exigir_acesso no corpo POR DESENHO: RPC de carga, protegida por GRANT — só service_role executa.';

CREATE OR REPLACE FUNCTION public.validar_carga_operacao()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_total int;
BEGIN
  SELECT count(*) INTO v_total FROM raw.lancamentos_operacao_staging;
  IF v_total = 0 THEN
    RETURN jsonb_build_object(
      'ok', false, 'total', 0,
      'erros', jsonb_build_array('Nenhuma linha válida na carga — arquivo vazio ou inválido.')
    );
  END IF;
  RETURN jsonb_build_object('ok', true, 'total', v_total, 'erros', '[]'::jsonb);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.validar_carga_operacao() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.validar_carga_operacao() TO service_role;
COMMENT ON FUNCTION public.validar_carga_operacao() IS
  'v6.0.0/M5: valida a staging de Lançamentos por Operação ANTES de qualquer destruição — hoje só checa staging não-vazia (o grafo de dependência contra Aberto é responsabilidade da ROTA, contrato §5, M7). SEM exigir_acesso no corpo POR DESENHO: RPC de carga, protegida por GRANT — só service_role executa.';

CREATE OR REPLACE FUNCTION public.promover_carga_operacao(p_checksums jsonb, p_carga_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existente   jsonb;
  v_total_stg   int;
  v_hoje        date := (now() AT TIME ZONE 'America/Sao_Paulo')::date; -- "hoje" SP (skill banco-e-rpc §3)
  v_gravadas    int;
  v_descartadas int;
  v_sem_liq     int;
  v_ausentes    int;
  v_baseline    int := 3; -- baseline conhecido em 21/09/2026 (contrato §4) — ausência ACIMA disto é alarme
  v_avisos      text[] := '{}';
  v_result      jsonb;
BEGIN
  IF p_carga_id IS NULL THEN
    RAISE EXCEPTION 'CARGA_ID_OBRIGATORIO: promover_carga_operacao exige carga_id' USING ERRCODE = '22023';
  END IF;
  IF p_checksums IS NULL OR jsonb_typeof(p_checksums) <> 'array' THEN
    RAISE EXCEPTION 'CHECKSUMS_OBRIGATORIOS: promover_carga_operacao exige p_checksums (array jsonb — pode ser [], esta base não tem checksum monetário no arquivo)' USING ERRCODE = '22023';
  END IF;

  SET LOCAL lock_timeout = '10s';
  PERFORM pg_advisory_xact_lock(4017040); -- chave própria da base Operação

  SELECT resultado INTO v_existente FROM ingestao.promocao
   WHERE base = 'lancamentos-operacao' AND carga_id = p_carga_id;
  IF FOUND THEN
    RETURN v_existente;
  END IF;

  SELECT count(*) INTO v_total_stg FROM raw.lancamentos_operacao_staging;
  IF v_total_stg = 0 THEN
    RAISE EXCEPTION 'Carga abortada: staging vazia — nada a promover.';
  END IF;

  TRUNCATE raw.lancamentos_operacao RESTART IDENTITY;
  INSERT INTO raw.lancamentos_operacao (
    arquivo_origem, linha_origem, lancamento_numero, venda_numero, pessoa, descricao,
    liquidacao, vencimento, valor, operacao, tipo
  )
  SELECT
    arquivo_origem, linha_origem, lancamento_numero, venda_numero, pessoa, descricao,
    liquidacao, vencimento, valor, operacao, tipo
  FROM raw.lancamentos_operacao_staging;

  -- Esta base não tem checksum monetário no arquivo (contrato §4) — só o cruzamento de
  -- Vencimento, que é ALARME, nunca bloqueio. `vencimento` já foi resolvido pelo SERVIDOR
  -- contra Aberto/Movimentação ANTES do staging (ingestao_vencimentos_por_numero, 0276) — aqui
  -- só se CONTA o que ficou sem vencimento.
  SELECT count(*) INTO v_sem_liq
    FROM raw.lancamentos_operacao WHERE liquidacao IS NULL AND lancamento_numero IS NOT NULL;
  SELECT count(*) INTO v_ausentes
    FROM raw.lancamentos_operacao
   WHERE liquidacao IS NULL AND vencimento IS NULL AND lancamento_numero IS NOT NULL;

  IF v_ausentes > v_baseline THEN
    v_avisos := v_avisos || format(
      'ALARME cruzamento-vencimento: %s lançamento(s) sem liquidação e sem vencimento nas bases vizinhas '
      '(baseline conhecido: %s). Não bloqueia a carga — conferir a raspagem/planilhas de origem.',
      v_ausentes, v_baseline);
  END IF;

  -- Deriva o FATO a partir do raw — mesmo filtro de lancamentoOperacaoAplicavel (M4): valor,
  -- operação e tipo IN ('Entrada','Saída') são NOT NULL/CHECK em analytics.fato_lancamento_operacao.
  -- status/mes_ano/data_final são DERIVADOS aqui (anexo §6), nunca gravados no raw.
  TRUNCATE analytics.fato_lancamento_operacao;
  INSERT INTO analytics.fato_lancamento_operacao (
    lancamento_n, venda_n, pessoa, descricao, liquidacao_dt, vencimento_dt, valor, tipo,
    operacao, status, data_final, mes_ano
  )
  SELECT
    NULLIF(lancamento_numero, '')::bigint,
    NULLIF(venda_numero, '')::bigint,
    pessoa,
    descricao,
    liquidacao,
    vencimento,
    valor,
    tipo,
    operacao,
    -- Regra do R (TRUE ~ Tipo): lançamento sem data final nasce com cara de realizado — o
    -- mesmo comportamento que o durável da M4 nomeou.
    CASE
      WHEN coalesce(liquidacao, vencimento) IS NOT NULL
       AND coalesce(liquidacao, vencimento) > v_hoje
       AND tipo = 'Entrada' THEN 'A Receber Futuro'
      WHEN coalesce(liquidacao, vencimento) IS NOT NULL
       AND coalesce(liquidacao, vencimento) > v_hoje
       AND tipo = 'Saída'   THEN 'A Pagar Futuro'
      ELSE tipo
    END,
    coalesce(liquidacao, vencimento),
    CASE WHEN coalesce(liquidacao, vencimento) IS NULL THEN NULL
         ELSE to_char(coalesce(liquidacao, vencimento), 'YYYY-MM') END
  FROM raw.lancamentos_operacao
  WHERE valor IS NOT NULL AND operacao IS NOT NULL AND tipo IN ('Entrada', 'Saída');

  GET DIAGNOSTICS v_gravadas = ROW_COUNT;
  v_descartadas := v_total_stg - v_gravadas;
  IF v_descartadas > 0 THEN
    v_avisos := v_avisos || format(
      '%s linha(s) do arquivo sem operação, valor ou tipo utilizável (placeholder do scrape ou célula '
      'vazia) não foram gravadas — mesmo critério do parser de cliente anterior.', v_descartadas);
  END IF;

  PERFORM public.regenerar_dim_operacao_weddings();

  v_result := jsonb_build_object(
    'linhas', v_gravadas,
    'linhas_descartadas', v_descartadas,
    'cruzamento', jsonb_build_object(
      'sem_liquidacao', v_sem_liq, 'ausentes', v_ausentes, 'baseline_ausentes', v_baseline
    ),
    'avisos', to_jsonb(v_avisos)
  );

  INSERT INTO ingestao.promocao (base, carga_id, resultado)
  VALUES ('lancamentos-operacao', p_carga_id, v_result)
  ON CONFLICT (base, carga_id) DO NOTHING;

  TRUNCATE raw.lancamentos_operacao_staging RESTART IDENTITY;

  RETURN v_result;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.promover_carga_operacao(jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.promover_carga_operacao(jsonb, uuid) TO service_role;
COMMENT ON FUNCTION public.promover_carga_operacao(jsonb, uuid) IS
  'v6.0.0/M5: promove a staging de Lançamentos por Operação para raw.lancamentos_operacao numa transação única e deriva analytics.fato_lancamento_operacao (status/data_final/mes_ano calculados com "hoje" de São Paulo, anexo §6). Esta base não tem checksum monetário no arquivo (contrato §4) — o cruzamento de Vencimento vira ALARME em avisos, nunca RAISE. Idempotente por (base, carga_id) via ingestao.promocao. SEM exigir_acesso no corpo POR DESENHO: RPC de carga, protegida por GRANT — só service_role executa.';

-- ═════════════════════════════════════════════════════════════════════════════════════
-- VENDAS POR PRODUTO — inserir_lote_staging ganha Intermediário; promover_carga_vendas
-- ganha sobrecarga com checksum e carga_id (a versão zero-arg, 0116, fica intocada)
-- ═════════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.inserir_lote_staging(p_linhas jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  linha jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(4017001); -- mesma chave do pipeline de carga de Vendas
  FOR linha IN SELECT jsonb_array_elements(p_linhas)
  LOOP
    INSERT INTO raw.vendas_excel_staging (
      arquivo_origem, linha_origem, venda_numero, data_venda, vendedor, pagante,
      setor_macro, setor, setor_micro, produto, valor_total, receitas, contrato,
      taxa_servico, semana, mes, data_inicio_evento, fornecedor, situacao,
      tipo_contrato, passageiros, operacao_propria, intermediario
    ) VALUES (
      linha->>'arquivo_origem',
      (linha->>'linha_origem')::int,
      linha->>'venda_numero',
      NULLIF(linha->>'data_venda', '')::date,
      linha->>'vendedor',
      linha->>'pagante',
      linha->>'setor_macro',
      linha->>'setor',
      linha->>'setor_micro',
      linha->>'produto',
      (linha->>'valor_total')::numeric,
      (linha->>'receitas')::numeric,
      (linha->>'contrato')::boolean,
      (linha->>'taxa_servico')::boolean,
      NULLIF(linha->>'semana', '')::int,
      linha->>'mes',
      NULLIF(linha->>'data_inicio_evento', '')::date,
      linha->>'fornecedor',
      NULLIF(linha->>'situacao', ''),
      NULLIF(linha->>'tipo_contrato', ''),
      NULLIF(linha->>'passageiros', ''),
      NULLIF(linha->>'operacao_propria', ''),
      NULLIF(linha->>'intermediario', '')
    );
  END LOOP;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.inserir_lote_staging(jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.inserir_lote_staging(jsonb) TO service_role;
COMMENT ON FUNCTION public.inserir_lote_staging(jsonb) IS
  'v6.0.0/M5: insere um lote de Vendas na staging (raw.vendas_excel_staging), agora também gravando intermediario (0277; briefing decisão 7 — o Intermediário volta a ser carregado, o filtro Welcome sai da ingestão e vai para transform_raw_to_analytics). SEM exigir_acesso no corpo POR DESENHO: RPC de carga, protegida por GRANT — só service_role executa (mesma classe de promover_carga_vendas, 0269). Mantém EXECUTE já concedido à role ingestor (0274) — esta migration não o toca.';

CREATE OR REPLACE FUNCTION public.promover_carga_vendas(p_checksums jsonb, p_carga_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existente    jsonb;
  v_total        int;
  v_fora         int;
  v_dim_min      date;
  v_dim_max      date;
  v_transform    jsonb;
  v_chk          jsonb;
  v_campo        text;
  v_linhas_sql   int;
  v_centavos_sql bigint;
  v_conferidos   int := 0;
  v_nao_conf     int := 0;
  v_falhas       jsonb := '[]'::jsonb;
  v_result       jsonb;
BEGIN
  IF p_carga_id IS NULL THEN
    RAISE EXCEPTION 'CARGA_ID_OBRIGATORIO: promover_carga_vendas(jsonb,uuid) exige carga_id' USING ERRCODE = '22023';
  END IF;
  IF p_checksums IS NULL OR jsonb_typeof(p_checksums) <> 'array' THEN
    RAISE EXCEPTION 'CHECKSUMS_OBRIGATORIOS: promover_carga_vendas(jsonb,uuid) exige p_checksums (array jsonb)' USING ERRCODE = '22023';
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
  -- MESMA chave da versão zero-arg (0116): as duas tocam raw.vendas_excel_staging/raw.vendas_excel
  -- e NUNCA podem correr concorrentemente — usar uma chave diferente aqui destruiria a garantia
  -- que o advisory lock existe para dar.
  PERFORM pg_advisory_xact_lock(4017001);

  SELECT resultado INTO v_existente FROM ingestao.promocao
   WHERE base = 'vendas-produto' AND carga_id = p_carga_id;
  IF FOUND THEN
    RETURN v_existente;
  END IF;

  SELECT count(*) INTO v_total FROM raw.vendas_excel_staging;
  IF v_total = 0 THEN
    RAISE EXCEPTION 'Carga abortada: staging vazia — nada a promover.';
  END IF;

  SELECT min(data), max(data) INTO v_dim_min, v_dim_max FROM analytics.dim_data;
  SELECT count(*) INTO v_fora
  FROM raw.vendas_excel_staging
  WHERE data_venda IS NOT NULL AND (data_venda < v_dim_min OR data_venda > v_dim_max);
  IF v_fora > 0 THEN
    RAISE EXCEPTION 'Carga abortada: % venda(s) com data fora do calendário (% a %).',
      v_fora, v_dim_min, v_dim_max;
  END IF;

  TRUNCATE
    analytics.fato_venda_item,
    analytics.fato_venda,
    analytics.dim_produto,
    analytics.dim_pagante,
    analytics.dim_vendedor,
    raw.vendas_excel
  RESTART IDENTITY CASCADE;

  INSERT INTO raw.vendas_excel (
    arquivo_origem, linha_origem, venda_numero, data_venda, vendedor, pagante,
    setor_macro, setor, setor_micro, produto, valor_total, receitas, contrato,
    taxa_servico, semana, mes, data_inicio_evento, fornecedor, situacao,
    tipo_contrato, passageiros, operacao_propria, intermediario
  )
  SELECT
    arquivo_origem, linha_origem, venda_numero, data_venda, vendedor, pagante,
    setor_macro, setor, setor_micro, produto, valor_total, receitas, contrato,
    taxa_servico, semana, mes, data_inicio_evento, fornecedor, situacao,
    tipo_contrato, passageiros, operacao_propria, intermediario
  FROM raw.vendas_excel_staging;

  -- ── Conferência (anexo M5 §4): por arquivo_origem — só valor_total/receitas têm coluna em
  -- raw.vendas_excel (ver "QUAIS CHECKSUMS..." no header do arquivo). Os demais campos contam
  -- como NÃO conferíveis, nunca como falha silenciosa.
  FOR v_chk IN SELECT * FROM jsonb_array_elements(p_checksums)
  LOOP
    v_campo := v_chk->>'campo';
    IF v_campo IS NULL THEN
      RAISE EXCEPTION 'CHECKSUM_INVALIDO: checksum sem "campo" (arquivo %)',
        v_chk->'chave'->>'arquivo_origem' USING ERRCODE = '22023';
    END IF;
    IF v_campo <> 'valor_total' AND v_campo <> 'receitas' THEN
      v_nao_conf := v_nao_conf + 1;
      CONTINUE;
    END IF;
    IF v_chk->>'centavos' IS NULL THEN
      RAISE EXCEPTION 'CHECKSUM_INVALIDO: checksum sem "centavos" (arquivo %, campo %)',
        v_chk->'chave'->>'arquivo_origem', v_campo USING ERRCODE = '22023';
    END IF;

    IF v_campo = 'valor_total' THEN
      SELECT count(*), coalesce(round(sum(r.valor_total) * 100), 0)::bigint
        INTO v_linhas_sql, v_centavos_sql
      FROM raw.vendas_excel r
      WHERE r.arquivo_origem = (v_chk->'chave'->>'arquivo_origem');
    ELSE
      SELECT count(*), coalesce(round(sum(r.receitas) * 100), 0)::bigint
        INTO v_linhas_sql, v_centavos_sql
      FROM raw.vendas_excel r
      WHERE r.arquivo_origem = (v_chk->'chave'->>'arquivo_origem');
    END IF;

    v_conferidos := v_conferidos + 1;

    IF v_centavos_sql <> (v_chk->>'centavos')::bigint
       OR (v_chk->>'linhas' IS NOT NULL AND v_linhas_sql <> (v_chk->>'linhas')::int) THEN
      v_falhas := v_falhas || jsonb_build_object(
        'escopo', v_chk->>'escopo', 'chave', v_chk->'chave', 'campo', v_campo,
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

  v_transform := public.transform_raw_to_analytics();
  PERFORM public.regenerar_dim_operacao_weddings();
  PERFORM public.refresh_all_materialized_views();

  v_result := v_transform || jsonb_build_object(
    'checksums_conferidos', v_conferidos,
    'checksums_nao_conferiveis', v_nao_conf
  );

  INSERT INTO ingestao.promocao (base, carga_id, resultado)
  VALUES ('vendas-produto', p_carga_id, v_result)
  ON CONFLICT (base, carga_id) DO NOTHING;

  TRUNCATE raw.vendas_excel_staging RESTART IDENTITY;

  RETURN v_result;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.promover_carga_vendas(jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.promover_carga_vendas(jsonb, uuid) TO service_role;
COMMENT ON FUNCTION public.promover_carga_vendas(jsonb, uuid) IS
  'v6.0.0/M5: sobrecarga de promover_carga_vendas com checksum conferido no banco e idempotência por carga_id (a versão zero-arg, 0116/0269, fica intocada e vira órfã até o GATE 3/M10). Mesma transação da versão zero-arg (TRUNCATE + INSERT…SELECT + transform + regenerar + refresh), mais a conferência dos checksums do arquivo contra o GRAVADO (valor_total/receitas por arquivo_origem — contrato ingestao-v1 §4) e o registro em ingestao.promocao. SEM exigir_acesso no corpo POR DESENHO: RPC de carga, protegida por GRANT — só service_role executa.';

NOTIFY pgrst, 'reload schema';
