-- 0269 — v5.10.0 / Bloco 3: ADITIVA única (D2-010, D2-006, D2-016, D9-015 + NOTIFY)
--
-- DECLARAÇÃO PRÉVIA (regra do CLAUDE.md): esta migration é ADITIVA. Não há DROP, não há
-- TRUNCATE, não há ALTER que remova ou reescreva coluna, não há UPDATE/DELETE em dado
-- existente. O que ela faz: (a) REVOKE/GRANT de EXECUTE, (b) COMMENT ON FUNCTION,
-- (c) um CREATE OR REPLACE que troca SÓ uma string de mensagem de erro, (d) NOTIFY.
-- REVOKE de um privilégio que hoje vem do DEFAULT do Postgres é endurecimento de
-- permissão, não remoção de objeto — mesma classe do REVOKE global da 0122.
--
-- Numeração conferida na hora: `npx supabase migration list` → última local E remota = 0268,
-- sem pendências; e nenhuma das 138 branches remotas tem migration acima de 0268 (o ponto
-- cego de numeração entre branches paralelos, skill banco-e-rpc §5).
--
-- ─────────────────────────────────────────────────────────────────────────────────────
-- CORREÇÕES QUE O CATÁLOGO VIVO FEZ AO RELATÓRIO TRIADO (o relatório APONTA, o catálogo PROVA)
-- ─────────────────────────────────────────────────────────────────────────────────────
-- D2-010 dizia "21 funções sem grant". O catálogo vivo diz outra coisa, e a diferença muda
-- o desenho desta migration. A consulta da Fase 1 olhava só `anon`/`authenticated`/
-- `service_role` no `information_schema` e reportava "grants: null" — o que ela NÃO
-- enxergava era o grant DEFAULT para PUBLIC. Consultando a fonte autoritativa
-- (`pg_proc.proacl`; insumo `docs/auditoria-v5/_insumos/bloco3-proacl.sql`):
--
--   • 8 funções têm `proacl IS NULL` = ACL DEFAULT do Postgres = EXECUTE para PUBLIC.
--     ESSAS são o alvo real, e são o PIOR caso, não a ausência de caso: PUBLIC inclui
--     `anon` e `authenticated`.
--   • 12 das 21 da lista original já têm `postgres=X/postgres` — PUBLIC já foi revogado
--     (pela 0122). Elas estão CERTAS como estão. Dar-lhes `GRANT ... TO service_role`,
--     como o item pedia ao pé da letra, ABRIRIA acesso que hoje não existe — o oposto do
--     que o achado quer. Ficam intocadas, por decisão registrada aqui.
--   • `app.norm_nome` NÃO estava na lista das 21 e é a mais chamada das 8 (13 funções a
--     usam). A varredura da Fase 1 a perdeu.
--   • 3 da lista original (`is_financeiro`, `pode_assinar_area`, `solic_validar_e_snapshotar`)
--     já têm grant explícito a `service_role`. A lista estava parcialmente vencida.
--
-- SEGURANÇA DO REVOKE — argumento categórico, apontado pelo `revisor-db`: nenhuma das 8
-- vive em `public`. Elas estão em `analytics`, `app` e `financeiro`, e o
-- `supabase/config.toml` expõe ao PostgREST apenas `["public", "graphql_public"]`. Ou
-- seja: NENHUM papel — nem `anon`, nem `authenticated`, nem `service_role` — alcança
-- essas funções por REST/`.rpc()`, com ou sem grant. Isso também é o que torna o
-- `GRANT ... TO service_role` que a spec pedia literalmente INÓCUO aqui, não só
-- desnecessário: não há caminho para exercê-lo.
--
-- SEGURANÇA DO REVOKE (verificado chamador por chamador antes de escrever):
-- nenhuma das 8 é chamada diretamente por `anon`, `authenticated` ou `service_role`.
-- Todas são alcançadas por dentro — de função `SECURITY DEFINER` cujo dono é `postgres`
-- (aí `current_user` é o dono, que tem EXECUTE como owner), ou por TRIGGER (o Postgres
-- não checa EXECUTE do invocador em função de trigger). O caso que exigiu mais cuidado:
-- `analytics.regenerar_dim_operacao_weddings` É chamada pelo app
-- (`src/app/admin/uploads/actions.ts:70`, com `getAdminClient()` = service_role) — mas
-- via o wrapper `public.regenerar_dim_operacao_weddings()`, que é `SECURITY DEFINER`,
-- dono `postgres`, com `service_role=X/postgres`, e cujo corpo é
-- `RETURN analytics.regenerar_dim_operacao_weddings();`. O `analytics` não é exposto pelo
-- PostgREST, então não há caminho direto. Por isso NÃO se concede `service_role` aqui:
-- seria alargar a superfície sem nenhum chamador que precise.
--
-- D9-015 dizia "as duas funções que lançam 'sem cadastro ativo no WT Finance'". O catálogo
-- vivo tem UMA: `app.exigir_acesso`. As migrations 0119 e 0133 ambas contêm o texto, mas a
-- 0133 foi REAPLICAÇÃO da mesma função — é exatamente o motivo da regra "CREATE OR REPLACE
-- se escreve a partir do CATÁLOGO VIVO, nunca da migration de origem" (skill §5).

BEGIN;

-- ═════════════════════════════════════════════════════════════════════════════════════
-- D2-010 — as 8 funções com ACL DEFAULT deixam de depender do default do Postgres
-- ═════════════════════════════════════════════════════════════════════════════════════
-- Padrão da casa (skill §4): `REVOKE ... FROM PUBLIC` + explicitação de anon/authenticated.
-- O REVOKE de `anon`/`authenticated` é redundante depois do de PUBLIC — está aqui para o
-- catálogo passar a DIZER a intenção, que é o que o achado cobra ("nunca contar com o
-- default"). Nenhum GRANT: ver a justificativa no cabeçalho.

REVOKE EXECUTE ON FUNCTION analytics.extrair_nome_casal(text)                  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION analytics.fn_gerencial_lancamentos_atualizado()     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION analytics.regenerar_dim_operacao_weddings()         FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION analytics.situacao_por_data_evento(date)            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION app.norm_nome(text)                                 FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION financeiro.fn_broadcast_gerencial()                 FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION financeiro.fn_diario_alteracoes()                   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION financeiro.fn_dre_touch_atualizado_em()             FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION analytics.extrair_nome_casal(text) IS
  'Interna do espelho Weddings: extrai o nome do casal do texto da operação. Chamada só por analytics.regenerar_dim_operacao_weddings. EXECUTE revogado de PUBLIC na 0269 (v5.10.0/D2-010) — não depende mais do default do Postgres.';
COMMENT ON FUNCTION analytics.fn_gerencial_lancamentos_atualizado() IS
  'Função de TRIGGER (trg_gerencial_lancamentos_atualizado, BEFORE UPDATE em analytics.gerencial_lancamentos). Não é chamável como RPC; EXECUTE revogado de PUBLIC na 0269 (v5.10.0/D2-010).';
COMMENT ON FUNCTION analytics.regenerar_dim_operacao_weddings() IS
  'Regenera analytics.dim_operacao_weddings a partir dos lançamentos. NÃO é o ponto de entrada do app: o app chama o wrapper public.regenerar_dim_operacao_weddings() (SECURITY DEFINER, GRANT a service_role), que delega para cá. EXECUTE revogado de PUBLIC na 0269 (v5.10.0/D2-010).';
COMMENT ON FUNCTION analytics.situacao_por_data_evento(date) IS
  'Interna: classifica a operação em passado/futuro/sem_data a partir da data do evento. Chamada por public.get_operacao_weddings__nucleo. EXECUTE revogado de PUBLIC na 0269 (v5.10.0/D2-010).';
COMMENT ON FUNCTION app.norm_nome(text) IS
  'Normalizador canônico de nome no banco (lower + trim + colapso de espaço). Usada por 13 funções (Acervo, Clientes Corp, Patrimônio). Tem espelho em TS: src/components/gestao-pessoas/inventario/derivar.ts:198 — mudar uma exige mudar a outra. EXECUTE revogado de PUBLIC na 0269 (v5.10.0/D2-010).';
COMMENT ON FUNCTION financeiro.fn_broadcast_gerencial() IS
  'Função de TRIGGER (trg_broadcast_gerencial_*, em analytics.gerencial_lancamentos): publica a mudança no Realtime para a colaboração do Gerencial (ADR-0155). Não é chamável como RPC; EXECUTE revogado de PUBLIC na 0269 (v5.10.0/D2-010).';
COMMENT ON FUNCTION financeiro.fn_diario_alteracoes() IS
  'Função de TRIGGER (trg_diario_gerencial_lancamentos): grava o DIÁRIO de alterações que financeiro.reverter_diario consome para desfazer um lote. Não é chamável como RPC; EXECUTE revogado de PUBLIC na 0269 (v5.10.0/D2-010).';
COMMENT ON FUNCTION financeiro.fn_dre_touch_atualizado_em() IS
  'Função de TRIGGER (trg_touch_dre_bloco e irmãs): carimba atualizado_em na estrutura da DRE — é a coluna VOLÁTIL que a checagem de conflito de reverter_diario tem de ignorar (0268). Não é chamável como RPC; EXECUTE revogado de PUBLIC na 0269 (v5.10.0/D2-010).';

-- ═════════════════════════════════════════════════════════════════════════════════════
-- D2-006 — kill switch DORMENTE, declarado no catálogo
-- ═════════════════════════════════════════════════════════════════════════════════════
-- A função não tem chamador em `src/` e apareceu na lista de órfãs da auditoria. NÃO é
-- órfã: é kill switch de emergência, operado à mão pelo runbook. O COMMENT existe para
-- que a próxima varredura de código morto leia isto antes de propor o DROP.
COMMENT ON FUNCTION public.admin_set_enforcement(boolean) IS
  'KILL SWITCH DORMENTE — sem chamador em src/ POR DESENHO. Liga/desliga o enforcement de autenticação em emergência; operação manual, documentada em docs/runbooks/v4-13-auth-runbook.md. Exige a área admin/acessos. NÃO REMOVER por análise estática de código morto (v5.10.0/D2-006).';

-- ═════════════════════════════════════════════════════════════════════════════════════
-- D2-016 — COMMENT ON FUNCTION nas RPCs centrais (escopo FECHADO)
-- ═════════════════════════════════════════════════════════════════════════════════════
-- Escopo: as RPCs que a Fase 2 tocou + as que o `docs/estado-do-projeto.md` vai citar como
-- fonte de verdade de cada módulo. O resto fica no backlog, conforme a triagem.
-- Onde havia comentário inline, o texto vem dele; onde não havia (a maioria começa direto
-- no guard), o comentário declara o que a função É: retorno, ÁREA de RBAC exigida e a
-- ressalva semântica quando existe. A área é o fato mais útil a quem chega — e o único que
-- não se descobre sem ler o corpo.

COMMENT ON FUNCTION app.exigir_acesso(text[]) IS
  'GUARD CANÔNICO do RBAC no banco — chamado inline por toda RPC exposta (camada 3 do enforcement). Sem claims do PostgREST libera SÓ superusuário real (migrations/seed); role=service_role passa; anônimo é sempre negado (janela da v4.13 encerrada, ADR-0114); usuário sem cadastro ativo → USUARIO_INATIVO; sem a área pedida → PERMISSAO_NEGADA. p_areas NULL exige apenas sessão ativa. Todos os erros usam ERRCODE 42501.';
COMMENT ON FUNCTION public.get_mix_produto(date, date, text, integer) IS
  'Mix de produtos do período (jsonb: produtos[] + bloco "outros" agregado). Exige a área do setor pedido (app.areas_do_setor(p_setor)). Consumida por /performance e pela rota /api/dashboard/performance/mix-produto — as duas pontas validam com mixProdutoSchema (v5.10.0/D4-006).';
COMMENT ON FUNCTION public.get_operacoes_weddings(text, date, date, text, text, text, text, integer, integer) IS
  'Lista paginada de operações de Weddings (jsonb: operacoes[] + total). Exige performance/weddings. TETO DE 200 POR PÁGINA, aplicado no núcleo (v_limit := LEAST(GREATEST(p_por_pagina,1), 200)): quem precisa do conjunto inteiro tem de PAGINAR até cobrir "total" — é o que o export da Lista de Operações faz (lista-operacoes.tsx, M6/v4.17.0).';
COMMENT ON FUNCTION public.admin_registrar_usuario(uuid, text, text, bigint) IS
  'Vincula um usuário do Auth ao RBAC (cria/atualiza app.rbac_usuarios e reativa). Exige admin/acessos. p_nome aceita NULL ou string vazia: o corpo normaliza com nullif(trim(coalesce(p_nome,''''))) e grava NULL nos dois casos.';
COMMENT ON FUNCTION public.admin_decidir_solicitacao(bigint, boolean, text) IS
  'Decide uma solicitação de ACESSO (aprovar/rejeitar) e registra a decisão. Exige admin/acessos. O SDK não lança: quem chama TEM de checar o error do retorno — ignorá-lo deixava a solicitação pendente para sempre (v5.10.0/D5-002).';
COMMENT ON FUNCTION public.admin_marcar_trocar_senha(uuid) IS
  'Marca o usuário para troca OBRIGATÓRIA de senha no próximo acesso. Exige admin/acessos. Passo acessório da criação de usuário: falhar aqui não desfaz a criação, mas o error do retorno tem de ser checado (v5.10.0/D5-003).';
COMMENT ON FUNCTION public.get_executiva_kpis(date, date, text, date, date, date, date) IS
  'KPIs executivos do período, com comparativos anterior e YoY (jsonb). Exige a área do setor OU metas/acompanhamento. É a RPC chamada uma vez POR SETOR pelo painel de /metas (4 painéis = 4 chamadas) — o redesenho para aceitar array de setores está no backlog v6 (B-09).';
COMMENT ON FUNCTION public.metas_ritmo_diario(date, date, text) IS
  'Ritmo diário realizado × necessário para a meta do período (jsonb). Exige metas/acompanhamento ou metas. Também chamada uma vez por setor pelo painel de /metas.';
COMMENT ON FUNCTION public.metas_listar(integer) IS
  'Metas do ano por setor e mês, fonte real (jsonb). Exige metas/acompanhamento ou metas. Um período que atravessa dois anos exige DUAS chamadas — é o que o carregador de /metas faz.';
COMMENT ON FUNCTION public.get_sumario_subsetor(date, date) IS
  'Composição por subsetor de Weddings no período (jsonb: subsetores[]). Exige performance/weddings. Em /metas é usada só para o card "Contratos" (subsetor COMERCIAL) e degrada para null quando o usuário não tem a área — no Modo TV o card simplesmente não aparece.';
COMMENT ON FUNCTION public.get_dre_mensal(integer) IS
  'DRE do ano no regime de CAIXA, mês a mês (json). Exige financeiro/dre. Par com get_dre_competencia_mensal: os dois regimes convivem por decisão (ADR-0170) e NÃO se unificam — a conciliação entre eles é a ponte da v5.8.1 (ADR-0171).';
COMMENT ON FUNCTION public.get_dre_competencia_mensal(integer) IS
  'DRE do ano no regime de COMPETÊNCIA, mês a mês (json); fato gerador = EMISSÃO (v5.8.0). Exige financeiro/dre. Par com get_dre_mensal (caixa) — ver ADR-0170.';
COMMENT ON FUNCTION public.get_gerencial_lancamentos(integer) IS
  'Lançamentos do Fluxo de Caixa Gerencial (json). Exige financeiro/gerencial. p_limit tem DEFAULT 1000, alinhado ao max_rows do PostgREST.';
COMMENT ON FUNCTION public.get_gerencial_saldos() IS
  'Saldos por conta do Gerencial (json). Exige financeiro/gerencial.';
COMMENT ON FUNCTION public.get_fluxo_caixa_mensal_v3() IS
  'Série mensal do Fluxo de Caixa pelo eixo de MOVIMENTAÇÃO (json), fonte financeiro.fato_fluxo (v5.2.0/Onda 1). Exige financeiro/fluxo-caixa.';
COMMENT ON FUNCTION public.criar_solicitacao(bigint, uuid, bigint, date, text, jsonb, jsonb) IS
  'Abre uma solicitação do tipo informado. Exige apenas SESSÃO ativa (exigir_acesso() sem áreas) — quem pode abrir o quê é decidido pelo TIPO, não por área. Valida que o tipo existe e não está arquivado, e exige XOR de destinatário (usuário OU role) com alvo válido e ativo. As respostas são validadas contra o SNAPSHOT do tipo, nunca contra a definição viva (v5.9.1).';
COMMENT ON FUNCTION public.solic_aprovar(bigint) IS
  'Move a solicitação de "aberta" para "aprovada" (v5.9.0). Exige sessão ativa, e só o ATENDENTE da solicitação pode aprovar (PERMISSAO_NEGADA caso contrário). Transição legal SÓ a partir de "aberta". NÃO toca decidido_por/decidido_em: esses pertencem à decisão TERMINAL (concluir/rejeitar).';
COMMENT ON FUNCTION public.promover_carga_vendas() IS
  'Promove a staging de Vendas para as tabelas finais (jsonb com contagens). SEM exigir_acesso no corpo POR DESENHO: é RPC de carga, protegida por GRANT — só service_role executa. Abre com pg_advisory_xact_lock(4017001), que serializa limpar→inserir→promover e impede interleave de dois uploads concorrentes (0135). Promove TUDO o que está na staging: a staging é volume total, não incremental.';
COMMENT ON FUNCTION public.monde_ingest_promover() IS
  'Promove o staging do espelho Monde para as tabelas finais (jsonb). SEM exigir_acesso no corpo POR DESENHO: protegida por GRANT, só service_role. UPSERT com ON CONFLICT filtrando por raw_hash — linha idêntica NÃO é retornada; xmax=0 distingue INSERT de UPDATE, e é assim que a ingestão sabe quais ids mudaram.';
COMMENT ON FUNCTION public.patrimonio_listar_ativos(text, smallint, smallint, text) IS
  'Lista os ativos do Inventário com o estado atual de cada um (jsonb). Exige gestao-pessoas/inventario. Faz LEFT JOIN em patrimonio.v_estado_atual, VIEW não-materializada com DISTINCT ON (ativo_id) sobre patrimonio.movimentacao. TEM índice de suporte: mov_ativo_ordem_idx (ativo_id, data_movimentacao DESC, criado_em DESC), criado na 0247, cobre as três primeiras colunas do ORDER BY do DISTINCT ON e está em uso (102 scans no catálogo em 10/09/2026); o id DESC final só desempata dentro do grupo.';

-- ═════════════════════════════════════════════════════════════════════════════════════
-- D9-015 — texto pré-rebranding na mensagem de erro do guard do RBAC
-- ═════════════════════════════════════════════════════════════════════════════════════
-- CREATE OR REPLACE escrito a partir do CATÁLOGO VIVO (pg_get_functiondef em 10/09/2026),
-- não da migration de origem. Insumo: docs/auditoria-v5/_insumos/bloco3-raise-wtfinance.sql
--
-- DIFF LINHA A LINHA contra o corpo vivo — exatamente UMA linha muda:
--   -     RAISE EXCEPTION 'USUARIO_INATIVO: sem cadastro ativo no WT Finance'
--   +     RAISE EXCEPTION 'USUARIO_INATIVO: sem cadastro ativo no Janus'
-- Todo o resto é byte a byte o corpo vivo: assinatura com o DEFAULT NULL::text[], STABLE
-- SECURITY DEFINER, SET search_path TO '', os quatro RAISE com ERRCODE 42501, o ramo
-- fail-closed de claims nulo, o atalho de service_role e a checagem de área.
--
-- ⚠️ Esta é a função MAIS crítica do RBAC: toda RPC exposta a chama inline. O código de
-- erro `USUARIO_INATIVO:` é o CONTRATO (é o que os chamadores tratam — ver ERROS_BANCO em
-- src/app/admin/acessos/actions.ts); o texto livre depois dos dois pontos é só log/debug,
-- e é só ele que muda aqui.

CREATE OR REPLACE FUNCTION app.exigir_acesso(p_areas text[] DEFAULT NULL::text[])
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_claims text;
  v_role   text;
  v_uid    uuid;
BEGIN
  v_claims := nullif(current_setting('request.jwt.claims', true), '');

  -- Sem contexto PostgREST (claims nulo). Antes liberava QUALQUER conexão (fail-open):
  -- requisição anônima do PostgREST chega sem claims e passava. Agora libera SÓ
  -- superusuário real (migrations/seed/`db query` conectam como postgres); demais
  -- papéis sem claims (inclusive o `authenticator` do PostgREST sem JWT) → barrados.
  IF v_claims IS NULL THEN
    IF coalesce((SELECT r.rolsuper FROM pg_roles r WHERE r.rolname = session_user), false) THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'AUTH_NECESSARIA: contexto sem identidade'
      USING ERRCODE = '42501';
  END IF;

  v_role := v_claims::jsonb ->> 'role';
  IF v_role = 'service_role' THEN
    RETURN;
  END IF;

  v_uid := nullif(v_claims::jsonb ->> 'sub', '')::uuid;

  -- Anônimo (JWT presente sem sub, ou role=anon): SEMPRE negado. Janela de
  -- compatibilidade da v4.13 encerrada — não consulta mais auth_enforcement_ativo().
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_NECESSARIA: acesso anônimo desativado'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM app.rbac_usuarios u WHERE u.user_id = v_uid AND u.ativo) THEN
    RAISE EXCEPTION 'USUARIO_INATIVO: sem cadastro ativo no Janus'
      USING ERRCODE = '42501';
  END IF;

  IF p_areas IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM app.rbac_usuarios u
    JOIN app.rbac_role_permissoes rp ON rp.role_id = u.role_id
    WHERE u.user_id = v_uid AND u.ativo AND rp.area = ANY (p_areas)
  ) THEN
    RAISE EXCEPTION 'PERMISSAO_NEGADA: requer uma de [%]', array_to_string(p_areas, ', ')
      USING ERRCODE = '42501';
  END IF;
END;
$function$;

-- O CREATE OR REPLACE acima recria a função e, com ela, a ACL volta ao que estava? NÃO:
-- CREATE OR REPLACE preserva a ACL existente (`postgres=X/postgres service_role=X/postgres`).
-- Reafirmado abaixo de propósito, para que o catálogo diga a intenção mesmo se alguém
-- reaplicar a função a partir de um arquivo antigo.
REVOKE EXECUTE ON FUNCTION app.exigir_acesso(text[]) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION app.exigir_acesso(text[]) TO service_role;

COMMIT;

-- PostgREST cacheia o schema; sem isso os COMMENT/grants novos só aparecem no próximo
-- reload. Fora da transação, como manda o padrão do projeto.
NOTIFY pgrst, 'reload schema';
