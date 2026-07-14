# ADR-0151 — A Virada: fonte de vendas passa a ser o Monde (repoint reversível)

- **Status:** aceito (v5.1.4) — migration do flip **NÃO aplicada pelo Code** (gate do Yan)
- **Data:** 2026-07-14
- **Tipo:** PATCH · migration 0181 (repoint REVERSÍVEL) + 0182 (agendamento) · base main @ v5.1.2
- **Nota de numeração:** ADR **0151** (não 0150 — a v5.1.3, harness, em paralelo, reservou 0150).

## Contexto

Passo 2 da integração Monde (v5.1.2 ingeriu o espelho paralelo; backfill 2023→hoje completo;
o **diagnóstico de receita** provou definição IDÊNTICA, ~99% ao centavo por venda). A fonte de
produção das vendas — hoje o upload manual de Excel (`analytics.fato_venda/item` →
`analytics.mv_vendas_diarias`) — passa a ser o espelho Monde (`monde.mv_vendas_diarias`). Afeta
**Metas E Performance juntas** (fonte única — a mesma `get_executiva_kpis`), decisão ciente do Yan.

## Decisão

1. **REPONTAR, não promover.** As funções que leem a mv passam a ler o espelho Monde via
   **views-compat** — troca de PONTEIRO reversível. O fato do upload (`fato_venda/item`,
   `raw.vendas_excel`) **nunca é tocado**. Para o diff por função ser mínimo e o `down` trivial,
   `monde.mv_vendas_diarias_compat` expõe a MESMA forma de `analytics.mv_vendas_diarias`
   (`setor_macro_id` bigint, via join a `dim_setor_macro`); `monde.mv_vendas_mensais` é uma view
   roll-up da compat diária (espelha `analytics.mv_vendas_mensais`).

2. **Escopo = as 7 funções PURA-mv** (só leem a mv): `get_executiva_kpis__nucleo`,
   `metas_ritmo_diario`, `get_tendencia_margem__nucleo`, `get_decomposicao_variacao__nucleo`,
   `get_historico_12m_setores__nucleo`, `get_mix_setor__nucleo` (diárias) + `get_historico_mensal__nucleo`
   (mensal). **`get_mix_produto__nucleo` e `get_cagr__nucleo` NÃO viram** — são MISTAS (leem o
   `fato_venda` DIRETO: breakdown por produto / anos completos), e repontar só a parte-mv delas
   quebraria a coerência interna (total Monde × breakdown upload). Fazê-las 100% Monde exigiria
   **alimentar o fato** a partir do Monde (Scope B — fora deste briefing). Ficam no upload,
   internamente coerentes; em meses fechados Monde≈upload, resíduo visível ínfimo.

3. **Reversível por design.** A 0181 tem o bloco **DOWN explícito** (recria as 7 funções lendo
   `analytics.*` + `DROP` das views-compat). Como o fato do upload nunca foi tocado, o rollback é
   **uma migration de volta, não restauração de dado**. Metas ≡ Performance por construção (mesma
   `get_executiva_kpis`) — a fonte única não quebra, muda de origem. **Provado por teste** (M2,
   `src/lib/monde/virada-paridade.test.ts`): o repoint aplicado em transação faz `get_executiva_kpis`
   retornar exatamente `monde.mv_vendas_diarias` (Group + 3 setores), com ROLLBACK.

4. **Agendamento migra para o Supabase (0182).** `pg_cron` (~15min) + `pg_net` chamam a rota
   existente `/api/monde/ingest?mode=incremental` (reuso; opção (a) sobre a Edge Function (b)).
   `CRON_SECRET`+URL vêm do **Vault** (nunca hardcoded). Idempotente (UPSERT por `raw_hash`);
   falha de um tick recupera no próximo; a última mv boa permanece. **Substitui** o Cron diário da
   Vercel — que fica **dormente como redundância** (idempotente; removível quando o 15min for
   confirmado — evita gap na transição).

5. **Auto-refresh do Modo TV removido.** `TvAutoRefresh` (setInterval `router.refresh` 600s,
   INTERIM da v5.1.0) apagado; com o pull de 15min o servidor fica fresco e o TV reflete o último
   pull. `/metas/tv` segue funcional.

6. **Upload = FALLBACK DORMENTE.** O pipeline de upload permanece **funcional e intocado**;
   ninguém usa no dia a dia. Se o Monde falhar, aplica-se o DOWN da 0181 e o upload volta a ser a
   fonte — sem restauração de dado. Aposentar o upload é decisão/versão futura.

7. **Flip = gate do Yan.** A 0181/0182 estão prontas mas **NÃO aplicadas pelo Code**. A aplicação
   em produção é do Yan, **DEPOIS da comunicação à diretoria** (o histórico muda levemente — ver
   diagnóstico; avisar preserva confiança). Runbook a parte amarra a sequência.

8. **Definição inalterada.** Receita/faturamento/margem calculados igual; os **alvos de 14%**
   seguem válidos. A virada muda a ORIGEM, não a metodologia.

## Alternativas rejeitadas

- **Promover o espelho para dentro de `analytics.fato_venda`:** acoplaria ao TRUNCATE do upload +
  reintroduziria os INNER JOINs de dim (descarte silencioso) que o espelho auto-contido evitou; e
  o rollback viraria restauração de dado. O repoint por ponteiro é reversível e não toca o fato.
- **Isolar só as Metas (não a Performance):** impossível sem quebrar a fonte única (mesma
  `get_executiva_kpis`). Viram juntas.
- **Repontar as MISTAS (mix_produto/cagr) só na parte-mv:** criaria inconsistência interna
  (total Monde × breakdown upload). Melhor deixá-las coerentes no upload até o Scope B.
- **Edge Function agendada (b):** código novo autocontido quando a rota idempotente já existe;
  pg_cron+pg_net reusa tudo.

## Consequências

- Metas/Performance/Executiva (KPIs, margem, decomposição, histórico 12m/mensal) passam a refletir
  o Monde (mais completo/atual) após o flip; faturamento de meses fechados idêntico ao centavo,
  recentes um pouco acima (Monde mais atual). Mix por produto e CAGR seguem no upload (boundary §2).
- Reversão a um comando (DOWN da 0181). Upload dormente pronto como fallback.
- Agendamento vive no Supabase; o Cron da Vercel fica redundante (dormente).
- **Fora desta versão:** aposentar o upload; alimentar o fato do Monde (viraria mix_produto/cagr);
  cancelamento como filtro na Performance; pagamentos/parcelas; Faturamento Corp; Metas por Vendedor.
