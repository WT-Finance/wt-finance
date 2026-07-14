# ADR-0149 — Ingestão da API do Monde (espelho paralelo para alimentar as Metas)

- **Status:** aceito (v5.1.2)
- **Data:** 2026-07-14
- **Tipo:** PATCH · migrations ADITIVAS 0178–0180 (schema espelho novo) · base main @ v5.1.1
- **Fronteira:** esta versão NÃO vira a chave. Entrega ingestão paralela + tela de comparação.
  A fonte de produção das Metas **segue no upload**. A virada é o **PASSO 2** (runbook a parte).

## Contexto

As Metas leem o *realizado* de `analytics.mv_vendas_diarias`, populada pelo **upload manual**
de planilhas (snapshot). O Monde (ERP) expõe uma API só-leitura (`monde-data`, edge function,
`x-api-key`). A investigação (relatório-mapa, 2026-07-14) provou **ao centavo, venda a venda**
(jun/2025 e jun/2026) que a plataforma é um **subconjunto do Monde** e que consumir o recurso
`sales` cru + a lógica de `get_executiva_kpis` reproduz os números; o recurso `kpis` é
*closed-only* e por setor micro, logo **não serve** para meta por macro.

Objetivo desta versão: **ler o Monde e espelhar as vendas numa estrutura PARALELA**, provar a
paridade lado a lado (tela de comparação), sem tocar a produção. A troca de fonte é decisão
posterior do Yan, com runbook próprio.

## Decisão

1. **Consumir `sales` cru, não `kpis`.** A API alimenta a BASE (fato espelho), e a mesma lógica
   da mv de produção computa os totais — fonte única preservada por construção.

2. **Schema espelho `monde`, SEPARADO e idempotente (0178).** `monde.venda`/`monde.venda_item`
   vivem fora do `TRUNCATE CASCADE` do upload (que só toca `analytics`/`raw`) — e vice-versa,
   sem FK cruzada. Ingestão por **UPSERT idempotente por `venda_numero` + `raw_hash`** (se o hash
   não mudou, pula) — o oposto do full-swap destrutivo do upload; re-rodar nunca duplica. Padrão
   atômico staging→promover (molde da carga de Pessoas, 0160), mas UPSERT em vez de TRUNCATE.
   `monde` NÃO é exposto pelo PostgREST (como `analytics`): acesso via RPCs `SECURITY DEFINER` no
   `public`; ingestão é **service_role-only**.

3. **Estrutura AUTO-CONTIDA — `setor_macro` guardado direto (não FK às dims de produção).** A mv
   de produção agrega por `setor_macro` via join a `dim_setor`; o INNER JOIN **descarta em
   silêncio** vendas cujo vendedor/setor não existam nas dims. O espelho evita isso guardando
   `setor_macro` já resolvido na própria `monde.venda` — **nenhuma venda do Monde se perde por
   dim ausente**. O mapa micro→macro é o provado: Lazer/Expedições→Lazer; WedMe/Weddings/
   Planejamento-WED/Produção→Weddings; Corporativo→Corporativo.

4. **Exclusões deliberadas (decisões do Yan), registradas no dado.**
   - **Setor `Welcome` EXCLUÍDO** (emissões internas de colaboradores; não contam) — a venda
     inteira é descartada na ingestão. É exclusão deliberada, não "sem mapa".
   - **Produtos CANCELADOS EXCLUÍDOS da projeção** — a mv espelho soma só `status='active'`. O
     `status`/`canceled_at` de cada item são **guardados** (auditável; permite religar sem
     recarregar). Consequência aceita: o histórico se ajusta **nas duas direções** (mais vendas
     que o snapshot − cancelados).

5. **Vendedor de Weddings vem do custom_field.** Em Weddings, o vendedor real é
   `custom_fields['Vendedor(a) Responsável - Grupo']` (não `travel_agent_name`, que é o emissor);
   demais setores usam `travel_agent_name`.

6. **Síntese dos 3 booleanos (contrato/taxa_servico/operacao_propria) — COMPLETUDE/AUDITORIA,
   não "para não perder linha".** ⚠️ **Correção de premissa do briefing:** a auto-auditoria
   contra o código real (migration 0011) mostrou que a transform de produção **NÃO descarta** a
   linha por falta desses flags — `contrato`/`taxa_servico` são `COALESCE(..., false)` e
   `operacao_propria` **nem é coluna** de `fato_venda`/`fato_venda_item` (vive só em
   `raw.vendas_excel`, uso separado de Weddings). Além disso a `mv_vendas_diarias` **não agrega**
   por esses flags. Logo a síntese não altera nenhum número da comparação; ela existe para
   completude do espelho e auditoria. Regras:
   - `taxa_servico` = algum item ativo com `agency_service_fee > 0` (**sinal real**).
   - `operacao_propria` = `raw.intermediary` ausente/nulo (**heurística PROVISÓRIA**).
   - `contrato` = `false` (**default explícito** — sem sinal confiável na API).
   O `raw` nativo é guardado inteiro (`monde.venda.raw`) para **reprocessar** os flags no futuro
   quando/se a semântica for confirmada com o Yan, sem recarregar.

   **Faturamento × receita (mapeamento do valor):** `valor_total` do item = `product.total_amount`
   (a soma dos ATIVOS = faturamento da venda; casa com o upload — Weddings jun/2026 **exato**,
   Lazer Δ 0,005%). `receitas` = o **`total_revenue` da VENDA** (número autoritativo do Monde),
   **distribuído** entre os itens ativos proporcional ao valor (resto ao último → soma bate ao
   centavo) — porque a soma dos componentes por produto (comissão/over/taxa/RAV/`passenger.agency_fee`)
   **NÃO reconstrói** `total_revenue` de forma confiável (verificado ao vivo: nenhuma combinação
   bate por venda). É uma ALOCAÇÃO; só o AGREGADO importa (o que a comparação mostra) e ele bate
   com o upload (jun/2026 receita Monde ≈ upload). (Primeira versão da síntese usava
   `passenger.agency_fee` e subcontava a receita ~2,3× — corrigido na auto-auditoria do checkpoint.)

7. **mv espelho `monde.mv_vendas_diarias` (0179) — mesma lógica da produção, itens ativos.** Soma
   `valor_total`/`receitas` por `data_venda × setor_macro`, contagem DISTINCT de venda; **não
   substitui** a mv de produção. Refresh manual pós-ingestão. É o lado "Monde" da comparação.

8. **Ingestão por Vercel Cron + backfill resumível (0178/M5).** Schedule commitado **diário**
   (`0 9 * * *`) — cron sub-diário (`*/15`) é **Pro-only** e o Vercel **rejeita o deploy** em Hobby
   se o `vercel.json` pedir isso (bloqueou o 1º deploy do branch); o `*/15` fica p/ o passo 2. API Route
   (`runtime='nodejs'`, server-only) protegida por `CRON_SECRET`; janela incremental (from/to
   recente, com sobreposição, idempotente) no cron; modo **backfill** (2023→hoje ≈29k) resumível
   por cursor (cada invocação processa um lote dentro do orçamento e salva o cursor). Detalhe por
   venda (`sale?id=`) buscado com concorrência limitada. Payload validado por Zod tolerante; linha
   inválida descarta com log, **nunca aborta** — a API caindo/mudando não quebra o painel (upload
   é fallback).

9. **Chave server-only, de SERVIÇO.** `MONDE_API_KEY` só no servidor (`.env.local`/Vercel), nunca
   em repo/log/cliente/query-string. Chave de integração do Welcome Group (não pessoal).

10. **Tela de comparação (0180/M6) — só-leitura, sem virada.** Página interna sob `/metas`
    (guard `metas/acompanhamento`|`metas`), upload × Monde mês a mês (Group + setores):
    faturamento/receita/vendas de cada fonte + delta, com o gabarito histórico como referência.
    **Nenhum botão de virada** — a decisão de trocar a fonte é o passo 2.

## Alternativas rejeitadas

- **Consumir `kpis` pronto:** closed-only + por micro → subconta e não bate por macro (provado).
- **Reusar a transform/fato de produção:** acoplaria o espelho ao TRUNCATE do upload e aos INNER
  JOINs de dim (descarte silencioso). O espelho é auto-contido de propósito.
- **Full-swap (como o upload):** perderia a idempotência incremental e não conviveria com o cron
  de 15min; o UPSERT por `raw_hash` é reconstituível e barato.
- **Virar a fonte agora:** fora de escopo — a paridade se prova na comparação antes de qualquer
  corte; runbook do passo 2 decide.

## Consequências

- Produção **intocada**: `get_executiva_kpis`/`metas_ritmo_diario` seguem em
  `analytics.mv_vendas_diarias` (upload); `/metas` e `/performance` idênticas a antes.
- Existe uma segunda base (`monde.*`) mantida pelo cron, comparável lado a lado com a de produção.
- Os 3 flags sintetizados são **provisórios/auditáveis** (raw guardado) — reprocessáveis sem
  recarga; não afetam nenhum total.
- **Reprocesso × `raw_hash`:** a idempotência é por `raw_hash` (hash do payload da API), então uma
  mudança na **lógica da transform** (ex.: a fórmula da receita, corrigida no checkpoint) **NÃO** é
  repescada por um re-run — o `raw_hash` é o mesmo. Reprocessar exige **forçar** (TRUNCATE do espelho,
  ou um futuro "bump de versão de transform" no `raw_hash`). Registrado para correções futuras e p/ o passo 2.
- Passo 2 (runbook `Janus_Runbook_Virada_Monde`): repontar `get_executiva_kpis`/`metas_ritmo_diario`
  para o espelho (ou promover o espelho ao fato de produção), comunicar a diretoria (o histórico
  sobe/ajusta), **remover o auto-refresh do Modo TV** (`TvAutoRefresh` +
  `src/app/metas/tv/page.tsx` — isolado, remoção trivial), e decidir o destino do upload.
- Fora desta versão: pagamentos/parcelas, endereço do pagante, cancelamento como filtro na
  Performance (guardamos `status`/`canceled_at`; religar é decisão futura), Metas por Vendedor.
