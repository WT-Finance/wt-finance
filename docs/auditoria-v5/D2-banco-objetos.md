# D2 — Banco: objetos

Explorador D2 (Sonnet, read-only) sobre o catálogo vivo exportado em `_insumos/` (`catalogo-funcoes*.txt`,
`mapa-rpc-chamadores.txt`, `catalogo-relacoes.txt`, `catalogo-constraints-triggers-policies.txt`). Skill
lida: `banco-e-rpc`. Formato: `README.md` desta pasta. Toda remoção aqui = **migration destrutiva nova,
por último, após deploy do código** (GATE 2).

| id | achado | evidência | risco | esforço | ação proposta | classe | triagem | nota |
|---|---|---|---|---|---|---|---|---|
| D2-001 | `public.get_fluxo_caixa_kpis_diario` (+ seu `__nucleo`) sem chamador em `src/`, `seed/` ou outra função — o wrapper delega ao nucleo mas nada chama o wrapper; a tela ativa usa `get_fluxo_caixa_kpis_b` | `_insumos/mapa-rpc-chamadores.txt:132-133`; `_insumos/catalogo-funcoes-def.txt:656-662`; grep vazio em `src/` | baixo | S | DROP das duas (destrutiva, por último) | apagar | | |
| D2-002 | 4 funções `__nucleo` duplicam por inteiro a lógica do wrapper homônimo em vez de serem chamadas por ele (`get_gerencial_lancamentos__nucleo`, `_planilha__nucleo`, `_projecao_diaria__nucleo`, `_saldos__nucleo`) — wrapper não delega, zero uso em `src/` | `_insumos/catalogo-funcoes-def.txt:701-737` (wrapper × `__nucleo` lado a lado); grep vazio em `src/` | baixo | S | DROP das 4 `__nucleo` (destrutiva); reconfirmar no ato que o wrapper não faz `EXECUTE format(...)` dinâmico | apagar | | |
| D2-003 | `app.current_user_setor_id` e `public.get_my_profile` — helpers de perfil sem nenhum chamador (nem em outra função, nem em `src/`); superados por `get_minhas_permissoes`/`admin_listar_usuarios` | `_insumos/mapa-rpc-chamadores.txt`; `_insumos/catalogo-funcoes-def.txt:41,796`; grep vazio | baixo | S | DROP (destrutiva) | apagar | | |
| D2-004 | `app.is_financeiro` sem nenhum chamador — predicado coberto por `app.exigir_acesso`/RBAC dinâmico | `_insumos/catalogo-funcoes-def.txt:56`; grep vazio | baixo | S | DROP (destrutiva) | apagar | | |
| D2-005 | `app.get_config_numeric` sem chamador — nenhuma outra função lê `app.config` por ela; não confirmado se algo lê `app.config` diretamente | `_insumos/mapa-rpc-chamadores.txt`; `_insumos/catalogo-funcoes-def.txt:51` | baixo | S | confirmar ausência de leitura direta de `app.config` no ato, então DROP | apagar | | |
| D2-006 | `public.admin_set_enforcement` sem chamador em `src/` — é o **kill switch de emergência** do runbook `v4-13-auth-runbook.md`; NÃO é código morto, é feature adormecida por desenho | `_insumos/mapa-rpc-chamadores.txt`; `docs/runbooks/v4-13-auth-runbook.md`; skill `banco-e-rpc` §4 "Kill switch é emergência" | alto (se apagado por engano) | S | manter; documentar explicitamente como dormente no comentário canônico (aditiva) | decidir | | |
| D2-007 | `public.metas_subsetor_listar`, `metas_subsetor_upsert`, `metas_sumario_subsetor` sem chamador em `src/` — pertencem à branch stand-by `feat/v5-4-4` (PR #213, não mergeada); `get_sumario_subsetor__nucleo` é citado por `metas_sumario_subsetor` mas o inverso não vale | `_insumos/mapa-rpc-chamadores.txt`; `docs/investigacoes/2026-08-04-metas-subsetor-e-de-para-monde.md` | médio (produto) | S | decidir com Yan: mergear #213 ou DROP (e fechar o PR) | decidir | | |
| D2-008 | `app.pode_assinar_area` **NÃO é órfã** — o único uso vivo é dentro de uma **RLS policy** (`gerencial_broadcast_leitura` em `realtime.messages`, migration 0201), que o grep de código-fonte não alcança | `_insumos/catalogo-constraints-triggers-policies.txt:1157-1164` (policy cita `app.pode_assinar_area('financeiro/gerencial')`) | baixo | S | excluir da lista de órfãs; método: o mapa deve varrer policies e triggers também | documentar | | |
| D2-009 | Trigger functions `analytics.fn_gerencial_lancamentos_atualizado`, `financeiro.fn_broadcast_gerencial`, `financeiro.fn_dre_touch_atualizado_em` aparecem "sem chamador" no mapa, mas são **funções de TRIGGER ativas** (7 triggers vivos as citam) | `_insumos/catalogo-constraints-triggers-policies.txt:1166-1268` (7 `CREATE TRIGGER ... EXECUTE FUNCTION`) | baixo | S | excluir da lista de órfãs (mesma correção de método de D2-008) | documentar | | |
| D2-010 | 21 funções sem nenhum `GRANT`/`REVOKE` explícito (`grants: null`) — dependem de *default privileges*, contra a regra da skill §4 ("nunca contar com o default"): `extrair_nome_casal`, `fn_gerencial_lancamentos_atualizado`, `regenerar_dim_operacao_weddings`, `situacao_por_data_evento`, `is_financeiro`, `minha_role_id`, `pode_assinar_area`, `pode_ver_solic`, `slugificar`, `solic_validar_e_snapshotar`, `sou_atendente`, `tem_area`, `uid_jwt`, `fn_broadcast_gerencial`, `fn_diario_alteracoes`, `fn_dre_touch_atualizado_em`, `reverter_diario`, `como_estado_conservacao`, `como_motivo_baixa`, `proximo_codigo`, `status_derivado` | `_insumos/catalogo-funcoes.txt` (`"grants": null`) | médio | M | migration **aditiva**: `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated` + `GRANT ... TO service_role` explícito em cada uma (helpers internos chamados por `SECURITY DEFINER`) | corrigir | | |
| D2-011 | Único `anon:EXECUTE` do catálogo é `public.solicitar_acesso` — **exceção documentada** do ADR-0114 (auto-cadastro com rate-limit), não furo da janela anônima | `_insumos/mapa-rpc-chamadores.txt:279`; ADR-0114; skill §4 | baixo | S | manter; nenhuma ação | documentar | | |
| D2-012 | Cobertura de RLS: todo `rls:false` do catálogo é **view/MV** (`analytics.mv_*`, `financeiro.vw_*`, `monde.mv_*`, `patrimonio.v_estado_atual`), nunca tabela base; nenhuma das 4 policies é `USING true` | `_insumos/catalogo-relacoes.txt`; `_insumos/catalogo-constraints-triggers-policies.txt` | baixo | S | nenhuma ação — check limpo | documentar | | |
| D2-013 | `analytics.dim_taxa_cdi.taxa` tem DOIS CHECKs sobrepostos: `dim_taxa_cdi_taxa_mensal_plausivel` (±5%) e `dim_taxa_cdi_taxa_plausivel` (±100%) — o de ±100% nunca acrescenta proteção enquanto o de ±5% existir (modelo citado no briefing) | `_insumos/catalogo-constraints-triggers-policies.txt:94-116` | baixo | S (é `DROP CONSTRAINT` = destrutiva) | DROP da constraint `dim_taxa_cdi_taxa_plausivel`, manter a de ±5% | simplificar | | |
| D2-014 | `dre_estrutura_*` × `dre_comp_estrutura_*` são pares deliberadamente separados (ADR-0170) — **não propor unificação**; ambas com chamadores vivos | ADR-0170; `_insumos/mapa-rpc-chamadores.txt` | baixo | S | manter separado | documentar | | |
| D2-015 | Comentário inline de `financeiro.reverter_diario` está **atualizado** (DESC, `c_volateis`, allowlist, cita 0268) — modelo de "comentário canônico" | `_insumos/catalogo-funcoes-def.txt:131` | baixo | S | usar como modelo para a aditiva | documentar | | |
| D2-016 | Só 2 funções em todo o catálogo têm `COMMENT ON FUNCTION` formal (`admin_acesso_solicitacoes_pendentes`, `get_decomposicao_bloco`) — as ~294 restantes só têm comentário inline (quando existe) | `_insumos/catalogo-funcoes.txt` (2 `comentario` não-nulos) | baixo | L | gravar `COMMENT ON FUNCTION` nas RPCs centrais (DRE, gerencial, solicitações, metas) na aditiva da Fase 2, a partir do comentário inline | documentar | | |

## Síntese

Os 17 "sem chamador" do mapa se dividem em: **9 genuinamente mortas** (D2-001 a D2-005 — um par wrapper+`__nucleo` nunca ligado e 4 `__nucleo` que duplicam o próprio wrapper), **4 falsos positivos do método** (D2-008 policy RLS, D2-009 três trigger functions) e **4 dependentes de decisão de produto** (D2-006 kill switch, D2-007 três RPCs da branch stand-by #213). Zero grant `anon` fora da exceção documentada; RLS cobre 100% das tabelas base; constraint redundante confirmada exatamente como o briefing previu (D2-013). 21 funções sem grant explícito dependem do REVOKE global da 0122 — vale explicitar na aditiva (D2-010).

## Contagem por classe

apagar 5 · corrigir 1 · simplificar 1 · documentar 7 · decidir 2 — **total 16**.

## Achei, não vou agir

- **Colunas (item 4):** varredura dirigida das tabelas pequenas `app.*`/`financeiro.*`/`patrimonio.*` coluna a coluna não feita (758 colunas; timebox).
- **FKs sem índice:** não levantadas.
- **UNIQUE duplicando PK:** a extração não trouxe PKs (`contype='p'` excluído); precisaria de nova query.
- `get_fluxo_caixa_acumulado_v1` / `get_fluxo_caixa_mensal_v3`: sufixos de versão sem irmãos residuais — ruído de nomenclatura (D9), não duplicação.
- Comentário × corpo das ~19 RPCs centrais restantes (item 9): só `reverter_diario` amostrado; D2-016 cobre a lacuna estrutural.

## Riscos fora do escopo

- As 21 funções de D2-010 não abrem `anon`/`authenticated` hoje só porque a 0122 corrigiu o default privilege — um `ALTER DEFAULT PRIVILEGES` futuro descuidado reabriria em silêncio.
- `admin_set_enforcement` (D2-006) é sensível o bastante para uma triagem apressada marcá-lo "apagar" por estar na lista de órfãos — sinalizado para não acontecer.
- D1-012 propõe apagar 6 scripts de `supabase/seed/` — RPCs cujo único chamador é um deles viram órfãs de fato após esse commit (recontar o mapa antes da destrutiva).
