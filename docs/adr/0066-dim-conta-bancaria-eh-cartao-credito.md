# ADR-0066 — dim_conta_bancaria.eh_cartao_credito

**Status:** Aceito
**Data:** 2026-05-26
**Versão:** v4.1

## Contexto

A Abordagem B (ADR-0065) precisa identificar quais contas bancárias são cartões de crédito para excluir seus lançamentos individuais e incluir apenas as faturas consolidadas.

## Decisão

Adicionar coluna `eh_cartao_credito BOOLEAN NOT NULL DEFAULT FALSE` à tabela `financeiro.dim_conta_bancaria`. Lista fechada e explícita — sem detecção automática por prefixo ou heurística.

Contas marcadas como cartão (`TRUE`):
- `WCLARA-*` — todos os cartões nominais, 60+ variantes via `LIKE 'WCLARA-%'`
- `CC ASAAS`
- `CCAB-AA`, `CCAB-AD`, `CCAB-VS`
- `CCMV-MC`
- `VISA WT`
- `MASTERCARD WT` — sem movimentação atual, mas reservado

Implementado via migration 0064 (`ALTER TABLE` + `UPDATE` + `INSERT` idempotente de `MASTERCARD WT`).

## Consequências

**Positivas:**
- Lista verificável e explícita → auditável, sem falso-positivo por padrão de nome
- Nova conta-cartão no ERP exige atualização explícita da dimensão (controle intencional)

**Negativas / trade-offs:**
- `WCLARA-*` cobre variantes nominais via pattern de migration; novas bandeiras (ex: `CCAB` nova pessoa) requerem update manual
- Sem painel administrativo — mudanças exigem nova migration ou acesso direto ao banco

**Justificativa da escolha:** Lista explícita prevalece sobre detecção automática porque (a) a lista é estável no curto prazo, (b) detecção automática gera risco de falso-positivo, (c) o tratamento envolve regras de exclusão/inclusão que afetam KPIs reais.
