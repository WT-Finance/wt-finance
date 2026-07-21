# ADR-0953 — Outbox de callbacks at-least-once: movimentação nunca quebra por entrega

> **Numeração PROVISÓRIA (faixa reservada 0950+, v5.4.0).** Renumeração no checklist de merge.

- **Data:** 2026-07-21
- **Status:** aceito
- **Versão:** v5.4.0

## Contexto

A origem externa precisa saber quando a solicitação muda de estado (criada, concluída — com a
referência externa —, rejeitada — com justificativa —, cancelada). Um POST direto no momento da
movimentação teria dois defeitos: (a) se o assinante estiver fora do ar, a movimentação falharia
ou o evento se perderia; (b) callback aqui é **dado de negócio** (o estado da origem depende
dele — ex.: registrar a saída real no extrato do casal), não decoração — o padrão best-effort
puro do e-mail (v4.25) não basta: precisa de **persistência e retry**.

## Decisão

1. **Tabela outbox** (`app.api_outbox`): evento, solicitacao_id, chave destinatária, payload
   pronto, tentativas, próximo retry, status (`pendente`/`entregue`/`esgotado`), último erro.
2. **Enfileiramento DENTRO das RPCs de movimentação** (`criar_solicitacao_externa`,
   `solic_concluir/rejeitar/cancelar`), na MESMA transação da movimentação — o evento nunca se
   perde nem nasce sem a movimentação. Enfileira **só para solicitações de origem externa** (as
   internas não geram callback).
3. **Entrega desacoplada**: um processador lê a fila e faz o POST na `callback_url` da chave com
   header `x-callback-secret` (segredo de saída da chave). **Mecânica em duas pontas**:
   tentativa **inline best-effort** logo após a movimentação (latência boa no caminho feliz;
   falha é ignorada — o item continua pendente) + **varredura por pg_cron** (`*/5 min` → rota
   `/api/externo/outbox/processar`, autenticada por `CRON_SECRET`, mesmo molde do Monde/ADR-0153)
   com **backoff exponencial** (2^tentativas minutos, teto 8 tentativas → `esgotado`, visível no
   log). Escolhi pg_cron+rota (e não after-hook puro) porque sobrevive a deploy/restart e já é o
   padrão de agendamento do projeto (0182).
4. **Idempotência do lado do assinante**: o payload carrega `evento` + `solicitacao_id` (+
   `chave_idempotencia` original na criação) — reentrega do mesmo evento é segura por contrato.
5. Sucesso = resposta **2xx**; qualquer outra coisa agenda retry. Payload:
   `{ evento, solicitacao_id, referencia_origem, tipo, status, destinatario, justificativa?,
   referencia?, ocorrido_em }`.

## Consequências

- Concluir/rejeitar/cancelar **jamais** falham por causa do assinante — a UI humana não sente a
  integração (invariante do briefing).
- Entrega é **at-least-once**: o assinante PODE receber duplicado (documentado no contrato; o
  CRM deduplica por evento+id).
- MVP assina com segredo compartilhado em header (HMAC de corpo fica registrado como v2 — ADR-0950).
- O segredo de saída fica em claro em `app.api_chave.callback_segredo` (necessário para enviar);
  aceito no MVP: tabela RLS-fechada, schema não exposto, acesso só por RPC service-only.
