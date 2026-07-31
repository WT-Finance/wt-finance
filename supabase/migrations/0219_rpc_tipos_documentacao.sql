-- ---------------------------------------------------------------------------
-- 0219 — fix(v5.4.0/Round4): a página de Documentação da API precisa de uma RPC
-- que a permissão NOVA alcance. Achado CRÍTICO da revisão do round 4.
--
-- O defeito: a 0217 criou a área `solicitacoes/documentacao` e o guard da página
-- passou a aceitá-la (`requireArea(['solicitacoes/documentacao','solicitacoes'])`),
-- mas a seção VIVA da página ("Tipos expostos agora") era alimentada por
-- `admin_solic_listar_tipos()`, que exige `app.exigir_acesso(ARRAY['solicitacoes'])`
-- — a área de GESTÃO. Quem tivesse SÓ a permissão nova entrava na página e via a
-- seção vazia com "Não foi possível carregar os tipos": exatamente a pessoa para
-- quem a permissão foi criada, batendo na porta que a permissão deveria abrir. A
-- seção viva é a razão de ser da página (o `.md` estático já cobre o resto), então
-- o furo esvaziava a feature inteira.
--
-- Por que uma RPC NOVA em vez de afrouxar o gate da existente: `admin_solic_
-- listar_tipos` devolve TODOS os tipos — inclusive os arquivados e os NÃO expostos
-- — com a contagem de solicitações de cada um. A documentação precisa apenas dos
-- tipos EXPOSTOS e não arquivados. Afrouxar o gate daria a quem só documenta uma
-- visão do cadastro inteiro que ele não precisa; uma irmã enxuta entrega o
-- necessário e nada além (mesmo espírito de `solic_tipos_api`, que já existe para
-- a porta externa). O gate da `admin_solic_listar_tipos` fica INTOCADO.
--
-- DECLARAÇÃO PRÉVIA (regime aditivo / autônomo):
--   • O QUE FAZ: cria `public.solic_tipos_documentacao()` — mesma FORMA de retorno
--     de `admin_solic_listar_tipos` (o front reaproveita `tiposAdminSchema` sem
--     mudança), mas filtrando `exposto_via_api AND NOT arquivado`, e com
--     `exigir_acesso(ARRAY['solicitacoes','solicitacoes/documentacao'])` — array é
--     OU no banco (`rp.area = ANY (p_areas)`, 0119), então quem tem gestão continua
--     entrando.
--   • NÃO ALTERA nenhuma função existente, nenhuma tabela, nenhum dado.
--   • `n_solicitacoes` é mantido na forma por compatibilidade de schema, e é
--     informação de tipo EXPOSTO (o que a pessoa já vê documentado) — não abre
--     nada sobre tipos internos.
--   • DOWN: `DROP FUNCTION IF EXISTS public.solic_tipos_documentacao();` e reapontar
--     a página para `getTiposAdmin()`.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.solic_tipos_documentacao()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['solicitacoes', 'solicitacoes/documentacao']);
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object(
    'id', t.id, 'nome', t.nome, 'arquivado', t.arquivado,
    'slug', t.slug,
    'exposto_via_api', t.exposto_via_api,
    'n_campos', (SELECT count(*) FROM app.solicitacao_campo c WHERE c.tipo_id = t.id),
    'n_solicitacoes', (SELECT count(*) FROM app.solicitacao s WHERE s.tipo_id = t.id),
    'campos', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id',c.id,'rotulo',c.rotulo,'tipo_campo',c.tipo_campo,'obrigatorio',c.obrigatorio,'opcoes',c.opcoes,'ordem',c.ordem,
        'data_permite_passado',c.data_permite_passado,'data_aviso_dias_futuro',c.data_aviso_dias_futuro,
        'data_aviso_direcao',c.data_aviso_direcao,'chave',c.chave) ORDER BY c.ordem)
      FROM app.solicitacao_campo c WHERE c.tipo_id = t.id), '[]'::jsonb)
  ) ORDER BY t.nome)
  FROM app.solicitacao_tipo t
  WHERE t.exposto_via_api AND NOT t.arquivado), '[]'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.solic_tipos_documentacao() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.solic_tipos_documentacao() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
