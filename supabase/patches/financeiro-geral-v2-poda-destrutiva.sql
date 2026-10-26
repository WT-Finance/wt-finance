-- ---------------------------------------------------------------------------
-- v6.5.0 / M5 (GATE 2) — PODA de "Financeiro · Geral": o banco perde o que a v6.5.0 aposentou.
--
-- ⛔ DESTRUTIVA — 2 DROP TABLE (uma delas é a SÉRIE histórica de prazos, que NÃO se reconstrói) + 4 DROP
--    FUNCTION + 2 CREATE OR REPLACE que TIRAM chaves do JSON. Enquanto não é aplicado, este arquivo fica em
--    `supabase/patches/`, SEM número, FORA de `supabase/migrations/`, pelo mesmo motivo da 0251/0300: `db push`
--    empurra TODO o conjunto pendente de `supabase/migrations/`, e um arquivo destrutivo esquecido lá é
--    aplicado por arrasto (v5.2.0). Só entra em `migrations/` (como `0302`) no passo (c) do roteiro, na hora de
--    aplicar; se a aplicação abortar, volta para `patches/`. O agente NÃO aplica — o wrapper aborta em stdin
--    não-TTY (ADR-0131), por construção.
--
-- ── O que remove, e por quê (decisão do Yan, 26/10: "remover tudo, inclusive a série") ─────────────────
--   1. DROP FUNCTION public.get_geral_custos_financeiros(integer)   — a página não a chama mais (v6.5.0).
--   2. DROP FUNCTION public.get_geral_prazos()                      — idem (card de prazos médios saiu).
--   3. DROP FUNCTION public.registrar_foto_prazos(uuid)             — a ingestão do Aberto deixou de gravar a foto.
--   4. DROP FUNCTION financeiro.geral_prazo_calcular()              — núcleo de 2 e 3; sem chamador.
--   5. DROP TABLE    financeiro.geral_prazo_foto                    — a SÉRIE (uma foto por carga do Aberto).
--                                                                      NÃO se reconstrói: EXPORTAR ANTES (roteiro, b).
--   6. DROP TABLE    financeiro.geral_fin_grupo                     — seed curado de 11 linhas, lido SÓ por 1
--                                                                      (docs/auditoria/v6-5-0-m0-financeiro-geral-v2.md §0).
--   7. PODA, por CREATE OR REPLACE (mesma assinatura, mesmo `RETURNS json`), das chaves antigas de:
--        • get_geral_recebiveis()      — saem a_vencer, marcacao_em_aberto, concentracao, recuperado_ano,
--                                         comparativo e evolucao (a MENSAL). Ficam, com o MESMO valor: carga,
--                                         inadimplente {n,valor,faixas}, historico_desde, em_aberto, vencido,
--                                         devedores, referencia_semana, evolucao_semanal.
--        • get_geral_prejuizos(int)    — saem reversao, liquido e as chaves reversao/liquido de
--                                         ano_anterior_ytd. Ficam, com o MESMO valor: ano, relacao, mes_corrente,
--                                         prejuizo, ano_anterior_ytd.prejuizo, bandeja, atualizado_em, por_pessoa.
--      get_geral_antecipacoes(int) NÃO é recriada: o front usa todas as chaves dela (e total.desconto_pct
--      continua emitido). `financeiro.geral_perda_map` CONTINUA (distingue o papel prejuizo; o papel de
--      reversão pode seguir na tabela, só não é mais emitido).
--   8. COMMENT ON FUNCTION das duas podadas, sem citar chave que saiu.
--
-- ── PRÉ-CONDIÇÃO (inegociável) ──────────────────────────────────────────────────────────────────────────
--   SÓ DEPOIS do MERGE e do DEPLOY da v6.5.0 em produção. Aplicar cedo NÃO derruba a ingestão antiga (ela é
--   fail-soft: a falha de `registrar_foto_prazos` vira aviso, não falha a carga do Aberto), mas QUEBRA a
--   PÁGINA da versão anterior, ainda no ar: o Zod dela recusa as chaves podadas e as duas RPCs derrubadas
--   respondem 404. A v6.5.0 não depende de nada que sai aqui.
--
-- ── ROTEIRO DE APLICAÇÃO (Yan, em TTY, na raiz já em main com a v6.5.0 deployada) ───────────────────────
--   (0) DEPLOY FEITO — verifique, não suponha: (i) o deployment de PRODUÇÃO da Vercel é o commit do MERGE da
--       v6.5.0 (painel da Vercel ou `vercel ls`: Production = o SHA do merge, estado Ready); (ii) em produção,
--       `/financeiro/geral` abre com as cinco seções (Vendas … Cartões). Qualquer dúvida: NÃO aplique.
--   (a) PRÉ-VOO, read-only. Três consultas (`npx supabase db query --linked "<SQL>"`):
--       1. Consumidores — só podem aparecer funções que ESTE patch derruba
--          (get_geral_custos_financeiros, get_geral_prazos, registrar_foto_prazos, geral_prazo_calcular):
--            SELECT n.nspname, p.proname FROM pg_proc p
--              JOIN pg_namespace n ON n.oid = p.pronamespace
--             WHERE p.prosrc ILIKE '%geral_prazo_foto%' OR p.prosrc ILIKE '%geral_fin_grupo%'
--                OR p.prosrc ILIKE '%registrar_foto_prazos%' OR p.prosrc ILIKE '%get_geral_custos_financeiros%'
--                OR p.prosrc ILIKE '%get_geral_prazos%' OR p.prosrc ILIKE '%geral_prazo_calcular%'
--             ORDER BY 1, 2
--          (a query é a do briefing + `geral_prazo_calcular`, que este patch também derruba). Qualquer OUTRA
--          função na lista = consumidor que o mapa não viu: PARE e investigue (o guard final do patch também
--          aborta por isso — esta consulta PREVÊ o guard).
--       2. Corpo vivo = retrato pós-0301 (as duas podas partem desse retrato; o patch também confere):
--            SELECT proname, md5(prosrc) FROM pg_proc
--             WHERE oid IN (to_regprocedure('public.get_geral_recebiveis()'),
--                           to_regprocedure('public.get_geral_prejuizos(integer)'))
--             ORDER BY proname
--          Esperado: get_geral_prejuizos = 7123a2f8b861fde3bfb9d9b0d808d572;
--                    get_geral_recebiveis = 53f0c0703045cd0efd22fa2b9de7aed5.
--          Diferente = alguém mexeu na função depois do retrato: NÃO aplique; reescreva a poda a partir do
--          catálogo vivo (skill banco-e-rpc §5).
--       3. Agendamentos que chamem o que sai — tem de voltar VAZIO:
--            SELECT jobid FROM cron.job WHERE command ILIKE '%geral_%' OR command ILIKE '%registrar_foto%'
--   (b) EXPORT da série, IMEDIATAMENTE antes (pode ter ganho fotos desde 26/10). Nunca sobrescreva o export
--       existente (geral_prazo_foto-2026-10-26.json, 3 linhas): o nome leva DATA E HORA, grava-se num arquivo
--       temporário e só depois se faz `mv -n`.
--         1) contagem e maior id AGORA:
--              npx supabase db query --linked "SELECT count(*), max(id) FROM financeiro.geral_prazo_foto"
--         2) export (o `-o json` do CLI embrulha o resultado em {"rows":[{"serie":[…]}]}; o array está na
--            coluna `serie` da 1ª linha — é de lá que o DOWN o tira):
--              D=~/projects/arquivo-worktrees-janus/v6-5-0-gate2; mkdir -p "$D"; T=$(date +%Y-%m-%d-%H%M)
--              npx supabase db query --linked \
--                "SELECT json_agg(t ORDER BY t.id) AS serie FROM financeiro.geral_prazo_foto t" -o json \
--                > "$D/.geral_prazo_foto-$T.tmp"
--         3) CONFIRA que o nº de elementos de rows[0].serie e o maior id batem com o passo 1 (e que são ≥ 3):
--              node -e 'const a=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).rows[0].serie;
--                console.log(a.length, Math.max(...a.map(x=>x.id)))' "$D/.geral_prazo_foto-$T.tmp"
--         4) só então: mv -n "$D/.geral_prazo_foto-$T.tmp" "$D/geral_prazo_foto-$T.json"
--       Segunda rede: o backup-gate do `db:migrate` (passo d) também inclui esta tabela no backup-do-dia.
--   (c) Conferir que 0302 está livre (`npx supabase migration list --linked` e as worktrees irmãs). Trabalhe
--       numa BRANCH nova (nunca direto na main) e então:
--         git mv supabase/patches/financeiro-geral-v2-poda-destrutiva.sql supabase/migrations/0302_financeiro_geral_v2_poda.sql
--   (d) npm run db:migrate -- --destrutiva --label v6-5-0-0302
--       (backup-gate como rede + confirmação humana; a classificação TEM de sair `destrutiva` pelos DROP TABLE
--        de top-level. Se o db:migrate abortar — gate, confirmação ou guarda —, `git mv` de VOLTA para
--        supabase/patches/ ANTES de qualquer outro db:migrate: destrutiva parada em migrations/ é aplicada por
--        arrasto pelo próximo push.)
--   (e) No MESMO commit do `git mv`, que vai numa BRANCH + PR (nunca direto na main):
--         · src/lib/rpc-contrato.test.ts — as linhas ANDAM; procure pelos NOMES (linhas de referência na v6.5.0):
--             1. APAGAR a constante `RPCS_GERAL_APOSENTADAS` com o comentário "APOSENTADAS ATÉ O GATE 2…" que a
--                precede (~2964–2976).
--             2. `RPCS_GERAL` (~2979): passa a ser só as vivas (`[...RPCS_GERAL_VIVAS]` ou alias); o comentário
--                "As 5 RPCs…" (~2978) vira 3. É usada em 3 lugares: o `it.each(RPCS_GERAL)` do describe
--                "anon negado" (~3506), o `for … of RPCS_GERAL` do `it` "um usuário ATIVO de cada role SEM
--                financeiro/geral…" (~3589) e o da contraprova (~3641) — todos continuam valendo.
--             3. APAGAR o describe 'contrato RPC — Financeiro · Geral: aposentadas até o GATE 2 respondem
--                (objeto JSON qualquer)' com o comentário "As 2 aposentadas: …" acima dele (~3087–3094).
--             4. Só comentário/título (sem lógica): o comentário do bloco `get_geral_*` da lista de casos
--                (~372–377, cita `RPCS_GERAL_APOSENTADAS` e "até o GATE 2"); o comentário "Nomes que o derivador
--                vê aqui: … as 2 aposentadas" (~2954–2955); os comentários "até o GATE 2" (~3176, ~3358); o
--                comentário "4a. NEGAÇÃO: anon" ("nas 5 que existem… 3 vivas + 2 aposentadas", ~3502); o "4c"
--                ("e as 2 aposentadas (até o GATE 2)", ~3558); o título do `it` "…nas 3 RPCs vivas e nas 2
--                aposentadas até o GATE 2" (~3584); o título do `it` "contraprova: … (e pelas 2 aposentadas)…"
--                (~3624) e o comentário "As 3 vivas contra o schema da página; as 2 aposentadas só como objeto
--                JSON" (~3640–3641).
--             5. MANTER o import `z` (ainda usado em `solic_minhas_pendencias`, ~334) e `ZodType`.
--             6. `src/lib/ingestao/carga-contas-receber.test.ts` NÃO muda (cita `registrar_foto_prazos` só como
--                nome numa asserção de "zero chamadas").
--         · npm run db:baseline
--         · npx supabase gen types typescript --linked > src/types/database.ts
--           (perde get_geral_custos_financeiros, get_geral_prazos e registrar_foto_prazos)
--         · npx vitest run src/lib/rpc-contrato.test.ts            (verde)
--         · node scripts/credencial/derivar-allowlist.mjs verificador   (sem "não resolvidos")
--
-- ── DOWN (reversão) ──────────────────────────────────────────────────────────────────────────────────────
--   ORDEM: se o app já voltou para a v6.4.x (rollback da Vercel), o BANCO tem de voltar ANTES — a página
--   antiga lê as chaves podadas e chama as duas RPCs derrubadas. Com a v6.5.0 no ar, voltar o banco é
--   opcional e seguro (ver o último item).
--   • Tabelas e funções derrubadas: recriar pelas definições da 0297 —
--       geral_fin_grupo: tabela (:167-171), ENABLE RLS (:178), REVOKE/GRANT (:180, :182), COMMENT (:185-186) e o
--         seed (INSERT de :192);
--       geral_prazo_foto: tabela (:281-295), índices (:298-299), RLS/REVOKE/GRANT (:301-304), COMMENT (:306), SEM
--         o INSERT da foto inicial de :421;
--       geral_prazo_calcular (:312) com COMMENT (:368) e REVOKE/GRANT (:371-372);
--       registrar_foto_prazos (:377) com COMMENT (:413) e REVOKE/GRANT (:416-417);
--       get_geral_custos_financeiros (:429) e get_geral_prazos (:991) com os COMMENT de :1032/:1040 e os
--         REVOKE/GRANT de :1044-1061 (inclusive o GRANT ao `verificador`).
--   • A SÉRIE volta só do export JSON (b): o arquivo é o retorno do CLI, {"rows":[{"serie":[…]}]} — o array
--     está em rows[0].serie. A coluna id é GENERATED ALWAYS, então
--       INSERT INTO financeiro.geral_prazo_foto OVERRIDING SYSTEM VALUE
--       SELECT * FROM json_populate_recordset(NULL::financeiro.geral_prazo_foto, '<rows[0].serie>'::json);
--     seguido de `SELECT setval(pg_get_serial_sequence('financeiro.geral_prazo_foto','id'), max(id)) FROM
--     financeiro.geral_prazo_foto`.
--   • AO RESTAURAR as duas funções, restaurar também a constante `RPCS_GERAL_APOSENTADAS` (e o describe) em
--     src/lib/rpc-contrato.test.ts, e `RPCS_GERAL` voltar a incluí-la: sem isso o `verificador` mantém o GRANT
--     numa função que a allowlist derivada não enxerga.
--   • As duas RPCs podadas voltam pela 0301 (CREATE OR REPLACE dos corpos de lá, com os COMMENT de :733-738).
--     Isso é SEGURO com o front da v6.5.0 no ar: a 0301 emite um superconjunto das chaves que ele lê.
--
-- ── Como as chaves mantidas conservam o valor ────────────────────────────────────────────────────────────
--   Os dois corpos partem da definição VIVA pós-0301 (pg_get_functiondef), não de migration antiga. Nada
--   foi reescrito: foram REMOVIDOS blocos inteiros (chaves, CTEs e variáveis que só serviam a elas) e os
--   blocos restantes ficaram byte a byte iguais, salvo comentários que citavam o que saiu.
--     recebiveis — `ab`, `inad`, `tot`, `fx`, `dev`, `dev_rk`, `semanas`, `sem_agg` e as 8 chaves mantidas:
--       idênticas. Saíram só `topn`/`tp` (liam apenas a concentração) e v_ano/v_mes_ini/v_mes_ant (liam só
--       recuperado_ano/comparativo). Nenhuma CTE mantida lia `topn`, `tp` ou essas variáveis.
--     prejuizos — SÓ remoção, nenhuma lógica nova: saem o ramo UNION ALL que somava a série de líquido, os
--       dois itens do VALUES de `top` e as quatro chaves de saída (reversao e liquido, no topo e em
--       ano_anterior_ytd). `base`, `arr`, `ytd`, `pess`, bandeja e por_pessoa ficam idênticos; `ser`/`arr`
--       ainda carregam as linhas do papel de reversão, mas `top` só junta o k = prejuizo — efeito nulo.
--   O guard no fim lê o corpo vivo e exige as chaves mantidas PRESENTES e as podadas AUSENTES (nenhum comentário
--   dos corpos cita, entre aspas, chave que saiu — senão a própria ausência reprovaria).
--
-- ── Reconciliação e efetividade ──────────────────────────────────────────────────────────────────────────
--   • DML: NENHUM. Os DROP e os CREATE OR REPLACE ficam no TOP-LEVEL (o classificador do gate ignora corpo
--     dollar-quoted, inclusive o de `DO`); os `DO` são só guardas. Sem `EXCEPTION WHEN OTHERS`.
--   • Guard ANTES dos DROP (pré-condição): todas as assinaturas/tabelas-alvo EXISTEM (`to_regprocedure`/
--     `to_regclass` devolvem NULL também para erro de digitação — sem esta prova, um alvo digitado errado
--     passaria pelo guard final), os sobreviventes existem, a 0301 está aplicada (marcadores no corpo vivo) e
--     o md5(prosrc) das duas funções podadas é o do retrato pós-0301 (corpo divergente ⇒ aborta, fail-closed).
--   • Guard DEPOIS: alvos inexistentes; nenhum outro corpo de função cita os objetos derrubados; nenhum job do
--     pg_cron chama get_geral_*/registrar_foto_* (mesma consulta do pré-voo a.3); as duas podadas
--     e a antecipacoes com SECURITY DEFINER, search_path vazio, exigir_acesso no corpo, STABLE/json; grants
--     preservados (authenticated/service_role/verificador com EXECUTE; anon e ingestor sem); sem sobrecarga.
--   • `lock_timeout` curto: o DROP TABLE pede ACCESS EXCLUSIVE; melhor abortar do que travar leitura.
-- ---------------------------------------------------------------------------

BEGIN;

SET LOCAL lock_timeout = '5s';

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- (0) Pré-condição: os alvos existem (assinaturas PROVADAS) e a 0301 está aplicada.
-- ═════════════════════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_sig text;
  v_src text;
BEGIN
  FOREACH v_sig IN ARRAY ARRAY[
    'public.get_geral_custos_financeiros(integer)',
    'public.get_geral_prazos()',
    'public.registrar_foto_prazos(uuid)',
    'financeiro.geral_prazo_calcular()',
    -- sobreviventes
    'public.get_geral_recebiveis()',
    'public.get_geral_prejuizos(integer)',
    'public.get_geral_antecipacoes(integer)'
  ] LOOP
    IF to_regprocedure(v_sig) IS NULL THEN
      RAISE EXCEPTION 'poda Geral v2: função % não encontrada (assinatura mudou, ou o patch já foi aplicado?) — nada foi alterado.', v_sig;
    END IF;
  END LOOP;

  FOREACH v_sig IN ARRAY ARRAY[
    'financeiro.geral_prazo_foto',
    'financeiro.geral_fin_grupo',
    -- sobreviventes e leituras das funções podadas
    'financeiro.geral_perda_map',
    'financeiro.contas_receber_foto',
    'financeiro.contas_receber_foto_carga',
    'financeiro.fato_fluxo',
    'financeiro.dim_categoria',
    'financeiro.dre_categoria_map',
    'raw.contas_receber'
  ] LOOP
    IF to_regclass(v_sig) IS NULL THEN
      RAISE EXCEPTION 'poda Geral v2: tabela % não encontrada — nada foi alterado.', v_sig;
    END IF;
  END LOOP;

  -- A 0301 tem de estar aplicada: as podas partem do corpo dela. Corpo ainda de 0297 (sem as chaves novas)
  -- viraria, depois da poda, uma função SEM o contrato da v6.5.0.
  SELECT p.prosrc INTO v_src FROM pg_proc p WHERE p.oid = to_regprocedure('public.get_geral_recebiveis()');
  IF position('''evolucao_semanal''' IN v_src) = 0 OR position('''devedores''' IN v_src) = 0 THEN
    RAISE EXCEPTION 'poda Geral v2: get_geral_recebiveis() ainda não é a da 0301 (sem devedores/evolucao_semanal) — a 0301 foi aplicada?';
  END IF;
  SELECT p.prosrc INTO v_src FROM pg_proc p WHERE p.oid = to_regprocedure('public.get_geral_prejuizos(integer)');
  IF position('''por_pessoa''' IN v_src) = 0 THEN
    RAISE EXCEPTION 'poda Geral v2: get_geral_prejuizos(integer) ainda não é a da 0301 (sem por_pessoa) — a 0301 foi aplicada?';
  END IF;

  -- Trava contra corpo vivo divergente: as duas podas partem do retrato pós-0301 (md5 do prosrc medido no
  -- catálogo vivo). Se alguém alterou a função depois, o REPLACE apagaria a mudança em silêncio.
  IF (SELECT md5(p.prosrc) FROM pg_proc p WHERE p.oid = to_regprocedure('public.get_geral_recebiveis()'))
       IS DISTINCT FROM '53f0c0703045cd0efd22fa2b9de7aed5' THEN
    RAISE EXCEPTION 'poda Geral v2: public.get_geral_recebiveis() — corpo vivo divergiu do retrato pós-0301 — reescreva a poda a partir do catálogo vivo';
  END IF;
  IF (SELECT md5(p.prosrc) FROM pg_proc p WHERE p.oid = to_regprocedure('public.get_geral_prejuizos(integer)'))
       IS DISTINCT FROM '7123a2f8b861fde3bfb9d9b0d808d572' THEN
    RAISE EXCEPTION 'poda Geral v2: public.get_geral_prejuizos(integer) — corpo vivo divergiu do retrato pós-0301 — reescreva a poda a partir do catálogo vivo';
  END IF;
END
$$;

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- (1) DROP — funções antes das tabelas. Sem CASCADE: dependência de catálogo (view, trigger, FK) faz o
--     DROP falhar em vez de levar junto o que ninguém mapeou.
-- ═════════════════════════════════════════════════════════════════════════════════════════════
DROP FUNCTION public.get_geral_custos_financeiros(integer);
DROP FUNCTION public.get_geral_prazos();
DROP FUNCTION public.registrar_foto_prazos(uuid);
DROP FUNCTION financeiro.geral_prazo_calcular();

DROP TABLE financeiro.geral_prazo_foto;
DROP TABLE financeiro.geral_fin_grupo;

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- (2) get_geral_recebiveis() — PODADA (definição viva pós-0301, sem as chaves da v6.4.0 que a página largou)
-- ═════════════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_geral_recebiveis()
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_carga_id uuid;
  v_dp       date;
  v_gravado  timestamptz;
  v_semana   date;
  v_res      json;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/geral']);

  -- Carga vigente = a última foto de carga (gravada na MESMA transação do TRUNCATE+INSERT do raw).
  SELECT fc.carga_id, fc.data_posicao, fc.gravado_em
    INTO v_carga_id, v_dp, v_gravado
    FROM financeiro.contas_receber_foto_carga fc
   ORDER BY fc.gravado_em DESC, fc.carga_id DESC
   LIMIT 1;

  -- Sem base: zeros e listas vazias (nunca zero fabricado como se houvesse posição).
  IF v_carga_id IS NULL OR NOT EXISTS (SELECT 1 FROM raw.contas_receber) THEN
    RETURN json_build_object(
      'carga',              NULL::json,
      'inadimplente',       json_build_object('n', 0, 'valor', 0, 'faixas', '[]'::json),
      'historico_desde',    (SELECT min(fc.data_posicao) FROM financeiro.contas_receber_foto_carga fc),
      -- A UI trata "sem base" pela chave `carga` nula.
      'em_aberto',          json_build_object('n', 0, 'valor', 0),
      'vencido',            json_build_object('n', 0, 'valor', 0),
      'devedores',          json_build_object('top', '[]'::json,
                                              'demais', json_build_object('devedores', 0, 'n', 0, 'valor', 0)),
      'referencia_semana',  NULL::json,
      'evolucao_semanal',   '[]'::json
    );
  END IF;

  -- Segunda-feira da semana (seg–dom, ISO) da posição atual.
  v_semana  := date_trunc('week', v_dp::timestamp)::date;

  WITH ab AS (
    -- O mesmo conjunto que a foto grava: em aberto + marcados Inadimplente (inclusive liquidados).
    SELECT r.pessoa, r.vencimento, r.liquidacao, r.valor_final, r.conferido
      FROM raw.contas_receber r
     WHERE r.liquidacao IS NULL OR r.conferido = 'Inadimplente'
  ),
  inad AS (
    -- Inadimplente = SÓ a marcação do Financeiro (decisão do GATE 1): em aberto E conferido='Inadimplente'.
    SELECT i.pessoa, i.vencimento, i.valor_final
      FROM ab i
     WHERE i.liquidacao IS NULL AND i.conferido = 'Inadimplente'
  ),
  tot AS (
    SELECT count(*) AS n, COALESCE(sum(i.valor_final), 0) AS valor FROM inad i
  ),
  fx AS (
    -- Faixas pelos dias de atraso (data_posicao − vencimento) dos MARCADOS; sem vencimento cai em
    -- 'nao_vencido' para a soma das faixas fechar com o total.
    SELECT CASE
             WHEN i.vencimento IS NULL OR v_dp - i.vencimento <= 0 THEN 'nao_vencido'
             WHEN v_dp - i.vencimento <= 30 THEN '1-30'
             WHEN v_dp - i.vencimento <= 60 THEN '31-60'
             WHEN v_dp - i.vencimento <= 90 THEN '61-90'
             ELSE '90+'
           END AS faixa,
           count(*) AS n,
           sum(i.valor_final) AS valor
      FROM inad i
     GROUP BY 1
  ),
  dev AS (
    -- Inadimplentes por DEVEDOR, com o aparo de Marketing (espaço/tab/CR/LF/NBSP).
    SELECT NULLIF(btrim(i.pessoa, E' \t\r\n' || chr(160)), '') AS pessoa,
           count(*)                                           AS n,
           sum(i.valor_final)                                 AS valor,
           max(v_dp - i.vencimento)                           AS maior_atraso
      FROM inad i
     GROUP BY 1
  ),
  dev_rk AS (
    -- UMA janela decide top e demais ⇒ Σ top + demais ≡ inadimplente. Ordem total (pessoa é única
    -- por grupo): o corte do top 10 não flutua entre execuções.
    SELECT d.pessoa, d.n, d.valor, d.maior_atraso,
           row_number() OVER (ORDER BY d.valor DESC, d.pessoa ASC NULLS LAST) AS rn
      FROM dev d
  ),
  semanas AS (
    -- A foto que REPRESENTA cada semana (seg–dom, pela data_posicao): a de maior (gravado_em, carga_id)
    -- da semana — a MESMA ordem da carga vigente — e só até a semana da vigente (ver a 0301).
    SELECT DISTINCT ON (date_trunc('week', fc.data_posicao::timestamp))
           date_trunc('week', fc.data_posicao::timestamp)::date AS semana,
           fc.carga_id,
           fc.data_posicao,
           fc.em_aberto          AS fc_ab_n,
           fc.inadimplente_n     AS fc_inad_n,
           fc.inadimplente_valor AS fc_inad_valor
      FROM financeiro.contas_receber_foto_carga fc
     WHERE date_trunc('week', fc.data_posicao::timestamp)::date <= v_semana
     ORDER BY date_trunc('week', fc.data_posicao::timestamp), fc.gravado_em DESC, fc.carga_id DESC
  ),
  sem_agg AS (
    -- Funil de CADA foto representante, com a data_posicao DAQUELA foto. O INADIMPLENTE sai da própria
    -- `contas_receber_foto_carga` (gravado na transação da carga, imune a uma futura poda do detalhe);
    -- em aberto e vencido só existem no DETALHE por título. `completo` = o detalhe ainda tem todos os
    -- títulos em aberto que a foto contou: se a retenção (decisão pendente, inv. 8) podar o detalhe de uma
    -- carga antiga, a semana sai da série (LACUNA na UI) em vez de virar um zero fabricado (inv. 4 —
    -- achado MÉDIO do revisor-db). count(f.numero) (NOT NULL na PK), nunca count(*): a linha nula do LEFT
    -- JOIN não pode contar como "em aberto"; uma posição realmente zerada (0 = 0) continua completa.
    SELECT s.semana,
           s.data_posicao,
           count(f.numero) FILTER (WHERE f.liquidacao IS NULL) = s.fc_ab_n                      AS completo,
           count(f.numero) FILTER (WHERE f.liquidacao IS NULL)                                  AS ab_n,
           COALESCE(sum(f.valor_final) FILTER (WHERE f.liquidacao IS NULL), 0)                  AS ab_valor,
           count(f.numero) FILTER (WHERE f.liquidacao IS NULL AND f.vencimento < s.data_posicao) AS venc_n,
           COALESCE(sum(f.valor_final) FILTER (WHERE f.liquidacao IS NULL
                                                 AND f.vencimento < s.data_posicao), 0)         AS venc_valor,
           s.fc_inad_n                                                                          AS inad_n,
           s.fc_inad_valor                                                                      AS inad_valor
      FROM semanas s
      LEFT JOIN financeiro.contas_receber_foto f ON f.carga_id = s.carga_id
     GROUP BY s.semana, s.data_posicao, s.fc_ab_n, s.fc_inad_n, s.fc_inad_valor
  )
  SELECT json_build_object(
    'carga', json_build_object('carga_id', v_carga_id, 'data_posicao', v_dp, 'gravado_em', v_gravado),
    'inadimplente', (
      SELECT json_build_object(
               'n',     t.n,
               'valor', t.valor,
               'faixas', (
                 SELECT json_agg(json_build_object(
                          'faixa', z.faixa,
                          'n',     COALESCE(f.n, 0),
                          'valor', COALESCE(f.valor, 0)
                        ) ORDER BY z.ord)
                   FROM (VALUES ('nao_vencido', 1), ('1-30', 2), ('31-60', 3), ('61-90', 4), ('90+', 5)) AS z(faixa, ord)
                   LEFT JOIN fx f ON f.faixa = z.faixa
               ))
        FROM tot t
    ),
    'historico_desde', (SELECT min(fc.data_posicao) FROM financeiro.contas_receber_foto_carga fc),
    -- Funil da posição atual (raw.contas_receber, a mesma `ab`), em valor_final.
    'em_aberto', (
      SELECT json_build_object('n', count(*), 'valor', COALESCE(sum(x.valor_final), 0))
        FROM ab x
       WHERE x.liquidacao IS NULL
    ),
    'vencido', (
      SELECT json_build_object('n', count(*), 'valor', COALESCE(sum(x.valor_final), 0))
        FROM ab x
       WHERE x.liquidacao IS NULL AND x.vencimento < v_dp
    ),
    'devedores', json_build_object(
      'top', COALESCE((
        SELECT json_agg(json_build_object(
                 'pessoa',       r.pessoa,
                 'n',            r.n,
                 'valor',        r.valor,
                 'maior_atraso', r.maior_atraso
               ) ORDER BY r.rn)
          FROM dev_rk r
         WHERE r.rn <= 10
      ), '[]'::json),
      'demais', (
        SELECT json_build_object(
                 'devedores', count(*),
                 'n',         COALESCE(sum(r.n), 0)::bigint,
                 'valor',     COALESCE(sum(r.valor), 0))
          FROM dev_rk r
         WHERE r.rn > 10
      )
    ),
    -- Referência do Δ: o ponto da própria série imediatamente anterior à semana da posição atual.
    'referencia_semana', (
      SELECT json_build_object(
               'data_posicao', r.data_posicao,
               'em_aberto',    json_build_object('n', r.ab_n,   'valor', r.ab_valor),
               'vencido',      json_build_object('n', r.venc_n, 'valor', r.venc_valor),
               'inadimplente', json_build_object('n', r.inad_n, 'valor', r.inad_valor))
        FROM sem_agg r
       WHERE r.semana < v_semana AND r.completo
       ORDER BY r.semana DESC
       LIMIT 1
    ),
    'evolucao_semanal', COALESCE((
      SELECT json_agg(json_build_object(
               'semana',             e.semana,
               'data_posicao',       e.data_posicao,
               'inadimplente_n',     e.inad_n,
               'inadimplente_valor', e.inad_valor,
               'vencido_valor',      e.venc_valor
             ) ORDER BY e.semana)
        FROM sem_agg e
       WHERE e.completo
    ), '[]'::json)
  ) INTO v_res;

  RETURN v_res;
END $function$;

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- (3) get_geral_prejuizos(integer) — PODADA (definição viva pós-0301, sem a série de reversão e a de líquido)
-- ═════════════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_geral_prejuizos(p_ano integer)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_hoje    date := current_date;
  v_rel     text;
  v_mes     int;
  v_cut     int;
  v_ini     date;
  v_ini_ant date;
  v_fim     date;
  v_zeros   numeric[] := ARRAY(SELECT 0::numeric FROM generate_series(1, 12));
  v_res     json;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['financeiro/geral']);

  IF p_ano IS NULL OR p_ano < 2000 OR p_ano > 2100 THEN
    RAISE EXCEPTION 'Ano inválido.';
  END IF;

  v_rel := CASE
    WHEN p_ano < extract(year FROM v_hoje)::int THEN 'fechado'
    WHEN p_ano = extract(year FROM v_hoje)::int THEN 'corrente'
    ELSE 'futuro'
  END;
  v_mes := CASE WHEN v_rel = 'corrente' THEN extract(month FROM v_hoje)::int END;
  v_cut := CASE WHEN v_rel = 'corrente' THEN v_mes ELSE 12 END;
  v_ini     := make_date(p_ano, 1, 1);
  v_ini_ant := make_date(p_ano - 1, 1, 1);
  v_fim     := make_date(p_ano + 1, 1, 1);

  WITH base AS (
    -- Categorias da tabela curada ⨝ mapa da DRE (NOT excluida), em QUALQUER bloco. Uma varredura.
    -- Agrupa também pela pessoa aparada (espaço/tab/CR/LF/NBSP — o aparo de 0292:206) e conta as
    -- linhas; `ser` soma por cima (soma de numeric é exata: as séries existentes não mudam de valor) e
    -- `pess` lê ESTA mesma varredura ⇒ Σ por_pessoa ≡ prejuizo.total por construção.
    SELECT extract(year FROM f.data_competencia)::int  AS ano,
           extract(month FROM f.data_competencia)::int AS mes,
           pm.papel,
           NULLIF(btrim(f.pessoa, E' \t\r\n' || chr(160)), '') AS pessoa,
           count(*)                                    AS n,
           sum(f.valor)                                AS valor
      FROM financeiro.fato_fluxo f
      JOIN financeiro.geral_perda_map pm ON pm.categoria_id = f.categoria_id
      JOIN financeiro.dre_categoria_map m
        ON m.categoria_id = f.categoria_id AND NOT m.excluida
     WHERE f.tipo = 'realizado'
       AND f.data_competencia >= v_ini_ant
       AND f.data_competencia <  v_fim
     GROUP BY 1, 2, 3, 4
  ),
  ser AS (
    SELECT b.papel AS k, b.ano, b.mes, sum(b.valor) AS v FROM base b GROUP BY b.papel, b.ano, b.mes
  ),
  arr AS (
    SELECT kk.k, kk.ano,
           (SELECT array_agg(COALESCE(s.v, 0) ORDER BY i.i)
              FROM generate_series(1, 12) AS i(i)
              LEFT JOIN ser s ON s.k = kk.k AND s.ano = kk.ano AND s.mes = i.i)::numeric[] AS meses
      FROM (SELECT DISTINCT s0.k, s0.ano FROM ser s0) kk
  ),
  top AS (
    SELECT ks.k,
           COALESCE(ac.meses, v_zeros) AS meses,
           COALESCE(ap.meses, v_zeros) AS meses_ant
      FROM (VALUES ('prejuizo')) AS ks(k)
      LEFT JOIN arr ac ON ac.k = ks.k AND ac.ano = p_ano
      LEFT JOIN arr ap ON ap.k = ks.k AND ap.ano = p_ano - 1
  ),
  ytd AS (
    SELECT t.k, t.meses,
           (SELECT COALESCE(sum(x), 0) FROM unnest(t.meses) x) AS total,
           (SELECT COALESCE(sum(u.x), 0)
              FROM unnest(t.meses_ant) WITH ORDINALITY AS u(x, n)
             WHERE u.n <= v_cut) AS ytd_ant
      FROM top t
  ),
  pess AS (
    -- O prejuízo do ano por pessoa, SEM corte (o top N + demais é do módulo puro do front). Só pessoa
    -- com ao menos um lançamento (n ≥ 1); NULL = lançamento sem pessoa, UM balde.
    SELECT b.pessoa,
           sum(b.n)     AS n,
           sum(b.valor) AS valor
      FROM base b
     WHERE b.papel = 'prejuizo' AND b.ano = p_ano
     GROUP BY b.pessoa
  )
  SELECT json_build_object(
    'ano',          p_ano,
    'relacao',      v_rel,
    'mes_corrente', v_mes,
    'prejuizo',     (SELECT json_build_object('meses', y.meses, 'total', y.total) FROM ytd y WHERE y.k = 'prejuizo'),
    'ano_anterior_ytd', json_build_object(
      'prejuizo', (SELECT y.ytd_ant FROM ytd y WHERE y.k = 'prejuizo')
    ),
    -- Bandeja: categoria de nome preju/perda FORA da tabela curada, com o realizado do ano.
    'bandeja', COALESCE((
      SELECT json_agg(json_build_object(
               'categoria_id', dc.id,
               'rotulo',       COALESCE(m.rotulo, dc.categoria),
               'total',        COALESCE((
                 SELECT sum(f.valor)
                   FROM financeiro.fato_fluxo f
                  WHERE f.categoria_id = dc.id
                    AND f.tipo = 'realizado'
                    AND f.data_competencia >= v_ini
                    AND f.data_competencia <  v_fim
               ), 0)
             ) ORDER BY COALESCE(m.rotulo, dc.categoria), dc.id)
        FROM financeiro.dim_categoria dc
        LEFT JOIN financeiro.dre_categoria_map m ON m.categoria_id = dc.id
       WHERE (dc.categoria ILIKE '%preju%' OR dc.categoria ILIKE '%perda%')
         AND NOT EXISTS (SELECT 1 FROM financeiro.geral_perda_map pm WHERE pm.categoria_id = dc.id)
    ), '[]'::json),
    'atualizado_em', (SELECT max(f.gerado_em) FROM financeiro.fato_fluxo f),
    -- Lista completa do prejuízo do ano por pessoa, do maior prejuízo (mais negativo) ao menor;
    -- empate por pessoa, NULL por último. Item = só {pessoa, n, valor} (nenhuma coluna a mais do lançamento).
    'por_pessoa', COALESCE((
      SELECT json_agg(json_build_object(
               'pessoa', q.pessoa,
               'n',      q.n::bigint,
               'valor',  q.valor
             ) ORDER BY q.valor ASC, q.pessoa ASC NULLS LAST)
        FROM pess q
    ), '[]'::json)
  ) INTO v_res;

  RETURN v_res;
END $function$;

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- (4) COMMENT — contrato que sobrou (nenhuma chave podada citada)
-- ═════════════════════════════════════════════════════════════════════════════════════════════
COMMENT ON FUNCTION public.get_geral_recebiveis() IS
  'Geral v6.5.0: posição de recebíveis na carga vigente de raw.contas_receber. em_aberto/vencido {n,valor}; inadimplente {n,valor,faixas} (marcação Conferido=Inadimplente); devedores {top[≤10] {pessoa,n,valor,maior_atraso}, demais {devedores,n,valor}} (aparo de pessoa de Marketing; Σ top+demais ≡ inadimplente); referencia_semana (a última foto ANTES da semana da posição — pode ser de 2+ semanas atrás —, p/ o Δ; null sem foto anterior); evolucao_semanal [{semana,data_posicao,inadimplente_n,inadimplente_valor,vencido_valor}] (a última foto de cada semana seg–dom, do detalhe contas_receber_foto; semana sem carga não vem); historico_desde. Sem base: carga null, zeros e listas vazias.';
COMMENT ON FUNCTION public.get_geral_prejuizos(integer) IS
  'Geral v6.5.0: prejuízo por mês (categorias de geral_perda_map com papel prejuizo ⨝ dre_categoria_map NOT excluida, realizado) com ano_anterior_ytd {prejuizo} + por_pessoa [{pessoa,n,valor}] (lista completa do ano, mesma varredura do prejuizo: Σ por_pessoa ≡ prejuizo.total; pessoa aparada, NULL = sem pessoa; do maior prejuízo ao menor) + bandeja de categorias preju/perda não curadas.';

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- (5) Guard de EFETIVIDADE — a transação inteira aborta se a intenção não se cumpriu.
-- ═════════════════════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_sig    text;
  v_pres   text;
  v_aus    text;
  v_k      text;
  v_proc   regprocedure;
  v_src    text;
  v_n      int;
  v_nomes  text;
BEGIN
  -- (a) O que devia sair, saiu. As mesmas strings foram provadas NÃO-NULAS no guard de pré-condição, então
  -- o NULL de agora significa "não existe mais", e não "digitei errado".
  FOREACH v_sig IN ARRAY ARRAY[
    'public.get_geral_custos_financeiros(integer)',
    'public.get_geral_prazos()',
    'public.registrar_foto_prazos(uuid)',
    'financeiro.geral_prazo_calcular()'
  ] LOOP
    IF to_regprocedure(v_sig) IS NOT NULL THEN
      RAISE EXCEPTION 'poda Geral v2: % ainda existe', v_sig;
    END IF;
  END LOOP;
  FOREACH v_sig IN ARRAY ARRAY[
    'financeiro.geral_prazo_foto',
    'financeiro.geral_prazo_foto_id_seq',
    'financeiro.geral_fin_grupo'
  ] LOOP
    IF to_regclass(v_sig) IS NOT NULL THEN
      RAISE EXCEPTION 'poda Geral v2: % ainda existe', v_sig;
    END IF;
  END LOOP;

  -- (b) O que devia ficar, ficou (a curadoria do papel prejuizo não pode ter ido junto).
  IF to_regclass('financeiro.geral_perda_map') IS NULL THEN
    RAISE EXCEPTION 'poda Geral v2: financeiro.geral_perda_map sumiu (devia permanecer)';
  END IF;

  -- (c) Nenhum corpo de função restante cita o que foi derrubado (plpgsql só liga objeto em runtime: sem
  -- esta varredura, um consumidor esquecido só falharia na 1ª chamada).
  SELECT count(*), string_agg(n.nspname || '.' || p.proname, ', ' ORDER BY n.nspname, p.proname)
    INTO v_n, v_nomes
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
     AND (p.prosrc ILIKE '%geral_prazo_foto%'
          OR p.prosrc ILIKE '%geral_fin_grupo%'
          OR p.prosrc ILIKE '%registrar_foto_prazos%'
          OR p.prosrc ILIKE '%get_geral_custos_financeiros%'
          OR p.prosrc ILIKE '%get_geral_prazos%'
          OR p.prosrc ILIKE '%geral_prazo_calcular%');
  IF v_n > 0 THEN
    RAISE EXCEPTION 'poda Geral v2: % função(ões) ainda citam objeto derrubado: %', v_n, v_nomes;
  END IF;

  -- (c2) Nenhum agendamento do pg_cron chama o que saiu (o comando de um job não é função: a varredura
  -- acima não o vê). Dinâmico: se o schema `cron` não existir neste banco, não há job a conferir.
  IF to_regclass('cron.job') IS NOT NULL THEN
    EXECUTE $q$SELECT count(*) FROM cron.job WHERE command ILIKE '%geral_%' OR command ILIKE '%registrar_foto%'$q$
      INTO v_n;
    IF v_n > 0 THEN
      RAISE EXCEPTION 'poda Geral v2: % job(s) do pg_cron ainda chamam get_geral_* / registrar_foto_*', v_n;
    END IF;
  END IF;

  -- (d) As 3 RPCs vivas: forma, segurança, grants e chaves.
  FOR v_sig, v_pres, v_aus IN
    SELECT * FROM (VALUES
      ('public.get_geral_recebiveis()',
       'carga,inadimplente,historico_desde,em_aberto,vencido,devedores,referencia_semana,evolucao_semanal,'
       || 'faixas,top,demais,maior_atraso,semana,data_posicao,inadimplente_n,inadimplente_valor,vencido_valor,carga_id,gravado_em',
       'a_vencer,marcacao_em_aberto,concentracao,recuperado_ano,comparativo,evolucao'),
      ('public.get_geral_prejuizos(integer)',
       'ano,relacao,mes_corrente,prejuizo,meses,total,ano_anterior_ytd,bandeja,categoria_id,rotulo,atualizado_em,por_pessoa,pessoa,n,valor',
       'reversao,liquido'),
      -- Não foi recriada: confere só que continua como a 0301 a deixou (incl. total.desconto_pct).
      ('public.get_geral_antecipacoes(integer)',
       'ano,relacao,mes_corrente,meses,total,ano_anterior_ytd,por_conta,ultima_data,dias_desde_ultima,maior_intervalo_ano,atualizado_em,desconto_pct',
       '')
    ) AS t(sig, pres, aus)
  LOOP
    v_proc := to_regprocedure(v_sig);
    IF v_proc IS NULL THEN
      RAISE EXCEPTION 'poda Geral v2: função % não encontrada', v_sig;
    END IF;
    SELECT p.prosrc INTO v_src FROM pg_proc p WHERE p.oid = v_proc;

    -- As aspas discriminam 'financeiro/geral' de 'financeiro/geral/gestao'.
    IF position('''financeiro/geral''' IN v_src) = 0 THEN
      RAISE EXCEPTION 'poda Geral v2: corpo de % não exige financeiro/geral', v_sig;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = v_proc AND prosecdef
                      AND proconfig @> ARRAY['search_path=""']) THEN
      RAISE EXCEPTION 'poda Geral v2: % sem SECURITY DEFINER ou sem search_path vazio', v_sig;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = v_proc AND provolatile = 's' AND prorettype = 'json'::regtype) THEN
      RAISE EXCEPTION 'poda Geral v2: % deixou de ser STABLE ou de retornar json', v_sig;
    END IF;

    -- Chaves mantidas presentes, chaves podadas ausentes.
    FOREACH v_k IN ARRAY string_to_array(v_pres, ',') LOOP
      IF position('''' || v_k || '''' IN v_src) = 0 THEN
        RAISE EXCEPTION 'poda Geral v2: corpo de % não emite a chave %', v_sig, v_k;
      END IF;
    END LOOP;
    IF v_aus <> '' THEN
      FOREACH v_k IN ARRAY string_to_array(v_aus, ',') LOOP
        IF position('''' || v_k || '''' IN v_src) > 0 THEN
          RAISE EXCEPTION 'poda Geral v2: corpo de % ainda cita a chave podada %', v_sig, v_k;
        END IF;
      END LOOP;
    END IF;

    -- Grants: o CREATE OR REPLACE com a mesma assinatura os preserva (nenhum GRANT/REVOKE neste patch).
    IF has_function_privilege('anon', v_proc, 'EXECUTE') THEN
      RAISE EXCEPTION 'poda Geral v2: anon ainda tem EXECUTE em %', v_sig;
    END IF;
    IF NOT has_function_privilege('authenticated', v_proc, 'EXECUTE') THEN
      RAISE EXCEPTION 'poda Geral v2: authenticated sem EXECUTE em %', v_sig;
    END IF;
    IF NOT has_function_privilege('service_role', v_proc, 'EXECUTE') THEN
      RAISE EXCEPTION 'poda Geral v2: service_role sem EXECUTE em %', v_sig;
    END IF;
    IF NOT has_function_privilege('verificador', v_proc, 'EXECUTE') THEN
      RAISE EXCEPTION 'poda Geral v2: verificador sem EXECUTE em %', v_sig;
    END IF;
    IF has_function_privilege('ingestor', v_proc, 'EXECUTE') THEN
      RAISE EXCEPTION 'poda Geral v2: ingestor não deveria ter EXECUTE em %', v_sig;
    END IF;
  END LOOP;

  -- (e) Nenhuma sobrecarga criada por engano: sobraram exatamente as 3 get_geral_* (uma por nome).
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname LIKE 'get\_geral\_%') <> 3 THEN
    RAISE EXCEPTION 'poda Geral v2: o conjunto de get_geral_* em public não é exatamente {recebiveis, prejuizos, antecipacoes}';
  END IF;
END
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
