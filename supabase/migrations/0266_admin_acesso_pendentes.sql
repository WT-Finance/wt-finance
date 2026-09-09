-- ---------------------------------------------------------------------------
-- 0266 — feat(v5.9.3/M6): badge de solicitações de acesso PENDENTES em
-- admin/acessos (sidebar + pill da página).
--
-- DECLARAÇÃO (regime ADITIVO): função nova, `SECURITY DEFINER`, sem tocar em
-- nenhuma estrutura ou dado existente. `REVOKE`/`GRANT` explícitos, sem abrir
-- `anon`. Retrocompatível com a `main` viva por construção — nada consome esta
-- RPC ainda além do que esta própria versão está adicionando.
--
-- POR QUÊ: a sidebar precisa de um NÚMERO (contagem), não da lista. Reusar
-- `admin_listar_solicitacoes` (que já traz tudo) para isso jogaria o payload
-- inteiro num badge que aparece em TODA rota do app — a página de Acessos já
-- filtra `status === 'pendente'` no cliente a partir dessa mesma listagem; a
-- RPC nova é só a versão "count(*)" gated, para o caminho que roda a cada
-- navegação (o layout raiz).
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.admin_acesso_solicitacoes_pendentes()
RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
BEGIN
  PERFORM app.exigir_acesso(ARRAY['admin/acessos']);
  RETURN (
    SELECT count(*)::int
    FROM app.rbac_solicitacoes
    WHERE status = 'pendente'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_acesso_solicitacoes_pendentes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_acesso_solicitacoes_pendentes() TO authenticated, service_role;

COMMENT ON FUNCTION public.admin_acesso_solicitacoes_pendentes() IS
  'v5.9.3/M6: contagem de solicitações de acesso com status = pendente, gated por admin/acessos. '
  'Consumida pelo badge (círculo vermelho) na sidebar e na pill "Solicitações de acesso" de /admin/acessos — '
  'nunca a lista, só o número, para caber no caminho não-bloqueante do layout raiz.';
