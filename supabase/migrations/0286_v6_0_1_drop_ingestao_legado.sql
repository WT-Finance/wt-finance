-- 0286 — v6.0.1: a destrutiva do GATE 3 — sai o caminho LEGADO de carga das bases
--
-- ⚠️ ESTE ARQUIVO NÃO ESTÁ EM `supabase/migrations/` DE PROPÓSITO.
-- `db push` empurra TODO o conjunto pendente da pasta. Destrutiva estacionada lá vai junto no
-- próximo push de qualquer branch (foi assim que a v5.2.0 dropou bases por arrasto). O arquivo
-- mora em `supabase/patches/` e só é MOVIDO para `supabase/migrations/` no instante da
-- aplicação, pelo Yan, em TTY. O roteiro exato está no fim deste cabeçalho.
--
-- DECLARAÇÃO: DESTRUTIVA. **DOZE funções e UMA tabela** saem do banco:
--   4 `truncar_*` + 5 `inserir_lote_*` (legado) + `promover_carga_vendas()` (SÓ a sem argumentos)
--   + `truncate_dynamic_tables()` + `registrar_ingestao_log(text,text,integer,text)`  = 12 funções
--   + `audit.ingestao_log` (10 linhas de log de seed, de 29/04 a 21/05/2026)            =  1 tabela
-- O schema `audit` fica (vazio). Confirmação humana em TTY é obrigatória — o wrapper
-- `npm run db:migrate -- --destrutiva` aborta em stdin não-TTY (ADR-0131); o agente não aplica.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- POR QUE APLICAR ANTES DO MERGE DA v6.0.1 AINDA CUMPRE O GATE 3
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- O GATE 3 exige que o código que referencia cada objeto já tenha saído de PRODUÇÃO antes do
-- DROP. Aqui há dois tipos de consumidor, e os dois estão fora:
--   (a) o CARD de uploads (código deployado): deixou de chamar o legado na v6.0.0 — commits
--       029b0a5 (M4: sai `carregarLancamentos` do card) e 7fb7097 (M5: saem as chamadas de
--       Movimentação, Aberto e Demonstrativo), mergeados no PR #279 (merge 6651f76, 28/09/2026
--       09:43 −03) e deployados pela Vercel. Desde então nenhum código em produção chama alvo algum.
--   (b) os SEEDS (`npm run seed`, `seed-fluxo-caixa.ts`): rodam na máquina do Yan, NÃO sobem para
--       a Vercel. Saem do legado nesta mesma versão — commit 0811644 (seed reescrito como cliente do
--       contrato de ingestão; `seed-fluxo-caixa.ts`, `parse-excel.ts` e `carregarLancamentos`
--       apagados). Rodar o seed da worktree da v6.0.1 já não toca nada daqui.
-- CONSEQUÊNCIA ACEITA (frente única, registrada na spec): entre este DROP e o merge da v6.0.1, o
-- `main` ainda tem `rpc-contrato.test.ts`/`credencial-ingestor.test.ts` esperando algumas destas
-- funções, e `npm run seed` do `main` falharia. Nenhuma outra sessão deve rodar a suíte com banco
-- nem o seed a partir do `main` nesse intervalo.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- RECONTAGEM NO ATO (28/09/2026, catálogo vivo, conexão READ ONLY)
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- As superfícies de `supabase/patches/bloco5-recontagem.sql` + view + cron + pg_depend:
--   corpo de outra função · POLICY · TRIGGER · CHECK · VIEW · `cron.job.command` · pg_depend
-- Resultado: NENHUM dos 12 alvos é citado em superfície alguma. A única referência encontrada é
-- `audit.ingestao_log`, citada só por `registrar_ingestao_log` — que é alvo e sai ANTES dela.
-- `audit.ingestao_log`: sem FK de/para, sem trigger, sem view; a sequence `ingestao_log_id_seq`
-- é da coluna (deptype 'a') e sai com a tabela.
-- Grants lidos no ato: todos os alvos são EXECUTE só de `service_role` (+ dono), EXCETO
-- `promover_carga_vendas()` (zero-arg), que também tem EXECUTE para `ingestor` — herança da
-- v6.0.0. EXECUTE da `ingestor` em `public` no ato (ACL explícita, 21 funções): as 5×
-- `limpar_staging_*`/`inserir_lote_staging*`/`validar_carga_*`/`promover_carga_*(jsonb, uuid)`
-- das cinco bases + a `promover_carga_vendas()` zero-arg. Depois do DROP: as mesmas 20, sem a
-- zero-arg — a rota só chama a `(jsonb, uuid)` (`aplicar.ts:643`).
-- As 38 assinaturas dos dois guards abaixo (12 alvos + 26 que ficam) foram resolvidas por
-- `to_regprocedure` no ato, todas NÃO nulas — sem isso, um erro de digitação num alvo daria
-- NULL antes e depois do DROP e o guard passaria cego.
--
-- PROVA DE GREP (invariante 8), no HEAD b04baff (depois de 0811644 e dos testes), sobre
-- `src supabase/seed scripts`, pelos 11 nomes únicos + `ingestao_log`:
--   src/types/database.ts            11 linhas  ← ESPELHO GERADO (ADR-0173), regenerado no pós-aplicação
--   src/lib/ingestao/aplicar.ts:236   1 linha   ← comentário (migration de origem das colunas)
--   src/lib/ingestao/aplicar.test.ts  3 linhas  ← comentários
--   src/lib/rpc-contrato.test.ts      3 linhas  ← comentários ("saíram desta lista")
--   src/lib/ingestao/credencial-ingestor.test.ts  1 linha  ← comentário
--   src/lib/ingestao/sonda-leitores-vendas-excel.test.ts  4 linhas  ← comentário + 2 CHAVES da
--        allowlist da sonda (string, não chamada) — ficam até a 0286 aplicada e saem no pós-aplicação
--   supabase/seed, scripts           0 linhas
-- Nenhum call-site. `promover_carga_vendas` segue citada em `aplicar.ts:643` e `rpcs-ingestor.ts:44`
-- — chamada COM `{ p_checksums, p_carga_id }`, ou seja, a `(jsonb, uuid)`, que FICA.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- O QUE **NÃO** ENTRA, e por quê
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- • Todo o caminho NOVO da v6.0.0: `limpar_staging_*`, `inserir_lote_staging*`, `validar_carga_*`,
--   `promover_carga_*(jsonb, uuid)`, `transform_raw_to_analytics`, `regenerar_fluxo_caixa`.
-- • `promover_carga_vendas(jsonb, uuid)` — mesmo NOME do alvo zero-arg. Por isso cada DROP abaixo
--   tem assinatura explícita e o guard compara por `to_regprocedure`, não por nome (o guard da
--   0270 comparava por nome e, aqui, reprovaria a sobrevivente certa).
-- • PESSOAS (`limpar_staging_pessoas`, `inserir_lote_staging_pessoas`, `validar_carga_pessoas`,
--   `promover_carga_pessoas()`): fora do contrato de ingestão v1 (decisão 11 da v6.0.0), ainda é
--   o caminho vivo daquela base.
-- • `validar_carga_staging()` — é a validação de Vendas do caminho novo: a rota a chama por RPC
--   entre o staging e a promoção (`src/lib/ingestao/aplicar.ts:617`, `rpcs-ingestor.ts:43`). O
--   nome antigo engana, mas é caminho vivo.
-- • O schema `audit`: fica vazio; apagar schema é outra decisão.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- COMO APLICAR (Yan, em TTY — o agente não aplica destrutiva)
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- RODE DE DENTRO DA WORKTREE da v6.0.1 (o checkout raiz não tem esta pasta `patches/` atualizada):
--
--   cd /home/yan-wt/projects/wt-finance/.claude/worktrees/fix-v6-0-1-destrutiva
--   npx supabase migration list          # ANTES: 0285 pareada, NENHUMA pendente
--   mv supabase/patches/0286_v6_0_1_drop_ingestao_legado.sql supabase/migrations/
--   npx supabase migration list          # DEPOIS: 0286 é a ÚNICA com local sem remote
--   npm run db:migrate -- --destrutiva   # backup-gate + restore-test + confirmação em TTY
--
-- Se a lista mostrar QUALQUER outra migration pendente além da 0286, PARE: `db push` levaria as duas.
--
-- COMO REVERTER, se for preciso: `supabase/patches/0286-rollback-corpos-vivos.sql` — corpo de
-- cada uma das 12 funções por `pg_get_functiondef` do CATÁLOGO VIVO (28/09/2026, antes deste
-- DROP), com os GRANT/REVOKE lidos no ato, mais a estrutura de `audit.ingestao_log`, a sequence,
-- as ACLs e as 10 linhas. É a fonte certa, não as migrations de origem (podem ter sido superadas
-- por `CREATE OR REPLACE` posterior). O backup do gate é a segunda rede.

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- CINTO: o log de seed não pode ter crescido desde a prova
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- Prova no ato (28/09/2026): 10 linhas, ids 1..10, a última de 21/05/2026 — todas do seed
-- antigo, que é o ÚNICO escritor. Se alguém rodou o seed antigo entre a prova e a aplicação,
-- a contagem muda e a migration ABORTA: é sinal de consumidor vivo que a recontagem não viu.
DO $$
DECLARE v_n bigint; v_max bigint;
BEGIN
  SELECT count(*), max(id) INTO v_n, v_max FROM audit.ingestao_log;
  IF v_n <> 10 OR v_max <> 10 THEN
    RAISE EXCEPTION 'ABORTADO: audit.ingestao_log tem % linha(s) (max id %) — a prova de 28/09/2026 '
                    'era 10 linhas, ids 1..10. Alguém rodou o seed antigo? Reavalie antes de dropar.', v_n, v_max;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 1. Demonstrativo por Competência — legado substituído pela promoção atômica (v6.0.0)
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- Última referência: o card, removida em 7fb7097 (v6.0.0 M5). Nenhum seed as usava.
-- Caminho vivo: `limpar_staging_demonstrativo` → `inserir_lote_staging_demonstrativo` →
-- `validar_carga_demonstrativo` → `promover_carga_demonstrativo(jsonb, uuid)`.
DROP FUNCTION IF EXISTS public.truncar_demonstrativo_competencia();
DROP FUNCTION IF EXISTS public.inserir_lote_demonstrativo_competencia(jsonb);

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 2. Movimentação (Fluxo de Caixa) — idem
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- Últimas referências: o card, removida em 7fb7097 (v6.0.0 M5); e `seed-fluxo-caixa.ts`,
-- apagado em 0811644. Caminho vivo: `promover_carga_movimentacao(jsonb, uuid)`.
DROP FUNCTION IF EXISTS public.truncar_lancamentos_movimentacao();
DROP FUNCTION IF EXISTS public.inserir_lote_lancamentos_movimentacao(jsonb);

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 3. Títulos em Aberto — idem
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- Últimas referências: o card, removida em 7fb7097 (v6.0.0 M5); e `seed-fluxo-caixa.ts`,
-- apagado em 0811644. Caminho vivo: `promover_carga_aberto(jsonb, uuid)`.
DROP FUNCTION IF EXISTS public.truncar_titulos_em_aberto();
DROP FUNCTION IF EXISTS public.inserir_lote_titulos_em_aberto(jsonb);

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 4. Operação (`analytics.fato_lancamento_operacao`) — idem
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- Os nomes dizem "lancamentos", mas a tabela é a da Lista de Operações (a que
-- `truncar_lancamentos` trunca). Últimas referências: `carregarLancamentos`
-- (`src/lib/carga/lancamentos.ts`) — tirada do card em 029b0a5 (v6.0.0 M4) e apagada, junto com
-- o uso pelo seed, em 0811644. Caminho vivo: `promover_carga_operacao(jsonb, uuid)`.
DROP FUNCTION IF EXISTS public.truncar_lancamentos();
DROP FUNCTION IF EXISTS public.inserir_lote_lancamentos(jsonb);

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 5. Vendas — o carregador do seed antigo (TRATADO → raw.vendas_excel)
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- `truncate_dynamic_tables()` zera só as tabelas de Vendas (fato_venda_item, fato_venda,
-- dim_produto, dim_pagante, dim_vendedor, raw.vendas_excel) — o que a promoção nova já faz
-- dentro da transação. `inserir_lote_raw(jsonb)` escrevia direto em `raw.vendas_excel`, sem
-- staging nem checksum. `promover_carga_vendas()` (zero-arg) é a promoção pré-checksum; a
-- `(jsonb, uuid)` a substituiu e FICA. Última referência das três: `supabase/seed/seed.ts`
-- (e `parse-excel.ts`), reescrito/apagado em 0811644. O card nunca chamou nenhuma das três
-- depois de 7fb7097.
DROP FUNCTION IF EXISTS public.truncate_dynamic_tables();
DROP FUNCTION IF EXISTS public.inserir_lote_raw(jsonb);
DROP FUNCTION IF EXISTS public.promover_carga_vendas();

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 6. Log do seed antigo — o log vivo é `ingestao.carga` (v6.0.0)
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- `registrar_ingestao_log` é o único escritor de `audit.ingestao_log`, e o seed antigo o
-- único chamador (removido em 0811644). A função sai antes da tabela porque é ela que a cita.
-- A tabela sai SEM CASCADE de propósito: se algo inesperado depender dela, o DROP tem de
-- falhar alto, não arrastar em silêncio.
DROP FUNCTION IF EXISTS public.registrar_ingestao_log(text, text, integer, text);
DROP TABLE IF EXISTS audit.ingestao_log;

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- GUARD DE EFETIVIDADE — todo `IF EXISTS` acima é potencialmente um NO-OP SILENCIOSO
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- Por ASSINATURA (`to_regprocedure`), não por nome: `promover_carga_vendas` existe em duas
-- assinaturas e só uma sai. Se QUALQUER alvo sobreviveu, ou QUALQUER coisa que tinha de ficar
-- sumiu, a transação inteira aborta.
DO $$
DECLARE
  v_sig   text;
  v_resto text := '';
  v_falta text := '';
BEGIN
  FOREACH v_sig IN ARRAY ARRAY[
    'public.truncar_demonstrativo_competencia()',
    'public.inserir_lote_demonstrativo_competencia(jsonb)',
    'public.truncar_lancamentos_movimentacao()',
    'public.inserir_lote_lancamentos_movimentacao(jsonb)',
    'public.truncar_titulos_em_aberto()',
    'public.inserir_lote_titulos_em_aberto(jsonb)',
    'public.truncar_lancamentos()',
    'public.inserir_lote_lancamentos(jsonb)',
    'public.truncate_dynamic_tables()',
    'public.inserir_lote_raw(jsonb)',
    'public.promover_carga_vendas()',
    'public.registrar_ingestao_log(text,text,integer,text)'
  ] LOOP
    IF to_regprocedure(v_sig) IS NOT NULL THEN
      v_resto := v_resto || ' ' || v_sig;
    END IF;
  END LOOP;
  IF v_resto <> '' THEN
    RAISE EXCEPTION 'ABORTADO: DROP nao teve efeito em:%. Quase sempre e assinatura divergente '
                    'do catalogo — o IF EXISTS engole o erro em silencio.', v_resto;
  END IF;
  IF to_regclass('audit.ingestao_log') IS NOT NULL THEN
    RAISE EXCEPTION 'ABORTADO: audit.ingestao_log ainda existe apos o DROP.';
  END IF;

  -- E o contrapeso: o caminho NOVO e o de Pessoas ficaram.
  FOREACH v_sig IN ARRAY ARRAY[
    -- Vendas
    'public.limpar_staging_vendas()',
    'public.inserir_lote_staging(jsonb)',
    'public.validar_carga_staging()',
    'public.promover_carga_vendas(jsonb,uuid)',
    'public.transform_raw_to_analytics()',
    -- Movimentação
    'public.limpar_staging_movimentacao()',
    'public.inserir_lote_staging_movimentacao(jsonb)',
    'public.validar_carga_movimentacao()',
    'public.promover_carga_movimentacao(jsonb,uuid)',
    -- Aberto
    'public.limpar_staging_aberto()',
    'public.inserir_lote_staging_aberto(jsonb)',
    'public.validar_carga_aberto()',
    'public.promover_carga_aberto(jsonb,uuid)',
    -- Operação
    'public.limpar_staging_operacao()',
    'public.inserir_lote_staging_operacao(jsonb)',
    'public.validar_carga_operacao()',
    'public.promover_carga_operacao(jsonb,uuid)',
    -- Demonstrativo
    'public.limpar_staging_demonstrativo()',
    'public.inserir_lote_staging_demonstrativo(jsonb)',
    'public.validar_carga_demonstrativo()',
    'public.promover_carga_demonstrativo(jsonb,uuid)',
    -- Fluxo de Caixa (derivado de Movimentação + Aberto)
    'public.regenerar_fluxo_caixa()',
    -- Pessoas (fora do contrato v1 — decisão 11)
    'public.limpar_staging_pessoas()',
    'public.inserir_lote_staging_pessoas(jsonb)',
    'public.validar_carga_pessoas()',
    'public.promover_carga_pessoas()'
  ] LOOP
    IF to_regprocedure(v_sig) IS NULL THEN
      v_falta := v_falta || ' ' || v_sig;
    END IF;
  END LOOP;
  IF v_falta <> '' THEN
    RAISE EXCEPTION 'ABORTADO: sumiu o que tinha de FICAR:% — dropei a errada.', v_falta;
  END IF;
  IF to_regnamespace('audit') IS NULL THEN
    RAISE EXCEPTION 'ABORTADO: o schema audit sumiu — ele FICA (vazio).';
  END IF;
  IF to_regclass('analytics.fato_lancamento_operacao') IS NULL
     OR to_regclass('raw.vendas_excel') IS NULL
     OR to_regclass('raw.lancamentos_movimentacao') IS NULL
     OR to_regclass('raw.titulos_em_aberto') IS NULL
     OR to_regclass('raw.demonstrativo_competencia') IS NULL THEN
    RAISE EXCEPTION 'ABORTADO: uma tabela de base sumiu — esta migration só remove FUNÇÕES do legado.';
  END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- DEPOIS DE APLICAR (roteiro de verificação — a migration não fecha sozinha)
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 1. REST com service_role: os 12 alvos devolvem 404/PGRST202 (sumiram mesmo). Isso é seguro
--    DEPOIS do DROP — antes dele, chamar `truncar_*` por REST APAGA a base (incidente 10/09).
-- 2. O caminho vivo segue de pé: `npm run seed` (conferência, default) com as cinco bases —
--    status `conferida` e checksums conferindo; uma carga pelo card, se o Yan quiser o teste real.
-- 3. REGENERAR o espelho de tipos e o baseline, que ficaram stale com o DROP:
--      npx supabase gen types typescript --linked > src/types/database.ts
--      npm run db:baseline
--    e commitar juntos.
-- 4. `node scripts/credencial/derivar-allowlist.mjs`: a allowlist do `ingestor` em Vendas sai só
--    com `promover_carga_vendas(jsonb, uuid)` — a derivada se corrige sozinha.
-- 5. `npm test` verde. Se algum caso quebrar, é consumidor que a recontagem não viu: a migration
--    é que precisa ser revista, não o teste.
