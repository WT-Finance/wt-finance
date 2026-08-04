# Briefing v5.4.3 — Onda 0: fechar o furo do espelho do Monde

**Tipo:** PATCH (correção de defeito em produção) · **Migration:** aditiva (agendamento + controle da reconciliação) · **ADR:** novo, emendando ADR-0149/0151 · **Base:** `main` @ v5.4.2 · **Branch:** `fix/v5-4-3-reconciliacao-espelho` · **Rota A**

> **Isto não é Scope B.** É pré-condição dele — e é a única parte com pressa. O restante do Scope B ficou em espera aguardando o provedor (ver *Fronteira*).

## O problema (medido, não suposto)

O modo `incremental` do `/api/monde/ingest` — o que o `pg_cron` chama a cada ~15 min desde a v5.1.4 — pede à API a janela **`hoje−2d .. hoje`**, e a API filtra por **data da venda**. Venda **registrada com atraso** e data retroativa **nunca cai na janela**: entra na API depois que a janela já passou por aquele dia, e o incremental nunca volta lá.

Resultado hoje, conferido venda a venda contra a API:

- **42 vendas** existem no upload e **não** no espelho — **R$ 392.070,01 de faturamento** e **R$ 47.806,35 de receita**.
- **38 delas em jul/2026**; nenhuma foi excluída legitimamente (todas com setor válido, item `active`, nenhuma do setor Welcome).
- **37 de 38** foram registradas **mais de 2 dias** após a data da venda — atraso mediano **4 dias**, **máximo 32** (venda 73422: data 03/07, registrada 03/08).

**Por que é urgente:** o espelho é a fonte de produção de `get_executiva_kpis`, `metas_ritmo_diario`, `get_tendencia_margem`, `get_decomposicao_variacao`, `get_historico_12m_setores`, `get_mix_setor` e `get_historico_mensal` desde a v5.1.4. **Metas e Performance estão subestimando faturamento agora**, e a lacuna cresce a cada venda lançada com atraso. Hoje quem evidencia o furo é a comparação contra o upload — que vai ficar dormente e esfriar.

## Decisões do Yan (firmes)

- **Não alargar o incremental para 35 dias.** Puxar 35 dias em 96 ciclos por dia é caro para cobrir um caso raro, e ainda deixa ponto cego (32 dias é o atraso **observado**, não um teto garantido).
- **Janela curta frequente + reconciliação larga diária.** A reconciliação é **auto-curativa**: não depende de acertar o tamanho de nenhuma janela.
- **O detector compara o espelho contra a API — nunca contra o upload.** O upload vai ficar dormente e esfriar; um monitor ancorado nele morre junto. Comparando contra a API, o monitor continua válido depois da aposentadoria.

## Desenho

**1. Incremental cobre o caso comum, barato.** A janela sobe de `hoje−2d` para **`hoje−7d`** (o atraso mediano é 4 dias). É mudança de argumento no cálculo da janela, não de schema. A cauda fica para a reconciliação.

**2. Reconciliação diária dos últimos 3 meses.** Um modo novo do endpoint existente (ex.: `mode=reconciliacao`) que reprocessa mês a mês os últimos 3 meses, 1×/dia, fora do horário de pico. Cobre o atraso máximo observado (32 dias) com folga larga e também **pega edições retroativas**. Barata por construção: o UPSERT por `raw_hash` ignora venda inalterada.

**3. Tripwire de contagem mensal contra a API.** Para cada um dos últimos 12 meses, uma chamada `sales` com `page_size=1` lendo **só o campo `total`** (12 chamadas/dia, custo desprezível) × a contagem do espelho no mesmo mês. Divergência registrada e visível. Se acender num mês **fora** da janela de reconciliação, o tratamento é reprocessar aquele mês por `mode=window` — o que a divergência entrega é o **mês**, então a correção é dirigida.

**4. Sem tocar a transformação.** `transformSale` fica **intacto**. Corrigir lógica de transformação exigiria reprocesso do histórico (a lição do `raw_hash`, ADR-0149b) e não é o escopo desta versão — o furo é de **alcance**, não de interpretação.

## Invariantes (inegociáveis)

1. **Nada de mudança de lógica de transformação** — esta versão só faz o espelho **alcançar** vendas que ele já saberia transformar.
2. **Reconciliação idempotente e sem concorrência com o incremental** — garantir que os dois não rodem sobrepostos (lock, ou horário fora do slot do `*/15`); duas ingestões simultâneas na mesma venda não podem produzir estado inconsistente.
3. **Falha não corrompe** — reconciliação abortada deixa o espelho no estado anterior; a próxima rodada recupera (padrão staging→promover da 0178).
4. **O tripwire compara contra a API.** Nenhuma peça nova desta versão pode depender do upload para funcionar.
5. **Verificar as RPCs/endpoints novos executando via REST/service_role** — introspecção não prova execução (lição da v5.2.1, do `max(uuid)`).
6. **Secrets já existem** no Vault (`monde_cron_secret`, `monde_app_url`) — reusar, não recriar.
7. **Migration aditiva**, numerada na hora, com bloco `DOWN`.

## Missões

| # | Conteúdo | Auto-auditoria |
|---|---|---|
| **M1** | **Provar o furo antes de consertar.** Consulta/rotina que lista, para um range, as vendas presentes na API e ausentes do espelho. Rodar e reproduzir o número atual (as 42 servem de fixture inicial). **Este é o teste de aceitação** e o invariante permanente: *zero vendas na API ausentes do espelho no range coberto*. | o furo é reproduzido antes de qualquer correção |
| **M2** | **Incremental `hoje−7d`.** Ajustar o cálculo da janela no endpoint. Medir o custo do ciclo antes/depois. | ciclo segue dentro do orçamento; nenhuma regressão no `ingest_control` |
| **M3** | **`mode=reconciliacao` + agendamento diário.** Reprocessa os últimos 3 meses, mês a mês, resumível; `pg_cron` 1×/dia fora de pico, sem sobrepor o `*/15`. Log por mês (lidas / inseridas / atualizadas / ignoradas / erros). | rodar 2× seguidas não muda nada na 2ª (idempotência); as vendas da M1 aparecem |
| **M4** | **Tripwire mensal.** 12 chamadas `page_size=1` lendo `total` × contagem do espelho; resultado gravado em controle e exposto de forma discreta (superfície mínima em `admin/uploads` ou campo em `monde_ingest_status`). Divergência = alerta visível, não linha de log. | acende de propósito num teste (remover 1 venda em ambiente de teste) e apaga após reconciliar |
| **M5** | **Fechamento.** v5.4.3; CHANGELOG; CHANGELOG_DIRETORIA (negócio: "a sincronização com o Monde passou a recuperar vendas lançadas com atraso — alguns totais recentes sobem"); **ADR** emendando 0149/0151: por que janela curta + reconciliação em vez de janela larga, e por que o monitor compara contra a API; out-briefing com **o antes/depois das vendas recuperadas e o impacto em faturamento por mês**. | — |

## Gates

Escalonados: `tsc --noEmit` + lint ao fim de cada missão; `build` + `test` na fronteira de fase (após M3) e no fechamento. Migration aditiva com backup-gate. Endpoints/RPCs verificados **executando** via REST.

## Checkpoint do Yan

Rodar a M1 e ver o furo; aplicar; rodar a reconciliação e confirmar que **as vendas voltaram** (o faturamento de jul/2026 sobe em Metas e Performance — é correção, e o out-briefing traz o número exato); confirmar o `pg_cron` diário em `cron.job` e o resultado do primeiro ciclo em `cron.job_run_details`; ver o tripwire zerado.

**Comunicação:** o faturamento recente **sobe** ao recuperar as vendas — mesma família da virada da v5.1.4 (a fonte fica mais completa). Se o número de jul/2026 já circulou na diretoria, vale a nota de uma linha.

## Fronteira

**Fora desta versão, e por decisão:**
- **Correções de completude do espelho aprovadas na decisão 2 da investigação** — gravar `operation_id` em coluna, corrigir `contrato`/`taxa_servico` pela regra do produto, depreciar o boolean homônimo `operacao_propria`. **Ficam para uma versão pequena própria**, porque envolvem mudança de lógica de transformação e backfill por DML — risco que não deve pegar carona numa correção urgente. *(Recomendação para lá: depreciar o boolean por `COMMENT ON COLUMN` em vez de renomear — aditivo, zero risco, e o rename espera uma versão que já toque o espelho destrutivamente.)*
- **O resto do Scope B em espera:** com a margem por produto confirmada como informação de negócio (decisão 1) e a receita por item do espelho sendo **alocação**, o upload de Vendas permanece necessário. O desbloqueio é um pedido ao provedor — **receita por produto** — que conserta de uma vez o mix, o `get_prejuizos` e a receita por subsetor. `get_prejuizos` fica como está.
- **Pessoas** permanece no upload manual (decisão 3).
