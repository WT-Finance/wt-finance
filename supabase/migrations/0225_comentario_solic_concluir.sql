-- ---------------------------------------------------------------------------
-- 0225 — chore(v5.4.0/Round6): conserta um fragmento de comentário PENDURADO em
-- `solic_concluir` — achado BAIXO do revisor-db, e pedido do Yan ("aproveite para
-- consertar também os comentários desatualizados das funções").
--
-- O que estava lá: `-- conclusão foi EXTIRPADO (ver Emenda no ADR-0161).` — sem
-- sujeito. É resto da remoção cirúrgica da 0222: o comentário original tinha 4
-- linhas explicando o enfileiramento do callback de conclusão, o script removeu as
-- que citavam callback/outbox e essa continuação ficou pendurada.
--
-- POR QUE A MINHA VARREDURA NÃO PEGOU (vale como método): eu varri por REFERÊNCIA
-- DESATUALIZADA (ADR em numeração provisória, callback, outbox, whitelist…) e essa
-- linha cita o ADR-0161, que é o número CERTO — o defeito dela é gramatical, não
-- factual. São duas classes diferentes. Tentei detectar a segunda por padrão
-- (comentário que começa como continuação e cuja linha anterior não é comentário):
-- 34 candidatos, 33 falsos positivos, porque comentário começando em minúscula é
-- estilo normal deste repo. **Conclusão honesta: essa classe não é detectável por
-- padrão — foi leitura humana (revisor) que pegou.**
--
-- DECLARAÇÃO PRÉVIA (regime aditivo / autônomo):
--   • O QUE FAZ: `CREATE OR REPLACE` de `public.solic_concluir(bigint)` com o corpo
--     VIVO e SÓ o comentário trocado. Zero mudança de comportamento — nenhuma linha
--     executável difere (conferido).
--   • Assinatura, `SECURITY DEFINER`, `search_path` e grants preservados (`CREATE OR
--     REPLACE` sem troca de assinatura mantém o ACL).
--   • DOWN: irrelevante (comentário).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.solic_concluir(p_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_sol app.solicitacao;
BEGIN
  PERFORM app.exigir_acesso();
  SELECT * INTO v_sol FROM app.solicitacao WHERE id = p_id;
  IF NOT FOUND OR NOT app.pode_ver_solic(v_sol) THEN RAISE EXCEPTION 'NAO_ENCONTRADA' USING ERRCODE='42501'; END IF;
  IF v_sol.status <> 'aberta' THEN RAISE EXCEPTION 'TRANSICAO_ILEGAL: solicitação não está aberta' USING ERRCODE='22023'; END IF;
  IF NOT (app.sou_atendente(v_sol) OR v_sol.solicitante_id = app.uid_jwt()) THEN
    RAISE EXCEPTION 'PERMISSAO_NEGADA: só o atendente ou o solicitante pode concluir' USING ERRCODE='42501'; END IF;

  UPDATE app.solicitacao SET status='concluida', decidido_por=app.uid_jwt(), decidido_em=now() WHERE id=p_id;

  -- Só move o estado. Não notifica ninguém: o Round5 removeu os callbacks de saída
  -- (ADR-0161 superado) — quem quer saber do desfecho CONSULTA a API.

  RETURN jsonb_build_object('ok', true);
END; $function$;

NOTIFY pgrst, 'reload schema';
