-- ---------------------------------------------------------------------------
-- 0273 — feat(v6.0.0/M1): role `verificador` — a credencial que VERIFICA não escreve
--
-- DECLARAÇÃO PRÉVIA (regime aditivo / autônomo):
--   • O QUE FAZ: cria a role NOLOGIN `verificador` e a concede a `authenticator` (é assim
--     que o PostgREST assume o papel do JWT); configura `statement_timeout`/`timezone` da
--     role (mesmo teto da UI — 8s, ADR-0122; fuso da 0152); nasce SEM EXECUTE em função
--     alguma (REVOKE explícito + ALTER DEFAULT PRIVILEGES para função futura não nascer
--     aberta — a armadilha do `pg_default_acl` que a v4.13/0122 já pagou) e recebe EXECUTE
--     só na ALLOWLIST abaixo, por ASSINATURA (há sobrecargas em `public`); cria a role RBAC
--     "Máquina · verificação" com TODAS as áreas de leitura (as do catálogo fora do grupo
--     Administração — 19 hoje) e as RPCs `admin_registrar_usuario_maquina` /
--     `admin_usuario_maquina_por_email`, que o bootstrap
--     (`scripts/credencial/bootstrap-usuario-maquina.mjs`) chama para vincular a conta Auth
--     do usuário de máquina ao RBAC.
--   • ADITIVA / RETROCOMPATÍVEL: só CREATE ROLE, GRANT/REVOKE, ALTER ROLE ... SET,
--     ALTER DEFAULT PRIVILEGES, INSERT idempotente em `app.rbac_roles`/`rbac_role_permissoes`
--     (ON CONFLICT DO NOTHING) e CREATE FUNCTION nova. Nenhum papel existente (`anon`,
--     `authenticated`, `service_role`) muda; nenhuma função existente é alterada; nenhum dado
--     pré-existente é tocado.
--   • `app.exigir_acesso` NÃO muda (invariante 1 do briefing): um JWT `role=verificador` com
--     `sub` de usuário real e ATIVO percorre o caminho normal de usuário.
--   • ALLOWLIST DERIVADA, não redigida: `node scripts/credencial/derivar-allowlist.mjs
--     verificador` lê `src/lib/rpc-contrato.test.ts` (chamadas `rpc('…')` e a lista F7
--     `fn: '…'`) e `scripts/dre-oracle.mjs` (`/rest/v1/rpc/…`), e resolve cada nome no
--     catálogo vivo por `pg_get_function_identity_arguments`. Resultado em 21/09/2026:
--     54 nomes → 54 assinaturas, 0 sobrecargas, 0 não resolvidos.
--   • SÓ LEITURA, de verdade (achado ALTO do revisor-db, acatado): NENHUMA RPC de escrita
--     está na lista. Os casos da suíte que exercitavam `dre_estrutura_salvar`,
--     `dre_comp_estrutura_salvar` e `dre_estrutura_desfazer_*` (lote vazio, token inválido,
--     id inexistente, payload duplicado) saíram do caminho REST e passaram a rodar em
--     `src/lib/dre/reverter-diario.test.ts`, em transação revertida com identidade JWT
--     simulada — o corpo roda até o guard e nada persiste. Fora da lista também, de propósito
--     (a suíte prova a negação no bloco "GATE 2"): `admin_listar_areas` e
--     `admin_acesso_solicitacoes_pendentes` (área administrativa), todo `truncar_*`,
--     `promover_*`, `limpar_staging_*`, `inserir_lote_*`, `truncate_dynamic_tables`.
--   • ASSIMETRIA REGISTRADA (achado MÉDIO do revisor-db): `validar_carga_staging` não tem
--     `exigir_acesso` (é service_role-only por grant, 0116) — aqui fica alcançável pelo
--     `verificador` sem checagem de área. Aceito porque o corpo SÓ LÊ (`raw.vendas_excel_staging`,
--     `dim_data`, `dim_setor*`; conferido na 0135) e porque a suíte valida o shape dela contra a
--     RPC viva; quem revisar a allowlist no futuro não deve tratar como "óbvio" que é seguro —
--     se a função ganhar escrita, sai daqui.
--   • RPC nova nasce FORA da allowlist: o caso de contrato dela falha com PERMISSAO_NEGADA até
--     alguém conceder o EXECUTE numa migration aditiva — é o fail-closed desejado (ADR-0175).
--   • ORÇAMENTO DE TEMPO: `statement_timeout = 8s` — o mesmo que `authenticated`. Se um caso
--     de contrato estourar, é um achado sobre a RPC (o usuário vive o mesmo teto), não sobre
--     a credencial.
--   • Reversão (manual, destrutiva):
--       DROP FUNCTION public.admin_registrar_usuario_maquina(uuid, text, text, text);
--       DROP FUNCTION public.admin_usuario_maquina_por_email(text);
--       DELETE FROM app.rbac_role_permissoes WHERE role_id = (SELECT id FROM app.rbac_roles WHERE nome = 'Máquina · verificação');
--       DELETE FROM app.rbac_roles WHERE nome = 'Máquina · verificação';   -- só se nenhum usuário a referenciar
--       REVOKE verificador FROM authenticator;  DROP OWNED BY verificador;  DROP ROLE verificador;
-- ---------------------------------------------------------------------------

-- ── 1. A role do Postgres ─────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'verificador') THEN
    CREATE ROLE verificador NOLOGIN NOINHERIT;
  END IF;
END $$;

-- PostgREST troca de papel com SET ROLE: exige que `authenticator` seja membro.
GRANT verificador TO authenticator;

-- rolconfig aplicado pelo PostgREST a cada requisição (mesmo mecanismo de anon/authenticated).
ALTER ROLE verificador SET statement_timeout = '8s';
ALTER ROLE verificador SET timezone = 'America/Sao_Paulo';

-- Só `public` (é onde vivem as RPCs expostas). Nenhum USAGE em app/analytics/financeiro/monde/raw:
-- as RPCs são SECURITY DEFINER e alcançam esses schemas como dono, não como chamador.
GRANT USAGE ON SCHEMA public TO verificador;

-- Nascer FECHADA, explicitamente (mesmo sendo o default): nenhuma função, nenhuma tabela.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM verificador;
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM verificador;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM verificador;
-- Função FUTURA criada por `postgres` (as migrations) não ganha EXECUTE para esta role.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM verificador;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM verificador;

-- ── 2. ALLOWLIST (derivada — ver header; SÓ LEITURA) ──────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.acervo_listar() TO verificador;
GRANT EXECUTE ON FUNCTION public.admin_solic_listar_tipos() TO verificador;
GRANT EXECUTE ON FUNCTION public.buscar_cliente_corporativo(p_nomes text[]) TO verificador;
GRANT EXECUTE ON FUNCTION public.buscar_docs_fatura(p_refs text[]) TO verificador;
GRANT EXECUTE ON FUNCTION public.buscar_pessoas(p_nomes text[]) TO verificador;
GRANT EXECUTE ON FUNCTION public.cruzar_vendas_setor(p_vendas text[]) TO verificador;
GRANT EXECUTE ON FUNCTION public.dre_comp_estrutura(p_ano integer) TO verificador;
GRANT EXECUTE ON FUNCTION public.dre_estrutura() TO verificador;
GRANT EXECUTE ON FUNCTION public.dre_estrutura_historico_lote(p_lote bigint) TO verificador;
GRANT EXECUTE ON FUNCTION public.dre_estrutura_historico_lotes(p_limit integer, p_offset integer) TO verificador;
GRANT EXECUTE ON FUNCTION public.email_existentes(p_refs text[], p_modo text) TO verificador;
GRANT EXECUTE ON FUNCTION public.estante_listar_livros(p_busca text, p_estado text, p_incluir_arquivados boolean) TO verificador;
GRANT EXECUTE ON FUNCTION public.estante_listar_movimentacoes(p_limite integer) TO verificador;
GRANT EXECUTE ON FUNCTION public.get_carteira_weddings(p_metric text) TO verificador;
GRANT EXECUTE ON FUNCTION public.get_contratos_casamento_mes(p_from date, p_to date) TO verificador;
GRANT EXECUTE ON FUNCTION public.get_decomposicao_bloco(p_from text, p_to text) TO verificador;
GRANT EXECUTE ON FUNCTION public.get_dre_competencia_mensal(p_ano integer) TO verificador;
GRANT EXECUTE ON FUNCTION public.get_dre_mensal(p_ano integer) TO verificador;
GRANT EXECUTE ON FUNCTION public.get_executiva_kpis(p_from date, p_to date, p_setor text, p_ant_from date, p_ant_to date, p_yoy_from date, p_yoy_to date) TO verificador;
GRANT EXECUTE ON FUNCTION public.get_fluxo_caixa_kpis_b(p_from text, p_to text) TO verificador;
GRANT EXECUTE ON FUNCTION public.get_fluxo_caixa_mensal_v3() TO verificador;
GRANT EXECUTE ON FUNCTION public.get_fluxo_cobertura() TO verificador;
GRANT EXECUTE ON FUNCTION public.get_fluxo_horizonte() TO verificador;
GRANT EXECUTE ON FUNCTION public.get_fluxo_previsto_diario() TO verificador;
GRANT EXECUTE ON FUNCTION public.get_fluxo_ranking(p_limite integer) TO verificador;
GRANT EXECUTE ON FUNCTION public.get_fluxo_runway_semanal() TO verificador;
GRANT EXECUTE ON FUNCTION public.get_minhas_permissoes() TO verificador;
GRANT EXECUTE ON FUNCTION public.get_mix_produto(p_from date, p_to date, p_setor text, p_limite integer) TO verificador;
GRANT EXECUTE ON FUNCTION public.get_operacoes_weddings(p_status text, p_periodo_inicio date, p_periodo_fim date, p_subsetor text, p_busca text, p_ordenar_por text, p_direcao text, p_pagina integer, p_por_pagina integer) TO verificador;
GRANT EXECUTE ON FUNCTION public.get_ranking_vendedores_range(p_from date, p_to date, p_setor text, p_limite integer) TO verificador;
GRANT EXECUTE ON FUNCTION public.get_rendimento_float(p_operacao text) TO verificador;
GRANT EXECUTE ON FUNCTION public.get_repasse_mensal(p_ano integer) TO verificador;
GRANT EXECUTE ON FUNCTION public.get_saldo_caixa() TO verificador;
GRANT EXECUTE ON FUNCTION public.get_saldo_repasse(p_from text, p_to text) TO verificador;
GRANT EXECUTE ON FUNCTION public.get_taxas_cdi(p_meses_passados integer, p_meses_futuros integer) TO verificador;
GRANT EXECUTE ON FUNCTION public.get_tendencia_margem(p_from date, p_to date, p_setor text) TO verificador;
GRANT EXECUTE ON FUNCTION public.get_vendas_em_aberto(p_setor text, p_limite integer, p_offset integer) TO verificador;
GRANT EXECUTE ON FUNCTION public.get_vendas_receita_negativa(p_setor text, p_from date, p_to date) TO verificador;
GRANT EXECUTE ON FUNCTION public.metas_listar(p_ano integer) TO verificador;
GRANT EXECUTE ON FUNCTION public.metas_ritmo_diario(p_from date, p_to date, p_setor text) TO verificador;
GRANT EXECUTE ON FUNCTION public.monde_ingest_status() TO verificador;
GRANT EXECUTE ON FUNCTION public.monde_vendas_ausentes(p_numeros text[], p_from date, p_to date) TO verificador;
GRANT EXECUTE ON FUNCTION public.patrimonio_catalogos() TO verificador;
GRANT EXECUTE ON FUNCTION public.patrimonio_listar_ativos(p_busca text, p_categoria_id smallint, p_area_id smallint, p_status text) TO verificador;
GRANT EXECUTE ON FUNCTION public.patrimonio_listar_movimentacoes(p_tipo text, p_busca text, p_limite integer) TO verificador;
GRANT EXECUTE ON FUNCTION public.patrimonio_resumo() TO verificador;
GRANT EXECUTE ON FUNCTION public.solic_caixa(p_escopo text) TO verificador;
GRANT EXECUTE ON FUNCTION public.solic_destinatarios() TO verificador;
GRANT EXECUTE ON FUNCTION public.solic_minhas() TO verificador;
GRANT EXECUTE ON FUNCTION public.solic_minhas_pendencias() TO verificador;
GRANT EXECUTE ON FUNCTION public.solic_movimentacoes() TO verificador;
GRANT EXECUTE ON FUNCTION public.solic_tipos_abertura() TO verificador;
GRANT EXECUTE ON FUNCTION public.solic_tipos_documentacao() TO verificador;
GRANT EXECUTE ON FUNCTION public.validar_carga_staging() TO verificador;

-- ── 3. Role RBAC "Máquina · verificação" — todas as áreas de LEITURA, nenhuma administrativa ─
-- "Leitura" = toda área fora do grupo Administração (admin/uploads, admin/design-system,
-- admin/acessos ficam fora). Decisão do briefing: minimizar áreas encareceria os casos de
-- contrato sem reduzir a superfície que importa — a de escrita, que os GRANTs acima já fecham.
-- Idempotente (ON CONFLICT). A role aparece no editor de acessos como qualquer outra — é
-- deliberado: quem administra acessos vê que a máquina existe e o que ela alcança.
INSERT INTO app.rbac_roles (nome, descricao)
VALUES ('Máquina · verificação',
        'Credencial de MÁQUINA da suíte de contrato e das medições (v6.0.0). Só leitura: '
        'todas as áreas fora de Administração. Não é pessoa; não loga. Revogar = desativar o usuário.')
ON CONFLICT (nome) DO NOTHING;

INSERT INTO app.rbac_role_permissoes (role_id, area)
SELECT r.id, a.area
FROM app.rbac_roles r
CROSS JOIN app.rbac_areas a
WHERE r.nome = 'Máquina · verificação'
  AND a.grupo <> 'Administração'
ON CONFLICT DO NOTHING;

-- ── 4. Registro do usuário de máquina (chamado UMA vez pelo bootstrap) ────────────────────
-- Molde: api_robo_registrar (0211) — com duas diferenças que são o ponto: o usuário nasce
-- ATIVO (é o que `exigir_acesso` exige; desativar é a alavanca de revogação) e com a role de
-- máquina informada. E-mail obrigatoriamente em `@janus.interno` (nunca confundível com
-- pessoa, nunca receberá e-mail). Gate: admin/acessos — o bootstrap roda com service_role
-- (ramo trusted), e um administrador humano também poderia chamá-la pela tela um dia.
CREATE OR REPLACE FUNCTION public.admin_registrar_usuario_maquina(
  p_user_id uuid, p_email text, p_nome text, p_role_nome text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email   text := lower(btrim(coalesce(p_email, '')));
  v_role_id bigint;
BEGIN
  PERFORM app.exigir_acesso(ARRAY['admin/acessos']);

  IF v_email !~ '^[a-z0-9._-]+@janus\.interno$' THEN
    RAISE EXCEPTION 'EMAIL_INVALIDO: usuário de máquina exige e-mail @janus.interno (recebido "%")', v_email
      USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM app.rbac_usuarios WHERE email = v_email) THEN
    RAISE EXCEPTION 'EMAIL_EM_USO: já existe um usuário com este e-mail' USING ERRCODE = '22023';
  END IF;
  SELECT id INTO v_role_id FROM app.rbac_roles WHERE nome = p_role_nome;
  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'ROLE_INEXISTENTE: role "%" não existe em app.rbac_roles', p_role_nome USING ERRCODE = '22023';
  END IF;
  IF p_role_nome NOT LIKE 'Máquina · %' THEN
    RAISE EXCEPTION 'ROLE_NAO_E_DE_MAQUINA: usuário de máquina só recebe role "Máquina · …" (recebido "%")', p_role_nome
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO app.rbac_usuarios (user_id, email, nome, role_id, ativo, precisa_trocar_senha, convidado_por)
  VALUES (p_user_id, v_email, nullif(btrim(coalesce(p_nome, '')), ''), v_role_id, true, false, auth.uid());

  RETURN jsonb_build_object('ok', true, 'user_id', p_user_id, 'role_id', v_role_id);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_registrar_usuario_maquina(uuid, text, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_registrar_usuario_maquina(uuid, text, text, text) TO authenticated, service_role;

-- Idempotência do bootstrap: devolve o usuário de máquina pelo e-mail (só @janus.interno),
-- ou NULL. Gate admin/acessos, como acima.
CREATE OR REPLACE FUNCTION public.admin_usuario_maquina_por_email(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email text := lower(btrim(coalesce(p_email, '')));
BEGIN
  PERFORM app.exigir_acesso(ARRAY['admin/acessos']);
  IF v_email !~ '@janus\.interno$' THEN
    RAISE EXCEPTION 'EMAIL_INVALIDO: só usuários de máquina (@janus.interno)' USING ERRCODE = '22023';
  END IF;
  RETURN (
    SELECT jsonb_build_object('user_id', u.user_id, 'email', u.email, 'ativo', u.ativo, 'role', r.nome)
    FROM app.rbac_usuarios u LEFT JOIN app.rbac_roles r ON r.id = u.role_id
    WHERE u.email = v_email
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_usuario_maquina_por_email(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_usuario_maquina_por_email(text) TO authenticated, service_role;

COMMENT ON ROLE verificador IS
  'v6.0.0 (0273): credencial de MÁQUINA da verificação (suíte de contrato, medições). EXECUTE só na allowlist (54 leituras) derivada por scripts/credencial/derivar-allowlist.mjs. Nenhuma RPC de escrita. Ver docs/runbooks/credenciais-maquina-runbook.md.';

-- O PostgREST precisa recarregar a configuração (rolconfig novo) e o schema (RPCs novas).
NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';
