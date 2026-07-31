-- ---------------------------------------------------------------------------
-- 0220 — chore(v5.4.0/Round4): APAGA todo o histórico de Solicitações e corrige
-- os sufixos `_2` dos slugs — decisão do Yan (2026-07-30/31): "abri a plataforma
-- para o público interno da empresa, para começarmos com o histórico limpo quero
-- que você apague todo o histórico de solicitações com os devidos cuidados, após
-- isso apague os 2 tipos que hoje estão arquivados, eram apenas teste" e "após a
-- limpeza do histórico o caminho fica livre para corrigirmos os sufixos dos slugs
-- abatimento_de_creditos_2 e contas_a_pagar_2".
--
-- ███ MIGRATION DESTRUTIVA ███ — apaga DADO EXISTENTE. Aplicada SOMENTE pelo Yan,
-- em TTY (ADR-0131). O agente não aplica (o wrapper aborta em stdin não-TTY, por
-- construção). Não existe DOWN: o dado apagado só volta pelo backup que o próprio
-- gate tira antes do push.
--
-- ███ ESTADO EM 31/07 (LEIA ANTES DE RODAR) ███
-- A metade do STORAGE JÁ FOI FEITA: os 20 binários do bucket `solicitacoes-anexos`
-- foram apagados pelo script (bucket em 0 arquivos), com cópia íntegra em
-- `~/wt-finance-backups/2026-07-31-anexos-solicitacoes` (20 arquivos, 3,3 MB,
-- assinaturas conferidas). **Falta só este SQL** — e enquanto ele não roda, as 21
-- linhas de `app.solicitacao_anexo` apontam para binário que não existe mais: quem
-- abrir uma dessas solicitações vê o anexo listado e o download falha. Ou seja, este
-- arquivo agora é a metade que FECHA um estado inconsistente, não o começo da
-- operação. Rodar quanto antes.
--
-- ███ POR QUE ESTE ARQUIVO SE CHAMA 0220 E NÃO 0218 ███
-- Ele nasceu como 0218, reservado antes da 0219. Erro meu: a 0219 (aditiva, correção
-- do CRÍTICO da revisão) foi aplicada em produção ANTES, e aí o 0218 virou um número
-- ABAIXO do topo remoto — `supabase db push` recusa migration fora de ordem
-- ("Found local migration files to be inserted before the last migration on remote
-- database", pedindo `--include-all`). Renumerar para 0220 põe o arquivo em ordem e
-- dispensa a flag: nada de `--fora-de-ordem`, nada de drift no histórico. Lição:
-- **não reservar número para destrutiva que vai ser aplicada depois de uma aditiva
-- da mesma leva** — numere no momento de aplicar.
--
-- ███ POR QUE ELE VIVEU EM `supabase/patches/` ATÉ AGORA ███
-- `supabase db push` empurra TODO o conjunto pendente: um arquivo destrutivo parado
-- em `supabase/migrations/` pode ser arrastado por um push aditivo alheio (foi assim
-- que a v5.2.0 dropou bases). As aditivas 0217/0219 desta versão precisavam ir ao ar,
-- então este ficou fora da pasta até a hora. **Agora ele já está na pasta** (o `git
-- mv` foi feito) e é o único pendente — enquanto isso, ninguém roda `--aditiva`.
--
-- COMO APLICAR (um comando, NO SEU TERMINAL — o wrapper exige TTY):
--
--   npm run db:migrate -- --destrutiva
--
-- DECLARAÇÃO PRÉVIA (regime destrutivo / confirmação humana obrigatória):
--   • O QUE APAGA (censo de 2026-07-31, conferido na base real):
--       - app.api_outbox         →  0 linhas (a tabela tem FK para solicitacao
--                                   SEM cascade: precisa sair antes, mesmo vazia)
--       - app.api_chamada_log    →  9 linhas — TODAS `401 auth_negada` com
--                                   chave_id NULO, isto é, chamadas de fumaça das
--                                   minhas próprias verificações (21/07, 30/07 e
--                                   31/07). Não existe UMA chamada de integrador
--                                   real: nenhuma chave foi emitida ainda. O log
--                                   nasce limpo junto com o resto.
--       - app.solicitacao_anexo  → 21 linhas de METADADO (o BINÁRIO no Storage é
--                                   apagado FORA daqui — ver "Storage" abaixo).
--                                   São 21 metadados para 20 arquivos: 1 linha já
--                                   estava órfã (aponta para binário que não existe),
--                                   drift anterior a esta versão. Não é engano de
--                                   contagem entre este header e o do script.
--       - app.solicitacao        → 26 linhas (todas: 10 Contas a pagar + 8
--                                   Lançamentos de Contas a Pagar (arquivado) +
--                                   5 Abatimento de créditos + 1 Contas a pagar
--                                   (arquivado) + 1 Pagamentos fora do prazo +
--                                   1 Compras e reparos)
--       - app.solicitacao_tipo   →  2 linhas: os DOIS tipos ARQUIVADOS (ids 5 e
--                                   6, slugs `lancamentos_de_contas_a_pagar` e
--                                   `contas_a_pagar`), que eram só teste. Os 11
--                                   campos de cada um saem por CASCADE (FK de
--                                   solicitacao_campo.tipo_id, 0127) — o DELETE
--                                   explícito abaixo é auditoria, não necessidade.
--   • O QUE NÃO TOCA: os 7 tipos ATIVOS e seus campos; app.api_chave (0 linhas);
--     usuários, roles, RBAC; QUALQUER outra tabela do produto; e o bucket
--     `acervo-documentos` (8 arquivos — outro módulo, jamais tocado aqui).
--   • RENOMEAÇÃO DE SLUG (2 UPDATEs, no fim, depois das exclusões):
--       - id 9  `abatimento_de_creditos_2` → `abatimento_de_creditos`
--       - id 7  `contas_a_pagar_2`         → `contas_a_pagar`
--     Os sufixos `_2` nasceram do desempate automático de `app.slugificar` contra
--     tipos que ora eram duplicados de teste (o `abatimento_de_creditos` original
--     foi excluído pelo Yan) ora estavam arquivados (o `contas_a_pagar`, apagado
--     acima) — o slug canônico só fica livre DEPOIS da limpeza, daí a ordem.
--     Isto ABRE UMA EXCEÇÃO ÚNICA na invariante "slug é imutável após a criação"
--     (ADR-0159) e ela é segura APENAS enquanto NENHUMA chave de API existe: o
--     slug é o identificador que o integrador manda no payload; renomear com um
--     integrador ligado quebraria o contrato dele em silêncio. As guardas abaixo
--     ABORTAM a migration se esse mundo tiver mudado. Ver Emenda no ADR-0159.
--   • ORDEM OBRIGATÓRIA (FK e semântica):
--       outbox → chamada_log → anexo(metadado) → solicitacao → campos+tipos → slugs
--   • STORAGE — JÁ FEITO em 31/07 (ver "ESTADO" no topo): os 20 arquivos (3,2 MB)
--     do bucket `solicitacoes-anexos` saíram por
--     `scripts/limpeza-anexos-solicitacoes.mjs` (Storage API + service_role), com
--     cópia local conferida. Apagar `storage.objects` por SQL removeria o registro
--     e DEIXARIA os bytes órfãos no bucket — por isso o binário nunca sai daqui.
--   • GATE: as guardas usam RAISE EXCEPTION; o `db push` aplica cada arquivo em
--     transação, então qualquer guarda que dispare desfaz TUDO deste arquivo.
--   • DELETEs em NÍVEL SUPERIOR de propósito: dentro de `DO $$ ... $$` o
--     classificador do db-gate (tokenizador de statements top-level) não os veria
--     e a migration passaria por ADITIVA — o agente conseguiria aplicá-la. A
--     forma top-level é o que garante o fail-closed em TTY.
-- ---------------------------------------------------------------------------

-- ── Guarda 1 (PRÉ): o mundo ainda é o que o censo viu? ────────────────────────
DO $$
DECLARE
  v_chaves   int;
  v_arq      int;
  v_sol      int;
  v_anexo    int;
  v_log      int;
  v_outbox   int;
BEGIN
  SELECT count(*) INTO v_chaves FROM app.api_chave;
  IF v_chaves > 0 THEN
    RAISE EXCEPTION 'ABORTADO: existem % chave(s) de API emitidas. A renomeação de slug desta migration só é segura ANTES de qualquer integrador estar ligado (o slug é o que ele manda no payload). Aplique esta migration primeiro e crie a chave depois — ou, se a chave já está em uso, NÃO renomeie: remova os dois UPDATEs finais e trate o slug como imutável (ADR-0159).', v_chaves;
  END IF;

  -- Tolera 2 (o esperado) ou 0 (você já os excluiu pela tela depois que a limpeza
  -- do histórico liberou a exclusão) — mas ABORTA em 1, porque estado parcial merece
  -- um olhar antes de apagar qualquer coisa.
  SELECT count(*) INTO v_arq FROM app.solicitacao_tipo
   WHERE arquivado AND slug IN ('lancamentos_de_contas_a_pagar', 'contas_a_pagar');
  IF v_arq NOT IN (0, 2) THEN
    RAISE EXCEPTION 'ABORTADO: esperava 2 tipos ARQUIVADOS a excluir (lancamentos_de_contas_a_pagar, contas_a_pagar) — ou 0, se você já os excluiu — e encontrei %. Estado parcial: reconferir antes de apagar.', v_arq;
  END IF;

  -- Nenhum tipo ATIVO pode ocupar os slugs-destino (senão o UPDATE viola a UNIQUE).
  IF EXISTS (
    SELECT 1 FROM app.solicitacao_tipo
     WHERE NOT arquivado AND slug IN ('abatimento_de_creditos')
  ) THEN
    RAISE EXCEPTION 'ABORTADO: o slug `abatimento_de_creditos` já pertence a um tipo ATIVO — a renomeação colidiria.';
  END IF;

  -- Nenhum tipo ATIVO pode ocupar `contas_a_pagar` (simétrico ao de cima). O índice
  -- único abortaria de qualquer forma no UPDATE — a guarda existe para trocar um erro
  -- cru de constraint por uma mensagem que explica o que houve.
  IF EXISTS (
    SELECT 1 FROM app.solicitacao_tipo
     WHERE NOT arquivado AND slug = 'contas_a_pagar'
  ) THEN
    RAISE EXCEPTION 'ABORTADO: o slug `contas_a_pagar` já pertence a um tipo ATIVO — a renomeação colidiria.';
  END IF;

  SELECT count(*) INTO v_sol    FROM app.solicitacao;
  SELECT count(*) INTO v_anexo  FROM app.solicitacao_anexo;
  SELECT count(*) INTO v_log    FROM app.api_chamada_log;
  SELECT count(*) INTO v_outbox FROM app.api_outbox;
  RAISE NOTICE '[0220] ANTES → solicitacao=% anexo(metadado)=% api_chamada_log=% api_outbox=% (censo de 31/07: 26 / 21 / 9 / 0)',
    v_sol, v_anexo, v_log, v_outbox;

  -- HARD STOP se o histórico CRESCEU desde o censo (achado MÉDIO da revisão do round
  -- 4). O pedido "apague todo o histórico" foi feito sobre 26 linhas que eram, na
  -- prática, uso de construção — mas a plataforma acabou de ser aberta ao público
  -- interno: uma solicitação criada por um colega entre a redação deste patch e a
  -- execução dele é dado REAL de trabalho de outra pessoa, e apagá-la por arrasto,
  -- em silêncio, com base num NOTICE que ninguém leu, seria indefensável. Se a
  -- intenção continuar sendo apagar TUDO, ajuste o número abaixo para a contagem
  -- atual e reaplique — é um ato consciente, de uma linha.
  IF v_sol > 26 THEN
    RAISE EXCEPTION 'ABORTADO: o histórico CRESCEU desde o censo de 31/07 — há % solicitações (o censo viu 26). % linha(s) nova(s) foram criadas depois que este patch foi escrito, possivelmente por gente usando a plataforma de verdade. Confira o que apareceu (SELECT id, criado_em, tipo_id, solicitante_id FROM app.solicitacao ORDER BY id DESC LIMIT 20) e, se ainda quiser apagar TUDO, troque o 26 desta guarda pela contagem atual.', v_sol, v_sol - 26;
  END IF;
END $$;

-- ── 1. Fila de callbacks (FK para solicitacao SEM cascade: sai primeiro) ──────
DELETE FROM app.api_outbox;

-- ── 2. Log de chamadas da API externa (só testes meus; 0 chaves emitidas) ─────
DELETE FROM app.api_chamada_log;

-- ── 3. Metadado dos anexos (o binário sai pelo script de Storage, à parte) ────
-- Explícito por auditoria: a FK de solicitacao_anexo.solicitacao_id (0127) é ON
-- DELETE CASCADE e o passo 4 já os levaria.
DELETE FROM app.solicitacao_anexo;

-- ── 4. O histórico em si ──────────────────────────────────────────────────────
DELETE FROM app.solicitacao;

-- ── 5. Os 2 tipos ARQUIVADOS (eram teste) + seus campos ───────────────────────
-- Identificados por slug + arquivado (não por id cru): resiste a qualquer
-- diferença de identidade e é auto-explicativo na leitura.
DELETE FROM app.solicitacao_campo
 WHERE tipo_id IN (
   SELECT id FROM app.solicitacao_tipo
    WHERE arquivado AND slug IN ('lancamentos_de_contas_a_pagar', 'contas_a_pagar')
 );

DELETE FROM app.solicitacao_tipo
 WHERE arquivado AND slug IN ('lancamentos_de_contas_a_pagar', 'contas_a_pagar');

-- ── 6. Correção dos sufixos `_2` (exceção única à imutabilidade do slug) ──────
-- Agora os slugs canônicos estão livres: `abatimento_de_creditos` porque o tipo
-- original foi excluído pelo Yan (Round 2), `contas_a_pagar` porque o tipo
-- arquivado homônimo saiu no passo 5.
UPDATE app.solicitacao_tipo SET slug = 'abatimento_de_creditos', atualizado_em = now()
 WHERE slug = 'abatimento_de_creditos_2';

UPDATE app.solicitacao_tipo SET slug = 'contas_a_pagar', atualizado_em = now()
 WHERE slug = 'contas_a_pagar_2';

-- ── Guarda 2 (PÓS): a limpeza fechou como planejado? ─────────────────────────
DO $$
DECLARE
  v_sol    int;
  v_anexo  int;
  v_log    int;
  v_tipos  int;
  v_sufixo int;
BEGIN
  SELECT count(*) INTO v_sol   FROM app.solicitacao;
  SELECT count(*) INTO v_anexo FROM app.solicitacao_anexo;
  SELECT count(*) INTO v_log   FROM app.api_chamada_log;
  IF v_sol <> 0 OR v_anexo <> 0 OR v_log <> 0 THEN
    RAISE EXCEPTION 'ABORTADO: histórico não zerou (solicitacao=% anexo=% log=%).', v_sol, v_anexo, v_log;
  END IF;

  -- Deliberadamente NÃO se afirma uma contagem total de tipos: o Yan cria tipos pela
  -- tela a qualquer momento (o `lancamento_clara` nasceu no dia deste censo), e um
  -- patch que aborta porque a empresa seguiu trabalhando é um patch ruim. As
  -- asserções abaixo são todas absolutas — valem independentemente do que mais tenha
  -- sido cadastrado no meio.
  SELECT count(*) INTO v_tipos FROM app.solicitacao_tipo
   WHERE arquivado AND slug IN ('lancamentos_de_contas_a_pagar', 'contas_a_pagar');
  IF v_tipos <> 0 THEN
    RAISE EXCEPTION 'ABORTADO: os 2 tipos arquivados de teste ainda existem (% restante(s)).', v_tipos;
  END IF;

  SELECT count(*) INTO v_sufixo FROM app.solicitacao_tipo WHERE slug LIKE '%\_2';
  IF v_sufixo > 0 THEN
    RAISE EXCEPTION 'ABORTADO: ainda há % slug(s) com sufixo _2.', v_sufixo;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM app.solicitacao_tipo WHERE slug = 'abatimento_de_creditos')
     OR NOT EXISTS (SELECT 1 FROM app.solicitacao_tipo WHERE slug = 'contas_a_pagar')
  THEN
    RAISE EXCEPTION 'ABORTADO: depois do rename os slugs canônicos `abatimento_de_creditos` e `contas_a_pagar` deveriam existir.';
  END IF;

  RAISE NOTICE '[0220] DEPOIS → histórico ZERADO; tipos de teste removidos; slugs canônicos no lugar. Storage: rodar scripts/limpeza-anexos-solicitacoes.mjs (20 arquivos) se ainda não foi.';
END $$;

NOTIFY pgrst, 'reload schema';
